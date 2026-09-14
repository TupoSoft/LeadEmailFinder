# Run Validation Before Pushing

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Developers can validate the exact committed revisions they are pushing while the self-hosted runner pool is
unreliable. Local validation checks changed files and related tests, explains any broader selection, and skips
checks and Docker setup for an empty comparison. The Git push proceeds only after the selected blocking checks pass. A disposable container and its
private Docker daemon provide the database, image, browser, and development-stack fixtures without modifying the
developer's running application stack. The same validation is available through a package command.

## Progress

- [x] (2026-09-14) Inspect the current workflow, path selection, Husky hooks, and development reset behavior.
- [x] (2026-09-14) Choose exact-commit validation with a private Docker daemon and preserve command ownership.
- [x] (2026-09-14) Check for the synced `local-ci-hooks/01` issue; no existing issue was found.
- [x] (2026-09-14) Implement the push hook, local runner, isolated image, and workflow trigger changes.
- [x] (2026-09-14) Pass 38 local Node tests, 308 existing Jest tests, ESLint, actionlint, and documentation checks.
- [x] (2026-09-14) Pass the real launcher policy smoke test and a nested Docker build and run; record unrun consumers.
- [x] (2026-09-14) Complete independent review and prepare the implementation for one draft pull request.
- [x] (2026-09-14) Preserve Harper as the sole advisory exception; pass all 41 local tests and focused ESLint.
- [x] (2026-09-14) Exercise the real push hook with all consumers selected; record the existing backend test failure and verify fixture removal.
- [x] (2026-09-14) Retire the session-material scanner; pass 41 local tests, 308 focused Jest tests, type checking, ESLint, and actionlint.
- [x] (2026-09-14) Run the normal push hook after removal; diagnose missing `envsubst` and add `gettext-base` to the runner image.
- [x] (2026-09-15) Pass all six consumers through the normal push hook after the runner dependency correction, including every preserved Bruno collection.
- [x] (2026-09-15) Add incremental local selection and explicit full validation while retaining the hosted classifier.
- [x] (2026-09-15) Pass 85 local Node tests, 308 focused Jest tests, and changed-script ESLint; verify scoped database selection and Playwright listing.
- [x] (2026-09-15) Pass incremental backend smoke coverage with 207 tests across two files and web smoke coverage with 59 tests across five files.
- [ ] (2026-09-15) Complete a normal incremental push through the installed hook and record its selected checks and result.

## Plan dependencies

None.

## Surprises & Discoveries

- `docker/scripts/dev-reset.sh` fixes its Compose project to `lef` and removes named application, Keycloak, and
  queue volumes. Running the browser workflow against the host Docker daemon could reset a developer's stack.
- At the start of implementation, this checkout's `validate.yml` contained `ubuntu-latest` runner labels. All
  direct workflow jobs now use the approved `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated` labels.
- The existing `prepare` package script installs Husky hooks. Hook support must work in fresh clones and remain
  available after a dependency install that skipped lifecycle scripts.
- The synced-issue search returned no existing issue for `local-ci-hooks/01` on 2026-09-14. There is no existing
  issue to assign or move on Project 9; normal plan synchronization can create one after the plan reaches `master`.
- Copying the committed snapshot into the container preserves its user ownership. Git initially rejected the
  copied repository as having dubious ownership, which caused the session-material scanner to fail. The runner
  now marks only `/workspace` as safe in Git's system configuration; that ownership fix did not change the scanner.
- Nested Docker requires a separate anonymous volume at `/var/lib/docker`. A real nested image build and container
  run passed after adding that private volume. Container removal also removes the volume.
- Independent review found a cancellation race during container creation. Container removal now waits for creation to
  settle before removing the validation container and its private volume.
- The real push attempt for `ddacb5d` stopped at the reachable-history test in
  `scripts/security/scan-linkedin-session-material.spec.ts`: the expected exit code was 1, but the result was 0.
  The test and scanner were unchanged from `master` revision `2ac6ea3`. Further investigation established that
  the scanner required Git 2.50 or later for its null-separated history output. Git 2.43 emitted line-feed-separated
  output instead, causing the failure. All eight scanner tests passed with Git 2.50 before the scanner was removed.
