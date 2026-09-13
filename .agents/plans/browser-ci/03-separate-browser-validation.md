# Separate Browser Validation Behind a Stable Required Check

This ExecPlan is a living document maintained according to `.agents/PLANS.md`. It corresponds to one LeadEmailFinder pull request with the proposed title `fix(ci): separate browser suites behind a fail-closed aggregate`.

## Purpose / Big Picture

Browser validation will report artifact guards, mocked browser workflows, and live-stack workflows as separate jobs with their own execution budgets. The privacy guards finish first; the mocked and live suites can then use the two isolated Swarm runner slots independently. A failing or missing group still fails `browser`, and `Validate / validate` keeps the existing required-check identity. A developer can identify and rerun the failed group without repeating every browser suite.

## Progress

- [ ] (2026-09-13) Implement the three worker jobs and preserve every existing browser validation command.
- [ ] (2026-09-13) Add the browser result validator and update workflow structure, execution, prerequisite, and failure fixtures.
- [ ] (2026-09-13) Run focused checks and collect complete selected and no-op GitHub workflow evidence.
- [ ] (2026-09-13) Record measured worker budgets, the results of resource removal, and the delivered outcome.

## Plan dependencies

- `browser-ci/01`
- `browser-ci/02`

## Surprises & Discoveries

The planning checkout is behind the failed run's head and contains unrelated uncommitted runner changes. The pinned workflow at `626d67d7d4f44f2d4d0e74a97991fedba13f0070` includes proxy artifact guards, mocked proxy UI tests, live proxy tests, and `bruno:proxy-registry` that are absent from the local workflow. Preserve the pinned inventory and all additional commands present on the implementation base.

The pinned `scripts/ci/validate-workflow.spec.ts` requires `test:proxy-artifacts` to precede both `test:platform-proxies` and `test:platform-proxies-live`. Artifact validation therefore remains an explicit prerequisite of the other two browser jobs. Three mutually independent jobs would weaken an existing privacy contract.

The workflow parser asserts the complete job inventory and assumes every consumer directly needs only `changes`. Its Node installation test also assumes every job except `images`, `changes`, and `validate` installs dependencies. These assumptions require focused changes for the additional worker jobs and lightweight `browser` aggregate.

## Decision Log

- Decision: Use the exact worker IDs `browser-artifacts`, `browser-ui`, and `browser-live`; keep `browser` as an aggregate and preserve `Validate / validate`. Rationale: stable external checks and explicit ownership of each test group. Date: 2026-09-13. Author: Codex.
- Decision: Run artifact guards before both UI and live workers, then allow those two workers to run concurrently. Rationale: preserve the existing proxy privacy prerequisite and fit the two current Swarm execution slots. Date: 2026-09-13. Author: Codex.
- Decision: Retain the single `changes.outputs.browser` selector and explicit successful no-op jobs. Rationale: this PR separates execution without changing path coverage or accepting skipped validation as success. Date: 2026-09-13. Author: Codex.
- Decision: Repeat frozen dependency installation and Chromium readiness in each worker. Rationale: runner workspaces, Docker daemons, and writable caches are isolated; sharing a checkout, generated credentials, Docker state, or private reports would change that contract. Preserve any merged dependency-cache work and the existing Chromium installer command, which also remains compatible with runner images that already contain Chromium. Date: 2026-09-13. Author: Codex.
- Decision: Keep the artifact scenarios and the live-stack sequence serial inside their respective jobs. Rationale: preserve failure capture assertions and stateful fixture ordering; additional Playwright workers and sharding are outside this PR. Date: 2026-09-13. Author: Codex.
- Decision: Start the three worker jobs with provisional 90-minute budgets and use a 10-minute budget for the lightweight `browser` aggregate. After two complete successful selected runs on the same implementation head, set each worker budget to the observed maximum worker duration plus 50% and five minutes, rounded up to the next five-minute boundary, with a minimum of 15 minutes. Rationale: the original 35-minute serial limit is insufficient, and setup is repeated across workers. A 35-minute final budget requires measured support. Date: 2026-09-13. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`.github/workflows/validate.yml` discovers changed paths once, then runs `repository-policy`, `backend`, `web`, `contract`, `images`, and `browser`. `scripts/ci/select-validation.mjs` exposes one literal boolean string for each consumer. Every consumer currently starts with `if: always()`, rejects unsuccessful discovery or malformed flags, and either performs its selected commands or reports a successful no-op that explicitly says checks were not run. Unknown paths and uncertain discovery select all consumers. Documentation-only changes select repository policy.

