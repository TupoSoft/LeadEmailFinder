# Run a Batch Email Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an authenticated user upload one CSV batch, follow its real server job on a refresh-safe URL, understand whether
asynchronous validation or charging failed, and download the completed CSV. After this change, the browser accepts a
CSV no larger than 100 megabytes, shows indeterminate upload activity until the API returns a job ID, then displays only the
server's bounded progress and counts. It never invents upload percentage, history, cancellation, resume, or retry
behavior. A developer can upload the checked-in synthetic fixture, refresh while the workers process it, observe a
safe terminal state, and download the retained result produced by the existing batch pipeline while it remains
available under the server's retention policy.

## Progress

- [ ] (2026-08-31) Add safe terminal batch-failure codes and complete multipart/status/download OpenAPI contracts.
- [ ] (2026-08-31) Generate binary fields as `Blob` and add explicit multipart/blob transport adapters.
- [ ] (2026-08-31) Add accessible CSV selection and indeterminate upload behavior.
- [ ] (2026-08-31) Build the refresh-safe batch job, bounded progress, failure, and result-download routes.
- [ ] (2026-08-31) Extend focused API, worker, Bruno, browser, responsive, and accessibility coverage.
- [ ] (2026-08-31) Run repository, generated-client, live batch, design-contract, and premium UX validation.

## Plan dependencies

- `frontend/08`
- `frontend/10`
- `frontend/11`
- `module-architecture/16`
- `verification-reliability/02`
- `verification-reliability/03`

## Surprises & Discoveries

- `module-architecture/16` will relocate batch API, workflow, Bull, CSV, and S3 concerns into their final layers while
  preserving upload, status, result, progress, and queue contracts. This plan extends those layered contracts rather
  than the legacy mixed batch folder.
- The prerequisite has a binding size gate. If `module-architecture/16` is split, this plan must replace or extend its
  dependency with the mandated follow-up and use the final paths delivered by that follow-up before implementation
  begins.

## Decision Log

- Decision: The upload contract remains `POST /verifyBatch/csv` with one `file` part of `text/csv` and the existing
  100-megabyte maximum. The browser checks extension and byte size for early feedback, while the server remains
  authoritative for media type, size, CSV parsing, and row validation.
  Rationale: Browser MIME values are inconsistent, and client validation cannot secure or fully parse a large file.
  Date/Author: 2026-08-31, project planning.
- Decision: Upload uses the shared generated-client transport and shows indeterminate progress until the confirmed
  `202 { id }`; it does not display a percentage or bytes-transferred estimate.
  Rationale: The current fetch/multipart contract exposes no trustworthy upload-progress signal.
  Date/Author: 2026-08-31, project planning.
- Decision: Extend the root `openapi-typescript` generator so OpenAPI `format: binary` schemas become DOM `Blob`
  types, then cover upload and download with generated-shape assertions.
  Rationale: The generator maps binary format to `string` by default; annotations alone would create a misleading
  browser type for both file directions.
  Date/Author: 2026-08-31, project planning.
- Decision: Wrap the generated upload operation with a `FormData` body serializer and the generated download
  operation with `parseAs: 'blob'`.
  Rationale: `openapi-fetch` defaults request bodies and responses to JSON. Wire-format adapters are required even
  when the generated path types are correct.
  Date/Author: 2026-08-31, project planning.
- Decision: Add only three terminal failure codes to batch status: `invalid_csv`, `insufficient_credits`, and
  `processing_failed`. Codes appear only when the BullMQ job is terminally failed; raw parser, validator, database,
  storage, SMTP, queue, and exception details remain private.
  Rationale: Validation and credit debit occur after `202`, so the UI needs actionable safe categories without
  leaking worker internals or treating provider text as an API.
  Date/Author: 2026-08-31, project planning.
- Decision: Replace raw BullMQ batch status values with the same stable `queued`, `running`, `completed`, `failed`,
  and `unavailable` public state enum established by `frontend/11`.
  Rationale: Browser polling needs an exhaustive durable state machine; raw paused, prioritized, waiting-children,
  and unknown infrastructure states must not leak or poll indefinitely.
  Date/Author: 2026-08-31, project planning.
- Decision: Keep the selected `File` and upload request out of TanStack MutationCache and release browser references
  immediately after settlement or route disposal.
  Rationale: A shared mutation cache must not retain up to 100 megabytes of customer CSV after the request finishes.
  Date/Author: 2026-08-31, project planning.
