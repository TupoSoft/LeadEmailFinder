# Restore Actionable Frontend Plans

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Restore the three actionable frontend tickets to the generated `Todo` queue. A successful sync recognizes all 18
frontend plans as ready, while unfinished dependencies keep the other 15 in Backlog.

## Progress

- [x] (2026-09-04) Verify the live board and reproduce all 18 metadata failures with the repository fixture.
- [x] (2026-09-04) Normalize readiness sections, clarify the format, and preserve the planning context.
- [x] (2026-09-04) Validate the corrected plans and review the proposed GitHub changes.

## Plan dependencies

None.

## Surprises & Discoveries

The parser requires the entire readiness section to equal `Ready to implement.`. Each frontend plan ends with that
sentence but includes explanatory prose in the same section. The existing planning instructions did not make this
restriction explicit. The live sync succeeded while placing all 18 frontend tickets in Backlog.

There are also 51 completed legacy plans with unrecognized readiness prose. Their completed progress correctly
resolves to Done, so the new fixture assertion applies only to incomplete plans.

The clean installation exposes `tsconfig-paths` only as a transitive dependency, although the shared TypeScript
configuration requires it. The read-only sync uses the installed module through `NODE_PATH`; no dependency or
runtime configuration was changed.

## Decision Log

- Decision: Move the explanatory paragraphs into each plan's existing Artifacts and Notes section without changing
  their wording or progress. Rationale: Preserve the recorded decisions and the strict runtime readiness rule.
  Date/Author: 2026-09-04, Codex.
- Decision: Reject unrecognized readiness in incomplete repository fixtures. Rationale: Detect this metadata error
  before it silently removes actionable work from `Todo`. Date/Author: 2026-09-04, Codex.

## Outcomes & Retrospective

All 18 frontend plans now have recognized readiness. The read-only sync confirms that issues #496, #497, and #511
become `Todo`; the other 15 frontend plans stay in Backlog. Frontend implementation has not started. The live queue
will update when this repair reaches master and the normal synchronization workflow succeeds.

## Context and Orientation

`scripts/plans/execplan.ts` reads plan metadata and derives states from readiness, progress, and dependencies.
`scripts/plans/sync.ts` mirrors those states to Project 9, preserving assigned In Progress work and existing Done
items. The workflow runs after relevant changes reach master. The parser currently derives `Todo` for `proxy-fleet/17`,
whose assigned project item stays In Progress.

## Scope and Non-Goals

Change only the 18 frontend readiness sections, `.agents/PLANS.md`, this tracking plan and its road map, and
`scripts/plans/execplan-repository-fixture.spec.ts`. Do not implement frontend features, relax approval requirements,
change runtime parsing, or alter dependencies, business modules, HTTP APIs, or database schemas.

## Plan of Work

Keep each frontend readiness section limited to the canonical sentence and move its existing context immediately
above the heading. Clarify that contract in `.agents/PLANS.md`. Extend the repository fixture to report paths for
incomplete plans whose readiness is unrecognized. Run focused validation and inspect a read-only sync before
preparing the single pull request. The normal sync applies the corrected queue after the pull request reaches master.

## Interfaces and Dependencies

No application interface changes. Reuse the existing parser, repository fixture, sync command, and authenticated
GitHub CLI. GitHub state remains generated from repository plans.

## Acceptance Criteria

- All 18 frontend plans have recognized readiness without changed progress or dependency declarations.
- `frontend/01`, `frontend/02`, and `frontend/16` resolve to `Todo`; the other 15 frontend plans remain in Backlog.
- The repository fixture rejects the original 18 malformed sections and accepts the corrected sections.
- Completed legacy plans and assigned In Progress work retain their existing behavior.
- Focused tests pass; a read-only sync proposes only the intended metadata changes.

## Validation

Run `corepack pnpm exec jest --runInBand scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts scripts/plans/sync.spec.ts`.
Run `corepack pnpm exec eslint scripts/plans/execplan-repository-fixture.spec.ts`,
`NODE_PATH=./node_modules/.pnpm/tsconfig-paths@4.2.0/node_modules PLANS_DRY_RUN=true corepack pnpm plans:sync`, and `git diff --check`.

Bruno and the business module architecture gate are not applicable because this change affects only planning
metadata and its repository validation.

## Idempotence and Recovery

The normalized readiness sections are stable across repeated syncs. Existing issue markers retain ticket identity.
Revert the pull request to restore the previous metadata and validation behavior if required.

## Artifacts and Notes

Before normalization, the new fixture failed with exactly the 18 frontend paths. No frontend progress checkbox was
changed. Tracking issue: #528, assigned to the requesting user and placed In Progress on Project 9.

Validation on 2026-09-04:

- The focused Jest command passed all 59 tests across three suites after normalization.
- The then-current Harper command passed all 21 changed Markdown files. Required prose cleanup also corrected existing
  heading capitalization, requirement-list punctuation, and road map spelling in `.agents/PLANS.md`.
- Focused ESLint and `git diff --check` passed.
- The read-only sync evaluated 128 plans, proposed zero creations and 19 updates, and left all unrelated plans
  unchanged. Those updates cover the 18 frontend issue bodies and this tracking issue. No live queue was rewritten.
- Independent diff review found no actionable issues or material SOLID trade-offs. No runtime architecture changed.

## Plan readiness

Ready to implement.
