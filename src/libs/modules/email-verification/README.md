# Email Verification

Checks whether an address can receive mail through single requests or CSV batches. It resolves MX records (DNS
records naming a domain's mail servers), then probes SMTP (the mail-transfer protocol) through an allocated proxy.
Verification is a deliverability signal, not consent or permission to contact someone.

## Responsibility

- Synchronous/background verification and batch upload, status, and retained-result download.
- Organization-scoped results, cache reuse, and durable admission/execution/billing recovery.
- Certificate-verified STARTTLS: upgrade SMTP to TLS (Transport Layer Security) encryption before sending
  the SMTP sender or recipient address.
- Catch-all detection: test whether a domain accepts an intentionally nonexistent control address.
- Approved account-discovery enrichment and the internal email/domain administration cache.
- Private, deterministic email candidate generation; candidates alone do not prove mailbox existence or identity.

## Non-Responsibilities

[`credits`](../credits/README.md) owns credit accounting; [`proxy`](../proxy/README.md) owns proxy selection/allocation;
[`identity`](../identity/README.md) and [`auth`](../auth/README.md) own identity and authorization. The API composition
root owns transport/object-encryption configuration. Repository owners supply external-provider approvals.

## Privacy and Data Lifecycle

Email, verification, SMTP evidence, and batch reads are scoped to the authenticated organization. Cache keys include
organization and normalized address; the shared `domains` table contains only operator-managed technical policy.
Missing and foreign result/job IDs both return `404`; callers cannot override the organization.

Retention is incomplete: terminal batch jobs have no age-based cleanup, and batch inputs/results have no deletion
path. Do not interpret a visibility timeout as deletion. This module sends no commercial messages and does not decide
consent, lawful basis, marketing eligibility, or suppression obligations.

## Operational Logging

The API returns a server-generated UUID (unique ID) in `X-Request-ID`, including failures. Logs retain only this ID,
method, sanitized path, response status, duration, stable operation/reason codes, numeric SMTP status, and opaque
internal IDs. Query strings are dropped; email-administration paths become `/emails/:sensitive`.

Never log addresses, local parts, domains, stable address hashes, raw URLs, request bodies/headers, cookies,
authorization, client network details, SMTP commands/replies, provider payloads, or external exception text/stacks.
An authorized `verification:read` result lookup is required to resolve a verification ID to customer data.

The legacy `VerificationTraceObserver` emits safe lifecycle events, but the current durable single/batch stack emits
none through that port. Generic HTTP correlation remains available. Observer failures must never alter results or billing.

## Public API

[`src/index.ts`](src/index.ts) exports only `EmailVerificationModule`. Services, persistence adapters, transport types,
and application ports (interfaces describing required capabilities) remain internal.

## Architecture

`domain/` contains plain records and evidence rules; `application/` contains workflows and ports; `api/` translates
HTTP; `infrastructure/` implements database, SMTP, Redis, queue, and object-storage integrations. Application/domain
code does not import Nest (the application framework), TypeORM (the database mapper), or network clients. Module factories connect implementations to their ports.

### Evidence and charging

Policy version 1 accepts decisive evidence only at `RCPT TO` (the SMTP recipient stage), after verified TLS and an
accepted sender:

| Quality               | Required evidence                                                                                                      | Billing                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `conclusive_positive` | Target returns `250`, and the nonexistent control returns a `5xx` with exact enhanced code `5.1.1` (missing recipient) | Capture one reserved credit |
| `conclusive_negative` | Target returns `5xx` with exact `5.1.1`                                                                                | Capture one reserved credit |
| `inconclusive`        | Any other combination                                                                                                  | Release the reservation     |

A catch-all, ambiguous/temporary rejection, wrong-stage rejection, or empty MX result cannot establish mailbox
absence. A later `QUIT` failure cannot erase an already decisive recipient answer. Stored evidence is reusable only
for the same organization, current policy, verified transport, and age strictly below 24 hours. Its observation time
is the oldest decisive input, never the time it was read.

### Single-verification lifecycle

Admission decides whether to reuse cached evidence, join work, or fund a new execution. Execution performs the
probe. Settlement confirms a capture or release against durable state.

1. An optional `Idempotency-Key` makes retrying an uncertain submission safe. It must be one canonical lowercase
   UUIDv7 (a unique ID carrying its creation time); repeated headers are rejected. First use allows age up to 24 hours
   and clock lookahead up to 5 minutes. Existing requests replay their stored outcome; changing address/delivery mode
   conflicts rather than creating another operation.
2. Fresh, conclusive cache hits are free. A terminal inconclusive result imposes a 60-second address cooldown; single
   submission returns `429` without creating work or holding credit.
3. An organization/address lock rechecks the cache and either joins the existing execution or creates one. A new
   execution reserves one credit: a hold reduces `available`, while leaving `balance` unchanged. Insufficient funds
   closes the attempted admission durably, preventing delayed retries from creating a hold after a top-up.
4. The runner acquires a global execution permit and a 60-second lease (temporary worker ownership), renewed every
   5 seconds. A generation fence (an ownership version checked on writes) rejects superseded workers. Lease loss
   aborts the probe. Temporary SMTP blocking retries after `(generation + 1)` minutes; other probe failures after
   10 seconds. Unavailable permits use the queue's 250-millisecond retry delay.
5. A persisted settlement intention records capture/release before calling credits. Replaying after a crash cannot
   debit twice. Confirmation settles linked requests atomically; only the payer is charged, while joined requests
   remain free. The email cache becomes visible after settlement.

Every submission, including free reuse, consumes the organization's token-bucket rate limit (a replenishing allowance
of submissions). Limiter failure returns `503 rate_limit_unavailable`, rather than admitting without a limit.