- Decision: After a job ID exists, the UI displays the API's finite `[0, 100]` progress and counts without smoothing,
  phase weighting, ETA, or locally inferred completion. Before the ID exists, upload stays indeterminate.
  Rationale: `verification-reliability/03` supplies honest bounded progress; client estimates would contradict it.
  Date/Author: 2026-08-31, project planning.
- Decision: `/app/verifications/batches/:id` is the only batch recovery/history handle. The UI adds no fake recent-jobs
  list and no cancel, resume, retry, or upload-resumption controls because no such APIs exist.
  Rationale: Controls and records without authoritative server contracts create false expectations and unsafe work.
  Date/Author: 2026-08-31, project planning.
- Decision: An upload POST is never retried automatically. An ambiguous response explains that a job may exist and
  credits may later be charged; a new upload requires a deliberate fresh action.
  Rationale: Validation and debit happen asynchronously, and resubmitting can create a second charged batch.
  Date/Author: 2026-08-31, project planning.
- Decision: Completed result download uses the documented authenticated `GET /verifyBatch/:id/results` response as
  a blob with a safe server filename; the UI neither parses nor previews customer CSV contents.
  Rationale: The retained S3-backed API owns the result until expiry, while avoiding an in-browser preview limits memory
  use and exposure of email data.
  Date/Author: 2026-08-31, project planning.
- Decision: Neutralize spreadsheet-formula prefixes in every user-controlled result CSV cell before `csv-stringify`.
  Rationale: CSV quoting does not stop spreadsheet applications from interpreting an email-like value beginning with
  `=`, `+`, `-`, `@`, tab, carriage return, or line feed as a formula.
  Date/Author: 2026-08-31, project planning.
- Decision: Batch UI extends the asynchronous, file-input, progress, status, permission, and recovery patterns in
  root `DESIGN.md` and root `UX-CONTRACT.md`; new shared behavior is documented rather than forked locally.
  Rationale: Single and batch verification should have consistent quality without erasing their different contracts.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

At authoring time, batch verification lives in the legacy `batch-email-verification/` folder.
`BatchEmailVerificationController` exposes authenticated `POST /verifyBatch/csv` with
`verification:run`, authenticated `GET /verifyBatch/:id` with `verification:read`, and authenticated
`GET /verifyBatch/:id/results` with `verification:read`. Upload streams through the configured S3 storage and
returns `202 { id }`. Missing and cross-organization jobs return the same `404`.

Prerequisite `module-architecture/16` moves multipart/status/result HTTP into
`src/api/http/batch-verification/`, the durable workflow into `src/application/delivery/batch/`, and Bull/CSV/S3
mechanics into infrastructure. It preserves the contracts this plan deliberately changes or publishes.

The upload pipe accepts `text/csv` and enforces `104857600` bytes. The worker then reads the stored file, validates
each CSV row, counts the rows, and debits that count from the current organization's credit account before creating
child verification jobs. Therefore, `202` means only that the batch was queued: malformed content or insufficient
credits can fail later. A BullMQ retry reuses the stable job ID and therefore the same idempotent debit reference;
uploading the file again creates a new job/reference and may spend credits again. The current
status response exposes only `id`, raw BullMQ `status`, finite `progress`, `total`, `processed`, and `unprocessed`; it
gives no safe reason for a terminal failure and no stable rule for every infrastructure state.

Plan `verification-reliability/02` makes result upload and retrieval durable until the applicable retention policy
expires it and ensures a completed job points to the exact stored CSV while retained. Plan
`verification-reliability/03` guarantees finite progress in `[0, 100]`, with completed jobs at `100`. This plan
consumes those contracts; it does not reopen queue topology or result persistence. A later retention policy may make
terminal jobs and results return the same non-disclosing `404` as missing or foreign work.

Plan `frontend/05` supplies the generated-client transport, and `frontend/08` supplies current account, capabilities,
same-origin session behavior, shared `401`/`403` handling, shell, and common resilient UI primitives. Batch feature code belongs under
`apps/web/src/features/verification`, shares applicable job/result components with plan `frontend/11`, and adds
routes under `apps/web/src/routes` without adding another data or component framework.

## Scope and Non-Goals

This pull request adds the safe terminal-failure field and its narrow worker mapping. It also completes the Swagger
contracts for multipart upload, status, and binary download; regenerates the client; and adds CSV selection, upload,
batch-job, and result-download routes. Focused API, worker, Bruno, and browser coverage prove the behavior. It changes
no successful batch algorithm.

