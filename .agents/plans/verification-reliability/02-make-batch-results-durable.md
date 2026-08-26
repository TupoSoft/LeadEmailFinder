# Complete batch jobs only after durable result upload

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A completed batch must always point to the exact S3 object that was successfully uploaded. After this change,
successful jobs stream their CSV results using the original key without a leading slash, while an upload failure
fails/retries the BullMQ job instead of publishing a false `completed` state and unusable result path.

## Progress

- [x] (2026-08-26) Make result-location parsing preserve the exact uploaded S3 key.
- [x] (2026-08-26) Propagate upload failures and advance to Finish only after upload success.
- [x] (2026-08-26) Add service, processor, HTTP, and batch Bruno coverage.
- [x] (2026-08-26) Run focused and full validation and record the outcome.

## Plan dependencies

- `auth/05`

## Surprises & Discoveries

- The processor uploads `organizations/.../results/...` but serializes `s3://bucket/key`; `new URL(...).pathname`
  later returns `/key`, and the service sends that leading slash to `S3.getObject`.
- `BatchEmailVerificationProcessor.uploadResults()` catches `upload.done()` errors, logs them, and then writes the
  `Finish` step and result path anyway.
- The current service spec asserts the leading-slash key, so it protects the defect rather than the contract.
- `cursor.pipe(stringifier).pipe(Body)` uses chained `.pipe()`, which does not forward `error` events between
  streams. Confirmed directly against the installed source of `@aws-sdk+lib-storage@3.879.0` that `Upload`
  consumes `Body` via `for await (const chunk of data)`. If `cursor` or `stringifier` errors partway through, `Body`
  is never ended or destroyed, so `upload.done()` never settles and the job hangs forever instead of
  failing/retrying. Reproduced directly: reverting to `.pipe()` and running the new regression spec times out
  instead of failing.
- A third, previously undiscovered defect surfaced only once the S3-key fix made result downloads actually work
  and the new Bruno request could inspect real content. `.createQueryBuilder('ev')...stream()` returns raw driver
  rows keyed by the hydration aliases TypeORM generates — confirmed via `qb.getSql()`: `"ev"."email" AS "ev_email"`
  and so on — not bare entity property names.

  `stringify({ columns: ['id', 'email', ...] })` was reading those bare names off the raw rows, so every completed
  batch's downloaded CSV has always had a correct header but entirely blank data rows. Verified against real
  seeded data in the dev Postgres database: rows existed with real `email`/`domain`/`exists` values, but the
  downloaded CSV before this fix was `,,,,,,,,,,,,` per row. This was in scope because a "durable" result that
  downloads successfully but contains no data does not meet this plan's own Purpose statement or its
  `GET /verifyBatch/:id/results streams the expected CSV` acceptance criterion.

## Decision Log

- Decision: Preserve the existing S3 URL job-result representation for compatibility, but parse it through one
  validated helper that returns a bucket and key with no URL separator prefix.
  Rationale: This fixes current and already-enqueued result values without a queue-data migration or parallel
  result-location model.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: S3 upload success is a prerequisite for `Finish`; upload errors propagate to BullMQ retry/failure.
  Rationale: A completed state promises downloadable results and must not be emitted for best-effort storage.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Fix the stream-error-forwarding gap with `stream.pipeline()` (from `node:stream/promises`) replacing
  the chained `cursor.pipe(stringifier).pipe(Body)`, run concurrently with `upload.done()` via `Promise.all`.
  Rationale: `pipeline()` is the standard-library-endorsed replacement for chained `.pipe()`. It forwards errors
  from any stream in the chain and destroys every stream, including the shared `Body`, on either outcome, and is
  a near drop-in for the single line it replaces.
  Date/Author: 2026-08-26, implementation.
- Decision: Do not log the propagated upload/stream failure in `uploadResults()`; let it propagate silently.
  Rationale: The processor's other three step methods (`validateFile`, `processFile`, `waitForChildren`) have no
  try/catch and no logging around their own failure paths. They rely on the `job.failedReason` BullMQ itself
  tracks for observability, so a one-off logging call only in `uploadResults` would be inconsistent with the
  rest of the file. Confirmed with the user before implementing.
  Date/Author: 2026-08-26, implementation.