- After that diagnosis, the user explicitly requested retiring the session-material scanner. Its CLI, focused
  tests, package command, and hosted validation step reused by local pre-push are removed. Earlier scanner results remain
  historical evidence, and approval validation, the architecture gate, and application behavior are preserved.
- The normal push of `28fe5cd` reached the browser-live route ownership and privacy checks before failing at
  `scripts/frontend/checkout-config.test.mjs:132` with `envsubst: not found`. The runner image lacked that command.
  Adding `gettext-base` to `docker/ci-local/Dockerfile` supplies it. The subsequent full retry passed all nine
  gateway tests and every remaining live fixture and preserved Bruno collection.

## Decision Log

- Decision: Run selected validation at `pre-push` and retain the existing `pre-commit` hook.
  Rationale: Database, image, and browser checks are too expensive to repeat for every intermediate commit.
  Date/Author: 2026-09-14, Codex implementing the user's temporary local validation request.
- Decision: Validate each distinct outgoing committed revision in a fresh snapshot, using its remote revision
  as the comparison base when available. Run all consumers when no trustworthy base exists.
  Rationale: Working-tree edits and an unrelated checked-out branch must not change the result for a pushed ref.
  Date/Author: 2026-09-14, Codex. The fallback to all consumers is superseded by the explicit comparison policy
  below on 2026-09-15; committed application snapshots remain required.
- Decision: Run nested Docker inside a disposable privileged Linux container with no host socket mount and no
  published host ports.
  Rationale: Existing fixtures can retain their fixed Compose project, ports, and volume cleanup without touching
  the host's application containers or colliding with another validation run.
  Date/Author: 2026-09-14, Codex.
- Decision: Initially reuse existing workflow commands and path selection. Stop local validation at the first failed
  check other than Harper, the sole advisory exception. Every other check remains blocking even with a hosted
  `continue-on-error: true` setting. Preserve the original blocking failure while still running cleanup and health
  reporting. Preserve each test runner's failure and retry behavior within the selected tests.
  Rationale: The user requested stopping at the first failure, then clarified that Harper must remain advisory.
  Hosted workflow advisory settings remain unchanged.
  Date/Author: 2026-09-14, Codex implementing the user's clarification. Local path selection is superseded by
  incremental planning on 2026-09-15; the failure policy remains unchanged.
- Decision: Make `Validate` manual while preserving manual publishing and automatic ExecPlan synchronization.
  Rationale: Publishing and issue synchronization are external actions, and neither is a local validation check.
  Date/Author: 2026-09-14, Codex.
- Decision: Do not publish synthetic statuses or change GitHub branch rules.
  Rationale: A local hook result does not establish execution of a hosted required check.
  Date/Author: 2026-09-14, Codex.
- Decision: Compile only the workflow actions, conditions, and fields that the local adapter explicitly supports.
  Rationale: Rejecting unsupported changes prevents future workflow features from silently skipping local checks.
  This deliberate restriction requires adapter changes when the workflow adopts a new Actions feature.
  Date/Author: 2026-09-14, Codex.
- Decision: Without a push base, lint all tracked Markdown while preserving the approval checker's existing
  `HEAD^` baseline. Install workspace packages from the frozen lockfile in every fresh validation workspace.
  Rationale: New branches need complete prose coverage, and approval behavior remains aligned with
  the workflow. Reusing a system image must not reuse an earlier workspace's installed dependency state.
  Date/Author: 2026-09-14, Codex. The missing-base behavior is superseded on 2026-09-15: local runs require a
  resolved comparison or explicit `--all`. Fresh dependency installation remains required for checks that run.

