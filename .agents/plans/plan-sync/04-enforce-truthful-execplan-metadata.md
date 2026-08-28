# Enforce Truthful ExecPlan Metadata

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make every ExecPlan and generated GitHub issue tell the same current story. After this change, malformed section
capitalization fails validation instead of silently erasing readiness and dependencies, completed plans no longer say
their pull requests or live runs are pending, and road map status agrees with merged history. A developer can observe
the result through focused parser tests and a read-only Project 9 dry run whose generated bodies contain the source
metadata exactly.

## Progress

- [ ] (2026-08-28) Normalize malformed ExecPlan headings and reconcile stale delivery status against merged history.
- [ ] (2026-08-28) Reject near-miss required headings and align prose validation with the canonical headings.
- [ ] (2026-08-28) Add parser, rendering, dependency, and repository-fixture regression coverage.
- [ ] (2026-08-28) Run focused, repository, documentation, and live read-only sync validation.

## Plan dependencies

- `plan-sync/03`

## Surprises & Discoveries

- `scripts/plans/execplan.ts` reads section headings by exact string equality, but four completed plans use title-case
  `Plan Dependencies` or `Plan Readiness`. The parser silently treats those sections as absent rather than reporting a
  malformed plan.
- The generated issues for `auth/13`, `module-boundaries/07`, `module-boundaries/08`, and `proxy-fleet/15` therefore
  report `Dependencies: None.` and `Readiness: not stated` even though their source files contain both values.
- Proxy-fleet plans 11, 12, and 13 still say `PR pending`, plan 15 says it is ready for a pull request, and the road map
  lists merged plans 11–13 as remaining. Their pull requests are merged as #373, #374, #419, and #417 respectively.
- `plan-sync/01` says the first live run is outstanding immediately before recording that it completed successfully.
- A live `PLANS_DRY_RUN=true pnpm plans:sync` on 2026-08-28 reported all 53 existing plans unchanged because the
  already-generated GitHub bodies contain the same silently lost metadata. An unchanged dry run is therefore not, by
  itself, proof that source parsing is complete.
- Harper's `UseTitleCase` rule flags the exact `Plan dependencies` and `Plan readiness` headings required by
  `.agents/PLANS.md`. Without a narrow prose-linter exception, a valid edited ExecPlan cannot satisfy both validators.

## Decision Log

- Decision: Keep required heading spelling and capitalization canonical to `.agents/PLANS.md`, and reject a
  case-insensitive near match with the expected heading in the error.
  Rationale: Permissive parsing would hide source drift and make future tooling depend on undocumented variants. A
  precise failure lets the author fix the plan before generated state changes.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Exempt only the two exact canonical headings from Harper's `UseTitleCase` diagnostic.
  Rationale: Broadly disabling title-case checking would hide ordinary documentation defects, while changing the
  headings only to satisfy Harper would break the current parser and contradict the documented ExecPlan schema.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Preserve the documented omission allowance only for fully completed legacy plans that genuinely lack a
  `Plan dependencies` section; every incomplete plan must state exact structured dependencies or `None.`.
  Rationale: Requiring historical dependency reconstruction expands a metadata repair into speculative archaeology,
  while allowing omission on new work would make backlog ordering unsafe.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Require a nonempty canonical `Plan readiness` section for every plan, including completed plans.
  Rationale: Readiness text is rendered into the generated issue and has no documented legacy omission exception.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Reconcile status only from verified repository and GitHub history, retaining the original implementation
  and validation evidence.
  Rationale: The repair should replace stale delivery language with merged PR or completed-run facts, not rewrite
  historical technical decisions or claim validation that did not occur.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Let the existing one-way sync update generated closed-issue bodies; do not edit issues manually.
  Rationale: Plan files remain authoritative, and manual edits would be overwritten on the next sync.
  Date/Author: 2026-08-28, Codex plan audit.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`scripts/plans/sync-project.ts` discovers `NN-<slug>.md` files and passes them to `parseExecPlan()` in
`scripts/plans/execplan.ts`. `readSection()` currently requires an exact `## <heading>` line but returns an empty
string when the section is absent. `readDependencies()` interprets an empty result as a valid completed-legacy
omission, while readiness classification turns an empty result into `unknown`. `renderIssueBody()` then emits the
lossy metadata, and subsequent sync runs consider the generated body stable.

Project 9 is a generated mirror. The source repair must cover both parser behavior and the plan and road map facts that
drifted after merge so another engineer can rely on either surface without consulting conversation history.

## Scope and Non-Goals

Normalize required headings, make malformed or incomplete metadata fail before GitHub interaction, align prose
validation with the canonical schema, reconcile stale delivery wording in the identified completed plans and road
maps, and add focused regression coverage over real repository fixtures.

Do not change progress-to-status rules, dependency-state resolution, assignee protection, Project 9 fields, issue
matching markers, application behavior, historical validation results, or any GitHub issue or project state by hand.
Do not reconstruct unknown dependency graphs for completed legacy plans.

