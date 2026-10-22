# Give Each Callback Scenario Its Own Test Budget

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Run each authentication callback error scenario as an independent Playwright test. Developers can
identify and retry a failing callback code without sharing its timeout with three other scenarios.

## Progress

- [x] (2026-09-13) Diagnose the failed job and create an isolated checkout from current master.
- [x] (2026-09-13) Create the plan issue (#599), assign it, and mark it in progress.
- [x] (2026-09-13) Register four independent callback tests while preserving all assertions.
- [x] (2026-09-13) Run focused repetitions, the full browser suite, and static checks.
- [x] (2026-09-13) Review the final diff and prepare the draft pull request.

## Plan dependencies

None.

## Surprises & Discoveries

GitHub job `103704655752` reported a 30-second timeout on all three desktop attempts of the
callback test. Its narrow version passed in 28.5 seconds. The same test passed in 15.2 seconds
on desktop in the earlier job `103647027550`. Four navigations and accessibility scans share the
current deadline. The logs show that the deadline expired but do not establish CPU contention.

Reusing the main checkout's web dependency directory initially resolved an older API client through
its workspace link. External dependency links can be reused, but the API client link must resolve
to this checkout's `packages/api-client`. The build passed after correcting that local link.

## Decision Log

- Decision: Move the callback-code loop outside the test registration and include the code in each
  test name. Rationale: Each scenario needs an independent deadline, fixture, and retry while retaining
  its original assertions. Date/Author: 2026-09-13, Codex.
- Decision: Keep the default 30-second timeout and existing CI worker and retry settings.
  Rationale: Splitting the workload addresses the shared deadline without relaxing checks.
  Date/Author: 2026-09-13, Codex.

## Outcomes & Retrospective

The four callback codes now register separate named tests, each with fresh fixtures and the complete
original assertions. Playwright lists eight cases across the two browser projects. All 40 focused
executions passed in 24.8 seconds, and all 120 tests in the full browser workflow suite passed in
53.4 seconds. Both runs used two workers and disabled retries.

The web build, focused ESLint check, plan repository fixture, design lint, UI audit, and module
architecture gate passed. Harper passed both plan files after prose corrections. Independent review
found no actionable issues or production architecture changes. Separate fixture setup adds a small
amount of work per case in exchange for independent deadlines and retries.

The implementation is ready for a draft pull request closing the plan issue (#599). Validation used
Playwright 1.63 with local Chromium; the remote runner's resource conditions remain unverified. CI status must be
reported separately after publication.

## Context and Orientation

`apps/web/tests/e2e/auth-shell.spec.ts` exercises authentication screens using the existing
`mockSession` helper. Its callback test loops over `login_state_invalid`,
`authorization_code_exchange_failed`, `active_membership_required`, and `raw-provider-secret`.
Each iteration navigates to `/auth/error`, checks the heading, title, safe copy, and login link,
then calls the existing accessibility helper. `apps/web/playwright.config.ts` runs the file
on desktop and narrow Chromium with two workers and two retries in CI.

## Scope and Non-Goals

Change only callback test registration and this plan. Preserve application behavior, all assertions,
browser projects, time limits, and workflow commands. Infrastructure tuning and unrelated
test restructuring are outside this task. No product or visual decision changes.

## Plan of Work

Synchronize this plan's issue and mark it in progress. In `auth-shell.spec.ts`, use the existing
callback-code array in a top-level loop that registers one named test per code. Create the mock
session inside each test and retain the original assertions and accessibility scan. List the focused
tests, repeat them five times with two workers and retries disabled, then run the full browser suite.
Review the diff, record actual validation outcomes, and create one draft pull request.

## Interfaces and Dependencies

No HTTP interface, dependency, database, or runtime configuration changes. Validation requires the
existing workspace dependencies and installed Chromium. Local checks use the repository Playwright
scripts because the Browser plugin is unavailable. Existing dependency directories may be linked into
the isolated checkout when the lockfile matches.

## Acceptance Criteria

- Playwright discovers four distinctly named callback tests in each of the two browser projects.
- Every case retains session setup and the heading, title, safe-copy, login-link, and accessibility checks.
- All 40 focused executions pass without retries under the existing 30-second test timeout.
- The full browser workflow suite passes with two workers.
- Focused lint, plan validation, design checks, and Markdown prose validation pass.
- The diff contains no runtime or timeout configuration changes.

## Validation

Run these commands from the isolated checkout. The browser cache is outside the repository.

```bash
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/auth-shell.spec.ts --grep 'callback failure' --list
CI=true PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-playwright-browsers corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/auth-shell.spec.ts --grep 'callback failure' --repeat-each=5 --workers=2 --retries=0 --output=/tmp/lef-callback-focused-results
CI=true PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-playwright-browsers corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e --workers=2 --retries=0 --output=/tmp/lef-callback-full-results
corepack pnpm --filter @tuposoft/lead-email-finder-web exec eslint tests/e2e/auth-shell.spec.ts
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- execplan-repository-fixture --runInBand
corepack pnpm design:lint
corepack pnpm ui:audit
git diff --check
```

Local repetition does not reproduce the remote runner's resource conditions. Report CI status
separately after opening the pull request. Bruno is not applicable because HTTP behavior is unchanged.

## Idempotence and Recovery

Each test receives a fresh Playwright page and browser context with a new mocked session. The tests
use synthetic callback values and create no server resources. Repeating them requires no data reset.
Keep test output in `/tmp`. Revert the test registration change to restore the previous arrangement.

## Artifacts and Notes

Start from master `8673df39179ed37a67afea1ab19b49a6ea7982f6` on `kk/callback-test-isolation`.
The failure is recorded in [the browser job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34749944134/job/103704655752).
The linked plan issue is [#599](https://github.com/TupoSoft/LeadEmailFinder/issues/599), assigned to
the requesting user and marked In Progress in project 9 before the test edit.

## Plan readiness

Ready to implement
