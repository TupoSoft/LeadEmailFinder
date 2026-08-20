# Report bounded batch progress

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Batch status must report a finite percentage from `0` through `100`. After this change, a batch with eight processed
and two pending children reports `80`, an empty or fully processed child set reports a meaningful terminal value,
and completed jobs report exactly `100` rather than `Infinity`.

## Progress

- [ ] (2026-08-20) Define step-aware progress semantics and correct the denominator.
- [ ] (2026-08-20) Add boundary and HTTP serialization tests.
- [ ] (2026-08-20) Extend batch Bruno assertions and run validation.

## Plan dependencies

- `auth/05`

## Surprises & Discoveries

- `getStats()` calculates `processed / unprocessed * 100`; this exceeds 100 whenever processed exceeds pending and
  divides by zero after all children complete.
- Existing tests assert counts but do not assert progress for active, empty, or completed jobs.

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

Not started.

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

## Plan readiness

Ready to implement.
