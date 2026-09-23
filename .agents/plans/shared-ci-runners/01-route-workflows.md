# Route Workflows to the Shared Runner Pool

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow LeadEmailFinder jobs to use available capacity in the TupoSoft CI pool. Deliver one LeadEmailFinder pull
request that selects `tuposoft-ci` for validation, plan synchronization, and the reusable build workflow.
Give the development API time to start when live validation restarts it on the laptop runner.

## Progress

- [x] (2026-09-21) Inspect the three workflows and choose a compatible shared workflow input.
- [x] (2026-09-21) Update runner routing, the actionlint allowlist, and focused workflow coverage.
- [x] (2026-09-21) Run focused validation and documentation lint; record the upstream dependency and pull request.
- [x] (2026-09-22) Diagnose the hosted fixture setup failure and increase the API startup grace period to 120 seconds.
- [x] (2026-09-22) Validate the startup change locally: 331 focused tests, merged Compose configuration, and Harper pass.

Hosted validation results are tracked in [PR 733](https://github.com/TupoSoft/LeadEmailFinder/pull/733) and its checks.

## Plan dependencies

None.

## Surprises & Discoveries

The build workflow delegates to `TupoSoft/GitHubActions`, whose current build workflow fixes its own runner labels.
A caller cannot add `runs-on` beside a reusable workflow call. The user selected an optional upstream runner input.

Hosted run `35660380282`, attempt 2, reached the live SMTP fixture setup on the laptop. After the API restarted,
Docker marked it unhealthy after about 31 seconds and stopped fixture setup. Earlier live browser tests passed.
The API compiles during startup, and its health check had a 10-second grace period. Slow startup is a hypothesis;
the workflow retained container status but no API startup logs or health probe output.

## Decision Log

- Decision: Use the existing `tuposoft-ci` label. Rationale: the user requested routing across the PC and laptop
  pools. Date/Author: 2026-09-21, user and Codex.
- Decision: Extend the shared build workflow with an optional `runner` input and preserve its existing default.
  Rationale: preserve reuse and compatibility for other consumers. Date/Author: 2026-09-21, user and Codex.
- Decision: Keep historical plans and infrastructure settings unchanged. Rationale: this task changes active
  LeadEmailFinder workflow routing. Date/Author: 2026-09-21, Codex.
- Decision: Increase only the API health check startup grace from 10 to 120 seconds. Rationale: the user requested
  a longer startup window and a hosted retry. Preserve the probe, interval, timeout, and retry count. A successful
  probe still marks the API healthy immediately. Date/Author: 2026-09-22, user and Codex.

## Outcomes & Retrospective

All three workflow entry points now select the shared pool directly or through the reusable input. Focused
routing checks pass: 316 tests across two suites. Actionlint, ESLint, and `git diff --check` pass. The shared input
is available through merged [shared workflow PR 18](https://github.com/TupoSoft/GitHubActions/pull/18).
The existing plan scheduling fixture has one baseline failure, described below. Hosted validation reached the
laptop; its second attempt passed image builds and the earlier live tests, then failed while attaching SMTP
fixtures because the API was unhealthy.

The API now has a 120-second startup grace period. The 316 workflow tests and 15 Compose fixture and reset tests
pass after this adjustment. The merged Compose configuration and Harper checks also pass. Hosted confirmation
of the startup fix is recorded in PR 733 and its validation checks. No business responsibilities or adapter
boundaries changed.

## Context and Orientation

`.github/workflows/validate.yml` declares eleven jobs. `.github/workflows/sync-execplans.yml` declares one job.
All twelve select `tuposoft-pc-wsl`. `.github/workflows/build.yml` calls the shared build workflow on `master`.
`.github/actionlint.yaml` lists accepted custom runner labels, and `scripts/ci/validate-workflow.spec.ts` checks
runner selection alongside existing workflow contracts.

## Scope and Non-Goals

Change the three active workflow files, the actionlint allowlist, focused routing assertions, this plan, and
the API startup grace period in `docker/compose.yaml`. Keep job commands, dependencies, permissions, triggers,
job timeouts, image publishing behavior, and application contracts unchanged. Runner infrastructure and the
upstream input implementation belong to their own repositories.

## Plan of Work

Replace direct job selections with `tuposoft-ci`, update actionlint, and pass `runner: tuposoft-ci` from the build
caller. Extend existing coverage to check the reusable call separately from direct jobs. Validate locally and
open one LeadEmailFinder pull request linked to its plan issue and the upstream input pull request.

## Interfaces and Dependencies

The external shared workflow gains an optional string input named `runner`. Its default preserves the old runner
labels for callers that omit the input. The LeadEmailFinder call supplies `tuposoft-ci`. The upstream change must
merge before this caller change; PR 18 is now merged. No package dependencies or HTTP interfaces change.

## Acceptance Criteria

- Every direct job in the validation and plan synchronization workflows selects `tuposoft-ci`.
- The reusable build caller passes `runner: tuposoft-ci` and retains its existing permissions and secrets.
- Actionlint accepts the shared runner label, and focused workflow checks pass.
- Existing job commands and trigger behavior are preserved.
- The API startup grace period is 120 seconds, with the existing health probe and ongoing failure detection.
- Hosted `browser-live` validation passes the SMTP fixture setup and completes the remaining verification tests.

## Validation

Run `corepack pnpm exec jest select-validation validate-workflow --runInBand --cacheDirectory=/tmp/lef-shared-ci-jest`.
Run the plan repository fixture separately with
`corepack pnpm exec jest execplan-repository-fixture --runInBand --cacheDirectory=/tmp/lef-shared-ci-jest`.
Run `corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts`.
Run actionlint against all three workflows when available, plus `git diff --check`.
Run `corepack pnpm docs:lint -- .agents/plans/shared-ci-runners`.
For the startup adjustment, run
`node --test docker/smtp-dev/compose-network.test.mjs scripts/testing/dev-reset.test.mjs` and the focused CI
workflow suites above. Validate the merged Compose configuration when Docker Compose is available. Push the
updated commit to PR 733 and inspect the resulting `browser-live` job through completion.
Hosted validation is separate evidence. A successful basic ARC smoke test does not prove the full application
workflow or that both device pools accept the shared label. Bruno is not applicable because no HTTP behavior changes.

## Idempotence and Recovery

The edits are declarative and safe to repeat. Revert the routing commit to restore prior selection. Merge the
upstream compatible input first; reverting this caller does not require reverting that input. Restore
`start_period: 10s` to undo the startup adjustment. CI recreates its own disposable stack for each run.

## Artifacts and Notes

The laptop ARC pool passed its Linux and Docker smoke test in Kubernetes run `35655177296`. Its automatic cleanup
was verified. The PC pool's live shared-label registration and complete application behavior remain unverified.
No business module changes are required, so the SOLID boundaries remain unchanged.

The tracking issue is [732](https://github.com/TupoSoft/LeadEmailFinder/issues/732), assigned to the requesting user.
The Project 9 status update was skipped because the current GitHub token lacks the `project` and `read:project`
scopes. Run `gh auth refresh -s project` to enable that administrative update.

The plan fixture fails its case that expects `mcp-connector/04` to be incomplete. That plan is already complete,
and the fixture helper never makes an omitted dependency incomplete. The same failure reproduces on untouched
base commit `c82957a5f01c662bab5d9f246f3c8df46a2fb1ee`: one failed test and six passed tests. This task leaves the
unrelated scheduling fixture unchanged.

## Plan readiness

Ready to implement
