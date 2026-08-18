# Add Redis-backed browser sessions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow a browser user to sign in through Keycloak without exposing OAuth tokens to browser JavaScript. The NestJS API acts as a backend for frontend, stores tokens in Redis, and presents the browser with an opaque session cookie.

## Progress

- [x] Add login, callback, session, and logout endpoints.
- [x] Add encrypted Redis sessions and CSRF protection.
- [x] Add browser-flow and failure-path integration tests.
- [x] Run full validation (typecheck, lint, jest, live-stack pass, Bruno) and commit.

## Surprises & Discoveries

- `BFF_CLIENT_SECRET` is a required (non-optional) config value, so the containerized `api` service in `docker/compose.yaml` needs a real, working secret to boot at all — even before anyone exercises the BFF flow. Keycloak's own auto-generated per-client secret isn't known until `pnpm keycloak:provision` runs against a live realm, which happens after Compose brings the container up, so a static value can't be read from that. Fixed by having `createBffClient()` set an explicit, fixed, checked-in dev-only secret (`BFF_CLIENT_DEV_SECRET`) on the Keycloak client itself, matching `docker/secrets/admin_apikey.txt`'s existing precedent for fixed dev-only secrets, and wiring `docker/secrets/bff_client_secret.txt` with the same value. `provision()` still fetches and returns the secret via the client-secret endpoint (now just confirming what was set, not discovering a random value).
- Found and fixed a pre-existing bug while extending `CredentialScheme`: `LegacyApiKeyCredentialAuthenticator.supports()` was `scheme === 'x-api-key' || !isJwtShapedToken(token)` — the second branch had no scheme guard, so once a `'session-cookie'` scheme existed (random, non-JWT-shaped tokens), it would incorrectly claim to support session-cookie credentials and reject them as invalid API keys before `BffSessionCredentialAuthenticator` ever saw them. Fixed with an explicit `scheme === 'bearer'` guard on that branch, with a regression test.
- Cookie parsing is deliberately duplicated (once as a private helper in `auth`'s `credential-extractor.ts`, once in `bff-session/infrastructure/http/parse-cookie-header.ts`) rather than shared — it's a 10-line pure function, and promoting it to a third shared library for that would be disproportionate. `BFF_SESSION_COOKIE_NAME` itself has exactly one definition (in `credential-extractor.ts`), deep-imported by `bff-session` wherever needed, so the cookie *name* the two dispatch paths agree on has a single source of truth even though the parsing logic doesn't.
- `RolePermissionPolicy.effectivePermissionsFor` needed no changes for the new `'human_session'` credential kind — it already only special-cases `'service_client'` and falls through to the role-permission table otherwise, which is exactly right for a session principal.
- `AuthModule` now transitively needs a `Redis` provider and full BFF env config (`APP_BASE_URL`, `BFF_CLIENT_ID`, `BFF_CLIENT_SECRET`, `SESSION_ENCRYPTION_KEY`) to construct at all, since it imports `BffSessionModule`. This broke the pre-existing `oidc-permission-check.live-keycloak.integration.spec.ts` (from PR 3), which builds a Nest testing module around `AuthModule` directly without the app's global `RedisModule` registration. Fixed by adding a small `@Global()` test-only Redis module (`lazyConnect: true`, since that test never exercises BFF session code) and setting placeholder BFF env vars in its `beforeAll`, mirroring the same fix applied in this PR's own live-Keycloak test.
- **Real bug found only by manual live testing, not by any automated test**: `GET /v1/auth/session` returned `{}` against the actual bootstrapped app. `main.ts` registers a global `ClassSerializerInterceptor` with `strategy: 'excludeAll'`, which strips every field from a plain returned object unless it's an instance of a class with `@Expose()`-decorated fields (matching every other controller's existing `@SerializeOptions({ type: SomeResponseDto })` pattern) — `getSession()` was just returning the raw `AuthPrincipal` object with no such DTO. Fixed by adding `SessionResponseDto implements AuthPrincipal` (all fields `@Expose()`d) and `@SerializeOptions({ type: SessionResponseDto })` on the handler. The bug was invisible to `bff-session-guard-wiring.integration.spec.ts` and `bff-session-flow.live-keycloak.integration.spec.ts` because neither test wired the global interceptor, so both asserted against the unserialized raw object and passed regardless of whether serialization worked. Fixed by wiring `ClassSerializerInterceptor` in both test files' `app.useGlobalInterceptors(...)` (matching `main.ts` exactly), so this class of bug is now caught by the test suite, not just by manual curl testing against a live app.
- The containerized `api` service cannot complete a real login (token exchange fails with 401) because it cannot reach Keycloak over `localhost:58080` from inside its own network namespace — this is the exact, already-documented PR 3 limitation, not a regression. Full manual verification (login → session → CSRF/Origin → logout → disabled-membership rejection) was done running the app on the host instead, exactly as PR 3 established.
- Keycloak's declarative user profile silently forces a `VERIFY_PROFILE` required action on a user missing `firstName`/`lastName`, regardless of an explicit `requiredActions: []` on creation — this blocked the live-Keycloak test's login flow at a Keycloak-hosted page instead of reaching the callback. Fixed by always setting `firstName`/`lastName` when seeding test users.