`scripts/ci/validation-summary.mjs` accepts exactly `changes`, `repository-policy`, `backend`, `web`, `contract`, `images`, and `browser`, and requires the result of every dependency to equal `success`. The final `validate` job invokes that helper with `VALIDATION_NEEDS_JSON: ${{ toJSON(needs) }}` and must remain unchanged in identity and dependency semantics.

The browser job currently combines three distinct workloads. The artifact guard commands launch deliberately failing child Playwright processes against temporary synthetic pages and assert their logs and files contain no credentials or forbidden artifacts. Their child failure is expected; the outer Node test command must succeed. These guards override `webServer` and do not need a built application or live services.

The mocked browser commands use the Vite preview server on port 4173 and need `apps/web/dist`. Plan `browser-ci/02` provides `test:e2e:prebuilt`, `test:a11y:prebuilt`, and `test:visual:prebuilt`, retaining the current selectors while allowing CI to build the preview application once. The dedicated mocked invitation, service-client, organization, credit, and proxy commands already use their own privacy-aware Playwright configurations.

The live workload includes gateway container tests and the disposable Compose application. Root `test:gateway` runs `scripts/frontend/gateway.test.mjs` and `scripts/frontend/checkout-config.test.mjs`, and requires the locally tagged `lead-email-finder-web:frontend-06` image. It is different from the web package's `test:gateway` alias. `dev:reset` provisions the local application, Keycloak, PostgreSQL, Redis, and object storage and seeds disposable fixtures. Subsequent browser and Bruno commands share that stack on the same runner. `browser-fixtures:bootstrap` provisions MFA-aware identities before privileged live tests. The later SMTP overlay provides controlled DNS and SMTP behavior for verification tests. `API_START_COMMAND: pnpm exec nest start` suppresses watch mode for both stack starts.

All current jobs use `[self-hosted, swarm, ubuntu-22, docker-isolated]` and the workflow has only `contents: read`. Each runner uses its own Docker daemon. Fixed Compose names and ports are safe only within that isolation. There are two Swarm worker slots, and other validation jobs compete for them; the split does not imply that all groups begin immediately or that overall wall-clock time falls by a fixed factor.

## Scope and Non-Goals

Change `.github/workflows/validate.yml`, add the small result validator `scripts/ci/browser-summary.mjs`, extend `scripts/ci/validate-workflow.spec.ts`, and update this plan with execution evidence. Keep `scripts/ci/validation-summary.mjs`, `scripts/ci/select-validation.mjs`, `scripts/ci/select-validation.spec.ts`, and `scripts/ci/validation-fixtures.json` behavior unchanged; their existing fixtures remain required validation.

The PR changes CI execution wiring only. It does not change HTTP APIs, test selectors, assertions, retries, privacy suppression, application architecture, Playwright configurations, branch-protection settings, runner labels, runner resources, cache mechanisms, deployment, or database schemas. Do not merge unrelated local runner work into this PR. If the dependency-cache work from PR #597 has merged, preserve its adopted setup when moving the worker steps instead of restoring an older installation sequence.

## Plan of Work

Begin from the current PR/master history in an isolated worktree, including completed dependencies. Compare its browser steps with the pinned failed-run inventory below and reconcile any newer checks before editing. Follow root `AGENTS.md` to find and assign this plan's synced issue and move its Project 9 status to `In Progress` when implementation begins. The one pull request links that issue with a closing keyword and uses the same conventional title as its commit.

Replace the serial workload with three explicit worker jobs. `browser-artifacts` needs only `changes`. `browser-ui` and `browser-live` each need `[changes, browser-artifacts]`. All three use `if: always()`. Their first step retains the current successful-discovery and literal-boolean guard. The two dependent workers then execute an unconditional shell prerequisite check using `BROWSER_ARTIFACTS_RESULT: ${{ needs.browser-artifacts.result }}` and require that value to be exactly `success`. A failed, canceled, skipped, missing, or malformed artifact result therefore fails the worker before installation or tests. Each worker retains an explicit `browser=false` no-op step; it reports that checks were not run.