`POST /verify` drives its own execution for at most 30 seconds and returns `201` if completed. If still pending,
retrying, or no longer owned, it returns `202 { id }` with `Location: /verifyAsync/<id>`; background recovery continues.
Closing the HTTP connection does not cancel billing. `POST /verifyAsync` returns the same polling handle immediately.
Public states are `queued`, `running`, `completed`, `failed`, and `unavailable`; terminal handles expire from reads
after seven days. Settled responses include `operation: { id, source, observedAt, cacheExpiresAt, billing }`, with
billing state/reserved/charged counts and a final reason once settled. Result-ID lookup has no single billing
operation and omits this metadata.

The reconciler (a periodic repair worker) runs every 30 seconds. It redispatches missed/due work, recovers abandoned
leases after a five-second grace, completes settlement, and cancels executions past a 24-hour deadline. An existing
capture intention wins over cancellation; otherwise cancellation releases the hold and settles linked requests free.
Legacy `EmailVerificationOrchestrator` and verification-time domain-policy enforcement remain wired but have no
current submission caller.

### Batch lifecycle

`Validate → Admit → Dispatch → AwaitSettlement → UploadResults → Finish` is driven by PostgreSQL state, not queue-child
counts. Validation preserves every original row and freezes a manifest (the durable per-address admission record).
Each unique normalized address resolves as `created`, `shared`, `cache`, or `cooldown`.

- Single and batch admission serialize within the organization. One batch owner uses a renewed 60-second lease and
  generation fence; writes verify ownership under the group lock. Lock order is organization, group, execution.
  Credit/network calls and waits never occur inside those transactions.
- Each advancement performs at most 100 address steps plus one indivisible whole-group credit operation. A later
  advancement resumes from persisted incomplete rows. Recovery sweeps process at most 100 groups fairly, after single
  execution recovery, without depending on the batch queue.
- Funding reserves all newly created executions atomically. Approval queues them; denial cancels unstarted work and
  closes every admission ID permanently. A top-up does not reopen denied work.
- Each unique address has an immutable payer-request UUID. Interrupted claim/receipt insertion reuses the committed
  execution and receipt identity; incompatible reuse fails. Shared executions retain their original payer.
  Receipt finalization means every receipt exists, not that billing has settled.
- Duplicate input rows never create another charge. CSV output preserves original order/spelling; only the first
  occurrence reports the address's charge, while duplicates report `duplicateOfRow`, `creditsCharged: 0`, and
  `billingReason: 'duplicate'`.

