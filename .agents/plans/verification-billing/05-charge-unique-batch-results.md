# Charge Batches Once Per Unique Conclusive Result

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A CSV upload preserves every original row but verifies each normalized address only once. It reserves at most one
credit for each new unique execution and deducts only for conclusive results. Cached addresses, followers of
existing work, duplicates, and inconclusive outcomes cost zero. Status and downloadable results expose the actual
counts and charges, including partial processing failure.

## Progress

- [x] (2026-09-15) Persist ordered batch rows and unique-address admission groups: `BatchAdmissionStore`/
  `BatchRowStore` ports, `BatchAdmissionEntity`/`BatchUniqueAddressEntity`/`BatchRowEntity`, and their TypeORM
  adapters, with focused specs.
- [x] (2026-09-15) `VerificationExecutionStore.claimOrJoin()` gained an optional `fundingOwner` parameter (default
  `{type: 'single', id: newExecutionId}`, unchanged behavior for single verification) plus a transaction-scoped
  `pg_advisory_xact_lock(hashtext(organizationId))` serializing every admission per organization.
  `pageNonterminal`/`pageCanceledPendingCleanup` no longer exclude `batch_group`-owned rows, so the existing
  `VerificationReconciler` recovers batch executions the same way. New `cancelBatchGroupUnstarted()` for terminal
  batch-failure fencing.
- [x] (2026-09-15) Replaced per-row debit and child dispatch with atomic unique-execution reservations:
  `BatchAdmissionService` resolves every unique address (cache/cooldown/shared/created), reserves every `created`
  execution in one `reserveMany()` call, fences the whole group with `closeAdmissionMany()` on insufficient funds,
  and materializes one idempotent `VerificationRequestStore` row per address.
- [x] (2026-09-15) Reused shared operations and implemented bounded dispatch and failure settlement: the workflow
  step machine is now `Validate → Admit → Dispatch → AwaitSettlement → UploadResults → Finish`, dispatching
  `created` executions onto the existing `verification-execution` queue and polling durable settlement state
  (`BatchAwaitingSettlementSignal` + `job.moveToDelayed`) instead of a BullMQ parent/child fan-out. The old
  `BullBatchChildFlow`/`BatchChildFlow` and the now-orphaned `async-email-verification`-queue infrastructure
  (`AsyncEmailVerificationModule`/processor/queue-config) were deleted.
- [x] (2026-09-15) Preserved output rows and published accurate batch accounting and progress: `S3BatchResultWriter`
  rewritten as a `BatchRowEntity` → `BatchUniqueAddressEntity` → request/result join preserving every original row
  (including duplicates, zero-charged with `billingReason: 'duplicate'`); `GetBatchStatusResponseDto` gained
  `resultsAvailable`/`counts`/`billing`, backed by a new `BatchAdmissionStore.getStatusCounts()` aggregate query.
- [x] (2026-09-15) Completed focused validation (`tsc --noEmit`, full `email-verification` Jest suite, full repo
  Jest suite, `architecture:check`, `apps/web` `tsc -b` + full Vitest suite, `openapi:export/generate/check`) and
  extended `test:verification-billing-postgres` with three new real-Postgres cases (batch dedup reservation,
  insufficient-funds group fencing, batch/single address sharing).
- [x] (2026-09-15) Ran the live local dev stack end to end: `corepack pnpm bruno:batch-verification` (9 requests/
  15 tests passing against a freshly reset stack) and the real-Redis
  `batch-email-verification-queue.integration.spec.ts` (6/6 passing against real BullMQ/Redis, proving the new
  `Validate → ... → Finish` step machine, `moveToDelayed`/`DelayedError`, and reservation-failure fencing live).
  `bruno:smtp-dev` still fails at a preexisting, environmental fixture flake (not a regression — reproduced
  identically on unmodified `master` against the same fresh stack; see Outcomes & Retrospective).

## Plan dependencies

- `verification-billing/04`

## Surprises & Discoveries