- Decision: Retire the session-material scanner, its focused tests, and its executable checks in response to the
  user's explicit removal request. Preserve approval validation and the architecture gate.
  Rationale: The user chose removal after the Git 2.50 dependency was confirmed. This supersedes the earlier
  maintenance inventory's retention decision without changing runtime account-discovery policy.
  Date/Author: 2026-09-14, Codex implementing the user's removal instruction.

- Decision: Add a local planner separate from the hosted classifier. Ordinary backend and web changes run lint
  for existing changed files and related Jest or Vitest tests. Ordinary prose runs changed-file Harper only;
  module source and module README changes also run the architecture gate for cross-module dependency contracts.
  Web source covered by `sourceRoots` in `premium-ui.json` also runs the UI contract audit. Shared stylesheet
  inputs, including style tokens, add design lint.
  Tooling, database, and direct browser test changes select their relevant checks and required fixtures. Empty
  comparisons run no checks. Shared configuration, dependencies, and dependency graph changes may select broader
  checks, with the reason printed. Unknown inputs require a new local rule or explicit `--all`.
  Rationale: The user requested changed-file validation without automatically running complete builds, images,
  and browser suites for ordinary source changes. Project-wide TypeScript checks and full builds run for their
  shared configuration or dependency changes, or explicit `--all`. Ordinary source-only runs intentionally do
  not provide full-project type-checking or build evidence. Hosted manual validation remains full.
  Date/Author: 2026-09-15, Codex implementing the user's incremental validation instruction.
- Decision: Use Git's advertised remote revision for an existing pushed ref. For a first push or manual run
  without `--base`, require one merge base between the chosen commit and `refs/remotes/<remote>/HEAD`. Accept
  `--remote` for manual selection and `--all` as an explicit full-run request. Missing or ambiguous comparison
  history fails with an actionable message, never an implicit full run.
  Rationale: A first push can still validate only branch changes, while unavailable history must not cause an
  unexpectedly expensive run or an untrustworthy comparison.
  Date/Author: 2026-09-15, Codex.
- Decision: Use Jest's related-test dependency discovery to identify PostgreSQL integration suites affected by
  changed backend inputs. Run each selected suite with its dedicated database environment.
  Rationale: Related integration cases must execute with their required database fixtures rather than remain
  skipped because the ordinary test command has no database environment.
  Date/Author: 2026-09-15, Codex.

## Outcomes & Retrospective

The hook, launcher, isolated runner image, workflow adapter, manual validation trigger, and documentation are
implemented within the existing draft pull request. The actual frozen workspace dependency install completed,
and `corepack pnpm prepare` installed the hook.

The user's latest refinement implements incremental local selection within the same pull request. All 85 local
Node tests, 308 focused Jest tests, and changed-script ESLint passed. Incremental smoke runs passed 207 backend
tests across two files and 59 web tests across five files. Database dependency discovery and the list of selected
Playwright cases were also verified. A normal incremental push remains pending; the current database
evidence proves selection, not execution. Earlier full-selection results remain historical evidence.

Before the incremental refinement, full local CI passed through the normal push hook on 2026-09-15 for committed revision
`6425e862f0d68c083a129b08adc434d0b64f9143`. All six consumers passed, including all nine gateway tests, every live
fixture, and every preserved Bruno collection through the final batch upload and download. No validation
containers remained, and the private stack volumes were removed.

The user's later removal request retires the session-material scanner and every executable reference to it.
Current documentation and active plan commands reflect the removal; completed plans retain their historical
scanner evidence with a retirement note. Validation of the remaining checks is recorded separately below.
All 41 local Node tests, 308 workflow, selector, and ExecPlan Jest tests, type checking, focused ESLint, and
actionlint passed after removal. Independent review found no executable scanner references. A fresh full push
attempt for `28fe5cd` then passed repository policy, backend checks and database fixtures, web checks, generated
contracts, application images, browser artifact guards, and browser UI, accessibility, and visual suites. It
stopped in the browser-live gateway checks because the runner image lacked `envsubst`. The image now includes
`gettext-base`; the subsequent full validation result above confirms the correction.

