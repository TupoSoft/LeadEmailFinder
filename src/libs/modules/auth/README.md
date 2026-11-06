# Auth

## Responsibility

Authenticates machine API keys and enforces application permissions. `ApiKeyCredentialAuthenticator` accepts
47-character keys (`lef_` followed by 43 URL-safe characters), hashes the complete value with SHA-256, and reads
current credential state on every request. Active keys resolve to the existing `service_client` principal with
only their stored permissions, the application issuer, and the credential UUID as subject and credential ID.

`CredentialExtractor` accepts one Bearer header or a browser session cookie. Any present malformed or repeated
Authorization header fails authentication without falling back to a cookie. `AuthGuard` also checks raw headers
because Node can discard duplicate Authorization values before exposing the parsed headers.

The module owns role permission policy, the service-client grant ceiling, reusable authentication and permission
guards, principal accessors, and route decorators. The host composes machine and human authenticators and configures the actual native browser cookie name.
Duplicate values for that configured cookie are rejected; HTTPS uses `__Secure-lef_session`.

## Non-Responsibilities

Browser login, token refresh, cookies, CSRF, and Origin checks belong to
[`bff-session`](../bff-session/README.md). Credential issuance and revocation belong to
[`service-client-management`](../service-client-management/README.md). This module owns no credential database,
provider client, token exchange, or authentication cache.

## Public API

`src/index.ts` exports `AuthModule`, `AuthenticationService`, `CredentialAuthenticator`, `ExtractedCredential`,
`CredentialRejectedError`, `CredentialScheme`, `CREDENTIAL_AUTHENTICATORS`, `CredentialExtractor`, `BFF_SESSION_COOKIE_NAME`,
`ApiKeyCredentialAuthenticator`, `RolePermissionPolicy`, `ROLE_PERMISSIONS`, `ServiceClientGrantPolicy`,
`ServiceClientGrantablePermission`, `SERVICE_CLIENT_GRANT_POLICY`,
`SERVICE_CLIENT_GRANTABLE_PERMISSIONS`, `AuthGuard`, `PermissionsGuard`, `CurrentPrincipal`, `Public`,
`getAuthPrincipal`, `setAuthPrincipal`, `RequirePermissions`, and `REQUIRED_PERMISSIONS_METADATA_KEY`.

`AuthModule` exports the extractor, API-key authenticator, and grant policy token. The API host's
`AuthenticationCompositionModule` creates `AuthenticationService` and installs its `BrowserAuthGuard` (an `AuthGuard` subclass) before
`BrowserSessionMutationGuard`. The host guard captures and forwards native renewal/cleanup cookies while
keeping `AuthPrincipal` and application ports free of transport effects. Neither business module depends on the other through the host.

## Dependencies

- [`identity`](../identity/README.md): safe credential records, the application issuer, principal types, permission types,
  , and `ActiveServiceCredentialReader`. Authentication reads through `findByKeyHash`, with no cache.

## HTTP Surface

`GET /v1/auth/api-key` returns an empty `204` with `Cache-Control: no-store` for any active machine key, including
keys with only verification permissions. Missing, malformed, disabled, deleted, and unknown keys receive the
code-only `401 { "code": "authentication_required" }`. A valid human session receives `403`.
The endpoint returns no credential, organization, permission, prefix, or hash fields.

`AuthGuard` translates credential rejections into the stable code-only 401. Unexpected database failures remain
system failures and reach the HTTP boundary as redacted errors. `PermissionsGuard` uses stored permissions for
machine principals and the membership role for human principals.

## Persistence

None owned. Every machine request reads current identity persistence. A request authenticated before a committed
revocation may finish; the next authentication observes the committed rotation, disablement, or deletion.

## Configuration

No machine provider configuration. SHA-256 uses the built-in Node crypto implementation, wired at the composition
root. Native browser runtime configuration remains owned by the BFF and shared runtime composition.

## Validation

Run `corepack pnpm test -- src/libs/modules/auth src/lead-email-finder-api/src/authentication --runInBand`.
Focused API-key tests cover parsing, safe principal projection, uncached revocation, database failures, duplicate
raw headers, cookie fallback rejection, verification-only validation, and human-session rejection.

The [identity PostgreSQL suite](../identity/src/infrastructure/persistence/api-key-credential-postgres.integration.spec.ts)
covers real transactions and concurrent changes. Bruno coverage lives under
[`bruno/m2m-oidc-authentication`](../../../../bruno/m2m-oidc-authentication) and
[`bruno/service-client-management`](../../../../bruno/service-client-management).
Run `corepack pnpm architecture:check` and `corepack pnpm typecheck` after boundary changes.
