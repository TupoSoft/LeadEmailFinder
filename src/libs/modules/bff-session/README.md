# BFF Session

This module manages browser login and sessions for the web application. It handles Keycloak sign-in and the login
callback, checks sessions, refreshes access tokens, and signs users out. It also checks request origins and CSRF
tokens before allowing browser-session requests that change data.

## Responsibility

- Starting and completing the Keycloak Authorization Code + PKCE login flow for human users.
- Atomically consuming each pending login state once and mapping recoverable callback failures to stable,
  same-origin browser redirects without provider or identity details.
- Issuing, reading, refreshing, and revoking the encrypted `lef_session` cookie and the paired `lef_csrf_token`.
- Resolving a human identity's active organization membership at authentication time (`HumanMembershipResolver`), so a
  disabled membership invalidates the session on the next request.
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
  identity's `ActiveMembershipReader`, reads browser account fields through `CurrentAccountReader`, and finds an
  existing external identity through `ExternalIdentityResolver`. The callback synchronizes its email only after
  active-membership resolution succeeds and never creates an identity; this module does not own those tables.

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
|--------|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `GET`  | `v1/auth/login`    | Public — accepts an optional safe `destination` query and redirects to Keycloak with a PKCE S256 challenge                                    |
| `GET`  | `v1/auth/callback` | Public — consumes pending state, exchanges the authorization code, and sets the session/CSRF cookies                                          |
| `GET`  | `v1/auth/session`  | Human session — returns browser-safe email, membership, organization, capabilities, and grantable service-client permissions                  |
| `POST` | `v1/auth/logout`   | Authenticated; unsafe method, so `BrowserSessionMutationGuard` also requires a matching Origin and CSRF token for a `human_session` principal |

`GET v1/auth/session` preserves nullable email and never returns credential kind, issuer, subject, credential ID,
tokens, session identifiers, or raw principal permissions. Missing or unusable account authentication returns the
exact `401 { "code": "authentication_required" }` response. An authenticated service client returns the exact
`403 { "code": "human_session_required" }` response.

These four operations and `GET /health` form the initial generated browser contract at `/openapi.json`. The full
runtime Swagger UI lives at `/docs`. The API host owns document generation and an exact operation allow list; this
module owns the route, response, cookie, and CSRF annotations that feed both documents. The stable operation IDs are
`loginBrowserSession`, `completeBrowserAuthorization`, `getCurrentAccount`, and `logoutBrowserSession`. The callback
operation publishes its safe redirect codes in the `x-callback-error-codes` OpenAPI extension because the codes are
part of the redirect URL, not a JSON response body. Logout describes the session cookie and CSRF header as a combined
security requirement and documents the Origin check with its Referer fallback.

After changing a browser-facing source annotation, update and check the committed contract and generated types:

```shell
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
```

`GET v1/auth/callback` parses the provider query locally so missing, blank, repeated, or non-string `state` and
`code` values reach the browser recovery policy instead of the global validation response. State is checked and
atomically consumed before the authorization code is validated or exchanged. Recoverable failures redirect to
`${APP_BASE_URL}/auth/error` with exactly one of these codes:

- `login_state_invalid`
- `authorization_code_exchange_failed`
- `active_membership_required`

Only an explicit OAuth `400 invalid_grant` response to the authorization-code exchange uses the code-exchange
redirect. Provider transport, throttling, server, client-configuration, malformed-response, and ID-token integrity
failures remain redacted `5xx` responses. ID-token integrity validation rejects an audience other than the configured
BFF client, any additional audience without an explicit trust policy, and a present authorized-party claim that does
not equal the BFF client. The callback looks up an existing external identity and resolves its active membership
before synchronizing email, so `active_membership_required` does not create or update an identity. Every callback
response clears the transient login-state cookie and sets `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`; successful handling redirects to the validated pending application destination and
issues the session and CSRF
cookies.

Login accepts only a canonical relative destination under `/app`, including its query and fragment. It rejects
absolute and protocol-relative URLs, encoded path components, malformed values, public routes, and authentication
recovery routes. Every rejected destination falls back to `/app`. The one-time pending state owns the normalized
destination; query input on the callback route cannot change it. Successful callbacks redirect to that destination.

