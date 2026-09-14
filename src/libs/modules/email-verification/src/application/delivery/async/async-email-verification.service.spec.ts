import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { AdmissionOutcome, VerificationAdmissionService } from '../../operations/verification-admission.service'
import { ReadOutcome, VerificationOperationsReader } from '../../operations/verification-operations-reader'
import { VerificationExecutionDispatcher } from '../../ports/verification-execution-dispatcher'
import { VerificationRequestRecord } from '../../ports/verification-request-store'
import { AsyncEmailVerificationService } from './async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'

const organizationId = 'org-1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function request(overrides: Partial<VerificationRequestRecord> = {}): VerificationRequestRecord {
    return {
        requestId: 'request-1',
        organizationId,
        normalizedAddress: 'person@lef.test',
        deliveryMode: 'async',
        clientRequestKey: null,
        executionId: null,
        resultId: null,
        source: 'fresh',
        billingState: 'pending',
        reservedCount: 1,
        chargedCount: 0,
        finalReason: null,
        createdAt: new Date(),
        settledAt: null,
        ...overrides,
    }
}

describe('AsyncEmailVerificationService', () => {
    let admission: jest.Mocked<Pick<VerificationAdmissionService, 'admit'>>
    let dispatcher: jest.Mocked<VerificationExecutionDispatcher>
    let operations: jest.Mocked<Pick<VerificationOperationsReader, 'read'>>
    let service: AsyncEmailVerificationService

    const input = { email: 'person@lef.test', organizationId }

    beforeEach(() => {
        admission = { admit: jest.fn() }
        dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) }
        operations = { read: jest.fn() }
        service = new AsyncEmailVerificationService(
            admission as unknown as VerificationAdmissionService,
            dispatcher,
            operations as unknown as VerificationOperationsReader,
            CACHE_TTL_MS,
        )
    })

    describe('verifyAsync', () => {
        it('accepts a cache hit without dispatching', async () => {
            admission.admit.mockResolvedValue({ kind: 'cached', requestId: 'request-1', resultId: 'result-1' })
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'accepted', id: 'request-1' })
            expect(dispatcher.dispatch).not.toHaveBeenCalled()
        })

        it.each(['funded', 'joined'] as const)('dispatches and accepts a %s outcome', async kind => {
            admission.admit.mockResolvedValue({ kind, requestId: 'request-1', executionId: 'execution-1' })
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'accepted', id: 'request-1' })
            expect(dispatcher.dispatch).toHaveBeenCalledWith('execution-1', organizationId)
        })

        it('accepts a mid-flight cooldown join without dispatching', async () => {
            admission.admit.mockResolvedValue({ kind: 'cooldown', requestId: 'request-1', retryAfterMs: 5_000 })
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'accepted', id: 'request-1' })
            expect(dispatcher.dispatch).not.toHaveBeenCalled()
        })

        it('reports address-cooldown for a recent terminal inconclusive verdict', async () => {
            admission.admit.mockResolvedValue({ kind: 'address-cooldown', retryAfterMs: 45_000 } as AdmissionOutcome)
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'address-cooldown', retryAfterMs: 45_000 })
        })

        it('reports insufficient-funds', async () => {
            admission.admit.mockResolvedValue({ kind: 'insufficient-funds', requestId: 'request-1' })
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'insufficient-funds', id: 'request-1' })
        })

        it.each(['key-mismatch', 'key-expired'] as const)('reports a %s conflict', async reason => {
            admission.admit.mockResolvedValue({ kind: 'conflict', reason })
            await expect(service.verifyAsync(input)).resolves.toEqual({ kind: 'conflict', reason })
        })

        it('passes the client request key through to admission', async () => {
            admission.admit.mockResolvedValue({ kind: 'cached', requestId: 'request-1', resultId: 'result-1' })
            await service.verifyAsync({ ...input, clientRequestKey: 'key-1' })
            expect(admission.admit).toHaveBeenCalledWith({
                organizationId,
                email: input.email,
                deliveryMode: 'async',
                clientRequestKey: 'key-1',
            })
        })
    })

    describe('getAsyncVerificationState', () => {
        it('throws not-found for an unknown or foreign request', async () => {
            operations.read.mockResolvedValue({ kind: 'not-found' })
            await expect(service.getAsyncVerificationState('request-1', organizationId)).rejects.toEqual(
                new AsyncEmailVerificationJobNotFoundException('request-1'),
            )
        })

        it('throws not-found for an expired request, concealing it exactly like a missing one', async () => {
            operations.read.mockResolvedValue({ kind: 'expired' })
            await expect(service.getAsyncVerificationState('request-1', organizationId)).rejects.toEqual(
                new AsyncEmailVerificationJobNotFoundException('request-1'),
            )
        })

        it('maps a pending outcome to its public state', async () => {
            operations.read.mockResolvedValue({ kind: 'pending', executionState: 'running' } as ReadOutcome)
            await expect(service.getAsyncVerificationState('request-1', organizationId)).resolves.toEqual({
                state: 'running',
            })
        })

        it('maps a settled outcome to completed with operation metadata', async () => {
            const settledRequest = request({ billingState: 'settled', finalReason: 'conclusive', chargedCount: 1 })
            operations.read.mockResolvedValue({
                kind: 'settled',
                request: settledRequest,
                result: {
                    id: 'result-1',
                    email: 'person@lef.test',
                    localPart: 'person',
                    domain: 'lef.test',
                    exists: true,
                    catchAll: false,
                    reason: EmailVerificationReason.AcceptedEmail,
                    sources: [EmailVerificationSource.MX],
                    createdAt: new Date(),
                    evidenceObservedAt: new Date(),
                },
            } as ReadOutcome)

            const status = await service.getAsyncVerificationState('request-1', organizationId)
            expect(status.state).toBe('completed')
        })

        it('preserves a persistence failure', async () => {
            const error = new Error('store unavailable')
            operations.read.mockRejectedValue(error)
            await expect(service.getAsyncVerificationState('request-1', organizationId)).rejects.toBe(error)
        })
    })
})
