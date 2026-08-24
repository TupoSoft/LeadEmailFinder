# Enforce CSRF protection for browser-session mutations

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Every unsafe request authenticated by the `lef_session` browser cookie must prove both the configured application
origin and the double-submit CSRF token. After this change, a same-site but cross-origin page cannot use a victim's
browser session to buy credits, manage members or service clients, administer proxies, or start verification, while
OIDC bearer clients and signed public webhooks continue to work without browser CSRF headers.

## Progress

- [x] (2026-08-24) Add a global browser-session mutation guard after authentication.
- [x] (2026-08-24) Remove logout-only wiring and cover public, bearer, safe-method, and cookie mutation behavior.
- [x] (2026-08-24) Update the nearest Bruno authentication coverage and run runtime regressions.
- [x] (2026-08-24) Run focused and full validation and record the outcome.

## Plan dependencies

- `auth/06`

## Surprises & Discoveries

- `OriginGuard` and `CsrfGuard` are registered as providers in `BffSessionModule` but are attached only to
  `POST /v1/auth/logout`.
- `AuthGuard` accepts either a bearer token or the `lef_session` cookie globally, so all other mutating controllers
  currently inherit cookie authentication without the BFF's origin or CSRF checks.
- A module-boundary refactor (PR #408, merged after this ExecPlan was written) relocated the whole tree: `AuthModule`,
  `AuthGuard`, `BffSessionModule`, `OriginGuard`, and `CsrfGuard` now live under `src/libs/modules/{auth,bff-session}/src/...`,
  addressed by the `@tuposoft/lead-email-finder/modules/*` path aliases. No behavior changed, only paths.
- The actual CSRF cookie constant is `BFF_CSRF_COOKIE_NAME = 'lef_csrf_token'` (`bff-cookie-names.ts`), not `lef_csrf`
  as this plan's Context section originally said.
- No other existing HTTP integration spec (`organization-onboarding-http`, `service-client-management-http`, etc.)
  wires `OriginGuard`/`CsrfGuard`/the new guard into its synthetic test module, so none of them exercise browser-cookie
  mutations and none needed changes — each test module registers its own isolated `APP_GUARD` set.
- The only test that boots the real `AuthModule` end-to-end (`bff-session-flow.live-keycloak.integration.spec.ts`,
  live-Keycloak-gated) never issues a mutating request through the cookie session, so it is unaffected by the new
  global guard.

## Decision Log

- Decision: Enforce the policy globally for authenticated `human_session` principals on `POST`, `PUT`, `PATCH`,
  and `DELETE`; do not scatter decorators across controllers.
  Rationale: CSRF protection is an authentication-transport invariant, and route-by-route wiring is what allowed
  the gap.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Bearer-authenticated service clients and requests without a session principal are outside the browser
  CSRF policy.
  Rationale: They do not rely on ambient browser cookies; public webhooks retain their provider signatures and
  public invitation acceptance retains its bearer invitation token.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Reuse the existing exact-origin and timing-safe double-submit checks.
  Rationale: The current logout behavior is correct; only its scope is incomplete.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: `BrowserSessionMutationGuard` delegates to `OriginGuard`/`CsrfGuard` via constructor injection and calls
  their `canActivate(context)` directly, instead of Nest re-resolving them per request through `@UseGuards`.
  Rationale: Both guards are already stateless `@Injectable()` classes with no per-route metadata dependency. A
  plain method call is simpler than composing another guards-array indirection layer, and it keeps the "one guard,
  one code path" property the Decision Log above already committed to.
  Date/Author: 2026-08-24, implementation.
- Decision: Extend `bff-session-guard-wiring.integration.spec.ts` (not `auth-guard-wiring.integration.spec.ts`) with
  the representative non-logout mutation, adding a throwaway `MutationProbeController` with `@Public()`-mutation and
  protected-mutation routes to that spec's existing test module.
  Rationale: `bff-session-guard-wiring` is the one spec that already wires `OriginGuard`/`CsrfGuard`/`AuthGuard`
  together against the real `BffSessionController`; `auth-guard-wiring` only exercises `AuthGuard`+`PermissionsGuard`
  on GET routes and never touches CSRF/Origin.
  Date/Author: 2026-08-24, implementation.

## Outcomes & Retrospective

Implemented as planned. `BrowserSessionMutationGuard` (`src/libs/modules/bff-session/src/infrastructure/http/browser-session-mutation.guard.ts`)
runs after `AuthGuard` as a second `useExisting` `APP_GUARD` in `AuthModule`, passes safe methods (`GET`/`HEAD`/`OPTIONS`)
and any request without a `human_session` principal straight through, and otherwise delegates to `OriginGuard` then
`CsrfGuard`. `BffSessionModule` now exports it alongside `BffSessionCredentialAuthenticator`. `logout()` lost its
route-level `@UseGuards(OriginGuard, CsrfGuard)` — it is now covered by the same global path as every other mutation.

One implementation wrinkle: the `MutationProbeController.protectedMutate()` test route initially returned the plain
`AuthPrincipal` object and asserted `response.body).toEqual(principal)`, which failed under the spec's global
`ClassSerializerInterceptor({ strategy: 'excludeAll' })` — a plain object with no `@Expose()`-decorated class serializes
to `{}` under that strategy. Reused `SessionResponseDto` (already `@Expose()`-annotated for `GET /v1/auth/session`)
via `@SerializeOptions({ type: SessionResponseDto })` on the probe route, matching the existing controller pattern.

Bruno execution was unavailable in this environment: no local Compose stack (API/Keycloak) was running and the `bru`
CLI is not installed here. Performed static review of `bruno/bff-sessions` and `bruno/credit-purchases` instead.
Neither collection's committed requests needed request/assertion changes: the `bff-sessions` collection only exercises
unauthenticated 401 paths and the login/callback redirects, and credit-purchases already authenticates purely via
bearer token with no Origin/CSRF headers, which remains valid. Updated `bruno/bff-sessions/README.md` to document
that Origin/CSRF enforcement is now global rather than logout-only. Bruno cookie-path execution against a genuine
session remains unverified by Bruno and is covered instead by the Jest integration tests, per the plan's own
fallback in "Plan of Work" and "Idempotence and Recovery".

Focused (`browser-session-mutation.guard.spec.ts`, `bff-session-guard-wiring.integration.spec.ts`) and full validation
all pass; see Validation below for exact commands and results.

**Follow-up live-stack pass (2026-08-24):** the mocked/wired specs above prove the guard's logic and its Nest
wiring. Nothing had yet driven the guard against a real Keycloak login and a real double-submit cookie pair issued
by the actual running server. Ran `pnpm dev:reset -- --confirm-project=LEF` to get a fresh disposable stack, then
added a new case, "enforces the global Origin/CSRF guard for a genuinely authenticated browser-session mutation",
to `bff-session-flow.live-keycloak.integration.spec.ts`.

The new case creates a real Keycloak user and `member`-role membership (same pattern as the file's existing first
test) and completes a real hosted-login-form round trip. It then drives `POST /v1/auth/logout` five times through
the real `AuthModule` (this file's `beforeAll` imports the genuine module, so the new global guard is live):

1. No Origin/Referer at all — expects `403`.
2. A spoofed cross-origin `Origin` header carrying a CSRF token an attacker could only obtain by also controlling
   the cookie, the actual attack this guard exists to stop — expects `403`.
3. A correct Origin with no CSRF header — expects `403`.
4. A correct Origin with a wrong CSRF header — expects `403`.
5. A matching Origin and CSRF token — expects `204`, with the session genuinely invalidated afterward
   (`GET /v1/auth/session` → `401`).

Between steps 4 and 5 it also checks that the session is still valid after all four rejections
(`GET /v1/auth/session` → `200`).

Verified the new test is not vacuous by temporarily removing the second `APP_GUARD` binding from `auth.module.ts`
and rerunning only that test: it failed exactly as expected (first assertion got `204` instead of `403`), then
restored the binding and confirmed the full file passes again.

The containerized `api` service itself could not be used to drive this. Confirmed the already-documented PR 3/PR 6
gap still applies: `OIDC_ISSUER_URL` is unreachable from inside the container's own network namespace during token
exchange (`401 Authorization code exchange failed`), which is not a regression and matches this plan's own Context
section and the discoveries recorded in `auth/06`. This ran the same way the existing tests in `auth/06` do
instead: a host-side NestJS test process against the real Postgres/Redis/Keycloak containers.

Also ran the full set of previously live-gated specs together against this same stack:
`keycloak-organization-admin.live-keycloak`, `service-client-management.live-keycloak` (which also imports the
real `AuthModule` and drives bearer-authenticated mutations through the new global guard),
`oidc-permission-check.live-keycloak`, `jose-oidc-token-verifier.live-keycloak`, `credits.service.integration`, and
`identity-schema.integration`. All 7 suites and 22 tests passed, confirming no regression to bearer/M2M mutation
paths. All ad hoc Keycloak users, organizations, and membership rows created directly against the dev database for
a manual curl-driven login attempt (abandoned once the container networking gap was confirmed) were deleted
afterward; see Validation for exact results.

## Context and Orientation

`AuthModule` registers `AuthGuard` as an `APP_GUARD`. It authenticates the request and stores `AuthPrincipal` on
the Express request. `BffSessionCredentialAuthenticator` produces `credentialKind: 'human_session'`; OIDC Client
Credentials produces `service_client`. The existing `OriginGuard` compares `Origin` or `Referer` to
`APP_BASE_URL`, and `CsrfGuard` compares the readable `lef_csrf` cookie with the CSRF request header using
`timingSafeEqual`. `BffSessionController.logout()` is the only consumer today.

## Scope and Non-Goals

Apply the existing BFF origin and CSRF policy to every unsafe session-authenticated endpoint. Preserve safe GET/HEAD
behavior, public route semantics, M2M bearer behavior, webhook signature authentication, cookie names/options, and
response schemas. Do not add CORS, change SameSite policy, introduce per-controller decorators, redesign browser
login, or alter permissions.

## Plan of Work

Add one browser-mutation guard in the BFF-session infrastructure boundary. It runs after `AuthGuard`, reads the
stored principal, and returns immediately for safe methods, public requests without a principal, and
`service_client` principals. For an unsafe `human_session` request it executes the existing origin and CSRF checks.
Export the guard instance from `BffSessionModule` and register it as the second `APP_GUARD` in `AuthModule` with
`useExisting`, preserving authentication-before-CSRF ordering without constructing a second guard outside the BFF
module's dependency scope. Remove `@UseGuards(OriginGuard, CsrfGuard)` from logout so the endpoint uses the same
global path exactly once.

Add focused unit tests for method and principal classification. Extend the auth/BFF HTTP wiring tests with a
representative non-logout mutation, proving rejection for missing/wrong origin or token, acceptance for matching
cookie/header, bearer compatibility without CSRF headers, safe GET behavior, and public mutation behavior. Keep
the existing logout cases as regression coverage.

Update `bruno/bff-sessions` documentation/requests for the changed browser-session rejection behavior when a local
session fixture is supplied, and run `bruno/credit-purchases` to prove M2M bearer mutations remain compatible. Do
not add committed session IDs or secrets; if a repeatable authenticated browser fixture is unavailable, record that
Bruno cookie-path execution remains unverified and rely on the real HTTP integration test for that boundary.

## Interfaces and Dependencies

No public endpoint or DTO changes. Add one internal Nest guard exported by `BffSessionModule` and one `APP_GUARD`
binding in `AuthModule`. The guard depends on the existing request-principal contract, BFF configuration, cookie
parser, cookie/header names, and origin/CSRF validation logic.

## Acceptance Criteria

- An unsafe request authenticated as `human_session` returns `403` when origin/referer is absent or wrong.
- An unsafe `human_session` request returns `403` when the CSRF cookie/header pair is missing or mismatched.
- The same request reaches its controller when origin and CSRF values are valid.
- Safe session-authenticated reads do not require a CSRF token.
- Unsafe `service_client` bearer requests retain their existing authentication and authorization behavior without
  CSRF headers.
- Public payment webhooks and public invitation acceptance retain their existing signature/token boundaries.
- Logout continues to enforce the same origin and CSRF checks once, through the global guard.

## Validation

Run the new guard spec plus `auth-guard-wiring.integration.spec.ts` and
`bff-session-guard-wiring.integration.spec.ts` outside socket restrictions when needed. Run affected controller
integration specs, `corepack pnpm typecheck`, `corepack pnpm lint`, and the full Jest suite with temporary paths set
to `/tmp`. Run `bru run --env local` for the updated `bruno/bff-sessions` cases when a disposable browser session is
available and always run `bruno/credit-purchases` to verify the M2M mutation path.

**Results (2026-08-24):**

- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest browser-session-mutation.guard.spec.ts bff-session-guard-wiring.integration.spec.ts`
  — 19/19 passed.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest src/libs/modules/bff-session src/libs/modules/auth` — 168/179
  passed, 11 skipped (live-Keycloak-gated specs; none touched by this change).
- `npx tsc --noEmit -p tsconfig.json --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo` — clean. (`corepack pnpm typecheck`
  itself failed in this sandbox on `EACCES` writing `dist/tsconfig.tsbuildinfo`, a root-owned preexisting directory
  unrelated to this change; ran `tsc` directly with a writable build-info path instead.)
- `corepack pnpm lint` — 0 errors, 2 preexisting warnings in unrelated files (`load-secrets.spec.ts`,
  `parse-connection-string-options.factory.spec.ts`).
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest` (full suite) — 733/758 passed, 24 skipped, 1 preexisting `todo`.
- `corepack pnpm docs:lint -- bruno/bff-sessions/README.md .harper-dictionary.txt` — Harper passed after adding
  `S256` to the dictionary and splitting some preexisting 66-word prose.
- `bru run --env local` — not run. No local Compose stack (API/Keycloak) was running and the `bru` CLI is not
  installed in this environment. Performed static review only (see Outcomes & Retrospective); Bruno execution
  remains unverified for this change.

**Follow-up live-stack results (2026-08-24):** with `pnpm dev:reset -- --confirm-project=LEF` bringing up a fresh
disposable stack:

- `bff-session-flow.live-keycloak.integration.spec.ts` with `TEST_BFF_*` pointed at the real stack — 4/4 passed,
  including the new genuine-cookie CSRF round trip and the deliberate malicious-Origin case.
- The same file with the second `APP_GUARD` binding temporarily removed from `auth.module.ts` — the new CSRF test
  failed exactly as expected (`403` assertion got `204`), confirming the test is a real regression check; binding
  restored and the file rerun clean afterward.
- All seven previously live-gated suites together (`TEST_BFF_*`, `TEST_ORG_*`, `TEST_SVC_*`, `TEST_OIDC_*`,
  `TEST_CREDITS_POSTGRES_URL`, `TEST_POSTGRES_URL`), `--runInBand` — 22/22 passed. Notably
  `service-client-management.live-keycloak.integration.spec.ts` imports the real `AuthModule` and drives
  bearer-authenticated mutations through the new global guard end to end; it passed unchanged.
- Full `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest --runInBand` with every `TEST_*` var set — 756/759
  passed, 1 suite skipped (`payment-event.handler.integration.spec.ts`, gated on `TEST_POSTGRES_URL` naming and
  unrelated to auth), 1 preexisting `todo`.
- `npx tsc --noEmit` and `corepack pnpm lint` rerun clean after the live-spec addition.
- Manually attempted the same login round trip through the containerized `api` service at `localhost:53000` first;
  confirmed it hits the already-documented PR 3/PR 6 container-to-Keycloak networking gap (`401 Authorization code
  exchange failed`), not a regression from this change. Fell back to the host-side test-process approach the
  existing `auth/06` tests already use.

## Idempotence and Recovery

The change is stateless and safe to repeat. Reverting the second global guard binding restores the prior behavior.
No persistent data, schema reset, or reseed is required. If runtime cookie coverage is blocked by the Keycloak/MFA
fixture, retain the integration-test evidence and record the Bruno limitation rather than weakening the guard.

## Artifacts and Notes

Record a route/method/principal matrix and redacted HTTP statuses. Never store session cookies, CSRF tokens, or
access tokens.

| Method            | Principal                | Origin/CSRF valid | Result | Covered by |
|--------------------|--------------------------|--------------------|--------|------------|
| GET/HEAD/OPTIONS  | any or none               | not checked        | 200/401 (unaffected) | `browser-session-mutation.guard.spec.ts`, existing `GET /v1/auth/session` cases |
| POST/PUT/PATCH/DELETE | none (`@Public()`)     | not checked        | 2xx | `bff-session-guard-wiring`: allows a public mutation |
| POST/PUT/PATCH/DELETE | `service_client`       | not checked (bearer) | 2xx (no CSRF required) | `bff-session-guard-wiring`: allows an authenticated service_client bearer mutation |
| POST/PUT/PATCH/DELETE | `human_session`        | missing or wrong    | 403 | `bff-session-guard-wiring`: `POST /v1/auth/logout` and probe-route rejection cases |
| POST/PUT/PATCH/DELETE | `human_session`        | valid              | reaches controller | `bff-session-guard-wiring`: `POST /v1/auth/logout` and probe-route acceptance cases |

## Plan readiness

Ready to implement.