- Decision: Fix the newly discovered raw-row/alias-key mismatch by mapping the `columns` option passed to
  `stringify()` to `{ key: 'ev_<property>', header: '<property>' }` pairs, rather than transforming each raw row
  object.
  Rationale: `csv-stringify` supports per-column key/header separation natively. This is a two-line fix at the
  exact point of failure that leaves the CSV's own header names (`id`, `email`, and so on) and every other
  behavior unchanged, matching the "preserve CSV columns, object naming" scope constraint exactly.
  Date/Author: 2026-08-26, implementation.

## Outcomes & Retrospective

Implemented and validated. `parseS3ResultLocation()` (new file `parse-s3-result-location.ts`, placed beside
`derive-results-key.ts`) replaces the raw `new URL(result).pathname`/`.hostname` destructuring in
`getBatchResults()`. It requires the `s3:` protocol and a nonempty bucket and key, using the `ok()` assertion from
`node:assert` for malformed input to match this method's own existing invariant-checking style, rather than a new
exception
class. `uploadResults()` now runs `Promise.all([pipeline(cursor, stringifier, Body), upload.done()])` instead of
the old swallow-and-continue `try/catch`, so any stream or S3 failure propagates out of `process()` and
`job.updateData` is never called with `Finish` unless both the stream pipeline and the upload genuinely succeeded.
The now-dead `Logger` field and import were removed. The `stringify()` `columns` option was changed to map each
raw `ev_<property>` row key to its bare `<property>` CSV header, fixing the previously undiscovered blank-CSV
defect described above.

All three fixes were verified as non-vacuous by deliberately reverting each one in turn and rerunning the
relevant new test. With the `.pipe()` chain reinstated, the stream-error regression test hangs and times out
instead of merely failing. With the `columns` mapping reverted, the new CSV-content regression test fails with
blank cells that exactly match the real bug. Each revert was then restored and the full suite reconfirmed green.

Ran the extended `bruno/batch-verification` collection (`03-download-batch-results.yml` added) against a real
`pnpm dev:reset` stack with `npx @usebruno/cli run --env local --sandbox developer`. Upload, poll-to-completion,
and download all passed, with the downloaded CSV's `email` column matching the uploaded fixture's two addresses
exactly. This end-to-end path — upload, complete, download, correct content — has never been proven to work
before. The S3-key bug alone would have made every prior download attempt fail with the wrong object key.

## Context and Orientation

`BatchEmailVerificationProcessor` validates the CSV, creates child async jobs, streams `EmailVerification` rows
into `csv-stringify`, and uploads through `@aws-sdk/lib-storage` `Upload`. It stores a `resultFilePath` on the
`Finish` job-data variant and returns that value as the BullMQ result. `BatchEmailVerificationServiceImpl` requires
organization ownership and completed state, parses the returned S3 URL, and calls `S3.getObject`.

`deriveResultsKey()` already produces the correct key. The defects lie after derivation: swallowed upload failure
and URL pathname interpretation.

## Scope and Non-Goals

Make upload/completion atomic at the job-state level and make result retrieval address the uploaded object. Preserve
CSV columns, object naming, S3 bucket configuration, organization ownership, endpoints, and response media type.
Do not redesign the queue, persist batch metadata in PostgreSQL, add migrations, add multipart resume, or change
credit charging.

## Plan of Work

Add a small result-location parser beside `derive-results-key.ts` or in the batch service boundary. Require the
`s3:` protocol, a non-empty hostname/bucket, and a non-empty decoded key; remove only the URL pathname's structural
leading slash. Use that helper from `getBatchResults()` and change the existing spec expectation to the exact key
used during upload. Reject malformed completed-job results as an internal consistency error without issuing an S3
request.

