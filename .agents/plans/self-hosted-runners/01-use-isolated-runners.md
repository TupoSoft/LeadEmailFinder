# Use Isolated Self-Hosted Runners

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Run LeadEmailFinder validation and ExecPlan synchronization on the organization's upgraded Swarm runner pool.
Every direct workflow job requires the `docker-isolated` capability so a runner from the earlier pool cannot accept
work that starts or removes Docker resources. Developers retain the same validation commands and required check.

The follow-up in this same pull request adapts test scheduling, dependency caching, and bounded setup and job
timeouts to the isolated workers. It addresses the observed failures without changing application behavior.

## Progress

- [x] (2026-09-12) Inspect workflow jobs, regression tests, and the Docker reset assumptions.
- [x] (2026-09-12) Target all nine direct jobs with the four required runner labels.
- [x] (2026-09-12) Add valid and invalid runner fixtures and inspect every repository workflow's direct jobs.
- [x] (2026-09-12) Document the external infrastructure prerequisite and the absence of live validation.
- [x] (2026-09-12) Pass 122 workflow tests, focused ESLint, README Harper validation, and scoped diff checks.
- [x] (2026-09-12) Validate all 222 focused tests, selection fixtures, and Harper for this ExecPlan and road map.
- [x] (2026-09-12) Prepare the isolated draft pull request branch on current master and rerun focused validation.
- [x] (2026-09-13) Resolve conflicts with master `0400e1ac`, preserving its cache settings and browser timeout.
- [x] (2026-09-13) Pass all 230 focused tests, selection fixtures, ESLint, Actionlint, and workflow comparison checks.
- [x] (2026-09-13) Resolve conflicts with master `49aa9442`, preserving cancellation behavior; all 241 focused tests passed.
- [x] (2026-09-14) Resolve conflicts with master `2ac6ea3`, preserving separate browser workers and their aggregate.
- [x] (2026-09-14) Pass 326 focused tests, selection fixtures, ESLint, architecture checks, Actionlint, and Harper.
- [x] (2026-09-14) Diagnose run `34858287705`: database setup and web test timeouts, plus two job timeouts.
- [x] (2026-09-14) Allow 30 seconds for credits initialization, run one web test worker, and save installed dependencies before tests.
- [x] (2026-09-14) Allow 30 minutes for browser artifacts and 60 minutes for image validation; preserve required checks.
- [x] (2026-09-14) Pass 628 web tests, 52 real database tests, 327 workflow and plan tests, and static checks.
- [ ] (2026-09-14) Publish the fix and inspect the fresh Actions run.
- [ ] (2026-09-12) After a separately authorized Swarm deployment, record a complete Actions run on the new pool.

## Plan dependencies

None.

## Surprises & Discoveries

- (2026-09-12) The existing YAML parser accepted only a scalar `runs-on` value. Valid label arrays failed before
  any workflow assertions could execute.
- (2026-09-12) Browser validation uses a fixed `lef` Compose project, fixed public ports, and destructive cleanup.
  Backend PostgreSQL also publishes a fixed host port. These assumptions require a private Docker daemon per job.
- (2026-09-12) The old Swarm workers receive the host Docker socket. Merely changing runner labels would expose
  shared containers and volumes to existing CI cleanup commands.
- (2026-09-12) Searching synced issues for `self-hosted-runners/01` found no issue. Assignment and Project 9 status
  cannot be updated until the synchronizer creates that issue.
- (2026-09-14) Master split browser validation into three workers and an aggregate, increasing the direct job
  inventory from nine to twelve. The runner assertion for those jobs also needed the approved label array.
- (2026-09-14) Run `34858287705` exceeded the five-second credits initialization hook and sixteen web test deadlines.
  Two web authorization headings also failed to appear. Browser artifacts exceeded 15 minutes after Chromium
  installation took 7 minutes and 39 seconds. Image validation exceeded 35 minutes while retrieving image layers.
- (2026-09-14) The browser workspace dependency cache was missing. The combined cache action saves only after
  job success, so later test failures or job timeouts prevented the installed dependencies from being saved.
- (2026-09-14) A fresh issue search still found no synced `self-hosted-runners/01` issue.

## Decision Log

- Decision: Require `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated` on every direct job.
  Rationale: The extra capability label excludes old workers while preserving the intended operating system.
  Date/Author: 2026-09-12, user-authorized implementation.
- Decision: Deliver Swarm compatibility in a separate pull request and deploy it before this workflow change.
  Rationale: Runner lifecycle and Docker isolation belong to the infrastructure repository. This pull request
  remains independently reviewable through local workflow tests.
  Date/Author: 2026-09-12, user-authorized implementation.
- Decision: Preserve the existing validation commands and application fixtures.
  Rationale: Private Docker daemons preserve their current isolated-host assumptions without rewriting API tests.
  Date/Author: 2026-09-12, implementation.
