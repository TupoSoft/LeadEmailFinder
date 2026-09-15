# Email Verification

Verifies whether an email address can plausibly receive mail — synchronously, asynchronously as a background
job, or in CSV batches — by resolving its domain's MX records and, where safe, connecting to them over SMTP
through a leased proxy. It also owns the email/domain persistence those checks cache.
Synchronous verification uses `POST /verify`; the retired `GET /verify` returns `404` without verification or credit debit.

## Responsibility

- Synchronous verification (`POST /verify`), with permission checks and a one-credit debit.
- Asynchronous, job-based verification (`POST /verifyAsync` / `GET /verifyAsync/:id`).
- CSV batch verification (`POST /verifyBatch/csv`, status polling, and durable result download), including a
  BullMQ parent/child job fan-out per row and an S3-backed result file.
- Domain and email persistence used to cache verification results and avoid rechecking the same address.
- Organization-owned result lookup by verification UUID (`GET /verifications/:id`).
- The SMTP verification engine itself: MX resolution, catch-all detection, and proxy-leased SMTP connections that require certificate-verified STARTTLS before either envelope address is sent.
- Default-deny account-discovery enrichment, including one-provider selection and approval checks performed during
  startup and immediately before every outbound disclosure.
- An internal, admin-only cache of stored `Email` records (`/emails`), not itself a verification endpoint.
- Private, deterministic generation of bounded email candidates from a person's first name, last name, and company
  domain, with a fixed generation version and pattern identities.

## Non-Responsibilities

- No credit policy — it calls [`credits`](../credits/README.md) to debit, but does not decide the cost of a
  request.
- No proxy allocation policy — it leases proxies through the contracts
  [`proxy`](../proxy/README.md) owns and exposes, but does not own proxy state itself.
- No organization/membership policy — authenticated HTTP adapters and existing jobs supply `organizationId`, while
  this module uses that value only to isolate verification state. Identity and membership policy remain owned by
  [`identity`](../identity/README.md) and [`auth`](../auth/README.md).
- No production transport or object-encryption policy — the API composition root validates that policy and supplies
  one shared common token to this module's S3 infrastructure adapters.
- No vendor, legal, transfer, security, or customer-authorization approval policy — repository owners supply that
  evidence through the fixed account-discovery approval manifest.

## Privacy and Data Lifecycle

The canonical
[email-verification processing and lifecycle contract](../../../../docs/privacy/email-verification-processing-contract.md)
defines this module's customer-data processor/service-provider posture, its separation from LeadEmailFinder controller
data, permitted purposes, recipients, fixed engineering retention defaults, rights routing, and follow-up owners.

The `emails`, `email_verifications`, and `smtp_verifications` records are organization-owned. Exact-address cache
lookups use the organization together with the normalized address, each check appends a result and updates only the
owning organization's latest-result link, and batch result queries require both organization and batch identity. The
`domains` table remains shared operator-managed technical policy and stores no organization or address association.
BullMQ jobs still have no terminal-age cleanup, and batch inputs and results have no deletion path;
`privacy-compliance/07` owns those retention controls. Verification is only a deliverability signal: it does not
establish consent, lawful basis, marketing eligibility, or permission to contact, and this module does not send
commercial messages or own final suppression duties.

## Operational Logging

Automatic HTTP completion logs use an allowlist configured at the API composition root. A request record contains
only a server-generated UUID, method, and sanitized path; a response record contains only its status code, alongside
the numeric response duration. Every HTTP response returns this UUID in `X-Request-ID`, including parser, validation,
authentication, authorization, and application failures. Incoming request IDs are ignored. Query strings are discarded, and email-administration paths are recorded as
`/emails/:sensitive`.

Application events may contain only stable operation or provider codes, SMTP numeric and enhanced status codes,
durations, and opaque internal request, job, database, or proxy IDs. DNS events retain the record type, and proxy
lifecycle events retain outcomes without the submitted domain or derived MX host.

Logs must never contain a submitted email, local part, submitted domain, stable email hash, raw URL, query value,
request header or body, cookie, authorization value, or client address or port. The same prohibition covers SMTP
commands and replies, provider payloads and remote error messages, and exception messages derived from external
input. Error records use a stable operation code and validated error class; they omit message text and stacks.

Request IDs identify HTTP exchanges. Job and batch IDs identify queued work, and verification IDs identify persisted
results. Synchronous and completed async responses expose the verification `id`.
Batch CSV files retain their existing verification `id` column.

A narrow `VerificationTraceObserver` application port receives lifecycle events. Its logging adapter emits
`verification_enqueued`, `verification_completed`, `verification_failed`, and `verification_batch_completed`.
Allowed fields include UUIDs checked by the adapter, fixed execution modes and failure stages, existing verification
reason codes, validated error types, bounded durations, attempt numbers, and counts. A synchronous operation uses its request
ID; a worker uses its existing job ID, and a batch child includes its parent batch ID. Submission events link the
request ID to the returned job ID. Retries may produce multiple events for the same job; events do not promise exactly
one delivery. Observer failures cannot change results, credits, persistence, or job outcomes.

A caller can provide Support with one of these opaque IDs. Support can follow the log events to a persisted
verification ID. Resolving that ID to an address requires an authenticated application read with `verification:read`
in the owning organization. Log access alone cannot resolve an address. Missing and foreign verification IDs both
return the same `404`; the endpoint accepts no organization override and provides no list or address search.

## Public API

[`src/index.ts`](src/index.ts) exports only `EmailVerificationModule`, which composes `EmailVerificationCoreModule`,
`AsyncEmailVerificationModule`, and `BatchEmailVerificationModule`. The root registers the async controller, the synchronous controller,
its application command, the email-administration controller, and the internal result reader and its controller.
Internal modules and contracts are not exported again by `src/index.ts`: the only public surface is
`EmailVerificationModule` itself and the HTTP/queue behavior below. The shared result DTO lives in `src/api/`; the trace port
lives in `src/application/verification-trace/`, with Nest logging wiring in `src/infrastructure/verification-trace/`.

## Architecture

