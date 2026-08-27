# BFF Session

Implements the backend-for-frontend browser session: Keycloak Authorization Code + PKCE login, the OAuth
callback, session lookup, silent token refresh, and logout, plus the Origin/CSRF protection that guards every
browser-session mutation across the whole application.

## Responsibility

- Starting and completing the Keycloak Authorization Code + PKCE login flow for human users.
- Issuing, reading, refreshing, and revoking the encrypted `lef_session` cookie and the paired `lef_csrf_token`.
- Resolving a human identity's active organization membership at authentication time
  (`HumanMembershipResolver`), so a disabled membership invalidates the session on the next request.
- Enforcing Origin and CSRF double-submit checks on every unsafe request authenticated by the session cookie,
  application-wide (`BrowserSessionMutationGuard`, exported again and installed globally by
  [`auth`](../auth/README.md)).

## Non-Responsibilities

- No M2M/OIDC bearer authentication (owned by [`auth`](../auth/README.md)); this module only produces one of
  the two credential kinds `auth` accepts.
- No role/permission policy — authorization decisions are made by the `PermissionsGuard` in `auth`, not here.
- No membership/organization persistence — this module reads the `OrganizationMembership` and
  `ExternalIdentity` rows owned by [`identity`](../identity/README.md); it does not own or write them.

## Public API

[`src/index.ts`](src/index.ts) exports only `BffSessionModule` and `BffSessionCredentialAuthenticator`. The
controller, DTOs, guards (`OriginGuard`, `CsrfGuard`, `BrowserSessionMutationGuard`), configuration, session
crypto, and Redis stores are internal implementation, not part of the intentional public surface.
`BrowserSessionMutationGuard` is listed in the Nest `exports` array of `bff-session.module.ts` so `auth` can
install it globally, but it is not part of this module's own `src/index.ts` barrel.

This module's own source reaches into internals of `auth` by deep import rather than through the public barrel
`auth` exposes: `Public`, `CurrentPrincipal`, `BFF_SESSION_COOKIE_NAME` (from the `credential-extractor` file in
`auth`), and `getAuthPrincipal`. Each of those symbols is present on the `auth` barrel except
`BFF_SESSION_COOKIE_NAME`, which is genuinely internal to `auth`. This is a real, if narrow, cross-module
coupling worth knowing about rather than a pattern to imitate.

## Dependencies

- [`identity`](../identity/README.md) — `HumanIdentityResolver`, `OrganizationMembership`, `ExternalIdentity`,
  and the `AuthPrincipal`/role/permission types.
- [`auth`](../auth/README.md) — by deep import only (see above), for the `@Public()`/`@CurrentPrincipal()`
  decorators, the session cookie name constant, and the current-principal accessor.

## HTTP Surface

`BffSessionController` at `v1/auth`:

| Method | Path               | Access                                                                                                                                        |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `v1/auth/login`    | Public — redirects to Keycloak with a PKCE S256 challenge                                                                                     |
| `GET`  | `v1/auth/callback` | Public — exchanges the authorization code, sets the session/CSRF cookies                                                                      |
| `GET`  | `v1/auth/session`  | Authenticated (bearer or session cookie) — returns the current `AuthPrincipal`                                                                |
| `POST` | `v1/auth/logout`   | Authenticated; unsafe method, so `BrowserSessionMutationGuard` also requires a matching Origin and CSRF token for a `human_session` principal |

## Persistence

None owned. Session and pending-login state live in Redis (`RedisSessionStore`, `RedisPendingLoginStateStore`),
not Postgres.

## Configuration

- `APP_BASE_URL`
- `OIDC_ISSUER_URL`
- `BFF_CLIENT_ID`
- `BFF_CLIENT_SECRET`
- `SESSION_IDLE_TIMEOUT_MS` (optional, default 8 hours)
- `SESSION_ABSOLUTE_TIMEOUT_MS` (optional, default 24 hours)
- `SESSION_ENCRYPTION_KEY`

`isSecureCookie` is derived from the scheme of `APP_BASE_URL` rather than read from its own variable.

## Validation

Focused tests live in `src/`, including `application/bff-session-flow.service.spec.ts`,
`application/human-membership-resolver.service.spec.ts`, `application/session-token-refresher.service.spec.ts`,
`infrastructure/http/browser-session-mutation.guard.spec.ts`, `infrastructure/http/csrf.guard.spec.ts`,
`infrastructure/http/origin.guard.spec.ts`, `infrastructure/redis/redis-session-store.spec.ts`,
`bff-session-guard-wiring.integration.spec.ts`, and the live-Keycloak-gated
`bff-session-flow.live-keycloak.integration.spec.ts` (real login, disabled-membership invalidation, replay
rejection, and a genuine CSRF/Origin round trip).

[`bruno/bff-sessions`](../../../../bruno/bff-sessions/README.md) exercises the HTTP-boundary behavior that
doesn't require a real Keycloak session: unauthenticated `401` responses on `session` and `logout`, a correctly
constructed PKCE login redirect, and login-state/`state` mismatch rejection on `callback`. The full authenticated round
trip — including CSRF/Origin enforcement against a genuine cookie — is covered instead by
`bff-session-flow.live-keycloak.integration.spec.ts` above.