Batch status reports the five public states, `resultsAvailable`, per-address `counts`, and aggregate `billing`.
Cache/shared/cooldown categories stay fixed at admission; conclusive/inconclusive/failed counts refer to created
addresses. Failure codes are `invalid_csv`, `insufficient_credits`, or `processing_failed`; failure alone says nothing
about charges. Results are available only for a completed job with a valid retained location. Polling does not probe
storage, so a later missing object can still make download return `404`.

## Email Candidate Generation

Private [`generateEmailCandidates`](src/application/finding/generate-email-candidates.ts) returns up to 16 unique
addresses in fixed version-1 pattern order. Collisions merge pattern identities without moving the first occurrence;
oversized patterns are recorded as omissions. All-too-long results fail with `no_candidates`.

Normalization limits names to 100 Unicode code points and normalized tokens to 64 ASCII letters. NFKD (Unicode
compatibility decomposition) enables combining-mark removal; supported spaces/apostrophes/hyphens are removed,
and unsupported characters fail without guessed transliteration. IDNA converts internationalized domain names to
ASCII. Complete hostnames/subdomains are accepted, including one final root dot; URLs, IPs, malformed/single-label
hosts, numeric final labels, and oversized addresses are rejected. Local parts are limited to 64 bytes and full
addresses to 254 bytes. Generation has no HTTP route, public export, logging, network, persistence, or billing effect.

## Dependencies

- [`credits`](../credits/README.md): `CreditReservationService` for admission, capture/release, and batch closure.
- [`proxy`](../proxy/README.md): public service/allocation contracts for SMTP leases.
- [`auth`](../auth/README.md): permission guards and principal lookup.
- [`identity`](../identity/README.md): authenticated actor type.

## HTTP Surface

| Method                 | Path                        | Permission / behavior                                            |
| ---------------------- | --------------------------- | ---------------------------------------------------------------- |
| `POST`                 | `/verify`                   | `verification:run`; synchronous budget, then background fallback |
| `POST`                 | `/verifyAsync`              | `verification:run`; `202` polling handle                         |
| `GET`                  | `/verifyAsync/:id`          | `verification:read`; owned operation status                      |
| `GET`                  | `/verifications/:id`        | `verification:read`; owned persisted result                      |
| `POST`                 | `/verifyBatch/csv`          | `verification:run`; multipart CSV, maximum `100MB`, `202`        |
| `GET`                  | `/verifyBatch/:id`          | `verification:read`; owned batch status                          |
| `GET`                  | `/verifyBatch/:id/results`  | `verification:read`; retained CSV attachment                     |
| `POST`, `GET`, `PATCH` | `/emails`, `/emails/:email` | `platform:admin`; internal cache, excluded from Swagger          |

The retired `GET /verify` returns `404` without verification or debit. Malformed result UUIDs return `400`;
missing/foreign/unavailable results share `404`. Single admission exposes `402` for insufficient funds, `409` for
key conflicts, `410` for expired keys, and `429` for rate limits/cooldown. `Retry-After` specifies cooldown recovery.

## Queues

BullMQ is the Redis-backed queue runner; PostgreSQL, rather than queue records, owns durable verification state.

| Queue                         | Work                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `verification-execution`      | Shared single/batch execution dispatch; execution ID is the idempotent job ID |
| `batch-email-verification`    | Batch lifecycle progression                                                   |
| `verification-reconciliation` | One repeatable repair job every 30 seconds                                    |

Retry/await-settlement paths delay the existing job with `moveToDelayed` and `DelayedError`. Adding the same ID while
its job is active is a no-op and would lose the retry. Execution jobs are removed on completion/failure; batch
retention remains a separate unfinished control.

## Persistence

| Table                                | Identity / purpose                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `emails`, `smtp_verifications`       | Organization plus normalized address; cache/evidence                             |
| `email_verifications`                | Organization-owned UUID result, quality, observation time, policy version        |
| `domains`                            | Shared technical domain policy                                                   |
| `verification_requests`              | Submission UUID; organization/client-key uniqueness when a key exists            |
| `verification_executions`            | Execution UUID; at most one nonterminal organization/address execution           |
| `verification_settlement_intentions` | One permanent intention per execution                                            |
| `batch_admissions`                   | Batch UUID, manifest/funding/finalization state, fenced lease and recovery order |
| `batch_unique_addresses`             | Unique batch/address outcome and payer identity                                  |
| `batch_rows`                         | Unique batch/source-row identity, preserving duplicates                          |

