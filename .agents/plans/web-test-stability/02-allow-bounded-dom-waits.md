# Allow Bounded Waits for Asynchronous UI States

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Application tests can observe a valid asynchronous UI state that arrives after one second, while missing states
still fail within a finite wait. One shared three-second DOM wait budget covers authentication, mocked API reads,
and route transitions without changing application behavior or weakening their assertions.

## Progress

- [x] (2026-09-13) Add the shared DOM wait budget and delayed authorization regression coverage.
- [x] (2026-09-13) Validate the focused scenarios, full frontend suite, and bounded failure controls locally.
- [x] (2026-09-13) Publish draft PR #611 and record its CI queue state separately from local results.
- [ ] (2026-09-13) Verify the affected Actions job after an isolated runner starts the queued run.

## Plan dependencies

None.

## Surprises & Discoveries

- Master at `fdb855aa4a283ebd938e07a24f824e32b5054711` still used hosted runners. PR #595 remained open at
  `f8426869a342b605b72940ba320cfe076fb50876`; all nine direct jobs there used the four required isolated runner
  labels. That branch lacked this plan, so implementation copied only this plan from master into its isolated
  checkout. The application sources matched master; unrelated planning and architecture documents were not copied.
- The delayed response failed with a 1,000-millisecond query budget and passed with 3,000 milliseconds. A missing
  heading failed through Testing Library after the finite query wait rather than reaching the whole-test deadline.

## Decision Log

- Decision: Set `asyncUtilTimeout` to `3000` in the existing application test setup. Keep the existing
  deadline for each complete test, all current assertions, retries, and diagnostic suppression unchanged. This gives asynchronous
  rendering more time while preserving finite failures. Date/Author: 2026-09-13, Codex planning.
- Decision: Add a delayed HTTP 403 scenario through the existing Team test harness. Its mocked response takes
  1,200 milliseconds; assertions wait for UI semantics without a per-query timeout or fixed sleep. This tests
  the application's authorization transition under the changed budget. Date/Author: 2026-09-13, Codex planning.
- Decision: Prefer executing this plan after `web-test-stability/01` to distinguish worker and wait-budget effects.
  There is no code dependency, so either plan can be implemented independently. Date/Author: 2026-09-13, Codex planning.
- Decision: Keep this plan in a separate planning PR targeting master and allow local implementation from master.
  Rationale: The DOM wait change has no code dependency on PR #595. Its isolated runner configuration remains
  required before publishing a revision that runs Actions. Date/Author: 2026-09-13, user-requested plan separation.
- Decision: Target the implementation PR at `kk/self-hosted-runners` while #595 remains open. Copy this existing
  plan from master to keep its evidence with the implementation. Leave worker settings to the independent #609
  issue; local test commands explicitly use two workers. Date/Author: 2026-09-13, Codex implementation.

## Outcomes & Retrospective

Implementation and local validation are complete. Application tests inherit the shared three-second DOM wait,
and the delayed authorization regression verifies the access-denied heading, forbidden route, and exactly one
members GET. The immediate authorization test and service-client assertions remain intact. Static review found
no material architectural trade-off. Draft PR #611 is assigned to the requesting user and targets
`kk/self-hosted-runners`. Actions validation is queued; its tests have not run.

## Context and Orientation

`apps/web/src/test/setup.ts` loads DOM matchers and registers the cleanup hook. The `application` project in
`apps/web/vitest.config.ts` loads that setup; the `browser-fixtures` project uses a Node environment and does not.
Testing Library DOM version 10.4.1 defaults to a 1,000-millisecond asynchronous query timeout. The setup does not
override it, and increasing the separate whole-test timeout in Vitest would not change this query deadline.

`apps/web/src/features/team/TeamPage.test.tsx` supplies authenticated account and members responses through
`renderTeam`. Its immediate HTTP 403 scenario has no capability hint and expects the access-denied heading plus
exactly one members request. `AuthSession` handles the rejection and `ProtectedApplication` routes to
`/app/forbidden`. The service-client suite also waits for initial UI and customizes `getElementError` to omit
secret-bearing DOM from failures; its setup and restoration must retain that protection.

