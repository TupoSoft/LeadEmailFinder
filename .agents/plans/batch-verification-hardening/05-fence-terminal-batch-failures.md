# Stop Pending Verification After a Terminal Batch Failure

This living document follows `.agents/PLANS.md` and describes exactly one pull request.

## Purpose / Big Picture

A terminal batch failure must stop owned executions that have not started and release their credit reservations. Work
already running or committed to capture completes through normal settlement; another batch's shared work is
unaffected. A developer can fail the first dispatch of a funded batch, run recovery, and observe zero probes and
zero captures for its canceled addresses, with the reserved credit returned exactly once.

This plan adds durable failure cleanup to the group recovery introduced by `batch-verification-hardening/03`.
It remains effective when the worker stops between marking failure, fencing execution, and releasing credits.

## Progress

- [ ] (2026-09-15 16:54Z) Extend group recovery with durable terminal-failure state and cleanup dispositions.
- [ ] (2026-09-15 16:54Z) Connect final queue failure detection to application cleanup and recovery.
- [ ] (2026-09-15 16:54Z) Prove funding, lease, capture, retry, and worker-stop races with focused fixtures.
- [ ] (2026-09-15 16:54Z) Update HTTP/Bruno coverage and documentation, then record checks and final outcomes.

## Plan dependencies

