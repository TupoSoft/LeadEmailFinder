import { UnauthorizedException } from '@nestjs/common'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key'
import { ApiKeyService } from '@tuposoft/lead-email-finder/modules/api-key/application/api-key.service'
import { LEGACY_API_KEY_ISSUER, LegacyApiKeyCredentialAuthenticator } from './legacy-api-key-credential-authenticator'
import { LegacyBridgeOrganizationResolver } from './legacy-bridge-organization-resolver.service'

describe('LegacyApiKeyCredentialAuthenticator', () => {
    let apiKeyService: jest.Mocked<Pick<ApiKeyService, 'findValidKey'>>
    let legacyBridgeOrganizationResolver: jest.Mocked<LegacyBridgeOrganizationResolver>
    let authenticator: LegacyApiKeyCredentialAuthenticator

    beforeEach(() => {
        apiKeyService = { findValidKey: jest.fn() }
        legacyBridgeOrganizationResolver = {
            resolve: jest.fn(),
        } as unknown as jest.Mocked<LegacyBridgeOrganizationResolver>
        authenticator = new LegacyApiKeyCredentialAuthenticator(
            apiKeyService as unknown as ApiKeyService,
            legacyBridgeOrganizationResolver,
        )
    })

    describe('supports', () => {
        it('supports an x-api-key credential', () => {
            expect(authenticator.supports({ scheme: 'x-api-key', token: 'api_key' })).toBe(true)
        })

        it('supports a non-JWT-shaped bearer token', () => {
            expect(authenticator.supports({ scheme: 'bearer', token: 'api_key' })).toBe(true)
        })

        it('does not support a JWT-shaped bearer token', () => {
            expect(authenticator.supports({ scheme: 'bearer', token: 'a.b.c' })).toBe(false)
        })
    })

    describe('authenticate', () => {
        it('throws when the key is invalid or expired', async () => {
            apiKeyService.findValidKey.mockResolvedValue(null)

            await expect(authenticator.authenticate({ scheme: 'x-api-key', token: 'bad-key' })).rejects.toThrow(
                UnauthorizedException,
            )
        })

        it('maps an admin key to the platform_admin role with no new permissions', async () => {
            apiKeyService.findValidKey.mockResolvedValue({
                id: 'key-id',
                permissions: [KeyPermissions.ADMIN],
            } as never)
            legacyBridgeOrganizationResolver.resolve.mockResolvedValue('bridge-org-id')

            const principal = await authenticator.authenticate({ scheme: 'x-api-key', token: 'admin-key' })

            expect(principal).toEqual({
                credentialKind: 'legacy_api_key',
                issuer: LEGACY_API_KEY_ISSUER,
                subject: 'key-id',
                organizationId: 'bridge-org-id',
                membershipRole: 'platform_admin',
                permissions: [],
                credentialId: 'key-id',
            })
        })

        it('maps a non-admin key to the member role', async () => {
            apiKeyService.findValidKey.mockResolvedValue({
                id: 'key-id',
                permissions: [KeyPermissions.READ],
            } as never)
            legacyBridgeOrganizationResolver.resolve.mockResolvedValue('bridge-org-id')

            const principal = await authenticator.authenticate({ scheme: 'x-api-key', token: 'read-key' })

            expect(principal.membershipRole).toBe('member')
        })
    })
})
