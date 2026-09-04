import { AuthPermission, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'

export const SERVICE_CLIENT_GRANT_POLICY = Symbol('SERVICE_CLIENT_GRANT_POLICY')

export const SERVICE_CLIENT_GRANTABLE_PERMISSIONS = [
    'verification:run',
    'verification:read',
    'members:manage',
    'credentials:manage',
    'billing:read',
    'billing:manage',
] as const satisfies readonly AuthPermission[]

export type ServiceClientGrantablePermission = (typeof SERVICE_CLIENT_GRANTABLE_PERMISSIONS)[number]

export interface ServiceClientGrantPolicy {
    grantablePermissionsFor(role: AuthRole): readonly ServiceClientGrantablePermission[]
}
