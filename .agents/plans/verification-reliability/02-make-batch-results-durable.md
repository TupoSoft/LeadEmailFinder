# Complete Batch Jobs Only After Durable Result Upload

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A completed batch must always point to the exact S3 object that was successfully uploaded. After this change,
successful jobs stream their CSV results using the original key without a leading slash, while an upload failure
fails/retries the BullMQ job instead of publishing a false `completed` state and unusable result path.

## Progress

- [x] (2026-08-25) Make result-location parsing preserve the exact uploaded S3 key.
- [x] (2026-08-25) Propagate upload failures and advance to Finish only after upload success.
- [x] (2026-08-25) Add service, processor, HTTP, and batch Bruno coverage.
- [x] (2026-08-25) Run focused and full validation and record the outcome.

## Plan Dependencies

- `auth/05`

## Surprises & Discoveries

- The processor uploads `organizations/.../results/...` but serializes `s3://bucket/key`; `new URL(...).pathname`
  later returns `/key`, and the service sends that leading slash to `S3.getObject`.
- `BatchEmailVerificationProcessor.uploadResults()` catches `upload.done()` errors, logs them, and then writes the
  `Finish` step and result path anyway.
- The current service spec asserts the leading-slash key, so it protects the defect rather than the contract.
- The `bruno/batch-verification` workflow already existed for upload and progress coverage; this change extends it
  with bounded request chaining and result-download assertions instead of creating another collection.

## Decision Log

- Decision: Preserve the existing S3 URL job-result representation for compatibility, but parse it through one
  validated helper that returns a bucket and key with no URL separator prefix.
  Rationale: This fixes current and already-enqueued result values without a queue-data migration or parallel
  result-location model.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: S3 upload success is a prerequisite for `Finish`; upload errors propagate to BullMQ retry/failure.
  Rationale: A completed state promises downloadable results and must not be emitted for best-effort storage.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Coordinate the database cursor, CSV stringifier, upload body, and multipart upload with a stream pipeline;
  abort and settle both operations before propagating any failure.
  Rationale: Stream errors must reject the BullMQ processor without leaving an upload or stream running in the
  background.
  Date/Author: 2026-08-25, Codex implementation.
- Decision: Inject a purpose-specific `BatchResultUploader` into the processor and keep AWS `Upload` construction in
  `S3BatchResultUploader`.
  Rationale: The processor owns workflow state, while the adapter owns provider-specific multipart upload details and
  supplies a deterministic failure boundary for tests.
  Date/Author: 2026-08-25, Codex implementation.

## Outcomes & Retrospective

Completed. Result retrieval now parses and validates the stored S3 URL before requesting the exact uploaded key.
The processor advances to `Finish` only after both CSV streaming and multipart upload complete; either failure aborts
the upload, settles the streams, and rejects processing for BullMQ retry/failure handling. AWS upload construction is
isolated behind an injected batch-result uploader. Focused and full automated tests, type checking, linting,
formatting, and prose validation pass. The Bruno workflow now polls with a bound and downloads the result CSV, but
runtime execution remains unverified because the local Compose stack and generated credentials were unavailable.

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
`s3:` protocol, a hostname/bucket that is not empty, and a decoded key that is not empty. Remove only the structural
leading slash from the URL pathname. Use that helper from `getBatchResults()` and change the existing spec
expectation to the exact key used during upload. Reject malformed completed-job results as an internal consistency
error without issuing an S3 request.

Remove the catch-and-continue behavior around `upload.done()`. Let storage failure reject processing so BullMQ can
apply its retry/failure semantics, and call `job.updateData({ step: Finish, ... })` only after upload completion.
Ensure cursor/stringifier/PassThrough failures also reject the upload rather than hanging or marking success; close
or destroy streams during failure cleanup where the AWS upload helper does not already do so.

Add processor unit tests for upload success and rejection, service tests for exact key and malformed result values,
and controller/service integration coverage for organization-scoped result streaming. Create the distinct
`bruno/batch-verification` workflow: upload a synthetic CSV, poll to completion, download the CSV, and assert the
expected rows. Keep forced storage failure deterministic below HTTP using the mocked upload boundary.

## Interfaces and Dependencies

No endpoint or schema changes. Internal additions include `parseS3ResultLocation(value): { bucket; key }` and the
injected `BatchResultUploader` contract with its `S3BatchResultUploader` implementation.
`GET /verifyBatch/:id/results` retains `text/csv`. An upload error keeps the job queued for retry or moves it to the
failed state instead of completing it. Reuse the existing S3 client, `Upload`, job-data union, and
`deriveResultsKey`.

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

## Idempotence and Recovery

Retry uploads the same deterministic result key, so a successful retry replaces or converges on the same object
without publishing a second location. Failed jobs remain available for inspection and retry in BullMQ. Development
recovery may delete the synthetic S3 object and reset the disposable stack with
`pnpm dev:reset -- --confirm-project=LEF`.

## Artifacts and Notes

- Focused Jest: 7 suites and 42 tests passed.
- Full Jest: 122 suites and 751 tests passed; 9 suites and 27 tests remained skipped by existing environment gates,
  with 1 existing pending test.
- `pnpm typecheck` passed. `pnpm lint` passed with two preexisting explicit-return-type warnings outside this scope.
- Harper passed for both changed Markdown files. Prettier and `git diff --check` passed.
- Bruno runtime: not run because no local Compose services or generated Keycloak credentials were present. The two
  changed OpenCollection YAML files passed Prettier validation.
- No synthetic job ID, bucket, object key, or customer data was produced because Bruno runtime validation was not
  available.

## Plan Readiness

Ready to implement.
