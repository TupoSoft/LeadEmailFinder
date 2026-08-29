import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    CreditPurchaseAdjustment,
    CreditPurchaseAdjustmentDirection,
    CreditPurchaseAdjustmentState,
} from '../credit-purchase-adjustment.entity'
import { CreditPurchase, CreditPurchaseStatus } from '../credit-purchase.entity'
import {
    calculatePaymentAdjustmentClaim,
    PaymentAdjustmentAccountingRecord,
} from '../payment-adjustment-accounting'
import {
    ClaimedPaymentAdjustment,
    PaymentAdjustmentClaimInput,
    PaymentAdjustmentCurrencyMismatchError,
    PaymentAdjustmentDirection,
    PaymentAdjustmentDirectionInProgressError,
    PaymentAdjustmentPurchaseNotReadyError,
    PaymentAdjustmentReplayConflictError,
    PaymentAdjustmentStore,
} from '../payment-adjustment.store'

@Injectable()
export class TypeOrmPaymentAdjustmentStore implements PaymentAdjustmentStore {
    constructor(private readonly dataSource: DataSource) {}

    claim(input: PaymentAdjustmentClaimInput): Promise<ClaimedPaymentAdjustment | null> {
        return this.dataSource.transaction(async manager => {
            const purchase = await manager.findOne(CreditPurchase, {
                where: { providerReference: input.providerReference },
                lock: { mode: 'pessimistic_write' },
            })
            if (!purchase) return null

            if (purchase.status !== CreditPurchaseStatus.PAID || !purchase.creditsGrantedAt) {
                throw new PaymentAdjustmentPurchaseNotReadyError(input.providerReference)
            }
            if (purchase.currency !== input.currency) {
                throw new PaymentAdjustmentCurrencyMismatchError(
                    input.providerAdjustmentId,
                    purchase.currency,
                    input.currency,
                )
            }

            const existing = await manager.findOne(CreditPurchaseAdjustment, {
                where: { providerAdjustmentId: input.providerAdjustmentId },
                lock: { mode: 'pessimistic_write' },
            })
            if (existing) {
                this.assertMatchingReplay(existing, purchase.id, input)
                return this.toClaim(existing, purchase.organizationId)
            }

            const adjustments = await manager.find(CreditPurchaseAdjustment, {
                where: { purchaseId: purchase.id },
                order: { createdAt: 'ASC', providerAdjustmentId: 'ASC' },
            })
            const entityDirection = this.toEntityDirection(input.direction)
            const oppositeDirection =
                entityDirection === CreditPurchaseAdjustmentDirection.DEBIT
                    ? CreditPurchaseAdjustmentDirection.RESTORE
                    : CreditPurchaseAdjustmentDirection.DEBIT
            if (
                adjustments.some(
                    adjustment =>
                        adjustment.direction === oppositeDirection &&
                        adjustment.state === CreditPurchaseAdjustmentState.CLAIMED,
                )
            ) {
                throw new PaymentAdjustmentDirectionInProgressError(input.providerReference)
            }

            const accountingRecords = adjustments.map(candidate => this.toAccountingRecord(candidate))
            const accounting = calculatePaymentAdjustmentClaim(
                { amountMinor: purchase.amountMinor, credits: purchase.credits },
                accountingRecords,
                input.direction,
                input.amountMinor,
            )
            const adjustment = Object.assign(new CreditPurchaseAdjustment(), {
                providerAdjustmentId: input.providerAdjustmentId,
                purchaseId: purchase.id,
                providerEventId: input.providerEventId,
                direction: entityDirection,
                amountMinor: input.amountMinor,
                effectiveAmountMinor: accounting.effectiveAmountMinor,
                currency: input.currency,
                requestedCredits: accounting.requestedCredits,
                operationCredits: accounting.operationCredits,
                appliedDebit: 0,
                restoredCredits: 0,
                originalShortfallCredits: 0,
                shortfallCredits: 0,
                shortfallClearedCredits: accounting.shortfallClearedCredits,
                state: CreditPurchaseAdjustmentState.CLAIMED,
            })

            if (accounting.shortfallUpdates.length > 0) {
                const updatedIds = new Set(accounting.shortfallUpdates.map(update => update.providerAdjustmentId))
                const remainingById = new Map(
                    accounting.shortfallUpdates.map(update => [
                        update.providerAdjustmentId,
                        update.remainingShortfallCredits,
                    ]),
                )
                const changedDebits = adjustments.filter(candidate => updatedIds.has(candidate.providerAdjustmentId))
                for (const debit of changedDebits) {
                    debit.shortfallCredits = remainingById.get(debit.providerAdjustmentId)!
                }
                await manager.save(CreditPurchaseAdjustment, changedDebits)
            }

            await manager.save(CreditPurchaseAdjustment, adjustment)
            return this.toClaim(adjustment, purchase.organizationId)
        })
    }

