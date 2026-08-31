# Layer Batch Email Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Layer CSV upload, owned status/result HTTP behavior, the durable batch state machine, Bull parent/child coordination,
and S3 input/result adapters, then complete email-verification delivery composition. A developer can upload a CSV,
observe the unchanged bounded progress and child fan-out, wait for durable encrypted result upload before `Finish`,
and download the same organization-owned CSV through a module with no remaining architecture-baseline violations.

## Progress

- [ ] (2026-08-30) Complete the binding size projection and, if required, replace this plan with the prescribed split.
- [ ] (2026-08-30) Characterize batch HTTP, state transitions, queue topology, credit, ownership, S3, retry, and recovery.
- [ ] (2026-08-30) Move the transport-neutral batch workflow and storage/job ports into application.
- [ ] (2026-08-30) Move batch HTTP, BullMQ, CSV, upload, result, and stream mechanisms to their adapter layers.
- [ ] (2026-08-30) Recompose all delivery slices and remove the final email-verification baseline keys.
- [ ] (2026-08-30) Complete focused, Redis/S3, Bruno, architecture, full, build, and documentation validation.

## Plan dependencies

- `module-architecture/11`
- `module-architecture/14`
- `module-architecture/15`
- `privacy-compliance/06`

## Surprises & Discoveries

- `BatchEmailVerificationProcessor` is both a Bull worker and the durable coordinator for
  `Validate -> Process -> WaitForChildren -> UploadResults -> Finish`.
- Batch completion already waits for both child work and result upload, and progress must remain finite from zero
  through 100 even for zero-child, partial, malformed-adapter, and completed states.
- The parent creates jobs on the async queue, so plan 15 must land before this relocation can prove serialized
  parent/child compatibility.

## Decision Log

- Decision: Put batch upload registration, owned status/result lookup, and the transport-neutral state machine under
  `src/application/delivery/batch/`, behind narrow batch-job, child-flow, input, result-write, and result-read ports.
  Rationale: Transition ordering, idempotency, ownership, credit effects, and durable completion are application
  behavior rather than Bull or S3 behavior.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Put multipart controllers/DTOs/stream responses under `src/api/http/batch-verification/`, Bull producer/
  processor/flow mechanics under `src/infrastructure/queues/batch-verification/`, and multer-S3/CSV/result storage
  under `src/infrastructure/storage/batch-verification/`.
  Rationale: Each adapter owns one external mechanism and points inward through purpose-specific ports.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve queue names/data, state enum, parent/child IDs and topology, attempts/backoff, waiting-children
  behavior, progress mapping, CSV schema/limits, S3 bucket/key/URI rules, content type, and retry/failure semantics.
  Rationale: Existing jobs and clients must remain compatible across a behavior-preserving refactor.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Consume the shared `CustomerObjectWriteSecurity` token from privacy plan 06 for both input and result writes.
  Production writers must use identical SSE-KMS key/algorithm and `no-store`; application code never sees AWS fields.
  Rationale: The two adapters must not drift or weaken the shared customer-object contract during relocation.
  Date/Author: 2026-08-30, Codex planning.
- Decision: A transition is replay-safe. Child creation, per-valid-row debit, result upload, stored result location,
  and `Finish` each have authoritative persisted evidence; ambiguous state stops rather than repeating a
  non-idempotent effect.
  Rationale: Bull retries and process crashes must not duplicate charges, jobs, or objects.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Before production edits, use the same per-path projection process as plan 10. Sum expected non-Markdown
  additions plus deletions, include all tests, count uncertain moves as delete plus add, ignore only `*.md` and
  `pnpm-lock.yaml`, and classify 1,000 or more modifications as `size/xl`.
  Rationale: The batch slice is cohesive but still must fit one reviewable PR.
  Date/Author: 2026-08-30, Codex planning.
- Decision: If projected `size/xl`, stop before production edits. Repurpose this plan to deliver only the
  transport-neutral batch state machine and ports with existing HTTP/Bull/S3 code retained as tested legacy adapters.
  Create the next unused module-architecture ExecPlan for HTTP/Bull/S3 relocation, final workflow composition, and
  baseline cleanup; make that plan depend on the repurposed plan plus plans 11, 14, 15, and privacy plan 06; then make
  plan 12 depend on the new follow-up. Do not reduce scope informally or bypass the threshold.
  Rationale: The predetermined split leaves an operational first PR and a mechanical adapter-relocation second PR.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Add no migration, backfill, production queue conversion, or production recovery procedure.
  Rationale: Schema and durable protocols remain unchanged, and development resources are disposable.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`batch-email-verification/` currently contains multipart DTOs/controller, a service over Bull jobs, job data and step
