# Sign in and Navigate the Application Shell

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give a browser user one secure way to enter and move through the application. A user can open a protected route,
sign in through the existing Keycloak-backed BFF flow, and return to the safe route they originally requested. They
can then navigate an accessible application shell whose links reflect their effective capabilities and sign out.
A developer can observe the complete flow in a same-origin local runtime with live Keycloak. No OAuth token is
available to browser JavaScript. Session and CSRF cookies drive generated-client calls, while expired or forbidden
sessions lead to distinct, recoverable screens.

## Progress

- [ ] (2026-08-31) Add a safe post-login destination to the existing callback-error contract.
- [ ] (2026-08-31) Add session bootstrap and authentication routes using the shared generated-client transport.
- [ ] (2026-08-31) Install and configure the shared TanStack Query provider and explicit retry defaults.
- [ ] (2026-08-31) Clear every authenticated query and mutation at identity/session boundaries.
- [ ] (2026-08-31) Build the responsive, capability-aware application shell and its recovery states.
- [ ] (2026-08-31) Add focused API, component, accessibility, and live-Keycloak Playwright coverage.
- [ ] (2026-08-31) Run repository, design-contract, generated-client, and browser validation and record the outcome.

## Plan dependencies

- `frontend/06`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Browser authentication continues to use the API's BFF session and same-origin cookies; the web app does
  not install a Keycloak or generic OIDC SDK and never reads, stores, or forwards OAuth access or refresh tokens.
  Rationale: The existing BFF keeps bearer credentials out of browser JavaScript and already owns refresh and logout.
  Date/Author: 2026-08-31, project planning.
- Decision: A requested post-login destination is accepted only as a safe, same-origin relative application path,
  stored with the server-side login state, and consumed once after callback. Absolute URLs, protocol-relative URLs,
  malformed values, and authentication routes fall back to the application home route.
  Rationale: This preserves the user's task without adding an open redirect or a callback loop.
  Date/Author: 2026-08-31, project planning.
- Decision: Consume the `/auth/error` redirect and stable `login_state_invalid`,
  `authorization_code_exchange_failed`, and `active_membership_required` codes established by `frontend/04`; raw
  Keycloak, token-exchange, membership, and exception messages never appear in the URL or page.
  Rationale: A browser needs a recoverable destination, while provider details are neither stable nor safe UI copy.
  Date/Author: 2026-08-31, project planning.
- Decision: Navigation visibility is derived from effective capabilities returned by the session/current-account
  contract, never inferred from a role name or from browser-held policy tables.
  Rationale: Capability-driven navigation follows the server policy while remaining advisory; every API endpoint
  still performs authoritative authorization.
  Date/Author: 2026-08-31, project planning.
- Decision: A `401` after bootstrap, including one caused by an unusable membership, clears authenticated caches and
  leads to reauthentication with the current safe destination. Current-account `403 human_session_required` clears
  those caches and leads to an account-unavailable route; a feature endpoint's `403` leads to access denied without
  signing out.
  Rationale: Session loss, an unusable account context, and operation-level permission denial have different causes
  and recovery actions.
  Date/Author: 2026-08-31, project planning.
- Decision: Clear all authenticated query and mutation caches on sign-out initiation, session-expiring `401`, unusable
  account context, and before installing a different membership principal.
  Rationale: One application-lifetime query client must never expose the previous person's organization-scoped data,
  even when two users belong to the same organization or a sign-out response is lost.
  Date/Author: 2026-08-31, project planning.
- Decision: Pair cache clearing with an incrementing authentication generation and abort controller. Every
  authenticated response must belong to the current generation before it can update cache or UI, and a restored
  back/forward-cache page must rebootstrap before showing protected content.
  Rationale: Clearing existing cache entries does not stop a late response from an old principal or a browser page
  snapshot from restoring stale account data.
  Date/Author: 2026-08-31, project planning.
- Decision: Propagate sign-out and principal-replacement boundaries to every same-origin tab through a payload-free
  `BroadcastChannel` event.
  Rationale: Server cookie invalidation is shared across tabs, but React state and QueryClient caches are not. A tab
  must hide protected content immediately rather than wait for its next request to discover the boundary.
  Date/Author: 2026-08-31, project planning.
