# Run a Single Email Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an authenticated user submit one email for asynchronous verification and follow that exact job on a route that
can be bookmarked. After this change, the browser uses only `POST /verifyAsync` and `GET /verifyAsync/:id`, makes
the one-credit consequence explicit, never resubmits an uncertain mutation automatically, and renders queued,
running, completed, failed, unavailable, not-found, unauthorized, and insufficient-credit states honestly. A developer can submit
an address in the local SMTP fixture, refresh the job URL while it runs, and see the same sanitized server-owned
status and result after reload.

## Progress

- [x] (2026-09-07) Normalize the public async-job status and sanitized terminal-failure contract in `OpenAPI`.
- [x] (2026-09-07) Regenerate the client and add the single-verification form and job route that can be bookmarked.
- [x] (2026-09-07) Implement honest polling, one-credit, result, permission, and recovery states.
- [x] (2026-09-07) Add focused API/browser tests and a distinct async-verification Bruno workflow.
- [x] (2026-09-07) Run repository, design-contract, generated-client, SMTP-runtime, and premium UX validation.
- [x] (2026-09-07) Correct completed-result spacing and verify desktop, narrow, focus, and recovery behavior.
- [x] (2026-09-07) Update stale browser-contract checks and fix the hosted MFA form readiness race.
- [x] (2026-09-08) Add bounded, private Bruno failure diagnostics and verify runner regression coverage.
- [x] (2026-09-08) Configure CI to complete API compilation before serving live verification requests.
- [x] (2026-09-08) Merge current master, retaining the shared MFA readiness fix and layered batch implementation.
- [x] (2026-09-08) Separate the result limits note from the final evidence row and verify its responsive layout.

## Plan dependencies

- `frontend/08`
- `frontend/10`
- `auth/05`
- `module-architecture/15`

## Surprises & Discoveries

- (2026-09-07) The checkout includes all prerequisites at commit `bd2a0d2`. The actual async API and application
  directories are inside `src/libs/modules/email-verification/`; the paths below describe their module-relative
  boundaries. The existing credit guard may charge a credit before server validation; that ordering is preserved.
- (2026-09-07) The shared Docker project belongs to another worktree. Live validation uses an isolated project,
  `lef-issue506-81ab`, with separate published ports and disposable volumes. No shared reset is performed.
- (2026-09-07) No Browser plugin is available. The repository Playwright suite provides rendered validation.
- (2026-09-07) Result sources include `linkedin` for historical read compatibility. The browser labels this as a
  legacy result without introducing any new discovery request.

- `module-architecture/15` will relocate async verification into API, application, and Bull infrastructure layers
  while preserving its external routes and queue protocol. This plan extends the resulting public DTO and
  application mapper instead of editing the legacy mixed folder.

## Decision Log

- Decision: Keep the limits note below the evidence, with the existing content gap of 24 pixels, compact typography,
  and a maximum line length of 65 characters.
  Rationale: The note explains the whole result and needs visual separation from its final row. Existing shared
  tokens supply the spacing and typography; the text, left alignment, and ink color stay the same.
  Date/Author: 2026-09-08, approved visual review follow-up.

- Decision: Keep an exact browser route allowlist and add explicit async security, result, and generated-type checks.
  Rationale: The earlier export test excluded every verification route, including the two routes this feature needs.
  Synchronous verification, stored-result reads, batch verification, and proxy routes remain excluded.
  Date/Author: 2026-09-07, CI follow-up.
- Decision: Wait for a visible hosted MFA form before choosing enrollment or challenge handling.
  Rationale: A browser click can finish when navigation commits, before the new document contains its form.
  The existing timeout, trusted origin and form checks, account assertions, and capture suppression still apply.
  Date/Author: 2026-09-07, CI follow-up.

- Decision: Separate the completed result divider from its actions with the existing content gap of 24 pixels. Remove
  reserved status spacing only for an online completed result without a read error.
  Rationale: The previous buttons touched the divider while an empty status region left excessive space above them.
  Keep the live announcement region mounted and preserve visible offline and stale recovery messages.
  Date/Author: 2026-09-07, visual review follow-up.

