# Preserve assigned work in progress

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Keep Project 9 from undoing an explicit human signal that assigned work has started. After this change, a developer
can assign an ExecPlan issue, move it to `In Progress`, run the sync before checking a progress box, and observe that
the item remains `In Progress`. Repository completion can still advance the item to `Done`.

## Progress

- [x] Expose issue assignees through the GitHub project port. (2026-08-19)
- [x] Preserve assigned active work from backward status synchronization. (2026-08-19)
- [x] Add focused synchronization tests and update policy documentation. (2026-08-19)
- [x] Complete focused and repository validation. (2026-08-19)

## Plan dependencies

- `plan-sync/02`

## Surprises & Discoveries

- Project items expose status and content URL, while assignees belong to the linked issue. The existing issue-list
  adapter is therefore the narrowest place to fetch assignee logins without adding another GitHub call.

## Decision Log

- Decision: Preserve `In Progress` only when the linked issue has at least one assignee and the repository-derived
  status is `Todo` or `Backlog`.
  Rationale: Assignment plus active status is an explicit human start signal; either signal alone can be stale.
  Date/Author: 2026-08-19, project implementation.
- Decision: Allow repository-derived `Done` to replace assigned `In Progress`.
  Rationale: Completed plan checkboxes are the authoritative completion signal and this is forward progress.
  Date/Author: 2026-08-19, project implementation.

## Outcomes & Retrospective

Implemented the narrow assigned-work safeguard without changing assignees or repository progress resolution.
Assigned `In Progress` items now resist backward movement to `Todo` or `Backlog`, while unassigned items still
reconcile and completed plans still advance to `Done`. Focused, static, full-suite, and live read-only validation
completed successfully.

## Context and Orientation

`scripts/plans/github-project-api.ts` adapts GitHub CLI issue and Project V2 data into the narrow
`GitHubProjectPort`. `scripts/plans/sync.ts` coordinates issue updates and project status writes. Before this change,
the synchronizer protected only `Done`; an assigned item manually placed in `In Progress` could be moved back to
the repository-derived `Todo` or `Backlog` status when its ExecPlan had no checked progress box.

## Scope and Non-Goals

Read issue assignees and use them only to prevent backward movement from `In Progress`. Do not write assignees,
infer an assignee from project fields, change progress parsing, or change application and HTTP API behavior.

## Plan of Work

Extend `IssueSummary` with assignee logins and map the `gh issue list` response inside the GitHub CLI adapter. In
the synchronizer, detect assigned `In Progress` items and suppress status writes to `Todo` or `Backlog`, while
retaining the existing `Done` protection and allowing forward completion. Cover each branch with focused tests and
record the rule in the plan-sync roadmap.

## Interfaces and Dependencies

`IssueSummary` gains `assignees: string[]`. The GitHub CLI adapter requests the existing `assignees` JSON field.
No external dependency or application interface changes.

## Acceptance Criteria

- An assigned project item in `In Progress` remains there when repository state resolves to `Todo`.
- An assigned project item in `In Progress` remains there when repository state resolves to `Backlog`.
- An unassigned project item in `In Progress` still moves to its repository-derived status.
- An assigned project item in `In Progress` advances to `Done` when all progress checkboxes are complete.
- Existing `Done` protection and assignee values remain unchanged.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/sync.spec.ts --runInBand`,
`corepack pnpm typecheck`, changed-file ESLint, and `git diff --check`. Run
`PLANS_DRY_RUN=true corepack pnpm plans:sync` when GitHub credentials and network access are available. Bruno is
not applicable because no HTTP behavior changes.

## Idempotence and Recovery

The read-only assignee check and status decision are deterministic. Repeated syncs preserve the same assigned
active item until plan progress completes or a human removes the assignee or changes the board status. Revert this
pull request to restore unconditional repository-derived movement outside `Done`.

## Artifacts and Notes

- Focused plan-sync Jest: 2 suites and 49 tests passed.
- Full Jest outside the restricted listener sandbox: 107 suites and 645 tests passed; 8 suites and 22 tests
  skipped, with one existing todo.
- TypeScript typecheck passed. Full ESLint passed with two pre-existing explicit-return-type warnings.
- Prettier and `git diff --check` passed.
- Live `PLANS_DRY_RUN=true corepack pnpm plans:sync` completed against Project 9 with no writes, proving the GitHub
  CLI accepts the expanded assignee query.

## Plan readiness

Ready to implement.