Every heavy worker step retains the selection condition `needs.changes.outputs.browser == 'true'` and the default successful-prior-steps requirement. Preserve `actions/checkout@v4` with `fetch-depth: 0`, `actions/setup-node@v4` with Node 24, Corepack enablement, frozen workspace installation, and the exact `corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium` command in all three selected workers. Do not add `continue-on-error` or job-level conditions that turn failed prerequisites into skipped success.

Place the following commands in `browser-artifacts`, in this order, after Chromium readiness. Run them as separate named steps, preserving the outer commands and their full assertion coverage:

```bash
corepack pnpm --filter @tuposoft/lead-email-finder-web test:privileged-artifacts
corepack pnpm --filter @tuposoft/lead-email-finder-web test:invitation-artifacts
corepack pnpm --filter @tuposoft/lead-email-finder-web test:verification-artifacts
corepack pnpm --filter @tuposoft/lead-email-finder-web test:service-client-artifacts
corepack pnpm --filter @tuposoft/lead-email-finder-web test:proxy-artifacts
```

Place the following commands in `browser-ui`, in this order. Build once before any preview consumer and preserve the existing selectors through the prebuilt commands from `browser-ci/02`:

```bash
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt
corepack pnpm --filter @tuposoft/lead-email-finder-web test:service-clients
corepack pnpm --filter @tuposoft/lead-email-finder-web test:invitations
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-organizations
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies
corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y:prebuilt
corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual:prebuilt
```

Place the following commands in `browser-live`, retaining separate named steps and the complete current order. The image and gateway tests stay on the same runner as the stack; the dedicated host preview build is unnecessary for this group. Preserve `API_START_COMMAND: pnpm exec nest start` at job scope.

```bash
docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .
corepack pnpm test:gateway
corepack pnpm dev:reset -- --confirm-project=LEF
corepack pnpm test:web-live
corepack pnpm bruno:bff-sessions
corepack pnpm --filter @tuposoft/lead-email-finder-web browser-fixtures:bootstrap
corepack pnpm bruno:organization-onboarding
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-organizations-live
corepack pnpm bruno:platform-credits
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits-live
corepack pnpm bruno:proxy-registry
corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies-live
corepack pnpm --filter @tuposoft/lead-email-finder-web test:team-live
corepack pnpm bruno:service-client-rejections
corepack pnpm --filter @tuposoft/lead-email-finder-web test:service-clients-live
```

Keep the existing SMTP attachment as one step after the service-client lifecycle. It performs `docker compose -f docker/compose.yaml down`, then `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d`, finds the `smtp-dev-proxy-bootstrap` container, requires a nonempty ID, waits at most 120 seconds with `timeout 120s docker wait`, and requires exit status zero. Run these remaining steps only after that attachment succeeds:

```bash
corepack pnpm bruno:async-verification
corepack pnpm --filter @tuposoft/lead-email-finder-web test:verification-live
corepack pnpm bruno:batch-verification
corepack pnpm --filter @tuposoft/lead-email-finder-web test:batch-verification-live
```

Give the selected step that checks out `browser-live` an ID such as `browser-live-checkout`. Preserve its final health and scoped cleanup commands with `always()`, the selected flag, and `steps.browser-live-checkout.outcome == 'success'`. The condition on checkout success prevents resource removal from running against a stale checkout when a prerequisite failed before setup. After checkout succeeds, both final steps still execute following a later install, stack, test, or health-report failure. The health command remains `docker compose -f docker/compose.yaml ps`; the resource removal command remains `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans`. Bound each of those steps to five minutes. Do not promise that resource removal runs after a forced job timeout or runner loss; the isolated runner teardown is the final fallback. Neither other worker starts the Compose stack.

Turn `browser` into a lightweight `if: always()` job with exactly `[changes, browser-artifacts, browser-ui, browser-live]` as direct dependencies, the existing isolated runner labels, checkout, Node 24, and one invocation of `node scripts/ci/browser-summary.mjs`. The script reads `BROWSER_NEEDS_JSON: ${{ toJSON(needs) }}`. It accepts only an object with exactly those four dependency keys, an object for each dependency, `result: 'success'` for every dependency, and an object `changes.outputs` with a literal `browser` value of `'true'` or `'false'`. Other change outputs are allowed because discovery also serves the other consumers. Reject malformed JSON, nulls, arrays, and missing or extra dependency keys. Also reject malformed result shapes, unsuccessful discovery, and any worker result other than success. Return exit status 1 with only dependency IDs and status diagnostics. On selected success print group success; on false selection say `browser: selected=false; checks were not run.` Do not infer success from selection or accept `skipped` workers.

