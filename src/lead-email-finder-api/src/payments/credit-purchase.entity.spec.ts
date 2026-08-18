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

        expect(providerReference?.options).toMatchObject({ type: 'varchar', nullable: true, unique: true })
        expect(organizationIndex).toBeDefined()
    })
})
