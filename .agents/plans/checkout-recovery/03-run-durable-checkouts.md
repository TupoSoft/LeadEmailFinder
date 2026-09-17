# Create and Resume Durable Checkout Attempts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An accepted checkout request commits a purchase and a durable job together. A worker creates the checkout once,
records its URL, and recovers uncertain results through provider reads. The caller either receives the URL during
a short wait or receives a status URL. Stopping a development API process no longer loses accepted checkout work.

## Progress

- [ ] (2026-09-17) Add atomic admission, immutable snapshots, and fenced job persistence.
- [ ] (2026-09-17) Implement dispatch, observation, and settlement recovery through existing module boundaries.
- [ ] (2026-09-17) Publish the opt-in durable HTTP contract and regenerate the browser client.
- [ ] (2026-09-17) Add PostgreSQL, HTTP, provider-failure, and Bruno coverage and update developer documentation.

## Plan dependencies

- `checkout-recovery/01`
- `checkout-recovery/02`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use a payments-owned PostgreSQL job table and a local polling adapter. Rationale: one transaction can
  preserve purchase and work without introducing a second durability dependency or another broker.
  Date: 2026-09-17. Author: Codex.
- Decision: Commit `dispatched` before requesting creation of a transaction. Never send a second creation request
  for that attempt.
  Rationale: Paddle offers no usable idempotency key for creation; even a crash between the marker and the network send
  must conservatively enter reconciliation. Date: 2026-09-17. Author: Codex.
- Decision: Require an idempotency header only for the new path in this intermediate PR. Rationale: the existing
  browser expects every success to contain a URL. Plan 04 upgrades it, and plan 05 removes the old path.
  Date: 2026-09-17. Author: Codex.
- Decision: Stop automatic recovery after a bounded investigation window, without declaring payment failed.
  Rationale: zero provider matches is not proof of absence. Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`CreditPurchaseService.start()` currently inserts a pending purchase before a synchronous provider call and stores
no checkout URL. Its controller requires `billing:manage`; history requires `billing:read` and intentionally hides
provider details. `PaymentEventHandler` settles verified completed events through
`recordPaid -> CreditsService.credit(purchase.id) -> recordCreditsGranted`. The grant is idempotent even though
these operations are separate commits. Plan 01 protects payment confirmation from later purchase writes. Plan 02 adds
read-only provider observation; it does not itself schedule work or grant credits.

Read `src/libs/modules/AGENTS.md`, the canonical module README, and the README files for payments, credits, and identity. Apply
the local PostgreSQL and Paddle webhook skills. Application/domain code remains framework-independent. Nest,
TypeORM, timers, and provider clients belong in composition or infrastructure, behind narrow ports.

## Scope and Non-Goals

Deliver one complete, opt-in durable backend workflow, including its persistence, runner, observer integration,
HTTP admission/status, generated client contracts, and focused validation. This PR unlocks browser adoption in
plan 04. Preserve the existing no-header creation path temporarily; do not add a permanent feature flag.
Do not infer jobs for old pending purchases, add migrations, change payment providers, implement subscriptions,
replace the credit ledger, introduce a broker, or claim exactly-once external Paddle creation.

## Plan of Work

### Persist One Logical Attempt

Add `infrastructure/persistence/typeorm/credit-checkout-job.entity.ts` and its payments-owned store adapter,
`application/ports/checkout-job-store.ts`, and plain types under `domain/`. The job uses `purchaseId` as a primary
and foreign key, and a unique `(organizationId, requestKey)` constraint. Store a canonical UUID version 4 request
key, job state, generation, lease owner/deadline, dispatch timestamp, and next-run time. Recovery fields contain the
scan cursor/high-water mark, provider-paid observation marker, matched reference or conflict evidence, and safe error
code. Also persist the resolution timestamp, validated URL, and local URL deadline.
Use explicit nullable column types and indexes on state/next-run time and lease deadline for bounded claims.

The existing purchase owns pack ID, credits, amount, currency, and provider. Together with it, the job snapshots
provider environment, provider price ID, quantity one, and the checkout-page URL. Those terms are immutable after
admission; do not reconstruct queued work from a later catalog or changed configuration. Do not store secrets,
provider payloads, card details, or unchecked URLs. History serialization remains unchanged.

An admission application service first reads `(organizationId, requestKey)` through the store. An existing key
with the same pack returns its attempt before reading the catalog, including after catalog removal or price
changes; a different pack returns a typed conflict. Only a new key causes the application service to validate the
current catalog and supply an immutable snapshot to an atomic purchase-plus-job insert. Persistence never imports
the catalog or owns pack validation. Concurrent inserts use the unique constraint and reread the winner after the
losing transaction rolls back; compare its pack before returning it. Do not use an aborted PostgreSQL transaction.
No key expires or is reused while its
purchase exists. A deleted development database invalidates the entire development fixture, not a single key.