The failed CI job tested merge commit `8e40ea48fe13ca466774a8ed0003bf763d9e5971`: 625 of 627 tests passed across
30 files. Both failures exhausted DOM queries; the Team failure showed an authenticated shell with an empty main
element. This is consistent with an unfinished redirect, but runner contention and a routing defect remain unproven.
At local commit `099d1d0872be67987b2f544468c21f89a858e4a3`, the existing full suite passed 607 tests across 29 files
with two workers in 24.14 seconds, and the two affected files passed 50 tests in 5.80 seconds without a worker cap.
Those local results precede this plan and are neither reproduction nor a speed comparison against the CI snapshot.

## Scope and Non-Goals

This pull request changes `apps/web/src/test/setup.ts`, adds focused coverage in
`apps/web/src/features/team/TeamPage.test.tsx`, and maintains this plan's implementation evidence. It leaves
application code, HTTP contracts, visual design, worker limits, infrastructure, Playwright, and secrets unchanged.
Keep test retries and fixed sleeps out of assertions. Preserve explicit query timeout settings and the existing deadline for each complete test.
The result enables more reliable component checks; it does not claim to resolve an unmeasured runner cause.

## Plan of Work

Start from current master in an isolated checkout, preserving newer tests and unrelated user changes.
Local implementation and validation do not depend on PR #595. Before publishing a revision that runs Actions,
require every direct job to use `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated`. While #595 remains
unmerged, base that implementation PR on its current branch or defer publication that would trigger CI.
Before implementation, locate this plan's synced issue using marker `web-test-stability/02`, assign it, and move
its Project 9 status to In Progress according to root `AGENTS.md`.

Import `configure` beside `cleanup` from `@testing-library/react` in the existing setup and call
`configure({ asyncUtilTimeout: 3000 })` once at module scope. Preserve existing matchers and cleanup. Do not replace
the configuration object or modify `getElementError`; suite-level diagnostic overrides must remain effective.

Keep the existing immediate Team authorization test unchanged. Add
`renders access denial after a delayed member-list response` beside it, reusing `renderTeam`, `membersPath`, and
`requestsFor`. With no capability hint, return one members-response promise that resolves HTTP 403 after 1,200
milliseconds using a real timer. Use the existing default semantic `findByRole` for the access-denied heading,
then assert `/app/forbidden` and exactly one members GET. Track the timer and cancel it in `finally` so failed
queries cannot leave work for another test. Keep fixture data synthetic and do not generate invitation secrets.

Run the validation below and inspect the diff for scope, assertion integrity, and retained diagnostic suppression.
Record exact commit, worker settings, counts, and outcomes. Deliver one PR titled
`test(web): allow bounded waits for asynchronous UI states`, matching its conventional commit subject. Assign
the PR to the requesting user and include the synced issue's closing reference as required by root `AGENTS.md`.

## Interfaces and Dependencies

The only configuration change is Testing Library's existing `asyncUtilTimeout` in application tests. No new
library, endpoint, application interface, database change, or deployment is required. Existing asynchronous UI
queries inherit the budget; explicit existing overrides and secret-safe error construction retain their behavior.

## Acceptance Criteria

- A mocked members HTTP 403 delivered after 1,200 milliseconds renders access denial through the real application
  route composition, using the shared wait budget and exactly one members GET.
- The original immediate authorization scenario and service-client delayed-settlement scenarios still pass with
  their assertions intact. Missing expected UI produces a query failure rather than an unbounded wait.
- Application tests share a 3,000-millisecond DOM wait; whole-test timeouts, retries, diagnostic suppression, and
  the Node browser-fixture project's setup remain unchanged.
- Focused component tests, the complete frontend suite, lint, type checking, and changed-document prose checks pass.
  A local pass is reported separately from any Actions run at the implementation commit.