Keep `validate` depending on the existing six consumers plus `changes`. It receives the success or failure of the new `browser` aggregate through the existing helper. It must not directly add the three browser workers to its needs because that would change the helper's exact dependency contract. Workflow-wide cancellation may leave aggregates canceled or unrun; the requirement is that it cannot produce a successful required result from that state.

Update `scripts/ci/validate-workflow.spec.ts` by separating logical consumer flags, executable worker jobs, and aggregate jobs. Preserve the strict YAML parser, exact expanded inventory, runner-label checks, minimum permissions, and prohibition on error suppression. Add `timeout-minutes` and step timeout support to the local test types and verify declared budgets are positive integers. Replace the partial browser `preservedCommands` subset with a complete per-worker inventory, including all five artifact commands, all mocked workflows, every Bruno command, every live browser command, the SMTP guard, and cleanup. Compare both presence and exact single ownership of test commands so a future move cannot drop or duplicate a suite. Preserve duplicate setup commands only where each isolated worker needs them.

Express same-runner prerequisites for the web image before gateway tests; Chromium before all browser-dependent guards/tests; the one UI build before every preview consumer; reset and bootstrap before their live consumers; and SMTP bootstrap before verification consumers. Replace only the proxy guard's old single-job order assertion with an explicit successful `browser-artifacts` dependency and runtime prerequisite check on both UI/live jobs. Keep existing unrelated backend, architecture, policy, discovery, and final-aggregate tests.

Exercise the new result script as a subprocess from the existing workflow spec, following `runSummary`. Include true/false success cases and each dependency's failure, cancellation, skipped, pending, and empty result. Reject missing or unexpected keys, invalid JSON and shapes, and malformed discovery flags. Add a composed fixture demonstrating that a rejected browser result also makes the unchanged final validation helper fail. Execute the workers' discovery and artifact-result guards with Bash fixtures to verify failure occurs before selected work. Cover the changed conditions on health reporting and resource removal structurally for checkout success, no-op, and failed prerequisite paths.

Use the baseline from `browser-ci/01` to compare all available suite counts and assess likely group duration; label any unrun baseline group as unmeasured. Then measure two complete selected runs of this split on the same head. Record each worker's setup, tests, cleanup, total execution, and queue delay separately, together with runner identity and overlap. Apply the budget rule in the Decision Log using successful complete execution durations; a timeout is a censored measurement and cannot justify a smaller budget. The prerequisite results and unchanged test selectors must be preserved when updating the budgets. Record any remaining infrastructure bottleneck without expanding this PR into runner capacity or concurrency tuning.

## Interfaces and Dependencies

The new CI interface consists of three job IDs and `BROWSER_NEEDS_JSON`, an internal JSON environment value consumed by `browser-summary.mjs`. The externally required `browser` and `Validate / validate` checks, discovery selector names, repository events, and permissions remain stable. `browser-ci/02` supplies the three prebuilt script names used above. The new helper has one responsibility, validating browser dependency results, and uses the Node standard library without adding a package or creating a generic CI abstraction.

Swarm worker isolation is a prerequisite already provided by the current runner labels. Runner-image preparation can improve Chromium setup independently, but this plan still uses the existing explicit installation command and adds no label or image-adoption requirement. The two available worker slots bound actual concurrency. Duplicate frozen setup may increase total runner minutes even if it reduces the longest browser job.

## Acceptance Criteria