The module is layered (`module-architecture/10`, `/11`, `/13`, `/14`, `/15`, `/16`, `/17`, `/18`): `domain/` holds plain `Email`, `DomainPolicy`,
`EmailVerification`, and `SmtpVerification` records and typed errors; `application/` holds the central
verification sequence (`EmailVerificationOrchestrator`, `MailboxVerificationService`), email/domain
administration use cases (`EmailAdministrationService`, `DomainPolicyService`), the pure `classifyVerificationQuality`
evidence classifier, and thirteen purpose-specific ports under `application/ports/` — `EmailStore`, `DomainStore`,
`VerificationStore`, `SmtpVerificationStore`, `MxResolver`, `DomainSynonymDiscovery`, `MailboxProbe`,
`AccountDiscovery`, `VerificationClock`, `VerificationRequestStore`, `VerificationExecutionStore`,
`VerificationSettlementStore`, and `VerificationResultCacheReader`; `infrastructure/` holds technical adapters, and
`api/` holds the HTTP surface. Neither `domain/` nor `application/` imports Nest, TypeORM, Automapper, or any network
client.

`domain/verification-evidence.ts` defines the internal `VerificationQuality` (`conclusive_positive`,
`conclusive_negative`, or `inconclusive`), the `MailboxEvidence` discriminated union, and the pure
`deriveMailboxEvidence` for policy version `1`. Only a target `250` response after verified TLS and an accepted
sender is `smtp_recipient_accepted` evidence; only a target `5xx` with exact enhanced status `5.1.1` under the
same prerequisites is `smtp_recipient_missing` evidence. The pure `classifyVerificationQuality` in
`application/classify-verification-quality.ts` requires both a `smtp_recipient_accepted` target and a
`smtp_recipient_missing` control for `conclusive_positive`; a `smtp_recipient_missing` target alone is
`conclusive_negative`; every other combination is `inconclusive`. `deriveEvidenceObservedAt` derives the
persisted observation time from the oldest
decisive input. Neither function imports credits, a clock, or infrastructure. `MailboxVerificationService` gates
the target probe on the control's evidence kind, not a bare Boolean, and attaches the resulting quality and
evidence time to its returned record; `EmailVerificationOrchestrator` persists them unchanged. The synchronous,
asynchronous, and batch response DTOs never expose them: existing HTTP response shapes are unchanged by this
policy version.

`infrastructure/persistence/` holds the four persistence-port adapters — `TypeOrmEmailStore`,
`TypeOrmDomainStore`, `TypeOrmVerificationStore`, and `TypeOrmSmtpVerificationStore` — over `EmailEntity`,
`DomainPolicyEntity`, `EmailVerificationEntity`, and `SmtpVerificationEntity` TypeORM classes under
`infrastructure/persistence/typeorm/`, mapping the `emails`, `domains`, `email_verifications`, and
`smtp_verifications` tables.

`infrastructure/discovery/dns/dns-mx-resolver.ts` implements `MxResolver` over the technical DNS library, preserving
its cache, record ordering, and empty-result behavior for failed DNS queries. Unexpected adapter failures cross
this boundary only as the stable `dns_mx_resolution_failed` error. `infrastructure/discovery/http/` owns
`HttpDomainSynonymDiscovery`: it retrieves the homepage and relevant links, keeps results from successful pages,
and inherits the injected HTTP transport's timeout and retry configuration. The default composition adds no
adapter-specific timeout or retry. `domain/domain-synonym-parser.ts` extracts domains and relevant links from
supplied text without network access.

`application/ports/account-discovery.ts` defines the private `AccountDiscovery` evidence port and its injection
token. `MailboxVerificationService` decides when discovery is useful and maps known source names into verification
results. `AccountDiscoveryService` calls at most one approved provider and returns fresh positive evidence;
disabled discovery, negative responses, and per-call failures return an empty list without claiming account absence
or logging provider errors. Invalid selection still rejects initialization, and the approval wrapper checks
validity again before dispatch. `infrastructure/account-discovery/account-discovery-composition.ts` rejects a
selection containing more than one provider. `infrastructure/account-discovery/configured-account-discovery.ts`
builds the discovery instance from configuration, the approval manifest, and the provider adapters; the
private `infrastructure/account-discovery/account-discovery.module.ts` owns HTTP configuration, provider
registration, the clock, manifest loading, and the discovery factory. It exports only `ACCOUNT_DISCOVERY_TOKEN`
to `EmailVerificationCoreModule`. The four provider clients and their helpers live under
`infrastructure/account-discovery/providers/` and implement the framework-free `AccountDiscoveryProvider`
contract in `application/account-discovery/account-discovery-provider.ts`. Selection and approval policy depend
on that private contract. The retired shared provider library, aliases, and common verifier contract are removed;
the public barrel still exports only `EmailVerificationModule`.

`infrastructure/mailbox/smtp/smtp-mailbox-probe.ts` implements `MailboxProbe`: it resolves MX exchanges through
the injected `MxResolver` port, leases a proxy through `IProxyService`/`IProxyAllocator`, drives the STARTTLS/SMTP
protocol exchange through `infrastructure/mailbox/smtp/smtp-client.ts` (built by `SmtpClientFactory`), and persists
each outcome through the `SmtpVerificationStore` port instead of a raw repository. It still resolves the SMTP
client's own reverse-DNS hostname directly through the injected `IDnsService`, since no port covers that narrow
technical need. `SmtpClient.rcptTo()` resolves with the actual response code and enhanced status rather than a
bare `void`; `SmtpException` records the failing command's stage so the probe can require exact `rcpt_to`-stage
`5.1.1` proof before treating a rejection as decisive. Once acceptance or an exact missing-recipient answer is
observed, a later `QUIT` rejection or peer close cannot erase it. Stored SMTP evidence is reused only for its
owning organization, current policy version, verified transport, and an observation age strictly below 24 hours;
an injected `VerificationClock` (bound to a real system clock in `infrastructure/email-verification-core.module.ts`)
supplies the read, so freshness tests never sleep. An empty MX result now produces `exists: null`, since it means
the resolver returned no usable records, not authoritative mailbox absence.