- Decision: Bind the session lineage present at login initiation into the one-time login state. Replace an expected
  existing BFF session through a compare-and-swap session-store operation; never ignore a missing expected session or
  deletion failure and then issue a second live session.
  Rationale: Browser cache isolation does not revoke an old cookie held in another tab. Successful principal
  replacement must make the captured old session unusable, while a stale/racing callback or storage failure must not
  install an orphan session.
  Date/Author: 2026-08-31, project planning.
- Decision: Root `DESIGN.md` and root `UX-CONTRACT.md`, established by the prerequisite series, are the
  durable visual and behavioral contracts for this work. New shell patterns become shared primitives rather than
  route-local variants.
  Rationale: The first authenticated slice establishes patterns that later billing and verification routes must
  reuse consistently.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan `frontend/01` establishes the web application and source boundaries. `frontend/05` supplies the generated
OpenAPI client and browser transport, while `frontend/06` supplies the same-origin development runtime. This plan
builds on those paths rather than creating another HTTP wrapper or component system.

The API's browser flow lives under `src/libs/modules/bff-session/`. `BffSessionController` currently exposes
`GET /v1/auth/login`, `GET /v1/auth/callback`, `GET /v1/auth/session`, and `POST /v1/auth/logout`. The callback sets
an opaque HTTP-only session cookie and a readable `lef_csrf_token` cookie. Unsafe browser-session requests must send
the matching `x-csrf-token` header and pass the existing same-origin checks. The server stores and refreshes Keycloak
tokens; the frontend has no legitimate reason to see them.

Plan `frontend/04` redirects known callback failures to `/auth/error` with stable safe codes, but a successful
callback still redirects to one configured application base URL. That loses the protected route a user meant to
visit. The frontend must consume the browser capability field from the current-account contract rather than
treating raw principal permissions or role names as authorization truth.

`RolePermissionPolicy` in `src/libs/modules/auth/src/application/role-permission-policy.service.ts` remains the
server-side authorization source. The shell may omit billing, member, or service-client links when the corresponding
capability is absent, but a deep link remains possible and must render the API's authoritative result safely,
including `403` when the server denies it. A missing browser capability does not itself prove that the current
backend permission union will reject the request. The shell
also needs stable geometry during session bootstrap, keyboard-operable navigation, a skip link, honest document
titles, visible focus, and a narrow-viewport navigation pattern that does not obscure content.

## Scope and Non-Goals

This pull request changes only the browser login/`callback` contract needed to preserve a safe destination and render
stable callback failures, generated-client session behavior, authentication routes, shared TanStack Query provider,
and the authenticated application shell. It adds the smallest server and web tests that prove those behaviors and
updates `OpenAPI` only where the browser contract changes.

It does not implement public account registration, password reset, multi-organization switching, or account
settings. Member management, service-client management, billing, verification forms, impersonation, social login,
and role editing also remain outside this plan. It does not replace the BFF, expose tokens, add a second policy
engine to the frontend, or perform unrelated authentication hardening or a catch-all error redesign. Content routes
remain later plans; this pull request supplies their shell.

## Plan of Work

First, complete the BFF redirect contract in `src/libs/modules/bff-session/`. Add an optional login
destination query to the login DTO and carry its normalized value in the existing one-time server-side login state.
Implement one small path-normalization helper with table-driven tests. Accept only a leading-slash application path
under `/app` that resolves on the configured web origin; reject protocol-relative, absolute, encoded-host, malformed,
public, and authentication-loop destinations. Use `/app` as the fallback. The callback consumes the destination from the
validated state rather than from callback query input.

Preserve the exact failure route and code enum from `frontend/04`; do not rename or remap it in this frontend slice.
Unexpected errors continue through the normal server error path rather than being hidden by a new catch-all. Annotate
the new destination query and success redirect for OpenAPI, update `packages/api-client` with `openapi:export` and
`openapi:generate`, run `openapi:check`, and add controller and flow-service tests for success, every existing known
failure, and unsafe destinations.

At login initiation, resolve any presented session cookie before recording a tagged session lineage in the one-time
pending state. Record `replace` with the exact expected session ID only when it resolves to a valid session. When the
cookie is absent, record `fresh`. When it is stale, expired, malformed, or forged, clear both session and CSRF cookies
using the exact path, domain, secure, and SameSite options used to write them, record `fresh`, and send the provider
redirect only after those clearing headers are attached. Never log the observed value. The callback must still match
that lineage: a fresh callback fails if a session cookie appeared meanwhile, and a replacement callback must present
the same old cookie. Treat a mismatch as `login_state_invalid`; do not add a new public callback code.

