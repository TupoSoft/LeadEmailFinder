import { getMetadataArgsStorage } from 'typeorm'
import { CreditPurchase } from './credit-purchase.entity'

describe('CreditPurchase', () => {
    it('keeps provider references unique and organization history indexed', () => {
        const metadata = getMetadataArgsStorage()
        const providerReference = metadata.columns.find(
            column => column.target === CreditPurchase && column.propertyName === 'providerReference',
        )
        const organizationIndex = metadata.indices.find(index => {
            return (
                index.target === CreditPurchase &&
                Array.isArray(index.columns) &&
                index.columns.includes('organizationId')
            )
        })
        const creditsGrantedAt = metadata.columns.find(
            column => column.target === CreditPurchase && column.propertyName === 'creditsGrantedAt',
        )
        const providerTotalMinor = metadata.columns.find(
            column => column.target === CreditPurchase && column.propertyName === 'providerTotalMinor',
        )
        const providerTotalCheck = metadata.checks.find(
            check => check.target === CreditPurchase && check.name === 'CHK_credit_purchases_provider_total_positive',
        )

        expect(providerReference?.options).toMatchObject({ type: 'varchar', nullable: true, unique: true })
        expect(organizationIndex).toBeDefined()
        expect(creditsGrantedAt?.options).toMatchObject({ type: 'timestamptz', nullable: true })
        expect(providerTotalMinor?.options).toMatchObject({ type: 'int', nullable: true })
        expect(providerTotalCheck?.expression).toContain('"providerTotalMinor" > 0')
    })
})
