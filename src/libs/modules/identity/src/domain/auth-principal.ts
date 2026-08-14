export const AUTH_ROLES = ['platform_admin', 'owner', 'admin', 'member'] as const

export type AuthRole = (typeof AUTH_ROLES)[number]

export const AUTH_CREDENTIAL_TYPES = ['human_session', 'service_client', 'legacy_api_key'] as const

export type AuthCredentialType = (typeof AUTH_CREDENTIAL_TYPES)[number]

/**
 * Application-owned authentication context shared by HTTP, jobs, and services.
 * Keep this contract free of framework and identity-provider types.
 */
export interface AuthPrincipal {
    readonly credentialType: AuthCredentialType
    readonly issuer: string
    readonly subject: string
    readonly organizationId: string
    readonly roles: readonly AuthRole[]
    readonly scopes: readonly string[]
    readonly credentialId: string
}