- Decision: Implement the observed CI failure fixes in PR #595 and maintain this existing plan.
  Rationale: The user explicitly requested the fixes in this pull request. A 30-second credits initialization hook, one
  Vitest worker, early dependency cache saves, and 30/60-minute artifact/image job budgets address the observed
  failures while preserving the existing assertions and aggregate checks. Runner image changes remain in Swarm.
  Date/Author: 2026-09-14, user-authorized follow-up.
- Decision: Save each pnpm store immediately after its mandatory frozen install, using separate restore and save actions.
  Rationale: Later failures must not discard a usable dependency cache. An exact cache hit avoids a redundant
  save; a restore or save failure remains nonfatal, and an installation failure still stops the job.
  Date/Author: 2026-09-14, implementation.

## Outcomes & Retrospective

The initial workflow, regression test, and README edits were prepared on an isolated branch based on master `c6d5886`.
All 222 focused tests passed again after applying the changes to that revision, covering selection,
workflow, and real ExecPlan fixtures. README, ExecPlan, and road map prose validation passed. No new Actions run or live execution on the upgraded Swarm pool has
been verified. Infrastructure publication, deployment, and live validation remain separate delivery steps.

On 2026-09-13, the branch was updated with master `0400e1ac`. The conflict resolution preserves the new cache
settings, limited web test concurrency, and 90-minute browser timeout while retaining all nine runner label arrays.
All 230 focused tests passed. A structural comparison confirmed that runner selection is the only workflow
difference from that master revision. The complete Actions result for this update remains unverified.

A subsequent merge of master `49aa9442` retains workflow cancellation, cancellation-aware job conditions, and
browser cleanup while preserving the isolated runner labels. All 241 focused tests, selection fixtures, ESLint,
and Actionlint passed. A complete Actions run for this newer revision remains unverified.

On 2026-09-14, the branch was updated with master `2ac6ea3`. The resolution preserves its three browser workers,
their 15-, 20-, and 25-minute timeouts, and the 10-minute browser aggregate. Every direct job retains the four
isolated runner labels. A comparison with that master revision confirms that runner selection is the only
workflow difference. All 326 focused tests, selection fixtures, ESLint, architecture checks, Actionlint with
ShellCheck, Harper, and diff checks passed. The test subprocesses required execution outside the local sandbox;
the initial sandboxed attempt failed with `EPERM`. The previous Actions run `34782151912` failed its browser
job and required validation check; a complete successful Actions run for this resolution remains unverified.

The authorized follow-up passed all 628 web tests with one worker, including both failed authorization scenarios,
without changing their assertions or deadlines. The checkout-owned PostgreSQL helper passed 52 credits and
payment tests with zero skipped tests; its new container and network were removed after ownership checks.
All 327 workflow, selection, and plan tests passed. Focused ESLint, TypeScript, the architecture gate with zero
violations, Actionlint with ShellCheck, and selection fixtures passed. The web suite ran locally on Node 22.18.0
in 66.73 seconds; this larger host does not establish timing recovery on the two-CPU Actions workers.

## Context and Orientation

`.github/workflows/validate.yml` owns eleven jobs: change discovery, five validation consumers, three browser
workers, the browser aggregate, and the stable `Validate / validate` summary.
`.github/workflows/sync-execplans.yml` owns the direct synchronization job.
The build and deployment workflows call reusable workflows; their runner selection remains with those calls.

`scripts/ci/validate-workflow.spec.ts` parses validation YAML, preserves command ownership and conditional
execution, and exercises failure handling. Its new inventory check reads every YAML file under
`.github/workflows/` and checks jobs that execute directly, excluding reusable workflow calls.

`docker/scripts/dev-reset.sh` and browser cleanup expect exclusive ownership of a Docker daemon. The separate
Swarm change supplies that boundary through one ephemeral worker and one private daemon for each job.

## Scope and Non-Goals

This plan corresponds to one LeadEmailFinder pull request containing the two workflow target changes,
`scripts/ci/validate-workflow.spec.ts`, the custom labels in `.github/actionlint.yaml`, the root README CI paragraph,
and this plan with its road map. The authorized follow-up also adjusts only the shared setup timeout in
`src/libs/modules/credits/src/application/credits.service.integration.spec.ts` and the CI worker count.

It does not alter HTTP APIs, Bruno collections, business modules, database schemas, application images, workflow
triggers, permissions, required check names, or test assertions. It does not implement or deploy Swarm
infrastructure. No development reset, migration, or seed operation is required for these source changes.

## Plan of Work

Replace the twelve direct `runs-on` values in the validation and synchronization workflows with the exact four-label
array. Keep job dependencies, conditions, commands, permissions, and reusable workflow calls unchanged.

For the authorized follow-up, keep the workflow dependency graph and failure propagation intact. Run the web
suite with `--maxWorkers=1`, retain its existing DOM and whole-test deadlines, and give only the credits initialization
hook a 30-second timeout. Set the artifact worker to 30 minutes and image validation to 60 minutes. Replace the
combined dependency cache actions with separate restore and immediate save steps. Keep cache keys, paths,
installation commands, and their selection guards compatible with existing caches.

