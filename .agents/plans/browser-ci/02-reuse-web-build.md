# Reuse One Web Build Across Browser Suites

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Build the static web application once before a job's browser suites and reuse that output. Keep existing local
commands convenient: invoking a normal suite command still builds first. This is one LeadEmailFinder PR titled
`ci(browser): reuse the web build across suites`.

## Progress

- [ ] (2026-09-13) Add scripts that use an existing build and compose the standalone scripts from them.
- [ ] (2026-09-13) Build once in the browser job and update command and ordering contracts.
- [ ] (2026-09-13) Validate unchanged test selection and record CI results and build counts.

## Plan dependencies

- `browser-ci/01`

## Surprises & Discoveries

- `test:e2e`, `test:a11y`, and `test:visual` each invoke `pnpm build`, which runs `tsc -b && vite build`.
- Mocked invitation, service-client, platform-organization, platform-credit, and proxy suites start a preview
  server on port 4173 and already rely on a previous suite having built `apps/web/dist`.
- Building the Docker web image does not populate the host workspace's `apps/web/dist`.

## Decision Log

- Decision: Add explicit `:prebuilt` scripts and use them in CI after an explicit build.
  Rationale: Local commands preserve their behavior without hidden environment switches. Each suite's selectors
  have one owner, and CI has a visible build prerequisite.
  Date/Author: 2026-09-13, Codex planning.
- Decision: Keep each suite's existing preview-server lifecycle and configuration.
  Rationale: Sharing a long-lived server or combining reporters would change isolation and privacy behavior.
  Date/Author: 2026-09-13, Codex planning.

## Outcomes & Retrospective

Not started. No scripts or workflows have been changed for this plan.

## Context and Orientation

The baseline is PR #595 head `626d67d7d4f44f2d4d0e74a97991fedba13f0070`. The older local checkout
must not define the implementation's complete test inventory. `apps/web/package.json` owns the three scripts.
`apps/web/playwright.config.ts` runs Chromium at desktop and narrow viewports and starts
`pnpm preview --host 127.0.0.1 --port 4173`. Sensitive configurations keep their own reporters, artifact
restrictions, and one-worker execution.

`.github/workflows/validate.yml` currently reaches the first preview consumer through `test:e2e` and later calls
the other suites. `scripts/ci/validate-workflow.spec.ts` enforces same-job build prerequisites and command order.
The later workflow split must carry the explicit workspace build into the UI worker.

## Scope and Non-Goals

Change `apps/web/package.json`, the browser workflow commands, focused contracts in
`scripts/ci/validate-workflow.spec.ts`, and this plan's evidence. Do not change UI, assertions, snapshots,
Playwright configurations, suite ownership, sensitive reporters, dependencies, Docker builds, `verify:ui`, or
cache configuration. This is build reuse within one job only.

## Plan of Work

Use an isolated implementation checkout with current proxy coverage and any merged cache work from PR #597.
Follow the repository issue and PR workflow for this plan.

Move only the Playwright portion of each existing script into `test:e2e:prebuilt`, `test:a11y:prebuilt`, and
`test:visual:prebuilt`. Preserve the exact selectors and default configuration. Define each public script as
`pnpm build && pnpm <corresponding-prebuilt-script>` so selectors are not duplicated in its wrapper.

Add `corepack pnpm --filter @tuposoft/lead-email-finder-web build` before the first workflow consumer of `dist`.
Replace only the three corresponding CI suite invocations with their prebuilt variants. Keep image construction,
gateway validation, artifact guards, sensitive suites, live setup, and cleanup in their original order. Build
failure must prevent every dependent suite from running.

Update the workflow contract to check the new invocations and build prerequisite. Read package scripts in that
focused suite to verify wrapper composition and unchanged selectors. Include a regression rejecting a missing
or late build prerequisite. Runtime verification must use a fresh CI workspace rather than existing local output.

## Interfaces and Dependencies

The three new package commands require `apps/web/dist`. Existing `test:e2e`, `test:a11y`, and `test:visual` still
build before testing. No environment flag, new dependency, shared filesystem, or artifact upload is introduced.
`browser-ci/01` supplies timing evidence; `browser-ci/03` uses this interface in its UI worker. The prepared Swarm
browser image is not required for these source changes.

## Acceptance Criteria

- The selected job runs the workspace web build exactly once before any consumer of `apps/web/dist`.
  Separate Docker image builds retain their purpose and are excluded from this workspace build count.
- All three standalone commands build first and run the same tests as before.
- The prebuilt variants preserve selectors, projects, reporters, retries, and artifact policies.
- A failed workspace build prevents dependent suites and makes the required validation check fail.
- Package and workflow contracts pass. A selected CI run records the single workspace build and suite results;
  any unavailable runtime result remains explicitly unverified.

## Validation

Run from the implementation checkout after dependency installation:

```sh
corepack pnpm test -- validate-workflow execplan-repository-fixture --runInBand
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/validate.yml
corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt --list
corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y:prebuilt --list
corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual:prebuilt --list
corepack pnpm docs:lint -- .agents/plans/browser-ci/02-reuse-web-build.md
git diff --check
```

Compare those lists with the original scripts' Playwright selectors at the implementation base. Listing does
not execute browsers. In isolated CI, run the build and selected suites, inspect that the three prebuilt commands
produce no additional workspace builds, and verify failure propagation and cleanup. Do not update visual
baselines to conceal a runner difference.

## Idempotence and Recovery

The build regenerates this checkout's disposable `apps/web/dist`. Do not reuse output from another commit. Revert
package and workflow changes together to restore standalone CI invocations. No data reset, migration, provider
change, or application rollback is needed.

## Artifacts and Notes

Record the implementation SHA, test-list comparison, workspace build count, selected run URL, and observed
durations. Fewer build invocations are observable; runtime improvement must be measured.

Bruno: not applicable — package and CI orchestration change without changing HTTP behavior or collections.

## Plan readiness

Ready to implement
