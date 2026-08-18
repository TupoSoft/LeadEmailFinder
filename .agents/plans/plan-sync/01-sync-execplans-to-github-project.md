# Sync ExecPlans to the GitHub project

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make roadmap progress visible without maintaining it twice. After this change, every ExecPlan file has a matching GitHub issue on project 9 with a `Status` derived from the plan's own `Progress` checkboxes, refreshed automatically when a plan file lands on `master`. A developer can observe it by editing a plan's checkboxes, merging, and watching the board move.

## Progress

- [x] Add ExecPlan parsing and issue-body rendering with unit tests.
- [x] Add the `gh`-backed GitHub project adapter behind a port.
- [x] Add the synchronizer with create, update, unchanged, and status-transition handling.
- [x] Add the `plans:sync` script entry point and dry-run mode.
- [x] Add the `Sync ExecPlans` workflow on pushes to `master`.
- [x] Validate with `pnpm typecheck`, `pnpm lint`, `pnpm test`, and a dry run against project 9.
- [x] Perform the first live run and confirm the board. (2026-08-17)

## Surprises & Discoveries

- The repository's Prettier configuration is not applied to YAML: `.github/workflows/validate.yml`, `.github/workflows/labeler.yml`, and `docker/compose.yaml` all fail `prettier --check`, and CI never runs Prettier. Running `prettier --write` on the new workflow reindented it to four spaces, out of step with every sibling workflow, so it was restored to the two-space style the other workflows use. Prettier remains applied to the TypeScript sources.
- The repository holds far more ExecPlans than the handful assumed when scoping: 24 on `master` (`auth` 10, `plan-sync` 1, `proxy-fleet` 13), rising to 30 once the `payments` roadmap in PR #324 merges. A first live run therefore creates two dozen issues at once, 15 of which land directly in `Done` because their plans are complete. This is a one-time, outward-facing side effect that needs an explicit decision before the first run rather than happening as a side effect of merging.
- Status derivation was confirmed correct against real history in the dry run: `auth/01`–`auth/05` and `proxy-fleet/01`–`proxy-fleet/10` resolve to `Done`, and every incomplete plan resolves to `Todo`.
- `gh project item-list` returns the `Status` field as a lowercased top-level `status` key on each item rather than nested under fields, which is what the adapter reads to decide whether a status write is needed.

## Decision Log

- Decision: The sync is one-way, from files to GitHub.
  Rationale: `.agents/PLANS.md` requires a plan file to remain sufficient for another engineer to resume from alone. Two-way sync would make the board a second source of truth and require conflict resolution against a living document.
  Date/Author: 2026-08-17, project planning.
- Decision: Issues are matched by an HTML-comment marker keyed to `<feature>/<NN>`, embedded in the issue body.
  Rationale: The marker survives retitling and file renames, which titles and filenames do not. Keying on the numeric prefix rather than the full slug means `06-refund-clawbacks` can become `06-payment-reversals` without orphaning its issue and creating a duplicate.
  Date/Author: 2026-08-17, project planning.
- Decision: Candidate issues are found by listing the `execplan` label and matching markers locally, not by GitHub code search.
  Rationale: Search does not reliably tokenize HTML comments, and a label listing is one deterministic call whose result can be asserted in tests.
  Date/Author: 2026-08-17, project planning.
- Decision: `Status` is derived from the `## Progress` checkboxes: none checked is `Todo`, some checked is `In Progress`, all checked is `Done`.
  Rationale: The checkboxes are already maintained as the plan progresses, so no new bookkeeping is introduced. The board therefore lags reality by exactly one commit, which is acceptable for a mirror.
  Date/Author: 2026-08-17, project planning.
- Decision: The sync never moves an item out of `Done`.
  Rationale: A completed plan whose file is later edited must not reopen on the board, and humans marking something `Done` ahead of the file should not be overruled by a generated process.
  Date/Author: 2026-08-17, project planning.
- Decision: `Priority`, `Size`, `Iteration`, and assignees are never written.
  Rationale: They are human judgments the board already holds. Writing them would overwrite deliberate decisions on every run.
  Date/Author: 2026-08-17, project planning.
