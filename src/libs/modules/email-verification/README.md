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
administration use cases (`EmailAdministrationService`, `DomainPolicyService`), and eight purpose-specific ports
under `application/ports/` — `EmailStore`, `DomainStore`, `VerificationStore`, `SmtpVerificationStore`,
`MxResolver`, `DomainSynonymDiscovery`, `MailboxProbe`, and `AccountDiscovery`; `infrastructure/` holds technical adapters, and `api/`
holds the HTTP surface. Neither `domain/` nor `application/` imports Nest, TypeORM, Automapper, or any network
client.

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
technical need.

`infrastructure/email-verification-core.module.ts` composes the core: it registers the four consumed
persistence entities with TypeORM, builds every application service and port through explicit factory providers
(no bare `@Injectable()` on a framework-free class), and exports `EmailVerificationOrchestrator` internally.
The async module retains its `EmailVerificationServiceToken` binding to that orchestrator; the batch module
continues to consume the same core composition.

The synchronous controller and body DTO live under `api/http/synchronous-verification/current/`.
The controller invokes the private `RUN_SYNCHRONOUS_VERIFICATION` token. Its framework-free `RunSynchronousVerification` implementation under
`application/delivery/synchronous/` normalizes the address and passes the organization and optional trace to a
narrow verification port. The root binds that port to the existing orchestrator. HTTP permission and credit guards
remain on POST; the command performs no credit operations. Validation still follows the credit guard, so an
authorized invalid request consumes one credit. Domain-policy rejection and unexpected adapter failures retain
their generic `500` response. The `/emails` administration API remains at `api/http/email-administration/`, wired
by the root to `EmailAdministrationService`.

Async HTTP controllers and DTOs live under `api/http/asynchronous-verification/`. The framework-independent
`AsyncEmailVerificationService` under `application/delivery/async/` accepts scalar organization and credential
identity, dispatches through `AsyncVerificationJobs`, and checks ownership before reading job state. Missing and
foreign jobs produce the same application error, which the controller maps to the existing `404`. The application
maps the existing state enum and includes a result only for completed jobs; status reads perform no credit debit
or queue submission.

`infrastructure/queues/async-verification/` owns `BullAsyncVerificationJobs`, the serialized job contract,
queue defaults, custom backoff, and `AsyncEmailVerificationProcessor`. Its private composition module exports the
application service token to the root and binds `EmailVerificationServiceToken` to the existing orchestrator.
The worker maps one existing payload to one organization-scoped verification command per attempt, excluding the
credential ID, and preserves the greylist exception and trace context. There is one async worker.

Batch HTTP controllers and DTOs live under `api/http/batch-verification/`. `application/delivery/batch/` holds the
transport-neutral `BatchEmailVerificationService` (upload registration, owned status, and owned result retrieval)
and the pure `BatchEmailVerificationWorkflow`, which walks the same `Validate → Process → WaitForChildren →
UploadResults → Finish` state transitions through five narrow ports — `BatchJobs`, `BatchChildFlow`, `BatchInput`,
`BatchResultWriter`, and `BatchResultReader` — instead of BullMQ, S3, or TypeORM directly. A `WaitForChildren` step
still pending raises the framework-free `BatchAwaitingChildrenSignal`; `infrastructure/queues/batch-verification/`'s
thin `BatchEmailVerificationProcessor` is the only place that translates that signal into BullMQ's own
`WaitingChildrenError`. `BullBatchJobs` and `BullBatchChildFlow` implement the queue-facing ports, registering the
same `batch-email-verification` and `async-email-verification` queues as before; `S3BatchInput`, `S3BatchResultWriter`,
and `S3BatchResultReader` under `infrastructure/storage/batch-verification/` implement the storage-facing ports,
preserving the exact CSV parsing/validation, alias-prefixed TypeORM result-row mapping, and S3 upload/read mechanics.
`CreditsService.debit()` is called directly by the workflow, one credit per validated CSV row, matching the
established cross-module dependency pattern of injecting another module's public application service. No
email-verification architecture-baseline violation remains.