1. A selected workflow runs the full pinned browser inventory plus any newer required checks, with each test command owned by exactly one group. The original suite selectors, assertions, privacy controls, retries, and command arguments remain unchanged except for the prebuilt entry points established by `browser-ci/02`.
2. `browser-artifacts` completes successfully before either UI or live tests execute. A failure or canceled artifact group causes both dependent jobs to fail their prerequisite check before checkout/install/test work, and neither required aggregate succeeds.
3. With successful discovery and `browser=false`, all three workers succeed through explicit no-ops, perform no dependency install, browser install, build, stack startup, or cleanup, and `browser` reports that checks were not run. Failed discovery or a malformed selection never becomes a no-op success.
4. The `browser` helper rejects every malformed input or unsuccessful dependency case covered by the fixtures. The unchanged final aggregate rejects the failed browser result, and the stable `Validate / validate` identity and exact dependency list remain intact.
5. The UI worker builds its preview application exactly once before its consumers. The artifact worker needs no application build or live stack. The live worker builds its own gateway image, provisions its own fixtures, and runs all Bruno and browser workflows on that same isolated runner in the required order.
6. Selected live execution attempts bounded health reporting and scoped stack cleanup after the checkout step succeeds, including after a failing test. No-op or early prerequisite failures do not issue Docker cleanup. A fresh rerun can provision the complete stack again without sharing mutable state with another worker.
7. The workflow keeps the current runner labels, `contents: read`, Node 24, frozen installs, path-selection contract, two-worker Playwright default, and all unrelated validation commands. Workflow contract, selector, aggregate, and repository-plan fixtures pass.
8. Two complete selected runs on the same split-workflow head pass every group and both aggregates. Record suite counts, durations, queue delay, and cleanup results; each final timeout follows the documented measured-budget rule. After changing only the budgets, let normal PR validation verify the final commit; do not restart the two-run calibration merely because the budget edit changes the SHA. Report overall wall-clock change separately from worker execution time and do not claim a 35-minute outcome without evidence.

## Validation

From the implementation worktree, run these focused static and executable workflow checks:

```bash
corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
node --check scripts/ci/browser-summary.mjs
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts scripts/ci/browser-summary.mjs
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- .agents/plans/browser-ci/03-separate-browser-validation.md
```

Use the repository's current `actionlint` configuration and installed executable. If unavailable, report that limitation separately from the YAML parser and executable tests. Adjust the documentation command to the final plan filename if necessary. If the road map README changes, include it in the same Harper command. Do not claim container or live checks from the static suite.

On the PR workflow, verify a selected run executes the command inventory above and compare suite counts with every available prerequisite result and the preserved source inventory for previously unrun suites. Repeat on the same head to provide the two measurements required for the final budgets. For a no-op runtime case, use a documentation-only comparison fixture through the selector and the executable worker guards. Where a documentation-only PR workflow is available, verify all three worker no-op results and the stable required aggregates there too. Do not create an unrelated PR solely to obtain that evidence.

Bruno: not applicable — CI orchestration changes without changing HTTP behavior or collection content. The complete selected `browser-live` run is the runtime verification of existing Bruno collections: `bruno:bff-sessions`, `bruno:organization-onboarding`, `bruno:platform-credits`, `bruno:proxy-registry`, `bruno:service-client-rejections`, `bruno:async-verification`, and `bruno:batch-verification`. Retain their existing repeatable collection runners and fixture cleanup; no HTTP behavior changes require new Bruno requests. If any cannot execute, report that collection and reason as unverified. Local execution of reset and live commands is permitted only against a disposable, isolated Docker daemon owned by this worktree; the normal developer stack is not a substitute for CI evidence.

Validate failure propagation with the Bash and Node fixtures, including a failed artifact prerequisite and each failed, canceled, or skipped worker result. Do not commit deliberately failing workflow changes or relax a guard to force a green run. Review the final diff for single-purpose helper design and unrelated modifications.

## Idempotence and Recovery

Each selected worker checks out the same workflow head, installs from the lockfile, and creates its own disposable resources. Artifact fixtures and reporters retain their existing temporary-file cleanup. No job uploads or restores `.dev`, authentication state, private browser reports, or Docker volumes. A failed UI job can be rerun independently after successful guards. A failed live job reruns reset, fixture bootstrap, and its complete serial workflow; it does not reuse another worker's stack.

Scoped cleanup remains limited to the live worker's isolated Docker daemon and current checkout. Forced timeout or worker loss may bypass final steps; use the runner's existing teardown path and rerun on a fresh worker. Do not run `dev:reset` on the main developer daemon to recover CI. Roll back the workflow, helper, and matching tests together if the new dependency behavior is incorrect, retaining the measured serial budget from the prerequisite plan and the stable final check name.

## Artifacts and Notes

Record the implementation base SHA, both successful selected run URLs, each job's conclusions and timing, any genuine no-op run, focused command results, and the computed worker timeout values here during implementation. Planning inspected the failed run's source at `626d67d7d4f44f2d4d0e74a97991fedba13f0070`; it did not execute these planned checks or change a workflow.

GitHub's [job dependency documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds) describes dependency ordering and `always()`. Its [job condition documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions) explains skipped required jobs, which is why explicit successful no-ops and aggregate result validation remain part of the contract.

## Plan readiness

Ready to implement