## Decision Log

- Decision: Use Authorization Code with PKCE S256 and server-side token storage.
  Rationale: Browser code never needs to handle access or refresh tokens.
  Date/Author: 2026-08-14, project planning.
- Decision: Default local base URL is `http://localhost:53000`.
  Rationale: It matches the existing Compose-published API endpoint while remaining configurable for a later same-origin frontend proxy.
  Date/Author: 2026-08-14, project planning.
- Decision: New BFF session logic lives in its own library module (`src/libs/modules/bff-session/`), not folded into the existing `auth` module.
  Rationale: `auth` already owns three different credential mechanisms (legacy key, M2M OIDC); adding full OAuth/session/CSRF machinery directly into it would violate the small-purpose-specific-module rule. Confirmed with the user via AskUserQuestion before implementation.
  Date/Author: 2026-08-17, implementation.
- Decision: This PR requires exactly one active `OrganizationMembership` per human identity to complete login; zero or multiple active memberships reject with `403`. Multi-organization selection is out of scope, deferred to a later plan.
  Rationale: Memberships are currently seed/admin-only data until PR 7 (invite-only onboarding) makes them user-manageable, so the restriction costs nothing today. Confirmed with the user via AskUserQuestion before implementation.
  Date/Author: 2026-08-17, implementation.
- Decision: `auth.module.ts` imports `BffSessionModule` directly (one direction only); `bff-session`'s own files never import `auth.module.ts` or its barrel, only deep-imported leaf files (`public.decorator.ts`, `current-principal.decorator.ts`, `credential-extractor.ts`, `credential-authenticator.ts`) that have no dependency back on `auth.module.ts`.
  Rationale: `AuthGuard`/`PermissionsGuard` are wired as the global `APP_GUARD`, and `@Public()`/`@CurrentPrincipal()` are plain functions rather than DI tokens, so `bff-session` never needs a DI-level import from `auth` — avoiding the circular-module-evaluation risk the existing `auth`/`api-key` comment already documents for a similar case.
  Date/Author: 2026-08-17, implementation.
- Decision: Give the Keycloak BFF client a fixed, checked-in dev-only secret instead of relying on Keycloak's auto-generated one.
  Rationale: see Surprises & Discoveries above — the containerized API needs a working `BFF_CLIENT_SECRET` to boot, and that can't be sourced from Keycloak's own randomness without a provisioning step running first.
  Date/Author: 2026-08-17, implementation.
- Decision: CSRF uses a double-submit cookie (compare `lef_csrf_token` cookie against an `x-csrf-token` header), not a server-tracked synchronizer token.
  Rationale: No Redis round-trip needed in the guard itself; combined with the independent `OriginGuard` as defense in depth, which covers double-submit's well-known cookie-only weakness.
  Date/Author: 2026-08-17, implementation.
- Decision: Token refresh happens on-demand at request time (checked on every `BffSessionCredentialAuthenticator.authenticate()` call), not via a scheduled sweep job.
  Rationale: A periodic sweep would need new BullMQ job machinery disproportionate to dev-only infra, and can't do anything a request-time check can't do better — a session nobody is using doesn't need its tokens kept fresh at all.
  Date/Author: 2026-08-17, implementation.