`infrastructure/email-verification-core.module.ts` composes the core: it registers the four consumed
persistence entities with TypeORM, builds every application service and port through explicit factory providers
(no bare `@Injectable()` on a framework-free class), and exports `EmailVerificationOrchestrator` internally.
The async module retains its `EmailVerificationServiceToken` binding to that orchestrator; the batch module
continues to consume the same core composition.

Neither single-verification route uses `CreditGuard` any more. Both drive the durable admission/execution/
settlement stack described below directly. Both accept an optional canonical lowercase UUIDv7
`Idempotency-Key` header. The shared, framework-light `parseVerificationIdempotencyKeyHeader` in
`api/http/verification-idempotency-key-header.ts` parses it. It reads `req.rawHeaders`, not `req.headers`, since
the latter would silently merge a repeated header. Both POST methods also run a `VerificationRateLimitGuard`
(`api/http/verification-rate-limit.guard.ts`) after `PermissionsGuard`, backed by
`VerificationSubmissionLimiter` — a Redis token-bucket counting every submission, including free ones, per
organization; a limiter timeout fails safe with `503 rate_limit_unavailable`, never unlimited free admission.

The synchronous controller and body DTO live under `api/http/synchronous-verification/current/`. The controller
invokes the private `RUN_SYNCHRONOUS_VERIFICATION` token. Its framework-free `RunSynchronousVerification`
implementation under `application/delivery/synchronous/` admits through `VerificationAdmissionService` exactly like
the async route. It then drives its own funded execution inline via `VerificationExecutionRunner.execute()` in a
bounded loop against a 30-second budget. It waits out a scheduled retry only if it still fits, and never drives
someone else's execution inline. `joined`/`cooldown` admissions instead poll `VerificationOperationsReader.read()`
read-only. Exhausting the budget, or losing the race entirely (`lease-lost`/`not-runnable`), falls back to
`202 { id } + Location: /verifyAsync/<id>`. The in-flight execution keeps running, backstopped by its own lease
machinery and the reconciler, exactly like the async path. A closed HTTP connection never affects billing, since
only durable state drives it. A settled result adds an additive `operation` metadata block (see below) to the
existing `EmailVerificationResponseDto`, which `GET /verifications/:id` also uses but never populates that field,
since that route reads by result ID with no single billing operation to describe. Domain-policy rejection and
unexpected adapter failures retain their generic `500` response. The `/emails` administration API remains at
`api/http/email-administration/`, wired by the root to `EmailAdministrationService`.

Async HTTP controllers and DTOs live under `api/http/asynchronous-verification/`. The framework-independent
`AsyncEmailVerificationService` under `application/delivery/async/` composes `VerificationAdmissionService`, a new
`VerificationExecutionDispatcher` port, and `VerificationOperationsReader` — it no longer touches
`AsyncVerificationJobs` at all (that port and its Bull adapter were deleted; single submission never enqueues
through them). A `funded`/`joined` admission dispatches onto the new `verification-execution` queue (idempotent —
the same execution ID is reused as the job ID); a `cooldown` join (an execution already `awaiting_retry`) is
deliberately not redispatched, relying on the reconciler's own ~30-second sweep instead. `mapAsyncVerificationStatus`
in `application/delivery/async/async-verification-status.ts` maps durable request/execution state — not a BullMQ
job snapshot — onto the same five public states as before: `queued`, `running`, `completed`, `failed`, and
`unavailable`. Nonterminal execution states fold down onto `queued`/`running`, so the browser frontend's fixed
5-value status vocabulary never gains a sixth value. The mapper now also attaches the `operation` metadata block
once settled. Missing, foreign, and expired (past a 7-day terminal-visibility window) operations produce the same
`AsyncEmailVerificationJobNotFoundException`, which the controller maps to the existing `404`.

`infrastructure/queues/verification-execution/` is the new queue both single-verification routes drive execution
through. `BullVerificationExecutionDispatcher` enqueues by execution ID with `removeOnComplete`/`removeOnFail: true`.
Durable state lives in Postgres, not the BullMQ job record, and the same ID is safely reused across dispatch attempts.
`VerificationExecutionProcessor` calls `VerificationExecutionRunner.execute()`. On a `retry-scheduled` outcome, it
calls `job.moveToDelayed(retryAt, token)` followed by `throw new DelayedError()` to move the *same* job into the delayed state.
Re-adding a new job with that same ID while the current attempt is still `active` is a silent BullMQ no-op that
would drop the retry entirely. This was proved against real Redis; see the plan's Decision Log.
A `permit-unavailable` outcome throws a plain exception to trigger the queue's own fixed
250-millisecond backoff retry instead.

`infrastructure/queues/async-verification/` now owns only the `async-email-verification` queue's continued role in
batch's child-verification dispatch (`BullBatchChildFlow` enqueues directly into it by name); its
`AsyncEmailVerificationProcessor` worker and job contract are unchanged, and its module still binds
`EmailVerificationServiceToken` to the existing orchestrator for that one remaining caller. The `AsyncVerificationJobs`
port, `BullAsyncVerificationJobs` adapter, and the single-submission-through-this-queue flow they backed are gone.

Batch HTTP controllers and DTOs live under `api/http/batch-verification/`. `application/delivery/batch/` holds the
transport-neutral `BatchEmailVerificationService` (upload registration, owned status, and owned result retrieval)
and the pure `BatchEmailVerificationWorkflow`, which walks the same `Validate → Process → WaitForChildren →
UploadResults → Finish` state transitions through five narrow ports — `BatchJobs`, `BatchChildFlow`, `BatchInput`,
`BatchResultWriter`, and `BatchResultReader` — instead of BullMQ, S3, or TypeORM directly. A `WaitForChildren` step
still pending raises the framework-free `BatchAwaitingChildrenSignal`; the thin `BatchEmailVerificationProcessor`
under `infrastructure/queues/batch-verification/` is the only place that translates that signal into BullMQ's own
`WaitingChildrenError`. `BullBatchJobs` and `BullBatchChildFlow` implement the queue-facing ports, registering the
same `batch-email-verification` and `async-email-verification` queues as before; `S3BatchInput`, `S3BatchResultWriter`,
and `S3BatchResultReader` under `infrastructure/storage/batch-verification/` implement the storage-facing ports,
preserving the exact CSV parsing/validation, alias-prefixed TypeORM result-row mapping, and S3 upload/read mechanics.
`CreditsService.debit()` is called directly by the workflow, one credit per validated CSV row, matching the
established cross-module dependency pattern of injecting another module's public application service. No
email-verification architecture-baseline violation remains.

