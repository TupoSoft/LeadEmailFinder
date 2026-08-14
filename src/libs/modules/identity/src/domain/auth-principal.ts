export const AUTH_ROLES = ['platform_admin', 'owner', 'admin', 'member'] as const

export type AuthRole = (typeof AUTH_ROLES)[number]

export const AUTH_PERMISSIONS = [
    'verification:run',
    'verification:read',
    'members:manage',
    'credentials:manage',
    'billing:read',
    'platform:admin',
] as const

export type AuthPermission = (typeof AUTH_PERMISSIONS)[number]

export const AUTH_CREDENTIAL_KINDS = ['human_session', 'service_client', 'legacy_api_key'] as const

export type AuthCredentialKind = (typeof AUTH_CREDENTIAL_KINDS)[number]

/**
 * Application-owned authentication context shared by HTTP, jobs, and services.
 * Keep this contract free of framework and identity-provider types.
 */
export interface AuthPrincipal {
    readonly credentialKind: AuthCredentialKind
    readonly issuer: string
    readonly subject: string
    readonly organizationId: string
    readonly membershipRole: AuthRole
    readonly permissions: readonly AuthPermission[]
    readonly credentialId: string
}
