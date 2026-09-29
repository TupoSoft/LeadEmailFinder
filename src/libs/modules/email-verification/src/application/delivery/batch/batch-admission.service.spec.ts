import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationCooldownReader } from '../../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../../ports/verification-result-cache-reader'
import {
    CachedResultCandidate,
    ClaimAddressOutcome,
    ExecutionFundingOwner,
    VerificationExecutionRecord,
    VerificationExecutionStore,
} from '../../ports/verification-execution-store'
import { InsertRequestOutcome, NewVerificationRequestInput, VerificationRequestRecord, VerificationRequestStore } from '../../ports/verification-request-store'
import {
    BatchAdmissionRecord,
    BatchAdmissionState,
    BatchAdmissionStore,
    BatchStatusCounts,
    BatchUniqueAddressAdmissionKind,
    BatchUniqueAddressRecord,
    CreateBatchAdmissionOutcome,
    NewBatchAdmissionInput,
} from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const now = new Date('2026-09-15T00:00:00.000Z')
const cacheTtlMs = 24 * 60 * 60 * 1000
const executionDeadlineMs = 24 * 60 * 60 * 1000
const addressCooldownMs = 60_000

class FakeBatchAdmissionStore implements BatchAdmissionStore {
    private admission: BatchAdmissionRecord | null = null
    private addresses: BatchUniqueAddressRecord[] = []

    seed(record: BatchAdmissionRecord, addresses: readonly { normalizedAddress: string; firstSeenRow: number }[]): void {
        this.admission = record
        this.addresses = addresses.map(address => ({
            batchId: record.batchId,
            normalizedAddress: address.normalizedAddress,
            firstSeenRow: address.firstSeenRow,
            admissionKind: null,
            executionId: null,
            resultId: null,
            payerRequestId: null,
        }))
    }

    createOrReplay(input: NewBatchAdmissionInput): Promise<CreateBatchAdmissionOutcome> {
        this.admission = {
            batchId: input.batchId,
            organizationId: input.organizationId,
            state: 'validating',
            totalRows: input.totalRows,
            uniqueAddressCount: input.uniqueAddressCount,
            clientRequestKey: input.clientRequestKey,
            contentDigest: input.contentDigest,
            createdAt: now,
            updatedAt: now,
        }
        return Promise.resolve({ kind: 'created', record: this.admission })
    }

    findById(id: string, ownerId: string): Promise<BatchAdmissionRecord | null> {
        return Promise.resolve(this.admission && this.admission.batchId === id && this.admission.organizationId === ownerId ? this.admission : null)
    }

    findByClientKey(): Promise<BatchAdmissionRecord | null> {
        return Promise.resolve(null)
    }

    updateState(id: string, _organizationId: string, state: BatchAdmissionState): Promise<void> {
        if (this.admission && this.admission.batchId === id) this.admission = { ...this.admission, state }
        return Promise.resolve()
    }

    insertUniqueAddresses(): Promise<void> {
        // Seeded directly via `seed()` in these tests.
        return Promise.resolve()
    }

    pageUniqueAddresses(id: string, _organizationId: string, skip: number, take: number): Promise<readonly BatchUniqueAddressRecord[]> {
        if (!this.admission || this.admission.batchId !== id) return Promise.resolve([])
        return Promise.resolve(this.addresses.slice(skip, skip + take))
    }

    recordAdmissionOutcome(
        id: string,
        normalizedAddress: string,
        outcome: { readonly admissionKind: BatchUniqueAddressAdmissionKind; readonly executionId: string | null; readonly resultId: string | null },
    ): Promise<void> {
        const index = this.addresses.findIndex(address => address.batchId === id && address.normalizedAddress === normalizedAddress)
        if (index >= 0 && this.addresses[index].admissionKind === null) {
            this.addresses[index] = { ...this.addresses[index], ...outcome }
        }
        return Promise.resolve()
    }

