# Settle Batch Requests That Attach After Execution Finishes

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A batch must finish when all its selected executions have settled, even if a worker restarts or shared work finishes
before batch receipt materialization. This plan delivers one PR,
`fix(email-verification): finalize batch requests against execution state`, addressing finding 1 from PR #633.

## Progress

- [ ] (2026-09-15) Route stable batch receipts through the existing terminal-aware finalization boundary.
- [ ] (2026-09-15) Cover completion, settlement in progress, cancellation, and receipt replay.
- [ ] (2026-09-15) Prove both settlement race orders against PostgreSQL and finite batch completion over Redis.
- [ ] (2026-09-15) Validate public workflows and update the module documentation.

## Plan dependencies

- `verification-billing/05`
- `batch-verification-hardening/01`
- `batch-verification-hardening/03`
- `verification-billing-hardening/03`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reuse the finalization operation from `verification-billing-hardening/03` for batch callers.
  Rationale: One execution lock must govern attachment and settlement for every delivery mode; a parallel batch
  implementation would permit inconsistent lock ordering. Date/Author: 2026-09-15, Codex planning.
- Decision: A late actual payer inherits the confirmed charge, while a late follower inherits the result for free.
  Rationale: Delayed receipt creation cannot transfer payer ownership or change a credit decision.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Keep the waiter based on settled request records. Rationale: Labeling a pending receipt complete from
  execution state alone would hide unfinished billing and corrupt output. Date/Author: 2026-09-15, Codex planning.
- Decision: Only group recovery resumes batch receipts in the preparing state. Their candidate field records the selected
  execution UUID, or the receipt UUID when no execution exists, without granting ownership or permission to fund.
  Rationale: Reusing the common receipt schema must not route batch work through single-request admission.
  Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

