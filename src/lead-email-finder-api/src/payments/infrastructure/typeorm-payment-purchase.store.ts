import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CreditPurchase, CreditPurchaseStatus } from '../credit-purchase.entity'
import { PaidPurchase, PaymentPurchaseStore } from '../payment-purchase.store'

@Injectable()
export class TypeOrmPaymentPurchaseStore implements PaymentPurchaseStore {
    constructor(private readonly dataSource: DataSource) {}

    recordPaid(providerReference: string): Promise<PaidPurchase | null> {
        return this.dataSource.transaction(async manager => {
            const purchase = await manager.findOne(CreditPurchase, {
                where: { providerReference },
                lock: { mode: 'pessimistic_write' },
            })

            if (!purchase) return null

            if (purchase.status !== CreditPurchaseStatus.PAID) {
                purchase.status = CreditPurchaseStatus.PAID
                await manager.save(CreditPurchase, purchase)
            }

            return {
                id: purchase.id,
                organizationId: purchase.organizationId,
                credits: purchase.credits,
            }
        })
    }

    recordFailed(providerReference: string): Promise<boolean> {
        return this.dataSource.transaction(async manager => {
            const purchase = await manager.findOne(CreditPurchase, {
                where: { providerReference },
                lock: { mode: 'pessimistic_write' },
            })

            if (!purchase) return false

            if (purchase.status === CreditPurchaseStatus.PENDING) {
                purchase.status = CreditPurchaseStatus.FAILED
                await manager.save(CreditPurchase, purchase)
            }

            return true
        })
    }
}
