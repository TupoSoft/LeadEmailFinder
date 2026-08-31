# Enforce Verification-Data Retention Across PostgreSQL, Redis, and S3

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Bound how long LeadEmailFinder keeps address-bearing verification state in application-managed PostgreSQL,
BullMQ/Redis, and S3. After this change, successful and failed work expires according to one documented policy. Batch
input is removed as soon as it is no longer needed, and a retryable hourly sweep reconciles artifacts that automatic
queue removal cannot handle. A restored generation remains quarantined until the same time-based removal completes.

A developer can observe the behavior with a fake clock, shortened integration cutoffs, plan-15 restore-gate tests, and
the existing status/result routes returning the same not-found response after expiration. Managed processor-copy log-
sink retention and backup-set expiry/access remain in plan 11, while restore release ownership remains in plan 15
rather than being claimed by this application cleanup plan.

## Progress

- [ ] (2026-08-30) Characterize every address-bearing application PostgreSQL row, BullMQ payload/result, and S3 object lifecycle.
- [ ] (2026-08-30) Add durable batch-artifact metadata and explicit, validated retention configuration.
- [ ] (2026-08-30) Implement idempotent PostgreSQL, Redis, and S3 removal behind narrow retention ports.
- [ ] (2026-08-30) Schedule an hourly bounded sweep and register the `verification.age-retention.v1` reconciler with the plan-15 restore gate.
- [ ] (2026-08-30) Add cutoff, orphan, retry, concurrency, restore-quarantine, and ownership coverage.
- [ ] (2026-08-30) Add a policy-approved absolute nonterminal-work maximum, fenced cancellation, bounded manual hold,
      and deterministic stale-work escalation.
- [ ] (2026-08-30) Complete focused, runtime, Bruno, documentation, and full validation.

## Plan dependencies

- `privacy-compliance/04`
- `privacy-compliance/06`
- `privacy-compliance/15`
- `module-architecture/16`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use initial product defaults of 30 days for email/verification rows, 24 hours for SMTP cache, 7 days for
  terminal async/batch jobs and batch results, immediate deletion for successful/invalid batch inputs, 24 hours for
  unregistered/orphan inputs, and an hourly sweep.
  Rationale: These are explicit, testable product defaults balancing result availability, retry diagnostics,
  freshness, and minimization; they are not represented as universal statutory deadlines.
  Date/Author: 2026-08-30, project planning.
- Decision: Treat every configured duration as a shortening override beneath a machine-readable approved maximum;
  reject a value above that maximum rather than silently extending the policy.
  Rationale: Environment configuration may make tests or a deployment more minimizing, but it must not override the
  approved lifecycle in the permissive direction.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require privacy counsel and Operations to approve one absolute maximum age for nonterminal verification
  work before implementation. Before that boundary, stale work enters a fenced cancellation or an explicitly owned,
  expiring manual hold; neither a live queue state nor a hold can make address-bearing data indefinite.
  Rationale: Blindly deleting active work can race a late result write, while exempting waiting, active, delayed, or
  retryable work forever defeats storage limitation. This PR therefore owns a minimal retention cancellation/write
  fence; plan 08 may compose subject-disposition gates with it later but is not a prerequisite.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Limit this plan to application-managed PostgreSQL, BullMQ/Redis, and S3.
  Rationale: Plan 11 separately validates managed processor-copy log retention, immutable backup expiry, and access
  restrictions, while plan 15 owns restore quarantine. Combining vendor configuration, restore runtime, and
  application deletion would make one PR neither independently testable nor owned by one responsibility.
  Date/Author: 2026-08-30, project planning.
- Decision: Persist a small organization-owned batch-artifact registry as the canonical input/result location and
  cleanup state.
  Rationale: Redis jobs can expire independently, and S3 cannot reliably infer whether an object is active, abandoned,
  or safe to delete from a key alone.
  Date/Author: 2026-08-30, project planning.
