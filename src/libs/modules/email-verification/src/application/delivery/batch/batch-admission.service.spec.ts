import { CreditReservationService, InsufficientCreditsException, ReservationAdmission } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationCooldownReader } from '../../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../../ports/verification-result-cache-reader'
import { VerificationExecutionRecord, VerificationExecutionStore } from '../../ports/verification-execution-store'
import {
    InsertRequestOutcome,
    NewVerificationRequestInput,
    VerificationRequestRecord,
    VerificationRequestStore,
} from '../../ports/verification-request-store'
import { BatchAdmissionRecord, BatchAdmissionState, BatchFundingDecision } from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'
import { InMemoryBatchAdmissionStore, InMemoryBatchExecutions } from './__tests__/in-memory-batch-admission'

const organizationId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const start = new Date('2026-09-15T00:00:00.000Z')
const cacheTtlMs = 24 * 60 * 60 * 1000
const executionDeadlineMs = 24 * 60 * 60 * 1000
const addressCooldownMs = 60_000
const leaseDurationMs = 60_000
const leaseRenewalMs = 5_000

const cachedCandidate = {
    resultId: 'result-cache',
    verificationQuality: 'conclusive_positive',
    evidenceObservedAt: start,
    evidencePolicyVersion: 1,
}

function reservation(operationId: string, state: ReservationAdmission['state'] = 'reserved'): ReservationAdmission {
    return { operationId, amount: 1, state, disposition: 'inserted', createdAt: start, updatedAt: start, settledAt: null }
}

function foreignExecution(normalizedAddress: string): VerificationExecutionRecord {
    return {
        executionId: `execution-${normalizedAddress}`,
        organizationId,
        normalizedAddress,
        payerRequestId: 'other-request',
        state: 'running',
        fundingOwnerType: 'single',
        fundingOwnerId: `execution-${normalizedAddress}`,
        attemptGeneration: 0,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt: start,
        createdAt: start,
        updatedAt: start,
    }
}

