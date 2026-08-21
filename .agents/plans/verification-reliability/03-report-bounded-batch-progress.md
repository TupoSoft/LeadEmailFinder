# Report bounded batch progress

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Batch status must report a finite percentage from `0` through `100`. After this change, a batch with eight processed
and two pending children reports `80`, an empty or fully processed child set reports a meaningful terminal value,
and completed jobs report exactly `100` rather than `Infinity`.

## Progress

- [x] (2026-08-21) Define step-aware progress semantics and correct the denominator.
- [x] (2026-08-21) Add boundary and HTTP serialization tests.
- [x] (2026-08-21) Extend batch Bruno assertions and run validation, including a live run against `pnpm dev:reset`.

## Plan dependencies

- `auth/05`

## Surprises & Discoveries

- `getStats()` calculates `processed / unprocessed * 100`; this exceeds 100 whenever processed exceeds pending and
  divides by zero after all children complete.
- Existing tests assert counts but do not assert progress for active, empty, or completed jobs.
- `Finish` was not special-cased at all before this change — it fell into the same buggy division branch as
  `WaitForChildren`/`UploadResults`, so a completed batch with `processed === unprocessed` (e.g. both `0` after
  queue cleanup) could report something other than `100` even after this plan's denominator fix, unless `Finish`
  is handled unconditionally. Fixed by returning `100` for `Finish` before any division happens.
- `bruno/batch-verification` did not exist yet (plan 02, which was expected to create it, has not landed) — created
  it fresh per this plan's own explicit allowance ("create only the minimal status collection files if
  implementation order is reversed").
- The local development stack was not running when implementation started; brought up via `pnpm dev:reset` for
  live Bruno validation. Authenticating as the platform-operations service client (the pattern every other
  collection in this repo uses) fails every upload here with `InsufficientCreditsException`, because
  `verification:run` debits the caller's own organization and that organization is deliberately seeded with zero
  credits — this collection needs the seeded customer fixture credential instead. See Outcomes & Retrospective.
- `@usebruno/cli`'s test runner does not await an `async` `test()` callback — a poll loop written inside `tests`
  silently never ran (0 assertions registered, no error). The delay must live in the `before-request` script
  (which is correctly awaited); the `tests` script itself must stay synchronous.

## Decision Log

- Decision: Progress describes completion of child email-verification jobs and uses
  `processed / (processed + unprocessed) * 100`.
  Rationale: BullMQ exposes completed and outstanding dependency counts, whose sum is the stable denominator.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Validation and child-enqueue steps report `0`; waiting/upload/finish with no child work report `100`;
  `Finish` always reports `100`.
  Rationale: Before children exist there is no verification progress, while an empty validated batch or completed
  child phase has no remaining verification work.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Return the unrounded JavaScript percentage while guaranteeing it is finite and clamped to `[0, 100]`.
  Rationale: The API already declares `number` and no rounding contract; clamping defends against inconsistent
  queue counts without inventing display policy.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Implemented and validated to the extent this environment allows.

**Verified for real:**
- `batch-email-verification-service-impl.service.ts`'s `getStats()` rewritten as a step-aware, clamped calculation:
  `Validate`/`Process` → `0`; `Finish` → always `100` regardless of counts; everything else → `100` when `total`
  is `0` (no division), otherwise `clamp(processed / total * 100, 0, 100)`. No division by `unprocessed` remains,
  so no `Infinity` or out-of-range value can be produced.
- `batch-email-verification.service.spec.ts`: 9 new table-driven cases covering every acceptance criterion (8/2→80,
  0/10→0, 10/0→100 not `Infinity`, empty upload/finish→100, `Finish` always 100 regardless of counts, and a
  defensive negative-count case), each asserting the value is finite and within `[0, 100]`.
- `batch-email-verification.controller.spec.ts`: new `GET /verifyBatch/:id` test block (the service mock previously
  only stubbed `uploadFile`) proving the HTTP-serialized `progress` is finite JSON.
- `bruno/batch-verification/` run live end to end against a `pnpm dev:reset` stack (real Keycloak, Postgres,
  Redis, API): `01-upload-csv` enqueues a real BullMQ job via a real multipart CSV upload; `02-poll-batch-progress`
  asserts a finite, `[0,100]`-bounded `progress` and, for a completed job, exactly `100` — `3/3` tests passing.
  The exact multipart-form schema (`type: multipart-form`, file entries as `{name, type: file, value: [<path>]}`,
  paths resolved relative to the collection root) was confirmed directly against `@usebruno/cli`'s own source,
  since no prior multipart example existed anywhere in this repo's other Bruno collections.
- Manually reproduced the exact pre-fix defect against the live API for a definitive before/after: a completed
  2-row batch (`processed: 2, unprocessed: 0`) now reports `progress: 100`; the old `processed / unprocessed * 100`
  formula would have computed `2/0*100 = Infinity` for this exact real response.