It does not add a list/history endpoint, persist browser history, or parse or preview the result in the browser. It
adds no cancel, pause, resume, or retry behavior; upload resumption or chunking; upload percentage; or ETA. It does
not change the 100-megabyte limit, row pricing, debit timing, worker attempts, or failed-work refund policy. It does
not redesign S3 or BullMQ, add broad failure taxonomies, expose raw errors, harden unrelated queue/storage behavior,
or add catch-all application error handling.

## Plan of Work

Add an application-owned `BatchTerminalFailureCode` with exactly `invalid_csv`, `insufficient_credits`, and
`processing_failed`. Introduce one typed invalid-input error around CSV parse/row-validation failures. The
framework-free batch state machine/classifier maps that error and the existing insufficient-credit application error
to their specific codes and maps other real failures to `processing_failed`. Bull infrastructure detects
`WaitingChildrenError` and any repository-owned equivalent wait-for-children control-flow signal first, then
propagates it unchanged without invoking the failure classifier or writing a marker. For a real failure, the adapter
invokes the classifier, stores only its safe returned marker in job data, and propagates the original error without serializing it.
BullMQ retry/failure behavior remains unchanged. A later successful retry may retain the internal marker, but the read
application exposes `failureCode` only for a terminal failure; a terminal failed job without a marker falls back to
`processing_failed`.

The Bull status adapter normalizes raw states into the transport-neutral application snapshot shared with
`frontend/11`; no Bull type crosses into application or API. Extend `GetBatchStatusResponseDto` with the optional
application failure value and map the snapshot to the shared public job-state enum. Completed maps to `completed`
only when the retained result location from `verification-reliability/02` is valid; otherwise it maps to
`unavailable`. Expose `failureCode` only with `failed`. Test every BullMQ value at the adapter, every application
snapshot, and an unknown future value. Separately test completed without a result, invalid CSV, insufficient credits,
generic infrastructure failure, eventual success, tenant-concealed `404`, a normal `waitForChildren()` transition
with no failure marker, and absence of raw status/error text. Only `queued` and `running` are automatically polled;
all other states stop polling. Do not claim that `processing_failed` proves whether credits were charged. UI copy for
it must say that charging could have occurred.

Complete Swagger annotations for `POST /verifyBatch/csv`: multipart form, binary CSV field, accepted media type,
100-megabyte maximum, `202`, validation `422`, authentication, and permission responses. Document the optional terminal
failure code on status. Mark `GET /verifyBatch/:id/results` as `text/csv` binary and return a safe
`Content-Disposition` filename derived only from the validated UUID. Extend the repository's Node-based
`openapi-typescript` generation script with a custom transform that maps every schema whose format is `binary` to the
DOM `Blob` type while leaving other string schemas unchanged. Add exactly upload, status, and result-download
route-method entries to the browser allow list. Assert the committed `schema.d.ts` types upload and download bodies as
`Blob`, update through `openapi:export` and `openapi:generate`, and confirm drift through the
read-only `openapi:check` from `frontend/05`.

Add narrow browser transport adapters around the generated operations. Upload accepts one `File`, builds `FormData`
with exactly the `file` part, and supplies a custom body serializer; it must not set `Content-Type`, because the
browser owns the multipart boundary. Download calls the generated operation with `parseAs: 'blob'` and rejects a
non-CSV content type before creating an object URL. Both adapters reuse same-origin credentials, CSRF behavior, safe
error normalization, and generated request/response types. Fetch-level tests assert the actual `FormData` entry,
boundary-header omission, `Blob` response, and absence of JSON serialization.

Do not use the shared TanStack mutation layer for upload. Keep only the active request and selected `File` in
component-local state. Clear the native input and all JS references after `202`, definite rejection, explicit
abandonment of an uncertain result, unmount, or `pagehide`. No `File`, `FormData`, filename, or mutation variables may
enter QueryClient/MutationCache, persisted storage, telemetry, or diagnostics. While a request is in flight, releasing
it is a best-effort operation because fetch may retain its body; the UI still treats page departure as outcome
unknown and never resubmits. Add heap-reference boundary tests through public cache/state inspection rather than
logging file contents.