### Dispatch and Recover Without Duplicate Creation

Add `application/checkout-runner.ts`, `application/checkout-reconciler.ts`, a narrow clock port, and an
infrastructure polling adapter wired in `payments.module.ts`. Poll committed jobs directly, use bounded batches,
and prevent overlapping sweeps in one process. Claim due jobs with short transactions, row locks, and skip-locked
selection. A generation plus lease token fences every mutation. Do not hold a database transaction while waiting
for Paddle. Stop new claims on shutdown; uncompleted jobs remain durable.

Use these internal states: `queued`, `leased`, `dispatched`, `reconciling`, `ready`, `settled`, `failed`, and
`needs_review`. A worker may create only after an atomic, current-generation `leased -> dispatched` transition
has committed. Record dispatch time before calling the provider. Expired `leased` work with no dispatch marker
can return to the `queued` state. Expired `dispatched` work can only enter reconciliation. Never clear the dispatch marker
or create from `reconciling` or `needs_review`. An old worker whose generation check fails must not send a request.
If it already sent one, a fence can protect local writes but cannot undo Paddle's work.

Apply a ten-second local response deadline to provider calls. A deadline or rejected network request leaves the
outcome unknown; do not claim it canceled the remote operation. Adopt a late result only when it passes the current state, fence, and binding checks. Otherwise, recover it through observation. Confirm the installed SDK issues exactly one creation request. Do not add retries around that request. Transient local failure before dispatch is retryable locally. Every
exception after the dispatch marker remains uncertain and enters reconciliation; no provider error-code allowlist
is introduced. A verified canceled or past-due transaction can make a still-pending purchase failed through the
guarded purchase transition. Its public safe reason is `provider_rejected`; current paid state always wins.

On a successful result, atomically bind a null-or-equal reference, validate the URL with the current exact-origin
policy, persist it with its local deadline, and complete preparation. Release the lease and schedule the next observation. Preserve any concurrently recorded paid state and
grant marker. A rejected URL must never be exposed; retain safe reference evidence for reconciliation and mark
checkout unavailable without falsely claiming the provider transaction failed. A provider/environment mismatch
with the running configuration also stops dispatch and requires review.

For reconciliation, use a known reference first. Otherwise, consume pages from the observer added in plan 02, including all statuses,
with a five-minute lower-bound margin and a moving scan high-water mark. Persist scan progress and at most two
distinct matching references; never store raw pages. Inspect all pages before adopting a unique candidate. A
repeated cursor, failed page, budget limit, no match, or conflicting metadata cannot authorize another create.
Restart subsequent scans from their lower bound so delayed provider visibility is not excluded forever. Keep the
upper bound and ID ordering fixed within a full scan. Renew the current generation lease before each bounded
provider call, checkpoint each page under that fence, and stop immediately if renewal or checkpoint fails. A scan
that spans the thirty-second lease cannot rely on the original lease lasting for all ten page calls.

A valid draft or ready transaction can recover its checkout. A valid completed transaction goes through a new
small `PurchaseSettlementService` extracted from the existing handler sequence; both authenticated observations
and signed webhooks invoke it. Carry a distinct evidence source for logging, never a fabricated webhook event ID.
Validate correlation, price/quantity, provider context, currency, and settled gross total. Keep credits and ownership
from the stored purchase. A paid-but-not-completed provider transaction remains reconciling; persist that observation monotonically so a
stale observation of a `draft` or `ready` transaction cannot restore its URL. A billed or unknown transaction state is unavailable for review. A failed or canceled
observation cannot regress an already-paid purchase. Concurrent provider observation and webhook settlement produce one grant.

Use fixed initial policy defaults, validated in configuration tests: poll every 1,000 milliseconds, claim at most
10 jobs per sweep, lease for 30 seconds, provider wait deadline 10 seconds, and reconcile at delays of 2, 5, 15,
30, then 60 seconds. Process at most 10 provider pages in a sweep and persist continuation. After 15 minutes from
dispatch without a matched ready/paid transaction or completed payment, set `needs_review`, retain evidence, and
stop automatic scans. Do not expire or fail the payment. These are development defaults, not measured capacity claims. Injectable clocks and policy
values keep tests deterministic; expose only `PAYMENTS_CHECKOUT_WAIT_MS` (default 1500, range 0 to 5000) as new
runtime configuration. The test bootstrap injects shorter policies directly instead of adding application
configuration or changing these application defaults.