    ensurePayerRequestId(id: string, ownerId: string, normalizedAddress: string, candidateId: string): Promise<string> {
        const index = this.addresses.findIndex(address => address.batchId === id && address.normalizedAddress === normalizedAddress)
        if (!this.admission || this.admission.organizationId !== ownerId || index < 0) {
            throw new Error('batch_address_not_found')
        }
        const payerRequestId = this.addresses[index].payerRequestId ?? candidateId
        this.addresses[index] = { ...this.addresses[index], payerRequestId }
        return Promise.resolve(payerRequestId)
    }

    snapshot(): readonly BatchUniqueAddressRecord[] {
        return this.addresses
    }

    countUnsettledAddresses(): Promise<number> {
        return Promise.resolve(this.addresses.filter(address => address.payerRequestId === null).length)
    }

    getStatusCounts(): Promise<BatchStatusCounts> {
        return Promise.resolve({
            cachedAddresses: 0,
            sharedAddresses: 0,
            cooldownAddresses: 0,
            completedAddresses: 0,
            conclusiveAddresses: 0,
            inconclusiveAddresses: 0,
            failedAddresses: 0,
            reserved: 0,
            charged: 0,
        })
    }
}

/**
 * Retains committed claims across calls, keyed by `(organizationId, normalizedAddress)` -- the real store's own
 * one-nonterminal-execution-per-address invariant -- so a second `claimOrJoin` call for an address this same
 * batch already committed returns `joined` with the *original* execution identity, exactly like the real store
 * would after a crash between the claim commit and this address's own outcome write. A scripted one-shot mock
 * return value cannot prove this: it would hide exactly the recovery path this plan exists to fix.
 */
class FakeExecutionClaimStore {
    private readonly claims = new Map<string, VerificationExecutionRecord>()

    claimOrJoin(
        organizationId: string,
        normalizedAddress: string,
        payerRequestId: string,
        newExecutionId: string,
        deadlineAt: Date,
        _isCandidateUsable: (candidate: CachedResultCandidate) => boolean,
        fundingOwner?: ExecutionFundingOwner,
    ): Promise<ClaimAddressOutcome> {
        const key = `${organizationId}:${normalizedAddress}`
        const existing = this.claims.get(key)
        if (existing) return Promise.resolve({ kind: 'joined', execution: existing })

        const execution: VerificationExecutionRecord = {
            executionId: newExecutionId,
            organizationId,
            normalizedAddress,
            payerRequestId,
            state: 'funding_pending',
            fundingOwnerType: fundingOwner?.type ?? 'single',
            fundingOwnerId: fundingOwner?.id ?? newExecutionId,
            attemptGeneration: 0,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            resultId: null,
            retryAt: null,
            deadlineAt,
            createdAt: now,
            updatedAt: now,
        }
        this.claims.set(key, execution)
        return Promise.resolve({ kind: 'created', execution })
    }

    markQueued(executionId: string, organizationId: string): Promise<VerificationExecutionRecord> {
        for (const [key, execution] of this.claims) {
            if (execution.executionId === executionId && execution.organizationId === organizationId) {
                const queued = { ...execution, state: 'queued' as const }
                this.claims.set(key, queued)
                return Promise.resolve(queued)
            }
        }
        throw new Error('unknown execution')
    }
}