describe('BatchAdmissionService', () => {
    let now: Date
    let admissions: InMemoryBatchAdmissionStore
    let claims: InMemoryBatchExecutions
    let executions: jest.Mocked<VerificationExecutionStore>
    let requests: jest.Mocked<VerificationRequestStore>
    let cacheReader: jest.Mocked<VerificationResultCacheReader>
    let cooldownReader: jest.Mocked<VerificationCooldownReader>
    let credits: jest.Mocked<Pick<CreditReservationService, 'reserveMany' | 'closeAdmissionMany'>>
    let clock: VerificationClock
    let insertedRequests: NewVerificationRequestInput[]
    let storedRequests: Map<string, VerificationRequestRecord>

    beforeEach(() => {
        now = start
        admissions = new InMemoryBatchAdmissionStore()
        claims = new InMemoryBatchExecutions(admissions)
        insertedRequests = []
        storedRequests = new Map()
        admissions.views = claims.views((requestId, ownerId) => storedRequests.get(requestId)?.organizationId === ownerId)
        executions = {
            claimOrJoin: jest.fn(),
            claimOrJoinForBatchGroup: jest.fn((...args: Parameters<VerificationExecutionStore['claimOrJoinForBatchGroup']>) =>
                claims.claimOrJoinForBatchGroup(...args),
            ),
            findById: jest.fn(),
            markQueued: jest.fn(),
            markBatchGroupQueued: jest.fn((...args: Parameters<VerificationExecutionStore['markBatchGroupQueued']>) =>
                claims.markBatchGroupQueued(...args),
            ),
            cancelBatchGroupFundingPending: jest.fn(
                (...args: Parameters<VerificationExecutionStore['cancelBatchGroupFundingPending']>) =>
                    claims.cancelBatchGroupFundingPending(...args),
            ),
            cancelFundingFailure: jest.fn(),
            acquireLease: jest.fn(),
            renewLease: jest.fn(),
            takeoverForRetry: jest.fn(),
            cancelIfNoCaptureIntention: jest.fn(),
            pageNonterminal: jest.fn(),
            pageCanceledPendingCleanup: jest.fn(),
            cancelBatchGroupUnstarted: jest.fn(),
        }
        requests = {
            findByClientKey: jest.fn(),
            insert: jest.fn((input: NewVerificationRequestInput): Promise<InsertRequestOutcome> => {
                const existing = storedRequests.get(input.requestId)
                if (existing) return Promise.resolve({ kind: 'replayed', record: existing })
                insertedRequests.push(input)
                const record: VerificationRequestRecord = { ...input, chargedCount: 0, createdAt: now, settledAt: null }
                storedRequests.set(input.requestId, record)
                return Promise.resolve({ kind: 'inserted', record })
            }),
            findById: jest.fn((requestId, ownerId) => {
                const record = storedRequests.get(requestId)
                return Promise.resolve(record?.organizationId === ownerId ? record : null)
            }),
            attachExecution: jest.fn(),
            settleCanceled: jest.fn(),
        }
        cacheReader = { findLatestCandidate: jest.fn().mockResolvedValue(null) }
        cooldownReader = { findLatestOutcome: jest.fn().mockResolvedValue(null) }
        credits = {
            reserveMany: jest.fn((_org, items) => Promise.resolve(items.map(item => reservation(item.operationId)))),
            closeAdmissionMany: jest.fn().mockResolvedValue([]),
        }
        clock = { now: () => now }
    })

    function service(stepBudget?: number): BatchAdmissionService {
        return new BatchAdmissionService(
            admissions,
            executions,
            requests,
            cacheReader,
            cooldownReader,
            credits as unknown as CreditReservationService,
            clock,
            cacheTtlMs,
            executionDeadlineMs,
            addressCooldownMs,
            leaseDurationMs,
            leaseRenewalMs,
            stepBudget,
        )
    }

    function seedAdmission(
        state: BatchAdmissionState,
        addresses: readonly string[],
        overrides: Partial<BatchAdmissionRecord> = {},
    ): void {
        admissions.seed(
            {
                batchId,
                organizationId,
                state,
                fundingDecision: 'pending',
                finalizationState: 'preparing',
                admissionLeaseOwnerId: null,
                admissionLeaseExpiresAt: null,
                admissionGeneration: 0,
                totalRows: addresses.length,
                uniqueAddressCount: addresses.length,
                clientRequestKey: null,
                contentDigest: null,
                createdAt: start,
                updatedAt: start,
                ...overrides,
            },
            addresses.map((normalizedAddress, index) => ({ normalizedAddress, firstSeenRow: index + 1 })),
        )
    }

    function resolveAs(normalizedAddress: string, admissionKind: 'cache' | 'created', executionId: string | null, resultId: string | null): void {
        admissions.patchAddress(batchId, normalizedAddress, { admissionKind, executionId, resultId })
    }

    /** Seeds a frozen `funding` group whose every address owns a `funding_pending` execution. */
    function seedFrozenGroup(addresses: readonly string[], fundingDecision: BatchFundingDecision = 'pending'): string[] {
        seedAdmission('funding', addresses, { fundingDecision })
        return addresses.map(normalizedAddress => {
            const executionId = `owned-${normalizedAddress}`
            claims.seedExecution({
                ...foreignExecution(normalizedAddress),
                executionId,
                payerRequestId: `payer-${normalizedAddress}`,
                state: 'funding_pending',
                fundingOwnerType: 'batch_group',
                fundingOwnerId: batchId,
            })
            admissions.patchAddress(batchId, normalizedAddress, { payerRequestId: `payer-${normalizedAddress}` })
            resolveAs(normalizedAddress, 'created', executionId, null)
            return executionId
        })
    }

    function executionState(executionId: string): string | undefined {
        return claims.executions.get(executionId)?.state
    }

    describe('resolution and funding', () => {
        it('admits an all-cached/shared/cooldown batch without ever calling reserveMany', async () => {
            cacheReader.findLatestCandidate.mockImplementation((_org, address) =>
                Promise.resolve(address === 'cached@example.test' ? cachedCandidate : null),
            )
            cooldownReader.findLatestOutcome.mockImplementation((_org, address) =>
                Promise.resolve(
                    address === 'cooldown@example.test'
                        ? { resultId: 'result-cooldown', verificationQuality: 'inconclusive', createdAt: new Date(now.getTime() - 1_000) }
                        : null,
                ),
            )
            claims.seedExecution(foreignExecution('shared@example.test'))
            seedAdmission('validating', ['cached@example.test', 'cooldown@example.test', 'shared@example.test'])

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(credits.reserveMany).not.toHaveBeenCalled()
            expect(admissions.group(batchId)).toMatchObject({
                state: 'admitted',
                fundingDecision: 'approved',
                finalizationState: 'ready',
                admissionLeaseOwnerId: null,
            })
            const byAddress = new Map(insertedRequests.map(request => [request.normalizedAddress, request]))
            expect(byAddress.get('cached@example.test')).toMatchObject({ source: 'cache', billingState: 'settled', finalReason: 'cached', reservedCount: 0, resultId: 'result-cache' })
            expect(byAddress.get('cooldown@example.test')).toMatchObject({ source: 'cooldown', billingState: 'settled', finalReason: 'inconclusive', reservedCount: 0, resultId: 'result-cooldown' })
            expect(byAddress.get('shared@example.test')).toMatchObject({ source: 'shared', billingState: 'pending', reservedCount: 0, executionId: 'execution-shared@example.test' })
            for (const address of admissions.addresses(batchId)) {
                expect(address.payerRequestId).toBe(byAddress.get(address.normalizedAddress)?.requestId)
            }
            expect(byAddress.get('shared@example.test')?.requestId).not.toBe('other-request')
        })

        it('reserves the frozen group once, then queues every owned execution', async () => {
            seedAdmission('validating', ['a@example.test', 'b@example.test'])

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            const owned = admissions.addresses(batchId).map(address => address.executionId!)
            expect(credits.reserveMany).toHaveBeenCalledTimes(1)
            expect(credits.reserveMany).toHaveBeenCalledWith(organizationId, owned.map(operationId => ({ operationId, amount: 1 })))
            expect(owned.map(executionState)).toEqual(['queued', 'queued'])
            expect(executions.claimOrJoinForBatchGroup.mock.calls[0][0]).toBe(batchId)
            expect(admissions.group(batchId)).toMatchObject({ state: 'admitted', fundingDecision: 'approved', finalizationState: 'ready' })
            expect(insertedRequests).toEqual([
                expect.objectContaining({ source: 'fresh', billingState: 'pending', reservedCount: 1, executionId: owned[0] }),
                expect.objectContaining({ source: 'fresh', billingState: 'pending', reservedCount: 1, executionId: owned[1] }),
            ])
            expect(insertedRequests[0].requestId).toBe(executions.claimOrJoinForBatchGroup.mock.calls[0][4])
        })

        it('denies an insufficient-funds group, cancels and closes it, and records free failed receipts', async () => {
            credits.reserveMany.mockRejectedValue(new InsufficientCreditsException(organizationId))
            seedAdmission('validating', ['new@example.test'])

            const first = await service().admit(batchId, organizationId)

            // The reserve attempt used this advancement's one credit operation, so closure continues next time.
            expect(first).toMatchObject({ kind: 'continuation', phase: 'closure' })
            const [executionId] = admissions.addresses(batchId).map(address => address.executionId!)
            expect(admissions.group(batchId)).toMatchObject({ state: 'funding', fundingDecision: 'denied' })
            expect(executionState(executionId)).toBe('canceled')
            expect(credits.closeAdmissionMany).not.toHaveBeenCalled()

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(credits.reserveMany).toHaveBeenCalledTimes(1)
            expect(credits.closeAdmissionMany).toHaveBeenCalledWith(organizationId, [{ operationId: executionId, amount: 1 }])
            expect(admissions.group(batchId)).toMatchObject({ state: 'insufficient_credits', finalizationState: 'ready' })
            expect(insertedRequests).toEqual([
                expect.objectContaining({ source: 'fresh', billingState: 'settled', finalReason: 'failed', reservedCount: 0, executionId: null }),
            ])
        })

        it('treats a released reservation as a fenced admission and never queues its executions', async () => {
            const owned = seedFrozenGroup(['a@example.test', 'b@example.test'])
            credits.reserveMany.mockResolvedValue([reservation(owned[0]), reservation(owned[1], 'released')])

            await service().admit(batchId, organizationId)
            await service().admit(batchId, organizationId)

            expect(owned.map(executionState)).toEqual(['canceled', 'canceled'])
            expect(executions.markBatchGroupQueued).not.toHaveBeenCalled()
            expect(credits.closeAdmissionMany).toHaveBeenCalledWith(organizationId, owned.map(operationId => ({ operationId, amount: 1 })))
            expect(admissions.group(batchId)).toMatchObject({ state: 'insufficient_credits', fundingDecision: 'denied' })
        })

        it('fails loudly on a captured reservation before approval, leaving the decision pending', async () => {
            const owned = seedFrozenGroup(['a@example.test'])
            credits.reserveMany.mockResolvedValue([reservation(owned[0], 'captured')])

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('batch_admission_captured_before_approval')

            expect(admissions.group(batchId)).toMatchObject({ state: 'funding', fundingDecision: 'pending', admissionLeaseOwnerId: null })
            expect(executionState(owned[0])).toBe('funding_pending')
        })

        it('keeps an unexpected credit failure retryable from the saved pending decision', async () => {
            const owned = seedFrozenGroup(['a@example.test'])
            credits.reserveMany.mockRejectedValueOnce(new Error('credits unavailable'))

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('credits unavailable')
            expect(admissions.group(batchId)).toMatchObject({ fundingDecision: 'pending' })

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })
            expect(executionState(owned[0])).toBe('queued')
        })

        it('resumes the exact frozen manifest after a reservation whose decision never committed', async () => {
            const owned = seedFrozenGroup(['a@example.test', 'b@example.test'])
            const record = jest.spyOn(admissions, 'recordFundingDecision').mockRejectedValueOnce(new Error('decision lost'))

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('decision lost')
            record.mockRestore()
            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            const expected = owned.map(operationId => ({ operationId, amount: 1 }))
            expect(credits.reserveMany.mock.calls).toEqual([
                [organizationId, expected],
                [organizationId, expected],
            ])
            expect(owned.map(executionState)).toEqual(['queued', 'queued'])
        })

        it('repeats only closure for a denied group, even after an account top-up', async () => {
            const owned = seedFrozenGroup(['a@example.test'], 'denied')
            claims.seedExecution({ ...claims.executions.get(owned[0])!, state: 'canceled' })
            credits.closeAdmissionMany.mockRejectedValueOnce(new Error('closure interrupted'))

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('closure interrupted')
            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(credits.reserveMany).not.toHaveBeenCalled()
            expect(credits.closeAdmissionMany).toHaveBeenCalledTimes(2)
            expect(admissions.group(batchId)).toMatchObject({ state: 'insufficient_credits', fundingDecision: 'denied' })
        })

        it('approves an empty owned list without a credit call', async () => {
            seedAdmission('funding', ['cached@example.test'])
            resolveAs('cached@example.test', 'cache', null, 'result-cache')

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(credits.reserveMany).not.toHaveBeenCalled()
            expect(admissions.group(batchId)).toMatchObject({ state: 'admitted', fundingDecision: 'approved' })
        })

        it('refuses to freeze a manifest that is missing an address', async () => {
            seedAdmission('admitting', ['a@example.test'], { uniqueAddressCount: 2 })

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('batch_admission_manifest_incomplete')

            expect(admissions.group(batchId).state).toBe('admitting')
            expect(credits.reserveMany).not.toHaveBeenCalled()
        })

        it('still records a genuinely different owner as shared', async () => {
            claims.seedExecution(foreignExecution('shared@example.test'))
            seedAdmission('validating', ['shared@example.test'])

            await service().admit(batchId, organizationId)

            expect(admissions.addresses(batchId)[0]).toMatchObject({ admissionKind: 'shared', executionId: 'execution-shared@example.test' })
            expect(credits.reserveMany).not.toHaveBeenCalled()
        })

        it('fails before recording an outcome or funding anything when a resumed claim reports a mismatched identity', async () => {
            seedAdmission('admitting', ['resumed@example.test'])
            claims.seedExecution({
                ...foreignExecution('resumed@example.test'),
                executionId: 'stale-execution',
                payerRequestId: 'a-different-payer-request',
                state: 'funding_pending',
                fundingOwnerType: 'batch_group',
                fundingOwnerId: batchId,
            })

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('batch_admission_ownership_conflict')

            expect(admissions.addresses(batchId)[0].admissionKind).toBeNull()
            expect(credits.reserveMany).not.toHaveBeenCalled()
        })
    })

    describe('lease ownership', () => {
        it('reports busy without mutating a group whose live lease belongs to another owner', async () => {
            const leaseExpiresAt = new Date(now.getTime() + 30_000)
            seedAdmission('admitting', ['a@example.test'], {
                admissionLeaseOwnerId: 'live-owner',
                admissionLeaseExpiresAt: leaseExpiresAt,
                admissionGeneration: 4,
            })

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'busy', retryAt: leaseExpiresAt })

            expect(executions.claimOrJoinForBatchGroup).not.toHaveBeenCalled()
            expect(admissions.group(batchId)).toMatchObject({ admissionLeaseOwnerId: 'live-owner', admissionGeneration: 4 })
        })

        it('takes over an expired owner with a new generation and keeps its execution and payer identities', async () => {
            seedAdmission('admitting', ['a@example.test'], {
                admissionLeaseOwnerId: 'crashed-owner',
                admissionLeaseExpiresAt: new Date(now.getTime() + 1),
                admissionGeneration: 1,
            })
            // The crashed owner committed its claim, but not the address outcome, before its lease expired.
            const crashed = { ownerId: 'crashed-owner', generation: 1, now }
            await admissions.ensurePayerRequestId(batchId, organizationId, 'a@example.test', 'payer-a')
            await claims.claimOrJoinForBatchGroup(batchId, crashed, organizationId, 'a@example.test', 'payer-a', 'owned-a', now, () => false)
            admissions.patchGroup(batchId, { admissionLeaseExpiresAt: new Date(now.getTime() - 1) })

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(admissions.group(batchId).admissionGeneration).toBe(2)
            expect(admissions.addresses(batchId)[0]).toMatchObject({ admissionKind: 'created', executionId: 'owned-a', payerRequestId: 'payer-a' })
            expect(credits.reserveMany).toHaveBeenCalledTimes(1)
            expect(credits.reserveMany).toHaveBeenCalledWith(organizationId, [{ operationId: 'owned-a', amount: 1 }])
            expect(insertedRequests).toEqual([expect.objectContaining({ requestId: 'payer-a', executionId: 'owned-a' })])
            await expect(
                admissions.recordAdmissionOutcome(batchId, organizationId, crashed, 'a@example.test', {
                    admissionKind: 'shared',
                    executionId: null,
                    resultId: null,
                }),
            ).resolves.toBe('stale')
        })

        it('prevents an expired owner from freezing, deciding, claiming, or queuing after a newer generation denied the group', async () => {
            const owned = seedFrozenGroup(['a@example.test'])
            const expired = { ownerId: 'expired-owner', generation: 0, now }
            credits.reserveMany.mockRejectedValue(new InsufficientCreditsException(organizationId))

            await service().admit(batchId, organizationId)

            expect(admissions.group(batchId).fundingDecision).toBe('denied')
            await expect(admissions.freezeFundingManifest(batchId, organizationId, expired)).resolves.toBe('stale')
            await expect(admissions.recordFundingDecision(batchId, organizationId, expired, 'approved')).resolves.toBe('stale')
            await expect(claims.markBatchGroupQueued(owned[0], organizationId, batchId, expired)).resolves.toBe('stale')
            await expect(
                claims.claimOrJoinForBatchGroup(batchId, expired, organizationId, 'late@example.test', 'payer', 'late', now, () => false),
            ).resolves.toEqual({ kind: 'stale-admission' })
            expect(executionState(owned[0])).toBe('canceled')
        })

        it('stops without committing a decision when its lease expired during the reservation call', async () => {
            const owned = seedFrozenGroup(['a@example.test'])
            credits.reserveMany.mockImplementationOnce((_org, items) => {
                now = new Date(now.getTime() + leaseDurationMs + 1)
                return Promise.resolve(items.map(item => reservation(item.operationId)))
            })

            const outcome = await service().admit(batchId, organizationId)

            expect(outcome.kind).toBe('busy')
            expect(admissions.group(batchId)).toMatchObject({ fundingDecision: 'pending', state: 'funding' })
            expect(executionState(owned[0])).toBe('funding_pending')
        })

        it('stops before its next write once renewal reports the lease lost', async () => {
            jest.useFakeTimers({ now: start })
            try {
                seedAdmission('validating', ['a@example.test', 'b@example.test'])
                jest.spyOn(admissions, 'renewAdmissionLease').mockResolvedValue(false)
                let releaseLookup: (() => void) | undefined
                cacheReader.findLatestCandidate.mockImplementationOnce(
                    () => new Promise(resolve => (releaseLookup = () => resolve(null))),
                )

                const pending = service().admit(batchId, organizationId)
                await jest.advanceTimersByTimeAsync(leaseRenewalMs)
                releaseLookup!()

                await expect(pending).resolves.toMatchObject({ kind: 'busy' })
                expect(executions.claimOrJoinForBatchGroup).not.toHaveBeenCalled()
                expect(admissions.addresses(batchId).every(address => address.admissionKind === null)).toBe(true)
            } finally {
                jest.useRealTimers()
            }
        })

        it('lets exactly one concurrent caller own the group', async () => {
            seedAdmission('validating', ['cached@example.test'])
            cacheReader.findLatestCandidate.mockResolvedValue(cachedCandidate)

            const outcomes = await Promise.all([service().admit(batchId, organizationId), service().admit(batchId, organizationId)])

            expect(outcomes.map(outcome => outcome.kind).sort()).toEqual(['busy', 'complete'])
            expect(insertedRequests).toHaveLength(1)
        })
    })

    describe('bounded advancement', () => {
        const addresses = Array.from({ length: 101 }, (_, index) => `address-${String(index).padStart(3, '0')}@example.test`)

        it('yields after its address budget, clears its lease, and resumes from the first incomplete row', async () => {
            cacheReader.findLatestCandidate.mockResolvedValue(cachedCandidate)
            seedAdmission('validating', addresses)

            const first = await service(100).admit(batchId, organizationId)

            expect(first).toMatchObject({ kind: 'continuation', phase: 'resolution', afterFirstSeenRow: 100 })
            expect(cacheReader.findLatestCandidate).toHaveBeenCalledTimes(100)
            expect(admissions.group(batchId)).toMatchObject({ state: 'admitting', admissionLeaseOwnerId: null, admissionGeneration: 1 })
            // A late renewal by the released owner cannot restore its lease.
            const released = { ownerId: 'released-owner', generation: 1, now }
            await expect(admissions.renewAdmissionLease(batchId, organizationId, released, new Date(now.getTime() + 1))).resolves.toBe(false)

            const second = await service(100).admit(batchId, organizationId)

            expect(cacheReader.findLatestCandidate).toHaveBeenCalledTimes(101)
            expect(cacheReader.findLatestCandidate.mock.calls[100][1]).toBe(addresses[100])
            // The same advancement froze, approved an empty owned list, and started receipts within its budget.
            expect(second).toMatchObject({ kind: 'continuation', phase: 'materialization' })
            await expect(service(100).admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })
            expect(insertedRequests).toHaveLength(101)
        })

        it('restarts from persisted state rather than a hint', async () => {
            seedAdmission('admitting', ['a@example.test', 'b@example.test', 'c@example.test'])
            resolveAs('b@example.test', 'cache', null, 'result-b')
            cacheReader.findLatestCandidate.mockResolvedValue(cachedCandidate)

            await expect(service(1).admit(batchId, organizationId)).resolves.toMatchObject({ kind: 'continuation', afterFirstSeenRow: 1 })
            expect(cacheReader.findLatestCandidate.mock.calls.map(call => call[1])).toEqual(['a@example.test'])

            await service(1).admit(batchId, organizationId)
            expect(cacheReader.findLatestCandidate.mock.calls.map(call => call[1])).toEqual(['a@example.test', 'c@example.test'])
        })

        it('charges queuing and receipt materialization to the budget', async () => {
            const owned = seedFrozenGroup(['a@example.test', 'b@example.test'], 'approved')

            await expect(service(1).admit(batchId, organizationId)).resolves.toMatchObject({ kind: 'continuation', phase: 'queue' })
            expect(owned.map(executionState)).toEqual(['queued', 'funding_pending'])

            await expect(service(1).admit(batchId, organizationId)).resolves.toMatchObject({ kind: 'continuation', phase: 'materialization' })
            await expect(service(1).admit(batchId, organizationId)).resolves.toMatchObject({ kind: 'continuation', phase: 'materialization' })
            await expect(service(1).admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })
            expect(insertedRequests).toHaveLength(2)
        })
    })

    describe('receipt finalization', () => {
        it('resumes materializing receipts after the group already reached a terminal admission state', async () => {
            seedAdmission('admitted', ['cached@example.test'], { fundingDecision: 'approved' })
            resolveAs('cached@example.test', 'cache', null, 'result-cache')

            await service().admit(batchId, organizationId)

            expect(cacheReader.findLatestCandidate).not.toHaveBeenCalled()
            expect(insertedRequests).toEqual([expect.objectContaining({ source: 'cache', resultId: 'result-cache' })])
            expect(admissions.group(batchId).finalizationState).toBe('ready')
        })

        it('is a no-op once finalization is ready', async () => {
            seedAdmission('validating', ['cached@example.test'])
            cacheReader.findLatestCandidate.mockResolvedValue(cachedCandidate)

            await service().admit(batchId, organizationId)
            const generation = admissions.group(batchId).admissionGeneration
            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(insertedRequests).toHaveLength(1)
            expect(admissions.group(batchId).admissionGeneration).toBe(generation)
        })

        it('reserves an identity before resolution and retains it after an interrupted lookup', async () => {
            seedAdmission('validating', ['cached@example.test'])
            cacheReader.findLatestCandidate
                .mockImplementationOnce(() => {
                    expect(admissions.addresses(batchId)[0].payerRequestId).not.toBeNull()
                    return Promise.reject(new Error('lookup interrupted'))
                })
                .mockResolvedValue(cachedCandidate)

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('lookup interrupted')
            const reservedId = admissions.addresses(batchId)[0].payerRequestId
            expect(requests.insert).not.toHaveBeenCalled()
            expect(admissions.group(batchId).admissionLeaseOwnerId).toBeNull()

            await service().admit(batchId, organizationId)

            expect(insertedRequests).toEqual([expect.objectContaining({ requestId: reservedId })])
        })

        it('materializes an allocated identity after insertion failed without resolving the address again', async () => {
            seedAdmission('validating', ['cached@example.test'])
            cacheReader.findLatestCandidate.mockResolvedValue(cachedCandidate)
            requests.insert.mockRejectedValueOnce(new Error('insertion interrupted'))

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('insertion interrupted')
            const reservedId = admissions.addresses(batchId)[0].payerRequestId
            // A later result must not replace the result already selected by this admission.
            cacheReader.findLatestCandidate.mockResolvedValue({ ...cachedCandidate, resultId: 'newer-result-cache' })

            await service().admit(batchId, organizationId)

            expect(cacheReader.findLatestCandidate).toHaveBeenCalledTimes(1)
            expect(insertedRequests).toEqual([expect.objectContaining({ requestId: reservedId, resultId: 'result-cache' })])
        })

        it('preserves a settled owned receipt when insertion committed before an interrupted response', async () => {
            seedAdmission('admitted', ['created@example.test'], { fundingDecision: 'approved' })
            const requestId = await admissions.ensurePayerRequestId(batchId, organizationId, 'created@example.test', 'payer-request')
            resolveAs('created@example.test', 'created', 'owned-execution', null)
            const insert = requests.insert.getMockImplementation()!
            requests.insert.mockImplementationOnce(async input => {
                await insert(input)
                throw new Error('insertion response interrupted')
            })

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('insertion response interrupted')
            const settled: VerificationRequestRecord = {
                ...storedRequests.get(requestId)!,
                resultId: 'conclusive-result',
                billingState: 'settled',
                reservedCount: 0,
                chargedCount: 1,
                finalReason: 'conclusive',
                settledAt: now,
            }
            storedRequests.set(requestId, settled)

            await expect(service().admit(batchId, organizationId)).resolves.toEqual({ kind: 'complete' })

            expect(requests.insert).toHaveBeenCalledTimes(1)
            expect(storedRequests.get(requestId)).toBe(settled)
            expect(executions.claimOrJoinForBatchGroup).not.toHaveBeenCalled()
            expect(credits.reserveMany).not.toHaveBeenCalled()
        })

        it.each([
            ['request UUID', { requestId: 'different-request' }],
            ['organization', { organizationId: 'different-organization' }],
            ['address', { normalizedAddress: 'different@example.test' }],
            ['delivery mode', { deliveryMode: 'async' }],
            ['client key', { clientRequestKey: 'different-client-key' }],
            ['source', { source: 'shared' }],
            ['execution', { executionId: 'different-execution' }],
            ['cache result', { resultId: 'different-result' }],
        ] as const)('rejects an existing receipt with a conflicting %s without inserting', async (_field, mismatch) => {
            seedAdmission('admitted', ['cached@example.test'], { fundingDecision: 'approved' })
            const requestId = await admissions.ensurePayerRequestId(batchId, organizationId, 'cached@example.test', 'payer-request')
            resolveAs('cached@example.test', 'cache', null, 'result-cache')
            const conflicting: VerificationRequestRecord = {
                requestId,
                organizationId,
                normalizedAddress: 'cached@example.test',
                deliveryMode: 'batch',
                clientRequestKey: null,
                source: 'cache',
                executionId: null,
                resultId: 'result-cache',
                billingState: 'settled',
                reservedCount: 0,
                chargedCount: 0,
                finalReason: 'cached',
                createdAt: now,
                settledAt: now,
                ...mismatch,
            }
            requests.findById.mockResolvedValue(conflicting)

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('batch_request_identity_conflict')

            expect(requests.findById).toHaveBeenCalledWith(requestId, organizationId)
            expect(requests.insert).not.toHaveBeenCalled()
            expect(admissions.group(batchId).finalizationState).toBe('preparing')
        })

        it('rejects a mismatched receipt returned by an insertion replay', async () => {
            seedAdmission('admitted', ['cached@example.test'], { fundingDecision: 'approved' })
            resolveAs('cached@example.test', 'cache', null, 'result-cache')
            requests.insert.mockImplementationOnce(input =>
                Promise.resolve({
                    kind: 'replayed',
                    record: { ...input, requestId: 'different-request', chargedCount: 0, createdAt: now, settledAt: now },
                }),
            )

            await expect(service().admit(batchId, organizationId)).rejects.toThrow('batch_request_identity_conflict')
        })

        it('rejects a foreign organization before assigning or resolving an address', async () => {
            seedAdmission('validating', ['cached@example.test'])

            await expect(service().admit(batchId, 'different-organization')).rejects.toThrow('not found')

            expect(admissions.addresses(batchId)[0].payerRequestId).toBeNull()
            expect(admissions.group(batchId).admissionGeneration).toBe(0)
            expect(cacheReader.findLatestCandidate).not.toHaveBeenCalled()
        })
    })
})
