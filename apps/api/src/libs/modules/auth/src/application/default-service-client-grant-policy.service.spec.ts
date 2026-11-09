import { AUTH_ROLES, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'
import { DefaultServiceClientGrantPolicy } from './default-service-client-grant-policy.service'
import { RolePermissionPolicy } from './role-permission-policy.service'
import { ServiceClientGrantablePermission } from './service-client-grant-policy'

describe('DefaultServiceClientGrantPolicy', () => {
    const policy = new DefaultServiceClientGrantPolicy(new RolePermissionPolicy())
    const expectedPermissionsByRole: Readonly<Record<AuthRole, readonly ServiceClientGrantablePermission[]>> = {
        member: [],
        admin: ['verification:run', 'verification:read', 'members:manage', 'credentials:manage'],
        owner: [
            'verification:run',
            'verification:read',
            'members:manage',
            'credentials:manage',
            'billing:read',
            'billing:manage',
        ],
        platform_admin: [],
    }

    it.each(AUTH_ROLES)('returns the exact ordered service-client grant set for %s', role => {
        expect(policy.grantablePermissionsFor(role)).toEqual(expectedPermissionsByRole[role])
    })
})
