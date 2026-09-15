import { CreditReservationService, ReservationRecord } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionRecord, VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationRequestStore } from '../ports/verification-request-store'
import {
    VerificationSettlementIntentionRecord,
    VerificationSettlementStore,
} from '../ports/verification-settlement-store'
import { VerificationExecutionRunner } from './verification-execution-runner'
import { VerificationReconciler } from './verification-reconciler'
import { VerificationSettlementService } from './verification-settlement.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-11T00:00:00.000Z')
const LEASE_TAKEOVER_GRACE_MS = 5_000

function execution(overrides: Partial<VerificationExecutionRecord> = {}): VerificationExecutionRecord {
    return {
        executionId: 'execution-1',
        organizationId,
        normalizedAddress: 'person@example.test',
        payerRequestId: 'request-1',
        state: 'queued',
        fundingOwnerType: 'single',
        fundingOwnerId: 'execution-1',
        attemptGeneration: 0,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
        ...overrides,
    }
}

function intention(overrides: Partial<VerificationSettlementIntentionRecord> = {}): VerificationSettlementIntentionRecord {
    return {
        executionId: 'execution-1',
        organizationId,
        decision: 'capture',
        resultId: 'result-1',
        state: 'pending',
        createdAt: now,
        confirmedAt: null,
        ...overrides,
    }
}

function executionsStore(overrides: Partial<jest.Mocked<VerificationExecutionStore>> = {}): jest.Mocked<VerificationExecutionStore> {
    return {
        claimOrJoin: jest.fn(),
        findById: jest.fn(),
        markQueued: jest.fn().mockResolvedValue(execution({ state: 'queued' })),
        cancelFundingFailure: jest.fn().mockResolvedValue(execution({ state: 'canceled' })),
        acquireLease: jest.fn(),
        renewLease: jest.fn(),
        takeoverForRetry: jest.fn().mockResolvedValue(execution({ state: 'queued' })),
        cancelIfNoCaptureIntention: jest.fn().mockResolvedValue(execution({ state: 'canceled' })),
        pageNonterminal: jest.fn().mockResolvedValue([]),
        pageCanceledPendingCleanup: jest.fn().mockResolvedValue([]),
        cancelBatchGroupUnstarted: jest.fn(),
        ...overrides,
    }
}

function settlementsStore(overrides: Partial<jest.Mocked<VerificationSettlementStore>> = {}): jest.Mocked<VerificationSettlementStore> {
    return {
        persistResultAndIntention: jest.fn(),
        findIntention: jest.fn(),
        confirmSettlement: jest.fn(),
        pagePendingIntentions: jest.fn().mockResolvedValue([]),
        ...overrides,
    }
}

function reservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
    return {
        operationId: 'execution-1',
        amount: 1,
        state: 'reserved',
        createdAt: now,
        updatedAt: now,
        settledAt: null,
        ...overrides,
    }
}

function clock(): VerificationClock {
    return { now: () => now }
}