describe('BatchAdmissionService', () => {
    let admissions: FakeBatchAdmissionStore
    let executions: jest.Mocked<VerificationExecutionStore>
    let requests: jest.Mocked<VerificationRequestStore>
    let cacheReader: jest.Mocked<VerificationResultCacheReader>
    let cooldownReader: jest.Mocked<VerificationCooldownReader>
    let credits: jest.Mocked<Pick<CreditReservationService, 'reserveMany' | 'closeAdmissionMany'>>
    let clock: VerificationClock
    let service: BatchAdmissionService
    let insertedRequests: NewVerificationRequestInput[]
    let storedRequests: Map<string, VerificationRequestRecord>

    beforeEach(() => {
        admissions = new FakeBatchAdmissionStore()
        insertedRequests = []
        storedRequests = new Map()
        executions = {
            claimOrJoin: jest.fn(),
            findById: jest.fn(),
            markQueued: jest.fn(),
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
                const record: VerificationRequestRecord = {
                    ...input,
                    chargedCount: 0,
                    createdAt: now,
                    settledAt: null,
                }
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
        credits = { reserveMany: jest.fn(), closeAdmissionMany: jest.fn() }
        clock = { now: () => now }
        service = new BatchAdmissionService(
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
        )
    })

    function seedAdmission(state: BatchAdmissionState, addresses: readonly { normalizedAddress: string; firstSeenRow: number }[]): void {
        admissions.seed(
            {
                batchId,
                organizationId,
                state,
                totalRows: addresses.length,
                uniqueAddressCount: addresses.length,
                clientRequestKey: null,
                contentDigest: null,
                createdAt: now,
                updatedAt: now,
            },
            addresses,
        )
    }

    it('admits an all-cached/shared/cooldown batch without ever calling reserveMany', async () => {
        cacheReader.findLatestCandidate.mockImplementation((_org, address) =>
            Promise.resolve(
                address === 'cached@example.test' ? { resultId: 'result-cache', verificationQuality: 'conclusive_positive', evidenceObservedAt: now, evidencePolicyVersion: 1 } : null,
            ),
        )
        cooldownReader.findLatestOutcome.mockImplementation((_org, address) =>
            Promise.resolve(
                address === 'cooldown@example.test'
                    ? { resultId: 'result-cooldown', verificationQuality: 'inconclusive', createdAt: new Date(now.getTime() - 1_000) }
                    : null,
            ),
        )
        executions.claimOrJoin.mockImplementation(
            (_org, address): Promise<ClaimAddressOutcome> =>
                Promise.resolve(
                    address === 'shared@example.test'
                        ? {
                              kind: 'joined',
                              execution: {
                                  executionId: 'execution-shared',
                                  organizationId,
                                  normalizedAddress: address,
                                  payerRequestId: 'other-request',
                                  state: 'running',
                                  fundingOwnerType: 'single',
                                  fundingOwnerId: 'execution-shared',
                                  attemptGeneration: 0,
                                  leaseOwnerId: null,
                                  leaseExpiresAt: null,
                                  resultId: null,
                                  retryAt: null,
                                  deadlineAt: now,
                                  createdAt: now,
                                  updatedAt: now,
                              },
                          }
                        : (() => {
                              throw new Error('unexpected claimOrJoin call')
                          })(),
                ),
        )
        seedAdmission('validating', [
            { normalizedAddress: 'cached@example.test', firstSeenRow: 1 },
            { normalizedAddress: 'cooldown@example.test', firstSeenRow: 2 },
            { normalizedAddress: 'shared@example.test', firstSeenRow: 3 },
        ])

        await service.admit(batchId, organizationId)

        expect(credits.reserveMany).not.toHaveBeenCalled()
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('admitted')

        const byAddress = new Map(insertedRequests.map(request => [request.normalizedAddress, request]))
        expect(byAddress.get('cached@example.test')).toMatchObject({ source: 'cache', billingState: 'settled', finalReason: 'cached', reservedCount: 0, resultId: 'result-cache' })
        expect(byAddress.get('cooldown@example.test')).toMatchObject({ source: 'cooldown', billingState: 'settled', finalReason: 'inconclusive', reservedCount: 0, resultId: 'result-cooldown' })
        expect(byAddress.get('shared@example.test')).toMatchObject({ source: 'shared', billingState: 'pending', reservedCount: 0, executionId: 'execution-shared' })
        for (const address of admissions.snapshot()) {
            expect(address.payerRequestId).toBe(byAddress.get(address.normalizedAddress)?.requestId)
        }
        expect(executions.claimOrJoin.mock.calls[0][2]).toBe(byAddress.get('shared@example.test')?.requestId)
        expect(byAddress.get('shared@example.test')?.requestId).not.toBe('other-request')
    })

    it('reserves and dispatches every newly created execution as one atomic group', async () => {
        executions.claimOrJoin.mockImplementation(
            (_org, _address, payerRequestId, newExecutionId, _deadlineAt, _isUsable, fundingOwner?: ExecutionFundingOwner): Promise<ClaimAddressOutcome> => {
                expect(fundingOwner).toEqual({ type: 'batch_group', id: batchId })
                return Promise.resolve({
                    kind: 'created',
                    execution: {
                        executionId: newExecutionId,
                        organizationId,
                        normalizedAddress: 'new@example.test',
                        payerRequestId,
                        state: 'funding_pending',
                        fundingOwnerType: 'batch_group',
                        fundingOwnerId: batchId,
                        attemptGeneration: 0,
                        leaseOwnerId: null,
                        leaseExpiresAt: null,
                        resultId: null,
                        retryAt: null,
                        deadlineAt: now,
                        createdAt: now,
                        updatedAt: now,
                    },
                })
            },
        )
        seedAdmission('validating', [{ normalizedAddress: 'new@example.test', firstSeenRow: 1 }])

        await service.admit(batchId, organizationId)

        expect(credits.reserveMany).toHaveBeenCalledWith(organizationId, [{ operationId: expect.any(String), amount: 1 }])
        expect(executions.markQueued).toHaveBeenCalledTimes(1)
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('admitted')
        expect(insertedRequests[0]).toMatchObject({ source: 'fresh', billingState: 'pending', reservedCount: 1 })
        expect(insertedRequests[0].requestId).toBe(admissions.snapshot()[0].payerRequestId)
        expect(insertedRequests[0].requestId).toBe(executions.claimOrJoin.mock.calls[0][2])
    })

    it('fences the whole group as insufficient credits without funding any created execution', async () => {
        executions.claimOrJoin.mockImplementation((_org, _address, payerRequestId, newExecutionId): Promise<ClaimAddressOutcome> => Promise.resolve({
            kind: 'created',
            execution: {
                executionId: newExecutionId,
                organizationId,
                normalizedAddress: 'new@example.test',
                payerRequestId,
                state: 'funding_pending',
                fundingOwnerType: 'batch_group',
                fundingOwnerId: batchId,
                attemptGeneration: 0,
                leaseOwnerId: null,
                leaseExpiresAt: null,
                resultId: null,
                retryAt: null,
                deadlineAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }))
        credits.reserveMany.mockRejectedValue(new InsufficientCreditsException(organizationId))
        seedAdmission('validating', [{ normalizedAddress: 'new@example.test', firstSeenRow: 1 }])

        await service.admit(batchId, organizationId)

        expect(executions.cancelFundingFailure).toHaveBeenCalledTimes(1)
        expect(credits.closeAdmissionMany).toHaveBeenCalledWith(organizationId, [{ operationId: expect.any(String), amount: 1 }])
        expect(executions.markQueued).not.toHaveBeenCalled()
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('insufficient_credits')
        expect(insertedRequests[0]).toMatchObject({ source: 'fresh', billingState: 'settled', finalReason: 'failed', reservedCount: 0 })
        expect(insertedRequests[0].requestId).toBe(executions.claimOrJoin.mock.calls[0][2])
    })

    it('resumes materializing requests on a retry after the group already reached a terminal admission state', async () => {
        seedAdmission('admitted', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        // Simulate a prior interrupted attempt that already resolved the address but crashed before materializing it.
        await admissions.recordAdmissionOutcome(batchId, 'cached@example.test', {
            admissionKind: 'cache',
            executionId: null,
            resultId: 'result-cache',
        })

        await service.admit(batchId, organizationId)

        expect(cacheReader.findLatestCandidate).not.toHaveBeenCalled()
        expect(insertedRequests).toHaveLength(1)
        expect(insertedRequests[0]).toMatchObject({ source: 'cache', resultId: 'result-cache' })
    })

    it('is a no-op on a second call once every address already has a payer request', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        cacheReader.findLatestCandidate.mockResolvedValue({
            resultId: 'result-cache',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })

        await service.admit(batchId, organizationId)
        await service.admit(batchId, organizationId)

        expect(insertedRequests).toHaveLength(1)
    })
    it('reserves an identity before resolution and retains it after an interrupted lookup', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        cacheReader.findLatestCandidate.mockImplementationOnce(() => {
            expect(admissions.snapshot()[0].payerRequestId).not.toBeNull()
            return Promise.reject(new Error('lookup interrupted'))
        }).mockResolvedValue({
            resultId: 'result-cache',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('lookup interrupted')
        const reservedId = admissions.snapshot()[0].payerRequestId
        expect(requests.insert).not.toHaveBeenCalled()

        await service.admit(batchId, organizationId)

        expect(admissions.snapshot()[0].payerRequestId).toBe(reservedId)
        expect(insertedRequests).toHaveLength(1)
        expect(insertedRequests[0].requestId).toBe(reservedId)
    })

    it('materializes an allocated identity after insertion failed without resolving the address again', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        cacheReader.findLatestCandidate.mockResolvedValue({
            resultId: 'result-cache',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })
        requests.insert.mockRejectedValueOnce(new Error('insertion interrupted'))

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('insertion interrupted')
        const reservedId = admissions.snapshot()[0].payerRequestId
        expect(reservedId).not.toBeNull()
        expect(storedRequests.size).toBe(0)
        // A later result must not replace the result already selected by this admission.
        cacheReader.findLatestCandidate.mockResolvedValue({
            resultId: 'newer-result-cache',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })

        await service.admit(batchId, organizationId)

        expect(cacheReader.findLatestCandidate).toHaveBeenCalledTimes(1)
        expect(requests.insert).toHaveBeenCalledTimes(2)
        expect(insertedRequests).toEqual([expect.objectContaining({ requestId: reservedId, resultId: 'result-cache' })])
    })

    it('preserves a settled owned receipt when insertion committed before an interrupted response', async () => {
        seedAdmission('admitted', [{ normalizedAddress: 'created@example.test', firstSeenRow: 1 }])
        const requestId = await admissions.ensurePayerRequestId(batchId, organizationId, 'created@example.test', 'payer-request')
        await admissions.recordAdmissionOutcome(batchId, 'created@example.test', {
            admissionKind: 'created',
            executionId: 'owned-execution',
            resultId: null,
        })
        const insert = requests.insert.getMockImplementation()!
        requests.insert.mockImplementationOnce(async input => {
            await insert(input)
            throw new Error('insertion response interrupted')
        })

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('insertion response interrupted')
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

        await service.admit(batchId, organizationId)

        expect(requests.insert).toHaveBeenCalledTimes(1)
        expect(storedRequests.size).toBe(1)
        expect(storedRequests.get(requestId)).toBe(settled)
        expect(admissions.snapshot()[0].payerRequestId).toBe(requestId)
        expect(executions.claimOrJoin).not.toHaveBeenCalled()
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
        seedAdmission('admitted', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        const requestId = await admissions.ensurePayerRequestId(batchId, organizationId, 'cached@example.test', 'payer-request')
        await admissions.recordAdmissionOutcome(batchId, 'cached@example.test', {
            admissionKind: 'cache',
            executionId: null,
            resultId: 'result-cache',
        })
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

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('batch_request_identity_conflict')

        expect(requests.findById).toHaveBeenCalledWith(requestId, organizationId)
        expect(requests.insert).not.toHaveBeenCalled()
        expect(admissions.snapshot()[0].payerRequestId).toBe(requestId)
    })

    it('replays the same receipt when concurrent materializers both observe it as missing', async () => {
        seedAdmission('admitted', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        const requestId = await admissions.ensurePayerRequestId(batchId, organizationId, 'cached@example.test', 'payer-request')
        await admissions.recordAdmissionOutcome(batchId, 'cached@example.test', {
            admissionKind: 'cache',
            executionId: null,
            resultId: 'result-cache',
        })
        requests.findById.mockResolvedValue(null)

        await Promise.all([service.admit(batchId, organizationId), service.admit(batchId, organizationId)])

        expect(requests.insert).toHaveBeenCalledTimes(2)
        expect(requests.insert.mock.calls.every(([input]) => input.requestId === requestId)).toBe(true)
        expect(insertedRequests).toHaveLength(1)
        expect(storedRequests.size).toBe(1)
    })

    it('rejects a mismatched receipt returned by an insertion replay', async () => {
        seedAdmission('admitted', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        await admissions.recordAdmissionOutcome(batchId, 'cached@example.test', {
            admissionKind: 'cache',
            executionId: null,
            resultId: 'result-cache',
        })
        requests.insert.mockImplementationOnce(input => Promise.resolve({
            kind: 'replayed',
            record: {
                ...input,
                requestId: 'different-request',
                chargedCount: 0,
                createdAt: now,
                settledAt: now,
            },
        }))

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('batch_request_identity_conflict')
    })

    it('rejects a foreign organization before assigning or resolving an address', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])

        await expect(service.admit(batchId, 'different-organization')).rejects.toThrow('not found')

        expect(admissions.snapshot()[0].payerRequestId).toBeNull()
        expect(cacheReader.findLatestCandidate).not.toHaveBeenCalled()
        expect(requests.findById).not.toHaveBeenCalled()
        expect(requests.insert).not.toHaveBeenCalled()
    })

    it('resumes its own interrupted claim as created, funding the original execution exactly once', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'resumed@example.test', firstSeenRow: 1 }])
        const fakeClaims = new FakeExecutionClaimStore()
        executions.claimOrJoin.mockImplementation((...args) => fakeClaims.claimOrJoin(...args))
        executions.markQueued.mockImplementation((executionId, ownerId) => fakeClaims.markQueued(executionId, ownerId))
        // Simulate a crash between the real claim commit (already reflected in `fakeClaims`) and this
        // address's own outcome write -- the exact interruption window this plan recovers.
        jest.spyOn(admissions, 'recordAdmissionOutcome').mockImplementationOnce(() => Promise.reject(new Error('outcome write interrupted')))

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('outcome write interrupted')
        expect(executions.claimOrJoin).toHaveBeenCalledTimes(1)
        expect(admissions.snapshot()[0].admissionKind).toBeNull()
        const payerRequestId = admissions.snapshot()[0].payerRequestId
        expect(payerRequestId).not.toBeNull()

        await service.admit(batchId, organizationId)

        expect(executions.claimOrJoin).toHaveBeenCalledTimes(2)
        const [, , firstPayerRequestId] = executions.claimOrJoin.mock.calls[0]
        const [, , secondPayerRequestId] = executions.claimOrJoin.mock.calls[1]
        expect(secondPayerRequestId).toBe(firstPayerRequestId)
        const resumed = admissions.snapshot()[0]
        expect(resumed.admissionKind).toBe('created')
        expect(resumed.executionId).not.toBeNull()
        expect(credits.reserveMany).toHaveBeenCalledTimes(1)
        expect(credits.reserveMany).toHaveBeenCalledWith(organizationId, [{ operationId: resumed.executionId, amount: 1 }])
        expect(executions.markQueued).toHaveBeenCalledTimes(1)
        expect(executions.markQueued).toHaveBeenCalledWith(resumed.executionId, organizationId)
        expect(insertedRequests).toHaveLength(1)
        expect(insertedRequests[0]).toMatchObject({
            requestId: payerRequestId,
            source: 'fresh',
            executionId: resumed.executionId,
            reservedCount: 1,
            billingState: 'pending',
        })
    })

    it('fails before recording an outcome or funding anything when a resumed claim reports a mismatched identity', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'resumed@example.test', firstSeenRow: 1 }])
        executions.claimOrJoin.mockResolvedValue({
            kind: 'joined',
            execution: {
                executionId: 'stale-execution',
                organizationId,
                normalizedAddress: 'resumed@example.test',
                payerRequestId: 'a-different-payer-request',
                state: 'funding_pending',
                fundingOwnerType: 'batch_group',
                fundingOwnerId: batchId,
                attemptGeneration: 0,
                leaseOwnerId: null,
                leaseExpiresAt: null,
                resultId: null,
                retryAt: null,
                deadlineAt: now,
                createdAt: now,
                updatedAt: now,
            },
        })

        await expect(service.admit(batchId, organizationId)).rejects.toThrow('batch_admission_ownership_conflict')

        expect(admissions.snapshot()[0].admissionKind).toBeNull()
        expect(credits.reserveMany).not.toHaveBeenCalled()
        expect(executions.markQueued).not.toHaveBeenCalled()
    })
})