This plan uses PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`, reviewed on 2026-09-15. The planning
checkout is `451798dadf82e316ba68b4333ddba32bf0f99a97` and lacks that batch implementation. Its explicit
dependencies supply the batch flow, stable receipt identity, and the shared settlement lock before implementation.
All paths are repository-relative; shortened module paths below begin at
`src/libs/modules/email-verification/src/`.

`application/delivery/batch/batch-admission.service.ts` currently queues owned executions before it inserts any
batch requests. It also inserts shared requests after selecting someone else's active execution. Meanwhile,
`infrastructure/persistence/typeorm-verification-settlement.store.ts` settles only the requests it can find at
confirmation. Completed executions and confirmed intentions leave normal recovery queries.

`TypeOrmBatchAdmissionStore.countUnsettledAddresses()` checks the manifest receipt, and
`BatchEmailVerificationWorkflow.awaitSettlement()` delays the batch until every receipt has settled. The review's
real PostgreSQL reproduction completed an execution and captured one credit before request insertion. The inserted
request retained pending billing and a null result after reconciliation; the batch's unsettled count remained one.

`verification-billing-hardening/01` defines durable preparing receipts and `finalizeAdmission` for single requests.
Its plan 03 owns locking and terminal inheritance. This plan adopts that completed mechanism for batch receipts
without adding those single-request fixes a second time. Batch plan 01 supplies immutable per-address request UUIDs.

## Scope and Non-Goals

Integrate batch materialization with the shared request-finalization contract. Cover new payer receipts, shared
followers, replay, cache receipts, and receipts for addresses in a cooldown period. Preserve the public status vocabulary, prices, result visibility,
organization concealment, and original CSV rows. Do not redesign the shared lock algorithm, fix group funding or
terminal dispatch cleanup, add S3 fallback, or introduce a sweep that repairs arbitrary old pending requests.
This PR unlocks terminal batch cleanup that can safely settle receipts regardless of attachment timing.

## Plan of Work

In `application/delivery/batch/batch-admission.service.ts`, replace direct insertion of an attached request with pending
billing with the request-claim and finalization operations supplied by the prerequisites. Claim a preparing receipt
using the immutable manifest UUID. Preserve an existing compatible receipt; do not generate a new identity or let a
new candidate replace an owned execution. Persist the selected batch admission outcome before finalization, so a
retry cannot perform another cache resolution or change an already recorded execution association.

Initialize `candidateExecutionId` from that committed outcome: use the selected execution UUID for every linked
receipt, including shared followers. For cache, cooldown, or failed receipts without an execution, use the immutable
manifest receipt UUID as an opaque placeholder. It must never cause execution creation. The first claim stores
this value; UUID replay validates organization, address, delivery mode, and candidate identity and returns the
committed receipt without changing its decision or billing. Extend the common claim input contract for these batch
semantics without adding a column, making the field nullable, or generating another candidate during recovery.

Scope `pagePreparingAdmissions()` to single-request delivery modes `sync` and `async`, and make
`resumeAdmission()` reject `batch` and `batch_child` receipts before resolution, candidate cleanup, or funding.
Batch recovery alone resumes those receipts through the stored group and address manifest. For linked receipts,
ownership requires all three facts: the manifest outcome is `created`, the execution's funding owner is this batch
group, and its payer UUID matches the receipt. Equality with `candidateExecutionId` alone never establishes
ownership; a shared follower keeps its selected execution's existing owner. Preserve the exclusion from group plan 03 of
batch-owned funding-pending executions from single funding and deadline recovery. Do not add a group dependency
to the single admission service; use delivery mode to filter requests and existing funding metadata to route work.

Supply the stored execution ID, source, and actual recorded reservation count to `finalizeAdmission`. The existing
adapter locks the execution with the organization predicate, then locks its intention when relevant and the request
rows in stable order. Reuse that implementation for batch mode. A nonterminal execution, including `settling`, keeps
the attached receipt pending and hides its result until confirmation. If the execution already completed, copy the
confirmed result, original settlement timestamp, and payer/follower accounting in the same transaction.

For an actual payer, identity equality with `execution.payerRequestId` retains the capture or release decision and
recorded reservation metadata. A follower keeps source `shared`, zero reserved and charged counts, and final reason
`shared`. If the selected execution is canceled, a follower receives settled zero-charge failure. An actual payer
remains pending until the existing reservation closure/release path completes; failed release stays discoverable
by cancellation recovery. No receipt may become settled while its financial outcome is still uncertain.

Cache and cooldown receipts have no execution to lock. Finalize them through the no-execution branch using their
recorded result and zero charge. Insufficient-credit created addresses finalize as zero-charge failures only after
their existing funding fence is durable. Do not create or dispatch an execution for any of these outcomes.

Keep materialization replay conditional: a ready receipt returns its authoritative stored outcome without
resetting billing, extending timestamps, or rebinding the result. Verify the batch manifest UUID, organization,
normalized address, delivery mode, and selected execution together. A completed execution missing a confirmed
intention is an invariant failure; retain recoverable `preparing` state and fail the attempt rather than inventing
success. Update the batch service and store contract fixtures for the prerequisite receipt fields.

Leave `countUnsettledAddresses()` and the workflow's waiting condition based on actual settled receipts. Confirm
that the next workflow advance after the last finalization reaches publication, and repeated dispatch cannot probe
a terminal execution. Update provider factories only if the adopted port requires them; keep database details in
the existing TypeORM adapter and document the batch caller in the module README.

## Interfaces and Dependencies

Reuse `VerificationRequestStore.claimAdmission` and `finalizeAdmission`, as delivered by the existing hardening
plans, with caller-supplied stable batch receipt IDs. Add only the batch input compatibility required by those ports;
no new endpoint, public response field, package, or queue is introduced. The shared finalization operation retains its execution,
intention, then request lock order. No SMTP, Redis, S3, or credit operation runs while a database transaction is held.
The batch funding recovery plan remains separate and does not own request-settlement decisions. Document candidate
UUID semantics and delivery-mode recovery ownership on the claim and preparing-page ports.

## Acceptance Criteria

- If a batch receipt attaches before confirmation, settlement includes it. If confirmation wins first, finalization
  immediately returns the same result and accounting. Neither order leaves a pending receipt against completed work.
- An owned conclusive execution charges its original payer once; a joined single or batch execution charges the new
  batch receipt zero. Both results appear in the correct original CSV rows without a second probe or reservation.
- A receipt joining `settling` exposes no result before confirmation. Cancellation yields zero-charge failure only
  after the payer's financial cleanup is confirmed; a failed cleanup remains recoverable.
- Repeated finalization, worker restart, and concurrent confirmation preserve request/result IDs, organization
  ownership, immutable counts, and settlement time. They neither deadlock nor reset a settled receipt.
- A batch paused after receipt claim remains unchanged by single-admission recovery: no new candidate, individual
  reservation, cleanup, or rebinding occurs. Group recovery resumes the same receipt and selected execution.
  Cache and cooldown placeholders never become executions; shared followers never acquire payer ownership.
- After all receipts settle, the workflow reaches publication and completion within the next scheduled polling
  attempt. Focused database, queue, HTTP, Bruno, architecture, type, lint, and prose checks pass.

## Validation

Run these commands from the implementation checkout; this planning document does not claim they passed for a fix.

```sh
corepack pnpm exec jest --runInBand batch-admission.service.spec.ts typeorm-verification-request.store.spec.ts typeorm-verification-settlement.store.spec.ts typeorm-batch-admission.store.spec.ts verification-reconciler.spec.ts batch-email-verification-workflow.spec.ts
corepack pnpm exec jest --runInBand batch-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
TEST_REDIS_URL='redis://127.0.0.1:<owned-test-port>' corepack pnpm exec jest --runInBand batch-email-verification-queue.integration.spec.ts
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/04-attach-batch-requests-to-settled-executions.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