function requestsStore(overrides: Partial<jest.Mocked<VerificationRequestStore>> = {}): jest.Mocked<VerificationRequestStore> {
    return {
        findByClientKey: jest.fn(),
        insert: jest.fn(),
        findById: jest.fn(),
        attachExecution: jest.fn(),
        settleCanceled: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

function reconcilerFixture(
    executionsOverrides: Partial<jest.Mocked<VerificationExecutionStore>> = {},
    settlementsOverrides: Partial<jest.Mocked<VerificationSettlementStore>> = {},
): {
    reconciler: VerificationReconciler
    executions: jest.Mocked<VerificationExecutionStore>
    requests: jest.Mocked<VerificationRequestStore>
    settlements: jest.Mocked<VerificationSettlementStore>
    settlementService: jest.Mocked<VerificationSettlementService>
    runner: jest.Mocked<VerificationExecutionRunner>
    credits: jest.Mocked<CreditReservationService>
} {
    const executions = executionsStore(executionsOverrides)
    const requests = requestsStore()
    const settlements = settlementsStore(settlementsOverrides)
    const settlementService = { settle: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<VerificationSettlementService>
    const runner = { execute: jest.fn().mockResolvedValue({ kind: 'settled' }) } as unknown as jest.Mocked<VerificationExecutionRunner>
    const credits = {
        getReservation: jest.fn().mockResolvedValue(null),
        release: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CreditReservationService>
    const reconciler = new VerificationReconciler(
        executions,
        requests,
        settlements,
        settlementService,
        runner,
        credits,
        clock(),
        LEASE_TAKEOVER_GRACE_MS,
    )
    return { reconciler, executions, requests, settlements, settlementService, runner, credits }
}

describe('VerificationReconciler', () => {
    it('marks a funding_pending execution queued once its reservation is found', async () => {
        const { reconciler, executions, credits } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([execution({ state: 'funding_pending' })]),
        })
        credits.getReservation.mockResolvedValue(reservation())

        const report = await reconciler.reconcile(100)

        expect(credits.getReservation).toHaveBeenCalledWith(organizationId, 'execution-1')
        expect(executions.markQueued).toHaveBeenCalledWith('execution-1', organizationId)
        expect(executions.cancelFundingFailure).not.toHaveBeenCalled()
        expect(report).toEqual({ executionsChecked: 1, intentionsSettled: 0, cancellationsCleanedUp: 0 })
    })

    it('cancels a funding_pending execution with no reservation on record', async () => {
        const { reconciler, executions, credits } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([execution({ state: 'funding_pending' })]),
        })
        credits.getReservation.mockResolvedValue(null)

        await reconciler.reconcile(100)

        expect(executions.cancelFundingFailure).toHaveBeenCalledWith('execution-1', organizationId)
        expect(executions.markQueued).not.toHaveBeenCalled()
    })

    it('drives a queued execution forward through the runner', async () => {
        const { reconciler, runner } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([execution({ state: 'queued' })]),
        })

        await reconciler.reconcile(100)

        expect(runner.execute).toHaveBeenCalledWith('execution-1', organizationId)
    })

    it('drives an awaiting_retry execution forward once its retry time is due', async () => {
        const { reconciler, runner } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'awaiting_retry', retryAt: new Date(now.getTime() - 1) }),
            ]),
        })

        await reconciler.reconcile(100)

        expect(runner.execute).toHaveBeenCalledWith('execution-1', organizationId)
    })

    it('leaves an awaiting_retry execution alone before its retry time is due', async () => {
        const { reconciler, runner } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'awaiting_retry', retryAt: new Date(now.getTime() + 1) }),
            ]),
        })

        await reconciler.reconcile(100)

        expect(runner.execute).not.toHaveBeenCalled()
    })

    it('reclaims a running execution whose lease has expired past its shutdown grace', async () => {
        const { reconciler, executions } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({
                    state: 'running',
                    attemptGeneration: 3,
                    leaseExpiresAt: new Date(now.getTime() - LEASE_TAKEOVER_GRACE_MS - 1),
                }),
            ]),
        })

        await reconciler.reconcile(100)

        expect(executions.takeoverForRetry).toHaveBeenCalledWith('execution-1', organizationId, 3, null)
    })

    it('leaves a running execution alone while its lease is still within the shutdown grace', async () => {
        const { reconciler, executions } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'running', leaseExpiresAt: new Date(now.getTime() - 1) }),
            ]),
        })

        await reconciler.reconcile(100)

        expect(executions.takeoverForRetry).not.toHaveBeenCalled()
    })

    it('leaves a settling execution untouched, deferring entirely to pending-intention settlement', async () => {
        const { reconciler, executions, runner } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'settling', deadlineAt: new Date(now.getTime() - 1) }),
            ]),
        })

        await reconciler.reconcile(100)

        expect(executions.cancelIfNoCaptureIntention).not.toHaveBeenCalled()
        expect(runner.execute).not.toHaveBeenCalled()
    })

    it('cancels a queued execution once its deadline has passed, releasing its reservation and settling its requests', async () => {
        const { reconciler, executions, requests, runner, credits } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'queued', deadlineAt: new Date(now.getTime() - 1) }),
            ]),
        })
        credits.getReservation.mockResolvedValue(reservation())

        await reconciler.reconcile(100)

        expect(executions.cancelIfNoCaptureIntention).toHaveBeenCalledWith('execution-1', organizationId)
        expect(runner.execute).not.toHaveBeenCalled()
        expect(credits.release).toHaveBeenCalledWith(organizationId, 'execution-1')
        expect(requests.settleCanceled).toHaveBeenCalledWith('execution-1', organizationId)
    })

    it('skips releasing credits for a deadline-canceled execution that never held a reservation', async () => {
        const { reconciler, requests, credits } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'funding_pending', deadlineAt: new Date(now.getTime() - 1) }),
            ]),
        })
        credits.getReservation.mockResolvedValue(null)

        await reconciler.reconcile(100)

        expect(credits.release).not.toHaveBeenCalled()
        expect(requests.settleCanceled).toHaveBeenCalledWith('execution-1', organizationId)
    })

    it('does not release credits or settle requests when the deadline cancellation is a no-op replay', async () => {
        const { reconciler, requests, credits } = reconcilerFixture({
            pageNonterminal: jest.fn().mockResolvedValue([
                execution({ state: 'queued', deadlineAt: new Date(now.getTime() - 1) }),
            ]),
            cancelIfNoCaptureIntention: jest.fn().mockResolvedValue(execution({ state: 'settling' })),
        })

        await reconciler.reconcile(100)

        expect(credits.getReservation).not.toHaveBeenCalled()
        expect(credits.release).not.toHaveBeenCalled()
        expect(requests.settleCanceled).not.toHaveBeenCalled()
    })

    it('settles every pending intention it pages', async () => {
        const { reconciler, settlementService } = reconcilerFixture(
            {},
            { pagePendingIntentions: jest.fn().mockResolvedValue([intention(), intention({ executionId: 'execution-2' })]) },
        )

        const report = await reconciler.reconcile(100)

        expect(settlementService.settle).toHaveBeenCalledWith('execution-1', organizationId)
        expect(settlementService.settle).toHaveBeenCalledWith('execution-2', organizationId)
        expect(report).toEqual({ executionsChecked: 0, intentionsSettled: 2, cancellationsCleanedUp: 0 })
    })

    it('retries cleanup for a canceled execution a prior sweep left with a pending linked request', async () => {
        const { reconciler, requests, credits } = reconcilerFixture({
            pageCanceledPendingCleanup: jest.fn().mockResolvedValue([execution({ state: 'canceled' })]),
        })
        credits.getReservation.mockResolvedValue(reservation())

        const report = await reconciler.reconcile(100)

        expect(credits.getReservation).toHaveBeenCalledWith(organizationId, 'execution-1')
        expect(credits.release).toHaveBeenCalledWith(organizationId, 'execution-1')
        expect(requests.settleCanceled).toHaveBeenCalledWith('execution-1', organizationId)
        expect(report).toEqual({ executionsChecked: 0, intentionsSettled: 0, cancellationsCleanedUp: 1 })
    })

    it('skips releasing credits during a retried cleanup once the reservation is already gone', async () => {
        const { reconciler, requests, credits } = reconcilerFixture({
            pageCanceledPendingCleanup: jest.fn().mockResolvedValue([execution({ state: 'canceled' })]),
        })
        credits.getReservation.mockResolvedValue(null)

        await reconciler.reconcile(100)

        expect(credits.release).not.toHaveBeenCalled()
        expect(requests.settleCanceled).toHaveBeenCalledWith('execution-1', organizationId)
    })
})
