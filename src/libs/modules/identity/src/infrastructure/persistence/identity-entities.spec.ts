import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm'
import { AUTH_ROLES } from '../../domain/auth-principal'
import { AuditLogEntry } from './audit-log-entry.entity'
import { CreditDebit } from './credit-debit.entity'
import { CreditGrant } from './credit-grant.entity'
import { CreditReservation } from './credit-reservation.entity'
import { ExternalIdentity } from './external-identity.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { OrganizationInvitation } from './organization-invitation.entity'
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
        [CreditGrant, 'credit_grants'],
        [CreditReservation, 'credit_reservations'],
        [OrganizationInvitation, 'organization_invitations'],
        [AuditLogEntry, 'audit_log_entries'],
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

    it('uniquely identifies a service credential by issuer and Keycloak client id', () => {
        const uniqueIndex = metadata.indices.find(
            index =>
                index.target === ServiceCredential && index.name === 'UQ_service_credentials_issuer_keycloak_client_id',
        )

        expect(uniqueIndex?.columns).toEqual(['issuer', 'keycloakClientId'])
    })

    it('uses one non-negative credit account per organization, with reserved bounded by balance', () => {
        const primaryColumn = metadata.columns.find(
            column => column.target === OrganizationCreditAccount && column.propertyName === 'organizationId',
        )
        const checks = metadata.checks.filter(check => check.target === OrganizationCreditAccount)

        expect(primaryColumn?.options.primary).toBe(true)
        expect(checks.map(check => check.expression)).toEqual(
            expect.arrayContaining(['"balance" >= 0', '"reserved" >= 0 AND "reserved" <= "balance"']),
        )
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

    it('uniquely identifies a credit grant by organization and reference, so retrying a reference is a no-op', () => {
        const organizationIdColumn = metadata.columns.find(
            column => column.target === CreditGrant && column.propertyName === 'organizationId',
        )
        const referenceColumn = metadata.columns.find(
            column => column.target === CreditGrant && column.propertyName === 'reference',
        )

        expect(organizationIdColumn?.options.primary).toBe(true)
        expect(referenceColumn?.options.primary).toBe(true)
    })

    it('uniquely identifies a credit reservation by organization and operation, and requires a positive amount', () => {
        const organizationIdColumn = metadata.columns.find(
            column => column.target === CreditReservation && column.propertyName === 'organizationId',
        )
        const operationIdColumn = metadata.columns.find(
            column => column.target === CreditReservation && column.propertyName === 'operationId',
        )
        const check = metadata.checks.find(entry => entry.target === CreditReservation)

        expect(organizationIdColumn?.options.primary).toBe(true)
        expect(operationIdColumn?.options.primary).toBe(true)
        expect(check?.expression).toBe('"amount" > 0')
    })

    it('uniquely identifies an organization invitation by its token hash', () => {
        const uniqueIndex = metadata.indices.find(index => index.target === OrganizationInvitation && index.unique)

        expect(uniqueIndex?.columns).toEqual(['tokenHash'])
    })

    it('stores exactly one supported role on each organization invitation', () => {
        const role = metadata.columns.find(
            column => column.target === OrganizationInvitation && column.propertyName === 'role',
        )

        expect(role?.options).toEqual(expect.objectContaining({ enum: AUTH_ROLES }))
        expect(role?.options.array).not.toBe(true)
    })

    it('binds each audit log entry to one required organization', () => {
        const organizationRelation = metadata.relations.find(
            relation => relation.target === AuditLogEntry && relation.propertyName === 'organization',
        )

        expect(organizationRelation?.options).toEqual(expect.objectContaining({ nullable: false }))
    })

    it('never updates an audit log entry once written', () => {
        const updatedAtColumn = metadata.columns.find(
            column => column.target === AuditLogEntry && column.propertyName === 'updatedAt',
        )

        expect(updatedAtColumn).toBeUndefined()
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
                CreditGrant,
                CreditReservation,
                OrganizationInvitation,
                AuditLogEntry,
            ],
        })

        await expect(dataSource.buildEntityMetadata()).resolves.toBeUndefined()
        expect(dataSource.entityMetadatas).toHaveLength(10)
    })
})
