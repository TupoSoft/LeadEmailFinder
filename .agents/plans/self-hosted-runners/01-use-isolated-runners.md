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
- [x] (2026-09-14) Publish commit `a3f0b17` and inspect run `34867835332`; the artifact guard still fails.
- [x] (2026-09-14) Apply the deliberate browser shutdown delay once and allow bounded subprocess headroom.
- [x] (2026-09-14) Pass all 50 artifact guards, both negative controls, and the comparison with delayed browser initialization.
- [x] (2026-09-14) Publish the artifact guard follow-up; its complete Actions result remains unverified.
- [x] (2026-09-14) Switch Vite and Vitest to the standard React plugin with Oxc; pass 628 tests, build, and development refresh.
- [x] (2026-09-14) Publish the Oxc follow-up; run `34873940809` still has queued and running jobs.
- [x] (2026-09-14) Add conservative selection of affected unit tests in GitHub Actions and local validation.
- [x] (2026-09-14) Validate dependency discovery, fallback coverage, and failure propagation locally.
- [x] (2026-09-14) Prepare the validated selection follow-up for publication in PR #595.
- [x] (2026-09-14) Diagnose backend job `104085084575`: its typed socket timeout passed, but elapsed time exceeded 500 milliseconds.
- [x] (2026-09-14) Replace proxy elapsed-time assertions with a controlled deadline clock and real connection closure checks.
- [x] (2026-09-14) Trigger TLS cancellation after observing handshake data and verify its error and socket cleanup.
- [x] (2026-09-14) Validate the socket follow-up on Node 24.21.0, exercise negative controls, and prepare publication.
- [x] (2026-09-15) Diagnose the HTTP fixture failures and browser job timeouts in run `34908555222`.
- [x] (2026-09-15) Isolate HTTP fixtures and allow bounded request and browser job scheduling headroom.
- [x] (2026-09-15) Pass 17 HTTP discovery tests, 332 workflow and plan tests, selection fixtures, ESLint, type checking, and the architecture gate.
- [ ] (2026-09-12) After a separately authorized Swarm deployment, record a complete Actions run on the new pool.

## Plan dependencies

None.

## Surprises & Discoveries

- (2026-09-15) Backend job `104191388811` timed out a local homepage request with its 100-millisecond test
  transport deadline. That late request then appeared in the next test's shared server log. Browser UI setup
  consumed about 7 minutes and 49 seconds; its first suite passed 56 distinct tests before the 20-minute job limit.
  The complete UI inventory contains 252 tests. Live setup consumed about 17 minutes and 46 seconds before
  Compose began building the disposable stack; the 25-minute job limit stopped those builds before live tests ran.
- (2026-09-14) Backend job `104085084575` passed 3,287 tests and failed one assertion after 625 seconds of testing.
  The HTTP proxy test correctly rejected with `ConnectionTimeoutError`, but measured 2,595 milliseconds against
  a 500-millisecond elapsed-time limit. That limit includes runner scheduling delays and cannot establish the
  configured 50-millisecond timer.
  The SOCKS4, SOCKS5, and TLS tests used the same fragile elapsed-time assumption.
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
- (2026-09-14) Jest cannot discover subprocess imports, and Vitest cannot infer the web guard's filesystem scan.
  Scripts use full-suite fallback; reduced web selections always include that guard. Checking only the union of
  related tests would miss a changed source without tests, so discovery checks each source separately.
- (2026-09-14) Vitest ignores file filters after `--`. A real execution exposed this by running all 628 tests;
  passing absolute file paths without that separator ran only the expected 37 tests in two files. The installed
  CLI parser now has a regression test. Backend discovery has a cumulative 30-second budget before full fallback.
- (2026-09-14) Job `104056594425` passed installation and cache saving, then failed one of six privileged
  artifact guards after 47.1 seconds. Its subprocess deadline was 45 seconds, but the assertion hid the error code.
  The guard delayed every context close based on the setup duration. Authentication cleanup and Playwright
  teardown both close the context, so slow setup increased the artificial delay twice.

## Decision Log