During the initial implementation, all 38 local Node tests and 308 existing Jest workflow, selection, and ExecPlan
tests passed. Focused ESLint, actionlint, shell syntax, and whitespace checks passed. A real launcher smoke test validated the
repository-policy consumer against committed revision `2ac6ea303e40e78efca92da8baf82d838a337a6d`, and a separate
nested Docker image build and run passed using the private daemon and its anonymous data volume.

Harper remains the sole advisory local check. Every other failed check stops local
validation, including checks that remain advisory in the hosted workflow. The runner still reports health and
removes disposable resources without replacing the original blocking failure. All 41 local Node tests and focused ESLint
passed after this clarification. The later real push attempt for `ddacb5d` selected all consumers and passed
repository policy, backend Ruby checks, lint, and type checking. It stopped at an existing backend scanner test
failure, correctly preventing the push. Harper reported 780 findings across 380 files and continued as intended.

The earlier `ddacb5d` and `28fe5cd` failures remain historical evidence. The retry under the original full-selection
design completed all consumers
and live checks that those attempts had not reached. Fixture and validation-container removal were verified.
Independent review left no material SOLID issue.
The deliberate architecture trade-off is the strict workflow adapter, which needs explicit support for new
Actions features. Application modules and HTTP behavior remain unchanged.

## Context and Orientation

`.github/workflows/validate.yml` owns six hosted validation consumers: repository policy, backend, web, contract,
images, and browser. Hosted manual dispatch runs every consumer. The retained `scripts/ci/select-validation.mjs`
maps paths to broad consumer groups for hosted events and keeps the original fallback behavior. The hosted
workflow has a final `validate` job that aggregates consumer outcomes.

Local selection lives separately in `scripts/ci/incremental-checks.mjs`. `compileLocalWorkflow` combines its
changed-file plan with the existing workflow commands and fixture setup. Local comparison resolution is strict:
missing or ambiguous history fails, ordinary source changes select related tests, and explicit `--all` selects the
full commands. The hosted classifier does not control this incremental local path.

`.husky/pre-commit` currently runs the lightweight commit checks. `package.json` has a `prepare` lifecycle script
that installs Husky. Git supplies each ref update to `pre-push` through standard input, including local and remote
object IDs; these values identify what will actually be pushed even when the working tree is dirty.

The workflow contains frozen dependency installs, database integration fixtures, Docker image builds, Playwright
checks, and a disposable development stack. That stack calls `pnpm dev:reset`, which uses the fixed `lef` project
and deletes its disposable volumes. Local validation therefore requires its own Docker daemon. No application
module or public API is affected.

## Scope and Non-Goals

This single pull request adds `.husky/pre-push`, local validation scripts and tests under `scripts/ci/`, a runner
image under `docker/ci-local/`, package commands, workflow changes, and developer documentation. It also retires
the session-material scanner at the user's request. The same pull request now adds incremental local planning,
strict comparison resolution, and explicit full validation. It preserves the hosted classifier, full validation
commands, and existing commit checks. Harper is the sole advisory local check, and all
other local checks are blocking. The hosted workflow retains its existing advisory settings.

It does not repair or deploy the Swarm runners, add hosted runner capacity, publish images, synchronize issues
from a hook, change branch rules, or create GitHub check statuses. It introduces no product feature, HTTP API
change, database migration, schema change, or application architecture refactor. GitHub interface edits and
clients that bypass hooks remain outside local enforcement.

## Plan of Work

Implement `scripts/ci/pre-push.mjs` to parse Git's ref-update input, skip deletions, resolve each pushed commit, and
invoke validation for every distinct outgoing revision. Preserve a usable comparison base per pushed revision;
use the advertised remote SHA when the ref exists. For a first push, resolve the unique merge base with the
selected remote's default branch. Reject missing or ambiguous history with an actionable error. Propagate local check failures to
Git, including invalid input and failed setup.

