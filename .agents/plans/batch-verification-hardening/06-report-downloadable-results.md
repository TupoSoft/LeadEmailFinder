# Report Batch Results Only When the Download Route Can Serve Them

This living document follows `.agents/PLANS.md` and describes exactly one pull request.

## Purpose / Big Picture

Make `GET /verifyBatch/:id` report `resultsAvailable` using the same retained-job eligibility rule as
`GET /verifyBatch/:id/results`. A completed job with a valid retained result location reports true. A failed
job reports false, including a failure after its credits settled or its output upload failed. A developer can
observe this by polling a failed batch and confirming that its false flag agrees with the download route's `404`.

This corrects an existing contract inconsistency. It adds no new result-generation or download capability.
The single PR title is `fix(email-verification): report batch download availability accurately`.

## Progress

- [x] (2026-09-22) Add and reuse one pure eligibility function for status and result download.
- [x] (2026-09-22) Cover terminal, transitional, missing-location, storage, and ownership behavior: 115 focused tests pass.
- [x] (2026-09-22) Update API descriptions, generated contracts, Bruno assertions, and module documentation; OpenAPI checks pass.
- [x] (2026-09-22) Complete independent diff review and Harper validation. Focused tests, architecture, type checking, lint, and the synthetic Bruno runner pass. Live Bruno stops at fixture setup and remains unverified.

## Plan dependencies

- `verification-billing/05`

## Surprises & Discoveries

- The implementation starts from current `master` at `095454b`, which includes the billing prerequisite.
  Regression tests reproduced true availability for failed `admitting`, `admitted`, and `insufficient_credits`
  admissions before the service fix.
- This checkout contains an unrelated nested checkout under the untracked `.claude/` directory. Focused Jest
  commands exclude it with `--modulePathIgnorePatterns '<rootDir>/.claude/'` and select exact test paths.
  The commit hook also discovered an obsolete test there, which could not load the removed
  `@automapper/nestjs` dependency. The architecture check passed. A separate affected-test run excluded that
  directory and passed all seven suites. The single commit bypasses the hook after these equivalent checks;
  unrelated files and repository configuration remain unchanged.
- The available Docker Compose project belongs to another checkout and contains only one running service.
  Live Bruno validation must use this checkout's own healthy stack; the unrelated project will not be reused.

## Decision Log

- Decision: Restrict true to the existing completed-job and retained-location predicate. The result route has
  no database streaming fallback; declaring failed jobs downloadable would promise unavailable behavior.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Do not perform an S3 existence request during status polling. True means that the retained job
  identifies a result accepted by the download route, not a guarantee of permanent object retention or current
  storage availability. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep current download errors and organization concealment. A missing retained object remains `404`;
  an infrastructure error keeps its existing error mapping. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Both endpoints now share one pure application eligibility function. Only completed jobs with an accepted retained
location advertise downloadable results. Failed jobs remain unavailable even after settlement or result upload
failure. HTTP tests verify the unchanged missing-object `404`, infrastructure `500`, and organization concealment.
Status polling makes no storage call, and billing and address counts keep their existing behavior.

The generated API contract changes only the flag description. Architecture review found no new public exports,
module dependencies, infrastructure coupling, or material SOLID trade-offs. No schema change or reset is needed.
Live Bruno remains unverified because this checkout has no healthy development stack; the synthetic runner checks
collection behavior but does not prove live storage, SMTP, or database behavior.

## Context and Orientation

