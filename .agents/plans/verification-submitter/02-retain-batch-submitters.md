# Retain Batch Submitters Through Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Each validated CSV batch and every verification request materialized from it retain the authenticated submitter,
even after the Redis job disappears. A developer can verify the human or service reference in PostgreSQL without
resolving shared execution ownership or guessing from its payer. This plan delivers exactly one PR:
`feat(email-verification): retain batch submitter attribution`.

The durable boundary remains manifest creation after CSV validation. An upload that fails before that boundary
has no new SQL attribution guarantee. This change does not create an audit trail of every upload attempt.

## Progress

- [ ] (2026-09-18) Carry authenticated submitters through new jobs and preserve legacy job compatibility.
- [ ] (2026-09-18) Persist immutable manifest attribution and copy it into each materialized request.
- [ ] (2026-09-18) Cover replay, delayed processing, sharing, legacy data, and public response minimization.
- [ ] (2026-09-18) Complete focused checks and update the verification and privacy inventories.

## Plan dependencies

- `verification-submitter/01`
- `verification-billing/05`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Capture attribution at the existing post-validation manifest boundary. Rationale: An upload receipt
  before queue dispatch would add a separate database/queue recovery workflow. Date/Author: 2026-09-18, Codex.
- Decision: Copy the immutable manifest submitter into each batch request. Rationale: Requests remain independently
  attributable, including cached results and followers of another caller's execution. Date/Author: 2026-09-18, Codex.
- Decision: Missing typed attribution remains unknown, including old jobs with only `credentialId`. Rationale:
  That identifier can name either a human identity or a service credential; its type cannot be inferred.
  Date/Author: 2026-09-18, Codex.
- Decision: Preserve the manifest's first stored value, including null, on retries. Rationale: A later worker or
  replay must not rewrite who submitted the batch. Date/Author: 2026-09-18, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Paths below are relative to `src/libs/modules/email-verification/src/` unless another root is given.
`api/http/batch-verification/batch-email-verification.controller.ts` takes organization and credential IDs from
`AuthPrincipal`. `application/delivery/batch/batch-email-verification.service.ts` enqueues a `Validate` job.
Every workflow step in `domain/batch-job.ts` retains the untyped credential ID, including `Finish`.

`application/delivery/batch/batch-email-verification-workflow.ts` parses the CSV, stores rows and unique addresses,
and calls `BatchAdmissionStore.createOrReplay()` only after parsing succeeds. The manifest's `batchId` is also
the BullMQ job ID. `application/delivery/batch/batch-admission.service.ts` reads this manifest and materializes
one request per unique address. Outcomes include cache, cooldown, shared execution, and newly created execution;
an unfunded group still produces failed requests. Each batch's address manifest links its own request records.

Plan `verification-submitter/01` supplies `domain/verification-submitter.ts` and
`VerificationSubmitterReference { kind: AuthCredentialKind; id: string }`. Kinds are exactly `human_session` and
`service_client`; the ID is respectively the external identity UUID or service credential UUID. It supplies
nullable persisted request attribution and immutable attribution on request admission. Identity lifecycle remains
owned by the identity module; email verification stores opaque references.

The batch queue has no configured terminal cleanup. Its lifetime is not an attribution guarantee. SQL manifests
and requests currently contain no batch submitter. Public status, CSV output, and verification tracing expose no
actor details. The durable attribution added here must remain internal.

## Scope and Non-Goals

Change HTTP-to-job attribution wiring, job compatibility, manifest persistence, request creation, focused tests,
and the affected documentation. This unlocks durable attribution for validated batches without Redis or identity
lookups. Preserve routes, request bodies, response schemas, permissions, organization ownership, CSV columns,
reservation amounts, request IDs, execution sharing, and client-key conflict rules.

Do not expose submitters in APIs, UI, exports, or logs. Do not implement batch upload idempotency, admission
funding concurrency repairs, payer-ID repairs, upload receipts, retention workers, identity deletion, migrations, or
historical backfills. Rejected uploads before manifest creation remain outside the SQL attribution contract.

## Plan of Work

Extend `EnqueueBatchInput` in `application/delivery/batch/batch-email-verification.service.ts` and `NewBatchJob`
in `application/delivery/batch/batch-jobs.ts` with required `submitter: VerificationSubmitterReference`. The
controller constructs it solely from `AuthPrincipal` using the explicit principal mapping defined in plan 01. Multipart fields and headers must
never supply the actor. Preserve the current `credentialId` job field for compatibility; for new jobs it equals
`submitter.id`, and it never supplies missing attribution during consumption.

