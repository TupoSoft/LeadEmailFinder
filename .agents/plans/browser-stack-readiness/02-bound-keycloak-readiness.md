# Bound Keycloak Readiness Waits During Development Reset

This ExecPlan is a living document maintained according to `.agents/PLANS.md`. It corresponds to one
pull request with the proposed conventional title `fix(dev): bound Keycloak startup readiness waits`.

## Purpose / Big Picture

A disposable reset can tolerate Keycloak becoming healthy after the old two-minute polling allowance,
while an unavailable service still fails within an explicit deadline. Developers can observe successful
provisioning and an authenticated smoke test, or a bounded failure that stops dependent commands.

## Progress

- [ ] (2026-09-14) Make the Keycloak readiness deadline configurable and bound health polling.
- [ ] (2026-09-14) Test delayed readiness, deadline expiry, invalid settings, and reset safety.
- [ ] (2026-09-14) Run focused checks and record a reset result on an isolated Docker daemon.
- [ ] (2026-09-14) Record CI results at the implementation revision and any remaining failures.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Default Keycloak readiness to 300 seconds. Accept `DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS` as a
  decimal integer from 1 through 600; reject explicitly empty or invalid values before reset changes resources.
  Rationale: tolerate slower startup while retaining a finite ceiling. This initial allowance is a proposal
  to validate, not a measured guarantee of readiness. Date/Author: 2026-09-14, Codex planning.
- Decision: Include Docker inspection time in a monotonic elapsed-time budget. Rationale: the existing
  polling counter excludes inspection time, so a stalled Docker command has no deadline. Date/Author: 2026-09-14, Codex planning.
- Decision: Retain other services' 120-second defaults, existing health probes, and the job deadline.
  Rationale: the evidence identifies the polling deadline for Keycloak. Date/Author: 2026-09-14, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`package.json` maps `dev:reset` to `docker/scripts/dev-reset.sh`. The script checks confirmation, the fixed
`LEF` Compose project, ownership, ports, and volume names before recreating disposable resources. After
`docker compose up -d --build`, it waits for infrastructure, provisions Keycloak, waits for the API and web,
refreshes local metadata, seeds fixtures, and runs authenticated smoke tests.

Its `wait_healthy` function defaults to 120 seconds and counts only two-second sleeps, excluding Docker
inspection time. The Keycloak call has no override. `docker/infra.yaml` runs Keycloak 26.7.0 with `start-dev`
and readiness probes on port 9000: a 15-second start period, five-second interval and timeout, and 24 retries.
The reset deadline is separate from those probe settings.

In PR #595, Keycloak started at 00:56:51 UTC on 2026-09-14. Reset exited at 00:59:28 with its sleep allowance
exhausted and Keycloak still `starting`. The final service listing also reported an unhealthy API. Missing
startup logs prevent us from distinguishing slow startup, runner contention, and service configuration errors.

`scripts/testing/dev-reset.test.mjs` executes the shell script in a temporary checkout with fake Docker,
package-manager, and HTTP commands. Its complete scenario reports every service healthy immediately.
`scripts/ci/validate-workflow.spec.ts` checks reset ordering, selection, and cleanup.

## Scope and Non-Goals

Change `docker/scripts/dev-reset.sh`, add `scripts/testing/wait-container-healthy.mjs` and its companion
`scripts/testing/wait-container-healthy.test.mjs`, extend `scripts/testing/dev-reset.test.mjs`, and document
the setting in `docker/README.md`. Maintain this plan's implementation evidence.

Keep service images, health probes, ports, ownership, provisioning order, credentials, application modules,
HTTP APIs, schemas, runner resources, browser assertions, retries, and job deadlines unchanged. Diagnostics
belong to `browser-stack-readiness/01`. Additional waiting does not guarantee recovery from a startup error.

## Plan of Work

Use an isolated checkout with current changes and the approved runner configuration before publishing
Actions execution. Find the synced issue by `browser-stack-readiness/02`, then follow root `AGENTS.md`
for assignment, Project 9 status, and PR linkage. PR #595 or its merged successor supplies runner routing.

Move only health polling into a small Node helper using built-in modules. Keep the shell responsible for
confirmation, ownership, destructive operations, provisioning, and sequence. The helper CLI accepts a
container name and timeout in seconds. A read-only `--validate-timeout <seconds>` mode uses the same parser
so the shell can reject invalid configuration before any Docker operation or fixture deletion.

When the variable is unset, select 300 seconds for Keycloak. An explicitly empty value is invalid. Retain
the shell's `wait_healthy` wrapper with 120 seconds for every other call; only Keycloak receives the override.

Use `performance.now()` for one deadline. Inspect only lifecycle and health status through a Docker format
projection. Each inspection gets at most five seconds or the remaining budget, whichever is smaller.
Force termination of a stalled child on expiry and bound buffered output. Poll at most once every two
seconds, clipping the last sleep to the remaining budget. Recheck the deadline after every inspection.

