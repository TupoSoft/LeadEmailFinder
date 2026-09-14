# Preserve Safe Diagnostics When the Browser Stack Cannot Start

This ExecPlan is a living document maintained according to `.agents/PLANS.md`. It describes one implementation pull request with the proposed conventional title `fix(ci): preserve safe stack startup diagnostics`.

## Purpose / Big Picture

After a disposable browser stack reset fails, its Actions log will retain bounded health, restart, memory, and startup-event evidence before cleanup removes the containers. A developer can distinguish missing services, failed probes, restarts, and Docker-reported memory termination without exposing credentials or treating a readiness timeout as evidence that establishes a particular cause.

## Progress

- [x] (2026-09-14) Implement the bounded diagnostic collector and synthetic failure coverage.
- [x] (2026-09-14) Connect collection after reset failure to browser validation and verify resource removal and failure propagation with fixtures.
- [x] (2026-09-14) Complete focused validation and record draft PR #628 and the available runtime evidence.
- [x] (2026-09-14) Change the base of PR #628 to master, retain only this plan's changes, and validate integration with the separate browser workers.

## Plan dependencies

None.

## Surprises & Discoveries

- The implementation checkout initially used Node 22 and had no installed dependencies. The bundled Node 24.19.0 runtime and the existing pnpm cache supply focused validation without changing repository dependencies.
- Master at `2ac6ea303e40e78efca92da8baf82d838a337a6d` separates browser artifact, UI, and live validation. Only `browser-live` owns the disposable stack. Its final reporting and cleanup require a successful checkout and retain five-minute limits.
- The sandbox blocked nested child processes in existing reset and workflow fixtures. Those suites passed after an approved run outside the sandbox. No disposable containers owned by this checkout were available for a live smoke check.

## Decision Log

- Decision: Retain strict JSON in the existing Actions log without uploading raw logs or adding an artifact store. Rationale: Docker and authentication output can contain secrets; closed fields preserve useful evidence without copying those values. Date: 2026-09-14. Author: Codex.
- Decision: Collect immediately after reset failure with a 45-second total budget. Rationale: retain startup state before cleanup while preserving the reset failure and bounding teardown delays. Date: 2026-09-14. Author: Codex.
- Decision: Use a dedicated inspection projection that accepts stopped containers. Rationale: `scripts/testing/development-stack.mjs` requires running services and loads credentials, so its discovery entry point cannot diagnose a service that failed to start. Reuse its ownership invariants without changing its contract. Date: 2026-09-14. Author: Codex.
- Decision: Force timed-out Docker children to exit with `SIGKILL` and bound their combined output streams. Rationale: a child can ignore the default termination signal, and successful Docker log output may use either stream. Date: 2026-09-14. Author: Codex.
- Decision: Target master and preserve its existing runner configuration. Rationale: the user explicitly requested only the changes in this plan, which supersedes the road map's earlier choice of a base branch. Replay only the diagnostics implementation; exclude the separate runner migration and frontend wait changes. Date: 2026-09-14. Author: User direction, applied by Codex.
- Decision: Run collection in `browser-live` and retain its checkout guard for final reporting and cleanup. Rationale: the new browser aggregate owns no containers, and failed worker prerequisites must not trigger resource operations. Date: 2026-09-14. Author: Codex.

## Outcomes & Retrospective

The collector preserves safe metadata for stopped and unhealthy services, rejects foreign ownership before reading logs, and emits only bounded event counts from successful log samples. Its Docker adapter and pure projection functions keep process handling separate from the output contract. No material SOLID trade-off or business-module change was needed.

The `browser-live` worker collects immediately after a selected reset fails and preserves the original failure, final reporting, and cleanup. Structural negative controls and a simulated workflow verify those contracts, including cleanup when collection fails. Actions expression evaluation and a naturally failing CI reset remain unverified; the companion readiness plan owns rerunning complete browser validation.

## Context and Orientation

