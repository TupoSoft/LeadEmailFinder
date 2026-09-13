# Measure the Complete Browser Job on Isolated Runners

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the existing browser validation job time to expose its remaining results and record its actual runtime on
the isolated Swarm runners. This is one LeadEmailFinder PR titled `ci(browser): allow a complete isolated-runner baseline`.
Developers can distinguish a test failure from exhaustion of the old job budget without changing test deadlines.

## Progress

- [x] (2026-09-13) Raise the browser job budget and update its focused workflow contract.
- [ ] (2026-09-13) Validate the source change and record the next selected browser run and its limitations.

## Plan dependencies

None.

## Surprises & Discoveries

- PRs #595 and #597 remain open at implementation start. The isolated implementation branch starts at
  PR #595 head `626d67d7d4f44f2d4d0e74a97991fedba13f0070`. Its plan was copied from master commit
  `751fe7d89886b4383090a108eb101cf4fab41041`; the draft PR targets `kk/self-hosted-runners`.
- The new budget assertion fails against the original workflow with expected 90 and received 35.
- The working checkout is older than PR #595. Its existing edits must be preserved; implementation must include
  the newer proxy checks from the current PR or its merged successor.
- Run `34754038140`, job `103715423385`, passed 120 main browser tests and six privileged artifact scenarios.
  The invitation artifact check started after 31 minutes and 26 seconds of job execution and was canceled.
- The hosted comparison job `103711851593` completed in 21 minutes and 20 seconds. This comparison does not
  establish CPU throttling, memory pressure, or host contention.

## Decision Log

- Decision: Set only `jobs.browser.timeout-minutes` to 90 for the baseline.
  Rationale: Substantial work remains unrun. Ninety minutes is a provisional ceiling, not a measured requirement
  or a promise of success. The later split replaces this temporary budget.
  Date/Author: 2026-09-13, Codex planning.
- Decision: Leave resource changes and assertion deadlines outside this PR.
  Rationale: Logs prove slower execution but do not identify its physical cause.
  Date/Author: 2026-09-13, Codex planning.

## Outcomes & Retrospective

The browser job now declares a 90-minute ceiling, and a focused workflow assertion protects it. All local
checks passed: 223 tests across three suites, selection fixtures, ESLint, `actionlint`, Harper, and the diff check.
The selected Actions measurement is pending, so the remaining runtime baseline is incomplete.

## Context and Orientation

At PR #595 head `626d67d7d4f44f2d4d0e74a97991fedba13f0070`, `.github/workflows/validate.yml`
places dependency installation, image construction, gateway checks, browser installation, artifact guards,
UI suites, and disposable live-stack validation inside one serial `browser` job with a 35-minute timeout.
The outer `validate` job requires every validation consumer to succeed.

`scripts/ci/validate-workflow.spec.ts` checks runner selection, command ownership, conditional execution,
prerequisite ordering, cleanup, and the final summary. PR #597 separately covers pnpm stores and Docker build
caches; preserve its changes if it has merged rather than duplicating that work.

## Scope and Non-Goals

Change the browser job timeout, its focused workflow assertion, and this plan's runtime evidence. Do not change
application code, Playwright timeouts, retries, workers, resources, artifact policy, caches, APIs, fixtures, or any
other job's budget. This PR does not claim to optimize runtime.

## Plan of Work

Start from the latest PR #595 revision or its merged successor in an isolated implementation checkout. Preserve
unrelated edits and any merged PR #597 work. Follow root `AGENTS.md` for the synced issue and implementation PR.
Do not require completion of `self-hosted-runners/01`: its outstanding successful-run criterion is one reason
this corrective work is needed.

Set `jobs.browser.timeout-minutes: 90`. Add a focused budget assertion to the existing workflow suite without
weakening its existing contracts. Run the local checks, then inspect validation at the new implementation SHA.
A rerun of the original failed SHA still uses the original workflow and cannot validate this change.

Record the run URL, exact head SHA, runner identity, execution timestamps, conclusions, and cancellation cause. Compare
matching step names with the diagnosed run. If a real test fails before later steps run, record that result and
label the remaining baseline incomplete. Do not expand this PR into unrelated test fixes or keep raising limits.

## Interfaces and Dependencies

Only the GitHub Actions job timeout changes. Keep the four runner labels: `self-hosted`, `swarm`, `ubuntu-22`,
and `docker-isolated`. The pool already executed the diagnosed job; no infrastructure deployment is required.
This plan supplies timing evidence for `browser-ci/02` and `browser-ci/03`. Record cache state and runner image
changes with each comparison so their effects are not attributed to the timeout change.

## Acceptance Criteria

- The browser job declares a 90-minute limit and retains every selected validation command.
- Discovery failures, invalid selection, failed checks, and cleanup retain their existing behavior.
- Focused workflow and selection checks pass.
- A selected Actions run at the changed SHA has its terminal result and step timings recorded. Skipped,
  canceled, and unrun suites are distinguished from passes, including when the baseline remains incomplete.
- Execution can continue past the former 35-minute boundary until its new deadline or another terminal
  condition. A claim that the entire suite fits in 90 minutes requires a complete measurement.

## Validation

Run from the implementation checkout:

```sh
corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- .agents/plans/browser-ci/01-measure-complete-browser-job.md
git diff --check
```

Replace `JOB_ID` with the new browser job's numeric ID for read-only timing collection:

```sh
XDG_CACHE_HOME=/tmp/lef-gh-cache gh api repos/TupoSoft/LeadEmailFinder/actions/jobs/JOB_ID --jq '{id,head_sha,runner_name,status,conclusion,started_at,completed_at,steps}'
```

Local checks validate source contracts; only Actions provides runtime evidence. Do not run `dev:reset` against
the developer's Docker daemon. Report the existing Bruno steps separately as passed, failed, skipped, canceled,
or unrun; this plan adds no collection or HTTP behavior.

## Idempotence and Recovery

The source edit and timing collection are repeatable. Reverting the PR restores the old budget and may restore
the observed cancellation. Existing cleanup and the private-daemon lifecycle own temporary resources. Do not
add host-wide cleanup or reset development data.

## Artifacts and Notes

Local validation on 2026-09-13 passed every command above. The `actionlint` binary was
`/tmp/worker-ci-tools/actionlint` (version 1.7.12). Tests reused the existing workspace dependencies through
a local, ignored `node_modules` link, with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`. The new assertion first
failed against the 35-minute workflow, then passed after the budget change. No application architecture
boundary changed, and the source diff introduces no material SOLID trade-off.

Evidence: [failed job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423385)
and [hosted comparison](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34752712492/job/103711851593).
The browser step took 15 minutes and 16 seconds versus 3 minutes and 27 seconds. Chromium installation took
5 minutes and 29 seconds versus 24 seconds. These observations do not prove the physical cause of the slowdown.

Bruno: not applicable — a CI deadline changes, with no HTTP behavior or collection changes.

## Plan readiness

Ready to implement