Implement `scripts/ci/local-validation.mjs` to accept committed `HEAD` by default and optional `--commit`, `--base`,
and `--remote` arguments. Add explicit `--all`. A manual run without a base resolves the same unique merge base
against the selected remote's default branch. Create a clean snapshot of the target commit, build the runner image, and start a unique disposable
container for a nonempty comparison. Skip Docker setup entirely when the compared trees are identical.
Start a private Docker daemon inside that container before running any check that needs Docker.
Keep credentials, the developer's environment files, host sockets, and host ports outside the fixture boundary.
Remove the container and temporary snapshot on success, failure, or interruption.

Implement `scripts/ci/incremental-checks.mjs` and `compileLocalWorkflow` in `scripts/ci/run-local-checks.mjs` to keep
local selection separate from the hosted classifier. Lint existing changed source files and use Jest
`--findRelatedTests` or Vitest related tests for ordinary backend or web changes. Select changed Markdown for
Harper, including documentation under `apps/web`. Add the architecture gate for module source and module README
changes because they define cross-module dependency contracts. Web source covered by `sourceRoots` in
`premium-ui.json` also runs the UI contract audit; shared `.css` and `.scss` files, including style tokens, add design
lint. These related contract checks do not select every browser suite.
Ordinary prose has no additional checks, and an empty comparison selects none. Target
tooling and database checks when their inputs change. Map direct browser specifications to the existing exact-file
Playwright commands and their required fixtures. Shared fixtures or configuration select relevant browser targets.
Broaden only for shared configuration, dependencies, or dependency graph changes such as deleted source, and
print the reason. Reject unknown inputs with instructions to add a local rule or explicitly use `--all`.

Use Jest's related-test dependency discovery to identify affected PostgreSQL integration suites and run them
with their dedicated database environments. Ordinary source changes retain changed-file lint and related tests;
project-wide TypeScript checks and full builds require their shared configuration or dependency changes, or
explicit `--all`. State that ordinary source-only results do not provide full-project type or build evidence.

Retain the existing full workflow commands for explicit `--all` and justified broader selection. Provide only the
fixtures needed by the selected checks. Stop at the first
failed local check other than Harper. Report Harper failures and continue to the next check. Treat every other
check as blocking, including checks with a hosted `continue-on-error: true` setting. Always run cleanup
and health reporting while preserving the original blocking failure. Preserve each test runner's failure and retry
behavior within selected tests. Add focused Node tests for argument and ref parsing, command execution, isolation, failure
propagation, and cleanup. Extend existing workflow tests to cover the temporary manual trigger and
approved runner labels.

Add `ci:local` and `ci:local:test` package commands and wire `.husky/pre-push` to the local runner. Keep the current
commit hook and ensure generated `.husky/_` files remain ignored. Make `Validate` available through manual
dispatch only, with every direct workflow job targeting the approved self-hosted labels. Keep the separate
publishing and plan synchronization behavior intact. Update `README.md` with setup, execution, limitations, and
the reversal procedure.

For the user's removal request, delete `scripts/security/scan-linkedin-session-material.ts` and its focused
specification, remove the package command, and remove the hosted workflow scanner step reused by local pre-push.
The existing `.husky/pre-commit` hook has no explicit scanner command and remains unchanged.
Update current documentation and active plan commands, and add retirement notes to completed plans while
preserving their historical evidence. Keep the approval checker and module architecture checks intact.

## Interfaces and Dependencies

`corepack pnpm ci:local` validates changed files and related tests for committed `HEAD` against its unique merge
base with the selected remote's default branch. `--commit <commit-sha>` selects another committed revision;
`--base <base-sha>` supplies an explicit comparison, and `--remote <remote>` chooses the remote. `--all` explicitly
requests every validation consumer. `corepack pnpm ci:local:test` runs the focused local validation and hook tests.

Existing pushed refs use the remote SHA advertised by Git. First pushes and manual runs without `--base` use
the unique merge base against `refs/remotes/<remote>/HEAD`. Missing history, ambiguous merge bases, and unknown
input paths produce actionable errors. None silently activates full validation.

