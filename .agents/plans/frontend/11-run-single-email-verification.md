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

- [ ] (2026-08-31) Normalize the public async-job status and sanitized terminal-failure contract in `OpenAPI`.
- [ ] (2026-08-31) Regenerate the client and add the single-verification form and job route that can be bookmarked.
- [ ] (2026-08-31) Implement honest polling, one-credit, result, permission, and recovery states.
- [ ] (2026-08-31) Add focused API/browser tests and a distinct async-verification Bruno workflow.
- [ ] (2026-08-31) Run repository, design-contract, generated-client, SMTP-runtime, and premium UX validation.

## Plan dependencies

- `frontend/08`
- `frontend/10`
- `auth/05`
- `module-architecture/15`

## Surprises & Discoveries

- `module-architecture/15` will relocate async verification into API, application, and Bull infrastructure layers
  while preserving its external routes and queue protocol. This plan extends the resulting public DTO and
  application mapper instead of editing the legacy mixed folder.

## Decision Log

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

Not started.

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
    corepack pnpm --filter ./apps/web test
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
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/single-verification.spec.ts --project=chromium

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

Record the raw-to-public state mapping table, final generated operation/type names, focused test and Bruno counts,
redacted job-state timing, premium-audit result, and desktop/narrow screenshots. Use synthetic `lef.test` addresses
only. Do not record real addresses, job IDs, organization IDs, cookies, CSRF values, tokens, SMTP exchanges, proxy
details, or raw failures.

The endpoint choice, post-`module-architecture/15` layer ownership, public state/failure/unavailable contract,
organization-isolation source, one-credit uncertainty policy, result semantics, route recovery, permission behavior,
state matrix, validation, and one-pull-request boundary are decision-complete.

## Plan readiness

Ready to implement.