- Decision: Keep a session-scoped submission coordinator and extract browser availability into a shared hook.
  Rationale: In-app navigation cannot discard a pending or uncertain request lock. Billing and verification share
  visibility and connectivity behavior. Authentication boundaries clear the coordinator and cached job data.
  Date/Author: 2026-09-07, implementation.
- Decision: Poll active jobs every five seconds for at most sixty checks; a read failure requires manual recovery.
  Rationale: Bounded reads preserve the last confirmed result and avoid endless background work. Terminal states
  stop automatic checks and all manual recovery remains read-only.
  Date/Author: 2026-09-07, implementation.

- Decision: The browser uses only the existing asynchronous create and status endpoints; it does not call the
  synchronous `/verify` endpoint.
  Rationale: An async job URL that can be bookmarked survives navigation and refresh and avoids holding a browser request open for
  SMTP work.
  Date/Author: 2026-08-31, project planning.
- Decision: Replace raw BullMQ state names in the public async response with `queued`, `running`, `completed`,
  `failed`, and `unavailable`. A failed job returns only the stable code `verification_failed`; an unknown state or a
  completed job without a valid result is `unavailable`, not proof of failure. Neither response returns BullMQ
  `failedReason`, exception text, stack details, SMTP dialogue, proxy data, or provider output.
  Rationale: Queue internals are unstable and can leak sensitive implementation details, while the UI needs a small
  durable state machine.
  Date/Author: 2026-08-31, project planning.
- Decision: The job identifier is part of `/app/verifications/:id`, and that URL is the only browser recovery handle.
  The app does not synthesize a recent-verification list or imply durable history when no list/history API exists.
  Rationale: A real server identifier can be refreshed and shared within the authorized organization; browser-only
  history would be incomplete and misleading.
  Date/Author: 2026-08-31, project planning.
- Decision: Submitting may consume one credit and is pessimistic. The UI prevents duplicate activation and never
  automatically retries a POST whose result is uncertain; read-only status polling may retry within explicit bounds.
  Rationale: A lost `202` can occur after debit or enqueue, so automatic resubmission can charge twice and create a
  second job.
  Date/Author: 2026-08-31, project planning.
- Decision: A `402` links to billing only when the current account has `billing.read`; otherwise it tells the
  user to contact an organization owner. The frontend never promises that the caller can buy credits.
  Rationale: Members can run verification but do not have billing access under the current permission policy.
  Date/Author: 2026-08-31, project planning.
- Decision: Result fields preserve uncertainty: `exists` and `catchAll` render `Yes`, `No`, or `Unknown`, and the
  reason and source enum values use an exhaustive reviewed label map rather than being collapsed into a green/red
  deliverability verdict.
  Rationale: A nullable or provisional verification signal is not equivalent to a definitive delivery guarantee.
  Date/Author: 2026-08-31, project planning.
- Decision: The route reuses the shell, shared primitives, and behavioral rules in root `DESIGN.md` and
  root `UX-CONTRACT.md`; any new job-status/result pattern is shared with later batch work where semantics match.
  Rationale: Async operations need consistent progress, stale-data, offline, and recovery behavior across screens.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

The public async contract, generated client, single-email form, recoverable job route, reviewed signal labels,
and distinct Bruno workflow are implemented. The form preserves uncertainty and pending work across in-app
navigation. Polling preserves confirmed data and stops on terminal states or read failure. Sixty focused component
tests cover submission, recovery, malformed responses, permissions, cache boundaries, polling, and focus.

Local validation passed: 2,510 backend tests, 60 runner tests, 394 web tests, 90 browser regression tests, seven
Redis queue integration tests, and nine gateway tests. The full backend suite leaves 80 unrelated optional integration
tests skipped. The distinct live Bruno workflow passed all fifteen requests and tests; hosted MFA and the real SMTP
browser flow passed submission, hard reload, completed evidence, credit rejection, narrow keyboard accessibility,
and session expiry. The fixture restored and verified its original credit balance.

