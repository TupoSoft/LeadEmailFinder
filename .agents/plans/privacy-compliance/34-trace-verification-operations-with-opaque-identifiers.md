# Trace Verification Operations with Opaque Identifiers

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make an email-verification attempt easy to diagnose without putting the submitted address or derived DNS data into
logs. After this change, every HTTP response returns a server-generated request UUID. Every queued operation retains
its existing job or batch UUID, and every completed verification exposes its persisted verification UUID. Structured
lifecycle events link those opaque identifiers to safe reason and failure-stage codes. A caller can give Support a
request, job, batch, or verification ID. An authorized principal can resolve a verification ID through the
organization-owned application record, while ordinary log access alone cannot reveal the address.

A developer can submit a unique sentinel address through synchronous, deprecated synchronous, asynchronous, and batch
entry points. The developer captures the response headers, bodies, queue jobs, persisted results, and JSON logs, then
follows the opaque ID chain to the final reason. The captured evidence proves that no log event contains the sentinel,
its local part, domain, MX host, SMTP text, provider payload, credentials, or inbound request ID.

## Progress

- [ ] (2026-09-03) Characterize current request, job, batch, verification-result, response, and logging contracts.
- [ ] (2026-09-03) Return the authoritative server request ID on every HTTP response and reject caller-controlled
      correlation.
- [ ] (2026-09-03) Add the verification trace observer and propagate safe identifiers through sync, async, and batch
      orchestration.
- [ ] (2026-09-03) Expose persisted verification IDs and add an organization-owned read-by-ID operation.
- [ ] (2026-09-03) Add captured-log, authorization, HTTP, queue, persistence, Bruno, documentation, and full-suite
      validation.

## Plan dependencies

- `privacy-compliance/03`
- `privacy-compliance/04`

## Surprises & Discoveries

- Discovery: the PII-safe Pino configuration generates and logs a request UUID but never returns it to the caller or
  passes it to verification orchestration.
  Evidence: `src/lead-email-finder-api/src/pii-safe-logger-options.ts` assigns `request.id`; no response header or
  downstream request-ID use exists.
  Date/Author: 2026-09-03, Codex planning.
- Discovery: every completed `EmailVerification` already has a generated UUID and stores the address, result reason,
  organization, and creation time, but the public response interface and DTO omit the UUID.
  Evidence: `email-verification.entity.ts` defines `id`, while `IEmailVerificationResponseDto` and
  `EmailVerificationResponseDto` do not.
  Date/Author: 2026-09-03, Codex planning.
- Discovery: asynchronous and batch submission already return server-generated BullMQ job IDs, conceal foreign jobs,
  and preserve the organization in queue data. Batch result CSV files already contain each persisted verification ID.
  Evidence: the async and batch service implementations generate UUID job IDs; `uploadResults()` exports `id` and
  excludes only `organizationId`.
  Date/Author: 2026-09-03, Codex planning.
- Discovery: `EmailVerificationReason` already provides a bounded safe vocabulary for expected results, including
  `rejected_email`, `timeout`, `temporarily_blocked`, `no_mx_records`, `no_connect`, and `unexpected_error`.
  Evidence: `src/libs/common/src/enums/email-verification/email-verification-reason.enum.ts`.
  Date/Author: 2026-09-03, Codex planning.

## Decision Log

