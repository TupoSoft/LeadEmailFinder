# Layer Asynchronous Email Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move asynchronous verification enqueue/status HTTP behavior, application orchestration, and the BullMQ worker into
their architectural layers without changing the queue protocol. A developer can enqueue one organization-owned job,
observe the same `202` response and bounded status mapping, watch a thin worker invoke the plan-14 verification
composition, and prove that a foreign organization still sees the job as not found.

## Progress

- [ ] (2026-08-30) Characterize async HTTP, credit, queue data/options, ownership, status, retry, and worker behavior.
- [ ] (2026-08-30) Move enqueue/status controllers and DTOs to API and orchestration to application.
- [ ] (2026-08-30) Implement the async job port and thin BullMQ producer/status/worker adapters.
- [ ] (2026-08-30) Recompose the async slice and shrink only its architecture-baseline keys.
- [ ] (2026-08-30) Complete focused, Redis/Bull, HTTP, architecture, full, and documentation validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/14`

## Surprises & Discoveries

- `async-email-verification/` currently mixes controller/DTOs, a job-data contract, service interface and
  implementation, queue constants, Bull worker, Nest module, and HTTP exceptions.
- Batch verification creates children on the same `async-email-verification` queue, so its serialized job contract
  is an integration boundary even before plan 16 layers the batch parent.

## Decision Log

- Decision: Put enqueue and owned-status commands under `src/application/delivery/async/` behind a narrow
  `AsyncVerificationJobs` port.
  Rationale: Job ownership and application status meaning are business orchestration; Bull lookup and serialization
  are infrastructure.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Put `POST /verifyAsync` and `GET /verifyAsync/:id` controllers/DTOs/error translation under
  `src/api/http/asynchronous-verification/`.
  Rationale: Validation, guards, principal translation, and HTTP responses belong at the inbound adapter.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Put queue registration, producer, lookup, status mapping inputs, custom backoff, and worker under
  `src/infrastructure/queues/async-verification/`; the worker only maps job data to the plan-14 command and returns
  its result.
  Rationale: BullMQ mechanics must not own verification policy or organization authorization.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve queue name, job names and serialized data, attempts, custom backoff, returned ID, status/progress
  mapping, temporary `greylist` behavior, retry/failure semantics, and batch-child compatibility.
  Rationale: Existing queued jobs and the batch parent depend on these exact contracts.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve `verification:run` plus one `CreditGuard` debit on enqueue and `verification:read` on status.
  Foreign and missing jobs remain indistinguishable `404` responses.
  Rationale: Moving ownership checks cannot expose queue existence or change billing.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Plans 11 and 15 can run in parallel after plan 14, but neither may edit the other's API/application
  registration.
  Rationale: Their routes and adapters are disjoint and converge only in the final workflow composition from plan 16.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`async-email-verification/async-email-verification.controller.ts` accepts enqueue and status requests.
`async-email-verification-service-impl.service.ts` talks directly to BullMQ, and
`async-email-verification.processor.ts` invokes verification for queued job data. The literal queue name is
`async-email-verification`; queue options include five attempts and the existing custom backoff. Job data carries
organization and credential identity used by both direct async submissions and batch-created children.

Plan 14 supplies the final core and network composition. Plan 03 supplies authentication/principal contracts and
plan 04 supplies credit enforcement. The worker must pass scalar organization identity to application, preserve the
PII-safe logging established transitively by the privacy prerequisites, and never authorize from a caller-controlled
job lookup alone.

## Scope and Non-Goals

Layer async enqueue/status HTTP, application commands and errors, the queue port, Bull producer/lookup/worker,
internal composition, and owned tests. Update the module README and remove only async architecture-baseline entries.

Do not change synchronous routes, batch HTTP/workflow/storage, core verification, discovery, SMTP/proxy, credits
price, permissions, queue name/data/options, retries/backoff, job IDs, status schemas, organization concealment,
configuration, or public exports. Do not drain/convert queues, add migrations, backfills, new endpoints, production
rollout, or recovery mechanisms.

## Plan of Work

Record the current queue contract byte-for-byte and characterize enqueue, successful/failed/active/delayed/waiting
status, greylist retry, exhausted failure, missing/foreign concealment, and one-credit behavior. Add a compatibility
fixture that deserializes existing async and batch-child job data through the relocated worker.

Define application commands for enqueue and owned status. `AsyncVerificationJobs` exposes only purpose-specific
operations and transport-neutral records. The application service requires organization identity on every lookup
and converts infrastructure state to the existing public status result without importing Bull types.

Move controllers and DTOs to API. Keep authentication, permissions, `CreditGuard`, `CurrentPrincipal`, request
validation, response mapping, `202`, and `404` there. Move Bull registration, queue calls, serialized job mapping,
custom backoff, and the worker to infrastructure. The worker invokes the plan-14 verification application port and
contains no verification, credit, or authorization policy.

Recompose the async module with one queue registration and one worker. Preserve the compatibility token used by the
still-legacy batch parent until plan 16 replaces it. Update source references and shrink only async baseline entries;
current synchronous and batch entries remain untouched. Deprecated-route code, if still present, belongs to
`legacy-retirement/01`; this plan must not restore retired code or baseline entries.

## Interfaces and Dependencies

External HTTP contracts remain `POST /verifyAsync` returning `202` and owned `GET /verifyAsync/:id`, with existing
request/response schemas, permissions, credit effects, and `404` concealment. Queue name, job ID, serialized fields,
attempt count, backoff, and result/failure representation remain exact.

The new internal `AsyncVerificationJobs` port accepts application records and is implemented by Bull infrastructure.
The worker consumes the verification command from plan 14. API imports only the public auth and credits boundaries from
plans 03 and 04. No public TypeScript, database, provider, SMTP, or S3 contract changes.

## Acceptance Criteria

- Async controllers/DTOs live under API; enqueue/status orchestration is framework-independent; all Bull code lives
  under infrastructure.
- Enqueue retains `verification:run`, one debit, the same `202` body, queue data, attempts, and backoff.
- Status retains `verification:read`, caller-organization ownership, all state/result mappings, and indistinguishable
  `404` for missing and foreign jobs.
- The worker accepts existing direct and batch-child job payloads, invokes one plan-14 verification command, and
  preserves greylist retry, failure, and completion behavior.
- Retries or duplicate status reads do not enqueue, debit, or verify again; worker retries follow existing Bull
  semantics and do not alter job identity.
- Logs and errors contain no address, raw job payload, credential, SMTP/provider payload, or external message.
- No async application/domain file imports Nest, BullMQ, Redis, HTTP DTOs, guards, or queue implementations.
- Current synchronous and batch code remains behaviorally unchanged; only async baseline keys disappear. This plan
  does not restore deprecated-route code or baseline entries removed by `legacy-retirement/01`.
- Focused, real Redis/Bull, HTTP, architecture, full-suite, build, docs, and diff checks pass.

## Validation

Run focused and adapter integration suites:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/api/http/asynchronous-verification src/libs/modules/email-verification/src/application/delivery/async src/libs/modules/email-verification/src/infrastructure/queues/async-verification --runInBand
    TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- async-email-verification-queue.integration.spec.ts async-email-verification-http.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

The Redis/Bull suite must prove serialized compatibility for direct and batch-child jobs, both ownership lookup
orderings, greylist retry, exhausted failure, one worker completion, and no duplicate debit/enqueue. Inspect the
baseline diff and reject non-async changes.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/15-layer-async-email-verification.md
    git diff --check

Bruno: no collection change is required because the HTTP and queue contracts are unchanged; the existing batch collection in plan 16
collection will exercise the relocated async worker as a child-job integration.

## Idempotence and Recovery

Add the queue port and compatibility tests before moving the producer/worker. Maintain one queue registration and one
worker at every runnable checkpoint. If interrupted, complete one adapter move rather than registering both versions
or changing the queue name. Baseline shrink is repeatable and must never rename a key.

Use an isolated test queue prefix or an owned disposable local stack. After confirming Compose ownership, clear only
the test queue through the repository reset workflow; never drain another checkout's jobs. No schema or production
queue migration exists. Preserve unrelated changes.

## Artifacts and Notes

Record the HTTP and queue contract table, serialized compatibility fixture version, focused and Redis/Bull totals,
ownership/retry observations, removed baseline keys, and full validation. Do not record tokens, credentials, raw
addresses, raw job payloads, SMTP transcripts, or provider results.

## Plan readiness

Ready to implement