The architecture gate, API export/generation/freshness checks, both type checks and linters, web/client builds, design
lint, strict UI audit, and Harper passed. Root ESLint retains one preexisting return-type warning in
`src/libs/config/src/load-secrets.spec.ts`. Independent review found and fixed malformed-response rendering,
inherited property names in label maps, and authenticated failure-artifact capture. The five existing privileged,
eight invitation/team, and one verification artifact tests all passed. No database schema, queue policy, credit
timing, or history feature was added. There are no material SOLID trade-offs.

The CI workflow now verifies the same HTTP and browser flow after preserving seeded volumes and recreating the
SMTP network. It waits for successful proxy fixture setup and includes artifact-privacy validation and overlay
cleanup. Remote CI will run on the single pull request; these results describe local validation.

### Result Limits Note Follow-Up

The limits note now sits 24 pixels below the final evidence divider. It uses the existing compact typography
of 14 pixels with a line height of 1.45, and a maximum width of 65 characters. The wording and left alignment
remain unchanged. This is a local composition adjustment using existing tokens; no shared visual decision,
HTTP API behavior, or business responsibility changes.

Focused validation passed: 60 verification component tests, 22 verification browser tests, the web build and type
check, focused ESLint, Prettier, design lint, and the strict UI audit. Chromium checks at 1440 by 900 and 320 by 720
measured a gap of exactly 24 pixels and no horizontal overflow. The note wrapped into two desktop lines and three
narrow lines. Manual refresh retained correct focus behavior, and console and page error checks were clean.
Synthetic screenshots at `/tmp/lef568-limits-desktop.png` and `/tmp/lef568-limits-narrow.png` were visually inspected.
The Browser plugin was unavailable, so the existing Playwright suite used an isolated preview and mocked API data.
Review found no material architectural trade-offs. Bruno is not applicable because only browser layout changes.

Exact focused commands:

    corepack pnpm --filter ./apps/web exec vitest run src/features/verification/VerificationPage.test.tsx
    corepack pnpm --filter ./apps/web build
    corepack pnpm --filter ./apps/web exec eslint src/features/verification/VerificationResultView.tsx
    corepack pnpm exec prettier --check apps/web/src/features/verification/VerificationResultView.tsx apps/web/src/features/verification/VerificationView.module.css
    corepack pnpm design:lint
    corepack pnpm ui:audit
    corepack pnpm --filter ./apps/web exec playwright test --config /tmp/lef568-limits-playwright.config.ts tests/e2e/verification-ui.spec.ts --workers=2
    node /tmp/lef568-limits-geometry.mjs
    corepack pnpm docs:lint -- .agents/plans/frontend/11-run-single-email-verification.md

### Completed-Result Spacing Follow-Up

The completed result now has a gap of 24 pixels between its action buttons and divider. An empty successful status region
no longer reserves space above the buttons. Initial result focus, its visible outline, and the mounted live
announcement region remain intact. Offline and stale messages still appear alongside retained evidence.

Observable acceptance passed at 1440 by 900 and 320 by 720. The divider is at least 24 pixels below the lowest action.
The gap from description to actions stays between 24 and 48 pixels. Evidence wraps without horizontal overflow, and
manual recovery does not refocus the result heading. The refreshed screenshots were visually inspected. The focused
browser suite passed all 22 cases, including completed-result offline, stale, and successful manual recovery.
All 60 verification component tests, the web build and type check, web lint, design lint, strict UI audit, formatting,
and whitespace checks passed. Review found no material architectural trade-offs. Bruno is not applicable to this
follow-up because it changes only browser layout; the live SMTP workflow was not rerun.

Exact focused commands:

    corepack pnpm --filter ./apps/web exec vitest run src/features/verification/VerificationPage.test.tsx
    corepack pnpm --filter ./apps/web build
    corepack pnpm --filter ./apps/web lint
    corepack pnpm design:lint
    corepack pnpm ui:audit
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm --filter ./apps/web exec playwright test tests/e2e/verification-ui.spec.ts --workers=2 --output=/tmp/issue506-spacing-e2e
    corepack pnpm docs:lint -- .agents/plans/frontend/11-run-single-email-verification.md

