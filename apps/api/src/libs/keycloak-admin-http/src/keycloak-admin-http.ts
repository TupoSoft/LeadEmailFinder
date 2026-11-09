export const KEYCLOAK_ADMIN_HTTP = Symbol('KEYCLOAK_ADMIN_HTTP')

/**
 * `path` starts with `/` and is relative to `/admin/realms/<configured realm>`; the implementation owns
 * the realm prefix and service-account authentication so no caller needs the credential-bearing
 * configuration.
 */
export interface KeycloakAdminHttp {
    requestRealm<T = void>(
        method: string,
        path: string,
        body?: unknown,
        acceptedStatuses?: readonly number[],
    ): Promise<T>
}