Substitute a disposable Redis port owned by the test checkout; do not use an unrelated running stack. Extend
`infrastructure/persistence/verification-billing.integration.spec.ts` with deterministic barriers before finalization
and after the execution lock. Use actual stores and credits with a deterministic mailbox stub. Prove both race
orders, late payer and follower receipts, conclusive and inconclusive outcomes, cancellation with one failed release,
and concurrent replay under finite timeouts. Assert request state, result, balance, and unsettled count together.

Pause each created, shared, cache, and cooldown batch path after claim but before finalization. Run the real
single preparing-request sweep and test its guarded resume entry directly; assert unchanged candidates, execution
count, reservations, and manifest association. Then run group recovery and prove the same receipt finalizes once.
Repeat claim concurrently with the same UUID, including after finalization, and reject an incompatible candidate.

The Redis suite proves the real delayed-job transition reaches completion once finalization settles all receipts;
database barriers separately prove locking. Bruno: extend `bruno/batch-verification` with a single request and a
batch sharing an address, poll both to completion, compare result IDs, and assert zero batch follower charge.
Update collection totals and the fake runner workflow in the same PR. Run `bru run --env local` in that collection
after its launcher prepares dependencies. Never claim a skipped database, Redis, or Bruno suite passed.

## Idempotence and Recovery

The preparing receipt is the retry handle; finalization always converges on its selected execution's authoritative
state. A transaction rollback leaves it eligible for retry, while a commit leaves it pending under the execution
lock or already settled. The group recovery from batch plan 03 resumes incomplete materialization. Mark its
`finalizationState` ready only when every selected manifest UUID has a compatible ready receipt; this marker does
not mean every receipt's billing has settled. Reuse cancellation recovery when credit release failed. Do not replay SMTP or modify an
old settlement to make the waiter finish. No migration, backfill, or production repair is part of this plan.
Rerun `corepack pnpm test:verification-billing-postgres` to synchronize and seed its disposable schema. If prerequisite
receipt columns require resetting local application data, use `corepack pnpm dev:reset` only for the intended
disposable stack; let it reseed credentials and credits. No reset occurs during planning.

## Artifacts and Notes

Read `verification-billing-hardening/03` before implementation: it owns shared finalization and the lock order.
This plan owns only batch adoption and its race/queue/public-workflow evidence. The reviewed failure is described
above so implementation does not depend on temporary reproduction files or this conversation.

## Plan readiness

Ready to implement
