# Charge Batches Once Per Unique Conclusive Result

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A CSV upload preserves every original row but verifies each normalized address only once. It reserves at most one
credit for each new unique execution and deducts only for conclusive results. Cached addresses, followers of
existing work, duplicates, and inconclusive outcomes cost zero. Status and downloadable results expose the actual
counts and charges, including partial processing failure.

## Progress

- [x] (2026-09-23) Confirm that merged PR #676 resolves the payer request identity mismatch found by Plan 06.
  The repair and its settlement, CSV, database, and live Bruno evidence are recorded in
  `batch-verification-hardening/01`; Plan 06 separately validates the combined browser flow.

- [x] (2026-09-15) Persist ordered batch rows and unique-address admission groups: `BatchAdmissionStore`/
  `BatchRowStore` ports, `BatchAdmissionEntity`/`BatchUniqueAddressEntity`/`BatchRowEntity`, and their TypeORM
  adapters, with focused specs.
- [x] (2026-09-15) `VerificationExecutionStore.claimOrJoin()` gained an optional `fundingOwner` parameter (default
  `{type: 'single', id: newExecutionId}`, unchanged behavior for single verification) plus a transaction-scoped
  `pg_advisory_xact_lock(hashtext(organizationId))` serializing every admission per organization.
  `pageNonterminal`/`pageCanceledPendingCleanup` no longer exclude `batch_group`-owned rows, so the existing
  `VerificationReconciler` recovers batch executions the same way. New `cancelBatchGroupUnstarted()` for terminal
  batch-failure fencing.
- [x] (2026-09-15) Replaced per-row debit and child dispatch with atomic unique-execution reservations.
  `BatchAdmissionService` resolves every unique address (cache/cooldown/shared/created) and reserves every `created`
  execution in one `reserveMany()` call. It fences the whole group with `closeAdmissionMany()` on insufficient funds
  and materializes one idempotent `VerificationRequestStore` row per address.
- [x] (2026-09-15) Reused shared operations and implemented bounded dispatch and failure settlement: the workflow
  step machine is now `Validate → Admit → Dispatch → AwaitSettlement → UploadResults → Finish`, dispatching
  `created` executions onto the existing `verification-execution` queue and polling durable settlement state
  (`BatchAwaitingSettlementSignal` + `job.moveToDelayed`) instead of a BullMQ parent/child fan-out. The old
  `BullBatchChildFlow`/`BatchChildFlow` and the now-orphaned `async-email-verification`-queue infrastructure
  (`AsyncEmailVerificationModule`, processor, and queue configuration) were deleted.
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
  `bruno:smtp-dev` initially still failed at a preexisting environmental fixture flake (not a regression —
  reproduced identically on unmodified `master` against the same fresh stack), root-caused and fixed in the
  fixture itself; see Outcomes & Retrospective.
- [x] (2026-09-15) Root-caused and fixed the `bruno:smtp-dev` flake: the `target_temporary_reject` scenario
  in `docker/smtp-dev/evidence-server.mjs` now greylists a recipient per-address, independent of the fixture's shared
  `scenario` toggle and surviving `/reset`, instead of relying solely on `scenario` staying selected while the
  app's own delayed greylist retry is outstanding. Confirmed fixed with three independent fresh `dev:reset` +
  single-collection-run cycles (all clean) plus direct log/DB-level tracing of the failure mechanism; see
  Outcomes & Retrospective for the full root-cause write-up.

## Plan dependencies

- `verification-billing/04`

## Surprises & Discoveries

Plan 06 live browser validation on 2026-09-16 found a deterministic defect in the delivered backend at `a4680b0`.
`BatchAdmissionService.resolveAddress()` generates the execution payer request ID, but `materializeRequest()`
generates a different ID for the fresh request. `TypeOrmVerificationSettlementStore.confirmSettlement()` compares
those IDs, so the request becomes `finalReason: shared` with `chargedCount: 0` despite a captured reservation.
The four-row/two-unique live fixture returned settled billing with two originally reserved credits and zero charged.
Database inspection confirmed both ID mismatches and two captured credits. Status aggregation and CSV output
consume the incorrect request accounting; the browser cannot correct it from row counts.

Merged PR #676 repairs this defect by retaining one immutable payer request ID per unique batch address across
admission and receipt materialization. Its database and live Bruno coverage verifies matching ledger, status, and
CSV charges with free duplicate rows. Plan 06 retains its independent four-row/two-unique live browser assertion;
no backend code changes belong to that UI plan.

