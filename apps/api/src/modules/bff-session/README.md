# BFF Session

A **BFF** (backend for frontend) keeps browser authentication on the server. This module currently uses Keycloak,
the identity provider, through **OIDC** (OpenID Connect, identity verification built on OAuth token authorization).
**PKCE** binds an authorization code to the initiating login so a stolen code alone cannot complete sign-in.

## Responsibility

- Start login, consume each pending state once, complete the callback, refresh provider tokens, and sign out.
- Store an opaque session identifier in `lef_session`; encrypt the associated server-side session in Redis.
  Pair it with `lef_csrf_token`. **CSRF** is an attack that makes a browser submit an unwanted authenticated request.
- Recheck active organization membership on authentication; disabled membership invalidates the next request.
- Return browser-safe account data and presentation capabilities. Capabilities are UI hints, not API authorization.
- Supply `BrowserSessionMutationGuard`: state-changing cookie-authenticated requests require the expected Origin
  (scheme, host, and port) and matching cookie/header CSRF tokens. The API host installs it after authentication.

## Non-Responsibilities

Machine API-key authentication and endpoint permissions belong to [auth](../auth/README.md); host composition owns
the authenticator chain/global guards. [Identity](../identity/README.md) owns organizations/memberships.
The callback resolves an existing external identity and active membership before updating email; it never creates one.

## Public API

[`src/index.ts`](src/index.ts) exports `BffSessionModule`, `BffSessionCredentialAuthenticator`, and
`BrowserSessionMutationGuard`. Controllers, transport data shapes (DTOs), cookie helpers, configuration, encryption,
and stores are internal.

## Dependencies

- [`identity`](../identity/README.md): `ExternalIdentityResolver`, `ActiveMembershipReader`, `CurrentAccountReader`,
  and principal/role/permission types. A principal describes an authenticated caller and its authority.
- [`auth`](../auth/README.md): authentication contracts/errors, session-cookie constant, principal accessors/decorator,
  and `ServiceClientGrantPolicy`/token. All imports use public barrels; `auth` does not import this module.

## HTTP Surface

| Method | Path                | Behavior                                                                                                       |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/auth/login`    | Public; accepts a safe `destination` and redirects to Keycloak with PKCE S256 (a SHA-256-based code challenge) |
| GET    | `/v1/auth/callback` | Public; consumes state, exchanges the code, and sets session/CSRF cookies                                      |
| GET    | `/v1/auth/session`  | Human session; returns email, membership, organization, capabilities, grantable permissions                    |
| POST   | `/v1/auth/logout`   | Authenticated; human sessions also require Origin/CSRF checks                                                  |

Session email may be null. Responses omit credentials, issuer/subject, tokens, session IDs, and raw permissions.
Missing/unusable authentication returns `401 {"code":"authentication_required"}`; a machine caller receives
`403 {"code":"human_session_required"}`.

Login destinations must be canonical relative `/app` URLs, optionally with query/fragment. Absolute URLs, encoded
path components, public/recovery routes, and malformed input fall back to `/app`. Pending state stores the destination;
the callback cannot replace it.

Callbacks validate/consume state before checking or exchanging `code`. Recoverable failures redirect to the same-origin
`/auth/error` with `login_state_invalid`, `authorization_code_exchange_failed`, or `active_membership_required`.
Only OAuth `400 invalid_grant` during code exchange uses the exchange-failure redirect. Transport/configuration,
provider-server, malformed-response, and ID-token integrity failures remain redacted `5xx` responses.
An ID token (provider-signed identity proof) must name only the configured client in `aud` (intended client IDs).
If `azp` (the authorized client ID) is present, it must match too. Every callback clears the temporary login-state cookie and
uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, preventing storage and referrer disclosure.

A pending login records **session lineage**: either a fresh login or the exact old session it may replace.
Unusable/duplicate cookies start fresh and clear session/CSRF cookies. Fresh callbacks reject a newly presented
session; replacements require the original cookie and live old record. Concurrent logins can replace it only once.

The host publishes `/openapi.json` (machine-readable browser API contract) and `/docs` (Swagger UI). Stable operation
IDs are `loginBrowserSession`, `completeBrowserAuthorization`, `getCurrentAccount`, and `logoutBrowserSession`.
Callback codes use the `x-callback-error-codes` extension; logout documents combined cookie/CSRF requirements and
Origin's Referer fallback. Keep the browser API contract consistent when changing these annotations.

## Persistence

No database tables owned. Application ports hide Redis session/pending-state storage. Atomic `GETDEL` retrieves and
deletes pending state together, preventing two callbacks from consuming it. Session replacement encrypts first, then
creates the new record/removes the old one in one conditional Lua operation (a Redis-side atomic script).
Saves update existing records only, so stale authentication cannot recreate a replaced session. Expiry obeys idle
and absolute deadlines. If response construction fails before headers are sent, discard the new session/cookies.

Pending states without destination/lineage fail safely and require restarting login. Development data is disposable.

## Configuration

| Setting                              | Purpose/default                                                        |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `APP_BASE_URL`                       | Public application base; its scheme determines Secure cookies          |
| `OIDC_ISSUER_URL`                    | Public provider identity and browser authorization base                |
| `OIDC_BACKCHANNEL_URL`               | Optional internal token/refresh/logout base; defaults to issuer        |
| `OIDC_JWKS_URI`                      | Signing-key URL; defaults to issuer's `/protocol/openid-connect/certs` |
| `BFF_CLIENT_ID`, `BFF_CLIENT_SECRET` | Provider client credentials                                            |
| `SESSION_IDLE_TIMEOUT_MS`            | Inactivity limit; 8 hours                                              |
| `SESSION_ABSOLUTE_TIMEOUT_MS`        | Maximum lifetime; 24 hours                                             |
| `SESSION_ENCRYPTION_KEY`             | Session-record encryption key                                          |

**JWKS** is the provider's public signing-key set. An internal fetch URL never permits an internal issuer claim.
Realm bases lose trailing slashes; provider URLs must be absolute HTTP(S), without credentials, whitespace, queries,
or fragments. Invalid configuration stops startup without echoing values.

## Validation

Run `corepack pnpm test -- apps/api/src/modules/bff-session --runInBand`, plus the architecture/type checks.
Store contracts cover expiry, replacement races, stale saves, encryption, and failure cleanup. Set `TEST_BFF_REDIS_URL`
to exercise Redis rather than only memory. HTTP tests use a stub provider; they do not prove real login.
`bff-session-flow.live-keycloak.integration.spec.ts` gates real provider login, membership invalidation, and CSRF checks.
[`bruno/bff-sessions`](../../../../../bruno/bff-sessions/README.md) covers unauthenticated/machine responses, PKCE
redirects, state mismatch/consumption, and replay rejection without a human session.
