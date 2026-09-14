import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationRequestStore } from '../ports/verification-request-store'
import { VerificationResultReader } from '../verification-result-reader'
import { VerificationOperationsReader } from './verification-operations-reader'

const organizationId = '10000000-0000-4000-8000-000000000001'
const requestId = 'request-1'
const now = new Date('2026-09-08T00:00:00.000Z')

function request(
    overrides: Partial<Awaited<ReturnType<VerificationRequestStore['findById']>>> = {},
): NonNullable<Awaited<ReturnType<VerificationRequestStore['findById']>>> {
    return {
        requestId,
        organizationId,
        normalizedAddress: 'person@example.test',
        deliveryMode: 'sync' as const,
        clientRequestKey: null,
        executionId: null,
        resultId: null,
        source: 'fresh' as const,
        billingState: 'pending' as const,
        reservedCount: 1 as const,
        chargedCount: 0 as const,
        finalReason: null,
        createdAt: now,
        settledAt: null,
        ...overrides,
    }
}

describe('VerificationOperationsReader', () => {
    let requests: jest.Mocked<VerificationRequestStore>
    let executions: jest.Mocked<VerificationExecutionStore>
    let results: jest.Mocked<VerificationResultReader>
    let clock: VerificationClock
    let reader: VerificationOperationsReader

    beforeEach(() => {
        requests = {
            findByClientKey: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            attachExecution: jest.fn(),
            settleCanceled: jest.fn(),
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
            pageCanceledPendingCleanup: jest.fn(),
        }
        results = { findOwned: jest.fn() }
        clock = { now: () => now }
        reader = new VerificationOperationsReader(requests, executions, results, clock)
    })

    it('reports not-found for an unknown or foreign request', async () => {
        requests.findById.mockResolvedValue(null)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({ kind: 'not-found' })
    })

    it('reports pending with the execution current state', async () => {
        requests.findById.mockResolvedValue(request({ executionId: 'execution-1' }))
        executions.findById.mockResolvedValue({
            executionId: 'execution-1',
            organizationId,
            normalizedAddress: 'person@example.test',
            payerRequestId: requestId,
            state: 'running',
            fundingOwnerType: 'single',
            fundingOwnerId: 'execution-1',
            attemptGeneration: 0,
            leaseOwnerId: 'worker-1',
            leaseExpiresAt: now,
            resultId: null,
            retryAt: null,
            deadlineAt: now,
            createdAt: now,
            updatedAt: now,
        })
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({ kind: 'pending', executionState: 'running' })
    })

    it('reports funding_pending defensively when a pending request has no execution yet', async () => {
        requests.findById.mockResolvedValue(request())
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({
            kind: 'pending',
            executionState: 'funding_pending',
        })
    })

    it('reports not-found when the linked execution has vanished', async () => {
        requests.findById.mockResolvedValue(request({ executionId: 'execution-1' }))
        executions.findById.mockResolvedValue(null)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({ kind: 'not-found' })
    })

    it('returns the settled result with the full request record', async () => {
        const settledRequest = request({
            billingState: 'settled',
            resultId: 'result-1',
            finalReason: 'conclusive',
            chargedCount: 1,
            settledAt: now,
        })
        requests.findById.mockResolvedValue(settledRequest)
        results.findOwned.mockResolvedValue({ id: 'result-1' } as never)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({
            kind: 'settled',
            request: settledRequest,
            result: { id: 'result-1' },
        })
    })

    it('returns a settled outcome with no result for a fenced insufficient-funds denial', async () => {
        const settledRequest = request({ billingState: 'settled', resultId: null, finalReason: 'failed', settledAt: now })
        requests.findById.mockResolvedValue(settledRequest)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({
            kind: 'settled',
            request: settledRequest,
            result: null,
        })
        expect(results.findOwned).not.toHaveBeenCalled()
    })

    it('is visible and replayable exactly up to the seven-day settlement boundary', async () => {
        const settledAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        requests.findById.mockResolvedValue(
            request({ billingState: 'settled', resultId: 'result-1', settledAt }),
        )
        results.findOwned.mockResolvedValue({ id: 'result-1' } as never)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual(
            expect.objectContaining({ kind: 'settled' }),
        )
    })

    it('reports expired strictly beyond the seven-day settlement boundary', async () => {
        const settledAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1)
        requests.findById.mockResolvedValue(
            request({ billingState: 'settled', resultId: 'result-1', settledAt }),
        )
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({ kind: 'expired' })
        expect(results.findOwned).not.toHaveBeenCalled()
    })

    it('reports expired defensively when a settled result has since been pruned', async () => {
        requests.findById.mockResolvedValue(
            request({ billingState: 'settled', resultId: 'result-1', settledAt: now }),
        )
        results.findOwned.mockResolvedValue(null)
        await expect(reader.read(requestId, organizationId)).resolves.toEqual({ kind: 'expired' })
    })
})