In [PR #595](https://github.com/TupoSoft/LeadEmailFinder/pull/595), [run 34782151912](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912) at head `c6d444f` failed in the [browser job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912/job/103812948004). The reset reported `Timed out waiting for lef-keycloak-1 to become healthy (last status: starting)`. The later service listing showed the API unhealthy. No retained startup logs or health-probe details establish why either service remained unready. The aggregate `validate` failure followed the browser failure.

The `browser-live` worker in `.github/workflows/validate.yml` runs `corepack pnpm dev:reset -- --confirm-project=LEF` before genuine browser sessions and Bruno collections. Its final steps print Compose service status and tear down the stack after a successful checkout, including when a later step fails. The separate `browser` job aggregates all browser worker results. `docker/scripts/dev-reset.sh` validates the fixed `lef` project, ownership labels, volumes, and default ports before recreating services. The health checks are defined in `docker/compose.yaml` and the included `docker/infra.yaml`.

`scripts/testing/dev-reset.test.mjs` supplies fake Docker commands in temporary checkouts. `scripts/ci/validate-workflow.spec.ts` parses workflow YAML and checks command ownership and ordering. New `scripts/testing/*.test.mjs` files join the existing `test:oidc-runners` command automatically. `scripts/bruno/failure-diagnostic.mjs` demonstrates the closed-field diagnostic approach, but its Bruno-specific schema is not a general Docker adapter.

The secret restrictions in `apps/web/tests/README.md`, `docs/platform-credits.md`, and `docs/privacy/email-verification-processing-contract.md` remain authoritative. Never print or attach authentication output, addresses, cookies, tokens, enrollment keys, request data, or provider error text. Marker counts are diagnostic hints, not a proven root cause.

## Scope and Non-Goals

Change only startup diagnostics, workflow integration, focused tests, and explanatory CI documentation. Add no endpoint, response, business-module, provider, browser assertion, or schema change. `browser-stack-readiness/02` owns readiness budgets. Preserve master's existing runner configuration, job isolation, existing health requirements, confirmation, ownership checks, and cleanup commands. Keep runner migration and frontend wait changes outside this PR. Do not capture unrelated containers, whole Docker inspection objects, environment variables, secret files, arbitrary command output, or authentication artifacts.

## Plan of Work

Create `scripts/testing/dev-stack-diagnostics.mjs` with a pure projection layer and a small Docker command adapter. Resolve the checkout from the script location and always target the fixed `lef` project. Visit `keycloak` and `api` first, then `keycloak-postgres`, `postgres`, `redis`, `garage`, `web`, and `bullboard`. For each service, discover all matching IDs through exact project and service label filters. Require exactly one valid ID; otherwise report `missing` or `ambiguous`. Inspect only an explicit formatted projection of ownership labels, state, restart count, and health metadata. Verify the exact project and service labels. The working-directory label must equal the current checkout path or its `docker` directory; the configuration-file label must equal the full path to `docker/compose.yaml` in that checkout. Reject foreign ownership before reading any logs. A disappearing container produces `unavailable`; never fall back to another project.

Project state into the closed schema below. Include only the latest five health-probe start/end timestamps and exit codes, never their `Output`, health command, or Docker error text. Convert valid timestamps to numeric epoch milliseconds and discard invalid values. Privately read at most 200 recent log lines for `keycloak` and `api`, bounded to 65,536 bytes per command. Count lines containing the exact markers `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `OutOfMemoryError`, `Unable to connect to the database`, and `Failed to start server`. Map these respectively to the static labels `connection-refused`, `connection-timeout`, `name-resolution`, `memory-error`, `database-retry`, and `startup-failed`. One line may increment several counters. Retain only those counters and the total sampled line count; discard every raw line and matching-line suffix. Zero means no marker was observed in the bounded sample, not that the condition was absent.

Use Node's child-process timeout and buffer limits, with a 5-second maximum per command and a 45-second monotonic deadline for the complete collection. Clip each command timeout to the remaining global budget. Kill timed-out children, discard partial untrusted output, and report the closed reason `timeout`, `output-limit`, `command-failed`, or `invalid-data`. Reserve time to emit the summary. Mark remaining services `unavailable` with reason `timeout`; require fixtures to prove Keycloak and API take priority when earlier commands approach the global deadline. Emit at most 32,768 bytes of strict JSON on standard output; never forward raw standard error, exception messages, or stack traces to either stream. Store no intermediate files. Accept a narrow injected command adapter and clock so fixtures can test projection and deadlines without Docker.

Give the existing reset step in `browser-live` the ID `dev-reset`. Immediately afterward, add a step with `if: always() && needs.changes.outputs.browser == 'true' && steps.dev-reset.outcome == 'failure'`, `continue-on-error: true`, and `timeout-minutes: 1`. Run `node scripts/testing/dev-stack-diagnostics.mjs`. Leave the reset step failing normally and retain final service reporting and cleanup with their existing checkout guard and five-minute limits. Do not collect after reset success, cancellation without reset failure, discovery failure, or a skipped browser consumer. Document the sanitized output contract and invocation in root `README.md`.

Add `scripts/testing/dev-stack-diagnostics.test.mjs` and extend `scripts/ci/validate-workflow.spec.ts`. Test ownership rejection before reading logs. Additional cases cover stopped containers, process states, probe metadata, absent or ambiguous services, malformed data, command deadlines, excessive output, partial Docker failure, bounded event counts, and redaction. Inject synthetic secrets into labels, probe output, log prefixes and suffixes, environment-like strings, child standard error, and exceptions; assert none reaches any output or artifact. Use fake time for the global deadline and fake child commands for CLI behavior. Verify workflow conditions, ordering, advisory collection, original reset failure, and cleanup after collection fails. Preserve existing reset ownership regressions.

## Interfaces and Dependencies

The CLI is `node scripts/testing/dev-stack-diagnostics.mjs`; it accepts no project, service, output path, or credential arguments. It uses existing Node 24 and Docker and adds no package dependency. Its version-1 JSON envelope contains `schemaVersion`, a `collectionStatus` of `complete` or `partial`, and exactly eight records keyed by the fixed service names.

Each record has a collection result (`collected`, `missing`, `ambiguous`, `foreign`, or `unavailable`), an optional closed failure reason, a Docker state enum (`created`, `running`, `paused`, `restarting`, `removing`, `exited`, `dead`, or `unknown`), and a health enum (`starting`, `healthy`, `unhealthy`, `none`, or `unknown`). Optional fields are boolean `oomKilled` and bounded integers `restartCount`, `exitCode`, and `failingStreak`. Counts range from 0 to 1,000,000; process and probe exit codes range from -1 to 255. Probe arrays have at most five entries with validated times and exit codes. Keycloak/API records may include `startupSample` with at most 200 sampled lines and the six bounded marker counters. Omit invalid optional fields; mark invalid required inspection data `unavailable` with `invalid-data`. Never copy unknown fields, container IDs, labels, paths, URLs, raw strings, or command arguments.

## Acceptance Criteria

- A simulated reset failure retains strict diagnostic JSON before teardown, while reset and aggregate validation remain failed.
- Owned unhealthy or stopped services expose valid health/probe metadata, restart count, and the Docker flag for termination due to insufficient memory when available; unavailable facts remain unknown.
- Foreign or ambiguous services cause no log read. Disappearing containers, malformed data, command failures, and excessive output produce bounded static diagnostics without blocking cleanup.
- Samples of startup logs expose only declared counters. Every injected secret remains absent from all emitted streams and created artifacts.
- Collection respects the 45-second budget, the 5-second child command cap, and the 32,768 bytes output limit. Successful and skipped resets do not execute collection.
- Focused collector, reset, workflow, and prose checks pass. Master's runner labels, isolation, ownership protections, and cleanup after a successful checkout remain unchanged.

## Validation

Run from the implementation checkout with Node 24 and installed workspace dependencies:

```sh
node --check scripts/testing/dev-stack-diagnostics.mjs
node --test scripts/testing/dev-stack-diagnostics.test.mjs scripts/testing/dev-reset.test.mjs
corepack pnpm exec eslint scripts/testing/dev-stack-diagnostics.mjs scripts/testing/dev-stack-diagnostics.test.mjs scripts/ci/validate-workflow.spec.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- validate-workflow execplan-repository-fixture --runInBand
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- README.md .agents/plans/browser-stack-readiness/01-capture-startup-diagnostics.md
git diff --check
```

The Node test command exercises the real CLI against fake Docker processes, including poisoned output and an enforced subprocess timeout; it creates no live stack. The workflow suite proves structural failure and cleanup contracts, not GitHub's runtime expression evaluation.

When an owned disposable stack is already available, run `node scripts/testing/dev-stack-diagnostics.mjs` as a read-only runtime smoke check and record whether service metadata was collected. Do not break a shared stack to manufacture failure evidence. A later naturally failing CI reset must show the summary before cleanup; otherwise record that this failure path in Actions remains unverified. The companion readiness plan owns rerunning browser validation. Bruno: not applicable because HTTP behavior does not change; existing collections remain unchanged.

## Idempotence and Recovery

Collection only reads Docker state and emits a summary. Repetition writes no local state and changes no containers or volumes. Failure or interruption cannot replace the reset failure or disable cleanup. Retry collection if Docker recovers; rerun the reset only under its existing explicit project confirmation and checkout ownership rules. Preserve unrelated changes. No migration, data reset, or reseeding is introduced by this plan.

## Artifacts and Notes

The linked PR/run evidence motivates coverage but does not prove resource exhaustion or a configuration defect. Branch `kk/625-safe-stack-startup-diagnostics` is rebuilt directly on master at `2ac6ea303e40e78efca92da8baf82d838a337a6d`. Its six changed files cover startup diagnostics, focused tests, workflow integration, and documentation. Issue #625 is assigned to the requesting user and its Project 9 status is In Progress.

Delivery: [draft PR #628](https://github.com/TupoSoft/LeadEmailFinder/pull/628), assigned to the requesting user, targets master and includes `Closes #625`. Its title matches the implementation subject, `fix(ci): preserve safe stack startup diagnostics`.

Initial validation used Node 24.19.0. The combined collector and reset command passed 28 tests (17 collector, 11 reset). The collector, its tests, and reset code remain identical after the base change. The syntax check and module architecture gate (nine modules, zero violations) also passed during implementation.

After adapting to master's separate browser workers, `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- validate-workflow select-validation --runInBand` passed 324 tests. The ExecPlan repository fixture, focused ESLint, actionlint 1.7.12, and `git diff --check` passed. The workflow scenarios verify that a reset failure propagates through both the browser and final validation aggregates even when collection fails.

Harper: `corepack pnpm docs:lint -- README.md .agents/plans/browser-stack-readiness/01-capture-startup-diagnostics.md` passed for both changed Markdown files.

The real Docker 29.6.1 client also rendered the inspection template against a synthetic HTTP daemon on a temporary local socket. The smoke check passed: seven input probes produced only the latest five, poisoned output was omitted, and absent health produced `none` with an empty probe list. The command was `node /tmp/issue-625-template-smoke.mjs` using the same Node 24 runtime. This check created no real Docker resources.

Live stack smoke: skipped because checkout ownership discovery found zero containers. No stack was reset or modified. Bruno: not applicable because this change affects diagnostics and CI only, with no HTTP behavior change. No current implementation merge commit, Actions runner, or terminal browser result is claimed. The earlier run serves as motivation only.

## Plan readiness

Ready to implement