A ready URL is locally usable for at most 30 minutes from the original dispatch time. Reconciliation must not
extend that bound. Ready jobs retain their business state while claimed through separate lease metadata, and get
a known-reference observation every sixty seconds until that deadline. A transient read failure retains the URL
only while payment remains pending and current URL validation succeeds. A verified provider-paid observation
permanently suppresses the URL and switches to reconciling/awaiting_completion with the same sixty-second reads.
Finding a ready/paid candidate replaces the fifteen-minute unknown-create investigation budget with this original,
dispatch-based thirty-minute window. At its end, suppress the URL, stop provider reads, and project
unavailable/expired without marking the purchase failed. Signed webhooks remain effective afterward.
Status reads suppress expired URLs; they do not create replacements. Before dispatch and before
projecting a result, current paid state takes precedence over checkout preparation. Revalidate every returned URL
against the current exact-origin policy; a previously accepted URL can become unavailable after a policy change.

Confirmed payment with an unfinished grant marker remains eligible for idempotent settlement regardless of job
state, URL expiry, or the investigation deadline. Select these jobs alongside due checkout work, resume from the
already-persisted paid purchase without requiring another provider observation, and retry grant/marker persistence
with the same backoff capped at sixty seconds until complete. Persist the next attempt time to avoid a hot loop.
Never move this financial recovery to `needs_review` merely because fifteen minutes elapsed. A known completed
payment cannot lose its credit grant because checkout preparation stopped.

### Publish a Safe Intermediate API

Extend the existing controller with an optional `Idempotency-Key` header. Absence continues the legacy path only
until plan 05. Presence must be exactly one canonical lowercase UUID version 4, including on replay; malformed, repeated,
or combined headers return `400` before any write. A valid key selects durable admission. Preserve `packId` as the
only body business input and existing Origin/CSRF and bearer authentication behavior.

After admission, the HTTP handler waits at most `PAYMENTS_CHECKOUT_WAIT_MS` on committed state. The worker alone
owns provider creation. Waiting must not hold locks, and timeout or client disconnect must not fail or cancel the
job. A ready result from newly inserted admission returns `201`; ready from an existing-key replay returns `200`.
Creating or reconciling returns `202` with `Location: /v1/credit-purchases/:id/checkout` and a positive `Retry-After`
when automatic polling is appropriate. Completed, failed, and unavailable return `200` whether first observed or
replayed, including when payment completion overtakes the initial response. Unknown pack remains `400`, key/body
conflict is `409`, missing authentication is `401`,
and insufficient permission is `403`. Use `Cache-Control: no-store` on all checkout-result responses.

Add `GET /v1/credit-purchases/:id/checkout`, requiring `billing:manage`. Validate the ID as a UUID; return `404` for
missing and foreign-organization purchases without disclosing which case occurred. The endpoint reads committed
state only and never dispatches a create or provider scan. It returns `200` for every found state, including an
unresolved state. The worker owns scheduled observations. Pre-feature rows without a job return unavailable and
never cause automatic job creation. Current purchase history remains exactly its existing safe projection.

Define a discriminated checkout view with common `id`, purchase `status`, and `checkoutStatus`. The allowed variants
are: `creating` or `reconciling` with `retryAfterSeconds` (positive integer, or null to stop automatic polling);
`ready` with `redirectUrl` and purchase status pending; `completed` with paid status and a committed grant marker;
`failed` with safe reason `provider_rejected`; and `unavailable` with safe reason `expired` or `requires_review`.
All variants except `ready` omit the URL. Paid status without a grant marker projects reconciling and never a
URL. A failed purchase never projects `ready` even if its job still contains a URL; verified cancellation or
past-due evidence projects failed, while an expired purchase or local URL deadline projects unavailable/expired.
An unsafe current URL, conflicting evidence, missing job, or exhausted investigation projects
unavailable/requires_review. Prioritize paid state and grant recovery before every other rule. No variant exposes
provider IDs, request keys, snapshots, scan cursors, or raw error text.

Update DTO serialization and Swagger for `200`, `201`, and `202`, header validation, `409`, and the status route.
Add the route to `src/lead-email-finder-api/src/openapi/browser-document.ts`, run the repository generator, and
commit generated contracts in `packages/api-client`. The existing browser still uses the no-header path in this
PR. Add typed contract tests without changing its behavior yet.

## Interfaces and Dependencies

New application files stay inside payments' existing layers. `checkout-job-store.ts` owns atomic admission, claims,
fenced transitions, and result reads; `checkout-observer.ts` from plan 02 supplies evidence. Application classes
receive the clock and stores through factories. Do not import verification internals or TypeORM into application
code. Host configuration belongs in `src/lead-email-finder-api/src/environment-variables.dto.ts` and payments'
`domain/payment-configuration.ts`. Document the new variable and worker lifecycle in the payments README.
Proposed PR title: `feat(payments): create and resume durable checkout attempts`.

## Acceptance Criteria