- Decision: Use the existing BullMQ dependency for one singleton repeatable retention job rather than add
  `@nestjs/schedule`.
  Rationale: Queue-backed scheduling, retries, and locking already exist and keep cleanup observable beside
  verification work.
  Date/Author: 2026-08-30, project planning.
- Decision: Treat BullMQ `removeOnComplete`/`removeOnFail` as defense in depth, not the only cleanup mechanism.
  Rationale: Age removal depends on later queue activity and cannot coordinate S3 deletion or database artifact state.
  Date/Author: 2026-08-30, project planning.
- Decision: Delete durable objects before ownership/status metadata and never delete active/waiting/delayed/retryable
  work.
  Rationale: Partial failure must leave enough state to retry and must not produce completed work whose promised result
  disappeared early.
  Date/Author: 2026-08-30, project planning.
- Decision: Register only time-based application cleanup as `verification.age-retention.v1` with the plan-15 restore
  gate; leave verification-subject disposition replay to plan 20, dual-subject correction replay to plan 31, and
  controller-data disposition replay to plan 18.
  Rationale: Retention can compare timestamps and lifecycle state without knowing an individual request, while each
  rights workflow owns its keyed dispositions and data-model-specific erasure.
  Date/Author: 2026-08-30, project planning.
- Decision: Use TypeORM synchronization on disposable development data and add no migration/backfill.
  Rationale: The repository has no production environment; the new registry is validated through reset/reseed.
  Date/Author: 2026-08-30, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

After privacy plan 04, `emails`, `email_verifications`, and `smtp_verifications` are organization-owned and timestamped.
After module-architecture plan 16, HTTP delivery lives under `src/libs/modules/email-verification/src/api/`,
orchestration/ports under `application/`, and BullMQ, TypeORM, CSV, and S3 implementations under `infrastructure/`.
This plan introduces a purpose-specific retention cancellation/write fence so it is independently safe. Plan 08 later
adds subject-scoped ingestion epochs and composes them with that public fence without changing its retention semantics.
Plan 15 supplies the privacy-operations restore registry, quarantine/readiness/worker gates, and public
`RestoreReconciler` extension contract.

The module uses `async-email-verification` and `batch-email-verification` queues. Async job data/results contain an exact
address. Batch parent data contains an organization-scoped S3 input key; children contain addresses; a completed parent
returns an S3 result location. Existing queue registration has no terminal-job age limits. S3 uploads use
`organizations/<organizationId>/uploads/<uuid>`, and results replace `/uploads/` with `/results/`. There is no
application record distinguishing active objects from orphans after a crash between upload and queue registration.

Local Redis enables append-only persistence. PostgreSQL and Redis use development volumes, while Garage data is
ephemeral. Those fixture details do not enforce application retention and do not represent a managed backup service.
Plan 11 inventories actual managed processor-side verification copies in sinks/backups and enforces their 30-day
maximum/access rules. Plan 15 prevents a restored generation from serving before its snapshotted reconcilers complete.

## Scope and Non-Goals

Add application retention defaults and approved maxima, a batch-artifact registry, retention services/ports, BullMQ and
S3 adapters, an hourly singleton sweep, and terminal-job removal settings. Add a minimal retention cancellation/write
fence, a bounded stale-nonterminal workflow, a plan-15 `verification.age-retention.v1` restore reconciler, and
focused/runtime coverage. Make status/result routes treat expired resources as not found. Document the application
policy in the module README and privacy road map.

Do not implement configuration or retention for log sinks run by external operators, expiry/access for backup sets, or restore release.
Do not implement privacy-request intake, subject-specific disposition/correction replay, California DROP, legal holds,
provider-account lifecycle, migrations, backfills, high availability, production rollout, or production recovery. Do not shorten identity, audit, billing,
payment, credit-ledger, or proxy records. Log content minimization belongs to plan 03, and managed processor-copy logs
and backup copies belong to plan 11. The generic restore gate belongs to plan 15. Verification disposition replay
belongs to plan 20, dual-subject correction replay belongs to plan 31, and controller-data replay belongs to plan 18.

## Plan of Work

