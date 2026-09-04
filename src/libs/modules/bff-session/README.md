# BFF Session

Implements the backend-for-frontend browser session: Keycloak Authorization Code + PKCE login, the OAuth
callback, session lookup, silent token refresh, and logout, plus the Origin/CSRF protection that guards every
browser-session mutation across the whole application.

## Responsibility

- Starting and completing the Keycloak Authorization Code + PKCE login flow for human users.
- Issuing, reading, refreshing, and revoking the encrypted `lef_session` cookie and the paired `lef_csrf_token`.
- Resolving a human identity's active organization membership at authentication time
  (`HumanMembershipResolver`), so a disabled membership invalidates the session on the next request.
- Publishing the browser-safe current-account document for an authenticated human session, including deterministic
  presentation capabilities and the service-client permissions the account may grant.
- Enforcing Origin and CSRF double-submit checks on every unsafe request authenticated by the session cookie,
  via `BrowserSessionMutationGuard` — installed globally by the API host's `AuthenticationCompositionModule`,
  not by this module or by `auth`.

## Non-Responsibilities

- No M2M/OIDC bearer authentication (owned by [`auth`](../auth/README.md)); this module only produces one of
  the two credential kinds the application's authentication chain accepts.
- No endpoint authorization policy — authorization decisions are made by the `PermissionsGuard` in `auth`, not here.
  The BFF-owned `BrowserCapabilityPolicy` provides presentation hints only and is never authoritative for an API call.
- Does not compose the application's authenticator chain or register any global guard — the API host's
  `AuthenticationCompositionModule` does that, using this module's `BffSessionCredentialAuthenticator` and
  `BrowserSessionMutationGuard` alongside the equivalents owned by `auth`.
- No membership/organization persistence — this module reads authentication-time membership state through
  identity's `ActiveMembershipReader`, reads browser account fields through `CurrentAccountReader`, and
  resolves/creates external identities through `ExternalIdentityResolver`; it does not own or write those tables.

## Public API

[`src/index.ts`](src/index.ts) exports only `BffSessionModule`, `BffSessionCredentialAuthenticator`, and
`BrowserSessionMutationGuard`. The controller, DTOs, guards, cookie helpers (all under `api/`), configuration,
session crypto, and Redis stores are internal implementation, not part of the intentional public surface.

This module depends only on the public barrel `auth` exposes — `CredentialAuthenticator`, `ExtractedCredential`,
`CredentialRejectedError`, `BFF_SESSION_COOKIE_NAME`, `CurrentPrincipal`, `Public`, `getAuthPrincipal`, and the
`ServiceClientGrantPolicy` contract and token are all imported through
`@tuposoft/lead-email-finder/modules/auth`. `auth` has no source dependency on this module.

## Dependencies

- [`identity`](../identity/README.md) — `ExternalIdentityResolver`, the `ActiveMembershipReader` and
  `CurrentAccountReader` ports, and the `AuthPrincipal`/role/permission types.
- [`auth`](../auth/README.md) — the `CredentialAuthenticator` contract, `CredentialRejectedError`, the session
  cookie name constant, current-principal decorator/accessor, and shared `ServiceClientGrantPolicy`, all through the
  public barrel auth exposes.

## HTTP Surface

`BffSessionController` at `v1/auth`:

| Method | Path               | Access                                                                                                                                        |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `v1/auth/login`    | Public — redirects to Keycloak with a PKCE S256 challenge                                                                                     |
| `GET`  | `v1/auth/callback` | Public — exchanges the authorization code, sets the session/CSRF cookies                                                                      |
| `GET`  | `v1/auth/session`  | Human session — returns browser-safe email, membership, organization, capabilities, and grantable service-client permissions                  |
| `POST` | `v1/auth/logout`   | Authenticated; unsafe method, so `BrowserSessionMutationGuard` also requires a matching Origin and CSRF token for a `human_session` principal |

`GET v1/auth/session` preserves nullable email and never returns credential kind, issuer, subject, credential ID,
tokens, session identifiers, or raw principal permissions. Missing or unusable account authentication returns the
exact `401 { "code": "authentication_required" }` response. An authenticated service client returns the exact
`403 { "code": "human_session_required" }` response.

## Persistence

None owned. Session and pending-login state live in Redis, behind this module's own `SessionStore` and
`PendingLoginStateStore` application ports (`RedisSessionStore`, `RedisPendingLoginStateStore` are their only
adapters), not Postgres.

## Configuration

- `APP_BASE_URL`
- `OIDC_ISSUER_URL`
- `OIDC_BACKCHANNEL_URL` (optional; defaults to the public issuer)
- `OIDC_JWKS_URI` (optional; defaults to the public issuer's `/protocol/openid-connect/certs` endpoint)
- `BFF_CLIENT_ID`
- `BFF_CLIENT_SECRET`
- `SESSION_IDLE_TIMEOUT_MS` (optional, default 8 hours)
- `SESSION_ABSOLUTE_TIMEOUT_MS` (optional, default 24 hours)
- `SESSION_ENCRYPTION_KEY`

`isSecureCookie` is derived from the scheme of `APP_BASE_URL` rather than read from its own variable.

The public issuer controls browser authorization redirects, ID-token issuer validation, and the identity stored in
the session. Only token exchange, refresh, and provider logout use `OIDC_BACKCHANNEL_URL`. JWKS retrieval uses
`OIDC_JWKS_URI` independently of both realm bases. Setting an internal retrieval address never permits an internal
issuer claim. Omitting both optional variables preserves single-address deployments.

The configuration factory removes trailing slashes from both realm bases. Provider URLs must be absolute HTTP(S)
URLs without credentials, whitespace, query parameters, or fragments. Invalid values stop startup with diagnostics
that identify the variable without repeating its value.

## Validation

Focused tests live in `src/`, including `application/bff-session-flow.service.spec.ts`,
`infrastructure/config/bff-session-configuration.spec.ts`,
`infrastructure/keycloak/keycloak-oauth-client.spec.ts`,
`infrastructure/jose/jose-id-token-verifier.spec.ts`,
`infrastructure/jose/jose-id-token-verifier.integration.spec.ts` (real signatures and independent JWKS retrieval,
including rejection of the internal issuer),
`application/human-membership-resolver.service.spec.ts`, `application/session-token-refresher.service.spec.ts`,
`application/bff-session-credential-authenticator.spec.ts`, `bff-session.module.spec.ts`,
`application/browser-capability-policy.spec.ts`, `application/current-account.service.spec.ts`,
`api/browser-session-mutation.guard.spec.ts`, `api/csrf.guard.spec.ts`, `api/origin.guard.spec.ts`,
`api/bff-session.controller.spec.ts`, `api/bff-session.swagger.spec.ts`,
`infrastructure/redis/redis-session-store.spec.ts`,
`bff-session-guard-wiring.integration.spec.ts`, and the live-Keycloak-gated
`bff-session-flow.live-keycloak.integration.spec.ts` (real login, disabled-membership invalidation, replay
rejection, and a genuine CSRF/Origin round trip).

[`bruno/bff-sessions`](../../../../bruno/bff-sessions/README.md) exercises HTTP boundaries that do not require a real
Keycloak human session. It covers the exact unauthenticated `401` response on `session`, an exact human-only `403`
response for a valid service-client bearer, an unauthenticated request to log out, and a correctly constructed PKCE
login redirect. It also covers login-state/`state` mismatch rejection on `callback`. The full authenticated round trip —
including the current-account contract and CSRF/Origin enforcement against a genuine cookie — is covered instead by
`bff-session-flow.live-keycloak.integration.spec.ts` above.
