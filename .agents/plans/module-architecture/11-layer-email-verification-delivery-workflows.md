# Layer Email-Verification Delivery Workflows

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Finish the email-verification module's architecture by separating synchronous, deprecated synchronous,
asynchronous, and CSV-batch delivery from their use cases and BullMQ/S3/TypeORM adapters. All seven existing HTTP
operations, both queue protocols, credit effects, ownership rules, progress semantics, and durable result behavior
remain unchanged. A developer can observe the result through a clean module tree and architecture report, focused
use-case/adapter tests, and successful SMTP and batch Bruno workflows against the real Compose wiring.

## Progress

- [ ] (2026-08-29) Characterize all sync, deprecated-sync, async, and batch HTTP, queue, credit, ownership, and recovery contracts.
- [ ] (2026-08-29) Move controllers and DTOs to API and move orchestration into framework-independent application use cases.
- [ ] (2026-08-29) Move BullMQ processors/queues, upload/result storage, and delivery persistence behind infrastructure ports.
- [ ] (2026-08-29) Recompose `EmailVerificationModule` while preserving queue data, job state, and public behavior.
- [ ] (2026-08-29) Remove the remaining module violations and complete focused, runtime, Bruno, and full validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/10`

## Surprises & Discoveries

- Each delivery folder currently contains a vertical mix of controllers, DTOs, Nest modules, services, injection
  tokens, BullMQ processors, queue job data, and persistence access. Moving a folder intact would preserve the
  architecture violation under a new name.
- `BatchEmailVerificationProcessor` is both a BullMQ worker and the durable workflow coordinator. It injects the
  async queue and the `EmailVerification` TypeORM repository while advancing the
  `Validate -> Process -> WaitForChildren -> UploadResults -> Finish` state machine.
- Batch completion already waits for both the child work and S3 upload, and progress is bounded from zero through 100. Those reliability behaviors came from completed plans and are stronger than a simple folder move.
- The deprecated `GET /verify` uses the same central verification service and credit policy as `POST /verify`, but
  adapts its response through `Automapper`. It must remain a delivery adapter, not fork into a second use case.

## Decision Log

- Decision: Put Nest HTTP controllers, request/response DTOs, response serialization, validation decorators, guards,
  and HTTP error translation under `src/api/http/`, grouped by sync, deprecated-sync, async, and batch endpoints.
  Rationale: These are inbound HTTP adapters; the application layer should receive validated commands and return
  transport-neutral results.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Put sync verification, async enqueue/status, batch enqueue/status/result retrieval, and batch workflow
  transitions under `src/application/`. Depend on the plan-10 verification core plus narrow queue, job, upload,
  result, and credit ports.
  Rationale: Use cases own ordering, authorization-independent ownership decisions, idempotency, and recovery;
  BullMQ and S3 APIs are mechanisms.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep BullMQ queue registration, producers, workers/processors, job serialization, `backoff` mapping, flow
  creation, and job lookup under `src/infrastructure/queues/`. Workers adapt a Bull job into an application command
  and persist its returned transition rather than containing business policy.
  Rationale: BullMQ classes and decorators are framework-specific infrastructure, but the job state machine remains
  application behavior testable without Redis.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep multer-S3 upload setup, S3 result writing/streaming, result-location parsing, and CSV stream
  conversion under `src/infrastructure/storage/`; expose only purpose-specific upload/result ports upward.
  Rationale: Bucket clients, multipart configuration, and object keys are storage adapters. Durable-completion and
  result-availability rules belong to the application workflow.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve queue names, job names/data, attempts, custom backoff, parent-child topology, progress, S3 key
  derivation, stored `s3://` location, ownership checks, and failure/retry semantics byte-for-byte where possible.
  Rationale: Existing queued jobs and repeatable local fixtures depend on these contracts; architecture does not
  authorize a queue protocol redesign.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Implement deprecated sync as an API mapper over the same sync application use case and credit path.
  Rationale: One use case guarantees current and deprecated endpoints remain permission- and billing-equivalent.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the existing tables through TypeORM synchronization and add no migration, backfill, queue drain,
  or production rollout procedure.
  Rationale: No schema or protocol change is intended, and development data/queues are disposable.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 10 leaves four delivery folders in place after extracting the pure verification core and its persistence/network
adapters. `sync-email-verification/` exposes `POST /verify`; `old-sync-email-verification/` exposes the deprecated
`GET /verify`; `async-email-verification/` exposes enqueue/status endpoints and the
`async-email-verification` worker; and `batch-email-verification/` exposes multipart upload, status, and result
download endpoints plus the `batch-email-verification` parent workflow.