- Decision: Keep three identifier meanings explicit: request ID identifies one HTTP exchange; job and batch IDs
  identify queued work; and verification ID identifies one persisted result.
  Rationale: Reusing one label for different lifetimes makes retries and fan-out ambiguous. Safe link events can relate
  the identifiers without changing their ownership or uniqueness.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Generate the request ID inside the service, ignore any inbound `X-Request-ID`, and return the generated UUID
  in the `X-Request-ID` response header on success and failure.
  Rationale: The caller needs a support reference, but a caller-controlled value can contain personal data or secrets
  and cannot become an authoritative log field.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Emit expected verification outcomes with the existing `EmailVerificationReason`; emit unexpected failures
  with a fixed execution mode, fixed stage code, validated error type, and opaque identifiers only.
  Rationale: Stable reason and stage codes explain the operational category without copying exception messages, stacks,
  SMTP replies, provider diagnostics, addresses, domains, or MX hosts.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Add a narrow injected `VerificationTraceObserver` port and a structured-logging adapter rather than placing
  business logging in controllers or repositories.
  Rationale: Controllers should only pass safe context, application services own lifecycle transitions, and logging
  remains replaceable infrastructure with one responsibility.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Expose the existing verification UUID from current synchronous and completed asynchronous responses, and
  add `GET /verifications/:id` guarded by `verification:read` and organization ownership.
  Rationale: Logs are not the address lookup store. An authorized application read resolves an opaque result ID to the
  existing record, while missing and foreign IDs remain concealed.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Preserve the deprecated `GET /verify` response body exactly; its new support reference is the response
  header, and the safe completion event still links that request ID to the persisted verification ID.
  Rationale: The deprecated compatibility contract does not need another body-schema change.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Reuse the existing request, job, batch, and verification UUIDs without adding a trace table or persistence
  column.
  Rationale: The required chain already exists at lifecycle boundaries. A new address-to-trace mapping would duplicate
  customer data and create another retention and access surface.
  Date/Author: 2026-09-03, Codex planning.
- Decision: Trace-observer failure must not change verification, queue, credit, or persistence outcomes.
  Rationale: Operational telemetry is best effort and must not become a hidden business dependency. The protected
  result record and job status remain authoritative.
  Date/Author: 2026-09-03, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 03 configures Pino in `src/lead-email-finder-api/src/pii-safe-logger-options.ts`. Its request serializer emits only
`id`, `method`, and sanitized `path`; its response serializer emits only `statusCode`; its error serializer emits only a
validated type. `genReqId` creates a UUID and stores it on the Express request. The API currently does not return that
UUID, and application services, BullMQ processors, and structured verification logs do not receive it.

The current synchronous entry point is
`src/libs/modules/email-verification/src/sync-email-verification/sync-email-verification.controller.ts`; the deprecated
compatibility entry point is in `old-sync-email-verification/old-sync-email-verification.controller.ts`.
`EmailVerificationService` validates the domain, prepares the organization-owned email cache, runs `EmailVerifier`,
saves an append-only `EmailVerification`, updates `lastVerificationId`, and returns the saved object without
`organizationId`. The entity UUID is present internally, but the common response interface and serialized DTO omit it.
The response already contains the submitted email and bounded reason, so the caller knows the immediate result even
though an operator cannot correlate that result from logs.

`POST /verifyAsync` and `POST /verifyBatch/csv` already return UUID job IDs. Their status and result endpoints require
`verification:read` and compare `job.data.organizationId` with the authenticated principal. Async child jobs return an
`IEmailVerificationResponseDto`; batch result CSV files contain the persisted `id` and address but omit
`organizationId`. These protected responses and artifacts, not logs, remain the places where an authorized caller sees
the address.

Plan 04 made `emails`, `email_verifications`, and `smtp_verifications` organization-owned. That boundary permits a
read-by-verification-ID operation only when its repository predicate includes both UUID and organization. The existing
`verification:read` permission already governs async and batch result reads and is the narrow compatible permission for
the new operation.

## Scope and Non-Goals

This implementation pull request returns the server request UUID in `X-Request-ID` and threads safe trace context
through the four current verification entry points. It links HTTP dispatch to async and batch job IDs and emits safe
enqueue, completion, and failure events. It also exposes the existing verification UUID in current result DTOs except
the deprecated DTO, and it adds an organization-owned read-by-ID endpoint. The pull request updates the
email-verification module documentation, focused tests, and the nearest Bruno collections.