Remove the catch-and-continue behavior around `upload.done()`. Let storage failure reject processing so BullMQ can
apply its retry/failure semantics, and call `job.updateData({ step: Finish, ... })` only after upload completion.
Ensure cursor/stringifier/PassThrough failures also reject the upload rather than hanging or marking success; close
or destroy streams during failure cleanup where the AWS upload helper does not already do so.

Add processor unit tests for upload success and rejection, service tests for exact key and malformed result values,
and controller/service integration coverage for organization-scoped result streaming. Create the distinct
`bruno/batch-verification` workflow: upload a synthetic CSV, poll to completion, download the CSV, and assert the
expected rows. Keep forced storage failure deterministic below HTTP using the mocked upload boundary.

## Interfaces and Dependencies

No endpoint or schema changes. Internal additions may include `parseS3ResultLocation(value): { bucket; key }`.
`GET /verifyBatch/:id/results` retains `text/csv`; failed uploads leave the BullMQ job retrying or failed instead of
completed. Reuse the existing S3 client, `Upload`, job-data union, and `deriveResultsKey`.

## Acceptance Criteria

- A successful batch uploads one result object and retrieves that exact bucket/key without a leading slash.
- `GET /verifyBatch/:id/results` streams the expected CSV for a completed job owned by the caller organization.
- An upload rejection never writes the `Finish` step and the processor rejects so BullMQ can retry or mark failure.
- A malformed or empty result location never issues an S3 request.
- A caller from another organization continues to receive the existing not-found behavior.
- Existing CSV validation, credit debit, child processing, and result column behavior remain unchanged.

## Validation

Run batch service, processor, key-derivation/result-location, and controller specs. Run the new batch collection with
`bru run --env local` when Redis, S3, workers, database, SMTP fixture, and credentials are available. Run
`corepack pnpm typecheck`, `corepack pnpm lint`, the full Jest suite with `/tmp` temporary paths, and
`git diff --check`.

**Results (2026-08-26):**

- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm exec jest src/lead-email-finder-api/src/email-verification-module/batch-email-verification`
  — 6 suites, 43/43 tests passed (includes the new `parse-s3-result-location.spec.ts` and
  `batch-email-verification.processor.spec.ts`, and the extended service/controller specs).
- `npx tsc --noEmit -p tsconfig.json --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo` — clean. (This sandbox's `dist/`
  was again root-owned from an earlier `docker compose build`, unrelated to this change — same known limitation
  as recent PRs; routed around it the same way.)
- `corepack pnpm lint` — 0 errors, 2 preexisting unrelated warnings.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest` (full suite) — 752/780 passed, 27 skipped (live-gated
  specs), 1 preexisting `todo`.
- `git diff --check` — clean.
- `bru run --env local` — `bru` itself is not installed. Ran `npx @usebruno/cli run --env local --sandbox developer`
  against a real `pnpm dev:reset` stack instead: all 3 requests and 5 tests passed, including the new
  `03-download-batch-results.yml`. Its first run, before the raw-row/alias-key fix was added, caught the blank-CSV
  defect live — direct evidence the new coverage is meaningful, not just passing by construction.

## Idempotence and Recovery

Retry uploads the same deterministic result key, so a successful retry replaces or converges on the same object
without publishing a second location. Failed jobs remain inspectable/retryable in BullMQ. Development recovery may
delete the synthetic S3 object and reset the disposable stack with `pnpm dev:reset -- --confirm-project=LEF`.

## Artifacts and Notes

Record the synthetic job ID, bucket name, redacted object key, job state transitions, and CSV row count. Never
record credentials or customer email data.

Live run against the dev stack (organization "Acme Development Customer", disposable data). Job state transitioned
`active` → `completed`. Result key was derived as `organizations/<org>/results/<batchId>.csv` (bucket redacted),
matching the existing convention `deriveResultsKey()` produces. The downloaded CSV contained exactly 2 data rows,
matching the 2-row `fixtures/sample.csv` upload, with correct `email` values in both. No job IDs, bucket names,
credentials, or real customer email data are recorded here.

## Plan readiness

Implemented and validated.