- Decision: The workflow authenticates with a `PROJECT_SYNC_TOKEN` secret rather than `GITHUB_TOKEN`.
  Rationale: The default Actions token cannot write organization-level Projects v2, so a classic PAT with `project` scope, a fine-grained token with organization project write, or a GitHub App token is required. This is the one setup step that cannot be committed to the repository.
  Date/Author: 2026-08-17, project planning.
- Decision: A `concurrency` group serializes runs.
  Rationale: Two overlapping runs could both observe a missing issue and create duplicates, which the marker cannot prevent after the fact.
  Date/Author: 2026-08-17, project planning.

## Outcomes & Retrospective

Implementation complete; the first live run is deliberately outstanding.

- `pnpm typecheck` and `pnpm lint` are clean, with only the two pre-existing warnings in `load-secrets.spec.ts` and `parse-connection-string-options.factory.spec.ts`.
- The full `jest` suite passes: 65 suites, 348 tests, with 4 live-gated suites skipped. 29 of those tests are new and cover key derivation, section parsing, checkbox counting, readiness classification, label selection, status derivation, body rendering, and the synchronizer's create, update, unchanged, rename, missing-item, already-`Done`, dry-run, and multi-plan paths.
- `PLANS_DRY_RUN=true pnpm plans:sync` ran against the real project 9 and reported 24 plans on `master`, all as `created`, with statuses matching merge history.

The first live run completed successfully in GitHub Actions run `32062454564`; the follow-up payments-plan
sync also completed successfully in run `32068481622`. The generated mirror exposed a follow-up need: unstarted
dependency-gated plans were indistinguishable from immediately actionable work in `Todo`. Plan 02 addresses that
queue-shaping concern without changing this plan's one-way source-of-truth decision.

## Context and Orientation

`.agents/plans/<feature>/NN-<slug>.md` holds ExecPlans; `README.md` in each feature directory holds task order and is not a plan. Every plan has an `# H1` title, a `## Purpose / Big Picture` section, a `## Progress` section of checkboxes, and a `## Plan readiness` line ending in `Ready to implement`, `Ready after <decision>`, or `Blocked by <evidence>`.

The GitHub project is organization-owned: `TupoSoft/LeadEmailFinder`, number 9, id `PVT_kwDOBrt0As4At_e6`. Its `Status` field is `PVTSSF_lADOBrt0As4At_e6zgkqTaY` with options `Todo`, `In Progress`, and `Done`. It also carries `Priority`, `Size`, and `Iteration` fields that this work leaves alone. The board has drifted: recent pull requests, including #323 and #324, are not on it.

`scripts/keycloak/` establishes the pattern to follow: a thin API adapter class, a port interface, a pure domain module holding the logic, a `.spec.ts` beside it, and a small entry point invoked through a `package.json` script with `ts-node`. `jest.config.ts` picks up any `*.spec.ts`, and `tsconfig.json` already includes `scripts/**/*.ts`.

Workflows live in `.github/workflows/`. `validate.yml` shows the house style: `actions/setup-node@v4` with Node 24, `corepack enable`, then `corepack pnpm install --frozen-lockfile`.

## Scope and Non-Goals

Add a one-way synchronizer from ExecPlan files to GitHub issues on project 9, plus the workflow that runs it on `master`. Do not add pull-request auto-add automation, which the project's built-in workflows already cover. Do not modify plan files, write board fields other than `Status`, close issues, or read board state back into the repository. Do not touch application code.

## Plan of Work

Add `scripts/plans/execplan.ts` holding the pure logic: `planKeyFromPath` deriving `<feature>/<NN>` and rejecting files without a numeric prefix, `parseExecPlan` extracting title, purpose, readiness, and checkbox counts, `execPlanMarker`, `renderIssueBody`, `labelsFor`, and `desiredStatus`. Keeping this free of I/O is what makes the mapping rules directly testable.