types, the parent processor/state machine, multer-S3 configuration, CSV conversion, result-key and S3-location helpers, Nest
module, and tests. `POST /verifyBatch/csv` uploads up to 100 megabytes and returns `202`; owned status and result routes
conceal missing and foreign jobs as `404`.

The parent validates rows, debits once per accepted row, creates one child on the plan-15 async queue, waits for all
children, creates and uploads a result CSV, stores its `s3://` location, and only then reports `Finish`. Result objects
replace `/uploads/` with `/results/` in the key. Privacy plan 06 requires fail-closed production transport and supplies
one `CustomerObjectWriteSecurity` value for the two customer-object writers.

Plans 11 and 15 complete sync/deprecated and async delivery over the final plan-14 core/network composition. This
plan owns the last delivery debt and final internal workflow recomposition; plan 12 may remove the global baseline
only after this plan or its mandatory size-split follow-up lands.

## Scope and Non-Goals

Layer batch API, application workflow/ports, Bull parent/flow adapters, CSV/multipart/S3 adapters, result streaming,
and internal composition. Move tests with owners, update the module and batch Bruno documentation, and remove all
remaining email-verification baseline entries.

Do not change HTTP paths, methods, statuses, bodies, permissions, file limits, CSV columns, progress meaning, queue
names, job data, options, topology, per-row price, or ownership concealment. Preserve the S3 bucket, key, location,
content type, storage security, core verification, provider/SMTP behavior, public exports, and configuration. Do not add
endpoints, migrations, backfills, queue drains or conversions, production rollout, high availability, or production
recovery.

## Plan of Work

Complete and record the per-path size projection before production edits. If it is `size/xl`, execute the mandated
two-plan decomposition and stop this implementation. Otherwise, record a state/effect table for every transition,
including entry evidence, effect, persisted completion evidence, legal next states, retry behavior, and ambiguous
state handling. Characterize zero rows, invalid rows, partial children, child failures/retries, waiting children,
credit failure, upload failure, result-stream failure, duplicate delivery, and crash/replay at every effect boundary.

Create transport-neutral commands for upload registration, owned status, and result retrieval. Extract a pure batch
state machine that returns the next transition/effects through narrow ports. Keep organization ID mandatory on every
job/read. Ensure progress normalizes malformed or non-finite adapter data and remains finite and bounded; only a
durably uploaded/stored result reaches exactly 100 and `Finish`.

Move controllers and DTOs to API while preserving guards, multipart validation, the 100-megabyte limit, `202`, `404`,
and `text/csv`. Move Bull registration, parent worker, flow creation, waiting-children mechanics, serialization, and
job lookup to infrastructure. The worker loads state, invokes one application transition, performs requested effects
through ports, records authoritative evidence, and stops safely on ambiguity.

Move multer-S3 configuration, input mapping, CSV parsing/stringifying, `derive-results-key`,
`parse-s3-result-location`, result upload, and result streaming to storage infrastructure. Inject the shared
`CustomerObjectWriteSecurity` token into both writers and map it to exact AWS request fields. Keep HTTPS validation,
SSE-KMS algorithm/key ID, `no-store`, bucket, organization path, stored URI, and failure-before-finish semantics.

Recompose batch over plans 11, 14, and 15. Remove old delivery folders and duplicate registrations only after
compatibility tests pass. Keep the top-level barrel module-only. Update docs and run the shrink-only baseline command;
the repository scan must contain no email-verification violation.

## Interfaces and Dependencies

External contracts remain multipart `POST /verifyBatch/csv` returning `202`, owned `GET /verifyBatch/:id`, and owned
`GET /verifyBatch/:id/results` returning `text/csv`. Queue `batch-email-verification`, its step/data contract, async
child contract, retry/waiting/progress semantics, S3 rules, and configuration remain exact.

