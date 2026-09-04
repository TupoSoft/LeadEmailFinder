import { AuthRole } from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from './role-permission-policy.service'
import {
    SERVICE_CLIENT_GRANTABLE_PERMISSIONS,
    ServiceClientGrantablePermission,
    ServiceClientGrantPolicy,
} from './service-client-grant-policy'

export class DefaultServiceClientGrantPolicy implements ServiceClientGrantPolicy {
    constructor(private readonly rolePermissionPolicy: RolePermissionPolicy) {}

    grantablePermissionsFor(role: AuthRole): readonly ServiceClientGrantablePermission[] {
        if (role !== 'admin' && role !== 'owner') {
            return []
        }

        const effectivePermissions = this.rolePermissionPolicy.effectivePermissionsForRole(role)
        return SERVICE_CLIENT_GRANTABLE_PERMISSIONS.filter(permission => effectivePermissions.includes(permission))
    }
}