Only `healthy` before expiry succeeds. Retry `starting`, `unhealthy`, `exited`, `restarting`, missing
containers, and failed or malformed inspections within that same budget. The services use
`restart: unless-stopped`, so an `exited` state can precede recovery. Fail immediately only for `dead`. Emit only the fixed container name, budget, elapsed time, and a normalized status or error
category. Never print raw inspect output or child errors. Preserve nonzero exit propagation so provisioning
and later reset commands cannot execute after infrastructure readiness fails.

Expose a small polling function with injectable clock, sleep, and inspection functions for fast tests.
Keep Docker process handling separate from polling decisions. Test its timeout and output limits with
synthetic executables. Extend the existing reset harness to copy the helper and verify the CLI integration,
default and overridden budgets, early rejection, and dependent-command order.

## Interfaces and Dependencies

The public development command remains `corepack pnpm dev:reset -- --confirm-project=LEF`.
The optional `DEV_RESET_KEYCLOAK_TIMEOUT_SECONDS` defaults to 300; accepted values are 1 through 600
without signs, spaces, leading zeros, fractions, or exponents. Invalid input exits nonzero before any Docker
call or fixture deletion. The helper applies the same validation rule to its internal CLI arguments.

Use the existing Node runtime and built-in process and timing APIs. Add no package or system utility
dependency. The helper owns waiting only; shell orchestration and service health contracts remain authoritative.
Neither the companion plan nor a successful historical CI run is a code prerequisite.

## Acceptance Criteria

1. A synthetic Keycloak sequence that becomes healthy after 120 seconds but before 300 succeeds by default
   and fails with an explicit 120-second override, proving the setting is effective. A transient sequence
   of `exited`, `restarting`, and `healthy` also succeeds before the deadline.
2. Never-ready, missing, malformed, and stalled-inspection cases fail within the configured budget plus
   at most one second of process teardown tolerance. Inspection time and sleeps consume one deadline.
   A healthy response received after expiry cannot turn a timeout into success.
3. Unset configuration selects 300 seconds for Keycloak and 120 for other services. Valid overrides reach
   the helper. Empty, zero, negative, over-limit, and malformed values fail before any Docker call or deletion.
4. Existing confirmation, ownership, volume, and metadata tests pass. Failed infrastructure readiness prevents
   provisioning and seeds; successful readiness preserves their order and authenticated smoke test.
5. An isolated reset reaches healthy infrastructure, completes provisioning, and passes its authenticated
   smoke test. The implementation revision has a recorded selected CI result. Claim full browser recovery
   only when all its live suites and the aggregate succeed; report unrelated failures explicitly.

## Validation

Run after implementing the named helper and tests:

```sh
node --check scripts/testing/wait-container-healthy.mjs
sh -n docker/scripts/dev-reset.sh
node --test scripts/testing/wait-container-healthy.test.mjs scripts/testing/dev-reset.test.mjs
corepack pnpm exec eslint scripts/testing/wait-container-healthy.mjs scripts/testing/wait-container-healthy.test.mjs scripts/testing/dev-reset.test.mjs
corepack pnpm test -- validate-workflow execplan-repository-fixture --runInBand
corepack pnpm docs:lint -- docker/README.md .agents/plans/browser-stack-readiness
git diff --check
```

Use fake time for long polling scenarios; no test should sleep for 120 or 300 real seconds. Removing the
new allowance or resetting the deadline on a retry must fail the relevant test. Use a short real deadline
to prove the process adapter stops a hung synthetic Docker command.

On a disposable Docker daemon owned by the implementation checkout, run:

```sh
API_START_COMMAND='pnpm exec nest start' corepack pnpm dev:reset -- --confirm-project=LEF
```

Record startup durations, health, provisioning, and the smoke result. Inspect the complete selected browser
run at the published implementation revision on the approved pool. Rerun failed jobs only when they refer
to that revision; rerunning the old PR #595 commit cannot validate new code. Retain subsequent live and
Bruno suites and the aggregate, recording failures or skips separately. Leave runtime progress incomplete
when Docker or Actions execution is unavailable.

Bruno: not applicable — readiness orchestration changes no HTTP contract. Existing Bruno suites remain
runtime validation and must be reported as unverified until their selected CI steps actually execute.

## Idempotence and Recovery

Polling and validation do not mutate containers. Reset remains destructive only to its fixed disposable
resources after all ownership checks. Retry a failed CI reset on a fresh isolated runner and preserve scoped
cleanup. Never recover by resetting the normal developer daemon or using a global Docker prune. Revert
the helper, shell integration, tests, and setting documentation together, preserving unrelated changes.

## Artifacts and Notes

Diagnosis used PR head `c6d444f43c5f5667e427b3ecc1b84532e7814a14`; Actions tested merge commit
`9b8acee4aaad9e062837ef39e35199221b03fa1d` into `49aa9442d0355846ea5d760f06d4cb0b1ea35138`.
The [failed browser job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912/job/103812948004)
and [dependent validation failure](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912/job/103824792241)
are historical evidence, not validation of this plan. Record implementation commit IDs, commands, results,
runner identity, and links here when work begins. No runtime checks have executed for this planned change.

## Plan readiness

Ready to implement