Add `scripts/plans/github-project-api.ts` with a `GitHubProjectPort` interface and a `GitHubCliProjectApi` implementation shelling out to `gh`. The adapter owns every GitHub concept the synchronizer should not know about: label creation, issue listing by label, issue create and edit, project item listing, item add, and the project id, field id, and option id lookups needed to set `Status`. It caches the field metadata for the life of the process.

Add `scripts/plans/sync.ts` with `ExecPlanSynchronizer`, which takes the port and, for each plan, resolves the issue by marker, creates or updates it only when the rendered title or body differs, ensures a project item exists, and sets `Status` unless the item is already `Done`. It returns a per-plan outcome so the entry point can print a summary and tests can assert behavior without touching GitHub.

Add `scripts/plans/sync-project.ts` as the entry point: discover plan files, parse them, construct the adapter from environment variables, run the synchronizer, print one line per plan, and exit non-zero on failure. Support `PLANS_DRY_RUN=true`, which performs no writes and reports what would change.

Add the `plans:sync` script to `package.json` and `.github/workflows/sync-execplans.yml`, triggered by pushes to `master` touching `.agents/plans/**` or the sync sources, plus `workflow_dispatch` with a dry-run input. Document the required `PROJECT_SYNC_TOKEN` secret in the feature `README.md`.

## Interfaces and Dependencies

New: `scripts/plans/execplan.ts`, `scripts/plans/github-project-api.ts`, `scripts/plans/sync.ts`, `scripts/plans/sync-project.ts`, and `.github/workflows/sync-execplans.yml`. New `package.json` script `plans:sync`. New environment variables: `PLANS_PROJECT_OWNER`, `PLANS_PROJECT_NUMBER`, `PLANS_DIR`, `PLANS_DRY_RUN`, `GITHUB_REPOSITORY`, and `GH_TOKEN`. New repository secret `PROJECT_SYNC_TOKEN`. New labels `execplan` and `blocked`. Requires the `gh` CLI, which is preinstalled on GitHub-hosted runners. No new runtime dependency and no application change.

## Acceptance Criteria

- Every ExecPlan file produces exactly one issue labelled `execplan`, and feature `README.md` files produce none.
- Re-running the sync with no file changes creates nothing, edits nothing, and reports every plan as unchanged.
- Renaming a plan file while keeping its numeric prefix updates the existing issue rather than creating a second one.
- A plan with no checked boxes maps to `Todo`, with some checked to `In Progress`, and with all checked to `Done`.
- An item already `Done` on the board is never moved back to `Todo` or `In Progress`.
- A plan whose readiness is `Ready after` or `Blocked by` also carries the `blocked` label, and the label is removed once it reads `Ready to implement`.
- Each issue body links to its plan file and states that edits are overwritten.
- `PLANS_DRY_RUN=true` performs no writes and reports the actions it would have taken.
- The workflow runs on pushes to `master` that touch `.agents/plans/**` and is serialized by a concurrency group.
- A missing or unauthorized token fails the run with a message naming `PROJECT_SYNC_TOKEN`.
- `Priority`, `Size`, `Iteration`, and assignees are unchanged by a run.

## Validation

Unit-test `execplan.ts` for key derivation, README rejection, section parsing, checkbox counting, readiness classification, label selection, and status derivation. Unit-test `ExecPlanSynchronizer` against a fake port for the create, update, unchanged, rename, already-`Done`, and dry-run paths. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Then run `PLANS_DRY_RUN=true pnpm plans:sync` locally against project 9 and confirm the reported plan matches expectations, followed by one live run, confirming on the board that eight issues exist with correct statuses and that a second run reports everything unchanged.

## Idempotence and Recovery

Every run is idempotent: the marker makes issue resolution stable, and writes are skipped when the rendered content already matches. A duplicated issue, should one ever be created, is recovered by closing the duplicate and deleting its marker line so the sync ignores it. Removing a plan file leaves its issue in place rather than closing it, so recovery from an accidental deletion needs no action. The `concurrency` group prevents overlapping runs from racing.

## Artifacts and Notes

Record the project id, `Status` field id, and option ids observed during implementation, plus the dry-run summary from the first live sync. Never record the `PROJECT_SYNC_TOKEN` value.

## Plan readiness

Ready to implement.