- Decision: Use a fresh HTTP integration fixture per test, a three-second request deadline, and ten-second test
  budgets. Allow 90 minutes for each complete UI and live browser job.
  Rationale: A temporary 200-millisecond homepage response reproduces the HTTP failure with the old deadline.
  The corrected fixture retains real stalled-response failures, exact request counts, and log privacy checks.
  The UI job runs 252 tests, including 124 tests in serial feature suites. Observed throughput suggests about
  75 minutes before its final accessibility and visual suites, but that estimate needs CI confirmation. Live
  provisioning also needs time beyond its measured setup and interrupted builds. Preserve all validation steps,
  individual test deadlines, worker counts, teardown limits, and aggregate failure handling.
  Date/Author: 2026-09-15, user-authorized CI monitoring follow-up.
- Decision: Fix socket timing assertions in this PR without changing runtime deadlines or application behavior.
  Rationale: Wait for real HTTP or SOCKS handshake progress, leave native socket scheduling active, and advance
  only the test clock. Require the operation to remain pending at 49 milliseconds, reject at 50 milliseconds, and close the peer
  connection. For TLS, observe handshake bytes, abort explicitly, and check the abort reason and socket cleanup.
  Date/Author: 2026-09-14, user-authorized backend job follow-up.
- Decision: Apply selection of affected unit tests to GitHub Actions and local validation in this existing PR.
  Rationale: The user explicitly requested both. Reuse the existing consumer selection and Git comparison logic.
  For ordinary existing source files, ask Jest or Vitest for related tests separately for each changed file. Run
  the full relevant suite for uncertain comparisons, configuration, fixtures, shared packages, deletions, or
  missing dependencies in the test graph. Always retain the web source guard with reduced web selections.
  Keep existing integration and browser checks, and preserve backend Node runner tests whenever backend is selected.
  Date/Author: 2026-09-14, user-authorized selection follow-up.
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
- Decision: Apply the privileged guard's deliberate shutdown delay once, with a 90-second child process budget
  and a 120-second outer test budget. Include only the subprocess error code, signal, and exit status in diagnostics.
  Rationale: Browser startup and deliberate deadline crossing need bounded headroom on isolated workers. Repeated
  teardown must not repeat the artificial delay, and failure diagnostics must not expose captured child output.
  Preserve the artifact assertions and verify that removing timeout suspension still makes both timeout guards fail.
  Date/Author: 2026-09-14, user-authorized artifact job follow-up.
- Decision: Replace `@vitejs/plugin-react-swc` with `@vitejs/plugin-react` 6.1.1 in the web package and both compiler
  configurations, using Oxc through Vite 8. Update the lockfile through pnpm and retain backend SWC dependencies.
  Rationale: The web configurations use no custom SWC transformations, and the current plugin recommends this
  supported path. Keep the standard `react()` options and validate tests, the production build, and development
  refresh behavior. Treat timing observations as local measurements rather than a promise of faster CI.
  Date/Author: 2026-09-14, user-authorized Oxc follow-up.

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

The artifact guard follow-up passed all six privileged scenarios on Node 22.18.0 with Playwright 1.63.0 and
Chromium 153. Both negative controls rejected forbidden `error-context.md` artifacts when timeout suspension
was temporarily removed. The production fixture was restored exactly, and all six scenarios passed again in
15.8 seconds. This validates the artifact protection assertions locally; a fresh Actions result remains pending.

A controlled comparison used temporary copies with 15 seconds of synthetic setup and the same 45-second child
budget. The original guard failed after 45.066 seconds; the updated guard passed in 33.617 seconds. This reproduces
the timing failure and validates the single shutdown delay independently of the larger budget. A separate one-millisecond
child deadline produced `code=ETIMEDOUT, signal=SIGTERM, status=none`, with no synthetic authentication marker in
the parent output. The production fixture remained unchanged after validation.

All five artifact suites passed locally: 6 privileged, 24 invitation, 2 verification, 8 service-client, and 10 proxy
guards, with no failures or skips. Focused ESLint, JavaScript syntax, and the real ExecPlan repository fixture passed.
The diff keeps application behavior and artifact protection unchanged; no material architectural trade-off was found.