- Repo-wide: `corepack pnpm lint` (0 errors, the same 2 pre-existing unrelated warnings as prior plans' baseline),
  `corepack pnpm typecheck` (0 issues), `corepack pnpm test:ci` (690/690 non-skipped tests, up from 680 before this
  plan), `corepack pnpm build` (431 files, 0 issues), `git diff --check` (clean).

**Discovered and fixed two problems only live testing surfaced:**
- The collection originally authenticated as the platform-operations service client (`lef-development-service`,
  `platform:admin`, the same credential `proxy-registry`/`credit-purchases` collections use) — but
  `verification:run` debits a credit from the *caller's own organization*, and the platform-operations
  organization is deliberately seeded with zero credits, so every upload failed with
  `InsufficientCreditsException`. Fixed by authenticating as the seeded **customer** M2M client
  (`lef-svc-dev-fixture`, 1000 seeded credits) instead; its secret isn't written to disk like
  `service-client.json` is, so `README.md` documents fetching it live from the Keycloak Admin API using the
  org-admin credentials `pnpm dev:reset` already writes.
- An `async` test function with an internal poll loop (`await new Promise(...)` inside `test(...)`) was silently
  never awaited by `@usebruno/cli`'s test runner — the request "passed" in a few milliseconds with `0` assertions
  actually registered, no error surfaced. Fixed by moving the delay into the `before-request` script (which *is*
  correctly awaited) and keeping the `tests` script itself synchronous.

## Context and Orientation

`BatchEmailVerificationServiceImpl.getBatchStatus()` reads the BullMQ job state and delegates counts to private
`getStats()`. The job-data `step` distinguishes validation, child creation, waiting, result upload, and finish.
`GetBatchStatusResponseDto` exposes `total`, `processed`, `unprocessed`, and `progress` without further conversion.

## Scope and Non-Goals

Correct progress semantics and test their serialization. Preserve job states, queue topology, child scheduling,
credit behavior, status endpoint shape, and count fields. Do not add estimated time, weighted phases, persistence,
rounding configuration, UI work, or schema changes.

## Plan of Work

Refactor `getStats()` into a small step-aware calculation that normalizes missing BullMQ counts to zero, derives
`total`, returns zero before child scheduling, returns 100 for finish/empty completed work, and otherwise divides
processed by total. Clamp the result and ensure no `NaN` or infinite value can escape. Keep the calculation local
unless extracting a pure function materially improves the focused tests.

Expand `batch-email-verification.service.spec.ts` with table-driven cases for 0/0 at validation, 0/10, 8/2, 10/0,
empty upload/finish, and defensive inconsistent values if BullMQ can supply them. Add a controller serialization
case proving finite JSON. Extend the batch Bruno workflow created by plan 02 to poll status, assert every observed
progress value lies within `[0,100]`, and assert completed progress is exactly `100`.

## Interfaces and Dependencies

No interface shape changes. The observable value of `progress` from `GET /verifyBatch/:id` is corrected. This plan
is independently mergeable; it can reuse `bruno/batch-verification` when plan 02 has landed, or create only the
minimal status collection files if implementation order is reversed.

## Acceptance Criteria

- Eight processed and two unprocessed children report total `10` and progress `80`.
- Zero processed and ten unprocessed children report `0`.
- Ten processed and zero unprocessed children report `100`, never `Infinity`.
- A completed or upload-stage batch with zero children reports `100`; validation/process before child creation
  reports `0`.
- Every serialized progress value is finite and within `[0,100]`.
- Ownership checks, job status, and count fields retain their existing behavior.

## Validation

Run `batch-email-verification.service.spec.ts`, the relevant controller spec, and the updated batch Bruno collection
when the local workflow is available. Run `corepack pnpm typecheck`, `corepack pnpm lint`, the full Jest suite with
temporary paths set to `/tmp`, and `git diff --check`.

## Idempotence and Recovery

This is a pure read-side calculation with no persistent effects. Repeated status reads return values derived from
the latest BullMQ counts. Reverting the calculation restores prior display behavior; no reset or reseed is needed.

## Artifacts and Notes

Record a compact table of step, processed, unprocessed, total, and progress from the focused tests and runtime poll.

**Recorded this implementation** (from the focused unit tests plus a real runtime poll against `pnpm dev:reset`):

| step | processed | unprocessed | total | progress |
|---|---|---|---|---|
| Validate | 0 | 0 | 0 | 0 |
| Process | 0 | 0 | 0 | 0 |
| WaitForChildren | 0 | 10 | 10 | 0 |
| WaitForChildren | 8 | 2 | 10 | 80 |
| WaitForChildren | 10 | 0 | 10 | 100 (not `Infinity`) |
| UploadResults | 0 | 0 | 0 | 100 |
| Finish | 0 | 0 | 0 | 100 |
| Finish | 5 | 5 | 10 | 100 (always, regardless of counts) |
| WaitForChildren | -1 | -1 | -2 | 100 (defensive, never `NaN`) |
| completed (live, `pnpm dev:reset`, real 2-row CSV) | 2 | 0 | 2 | 100 (live-observed; pre-fix formula would have computed `Infinity` for this exact response) |

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