Batch status shares the async application's five public states: `queued`, `running`, `completed`, `failed`, and
`unavailable`. The Bull adapters normalize queue states before they cross the application boundary. A completed batch
without a valid stored result location is `unavailable`. Only failed jobs expose `failureCode`: `invalid_csv`,
`insufficient_credits`, or `processing_failed`. The framework-free classifier accepts typed CSV validation and credit
errors; the worker records only its safe code and preserves the original failure. Worker wait signals never create a
failure marker. Missing or unrecognized markers use `processing_failed`, and successful retries expose no failure
code. This generic failure makes no claim about whether credits were charged.

Durable verification operations and billing recovery live under `application/ports/` (`VerificationRequestStore`,
`VerificationExecutionStore`, `VerificationSettlementStore`, `VerificationResultCacheReader`,
`VerificationCooldownReader`, `VerificationExecutionPermits`, `VerificationSubmissionLimiter`,
`VerificationExecutionDispatcher`) and `application/operations/` (`VerificationAdmissionService`,
`VerificationExecutionRunner`, `VerificationSettlementService`, `VerificationOperationsReader`,
`VerificationReconciler`), backed by `infrastructure/persistence/typeorm-verification-request.store.ts`,
`typeorm-verification-execution.store.ts`, `typeorm-verification-settlement.store.ts`,
`typeorm-verification-result-cache-reader.ts`, and `typeorm-verification-execution-permit.store.ts` over five
TypeORM entities under `infrastructure/persistence/typeorm/`. Both single-verification HTTP routes now drive this
stack directly (see above); `EmailVerificationOrchestrator` keeps its existing routes-free role backing batch's
per-child verification only. The stack gives four guarantees. A fresh, conclusive cached result is reused for
free. Concurrent admissions for one organization/address share a single execution. A crash between reserving a
credit and confirming settlement always recovers to exactly one terminal outcome with at most one debit. Global
outbound execution concurrency and per-organization submission rate stay bounded regardless of how many callers
admit for free.

`VerificationAdmissionService.admit()` first replays or rejects a caller-supplied idempotency key — a canonical
lowercase UUIDv7, checked at first admission for an age under 24 hours and a lookahead under 5 minutes via
`application/verification-idempotency-key.ts`. It then checks `VerificationResultCacheReader` for a fresh,
conclusive, policy-current result through the pure `isCachedResultUsable` in
`application/verification-result-cache.ts`. Absent a usable cache hit, it checks `VerificationCooldownReader` for a
terminal-inconclusive verdict for that address within the last 60 seconds. This uses the same adapter class as the
result-cache reader, implementing a second, quality-filter-free interface. If it finds such a verdict, it reports `address-cooldown`
without creating any request/execution row or reserving a credit. Otherwise, `VerificationExecutionStore.claimOrJoin()`
locks the `(organizationId, normalizedAddress)` slot and rechecks the cache-freshness predicate under the lock,
closing the race between the caller's own check and the claim. It then either reports the fresh result, joins the
nonterminal execution already claiming that slot, or inserts a new `funding_pending` row. A newly created execution reserves one
credit through `CreditReservationService.reserve()` (from [`credits`](../credits/README.md)). An
`InsufficientCreditsException` fences the execution through `cancelFundingFailure` and `closeAdmissionMany` before
reporting `insufficient-funds` — the canceled row still exists, outside the partial unique index that covers only
nonterminal states, so the address slot is free for a later retry.

`VerificationExecutionRunner.execute()` acquires a global `VerificationExecutionPermits` slot before a generation-fenced lease.
The slot lives in Postgres, is bounded by `VERIFICATION_EXECUTION_MAX_CONCURRENT`, and is renewed alongside the
lease on a best-effort basis. A failed permit renewal alone never aborts the probe, unlike lease-renewal failure.
The lease lasts 60 seconds and is renewed/polled every 5 seconds for the whole probe call.
The application layer cannot observe the underlying SMTP socket's lifecycle more precisely without new plumbing.
The runner threads an `AbortSignal` tied to lease
loss through `MailboxVerificationService.verify()` down to `SmtpMailboxProbe` and its `ISmtpClientFactory`, then
calls `VerificationSettlementStore.persistResultAndIntention()` guarded by the expected attempt generation. A
`temporarily_blocked` reason schedules a retry instead of persisting a result, waiting `(generation + 1)` minutes to
match the existing async queue's own greylist delay. Any other thrown probe failure schedules a flat 10-second
retry instead. An unavailable permit reports `permit-unavailable` before ever acquiring a lease.
`VerificationSettlementService.settle()` then captures or releases the reservation, using the execution ID as
the stable reference, confirms settlement, and calls `EmailAdministrationService.upsertEmail()`.
This mirrors `PaymentAdjustmentHandler`, whose claim-then-call-credits-then-complete shape stays replay-safe at every step.
It also mirrors the old unconditional cache-finalize step in `EmailVerificationOrchestrator`, gated at exactly the
point the result becomes visible. `confirmSettlement` flips the execution and every linked request row terminal in one
transaction, crediting only the payer request's `chargedCount` and marking every other joined or shared request
`shared`.

