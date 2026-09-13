# Measure the Complete Browser Job on Isolated Runners

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the existing browser validation job time to expose its remaining results and record its actual runtime on
the isolated Swarm runners. This is one LeadEmailFinder PR titled `ci(browser): allow a complete isolated-runner baseline`.
Developers can distinguish a test failure from exhaustion of the old job budget without changing test deadlines.

## Progress

- [x] (2026-09-13) Raise the browser job budget and update its focused workflow contract.
- [x] (2026-09-13) Validate the source change and record the terminal browser run, timings, and limitations.
- [x] (2026-09-13) Change the PR base to master while retaining isolated runners and the recorded measurements.

## Plan dependencies

None.

## Surprises & Discoveries

- The selected browser job ran for 62 minutes and 7 seconds and failed during disposable stack setup.
  Its preceding UI and artifact checks passed. All 17 later live-check or setup steps were skipped,
  including all seven Bruno steps. Service-health reporting and stack cleanup passed.
- The implementation run's separate `web` job failed with 625 passing and two failing tests. The
  `platform-organizations.test.tsx` credit-management link and `platform-proxies.test.tsx` access-denied
  heading were absent at their existing one-second assertion deadlines. Its web build was skipped.
  These failures are outside this PR; the logs do not prove whether rendering was late or state was wrong.
- PRs #595 and #597 remain open at implementation start. The isolated implementation branch starts at
  PR #595 head `626d67d7d4f44f2d4d0e74a97991fedba13f0070`. Its plan was copied from master commit
  `751fe7d89886b4383090a108eb101cf4fab41041`; the draft PR originally targeted `kk/self-hosted-runners`.
- The new budget assertion fails against the original workflow with expected 90 and received 35.
- The working checkout is older than PR #595. Its existing edits must be preserved; implementation must include
  the newer proxy checks from the current PR or its merged successor.
- Run `34754038140`, job `103715423385`, passed 120 main browser tests and six privileged artifact scenarios.
  The invitation artifact check started after 31 minutes and 26 seconds of job execution and was canceled.
- The hosted comparison job `103711851593` completed in 21 minutes and 20 seconds. This comparison does not
  establish CPU throttling, memory pressure, or host contention.

## Decision Log

- Decision: Target `master` directly at the user's request, preserving the existing isolated-runner configuration.
  Rationale: Master commit `cd321ea672132b380d0d2fd40aedd4eb41b7c98b` still selects hosted runners.
  The direct master diff therefore includes the inherited runner migration from PR #595. Merging current master
  resolves the duplicated plan file while preserving all recorded evidence. PR #595 does not need to merge first.
  Date/Author: 2026-09-13, user direction implemented by Codex.
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
The selected browser job executed beyond the former 35-minute deadline and terminated after 62 minutes
and 7 seconds because stack provisioning failed. The budget change and measurement are complete; the full runtime
baseline remains incomplete because later live and Bruno checks were skipped. No claim that the full suite
fits within 90 minutes is supported. Detailed timing, runner, cache, and failure evidence follows below.
The PR now targets master directly and includes the inherited runner migration. The base change preserves the
measured workflow and test sources; the recorded Actions results belong to the specific historical commits below.

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

The user-requested master target also includes the existing migration from PR #595. Its seven inherited files
cover runner selection, the workflow contract, custom `actionlint` labels, and runner documentation. This retains
the branch's execution behavior; it does not deploy infrastructure or import later changes from PR #595.

## Plan of Work

The original implementation started from PR #595 in an isolated checkout. The user subsequently requested a
direct master target. Merge current master, preserve the isolated-runner configuration, and resolve the plan
conflict by retaining its completed runtime evidence. Preserve unrelated edits and any merged PR #597 work.
Follow root `AGENTS.md` for the synced issue and implementation PR.
Do not require completion of `self-hosted-runners/01`: its outstanding successful-run criterion is one reason
this corrective work is needed.

Set `jobs.browser.timeout-minutes: 90`. Add a focused budget assertion to the existing workflow suite without
weakening its existing contracts. Run the local checks, then inspect validation at the new implementation SHA.
A rerun of the original failed SHA still uses the original workflow and cannot validate this change.

Record the run URL, exact head SHA, runner identity, execution timestamps, conclusions, and cancellation cause. Compare
matching step names with the diagnosed run. If a real test fails before later steps run, record that result and
label the remaining baseline incomplete. Do not expand this PR into unrelated test fixes or keep raising limits.