It does not log or hash an address, local part, submitted domain, MX host, URL value, request body, header value, client
IP, SMTP command/reply, provider payload/message, exception message, or stack. It does not add distributed tracing, a
tracing vendor, or caller trace headers. It also excludes cross-organization administration, search by email or request
ID, a new trace record, retention changes, changes to log-sink management, and unrelated module diagnostics. It does
not change verification algorithms, provider selection, SMTP classification, credits, retry policy, batch CSV columns,
queue names, job IDs, or deprecated response bodies. It adds no migration, backfill, production rollout, or production
recovery work.

## Plan of Work

First extend `pii-safe-logger-options.spec.ts` and `pii-safe-request-logging.integration.spec.ts` to characterize the
current generated request ID and absent response header. Change the Pino `genReqId(request, response)` function so it
generates or reuses the server UUID, assigns it to the request, and sets `X-Request-ID` before controllers, guards, or
exception handling run. Never read an inbound correlation header. Assert that successful, validation, authorization,
not-found, and unexpected-error responses carry the same UUID found in their automatic request log, and that an
attacker-supplied request ID is neither echoed nor logged.

Under the email-verification module, add a small trace contract and injection token. Define fixed execution modes for
synchronous, deprecated synchronous, asynchronous, and batch-child work, plus fixed failure stages for domain policy,
email-cache preparation, verification probe, result persistence, email-cache finalization, queue dispatch, batch
validation, and batch result publication. The observer receives only request/job/batch/verification IDs, mode, stage,
`EmailVerificationReason`, validated error type, duration, and bounded counts. Add a structured-logging adapter. The
adapter uses fixed event names and copies no arbitrary strings. Observer calls are guarded so a logging failure cannot alter
business behavior.

Pass the generated request UUID from sync and deprecated-sync controllers into the existing verification command. For
synchronous work it is the operation ID. At async and batch submission, emit a dispatch event linking the HTTP request
ID to the returned job ID. A processor uses its unchanged BullMQ job ID as its operation ID; batch child events also
carry the parent batch ID. Retries retain the same job/operation ID and may emit another event with a safe attempt
number; logs do not claim exactly-once delivery. Batch completion logs bounded counts by batch ID, while row-level
address and reason details remain only in the organization-owned CSV.

Instrument `EmailVerificationService` around its existing stages without moving business decisions into the observer.
After a record saves, emit `verification_completed` with operation ID, optional job/batch IDs, verification ID, mode,
reason, and duration. If an unexpected error escapes, emit `verification_failed` with operation ID, optional job/batch
IDs, mode, current fixed stage, safe error type, and duration, then rethrow the original error unchanged. Expected SMTP
and provider classifications continue to return their existing result reason and emit completion rather than copying
remote diagnostics.

Add `id` to `IEmailVerificationResponseDto` and `EmailVerificationResponseDto`. Preserve the deprecated mapper and DTO
without an ID field. Completed async status inherits the new field; async submission and batch submission bodies keep
their existing job ID shapes; batch CSV already contains the verification ID and must not gain or lose columns.

Add a purpose-specific verification-result reader and controller for `GET /verifications/:id`. Validate a UUID, require
`verification:read`, and query by both `id` and `principal.organizationId`. Return the same serialized result DTO with
its verification ID. Return the ordinary authenticated `401`, permission `403`, concealed `404` for missing or foreign
records, and `200` for an owned record. Do not add list, email-filter, request-ID lookup, or cross-organization query
parameters.

Update `src/libs/modules/email-verification/README.md` with identifier meanings, safe event fields, the support flow,
and the rule that log access cannot resolve an address. Extend `bruno/smtp-dev` to assert the response header, new
synchronous result ID, owned lookup, and missing-ID concealment. Extend captured-log tests with unique sentinel values
in email, inbound request ID, headers, body, provider failure, and SMTP response fields.

## Interfaces and Dependencies