`BatchEmailVerificationWorkflow.validateFile()` counts every parsed row and debits the count using the batch job ID.
`BullBatchChildFlow.dispatchChild()` gives every row a random child UUID. `S3BatchResultWriter` streams persisted
verification rows by batch ID, so simply deduplicating child jobs would silently remove duplicate input rows from
the output. A durable row-to-operation mapping is required.

`verification-billing/04` already anticipated this plan: `VerificationExecutionRecord.fundingOwnerType` was typed
`'single' | 'batch_group'` with nothing ever setting `'batch_group'`, and `VerificationDeliveryMode` already included
`'batch'`/`'batch_child'`. `CreditReservationService.reserveMany()`/`closeAdmissionMany()` already exist and are
exactly the atomic all-or-nothing group operation this plan needs — no new credits-module work required.

The original "Artifacts and Notes" assumption was "`frontend/12` owns the original batch screen".
However, `apps/web` already has a working batch verification screen: `BatchVerificationPage`,
`routes/BatchVerificationJobPage.tsx`, `features/verification/batch-verification-api.ts`, and its
`use-batch-verification.ts` hook. It calls `GET /verifyBatch/:id` and defensively projects the response into a typed,
validated snapshot before it enters the query cache. Adding `resultsAvailable`/`counts`/`billing` as required
response fields broke the `tsc -b` build because the adapter destructures and asserts every existing field.
This plan therefore touched `apps/web`: it extended defensive validation/projection for the three new fields,
using the existing safe-integer-array style. It also updated fixtures in the two frontend test files. No new UI was built or changed — the existing screen simply keeps compiling and
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
  `pg_advisory_xact_lock(hashtext(organizationId))` as the first statement inside the transaction owned by `claimOrJoin`,
  rather than a physical lock-row table. Rationale: needs no new schema, cannot race its own creation, and is
  released automatically on commit/rollback (including across the nested `SAVEPOINT` transaction the insert path
  already uses). Both single admission and each per-address batch step go through this one method, so both are
  serialized per organization without touching call sites of `VerificationAdmissionService.admit()`. Date/Author:
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
  not scope creep. Removing the only consumer of `BullBatchChildFlow` necessarily orphans the queue it fed. Date/Author:
  2026-09-15, implementation.