- Concurrent equivalent requests with one organization/key create one purchase and one job; a changed pack with
  that key returns `409` without work. A replay survives catalog changes and reads the original terms.
- Failure of either admission insert leaves neither record. A committed queued job survives process restart.
- Only the winner of the dispatch transition sends a create. Expired dispatched work, transport failures, and
  empty provider scans never issue another create, even with overlapping workers and late results.
- A ready checkout remains usable during transient observation failures, but verified provider-paid state
  permanently suppresses its URL. Known-reference observation stops at the original thirty-minute deadline.
- A later valid provider match recovers the reference and safe URL. Multiple matches or invalid evidence remain
  unavailable for review and grant no credits.
- Completed provider observations and concurrent webhook delivery grant the stored credits once and finish the grant marker.
- Payment confirmed at minute 14:59 still receives one grant after a ledger outage lasts beyond minute 16; neither
  URL expiry nor the investigation deadline ends recovery or sends another create.
- A paginated scan exceeding thirty seconds renews its lease; takeover prevents stale checkpoints or extra creates.
- A replay of `ready` uses `200`; newly admitted `ready` uses `201`; `creating` and `reconciling` use `202`.
  The `completed`, `failed`, and `unavailable` variants use `200`. Failed purchases and newly disallowed URLs never project `ready`.
- A ready initial response contains its URL; unfinished work returns `202` and a usable status location. GET requests
  preserve organization and permission boundaries and do not mutate provider state.
- Paid, unresolved, expired, unsafe, and failed results never expose a checkout URL. Waiting expiry leaves work
  intact. Current catalog and history response shapes and the temporary no-header path remain compatible.
- Every new PostgreSQL test is actually included in the disposable runner; skipped or absent suites fail its report.

## Validation

Add `application/checkout-runner.spec.ts`, `application/checkout-reconciler.spec.ts`,
`application/checkout-admission.spec.ts`, `api/http/checkout-http.integration.spec.ts`, and
`application/checkout-recovery.integration.spec.ts`. Extend `scripts/testing/credits-postgres.ts`, its required
suite report, and `scripts/testing/credits-postgres.spec.ts` to include the new PostgreSQL suite; do not rely on a
successful old runner that never executes it. Cover rollback, unique-key races, both sides of dispatch, generation
fences, scan continuation/failure, provider response loss, and different execution orders of settlement through provider observations and webhooks.

```sh
corepack pnpm test -- src/libs/modules/payments/src/application/checkout-admission.spec.ts src/libs/modules/payments/src/application/checkout-runner.spec.ts src/libs/modules/payments/src/application/checkout-reconciler.spec.ts src/libs/modules/payments/src/api/http/checkout-http.integration.spec.ts scripts/testing/credits-postgres.spec.ts --runInBand
corepack pnpm test:credits-postgres
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:credit-purchases
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/payments/README.md bruno/credit-purchases/README.md docker/paddle-dev/README.md .agents/plans/checkout-recovery/03-run-durable-checkouts.md
git diff --check
```

Extend `bruno/credit-purchases` with keyed admission, equivalent replay, `409`, `202` recovery, rejected headers,
foreign/missing status IDs, and read-only billing permission rejection. Update the hard-coded collection count in
`scripts/bruno/run-collection.mjs` and its tests. Use variables and synthetic resources. The HTTP test fake may
save a transaction and then drop its response; do not expose fault-control endpoints in the normal API.

## Idempotence and Recovery

Use `TYPEORM_SYNCHRONIZE=true` against disposable development data only. Old purchases have no job and stay
unavailable to this workflow; do not backfill or infer work. For an incompatible schema, the existing command
`corepack pnpm dev:reset -- --confirm-project=LEF` resets and reseeds only the fixed base stack after its checkout
ownership checks. Do not run that command against the separate Paddle fixture. Use that fixture's recorded,
path-derived Compose project and documented provision steps when it is the selected test environment.

The PostgreSQL test runner resets only its own isolated database. A client repeats a logical request with the same
key. An unresolved dispatched attempt never permits automatic creation; investigate it using server-authenticated
provider reads or signed event replay. Log bounded reason codes and identifiers, never full URLs, keys, or payloads.
No automatic administrative override or new recovery HTTP endpoint is included.

## Artifacts and Notes

The working customer context is `docs/product/ideal-customer-profile.md`. This PR changes preparation reliability,
not pricing or the product's purpose. The chosen wait and investigation budgets are explicit development defaults.
Primary evidence: [Paddle retry guidance](https://developer.paddle.com/sdks/libraries/),
[transaction list](https://developer.paddle.com/api-reference/transactions/list-transactions/), and
[HTTP 202 semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3), checked on 2026-09-17.
Document observation-source logging separately from real webhook event IDs. Record actual validation on completion.

## Plan readiness

Ready to implement.