The Browser plugin remains unavailable. Playwright's initial local URL probe stalled before starting its preview
server in this environment. Starting the preview explicitly and running against it outside the command sandbox
allowed validation to complete. Screenshots use synthetic fixtures only and retain the existing paths listed below.

### CI Follow-Up

The contract tooling now accepts exactly the async create and status operations while preserving the remaining
browser exclusions. Focused assertions cover authentication, error responses, UUIDs, five discriminated states,
nullable evidence, safe result fields, and generated TypeScript types.

A synthetic Chromium reproduction confirmed that an immediate enrollment-form count can return zero after
navigation commits. Waiting for visibility finds the form. The hosted helper now waits before classifying it,
and a delayed-form regression covers this case. The earlier CI output deliberately hid authentication details,
so its exact failure stage cannot be established retrospectively. A later run of the previous commit passed MFA
setup, confirming that the observed CI failure was intermittent.

The Bruno runner reports only fixed failure stages, validated numeric request positions, HTTP statuses, and
execution counts. Restoration errors retain the write or confirmation operation and one sanitized prior failure.
Raw child output, credentials, request content, and report strings remain hidden. Successful restoration preserves
the original test error. Focused regressions verify privacy, propagation through Compose, and credit restoration.

The resulting CI report listed fifteen requests with zero executed tests, followed by HTTP 502 during restoration.
The installed Nest CLI starts the watched API before background type checking finishes. Its Swagger metadata write
then restarts the API child after the first successful health check. Both observed failures occurred about 22 seconds
after container startup, consistent with that restart window. The CI browser job now sets `API_START_COMMAND` to
`pnpm exec nest start`; without watch mode, Nest awaits type checking and metadata before compiling and starting the
API. Both base-stack provisioning and SMTP attachment inherit this setting. Ordinary development still defaults to
`pnpm start` with watch mode. No fixed delay or test retry substitutes for readiness.

Local validation passed: all 12 contract tooling tests, generated-artifact freshness, all 395 web tests, all 66
runner tests with none skipped, web type checking and lint, and five privileged authentication artifact tests.
Fresh isolated MFA enrollment also passed for both seeded identities. No product API, provider policy, or authentication requirement changed. There are no
material architectural trade-offs. Remote CI owns acceptance of the full live workflow for this follow-up.

