# Return the Admitted Handle When Queue Dispatch Stalls

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Return the durable verification handle promptly even when queue submission remains pending. After admission has
reserved credit and persisted its operation, `POST /verifyAsync` must return `202 { id }` within a fixed dispatch
budget, leaving execution recovery to the existing durable machinery.

## Progress

- [ ] (2026-09-15) Bound the optional queue dispatch wait after durable admission.
- [ ] (2026-09-15) Verify dispatch deadlines, late completion, late rejection, and keyed replay behavior.
- [ ] (2026-09-15) Validate the HTTP contract and update its documented recovery behavior.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Race dispatch against a fixed two-second application budget and return the admitted handle on
  rejection or timeout. Rationale: the queue is an optional execution accelerator after Postgres admission has
  succeeded. Date/Author: 2026-09-15, Codex planning.
- Decision: Observe the original dispatch promise after timeout without canceling the execution or releasing its
  reservation. Rationale: late queue completion is safe because jobs retain the execution ID and durable leases
  fence execution. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep limiter failures separate from dispatch timeout. Rationale: the limiter may reject before
  admission with `503`; an admitted operation already has a valid recovery handle. Date/Author: 2026-09-15,
  Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The reviewed implementation is PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`. Paths below are relative
to `src/libs/modules/email-verification/src/` unless a repository-root path is given.
`application/delivery/async/async-email-verification.service.ts` admits a request, then awaits
`dispatcher.dispatch(...).catch(() => {})` for funded or joined executions. Catching rejection does not bound
a promise that never settles. The production BullMQ dispatcher awaits `queue.add()` and Redis is configured to
retry indefinitely, so a Redis interruption after admission can leave the HTTP response pending indefinitely.

`infrastructure/queues/verification-execution/bull-verification-execution-dispatcher.ts` uses the execution ID
as the BullMQ job ID. `application/operations/verification-reconciler.ts` can independently execute queued
Postgres rows, and the runner acquires a generation-fenced lease. A queue timeout must therefore preserve admission.
The HTTP rate-limit guard runs before admission and has a different failure contract owned by its Redis helper.

## Scope and Non-Goals

Deliver one PR, titled `fix(verification): bound async queue dispatch waits`, containing the bounded wait and its
focused application, queue, and HTTP validation. Preserve request identities, reservation rules, queue options,
and the existing reconciliation schedule. Do not change Redis reconnect settings, introduce another queue,
add polling states, or expand the limiter's error type. This plan makes admitted async work recoverable by callers.

## Plan of Work

Read the module architecture contract, its README, and the relevant repository skills. Add
`VERIFICATION_ASYNC_DISPATCH_BUDGET_MS = 2000` beside other application timing constants in
`application/operations/verification-execution-timing.ts`. Inject this numeric budget into the async service
through its composition factory in `email-verification.module.ts`; it is an engineering constant, not a new
environment setting. Update every constructor fixture for the explicit dependency.

Implement a private `dispatchWithinBudget()` helper in `AsyncEmailVerificationService`. Start dispatch through
`Promise.resolve().then(...)` so a synchronous adapter throw also becomes an observed rejection. Attach rejection
handling to that dispatch promise before racing it against a timer. Await the first completion and clear the
timer in `finally`, including the normal fast-success and fast-failure paths. The helper resolves for successful
dispatch, rejection, or timeout. A timeout does not abort the underlying operation; the attached handler consumes
any later rejection, while late success remains safe under the existing job identity and lease checks.

Call the helper only for funded and joined outcomes, then return the already-persisted request ID. Cached,
cooldown, conflict, and insufficient-funds outcomes retain their existing paths. Never create another request,
release credit, retry admission, or emit an HTTP error because this optional dispatch timed out.
Do not import `VerificationSubmissionLimiterUnavailableError`: it represents failure to admit, which is a
different point in the workflow. Keep BullMQ and Redis imports in infrastructure.

Extend the service tests with fake timers and explicitly controlled deferred promises. Cover settlement before
the deadline, a never-settling dispatch, rejection before timeout, and rejection after the response. Assert that
the timer is cleared on prompt outcomes and that no unhandled rejection is emitted after timeout. Compose the
real service with the HTTP controller in its integration suite so a hung adapter still produces `202 { id }`.

Add a queue integration case using a dedicated disposable Redis connection that becomes unavailable after
admission. Keep the limiter outside that outage fixture so the case actually reaches the dispatch seam.
After connectivity returns, prove late dispatch and reconciliation cannot produce another request or capture.
Reuse the existing queue prefix isolation and cleanup mechanics, and explicitly disconnect the test client
at teardown so indefinite reconnect attempts do not keep the test process alive.

Update the module README and `bruno/async-verification/README.md` with the bounded fast-path behavior. Strengthen
the nearest existing submission and keyed-replay requests to assert `202`, the returned operation handle, and
successful polling of that same handle. Exercise the actual outage with the integration fixture rather than
adding a diagnostic endpoint or disrupting shared Redis from Bruno.

When modifying the async collection, update its registered counts in `scripts/bruno/run-collection.mjs`
and its fake workflow in `scripts/bruno/async-verification-runner.test.mjs` in the same PR. Preserve
the existing unsafe-response rejection and independent fixture reset, then run the focused Node test.

## Interfaces and Dependencies

`VerificationExecutionDispatcher.dispatch(executionId, organizationId): Promise<void>` stays unchanged.
The async-service constructor gains a dispatch-budget number supplied by the application timing constant.
There are no new HTTP fields or statuses, runtime services, configuration variables, libraries, or schema changes.
The measured budget begins after durable admission; authentication, input validation, limiter behavior, and
database-admission latency remain governed by their existing contracts. Existing authorized replay rules remain.

## Acceptance Criteria

- A hung dispatcher returns the previously admitted operation as `202 { id }` after the two-second budget;
  the operation and reservation remain intact and visible through the normal status endpoint.
- Prompt dispatch completes without waiting for the timer. Prompt failure and timeout return the same handle
  as successful dispatch, with no second admission or compensating credit release.
- Late rejection produces no unhandled promise rejection. Late success after reconciliation cannot create a
  second execution, result, or credit capture.
- Keyed replay preserves the operation identity; cache and rejection paths never dispatch. A limiter outage
  before admission still returns the existing `503` response and creates no funded request.
- Focused application, HTTP, and real-Redis tests pass, with no remaining timer or connection keeping Jest alive.

## Validation

Run these commands from the repository root. Discover the endpoint of the disposable Redis instance owned by this test run and assign `TEST_REDIS_URL`;
never assume a port or reuse an unrelated development instance.

```sh
corepack pnpm exec jest --runInBand async-email-verification.service.spec.ts async-email-verification-http.integration.spec.ts verification-rate-limit.guard.spec.ts
corepack pnpm exec jest --runInBand bull-verification-execution-dispatcher.spec.ts verification-execution.processor.spec.ts
: "${TEST_REDIS_URL:?Set the endpoint of the Redis instance owned by this test run}"
TEST_REDIS_URL="$TEST_REDIS_URL" corepack pnpm exec jest --runInBand verification-execution-queue.integration.spec.ts
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/delivery/async/async-email-verification.service.{ts,spec.ts} src/libs/modules/email-verification/src/application/operations/verification-execution-timing.ts src/libs/modules/email-verification/src/email-verification.module.ts src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/verification-execution/verification-execution-queue.integration.spec.ts
corepack pnpm architecture:check
corepack pnpm typecheck
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:async-verification
```

For HTTP timing assertions, inject a short deterministic budget and allow scheduling tolerance; do not encode
fragile wall-clock equality. The real-Redis test must report executed cases, not skipped cases. Bruno is updated
because this affects a stateful API failure path; the launcher runs the local collection. If its owned stack is
unavailable, run static collection validation and report runtime execution as unverified. No checks have passed
merely because this plan lists them.

## Idempotence and Recovery

The operation ID and execution ID do not change after timeout. Repeating a keyed submission returns the stored
operation, and the runner's existing lease plus credit-operation identity govern all later queue deliveries.
Clean up only test-owned queue prefixes and connections. No database reset, migration, or restart of an existing
service is required. Update the synced issue and PR metadata through the root workflow when implementation starts.

## Artifacts and Notes

Review evidence established that a real BullMQ dispatcher with unavailable Redis remained pending after admission;
adding `.catch()` alone could not produce the response. This plan changes waiting behavior, without claiming a
successful live end-to-end SMTP run. The prerequisite merged in PR #629; recheck the constructor and queue fixture
paths against the implementation branch before coding.

## Plan readiness

Ready to implement
