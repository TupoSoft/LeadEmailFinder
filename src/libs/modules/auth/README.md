# Auth

Authenticates every incoming request and enforces role/permission-based authorization. It is the only module
that registers global Nest guards, so every controller in the application is protected by default unless it
opts out.

## Responsibility

- Default-deny request authentication: resolve an OIDC bearer token or a browser session cookie into an
  `AuthPrincipal`, and reject the request otherwise.
- Role-to-permission mapping (`RolePermissionPolicy`) and the `PermissionsGuard`/`@RequirePermissions()` pair
  that controllers use to authorize a resolved principal.
- The `@Public()` escape hatch for routes that must skip authentication entirely.
- Global enforcement of CSRF/Origin protection on unsafe browser-session mutations, via a guard it re-exposes
  from [`bff-session`](../bff-session/README.md).

## Non-Responsibilities

- No HTTP endpoints of its own — auth has no controllers; it only guards and decorates routes owned by other
  modules.
- No browser login/session life cycle (owned by [`bff-session`](../bff-session/README.md)); auth only consumes
  the resulting credential.
- No persistence — `AuthPrincipal` and the role/permission enums are defined in
  [`identity`](../identity/README.md); auth only depends on their shapes.

## Public API

[`src/index.ts`](src/index.ts) exports: `AuthModule`, `AuthenticationService`, the `credential-authenticator`
contract, `RolePermissionPolicy`, `AuthGuard`, `@CurrentPrincipal()`, `PermissionsGuard`, `@Public()`,
`request-principal` (`getAuthPrincipal`/`setAuthPrincipal`), and `@RequirePermissions()`.

`CredentialExtractor`, `OidcCredentialAuthenticator`, the OIDC token verifier, `ServiceCredentialResolver`, and
everything under `infrastructure/jose/` are **not** part of the barrel and are internal to this module. Even so,
[`bff-session`](../bff-session/README.md) currently reaches some of them (`Public`, `CurrentPrincipal`,
`BFF_SESSION_COOKIE_NAME`, `getAuthPrincipal`) by deep import rather than through this barrel. That coupling is
called out on the `bff-session` side as internal, not as a supported integration point.

## Dependencies

- [`identity`](../identity/README.md) — the `AuthPrincipal`/`AuthPermission`/`AuthRole` shapes and
  `ServiceCredential` type this module authenticates against.
- [`bff-session`](../bff-session/README.md) — imported for `BffSessionCredentialAuthenticator` (human session
  authentication) and `BrowserSessionMutationGuard` (exported again here as a second global guard), both by deep
  import rather than through the public barrel `bff-session` exposes.

## HTTP Surface

No controllers. Auth instead registers two global `APP_GUARD` providers that apply to every route in the
application unless a route is decorated `@Public()`:

- `AuthGuard` — authenticates the request (OIDC bearer or `lef_session` cookie) and attaches the resolved
  `AuthPrincipal`.
- `BrowserSessionMutationGuard` (owned by `bff-session`, exported here via `useExisting`) — for a `human_session`
  principal on an unsafe method, enforces the Origin and CSRF checks described in
  [`bff-session`](../bff-session/README.md).

Controllers additionally opt into `PermissionsGuard` and `@RequirePermissions('<permission>')` to authorize by
role.

## Persistence

None owned.

## Configuration

- `OIDC_ISSUER_URL`
- `OIDC_AUDIENCE`
- `OIDC_JWKS_URI` (optional — overrides where JWKS is fetched from, independently of the issuer URL)

## Validation

Focused tests live in `src/`, including `application/authentication.service.spec.ts`,
`application/credential-extractor.spec.ts`, `application/oidc-credential-authenticator.spec.ts`,
`application/role-permission-policy.service.spec.ts`, `application/service-credential-resolver.service.spec.ts`,
`auth-guard-wiring.integration.spec.ts`, `infrastructure/http/auth.guard.spec.ts`,
`infrastructure/http/permissions.guard.spec.ts`, `infrastructure/jose/oidc-configuration.spec.ts`, and the
live-Keycloak-gated `infrastructure/jose/jose-oidc-token-verifier.live-keycloak.integration.spec.ts` and
`oidc-permission-check.live-keycloak.integration.spec.ts`.

[`bruno/m2m-oidc-authentication`](../../../../bruno/m2m-oidc-authentication/README.md) exercises the global
default-deny `AuthGuard` over HTTP: `/health` stays public while a request with no or invalid bearer credential
is rejected before reaching any controller. The "valid token, authorized credential" path is instead covered by
`oidc-permission-check.live-keycloak.integration.spec.ts` above.