Begin with a source-backed lifecycle table and executable characterization tests for each relevant table, queue
kind/state, input object, result object, and failure boundary. Introduce a `Clock` port so tests advance time without
sleeping.

Add `src/libs/modules/email-verification/src/domain/batch-verification-artifact.ts` and a private TypeORM entity at
`src/libs/modules/email-verification/src/infrastructure/persistence/typeorm/batch-verification-artifact.entity.ts`.
Store batch/organization IDs, input bucket/key, optional result bucket/key, lifecycle state, created/completed/expiry/
removal timestamps, and a sanitized removal reason. Store no credentials or duplicate CSV content. Add a
`BatchArtifactStore` port and make upload register before publishing. If registration/publication fails, compensate by
deleting the new object; the hourly orphan scan remains crash recovery.

Move completed-result lookup to the registry rather than only BullMQ return values. When a valid batch finishes and
durable result metadata commits, delete input immediately. Delete invalid input immediately after validation rejection.
Keep input only while processing/retry remains possible; treat an unregistered object under an owned upload prefix as
an orphan after 24 hours.

Implement narrow ports under `application/retention/ports/` for PostgreSQL record cleanup, terminal queue cleanup,
artifact metadata, and batch storage. Put adapters under `infrastructure/retention/typeorm/`,
`infrastructure/retention/bullmq/`, and `infrastructure/retention/s3/`. Process deterministic pages of at most 500
items per adapter call, persist continuation, and repeat until no due work remains. Make the page size configurable.

Register a `verification-data-retention` BullMQ queue and one repeatable hourly job with a deterministic scheduler ID.
A second API instance/replay must not run the same sweep concurrently. Configure async/batch queues to retain terminal
jobs no longer than 7 days, then explicitly remove those automatic cleanup has not removed. For a batch, delete the
expired result object and commit artifact expiration before terminal parent/children removal. S3 failure leaves the
artifact due and prevents queue metadata removal.

Add an exact `nonterminalMaximumHours` to the approved plan-01 lifecycle projection before implementation; do not use
a code fallback or an environment-selected legal maximum. Introduce a narrow `VerificationRetentionFence` owned by
the email-verification application layer. A worker must hold the current artifact execution token and atomically
compare it again when committing result metadata; retention can transition `open -> cancellation_requested -> fenced`
with compare-and-set, cancel the exact BullMQ job, and reject every late commit using the stale token.

At a separately approved warning threshold, deny new execution-token renewals, request cancellation, assign the
configured Operations role, and create a sanitized escalation with a deterministic ID. A manual hold is valid only
with reason code, owner role, review time, and `expiresAt` no later than the absolute maximum. At the hard boundary,
advance the retention fence, wait until no current token can commit, and then expire PostgreSQL, Redis, and S3 state in
the normal safe order. If fencing or storage state is ambiguous, keep the item unavailable, escalate as an incident,
and fail the retention-readiness check; never interpret ambiguity as permission for an unbounded extension or blindly
delete data while a writer can still commit. Export the narrow fence contract so plan 08 can add subject gates later
without importing this plan's persistence.

For PostgreSQL, delete `email_verifications` older than 30 days, then organization-owned `emails` with no retained
verification/work reference and last activity older than 30 days. Delete SMTP cache rows older than 24 hours. Use
organization-aware predicates from plan 04 even in global sweeps, deterministic primary-key pages, and no unbounded
delete.

Implement a `VerificationRetentionRestoreReconciler` against the public plan-15 `RestoreReconciler` contract. For a
quarantined generation, use the backup capture time/current injected clock to apply the same bounded PostgreSQL,
BullMQ/Redis, and S3 cutoffs and checkpoint progress. Missing/ambiguous storage state returns incomplete and keeps the
generation quarantined. The adapter reports sanitized counts/cursors only. It does not configure backup expiry or
replay subject-specific requests.