The Oxc follow-up uses `@vitejs/plugin-react` 6.1.1 in both web configurations. The lockfile removes only the old
frontend plugin and its unused SWC 1.16.2 dependency tree; backend SWC 1.13.5 and Jest integration remain intact.
A frozen install, API client build, all 628 web tests, and the production web build passed without the SWC
recommendation. The build retains its chunk-size advisory. Local test duration was 66.36 seconds before and
68.39 seconds after the switch, with transform time changing from 1.40 to 1.29 seconds. These single runs are not
a controlled performance benchmark; the latter overlapped other validation and does not establish a speedup.

The in-app Chromium browser verified development rendering at `http://127.0.0.1:4175/` and navigation to the
principles section. A temporary counter fixture retained count 1 after its heading changed through Fast Refresh.
Neither page reported browser errors or warnings. The temporary tab, files, and owned dev server were removed.
All 12 existing public-entry browser tests passed against the production build across desktop and narrow
viewports. Web ESLint, the design contract, and the UI audit passed, with zero UI violations. Review found no
material architectural trade-off; the change remains confined to the web compiler configuration and its dependencies.

The selection follow-up passed 20 selection and Git fixtures, 332 workflow and plan tests, and an actual failing
Jest fixture that preserved exit status 1. All three real dependency and CLI parser fixtures passed, including
restoration of environment variables changed by Vitest discovery. A representative socket change selected eight Jest files: seven passed
with 36 tests, and one existing integration test remained skipped because its external dependencies were absent.
All 92 backend Node runner tests passed. The reduced web example passed 37 tests in two files, including the
mandatory filesystem guard. A change to the destination helper selected 320 passing tests in 14 files through
direct and indirect imports. Integration tests in CI retain their existing separately provisioned database steps.
The full PR comparison correctly selects both complete unit suites because this PR changes CI and compiler inputs.
Focused ESLint, Actionlint with ShellCheck, selection fixtures, and the architecture gate passed with zero violations.
There is no HTTP behavior change and no material application architecture trade-off. A complete successful
Actions run remains unverified; queued or running jobs are not evidence of success.

The socket follow-up passed all 14 focused socket tests on Node 24.21.0, matching the failed Actions job, with
zero skipped tests. The official Node archive checksum was verified before execution. Local affected validation
selected the two edited test files: all nine tests and all 92 retained backend Node runner tests passed.
Focused ESLint and the architecture gate passed with zero violations; runtime socket code remains unchanged.

Both deadline negative controls failed as expected: expiry at 49 milliseconds fails the pending-operation assertion,
and expiry at 51 milliseconds fails within the temporary fixture's bounded test deadline. A controlled comparison
blocked the JavaScript thread for 600 milliseconds after creating the deadline. The original HTTP test failed its
500-millisecond elapsed-time assertion at 615 milliseconds; the corrected test passed under the same block.
These fixtures demonstrate independence from scheduling delay, not a performance improvement on CI. Temporary
fixture trees were removed. A complete successful Actions run for the published follow-up remains unverified.