`VerificationReconciler.reconcile(limit)` is the only dispatcher for due `awaiting_retry` executions and the
crash-recovery backstop for `queued` ones the `verification-execution` queue failed to pick up; it pages
nonterminal executions and either drives each one forward or recovers it. Recovery confirms a `funding_pending` row
against `CreditReservationService.getReservation()`, reclaims a `running` lease abandoned past a 5-second shutdown
grace through `takeoverForRetry`, or cancels anything past its 24-hour deadline — unless a capture intention
already exists, since capture always wins. A deadline cancellation that actually transitions the row also releases
its credit reservation and settles every linked request as a zero-charge `failed` outcome through
`VerificationRequestStore.settleCanceled()`. This mirrors what `confirmSettlement` does for the normal path.
A cancellation the reconciler replays as a no-op does neither, since the reservation was already released the first
time. The reconciler then confirms every pending settlement intention through `VerificationSettlementService.settle()`.
It runs on its own repeatable BullMQ job, this module's first periodic queue, under
`infrastructure/queues/verification-reconciliation/`. `OnApplicationBootstrap` schedules it every 30 seconds
through the `VerificationReconciliationScheduler` port and its `BullVerificationReconciliationScheduler` adapter,
which calls `Queue.upsertJobScheduler`.

`VerificationOperationsReader.read()` looks up one operation by its `requestId` handle. A `settled` outcome includes
the full request record. It also includes the result, unless the execution was canceled past its deadline with no result ever produced.
A settled request past a 7-day terminal-visibility window reports `expired` instead. Other outcomes are `pending`
with the execution's current state, or `not-found`. The full request record — not a few cherry-picked fields — lets
the HTTP layer build its `operation` metadata block from one place.
The framework-free `buildOperationMetadata()` in `application/operations/verification-operation-metadata.ts` derives
`{id, source, observedAt, cacheExpiresAt, billing}` from a `VerificationRequestRecord` and the settled result's
evidence-observation time. `api/verification-operation-metadata.dto.ts` holds only the matching decorated,
`@ApiProperty()`-annotated DTO classes `VerificationOperationMetadataDto`/`VerificationOperationBillingDto`.
`@SerializeOptions({type: ...})` coerces the plain value into those classes. The logic stays framework-free and lives
in the application layer; only the decorated shape lives in the API layer.
`EmailVerificationCoreModule` wires every store and service above as explicit factory providers (matching its
existing convention of instantiating concrete stores inline rather than giving them their own DI token) and now
imports `CreditsModule`. `EmailVerificationModule` (the root, one level up) imports bare `ConfigModule` directly.
Without it, none of its own `ConfigService`-injecting factories can resolve once the real application module tree
is instantiated end to end. These include the async-service composition, both rate-limit configuration factories,
and `RUN_SYNCHRONOUS_VERIFICATION`. `ConfigModule.forRoot()` is called once at the API composition root and is not `isGlobal`.

## Email Candidate Generation

The private `generateEmailCandidates` function in
[`src/application/finding/generate-email-candidates.ts`](src/application/finding/generate-email-candidates.ts) returns
at most 16 unique addresses in the fixed version 1 template order. It returns normalized input, contiguous candidate
indexes, pattern identities from `EmailPatternEnum`, and an omission record for each template that exceeds the
64-byte local-part or 254-byte address limit. Collisions retain their first position and merge patterns in order.
When every template is too long, generation fails with the typed `no_candidates` code.

[`normalizeFindingInput`](src/application/finding/normalize-finding-input.ts) limits each supplied name to 100 Unicode
code points and its normalized token to 64 ASCII letters. It rejects raw symbols and unlisted punctuation before
applying NFKD normalization, lowercases letters, removes
combining marks and space separators, and removes straight apostrophes, right single quotation marks, and ASCII
hyphens. Unsupported characters produce a field-specific error rather than a guessed transliteration. Domain
validation accepts a complete hostname, including subdomains and one final ASCII root dot, converts it through IDNA,
and preserves the resulting lowercase hostname. It rejects URL syntax, percent escapes, IP addresses, malformed
labels, single-label hosts, numeric final labels, and oversized domains. It does not determine DNS existence or
the separately owned domain policy.

The plain contracts and `FindingInputError` live in
[`src/domain/finding-input.ts`](src/domain/finding-input.ts). Errors contain a fixed message, field, and closed code;
they retain no submitted values. The functions perform no logging, network access, persistence, billing, or queue
dispatch. They leave the caller's input unchanged and return fresh reports. This capability has no HTTP route,
configuration, or public barrel export. Candidates are spelling suggestions, with no claim of mailbox existence or
person attribution; verification and durable finding workflows remain separate work.

## Dependencies

- [`credits`](../credits/README.md) — `CreditsService.debit()` called directly by the batch workflow (one credit
  per validated CSV row), and `CreditReservationService` used by the durable admission/settlement/reconciliation
  stack that now backs both single-verification HTTP routes. Neither route uses `CreditGuard` any more.
- [`proxy`](../proxy/README.md) — the `IProxyService`/`IProxyAllocator` contracts and DI tokens, through its
  public barrel; SMTP verification acquires and releases leases through these contracts, not through any deep
  import into the implementation of `proxy` itself.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `RequirePermissions`,
  `CurrentPrincipal`.
- [`identity`](../identity/README.md) — the `AuthPrincipal` type.

## HTTP Surface

