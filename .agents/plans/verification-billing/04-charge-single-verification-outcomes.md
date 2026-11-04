# Charge Single Verification by Its Final Outcome

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Activate the agreed policy on synchronous and asynchronous single-email verification. A fresh conclusive result
costs one credit; cached, shared, inconclusive, invalid, or failed work costs zero. A user with zero credits can
still retrieve a reusable cached result. Both routes use the same durable operation and expose its actual charge.

## Progress

- [x] (2026-09-08) Replace HTTP guard debits with validated operation admission on both single routes.
- [x] (2026-09-14) Connect durable operations to async execution, status lookup, and synchronous completion.
- [x] (2026-09-14) Add support for request replay, rate limits, and outcome metadata.
- [x] (2026-09-14) Update generated contracts, focused tests, and the SMTP Bruno workflow.
- [x] (2026-09-14) Complete local runtime, architecture, type, and documentation checks.

## Plan dependencies

- `verification-billing/03`

## Surprises & Discoveries

`CreditGuard` currently debits before DTO validation, so malformed email bodies and enqueue failures can consume
a credit. The async worker currently verifies and persists again on a retry. Its queue state also decides whether
the HTTP result is visible. All three behaviors must move to the durable operation contract together.

Four real defects were found and fixed during implementation, none of them anticipated by the plan above:

1. **Deadline-cancellation never released credits or settled requests** (plan-03 regression). The deadline branch
   in `VerificationReconciler.reconcileExecution` called only `executions.cancelIfNoCaptureIntention`, leaving a
   canceled execution's reservation held forever and its linked requests stuck `billingState: 'pending'`. Fixed by
   calling `credits.release(...)` and a new `VerificationRequestStore.settleCanceled(...)`, but only when the
   cancellation actually transitions the row rather than replaying a no-op.
2. **`lastVerificationId`/email-cache advancement stopped working** (plan-03 regression). Only the old
   `EmailVerificationOrchestrator.verify()` ever called `EmailAdministrationService.upsertEmail(...)`; the new
   durable stack never did. Fixed by having `VerificationSettlementService.settle()` call it immediately after
   `confirmSettlement()` succeeds, gated at exactly the point the result becomes visible.
3. **A caught Postgres unique-violation poisoned the whole transaction** in the race-recovery path of
   `TypeOrmVerificationExecutionStore.claimOrJoin()` (plan-03 regression). Real Postgres aborts every subsequent
   statement in a transaction after a caught statement error, not just the one that failed. Proved this with a
   throwaway script against a real Postgres instance. Proved the fix the same way: wrapping the risky insert in a
   nested `manager.transaction()` so TypeORM issues a real `SAVEPOINT`. Added a deterministic regression test using
   a manually-held-open `QueryRunner` to force the exact race.
4. **A scheduled retry silently vanished** in the new `VerificationExecutionProcessor`. Re-adding a delayed job
   with the same `jobId` as the currently-processing (still `active`) job is a silent no-op in BullMQ: it dedupes
   by job ID against any nonterminal job and returns the existing job unchanged. The "retry" was simply dropped,
   leaving the reconciler's 30-second sweep as the only path forward. Proved this empirically against real Redis
   with a throwaway script. Proved the fix the same way: `job.moveToDelayed(timestamp, token)` plus
   `throw new DelayedError()`, which transitions the *same* job instance instead of adding a duplicate. Added a
   real-Redis regression test.

A fifth issue was a wiring gap rather than a logic bug. `EmailVerificationModule` never imported `ConfigModule`.
Any of its own `ConfigService`-injecting factories — the async-service composition, the two rate-limit
configuration factories, and the new `RUN_SYNCHRONOUS_VERIFICATION` factory — would therefore fail to resolve the moment the
real application module tree was ever instantiated end-to-end. Every test in this repository builds an isolated
`Test.createTestingModule()` with hand-picked providers, so nothing had exercised the actual production DI graph
until `corepack pnpm openapi:export` did. That is exactly why this had been latent since the async factory was
first written earlier in this same implementation. Fixed by importing `ConfigModule` directly into
`EmailVerificationModule`, matching the pattern `EmailVerificationCoreModule` already used successfully.