The host requires Node 24, Corepack, Git LFS, and Docker capable of running privileged Linux containers. The
runner image supplies Node 24, Ruby 3.3, Docker tooling, and browser dependencies. Dependencies remain pinned by
the repository's existing lockfile. The hook creates local fixture containers and does not require GitHub tokens
or publish registry artifacts. No new external service contract or application dependency is introduced.

## Acceptance Criteria

- Pushing one or more refs validates each distinct outgoing committed revision. Uncommitted application files
  are excluded from the validation checkout. Ref deletions do not start validation.
- Existing pushed refs compare against the advertised remote SHA. First pushes and manual runs without an
  explicit base use a unique merge base with the selected remote's default branch. Missing or ambiguous history
  fails with actionable recovery guidance and starts no implicit full run.
- Ordinary backend and web changes lint only existing changed files and run related Jest or Vitest tests. They
  do not select full builds, application images, or browser suites solely because source files changed.
- Project-wide TypeScript checks and full builds run for their shared configuration or dependency changes, or
  explicit `--all`. Source-only incremental results are not presented as full-project type or build validation.
- Jest dependency discovery identifies affected PostgreSQL integration suites. Each selected suite runs with
  its dedicated database environment so its integration cases execute.
- Ordinary prose changes, including `apps/web` documentation, run changed-file Harper only. Module source and
  module README changes also run the architecture gate because they define cross-module dependency contracts.
- Web source covered by `sourceRoots` in `premium-ui.json` runs the UI contract audit alongside its changed-file
  checks. Shared `.css` and `.scss` files, including style tokens, also run design lint. These related contract checks
  do not select every browser suite. An empty comparison runs no checks and skips Docker setup.
  Tooling, database, and direct browser test changes select only relevant checks and fixtures.
- Broader local selection is limited to shared configuration, dependencies, or dependency graph changes and
  prints its reason. An unknown input requires adding a local rule or explicitly choosing `--all`.
- Explicit `--all` runs the retained full validation commands. Hosted manual validation and its coarse classifier
  retain their behavior independently from local incremental selection.
- Selected validation runs each planned command until the first failed blocking check.
  The repository-policy Harper command is the sole advisory exception: its failures are reported and validation continues. Every other check
  is blocking, including checks marked `continue-on-error: true` in the hosted workflow. No later validation check
  starts after a blocking failure. The runner still reports health and removes disposable resources, preserving that failure.
- Test runners retain their failure and retry behavior within the selected tests. The local adapter stops between check
  commands; it does not require a test runner to stop at its first failed assertion.
- Every validation container owns a private Docker daemon. No host Docker socket is mounted and no host ports
  are published. Concurrent runs have independent fixture containers and volumes.
- Failed initialization, check failures, and interruption remove the disposable validation environment. A failed run
  can be retried without resetting the developer's application stack.
- Fresh clone installation enables the push hook through the existing preparation lifecycle. The existing
  commit hook remains intact, and generated Husky support files are ignored.
- `Validate` has only manual dispatch. Every direct workflow job uses the approved self-hosted labels; container
  publishing and automatic plan synchronization retain their existing triggers.
- Documentation explains installation, manual execution, the cost of the initial run, the limits of hook
  enforcement, GitHub required-check behavior, and restoring hosted triggers. Focused tests and Harper pass.
- The retired session-material scanner source, focused specification, package command, and workflow step reused
  by local pre-push are absent. Current documentation no longer presents that scanner as an available check.

## Validation

Run these focused commands from the repository root:

```sh
corepack pnpm ci:local:test
corepack pnpm test:ci-paths
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand
corepack pnpm docs:lint -- README.md .agents/plans/local-ci-hooks/README.md .agents/plans/local-ci-hooks/01-run-validation-before-push.md
git diff --check
```