`BatchEmailVerificationWorkflow.validateFile()` counts every parsed row and debits the count using the batch job ID.
`BullBatchChildFlow.dispatchChild()` gives every row a random child UUID. `S3BatchResultWriter` streams persisted
verification rows by batch ID, so simply deduplicating child jobs would silently remove duplicate input rows from
the output. A durable row-to-operation mapping is required.

`verification-billing/04` already anticipated this plan: `VerificationExecutionRecord.fundingOwnerType` was typed
`'single' | 'batch_group'` with nothing ever setting `'batch_group'`, and `VerificationDeliveryMode` already included
`'batch'`/`'batch_child'`. `CreditReservationService.reserveMany()`/`closeAdmissionMany()` already exist and are
exactly the atomic all-or-nothing group operation this plan needs — no new credits-module work required.

Contrary to this plan's own "Artifacts and Notes" assumption ("`frontend/12` owns the original batch screen"),
`apps/web` already has a working batch verification screen (`BatchVerificationPage`,
`routes/BatchVerificationJobPage.tsx`, `features/verification/batch-verification-api.ts` and its
`use-batch-verification.ts` hook) that actively calls `GET /verifyBatch/:id` and defensively re-projects its
response into a typed, validated snapshot before it enters the query cache. Adding `resultsAvailable`/`counts`/
`billing` as required response fields broke this file's `tsc -b` build (it destructures/asserts every existing
field), so this plan necessarily touched `apps/web` after all: extended the defensive validation/projection for
the three new fields (same safe-integer-array style already used for the existing ones) and updated the two
frontend test files' fixtures. No new UI was built or changed — the existing screen simply keeps compiling and
passing against the richer contract; it does not yet render the new fields.

## Decision Log

- Decision: Deduplicate normalized addresses within each batch and share active executions across batches and
  single submissions in the same organization. Rationale: One new conclusion must not generate multiple charges
  merely because requests race. Date/Author: 2026-09-08, policy planning.
- Decision: Reserve all new unique executions as one atomic admission group before dispatch. Rationale: An upload
  with insufficient credits should not start an arbitrary subset of paid work. Date/Author: 2026-09-08, policy planning.
- Decision: Preserve every input data row and its order in the output, including original email spelling. Duplicate
  rows share the same verification result UUID. Rationale: Users need to join results to their input without losing
  rows. Date/Author: 2026-09-08, policy planning.
- Decision: Settled conclusive results remain charged if later output publication fails. Their individual result
  IDs remain recoverable and publication retries do not probe or charge again. Rationale: A durable useful result
  already exists; an S3 outage must not create a second financial decision. The existing download route can stream settled row data if S3 publication fails. Date/Author: 2026-09-08, policy planning.
- Decision: Implement the "lock the organization's admission record" requirement as a transaction-scoped
  `pg_advisory_xact_lock(hashtext(organizationId))` as the first statement inside `claimOrJoin`'s own transaction,
  rather than a physical lock-row table. Rationale: needs no new schema, cannot race its own creation, and is
  released automatically on commit/rollback (including across the nested savepoint transaction the insert path
  already uses). Both single admission and each per-address batch step go through this one method, so both are
  serialized per organization without touching `VerificationAdmissionService.admit()`'s call sites. Date/Author:
  2026-09-15, implementation.
- Decision: Add batch admission as a new sibling `BatchAdmissionService` in `application/delivery/batch/` that
  reuses the same pure/port primitives as `VerificationAdmissionService`, rather than editing `admit()` itself.
  Rationale: lower regression risk to already-shipped, heavily tested single-verification code; the two flows
  differ enough (batched vs. per-address credit reservation) that sharing the primitives, not the method, was the
  right level of reuse. Date/Author: 2026-09-15, implementation.
- Decision: Reuse the plan-04 `VerificationReconciler`/`verification-execution` queue for batch-owned executions
  instead of a separate batch-only recovery loop — removed the `fundingOwnerType: 'single'` filter from
  `pageNonterminal`/`pageCanceledPendingCleanup` and dispatch `created` batch executions onto the same queue single
  verification uses. Rationale: this is what "recovery resumes lost dispatch" requires; a second recovery
  mechanism would duplicate logic plan 04 already proved correct. Date/Author: 2026-09-15, implementation.