Add configuration validation in `src/lead-email-finder-api/src/environment-variables.dto.ts`, module wiring, fake-
clock unit tests, TypeORM integration tests, BullMQ tests against Redis, storage tests against Garage, and restore-gate
contract tests. Update the email-verification README with exact defaults, ownership boundary, and expiry behavior.
Load approved maxima from the versioned lifecycle policy and validate every effective duration against them at
startup. Add table-driven negative tests for every over-limit override as well as stale waiting, active, delayed,
retryable, waiting-children, orphan-upload, execution-token race, manual-hold-expiry, and late-result scenarios.

## Interfaces and Dependencies

Add validated positive-integer settings:

    EMAIL_RECORD_RETENTION_DAYS=30
    EMAIL_VERIFICATION_RETENTION_DAYS=30
    SMTP_VERIFICATION_RETENTION_HOURS=24
    VERIFICATION_JOB_RETENTION_DAYS=7
    BATCH_RESULT_RETENTION_DAYS=7
    ORPHAN_BATCH_INPUT_RETENTION_HOURS=24
    VERIFICATION_NONTERMINAL_MAX_AGE_HOURS=<approved maximum or shorter>
    VERIFICATION_NONTERMINAL_WARNING_HOURS=<approved warning threshold or shorter>
    VERIFICATION_RETENTION_SWEEP_MINUTES=60
    VERIFICATION_RETENTION_SWEEP_BATCH_SIZE=500

The approved lifecycle projection fixes maxima of 30 days, 30 days, 24 hours, 7 days, 7 days, and 24 hours for the
corresponding configured storage durations above, plus the counsel/Operations-approved nonterminal maximum. Effective
values must be positive integers and no greater than their policy maximum; warning must be less than the nonterminal
maximum. Tests may shorten them through injected configuration, but production code does not special-case `NODE_ENV`
or accept a longer override. Define purpose-specific contracts equivalent to:

    interface VerificationRecordRetentionStore {
        deleteExpired(cutoff: Date, limit: number): Promise<CleanupPage>
    }

    interface VerificationJobRetentionStore {
        removeExpiredTerminalJobs(cutoff: Date, limit: number): Promise<CleanupPage>
    }

    interface VerificationRetentionFence {
        requestCancellation(workId: string, expectedToken: string): Promise<'requested' | 'already_fenced'>
        fence(workId: string, expectedToken: string): Promise<'fenced' | 'conflict'>
        assertCommitAllowed(workId: string, executionToken: string): Promise<void>
    }

    interface BatchArtifactStore {
        registerInput(record: NewBatchArtifact): Promise<void>
        markResultReady(record: ReadyBatchArtifact): Promise<void>
        findDueForCleanup(now: Date, limit: number): Promise<BatchArtifact[]>
        markExpired(batchId: string, organizationId: string): Promise<void>
    }

    interface BatchArtifactStorage {
        deleteOwnedObject(organizationId: string, location: ObjectLocation): Promise<void>
        findOrphanInputs(olderThan: Date, limit: number): Promise<ObjectLocation[]>
    }

`CleanupPage` reports sanitized counts/continuation and never addresses. The restore adapter implements the plan-15
public contract with descriptor ID `verification.age-retention.v1` without importing its TypeORM registry. Existing successful HTTP DTOs remain unchanged; after expiry,
async status, batch status, and result download return the same `404` used for missing/foreign work.

Use existing TypeORM, BullMQ, AWS SDK, Nest configuration, S3, and the plan-15 public contract. Add no package or public module
export other than the narrow restore-reconciler registration required by the composition root.

## Acceptance Criteria

- Email/verification rows are retained for 30 days and eligible only at the exact cutoff; SMTP cache is eligible after
  24 hours and never reused after expiry.
- Completed/failed standalone async jobs, batch parents, terminal children, and batch results are unavailable after 7
  days, while waiting/active/delayed/waiting-children/retryable jobs are never age-deleted.
- A successful batch input deletes only after durable result upload/metadata commit; invalid input deletes after
  validation failure; an unregistered upload survives before and deletes after the 24-hour orphan cutoff.
- Batch result cleanup safely orders S3 deletion, artifact state, and terminal jobs; later status/result requests return
  `404`.