Extend the existing YAML parser to accept a string containing visible characters or a nonempty array of such strings. Add fixtures
for both valid forms and reject missing, null, numeric, boolean, blank, empty, mixed, nested, and mapping values.
Inspect all workflow YAML files and require the configured labels for every direct job. Declare the custom labels
in `.github/actionlint.yaml` so `actionlint` can validate workflow syntax with the selected runner pool.

Document the private daemon and fresh workspace contract in README, including infrastructure deployment order.
Run the focused checks below. Once a synced issue exists, assign it to the requesting user and update its Project 9
status according to root `AGENTS.md`. Link the issue with a closing keyword when opening this plan's pull request.

## Interfaces and Dependencies

The changed interface is GitHub Actions runner selection:

```yaml
runs-on: [self-hosted, swarm, ubuntu-22, docker-isolated]
```

The external prerequisite is the separate Swarm pull request described by `docs/plans/self-hosted-ci.md` in that
repository. The upgraded pool must provide a fresh worker home and workspace, a private Docker daemon, compatible
Node and Ruby setup, Docker Compose, and browser system dependencies. The job worker must receive neither the
Swarm host Docker socket nor the long-lived GitHub personal access token.

Deployment ordering is external because it is not a LeadEmailFinder ExecPlan dependency. Source review and local
tests can proceed independently. New workflow jobs must not become active before the compatible pool is deployed.

## Acceptance Criteria

- All twelve direct jobs require the four configured labels; reusable workflow calls remain unchanged.
- The YAML parser accepts scalar labels containing visible characters and nonempty arrays of such labels and rejects malformed values.
- The inventory test fails if any direct job selects a different pool, including a newly added workflow.
- Existing workflow command, selection, no-op, PostgreSQL, cleanup, and summary assertions continue to pass.
- README states the isolation contract and deployment prerequisite without claiming a successful live run.
- Dependency caches are saved immediately after a successful install even if a later validation step fails.
  Exact cache hits skip saving, failed installs prevent saving, and cache failures do not bypass installation.
- Web CI runs one test worker; existing authorization assertions, DOM waits, and whole-test deadlines remain intact.
- Credits database setup has a 30-second deadline; assertion and teardown deadlines remain unchanged.
- Browser artifacts and image validation have finite 30- and 60-minute job budgets, respectively.
- After the external deployment, a complete Actions run uses the upgraded pool and preserves the required
  `Validate / validate` result. That runtime criterion remains unverified until actual execution.

## Validation

Run from the LeadEmailFinder repository root:

```sh
corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/*.yml
corepack pnpm docs:lint -- README.md .agents/plans/self-hosted-runners
git diff --check
```

Additional follow-up validation:

```sh
corepack pnpm test:credits-postgres
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=1
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/self-hosted-runners/01-use-isolated-runners.md
```

The database helper owns a separate disposable PostgreSQL container for this checkout. Verify its ownership
before cleanup. A local pass does not prove recovery on the isolated Actions workers; inspect a fresh run of the
published commit, including browser suites that were previously blocked by the artifact prerequisite.

The narrower command `corepack pnpm test -- validate-workflow --runInBand` passed 122 tests on 2026-09-12.
The broader three-suite command above passed 222 tests, including the real ExecPlan fixture.
`corepack pnpm test:ci-paths`, focused ESLint, `actionlint` with the custom runner labels, and `git diff --check` passed.
`corepack pnpm docs:lint -- README.md` passed one file. Harper also passed both files in
`.agents/plans/self-hosted-runners` and the Swarm implementation plan. After the compatible infrastructure is deployed, inspect a complete workflow run and distinguish
successful checks from jobs that are queued, skipped, canceled, or unrun. Do not run local browser reset commands
against the existing developer Docker daemon as a substitute for that evidence.

For the 2026-09-14 conflict resolution, the three-suite command passed 326 tests. Selection fixtures, focused
ESLint, `corepack pnpm architecture:check`, and Actionlint 1.7.12 with ShellCheck 0.11.0 passed.
`corepack pnpm docs:lint -- .agents/plans/self-hosted-runners/01-use-isolated-runners.md` passed one file.

Bruno: not applicable — only CI scheduling and tests change; HTTP behavior remains unchanged.

## Idempotence and Recovery

Editing the runner arrays and rerunning local tests is repeatable and changes no external state. If the upgraded
pool is unavailable, keep this workflow change inactive; the capability label leaves unmatched jobs queued rather
than sending them to the old pool. Reverting the workflow target commit restores the previous selection without
modifying application data. Do not remove the capability label to make shared-daemon workers accept these jobs.

## Artifacts and Notes

The intended commit and pull request scope is `ci(runners): use isolated self-hosted runners`. The initial issue lookup
`gh issue list --label execplan --search "self-hosted-runners/01 in:body"` returned no synced issue, so no assignment
or Project 9 update was made. The runner infrastructure has its own pull request and manual deployment procedure.
Local syntax and contract checks are evidence for this repository's changes; they do not prove live runner behavior.

## Plan readiness

Ready to implement