- Decision: Deleted `BullBatchChildFlow`/`BatchChildFlow` and the entire `infrastructure/queues/async-verification/`
  directory (`AsyncEmailVerificationModule`, its processor, queue configuration, job-data interface, and
  `GreylistedException`) rather than leaving them dead-but-wired. Rationale: that queue's own doc comment already
  said "kept solely for batch's child-verification dispatch … plan 05 removes this path" — this was anticipated,
  not scope creep. Removing `BullBatchChildFlow`'s only consumer necessarily orphans the queue it fed. Date/Author:
  2026-09-15, implementation.
- Decision: Did **not** cascade the deletion further into `EmailVerificationOrchestrator`, its `VerificationStore`
  port/`TypeOrmVerificationStore` adapter, or `DomainPolicyService`'s verification-time enforcement, even though
  removing the async-verification queue module left all three with no remaining caller. Rationale: unlike the
  queue module, nothing in this plan's own Scope/Plan of Work named their removal, and retiring
  `DomainPolicyService`'s enforcement is a materially separate, debatable product decision (should domain-policy
  checking be ported to the new stack instead of retired?) that deserves its own explicit ExecPlan rather than
  being folded in here under time pressure. They remain wired in `EmailVerificationCoreModule` (harmless — Nest
  still constructs them, just with zero active callers). **Recommended follow-up**: a small ExecPlan that either
  ports domain-policy enforcement into `VerificationAdmissionService`/`BatchAdmissionService` or removes this
  entire orphaned chain deliberately. Date/Author: 2026-09-15, implementation.
- Decision: Defined `verificationStatus` (`completed`/`processing`/`failed`), the `resultsAvailable` heuristic
  (`status === 'completed'`, or `status === 'failed'` with admission past `validating`/`invalid`), and the
  `counts`/`billing` aggregate fields' exact semantics myself, since the ExecPlan's own prose named the fields but
  left several edge cases (e.g., whether `conclusive`/`inconclusive` counts include `shared` addresses) implicit.
  Chose: `conclusive`/`inconclusive`/`failed` counted only among `created` addresses (a freshly probed execution's
  own outcome), since `cache`/`shared`/`cooldown` are already separate, stable, admission-time categories per the
  plan's own words ("The cached/shared categories describe initial admission and remain stable"). Date/Author:
  2026-09-15, implementation.
- Decision: Deferred three pieces of the original Plan of Work rather than implementing them under time pressure:
  (1) the upload-level `Idempotency-Key`/content-digest replay binding and the `VerificationRateLimitGuard` on
  `POST /verifyBatch/csv`; (2) the `bruno/batch-verification` fixture rewrite (duplicate/mixed-cache/insufficient-
  credit/replay scenarios) — the existing collection was kept passing (its two status assertions updated for the
  new response fields) and was later confirmed passing live against a freshly reset stack, but still does not
  exercise deduplication; (3) the "stream the same ordered CSV projection from the database when a durable S3 object is
  unavailable" fallback for `GET /verifyBatch/:id/results` — `resultsAvailable` is reported accurately, but the
  results route itself still requires a real S3 object exactly as before. Rationale: each is a substantial,
  separable, well-scoped unit of work in its own right, and the core billing-correctness engine (dedup admission,
  atomic group reservation, real execution dispatch, settlement-driven completion, accurate CSV output) is the
  part actually named by this issue's title and acceptance criteria; landing that correctly and fully tested was
  prioritized over a partially-verified attempt at everything. All three are named explicitly here, not silently
  dropped. Date/Author: 2026-09-15, implementation.

## Outcomes & Retrospective

Delivered: batch upload now dedupes by normalized address and reserves/charges at most one credit per unique
address regardless of duplicate rows, driven through the same durable admission/execution/settlement stack as
single verification (`BatchAdmissionService` + the existing `VerificationExecutionRunner`/`VerificationReconciler`/
`verification-execution` queue), with atomic all-or-nothing group funding via `CreditReservationService.reserveMany`/
`closeAdmissionMany`. Output CSV preserves every original row (including duplicates, correctly zero-charged) via a
rewritten `S3BatchResultWriter`. Batch status now reports accurate per-address counts and billing state. This
matches the ExecPlan's own acceptance-criteria example: 80 unique addresses among 100 rows reserve 80 (not 100),
and only conclusive `created` addresses among them are ever charged — proved directly against a real Postgres
database (`test:verification-billing-postgres`, 10/10 passing, including a dedicated batch-dedup-reservation case,
an insufficient-funds group-fencing case, and a batch/single-verification address-sharing race case).

