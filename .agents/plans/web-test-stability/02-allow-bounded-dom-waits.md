# Allow Bounded Waits for Asynchronous UI States

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Application tests can observe a valid asynchronous UI state that arrives after one second, while missing states
still fail within a finite wait. One shared three-second DOM wait budget covers authentication, mocked API reads,
and route transitions without changing application behavior or weakening their assertions.

## Progress

- [x] (2026-09-27) Restore the shared DOM wait budget and delayed authorization regression coverage on current master.
- [x] (2026-09-27) Validate the focused scenarios, negative controls, and complete frontend suite.
- [ ] (2026-09-27) Record separate Actions evidence for the replacement implementation PR.

## Plan dependencies

None.

## Surprises & Discoveries

- PR #611 merged into `kk/self-hosted-runners`, but PR #595 closed without merging that branch into master.
  Master at `06563e6f923fa7673ec676f5deab61da3d33cf29` still lacked both test changes and retained the original plan.
- Current workflows select `tuposoft-ci`; the web test command already uses `--maxWorkers=2` from PR #614.
  The historical runner labels and publication dependency on PR #595 no longer apply.

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
- Decision: Recover the two test changes on current master in one replacement PR for issue #610. Retain the current
  `tuposoft-ci` routing and obtain fresh Actions evidence. PR #611 targeted a branch that never reached master, so
  its historical local results and request to skip CI do not validate this revision. This replaces the earlier
  runner-branch publication instruction. Date/Author: 2026-09-27, Codex implementation following user authorization.

## Outcomes & Retrospective

The shared three-second DOM wait and delayed authorization regression from PR #611 have been restored on current
master. Local validation passed, including the complete frontend suite and negative controls. Actions evidence
remains pending. The change introduces no material architectural trade-offs.

## Context and Orientation

`apps/web/src/test/setup.ts` loads DOM matchers and registers the cleanup hook. The `application` project in
`apps/web/vitest.config.ts` loads that setup; the `browser-fixtures` project uses a Node environment and does not.
Testing Library DOM version 10.4.1 defaults to a 1,000-millisecond asynchronous query timeout. Before this change,
the setup did not override it. Increasing the separate whole-test timeout in Vitest would not change this query deadline.

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
Restore only the two test changes from PR #611 and update this plan. Target master and preserve the current
`tuposoft-ci` runner routing and two-worker web test command. Run normal Actions validation on the replacement PR.
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
a disposable checkout or isolated source copy. Temporarily set the shared budget to `1000`; expect a missing-heading query failure.
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

Recovery evidence: [PR #611](https://github.com/TupoSoft/LeadEmailFinder/pull/611) merged into
`kk/self-hosted-runners` at `cb1368a534e7e5a5c71803ab68cbcd74962c6932`.
[PR #595](https://github.com/TupoSoft/LeadEmailFinder/pull/595) later closed without merging that branch into master.
The replacement branch is `kk/610-bounded-dom-waits-master`, based on
`06563e6f923fa7673ec676f5deab61da3d33cf29`. Issue #610 is assigned to `KyryloKupin` and remains In Progress in Project 9.

Local validation on 2026-09-27 used Vitest 4.1.11 and two workers. The focused Team and service-client suites passed
51 tests in two files; the complete frontend suite passed 677 tests in 31 files. The API-client build, frontend lint,
type checking, design lint, UI audit, formatting, and seven repository plan checks passed. These are local results;
Actions validation remains pending. No browser, container, or live API execution is claimed.

The delayed regression failed with `asyncUtilTimeout: 1000`, passed with `3000`, and failed with a nonexistent heading
through a bounded query failure rather than the deadline for the complete test. These controls ran in an isolated
source copy under `/tmp`, using the same locked dependencies. All temporary mutations were restored; logs and the
control summary are under `/tmp/lef-610-validation/`. Harper passed with
`corepack pnpm docs:lint -- .agents/plans/web-test-stability/02-allow-bounded-dom-waits.md`.

## Plan readiness

Ready to implement