| Method                     | Path                        | Access                          | Notes                                                                                          |
| -------------------------- | --------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST`                     | `/verify`                   | `verification:run` + one credit | Current synchronous verification                                                               |
| `GET`                      | `/verifications/:id`        | `verification:read`             | Owned persisted result; `404` for missing or foreign IDs, `400` for invalid UUIDs              |
| `POST`                     | `/verifyAsync`              | `verification:run` + one credit | `202 Accepted`; enqueues an async job                                                          |
| `GET`                      | `/verifyAsync/:id`          | `verification:read`             | `404` if the job doesn't exist or isn't owned by the caller                                    |
| `POST`                     | `/verifyBatch/csv`          | `verification:run`              | `202 Accepted`; multipart CSV upload, `100MB` max                                              |
| `GET`                      | `/verifyBatch/:id`          | `verification:read`             | Five public states, safe terminal failure code, bounded `0`–`100` progress; concealed `404`    |
| `GET`                      | `/verifyBatch/:id/results`  | `verification:read`             | Binary `text/csv` with a UUID-derived attachment name; concealed `404` for unavailable results |
| `POST` `GET` `GET` `PATCH` | `/emails`, `/emails/:email` | `platform:admin`                | Internal admin cache CRUD, excluded from Swagger — not a verification endpoint                 |

## Queues

| Queue                      | Registered by                                               | Processor                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `async-email-verification` | `AsyncEmailVerificationModule` (5 attempts, custom backoff) | `AsyncEmailVerificationProcessor`                                                                                                                                                                                                                                                              |
| `batch-email-verification` | `BatchEmailVerificationModule`                              | `BatchEmailVerificationProcessor` delegates to the pure `BatchEmailVerificationWorkflow`, a `Validate → Process → WaitForChildren → UploadResults → Finish` state machine that fans out one `async-email-verification` child job per CSV row and waits on all of them before uploading results |
| `verification-reconciliation` | `VerificationReconciliationModule` (one repeatable job every 30 seconds, scheduled via `OnApplicationBootstrap`) | `VerificationReconciliationProcessor` delegates to `VerificationReconciler.reconcile()` — this module's first periodic queue, and currently the only dispatcher for `queued`/due-`awaiting_retry` executions |

## Persistence

| Entity                    | Table                 | Ownership and identity                                                                                                                            |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmailVerificationEntity` | `email_verifications` | Required organization; UUID result ID; adds `verificationQuality`, `evidenceObservedAt`, `evidencePolicyVersion`                                  |
| `DomainPolicyEntity`      | `domains`             | Shared technical policy; domain name                                                                                                              |
| `EmailEntity`             | `emails`              | Organization plus normalized address                                                                                                              |
| `SmtpVerificationEntity`  | `smtp_verifications`  | Organization plus normalized address; lifecycle timestamps, secure-transport proof, and reuse fields `evidenceObservedAt`/`evidencePolicyVersion` |
| `VerificationRequestEntity` | `verification_requests` | UUID request ID; partial unique index on `(organizationId, clientRequestKey)` where the key is not null; durable record of one caller submission |
| `VerificationExecutionEntity` | `verification_executions` | UUID execution ID; partial unique index on `(organizationId, normalizedAddress)` for nonterminal states — at most one live execution per address |
| `VerificationSettlementIntentionEntity` | `verification_settlement_intentions` | UUID execution ID as primary key — enforces at most one settlement intention, ever, per execution |

## S3 / Storage

Batch uploads are stored at `organizations/<organizationId>/uploads/<uuid>` (bucket from `S3_BUCKET`, via
the multer-S3 storage engine in `MulterOptionsFactoryImpl`, under `infrastructure/storage/batch-verification/`).
`S3BatchResultWriter` writes completed results back beside the upload with `/uploads/` replaced by `/results/`
(`derive-results-key.ts`), and `S3BatchResultReader` parses the job's stored `s3://bucket/key` result location back
into a bucket/key pair (`parse-s3-result-location.ts`) when a result is downloaded. The S3 client's own
credentials, region, transport policy, and shared `CustomerObjectWriteSecurity` value are configured once at the API
composition root, not inside this module. Both writers inject that value and always map `no-store`; production maps
the exact SSE-KMS algorithm and key fields as well. Neither writer reads `NODE_ENV` or accepts a local security
override.

Before CSV quoting, the durable result writer prefixes an ASCII apostrophe to customer text beginning with `=`, `+`,
`-`, `@`, tab, carriage return, or line feed. Source email, derived text, and future copied text columns use the same
encoder; trusted identities, status fields, and numeric fields retain their normal encoding. The existing streaming
writer and object-security binding remain the only result publication path. Download streams those retained bytes
without modification and uses `attachment; filename="batch-verification-<uuid>.csv"`, derived from the validated job
UUID. If the S3 result object is missing, the application returns the same `404` as unavailable or foreign work; other storage
failures retain the existing generic error response.

## Configuration

- `S3_BUCKET`
- `CATCH_ALL_HTTP_PROXY_URL` (optional transport; never activates a provider by itself)
- `CATCH_ALL_PROVIDER` (optional; one of `microsoft_get_credential_type`, `microsoft_login`, `mimecast`, or
  `office_apps`)
- `CATCH_ALL_PROVIDER_APPROVAL_ID` and `CATCH_ALL_PROVIDER_REGION` (required with `CATCH_ALL_PROVIDER`)
- `SMTP_PORT` (optional, default 25)
- `SMTP_TLS_CA_FILE` (optional path to an SMTP-only PEM root; default Node trust remains active)
- `VERIFICATION_RESULT_CACHE_TTL_SECONDS` (optional, default 86400, range 1–86400; how long a fresh conclusive
  result stays reusable for free by `VerificationAdmissionService`)
- `VERIFICATION_SUBMISSION_RATE_CAPACITY` (optional positive integer, default 60; token-bucket capacity per
  organization in `RedisVerificationSubmissionLimiter`)
- `VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND` (optional positive integer, default 1; token-bucket refill rate)
- `VERIFICATION_EXECUTION_MAX_CONCURRENT` (optional positive integer, default 5; global outbound execution permit
  cap in `TypeOrmVerificationExecutionPermitStore`, shared by sync, async, and future batch execution)

The runtime always reads `config/privacy/account-discovery-approvals.yaml`; no environment variable can redirect that
path. The committed manifest is empty, so the default development and SMTP workflows select no external provider.
Provider selection also requires the proxy and an exact active, effective, unexpired approval match. Mimecast regions
are limited to `us` and `uk`.

## Validation

Focused tests are grouped by behavior:

- **Email candidate generation**:
  [`application/finding/generate-email-candidates.spec.ts`](src/application/finding/generate-email-candidates.spec.ts)
  and [`application/finding/normalize-finding-input.spec.ts`](src/application/finding/normalize-finding-input.spec.ts)
  cover literal address sequences, collisions, equivalent inputs, Unicode and IDNA normalization, rejection codes,
  length limits, and unchanged inputs. Bruno is not applicable to this private capability because it changes no HTTP
  behavior.