The 2026-09-15 follow-up passed 17 HTTP discovery tests and 332 workflow and plan tests. The temporary
200-millisecond homepage control failed with the original request deadline and passed with the corrected fixture.
The stalled homepage and child responses still timed out, with all exact request and privacy assertions intact.
Selection fixtures, focused ESLint, type checking, and the architecture gate passed. Application behavior and
module boundaries remain unchanged. The larger browser job budgets still require validation in GitHub Actions.

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
and this plan with its road map. The authorized follow-up also adjusts the shared setup timeout in
`src/libs/modules/credits/src/application/credits.service.integration.spec.ts`, the CI worker count, and the timing
and subprocess diagnostics in `scripts/testing/browser-fixture-artifacts.spec.mjs`.
The Oxc follow-up updates `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, and
`pnpm-lock.yaml`. The prose dictionary recognizes Oxc as the compiler's name. The change does not enable
experimental React Compiler transforms or change the backend compiler.

The selection follow-up adds `scripts/ci/test-affected.mjs`, its dependency discovery adapter, and focused Node
tests. It updates the root package scripts, README, workflow commands, and workflow contracts. It narrows only
unit test files for known source changes; existing job selection still governs integration and browser validation.

The socket follow-up changes `src/libs/socket/src/connect.spec.ts`, `src/libs/socket/src/tls-connect.spec.ts`,
this plan, and the prose dictionary for the SOCKS4 protocol name. It replaces scheduling-sensitive assertions with
controlled deadline and cancellation checks while preserving real socket communication and cleanup coverage.

It does not alter HTTP APIs, Bruno collections, business modules, database schemas, application images, workflow
triggers, permissions, or required check names. It does not implement or deploy Swarm
infrastructure. No development reset, migration, or seed operation is required for these source changes.

## Plan of Work

Replace the twelve direct `runs-on` values in the validation and synchronization workflows with the exact four-label
array. Keep job dependencies, conditions, commands, permissions, and reusable workflow calls unchanged.

For the authorized follow-up, keep the workflow dependency graph and failure propagation intact. Run the web
suite with `--maxWorkers=1`, retain its existing DOM and whole-test deadlines, and give only the credits initialization
hook a 30-second timeout. Set the artifact worker to 30 minutes and image validation to 60 minutes. Replace the
combined dependency cache actions with separate restore and immediate save steps. Keep cache keys, paths,
installation commands, and their selection guards compatible with existing caches.

For the artifact guard follow-up, restore the original context close method before awaiting the deliberate delay.
Keep the delay longer than the entire synthetic test deadline so missing timeout suspension remains detectable.
Allow 90 seconds for the child process and 120 seconds for its parent test; report execution metadata without child
output. Run the guard scenarios and a temporary negative control with timeout suspension removed, then restore
the production fixture before committing. The existing Playwright CLI scripts are required because this check
tests subprocess termination, a dedicated reporter, and filesystem artifacts that an interactive browser cannot verify.

For the Oxc follow-up, measure the existing web suite before changing dependencies. Replace the web React plugin
dependency and both imports, preserving their options and the static security header plugin. Regenerate the lockfile
with pnpm, inspect the dependency diff, and verify a frozen install. Build the API client, run the full web suite with
one worker, and build the web application. Verify development rendering and React Fast Refresh with a temporary
local fixture, then remove it. Record the validation results and any limitations in timing comparisons.

Extend the existing YAML parser to accept a string containing visible characters or a nonempty array of such strings. Add fixtures
for both valid forms and reject missing, null, numeric, boolean, blank, empty, mixed, nested, and mapping values.
Inspect all workflow YAML files and require the configured labels for every direct job. Declare the custom labels
in `.github/actionlint.yaml` so `actionlint` can validate workflow syntax with the selected runner pool.

Document the private daemon and fresh workspace contract in README, including infrastructure deployment order.
Run the focused checks below. Once a synced issue exists, assign it to the requesting user and update its Project 9
status according to root `AGENTS.md`. Link the issue with a closing keyword when opening this plan's pull request.

## Interfaces and Dependencies

`corepack pnpm test:affected --base origin/master` runs affected backend and web unit tests against the merge base
with that local reference, including staged, unstaged, and untracked changes. Fetch the reference before using it
to match the current remote base. Use `--base HEAD` for changes in the working tree, `--suite backend` or `--suite web`
to choose one suite, and `--dry-run` to inspect selection without executing tests. GitHub Actions uses `--event`
and the complete event comparison. Unsupported events and missing history select full suites. Existing full test
commands remain available. The new adapter uses the installed Jest CLI and public Vitest API, with no new dependency.

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

- HTTP CONNECT, SOCKS4, and SOCKS5 tests wait for protocol progress, remain pending at 49 milliseconds, and reject with
  `ConnectionTimeoutError` at 50 milliseconds while closing the peer connection. Changing expiry to 49 or 51 milliseconds makes
  the focused regression fail. TLS cancellation preserves its abort error, cause, and raw socket destruction.
- Focused socket suites pass on Node 24.21.0, the exact version used by the failed Actions job. Runtime socket
  code, configured deadlines, and workflow requirements remain unchanged.
- A source change runs its direct and transitive test dependents; a changed test selects itself.
- Every changed source must have related tests. An uncovered source, failed graph discovery, deleted file, shared
  fixture, configuration change, or untrusted comparison runs the full relevant suite.
- Local selection includes committed changes since the merge base and all three layers of uncommitted changes.
  PR selection includes the entire PR while excluding changes present only on the base branch.
- Reduced web runs include the filesystem source guard. Backend runs retain Node runner tests, and failures
  remain failures without retrying a smaller selection. Required integration and browser checks remain intact.
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
- All six privileged artifact guards pass; both timeout scenarios still fail if authentication timeout suspension
  is removed. The deliberate close delay runs once, and subprocess failures identify their code, signal, and status
  without exposing captured output.
- Vite and Vitest use `@vitejs/plugin-react` with Oxc. All web tests and the production build pass without the SWC
  recommendation, and development refresh preserves component state. Backend SWC dependencies remain available.
- After the external deployment, a complete Actions run uses the upgraded pool and preserves the required
  `Validate / validate` result. That runtime criterion remains unverified until actual execution.

## Validation

Socket follow-up validation:

```sh
corepack pnpm test:affected --base HEAD --suite backend
/tmp/lef-pr595-node24/node-v24.21.0-linux-x64/bin/node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/libs/socket/src/connect.spec.ts src/libs/socket/src/tls-connect.spec.ts src/libs/socket/src/connection-deadline.spec.ts
corepack pnpm exec eslint src/libs/socket/src/connect.spec.ts src/libs/socket/src/tls-connect.spec.ts
corepack pnpm architecture:check
corepack pnpm docs:lint -- .agents/plans/self-hosted-runners/01-use-isolated-runners.md
```

Verify the temporary Node runtime against the official archive checksum before use. For negative controls, copy
the socket sources to a temporary fixture and change only the deadline expiry to 49 or 51 milliseconds; the HTTP timeout
test must fail in each case. Keep the repository sources unchanged and remove the owned temporary fixtures.

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

Selection follow-up validation:

```sh
corepack pnpm test:affected-selection
node --test scripts/ci/related-tests.test.mjs
corepack pnpm test:affected --base origin/master --dry-run
corepack pnpm exec eslint scripts/ci/*.mjs scripts/ci/validate-workflow.spec.ts
corepack pnpm docs:lint -- README.md .agents/plans/self-hosted-runners/01-use-isolated-runners.md
```

Also execute representative reduced backend and web selections and confirm a failing selected test preserves
its exit status. The Git and graph fixtures exercise deletions, renames, missing comparisons, mixed covered and
uncovered sources, aliases, and direct and transitive imports. Full-suite validation remains the fallback in CI.

Artifact guard follow-up validation uses Chromium matching the lockfile, installed outside the checkout:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:privileged-artifacts
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:invitation-artifacts
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:verification-artifacts
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:service-client-artifacts
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:proxy-artifacts
corepack pnpm exec eslint scripts/testing/browser-fixture-artifacts.spec.mjs
```

For the negative control, temporarily remove only `info.setTimeout(0)` from
`apps/web/tests/support/privileged-login.ts`. Run
`PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright node --test --test-name-pattern=runner-timeout scripts/testing/browser-fixture-artifacts.spec.mjs`.
Require both selected guards to fail their protection assertions, then restore the fixture exactly and rerun the
positive suite. Never print the child's captured output while diagnosing these checks.

Oxc follow-up validation:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=1
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web lint
CI=true PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-pr595-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/public-entry.spec.ts --workers=1 --output=/tmp/lef-pr595-oxc-public-entry-results
corepack pnpm design:lint
corepack pnpm ui:audit
corepack pnpm docs:lint -- .agents/plans/self-hosted-runners/01-use-isolated-runners.md
```

For development refresh, start the Vite dev server on an unused loopback port. Open a temporary React counter
fixture in Chromium, increment it, edit its label, and require the updated label with the existing count and no
runtime error. Restore or remove all temporary files and stop the owned server afterward. Also open the application
entry and verify its normal rendering and navigation without a framework error overlay.

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
