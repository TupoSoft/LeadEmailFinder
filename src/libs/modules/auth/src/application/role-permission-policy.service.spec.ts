import { AUTH_PERMISSIONS, AuthPermission, AuthPrincipal, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'
import { ROLE_PERMISSIONS, RolePermissionPolicy } from './role-permission-policy.service'

function principalWith(overrides: Partial<AuthPrincipal>): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-id',
        membershipRole: 'member',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

describe('RolePermissionPolicy', () => {
    const policy = new RolePermissionPolicy()

    describe('role-based principals (human_session)', () => {
        it.each<[AuthRole, readonly AuthPermission[]]>([
            ['member', ['verification:run', 'verification:read']],
            ['admin', ['verification:run', 'verification:read', 'members:manage', 'credentials:manage']],
            [
                'owner',
                [
                    'verification:run',
                    'verification:read',
                    'members:manage',
                    'credentials:manage',
                    'billing:read',
                    'billing:manage',
                ],
            ],
            [
                'platform_admin',
                [
                    'verification:run',
                    'verification:read',
                    'members:manage',
                    'credentials:manage',
                    'billing:read',
                    'billing:manage',
                    'platform:admin',
                ],
            ],
        ])('grants the documented permission set for %s', (membershipRole, expectedPermissions) => {
            const principal = principalWith({ membershipRole, permissions: [] })

            expect(policy.effectivePermissionsFor(principal)).toEqual(expectedPermissions)
        })

        it('grants platform_admin the union of every permission', () => {
            const principal = principalWith({ membershipRole: 'platform_admin' })

            expect(policy.effectivePermissionsFor(principal)).toEqual([...AUTH_PERMISSIONS])
        })

        it('ignores whatever is stored on principal.permissions for human_session principals', () => {
            const principal = principalWith({
                membershipRole: 'member',
                permissions: ['platform:admin'],
            })

            expect(policy.effectivePermissionsFor(principal)).toEqual(ROLE_PERMISSIONS.member)
        })
    })

    describe('service_client principals', () => {
        it('returns the configured scopes verbatim', () => {
            const principal = principalWith({
                credentialKind: 'service_client',
                membershipRole: 'admin',
                permissions: ['verification:run'],
            })

            expect(policy.effectivePermissionsFor(principal)).toEqual(['verification:run'])
        })

        it('returns no permissions when none are configured', () => {
            const principal = principalWith({
                credentialKind: 'service_client',
                membershipRole: 'admin',
                permissions: [],
            })

            expect(policy.effectivePermissionsFor(principal)).toEqual([])
        })

        it('ignores membershipRole entirely, so a narrow-scope credential cannot escalate via the filler role', () => {
            const principal = principalWith({
                credentialKind: 'service_client',
                membershipRole: 'admin',
                permissions: ['billing:read'],
            })

            expect(policy.effectivePermissionsFor(principal)).toEqual(['billing:read'])
        })
    })
})