## Interfaces and Dependencies

Relative to the original runner baseline, only the GitHub Actions job timeout changes. The master diff also
routes jobs to the four existing labels: `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated`.
The pool already executed the diagnosed job; no infrastructure deployment is required.
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

The selected [implementation run](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34757901309)
uses head `0711017a61004793fb13bc2c4273a57cabb2f1c0` and
[browser job 103725477957](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34757901309/job/103725477957).
The checkout tested merge commit `d9e8b59e44680b615e5c81c788d66276354b197b`, combining that head with
base `626d67d7d4f44f2d4d0e74a97991fedba13f0070`.
The job was created at `2026-09-13T12:45:01Z` and started at `13:09:46Z`, after 24 minutes and 45 seconds
in the queue. Its runner is `swarm-gh-actions-runner-b840a9505b910376`, with the four required labels.
At `13:45:56Z`, the job remained `in_progress` after 36 minutes and 10 seconds, running
`Test service-client secret handling and recovery`. This directly verifies execution beyond the former
35-minute boundary. Invitation, service-client, and proxy artifact checks had passed by then.
The job completed at `14:11:53Z` with conclusion `failure`, after 62 minutes and 7 seconds of execution.
Stack setup failed at `14:10:56Z`, after 12 minutes and 37 seconds. There was no job-budget cancellation:
the check annotation records exit code 1. Service-health reporting and disposable-stack cleanup passed.
The setup log reports `Timed out waiting for lef-keycloak-1 to become healthy (last status: starting)`
at `14:10:56.552Z`. Keycloak started at `14:08:10.500Z` and remained `starting` in the health report;
the API was unhealthy. The underlying reason for the Keycloak delay is unverified because its service logs
were not collected. This PR records the failure without changing startup deadlines or service behavior.
The existing health poll uses a nominal 120-second budget per service, before Keycloak provisioning.
That budget excludes the time spent in Docker inspection calls.

The preceding checks passed: nine gateway tests, 120 main browser tests, 50 artifact scenarios,
124 additional UI tests, four accessibility tests, and four visual tests. The final aggregate failed as
required when its `web` and `browser` dependencies failed. Change selection, repository policy, contract,
images, and backend jobs passed. The workflow began at `12:44:09Z`; the final gate completed at `14:13:06Z`,
an event-to-final-gate duration of 88 minutes and 57 seconds. This includes queue time and other jobs;
the browser execution duration remains 62 minutes and 7 seconds.

Read-only inspection on `manager-1` at `2026-09-13T13:11:19Z` verified the actual worker and launcher image:
`ghcr.io/tuposoft/gh-actions-runner@sha256:000782ec511978a3f221e58b5b0773f679591a23f66976c4472c1d9b08b8bd52`.
Their image ID matches the retained original baseline launcher. The original worker and daemon have been
removed, so their image identities cannot be verified directly. The new private daemon uses `docker:29.6.1-dind`
with digest `docker@sha256:66d292e5c26bd33a6f6f61cacb880de2186339a524ecba1ce098dbbaceed6515`.

The original and new workspace installs both reused zero pnpm packages and downloaded 1,594. Both initial
web-image builds reported no cached stages, and both jobs downloaded Chromium revision 1243. In the new
job, the later Compose build reused layers from the same job, reporting 12 `CACHED` lines; its API dependency
install reused 1,395 packages and downloaded none. No shared cache from PR #597 was included. Differences
in matching step durations do not establish a physical cause or an optimization from the timeout change.

