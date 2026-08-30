# Auth

Authenticates every incoming request and enforces role/permission-based authorization. It owns the bearer
(OIDC service-client) authentication path, the permission model, and the reusable `AuthGuard`/`PermissionsGuard`
pair. It does not compose the running application's authentication chain or register any global guard itself —
the API host's `AuthenticationCompositionModule` does that instead, so auth has no dependency on `bff-session`.

## Responsibility

- Default-deny request authentication for OIDC bearer (service-client) credentials: verify the token and
  resolve an active `ServiceCredential` into an `AuthPrincipal`, via `AuthenticationService` and
  `OidcCredentialAuthenticator`.
- The `CredentialAuthenticator`/`ExtractedCredential`/`CredentialRejectedError` contract that every credential
  authenticator implements, including the one owned by `bff-session`, so `AuthGuard` can translate any rejection
  into a 401 without knowing which authenticator produced it.
- Role-to-permission mapping (`RolePermissionPolicy`) and the `PermissionsGuard`/`@RequirePermissions()` pair
  that controllers use to authorize a resolved principal.
- The reusable `AuthGuard` (attaches the resolved principal to the request) and the `@Public()` escape hatch.

## Non-Responsibilities

- No HTTP endpoints of its own — auth has no controllers; it only guards and decorates routes owned by other
  modules.
- Does not compose the application's authenticator chain or register any global `APP_GUARD` — the API host's
  `AuthenticationCompositionModule` (`src/lead-email-finder-api/src/authentication/`) does that, injecting
  `AuthGuard` alongside the `BrowserSessionMutationGuard` owned by `bff-session` in the required order.
- No browser login/session life cycle (owned by [`bff-session`](../bff-session/README.md)); auth has no source
  dependency on that module at all — `bff-session` depends on the public barrel auth exposes, never the reverse.
- No persistence — `AuthPrincipal` and the role/permission enums are defined in
  [`identity`](../identity/README.md); auth reads active service credentials only through identity's
  `ActiveServiceCredentialReader` port, never through a direct repository.

## Public API

[`src/index.ts`](src/index.ts) exports: `AuthModule`, `AuthenticationService`, the `credential-authenticator`
contract (`CredentialAuthenticator`, `ExtractedCredential`, `CredentialRejectedError`, `CREDENTIAL_AUTHENTICATORS`),
`CredentialExtractor` (and its `BFF_SESSION_COOKIE_NAME` constant), `OidcCredentialAuthenticator`,
`RolePermissionPolicy`, `AuthGuard`, `PermissionsGuard`, `@CurrentPrincipal()`, `@Public()`, `request-principal`
(`getAuthPrincipal`/`setAuthPrincipal`), and `@RequirePermissions()`.

`ServiceCredentialResolver`, the OIDC token verifier, and everything under `infrastructure/jose/` are **not**
part of the barrel and are internal to this module.

`AuthModule` itself provides and exports only `CredentialExtractor` and `OidcCredentialAuthenticator` (plus their
private infrastructure dependencies) — the ingredients a composition root needs to build `AuthenticationService`.
It does not provide `AuthenticationService` or register any guard globally; see
[`authentication-composition.module.ts`](../../../lead-email-finder-api/src/authentication/authentication-composition.module.ts).

## Dependencies

- [`identity`](../identity/README.md) — `AuthPrincipal`/`AuthPermission`/`AuthRole`/`ServiceCredentialRecord`
  shapes, and the `ActiveServiceCredentialReader` port `ServiceCredentialResolver` reads through.

## HTTP Surface

No controllers. `AuthGuard` and `PermissionsGuard` are reusable providers other modules (or the host composition
module) register as guards:

- `AuthGuard` — authenticates the request via `AuthenticationService` and attaches the resolved `AuthPrincipal`;
  translates any `CredentialRejectedError` into a 401, and lets any other error propagate unchanged.
- `PermissionsGuard` + `@RequirePermissions('<permission>')` — authorizes an already-resolved principal by role,
  via `RolePermissionPolicy`.

The application's actual global guard registration (`AuthGuard` before `BrowserSessionMutationGuard`) lives in
the API host's `AuthenticationCompositionModule`, not here.

## Persistence

None owned. Reads active service credentials through identity's `ActiveServiceCredentialReader` port.

## Configuration

- `OIDC_ISSUER_URL`
- `OIDC_AUDIENCE`
- `OIDC_JWKS_URI` (optional — overrides where JWKS is fetched from, independently of the issuer URL)

## Validation

Focused tests live in `src/`, including `application/authentication.service.spec.ts`,
`application/credential-extractor.spec.ts`, `application/oidc-credential-authenticator.spec.ts`,
`application/role-permission-policy.service.spec.ts`, `application/service-credential-resolver.service.spec.ts`,
`auth.module.spec.ts`, `auth-guard-wiring.integration.spec.ts`, `api/auth.guard.spec.ts`,
`api/permissions.guard.spec.ts`, `infrastructure/jose/oidc-configuration.spec.ts`, and the live-Keycloak-gated
`infrastructure/jose/jose-oidc-token-verifier.live-keycloak.integration.spec.ts` and
`oidc-permission-check.live-keycloak.integration.spec.ts`. The composition root's own wiring is validated by
`src/lead-email-finder-api/src/authentication/authentication-composition.module.spec.ts`.

[`bruno/m2m-oidc-authentication`](../../../../bruno/m2m-oidc-authentication/README.md) exercises the global
default-deny `AuthGuard` over HTTP: `/health` stays public while a request with no or invalid bearer credential
is rejected before reaching any controller. The "valid token, authorized credential" path is instead covered by
`oidc-permission-check.live-keycloak.integration.spec.ts` above.