## S3 / Storage

S3 is the object-storage API used for uploaded/retained CSV files. Upload keys are
`organizations/<organizationId>/uploads/<uuid>`; result keys replace `/uploads/` with `/results/`. The API root supplies
one `CustomerObjectWriteSecurity` policy. Writers always set `no-store`; production also applies SSE-KMS
(server-side encryption using a managed encryption key). Writers cannot override this policy locally.

Result encoding prefixes an apostrophe to customer text beginning with `=`, `+`, `-`, `@`, tab, carriage return, or
line feed, preventing spreadsheet formula execution. Download streams the retained bytes unchanged as
`attachment; filename="batch-verification-<uuid>.csv"`. Missing objects return concealed `404`; other storage failures
retain the generic error response.

## Configuration

| Key                                                           | Purpose / default                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `S3_BUCKET`                                                   | Batch object bucket                                                                             |
| `SMTP_PORT`                                                   | SMTP destination port; 25                                                                       |
| `SMTP_TLS_CA_FILE`                                            | Optional trusted certificate file; PEM is its text encoding. Node's normal trust remains active |
| `VERIFICATION_RESULT_CACHE_TTL_SECONDS`                       | Fresh conclusive-cache lifetime; 86400, valid range 1–86400                                     |
| `VERIFICATION_SUBMISSION_RATE_CAPACITY`                       | Organization submission allowance; 60                                                           |
| `VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND`              | Replenishment per second; 1                                                                     |
| `VERIFICATION_EXECUTION_MAX_CONCURRENT`                       | Global outbound execution permits; 5                                                            |
| `CATCH_ALL_HTTP_PROXY_URL`                                    | Optional account-discovery transport; does not activate a provider                              |
| `CATCH_ALL_PROVIDER`                                          | Optional `microsoft_get_credential_type`, `microsoft_login`, `mimecast`, or `office_apps`       |
| `CATCH_ALL_PROVIDER_APPROVAL_ID`, `CATCH_ALL_PROVIDER_REGION` | Required with an external provider                                                              |

Account discovery is enrichment from an external account service, disabled unless one provider has a matching,
active, effective, unexpired approval and proxy configuration. Approvals are rechecked before every disclosure;
negative/error answers do not establish absence. Mimecast supports `us`/`uk` regions only.
The fixed `config/privacy/account-discovery-approvals.yaml` manifest must exist and parse successfully even when
providers are disabled; deleting it prevents initialization.

## Validation

Unit/HTTP tests sit beside application/domain/API code; adapters have contract tests under `src/infrastructure/`.
Important coverage includes evidence classification, organization isolation, key replay/conflicts, lease loss,
settlement replay, atomic batch funding/closure, interrupted payer assignment, duplicate-row CSV billing, safe CSV
encoding, and public status/download agreement.

```shell
corepack pnpm test -- email-verification --runInBand
corepack pnpm test:verification-billing-postgres
corepack pnpm bruno:async-verification
corepack pnpm bruno:batch-verification
corepack pnpm bruno:smtp-dev
```

The PostgreSQL command provisions an owned disposable `verification_billing_test` database and exercises real
reservation/admission/settlement races. Real Redis queue tests require disposable `TEST_REDIS_URL`. Bruno (the HTTP
collection runner) requires a checkout-owned development/SMTP fixture stack; see
[async](../../../../bruno/async-verification/README.md), [batch](../../../../bruno/batch-verification/README.md), and
[SMTP](../../../../bruno/smtp-dev/README.md) runbooks. Deterministic SMTP fixtures prove protocol/security/charging
behavior, not real-world deliverability: plain `@lef.test` is catch-all/inconclusive, while `evidence.lef.test` supplies
decisive scenarios. A scheduled temporary rejection can exceed the synchronous budget and return `202` while its
reservation remains pending.
