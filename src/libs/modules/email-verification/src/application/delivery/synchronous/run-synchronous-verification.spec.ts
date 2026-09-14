import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { AdmissionOutcome, VerificationAdmissionService } from '../../operations/verification-admission.service'
import { ExecutionOutcome, VerificationExecutionRunner } from '../../operations/verification-execution-runner'
import { ReadOutcome, VerificationOperationsReader } from '../../operations/verification-operations-reader'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationRequestRecord } from '../../ports/verification-request-store'
import { RunSynchronousVerification } from './run-synchronous-verification'

const organizationId = 'org-1'
const email = 'person@lef.test'
const requestId = 'request-1'
const executionId = 'execution-1'
const BUDGET_MS = 5_000
const POLL_INTERVAL_MS = 100
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function request(overrides: Partial<VerificationRequestRecord> = {}): VerificationRequestRecord {
    return {
        requestId,
        organizationId,
        normalizedAddress: email,
        deliveryMode: 'sync',
        clientRequestKey: null,
        executionId,
        resultId: null,
        source: 'fresh',
        billingState: 'settled',
        reservedCount: 1,
        chargedCount: 1,
        finalReason: 'conclusive',
        createdAt: new Date(),
        settledAt: new Date(),
        ...overrides,
    }
}

function settledResult(overrides: Partial<ReadOutcome & { kind: 'settled' }> = {}): ReadOutcome {
    return {
        kind: 'settled',
        request: request(),
        result: {
            id: 'result-1',
            email,
            localPart: 'person',
            domain: 'lef.test',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
            createdAt: new Date(),
            evidenceObservedAt: new Date(),
        },
        ...overrides,
    }
}