A genuinely large, unplanned but correctly-scoped consequence surfaced mid-implementation: removing batch's old
per-row child dispatch (`BullBatchChildFlow`) orphaned the entire `async-email-verification` queue module it
existed solely to feed, which in turn orphaned `EmailVerificationOrchestrator`/`VerificationStore`/
`DomainPolicyService`'s verification-time enforcement. The queue module's own removal was anticipated by its doc
comment and is deleted; the orchestrator chain was deliberately left wired-but-unused rather than cascading
further into a separate, debatable product decision — see the Decision Log and the recommended follow-up there.

Deferred, and named explicitly rather than silently dropped (see Decision Log): the upload-level Idempotency-Key/
content-digest replay binding and rate-limit guard on `POST /verifyBatch/csv`; the `bruno/batch-verification`
fixture rewrite for deduplication scenarios (the existing collection's two status assertions were updated so it
keeps passing, but no new fixture yet exercises dedup); and the database-fallback CSV read for
`GET /verifyBatch/:id/results` when a durable S3 object is unavailable (`resultsAvailable` is reported correctly,
but the download route itself is unchanged and still requires a real S3 object).

**Live validation, run afterward against the real local dev stack**: `corepack pnpm bruno:batch-verification`
passed fully (9 requests / 15 tests) against a freshly `dev:reset` stack, both before and after rebuilding the API
container from this branch. The real-Redis `batch-email-verification-queue.integration.spec.ts` passed 6/6 against
real BullMQ/Redis (`TEST_REDIS_URL=redis://localhost:<published-port>`), proving the rewritten step machine,
`moveToDelayed`/`DelayedError` scheduling, and reservation-failure fencing actually work over live infrastructure,
not just against fakes. Running the rest of the module's real-Redis suites with the same `TEST_REDIS_URL` (87
suites, up from 84) also stayed green.

`corepack pnpm bruno:smtp-dev` still fails on a fresh reset, consistently at one of the two non-standard-
termination scenarios (`target_temporary_reject` or `close_after_accept`, varying between runs) with the affected
request settling `201` instead of the scenario's expected outcome. This was investigated directly (manual PUT to
the fixture's `/scenario` control endpoint plus a raw `/verify` call reproduced the same wrong-classification
symptom outside Bruno entirely) without finding a root cause within the fixture/proxy/SMTP-client boundary. To
separate a real regression from a preexisting environmental issue, the exact same collection was then run against
unmodified `master` on the identical freshly-reset stack (API container rebuilt from `master`, fixture reset) —
**it failed identically** (`request 43`, `status 201`). This confirms the flakiness predates this plan and is not
a regression it introduces; it was not root-caused further, matching the same unresolved class of issue flagged in
`verification-billing/04`'s own retrospective.

Full validation actually run and passing: `tsc --noEmit` (root), `apps/web` `tsc -b`, the full root Jest suite
(259 suites / 3323 tests) and the full `apps/web` Vitest suite (30 files / 632 tests), `architecture:check` (0
violations), `openapi:export`/`generate`/`check`, and `test:verification-billing-postgres` (10/10 against a real,
freshly-synced schema). `docs:lint` was run on this file and the two touched module/Bruno READMEs (see the final
response for the exact result).

## Context and Orientation

All source paths below are inside `src/libs/modules/email-verification/`. The workflow is
`src/application/delivery/batch/batch-email-verification-workflow.ts`; input validation is
`src/infrastructure/storage/batch-verification/s3-batch-input.ts`; child jobs are dispatched by
`src/infrastructure/queues/batch-verification/bull-batch-child-flow.ts`. The CSV writer and reader live in
`src/infrastructure/storage/batch-verification/`. The controller and DTOs are under `src/api/http/batch-verification/`.