- Decision: Did **not** cascade the deletion further into `EmailVerificationOrchestrator`, its `VerificationStore`
  port/`TypeOrmVerificationStore` adapter, or verification-time enforcement in `DomainPolicyService`, even though
  removing the async-verification queue module left all three with no remaining caller. Rationale: the Scope/Plan of Work named removal of the queue module but not these components.
  Retiring enforcement in `DomainPolicyService` is a separate product decision: should domain-policy checking
  move to the new stack instead? That choice deserves an explicit ExecPlan rather than inclusion here under time pressure. They remain wired in `EmailVerificationCoreModule` (harmless — Nest
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
- Decision: Deferred three pieces of the original Plan of Work rather than implementing them under time pressure.
  First, the upload-level `Idempotency-Key`/content-digest replay binding and the `VerificationRateLimitGuard` on
  `POST /verifyBatch/csv` remain deferred. Second, the `bruno/batch-verification` fixture rewrite for duplicate,
  mixed-cache, insufficient-credit, and replay scenarios remains deferred. The existing collection stayed passing
  after updating its two status assertions for the new response fields. It later passed live against a freshly
  reset stack, but still does not exercise deduplication. Third, the database fallback for
  `GET /verifyBatch/:id/results` remains deferred. It would stream the same ordered CSV projection when a durable
  S3 object is unavailable. Although `resultsAvailable` is reported accurately, the results route still requires
  a real S3 object. Rationale: each deferred item is a substantial, separable unit of work. The issue title and
  acceptance criteria name the core billing engine: dedup admission, atomic group reservation, real execution
  dispatch, settlement-driven completion, and accurate CSV output. Completing and testing that engine took
  priority over a partially verified attempt at every item. All three deferred items are recorded explicitly.
  Date/Author: 2026-09-15, implementation.

## Outcomes & Retrospective

Follow-up status (2026-09-23): merged PR #676 resolves the payer identity defect and extends live duplicate-row
coverage. Merged PR #734 makes status and download eligibility agree: failed jobs report `resultsAvailable: false`,
including failures after settlement. Completed jobs require a valid retained result location. The planned database
fallback below remains deferred and is not an implemented download capability; the current contract is maintained
in `batch-verification-hardening/06`. Plan 06 now follows this corrected availability contract.

**2026-09-16 validation correction:** the historical passing checks below did not detect the payer request identity
mismatch. Live Plan 06 validation showed that actual captures disagreed with batch status and CSV charges.
At that time the follow-up remained open; the earlier validation did not establish correct end-to-end batch accounting.

Delivered: batch upload now dedupes by normalized address and reserves/charges at most one credit per unique
address regardless of duplicate rows. It uses the same durable admission/execution/settlement stack as single
verification: `BatchAdmissionService` plus the existing `VerificationExecutionRunner`/`VerificationReconciler`/
`verification-execution` queue. Group funding is atomic and all-or-nothing through
`CreditReservationService.reserveMany`/`closeAdmissionMany`. Output CSV preserves every original row (including duplicates, correctly zero-charged) via a
rewritten `S3BatchResultWriter`. Batch status now reports accurate per-address counts and billing state. This
matches the ExecPlan example: 80 unique addresses among 100 rows reserve 80, and only conclusive `created`
addresses are charged. Validation against a real Postgres database passed 10/10 checks in
`test:verification-billing-postgres`. These included batch dedup reservation, insufficient-funds group fencing,
and a batch/single-verification address-sharing race.

A genuinely large, unplanned but correctly-scoped consequence surfaced mid-implementation: removing batch's old
per-row child dispatch (`BullBatchChildFlow`) orphaned the entire `async-email-verification` queue module it
existed solely to feed, which in turn orphaned `EmailVerificationOrchestrator`/`VerificationStore`/
verification-time enforcement in `DomainPolicyService`. The queue module was deleted, as anticipated by its doc
comment. The orchestrator chain remains wired but unused because its removal requires a separate product decision.
See the Decision Log and its recommended follow-up.

The Decision Log records three deferred items. The first is upload-level `Idempotency-Key`/content-digest replay
binding and the rate-limit guard on `POST /verifyBatch/csv`. The second is the `bruno/batch-verification` fixture
rewrite for deduplication scenarios. Its two status assertions were updated to keep the collection passing, but
no new fixture exercises deduplication. The third is the database fallback for CSV reads through
`GET /verifyBatch/:id/results` when a durable S3 object is unavailable. Although `resultsAvailable` is reported
correctly, the download route remains unchanged and requires a real S3 object.

**Live validation, run afterward against the real local dev stack**: `corepack pnpm bruno:batch-verification`
passed fully (9 requests / 15 tests) against a freshly `dev:reset` stack, both before and after rebuilding the API
container from this branch. The real-Redis `batch-email-verification-queue.integration.spec.ts` passed 6/6 against
real BullMQ/Redis (`TEST_REDIS_URL=redis://localhost:<published-port>`), proving the rewritten step machine,
`moveToDelayed`/`DelayedError` scheduling, and reservation-failure fencing actually work over live infrastructure,
not just against fakes. Running the rest of the module's real-Redis suites with the same `TEST_REDIS_URL` (87
suites, up from 84) also stayed green.

`corepack pnpm bruno:smtp-dev` initially failed on a fresh reset, consistently at one of the two non-standard-
termination scenarios (`target_temporary_reject` or `close_after_accept`, varying between runs) with the affected
request settling `201` instead of the scenario's expected outcome. To separate a real regression from a
preexisting environmental issue, the exact same collection was run against unmodified `master` on an identical
freshly-reset stack (API container rebuilt from `master`, fixture reset) — **it failed identically**
(`request 43`, `status 201`), confirming the flakiness predated this plan.