Local validation on 2026-09-13 passed every command above. The `actionlint` binary was
`/tmp/worker-ci-tools/actionlint` (version 1.7.12). Tests reused the existing workspace dependencies through
a local, uncommitted `node_modules` link, with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`. The new assertion first
failed against the 35-minute workflow, then passed after the budget change. No application architecture
boundary changed, and the source diff introduces no material SOLID trade-off.

The separate [web job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34757901309/job/103725477886)
ran from `2026-09-13T12:50:23Z` to `13:00:11Z` (9 minutes and 48 seconds) on
`swarm-gh-actions-runner-9aa109d7c7df04ae`. Its failing test step ran from `12:55:10Z` to `13:00:01Z`.
All earlier selected web checks passed; `Build web application` was skipped. This failure prevents a
successful aggregate result regardless of the browser measurement.

Evidence: [failed job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423385)
and [hosted comparison](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34752712492/job/103711851593).
The browser step took 15 minutes and 16 seconds versus 3 minutes and 27 seconds. Chromium installation took
5 minutes and 29 seconds versus 24 seconds. These observations do not prove the physical cause of the slowdown.

The following table records every step from both browser jobs. Durations use minutes and seconds;
`skipped` means the step did not execute, and `cancelled` preserves the Actions conclusion.

| Step | Original 35-minute job | New 90-minute job |
| --- | --- | --- |
| `Set up job` | 0:04 / success | 0:04 / success |
| `Validate discovery result` | 0:00 / success | 0:00 / success |
| `No validation needed` | skipped | skipped |
| `Run actions/checkout@v4` | 0:05 / success | 0:06 / success |
| `Run actions/setup-node@v4` | 0:41 / success | 0:58 / success |
| `Enable Corepack` | 0:00 / success | 0:01 / success |
| `Install workspace dependencies` | 1:59 / success | 2:40 / success |
| `Build independent static web image` | 5:36 / success | 4:30 / success |
| `Test Vite and Nginx route ownership and privacy` | 1:07 / success | 0:52 / success |
| `Install Chromium` | 5:29 / success | 2:40 / success |
| `Test web browser workflows` | 15:16 / success | 14:01 / success |
| `Verify privileged authentication artifact suppression` | 1:04 / success | 1:08 / success |
| `Verify invitation browser artifact suppression` | 3:48 / `cancelled` | 3:27 / success |
| `Verify verification browser artifact suppression` | skipped | 0:20 / success |
| `Verify service-client browser artifact suppression` | skipped | 1:11 / success |
| `Verify proxy browser artifact suppression` | skipped | 1:29 / success |
| `Test service-client secret handling and recovery` | skipped | 3:06 / success |
| `Test invitation browser behavior and recovery` | skipped | 1:26 / success |
| `Test platform organization directory and invitation recovery` | skipped | 1:31 / success |
| `Test platform credit adjustment and recovery` | skipped | 2:51 / success |
| `Test proxy fleet management and credential recovery` | skipped | 3:41 / success |
| `Test web accessibility` | skipped | 1:22 / success |
| `Test web visual baselines` | skipped | 1:06 / success |
| `Reset, provision, and check disposable development stack` | skipped | 12:37 / failure |
| `Test genuine same-origin browser session and log privacy` | skipped | skipped |
| `Test BFF and gateway HTTP contracts with Bruno` | skipped | skipped |
| `Bootstrap MFA-aware browser identities` | skipped | skipped |
| `Test organization onboarding HTTP contracts with Bruno` | skipped | skipped |
| `Test live platform organization bootstrap` | skipped | skipped |
| `Test platform credit HTTP contracts with Bruno` | skipped | skipped |
| `Test live platform credit adjustment and recovery` | skipped | skipped |
| `Test proxy registry HTTP contracts with Bruno` | skipped | skipped |
| `Test live proxy fleet lifecycle` | skipped | skipped |
| `Test live team management and invitation acceptance` | skipped | skipped |
| `Test service-client rejection contracts with Bruno` | skipped | skipped |
| `Test live service-client lifecycle` | skipped | skipped |
| `Attach disposable SMTP and DNS verification fixtures` | skipped | skipped |
| `Test async verification HTTP contracts with Bruno` | skipped | skipped |
| `Test live single-email verification and route recovery` | skipped | skipped |
| `Test batch verification HTTP contracts with Bruno` | skipped | skipped |
| `Test live batch upload, route recovery, and result download` | skipped | skipped |
| `Report service health` | 0:04 / success | 0:13 / success |
| `Stop this runner's disposable stack` | 0:01 / success | 0:38 / success |
| `Post Run actions/setup-node@v4` | skipped | skipped |
| `Post Run actions/checkout@v4` | 0:02 / success | 0:01 / success |
| `Complete job` | 0:00 / success | 0:00 / success |

Bruno: not applicable — a CI deadline changes, with no HTTP behavior or collection changes.
The seven existing Bruno steps were skipped; their HTTP scenarios remain unrun in this measurement.

## Plan readiness

Ready to implement
