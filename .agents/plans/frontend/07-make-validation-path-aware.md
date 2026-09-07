# Make Validation Path-Aware

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Keep the expanded backend, web, contract, image, and browser validation useful without rebuilding every area for an
unrelated change. A pull request runs every check affected by the paths it changes, shared inputs fan out to all relevant
consumers, and unchanged areas finish through explicit successful no-op steps. The existing required
`Validate / validate` conclusion remains, so path optimization cannot make a required check disappear.

## Progress

- [x] (2026-09-07) Add a repository-owned changed-path classifier with 52 deterministic fixtures and real Git event tests.
- [x] (2026-09-07) Separate backend, web, contract, image, browser, and repository-policy validation consumers.
- [x] (2026-09-07) Preserve the existing required validation conclusion through one fail-closed summary job.
- [x] (2026-09-07) Make unchanged consumer jobs succeed explicitly instead of being skipped.
- [ ] (2026-08-31) Document the trigger matrix and validate pull-request, push, and manual-run behavior.
- [ ] (2026-08-31) Run workflow, fixture, prose, and repository checks and record evidence.

## Plan dependencies

- `frontend/01`
- `frontend/05`
- `frontend/06`

## Surprises & Discoveries

- (2026-09-07) All three prerequisites are complete on base commit `24804d8`. Issue #502 is assigned to the
  requesting user and its Project 9 status is In Progress. The current workflow also includes Vagrant, privacy,
  security, and four PostgreSQL integration checks; all remain part of the selected validation.
- (2026-09-07) The local Docker daemon already hosts a development stack for another checkout. Live stack checks
  must use isolated resources or GitHub-hosted runners to preserve that running environment.
- (2026-09-07) Route tests need the tagged web image on the same runner. The browser consumer therefore builds
  its own gateway image before those tests; it cannot reuse the image consumer's local Docker state.
- (2026-09-07) Docker scripts and Compose configuration are also inputs to backend runner tests. Docker changes
  select backend validation as well as image and browser validation.
- The original Validate workflow is one backend-oriented job with PostgreSQL and an API image build on every change.
- The frontend foundation adds web and contract checks, and the same-origin plan adds a second image plus browser
  coverage. Those checks have different expensive inputs but share the lockfile and workspace configuration.
- A job-level false condition appears as skipped. If that job name is required by branch protection, an otherwise
  valid pull request can remain blocked or bypass the intended aggregate signal.

## Decision Log

- Decision: Run repository policy for every trustworthy comparison, including an empty diff. Reject missing or
  malformed discovery flags before any consumer can report a successful no-op.
  Rationale: Documentation, security, and architecture ratchets remain enforced, and discovery failures cannot
  silently disable checks.
  Date/Author: 2026-09-07, implementation.
- Decision: Keep backend PostgreSQL services conditional through an empty image when backend validation is
  unselected. Move built-web browser checks and the live gateway workflow into the browser consumer.
  Rationale: Consumer jobs still start and report explicit results while unselected runs avoid service startup.
  Date/Author: 2026-09-07, implementation.
- Decision: Put path classification in a tested repository script instead of duplicating glob logic throughout YAML.
  Rationale: One deterministic function can be exercised with synthetic path lists and reviewed like application
  code; the workflow remains orchestration rather than an untestable policy source.
  Date/Author: 2026-08-31, project planning.
- Decision: Classify backend, web, contract, images, browser, and repository-policy consumers independently, with
  conservative shared-input fan-out.
  Rationale: A package-local change should be focused, while the lockfile, workspace, shared configuration,
  generated contracts, gateway, Docker, and workflow files must trigger every affected downstream consumer.
  Date/Author: 2026-08-31, project planning.
- Decision: Keep each consumer job running and use conditional validation/no-op steps inside the job.
  Rationale: The job reaches an explicit successful conclusion when irrelevant rather than becoming a skipped check.
  Date/Author: 2026-08-31, project planning.
- Decision: Preserve `Validate / validate` as an always-running fail-closed summary over every consumer result.
  Rationale: Existing branch protection and reviewer expectations retain one stable required signal while internal
  validation becomes more granular.
  Date/Author: 2026-08-31, project planning.
- Decision: Run every consumer for manual dispatch and ambiguous or unavailable comparison bases.
  Rationale: Saving CI time never justifies silently omitting validation when change discovery cannot prove scope.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

