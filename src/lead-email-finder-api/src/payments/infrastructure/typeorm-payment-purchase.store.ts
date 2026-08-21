import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { CreditPurchase, CreditPurchaseStatus } from '../credit-purchase.entity'
import {
    PaidPurchase,
    PaymentPurchaseStore,
    PurchaseCorrelation,
    PurchaseReferenceConflictError,
} from '../payment-purchase.store'

interface ResolvedPurchase {
    purchase: CreditPurchase
    bound: boolean
}

@Injectable()
export class TypeOrmPaymentPurchaseStore implements PaymentPurchaseStore {
    constructor(private readonly dataSource: DataSource) {}

    recordPaid(correlation: PurchaseCorrelation): Promise<PaidPurchase | null> {
        return this.dataSource.transaction(async manager => {
            const resolved = await this.resolvePurchase(manager, correlation)
            if (!resolved) return null

            const { purchase } = resolved
            const statusChanged = purchase.status !== CreditPurchaseStatus.PAID
            if (statusChanged) purchase.status = CreditPurchaseStatus.PAID

            if (resolved.bound || statusChanged) {
                await manager.save(CreditPurchase, purchase)
            }

            return {
                id: purchase.id,
                organizationId: purchase.organizationId,
                credits: purchase.credits,
            }
        })
    }

    recordFailed(correlation: PurchaseCorrelation): Promise<boolean> {
        return this.dataSource.transaction(async manager => {
            const resolved = await this.resolvePurchase(manager, correlation)
            if (!resolved) return false

            const { purchase } = resolved
            const statusChanged = purchase.status === CreditPurchaseStatus.PENDING
            if (statusChanged) purchase.status = CreditPurchaseStatus.FAILED

            if (resolved.bound || statusChanged) {
                await manager.save(CreditPurchase, purchase)
            }

            return true
        })
    }

    // Resolves by provider reference first; a purchase ID is only a fallback for a completion event
    // that arrives before checkout creation persists the reference, and never overrides an established one.
    private async resolvePurchase(
        manager: EntityManager,
        { providerReference, purchaseId }: PurchaseCorrelation,
    ): Promise<ResolvedPurchase | null> {
        const byReference = await manager.findOne(CreditPurchase, {
            where: { providerReference },
            lock: { mode: 'pessimistic_write' },
        })
        if (byReference) return { purchase: byReference, bound: false }

        if (purchaseId === undefined) return null

        const byId = await manager.findOne(CreditPurchase, {
            where: { id: purchaseId },
            lock: { mode: 'pessimistic_write' },
        })
        if (!byId) return null

        if (byId.providerReference === providerReference) return { purchase: byId, bound: false }

        if (byId.providerReference != null) {
            throw new PurchaseReferenceConflictError(purchaseId, byId.providerReference)
        }

        byId.providerReference = providerReference
        return { purchase: byId, bound: true }
    }
}
