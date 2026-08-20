# Report bounded batch progress

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Batch status must report a finite percentage from `0` through `100`. After this change, a batch with eight processed
and two pending children reports `80`, an empty or fully processed child set reports a meaningful terminal value,
and completed jobs report exactly `100` rather than `Infinity`.

## Progress

- [x] (2026-08-21) Define step-aware progress semantics and correct the denominator.
- [x] (2026-08-21) Add boundary and HTTP serialization tests.
- [x] (2026-08-21) Extend batch Bruno assertions; static validation only — see Outcomes & Retrospective.

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
- The local development stack was not running in this environment when implementation happened (stopped in an
  earlier, unrelated session action). Bruno execution against a live API was not attempted; the collection was
  statically validated instead (see Outcomes & Retrospective) — matches `AGENTS.md`'s Bruno policy fallback:
  "perform available static validation and clearly report that Bruno execution remains unverified."

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
- `bruno/batch-verification/` (new collection): both request files parsed and loaded correctly under
  `npx @usebruno/cli run --env local --sandbox developer` (confirmed via a run against an unreachable local
  Keycloak — the only failures were `fetch failed` from the auth pre-request script, not schema/parse errors, so
  the multipart-form upload body and the polling test script are structurally valid). The exact multipart-form
  schema (`type: multipart-form`, file entries as `{name, type: file, value: [<path>]}`, paths resolved relative
  to the collection root) was confirmed directly against `@usebruno/cli`'s own source, since no prior multipart
  example existed anywhere in this repo's other Bruno collections.
- Repo-wide: `corepack pnpm lint` (0 errors, the same 2 pre-existing unrelated warnings as prior plans' baseline),
  `corepack pnpm typecheck` (0 issues), `corepack pnpm test:ci` (690/690 non-skipped tests, up from 680 before this
  plan), `corepack pnpm build` (431 files, 0 issues), `git diff --check` (clean).

**Not verified live** (no disposable local stack running in this environment at implementation time — stopped in
an earlier, unrelated session action; bringing it back up was out of scope for this plan):
- The actual runtime poll against a live API (`bru run --env local` against a real Keycloak/API/Postgres/Redis
  stack), including the CSV upload actually enqueuing a real BullMQ job and the poll loop observing real progress
  values through `WaitForChildren`/`UploadResults`/`Finish` transitions end to end.

A follow-up run of `pnpm dev:reset` followed by `cd bruno/batch-verification && npx @usebruno/cli run --env local
--sandbox developer` (with the environment variables in the collection's `README.md`) would close this last gap.

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

**Recorded this implementation** (from the focused unit tests; no runtime poll available, see Outcomes & Retrospective):

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

## Plan readiness

Implemented (PR pending; see Progress and Outcomes & Retrospective for exactly what is and isn't live-verified in this environment).