Extend persisted `BatchJobData` in `domain/batch-job.ts` with an optional nullable submitter. Keep new producer
inputs strict while old Redis jobs remain readable. At the queue adapter boundary in
`infrastructure/queues/batch-verification/bull-batch-jobs.ts`, normalize absent, null, or malformed stored submitter
data to null using `isVerificationSubmitterReference` from plan 01. Both worker handles and public job lookup use this normalization.
Do not query identity persistence or fabricate a kind from an old credential ID. Malformed optional historical
attribution must not prevent otherwise valid work from completing.

Carry the normalized value through every `updateStep()` in `batch-email-verification-workflow.ts`, including
`Finish`. In `validateFile()`, pass it to `createOrReplay()` with unchanged counts and null client key and digest.
A replay after a crash returns the stored manifest and cannot replace or fill its submitter from a later payload.
Jobs already beyond `Validate` with unattributed manifests remain unknown.

Add `submitter: VerificationSubmitterReference | null` to `BatchAdmissionRecord` and `NewBatchAdmissionInput`
in `application/delivery/batch/batch-admission-store.ts`. Extend
`infrastructure/persistence/typeorm/batch-admission.entity.ts` with nullable `submittedByKind` and `submittedById`
columns using the kind constraint from plan 01 and UUID representation. Enforce that both are null or both are present
with a recognized kind. Add no cross-module foreign key, identity cascade, name snapshot, or speculative index.
Extend mapping and insertion in `infrastructure/persistence/typeorm-batch-admission.store.ts`. Replace the
read-then-save insertion with an insert-only operation using PostgreSQL `ON CONFLICT DO NOTHING`, followed by a
read of the committed winner. TypeORM `save()` can update a row after a concurrent insertion, so a sequential
replay check alone does not establish immutable attribution. Resolve an existing batch ID only within its
organization; otherwise resolve the existing organization/client-key winner and apply the current digest-conflict
rule. A collision belonging to another organization must fail without returning or updating that row. Preserve
the original manifest fields and actor, including null, regardless of incoming attribution. State/count/address
writes leave attribution untouched. This narrow first-writer rule does not introduce upload-level idempotency or
change funding. Do not expose a new actor-update method.

In `BatchAdmissionService.admit()`, read attribution from the stored manifest and pass it to
`materializeRequest()`. Include it in cache, cooldown, shared, funded-created, and insufficient-funds-created
request branches. Use the request-store contract from plan 01, including any changes inherited from its admission
hardening prerequisite. Do not revive a superseded insertion path. Recovery creating a missing request uses the
same stored actor; existing requests remain immutable. Shared execution ownership and payer identity never supply
this value. The current manifest-to-request links suffice; no extra batch relation or actor column on results,
executions, original rows, or unique-address records is needed for attribution.

Update `src/libs/modules/email-verification/README.md`,
`docs/privacy/email-verification-processing-contract.md`, and inventory/context in
`.agents/plans/privacy-compliance/07-enforce-verification-data-retention.md`. Describe the manifest, request, and
queue copies, unknown legacy state, and capture boundary. Attribution follows its containing record's lifecycle
and creates no longer-lived audit store. Preserve pending privacy decisions and distinguish operation visibility
from deletion. Do not mark retention controls implemented, add a dependency cycle, or build the retention engine.

Extend the focused tests listed below. In `bruno/batch-verification/`, strengthen existing upload, status, and CSV
assertions so internal attribution never appears publicly. Retain invalid-CSV, authentication, and foreign
organization rejection checks. Test principal-to-job mapping for both credential kinds in the controller fixture;
verify persistence in SQL without adding a debug endpoint. Update
`scripts/bruno/batch-verification-runner.test.mjs` and registered counts in `scripts/bruno/run-collection.mjs` when
assertion counts change. Preserve disposable fixtures and reports that omit secrets.

## Interfaces and Dependencies

Reuse the submitter type and type guard from plan 01. New producer inputs require a reference; persisted jobs
accept missing data; manifest and request records return a reference or null. Application and domain code remain
framework-independent. TypeORM and BullMQ stay in infrastructure. No new module export, package, configuration,
endpoint, customer-supplied actor field, or organization authorization rule is introduced.

