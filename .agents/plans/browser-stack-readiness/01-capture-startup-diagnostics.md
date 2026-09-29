# Preserve Safe Diagnostics When the Browser Stack Cannot Start

This ExecPlan is a living document maintained according to `.agents/PLANS.md`. It describes one implementation pull request with the proposed conventional title `fix(ci): preserve safe stack startup diagnostics`.

## Purpose / Big Picture

After a disposable browser stack reset fails, its Actions log will retain bounded health, restart, memory, and startup-event evidence before cleanup removes the containers. A developer can distinguish missing services, failed probes, restarts, and Docker-reported memory termination without exposing credentials or treating a readiness timeout as evidence that establishes a particular cause.

## Progress

- [x] (2026-09-29) Implement the bounded diagnostic collector and synthetic failure coverage.
- [x] (2026-09-29) Connect collection after reset failure to the `browser-live` worker; verify resource removal declarations and failure propagation with local fixtures.
- [ ] (2026-09-29) Complete focused validation and record the resulting pull request and runtime evidence.

## Plan dependencies

None.

## Surprises & Discoveries

- The current workflow has separate browser workers and uses the `tuposoft-ci` runner. Only `browser-live` owns the reset and cleanup, so collection belongs there. The older runner labels in this plan predate the current base.
- Docker sends container error logs through the Docker command's standard error stream. Successful log reads must count both streams privately, while failed command output remains discarded.
- A local read-only invocation found no `lef` containers in the selected Docker context and returned eight `missing` records. This checks CLI output, not owned service metadata or a failed Actions reset.
- The package script invocation `corepack pnpm test -- ... --runInBand` passes an argument separator through to Jest. Use `corepack pnpm exec jest ... --runInBand` to apply the serial execution flag.

## Decision Log

- Decision: Retain strict JSON in the existing Actions log without uploading raw logs or adding an artifact store. Rationale: Docker and authentication output can contain secrets; closed fields preserve useful evidence without copying those values. Date: 2026-09-14. Author: Codex.
- Decision: Collect immediately after reset failure with a 45-second total budget. Rationale: retain startup state before cleanup while preserving the reset failure and bounding teardown delays. Date: 2026-09-14. Author: Codex.
- Decision: Use a dedicated inspection projection that accepts stopped containers. Rationale: `scripts/testing/development-stack.mjs` requires running services and loads credentials, so its discovery entry point cannot diagnose a service that failed to start. Reuse its ownership invariants without changing its contract. Date: 2026-09-14. Author: Codex.
- Decision: Preserve the current `tuposoft-ci` runner and browser worker split. Rationale: this task changes only diagnostics; restoring the plan's older runner labels would undo unrelated merged work. Date: 2026-09-29. Author: Codex.
- Decision: Reserve 250 milliseconds of the global budget for summary emission. Rationale: commands must stop before the 45-second limit while still leaving time to serialize the bounded output. Date: 2026-09-29. Author: Codex.
- Decision: Share the capture limit across standard output and standard error. Rationale: Node applies `maxBuffer` to each stream separately, so a shared byte counter terminates commands that exceed the combined allowance. Date: 2026-09-29. Author: Codex.

## Outcomes & Retrospective

Implemented the read-only collector, strict diagnostic projection, bounded Docker adapter, and advisory failure-only step in `browser-live`. Local fixtures preserve the original reset and aggregate failures and the existing resource removal commands. The implementation adds no dependencies or HTTP behavior. Review found no material SOLID trade-off: pure projection, command execution, and collection orchestration remain separate functions. Validation and PR publication are being finalized; collection from an owned live stack and a naturally failing Actions reset remain unverified.

## Context and Orientation