Under `apps/web/src/features/verification`, build an accessible CSV field with a visible native picker and an
optional pointer drop target that enhances the same control. Declare `.csv,text/csv` acceptance, explain the
100-megabyte limit and which column must contain the email address before selection, announce the chosen filename and formatted size, and provide a
clear replace/remove action. Do not reject solely because `File.type` is empty; reject a non-CSV extension or size
above `104857600` before POST, while still treating server `422` as authoritative. Never read the whole file merely
to validate it, log its name/content, or show email rows.

On submit, state that credits are determined from valid rows after upload. Disable replacement and duplicate submit
while the request is in flight, use an indeterminate shared progress indicator labeled `Uploading CSV`, and show no
percentage. A confirmed `202` immediately navigates to `/app/verifications/batches/:id`. A server `422` restores the picker
with associated correction copy. `401` and `403` use shell behavior. A timeout, disconnect, or lost response says
that upload and job creation could not be confirmed and that a job may still validate and charge; never retry or
create a fake job. Keep a deliberate fresh-selection action available after acknowledgment.

The job route validates the UUID and calls only `GET /verifyBatch/:id`. Poll only `queued` and `running` with the same
bounded, visibility-aware, offline-aware read policy as single verification. Display the normalized server status, a semantic progress
bar with the exact finite value, and `processed`, `unprocessed`, and `total` counts. During validation, describe the
phase rather than claiming that `0 of 0` means empty. Never extrapolate an ETA, smooth counts, or report complete
before the API does. Preserve the last confirmed values as stale on a read error and offer status retry without
uploading again. Hard refresh and direct navigation reacquire the same organization-scoped job.

At terminal failure, map the safe code to reviewed copy. `invalid_csv` explains correction and links to a fresh file
selection without automatic upload. `insufficient_credits` states that the balance was insufficient when worker
validation completed and links to billing only when the account has `billing.read`; otherwise it advises
contacting an owner. The billing destination is `/app/billing`. `processing_failed` states that processing could not
finish and that credits may have been charged. It offers status refresh/support guidance and does not offer one-click
resubmission. A missing job or cross-organization job uses the shared non-disclosing `404` state.

At `unavailable`, stop polling, explain that the server cannot currently report a trustworthy outcome, preserve the
last confirmed counts as stale, and offer manual status refresh/support guidance. Do not label it failed or complete,
enable download, infer charging, or upload again.

At `completed`, stop polling, announce completion once, and enable `Download result CSV`. Use the generated download
operation with session cookies, retain no response longer than needed, create an object URL, activate a safe
download, and revoke the URL. Disable duplicate activation only during the GET. A non-disclosing `404` after earlier
completion renders `Result no longer available` without distinguishing expiry from missing or foreign work. Another
download failure leaves the job completed, explains that no new verification was started or charged, and allows the
idempotent download GET to be retried while the result remains retained. Do not parse, index, preview, cache
persistently, or send result rows to analytics.

At the durable result-writer boundary, pass every user-controlled cell through one spreadsheet-safe encoder before
`csv-stringify`. Prefix an ASCII apostrophe when the first character is `=`, `+`, `-`, `@`, tab, carriage return, or
line feed; preserve all other content and then let the CSV library quote/escape it normally. Apply the rule to the
source email and any future copied input column, not to trusted numeric/status fields. Add streaming regression tests
for every prefix, quoted commas/newlines, ordinary addresses, chunk boundaries, and the downloaded byte sequence.
Keep the encoder inside the existing result-storage adapter path. Every write retains the shared
`CustomerObjectWriteSecurity` HTTPS, SSE-KMS, and `no-store` binding from `module-architecture/16` and
`privacy-compliance/06`; no alternate writer bypasses it.

Reuse the design contracts' page, form, file, notice, progress, description, button, and status primitives. Give
selecting, uploading, queued/validating, processing, completed, failed, unavailable, stale/offline, unauthorized,
not-found, and download-error states stable geometry and distinct titles/headings. Keep controls keyboard operable,
associate errors and descriptions, avoid noisy poll announcements, preserve focus on background updates, support
reduced motion, and prevent horizontal overflow from long filenames or counts at narrow viewports.