    complete(providerAdjustmentId: string, appliedCredits: number): Promise<void> {
        this.assertNonNegativeInteger(appliedCredits, 'appliedCredits')

        return this.dataSource.transaction(async manager => {
            const preview = await manager.findOneBy(CreditPurchaseAdjustment, { providerAdjustmentId })
            if (!preview) throw new Error(`Unknown payment adjustment: ${providerAdjustmentId}`)

            const purchase = await manager.findOne(CreditPurchase, {
                where: { id: preview.purchaseId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!purchase) throw new Error(`Unknown payment adjustment purchase: ${preview.purchaseId}`)

            const adjustment = await manager.findOne(CreditPurchaseAdjustment, {
                where: { providerAdjustmentId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!adjustment) throw new Error(`Unknown payment adjustment: ${providerAdjustmentId}`)

            if (adjustment.state === CreditPurchaseAdjustmentState.COMPLETED) {
                const recorded =
                    adjustment.direction === CreditPurchaseAdjustmentDirection.DEBIT
                        ? adjustment.appliedDebit
                        : adjustment.restoredCredits
                if (recorded !== appliedCredits) {
                    throw new PaymentAdjustmentReplayConflictError(providerAdjustmentId)
                }
                return
            }

            if (appliedCredits > adjustment.operationCredits) {
                throw new Error(`Payment adjustment ${providerAdjustmentId} applied more credits than claimed`)
            }

            if (adjustment.direction === CreditPurchaseAdjustmentDirection.DEBIT) {
                adjustment.appliedDebit = appliedCredits
                adjustment.originalShortfallCredits = adjustment.requestedCredits - appliedCredits
                adjustment.shortfallCredits = adjustment.originalShortfallCredits
            } else {
                if (appliedCredits !== adjustment.operationCredits) {
                    throw new Error(`Payment adjustment ${providerAdjustmentId} did not restore its claimed credits`)
                }
                adjustment.restoredCredits = appliedCredits
            }

            adjustment.state = CreditPurchaseAdjustmentState.COMPLETED
            await manager.save(CreditPurchaseAdjustment, adjustment)
        })
    }

    private assertMatchingReplay(
        existing: CreditPurchaseAdjustment,
        purchaseId: string,
        input: PaymentAdjustmentClaimInput,
    ): void {
        if (
            existing.purchaseId !== purchaseId ||
            existing.direction !== this.toEntityDirection(input.direction) ||
            existing.amountMinor !== input.amountMinor ||
            existing.currency !== input.currency
        ) {
            throw new PaymentAdjustmentReplayConflictError(input.providerAdjustmentId)
        }
    }

    private toClaim(
        adjustment: CreditPurchaseAdjustment,
        organizationId: string,
    ): ClaimedPaymentAdjustment {
        const direction =
            adjustment.direction === CreditPurchaseAdjustmentDirection.DEBIT
                ? PaymentAdjustmentDirection.DEBIT
                : PaymentAdjustmentDirection.RESTORE
        return {
            providerAdjustmentId: adjustment.providerAdjustmentId,
            organizationId,
            direction,
            operationCredits: adjustment.operationCredits,
            ledgerReference: `payment-adjustment:${adjustment.providerAdjustmentId}:${direction}`,
            completed: adjustment.state === CreditPurchaseAdjustmentState.COMPLETED,
        }
    }

    private toEntityDirection(direction: PaymentAdjustmentDirection): CreditPurchaseAdjustmentDirection {
        return direction === PaymentAdjustmentDirection.DEBIT
            ? CreditPurchaseAdjustmentDirection.DEBIT
            : CreditPurchaseAdjustmentDirection.RESTORE
    }

    private toAccountingRecord(adjustment: CreditPurchaseAdjustment): PaymentAdjustmentAccountingRecord {
        return {
            providerAdjustmentId: adjustment.providerAdjustmentId,
            direction:
                adjustment.direction === CreditPurchaseAdjustmentDirection.DEBIT
                    ? PaymentAdjustmentDirection.DEBIT
                    : PaymentAdjustmentDirection.RESTORE,
            amountMinor: adjustment.amountMinor,
            operationCredits: adjustment.operationCredits,
            appliedDebit: adjustment.appliedDebit,
            shortfallCredits: adjustment.shortfallCredits,
        }
    }

    private assertNonNegativeInteger(value: number, field: string): void {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Payment adjustment ${field} must be a non-negative safe integer`)
        }
    }
}