Replace the callback flow's best-effort `delete(existingSessionId).catch(...)` with a compare-and-swap
`SessionStore.replace` contract. The Redis adapter accepts an expected old session ID, newly generated session ID,
and record, then uses one Lua operation that creates the new entry and deletes the old entry only when the expected
old key still exists. The in-memory adapter implements the same all-or-nothing behavior. A missing or expired
expected key is a replacement conflict, not permission to create a new session; any conflict,
Redis/serialization failure, or controller failure creates no new record and sets no new cookie. A genuinely fresh
lineage uses the ordinary create path only while the callback still has no session cookie. On success, a captured old
cookie receives `401` in another browser context before the new cookie is installed in UI state. Add application,
Redis integration, and two-context HTTP tests for successful replacement, fresh creation, expected-old absence,
injected script failure, replay, and log redaction. Race two distinct valid login states derived from the same old
session and prove exactly one callback replaces it while the loser returns `login_state_invalid` and leaves no orphan
session. Add stale, expired, and forged-cookie login tests proving the response clears both cookies and the subsequent
fresh callback can succeed.

Next, use the generated same-origin, cookie, and CSRF-aware transport from `frontend/05`; do not introduce another
fetch wrapper. Add only the session-specific error normalization and query behavior needed by the shell. Preserve
HTTP status and a safe correlation identifier if the API supplies one, keep business copy outside transport, and
never automatically retry mutations.

Install `@tanstack/react-query` and create the single application `QueryClient` provider at the root composition
boundary. Keep mutation retries disabled by default. Configure authentication and permission failures as
non-retryable, allow only a small bounded retry for explicitly safe transient reads, and require later features to
override polling and stale-time behavior deliberately. Do not add a second query client, persist its cache, or add a
general client-state store. Add one authenticated-cache boundary that calls `QueryClient.clear()` on sign-out
initiation, a session-expiring `401`, current-account `403 human_session_required`, and before replacing a known membership ID
with another. Reinstall only the new safe current-account value after a principal change; never retain mutation
variables or organization data across the boundary.

Give that boundary an incrementing authentication generation and a per-generation `AbortController`. Every
authenticated request captures both; sign-out, `401`, unusable account context, and principal replacement increment
the generation, abort old requests, and clear cache before any new account value is installed. A response from an
older generation is discarded even when its transport ignores abort or resolves in the same event-loop turn. On
`pageshow` with `event.persisted === true`, synchronously hide protected content, advance the generation, abort, and
clear, then rerun session/current-account bootstrap before rendering data. Test late success and failure responses
across sign-out and same-organization principal replacement, plus a back/forward-cache restore that never paints the
previous account snapshot.

Create one same-origin `BroadcastChannel` for session-boundary notifications. Publish a reason-only event on sign-out
initiation and before installing a replacement principal; include no account, organization, credential, cookie, or
token data. A receiving tab must synchronously hide protected content, advance its authentication generation, abort
in-flight requests, clear query and mutation caches, and run fresh session/current-account bootstrap. Do not
rebroadcast received events or let a closed/unavailable channel block local cleanup. Close the channel when the
application shuts down. Test two tabs for sign-out, principal replacement, late responses, duplicate events, and safe
payload shape.

Add session bootstrap and route protection under `apps/web/src/app` and `apps/web/src/features/auth`. The initial
session request renders a stable loading region. An unauthenticated protected route starts login with its normalized
relative path. A post-bootstrap `401` clears every authenticated cache and renders the session-expired recovery
action with the same safe destination. A current-account `403` renders account unavailable; a later feature's `403`
renders dedicated access denied. The callback-error route
maps the stable code to plain, actionable copy and offers a fresh sign-in without replaying callback parameters.
Send the sign-out request through the generated client and CSRF transport, prevent duplicate submission, and clear
authenticated browser caches as soon as sign-out begins. Navigate to the signed-out state only after the server
confirms `204`. An ambiguous logout failure exposes no previous account data, says that server sign-out could not be
confirmed, and offers an explicit retry.

