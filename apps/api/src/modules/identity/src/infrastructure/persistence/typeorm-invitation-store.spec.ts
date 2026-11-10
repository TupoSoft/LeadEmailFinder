import { DataSource, EntityManager } from 'typeorm'
import { AuthPrincipal } from '../../domain/auth-principal'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { OrganizationInvitation } from './organization-invitation.entity'
import { TypeOrmInvitationStore } from './typeorm-invitation-store'

function actorFixture(): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
    }
}

describe('TypeOrmInvitationStore', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'create' | 'insert' | 'findOne'>>
    let dataSourceMock: { transaction: jest.Mock; manager: typeof managerMock }
    let store: TypeOrmInvitationStore

    beforeEach(() => {
        managerMock = { save: jest.fn(), create: jest.fn(), insert: jest.fn(), findOne: jest.fn() }
        managerMock.create.mockImplementation((_entity, data) => data as never)
        managerMock.save.mockImplementation((_entity: unknown, data: any) => Promise.resolve({ id: 'invitation-1', ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
            manager: managerMock,
        }
        store = new TypeOrmInvitationStore(dataSourceMock as unknown as DataSource)
    })

    describe('issueWithAudit', () => {
        it('creates the invitation and its audit row atomically', async () => {
            const actor = actorFixture()

            const result = await store.issueWithAudit({
                organizationId: 'org-1',
                email: 'new@example.test',
                role: 'owner',
                tokenHash: 'hash-1',
                expiresAt: new Date(Date.now() + 60_000),
                actor,
            })

            expect(managerMock.create).toHaveBeenCalledWith(
                OrganizationInvitation,
                expect.objectContaining({ organizationId: 'org-1', email: 'new@example.test', role: 'owner' }),
            )
            expect(managerMock.insert).toHaveBeenCalledWith(
                AuditLogEntry,
                expect.objectContaining({ action: 'invitation.issued', organizationId: 'org-1' }),
            )
            expect(result).toEqual(expect.objectContaining({ id: 'invitation-1', email: 'new@example.test' }))
        })
    })

    describe('findByTokenHash', () => {
        it('returns the mapped record when found', async () => {
            managerMock.findOne.mockResolvedValue({
                id: 'invitation-1',
                organizationId: 'org-1',
                email: 'invitee@example.test',
                role: 'member',
                status: 'pending',
                expiresAt: new Date('2026-01-01T00:00:00Z'),
            })

            const result = await store.findByTokenHash('hash-1')

            expect(managerMock.findOne).toHaveBeenCalledWith(OrganizationInvitation, { where: { tokenHash: 'hash-1' } })
            expect(result).toEqual({
                id: 'invitation-1',
                organizationId: 'org-1',
                email: 'invitee@example.test',
                role: 'member',
                status: 'pending',
                expiresAt: new Date('2026-01-01T00:00:00Z'),
            })
        })

        it('returns undefined when not found', async () => {
            managerMock.findOne.mockResolvedValue(null)

            await expect(store.findByTokenHash('missing')).resolves.toBeUndefined()
        })
    })

    describe('recordAcceptanceFailure', () => {
        it('inserts a failure audit row using the invitation email as actor subject', async () => {
            const invitation: OrganizationInvitationRecord = {
                id: 'invitation-1',
                organizationId: 'org-1',
                email: 'invitee@example.test',
                role: 'owner',
                status: 'pending',
                expiresAt: new Date(),
            }

            await store.recordAcceptanceFailure(invitation, 'https://issuer')

            expect(managerMock.insert).toHaveBeenCalledWith(
                AuditLogEntry,
                expect.objectContaining({
                    action: 'invitation.accept_failed',
                    outcome: 'failure',
                    actorSubject: 'invitee@example.test',
                }),
            )
        })
    })
})