Exact focused commands:

    node --test scripts/openapi/*.test.mjs
    corepack pnpm openapi:check
    corepack pnpm exec eslint scripts/openapi/contracts.test.mjs
    corepack pnpm --filter ./apps/web test:ci
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test:privileged-artifacts
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:oidc-runners
    corepack pnpm test -- scripts/ci/validate-workflow.spec.ts --runInBand
    corepack pnpm docs:lint -- .agents/plans/frontend/11-run-single-email-verification.md bruno/async-verification/README.md docker/README.md

### Merge Follow-Up

The merge with master at `232f2c7` preserves the layered batch-verification implementation from PR #567. PR #569
independently added the same MFA readiness behavior, which conflicted with this branch. The resolution keeps one
visible locator for either hosted MFA form before counting enrollment forms. It preserves the existing regression
coverage and avoids leaving a second locator wait pending after the first form appears. The async API contract and
CI startup override remain intact. Review found no material architectural trade-offs.

Focused validation covers all 33 hosted MFA tests and 173 async/batch tests. Nine optional Redis integration tests
remain skipped. The five synthetic authentication artifact tests passed when run separately; under concurrent
compiler load, the timeout case initially failed because its setup had already consumed the reduced timeout budget.
Web type checking and focused lint passed, as did the architecture gate with zero baselined violations. Backend type
checking, all 12 OpenAPI tests, and generated-client freshness passed in a fresh temporary copy. The active checkout
keeps regenerating stale Swagger imports for the moved batch files, even after replacing that ignored output with
fresh metadata. No database or authentication fixture is reset for merge validation.

Exact focused commands:

    corepack pnpm --filter ./apps/web exec vitest run tests/support/hosted-mfa-login.test.ts
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web exec eslint tests/support/hosted-mfa-login.ts tests/support/hosted-mfa-login.test.ts
    corepack pnpm --filter ./apps/web test:privileged-artifacts
    corepack pnpm exec jest --runInBand --testPathPatterns='email-verification/src/(api/http/(asynchronous-verification|batch-verification)|application/delivery/(async|batch)|infrastructure/queues/(async-verification|batch-verification))'
    corepack pnpm architecture:check
    corepack pnpm typecheck
    node --test scripts/openapi/*.test.mjs
    corepack pnpm openapi:check
    corepack pnpm docs:lint -- .agents/plans/frontend/11-run-single-email-verification.md src/libs/modules/email-verification/README.md

## Context and Orientation

The email-verification business module is under `src/libs/modules/email-verification/`. At authoring time,
`AsyncEmailVerificationController` exposes authenticated `POST /verifyAsync` with `verification:run` and
`CreditGuard`, returning `202 { id }`, and authenticated `GET /verifyAsync/:id` with `verification:read`. Jobs carry
the caller's organization and credential IDs; status lookup returns `404` for a missing job or a job owned by
another organization. The queue retries server work according to its existing policy.

Prerequisite `module-architecture/15` moves that HTTP contract to `src/api/http/asynchronous-verification/`, its
transport-neutral orchestration to `src/application/delivery/async/`, and Bull mechanics to infrastructure without
changing the route or queue protocol. This plan begins from those final boundaries.

`GetAsyncVerificationStatusResponseDto` currently exposes the infrastructure `JobState` enum directly. It returns a
result only when BullMQ reports `completed`; a failed job has only `state: "failed"`, so a frontend would either
show an opaque raw state or be tempted to inspect unsafe queue failure text. This plan adds a deliberately small
public state mapper, a generic terminal failure code, and an honest unavailable state without changing queue
attempts, debit timing, SMTP work, or tenant concealment.

The completed result contains `email`, `localPart`, `domain`, optional `format`, nullable `exists`, nullable
`catchAll`, `reason`, `sources`, and optional `mxDomain` and `targetExchange`. `createdAt` is deliberately not exposed.
The `reason` enum includes accepted, rejected, timeout, temporarily blocked, missing MX, connectivity, policy, and
unknown outcomes. These are evidence fields, not a single infallible deliverability score.

Plan `frontend/08` provides current account and effective capabilities, same-origin cookies, CSRF-aware generated
client calls, shared `401`/`403` handling, the application shell, and accessible state primitives. `auth/05` provides
the async-job ownership and cross-organization `404` contract. `privacy-compliance/04`, consumed transitively through
the `module-architecture/15` prerequisite chain, supplies organization ownership for persisted verification and cache
state. The new feature belongs in `apps/web/src/features/verification` and its route modules in
`apps/web/src/routes`.

## Scope and Non-Goals

This pull request adds the stable public async-job DTO/mapping and Swagger coverage, regenerated client types, the
single-email form and job routes, safe result semantics, focused API/web/browser tests, and a new
`bruno/async-verification` collection. It may extract a pure state mapper within the async verification application
boundary; it does not redesign the processor.

It does not use the synchronous or deprecated verification endpoint, add bulk input, persist job history, list jobs,
or export a single result. It adds no cancel, resume, or queue-again controls; estimates; credit or debit policy changes;
retry changes; idempotency infrastructure; or job-retention guarantee. It does not display raw queue, SMTP, provider,
proxy, or exception data. Unrelated verification hardening and catch-all error changes remain outside this plan.

## Plan of Work

Define the public async status contract in the asynchronous-verification API boundary delivered by
`module-architecture/15`, with its pure mapper in the async application boundary. The Bull adapter normalizes waiting,
delayed, prioritized, waiting-children, paused, active, completed, failed, and unknown Bull states into a
transport-neutral application snapshot; no Bull type or import crosses into application. The application mapper
converts that snapshot to the stable public enum `queued`, `running`, `completed`, `failed`, or `unavailable`.
Completed with a valid result maps to `completed`; failed maps to `failed` with the generic
`verification_failed` code. An unknown infrastructure state or completed job without a valid result maps to
`unavailable`; this is an inability to report a trustworthy outcome, not evidence that verification failed. Expose
`result` only for `completed` and `failureCode` only for `failed`. Never read or serialize raw `failedReason`.

Keep `POST /verifyAsync` and `GET /verifyAsync/:id` paths, status codes, permissions, and organization concealment.
Add explicit Swagger properties and response examples for the request, `202` identifier, each public status,
completed result, `400`, `401`, `402`, `403`, and `404`. Add pure mapping and controller/service tests proving every
raw state, result invariant, sanitization, same-organization success, cross-organization `404`, insufficient credits,
and unchanged validation. Add only the async create/status route-method entries to the browser allow list. Update
`packages/api-client` through `openapi:export` and `openapi:generate`, run
`openapi:check`, and make the generated enum/DTO the only job contract used by the web app.

Under `apps/web/src/features/verification`, implement a single-email form with native email semantics, shared form
controls, `noValidate`, an associated inline error, error summary where required by the UX contract, and first-invalid
focus. Client validation improves feedback, but server validation remains authoritative. State clearly before submit
that a request may consume one credit. Permit one in-flight mutation, retain the typed email on failure, and do not
log or place the email in the URL.

On confirmed `202`, navigate to `/app/verifications/:id` and replace the form mutation state with a query keyed by the
server ID. On validation failure, show the associated field error. On `402`, preserve the address and show either a
billing link or owner guidance based on effective capabilities. On `401` and `403`, use the shell's established
flows. On `404`, show a non-disclosing job-not-found state. On timeout, disconnect, or another ambiguous POST failure,
say that submission and charging could not be confirmed, do not retry, and require the user to acknowledge the risk
before deliberately submitting a new request. Do not fabricate an ID or history entry.

The job route loads its ID from the URL and validates UUID shape before calling the API. While state is queued or
running, poll the idempotent GET at a bounded interval with visible state text, pause polling while offline or hidden,
and resume without resetting displayed data. A read failure preserves the last confirmed state, marks it stale, and
offers an explicit retry; it never triggers another POST. Completion stops polling and moves focus to a result
heading only once. Failure stops polling, shows only generic safe copy, and offers status refresh plus a link back to
the form with no automatic resubmission. `unavailable` also stops automatic polling, explains that the outcome could
not be determined, and offers a manual status refresh without claiming failure, success, or a credit adjustment.
Refreshing or directly opening the URL performs the same organization-scoped GET and restores the page.

Render result fields through shared description-list/status primitives. Show the normalized email and domain,
three-state existence and catch-all values, reviewed reason text, all reported sources, and optional pattern/MX fields
only when present. Do not turn a null into `No`, hide a negative reason behind a success color, or claim that
`accepted_email` guarantees delivery. Give the form, queued/running, completed, failed, unavailable, offline/stale,
not-found, and permission states distinct titles and headings. Keep the result readable at narrow widths, announce state changes
through a restrained live region, avoid repeated polling announcements, preserve stable geometry, and respect
reduced motion.

Create `bruno/async-verification` as a distinct workflow rather than extending the synchronous SMTP collection.
Use environment credentials and synthetic `lef.test` addresses, enqueue once, retain the returned job ID, poll to a
terminal public state, and assert the safe completed schema. Cover invalid input, insufficient credits where the
fixture can reset balance safely, unauthorized access, and cross-organization `404` without recording secrets.
Playwright uses the live Keycloak and SMTP fixture for form-to-result, hard refresh, conditional `402`, session
expiry, and narrow keyboard/accessibility flows; deterministic API/component fixtures cover every normalized state
and ambiguous network branch.
Register `corepack pnpm bruno:async-verification` with the pinned launcher from Plan 02. Its bootstrap retrieves the seeded
customer service-client credential without printing it, selects the Compose-internal issuer/base URL for the SMTP
overlay, uses the developer sandbox, and fails on zero execution.

## Interfaces and Dependencies

The create interface remains:

    POST /verifyAsync
    { "email": "person@lef.test" }
    202 { "id": "<uuid>" }

The status response becomes a stable discriminated contract represented in `OpenAPI` and the generated client:

    GET /verifyAsync/:id
    { "state": "queued" }
    { "state": "running" }
    { "state": "completed", "result": { ... } }
    { "state": "failed", "failureCode": "verification_failed" }
    { "state": "unavailable" }

The API continues to return `402` when the debit guard reports insufficient credits and `404` for missing or
cross-organization jobs. No list endpoint is introduced. The frontend routes are `/app/verifications/new` and
`/app/verifications/:id`; the shell shows the entry point only with browser capability `verification.run`, while the
job route requires `verification.read`. Direct create and status requests remain protected by server
`verification:run` and `verification:read` checks respectively.

The web implementation consumes `packages/api-client` through the `frontend/05` transport and the query layer from
`frontend/08`. The live scenario needs
the existing Redis/BullMQ worker, PostgreSQL, SMTP fixture, DNS fixture, seeded organization credits, Keycloak, API,
and web app. It relies on the public-issuer/back-channel split from `frontend/02`, so the SMTP development overlay
can use internal provider routing without changing the browser-visible issuer. No new external library or provider
is required unless the prerequisite frontend test stack lacks an accessibility runner already selected in
`frontend/01`.

## Acceptance Criteria

- A valid email submitted once returns one real job ID, navigates to `/app/verifications/:id`, and never calls the
  synchronous verification endpoint. Refreshing or directly opening that URL resumes the same authorized job read.
- The public API and generated client expose only `queued`, `running`, `completed`, `failed`, and `unavailable`; a
  failed job contains only `verification_failed`. Queue error messages, stack data, SMTP dialogue, proxy/provider
  details, and internal retry state are absent from JSON and markup.
- Waiting/delayed work renders queued, active work renders running, a valid completion renders its result, and a
  failed job renders the generic failure state. Unknown infrastructure state or completion without a valid result
  renders unavailable without claiming failure. Automatic polling stops for completed, failed, and unavailable
  responses and pauses while hidden or offline.
- The form prevents duplicate activation and says that submission may use one credit. An uncertain POST is never
  retried automatically, never claims that no credit was charged, and never creates a fake job/history entry.
- `402` preserves form input and shows `/app/billing` only to a caller with `billing.read`; other callers receive
  owner guidance. `401`, `403`, invalid input, read error, stale state, and organization-concealed `404` remain
  distinct and recoverable.
- `exists` and `catchAll` preserve `true`, `false`, and `null` as Yes, No, and Unknown. Every reason/source enum has
  reviewed accessible copy; optional fields do not leave empty labels; no result claims guaranteed deliverability.
- Loading, form, queued, running, completed, failed, unavailable, offline, stale, insufficient-credit, not-found, and permission
  states work at desktop and narrow viewports, by keyboard and screen reader, with stable layout, controlled
  announcements, reduced-motion support, and no serious accessibility violations.
- Focused API/web tests, generated-client freshness, the new Bruno collection, live Keycloak/SMTP Playwright,
  repository checks, and the premium design audit pass.
- The implementation and updated ExecPlan map to exactly one pull request and do not add history, cancel/retry APIs,
  queue-policy changes, or unrelated verification work.

## Validation

Run async service, state-mapper, controller, DTO serialization, tenant isolation, permission, insufficient-credit,
and Swagger tests. Run form, error mapping, polling lifecycle, route reload, result semantics, capability, offline,
focus, and accessibility web tests. Then run:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test:ci
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm architecture:check
    git diff --check

After confirming Compose ownership, start the worktree-owned same-origin runtime and SMTP/DNS fixture. Run:

    corepack pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:async-verification
    corepack pnpm --filter ./apps/web test:verification-live

The Bruno run must enqueue only synthetic fixture addresses, observe the public state sequence, and assert the
completed safe result, validation, authentication, credit, and tenant-concealment cases. The Playwright run must use
live Keycloak and a real async worker, hard-refresh the job URL, and verify desktop and narrow flows.
Use deterministic API fixtures for rare failed/unavailable states rather than poisoning shared queues.

Run the premium static audit and inspect all route/state screenshots and interactions:

    corepack pnpm ui:audit

Verify long email/domain/reason/source values, no sensitive console or URL data, keyboard submission, first-error
focus, live-region restraint, offline/hidden polling, narrow overflow, and reduced motion. If the implementation
changes `DESIGN.md` or `UX-CONTRACT.md`, run
`corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md` and record the result.

## Idempotence and Recovery

Status `GET` requests are organization-scoped and safe to repeat. Polling is bounded, pauses with page lifecycle/connectivity,
and resumes from the URL without mutating the job. The POST is deliberately not treated as idempotent: the UI issues
it once per explicit activation, disables duplicates, and does not retry an ambiguous outcome. A user may make a
new deliberate attempt only after the UI explains that the earlier request may already have consumed a credit.

If a generated-client update stops partway, fix the OpenAPI source, rerun export/generate, and use the read-only
check to prove the result. Reset only disposable jobs, credits, and fixture state owned by this worktree through the established development reset;
do not add a migration or retry non-idempotent verification work from queue internals. An absent or expired job remains
an honest `404`; the UI does not promise indefinite retention.

## Artifacts and Notes

Verified implementation evidence on 2026-09-07:

| Queue snapshot | Public state |
| --- | --- |
| Waiting, delayed, prioritized, waiting children, or paused | `queued` |
| Active | `running` |
| Completed with a valid sanitized result | `completed` |
| Failed | `failed` with `verification_failed` only |
| Unknown state or invalid completion | `unavailable` |

Generated operations are `AsyncEmailVerificationController_verifyAsync` and
`AsyncEmailVerificationController_getAsyncVerificationState`. The latter returns a five-way discriminated union;
`AsyncVerificationResultDto` owns the evidence fields. Nullable optional database fields are omitted, while nullable
existence and catch-all values are retained. Empty source arrays are valid, including accepted Mailpit catch-all
results.

The local runtime is `lef-issue506-81ab` at `http://localhost:53106`; its SMTP overlay and hosted Keycloak fixture
were used for acceptance. Browser plugin tools were unavailable, so Playwright ran Chromium at 1440 by 900 and
320 by 720, including reduced motion. Safe synthetic screenshots are `/tmp/issue506-verification-desktop.png` and
`/tmp/issue506-verification-narrow.png`. Both show fully wrapping evidence fields without horizontal overflow.
The real authenticated browser suite suppresses captures, assertion values, and page snapshots.

Exact additional focused commands:

    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/public-entry.spec.ts tests/e2e/not-found.spec.ts tests/e2e/auth-shell.spec.ts tests/e2e/billing-ui.spec.ts tests/e2e/team-ui.spec.ts tests/e2e/verification-ui.spec.ts --workers=2 --output=/tmp/issue506-e2e-final
    TEST_REDIS_URL=redis://127.0.0.1:56106 corepack pnpm test --runInBand src/libs/modules/email-verification/src/infrastructure/queues/async-verification/async-email-verification-queue.integration.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/async-verification/async-email-verification-composition.integration.spec.ts
    WEB_GATEWAY_IMAGE=lead-email-finder-web:issue506-gateway corepack pnpm test:gateway
    COMPOSE_PROJECT_NAME=lef-issue506-81ab corepack pnpm bruno:async-verification
    COMPOSE_PROJECT_NAME=lef-issue506-81ab corepack pnpm --filter ./apps/web test:verification-live
    corepack pnpm --filter ./apps/web test:privileged-artifacts
    corepack pnpm --filter ./apps/web test:invitation-artifacts
    corepack pnpm --filter ./apps/web test:verification-artifacts


Record the raw-to-public state mapping table, final generated operation/type names, focused test and Bruno counts,
redacted job-state timing, premium-audit result, and desktop/narrow screenshots. Use synthetic `lef.test` addresses
only. Do not record real addresses, job IDs, organization IDs, cookies, CSRF values, tokens, SMTP exchanges, proxy
details, or raw failures.

The endpoint choice, post-`module-architecture/15` layer ownership, public state/failure/unavailable contract,
organization-isolation source, one-credit uncertainty policy, result semantics, route recovery, permission behavior,
state matrix, validation, and one-pull-request boundary are decision-complete.

## Plan readiness

Ready to implement.