Build the authenticated shell in `apps/web/src/app` and `apps/web/src/shared`, reusing the typography, spacing,
color, icon, focus, elevation, loading, empty, and error rules from root `DESIGN.md` and root `UX-CONTRACT.md`.
Include a skip link, product/home landmark, primary navigation, current-account context,
and a sign-out action. Derive link visibility from effective capabilities, but keep route-level API errors
authoritative. When current-account email is null, render the shared `Email unavailable` fallback without inventing
an address or using membership ID as display copy. Use the shared narrow-viewport navigation primitive; opening it moves focus appropriately, Escape
closes it, route changes close it, and focus returns to its trigger. Keep shell dimensions stable during bootstrap
and respect reduced motion. Give home, sign-in error, access denied, session expired, and not-found states distinct
document titles and headings.

Finally, test the behavior at three levels. API tests prove destination normalization, one-time state consumption,
sanitized callback codes, and unchanged cookie security. Web unit/component tests prove CSRF injection, no token
storage, query retry defaults, nullable-email fallback, capability link mapping, the callback/session/permission error
categories, authenticated-cache clearing, sign-out uncertainty, focus movement, and semantic state copy. A
same-tab test signs in as two different memberships in one organization and proves that no query data or mutation
variables from the first principal are visible to the second.
Playwright also keeps a second tab open and proves sign-out or principal replacement in the first hides protected
content and clears cached data in the second before another API response. It drives a real Keycloak login through the
same-origin local stack and refreshes a protected route. It then
expires the session, signs in again to the preserved destination, verifies forbidden deep-link behavior, opens the
narrow navigation by keyboard, and sends a sign-out request. Run automated accessibility checks on every shell state
and complete the premium static and interactive audit before closing the plan.

## Interfaces and Dependencies

The existing auth paths remain stable. `GET /v1/auth/login` gains an optional safe relative destination query. The
server-side login-state record gains the normalized destination, and `GET /v1/auth/callback` redirects either to
that destination or to the stable frontend callback-error route. The exact query names and error-code enum must be
represented in Swagger so `packages/api-client` owns their TypeScript types. No OAuth token or provider response is
added to any public DTO.

The web app consumes `GET /v1/auth/session` for current account and effective capabilities and
`POST /v1/auth/logout` for logout. Unsafe generated-client calls use the `lef_csrf_token` cookie and
`x-csrf-token` header. The shell owns no Keycloak dependency. It depends only on the routing, API-client generation,
design foundations, and local same-origin runtime delivered by `frontend/06` and its prerequisites.

The public `/` entry remains intact and gains a working sign-in action. Stable authenticated routes are `/app` for
home, `/app/session-expired` for recoverable authentication loss, `/app/account-unavailable` for an unusable human
account context, and `/app/forbidden` for insufficient operation authorization. `/auth/error` renders sanitized
callback failures, and the prerequisite not-found route handles
unknown paths. These browser URLs and behaviors are part of this plan's contract.

## Acceptance Criteria

- Opening a protected `/app/**` URL while signed out completes a live Keycloak login and returns to that exact safe
  URL; an absolute, protocol-relative, malformed, public, or authentication-loop destination returns to `/app` instead.
- Browser JavaScript can access only the opaque session behavior and readable CSRF value. No access token, refresh
  token, authorization code, or Keycloak SDK storage appears in application state, storage, logs, or URLs after the
  callback completes.
- Known callback failures land on `/auth/error` with a stable code and sanitized, actionable copy. Raw provider and
  server exception text is absent.
- The generated-client transport sends same-origin cookies on every API request and the current CSRF cookie/header
  pair on unsafe methods. Sign-out succeeds with `204`; a missing or mismatched CSRF value remains rejected by the API.
- Session bootstrap, slow loading, signed-out, authenticated, expired-session, access-denied, callback-error,
  account-unavailable, logout-pending, logout-failed, and not-found states render without blank screens or layout
  jumps and provide a relevant recovery action.
- Starting sign-out, receiving a session-expiring or unusable-membership `401` or wrong-credential-kind `403`, and
  replacing a membership principal clear all authenticated queries and mutations. A two-user same-tab test, including
  two memberships in one organization, proves no cached response or mutation variable crosses the identity boundary.
- Late responses from an earlier authentication generation cannot repopulate cache or UI after sign-out, a `401`, or
  principal replacement. Returning through the browser back/forward cache hides protected content and completes a
  fresh session/current-account bootstrap before any account data is shown.