- Decision: The entire `SessionRecord` is encrypted as one JWE (via `jose`'s `EncryptJWT`/`jwtDecrypt`, `A256GCM`), not just the token fields, using a raw 32-byte `SESSION_ENCRYPTION_KEY` rather than a KDF-derived one.
  Rationale: One encrypt/decrypt call, no partial-field branching; matches every other secret in this repo being a raw `@IsFileVar()` value; key rotation/multi-tenant management is out of scope for disposable dev infrastructure.
  Date/Author: 2026-08-17, implementation.

## Outcomes & Retrospective

All acceptance criteria met and verified:
- `pnpm typecheck` and `pnpm lint` clean.
- Full `jest` suite passes with 0 skipped: 89 suites, 481 tests + 1 pre-existing todo, including all four live-gated suites (`TEST_POSTGRES_URL`, `TEST_CREDITS_POSTGRES_URL`, `TEST_OIDC_*`, and the new `TEST_BFF_*`) run against real Postgres/Redis/Keycloak.
- The new `bff-session-flow.live-keycloak.integration.spec.ts` drives a real Keycloak-hosted login form submission end to end and proves: a member completes login and gets back exactly the `AuthPrincipal` shape with no token fields present; disabling the membership mid-session rejects the very next request; a replayed authorization code/state is rejected; an `owner`-role user (MFA-required) cannot reach the callback without satisfying Keycloak's OTP step.
- From-scratch live-stack pass (fresh containers, empty schema, freshly reprovisioned Keycloak realm): confirmed the containerized `api` boots successfully with the new required BFF env vars/secrets; manually drove the full login→session→CSRF/Origin-checked-logout→disabled-membership round trip by running the app on the host (working around the pre-existing, documented container-to-Keycloak networking gap from PR 3); confirmed the legacy API-key path still works unaffected (`GET /credits/:organizationId` with `X-Api-Key`); confirmed Swagger doc generation is unaffected.
- Found and fixed one real production bug during manual testing (not caught by any automated test until the test files were strengthened afterward): `GET /v1/auth/session` returned `{}` due to the global `ClassSerializerInterceptor`'s `excludeAll` strategy stripping the unserialized response — see Surprises & Discoveries.
- `bru run --env local` passes for the new `bruno/bff-sessions` collection (4/4) and, as a regression check, for the pre-existing `bruno/m2m-oidc-authentication` (3/3) and `bruno/api-key-administration` (5/5) collections.

Not yet done: push and open a PR (per standing instruction, only on explicit request); plan 07 (blocked on this plan being confirmed merged).

## Context and Orientation

There is currently no frontend or session layer. The API already uses Redis for BullMQ. PRs 3–5 provide authenticated principals, authorization policy, and organization-owned resources that a session principal can reuse.

## Scope and Non-Goals

Add `GET /v1/auth/login`, `GET /v1/auth/callback`, `POST /v1/auth/logout`, and `GET /v1/auth/session`. Add Redis session storage, server-side token refresh, OAuth state/nonce/PKCE handling, Origin checks, and CSRF tokens. Do not implement frontend UI, social login, or public signup.

## Plan of Work

Create a focused BFF application service and separate Keycloak OAuth and Redis session adapters. Generate state, nonce, PKCE verifier, session ID, and CSRF secret with cryptographic randomness. Encrypt provider tokens before Redis storage. Rotate the session identifier at authentication. Resolve membership and active organization from application state on protected requests. Invalidate local and Keycloak sessions on logout.

## Interfaces and Dependencies

Add `APP_BASE_URL`, session-encryption secret, session idle timeout, and absolute timeout configuration. Defaults are eight-hour idle and 24-hour absolute lifetimes. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` whenever `APP_BASE_URL` uses HTTPS. This plan depends on PRs 2, 4, and 5 and unlocks onboarding.

## Acceptance Criteria

- Login uses Authorization Code, PKCE S256, state, and nonce.
- OAuth tokens never appear in browser-visible responses, storage, or logs.
- Callback replay, invalid state, invalid nonce, and invalid PKCE are rejected.
- Session fixation is prevented by rotating the session ID after login.
- State-changing session requests without valid Origin and CSRF values are rejected.
- Refresh occurs server-side and logout invalidates Redis and Keycloak sessions.
- Disabled memberships stop authorizing new requests.
- Privileged users cannot establish a usable session until Keycloak MFA requirements are satisfied.

## Validation

Run focused OAuth, encryption, cookie, CSRF, expiry, and session tests; run a browser-flow integration test against local Keycloak; exercise refresh, logout, callback replay, Redis loss, and disabled membership; then run all project checks.

## Idempotence and Recovery

Repeated login starts replace prior transient state safely. Redis loss logs browser users out without corrupting persistent application data. Resetting Redis and signing in again restores local development.

## Artifacts and Notes

Record sanitized redirect URLs, cookie attributes, and test transcripts without tokens.

## Plan readiness

Ready to implement after PRs 2, 4, and 5.
