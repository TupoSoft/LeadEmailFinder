import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm'
import { AUTH_ROLES } from '../../domain/auth-principal'
import { CreditDebit } from './credit-debit.entity'
import { ExternalIdentity } from './external-identity.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { OrganizationMembership } from './membership.entity'
import { Organization } from './organization.entity'
import { ServiceCredential } from './service-credential.entity'

class MetadataDataSource extends DataSource {
    constructor(options: DataSourceOptions) {
        super(options)
    }

    async buildEntityMetadata(): Promise<void> {
        await this.buildMetadatas()
    }
}

describe('identity and organization entities', () => {
    const metadata = getMetadataArgsStorage()

    it.each([
        [Organization, 'organizations'],
        [ExternalIdentity, 'external_identities'],
        [OrganizationMembership, 'organization_memberships'],
        [ServiceCredential, 'service_credentials'],
        [OrganizationCreditAccount, 'organization_credit_accounts'],
        [CreditDebit, 'credit_debits'],
    ])('maps %p to %s', (entity, tableName) => {
        expect(metadata.tables.find(table => table.target === entity)?.name).toBe(tableName)
    })

    it('uniquely identifies an external identity by issuer and subject', () => {
        const uniqueIndex = metadata.indices.find(index => index.target === ExternalIdentity && index.unique)

        expect(uniqueIndex?.columns).toEqual(['issuer', 'subject'])
    })

    it('binds each service credential to one required organization', () => {
        const organizationId = metadata.columns.find(
            column => column.target === ServiceCredential && column.propertyName === 'organizationId',
        )
        const organizationRelation = metadata.relations.find(
            relation => relation.target === ServiceCredential && relation.propertyName === 'organization',
        )

        expect(organizationId?.options).toEqual(expect.objectContaining({ type: 'uuid' }))
        expect(organizationRelation?.options).toEqual(expect.objectContaining({ nullable: false }))
    })

    it('stores exactly one supported role on each membership', () => {
        const role = metadata.columns.find(
            column => column.target === OrganizationMembership && column.propertyName === 'role',
        )

        expect(role?.options).toEqual(expect.objectContaining({ enum: AUTH_ROLES }))
        expect(role?.options.array).not.toBe(true)
    })

    it('stores only supported permissions on service credentials', () => {
        const permissions = metadata.columns.find(
            column => column.target === ServiceCredential && column.propertyName === 'permissions',
        )

        expect(permissions?.options).toEqual(expect.objectContaining({ enumName: 'auth_permission', array: true }))
    })

    it('uses one non-negative credit account per organization', () => {
        const primaryColumn = metadata.columns.find(
            column => column.target === OrganizationCreditAccount && column.propertyName === 'organizationId',
        )
        const balanceCheck = metadata.checks.find(check => check.target === OrganizationCreditAccount)

        expect(primaryColumn?.options.primary).toBe(true)
        expect(balanceCheck?.expression).toBe('"balance" >= 0')
    })

    it('uniquely identifies a credit debit by organization and reference, so retrying a reference is a no-op', () => {
        const organizationIdColumn = metadata.columns.find(
            column => column.target === CreditDebit && column.propertyName === 'organizationId',
        )
        const referenceColumn = metadata.columns.find(
            column => column.target === CreditDebit && column.propertyName === 'reference',
        )

        expect(organizationIdColumn?.options.primary).toBe(true)
        expect(referenceColumn?.options.primary).toBe(true)
    })

    it('builds complete TypeORM metadata without a database connection', async () => {
        const dataSource = new MetadataDataSource({
            type: 'postgres',
            entities: [
                Organization,
                ExternalIdentity,
                OrganizationMembership,
                ServiceCredential,
                OrganizationCreditAccount,
                CreditDebit,
            ],
        })

        await expect(dataSource.buildEntityMetadata()).resolves.toBeUndefined()
        expect(dataSource.entityMetadatas).toHaveLength(6)
    })
})