The current routes are protected through public auth guards and permissions from plan 03. Sync, deprecated sync, and
async enqueue each consume one credit through the credits module contract delivered by plan 04. Batch validation
debits once per accepted CSV row inside its durable workflow. All jobs are organization-owned: polling or downloading
another organization's job appears not found. Batch processing creates one async child per row, waits for children,
writes a CSV result to S3, stores its result location, then reports completion.

Plan 10 supplies the pure verification use case and private email/domain/verification/SMTP adapters. This plan must
consume those ports rather than reopen them. The checker from plan 01 still permits exact delivery debt in
`scripts/architecture/module-architecture-baseline.json`; this plan removes the final email-verification keys so plan
12 can retire the baseline globally.

## Scope and Non-Goals

Relocate and refactor the four delivery workflows into `api/http`, `application`, and infrastructure queue/storage
areas. Define job, upload, result, and credit ports; preserve DTO mapping and errors; recompose internal Nest modules;
move tests with their owners; update module and Bruno documentation; and remove the remaining email-verification
architecture baseline entries.

Do not change verification algorithms or the plan-10 core. Preserve HTTP paths, methods, statuses, bodies,
permissions, and credit prices. Also preserve queue names and job data, retry and `backoff` policy, batch file limits,
CSV columns, progress calculations, ownership semantics, S3 bucket/key/location rules, database schema, provider
wiring, configuration keys, and the top-level public barrel. Do not add migrations, backfills, production queue
migration, high availability, rollout, or recovery work.

## Plan of Work

Start with an explicit contract table for every endpoint and job transition. Extend characterization tests for sync
success/domain rejection, deprecated mapping and equal billing, async enqueue/status/`greylist`/not-found/ownership,
batch validation/fan-out/wait/upload/finish, bounded progress, result streaming, and each retry boundary. Capture
queue options and serialized job data before moving files.

Move HTTP controllers and DTOs under `api/http/{sync,deprecated-sync,async,batch}/`. Keep authentication and credit
guards at the same entry points and translate application errors to the same status codes. Keep `Automapper` or an
explicit transport mapper in API only; deprecated output must derive from the same core result as current sync.

Under `application/`, expose a sync command that calls the plan-10 verification core, async commands for enqueue and
owned status, and batch commands for upload registration, owned status, result retrieval, and workflow transitions.
Define small ports for async jobs, batch jobs/flows, uploaded input, durable result output, result streams, and credit
debit. Application tests use deterministic fakes and cover both concurrency orderings and replay/failure boundaries.
No application or domain file may import Nest, BullMQ, Redis, TypeORM, multer, S3, Node streams tied to a provider,
or transport DTOs.

Under `infrastructure/queues/`, implement ports with BullMQ `Queue`, `FlowProducer`, and processors. Keep the literal
`async-email-verification` and `batch-email-verification` names, attempts, backoff, ownership fields, parent/child job
IDs, and progress values. Make processors thin adapters over application transitions while preserving Bull's
`moveToWaitingChildren`, retry, failure, and completion requirements.

Under `infrastructure/storage/`, move multer-S3 configuration, uploaded-file mapping, CSV parsing/stringifying, S3
result upload, `derive-results-key`, `parse-s3-result-location`, and result streaming. Keep the 100-megabyte multipart
limit, organization-scoped upload path, `/uploads/` to `/results/` transformation, stored URI format, content type,
and failure-before-finish behavior. Keep any delivery-specific TypeORM implementation private under infrastructure;
reuse the plan-10 verification store port instead of injecting its entity repository.

Recompose `EmailVerificationModule` from internal API/application/infrastructure modules without exporting their
implementation. Update internal imports to public auth, credits, proxy, and identity barrels only. Update
`src/libs/modules/email-verification/README.md`, `bruno/smtp-dev/README.md`, and
`bruno/batch-verification/README.md` only where source or setup references changed. Run the shrink-only baseline
update after no email-verification violation remains; never transfer a violation key to a new path.

## Interfaces and Dependencies

The following external contracts remain exact:

- `POST /verify` and deprecated `GET /verify` with `verification:run` and one credit;
- `POST /verifyAsync` returning `202`, and owned `GET /verifyAsync/:id`;
- multipart `POST /verifyBatch/csv` returning `202`, owned `GET /verifyBatch/:id`, and
  `GET /verifyBatch/:id/results` returning `text/csv`;
- queue names `async-email-verification` and `batch-email-verification`, their existing job data, attempts, backoff,
  parent/child topology, and progress;
- existing `S3_BUCKET`, upload/result key rules, and stored result location;
- The top-level `EmailVerificationModule` as the only public TypeScript export.

New internal ports represent async/batch job operations, workflow transitions, upload/result storage, and credits.
They accept application commands and records, never Bull jobs, S3 responses, TypeORM entities, Express/multer
objects, or HTTP DTOs. The plan depends on the public auth composition from plan 03, credits contract from plan 04,
and verification core from plan 10.