The implementation is complete and local validation has passed. Hosted workflow fixtures and the complete pull-request
workflow remain in progress. The classifier, event discovery, fixture runner, workflow structure tests, and strict
summary are repository-owned. Every original validation command and its environment settings remain present.

## Context and Orientation

`.github/workflows/validate.yml` currently owns the stable `Validate / validate` check. `frontend/01` adds web lint,
typecheck, unit, browser-accessibility, visual, and build commands. `frontend/05` adds deterministic OpenAPI drift and
API-client checks. `frontend/06` adds independently buildable API/web images, route-matrix tests, and a same-origin
browser smoke.

The classifier must understand direct sources and transitive shared inputs. `apps/web/**` affects web checks and the
web image. `packages/api-client/**` and API DTO/controller annotations affect contracts, web compilation, and both
runtime images where the workspace build consumes them. Lockfiles, workspace globs, root TypeScript/ESLint/Jest
configuration, Docker gateway configuration, shared scripts, and the validation workflow itself must fan out
conservatively.

The current documentation and module-architecture ratchets remain repository-policy checks. This plan optimizes
execution but does not weaken changed-document lint, shrink-only architecture enforcement, PostgreSQL integration,
or any product validation established by prerequisite plans.

## Scope and Non-Goals

This pull request adds the changed-path classifier and fixtures, restructures the Validate workflow into explicit
consumer jobs plus the stable summary, adds successful no-op behavior, and documents the trigger matrix. It may add a
narrow local command that prints consumer flags for a supplied base/head or fixture path list.

It does not change application source, API behavior, generated artifacts, test assertions, image contents, required
check policy in GitHub, CI provider, release/deployment workflows, production environments, or secrets. It does not
remove an existing validation command merely because it is expensive.

## Plan of Work

Add `scripts/ci/select-validation.mjs` as a pure classifier over normalized repository-relative paths. Return explicit
booleans for `repositoryPolicy`, `backend`, `web`, `contract`, `images`, and `browser`. Reject absolute paths and
parent traversal. Unknown top-level source/configuration paths select all consumers. An empty list is valid only when
the event supplies a trustworthy comparison and selects repository policy; missing/invalid comparison context fails
open by selecting everything.

Add focused table-driven tests for backend-only, web-only, API-contract, generated-client, gateway, each Dockerfile,
lockfile/workspace, shared configuration, workflow, documentation-only, plan-only, unknown, empty, and mixed path
sets. Assert transitive fan-out, not merely a single asserted flag. Add a fixture command that emits stable JSON so workflow
expressions do not parse human text.

Add `scripts/ci/validate-workflow.spec.ts` and parse `.github/workflows/validate.yml` with the repository's existing
`yaml` package. Assert one mapping document, valid job/step shapes, unique job IDs, declared `needs` references,
consumer/no-op branches, `if: always()` on the summary, the exact summary identifier/display name, and every command
owned by prerequisite plans. This repository test is the chosen YAML/workflow linter; do not leave an unnamed
`actionlint` dependency. Local parsing cannot evaluate GitHub expressions, so the live fixture run below remains a
separate required gate.

Add one lightweight change-discovery job that checks out full-enough history, resolves the pull-request base/head or
push before/head pair, invokes the repository classifier, and exports all flags. Manual dispatch and unavailable or
all-zero base revisions set every flag. Do not execute untrusted changed filenames as shell fragments.

Refactor heavy validation into named consumer jobs. Each job always starts. When selected, it runs the exact commands
already established by the prerequisite plans; when unselected, it runs one explicit no-op step that prints the
classifier result without claiming the underlying tests ran. Keep PostgreSQL services only on selected jobs that need
them where workflow syntax permits without skipping the job itself.

Keep a final job with identifier and display conclusion `validate` that declares `if: always()`, depends on discovery
and every consumer, and fails unless each dependency concluded `success`. It must treat `failure`, `canceled`, or an
unexpected `skipped` consumer as failure. Preserve the external `Validate / validate` check name. Add a workflow
fixture or local expression test proving selected success, selected failure, explicit no-op success, cancellation,
and discovery failure behavior.

Update repository CI documentation with the exact path matrix, fail-open cases, local fixture command, and the rule
that a successful no-op means only that the area was not selected. Do not report counts for tests that did not run.

## Interfaces and Dependencies

The classifier's stable machine result is equivalent to:

    {
      "repositoryPolicy": true,
      "backend": true,
      "web": true,
      "contract": true,
      "images": true,
      "browser": true
    }

