# Preserve the Authentication Guard After Slow Setup

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the privileged authentication artifact guard pass when browser setup takes longer than one second,
while still detecting a missing timeout suspension in the login fixture. Developers observe the result
through the existing `test:privileged-artifacts` command.

## Progress

- [x] (2026-09-13) Inspect the failed job, verify current master, and isolate the implementation checkout.
- [x] (2026-09-13) Account for setup time and add a deliberately slow setup scenario.
- [x] (2026-09-13) Verify the guard passes and both deliberate regressions fail; restore all mutations.
- [x] (2026-09-13) Run focused validation and prepare the draft pull request.

## Plan dependencies

None.

## Surprises & Discoveries

The timeout scenario in GitHub job `103647027550` produced `error-context.md` instead of only
`.last-run.json`. Playwright counts fixture setup toward the total test timeout. Reducing that total to
1,000 milliseconds after setup can reject an already elapsed deadline before `loginAs` suspends it. A local
Playwright 1.63 reproduction confirmed that immediately disabling the timeout cannot undo this rejection.

Playwright exposes no public test start time. Capture a monotonic timestamp when the generated module
loads, before Playwright starts its single test, to conservatively account for all setup time.

No synced issue exists for `browser-artifact-timeout/01` at implementation start. Issue assignment,
project status, and a closing issue reference are unavailable until plan synchronization creates it.

## Decision Log

- Decision: Use elapsed time since module loading plus one second as the total framework timeout.
  Rationale: This leaves at least one second after setup without reading private Playwright fields.
  Date/Author: 2026-09-13, Codex.
- Decision: Delay context closure beyond the entire calculated timeout and add a setup delay of 1,200 milliseconds
  in a separate regression scenario. Rationale: Slow setup must succeed, and removing the fixture's
  timeout suspension must still produce a forbidden artifact. Date/Author: 2026-09-13, Codex.

## Outcomes & Retrospective

The timeout scenarios now account for setup time using `performance.now()`. All six artifact
scenarios passed, including the new slow setup case. Both deliberate mutations failed at the forbidden
artifact assertion, and the exact original file bytes were restored. The shared fixture and its privacy
assertions remain unchanged. The final six-scenario run passed after both mutations were restored.
Focused lint, plan parsing, and prose validation passed. Independent review found no actionable issues
or material architectural trade-offs. The existing 45-second subprocess limit remains unchanged;
exceptionally slow setup can still exceed it because the delayed closure must exceed the total budget.
The implementation is ready for its draft pull request. GitHub CI results are not yet available.

## Context and Orientation

`scripts/testing/browser-fixture-artifacts.spec.mjs` generates a child Playwright test for each privacy
scenario. The child imports `apps/web/tests/support/privileged-login.ts` and the privileged Playwright
configuration. It fills a page with synthetic material and intentionally rejects an invalid fixture
project before accessing Docker. The parent checks the sanitized reporter output, rejects unsafe capture
options, and permits only Playwright's pass/fail bookkeeping in the output directory.

The timeout scenario delays context closure to test the login fixture's suspension of the framework
deadline. The existing fixed total of 1,000 milliseconds can expire during earlier page setup on a busy runner.

## Scope and Non-Goals

Change the generated timeout scenario and add focused regression coverage in the existing test script.
Keep fixture behavior, sanitization, workflow commands, dependencies, application interfaces, and HTTP
behavior unchanged. Broader privacy policy changes and runner infrastructure are separate work.

## Plan of Work

Capture module loading time in generated timeout tests. Add a slow setup scenario with a delay of 1,200 milliseconds
before calculating the deadline. Calculate the total timeout from elapsed setup time plus one second,
and delay context closure longer than that total. Retain every existing artifact and reporter assertion.
Run the full guard suite, then temporarily restore the old timeout and remove fixture timeout suspension
in separate mutation checks. Restore each mutation before final validation and publication.

## Interfaces and Dependencies

Use existing Node and Playwright APIs only. No public interface, dependency, database, or deployment
change is required. Chromium must be installed for runtime validation. A temporary browser cache and
the existing workspace dependencies can support the isolated checkout without changing the main checkout.

## Acceptance Criteria

- All existing privacy scenarios and the new slow setup scenario pass.
- Restoring `test.setTimeout(1_000)` makes the slow setup scenario fail.
- Removing the login fixture's timeout suspension makes the timeout guard fail.
- The intended final diff preserves the privileged fixture and exact artifact assertions.
- Focused lint, plan parsing, and Markdown prose validation pass.

## Validation

Run these commands from the implementation checkout. Runtime checks use an installed Chromium browser;
the local isolated cache is `/tmp/lef-playwright-browsers`.

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-playwright-browsers corepack pnpm --filter @tuposoft/lead-email-finder-web test:privileged-artifacts
PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-playwright-browsers node --test --test-name-pattern=runner-timeout-slow-setup scripts/testing/browser-fixture-artifacts.spec.mjs
corepack pnpm exec eslint scripts/testing/browser-fixture-artifacts.spec.mjs
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- execplan-repository-fixture --runInBand
git diff --check
```

Use the filtered runtime command for both temporary mutations described in Plan of Work. Each must
exit unsuccessfully because of the forbidden artifact assertion. Restore the original fixture and the
corrected test after each mutation. Run the complete guard suite on the final files.

Bruno is not applicable because this change affects test timing without changing HTTP API behavior.

## Idempotence and Recovery

Each scenario creates and removes its own temporary directory. Generated authentication material is
synthetic, and the invalid project name rejects before Docker access. Temporary mutation checks must
restore their exact original file bytes in a `finally` block. Keep the main checkout untouched.

## Artifacts and Notes

The implementation starts from master `38a93415ca1c3fff839592d5826c3302ae7f6634` on
`kk/fix-browser-artifact-timeout`. The original failure is recorded in
[the browser job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34706448555/job/103647027550?pr=595).

## Plan readiness

Ready to implement