Reusing the same fixture address (`person@lef.test`) across multiple credit-behavior Bruno requests silently
breaks under the new cache-first admission model. Once an address settles a conclusive result, every later
submission of that same address is a free cache hit regardless of balance, no matter how much the fixture story
wants to test paid/rejected paths against it. Both `bruno/async-verification/` and `bruno/smtp-dev/` needed
dedicated, never-before-used addresses for each distinct credit-behavior scenario (zero-balance rejection,
single-credit consumption). The `smtp-dev` evidence-scenario battery (requests 31–46) keeps its own
already-distinct addresses, but is now newly exposed to a same-day-rerun fragility if the development database is
not reset between runs. That risk is documented in its README rather than fixed, since `pnpm dev:reset` already
resets the database as part of the collection's own documented startup procedure.

## Decision Log

- Decision: Validate authentication, permissions, headers, and normalized input before reserving credits.
  Rationale: A rejected request cannot create a financial effect. Date/Author: 2026-09-08, policy planning.
- Decision: Keep optional `Idempotency-Key` support backward compatible and scope keys to organization and request
  identity. Rationale: Existing callers work, while deliberate retries can recover a known operation without another
  charge. Date/Author: 2026-09-08, policy planning.
- Decision: Preserve synchronous `201` for completed results and add `202 { id }` when an admitted operation cannot
  finish within 30 seconds. Rationale: A durable handle is safer than reporting a lost or failed verification while
  its financial settlement remains pending. Date/Author: 2026-09-08, policy planning.
- Decision: Use a 60-request token bucket with one token refilled per second per organization, five concurrent
  outbound executions, and a 60-second terminal-inconclusive address cooldown. Rationale: Free outcomes must not
  create unlimited probe attempts. These are configurable engineering defaults, separate from credit pricing.
  Date/Author: 2026-09-08, policy planning.
- Decision: Bound execution concurrency (`VerificationExecutionPermits`) globally, not per organization, though the
  permit row still stores `organizationId` for a cheap future switch. Rationale: matches the plan's own wording
  ("the five-execution cap queues funded work") and mirrors how `RedisProxyLeaseStore` already globally bounds
  outbound proxy usage against third-party mail infrastructure. Date/Author: 2026-09-14, implementation.
- Decision: A mid-execution `cooldown` join (an admission joins an execution already `awaiting_retry`) is not
  redispatched onto the async queue immediately; it relies on the reconciler's existing ~30-second sweep cadence
  instead. Rationale: a deliberate latency/complexity trade — avoids a second dispatch path for a state the
  reconciler already recovers, at the cost of up to ~30 seconds of extra latency in a narrow, already-degraded
  case (an execution is already retrying). Date/Author: 2026-09-14, implementation.
- Decision: Permit-renewal failure is best-effort/log-only during an execution attempt, unlike lease-renewal
  failure, which aborts the in-flight probe. Rationale: losing the permit slot briefly does not risk a double
  charge or a lost result the way losing the lease does — the lease is the correctness fence; the permit is a
  concurrency throttle. Date/Author: 2026-09-14, implementation.
- Decision: Neither `VerificationAdmissionService`, `VerificationExecutionRunner`, nor `RunSynchronousVerification`
  emit any `VerificationTraceObserver` events; the entire durable stack has no tracing wiring. Rationale: the plan's
  Non-Goals never mention tracing, and adding it would mean designing a new event vocabulary for admission/execution/
  settlement transitions — a materially separate piece of work. The existing observer keeps working unchanged for
  batch's continued use of `EmailVerificationOrchestrator`. Recommended as a follow-up, not silently dropped: the
  now-untestable HTTP-level trace-chain integration spec (`verification-trace.integration.spec.ts`) was deleted
  rather than left permanently red, since neither route it exercised emits these events anymore.
  Date/Author: 2026-09-14, implementation.
- Decision: The sync route's `201` response gains an optional `operation` field on the existing
  `EmailVerificationResponseDto` (also used by `GET /verifications/:id`, which never populates it — that route
  reads by result ID with no single billing operation to describe). Rationale: reuses one DTO instead of adding a
  parallel sync-only response type, matching the plan's "share one function" intent for the flat-result +
  operation-metadata mapping. Date/Author: 2026-09-14, implementation.
- Decision: A `failed` synchronous outcome is folded into the same `202 { id } + Location` fallback as budget
  exhaustion, rather than inventing a sync-only failure response shape. This outcome is a settled request with no
  result; it is only reachable if the reconciler cancels the joined/driven execution past its 24-hour deadline
  mid-request, which is astronomically unlikely within a 30-second budget. Rationale: the caller can already read
  the fully discriminated
  `failed` state via `GET /verifyAsync/:id`. A second failure shape for a practically-unreachable edge case would
  be pure surface-area growth. Date/Author: 2026-09-14, implementation.