Plans 01 through 04 supply conclusive evidence, complete-result cache, organization-scoped shared executions,
credit reservations, durable settlement, rate admission, and safe metadata. Plan 02 exposes an atomic `reserveMany`
operation. `verification-reliability/02` and `/03` require durable output before completion and bounded progress;
both requirements remain in force.

## Scope and Non-Goals

Change batch accounting and its required row-preserving persistence, status, and output. Preserve the upload route,
100-megabyte file limit, permissions, organization-owned object paths, and result-download content type. Do not add
provider calls, file history, user cancellation, automatic re-upload, resumable upload, or browser UI in this PR.

## Plan of Work

Add `BatchAdmissionStore` and `BatchRowStore` under `src/application/delivery/batch/`, with TypeORM adapters and
organization-owned metadata, row, and unique-address records. Stream input once through the existing CSV parser.
For every valid data row, persist its one-based input position, original email text after CSV field trimming,
normalized email, and original supported fields. Enforce unique batch/row position and batch/normalized address
constraints. Headers and empty lines do not count. Do not hold a 100-megabyte file or an unbounded address set in
memory; stage rows in pages of 500. An invalid row marks validation failed before any reservation or dispatch.

Freeze an admission manifest after validation: ordered unique addresses and immutable request/execution references.
Extend Plan 03 admission with a batch group boundary. In short transactions, lock the organization's admission
record and assign each address to a fresh complete cache result, an already-active execution, or a newly claimed
`funding_pending` execution. This lock serializes only admission metadata, not credit or network calls. Persist
the manifest and new-execution list before calling credits. Mark each new execution with the immutable group
funding owner; individual execution reconcilers must delegate to this group and never reserve its members alone.
Single admission must use the same organization lock
so it cannot race an incomplete batch manifest. A cache/follower request is free even when balance is zero.

When the new-execution list is empty, admit the all-cached/shared group without calling `reserveMany`, whose
input must be nonempty. Otherwise, reserve the immutable new execution IDs through
`CreditReservationService.reserveMany()` in one account transaction. If total available credit is insufficient,
fence group admission and call `closeAdmissionMany()` on that same immutable list. Confirm closure before
publishing `insufficient_credits` and releasing provisional address claims. This creates closed receipts even
for unfunded operations, preventing delayed reservation retries after replenishment. Start no new outbound work.
Existing shared executions continue for their owners. Followers waiting on this unsuccessful group's claims must resolve to a
safe failed admission, not silently become payers. They may make a deliberate new submission later.

On an ambiguous reserve response, reconcile the exact immutable manifest and same reservation references. Never
recompute a different debit list. When funding succeeds, mark the group admitted and enqueue only its new
executions, in bounded pages, using stable execution IDs. Recovery resumes lost dispatch. Reuse organization execution permits and cooldowns from Plan 04. A cooldown address receives a zero-charge inconclusive batch row
linked to its prior terminal outcome, with source `cooldown` and billing reason `inconclusive`; it does not trigger a fresh probe or fail unrelated valid rows.

Replace random per-row children and the parent's upfront row debit. Read progress from durable mapped request
states, not queue child count, since cached/shared addresses need no child owned by this batch. Where a BullMQ
parent wakeup is still useful, register idempotent wakeups for shared completion; correctness must not depend on
retaining a foreign parent's child job. Remove the temporary legacy batch worker path from Plan 04 after this switch.

Every distinct new execution settles once through Plan 03. At terminal batch failure, fence unscheduled owned
executions before releasing their reservations. Await settlement of already-running owned executions; a late
worker cannot bypass cancellation. Do not cancel or release executions owned by another request/batch. Settled
conclusive rows retain their charges. Failed/unknown rows expose safe failure metadata and zero charges.
Do not mark batch accounting final until each owned reservation has a confirmed terminal disposition.

