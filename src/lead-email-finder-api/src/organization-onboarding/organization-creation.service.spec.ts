import { DataSource, EntityManager } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, Organization, OrganizationInvitation } from '@tuposoft/lead-email-finder/modules/identity'
import { OrganizationCreationService } from './organization-creation.service'

function principalFixture(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'service_client',
        issuer: 'https://issuer',
        subject: 'service-account-1',
        organizationId: 'platform-org',
        membershipRole: 'platform_admin',
        permissions: ['platform:admin'],
        credentialId: 'credential-1',
        ...overrides,
    }
}

describe('OrganizationCreationService', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'create' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let service: OrganizationCreationService

    beforeEach(() => {
        managerMock = {
            save: jest.fn(),
            create: jest.fn(),
            insert: jest.fn(),
        }
        managerMock.create.mockImplementation((entity, data) => data as never)
        managerMock.save.mockImplementation((entity: any, data: any) => Promise.resolve({ id: 'generated-id', ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        service = new OrganizationCreationService(dataSourceMock as unknown as DataSource)
    })

    it('creates the organization and a pending owner invitation with a fresh, unique-looking token', async () => {
        const actor = principalFixture()

        const result = await service.createWithFirstOwner(actor, 'Acme', 'Owner@Example.test')

        expect(managerMock.create).toHaveBeenCalledWith(Organization, { name: 'Acme' })
        expect(managerMock.create).toHaveBeenCalledWith(
            OrganizationInvitation,
            expect.objectContaining({
                email: 'owner@example.test',
                role: 'owner',
                status: 'pending',
                invitedByCredentialKind: actor.credentialKind,
                invitedByIssuer: actor.issuer,
                invitedBySubject: actor.subject,
                invitedByCredentialId: actor.credentialId,
            }),
        )
        expect(result.rawToken).toEqual(expect.any(String))
        expect(result.rawToken.length).toBeGreaterThan(16)
    })

    it('never stores the raw token — only its hash is passed to the invitation row', async () => {
        const actor = principalFixture()

        const result = await service.createWithFirstOwner(actor, 'Acme', 'owner@example.test')

        const invitationCall = managerMock.create.mock.calls.find(call => call[0] === OrganizationInvitation)
        const storedInvitation = invitationCall?.[1] as unknown as { tokenHash: string }
        expect(storedInvitation.tokenHash).not.toBe(result.rawToken)
        expect(storedInvitation.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('sets the invitation to expire 72 hours from now', async () => {
        const before = Date.now()

        await service.createWithFirstOwner(principalFixture(), 'Acme', 'owner@example.test')

        const invitationCall = managerMock.create.mock.calls.find(call => call[0] === OrganizationInvitation)
        const storedInvitation = invitationCall?.[1] as unknown as { expiresAt: Date }
        const deltaMs = storedInvitation.expiresAt.getTime() - before
        expect(deltaMs).toBeGreaterThan(72 * 60 * 60 * 1000 - 5000)
        expect(deltaMs).toBeLessThanOrEqual(72 * 60 * 60 * 1000 + 5000)
    })

    it('writes audit rows for both organization creation and invitation issuance', async () => {
        await service.createWithFirstOwner(principalFixture(), 'Acme', 'owner@example.test')

        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'organization.created', targetType: 'organization' }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'invitation.issued', targetType: 'invitation' }),
        )
    })
})