It was then root-caused and fixed. `MailboxVerificationService.verify()` always probes the fixed catch-all/control
address before the real target; once that control probe's evidence is conclusively "missing" it is cached for 24h
and never reprobed. For `target_temporary_reject`, the app schedules a durable retry with growing backoff: 60 seconds, 120 seconds, and onward,
using `GREYLIST_BACKOFF_UNIT_MS` in `verification-execution-runner.ts`. This outlasts the roughly 1–3-second
collection run and its final `POST {{evidenceControlUrl}}/reset` step. That final step, request 47, restores the
shared fixture `scenario` toggle to `default`, accepting everyone. The `target_temporary_reject` behavior in
`docker/smtp-dev/evidence-server.mjs` depended only on this shared `scenario` value.
The background retry fires tens of seconds after the run that scheduled it. By then, `scenario` had moved to
`default` or a later run's scenario. The fixture therefore accepted the target during a fresh SMTP probe and
cached that "accepted" verdict for 24 hours. The `Math.min(target, control)` rule in `deriveEvidenceObservedAt`
(`classify-verification-quality.ts`) then assigns the wrongly cached result the timestamp of the long-lived
cached control probe. This explains why unrelated addresses appeared to share an identical `evidenceObservedAt`
during tracing. Every
later run against the same organization then hit this same poisoned per-address cache at `request 43`,
deterministically. Confirmed via direct Postgres inspection of
`smtp_verifications`/`verification_executions` and temporary `console.error` instrumentation in the fixture,
correlating the exact retry timestamp with the exact moment `scenario` (and, before the fix, the in-fixture
greylist) had already reverted.

The fix makes `target_temporary_reject` greylist the specific recipient address within the fixture,
independent of the shared `scenario` toggle and surviving `/reset`. A real greylisting MTA defers a given
sender/recipient pair regardless of other server activity. See `docker/smtp-dev/evidence-server.mjs`. The extended tests are in `evidence-server.test.mjs`. Confirmed fixed with three independent fresh `dev:reset` +
`docker compose ... up -d --build` + single `bruno:smtp-dev` run cycles, all clean (47 requests / 78 tests
passing). Repeated runs against the same organization without running `dev:reset` between attempts now hit a separate,
preexisting business rule: `BalanceBelowReservedException` / HTTP 409 on `PUT /credits/:id`. The outstanding
`target_temporary_reject` reservation from the earlier run legitimately blocks zeroing the balance.
This is expected: the documented validation flow uses one collection run per fresh reset. Repeated runs against
one organization fall outside that flow, and this behavior is unrelated to the fixture flake fixed here.

Full validation actually run and passing: `tsc --noEmit` (root), `apps/web` `tsc -b`, the full root Jest suite
(259 suites / 3323 tests) and the full `apps/web` Vitest suite (30 files / 632 tests), `architecture:check` (0
violations), `openapi:export`/`generate`/`check`, and `test:verification-billing-postgres` (10/10 against a real,
freshly-synced schema). `docs:lint` was run on this file and the two touched module/Bruno `README.md` files (see the final
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
retries; retry publication from row metadata without executing verification again. The corrected contract in
`batch-verification-hardening/06` reports `resultsAvailable: false` for every failed batch, including one with settled
charges. Its existing result route returns `404`. Streaming settled rows directly from the database remains deferred.
An S3 upload retry uses the same result key.

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
- After output publication fails, a failed batch preserves confirmed charges, reports `resultsAvailable: false`,
  and returns `404` from its result route. Invalid and unfunded batches also expose no partial output.
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
```

New/updated focused spec files exercised throughout (not an exhaustive list — see the Validation section of the module `README.md` for the complete mapping): `application/delivery/batch/batch-admission.service.spec.ts`,
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
BullMQ. `corepack pnpm bruno:smtp-dev` initially failed on a preexisting environmental fixture flake, reproduced
identically against unmodified `master` on the same stack (not a regression from this plan) and then root-caused
and fixed in `docker/smtp-dev/evidence-server.mjs`; see Outcomes & Retrospective for the full write-up. No new
deduplication fixture was added to `bruno/batch-verification`.

## Idempotence and Recovery

Manifest, row, execution, reservation, and result keys are stable. Retrying validation before funding can replace
only an unfunded incomplete manifest; after funding, resume the immutable group. Re-upload is a new batch unless
the caller deliberately reuses its request key. New batches still benefit from cache and active-work sharing.
Use the existing checkout-owned `corepack pnpm dev:reset -- --confirm-project=LEF` reset and reseed flow for
incompatible development schemas, after stopping old workers. Add no migrations or historical billing backfill.

## Artifacts and Notes

`apps/web` already has a working batch screen. See the Surprises entry above, which corrects the original
assumption that `frontend/12` was still pending. The screen compiles and passes against the richer status contract
but does not yet render `resultsAvailable`/`counts`/`billing`. A follow-up frontend plan can consume those fields.
The new row registry (`BatchRowEntity`) is address-bearing customer data and must be listed in the processing
contract for later retention, matching `BatchUniqueAddressEntity`/`BatchAdmissionEntity`.

## Plan readiness

Ready to implement