## Dependencies

- [`credits`](../credits/README.md) — `CreditGuard` on every billed route, and `CreditsService.debit()` called
  directly by the batch workflow (one credit per validated CSV row).
- [`proxy`](../proxy/README.md) — the `IProxyService`/`IProxyAllocator` contracts and DI tokens, through its
  public barrel; SMTP verification acquires and releases leases through these contracts, not through any deep
  import into the implementation of `proxy` itself.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `RequirePermissions`,
  `CurrentPrincipal`.
- [`identity`](../identity/README.md) — the `AuthPrincipal` type.

## HTTP Surface

| Method                     | Path                        | Access                          | Notes                                                                          |
| -------------------------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `POST`                     | `/verify`                   | `verification:run` + one credit | Current synchronous verification                                               |
| `GET`                      | `/verifications/:id`       | `verification:read`             | Owned persisted result; `404` for missing or foreign IDs, `400` for invalid UUIDs |
| `POST`                     | `/verifyAsync`              | `verification:run` + one credit | `202 Accepted`; enqueues an async job                                          |
| `GET`                      | `/verifyAsync/:id`          | `verification:read`             | `404` if the job doesn't exist or isn't owned by the caller                    |
| `POST`                     | `/verifyBatch/csv`          | `verification:run`              | `202 Accepted`; multipart CSV upload, `100MB` max                              |
| `GET`                      | `/verifyBatch/:id`          | `verification:read`             | Bounded `0`–`100` progress; `404` if not found/owned                           |
| `GET`                      | `/verifyBatch/:id/results`  | `verification:read`             | Streams the completed job's CSV (`text/csv`); `404` if not found/owned         |
| `POST` `GET` `GET` `PATCH` | `/emails`, `/emails/:email` | `platform:admin`                | Internal admin cache CRUD, excluded from Swagger — not a verification endpoint |

## Queues

| Queue                      | Registered by                                               | Processor                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `async-email-verification` | `AsyncEmailVerificationModule` (5 attempts, custom backoff) | `AsyncEmailVerificationProcessor`                                                                                                                                                                                                        |
| `batch-email-verification` | `BatchEmailVerificationModule`                              | `BatchEmailVerificationProcessor` delegates to the pure `BatchEmailVerificationWorkflow`, a `Validate → Process → WaitForChildren → UploadResults → Finish` state machine that fans out one `async-email-verification` child job per CSV row and waits on all of them before uploading results |

## Persistence

| Entity                    | Table                 | Ownership and identity                                                                |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `EmailVerificationEntity`  | `email_verifications` | Required organization; UUID result ID                                                 |
| `DomainPolicyEntity`       | `domains`             | Shared technical policy; domain name                                                  |
| `EmailEntity`              | `emails`              | Organization plus normalized address                                                  |
| `SmtpVerificationEntity`   | `smtp_verifications`  | Organization plus normalized address; lifecycle timestamps and secure-transport proof |

## S3 / Storage

