# Allow Bounded Waits for Asynchronous UI States

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Application tests can observe a valid asynchronous UI state that arrives after one second, while missing states
still fail within a finite wait. One shared three-second DOM wait budget covers authentication, mocked API reads,
and route transitions without changing application behavior or weakening their assertions.

## Progress

- [ ] (2026-09-13) Add the shared DOM wait budget and delayed authorization regression coverage.
- [ ] (2026-09-13) Validate the focused scenarios and full frontend suite, then record separate CI evidence.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Set `asyncUtilTimeout` to `3000` in the existing application test setup. Keep the existing
  deadline for each complete test, all current assertions, retries, and diagnostic suppression unchanged. This gives asynchronous
  rendering more time while preserving finite failures. Date/Author: 2026-09-13, Codex planning.
- Decision: Add a delayed HTTP 403 scenario through the existing Team test harness. Its mocked response takes
  1,200 milliseconds; assertions wait for UI semantics without a per-query timeout or fixed sleep. This tests
  the application's authorization transition under the changed budget. Date/Author: 2026-09-13, Codex planning.
- Decision: Prefer executing this plan after `web-test-stability/01` to distinguish worker and wait-budget effects.
  There is no code dependency, so either plan can be implemented independently. Date/Author: 2026-09-13, Codex planning.

## Outcomes & Retrospective

Not started.

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

Start from the current PR #595 branch or its merged successor in an isolated checkout, preserving newer tests
and unrelated user changes. Before implementation, locate this plan's synced issue using marker
`web-test-stability/02`, assign it, and move its Project 9 status to In Progress according to root `AGENTS.md`.

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
remain explicit. Implementation validation has not run. The readiness review found no unresolved implementation
choice, external dependency, or product decision in this single-PR scope.

## Plan readiness

Ready to implement