In [PR #595](https://github.com/TupoSoft/LeadEmailFinder/pull/595), [run 34782151912](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912) at head `c6d444f` failed in the [browser job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34782151912/job/103812948004). The reset reported `Timed out waiting for lef-keycloak-1 to become healthy (last status: starting)`. The later service listing showed the API unhealthy. No retained startup logs or health-probe details establish why either service remained unready. The aggregate `validate` failure followed the browser failure.

`.github/workflows/validate.yml` runs `corepack pnpm dev:reset -- --confirm-project=LEF` before genuine browser sessions and Bruno collections. Its final steps print Compose service status and tear down the stack. `docker/scripts/dev-reset.sh` validates the fixed `lef` project, ownership labels, volumes, and default ports before recreating services. The health checks are defined in `docker/compose.yaml` and the included `docker/infra.yaml`.

`scripts/testing/dev-reset.test.mjs` supplies fake Docker commands in temporary checkouts. `scripts/ci/validate-workflow.spec.ts` parses workflow YAML and checks command ownership and ordering. New `scripts/testing/*.test.mjs` files join the existing `test:oidc-runners` command automatically. `scripts/bruno/failure-diagnostic.mjs` demonstrates the closed-field diagnostic approach, but its Bruno-specific schema is not a general Docker adapter.

The secret restrictions in `apps/web/tests/README.md`, `docs/platform-credits.md`, and `docs/privacy/email-verification-processing-contract.md` remain authoritative. Never print or attach authentication output, addresses, cookies, tokens, enrollment keys, request data, or provider error text. Marker counts are diagnostic hints, not a proven root cause.

## Scope and Non-Goals

Change only startup diagnostics, workflow integration, focused tests, and explanatory CI documentation. Add no endpoint, response, business-module, provider, browser assertion, or schema change. `browser-stack-readiness/02` owns readiness budgets. Preserve the current `tuposoft-ci` runner, job isolation, existing health requirements, confirmation, ownership checks, and cleanup commands. Do not capture unrelated containers, whole Docker inspection objects, environment variables, secret files, arbitrary command output, or authentication artifacts.

## Plan of Work

Create `scripts/testing/dev-stack-diagnostics.mjs` with a pure projection layer and a small Docker command adapter. Resolve the checkout from the script location and always target the fixed `lef` project. Visit `keycloak` and `api` first, then `keycloak-postgres`, `postgres`, `redis`, `garage`, `web`, and `bullboard`. For each service, discover all matching IDs through exact project and service label filters. Require exactly one valid ID; otherwise report `missing` or `ambiguous`. Inspect only an explicit formatted projection of ownership labels, state, restart count, and health metadata. Verify the exact project and service labels. The working-directory label must equal the current checkout path or its `docker` directory; the configuration-file label must equal the full path to `docker/compose.yaml` in that checkout. Reject foreign ownership before reading any logs. A disappearing container produces `unavailable`; never fall back to another project.

Project state into the closed schema below. Include only the latest five health-probe start/end timestamps and exit codes, never their `Output`, health command, or Docker error text. Convert valid timestamps to numeric epoch milliseconds and discard invalid values. Privately read at most 200 recent log lines for `keycloak` and `api`, bounded to 65,536 bytes per command. Count lines containing the exact markers `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `OutOfMemoryError`, `Unable to connect to the database`, and `Failed to start server`. Map these respectively to the static labels `connection-refused`, `connection-timeout`, `name-resolution`, `memory-error`, `database-retry`, and `startup-failed`. One line may increment several counters. Retain only those counters and the total sampled line count; discard every raw line and matching-line suffix. Zero means no marker was observed in the bounded sample, not that the condition was absent.

Use Node's child-process timeout and buffer limits, with a 5-second maximum per command and a 45-second monotonic deadline for the complete collection. Clip each command timeout to the remaining global budget. Kill timed-out children, discard partial untrusted output, and report the closed reason `timeout`, `output-limit`, `command-failed`, or `invalid-data`. Reserve time to emit the summary. Mark remaining services `unavailable` with reason `timeout`; require fixtures to prove Keycloak and API take priority when earlier commands approach the global deadline. Emit at most 32,768 bytes of strict JSON on standard output; never forward raw standard error, exception messages, or stack traces to either stream. Store no intermediate files. Accept a narrow injected command adapter and clock so fixtures can test projection and deadlines without Docker.

Give the existing reset step the ID `dev-reset`. Immediately afterward, add a step with `if: always() && needs.changes.outputs.browser == 'true' && steps.dev-reset.outcome == 'failure'`, `continue-on-error: true`, and `timeout-minutes: 1`. Run `node scripts/testing/dev-stack-diagnostics.mjs`. Leave the reset step failing normally and retain final service reporting and unconditional cleanup. Do not collect after reset success, cancellation without reset failure, discovery failure, or a skipped browser consumer. Document the sanitized output contract and invocation in root `README.md`.

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
- Focused collector, reset, workflow, and prose checks pass. Runner labels, isolation, ownership protections, and unconditional cleanup remain unchanged.

## Validation

Run from the implementation checkout with Node 24 and installed workspace dependencies:

```sh
node --check scripts/testing/dev-stack-diagnostics.mjs
node --test scripts/testing/dev-stack-diagnostics.test.mjs scripts/testing/dev-reset.test.mjs
corepack pnpm exec eslint scripts/testing/dev-stack-diagnostics.mjs scripts/testing/dev-stack-diagnostics.test.mjs scripts/ci/validate-workflow.spec.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm exec jest validate-workflow execplan-repository-fixture --runInBand
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- README.md .agents/plans/browser-stack-readiness/01-capture-startup-diagnostics.md
git diff --check
```

The Node test command exercises the real CLI against fake Docker processes, including poisoned output and an enforced subprocess timeout; it creates no live stack. When Docker CLI is installed, a temporary mock daemon also exercises the actual inspection template, including secret exclusion, five-probe retention, and services without health checks. That template check skips when Docker CLI is absent. The workflow suite proves structural failure and cleanup contracts, not GitHub's runtime expression evaluation.

When an owned disposable stack is already available, run `node scripts/testing/dev-stack-diagnostics.mjs` as a read-only runtime smoke check and record whether service metadata was collected. Do not break a shared stack to manufacture failure evidence. A later naturally failing CI reset must show the summary before cleanup; otherwise record that this failure path in Actions remains unverified. The companion readiness plan owns rerunning browser validation. Bruno: not applicable because HTTP behavior does not change; existing collections remain unchanged.

## Idempotence and Recovery

Collection only reads Docker state and emits a summary. Repetition writes no local state and changes no containers or volumes. Failure or interruption cannot replace the reset failure or disable cleanup. Retry collection if Docker recovers; rerun the reset only under its existing explicit project confirmation and checkout ownership rules. Preserve unrelated changes. No migration, data reset, or reseeding is introduced by this plan.

## Artifacts and Notes

The linked PR/run evidence motivates coverage but does not prove resource exhaustion or a configuration defect. Implementation started from `6fad8cd9e4dae23881f018add5018787671f6c3d`, the current `origin/master`, on `kk/625-safe-stack-startup-diagnostics`. Issue #625 is assigned to the requesting user and marked In Progress in Project 9. The implementation retains the current `tuposoft-ci` runner. This plan has no unresolved product choice or dependency on reproducing a live failure.

The combined workflow and repository plan fixture suites passed: 234 tests. The collector suite passed all 20 tests, including the real Docker 29.7.2 CLI against a mock daemon, with no skipped tests. The existing reset suite passed all 11 tests. Collector syntax and scoped ESLint passed. The official actionlint 1.7.12 archive was downloaded to `/tmp/lef-625-actionlint`, verified against its published checksum, and used to validate `.github/workflows/validate.yml` successfully. `corepack pnpm docs:lint -- README.md .agents/plans/browser-stack-readiness/01-capture-startup-diagnostics.md` passed both files, and `git diff --check` passed. Hosted Actions failure-path execution remains unverified. The resulting PR will be linked here after publication.

## Plan readiness

Ready to implement