Extend `bruno/batch-verification` to assert the new safe status shape and binary response headers while preserving its
upload, bounded progress, completion, and exact CSV-content workflow. Add deterministic processor/service/controller
tests for each failure code and OpenAPI serialization. Playwright uses live Keycloak, S3, Redis/BullMQ, PostgreSQL,
SMTP/DNS, credits, API, and web to upload the synthetic fixture, refresh the job route, observe bounded progress, and
download the result. Deterministic API/component fixtures cover oversized input, invalid CSV, insufficient credits,
processing failure, ambiguous upload, offline polling, and narrow/accessibility states without corrupting shared
runtime resources.
Register `corepack pnpm bruno:batch-verification` with the pinned launcher from Plan 02. Its bootstrap retrieves the seeded
customer client's live secret through the ignored org-admin credential, selects the Compose-internal issuer/base URL,
uses the developer sandbox, keeps tokens/secrets out of output, and fails on zero execution.

## Interfaces and Dependencies

The upload and download routes remain stable:

    POST /verifyBatch/csv
    Content-Type: multipart/form-data; field name "file"; text/csv; maximum 104857600 bytes
    202 { "id": "<uuid>" }

    GET /verifyBatch/:id/results
    200 Content-Type: text/csv
    Content-Disposition: attachment; filename="batch-verification-<uuid>.csv"

The status response retains its field names but normalizes `status` and adds one optional safe field:

    GET /verifyBatch/:id
    {
      "id": "<uuid>",
      "status": "failed",
      "progress": 0,
      "total": 0,
      "processed": 0,
      "unprocessed": 0,
      "failureCode": "invalid_csv"
    }

`status` is exactly `queued`, `running`, `completed`, `failed`, or `unavailable`; raw BullMQ values never appear.
`failureCode` is absent unless status is `failed` and is one of `invalid_csv`, `insufficient_credits`, or
`processing_failed`. `verification:run` continues to protect upload; `verification:read` protects status/download;
organization mismatch remains `404`. The frontend routes are `/app/verifications/batches/new` and
`/app/verifications/batches/:id` and use only generated operations from `packages/api-client` through the shared
`frontend/05` transport and the query layer from `frontend/08`. The upload adapter accepts `File`/`Blob`, serializes
`FormData`, and leaves the multipart boundary to the browser. The download adapter requests `parseAs: 'blob'` and
returns a `Blob`. The shell shows the upload entry only with browser capability `verification.run`, and the
job route requires `verification.read`; the API continues to enforce its colon-delimited permissions.

Runtime dependencies are the existing Keycloak, API/web same-origin proxy, PostgreSQL, Redis/BullMQ workers, S3,
SMTP/DNS fixture, and seeded organization credit account. This plan adds no external service or production resource.

## Acceptance Criteria

- The picker accepts a `.csv` of at most 100 megabytes, states the format/limit, and rejects an oversized or clearly wrong
  selection before POST; server media/size/content validation remains authoritative and returns associated recovery.
- Upload shows an indeterminate labeled state and no percentage until one confirmed `202` supplies a real job ID.
  Duplicate activation sends one POST. An ambiguous response is never retried and never claims that no job or charge
  exists.
- A confirmed upload navigates to `/app/verifications/batches/:id`; refresh or direct navigation resumes the same
  organization-scoped status. The UI creates no local history and exposes no cancel, resume, or fake retry.
- Post-upload progress uses the exact API value, remains finite and within `[0, 100]`, reaches `100` only according to
  the server contract, and shows authoritative counts without ETA, smoothing, or invented upload progress.
- Every BullMQ state maps exhaustively to the five public states. Automatic polling occurs only for `queued` and
  `running`. Polling stops for `unavailable`, including unknown or completed-without-result, and the UI offers manual
  recovery without claiming success, failure, or charging.
- Terminal invalid CSV, insufficient credits, and generic processing failure return only their stable code and
  render distinct safe recovery. Raw parser, validation, queue, storage, SMTP, proxy, database, and exception details
  are absent from public JSON, browser URLs, browser state, and rendered markup.
- Insufficient-credit recovery links to `/app/billing` only for an account with `billing.read`. Generic processing
  failure never claims whether credits were charged and never automatically uploads the file again.
- A completed job downloads the retained `text/csv` result with a safe filename. Download retry repeats only the GET,
  starts no new job, consumes no new credit, revokes object URLs, and does not parse or persist result content. A
  later non-disclosing `404` renders a result-no-longer-available recovery state without claiming whether the result
  expired, is missing, or belongs to another tenant.
- Every user-controlled result cell with a formula-leading character is apostrophe-neutralized before CSV quoting;
  streamed regression fixtures cannot execute as spreadsheet formulas and ordinary values remain unchanged.
