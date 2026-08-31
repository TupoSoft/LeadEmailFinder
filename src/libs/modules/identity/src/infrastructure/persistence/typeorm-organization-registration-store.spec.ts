import { DataSource, EntityManager } from 'typeorm'
import { AuthPrincipal } from '../../domain/auth-principal'
import { AuditLogEntry } from './audit-log-entry.entity'
import { Organization } from './organization.entity'
import { OrganizationInvitation } from './organization-invitation.entity'
import { TypeOrmOrganizationRegistrationStore } from './typeorm-organization-registration-store'

function actorFixture(): AuthPrincipal {
    return {
        credentialKind: 'service_client',
        issuer: 'https://issuer',
        subject: 'service-account-1',
        organizationId: 'platform-org',
        membershipRole: 'platform_admin',
        permissions: ['platform:admin'],
        credentialId: 'credential-1',
    }
}

describe('TypeOrmOrganizationRegistrationStore', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'create' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let store: TypeOrmOrganizationRegistrationStore

    beforeEach(() => {
        managerMock = { save: jest.fn(), create: jest.fn(), insert: jest.fn() }
        managerMock.create.mockImplementation((_entity, data) => data as never)
        managerMock.save.mockImplementation((_entity: unknown, data: any) => Promise.resolve({ id: 'generated-id', ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        store = new TypeOrmOrganizationRegistrationStore(dataSourceMock as unknown as DataSource)
    })

    it('creates the organization and a pending owner invitation atomically with both audit rows', async () => {
        const actor = actorFixture()
        const expiresAt = new Date(Date.now() + 60_000)

        const result = await store.createWithOwnerInvitation({
            name: 'Acme',
            ownerEmail: 'owner@example.test',
            tokenHash: 'hash-1',
            expiresAt,
            actor,
        })

        expect(managerMock.create).toHaveBeenCalledWith(Organization, { name: 'Acme' })
        expect(managerMock.create).toHaveBeenCalledWith(
            OrganizationInvitation,
            expect.objectContaining({
                email: 'owner@example.test',
                role: 'owner',
                tokenHash: 'hash-1',
                status: 'pending',
                invitedByCredentialKind: actor.credentialKind,
                invitedByIssuer: actor.issuer,
                invitedBySubject: actor.subject,
                invitedByCredentialId: actor.credentialId,
            }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'organization.created', targetType: 'organization' }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'invitation.issued', targetType: 'invitation' }),
        )
        expect(result.organization).toEqual({ id: 'generated-id', name: 'Acme' })
        expect(result.invitation).toEqual(
            expect.objectContaining({ email: 'owner@example.test', role: 'owner', status: 'pending' }),
        )
    })
})