- Decision: The `verification-execution` queue's own Redis/BullMQ integration test
  (`verification-execution-queue.integration.spec.ts`) and the `async-email-verification` queue's dead-flow removal
  replace the plan's originally-named `verification-admission-policy.spec.ts` and
  `async-email-verification-composition.integration.spec.ts` in the Validation section below. Rationale: the
  composition spec's premise — compose the whole old single-submission flow against real Redis with a fake core —
  no longer maps onto the new architecture, since single-submission no longer dispatches onto the
  `async-email-verification` queue at all. A real-Postgres-and-real-Redis "full stack" composition test would
  substantially duplicate `verification-billing.integration.spec.ts` plus the per-queue integration specs. The
  admission-policy spec was written as `verification-admission.service.spec.ts` under the existing per-file naming
  convention, rather than as its own separate file. Date/Author: 2026-09-14, implementation.

## Outcomes & Retrospective

Both single-verification routes now drive the plan-03 durable admission/execution/settlement stack instead of
`CreditGuard`, which used to debit unconditionally before validation ever ran. `POST /verifyAsync` admits and
dispatches onto a new `verification-execution` BullMQ queue. `POST /verify` admits and, for its own funded
execution, drives it inline against a 30-second budget, falling back to `202 { id } + Location` on timeout or on
someone else's in-flight execution, reusing the exact same admission/read machinery as the async route. Both
routes accept an optional UUIDv7 `Idempotency-Key`, are protected by a Redis token-bucket
`VerificationRateLimitGuard`, and surface an additive `operation` metadata block once a request settles.
`GET /verifications/:id` now hides a result until its settlement is confirmed. Four real defects in already-merged
plan-03 code and this plan's own new queue processor were found and fixed along the way (see Surprises &
Discoveries). Each is backed by a real-Postgres or real-Redis regression test proving the failure mode and the fix.

Full validation passed: `typecheck`, `architecture:check` (9 modules, 0 violations), the complete
`email-verification` module Jest suite (86 non-gated suites, 760 tests), every Redis-gated suite run against a
real local Redis, every Postgres-gated suite run against a real disposable Postgres
(`test:verification-billing-postgres`, 6/6), `openapi:export`/`generate`/`check`, and `docs:lint` on both touched
Bruno READMEs. `bruno:async-verification` and `bruno:smtp-dev` could not be executed live end-to-end in this
environment. Both fail at the launcher's `fixture_bootstrap` stage, even after rerunning `keycloak:provision` and
`keycloak:seed-customer-fixture` and confirming the base dev stack's API container itself boots cleanly on this
branch — restarted and verified healthy, with all new routes registered in its own logs. The `smtp-dev` collection
additionally requires its own Compose overlay (`docker/compose.smtp-dev.yaml`) and a `pnpm dev:reset`, neither of
which this session started unprompted. Both collections were instead validated statically. Every assertion changed
or added mirrors the exact JSON shapes already proven correct by the passing Jest HTTP integration tests for the
same routes. The expected request/test count in the `async-verification` registry was updated to match its new
file count (15 → 23). A systemic same-address cache-reuse hazard that this PR's own caching model introduces into both
collections' credit-behavior tests was found and fixed (see Surprises & Discoveries) before it could ever be
exercised live.

The two Redis/BullMQ dead-flow removals (`async-verification-jobs.ts`, `bull-async-verification-jobs.ts`, and their
specs) and two HTTP-level integration specs whose entire premise no longer maps onto the new architecture
(`verification-trace.integration.spec.ts`, `async-email-verification-composition.integration.spec.ts`) were
deleted rather than patched. Each one's remaining valid coverage (worker/backoff behavior, batch-child dispatch, observer
unit behavior) already exists elsewhere and is called out in the Decision Log above.

## Context and Orientation

Within `src/libs/modules/email-verification/`, the current controllers are
`src/api/http/synchronous-verification/current/sync-email-verification.controller.ts` and
`src/api/http/asynchronous-verification/async-email-verification.controller.ts`. They both use `CreditGuard`.
The synchronous application command is `src/application/delivery/synchronous/run-synchronous-verification.ts`;
async admission is `src/application/delivery/async/async-email-verification.service.ts` and its worker is
`src/infrastructure/queues/async-verification/async-email-verification.processor.ts`.