describe('RunSynchronousVerification', () => {
    let admission: jest.Mocked<Pick<VerificationAdmissionService, 'admit'>>
    let runner: jest.Mocked<Pick<VerificationExecutionRunner, 'execute'>>
    let operations: jest.Mocked<Pick<VerificationOperationsReader, 'read'>>
    let clock: VerificationClock
    let command: RunSynchronousVerification

    const input = { organizationId, email }

    beforeEach(() => {
        jest.useFakeTimers()
        admission = { admit: jest.fn() }
        runner = { execute: jest.fn() }
        operations = { read: jest.fn() }
        clock = { now: () => new Date() }
        command = new RunSynchronousVerification(
            admission as unknown as VerificationAdmissionService,
            runner as unknown as VerificationExecutionRunner,
            operations as unknown as VerificationOperationsReader,
            clock,
            BUDGET_MS,
            POLL_INTERVAL_MS,
            CACHE_TTL_MS,
        )
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('reports insufficient-funds without touching the runner or operations reader', async () => {
        admission.admit.mockResolvedValue({ kind: 'insufficient-funds', requestId })
        await expect(command.execute(input)).resolves.toEqual({ kind: 'insufficient-funds' })
        expect(runner.execute).not.toHaveBeenCalled()
        expect(operations.read).not.toHaveBeenCalled()
    })

    it.each(['key-mismatch', 'key-expired'] as const)('reports a %s conflict', async reason => {
        admission.admit.mockResolvedValue({ kind: 'conflict', reason })
        await expect(command.execute(input)).resolves.toEqual({ kind: 'conflict', reason })
    })

    it('reports address-cooldown for a recent terminal inconclusive verdict', async () => {
        admission.admit.mockResolvedValue({ kind: 'address-cooldown', retryAfterMs: 45_000 } as AdmissionOutcome)
        await expect(command.execute(input)).resolves.toEqual({ kind: 'address-cooldown', retryAfterMs: 45_000 })
    })

    it('forwards the client request key to admission', async () => {
        admission.admit.mockResolvedValue({ kind: 'insufficient-funds', requestId })
        await command.execute({ ...input, clientRequestKey: 'key-1' })
        expect(admission.admit).toHaveBeenCalledWith({
            organizationId,
            email,
            deliveryMode: 'sync',
            clientRequestKey: 'key-1',
        })
    })

    describe('cached admission', () => {
        it('reads the already-settled result and reports it as completed with operation metadata', async () => {
            admission.admit.mockResolvedValue({ kind: 'cached', requestId, resultId: 'result-1' })
            operations.read.mockResolvedValue(settledResult({ request: request({ source: 'cache', finalReason: 'cached' }) }))

            const outcome = await command.execute(input)

            expect(outcome.kind).toBe('completed')
            expect(runner.execute).not.toHaveBeenCalled()
            if (outcome.kind === 'completed') {
                expect(outcome.result.id).toBe('result-1')
                expect(outcome.operation).toMatchObject({ id: requestId, source: 'cache' })
            }
        })

        it('falls back to accepted if the cached request is defensively not yet settled', async () => {
            admission.admit.mockResolvedValue({ kind: 'cached', requestId, resultId: 'result-1' })
            operations.read.mockResolvedValue({ kind: 'pending', executionState: 'running' })

            await expect(command.execute(input)).resolves.toEqual({ kind: 'accepted', id: requestId })
        })
    })

    describe('funded admission', () => {
        it('settles on the first inline attempt', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute.mockResolvedValue({ kind: 'settled' })
            operations.read.mockResolvedValue(settledResult())

            const outcome = await command.execute(input)

            expect(runner.execute).toHaveBeenCalledWith(executionId, organizationId)
            expect(outcome.kind).toBe('completed')
        })

        it('falls back to accepted at the deadline even while a single attempt is still in flight', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            // A probe attempt that outlives the whole budget (an individual SMTP stage can take minutes) must
            // never keep the caller waiting past the deadline — the attempt itself is left to resolve in the
            // background, backstopped by its own lease/permit machinery.
            runner.execute.mockImplementation(() => new Promise(() => {}))

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(BUDGET_MS * 2)

            await expect(outcomePromise).resolves.toEqual({ kind: 'accepted', id: requestId })
        })

        it('waits out a retry-scheduled attempt that fits the budget, then settles', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute
                .mockResolvedValueOnce({ kind: 'retry-scheduled', retryAt: new Date(Date.now() + 500) })
                .mockResolvedValueOnce({ kind: 'settled' })
            operations.read.mockResolvedValue(settledResult())

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(1_000)

            await expect(outcomePromise).resolves.toMatchObject({ kind: 'completed' })
            expect(runner.execute).toHaveBeenCalledTimes(2)
        })

        it('falls back to accepted when a retry-scheduled wait would not fit the budget', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute.mockResolvedValue({ kind: 'retry-scheduled', retryAt: new Date(Date.now() + BUDGET_MS * 10) })

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(BUDGET_MS * 2)

            await expect(outcomePromise).resolves.toEqual({ kind: 'accepted', id: requestId })
            expect(runner.execute).toHaveBeenCalledTimes(1)
        })

        it.each(['lease-lost', 'not-runnable'] as const)('falls back to accepted on %s', async kind => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute.mockResolvedValue({ kind } as ExecutionOutcome)

            await expect(command.execute(input)).resolves.toEqual({ kind: 'accepted', id: requestId })
        })

        it('waits through permit-unavailable before eventually settling', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute
                .mockResolvedValueOnce({ kind: 'permit-unavailable' })
                .mockResolvedValueOnce({ kind: 'permit-unavailable' })
                .mockResolvedValueOnce({ kind: 'settled' })
            operations.read.mockResolvedValue(settledResult())

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(BUDGET_MS)

            await expect(outcomePromise).resolves.toMatchObject({ kind: 'completed' })
            expect(runner.execute).toHaveBeenCalledTimes(3)
        })

        it('falls back to accepted once the budget is exhausted under sustained permit-unavailable', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute.mockResolvedValue({ kind: 'permit-unavailable' })

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(BUDGET_MS * 2)

            await expect(outcomePromise).resolves.toEqual({ kind: 'accepted', id: requestId })
        })

        it('reports failed with operation metadata for a canceled execution settled with no result', async () => {
            admission.admit.mockResolvedValue({ kind: 'funded', requestId, executionId })
            runner.execute.mockResolvedValue({ kind: 'settled' })
            operations.read.mockResolvedValue({
                kind: 'settled',
                request: request({ resultId: null, finalReason: 'failed', chargedCount: 0 }),
                result: null,
            })

            const outcome = await command.execute(input)

            expect(outcome).toMatchObject({ kind: 'failed', operation: { id: requestId } })
        })
    })

    describe('joined/cooldown admission', () => {
        it.each(['joined', 'cooldown'] as const)(
            'polls read-only status until settled without driving the execution for a %s outcome',
            async kind => {
                admission.admit.mockResolvedValue(
                    kind === 'joined'
                        ? { kind, requestId, executionId }
                        : { kind, requestId, retryAfterMs: 200 },
                )
                operations.read
                    .mockResolvedValueOnce({ kind: 'pending', executionState: 'running' })
                    .mockResolvedValueOnce(settledResult())

                const outcomePromise = command.execute(input)
                await jest.advanceTimersByTimeAsync(BUDGET_MS)

                await expect(outcomePromise).resolves.toMatchObject({ kind: 'completed' })
                expect(runner.execute).not.toHaveBeenCalled()
            },
        )

        it('falls back to accepted once the budget is exhausted while still pending', async () => {
            admission.admit.mockResolvedValue({ kind: 'joined', requestId, executionId })
            operations.read.mockResolvedValue({ kind: 'pending', executionState: 'running' })

            const outcomePromise = command.execute(input)
            await jest.advanceTimersByTimeAsync(BUDGET_MS * 2)

            await expect(outcomePromise).resolves.toEqual({ kind: 'accepted', id: requestId })
        })

        it('falls back to accepted if the request unexpectedly disappears mid-poll', async () => {
            admission.admit.mockResolvedValue({ kind: 'joined', requestId, executionId })
            operations.read.mockResolvedValue({ kind: 'not-found' })

            await expect(command.execute(input)).resolves.toEqual({ kind: 'accepted', id: requestId })
        })
    })
})