The trace contracts are equivalent to:

    type VerificationExecutionMode =
        | "sync"
        | "deprecated_sync"
        | "async"
        | "batch"
        | "batch_child"

    type VerificationFailureStage =
        | "domain_policy"
        | "email_cache_prepare"
        | "verification_probe"
        | "verification_persist"
        | "email_cache_finalize"
        | "queue_dispatch"
        | "batch_validation"
        | "batch_result_publication"

    interface VerificationTraceContext {
        operationId: string
        mode: VerificationExecutionMode
        jobId?: string
        batchId?: string
    }

    interface VerificationTraceObserver {
        enqueued(event: {
            requestId: string
            mode: "async" | "batch"
            jobId: string
        }): void
        completed(event: VerificationTraceContext & {
            verificationId: string
            reason: EmailVerificationReason
            durationMs: number
        }): void
        batchCompleted(event: {
            batchId: string
            total: number
            processed: number
            unprocessed: number
            durationMs: number
        }): void
        failed(event: VerificationTraceContext & {
            stage: VerificationFailureStage
            errorType: string
            durationMs: number
            attempt?: number
        }): void
    }

The public behavior becomes:

    X-Request-ID: <server-generated UUID>

    POST /verify -> existing verification body plus { id: <verification UUID> }
    GET /verify?email=... -> unchanged deprecated body plus X-Request-ID
    POST /verifyAsync -> unchanged { id: <job UUID> } plus X-Request-ID
    GET /verifyAsync/:id -> completed result includes verification id
    POST /verifyBatch/csv -> unchanged { id: <batch UUID> } plus X-Request-ID
    GET /verifications/:id -> owned EmailVerificationResponseDto

The implementation reuses Node UUID generation, Pino/Nest logging, BullMQ job IDs, TypeORM repositories, current auth
guards, `verification:read`, `EmailVerificationReason`, and `safeErrorType`. No runtime package, entity column, index,
migration, or queue is added. Plan 03 supplies the log allowlist and plan 04 supplies organization ownership and
append-only verification IDs. Plan 11 continues to own managed log-sink access and retention; this plan changes only
application correlation content.

## Acceptance Criteria

- Every HTTP response, including success, validation failure, unauthenticated, unauthorized, not-found, and unexpected
  failure, carries an `X-Request-ID` UUID generated by the server before request handling.
- A supplied `X-Request-ID` is ignored. It does not appear in the response, automatic request log, application event,
  queue trace context, or persisted result.
- Automatic request logs and verification lifecycle events use the same request ID for synchronous and deprecated
  synchronous operations.
- Async and batch submission events link the response request ID to the exact returned job ID. Worker events use the
  unchanged job ID; batch-child events also include the parent batch ID.
- Every completed single-address verification event contains an opaque operation ID, persisted verification ID,
  execution mode, bounded `EmailVerificationReason`, and duration. It contains no address-derived or remote text.
- Every unexpected verification failure event contains the opaque operation ID, execution mode, fixed failure stage,
  validated error type, and duration. The original error behavior is preserved, and no message or stack is logged.
- `POST /verify` and completed `GET /verifyAsync/:id` results expose the persisted verification UUID without removing or
  renaming an existing field. The deprecated response body and async/batch submission bodies remain unchanged.
- An authenticated principal with `verification:read` can read an owned result through `GET /verifications/:id`.
  Missing and foreign UUIDs return the same concealed `404`; missing authentication returns `401`, and missing
  permission returns `403`.
- The read-by-ID operation cannot list, filter by address, query another organization, or resolve a request/job ID. Log
  access alone cannot resolve an address.
- Batch CSV headers and rows remain unchanged, including the existing verification `id`; batch lifecycle logs contain
  only batch/job IDs, safe states, durations, and bounded counts.
- Retry and duplicate BullMQ delivery retain the same job/operation ID and do not duplicate verification business
  results beyond existing behavior. Trace-observer failure cannot fail or change a verification, debit, queue job,
  persisted result, or HTTP status.
- Captured JSON logs contain none of the unique sentinel, encoded sentinel, local part, domain, MX host, SMTP reply,
  provider message, credentials, IP data, or attacker request ID.