Batch uploads are stored at `organizations/<organizationId>/uploads/<uuid>` (bucket from `S3_BUCKET`, via
`MulterOptionsFactoryImpl`'s multer-S3 storage engine, under `infrastructure/storage/batch-verification/`).
`S3BatchResultWriter` writes completed results back beside the upload with `/uploads/` replaced by `/results/`
(`derive-results-key.ts`), and `S3BatchResultReader` parses the job's stored `s3://bucket/key` result location back
into a bucket/key pair (`parse-s3-result-location.ts`) when a result is downloaded. The S3 client's own
credentials, region, transport policy, and shared `CustomerObjectWriteSecurity` value are configured once at the API
composition root, not inside this module. Both writers inject that value and always map `no-store`; production maps
the exact SSE-KMS algorithm and key fields as well. Neither writer reads `NODE_ENV` or accepts a local security
override.

## Configuration

- `S3_BUCKET`
- `CATCH_ALL_HTTP_PROXY_URL` (optional transport; never activates a provider by itself)
- `CATCH_ALL_PROVIDER` (optional; one of `microsoft_get_credential_type`, `microsoft_login`, `mimecast`, or
  `office_apps`)
- `CATCH_ALL_PROVIDER_APPROVAL_ID` and `CATCH_ALL_PROVIDER_REGION` (required with `CATCH_ALL_PROVIDER`)
- `SMTP_PORT` (optional, default 25)
- `SMTP_TLS_CA_FILE` (optional path to an SMTP-only PEM root; default Node trust remains active)

The runtime always reads `config/privacy/account-discovery-approvals.yaml`; no environment variable can redirect that
path. The committed manifest is empty, so the default development and SMTP workflows select no external provider.
Provider selection also requires the proxy and an exact active, effective, unexpired approval match. Mimecast regions
are limited to `us` and `uk`.

## Validation

Focused tests are grouped by behavior:

- **Operational tracing**: `infrastructure/verification-trace/logging-verification-trace-observer.spec.ts`,
  `infrastructure/verification-trace/verification-trace.integration.spec.ts`, the synchronous service and queue
  specifications, and the API composition root's request logging tests
- **Result lookup**: `api/verification-result-http.integration.spec.ts`,
  `infrastructure/typeorm-verification-result-reader.spec.ts`, and the PostgreSQL ownership integration test

- **Synchronous application command**: `application/delivery/synchronous/run-synchronous-verification.spec.ts`
- **Synchronous POST behavior and retired GET rejection**: `api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts`
- **Current synchronous controller**: `api/http/synchronous-verification/current/sync-email-verification.controller.spec.ts`
- **Async application and HTTP**: `application/delivery/async/async-email-verification.service.spec.ts`,
  `api/http/asynchronous-verification/async-email-verification.controller.spec.ts`, and
  `api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts`
- **Async queues and composition**: `infrastructure/queues/async-verification/` contains producer, worker, backoff,
  Redis compatibility, and production Nest composition specifications. Set `TEST_REDIS_URL` to a disposable Redis
  instance to run the Redis suites; each suite uses its own queue prefix.
- **Async runtime workflow**: `bruno/smtp-dev` covers submission, completed and repeated polling, one-credit debit,
  missing jobs, malformed IDs, authentication, and insufficient credits. Its launcher requires an SMTP stack owned
  by the current checkout.
- **Batch application**: `application/delivery/batch/batch-email-verification.service.spec.ts` and
  `application/delivery/batch/batch-email-verification-workflow.spec.ts` cover upload/status/results and every
  state/effect/replay transition — including the `WaitForChildren` signal, invalid-row and child-dispatch failure
  classification, and completion tracing — entirely against fake ports, with no Nest, BullMQ, or S3 involved
- **Batch HTTP**: `api/http/batch-verification/batch-email-verification.controller.spec.ts`
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
  specification reuses the common customer-object security contract for production and development mappings
- **Email administration**: `api/http/email-administration/email-administration.controller.spec.ts`
- **Domain/application core**: `application/domain-policy.service.spec.ts`,
  `application/email-administration.service.spec.ts`, `application/mailbox-verification.service.spec.ts`,
  `application/email-verification.service.spec.ts`
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

[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) drives real DNS/proxy/SMTP wiring against a trusted STARTTLS fixture and an intentionally plaintext fixture inside the local Docker network. It proves that the trusted path succeeds and that the plaintext path returns `secure_transport_unavailable` before `MAIL FROM` or `RCPT TO`, rather than testing real-world deliverability. It also
drains and restores the fixture proxy through [`proxy`](../proxy/README.md), and proves that
`POST /verify` consumes one credit and rejects a zero balance with `402`. The retired `GET /verify` returns `404`
while one credit is available, leaves that balance unchanged, and returns a server request UUID. The collection
retains the asynchronous checks and requires all 30 requests to execute.
Its final admin-cache requests cover an owned update and the not-found concealment for an address outside the
authenticated organization's cache.
[`bruno/batch-verification`](../../../../bruno/batch-verification/README.md) uploads a fixture CSV, polls to
completion, and downloads the results, asserting the returned CSV's `email` column matches what was uploaded.
