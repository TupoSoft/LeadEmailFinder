import { readFileSync } from 'node:fs'
import { AUTH_CREDENTIAL_KINDS, AUTH_PERMISSIONS, AUTH_ROLES, AuthPrincipal } from './auth-principal'

describe('AuthPrincipal', () => {
    it('normalizes every authentication mechanism into one application contract', () => {
        const principal = {
            credentialKind: 'service_client',
            issuer: 'https://auth.example.test/realms/lead-email-finder',
            subject: 'service-account-client-id',
            organizationId: '21cd3689-e61d-428f-8a40-22321aafca73',
            membershipRole: 'admin',
            permissions: ['verification:run'],
            credentialId: '752cdf54-e502-4036-8332-bd570bb14f42',
        } as const satisfies AuthPrincipal

        expect(principal).toEqual(
            expect.objectContaining({
                credentialKind: 'service_client',
                organizationId: expect.any(String),
                credentialId: expect.any(String),
            }),
        )
    })

    it('limits roles, permissions, and credential kinds to the supported values', () => {
        expect(AUTH_ROLES).toEqual(['platform_admin', 'owner', 'admin', 'member'])
        expect(AUTH_PERMISSIONS).toEqual([
            'verification:run',
            'verification:read',
            'members:manage',
            'credentials:manage',
            'billing:read',
            'billing:manage',
            'platform:admin',
        ])
        expect(AUTH_CREDENTIAL_KINDS).toEqual(['human_session', 'service_client'])
    })

    it('does not import framework, persistence, cache, or identity-provider types', () => {
        const source = readFileSync(__filename.replace('.spec.ts', '.ts'), 'utf8')

        expect(source).not.toMatch(/^import\s/m)
        expect(source).not.toMatch(/@nestjs|typeorm|ioredis|keycloak/i)
    })
})