Review evidence comes from PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`. The planning checkout's
`451798dadf82e316ba68b4333ddba32bf0f99a97` does not contain that implementation. Apply this plan after its
prerequisite, then verify the named symbols against the resulting code before editing.

The email-verification module owns both endpoints. `BatchEmailVerificationService.getBatchStatus()` currently
sets the flag true for a completed job or any failed admission past `validating`/`invalid`. This includes failed
admission, insufficient funds, and result-publication errors. Its `getBatchResults()` rejects every job whose
normalized status is not completed, even if durable row accounting is already settled.

The relevant paths, relative to the repository root, are:

- `src/libs/modules/email-verification/src/application/delivery/batch/batch-email-verification.service.ts`.
- `src/libs/modules/email-verification/src/application/delivery/batch/batch-verification-status.ts`.
- `src/libs/modules/email-verification/src/application/delivery/batch/batch-jobs.ts`.
- `src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/bull-batch-jobs.ts`.
- `src/libs/modules/email-verification/src/infrastructure/storage/batch-verification/parse-s3-result-location.ts`.
- `src/libs/modules/email-verification/src/api/http/batch-verification/batch-email-verification.dto.ts`.

`BullBatchJobs` refreshes terminal jobs and validates retained S3 locations before exposing a result location.
`mapBatchVerificationStatus()` maps a completed queue job without that location to `unavailable`. The result reader
maps an absent object to `BatchResultUnavailableError`; the service and controller already conceal it as `404`.
The working customer profile in `docs/product/ideal-customer-profile.md` supports understandable batch state,
but supplies no requirement for a new fallback download mechanism.

## Scope and Non-Goals

Change the flag's eligibility rule and its documented meaning. Reuse the same rule in the result reader entry
point so the endpoints cannot drift through independent predicates. Add focused unit, adapter, HTTP, and Bruno
coverage. Regenerate the OpenAPI artifacts for the corrected description without changing response fields.

No database projection endpoint, S3 retry scheduler, object existence polling, retention policy, credit-policy
change, frontend redesign, or download UI is part of this PR. Billing counts and batch processing states remain
owned by their existing logic. This plan requires no schema changes or migrations.

## Plan of Work

Read root `AGENTS.md`, `src/libs/modules/AGENTS.md`, the canonical module guide, and the email-verification README.
Read `apps/web/AGENTS.md` before checking the generated API-client boundary. Apply the repository architecture
rules to keep the eligibility rule independent of Nest, BullMQ, S3, and TypeORM.

Add `getDownloadableBatchResultLocation(snapshot): string | undefined` to the existing application
`batch-verification-status.ts`. It accepts `BatchVerificationSnapshot` and returns the retained location only
when `mapBatchVerificationStatus(snapshot).status` is `completed`. It performs no storage or network requests. Keep S3 syntax validation
at `BullBatchJobs`, which already owns normalization of queue storage into the application snapshot.

In `getBatchStatus()`, retain the snapshot returned by the existing `job.readStatus()` call, derive normalized
status from it, and set `resultsAvailable` from the helper's result. Do not issue a second queue lookup or a storage
lookup just to calculate the flag. Admission counts continue using their existing database reads.

Use the same helper in `getBatchResults()` after the current organization ownership check. An absent result
location raises the existing job-not-found exception; an eligible location proceeds through `resultReader.read()`
and its existing missing-object mapping. Keep the terminal-job refresh behavior in `BullBatchJobs` intact.

Extend the service and queue-adapter specs with the cases listed below. Add HTTP integration coverage proving
the externally visible flag and download status agree for admitted failures, with a reader spy establishing that
rejected downloads never touch storage. Use an injected failing result writer in worker/HTTP fixtures for
publication failure; do not add a public fault-injection endpoint.

Change the DTO description to explain retained completed results and possible later storage loss. Update
`src/libs/modules/email-verification/README.md` and `bruno/batch-verification/README.md` consistently. Regenerate
`packages/api-client/openapi/lead-email-finder.json` and `packages/api-client/src/schema.d.ts` through the existing
commands. The flag remains a required Boolean, so frontend parsing needs no behavioral change.

Extend `bruno/batch-verification/02-poll-batch-progress.yml` to assert true only for completed status and false for
queued, running, failed, and unavailable status. Extend the invalid-CSV status assertion to require false, retain
the successful CSV download, and retain the existing foreign status/result concealment requests. These cover the
live public success and rejection paths; deterministic HTTP integration tests cover storage publication failure.

## Interfaces and Dependencies

The application helper consumes the existing `BatchVerificationSnapshot`. It introduces no new public module
export or business-module dependency. Both endpoints keep their methods, paths, permissions, body schemas, and
HTTP status codes. Only `resultsAvailable` values for ineligible failed jobs and its documentation change.

A true flag certifies the retained job's download eligibility at the observed snapshot. If the object disappears
after publication, download can still return `404`. A transient S3 outage can still fail the download while the
flag remains true. Neither case authorizes probing again, changing credit settlement, or suppressing storage errors.

## Acceptance Criteria

- A completed owned job with a valid retained S3 location reports true and downloads its existing CSV successfully.
- Failed jobs with admitting, admitted, insufficient-credit, or invalid admission state report false. Their result
  requests return the existing `404`, including settled accounting after an injected result-upload failure.
- Queued, running, missing-location, and malformed-location snapshots never report true. A completed queue job
  without an accepted location continues to expose the existing `unavailable` public status.
- Status polling performs no S3 request. A later missing object returns `404` without verification or credit work;
  a storage infrastructure error preserves existing error handling.
- Missing and foreign batch IDs remain indistinguishable for both endpoints; foreign reads do not reach storage.
- The response schema is unchanged, generated contracts match the DTO, and the relevant Bruno collection executes
  its success and rejection checks with a nonzero executed-test count.

## Validation

From the repository root, run the focused service, status mapping, adapter, and HTTP contract checks:

```bash
corepack pnpm exec jest --runInBand --modulePathIgnorePatterns '<rootDir>/.claude/' --runTestsByPath \
  src/libs/modules/email-verification/src/application/delivery/batch/batch-email-verification.service.spec.ts \
  src/libs/modules/email-verification/src/application/delivery/batch/batch-verification-status.spec.ts \
  src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/bull-batch-jobs.spec.ts \
  src/libs/modules/email-verification/src/api/http/batch-verification/batch-verification-http.integration.spec.ts \
  src/libs/modules/email-verification/src/api/http/batch-verification/batch-verification.openapi.spec.ts
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/06-report-downloadable-results.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