- **Operational tracing**: `infrastructure/verification-trace/logging-verification-trace-observer.spec.ts` covers
  the observer's own logic; the API composition root's request logging tests cover generic HTTP correlation. The
  durable admission/execution/settlement stack that now backs both single-verification routes emits no
  `VerificationTraceObserver` events at all — a recorded, deliberate gap; see the Decision Log in the
  `verification-billing/04` ExecPlan. `EmailVerificationOrchestrator` still emits them for batch's per-child verification.
- **Result lookup**: `api/verification-result-http.integration.spec.ts`,
  `infrastructure/typeorm-verification-result-reader.spec.ts`, and the PostgreSQL ownership integration test.
  The reader normalizes absent `format`, `mxDomain`, and `targetExchange` database values so HTTP responses omit
  these optional fields. The async Bruno collection checks their types when present.

- **Synchronous driver**: `application/delivery/synchronous/run-synchronous-verification.spec.ts` covers `cached`,
  `funded`, `joined`, and `cooldown` admission outcomes, waiting out a retry-scheduled attempt within budget, and every
  fallback-to-`accepted` path (budget exhaustion, lease-lost, not-runnable, a canceled execution settled with no
  result)
- **Synchronous POST behavior and retired GET rejection**: `api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts`
- **Current synchronous controller**: `api/http/synchronous-verification/current/sync-email-verification.controller.spec.ts`
  covers Idempotency-Key parsing, every outcome-to-status-code mapping, and the `201`/`202` response shapes
- **Async application and HTTP**: `application/delivery/async/async-email-verification.service.spec.ts`,
  `application/delivery/async/async-verification-status.spec.ts`,
  `api/http/asynchronous-verification/async-email-verification.controller.spec.ts`,
  `api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts`, and
  `api/http/asynchronous-verification/async-verification.openapi.spec.ts`
- **Shared idempotency/rate-limit transport**: `api/http/verification-idempotency-key-header.spec.ts` and
  `api/http/verification-rate-limit.guard.spec.ts`
- **Verification-execution queue**: `infrastructure/queues/verification-execution/` contains dispatcher, processor
  (including the `moveToDelayed`/`DelayedError` retry-scheduling behavior), and configuration specifications, plus a
  real-Redis `verification-execution-queue.integration.spec.ts` proving dispatch, delayed-retry, and
  permit-unavailable backoff against a real BullMQ worker
- **Submission rate limiting**: `infrastructure/redis/redis-verification-submission-limiter.spec.ts` and its
  real-Redis `.integration.spec.ts`
- **Async queue (batch child dispatch only)**: `infrastructure/queues/async-verification/` contains the worker,
  backoff, and Redis compatibility specifications for the `async-email-verification` queue's remaining role in
  batch's child-verification dispatch. Set `TEST_REDIS_URL` to a disposable Redis instance to run the Redis
  suites; each suite uses its own queue prefix.
- **Async runtime workflow**: `bruno/async-verification` covers the browser-facing async workflow, cache-reuse at
  zero cost, and Idempotency-Key replay/conflict/expiry. The existing `bruno/smtp-dev` collection covers
  submission, completed and repeated polling, single-credit reservation and capture, missing jobs, malformed IDs,
  authentication, and insufficient credits. Its launcher requires an SMTP stack owned by the current checkout.
- **Batch application**: `application/delivery/batch/batch-email-verification.service.spec.ts` and
  `application/delivery/batch/batch-email-verification-workflow.spec.ts` cover upload/status/results and every
  state/effect/replay transition — including the `WaitForChildren` signal, invalid-row and child-dispatch failure
  classification, and completion tracing — entirely against fake ports, with no Nest, BullMQ, or S3 involved
- **Batch public status**: `application/delivery/batch/batch-verification-status.spec.ts` covers all application
  snapshots, missing result locations, safe failure fallbacks, successful retries, and unknown future states.
- **Batch HTTP**: `api/http/batch-verification/batch-email-verification.controller.spec.ts`,
  `api/http/batch-verification/batch-verification-http.integration.spec.ts`, and
  `api/http/batch-verification/batch-verification.openapi.spec.ts` cover multipart validation, safe status serialization,
  authorization, ownership checks, binary download bytes, safe filenames, and explicit Swagger contracts.
- **Batch queue adapters**: `infrastructure/queues/batch-verification/batch-email-verification.processor.spec.ts`,
  `infrastructure/queues/batch-verification/bull-batch-jobs.spec.ts`,
  `infrastructure/queues/batch-verification/bull-batch-child-flow.spec.ts`, and the real-Redis
  `infrastructure/queues/batch-verification/batch-email-verification-queue.integration.spec.ts` (set
  `TEST_REDIS_URL` to a disposable Redis instance; proves the real parent/child `moveToWaitingChildren`
  coordination end to end)
- **Batch storage adapters**: `infrastructure/storage/batch-verification/s3-batch-input.spec.ts`,
  `infrastructure/storage/batch-verification/s3-batch-result-writer.spec.ts`,
  `infrastructure/storage/batch-verification/s3-batch-result-reader.spec.ts`,
  `infrastructure/storage/batch-verification/derive-results-key.spec.ts`,
  `infrastructure/storage/batch-verification/parse-s3-result-location.spec.ts`, and
  `infrastructure/storage/batch-verification/multer-options-factory-impl.service.spec.ts`; the writer
  specification reuses the common customer-object security contract for production and development mappings and
  verifies every spreadsheet-formula prefix, CSV quoting, ordinary values, future text fields, and streaming chunks
- **Email administration**: `api/http/email-administration/email-administration.controller.spec.ts`
- **Domain/application core**: `application/domain-policy.service.spec.ts`,
  `application/email-administration.service.spec.ts`, `application/mailbox-verification.service.spec.ts`,
  `application/email-verification.service.spec.ts`
- **Evidence classification**: `domain/verification-evidence.spec.ts` (pure evidence-derivation table covering
  every prerequisite, command stage, and status-code combination) and
  `application/classify-verification-quality.spec.ts` (quality and observation-time derivation table)