## Acceptance Criteria

1. Human and service uploads persist the correct typed principal reference on validated manifests and all their
   materialized requests. Multipart fields cannot override it.
2. Cache, cooldown, shared, funded, and insufficient-funds branches retain the manifest actor. Two batches from
   different actors sharing one execution retain their own actors on their requests and unchanged billing.
3. Validation replay, delayed processing, `Finish`, and partial request recovery preserve the initial actor.
   Different incoming attribution cannot overwrite a manifest or existing request, including null values.
4. Old jobs with only `credentialId`, old manifests, and malformed optional job attribution continue with unknown
   attribution. No identity lookup or inference occurs.
5. A new PostgreSQL adapter returns attribution without Redis or identity access. Concurrent manifest creation
   preserves the first committed actor, including null, without overwriting counts or tenant ownership.
   Constraints reject partial pairs and
   unknown kinds; no identity lifecycle operation cascades into verification records.
6. Public contracts, permissions, CSV columns, logs, billing, and organization isolation remain unchanged. Focused
   tests, real PostgreSQL, real Redis, architecture, type checks, and Harper pass. Bruno passes when its disposable
   stack is available; missing runtime evidence is explicitly reported.

## Validation

Run from the repository root. Unit and HTTP fixture checks:

```bash
corepack pnpm test -- --runInBand --runTestsByPath \
  src/libs/modules/email-verification/src/api/http/batch-verification/batch-email-verification.controller.spec.ts \
  src/libs/modules/email-verification/src/api/http/batch-verification/batch-verification-http.integration.spec.ts \
  src/libs/modules/email-verification/src/application/delivery/batch/batch-email-verification.service.spec.ts \
  src/libs/modules/email-verification/src/application/delivery/batch/batch-email-verification-workflow.spec.ts \
  src/libs/modules/email-verification/src/application/delivery/batch/batch-admission.service.spec.ts \
  src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-batch-admission.store.spec.ts \
  src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/bull-batch-jobs.spec.ts
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm openapi:check
corepack pnpm docs:lint -- .agents/plans/verification-submitter src/libs/modules/email-verification/README.md docs/privacy/email-verification-processing-contract.md .agents/plans/privacy-compliance/07-enforce-verification-data-retention.md
```

Extend `infrastructure/persistence/verification-billing.integration.spec.ts` for manifest/request round trips,
immutable replay, two-writer insertion barriers, nullable data, pair constraints, and two-actor sharing.
Recreate the PostgreSQL adapters and read actor fields without a Redis client or identity lookup. The PostgreSQL launcher validates a
checkout-owned disposable database; skipped tests are not proof. Use an isolated Redis endpoint in `TEST_REDIS_URL`;
the existing queue suite uses a random prefix and removes only its own queues. Add delayed retry, legacy payload,
and completed-job removal scenarios to it. Its stores are in-memory fixtures: that suite proves transport and
workflow behavior, while the separate PostgreSQL suite proves durable persistence. Do not present the two suites
as a combined SQL/Redis runtime test:

```bash
test -n "${TEST_REDIS_URL:-}"
corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/batch-email-verification-queue.integration.spec.ts --runInBand
corepack pnpm bruno:batch-verification
```

The Bruno launcher runs pinned `bru run --env local --sandbox developer` against the verified checkout-owned
stack. SQL tests prove attribution; Bruno proves the public workflow and rejection contracts. Report missing
Docker, Redis, or stack dependencies separately rather than counting skipped execution as success.

## Idempotence and Recovery

Manifest insertion stores the first actor; replay returns it unchanged. New batches use the current submitter;
existing batches preserve their stored value. Do not infer historical actors. Stop old workers before incompatible
local schema changes and use `TYPEORM_SYNCHRONIZE=true` only with disposable data. The existing
`corepack pnpm dev:reset -- --confirm-project=LEF` resets and reseeds the entire verified checkout-owned development
stack; it is optional when a fresh test database suffices. Never bypass its ownership guard. No production rollout
or migration belongs in this plan.

## Artifacts and Notes

This plan uses current controller, queue, workflow, manifest, and request-store evidence inspected on 2026-09-18.
Plan authorship does not establish runtime verification. One immutable actor copy per request, alongside the
manifest, deliberately allows attribution without retaining Redis jobs or joining identity records.

## Plan readiness

Ready to implement