The Node suite must cover ref parsing, duplicate revisions, ref deletions, invalid arguments, and committed snapshots.
Comparison tests cover advertised remote SHA values, first-push and manual merge bases, missing and ambiguous history,
and explicit `--all`. Selection tests cover changed and deleted paths, related tests, reasons for shared inputs,
unknown-input rejection, ordinary prose and module README distinctions, module architecture gates, declared
shared design audits, empty plans, and targeted fixtures. Database tests cover selection
through Jest dependency discovery and the dedicated environments that activate integration cases. Runtime tests cover blocking
failures including hosted advisory checks, private daemon configuration, and cleanup. Regression tests must show
that Harper failures are reported without stopping later checks, no later
check runs after any other failure, health reporting and cleanup still run, and their failures do not replace the
original blocking failure.
Existing hosted selection fixtures and workflow tests verify consumer ownership and the retained hosted structure.
The repository ExecPlan test verifies the new plan's required metadata and section format.

For container validation, run `corepack pnpm ci:local --commit <implementation-commit-sha> --base <base-sha>` once
the implementation is committed. Exercise documentation, ordinary backend and web changes, an empty comparison,
a justified broader selection, and a comparison error. Record selected commands and reasons, initialization,
check results, and fixture removal. Verify that an
existing host development stack remains untouched. A full run requires Docker image downloads, package
downloads, and fixture dependencies; request it with `corepack pnpm ci:local --all` and report its result separately
from incremental validation. Report any blocked stage separately from passing unit tests.

Bruno collection behavior is unchanged, so no collection edits are required. The existing browser workflow's
Bruno validation must remain in local execution; record its runtime result only if that stage runs.

## Idempotence and Recovery

Each attempt creates a fresh committed snapshot and an independent container, so a failure can be retried with
the same command. The runner removes only its own container and temporary files. A terminated
container's private Docker state is disposable; never run the fixture's reset command directly against the host
to recover validation. Shared runner image layers may remain available for later builds.

Run `corepack pnpm prepare` to restore hooks after installing dependencies without scripts. Once the self-hosted
runners are reliable, restore the `pull_request` and `push` triggers in `.github/workflows/validate.yml`. Retaining
or removing the local hook is a separate reversible developer-workflow choice. Branch protection remains an
administrator-controlled setting throughout this change.

## Artifacts and Notes

During initial implementation on 2026-09-14, all 38 local Node tests and all 308 existing focused Jest tests passed.
The six local runner and hook JavaScript files passed ESLint; the validation and plan synchronization workflows passed actionlint.
Shell syntax and diff whitespace checks passed. The exact Harper command in Validation passed for all three
changed Markdown files after the final evidence update.

The following full-launcher command passed with only repository policy selected. `BUILDX_CONFIG` pointed to a
temporary directory for the invocation:

```sh
BUILDX_CONFIG=<temporary-dir> corepack pnpm ci:local --commit HEAD --base 2ac6ea303e40e78efca92da8baf82d838a337a6d
```

The source `HEAD` was `2ac6ea303e40e78efca92da8baf82d838a337a6d`. The run passed 13 documentation tooling tests,
account-discovery approval validation, the session-material scanner, the architecture gate, existing Jest
checks, and path fixtures. The nested Docker proof built and ran a small image using the private daemon.
Node 24, Ruby 3.3, and Docker Compose were available in the validation image. No labeled validation containers
remained after the run. `core.hooksPath` was `.husky/_`, and its support script and commit and push dispatchers
were present. This evidence does not include the
complete backend, web, generated-client, application image, browser, or Bruno suites.

After the user's clarification that Harper remains advisory, these focused commands passed:

```sh
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm ci:local:test
corepack pnpm exec eslint scripts/ci/run-local-checks.mjs scripts/ci/run-local-checks.test.mjs
git diff --check
```

All 41 local tests passed. The regressions confirm that a Harper failure allows later checks both with and without
a comparison base, that no other hosted `continue-on-error` setting can bypass a local failure, and that the
original type check failure survives a cleanup failure. Only `corepack pnpm docs:lint:changed` and
`corepack pnpm docs:lint` in repository policy qualify for the advisory exception. These focused results precede
the later real push attempt recorded below.
Documentation validation uses
`corepack pnpm docs:lint -- README.md .agents/plans/local-ci-hooks/01-run-validation-before-push.md`.