## Plan of Work

Normalize `Plan Dependencies` and `Plan Readiness` to the canonical headings in `auth/13`,
`module-boundaries/07`, `module-boundaries/08`, and `proxy-fleet/15`. Replace obsolete pending/readiness statements in
proxy-fleet plans 11–13 and 15 with their verified merged PR numbers and commits. Update the proxy-fleet road map to
classify merged plans as completed and retain the separate live-validation follow-up. Correct `plan-sync/01` so its
Outcomes section consistently records the completed live runs. Search every ExecPlan and road map for equivalent
delivery-status phrases and update only those contradicted by current Git or GitHub evidence.

Refactor the parser with a small required-section helper that distinguishes an exact heading, a case-insensitive
near-match, and true absence. Reject near-matches with the source path and canonical spelling. Parse progress early enough
to allow a truly absent `Plan dependencies` section only when every progress item is complete. Require an exact,
nonempty `Plan readiness` section for all plans. Preserve current dependency-entry validation, duplicate checks,
cycle detection, readiness classification, and completed-status precedence.

Update the Markdown prose validator with a narrow, source-aware allowance for exact `## Plan dependencies` and
`## Plan readiness` lines. Keep `UseTitleCase` active everywhere else, and add a regression fixture proving a normal
sentence or incorrectly capitalized heading still receives the rule's diagnostic.

Add focused unit tests for exact headings, each near-match, missing readiness, incomplete missing dependencies,
completed legacy omission, and rendered dependencies/readiness. Add a repository-fixture test that discovers every
checked-in plan and proves parsing and dependency-state resolution succeed, so a malformed real plan cannot be hidden
behind synthetic unit fixtures.

## Interfaces and Dependencies

No public API changes. Internal parser validation becomes stricter: `parseExecPlan()` throws before GitHub access when
a required heading is incorrectly capitalized, readiness is missing or empty, or an incomplete plan omits structured
dependencies. Documentation lint gains a narrow canonical-heading allowance. The existing `ExecPlan`,
`ExecPlanState`, GitHub port, project fields, labels, and environment variables remain unchanged.

This plan depends on plan-sync/03 because it preserves all established synchronization behavior while tightening
source validation and repairing generated metadata.

## Acceptance Criteria

- Every checked-in ExecPlan parses with canonical required headings, and the complete dependency graph resolves.
- A case-insensitive near-match for `Plan dependencies` or `Plan readiness` fails with the source path and exact expected
  spelling before any GitHub command runs.
- An incomplete plan without `Plan dependencies` fails; a fully completed legacy plan without that section remains
  accepted with no inferred dependencies.
- A missing or empty `Plan readiness` section fails for both incomplete and completed plans.
- Documentation lint accepts the two exact canonical headings but continues to report `UseTitleCase` for unrelated
  non-title-case headings.
- Generated issues for `auth/13`, `module-boundaries/07`, `module-boundaries/08`, and `proxy-fleet/15` contain the
  dependencies and readiness recorded in their source files.
- Proxy-fleet plans and road map identify PRs #373, #374, #419, and #417 as merged, while preserving all recorded live
  validation limits and linking the separate disposable-fleet validation plan.
- `plan-sync/01` no longer claims its first live run is outstanding.
- Existing status derivation, blocked labels, dependency backlog, `Done` protection, and assigned `In Progress`
  protection remain unchanged in focused tests.
- A second dry run after synchronization reports no metadata update for the repaired issues.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts
scripts/plans/sync.spec.ts --runInBand`, then the repository-fixture parser test. Run changed-file ESLint,
`corepack pnpm typecheck`, the full Jest suite, and `git diff --check`.

Run the prose-validator regression tests, then `corepack pnpm docs:lint --` with every changed Markdown file and
require zero diagnostics. With live GitHub credentials, run
`PLANS_DRY_RUN=true corepack pnpm plans:sync` and inspect the four repaired issue-body diffs plus the corrected plan
states. Do not run a write sync from a feature branch. After merge and the ordinary workflow sync, rerun the dry run
and require zero updates. Bruno is not applicable because neither application HTTP behavior nor a Bruno collection
changes.

## Idempotence and Recovery

Source normalization and status reconciliation are deterministic. Parser validation runs before the adapter performs
GitHub writes, so malformed input stops safely. The one-way sync can be rerun after correcting a plan; matching issue
markers update the existing issue instead of creating a duplicate. Revert this pull request to restore the previous
parser, source wording, and generated bodies; no application or database recovery is involved.

## Artifacts and Notes

Record the focused and repository-fixture test results, the list of normalized plans, verified merge commits, changed
issue-body dry-run summaries, documentation-lint result, and post-merge no-op dry run. Do not copy GitHub tokens,
project secrets, or unrelated issue content into the plan.

## Plan readiness

Ready to implement.
