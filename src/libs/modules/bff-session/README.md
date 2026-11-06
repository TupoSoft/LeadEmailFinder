# BFF Session

## Responsibility

Owns the narrow browser authentication boundary and maps verified native Better Auth sessions to local human
principals. Better Auth is the only active browser session store. The native reader validates the database-backed
session with cookie caching disabled, resolves or creates the external identity under `AUTH_IDENTITY_ISSUER`, and
returns framework-free facts through `VerifiedHumanSessionReader`.

Each business authentication rereads local memberships and requires exactly one active membership. Owners,
administrators, and platform administrators also require proof of MFA for that session. The safe state reader
returns only `signed_out`, `organization_setup_required`, `mfa_enrollment_required`, `mfa_verification_required`, or
`authenticated`. Only a genuinely empty membership list permits setup state; disabled-only and ambiguous memberships
are rejected. Enrollment alone never proves MFA.

This is the first slice of `better-auth/03`. Magic-link and MFA mutations and logout deliberately return redacted
`503 { code: 'authentication_unavailable' }` after ingress checks until the next slice implements token consumption,
attempt limits, MFA completion writes, and authoritative revocation. No session can currently acquire a nonzero
MFA completion marker. This intermediate checkout cannot complete browser sign-in or sign-out. Browser screens,
invitation provisioning, and live fixtures remain for the later checklist items.

## Non-Responsibilities

No native catch-all HTTP handler, provider JSON proxy, registration, password login, machine authentication,
organization persistence, permission enforcement, or global authenticator composition. The host composes guards;
`auth` does not depend on this module. Inactive legacy OAuth/Redis implementation files remain until the planned
cleanup, but the production module registers none of those adapters or services.

## Public API

`src/index.ts` exports `BffSessionModule`, `BffSessionCredentialAuthenticator`, `BrowserSessionMutationGuard`,
`VERIFIED_HUMAN_SESSION_READER`, the `VerifiedHumanSessionReader` and `VerifiedHumanSession` contracts, and
`AuthenticationUnavailableError` for the host's redacted failure translation. Nest exports the authenticator,
mutation guard, and verified-reader token. The reader is the limited identity capability intended for later
onboarding; zero memberships never produce a business principal.

`VerifiedHumanSessionReader.read(credential)` returns undefined for an unusable session. Its result contains only
native user ID, local external identity ID, verified email, session ID, creation/expiry/absolute deadline times in
epoch milliseconds, and a session MFA timestamp (zero when unproven). Raw credentials, HTTP headers, native tokens,
and SDK/database objects never appear in the result. The native factor reader is internal and exposes enrollment
only.

`BrowserSessionMutationGuard.checkSessionMutation(request)` checks application Origin (or same-origin Referer)
and double-submit CSRF on an already verified native-session route without fabricating a business principal. The
global guard applies the same checks to every unsafe business request authenticated by a human principal.

## Dependencies

- [`identity`](../identity/README.md): external identity resolution, uncached membership reads including disabled rows,
  current-account projection, and principal types.
- [`auth`](../auth/README.md): credential contracts, current-principal access, public-route metadata, and machine
  permission grant policy.

Infrastructure uses the singleton technical `better-auth` runtime. Native server API calls use `asResponse: true`,
and request-local transport scopes forward each returned `Set-Cookie` independently, including cleanup on rejection.
The host's `BrowserAuthGuard` owns that scope for business authentication; public native-session routes use their
own scope. Bearer credentials retain precedence and a failed supplied API key never falls back to the cookie.

## HTTP Surface

| Method | Route | Current behavior |
| --- | --- | --- |
| POST | `/v1/auth/magic-link/request` | Validates `{ email, destination? }`, requires application Origin, then 503 |
| POST | `/v1/auth/magic-link/verify` | Validates `{ token }`, requires application Origin, then 503 |
| GET | `/v1/auth/sign-in-state` | Returns only `{ state }`; bootstraps CSRF for a usable native identity |
| POST | `/v1/auth/mfa/enroll` | Empty body; verified native session, Origin and CSRF required, then 503 |
| POST | `/v1/auth/mfa/verify` | `{ code }`; verified native session, Origin and CSRF required, then 503 |
| POST | `/v1/auth/mfa/recover` | `{ code }`; verified native session, Origin and CSRF required, then 503 |
| GET | `/v1/auth/session` | Existing safe current-account document |
| POST | `/v1/auth/logout` | Empty body; verified native session, Origin and CSRF required, then 503 |

Unsupported body fields are rejected. Legacy `/login` and `/callback`, native verification GETs, factor disable,
secret retrieval, and arbitrary native routes are absent. The host installs `Cache-Control: no-store` and
`Referrer-Policy: no-referrer` for all auth responses before parsers and logging, including malformed JSON/errors.

Current-account preserves exact `401 { code: 'authentication_required' }` for missing/unusable authentication and
`403 { code: 'human_session_required' }` for machine principals. Its successful document contains only email,
membership, organization, presentation capabilities, and grantable machine permissions. Native IDs and session
facts never enter browser response documents. Limited sessions can reach the guarded logout boundary even with
disabled memberships; this slice never reports a successful logout without revocation.

## Persistence

Native sessions live in PostgreSQL tables owned by the shared runtime. No active Redis browser session, encrypted
provider-token record, or native cookie cache exists. Cookies are `lef_session` on HTTP and `__Secure-lef_session`
on HTTPS, HttpOnly, SameSite=Lax, path `/`, and Secure on HTTPS. Duplicate values for the configured cookie are
unusable. CSRF uses `lef_csrf_token` and `x-csrf-token` and preserves an existing token across bootstrap reads.

The foundation derives the absolute bound from native creation time plus configured duration and treats MFA as
unproven. Persisted server-owned deadline/MFA fields, rotation preservation, replacement fencing, idle renewal
policy, pending magic-link attempts, limiters, and revocation belong to the next item. No schema changes or migrations
are introduced here.

## Configuration

Active composition reads `APP_BASE_URL`, `SESSION_IDLE_TIMEOUT_MS` (default eight hours), and
`SESSION_ABSOLUTE_TIMEOUT_MS` (default 24 hours), plus the shared runtime's documented native/database/mail settings.
OIDC client secrets and session encryption keys are no longer read by this module's production composition.
The next slice applies the configured idle policy to native renewal. Other modules still use Keycloak until their
own cutover items.

## Validation

Focused application, native adapter, API DTO/controller, host cookie-transport, membership adapter, and module wiring
tests cover safe projection, all state categories, role changes, disabled/ambiguous memberships, cookie naming and
forwarding, unsupported routes, Origin/CSRF, API-key precedence, malformed bodies, and redacted failures.

```sh
corepack pnpm test -- src/libs/better-auth src/libs/modules/auth src/libs/modules/bff-session src/libs/modules/identity src/lead-email-finder-api/src/authentication src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
```

HTTP tests need permission to bind local sockets. Environment-gated database and historical Keycloak suites are
separate from unit/HTTP evidence. The owned real-runtime suite is `corepack pnpm test:auth-runtime` and requires
Docker; updated full sign-in/browser fixtures remain later work. Bruno coverage is in
[`bruno/bff-sessions`](../../../../bruno/bff-sessions); run `bru run --env local` there against the owned stack.