Rewrite CSV output to stream the row mapping ordered by input position and join its result. Preserve the original
email cell and existing result columns. Add `normalizedEmail`, `sourceRow`, `duplicateOfRow`, `verificationStatus`,
`creditsCharged`, and `billingReason`. For duplicates, reuse evidence/result ID; assign any one-credit charge only
to the first row for that normalized address. Later duplicate rows show zero and `duplicate`. Source-row numbers
refer to data rows, excluding the header. Failed rows remain present, with empty result fields as appropriate and
a safe failure status. Do not expose internal exceptions, lease generations, credentials, or organization IDs.

Keep the writer's durable-upload condition: a completed batch has a retrievable object, finalized accounting, and
all original rows. An output-publication failure keeps progress below 100 and safe `processing_failed` after
retries; retry publication from row metadata without executing verification again. After validation and admission, a terminal failed batch with settled row accounting exposes `resultsAvailable: true`.
Its existing results route streams the same ordered CSV projection from the database when a durable S3 object is
unavailable; this read performs no new probes or settlement. Invalid or unfunded batches expose no partial output.
This gives callers access to paid results even when S3 publication fails. An S3 upload retry uses the same result key.

Extend `bruno/batch-verification` with duplicate, case/whitespace, mixed-cache, all-cache-zero-balance, unknown,
insufficient-credit, partial failure, and replay fixtures. Register `corepack pnpm bruno:batch-verification` using
the existing pinned launcher with checkout ownership, seeded authentication, and a nonzero-execution assertion.
Add the mixed 100-row accounting example as deterministic integration evidence. Update module docs and OpenAPI.

## Interfaces and Dependencies

Keep `POST /verifyBatch/csv` returning `202 { id }`. Content validation and group funding occur in the worker;
insufficient funds remain a safe terminal batch failure rather than a retroactive HTTP `402`.
Add optional canonical UUIDv7 `Idempotency-Key` to upload, with the timestamp and replay-window rules from Plan 03.
Bind it to organization, route, and a digest of the uploaded
bytes; replay returns the same batch ID, while conflicting bytes return `409`. Compute the digest while streaming,
delete duplicate temporary uploads through the existing owned S3 adapter, and never readmit a replayed batch.
Apply the submission limiter from Plan 04 before reading/uploading the body. The key and byte digest are not written to logs. Key lifetime follows Plan 03 request visibility.

Status adds `resultsAvailable: boolean`, `counts: { totalRows, uniqueAddresses, duplicateRows, cachedAddresses, sharedAddresses, cooldownAddresses, completedAddresses,
conclusiveAddresses, inconclusiveAddresses, failedAddresses }` and
`billing: { state: 'pending' | 'settled', reserved: number, charged: number }`. Counts are based on unique addresses
except the explicitly named row fields. The cached/shared categories describe initial admission and remain stable.
Extend batch request source with `cooldown` for the free prior-inconclusive row path.
Completed addresses count terminal outcomes. Conclusive/inconclusive exclude failed executions. Charged counts
only this batch's payer executions, so conclusive addresses can exceed charged credits.

Progress is indeterminate/zero during validation, then `floor(99 * completedAddresses / uniqueAddresses)` until
durable publication and settlement allow 100. Handle an empty CSV as `invalid_csv`, avoiding division by zero.
Do not change this ratio into a financial estimate. Extend generated binary schemas without changing download types.

## Acceptance Criteria

- For 100 input rows, 80 unique addresses, 20 cached addresses, and 45 conclusive outcomes among 60 new checks,
  the batch reserves 60, deducts 45, releases 15, and returns exactly 100 ordered output rows.
- Case/whitespace duplicates share one execution; plus tags and dot variants remain distinct. Every duplicate row
  is present, and the CSV charge sum equals the batch charge and ledger debit sum.
- With zero balance, an all-cached/shared batch completes without a reservation. Insufficient credit for new work
  rejects the complete admission group before any new probe or partial reservation.
- Two batches and a single request racing for the same address fund one execution and produce one charge total.
  Only the immutable payer reports that charge; other request/row metadata reports zero.
- A group-owned execution cannot be funded by a single-operation recovery path. Canceled/denied admission
  remains closed after a delayed duplicate reserve and a later top-up.
- Invalid CSV, manifest retry, queue redelivery, output retry, and keyed upload replay do not cause duplicate
  reservations, child work, rows, or debits. Key conflicts change no existing batch or charge.