- Starting sign-out or replacing the principal in one same-origin tab immediately hides protected content, aborts old
  work, clears authenticated caches, and reboots account context in every other open tab through a secret-free
  session-boundary event.
- A successful login over an existing session atomically installs one new server session and invalidates the
  captured old cookie, including in another tab. An injected session-store failure installs no new cookie/session and
  never leaves both old and new sessions valid. Two distinct callbacks racing from the same expected old session
  produce exactly one replacement; the losing callback is rejected and leaves no orphan session.
- Starting login with a stale, expired, malformed, or forged session cookie clears both session and CSRF cookies with
  matching attributes before redirect and can complete as a fresh lineage without entering a redirect loop.
- Effective capabilities control advisory navigation visibility. Direct navigation without a listed capability does
  not predict an HTTP status: the route obeys the authoritative API result, renders `403` as access denied, and never
  converts permission denial to a sign-in failure or leaks data from a rejected response.
- The shell works at the project's desktop and narrow viewport baselines, is usable by keyboard and screen reader,
  has visible focus and semantic landmarks, preserves focus through mobile-navigation transitions, respects reduced
  motion, and has no serious automated accessibility violations.
- Focused API and web tests, generated-client freshness, live-Keycloak Playwright, repository checks, and the premium
  design audit pass.
- The implementation and this updated ExecPlan form exactly one independently reviewable pull request and preserve
  unrelated repository behavior and user changes.

## Validation

Run the BFF controller, flow, cookie, and integration specs that cover login, callback, session, logout, CSRF, and
the new destination helper. Run the web transport, authentication-state, shell, navigation, and accessibility unit
tests. Then run:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm architecture:check
    git diff --check

After confirming the disposable Compose project belongs to this checkout, start the exact same-origin
web/API/Keycloak runtime and run the focused live browser scenario in Chromium and at least one narrow viewport:

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/auth-shell.spec.ts --project=chromium

The scenario creates disposable unprivileged human fixtures. It records live login, atomic two-context session
replacement, and a race between two callbacks for the same old session. It also records destination preservation,
hard refresh, session expiry and reauthentication, same-tab principal replacement, back/forward-cache restoration,
forbidden deep-link behavior, keyboard navigation, and sign-out. Privileged MFA fixtures are a separate `frontend/09` prerequisite for later
feature plans. Run the premium static audit and resolve each finding or
record a narrow, evidence-backed exception in this plan:

    corepack pnpm ui:audit

Inspect desktop and narrow screenshots for stable layout, focus, overflow, long/error copy, reduced motion, and all
loading and recovery states. If implementation materially changes root `DESIGN.md` or `UX-CONTRACT.md`, run
`corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md` and record
the result. Do not claim the live Keycloak scenario passed from mocked component tests.

## Idempotence and Recovery

Login state remains single-use and a repeated callback fails safely without creating another session. A replacement
whose expected old session disappeared also fails without creating a session; the user restarts login with a fresh
state. Reopening a protected route creates a fresh login attempt with a newly validated destination. Session bootstrap
and sign-out are safe to repeat; the UI prevents duplicate sign-out submission and never claims success after an
ambiguous response. Authenticated caches remain empty after an ambiguous sign-out until a newly established principal
reloads them.
Generated-client update commands must converge, and the read-only drift check must leave the worktree unchanged.

The runtime uses disposable development state. If callback or session schema changes make existing Redis data
incompatible, stop only the stack owned by this checkout and use the documented `frontend/06` reset flow before
provisioning Keycloak again. Do not add a database or Keycloak migration. Never delete shared Docker resources without
first confirming ownership.

## Artifacts and Notes

Record the final stable callback codes, the destination-normalization test table, generated `OpenAPI` operation names,
focused test counts, session-replacement and authentication-generation race evidence, premium-audit result, and redacted Playwright evidence
for desktop and narrow views. Do not record login credentials, cookies, CSRF values, OAuth parameters, tokens, or
real user/account data.

## Plan readiness

The authentication boundary, redirect safety policy, atomic session replacement, session/error behavior, response-generation fence, UI states,
design constraints, test matrix, and one-pull-request boundary are decision-complete. Later feature routes can
consume the shared shell without reopening these choices.

Ready to implement.