- S3/Redis/PostgreSQL failure leaves removal retryable and never prematurely marks an artifact expired; concurrent/
  repeated sweeps produce one effect and bounded work.
- Object deletion validates bucket and `organizations/<organizationId>/uploads|results/` prefix before any request.
- Configuration rejects zero, negative, fractional, malformed, or above-policy values; every configured duration is
  at or below its approved maximum, and table-driven tests cover one-unit-over-limit rejection for each setting.
- Waiting, active, delayed, waiting-children, and retryable work cannot remain indefinitely. Stale work is fenced and
  canceled before the approved absolute maximum, or enters a named manual hold whose review and expiry remain within
  that same maximum; warning/owner escalation is deterministic, and late worker writes are rejected.
- The retention fence is owned and tested in this PR, uses compare-and-set execution tokens at result commit, and is
  safe without plan 08; plan 08 can compose later subject gates only through the exported narrow contract.
- A synthetic restored generation remains quarantined through incomplete/failing application retention, resumes from a
  bounded cursor, and releases only after this plan's reconciler reports complete to plan 15.
- No provider for managed logs, provider for backup copies, backup-copy policy, subject-specific disposition, controller record, migration,
  production recovery, or cross-organization deletion is introduced or claimed.
- Focused, PostgreSQL, Redis, Garage, restore-gate, full, architecture, build, documentation, and batch Bruno checks
  pass.

## Validation

Run deterministic unit/adapter and restore contract tests:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-data-retention batch-verification-artifact verification-retention-restore --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_retention_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-verification-retention.postgres.integration.spec.ts --runInBand
    TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-verification-retention.redis.integration.spec.ts --runInBand

The fake-clock suite covers one millisecond before, exactly at, and after each cutoff. It covers every duration at its
maximum and one unit above it, terminal states, stale waiting/active/delayed/waiting-children/retryable work, orphan
uploads, and warning and hard nonterminal boundaries. It also covers manual-hold review/expiry, execution-token
cancellation and late-result races, storage failure/retry, concurrent scheduler deliveries, a page over 500, and
restore checkpoint failure/resume/quarantine.

After inspecting `lef-api-1` ownership, use an owned disposable stack and Garage credentials from ignored development
secret files:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-verification-retention.s3.integration.spec.ts --runInBand

Run the exact `bruno/batch-verification/README.md` container-network command with test-only short retention. Prove
upload, completion, result download, and then expired status/result `404`. Update the collection only for deterministic
expiry assertions/environment.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/batch-verification/README.md .agents/plans/privacy-compliance/07-enforce-verification-data-retention.md
    git diff --check

Bruno: update `bruno/batch-verification` with the shortest deterministic expiry check supported by the runtime fixture
and require its durable-result and expiry behavior to pass.

## Idempotence and Recovery

Every deletion treats already-missing state as success only after verifying organization/key scope. Artifact lifecycle
records the next safe action, so retry resumes. Deterministic scheduler identity prevents duplicate registrations;
adapters remain safe if workers overlap. Restore checkpoints are monotonic and a failed/unknown step leaves quarantine.

If synchronized schema or queue protocol is partial, preserve unrelated work, confirm Compose ownership, and run the
approved development reset/reseed. Never recover by deleting live work before its retention fence is effective or by
extending a manual hold beyond the approved maximum. Do not delete a broad S3 prefix, flush shared Redis, delete a
managed backup/log sink, bypass the release gate from plan 15, or weaken organization predicates.

## Artifacts and Notes

Record lifecycle matrix, effective configuration, redacted artifact key shapes, per-store counts, retry evidence,
scheduler/reconciler IDs, sanitized restore checkpoints, focused/integration totals, and Bruno totals. Never record raw
addresses, CSV contents, S3 credentials, bearer tokens, provider payloads, contents of backups, or broad object listings.

## Plan readiness

Ready after privacy counsel and Operations approve the exact absolute nonterminal-work maximum, warning threshold,
manual-hold reason/owner/review rules, and deterministic escalation owner in the plan-01 lifecycle contract.