- Focused unit and integration tests, module architecture, typecheck, lint, the full Jest suite, build, documentation
  lint, Bruno coverage, static log-field audit, and diff validation pass.

## Validation

Run focused request-header, trace-observer, service, queue, result-reader, authorization, and captured-log tests:

    corepack pnpm test -- src/lead-email-finder-api/src/pii-safe-logger-options.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts src/libs/modules/email-verification/src/sync-email-verification/email-verification.service.spec.ts src/libs/modules/email-verification/src/sync-email-verification/sync-email-verification.controller.spec.ts src/libs/modules/email-verification/src/old-sync-email-verification/old-sync-email-verification-http.integration.spec.ts src/libs/modules/email-verification/src/async-email-verification/async-email-verification.service.spec.ts src/libs/modules/email-verification/src/async-email-verification/async-email-verification.processor.spec.ts src/libs/modules/email-verification/src/batch-email-verification/batch-email-verification.service.spec.ts src/libs/modules/email-verification/src/batch-email-verification/batch-email-verification.processor.spec.ts src/libs/modules/email-verification/src/operational-trace/verification-trace-observer.spec.ts src/libs/modules/email-verification/src/operational-trace/verification-result-http.integration.spec.ts --runInBand
    corepack pnpm architecture:check

Use a unique synthetic sentinel. Exercise synchronous success, expected rejection, and thrown failure; deprecated sync;
async enqueue, completion, retry, and thrown failure; batch enqueue, child completion, parent completion, and invalid
row. Capture every JSON line and assert the expected opaque-ID chain and safe reason/stage fields before asserting that
all sentinel and attacker-controlled forms are absent.

Run repository checks:

    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/34-trace-verification-operations-with-opaque-identifiers.md bruno/smtp-dev/README.md
    git diff --check

Extend the nearest `bruno/smtp-dev` sequence. Assert a UUID `X-Request-ID` on success and rejection, assert that a
caller-supplied ID is not echoed, capture the new synchronous verification `id`, read the owned result by that ID, and
verify a random missing ID returns concealed `404`. Run:

    cd bruno/smtp-dev
    bru run --env local

Run Bruno only when its documented Docker network, fixture state, authentication, and credentials are available. If
runtime dependencies are unavailable, parse every YAML file, review the request sequence statically, and record runtime
execution as unverified.

Inspect every new structured event and request serializer field. The only permitted dynamic values are generated
request/job/batch/verification UUIDs, fixed mode/stage/event/reason codes, validated error types, durations, safe attempt
numbers, and bounded counts. Any address, submitted domain, MX host, raw URL, header, body, SMTP text, provider text,
exception message, stack, IP value, or stable email hash is a failure.

## Idempotence and Recovery

Header emission and observer calls do not mutate business state and are safe to repeat. The server generates one
request ID per HTTP exchange; retries receive a new request ID unless they continue as the same BullMQ job. BullMQ
retries preserve the job ID and add only a safe attempt number. Persisted verification IDs remain append-only and
organization-owned. The result lookup is read-only.

Observer exceptions are contained and cannot alter the underlying request or job result. If a trace assertion fails,
retain only the synthetic IDs and sentinel, identify the missing link or unsafe field, and rerun the focused captured-
log scenario. Do not copy production logs into test artifacts. No database reset is required because the plan adds no
schema; disposable HTTP and persistence tests clean up their synthetic organization-owned results. Reverting the
observer wiring and response-header change restores the prior behavior without rolling back data.

## Artifacts and Notes

Record only synthetic request, job, batch, and verification UUIDs; fixed event/mode/stage/reason codes; captured event
counts; HTTP statuses; test totals; and sanitized Bruno results. Do not record real addresses, domains, MX hosts,
credentials, IP values, SMTP transcripts, provider responses, exception text, stack content, or unrestricted database
output.

## Plan readiness

Ready to implement