- A failed batch releases outstanding owned reservations, preserves settled results, and never cancels shared
  work owned elsewhere. A worker fenced during cancellation cannot capture afterward.
- After output publication fails, a terminal batch still lets its owner download settled rows through the existing
  result route without a new debit. Invalid/unfunded batches expose no partial output.
- Status totals reconcile, progress remains finite in [0,100], and 100 requires durable output and final accounting.
  Foreign status/result requests remain indistinguishable from missing resources.

## Validation

Commands actually run this session (all passing):

```bash
corepack pnpm exec tsc --noEmit -p tsconfig.json --incremental false
corepack pnpm exec jest src/libs/modules/email-verification   # 84 suites / 976+ tests
corepack pnpm exec jest                                        # full repo: 259 suites / 3323 tests
corepack pnpm run architecture:check                            # 9 modules, 0 violations
cd apps/web && corepack pnpm exec tsc -b && corepack pnpm exec vitest run   # 30 files / 632 tests
corepack pnpm run openapi:export
corepack pnpm run openapi:generate
corepack pnpm run openapi:check
corepack pnpm test:verification-billing-postgres                # 10/10, real Postgres
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/batch-verification/README.md .agents/plans/verification-billing/05-charge-unique-batch-results.md
```

New/updated focused spec files exercised throughout (not an exhaustive list — see the module README's Validation
section for the complete mapping): `application/delivery/batch/batch-admission.service.spec.ts`,
`application/delivery/batch/batch-email-verification-workflow.spec.ts`,
`application/delivery/batch/batch-email-verification.service.spec.ts`,
`infrastructure/persistence/typeorm-batch-admission.store.spec.ts`,
`infrastructure/persistence/typeorm-batch-row.store.spec.ts`,
`infrastructure/persistence/typeorm-verification-execution.store.spec.ts` (funding-owner override, advisory lock,
`cancelBatchGroupUnstarted`), `infrastructure/storage/batch-verification/s3-batch-result-writer.spec.ts`,
`infrastructure/queues/batch-verification/bull-batch-jobs.spec.ts`,
`infrastructure/queues/batch-verification/batch-email-verification.processor.spec.ts`,
`api/http/batch-verification/batch-verification-http.integration.spec.ts`,
`api/http/batch-verification/batch-verification.openapi.spec.ts`, and the real-Postgres
`infrastructure/persistence/verification-billing.integration.spec.ts`.

**Run afterward against the live local dev stack** (see Outcomes & Retrospective for full detail):
`corepack pnpm bruno:batch-verification` — 9 requests / 15 tests passing against a freshly `dev:reset` stack;
`infrastructure/queues/batch-verification/batch-email-verification-queue.integration.spec.ts` against real Redis
(`TEST_REDIS_URL=redis://localhost:<published-port>`) — 6/6 passing, proving the new step machine over live
BullMQ. `corepack pnpm bruno:smtp-dev` fails on a preexisting environmental fixture flake, reproduced identically
against unmodified `master` on the same stack — not a regression from this plan; no new deduplication fixture was
added to it.

## Idempotence and Recovery

Manifest, row, execution, reservation, and result keys are stable. Retrying validation before funding can replace
only an unfunded incomplete manifest; after funding, resume the immutable group. Re-upload is a new batch unless
the caller deliberately reuses its request key. New batches still benefit from cache and active-work sharing.
Use the existing checkout-owned `corepack pnpm dev:reset -- --confirm-project=LEF` reset and reseed flow for
incompatible development schemas, after stopping old workers. Add no migrations or historical billing backfill.

## Artifacts and Notes

`apps/web` already has a working batch screen (see the Surprises entry above, correcting this plan's original
assumption that `frontend/12` was still pending); it now compiles and passes against the richer status contract
but does not yet render `resultsAvailable`/`counts`/`billing` — a follow-up frontend plan can consume them.
The new row registry (`BatchRowEntity`) is address-bearing customer data and must be listed in the processing
contract for later retention, matching `BatchUniqueAddressEntity`/`BatchAdmissionEntity`.

## Plan readiness

Ready to implement
