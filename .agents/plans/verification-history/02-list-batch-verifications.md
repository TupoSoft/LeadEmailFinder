# Discover Recent CSV Batch Submissions

This living document follows `.agents/PLANS.md` and describes exactly one pull request.

## Purpose / Big Picture

Let an authorized organization discover recent CSV batch submissions without keeping their job URLs. Include
jobs waiting for validation and jobs rejected by CSV validation, which the existing admission manifest cannot
enumerate. A developer can submit a CSV, lose the HTTP response, and find the recorded submission through
`GET /v1/verification-history/batches` without starting another verification.

The PR title is `feat(email-verification): list recent batch submissions`. The list records a submission attempt;
it does not certify that queue dispatch succeeded. The UI is a separate PR.

## Progress

- [ ] (2026-09-18) Record batch discovery metadata before queue dispatch and cover interrupted submissions.
- [ ] (2026-09-18) Add the owned, bounded history endpoint and current queue-state projection.
- [ ] (2026-09-18) Extend API contracts, database checks, Bruno coverage, and lifecycle documentation.
- [ ] (2026-09-18) Run focused validation and review the final module boundaries.

## Plan dependencies

- `verification-history/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Add a minimal submission record instead of enumerating queue jobs or admission manifests. Rationale:
  admission records appear only after validation; queue scans cannot provide an indexed organization directory.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Commit discovery metadata before queue dispatch. Rationale: a lost queue response must not lose the
  discovery handle. An absent job means unavailable, not confirmed rejection or permission to replay work.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Retain existing queue ownership of batch status and downloads. Rationale: this feature needs
  discovery, not a second batch state machine, dispatch outbox, or result storage implementation.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Limit discovery to the preceding seven days from submission creation. Rationale: the initial UI
  needs recent work; this visibility rule neither extends result access nor implements physical deletion.
  Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The planning source is `3101967b1939fce191a88576e55ff751da76dd33`, inspected on 2026-09-18. Paths below are
relative to `src/libs/modules/email-verification/src/` unless another root is given. Read root `AGENTS.md`,
`src/libs/modules/AGENTS.md`, the canonical module guide, and this module's README before implementation.

`application/delivery/batch/batch-email-verification.service.ts` generates a UUID in `uploadFile()` and calls
`BatchJobs.enqueue()`. The HTTP controller has already authenticated the principal and stored the uploaded
object. `infrastructure/queues/batch-verification/bull-batch-jobs.ts` uses that UUID as the BullMQ job ID.
`BatchEmailVerificationWorkflow.validateFile()` creates `batch_admissions` only after parsing succeeds.
Consequently, queued work and invalid CSV files have no admission row to list.

`application/delivery/batch/batch-jobs.ts` provides owned job data and `readStatus()` through an injected port.
`batch-verification-status.ts` projects its snapshot into the existing five public states. The adapter reloads
terminal jobs and validates retained result locations. Current status and result endpoints still depend on Redis.
Neither admission records nor a discovery record can replace the queue's evidence of completion.

Plan 01 supplies the history controller, query DTO, cursor codec, seven-day visibility rule, and single-history
API. Reuse those exact contracts. Pending `verification-submitter/02` adds attribution only after CSV validation;
it explicitly excludes upload receipts and is not a prerequisite. `batch-verification-hardening/06` owns an
existing download-availability defect; this plan returns no download flag and does not duplicate that repair.

## Scope and Non-Goals

Add one narrow persistence adapter, registration during batch submission, a batch history reader, one GET route,
generated contracts, tests, and documentation. Include both human and service-client uploads within the current
organization. The existing `verification:read` permission governs discovery.

Do not add upload idempotency, automatic dispatch recovery, a second terminal-state store, actor display, original
filenames, result copies, search, status filters, aggregate totals, billing summaries, or a general audit log.
Do not scan Redis for legacy jobs or backfill discovery records. Existing job URLs remain usable under their
existing rules. CSV batch history begins with submissions made after this implementation is enabled.

## Plan of Work

Add `application/delivery/batch/batch-submission-store.ts`, containing a narrow injected port and token for
insert-only registration and organization-scoped cursor listing. The record contains only `batchId`,
`organizationId`, and `createdAt`. Return the committed record on an identical-ID/organization replay. A UUID
collision with another organization fails without exposing or changing the foreign row. Do not accept an updated
timestamp on replay. Provide no generic update, mutable-status, or actor methods.

Implement the port in `infrastructure/persistence/typeorm-batch-submission.store.ts` with
`infrastructure/persistence/typeorm/batch-submission.entity.ts`, table `batch_submissions`. Use a UUID primary key,
a non-null organization UUID, a database-generated `timestamptz` creation timestamp, and a composite index over
`organizationId`, `createdAt`, and `batchId` for the owned descending query. Use parameterized predicates and
insert-only conflict handling. Preserve the raw database timestamp precision in the cursor; display timestamps
may use the existing ISO serialization. Do not copy an address, principal, client key, file name, S3 location, or
queue payload. Register the entity and adapter through the existing batch composition module and TypeORM configuration.
Compose the batch history use case in
`infrastructure/queues/batch-verification/batch-email-verification.module.ts` using the existing `BatchJobs`, the
new store, and the verification clock. Export its injected use-case token from that Nest module to the root
`EmailVerificationModule`, which owns the shared history controller. This is internal composition within one
business module, not an addition to its public barrel.

Inject this port into `BatchEmailVerificationService`. Generate the batch ID once, commit its submission record,
then pass that same ID to `jobs.enqueue()`. A database failure prevents dispatch. A queue failure, uncertain queue
acknowledgment, or process crash after registration leaves the record available for discovery. Keep the existing
HTTP failure mapping and trace allowlist. Return success only after enqueue confirms that same ID; a missing or
mismatched returned ID cannot be reported as a successful upload. Never dispatch or retry from the history read
path. Validation and authorization rejections before `uploadFile()` still create no discovery record.

Add `application/history/list-batch-verification-history.ts`. Query at most `limit + 1` owned records through the
store using the cursor rules from plan 01. For the returned page only, resolve current snapshots through `BatchJobs.find`
and `readStatus()`, with at most five lookups in flight. Check the job's organization before reading its status.
Reuse `mapBatchVerificationStatus()` rather than reproducing queue states in the controller. A missing job,
ownership mismatch, or unsupported snapshot maps to `unavailable`. A completed queue job without a valid retained
result location also retains the mapper's `unavailable` state. Redis or database exceptions fail the GET through
the existing server-error mapping; do not disguise an outage as an empty list or a page of absent jobs.

Project only ID, creation time, and public status. Do not call `getBatchStatus()` for every row, because its
per-address counts and billing queries are unnecessary. Do not call SMTP, S3, result readers, credit services,
or queue mutation methods. The page may contain changing statuses; cursor paging is an ordered traversal, not
a transactionally frozen snapshot. Advancing the cursor must use the last returned database tuple, independent
of a job's current status or existence.

Extend the controller and DTOs from plan 01 with the batch endpoint, using `CurrentPrincipal.organizationId`, the
default authentication guard, and `RequirePermissions('verification:read')`. Both endpoints prohibit HTTP caching
with `Cache-Control: no-store`. Regenerate the OpenAPI document and browser client
through the repository commands. Do not export these internal ports through the module's public barrel.

Update `src/libs/modules/email-verification/README.md`,
`docs/privacy/email-verification-processing-contract.md`, and the inventory and removal scope of pending
`.agents/plans/privacy-compliance/07-enforce-verification-data-retention.md`. Treat this metadata as part of its
containing verification submission, without an independent or longer retention lifetime. The seven-day history
cutoff is a read rule, not a deletion mechanism. Plan 07 still owns physical cleanup and unresolved lifecycle
decisions; do not mark its controls complete or introduce a dependency cycle. Document that legacy jobs are not
retroactively enumerated and queue loss can leave an unavailable discovery row.

## Interfaces and Dependencies

`GET /v1/verification-history/batches?limit=20&cursor=<opaque-value>` returns `200` with:

```json
{
    "items": [
        {
            "id": "11111111-1111-4111-8111-111111111111",
            "createdAt": "2026-09-18T09:00:00.000Z",
            "status": "queued"
        }
    ],
    "nextCursor": null
}
```

Status is `queued`, `running`, `completed`, `failed`, or `unavailable`. The batch item has no email property.
The default limit is 20 and the maximum is 100. The cursor is versioned, bounded, and specific to organization,
kind, page limit, initial `asOf`, and the last database timestamp/UUID tuple. Use fixed `createdAt <= asOf` and the
live lower bound `createdAt >= now - 7 days`; retain the exact inclusivity chosen in plan 01. Future, expired,
malformed, mismatched, or oversized cursors return `400` with code `invalid_history_cursor`. A cursor is not an
authorization credential; every SQL and queue read rechecks the authenticated organization. No caller-provided
organization field can override it. Empty authorized history is `200` with an empty array and null cursor;
missing authentication is `401`, missing permission is `403`, and existing detail-route `404` behavior is unchanged.

No new package, configuration secret, identity permission, billing rule, or cross-module dependency is required.
This PR unlocks the batch tab in `verification-history/03`. There is deliberately no durable status fallback.

## Acceptance Criteria

1. A newly recorded upload appears before CSV validation; invalid CSV, queued, running, completed, and failed
   jobs project their existing public status. The listed ID opens the existing batch detail route when retained.
2. Database insertion failure causes zero queue calls. A queue error or process interruption after registration
   leaves one discoverable row; a missing job reports unavailable. A lost successful HTTP response is recoverable
   through history without another upload or credit operation.
3. Identical internal registration cannot change ID ownership or creation time. Different uploads remain distinct;
   this feature does not promise HTTP upload idempotency. Legacy jobs remain accessible by URL but are not listed.
4. Pagination returns only owned rows in descending timestamp/UUID order, including microsecond differences, with no
   duplication in a stable fixture. New submissions after `asOf` await refresh; rows outside the live seven-day
   window disappear. Empty, final-page, expired-cursor, wrong-kind, wrong-organization, and invalid-limit cases
   follow the stated response contract.
5. Foreign queue snapshots disclose no data. A queue outage returns a server error, and an unavailable job does
   not become completed, failed, charged, or retryable by inference. Each page uses bounded status lookups and no
   admission-count, SMTP, S3, billing, dispatch, or result-download work.
6. Existing upload, status, CSV export, authentication, and billing behavior passes regression checks. Focused
   tests, generated contracts, module architecture, type checking, Bruno, and changed-document checks pass.

## Validation

These are planned implementation commands from the repository root, not results of plan authoring:

```sh
corepack pnpm exec jest --runInBand typeorm-batch-submission.store.spec.ts list-batch-verification-history.spec.ts batch-email-verification.service.spec.ts bull-batch-jobs.spec.ts batch-verification-status.spec.ts verification-history-http.integration.spec.ts verification-history.openapi.spec.ts batch-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
```

Add focused port/adapter tests at the named files. Extend the real PostgreSQL suite
`infrastructure/persistence/verification-billing.integration.spec.ts` so the existing checked runner exercises
registration, ownership, concurrent inserts, exact cursor precision, indexes, and paging against real adapters.
Use controlled timestamps and at least 45 owned rows plus foreign rows. Inspect an `EXPLAIN (ANALYZE, BUFFERS)`
plan with a representative larger fixture; do not impose a machine-specific duration threshold or require an
index scan on a tiny table. Controlled queue fakes prove acknowledged, rejected, and uncertain enqueue outcomes;
record separately any executed real-Redis process-interruption experiment.

Extend `bruno/batch-verification/` with successful and invalid-CSV discovery, bounded paging, foreign-organization
isolation, missing authentication, and bad query/cursor requests. Cover missing read permission in deterministic
HTTP fixtures; the current runner has no fixture credential without that permission. Keep existing CSV downloads and
status checks. Update registered request/assertion totals and the corresponding runner test. The launcher runs
the pinned `bru run --env local --sandbox developer` against checkout-owned disposable fixtures and rejects
skipped or zero-test reports. When dependencies are unavailable, report runtime execution as unverified and
complete static and HTTP fixture checks. Do not add public fault-injection endpoints or print credentials.

## Idempotence and Recovery

History reads do not mutate submission, queue, or accounting state. Repeating internal registration preserves the
first row. Repeating an HTTP upload may create a new batch, just as before; the UI must preserve its uncertainty
acknowledgment instead of treating an absent list entry as permission to resubmit.

Use `TYPEORM_SYNCHRONIZE=true` only against disposable development data; add no migrations or backfills. The new
table is additive. For an incompatible fixture or reverting the entity, use
`corepack pnpm dev:reset -- --confirm-project=LEF` only after verifying the targets belong to this checkout and are
disposable; the existing script rebuilds and reseeds them. Never reset a neighboring checkout. Deploy the backend
before its dependent UI in development. To revert the feature, remove its UI first, then the discovery API and
registration; existing verification routes remain the prior recovery surface. Restarted code must not redispatch
or recreate jobs merely because discovery records remain.

## Artifacts and Notes

Planning verified the absence of upload-time SQL records and the existing terminal queue mapper. The architectural
trade-off is explicit: a small durable directory still uses bounded Redis lookups for current status. It survives
loss of a browser link, not loss of the batch execution system. No implementation or runtime validation is claimed.

## Plan readiness

Ready to implement
