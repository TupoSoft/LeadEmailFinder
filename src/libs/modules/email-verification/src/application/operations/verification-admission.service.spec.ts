import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationResultCacheReader } from '../ports/verification-result-cache-reader'
import { InsertRequestOutcome, VerificationRequestStore } from '../ports/verification-request-store'
import { VerificationExecutionRecord, VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationAdmissionService } from './verification-admission.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-08T00:00:00.000Z')
const cacheTtlMs = 24 * 60 * 60 * 1000
const executionDeadlineMs = 24 * 60 * 60 * 1000

function buildUuidV7(timestampMs: number): string {
    const timestampHex = timestampMs.toString(16).padStart(12, '0')
    return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
}

function execution(overrides: Partial<VerificationExecutionRecord> = {}): VerificationExecutionRecord {
    return {
        executionId: 'execution-1',
        organizationId,
        normalizedAddress: 'person@example.test',
        payerRequestId: 'request-1',
        state: 'running',
        fundingOwnerType: 'single',
        fundingOwnerId: 'execution-1',
        attemptGeneration: 0,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt: new Date(now.getTime() + executionDeadlineMs),
        createdAt: now,
        updatedAt: now,
        ...overrides,
    }
}

describe('VerificationAdmissionService', () => {
    let requests: jest.Mocked<VerificationRequestStore>
    let executions: jest.Mocked<VerificationExecutionStore>
    let cacheReader: jest.Mocked<VerificationResultCacheReader>
    let credits: jest.Mocked<Pick<CreditReservationService, 'reserve' | 'closeAdmissionMany'>>
    let clock: VerificationClock
    let service: VerificationAdmissionService

    beforeEach(() => {
        requests = {
            findByClientKey: jest.fn().mockResolvedValue(null),
            insert: jest.fn(
                (input): Promise<InsertRequestOutcome> =>
                    Promise.resolve({
                        kind: 'inserted',
                        record: {
                            requestId: input.requestId,
                            organizationId: input.organizationId,
                            normalizedAddress: input.normalizedAddress,
                            deliveryMode: input.deliveryMode,
                            clientRequestKey: input.clientRequestKey,
                            executionId: input.executionId,
                            resultId: input.resultId,
                            source: input.source,
                            billingState: input.billingState,
                            reservedCount: input.reservedCount,
                            chargedCount: 0,
                            finalReason: input.finalReason,
                            createdAt: now,
                            settledAt: null,
                        },
                    }),
            ),
            findById: jest.fn(),
            attachExecution: jest.fn(),
        }
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
        }
        cacheReader = { findLatestCandidate: jest.fn().mockResolvedValue(null) }
        credits = { reserve: jest.fn(), closeAdmissionMany: jest.fn() }
        clock = { now: () => now }
        service = new VerificationAdmissionService(
            requests,
            executions,
            cacheReader,
            credits as unknown as CreditReservationService,
            clock,
            cacheTtlMs,
            executionDeadlineMs,
        )
    })

    it('admits a pre-check cache hit for free, with no execution and no reservation', async () => {
        cacheReader.findLatestCandidate.mockResolvedValue({
            resultId: 'result-1',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })
        const outcome = await service.admit({ organizationId, email: 'Person@Example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'cached', requestId: expect.any(String), resultId: 'result-1' })
        expect(executions.claimOrJoin).not.toHaveBeenCalled()
        expect(credits.reserve).not.toHaveBeenCalled()
        const insertedInput = requests.insert.mock.calls[0][0]
        expect(insertedInput).toEqual(expect.objectContaining({ source: 'cache', reservedCount: 0, normalizedAddress: 'person@example.test' }))
    })

    it('admits cache-available reported under the claim lock, abandoning the new execution', async () => {
        executions.claimOrJoin.mockResolvedValue({ kind: 'cache-available', resultId: 'result-2' })
        const outcome = await service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'cached', requestId: expect.any(String), resultId: 'result-2' })
        expect(credits.reserve).not.toHaveBeenCalled()
    })

    it('joins an existing nonterminal execution', async () => {
        executions.claimOrJoin.mockResolvedValue({
            kind: 'joined',
            execution: execution({ state: 'running', retryAt: null }),
        })
        const outcome = await service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'joined', requestId: expect.any(String), executionId: 'execution-1' })
        const insertedInput = requests.insert.mock.calls[0][0]
        expect(insertedInput).toEqual(expect.objectContaining({ source: 'shared', reservedCount: 0 }))
    })

    it('reports cooldown with the remaining wait when joining an awaiting_retry execution', async () => {
        const retryAt = new Date(now.getTime() + 5_000)
        executions.claimOrJoin.mockResolvedValue({
            kind: 'joined',
            execution: execution({ state: 'awaiting_retry', retryAt }),
        })
        const outcome = await service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'cooldown', requestId: expect.any(String), retryAfterMs: 5_000 })
    })

    it('funds a new execution after a successful reservation', async () => {
        executions.claimOrJoin.mockResolvedValue({ kind: 'created', execution: execution() })
        credits.reserve.mockResolvedValue({} as never)
        const outcome = await service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'funded', requestId: expect.any(String), executionId: expect.any(String) })
        expect(executions.markQueued).toHaveBeenCalled()
        const insertedInput = requests.insert.mock.calls[0][0]
        expect(insertedInput).toEqual(expect.objectContaining({ source: 'fresh', reservedCount: 1 }))
    })

    it('fences and closes admission on insufficient funds without reserving anything', async () => {
        executions.claimOrJoin.mockResolvedValue({ kind: 'created', execution: execution() })
        credits.reserve.mockRejectedValue(new InsufficientCreditsException(organizationId))
        const outcome = await service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(outcome).toEqual({ kind: 'insufficient-funds', requestId: expect.any(String) })
        expect(executions.cancelFundingFailure).toHaveBeenCalled()
        expect(credits.closeAdmissionMany).toHaveBeenCalled()
        const insertedInput = requests.insert.mock.calls[0][0]
        expect(insertedInput).toEqual(expect.objectContaining({ reservedCount: 0, executionId: null }))
    })

    it('propagates an unexpected reservation error without fencing', async () => {
        executions.claimOrJoin.mockResolvedValue({ kind: 'created', execution: execution() })
        credits.reserve.mockRejectedValue(new Error('credit store outage'))
        await expect(
            service.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' }),
        ).rejects.toThrow('credit store outage')
        expect(executions.cancelFundingFailure).not.toHaveBeenCalled()
    })

    it('replays an existing request for a repeated matching client key without new work', async () => {
        requests.findByClientKey.mockResolvedValue({
            requestId: 'request-1',
            organizationId,
            normalizedAddress: 'person@example.test',
            deliveryMode: 'sync',
            clientRequestKey: buildUuidV7(now.getTime()),
            executionId: 'execution-1',
            resultId: null,
            source: 'fresh',
            billingState: 'pending',
            reservedCount: 1,
            chargedCount: 0,
            finalReason: null,
            createdAt: now,
            settledAt: null,
        })
        const outcome = await service.admit({
            organizationId,
            email: 'person@example.test',
            deliveryMode: 'sync',
            clientRequestKey: buildUuidV7(now.getTime()),
        })
        expect(outcome).toEqual({ kind: 'funded', requestId: 'request-1', executionId: 'execution-1' })
        expect(executions.claimOrJoin).not.toHaveBeenCalled()
        expect(requests.insert).not.toHaveBeenCalled()
    })

    it('conflicts a repeated client key with a mismatched address', async () => {
        requests.findByClientKey.mockResolvedValue({
            requestId: 'request-1',
            organizationId,
            normalizedAddress: 'other@example.test',
            deliveryMode: 'sync',
            clientRequestKey: buildUuidV7(now.getTime()),
            executionId: null,
            resultId: null,
            source: 'fresh',
            billingState: 'pending',
            reservedCount: 0,
            chargedCount: 0,
            finalReason: null,
            createdAt: now,
            settledAt: null,
        })
        const outcome = await service.admit({
            organizationId,
            email: 'person@example.test',
            deliveryMode: 'sync',
            clientRequestKey: buildUuidV7(now.getTime()),
        })
        expect(outcome).toEqual({ kind: 'conflict', reason: 'key-mismatch' })
    })

    it('rejects a first-admission key older than 24 hours', async () => {
        const staleKey = buildUuidV7(now.getTime() - 24 * 60 * 60 * 1000 - 1)
        const outcome = await service.admit({
            organizationId,
            email: 'person@example.test',
            deliveryMode: 'sync',
            clientRequestKey: staleKey,
        })
        expect(outcome).toEqual({ kind: 'conflict', reason: 'key-expired' })
        expect(executions.claimOrJoin).not.toHaveBeenCalled()
    })

    it('rejects a first-admission key more than 5 minutes ahead of server time', async () => {
        const futureKey = buildUuidV7(now.getTime() + 5 * 60 * 1000 + 1)
        const outcome = await service.admit({
            organizationId,
            email: 'person@example.test',
            deliveryMode: 'sync',
            clientRequestKey: futureKey,
        })
        expect(outcome).toEqual({ kind: 'conflict', reason: 'key-expired' })
    })
})