Login also records a session lineage in pending state. A valid existing cookie records the exact session expected
for replacement. Missing cookies record a fresh lineage. Stale, expired, malformed, duplicate, and forged cookies
record a fresh lineage and clear both session and CSRF cookies before the provider redirect, with the original
scope and security attributes. A callback for a fresh lineage rejects any newly presented session cookie. A
replacement callback requires the original cookie and rejects a missing expected session as `login_state_invalid`.
Concurrent login attempts from the same old session permit exactly one replacement.

## Persistence

None owned. Session and pending-login state live in Redis, behind this module's own `SessionStore` and
`PendingLoginStateStore` application ports, not Postgres. Production composition uses `RedisSessionStore` and
`RedisPendingLoginStateStore`. `InMemorySessionStore` is a disposable adapter for contract and HTTP tests. Pending login
state is consumed with one atomic Redis `GETDEL`, so concurrent callback
requests cannot both obtain the same verifier and nonce.

`SessionStore.replace` creates the new encrypted session and removes the expected old key in one Redis Lua
operation, only while that expected key exists and the new key is absent. Encryption happens before the operation.
Both Redis and the in-memory adapter enforce the same replacement contract. Ordinary session saves update existing
records only, so an earlier authentication request cannot recreate an old session after replacement. Redis expiry
uses millisecond precision and remains bounded by the idle and absolute deadlines. If response construction fails
before headers are sent, the controller discards the new session and removes its cookie headers.

The pending-state schema now requires a destination and tagged session lineage. Pending logins created before this
change fail safely and must restart. Development data remains disposable; use the checkout-owned reset and reseed
procedure documented in the frontend runtime guide when a full development reset is needed. No database migration
is required.

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

`session-store.contract.spec.ts` runs the same fresh, replacement, expiry, conflict, race, and stale-save cases against
memory and, when `TEST_BFF_REDIS_URL` is set, Redis. The Redis cases also inject script and serialization failures.
`bff-session-replacement.integration.spec.ts` exercises real application orchestration and HTTP authentication with a
disposable session store and stub provider. It verifies two browser contexts, distinct-state races, unusable-cookie
recovery, replay, failure redaction, and response-construction cleanup. These tests do not prove live provider login.

Focused application tests include `application/bff-session-flow.service.spec.ts`,
`application/human-membership-resolver.service.spec.ts`, `application/session-token-refresher.service.spec.ts`,
`application/bff-session-credential-authenticator.spec.ts`, `application/browser-capability-policy.spec.ts`, and
`application/current-account.service.spec.ts`.

Provider, configuration, and storage contracts use `infrastructure/config/bff-session-configuration.spec.ts`,
`infrastructure/keycloak/keycloak-oauth-client.spec.ts`, the two `infrastructure/jose/jose-id-token-verifier` specs,
and the two `infrastructure/redis/redis-*-store.spec.ts` files. The JOSE integration spec uses real signatures and an
independent JWKS address, including rejection of the internal issuer.

`infrastructure/crypto/session-encryptor.spec.ts` verifies session encryption and rejects modified ciphertext, wrong
keys, and malformed input. Its tampering fixture flips one decoded byte so every generated sample is actually changed.

The API boundary uses `api/bff-session.controller.spec.ts`, `api/bff-session.swagger.spec.ts`,
`api/parse-cookie-header.spec.ts`, and the Origin, CSRF, and browser-session-mutation guard specs. Module composition
is covered by `bff-session.module.spec.ts` and `bff-session-guard-wiring.integration.spec.ts`.

The live-Keycloak-gated `bff-session-flow.live-keycloak.integration.spec.ts` covers real login, disabled-membership
invalidation, replay rejection, and a genuine CSRF/Origin round trip.

[`bruno/bff-sessions`](../../../../bruno/bff-sessions/README.md) exercises HTTP boundaries that do not require a real
Keycloak human session. It covers the exact unauthenticated `401` response on `session`, an exact human-only `403`
response for a valid service-client bearer, an unauthenticated request to log out, and a correctly constructed PKCE
login redirect. It also proves that a missing state and a mismatched state cookie redirect with
`login_state_invalid`, that the mismatch leaves the valid state usable, that a missing authorization code then
consumes it and redirects safely, and that replaying the consumed state returns `login_state_invalid`. The full
authenticated round trip — including the current-account contract and CSRF/Origin enforcement against a genuine
cookie — is covered instead by `bff-session-flow.live-keycloak.integration.spec.ts` above.
