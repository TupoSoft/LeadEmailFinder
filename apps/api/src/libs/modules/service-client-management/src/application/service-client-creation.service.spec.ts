import {
    AUTH_IDENTITY_ISSUER,
    AuthPrincipal,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientGrantPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ApiKeyGenerator } from './ports/api-key-generator'
import { ServiceClientCreationService } from './service-client-creation.service'
import {
    DuplicateServiceClientPermissionsError,
    EmptyServiceClientPermissionsError,
    ServiceClientAccessDeniedError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'

const actor: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer',
    subject: 'human',
    organizationId: 'org',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'human',
}

describe('ServiceClientCreationService', () => {
    let writer: jest.Mocked<ServiceCredentialWriter>
    let grantPolicy: jest.Mocked<ServiceClientGrantPolicy>
    let generator: jest.MockedFunction<ApiKeyGenerator>
    let service: ServiceClientCreationService
    const material = { apiKey: 'lef_disclosed-once', keyHash: 'a'.repeat(64), keyPrefix: 'lef_prefix12' }

    beforeEach(() => {
        writer = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        grantPolicy = { grantablePermissionsFor: jest.fn() }
        grantPolicy.grantablePermissionsFor.mockReturnValue(['verification:run', 'verification:read'])
        generator = jest.fn(() => material)
        service = new ServiceClientCreationService(writer, grantPolicy, generator)
    })

    it.each([
        { organizationId: 'foreign' },
        { credentialKind: 'service_client' as const },
        { membershipRole: 'member' as const },
        { membershipRole: 'platform_admin' as const },
    ])('denies unauthorized issuance before generating or storing key material: %j', async overrides => {
        await expect(service.create({ ...actor, ...overrides }, 'org', null, ['verification:run'])).rejects.toThrow(
            ServiceClientAccessDeniedError,
        )
        expect(generator).not.toHaveBeenCalled()
        expect(writer.createWithAudit).not.toHaveBeenCalled()
    })

    it.each([
        [[], EmptyServiceClientPermissionsError],
        [['verification:run', 'verification:run'], DuplicateServiceClientPermissionsError],
        [['platform:admin'], ServiceClientPermissionCeilingExceededError],
    ] as const)('rejects invalid grants %j before issuing a key', async (permissions, ErrorType) => {
        await expect(service.create(actor, 'org', null, permissions)).rejects.toThrow(ErrorType)
        expect(generator).not.toHaveBeenCalled()
    })

    it.each(['owner', 'admin'] as const)(
        'accepts the real human projection with role-derived grants and discloses only after commit for %s',
        async membershipRole => {
            writer.createWithAudit.mockImplementation(command =>
                Promise.resolve({
                    id: command.id,
                    organizationId: command.organizationId,
                    issuer: command.issuer,
                    subject: command.subject,
                    keyPrefix: command.keyPrefix,
                    description: command.description,
                    permissions: command.permissions,
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }),
            )
            const result = await service.create({ ...actor, membershipRole }, 'org', 'integration', [
                'verification:run',
            ])
            const command = writer.createWithAudit.mock.calls[0][0]
            expect(command).toMatchObject({
                issuer: AUTH_IDENTITY_ISSUER,
                subject: command.id,
                keyHash: material.keyHash,
                keyPrefix: material.keyPrefix,
                permissions: ['verification:run'],
            })
            expect(command).not.toHaveProperty('apiKey')
            expect(result.apiKey).toBe(material.apiKey)
            expect(grantPolicy.grantablePermissionsFor).toHaveBeenCalledWith(membershipRole)
        },
    )

    it('propagates transaction failure without returning a key', async () => {
        const failure = new Error('audit unavailable')
        writer.createWithAudit.mockRejectedValue(failure)
        await expect(service.create(actor, 'org', null, ['verification:run'])).rejects.toBe(failure)
    })
})