## Validation

Run from the repository root after installing the existing locked dependencies if necessary:

```bash
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --project application --maxWorkers=2 src/features/team/TeamPage.test.tsx src/features/service-clients/service-clients.test.tsx
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=2
corepack pnpm --filter @tuposoft/lead-email-finder-web lint
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm docs:lint -- .agents/plans/web-test-stability/02-allow-bounded-dom-waits.md
```

To prove the new regression exercises the shared budget, run only its name with the focused command below in
a disposable checkout. Temporarily set the shared budget to `1000`; expect a missing-heading query failure.
Restore `3000`; expect success. Separately substitute a nonexistent heading in that test and expect a bounded
query failure, then restore the test. Commit neither temporary mutation. Do not assert precise wall-clock timing.

```bash
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --project application --maxWorkers=2 src/features/team/TeamPage.test.tsx --testNamePattern 'renders access denial after a delayed member-list response'
```

Use a normal CI run of the implementation commit to verify the affected validation job, recording failure details
if timing sensitivity persists. No browser, container, or live API claim follows from component tests.
Bruno: not applicable — test setup and mocked component coverage do not change externally observable HTTP behavior.

## Idempotence and Recovery

Repeated runs use mocked data and clean up their fixture timer. Retry failed checks after investigating their
output. Revert only this plan's setup and test changes to restore the prior budget; no data reset is needed.

## Artifacts and Notes

Original evidence: [failed validation job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423416).
The prior local full-suite command was the same two-worker command listed above; its smaller test inventory must
remain explicit. The readiness review found no unresolved implementation choice, external dependency, or product
decision in this single-PR scope.

Implementation validation on 2026-09-13 used an isolated checkout based on
`f8426869a342b605b72940ba320cfe076fb50876`. The validated setup and regression changes are committed as
`ea547c2b9b40b022e420010be06b96991c9f08bc`:

- The API client build passed.
- The focused command above passed 51 tests across two files in 5.68 seconds with two workers.
- The complete frontend command above passed 628 tests across 30 files in 28.50 seconds with two workers.
- Frontend lint and type checking passed. `corepack pnpm ui:audit` found no violations, and
  `corepack pnpm design:lint` reported no errors or warnings.
- The single-test command above failed as expected with `asyncUtilTimeout: 1000`, passed with `3000`, and failed
  as expected when the heading was temporarily replaced with a nonexistent name. Both failures were missing-role
  query errors. Each run selected one test and skipped the other 21; all temporary mutations were restored.
- `corepack pnpm exec prettier --check apps/web/src/test/setup.ts apps/web/src/features/team/TeamPage.test.tsx`
  and `git diff --check` passed.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- execplan-repository-fixture --runInBand` passed its
  repository plan validation test.
- The implementation also copies the existing `Vitest` dictionary entry from master, which the older base lacked.
- `corepack pnpm docs:lint -- .agents/plans/web-test-stability/02-allow-bounded-dom-waits.md` passed one file
  after adding that dictionary entry. The commit hook's module architecture check passed nine modules with no
  violations.

The timer belongs to the mocked response and is canceled in `finally`. Assertions contain no fixed sleep or
timeout override. Testing Library merges the partial configuration update, preserving the service-client
suite's secret-safe `getElementError` overrides. The Node fixture project does not load the application setup.

[Draft PR #611](https://github.com/TupoSoft/LeadEmailFinder/pull/611) contains `Closes #610` and is assigned to
`KyryloKupin`. Its [initial Actions run](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34768961053)
targets implementation commit `ea547c2b9b40b022e420010be06b96991c9f08bc`. At the handoff check, the discovery job
`103754911867` was queued with no assigned runner and labels `self-hosted`, `swarm`, `ubuntu-22`, and
`docker-isolated`. This confirms the requested runner selection, but provides no CI execution or timing result.
The original checkout's unrelated changes remain untouched.

## Plan readiness

Ready to implement