- **Persistence stores**: `infrastructure/persistence/typeorm-email.store.spec.ts`,
  `infrastructure/persistence/typeorm-domain.store.spec.ts`,
  `infrastructure/persistence/typeorm-verification.store.spec.ts`,
  `infrastructure/persistence/typeorm-smtp-verification.store.spec.ts`, and the real-Postgres
  `infrastructure/persistence/typeorm-stores-organization-isolation.integration.spec.ts`
- **DNS and synonym discovery**: specifications below `infrastructure/discovery/dns/` and
  `infrastructure/discovery/http/`, plus `domain/domain-synonym-parser.spec.ts`; deterministic DNS and local HTTP
  fixtures cover success, failures, configured deadlines, and parsing
- **Mailbox probe adapter**: `infrastructure/mailbox/smtp/smtp-mailbox-probe.spec.ts`,
  `infrastructure/mailbox/smtp/smtp-client.factory.spec.ts`, `infrastructure/mailbox/smtp/smtp-client.spec.ts`,
  `infrastructure/mailbox/smtp/smtp.util.spec.ts`, `infrastructure/smtp/smtp-trust.spec.ts`, and
  `../../socket/src/tls-connect.spec.ts`
- **Account discovery**: `application/account-discovery/account-discovery.service.spec.ts`,
  `application/account-discovery/approved-account-discovery-verifier.spec.ts`,
  `application/account-discovery/select-account-discovery-verifier.spec.ts`,
  `infrastructure/account-discovery/account-discovery-composition.spec.ts`,
  `infrastructure/account-discovery/account-discovery.module.spec.ts`,
  `infrastructure/account-discovery/account-discovery-wiring.spec.ts` (real Nest composition with fake outbound
  dependencies, covering positive evidence, disabled discovery, and approval expiry),
  `infrastructure/account-discovery/configured-account-discovery.spec.ts`,
  `infrastructure/account-discovery/http-module-options.factory.spec.ts`, the provider adapter specifications
  under `infrastructure/account-discovery/providers/`, and `scripts/privacy/account-discovery-approvals.spec.ts` and
  `scripts/security/scan-linkedin-session-material.spec.ts`
- **Ownership schema and PostgreSQL isolation**: `verification-entities.spec.ts`,
  `verification-organization-ownership.integration.spec.ts`
- **Verification operations and billing recovery**: `application/verification-idempotency-key.spec.ts`,
  `application/verification-result-cache.spec.ts`, `application/operations/verification-operation-metadata.spec.ts`,
  and `application/operations/verification-admission.service.spec.ts` (including the `address-cooldown` outcome).
  Execution and settlement tests include
  `application/operations/verification-execution-runner.spec.ts` (including a fake-timer crash-injection test for
  a lease lost mid-probe, and the permit-acquire/release/renew paths), `application/operations/verification-settlement.service.spec.ts`,
  `application/operations/verification-operations-reader.spec.ts`,
  and `application/operations/verification-reconciler.spec.ts` (including the deadline-cancellation credit-release and
  request-settlement path). Persistence tests include `infrastructure/persistence/typeorm-verification-request.store.spec.ts`,
  `infrastructure/persistence/typeorm-verification-execution.store.spec.ts` (covers the optimistic-insert/unique-
  violation address-claim race), `infrastructure/persistence/typeorm-verification-settlement.store.spec.ts`,
  `infrastructure/persistence/typeorm-verification-result-cache-reader.spec.ts`, and
  `infrastructure/persistence/typeorm-verification-execution-permit.store.spec.ts`. The real-Postgres
  `infrastructure/persistence/verification-billing.integration.spec.ts` covers a concurrent admission race, the full
  funded-capture-and-cache-reuse pipeline, insufficient-funds fencing, settlement replay, and permit concurrency.
  It also includes a deterministic regression test for the transaction-poisoning race in the catch branch of
  `claimOrJoin()`. These tests use a real, freshly-synced schema shared with the full `identity` entity set. Run
  `corepack pnpm test:verification-billing-postgres` for the disposable real-Postgres stack — its own
  `verification_billing_test` database, modeled on `test:credits-postgres`.

[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) drives real DNS/proxy/SMTP wiring against a trusted, deterministic STARTTLS fixture (`docker/smtp-dev/evidence-server.mjs`) and an intentionally plaintext fixture inside the local Docker network. It proves that the trusted path succeeds and that the plaintext path returns `secure_transport_unavailable` before `MAIL FROM` or `RCPT TO`, rather than testing real-world deliverability. Its fixture-only HTTP control endpoint selects a closed scenario enum so the same collection also proves target
acceptance, exact `5.1.1` recipient rejection, and an identical `MAIL FROM`-stage rejection staying ineligible.
Further scenarios cover a bare rejection, an ambiguous `5.7.1` rejection, a temporary rejection, and an accepted
answer surviving a connection close before `QUIT` completes, using independent `evidence.lef.test` target
addresses. The temporary rejection schedules a durable retry instead of settling immediately. Its first backoff
does not fit the synchronous route's 30-second budget, so it falls back to the same `202` handle the async route
would return. Its own reservation remains pending rather than captured; the other six scenarios each capture
exactly one credit immediately. The collection also drains and restores the fixture proxy through [`proxy`](../proxy/README.md).
It proves that `POST /verify` rejects a zero balance with `402`. For a successful `201` request against its catch-all
default fixture domain, it reserves then releases one credit rather than capturing it.
The plain `@lef.test` MX always accepts its catch-all control probe too, so it is never classified conclusive.
Only the scenario-selectable `evidence.lef.test` fixture can produce a chargeable result.
Both checks use their own dedicated address, never
reused elsewhere in the collection, since a just-settled address would still carry the 60-second address cooldown.
The retired `GET /verify` returns `404` while one credit is available, leaves that balance unchanged, and returns
a server request UUID. The collection retains the asynchronous checks, including its own dedicated zero-balance
and single-credit addresses, and requires all 47 requests to execute.
Its final admin-cache requests cover an owned update and the not-found concealment for an address outside the
authenticated organization's cache.
[`bruno/batch-verification`](../../../../bruno/batch-verification/README.md) uploads a fixture CSV, polls to
completion, and downloads the results, asserting the returned CSV's `email` column matches what was uploaded.