Every key is always present and boolean. The workflow exports the same keys as job outputs. `Validate / validate`
remains the required aggregate check and succeeds only when discovery and all consumer jobs succeed, including their
explicit no-op branches.

This plan uses existing GitHub Actions, Node 24, pnpm, Docker, and repository commands. It adds no application runtime
dependency, hosted service, schema, or external data store.

## Acceptance Criteria

- Table-driven tests prove the exact classification and transitive fan-out for every documented fixture.
- Backend-only and web-only changes avoid unrelated expensive commands; lockfile, workspace, shared-configuration, gateway,
  contract, Docker, workflow, mixed, and unknown changes select every affected consumer conservatively.
- Pull-request and push comparisons use the correct base/head pair. Manual dispatch or unresolved comparison history
  selects all consumers.
- Every consumer job concludes success through executed checks or an explicit successful no-op. No required consumer
  is skipped because its path flag is false.
- `Validate / validate` keeps its existing name, runs after all consumers even on failure, and fails on any failed,
  canceled, skipped, or missing dependency result.
- Existing backend, architecture, docs, OpenAPI, web, image, route, and browser commands remain intact when selected.
- Workflow syntax, classifier tests, fixture matrix, documentation lint, and repository checks pass in one pull request.

## Validation

Run the classifier and workflow-focused tests, then every fixture documented above:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- select-validation validate-workflow --runInBand
    corepack pnpm test:ci-paths
    corepack pnpm lint
    corepack pnpm typecheck
    corepack pnpm test:docs-lint
    corepack pnpm architecture:check

Validate workflow syntax and structure with the exact repository-owned test:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/ci/validate-workflow.spec.ts --runInBand

On a test branch or equivalent safe fixture workflow, observe backend-only, web-only, shared, unchanged/no-op, and forced-all runs. Confirm the displayed
aggregate name remains `Validate / validate` and inspect each consumer conclusion.

Run the full command set once to prove selection did not alter the underlying validations, then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm openapi:check
    corepack pnpm docs:lint -- README.md .agents/plans/frontend/07-make-validation-path-aware.md
    git diff --check

Record the fixture flags, consumer conclusions, aggregate conclusion, exact command counts, and any live workflow
limitations. Local classifier tests do not prove GitHub job/result semantics by themselves.

## Idempotence and Recovery

Classification and validation are read-only apart from ignored build/test output and are safe to repeat. If base
resolution or JSON output fails, select all consumers rather than guessing. If the summary job is not emitted under a
failure fixture, restore the prior workflow and fix orchestration before changing branch-protection assumptions.

Workflow edits are recoverable by reverting this pull request; prerequisite validation commands remain available
unchanged. No Docker cleanup, persistent data reset, schema migration, production rollback, or external mutation is
introduced.

## Artifacts and Notes

Implementation files are `scripts/ci/select-validation.mjs`, `scripts/ci/select-validation.spec.ts`,
`scripts/ci/validation-fixtures.json`, `scripts/ci/validation-summary.mjs`, and `scripts/ci/validate-workflow.spec.ts`.
The README documents the consumer matrix and local commands. No application module or HTTP contract changed;
Bruno additions are not applicable, and the existing BFF collection remains in browser validation.

Local evidence on 2026-09-07: the full backend command passed 208 Jest suites with 2,079 tests and the existing 32
Node runner tests. The default run skipped 13 environment-dependent suites with 72 tests; this does not replace
the four explicit PostgreSQL commands. Later focused CI tests cover the completed classifier and workflow changes.
OpenAPI drift and six tooling tests passed. Web audits, design lint, UI audit, web lint, types, unit tests, build, and
all four gateway tests passed. Root lint passed with one existing return-type warning in `load-secrets.spec.ts`;
typecheck, build, docs-tooling tests, architecture, privacy approval checks, and the security scan passed.

The exact prose command `corepack pnpm docs:lint -- README.md .agents/plans/frontend/07-make-validation-path-aware.md`
passed both files before this evidence update. The final evidence update will receive the same check.

Record the path-to-consumer fixture matrix, redacted change-discovery output, each job conclusion, and the aggregate
check name/result. Never record repository tokens, event payload secrets, environment dumps, cookies, user data, or
service credentials.

The classifier contract, conservative fan-out, successful no-op behavior, exact YAML/workflow linter, stable
aggregate check, failure semantics, validation, and one-pull-request scope are decision-complete.

## Plan readiness

Ready to implement.
