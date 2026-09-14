import { EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { NewEmailVerification } from '../../domain/email-verification'
import { MailboxVerificationService } from '../mailbox-verification.service'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionPermits } from '../ports/verification-execution-permits'
import {
    VerificationExecutionRecord,
    VerificationExecutionStore,
} from '../ports/verification-execution-store'
import { PersistResultOutcome, VerificationSettlementStore } from '../ports/verification-settlement-store'
import { VerificationExecutionRunner } from './verification-execution-runner'
import { VerificationSettlementService } from './verification-settlement.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-11T00:00:00.000Z')

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
        leaseOwnerId: 'worker-1',
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        resultId: null,
        retryAt: null,
        deadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
        ...overrides,
    }
}

function verificationResult(overrides: Partial<NewEmailVerification> = {}): NewEmailVerification {
    return {
        email: 'person@example.test',
        domain: 'example.test',
        localPart: 'person',
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        sources: [],
        verificationQuality: 'conclusive_positive',
        evidenceObservedAt: now,
        evidencePolicyVersion: 1,
        ...overrides,
    }
}

function executionsStore(overrides: Partial<jest.Mocked<VerificationExecutionStore>> = {}): jest.Mocked<VerificationExecutionStore> {
    return {
        claimOrJoin: jest.fn(),
        findById: jest.fn(),
        markQueued: jest.fn(),
        cancelFundingFailure: jest.fn(),
        acquireLease: jest.fn().mockResolvedValue(execution()),
        renewLease: jest.fn().mockResolvedValue(execution()),
        takeoverForRetry: jest.fn().mockResolvedValue(execution({ state: 'awaiting_retry' })),
        cancelIfNoCaptureIntention: jest.fn(),
        pageNonterminal: jest.fn(),
        ...overrides,
    }
}

function settlementsStore(overrides: Partial<jest.Mocked<VerificationSettlementStore>> = {}): jest.Mocked<VerificationSettlementStore> {
    return {
        persistResultAndIntention: jest.fn().mockResolvedValue({
            kind: 'persisted',
            resultId: 'result-1',
            intention: {
                executionId: 'execution-1',
                organizationId,
                decision: 'capture',
                resultId: 'result-1',
                state: 'pending',
                createdAt: now,
                confirmedAt: null,
            },
        } satisfies PersistResultOutcome),
        findIntention: jest.fn(),
        confirmSettlement: jest.fn().mockResolvedValue({ resultId: 'result-1' }),
        pagePendingIntentions: jest.fn(),
        ...overrides,
    }
}

function clock(): VerificationClock {
    return { now: () => now }
}

