# Email Verification

Verifies whether an email address can plausibly receive mail — synchronously, asynchronously as a background
job, or in CSV batches — by resolving its domain's MX records and, where safe, connecting to them over SMTP
through a leased proxy. It also owns the email/domain persistence those checks cache, and a deprecated
compatibility route kept billing- and permission-equivalent to its replacement.

## Responsibility

- Current synchronous verification (`POST /verify`) and its deprecated predecessor (`GET /verify`), billed and
  authorized identically.
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
results. Current synchronous and completed async responses expose the verification `id`; the deprecated response body
is unchanged. Batch CSV files retain their existing verification `id` column.

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

[`src/index.ts`](src/index.ts) exports only `EmailVerificationModule`, which composes four top-level Nest
submodules — `SyncEmailVerificationModule`, `AsyncEmailVerificationModule`, `BatchEmailVerificationModule`, and
`OldSyncEmailVerificationModule` (the deprecated route) — plus, transitively, `DomainModule`, `EmailModule`, and
`EmailVerifierModule` (which in turn composes an SMTP submodule). Several of these submodules have their own
internal barrels, but none of that is exported again by the top-level `src/index.ts`: from outside this module, the
only public surface is `EmailVerificationModule` itself and the HTTP/queue behavior below. The top-level module also
wires the internal result reader and its controller. The shared result DTO lives in `src/api/`; the trace port lives
in `src/application/verification-trace/`, with Nest logging wiring in `src/infrastructure/verification-trace/`.

## Pure Core (Not Yet Wired)

`src/domain/` and `src/application/` also hold a framework-free domain and application core
(`module-architecture/10`), added alongside the flat implementation above. It defines plain `Email`,
`DomainPolicy`, `EmailVerification`, and `SmtpVerification` records and typed errors, plus seven purpose-specific
ports under `application/ports/` — `EmailStore`, `DomainStore`, `VerificationStore`, `SmtpVerificationStore`,
`MxResolver`, `DomainSynonymDiscovery`, and `MailboxProbe` — and the central verification sequence
(`EmailVerificationOrchestrator`, `MailboxVerificationService`) plus email/domain administration use cases
(`EmailAdministrationService`, `DomainPolicyService`) built on top of them. None of it is wired into
`EmailVerificationModule`, imports any port implementation, or changes any route, DTO, or persistence behavior
yet. `module-architecture/17` implements the four persistence ports. `module-architecture/18` implements the
three network ports, composes the final module, moves the `/emails` administration API, and cuts every delivery
mode over to this core.

## Dependencies

- [`credits`](../credits/README.md) — `CreditGuard` on every billed route, and `CreditsService.debit()` called
  directly by the batch processor (one credit per validated CSV row).
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
| `GET`                      | `/verify`                   | `verification:run` + one credit | **Deprecated** — same authorization and billing as `POST /verify`              |
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
| `batch-email-verification` | `BatchEmailVerificationModule`                              | `BatchEmailVerificationProcessor` — a `Validate → Process → WaitForChildren → UploadResults → Finish` state machine that fans out one `async-email-verification` child job per CSV row and waits on all of them before uploading results |

## Persistence

| Entity              | Table                 | Ownership and identity                                                                |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `EmailVerification` | `email_verifications` | Required organization; UUID result ID                                                 |
| `Domain`            | `domains`             | Shared technical policy; domain name                                                  |
| `Email`             | `emails`              | Organization plus normalized address                                                  |
| `SmtpVerification`  | `smtp_verifications`  | Organization plus normalized address; lifecycle timestamps and secure-transport proof |

## S3 / Storage

Batch uploads are stored at `organizations/<organizationId>/uploads/<uuid>` (bucket from `S3_BUCKET`, via a
multer-S3 storage engine). Completed results are written back beside the upload with `/uploads/` replaced by
`/results/` (`derive-results-key.ts`), and the job's stored `s3://bucket/key` result location is parsed back
into a bucket/key pair by `parse-s3-result-location.ts` when a result is downloaded. The S3 client's own
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

- **Synchronous**: `sync-email-verification/sync-email-verification.controller.spec.ts`
- **Deprecated synchronous**: `old-sync-email-verification/old-sync-email-verification.controller.spec.ts`,
  `old-sync-email-verification/old-sync-email-verification-http.integration.spec.ts`
- **Async**: `async-email-verification/async-email-verification.controller.spec.ts`,
  `async-email-verification/async-email-verification.service.spec.ts`
- **Batch**: `batch-email-verification/batch-email-verification.controller.spec.ts`,
  `batch-email-verification/batch-email-verification.processor.spec.ts`,
  `batch-email-verification/batch-email-verification.service.spec.ts`,
  `batch-email-verification/derive-results-key.spec.ts`,
  `batch-email-verification/parse-s3-result-location.spec.ts`,
  `batch-email-verification/multer-options-factory-impl.service.spec.ts`; the two writer specifications reuse the
  common customer-object security contract for production and development mappings
- **Domain/Email persistence**: `domain/domain.service.spec.ts`, `domain/domain-synonym-finder.spec.ts`,
  `email/email.controller.spec.ts`, `email/email.profile.spec.ts`, `email/email.service.spec.ts`
- **SMTP engine**: `email-verifier/email-verifier.spec.ts`, `email-verifier/smtp/smtp-client.factory.spec.ts`,
  `email-verifier/smtp/smtp-client.spec.ts`, `email-verifier/smtp/smtp-verifier.spec.ts`,
  `infrastructure/smtp/smtp-trust.spec.ts`, and `../../socket/src/tls-connect.spec.ts`
- **Account discovery**: `application/account-discovery/approved-account-discovery-verifier.spec.ts`,
  `application/account-discovery/select-account-discovery-verifier.spec.ts`,
  `email-verifier/email-verifier.module.spec.ts`, the provider adapter specifications under `src/libs/catch-all`, and
  `scripts/privacy/account-discovery-approvals.spec.ts` and
  `scripts/security/scan-linkedin-session-material.spec.ts`
- **Ownership schema and PostgreSQL isolation**: `verification-entities.spec.ts`,
  `verification-organization-ownership.integration.spec.ts`
- **Pure core (not yet wired)**: `application/domain-policy.service.spec.ts`,
  `application/email-administration.service.spec.ts`, `application/mailbox-verification.service.spec.ts`,
  `application/email-verification.service.spec.ts`

[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) drives real DNS/proxy/SMTP wiring against a trusted STARTTLS fixture and an intentionally plaintext fixture inside the local Docker network. It proves that the trusted path succeeds and that the plaintext path returns `secure_transport_unavailable` before `MAIL FROM` or `RCPT TO`, rather than testing real-world deliverability. It also
drains and restores the fixture proxy through [`proxy`](../proxy/README.md), and proves the deprecated
`GET /verify` route costs the same one credit as `POST /verify`, including the `402` rejection at zero balance.
Its final admin-cache requests cover an owned update and the not-found concealment for an address outside the
authenticated organization's cache.
[`bruno/batch-verification`](../../../../bruno/batch-verification/README.md) uploads a fixture CSV, polls to
completion, and downloads the results, asserting the returned CSV's `email` column matches what was uploaded.