Plan 03 supplies durable request/execution identities, funded admission, evidence-aware complete-result caching,
concurrent execution sharing, and recoverable settlement. Plan 02 preserves total balance and adds reserved and
available counts. This plan connects those capabilities to HTTP. Batch still uses its existing adapter until Plan 05.

## Scope and Non-Goals

Change single-route billing, request recovery, safe response metadata, and execution admission. Preserve current
permission names, organization concealment, secure SMTP checks, source selection, and existing result fields.
Do not implement batch deduplication, browser screens, forced refresh, customer cancellation, new payment flows,
or a new history endpoint. No automatic client retry is introduced.

## Plan of Work

Remove `CreditGuard` from these two POST methods. Keep global authentication, browser mutation protection,
`PermissionsGuard`, and DTO validation. Normalize before validating, with the same trim/lowercase function used by
cache identity. Reject missing or invalid addresses without reserving. Parse an optional single canonical lowercase
UUIDv7 `Idempotency-Key`; reject malformed, repeated, or combined headers with `400`. Apply the key timestamp
and replay-window rules from Plan 03, returning `410` for an expired key and `400` for a key too far in the future. Do not import the credits
controller's private parser. Implement a transport-local parser or an intentional small shared contract.

Call Plan 03 admission with the principal's organization and credential, delivery mode, normalized address, and
optional key. Cached results and already-funded execution followers bypass balance admission. A new uncached
execution requires one available credit and returns `402` with safe `insufficient_credits` on failure. A conflicting
key returns `409`; a known expired operation/key returns `410`. Missing/foreign status or result identifiers remain
indistinguishable `404` responses. Require the existing permissions on every replay and lookup.

Use the durable request UUID as the returned async job handle. Queue payloads refer to the durable execution and
attempt generation rather than relying on queue data to decide charging. A lost dispatch is recovered by Plan 03;
return `202 { id }` once durable admission succeeds even if dispatch must be retried. Return `503` only when durable
admission cannot be confirmed, without guessing that work is absent. A retry with the same supplied key resolves it.
Async cache hits also return `202 { id }`, whose first status read may already be completed.

A synchronous call executes or joins the same operation, waiting at most 30 seconds. Return the existing flat result
with additive operation metadata and `201` only after settlement. Otherwise, return `202 { id }` plus
`Location: /verifyAsync/<id>`; this route can read operations admitted through either single entry point.
Do not debit when the HTTP connection closes. Recovery continues the same durable operation and decision.

Status comes from durable request/execution/settlement state, not BullMQ completion alone. Preserve the existing
status vocabulary or the normalized vocabulary delivered by `frontend/11`; pending settlement must remain a
nonterminal state, never a completed result with an unknown charge. Safe terminal failure codes describe failed
work without exposing exception text. Extend `GET /verifications/:id` to expose original evidence timestamps;
this result lookup remains read-only and organization-scoped. Update `TypeOrmVerificationResultReader` so it hides
new execution results until their settlement is confirmed, including guesses of their result UUID. Apply the same
gate to last-result links and cache publication. Keep legacy settled records readable. Per-request charges belong to operation metadata,
so a free cached request does not inherit the producing request's one-credit charge.

Add an application admission policy behind `VerificationSubmissionLimiter` and `VerificationExecutionPermits`.
Implement the submission token bucket atomically in the existing Redis infrastructure. Count all POST submissions,
including free hits, within the organization bucket; exempt read-only status and result retrieval. Failed
authentication never reaches the limiter. Rate rejection returns `429` and integer `Retry-After`, before new
reservation or queue admission. A Redis admission failure returns safe `503`, not unlimited free execution.

Use short, organization-serialized PostgreSQL permit acquisition with the execution lease/generation from Plan 03
to bound concurrent outbound work across sync, async, and later batch workers. The five-execution cap queues funded
work; it does not reject a caller after reservation. Cached/shared reads need no outbound permit. A terminal
inconclusive attempt records a 60-second address cooldown; a new uncached submission during it returns `429` with
`verification_cooldown` and `Retry-After`. Replay of the original operation still returns its recorded outcome.
Infrastructure admission failures and invalid input do not start an address cooldown.

Add validated positive-integer configuration for rate capacity/refill, concurrency, and cooldown, with the defaults
recorded above. Inject plain policy values. Update the module README, route documentation, browser OpenAPI allow
list, and generated schema. Update the existing SMTP collection rather than creating a duplicate workflow.
Retain a temporary, explicit legacy worker path for existing batch child payloads; Plan 05 removes that path.
Version the new payload and test both adapters so this PR cannot accidentally stop all batch verification.