function permitsStore(overrides: Partial<jest.Mocked<VerificationExecutionPermits>> = {}): jest.Mocked<VerificationExecutionPermits> {
    return {
        tryAcquire: jest.fn().mockResolvedValue(true),
        renew: jest.fn().mockResolvedValue(true),
        release: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

describe('VerificationExecutionRunner', () => {
    it('reports not-runnable when a lease cannot be acquired', async () => {
        const executions = executionsStore({ acquireLease: jest.fn().mockResolvedValue(null) })
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = { verify: jest.fn() } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'not-runnable' })
        expect(mailboxVerification.verify).not.toHaveBeenCalled()
        expect(permits.release).toHaveBeenCalledWith(expect.any(String))
    })

    it('reports permit-unavailable and never touches the execution row when the concurrency cap is reached', async () => {
        const executions = executionsStore()
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = { verify: jest.fn() } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore({ tryAcquire: jest.fn().mockResolvedValue(false) })
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'permit-unavailable' })
        expect(executions.acquireLease).not.toHaveBeenCalled()
        expect(mailboxVerification.verify).not.toHaveBeenCalled()
        expect(permits.release).not.toHaveBeenCalled()
    })

    it('captures a conclusive result and settles it', async () => {
        const executions = executionsStore()
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockResolvedValue(verificationResult()),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'settled' })
        expect(mailboxVerification.verify).toHaveBeenCalledWith(
            organizationId,
            'person@example.test',
            undefined,
            expect.any(AbortSignal),
        )
        expect(settlements.persistResultAndIntention).toHaveBeenCalledWith(
            expect.objectContaining({ executionId: 'execution-1', expectedGeneration: 0, decision: 'capture', finalReason: 'conclusive' }),
        )
        expect(settlementService.settle).toHaveBeenCalledWith('execution-1', organizationId)
        expect(permits.tryAcquire).toHaveBeenCalledWith(
            expect.any(String),
            organizationId,
            now,
            expect.any(Date),
            5,
        )
        expect(permits.release).toHaveBeenCalledWith(expect.any(String))
    })

    it('releases an inconclusive result instead of capturing it', async () => {
        const executions = executionsStore()
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockResolvedValue(verificationResult({ verificationQuality: 'inconclusive', exists: null })),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        await runner.execute('execution-1', organizationId)

        expect(settlements.persistResultAndIntention).toHaveBeenCalledWith(
            expect.objectContaining({ decision: 'release', finalReason: 'inconclusive' }),
        )
    })

    it('schedules a greylist retry without persisting a result', async () => {
        const executions = executionsStore({ acquireLease: jest.fn().mockResolvedValue(execution({ attemptGeneration: 2 })) })
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockResolvedValue(verificationResult({ reason: EmailVerificationReason.TemporarilyBlocked, exists: null, verificationQuality: 'inconclusive' })),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'retry-scheduled', retryAt: new Date(now.getTime() + 3 * 60_000) })
        expect(executions.takeoverForRetry).toHaveBeenCalledWith(
            'execution-1',
            organizationId,
            2,
            new Date(now.getTime() + 3 * 60_000),
        )
        expect(settlements.persistResultAndIntention).not.toHaveBeenCalled()
        expect(settlementService.settle).not.toHaveBeenCalled()
    })

    it('schedules a flat-delay retry when the probe throws', async () => {
        const executions = executionsStore()
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockRejectedValue(new Error('adapter_failed')),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'retry-scheduled', retryAt: new Date(now.getTime() + 10_000) })
        expect(executions.takeoverForRetry).toHaveBeenCalledWith('execution-1', organizationId, 0, new Date(now.getTime() + 10_000))
    })

    it('reports lease-lost when persistence rejects a stale generation', async () => {
        const executions = executionsStore()
        const settlements = settlementsStore({
            persistResultAndIntention: jest.fn().mockResolvedValue({ kind: 'stale-generation' }),
        })
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockResolvedValue(verificationResult()),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'lease-lost' })
        expect(settlementService.settle).not.toHaveBeenCalled()
    })

    it('reports lease-lost, without a retry, when takeoverForRetry itself rejects a stale generation', async () => {
        const executions = executionsStore({ takeoverForRetry: jest.fn().mockResolvedValue(null) })
        const settlements = settlementsStore()
        const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
        const mailboxVerification = {
            verify: jest.fn().mockRejectedValue(new Error('adapter_failed')),
        } as unknown as jest.Mocked<MailboxVerificationService>
        const permits = permitsStore()
        const runner = new VerificationExecutionRunner(
            executions,
            settlements,
            settlementService,
            mailboxVerification,
            clock(),
            permits,
            60_000,
            5_000,
            5,
        )

        const outcome = await runner.execute('execution-1', organizationId)

        expect(outcome).toEqual({ kind: 'lease-lost' })
    })

    it('aborts the in-flight probe and reports lease-lost when lease renewal fails mid-probe', async () => {
        jest.useFakeTimers()
        try {
            const executions = executionsStore({ renewLease: jest.fn().mockResolvedValue(null) })
            const settlements = settlementsStore()
            const settlementService = { settle: jest.fn() } as unknown as jest.Mocked<VerificationSettlementService>
            let capturedSignal: AbortSignal | undefined
            const mailboxVerification = {
                verify: jest.fn(
                    (_organizationId: string, _email: string, _format: unknown, signal?: AbortSignal) =>
                        new Promise((_resolve, reject) => {
                            capturedSignal = signal
                            signal?.addEventListener('abort', () => reject(new Error('aborted')))
                        }),
                ),
            } as unknown as jest.Mocked<MailboxVerificationService>
            const permits = permitsStore()
            const runner = new VerificationExecutionRunner(
                executions,
                settlements,
                settlementService,
                mailboxVerification,
                clock(),
                permits,
                60_000,
                5_000,
                5,
            )

            const outcomePromise = runner.execute('execution-1', organizationId)
            await jest.advanceTimersByTimeAsync(5_000)

            const outcome = await outcomePromise

            expect(outcome).toEqual({ kind: 'lease-lost' })
            expect(capturedSignal?.aborted).toBe(true)
            expect(executions.takeoverForRetry).not.toHaveBeenCalled()
        } finally {
            jest.useRealTimers()
        }
    })
})