- `verification-billing/05`
- `batch-verification-hardening/03`
- `batch-verification-hardening/04`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reuse the group lease and recovery sweep from hardening/03. Terminal failure closes that same group
  and invalidates its lease generation; a parallel cleanup scheduler would create competing funding decisions.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Preserve running executions and durable capture intentions. Select and persist only cancelable owned
  operations for credit closure because `closeAdmissionMany()` rejects any list containing a captured receipt.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Determine finality at the BullMQ adapter. A pending-settlement signal or an attempt with a remaining
  retry does not authorize cancellation. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Review evidence is pinned to PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`. The planning checkout at
`451798dadf82e316ba68b4333ddba32bf0f99a97` lacks that implementation. Implement after the listed prerequisites
and verify the named contracts against their merged code before editing.

`BatchEmailVerificationWorkflow.dispatchExecutions()` dispatches admitted, funded operations individually.
`BatchEmailVerificationProcessor` currently records a safe failure code and rethrows a dispatch error. The
execution reconciler subsequently runs remaining queued operations without considering the failed parent.
The review reproduced two new probes and two captures after the first batch dispatch failed.

Relevant files are below `src/libs/modules/email-verification/src/` unless otherwise specified:

- `application/delivery/batch/batch-email-verification-workflow.ts`, `batch-admission.service.ts`, and
  `batch-admission-store.ts` own the batch workflow and durable group admission contracts.
- `application/operations/verification-reconciler.ts` and `verification-execution-runner.ts` recover and run work.
- `application/ports/verification-execution-store.ts` defines `cancelBatchGroupUnstarted()`; its implementation
  in `infrastructure/persistence/typeorm-verification-execution.store.ts` currently has no production caller.
- `infrastructure/queues/batch-verification/batch-email-verification.processor.ts` owns BullMQ failure handling.
- `infrastructure/persistence/typeorm/batch-admission.entity.ts` and `batch-unique-address.entity.ts` retain group
  and address state. The composition modules introduced by hardening/03 own their recovery wiring.

Hardening/03 introduces `funding`, `fundingDecision: pending|approved|denied|closed`, an admission lease with
owner/generation/expiry, a frozen owned manifest, and a bounded recoverable-group sweep. Its database lock order
is organization admission lock, batch row, then execution row. Hardening/04 attaches requests through the same
terminal-aware admission boundary. These contracts are prerequisites, not optional alternatives.

The API's root BullMQ configuration provides only a connection. Batch queue registration and enqueue supply
no `attempts` override, so production currently gets one attempt. The real-Redis batch suite explicitly tests
three attempts with fixed backoff. Installed BullMQ retries when another attempt remains and the error is not
unrecoverable or discarded; a backoff result of `-1` can also make an attempt terminal.

## Scope and Non-Goals

Add one durable terminal-failure path, group cleanup, and its recovery. Preserve existing batch failure codes,
organization isolation, execution deadlines, public endpoints, and successful publication. HTTP billing state
must remain pending while any owned reservation still lacks a confirmed terminal disposition.

Do not introduce customer cancellation, new retry settings, database result downloads, frontend changes, or
production migrations. Hardening/06 separately corrects `resultsAvailable`; this plan does not promise access
for results that were never published. Read the customer profile for context without adding product claims.

## Plan of Work

Read the repository and module instructions, email-verification README, credits public contract, and SOLID skill.
Extend the existing group state with `failure_requested` and `failure_settled`, plus the safe terminal failure
code. Add a nullable `terminalFailureDisposition: cancel|settle` on each owned unique-address record. The failure
transition sets `fundingDecision: closed` and invalidates the admission lease generation under the group lock.
Persist it first, then begin credit cleanup. Shared addresses never receive an owned cleanup disposition.
An invalid upload with no admission group has no owned execution to clean up; failure marking is a safe no-op.

Expose `requestTerminalFailure(batchId, organizationId, failureCode)` and `recoverTerminalFailure(batchId,
organizationId)` on a purpose-specific application service composed with the existing group recovery service.
The latter uses the same bounded sweep and lease. Add `pageParentObservationCandidates(limit)`, including admitted
and ready groups excluded by the admission query from hardening/03. Persist `parentObservation: pending|completed|failure_settled`
and `parentObservationCheckedAt`; select pending observations oldest-check-first and update the checked time after
attempts. Retire a candidate only after observing its actual completed parent or confirming failure cleanup. This
bounded phase runs inside the existing sweep; it creates no separate scheduler and does not repeatedly scan completed groups.
A narrow `BatchTerminalStateReader` port reads fresh organization-scoped queue state outside database transactions.
Return explicit `failed`, `completed`, `active`, `missing`, or `unavailable` outcomes; queued/delayed states are active.
Use the validated failed-parent code or `processing_failed`; an ownership mismatch is unavailable, never authority
to close another group's work. Missing parents without a durable failure marker remain pending observations and
defer new probes; neither absence nor Redis errors establish failure. An existing durable marker needs no parent.

At the processor's normal error boundary, recognize the known final attempt using `attemptsMade + 1` and
`job.opts.attempts ?? 1`, including unrecoverable errors. Persist failure before throwing the original error again; do not fence
intermediate attempts. Keep `BatchAwaitingSettlementSignal`, successful `moveToDelayed`, and `DelayedError` outside
this branch. If durable marking temporarily fails, persist `terminalFailurePending: true` and the original safe
failure code in queue data, then defer this same job with the existing delayed-job idiom. On its next attempt,
retry marking before advancing the workflow; an ordinary earlier `failureCode` alone never requests closure.

Also handle a freshly observed BullMQ `failed` state after worker failure events and in group recovery. This
authoritative state covers exhausted stalled jobs and special BullMQ terminal paths without copying its private
retry implementation. A failed event alone does not establish terminal failure: retryable failed attempts also emit
events. Read the actual job state. A restarted processor checks durable group failure before workflow dispatch.
Add a shared `BatchExecutionStartGuard` at `VerificationExecutionRunner.execute()` before a new batch-owned lease,
so execution-queue workers and the generic execution reconciler both consult it. It reads the parent outside the
transaction and persists an observed failure before returning a blocked outcome. The guard carries the observed
group generation into `acquireLease()`, which locks group then execution and rechecks generation, closed state, and
disposition. The failure decision takes effect when the durable group marker commits; Redis and database reads are separate:
a lease acquired before that marker counts as running and is preserved. Missing/unavailable parent state blocks
brand-new probes; running work and members already marked `settle` may continue their established settlement path.
Recovery consults the same guard before dispatch and recovers a failed parent's marker before enabling new work.

Under the same group-to-execution lock order, page the owned manifest and assign immutable dispositions. Fence
`funding_pending`, `queued`, and `awaiting_retry` executions lacking capture intentions, and mark them `cancel`.
Select `running`, `settling`, completed, or capture-intention executions as `settle`; keep their normal settlement
and deadline recovery. Block new leases for closed-group members until disposition is assigned. Once assigned,
only preserved `settle` members may continue their existing execution lifecycle. Reuse and harden
`cancelBatchGroupUnstarted()` so it checks capture intentions, ownership, and the group generation before mutation.

In bounded pages, call `CreditReservationService.closeAdmissionMany()` only for the persisted `cancel` subset,
using its original frozen operation IDs and amounts. It releases held receipts and creates closed receipts for
unfunded IDs. Skip the call for an empty subset. Never include running or captured receipts. Then settle linked
canceled requests through the existing request store. Repeat incomplete pages after interruption. A delayed
funding response cannot queue work because the closed group invalidates its generation; a delayed reservation
retry cannot reopen operations whose receipts are closed. Do not rebuild the subset from mutable current states.

Continue normal settlement for `settle` members and shared requests. Mark `failure_settled` only after all owned
receipt dispositions and canceled request updates are confirmed; until then expose pending batch billing through
the existing status service. Reconcile closure even if the BullMQ parent is removed after its durable failure
marker exists. Record only opaque IDs, safe codes, and counts in existing trace events.

Add unit and real-Postgres tests for every interruption point and concurrency case below. Extend the existing
real-Redis batch suite for final versus intermediate errors and restart recovery. Add deterministic HTTP coverage
for failure status and accounting. Extend the existing Bruno collection's failure assertions and owned/foreign
checks; use injected faults in integration fixtures rather than adding a public failure-control endpoint. Update
fake workflow outputs and required request/test counts in `scripts/bruno/batch-verification-runner.test.mjs` when
collection expectations change, so launcher validation verifies the real collection instead of stale fixtures.

## Interfaces and Dependencies

Extend the admission store, recovery lease, and composition modules from `batch-verification-hardening/03`. Keep BullMQ/Nest concerns in queue
adapters, group policy in application services, and atomic fencing in TypeORM adapters. Import credits only through
its public barrel. Update the module README and architecture descriptions for the new internal contracts.

No new configuration or library is required. The group states, parent-observation fields, safe failure code, and per-address
disposition use TypeORM synchronization against disposable development data. These fields remain internal; do not expose
lease generations, provider errors, or organization IDs through the API. Existing HTTP failure codes remain intact.

## Acceptance Criteria

- A funded batch whose final attempt fails before first dispatch produces no probes or captures for cancelable
  owned addresses after failure marking; each held credit is released once and each canceled request settles free.
- A failure after one execution acquires its lease preserves that execution and its eventual capture or release;
  owned work that has not started is canceled. Shared work owned by another request or batch is untouched.
- Pending settlement, intermediate attempt failure, and later successful retry do not close any group receipt.
  A terminal stalled job is discovered by recovery even if its worker never ran the failure callback.
- Concurrent funding, lease acquisition, cleanup, and capture cannot reopen the closed group, cancel a durable
  capture intention, or lose a receipt. Repeated cleanup never includes a preserved captured receipt.
- Stopping after failure marking, execution fencing, receipt closure, or request settlement resumes safely; a
  failure marker also survives parent-job removal. Ready/admitted groups remain discoverable until actual parent
  completion or finished cleanup. Missing-parent and Redis-outage fixtures block new probes through both execution
  entry points without manufacturing failure or stopping preserved running work. Billing remains pending until cleanup.
- Authenticated HTTP failure responses retain safe codes; foreign batch reads remain concealed. Focused database,
  Redis, HTTP, architecture, type, and Bruno checks pass with actual runtime execution reported separately.

## Validation

Run these commands from the implementation checkout after adding the named focused specs:

```bash
corepack pnpm exec jest --runInBand batch-terminal-failure.service.spec.ts batch-execution-start-guard.spec.ts batch-email-verification.processor.spec.ts batch-email-verification-workflow.spec.ts typeorm-verification-execution.store.spec.ts verification-reconciler.spec.ts batch-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm exec jest --runInBand batch-email-verification-queue.integration.spec.ts
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm bruno:batch-verification
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/05-fence-terminal-batch-failures.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