## Acceptance Criteria

- All four delivery workflows have controllers/DTOs in API, framework-independent orchestration in application, and
  BullMQ/S3/TypeORM implementation in infrastructure.
- Application and domain files import no Nest, BullMQ, Redis, TypeORM, multer, S3, provider stream, controller, or DTO
  implementation.
- Current and deprecated sync routes use the same verification command and retain the same permission, credit,
  mapping, response, error, and `402` behavior.
- Async enqueue returns the same `202` body, uses the same queue options, and reports only caller-owned job state;
  missing or foreign jobs retain the same not-found response.
- Batch upload retains validation and the 100-megabyte limit, creates the same parent/child topology, debits once per
  validated row, and never reports `Finish` before all children and durable S3 upload succeed.
- Deterministic status/progress tests prove zero-child, partial, and completed states are always finite and bounded
  from zero through 100, with completion exactly 100. Result download returns the same CSV columns/content type only
  to the owning organization.
- Queue retries, temporary SMTP deferrals, waiting-children transitions, processor failure, S3 failure, and result-stream failure
  preserve their existing retry/recovery behavior without duplicate jobs, debits, or uploads.
- Queue names/data, S3 keys/locations, database schema, HTTP surface, configuration, and top-level public barrel are
  unchanged.
- Focused contract tests exercise fake and real Bull/S3 boundaries where available; SMTP and batch Bruno collections
  pass against the Compose services.
- `corepack pnpm architecture:baseline` removes every remaining email-verification key without adding or renaming a
  key, and `corepack pnpm architecture:check` passes.
- TypeScript, lint, the full Jest suite, build, documentation lint, runtime health, and diff checks pass.

## Validation

Run the focused use-case, controller, processor, storage, and core regression suites:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/api src/libs/modules/email-verification/src/application src/libs/modules/email-verification/src/infrastructure src/libs/modules/email-verification/src/domain --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- old-sync-email-verification-http.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Focused coverage must include the existing async controller/service cases and batch controller, processor, service,
key-derivation, result-location, and multer factory cases after relocation. Add port contract tests for Bull job
ownership and storage success/failure/retry behavior. Add deterministic progress cases for zero children, partial
completion, complete children, and malformed/non-finite adapter input. Inspect the baseline diff and reject any new
or path-renamed key.

Before starting Docker, inspect `lef-api-1` ownership and do not tear down a stack from another checkout. For an
owned disposable project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'

Run the exact container-network `bruno/smtp-dev` command from its README with the internal Keycloak issuer and
`baseUrl=http://api:3000`; require all DNS/proxy/SMTP, proxy drain/restore, deprecated credit, and zero-balance
requests to pass. Fetch the customer service-client secret as documented by `bruno/batch-verification/README.md`,
then run:

    cd bruno/batch-verification
    npx @usebruno/cli run --env local --sandbox developer

Require CSV upload, polling bounded to the collection's existing 30 attempts, the collection's observed progress
sample to be finite and within zero through 100, durable completion, and downloaded email-column equality. The
focused tests—not this single sampled request—prove every progress state and exact completion. Return to the
repository root and confirm the batch result object exists before cleanup. Update the collections only if relocation
makes a source or setup reference stale; their behavioral assertions remain mandatory.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md bruno/batch-verification/README.md .agents/plans/module-architecture/11-layer-email-verification-delivery-workflows.md
    git diff --check

Bruno: update only stale wiring or setup references, then require both existing collections to pass in full.

## Idempotence and Recovery

Characterize queue/storage contracts before moving them and rewire one workflow at a time. File moves, provider
bindings, and baseline shrink are deterministic. If interrupted, use `git status`, queue contract fixtures, and the
architecture report to identify the incomplete boundary; never recover by deep-importing the old folder or adding a
baseline key. Preserve unrelated user edits.

Development queues, objects, and database rows are disposable. After confirming Compose ownership, use
`pnpm dev:reset -- --confirm-project=LEF` to clear and reseed a failed partial run. A failed batch is retried through
its existing job/recovery path; do not mark it finished manually or upload a result outside the application port.
Restore the SMTP fixture proxy through its documented cleanup/reconcile command. No migration, queue conversion, or
production recovery step exists.

## Artifacts and Notes

Record the endpoint/job contract table, final layer tree, queue, and storage port list, removed baseline keys, focused
test totals, SMTP and batch Bruno totals, bounded progress observations, sanitized S3 result location, runtime health,
and full validation. Do not record access tokens, service-client secrets, raw customer CSV data, S3 credentials, or
provider payloads.

## Plan readiness

Ready to implement.
