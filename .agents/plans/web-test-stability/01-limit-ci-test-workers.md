# Limit CI Web Tests to Two Workers

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Bound the Vitest `web` job to two concurrent test workers so test scheduling has an explicit budget aligned
with the runner configuration. This is one PR titled `ci(web): limit Vitest to two workers`. Developers can
observe the worker option in the Actions command and confirm that the complete selected suite still runs.

## Progress

- [ ] (2026-09-13) Add the worker limit to the web test step and update its workflow contract.
- [ ] (2026-09-13) Run focused workflow checks and the complete web suite with the new option.
- [ ] (2026-09-13) Record the selected CI web result at the implementation commit and any remaining failures.

## Plan dependencies

None.

## Surprises & Discoveries

- Job `103715423416` failed with two asynchronous UI assertion errors: 625 tests passed and two failed.
  Both failed queries used Testing Library's default one-second wait; CPU contention was not measured.
- The planning checkout has 607 tests in 29 files. The failed CI snapshot had 627 tests in 30 files.
  Their timings cannot establish an improvement because both the source and execution environment differ.

## Decision Log

- Decision: Append `--maxWorkers=2` only to the existing Actions web test command.
  Rationale: The Swarm definition allocates two CPUs per job container. An explicit CLI limit avoids
  relying on automatic worker selection and preserves local development defaults.
  Date/Author: 2026-09-13, Codex planning based on the accepted suggestions.
- Decision: Preserve assertion deadlines in this PR.
  Rationale: `web-test-stability/02` owns the separate DOM wait change. Measure the worker limit independently.
  Date/Author: 2026-09-13, Codex planning.
- Decision: Keep this plan in a separate planning PR targeting master and allow local implementation from master.
  Rationale: The worker limit has no code dependency on PR #595. Its isolated runner configuration remains
  required before publishing a revision that runs Actions. Date/Author: 2026-09-13, user-requested plan separation.

## Outcomes & Retrospective

Not started. The proposed command was exercised locally during diagnosis; no workflow change is implemented.

## Context and Orientation

`.github/workflows/validate.yml` runs `corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci`
in `jobs.web`, after the generated API-client build and before the web build. `apps/web/package.json` maps `test:ci`
to `vitest run`. `apps/web/vitest.config.ts` defines `application` with the jsdom environment and
`browser-fixtures` with the Node environment. Neither defines a worker limit.

`scripts/ci/validate-workflow.spec.ts` stores exact commands in `preservedCommands.web`. Its existing
command-preservation test checks complete normalized commands. The suite also checks discovery guards,
successful no-op behavior, runner selection, prerequisite ordering, and the final validation result.

In sibling repository `TupoSoft/Swarm`, `gh-actions-runner/gh-actions-runner.yml` sets `RUNNER_CPUS: "2"`.
`gh-actions-runner/entrypoint.sh` passes that value to Docker's `--cpus` option. This supports the intended
budget; it is not a live inspection of the failed runner's quota or throttling counters.

## Scope and Non-Goals

Change the single Actions test command, its regression expectation, and this plan's implementation record.
Keep application code, package scripts, Vitest projects, test selection, assertions, timeouts, retries,
Playwright checks, runner resources, permissions, and unrelated working changes outside this PR.
No HTTP behavior or business module changes are involved.

## Plan of Work

Use an isolated implementation checkout based on current master, preserving newer workflow and test coverage.
Local implementation and validation do not depend on PR #595. Before publishing a revision that runs Actions,
require every direct job to use `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated`. While #595 remains
unmerged, base that implementation PR on its current branch or defer publication that would trigger CI.
Follow root `AGENTS.md` for the synced issue identified by `web-test-stability/01`, its assignment and Project 9
status, and PR linkage. A complete successful run of PR #595 is not a prerequisite for this corrective work.

Append `--maxWorkers=2` to `Test web application` in `.github/workflows/validate.yml`. Keep its selection
condition and failure behavior. Update only the corresponding string in `preservedCommands.web` in
`scripts/ci/validate-workflow.spec.ts`. Reuse the exact-command check rather than creating another parser.
The updated contract must reject a removed or changed cap. Keep all unrelated command expectations.

Run the focused checks and complete web suite, then inspect a selected Actions run at the changed commit.
Record its effective command, runner identity, suite totals, duration, and conclusion. An old-SHA rerun cannot
validate this edit. If assertions still fail, record the evidence; the companion plan owns the wait-budget change.

## Interfaces and Dependencies

The only execution interface change is this command. It runs every test from the `application` and
`browser-fixtures` projects:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=2
```

No package upgrade, infrastructure deployment, reset, or seed operation is needed. The companion plan
can use this CI configuration for comparison but does not require it to implement its own change.

## Acceptance Criteria

- The selected web test step invokes the complete existing suite with `--maxWorkers=2` exactly once.
- Removing or changing the cap fails the existing workflow command-preservation test.
- Other required commands, selection conditions, runner labels, and failure paths remain intact.
- The full web suite passes locally with the cap. Its discovered suite count matches the implementation
  checkout, with no test skipped or filtered to obtain that pass.
- A selected CI web run has a recorded terminal result at the changed commit. Claim CI recovery only when
  its complete test step succeeds; identify failures, cancellations, and unrun work explicitly.

## Validation

Run from the implementation checkout after its existing dependencies are installed:

```sh
corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/validate.yml
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=2
corepack pnpm docs:lint -- .agents/plans/web-test-stability/01-limit-ci-test-workers.md
git diff --check
```

For the contract's failure case, temporarily remove the cap in the isolated checkout and run
`corepack pnpm test -- validate-workflow --runInBand`; require the web command assertion to fail. Restore
the intended command and rerun that suite. Do not commit the temporary mutation.

Read the new Actions logs at the implementation PR revision. Record the head and tested merge commit IDs, command,
runner, test totals, and conclusion. If CI is unavailable, leave that progress item open.

Bruno: not applicable — only CI concurrency and its regression contract change; HTTP behavior is unchanged.

## Idempotence and Recovery

The command and checks can be repeated without changing application data. Append the option once and
restore validation mutations before committing. Revert the workflow command and matching expectation
together to restore automatic worker selection. Preserve unrelated edits throughout.

## Artifacts and Notes

- [Failed job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423416):
  PR head `626d67d7d4f44f2d4d0e74a97991fedba13f0070`, tested merge
  `8e40ea48fe13ca466774a8ed0003bf763d9e5971`, 625 passed and two failed.
- During diagnosis on 2026-09-13, the capped command passed 607 tests in 29 files in 24.14 seconds at local
  HEAD `099d1d0872be67987b2f544468c21f89a858e4a3`, with unrelated workflow edits present. This validates
  CLI compatibility locally, not a speed improvement or recovery of the failed CI snapshot.
- [Vitest worker configuration](https://vitest.dev/config/maxworkers) defines the supported cap.
  [Docker CPU constraints](https://docs.docker.com/engine/containers/resource_constraints/#cpu) describe
  the configured CPU quota. Neither source supplies live measurements for the failed job.

## Plan readiness

Ready to implement