- Neutralized result writes still use the shared HTTPS, SSE-KMS, and `no-store` object-security binding, with no
  parallel or weaker write path.
- Generated binary request/response fields are `Blob`, not `string`. Fetch-level tests prove upload sends one
  `FormData` file part without a caller-set multipart header and download uses blob parsing rather than JSON.
- Upload keeps the selected `File` out of QueryClient/MutationCache, persistent storage, logs, and telemetry, and
  clears all releasable references after settlement, abandonment, unmount, or pagehide.
- Selection, upload, job, progress, all failures, stale/offline, permission, not-found, completion, and download-error
  states work at desktop and narrow viewports. They work by keyboard and screen reader, preserve stable layout, use
  restrained live updates, support reduced motion, and have no serious accessibility violations.
- Focused API/worker/web tests, generated-client freshness, updated Bruno workflow, live batch Playwright, repository
  checks, and the premium design audit pass.
- The implementation and updated ExecPlan map to exactly one pull request and do not add unrelated batch reliability,
  billing, history, retry, or infrastructure work.

## Validation

Run batch processor, service, controller, job-data, DTO serialization, OpenAPI generation, multipart transport,
binary-download, ownership,
permission, safe-failure, and bounded-progress tests. Run web file selection, size/type validation, upload uncertainty,
polling lifecycle, progress/count rendering, failure copy, capability, download cleanup, route reload, focus, narrow,
and accessibility tests. Then run:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm architecture:check
    git diff --check

After confirming Compose ownership, start the same-origin development runtime plus the existing batch SMTP/DNS/S3
fixture. Bootstrap the shared MFA-aware owner, run the pinned batch collection, and then run:

    corepack pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:batch-verification
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/batch-verification.spec.ts --project=chromium

The Bruno run must upload the synthetic fixture, observe finite bounded progress and the safe status schema, reach
completed, and download the expected CSV and response headers. Add a deterministic invalid-input or
insufficient-credit request only when its fixture setup and cleanup cannot affect another checkout. The live browser
run must use Keycloak and real workers, hard-refresh the job URL, observe bounded progress, download the result, and
cover desktop and narrow interaction. Use focused mocked boundaries for forced worker/storage failure.

Run the premium static audit and inspect every state interactively:

    corepack pnpm ui:audit

Verify visible native file access, keyboard replacement/removal, long filename wrapping, and the exactly stated
100-megabyte limit. Also verify the absence of fake upload percentages, truthful progress semantics, restrained live
regions, focus after errors/completion, offline and hidden polling, safe blob cleanup, download headers, narrow
overflow, and reduced motion. If implementation changes
`DESIGN.md` or `UX-CONTRACT.md`, run
`corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md` and record the result.

## Idempotence and Recovery

Status and result GET requests are safe to repeat within the existing retention and ownership rules. Polling is
bounded and resumes from the URL. Repeating a completed download fetches the same retained result while available and
does not enqueue or charge; a later `404` is terminal for that browser recovery attempt.
Object URLs are revoked after each attempt. The multipart serializer and blob parser are deterministic and safe to
exercise with synthetic files. The upload POST is not treated as idempotent: the UI sends it only for a
fresh explicit action, prevents duplicates, and never retries an uncertain response or terminal job automatically.

Processor failure-code recording is repeatable across existing BullMQ attempts and does not change debit or result
idempotency. A successful later attempt exposes no failure code. If OpenAPI/client generation stops partway, repair
the source contract, rerun export/generate, and use the read-only check to prove the result. Reset and reseed only disposable S3 objects, queues,
credits, database rows, and fixture state owned by this checkout; add no migration and do not tear down a shared
stack without confirming ownership.

## Artifacts and Notes

Record the failure-code mapping table, generated upload/download operation names, focused test and Bruno counts,
redacted job-transition and progress evidence, downloaded synthetic row count, premium-audit result, and desktop/narrow
screenshots. Use only synthetic CSV data. Do not record real filenames, real addresses, or result contents. Do not
record job or organization IDs, object keys, cookies, CSRF values, tokens, credentials, SMTP dialogue, or raw failures.

## Plan readiness

The post-`module-architecture/16` upload boundary, size-split contingency, safe asynchronous failure contract,
progress semantics, uncertain-mutation policy, retained-result and expiry behavior, permission, and recovery states,
validation matrix, and one-pull-request scope are decision-complete.

Ready to implement.
