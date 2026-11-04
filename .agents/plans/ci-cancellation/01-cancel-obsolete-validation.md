# Cancel Obsolete Validation Runs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Release scarce runner capacity when a newer validation run supersedes an older run for the same PR or branch.
Developers can observe the older run being canceled while the newer run proceeds independently of other PRs.

## Progress

- [x] (2026-09-13) Inspect the queue, runner capacity, workflow, tests, and GitHub cancellation semantics.
- [x] (2026-09-13) Resolve the cancellation policy and search for a synced issue.
- [x] (2026-09-13) Implement workflow concurrency and cancellation-aware job conditions.
- [x] (2026-09-13) Rebase the cancellation change onto `master` at the user's request and preserve its runner routing.
- [x] (2026-09-13) Pass 223 focused tests, selection fixtures, ESLint, actionlint, Harper, and final diff review.

## Plan dependencies

None.

## Surprises & Discoveries

The two live runner slots were occupied while several older validation runs remained queued.
The seven dependent jobs use `always()`, which GitHub reevaluates as true during cancellation.
Adding concurrency alone would therefore leave running jobs resistant to cancellation.
The issue search for `ci-cancellation/01 in:body` returned no synced issue, so there is no issue to assign or move.

## Decision Log

- (2026-09-13, Codex) Group by workflow name and Git ref and enable `cancel-in-progress`. This separates PRs and branches.
- (2026-09-13, Codex) Use `!cancelled()` on the six consumers and aggregate job. Dependency failures still reach their
  existing guards, while workflow cancellation can stop expensive validation.
- (2026-09-13, Codex) Keep browser diagnostics and cleanup under their existing step-level `always()` conditions.
- (2026-09-13, user) Base this PR on `master` and include cancellation only. Leave runner routing to #595.

## Outcomes & Retrospective

The workflow now groups runs by workflow and ref and permits cancellation of all dependent jobs. Browser cleanup,
failure guards, and validation commands remain covered by the existing contracts. Runner routing matches `master`.
All 223 focused tests, selection fixtures, ESLint, actionlint, Harper, and diff checks passed on the final base.
Independent review found no correctness or scope issues and no material architectural trade-offs.
The change is ready for draft PR publication.

Live cancellation requires observing two runs on the same ref that both include this configuration; local checks
alone cannot prove GitHub scheduling behavior. Existing runs without this policy still need separate cancellation.

## Context and Orientation

`.github/workflows/validate.yml` discovers affected checks, runs six consumers, and emits the stable `validate`
aggregate. `scripts/ci/validate-workflow.spec.ts` checks its declarative contracts and executes discovery guards
and aggregate fixtures. Consumers must still report discovery failures and retain explicit successful no-ops.

## Scope and Non-Goals

Change validation scheduling, its regression coverage, and this plan. Preserve application behavior, runner labels,
validation commands, and the synchronization workflow's serialization policy. Existing runs created without a
concurrency group need separate cancellation; publishing this configuration does not retroactively group them.

## Plan of Work

Add workflow-level concurrency keyed by workflow and ref with cancellation enabled. Replace the seven job-level
`always()` conditions with `!cancelled()` and preserve browser cleanup conditions. Extend the existing workflow
contract suite for the group and cancellation flag, update the affected condition assertions, and run focused checks.

## Interfaces and Dependencies

The changed interface is GitHub Actions scheduling. The group is `${{ github.workflow }}-${{ github.ref }}`.
There are no new dependencies, HTTP interfaces, database changes, or module-boundary changes.

## Acceptance Criteria

- The parsed workflow enables cancellation and scopes its group to the workflow and ref.
- Each consumer and the aggregate can run after dependency failure but has a false job condition upon cancellation.
- Browser cleanup retains its condition for selected runs, including failure and cancellation paths.
- Existing validation commands and the required check name pass their contract tests; runner routing matches `master`.
- Live confirmation, when performed, shows one same-ref run superseding another without canceling a different PR.
  Report this runtime criterion as unverified until it is observed.

## Validation

Run from the isolated checkout:

```sh
corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
/tmp/lef-ci-caching-tools/actionlint .github/workflows/*.yml
git diff --check
```

Bruno: not applicable — CI cancellation changes no HTTP behavior.

## Idempotence and Recovery

Local checks are repeatable. Reverting this commit restores the previous scheduling policy without changing data.
Canceled runs can be rerun when needed, but they still compete with newer runs in the same concurrency group.

## Artifacts and Notes

The base commit is `e14032e21016d2aebee8cf1f958ee2e195a196fc` on `master`.
The commit and PR title will be `ci(validation): cancel obsolete workflow runs`.
GitHub documents [workflow cancellation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation)
and [concurrency groups](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
The synced issue lookup was `gh issue list --label execplan --search "ci-cancellation/01 in:body"`.

## Plan readiness

Ready to implement
