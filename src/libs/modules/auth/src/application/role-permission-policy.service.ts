import { AuthPermission, AuthPrincipal, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'

const MEMBER_PERMISSIONS: readonly AuthPermission[] = ['verification:run', 'verification:read']
const ADMIN_PERMISSIONS: readonly AuthPermission[] = [...MEMBER_PERMISSIONS, 'members:manage', 'credentials:manage']
const OWNER_PERMISSIONS: readonly AuthPermission[] = [...ADMIN_PERMISSIONS, 'billing:read', 'billing:manage']
const PLATFORM_ADMIN_PERMISSIONS: readonly AuthPermission[] = [...OWNER_PERMISSIONS, 'platform:admin']

export const ROLE_PERMISSIONS: Readonly<Record<AuthRole, readonly AuthPermission[]>> = {
    member: MEMBER_PERMISSIONS,
    admin: ADMIN_PERMISSIONS,
    owner: OWNER_PERMISSIONS,
    platform_admin: PLATFORM_ADMIN_PERMISSIONS,
}

export class RolePermissionPolicy {
    effectivePermissionsFor(principal: AuthPrincipal): readonly AuthPermission[] {
        if (principal.credentialKind === 'service_client') {
            return principal.permissions
        }

        return ROLE_PERMISSIONS[principal.membershipRole]
    }
}