New internal ports represent batch jobs/transitions, async child flows, uploaded input, durable result output, and
result streams with application values only. Infrastructure consumes the plan-15 async queue contract and privacy
plan 06 `CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN`. Application/domain imports no Nest, BullMQ, Redis, multer, AWS/S3,
Node provider stream, HTTP DTO, or TypeORM implementation.

## Acceptance Criteria

- The recorded projection is below 1,000 non-documentation additions plus deletions, or this plan has been replaced
  by the mandated state-machine/adapter-relocation split before production edits.
- Batch HTTP lives under API, transition/ownership/idempotency logic under application, and Bull/CSV/S3 mechanisms
  under infrastructure.
- Upload/status/results retain permissions, schemas, `202`, `404` concealment, `text/csv`, 100-megabyte limit, and
  organization ownership.
- Queue names/data/options, parent/child topology, state names, waiting-children, retries, and async-child compatibility
  remain exact.
- Each accepted row is debited once and creates one child; retries/crashes cannot duplicate debit, child, or result.
- Progress is finite and between zero and 100 for zero, partial, malformed, and complete states; only durable
  completion reports `Finish` and exactly 100.
- Both object writers use the same production HTTPS, SSE-KMS algorithm/key ID, and `no-store` contract; upload or
  stream failure never produces false completion.
- Application/domain code imports no framework, BullMQ, Redis, multer, S3/AWS, provider stream, HTTP DTO, or ORM.
- Final composition exports only `EmailVerificationModule` and no email-verification baseline key remains.
- Focused, Redis/S3, batch Bruno, architecture, full-suite, build, docs, and diff checks pass.

## Validation

Before production edits, record the projection and require it below 1,000. Compare final actual modifications with:

    git fetch origin master
    git diff --numstat -M origin/master...HEAD | awk '$3 !~ /\.md$/ && $3 != "pnpm-lock.yaml" { additions += $1; deletions += $2 } END { print additions + deletions }'

If the projection or actual result reaches 1,000, apply the mandatory split and validate both plans separately.

Run focused and adapter tests:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/api/http/batch-verification src/libs/modules/email-verification/src/application/delivery/batch src/libs/modules/email-verification/src/infrastructure/queues/batch-verification src/libs/modules/email-verification/src/infrastructure/storage/batch-verification --runInBand
    TEST_REDIS_URL=redis://localhost:56379 TEST_S3_ENDPOINT=http://localhost:59000 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- batch-email-verification-workflow.integration.spec.ts batch-email-verification-storage.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Focused tests must exercise every state/effect replay boundary, both crash orderings, all progress cases, foreign
ownership, exact async child data, both storage writers, and production security rejection. Inspect the baseline diff
and require every removed key to be an existing email-verification key with no replacement.

Before Docker use, inspect `lef-api-1` ownership. Against an owned disposable stack, fetch the documented short-lived
service-client secret and run:

    cd bruno/batch-verification
    npx @usebruno/cli run --env local --sandbox developer

Require accepted upload, polling within the existing 30 attempts, finite bounded progress, durable completion,
downloaded email-column equality, an existing encrypted result object, and healthy API after the run.

Finish from the repository root:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/batch-verification/README.md .agents/plans/module-architecture/16-layer-batch-email-verification.md
    git diff --check

Bruno: update only stale source and fixture-configuration references, then require the existing batch collection to pass in full.

## Idempotence and Recovery

Extract and test the state machine before moving adapters. Move one external mechanism at a time and keep one parent
worker and registration. Every transition reads authoritative evidence before effects and records completion before
advancing. On ambiguous external state, stop and investigate; never retry a non-idempotent debit, child creation, or
upload from an in-memory assumption.

Use isolated queues/buckets or an owned disposable stack. After confirming ownership, recover with
`pnpm dev:reset -- --confirm-project=LEF`; never delete another checkout's jobs or objects. No migration or production
queue/object recovery exists. Preserve unrelated changes.

## Artifacts and Notes

Record the per-path projection and actual count, state/effect/replay table, port/adapter map, queue compatibility and
progress results, storage-security assertions, removed baseline keys, Bruno totals, sanitized object location, and
full validation. Do not record credentials, tokens, raw customer CSV data, addresses outside fixtures, job payloads,
S3 secrets, or provider/SMTP payloads.

## Plan readiness

Ready after the binding size projection confirms fewer than 1,000 non-documentation additions plus deletions; otherwise replace this plan with the mandated split ExecPlans.
