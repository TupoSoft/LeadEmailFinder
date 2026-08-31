import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm'
import { Domain } from './domain/domain.entity'
import { Email } from './email/email.entity'
import { SmtpVerification } from './email-verifier/smtp/smtp-verification.entity'
import { EmailVerification } from './sync-email-verification/email-verification.entity'

class MetadataDataSource extends DataSource {
    constructor(options: DataSourceOptions) {
        super(options)
    }

    async buildEntityMetadata(): Promise<void> {
        await this.buildMetadatas()
    }
}

describe('organization-owned verification entities', () => {
    const metadata = getMetadataArgsStorage()

    it.each([Email, SmtpVerification])('uses organization and normalized address as the identity for %p', entity => {
        const primaryColumns = metadata.columns
            .filter(column => column.target === entity && column.options.primary)
            .map(column => column.propertyName)

        expect(primaryColumns).toEqual(['organizationId', 'id'])
        expect(
            metadata.columns.find(column => column.target === entity && column.propertyName === 'organizationId')
                ?.options,
        ).toEqual(expect.objectContaining({ type: 'uuid' }))
    })

    it('requires organization ownership on every verification result', () => {
        const organizationId = metadata.columns.find(
            column => column.target === EmailVerification && column.propertyName === 'organizationId',
        )

        expect(organizationId?.options).toEqual(expect.objectContaining({ type: 'uuid' }))
        expect(organizationId?.options.nullable).not.toBe(true)
    })

    it.each([
        [EmailVerification, ['organizationId', 'email', 'createdAt']],
        [EmailVerification, ['organizationId', 'batchId']],
        [Email, ['organizationId', 'updatedAt']],
        [SmtpVerification, ['organizationId', 'updatedAt']],
    ])('indexes %p by %p', (entity, expectedColumns) => {
        const indexes = metadata.indices
            .filter(index => index.target === entity)
            .map(index => index.columns)

        expect(indexes).toContainEqual(expectedColumns)
    })

    it('stores SMTP cache lifecycle timestamps as absolute instants', () => {
        const createdAt = metadata.columns.find(
            column => column.target === SmtpVerification && column.propertyName === 'createdAt',
        )
        const updatedAt = metadata.columns.find(
            column => column.target === SmtpVerification && column.propertyName === 'updatedAt',
        )

        expect(createdAt).toEqual(expect.objectContaining({ mode: 'createDate' }))
        expect(createdAt?.options).toEqual(expect.objectContaining({ type: 'timestamptz' }))
        expect(updatedAt).toEqual(expect.objectContaining({ mode: 'updateDate' }))
        expect(updatedAt?.options).toEqual(expect.objectContaining({ type: 'timestamptz' }))
    })

    it('keeps shared domain policy free of organization-owned fields', () => {
        expect(
            metadata.columns.find(column => column.target === Domain && column.propertyName === 'organizationId'),
        ).toBeUndefined()
    })

    it('builds complete TypeORM metadata without a database connection', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            entities: [Domain, Email, EmailVerification, SmtpVerification],
        })

        await expect(dataSource.buildEntityMetadata()).resolves.toBeUndefined()
        expect(dataSource.entityMetadatas).toHaveLength(4)
    })
})