## Interfaces and Dependencies

Keep existing result fields. Add `operation` to completed synchronous responses and to async status responses:

```typescript
type VerificationOperationMetadata = {
    id: string
    source: 'fresh' | 'cache' | 'shared'
    observedAt: string | null
    cacheExpiresAt: string | null
    billing: {
        state: 'pending' | 'settled'
        reserved: 0 | 1
        charged: 0 | 1
        reason?: 'conclusive' | 'cached' | 'shared' | 'inconclusive' | 'failed'
    }
}
```

`reason` is present only when settled; pending counts are authoritative snapshots, not estimated deductions.
Timestamps describe evidence, never HTTP request time. Completed cached/shared operations have zero reserved and
charged credits. Equivalent keyed replay reports the original metadata, without implying another deduction.
Update common DTO contracts and `packages/api-client/src/schema.d.ts` through the generation commands.

## Acceptance Criteria

- Valid uncached conclusive positive and negative results each deduct exactly one credit after persistence.
  Invalid bodies, unknown outcomes, unresolved catch-all, transport failures, and exhausted retries deduct zero.
- With zero available credits, a valid complete cache hit and an already-funded follower succeed; fresh work
  rejects with `402`. A pending reservation does not reduce total balance, and completion updates it exactly once.
- Equivalent keyed retries, simultaneous requests, worker retries, and repeated polls create no additional debit.
  Same-key conflicting input returns `409` without changing the original operation.
- Lost dispatch, settlement failure, and synchronous timeout yield a recoverable handle after durable admission;
  no completed response is published before the final charge is confirmed.
- Foreign organization handles return `404`; `401`, `403`, `400`, and `429` paths never reserve new credits.
- Rate and cooldown rejection include `Retry-After`. Multiple workers never exceed the configured execution
permits. Local-fixture sockets close within the shutdown bound from Plan 03 after lease loss; delayed takeover prevents
overlap within that tested bound. An expired worker cannot finalize a charge after losing its fence.
- Existing batch jobs retain their old behavior until Plan 05. OpenAPI and generated browser types match both
  synchronous response variants and async operation metadata.

## Validation

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts src/libs/modules/email-verification/src/application/operations/verification-admission.service.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/verification-execution/verification-execution-queue.integration.spec.ts --runInBand
corepack pnpm test -- src/libs/modules/email-verification --silent   # full module suite; add TEST_REDIS_URL for the Redis-gated suites
corepack pnpm test:verification-billing-postgres
corepack pnpm bruno:async-verification   # updated (15 -> 23 requests); live execution blocked in this environment, see Outcomes
corepack pnpm bruno:smtp-dev             # updated in place; live execution blocked in this environment, see Outcomes
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
```

Extend the real-Redis queue suite for shared work, lost dispatch, permits, token buckets, and temporary-block retries.
Use `TEST_REDIS_URL` only for a disposable instance. Bruno must execute the changed success, invalid-input, zero-credit
cached/uncached, keyed replay/conflict, inconclusive release, and polling cases. Update runner expected counts to
reject skipped or empty runs. Use local trusted SMTP/DNS fixtures; a nullable result is not a conclusive success.
If runtime dependencies are unavailable, report that explicitly instead of substituting mocked tests as live proof.

## Idempotence and Recovery

Use the same request key when recovering an uncertain submission. Poll the returned handle instead of issuing a
new request. Queue and settlement replays reuse the stored execution reference. Restarting the reconciler resumes
pending work without dropping reservations. For disposable schema reset, use the checkout-ownership checks and
`corepack pnpm dev:reset -- --confirm-project=LEF`; it resets and reseeds the local stack only. Stop the old workers
before any incompatible development reset. Do not migrate or reconcile historical charges.

## Artifacts and Notes

`frontend/11` had already merged by implementation time. Its hard frontend constraint — only `POST /verifyAsync`
and `GET /verifyAsync/:id` are called, and the 5-value status vocabulary is fixed — was confirmed by reading
`VerificationPage.test.tsx`, the Playwright `single-verification.spec.ts`, and `verification-copy.ts` directly.
That shaped the redesign of `mapAsyncVerificationStatus`: durable execution states map down onto the existing 5
values, and the new `operation` block is additive only. Plan 06 still owns browser copy and presentation of this
policy.

## Plan readiness

Ready to implement
