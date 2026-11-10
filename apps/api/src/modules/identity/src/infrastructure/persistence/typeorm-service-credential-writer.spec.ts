import { DataSource, EntityManager } from 'typeorm'
import { AuthPrincipal } from '../../domain/auth-principal'
import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { ServiceCredential } from './service-credential.entity'
import { TypeOrmServiceCredentialWriter } from './typeorm-service-credential-writer'

function actorFixture(): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'owner',
        permissions: ['credentials:manage'],
        credentialId: 'identity-1',
    }
}

function credentialFixture(overrides: Partial<ServiceCredentialDetailRecord> = {}): ServiceCredentialDetailRecord {
    return {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'service-account-1',
        keyPrefix: 'lef-svc-1',
        description: 'CI integration',
        permissions: ['verification:run'],
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }
}

describe('TypeOrmServiceCredentialWriter', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'create' | 'save' | 'insert' | 'update' | 'findOneBy' | 'delete'>>
    let dataSourceMock: { transaction: jest.Mock }
    let writer: TypeOrmServiceCredentialWriter

    beforeEach(() => {
        managerMock = {
            create: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            findOneBy: jest.fn(),
            delete: jest.fn(),
        }
        managerMock.create.mockImplementation((_entity, data) => data as never)
        managerMock.save.mockImplementation((_entity: unknown, data: any) =>
            Promise.resolve({
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                ...data,
            }),
        )
        managerMock.update.mockResolvedValue({ affected: 1, generatedMaps: [], raw: [] })
        managerMock.findOneBy.mockResolvedValue(credentialFixture())
        managerMock.delete.mockResolvedValue({ affected: 1, raw: [] })
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        writer = new TypeOrmServiceCredentialWriter(dataSourceMock as unknown as DataSource)
    })

    it('creates an active credential and its audit entry in one transaction', async () => {
        const actor = actorFixture()

        const result = await writer.createWithAudit({
            id: 'sc-1',
            organizationId: 'org-1',
            issuer: 'https://issuer',
            subject: 'service-account-1',
            keyHash: 'a'.repeat(64),
            keyPrefix: 'lef-svc-1',
            description: 'CI integration',
            permissions: ['verification:run'],
            actor,
        })

        expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1)
        expect(managerMock.create).toHaveBeenCalledWith(
            ServiceCredential,
            expect.objectContaining({
                id: 'sc-1',
                organizationId: 'org-1',
                permissions: ['verification:run'],
                status: 'active',
            }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(AuditLogEntry, {
            organizationId: 'org-1',
            actorCredentialKind: 'human_session',
            actorIssuer: 'https://issuer',
            actorSubject: 'human-1',
            actorCredentialId: 'identity-1',
            action: 'service_client.created',
            targetType: 'service_credential',
            targetId: 'sc-1',
            outcome: 'success',
            metadata: { permissions: ['verification:run'] },
        })
        expect(result).toEqual(expect.objectContaining({ id: 'sc-1', status: 'active' }))
        expect(managerMock.save.mock.invocationCallOrder[0]).toBeLessThan(
            managerMock.insert.mock.invocationCallOrder[0],
        )
    })

    it('propagates a failed create audit so the transaction can roll back the credential', async () => {
        managerMock.insert.mockRejectedValueOnce(new Error('audit unavailable'))

        await expect(
            writer.createWithAudit({
                id: 'sc-1',
                organizationId: 'org-1',
                issuer: 'https://issuer',
                subject: 'service-account-1',
                keyHash: 'a'.repeat(64),
                keyPrefix: 'lef-svc-1',
                description: null,
                permissions: [],
                actor: actorFixture(),
            }),
        ).rejects.toThrow('audit unavailable')
    })

    it('updates only the active credential timestamp and records rotation atomically', async () => {
        const credential = credentialFixture()
        const rotatedAt = new Date('2026-01-02T00:00:00.000Z')
        managerMock.findOneBy.mockResolvedValueOnce({ ...credential, updatedAt: rotatedAt })

        const result = await writer.rotateWithAudit(credential, actorFixture(), {
            keyHash: 'b'.repeat(64),
            keyPrefix: 'lef_replaced',
        })

        expect(managerMock.update).toHaveBeenCalledWith(
            ServiceCredential,
            { id: 'sc-1', organizationId: 'org-1', status: 'active' },
            { keyHash: 'b'.repeat(64), keyPrefix: 'lef_replaced', updatedAt: expect.any(Function) },
        )
        expect(managerMock.save).not.toHaveBeenCalled()
        expect(managerMock.insert).toHaveBeenCalledWith(AuditLogEntry, {
            organizationId: 'org-1',
            actorCredentialKind: 'human_session',
            actorIssuer: 'https://issuer',
            actorSubject: 'human-1',
            actorCredentialId: 'identity-1',
            action: 'service_client.rotated',
            targetType: 'service_credential',
            targetId: 'sc-1',
            outcome: 'success',
        })
        expect(result).toEqual({ kind: 'rotated', credential: expect.objectContaining({ updatedAt: rotatedAt }) })
    })

    it('returns disabled when a concurrent disable wins the conditional rotation update', async () => {
        managerMock.update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
        managerMock.findOneBy.mockResolvedValueOnce(credentialFixture({ status: 'disabled' }))

        await expect(
            writer.rotateWithAudit(credentialFixture(), actorFixture(), {
                keyHash: 'b'.repeat(64),
                keyPrefix: 'lef_replaced',
            }),
        ).resolves.toEqual({
            kind: 'disabled',
        })
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('returns not found when the credential disappears before rotation persistence', async () => {
        managerMock.update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
        managerMock.findOneBy.mockResolvedValueOnce(null)

        await expect(
            writer.rotateWithAudit(credentialFixture(), actorFixture(), {
                keyHash: 'b'.repeat(64),
                keyPrefix: 'lef_replaced',
            }),
        ).resolves.toEqual({
            kind: 'not-found',
        })
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('returns already-disabled transactionally without duplicating the audit entry', async () => {
        managerMock.update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
        managerMock.findOneBy.mockResolvedValueOnce(credentialFixture({ status: 'disabled' }))

        const result = await writer.disableWithAudit(credentialFixture({ status: 'disabled' }), actorFixture())

        expect(result).toBe('already-disabled')
        expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1)
        expect(managerMock.save).not.toHaveBeenCalled()
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('disables an active credential with its audit entry without mutating the input record', async () => {
        const credential = credentialFixture()

        const result = await writer.disableWithAudit(credential, actorFixture())

        expect(result).toBe('disabled')
        expect(credential.status).toBe('active')
        expect(managerMock.update).toHaveBeenCalledWith(
            ServiceCredential,
            { id: 'sc-1', organizationId: 'org-1', status: 'active' },
            { status: 'disabled' },
        )
        expect(managerMock.insert).toHaveBeenCalledWith(AuditLogEntry, {
            organizationId: 'org-1',
            actorCredentialKind: 'human_session',
            actorIssuer: 'https://issuer',
            actorSubject: 'human-1',
            actorCredentialId: 'identity-1',
            action: 'service_client.disabled',
            targetType: 'service_credential',
            targetId: 'sc-1',
            outcome: 'success',
        })
    })

    it('returns not found when the credential disappears before disablement persistence', async () => {
        managerMock.update.mockResolvedValueOnce({ affected: 0, generatedMaps: [], raw: [] })
        managerMock.findOneBy.mockResolvedValueOnce(null)

        await expect(writer.disableWithAudit(credentialFixture(), actorFixture())).resolves.toBe('not-found')
        expect(managerMock.insert).not.toHaveBeenCalled()
    })

    it('deletes the credential before appending the success audit in one transaction', async () => {
        await expect(writer.deleteWithAudit(credentialFixture(), actorFixture())).resolves.toBe('deleted')

        expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1)
        expect(managerMock.delete).toHaveBeenCalledWith(ServiceCredential, {
            id: 'sc-1',
            organizationId: 'org-1',
        })
        expect(managerMock.insert).toHaveBeenCalledWith(AuditLogEntry, {
            organizationId: 'org-1',
            actorCredentialKind: 'human_session',
            actorIssuer: 'https://issuer',
            actorSubject: 'human-1',
            actorCredentialId: 'identity-1',
            action: 'service_client.deleted',
            targetType: 'service_credential',
            targetId: 'sc-1',
            outcome: 'success',
        })
        expect(managerMock.delete.mock.invocationCallOrder[0]).toBeLessThan(
            managerMock.insert.mock.invocationCallOrder[0],
        )
    })

    it('returns not found without auditing when the credential was already deleted', async () => {
        managerMock.delete.mockResolvedValueOnce({ affected: 0, raw: [] })

        await expect(writer.deleteWithAudit(credentialFixture(), actorFixture())).resolves.toBe('not-found')
        expect(managerMock.insert).not.toHaveBeenCalled()
    })
})