The actual push hook for committed revision `ddacb5d` selected every consumer. Harper's existing repository
baseline produced 780 findings across 380 files; its advisory exception allowed validation to continue.
Repository policy passed all 41 local Node tests and all 308 focused Jest tests. Backend Ruby checks, lint, and
type checking passed. Backend Jest then reported 1 failed, 3,263 passed, and 109 skipped tests across 1 failed,
252 passed, and 16 skipped suites. Its single failure was the reachable-history scanner test described in
Surprises & Discoveries. No later backend database or build check, web, contract, image, browser, or Bruno check
ran. PostgreSQL and validation-container cleanup were verified.

The original draft publication used a one-time `HUSKY=0` hook bypass to make that failed run reviewable. The
scanner and its test were unchanged at that point. Later investigation confirmed their Git 2.50 dependency by
passing all eight scanner tests with that version. The user subsequently requested removing the scanner instead
of retaining the tool with a newer Git requirement. Its source, focused tests, package command, and workflow step
reused by local pre-push are retired; that removal does not establish success for the consumers that did not run.

After removal, all 41 local Node tests and all 308 focused workflow, selector, and ExecPlan Jest tests passed.
Type checking, focused ESLint, and actionlint passed. Independent review found no executable reference to the
retired scanner. The earlier `ddacb5d` failure remains historical evidence; the first full run after removal is recorded below.

The subsequent normal push of `28fe5cd` ran the actual hook and passed repository policy, including Harper for
eight changed files, all 41 local Node tests, and all 308 focused Jest tests. Backend validation passed 3,256 Jest
tests with 109 skipped, 92 runner tests, and five real PostgreSQL suites containing 1, 27, 25, 2, and 6 tests. The
backend build passed. Web validation passed 627 tests, its build, and design audits. Contract checks passed all
23 tests, drift validation, and the generated-client build. All three application images, approval-manifest
validation, and Compose checks passed.

All browser artifact guards passed. Browser UI passed 120 general cases plus the service, invitation,
organization, credit, and proxy suites, followed by four accessibility and four visual tests. The browser-live
step `Test Vite and Nginx route ownership and privacy` then reported eight passed tests and one failed test.
`scripts/frontend/checkout-config.test.mjs:132` failed because `envsubst` was missing. The subsequent live
fixtures and Bruno checks were not reached. Fixture and validation-container removal were verified.

The runner Dockerfile installs `gettext-base`, which provides `envsubst`. On 2026-09-15, the full normal push-hook
retry for `6425e862f0d68c083a129b08adc434d0b64f9143` passed all six consumers. All nine gateway tests passed, then
every remaining live fixture and preserved Bruno collection passed, including the final batch upload and
download. `/tmp/lef-remove-scanner-push-retry.log` records
`Local validation passed for 6425e862f0d68c083a129b08adc434d0b64f9143.` No validation containers remained, and the
private stack volumes were removed. This result covers local validation; it does not claim a
hosted GitHub Actions run.

The incremental refinement passed all 85 Node hook, runner, and planner tests, all 308 focused workflow, selector,
and ExecPlan Jest tests, and changed-script ESLint. Real incremental smoke runs passed 207 backend tests across
two files and 59 web tests across five files. These results establish related-test execution for those inputs,
not full-project TypeScript or build validation.

Playwright's `--list` output selected 12 cases from one public-entry specification; this was listing evidence,
not browser execution. Actual Jest dependency discovery for `credits.service.ts` selected 39 related test files
and the scoped credits and payment PostgreSQL commands. These database commands were selected but not executed
during this refinement. A normal incremental push through the installed hook remains pending. The full
validation result above belongs to the earlier selection behavior.

The issue lookup at the start of implementation found no synced issue for this plan.

## Plan readiness

Ready to implement
