import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { PurchaseRecord } from '../../domain/purchase-record'
import { PurchaseStatus } from '../../domain/purchase-status'
import {
    CreatePurchaseInput,
    PaidPurchase,
    PaidPurchaseCorrelation,
    PaymentPurchaseStore,
    PurchaseCurrencyMismatchError,
    PurchaseCorrelation,
    PurchaseProviderTotalConflictError,
    PurchaseReferenceConflictError,
} from '../../application/ports/payment-purchase-store'
import { CreditPurchase, CreditPurchaseStatus } from './typeorm/credit-purchase.entity'

interface ResolvedPurchase {
    purchase: CreditPurchase
    bound: boolean
}

@Injectable()
export class TypeOrmPaymentPurchaseStore implements PaymentPurchaseStore {
    constructor(private readonly dataSource: DataSource) {}

    async create(input: CreatePurchaseInput): Promise<PurchaseRecord> {
        const purchase = await this.dataSource.manager.save(
            CreditPurchase,
            this.dataSource.manager.create(CreditPurchase, {
                organizationId: input.organizationId,
                packId: input.packId,
                credits: input.credits,
                amountMinor: input.amountMinor,
                currency: input.currency,
                provider: input.provider,
                status: CreditPurchaseStatus.PENDING,
            }),
        )
        return toRecord(purchase)
    }

    async bindProviderReference(purchaseId: string, providerReference: string): Promise<PurchaseRecord> {
        const purchase = await this.dataSource.manager.findOneByOrFail(CreditPurchase, { id: purchaseId })
        purchase.providerReference = providerReference
        const saved = await this.dataSource.manager.save(CreditPurchase, purchase)
        return toRecord(saved)
    }

    async markFailed(purchaseId: string): Promise<void> {
        const purchase = await this.dataSource.manager.findOneByOrFail(CreditPurchase, { id: purchaseId })
        purchase.status = CreditPurchaseStatus.FAILED
        await this.dataSource.manager.save(CreditPurchase, purchase)
    }

    async listForOrganization(organizationId: string): Promise<PurchaseRecord[]> {
        const purchases = await this.dataSource.manager.find(CreditPurchase, {
            where: { organizationId },
            order: { createdAt: 'DESC' },
        })
        return purchases.map(toRecord)
    }

    recordPaid(correlation: PaidPurchaseCorrelation): Promise<PaidPurchase | null> {
        this.assertPositiveInteger(correlation.providerTotalMinor, 'providerTotalMinor')

        return this.dataSource.transaction(async manager => {
            const resolved = await this.resolvePurchase(manager, correlation)
            if (!resolved) return null

            const { purchase } = resolved
            if (purchase.currency !== correlation.currency) {
                throw new PurchaseCurrencyMismatchError(purchase.id, purchase.currency, correlation.currency)
            }
            if (
                purchase.providerTotalMinor != null &&
                purchase.providerTotalMinor !== correlation.providerTotalMinor
            ) {
                throw new PurchaseProviderTotalConflictError(
                    purchase.id,
                    purchase.providerTotalMinor,
                    correlation.providerTotalMinor,
                )
            }

            const statusChanged = purchase.status !== CreditPurchaseStatus.PAID
            if (statusChanged) purchase.status = CreditPurchaseStatus.PAID
            const providerTotalChanged = purchase.providerTotalMinor == null
            if (providerTotalChanged) purchase.providerTotalMinor = correlation.providerTotalMinor

            if (resolved.bound || statusChanged || providerTotalChanged) {
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

    recordCreditsGranted(purchaseId: string): Promise<void> {
        return this.dataSource.transaction(async manager => {
            const purchase = await manager.findOne(CreditPurchase, {
                where: { id: purchaseId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!purchase) throw new Error(`Unknown paid purchase: ${purchaseId}`)
            if (purchase.status !== CreditPurchaseStatus.PAID) {
                throw new Error(`Cannot complete the credit grant for unpaid purchase: ${purchaseId}`)
            }
            if (purchase.creditsGrantedAt) return

            purchase.creditsGrantedAt = new Date()
            await manager.save(CreditPurchase, purchase)
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

    private assertPositiveInteger(value: number, field: string): void {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error(`Paid purchase ${field} must be a positive safe integer`)
        }
    }
}

function toRecord(purchase: CreditPurchase): PurchaseRecord {
    return {
        id: purchase.id,
        organizationId: purchase.organizationId,
        packId: purchase.packId,
        credits: purchase.credits,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        provider: purchase.provider,
        providerReference: purchase.providerReference ?? null,
        providerTotalMinor: purchase.providerTotalMinor ?? null,
        status: purchase.status as PurchaseStatus,
        creditsGrantedAt: purchase.creditsGrantedAt ?? null,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt,
    }
}