The PostgreSQL launcher owns a disposable synchronized database and rejects zero/skipped execution. Put its race
tests in `verification-billing.integration.spec.ts`. Set `TEST_REDIS_URL` to the verified checkout-owned test Redis
before running the queue suite; without it the suite skips and cannot count as evidence. Prove actual one-attempt
failure, three-attempt retry success, delayed settlement, and stalled-parent recovery over Redis. The Bruno launcher
uses the pinned `bru run --env local --sandbox developer` against this checkout's seeded stack. Update its required
request and test counts if collection cases are added. If runtime dependencies are unavailable, record that limit.

## Idempotence and Recovery

The durable marker, generation fence, immutable closure subset, and existing receipt IDs make every cleanup stage
repeatable. Never clear the failure marker to retry billing. Fix the interrupted dependency and resume group
reconciliation; it completes missing closure or settlement without admitting new work.

For incompatible development state, inspect the checkout-owned targets and use
`corepack pnpm dev:reset -- --confirm-project=LEF` to rebuild, reset, and reseed the disposable stack. Use
`TYPEORM_SYNCHRONIZE=true` there and the existing test launcher for its isolated database. Do not add migrations,
production backfills, or reset another checkout. Record actual validation and Harper results before completion.

## Artifacts and Notes

The review reproduced the failure with production workflow, processor, reconciler, runner, and settlement services
using controlled adapters: final dispatch failure left two executions queued; the next sweep probed and captured
both. The proposed PR title is `fix(verification): fence terminal batch failures`. This plan unlocks safe operational
recovery; it does not replace the independent truthful-download flag correction.

## Plan readiness

Ready to implement
