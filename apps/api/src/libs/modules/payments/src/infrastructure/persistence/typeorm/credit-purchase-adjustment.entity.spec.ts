import { getMetadataArgsStorage } from 'typeorm'
import {
    CreditPurchaseAdjustment,
    CreditPurchaseAdjustmentDirection,
    CreditPurchaseAdjustmentState,
} from './credit-purchase-adjustment.entity'

describe('CreditPurchaseAdjustment', () => {
    const metadata = getMetadataArgsStorage()

    it('uses the provider adjustment id as the durable replay key', () => {
        const table = metadata.tables.find(candidate => candidate.target === CreditPurchaseAdjustment)
        const providerAdjustmentId = metadata.columns.find(
            column =>
                column.target === CreditPurchaseAdjustment && column.propertyName === 'providerAdjustmentId',
        )
        const purchaseIndex = metadata.indices.find(
            index =>
                index.target === CreditPurchaseAdjustment &&
                Array.isArray(index.columns) &&
                index.columns.includes('purchaseId'),
        )

        expect(table?.name).toBe('credit_purchase_adjustments')
        expect(providerAdjustmentId?.options.primary).toBe(true)
        expect(purchaseIndex).toBeDefined()
    })

    it('stores constrained direction, state, and nonnegative accounting values', () => {
        const direction = metadata.columns.find(
            column => column.target === CreditPurchaseAdjustment && column.propertyName === 'direction',
        )
        const state = metadata.columns.find(
            column => column.target === CreditPurchaseAdjustment && column.propertyName === 'state',
        )
        const isFull = metadata.columns.find(
            column => column.target === CreditPurchaseAdjustment && column.propertyName === 'isFull',
        )
        const check = metadata.checks.find(candidate => candidate.target === CreditPurchaseAdjustment)

        expect(direction?.options.enum).toBe(CreditPurchaseAdjustmentDirection)
        expect(state?.options.enum).toBe(CreditPurchaseAdjustmentState)
        expect(isFull).toBeDefined()
        expect(check?.expression).toContain('"shortfallCredits" >= 0')
        expect(check?.expression).toContain('"originalShortfallCredits" >= 0')
    })
})
