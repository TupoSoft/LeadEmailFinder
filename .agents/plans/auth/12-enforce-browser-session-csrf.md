# Enforce CSRF protection for browser-session mutations

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Every unsafe request authenticated by the `lef_session` browser cookie must prove both the configured application
origin and the double-submit CSRF token. After this change, a same-site but cross-origin page cannot use a victim's
browser session to buy credits, manage members or service clients, administer proxies, or start verification, while
OIDC bearer clients and signed public webhooks continue to work without browser CSRF headers.

## Progress

- [ ] (2026-08-20) Add a global browser-session mutation guard after authentication.
- [ ] (2026-08-20) Remove logout-only wiring and cover public, bearer, safe-method, and cookie mutation behavior.
- [ ] (2026-08-20) Update the nearest Bruno authentication coverage and run runtime regressions.
- [ ] (2026-08-20) Run focused and full validation and record the outcome.

## Plan dependencies

- `auth/06`

## Surprises & Discoveries

- `OriginGuard` and `CsrfGuard` are registered as providers in `BffSessionModule` but are attached only to
  `POST /v1/auth/logout`.
- `AuthGuard` accepts either a bearer token or the `lef_session` cookie globally, so all other mutating controllers
  currently inherit cookie authentication without the BFF's origin or CSRF checks.

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

## Outcomes & Retrospective

Not started.

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

## Idempotence and Recovery

The change is stateless and safe to repeat. Reverting the second global guard binding restores the prior behavior.
No persistent data, schema reset, or reseed is required. If runtime cookie coverage is blocked by the Keycloak/MFA
fixture, retain the integration-test evidence and record the Bruno limitation rather than weakening the guard.

## Artifacts and Notes

Record a route/method/principal matrix and redacted HTTP statuses. Never store session cookies, CSRF tokens, or
access tokens.

## Plan readiness

Ready to implement.
