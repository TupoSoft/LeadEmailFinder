# Auth

## Responsibility

Authenticates machine API keys and checks permissions. A **principal** is the authenticated caller plus its authority.
Keys have 47 characters: `lef_` plus 43 URL-safe characters. `ApiKeyCredentialAuthenticator` hashes the complete key
with SHA-256, a one-way digest, and reads its current record on every request. Active keys become `service_client`
principals with stored permissions, the application issuer, and the credential UUID (unique identifier) as subject/ID.

`CredentialExtractor` accepts one Bearer header (a credential whose holder may use it) or a browser session cookie.
Malformed or repeated Authorization headers fail without cookie fallback. `AuthGuard` checks raw headers because Node
may discard duplicates. This module also owns role permissions, the machine-permission grant ceiling, reusable
guards (request checks), principal accessors, and route decorators. The API host assembles human/machine authenticators.

## Non-Responsibilities

Browser login, refresh, cookies, and cross-site request protection belong to [bff-session](../bff-session/README.md).
Issuance/revocation belong to [service-client-management](../service-client-management/README.md).
Auth owns no credential storage, provider client, token exchange, or authentication cache.

## Public API

`src/index.ts` exports `AuthModule`, `AuthenticationService`, `CredentialAuthenticator`, `ExtractedCredential`,
`CredentialRejectedError`, `CredentialScheme`, `CREDENTIAL_AUTHENTICATORS`, `CredentialExtractor`,
`BFF_SESSION_COOKIE_NAME`, `ApiKeyCredentialAuthenticator`, `RolePermissionPolicy`, `ROLE_PERMISSIONS`,
`ServiceClientGrantPolicy`, `ServiceClientGrantablePermission`, `SERVICE_CLIENT_GRANT_POLICY`,
`SERVICE_CLIENT_GRANTABLE_PERMISSIONS`, `AuthGuard`, `PermissionsGuard`, `CurrentPrincipal`, `Public`,
`getAuthPrincipal`, `setAuthPrincipal`, `RequirePermissions`, and `REQUIRED_PERMISSIONS_METADATA_KEY`.

`AuthModule` exports the extractor, API-key authenticator, and grant-policy token. The host's
`AuthenticationCompositionModule` installs authentication before browser-session mutation checks.

## Dependencies

- [`identity`](../identity/README.md): safe credential records, issuer, principal/permission types, and
  `ActiveServiceCredentialReader.findByKeyHash`. Reads are uncached.

## HTTP Surface

`GET /v1/auth/api-key` returns empty `204` with `Cache-Control: no-store` (do not cache) for an active machine key,
including verification-only keys. Missing, malformed, unknown, disabled, or deleted keys return code-only
`401 {"code":"authentication_required"}`; a valid human session returns `403`. No credential or organization
metadata is returned.

Credential rejection becomes the stable 401; unexpected database failures remain redacted system errors.
`PermissionsGuard` uses stored machine permissions or the human membership role.

## Persistence

None owned. A request authenticated before committed revocation may finish; the next authentication observes
rotation, disablement, or deletion.

## Configuration

No machine-provider settings. Node's built-in crypto supplies hashing. Browser Keycloak settings remain in the BFF
module; Keycloak is the currently wired identity provider.

## Validation

```sh
corepack pnpm test -- apps/api/src/modules/auth apps/api/src/authentication --runInBand
corepack pnpm typecheck
```

Tests cover parsing/duplicate headers, safe principals, revocation, database errors, cookie fallback, and caller kinds.
The [PostgreSQL tests](../identity/src/infrastructure/persistence/api-key-credential-postgres.integration.spec.ts)
cover transactions/concurrency. HTTP collection coverage uses Bruno under
[`m2m-oidc-authentication`](../../../../../bruno/m2m-oidc-authentication) and
[`service-client-management`](../../../../../bruno/service-client-management).