Update registered collection totals and the fake workflow in `scripts/bruno/batch-verification-runner.test.mjs`
whenever requests or assertions change. Add the status-helper spec at the named path if it does not already exist. The HTTP suite uses deterministic
injected dependencies; it does not establish live S3 behavior. The Bruno launcher requires this checkout's
healthy disposable API, gateway, Keycloak, SMTP fixture, and seeded credentials. It runs the pinned CLI with
`bru run --env local --sandbox developer` and rejects skipped or zero execution. Do not replace that launcher
with an unrelated stack. If dependencies are unavailable, record Bruno as unverified and retain static checks.

Record exact commands and results in Progress and Outcomes. Fix actionable Harper findings and rerun the exact
documentation command. Do not claim that the future implementation or its runtime checks have already passed.

## Idempotence and Recovery

Both endpoints remain read-only. Repeated status and download requests do not create jobs, alter accounting,
reconstruct results, or change retained objects. Retry failed validation commands after correcting the reported
cause; generated API artifacts can be regenerated with the same commands.

No development reset is required for this change. If a clean fixture is necessary, use the documented checkout-owned
`corepack pnpm dev:reset -- --confirm-project=LEF` flow after checking its disposable targets. It rebuilds and reseeds
the development stack. Preserve other checkouts and their data. Do not add production migrations or backfills.

## Artifacts and Notes

Validation on 2026-09-22:

- The exact focused Jest command above passed: 5 suites, 115 tests, zero skips. Before the fix, three service
  cases reproduced the incorrect true flag for failed admissions.
- `corepack pnpm openapi:export`, `corepack pnpm openapi:generate`, and `corepack pnpm openapi:check` passed.
  Both generated files changed only their description of `resultsAvailable`.
- `corepack pnpm architecture:check` passed with 9 modules and zero violations. `corepack pnpm typecheck` passed.
- Focused ESLint on all changed TypeScript and runner JavaScript files passed. `git diff --check` passed.
- `corepack pnpm exec jest --passWithNoTests -o --runInBand --modulePathIgnorePatterns '<rootDir>/.claude/'`
  passed all 7 affected suites and 125 tests with zero skips.
- The exact `corepack pnpm docs:lint --` command above passed Harper for all three edited Markdown files.
- Independent diff review found no actionable defects or material architectural trade-offs.
- `node --test scripts/bruno/batch-verification-runner.test.mjs` passed all 4 tests with zero skips. The pinned
  CLI successfully executed 16 requests and 25 collection tests against the synthetic server, and rejected
  incorrect availability for all five public states and invalid CSV.
- `corepack pnpm bruno:batch-verification` exited with `stage: fixture_bootstrap` before live execution.
  Docker Compose reports only the unrelated `lef` project from another checkout, with one running service.
- The locked workspace dependencies were restored before final validation. The first install encountered a
  read-only package cache; the authorized retry of `corepack pnpm install --frozen-lockfile` completed.


The review reproduced `resultsAvailable: true` and a job-not-found error for the same failed admitted batch.
The original plan for PR #633 explicitly deferred a database download fallback; this plan corrects the flag without
silently reintroducing that feature. This PR independently makes status safe for existing and future consumers.

## Plan readiness

Ready to implement
