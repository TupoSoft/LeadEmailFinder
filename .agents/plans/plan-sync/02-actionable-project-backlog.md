# Distinguish actionable ExecPlans from dependency backlog

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make Project 9's `Todo` status an actionable queue. After this change, an unstarted ExecPlan appears in `Todo`
only when it is decision-complete and every declared prerequisite is complete; future or unresolved work appears
in `Backlog`. A developer can observe the distinction in a dry run and see a successor promote automatically
after its dependency's progress checkboxes are completed on `master`.

## Progress

- [x] Add structured plan dependencies and graph validation. (2026-08-18)
- [x] Resolve effective Backlog, Todo, In Progress, and Done states. (2026-08-18)
- [x] Preflight project status options before any GitHub write. (2026-08-18)
- [x] Migrate incomplete roadmap plans to explicit dependency keys. (2026-08-18)
- [x] Add focused tests and complete repository and live dry-run validation. (2026-08-18)

## Plan dependencies

None.

## Surprises & Discoveries

- Project 9 view 1 is an unfiltered board named `Backlog`, grouped vertically by `Status` and sorted by
  `Priority`; labels are not visible on its cards.
- The existing readiness parser classifies `Ready to implement after ...` as ready because it accepts the broader
  `Ready to implement` prefix first.

## Decision Log

- Decision: Keep execution dependencies as stable ExecPlan keys in a dedicated Markdown section.
  Rationale: Status must not depend on roadmap prose or mutable issue titles.
  Date/Author: 2026-08-18, project planning.
- Decision: Reserve `Ready after ...` and the `blocked` label for unresolved decisions or evidence.
  Rationale: Waiting for an ordinary predecessor is backlog sequencing, not an implementation blocker.
  Date/Author: 2026-08-18, project planning.
- Decision: Abort before all issue and label writes when the dependency graph or project statuses are invalid.
  Rationale: A failed preflight must not leave a partially updated generated mirror.
  Date/Author: 2026-08-18, project planning.

## Outcomes & Retrospective

Implemented the dependency-aware generated mirror as one focused change. Project 9 now has the `Backlog` Status
option, view 1 is named `Delivery board`, and view 7 is a `Ready to start` table filtered by `status:Todo` with the
requested visible fields. GitHub's public Project V2 API does not expose view sorting, so the requested ascending
Priority sort on view 7 remains a one-time UI action.

The final dry run resolves only `auth/06`, `payments/01`, and `proxy-fleet/11` to `Todo`; eleven incomplete
successors resolve to `Backlog`. Both plan-sync plans resolve to `Done`, and the existing completed plans remain
protected from reopening.

## Context and Orientation

`scripts/plans/execplan.ts` parses plans and owns pure mapping rules. `scripts/plans/sync.ts` coordinates issue and
project writes through the `GitHubProjectPort` in `scripts/plans/github-project-api.ts`. The current status mapping
uses progress alone, so all zero-progress plans become `Todo`; readiness only controls the `blocked` issue label.

Project 9 currently mirrors 30 ExecPlans: 15 `Done`, one `In Progress`, and 14 `Todo`. The intended actionable
roots are `auth/06`, `proxy-fleet/11`, and `payments/01`.

## Scope and Non-Goals

Add dependency-aware status resolution, status-option preflight, issue-body explanations, plan migrations, and
focused tests. Do not synchronize Priority, Size, Estimate, Iteration, assignees, or view configuration from the
repository. Do not change application or HTTP API behavior.

## Plan of Work

Extend the pure ExecPlan model with dependency keys, validate the full graph, and resolve an effective state for
each plan. Make the synchronizer preflight repository-derived states and all four Project status options before
ensuring labels or editing issues. Pass each resolved state into deterministic issue rendering and status writes.

Migrate the incomplete authentication, proxy-fleet, and payments plans to explicit dependencies and normalize
dependency-complete readiness text to `Ready to implement`. Keep payments plan 06 conditional on its unresolved
clawback decision.

## Interfaces and Dependencies

`ExecPlan` gains `dependencies: string[]`. The pure plan API gains a graph resolver returning a status and optional
backlog reason per key. `ProjectStatus` gains `Backlog`. `GitHubProjectPort` gains a read-only status-option
preflight. No runtime dependency is added.

## Acceptance Criteria

- Invalid duplicate, missing, self-referencing, or cyclic dependencies fail before any GitHub mutation.
- Complete plans map to `Done`; partially complete plans map to `In Progress` regardless of dependency state.
- A zero-progress plan maps to `Todo` only when readiness is recognized as ready and all dependencies are complete.
- Dependency-gated, conditional, blocked, and unknown-readiness plans map to `Backlog` with a visible reason.
- Only conditional and blocked readiness receives the `blocked` label.
- Existing `Done` project items are never reopened.
- The migrated repository resolves three synced plans to `Todo` and eleven to `Backlog`.

## Validation

Run `corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/sync.spec.ts --runInBand`,
`corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, and
`PLANS_DRY_RUN=true corepack pnpm plans:sync`. Verify the dry run reports three synced `Todo` plans and eleven
synced `Backlog` plans. Bruno is not applicable because no HTTP behavior changes.

## Idempotence and Recovery

Dependency parsing and resolution are deterministic. Repeated syncs retain the existing marker-based idempotence.
If project preflight fails, add or restore the named Status option and rerun; no generated issue mutation will have
occurred. Revert the pull request to restore the previous progress-only status mapping.

## Artifacts and Notes

- Focused Jest: 2 suites, 45 tests passed.
- Full Jest outside the restricted network sandbox: 65 suites and 361 tests passed; 4 live-gated suites and 11
  tests skipped, with one existing todo.
- `pnpm typecheck` passed. `pnpm lint` passed with the two pre-existing explicit-return-type warnings.
- `git diff --check` passed.
- Project option and view configuration were re-queried after mutation; no token value was recorded.

## Plan readiness

Ready to implement.
