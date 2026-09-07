# Layer Asynchronous Email Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move asynchronous verification enqueue/status HTTP behavior, application orchestration, and the BullMQ worker into
their architectural layers without changing the queue protocol. A developer can enqueue one organization-owned job,
observe the same `202` response and bounded status mapping, watch a thin worker invoke the plan-14 verification
composition, and prove that a foreign organization still sees the job as not found.

## Progress

- [x] (2026-09-07) Characterize async HTTP, credit, queue data/options, ownership, status, retry, and worker behavior.
- [x] (2026-09-07) Move enqueue/status controllers and DTOs to API and orchestration to application.
- [x] (2026-09-07) Implement the async job port and thin BullMQ producer/status/worker adapters.
- [x] (2026-09-07) Recompose the async slice and shrink only its architecture-baseline keys.
- [x] (2026-09-07) Complete focused, Redis/Bull, HTTP, architecture, full, documentation, and live SMTP fixture validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/14`

## Surprises & Discoveries

- Two full-suite attempts exposed a preexisting assertion that required concurrent child HTTP requests to reach
  the domain-synonym fixture in a fixed order. The adapter uses `Promise.allSettled`; the test now requires the
  homepage first, then one request per child, while allowing concurrent arrival order. Production code
  is unchanged by this validation repair.

- The starting revision `72a5a259100eb78894b49a6731841257e041e2ce` includes completed prerequisites and
  synchronous delivery from plan 11. Issue #460 was already assigned and In Progress.
- The legacy batch module separately registers the async queue without retry defaults. Direct async submissions
  inherit five attempts and custom backoff; changing the batch registration would change existing child retries.
- `bruno/smtp-dev` already covers async submission and completion. The relocated integration wiring warrants
  extending that collection with credit and rejection assertions.
- Another checkout owns the running SMTP fixture, including its fixed subnet. Validation uses a new disposable
  Redis instance initially. Live SMTP validation later used an isolated Compose project with temporary subnet
  remapping, then restored the fixture configuration.

- `async-email-verification/` currently mixes controller/DTOs, a job-data contract, service interface and
  implementation, queue constants, Bull worker, Nest module, and HTTP exceptions.
- Batch verification creates children on the same `async-email-verification` queue, so its serialized job contract
  is an integration boundary even before plan 16 layers the batch parent.

## Decision Log

- Decision: Merge master commit `1d3e827` and retain both the completed async composition decisions and the new
  `legacy-retirement/01` ownership rule.
  Rationale: The conflict concerns plan wording only. Independent batch retry defaults remain preserved, and future
  deprecated-route retirement must not be reversed by this plan. Existing implementation and SMTP evidence remain
  unchanged.
  Date/Author: 2026-09-07, Codex conflict resolution.

- Decision: Validate SMTP in the separate `lef460a1ee` Compose project, with temporary network remapping from
  `172.28.0.0/24` to `172.29.46.0/24` in the overlay, DNS zone, and proxy configuration.
  Rationale: Another checkout owns the default subnet and ports. A separate project with matching DNS and proxy
  addresses preserves the fixture protocol while allowing the standard ownership-checked Bruno launcher to run.
  The temporary configuration is restored after the test stack is removed.
  Date/Author: 2026-09-07, Codex validation.

- Decision: Include a focused correction to the domain-synonym HTTP integration test's ordering assertion.
  Rationale: It blocked the required full-suite gate twice by treating concurrent request order as a contract.
  The revised assertion retains exact request counts and the homepage prerequisite without changing behavior.
  Date/Author: 2026-09-07, Codex implementation.

- Decision: Keep the independent legacy batch producer registration and one producer and worker in the async
  slice. Register the async controller in the root; export its application token from infrastructure composition.
  Rationale: Infrastructure cannot import API code, and consolidating producers would change batch retry defaults.
  Final batch composition remains in plan 16.
  Date/Author: 2026-09-07, Codex implementation.
- Decision: Return organization identity and a deferred status reader for one captured job from the queue port.
  Rationale: The application checks ownership before requesting state or results without exposing Bull types or
  performing another lookup that could observe a different job.
  Date/Author: 2026-09-07, Codex implementation.

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

The API, application, queue adapter, worker, and composition are implemented. All 13 async architecture-baseline
entries are removed; the remaining 20 entries are unchanged. The public module barrel and queue/HTTP contracts
remain unchanged. The legacy batch producer registration remains separate to preserve its existing defaults.

Focused API/application tests passed: 3 suites and 52 tests. Bull adapter and worker tests passed: 4 suites and
30 tests, including six real Redis/Bull cases. The production Nest composition test also passed, proving one
registered worker completion and one debit across enqueue and repeated polling. The captured trace integration
passed all four checks. Final validation passed:

- `TEST_REDIS_URL=redis://127.0.0.1:32770 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci`: 209 Jest
  suites and 1,990 tests passed; 11 suites and 65 tests requiring other external fixtures were skipped. The
  subsequent OIDC/Bruno runner stage passed 32 tests.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck`: passed.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint`: passed with one existing return-type warning in
  `src/libs/config/src/load-secrets.spec.ts`.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build`: passed; 608 files compiled.
- `corepack pnpm architecture:baseline` and `corepack pnpm architecture:check`: passed; only 13 async keys removed.
- `corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/15-layer-async-email-verification.md bruno/smtp-dev/README.md`: Harper passed after correcting prose findings.
- `git diff --check`: passed.

The Redis suites used version-1 serialized direct and batch-child fixtures, tested both organization lookup
orders, and proved completion, delay, exhaustion, stable job identity, and no repeated enqueue. Tests check exact
production backoff values separately; only the integration test delay is accelerated. The production composition
suite uses the real Nest Bull module, queue adapter, and worker, with the verification core and credit storage
stubbed. It is queue/composition evidence rather than a live SMTP or database acceptance claim.

Bruno coverage is extended to 28 requests. The installed Bruno parser accepted all 28 request files and their
35 scripts compiled; the launcher suite passed 8 tests. Live SMTP validation subsequently passed on 2026-09-07:
`COMPOSE_PROJECT_NAME=lef460a1ee corepack pnpm bruno:smtp-dev` executed all 28 requests and 57 tests with no skips.
The launcher confirmed ownership of every required container and ran Bruno 4.1.0 inside this checkout's API.

Before Bruno populated the SMTP cache, two fresh async jobs proved the complete worker and SMTP path. The trusted
fixture produced `accepted_email` with new `secureTransport=true` evidence. Its command sequence was
`ehlo`, `starttls`, `ehlo`, `mail_from`, `rcpt_to`, `quit`. The plaintext fixture produced
`secure_transport_unavailable` with `secureTransport=false` and only `ehlo`; no envelope command was sent. Each job
completed once on attempt 1, created one owned result, debited one credit, and returned the same result on repeated
polling. Both the submitted address cache and the fixed catch-all probe cache were absent before their phase.
The generated address and probe address, plus the service secret, were absent from captured API logs.

Mailpit accepts the catch-all probe, so the trusted result retains the existing `catchAll=true`, `exists=null`
semantics. A fresh local part alone would not force another SMTP connection after the shared probe was cached.
The proof ran before the collection to establish fresh transport evidence without deleting cache rows.
These are deterministic local SMTP fixture results, not live-provider deliverability claims.

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

Recompose the async slice with one producer registration and one worker. Preserve the independent legacy batch
producer registration and internal verification compatibility token until plan 16 finishes delivery composition.
Update source references and shrink only async baseline entries; current synchronous and batch entries remain
untouched. Deprecated-route code, if still present, belongs to `legacy-retirement/01`; this plan must not restore
retired code or baseline entries.

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

Bruno: extend `bruno/smtp-dev` with credit, repeated polling, missing-job, validation, authentication, and
insufficient-credit checks. Run `corepack pnpm bruno:smtp-dev` against a stack owned by this checkout. If unavailable,
record static validation separately from live SMTP execution.

## Idempotence and Recovery

Add the queue port and compatibility tests before moving the producer/worker. Maintain one async producer registration and one
worker at every runnable checkpoint, plus the unchanged legacy batch producer registration. If interrupted, complete one adapter move rather than registering both versions
or changing the queue name. Baseline shrink is repeatable and must never rename a key.

Use an isolated test queue prefix or an owned disposable local stack. After confirming Compose ownership, clear only
the test queue through the repository reset workflow; never drain another checkout's jobs. No schema or production
queue migration exists. Preserve unrelated changes.

## Artifacts and Notes

The compatibility contract is:

| Surface | Preserved behavior |
| --- | --- |
| Enqueue | `POST /verifyAsync`, `verification:run`, one debit, `202` with `{ id }` |
| Status | `GET /verifyAsync/:id`, `verification:read`, UUID validation, identical missing and foreign `404` |
| Direct payload | `email`, `organizationId`, `credentialId` |
| Batch payload | Existing direct fields plus `batchId` and optional `format` |
| Queue and job name | `async-email-verification` |
| Direct options | UUID `jobId`, five attempts, custom backoff |
| Batch options | Existing UUID and parent association, no added attempt or backoff defaults |
| Backoff | Greylist: attempt number times 60 seconds; other errors: 10 seconds |
| Status body | Existing state enum, result only when completed, no progress field |
| Worker | One organization-scoped command per attempt, without credential identity |

The live fixture used application commit `7d297f79b650ffd9c86f5706c3b0fd5fff6bbd44`, Node 24.20.0, and Bruno
4.1.0. Its public ports were web `53160`, Keycloak `58060`, PostgreSQL `55460`, Redis `56360`, and Garage `59060`.
Only the standard Keycloak provisioning and platform credential bootstrap were needed; TypeORM synchronized the
new disposable database. The existing stack belonging to another checkout remained running.

Sanitized fresh-job evidence from 2026-09-07, 10:11:31–10:11:32 UTC:

| Phase | Job ID | Verification ID | Duration |
| --- | --- | --- | --- |
| Trusted TLS | `cdc89f38-0b42-4166-b610-55a4487504f0` | `ed20921c-86b6-479f-85c4-17caea992484` | 379 milliseconds |
| Plaintext rejection | `5894d20b-e138-43dd-b468-2c75aef1fa98` | `8d1a7836-8853-4ceb-a6ed-1dc53339fcc3` | 332 milliseconds |

The temporary proof runner queried only the owned rows, sent credentials through process memory, and emitted
counts, booleans, stable reason codes, timestamps, and opaque identifiers. Full addresses, raw queue data, tokens,
credentials, and SMTP transcripts are intentionally absent from this plan.

## Plan readiness

Ready to implement
