# Prepare Reusable ExecPlan Sync Adoption

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prepare LeadEmailFinder to replace its repository-local ExecPlan synchronization implementation with the reviewed
public `TupoSoft/execplan-sync` Action. Preserve every existing managed issue and Project 9 status. The implementation
pull request must prove tokenless validation, an authenticated compatibility dry run, full-SHA pinning, and an atomic
single-writer transition. After merge, the default branch uses the reusable implementation, and the checked-in
operator procedure captures the first live run and immediate unchanged rerun outside this one-plan/one-PR document.

## Progress

- [ ] (2026-08-31) Review the plan-07 decision inputs and record the approved private-repository credential boundary and immutable `v0.1.0` release SHA.
- [ ] (2026-08-31) Add tokenless, SHA-pinned ExecPlan validation for pull requests.
- [ ] (2026-08-31) Replace the default-branch sync workflow with the reusable Action and selected token-minting path.
- [ ] (2026-08-31) Add static consumer-workflow coverage for SHA pinning, permissions, triggers, and single-writer use.
- [ ] (2026-08-31) Preserve markers, labels, generated body identity, Project 9 mapping, and serialized execution.
- [ ] (2026-08-31) Remove the superseded local synchronizer, focused tests, package script, and workflow dependencies.
- [ ] (2026-08-31) Run focused plan, documentation, repository, and workflow validation.
- [ ] (2026-08-31) Complete and review an authenticated dry run without writes.
- [ ] (2026-08-31) Document the post-merge live run, unchanged rerun, recovery, evidence, and credential-retirement steps.
- [ ] (2026-08-31) Deliver one implementation pull request with required review and checks green.

## Plan dependencies

- `plan-sync/04`
- `plan-sync/07`

## Surprises & Discoveries

- `TupoSoft/execplan-sync` is public, MIT licensed, and merged on `master`, but it has no immutable release tag yet.
  A live dry run against LeadEmailFinder and Project 9 found 70 plans unchanged with zero creates, updates, or orphans.
- The current `.github/workflows/sync-execplans.yml` installs the complete Node dependency graph for LeadEmailFinder and
  runs `corepack pnpm plans:sync` with the long-lived `PROJECT_SYNC_TOKEN` repository secret.
- TupoSoft is on GitHub Free and LeadEmailFinder is private. GitHub environments and environment secrets are not
  available to private repositories on that plan, so the reusable Action's protected-environment example cannot be
  copied here unchanged.
- Repository workflow concurrency prevents two LeadEmailFinder runs from overlapping but cannot coordinate other
  repositories that share one GitHub App installation. Any shared credential design must enforce its own trust and
  aggregate scheduling boundary.

## Decision Log

- Decision: Make the external Action the sole plan parser and synchronization implementation after migration.
  Rationale: Retaining two implementations would recreate the drift this extraction is intended to eliminate and
  would force every compatibility change to be tested twice.
  Date/Author: 2026-08-31, Codex.
- Decision: Pin the Action to the exact reviewed prerelease commit SHA, not `master`, `v0.1.0`, or a movable major tag.
  Rationale: Workflow review must identify the exact code receiving Issue and organization Project credentials.
  Date/Author: 2026-08-31, Codex.
- Decision: Keep pull-request validation tokenless and separate it from authenticated default-branch synchronization.
  Rationale: Untrusted pull-request content must never receive a credential capable of changing repository issues or
  organization Projects.
  Date/Author: 2026-08-31, Codex.
- Decision: Pass `issue-generator: pnpm plans:sync` during migration and preserve the established marker and status
  configuration.
  Rationale: The compatibility dry run proved that generator identity avoids an unrelated mass body rewrite and that
  existing `<!-- execplan: <feature>/<NN> -->` markers can be adopted without duplicate issues.
  Date/Author: 2026-08-31, Codex.
- Decision: Stop the legacy writer before the first external Action write and retain its recovery materials until an
  unchanged rerun succeeds.
  Rationale: Two writers can both observe missing state and race to create duplicate issues; immediate secret deletion
  would also remove the fastest rollback before the replacement is proven.
  Date/Author: 2026-08-31, Codex.
- Decision: Do not choose a private-repository credential-hosting model inside this plan without TupoSoft approval.
  Rationale: The current plan cannot enforce the documented protected environment, while a repository secret, a
  trusted coordinator or broker, a separately bounded App, and a GitHub plan upgrade have materially different cost
  and authority boundaries.
  Date/Author: 2026-08-31, Codex.
- Decision: Retain consumer-side workflow contract tests after removing the local synchronization tests.
  Rationale: The upstream repository owns parser and adapter behavior, while LeadEmailFinder must keep proving its
  immutable Action reference, tokenless validation, Project 9 configuration, credential boundary, and single-writer
  orchestration.
  Date/Author: 2026-08-31, Codex.
- Decision: End this ExecPlan at a reviewed, migration-ready merge and retain later operational evidence outside the
  plan file.
  Rationale: The exact default-branch commit and its automatic synchronization run do not exist until after the pull
  request merges. Updating the plan afterward would require a second pull request and violate the one-plan/one-PR
  boundary. Private workflow runs and a comment on the merged pull request preserve the evidence without that cycle.
  Date/Author: 2026-08-31, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`.agents/plans/<feature>/NN-<slug>.md` is the authoritative plan source. The repository-local implementation lives in
`scripts/plans/execplan.ts`, `scripts/plans/github-project-api.ts`, `scripts/plans/sync.ts`, and
`scripts/plans/sync-project.ts`, with focused Jest coverage in the adjacent `*.spec.ts` files. `package.json` exposes
the `plans:sync` command. `.github/workflows/sync-execplans.yml` runs it after plan or synchronizer changes land on
`master`, or through a manual dispatch, and serializes runs with the `sync-execplans` concurrency group.

The local writer owns only generated issue bodies, the `execplan` and `blocked` labels, Project 9 membership, and the
Project `Status` field. It preserves other labels, assignees, `Priority`, `Size`, `Iteration`, assigned work already in
progress, and completed items. Stable HTML markers identify issues by `<feature>/<NN>` independently of title and
filename slug. Generated body discussion belongs in comments because the next run overwrites the body.

The public `TupoSoft/execplan-sync` Action implements the same one-way model behind a Node 24 committed bundle. In
`mode: validate`, it reads the checked-out plan graph without network access or a token. In `mode: sync`, it accepts a
caller-supplied token, source repository and ref, Project owner and number, status mapping, generator identity, and
dry-run flag. It preflights plans and Project status options before mutation and reports orphans without closing them.

Project 9 belongs to TupoSoft and remains the LeadEmailFinder delivery board. The current repository is private, so
its workflow logs and plan content must remain private. The selected credential path must provide repository Issue
write, repository metadata read, and organization Project write while ensuring that branches without review or
unrelated repositories cannot obtain a broadly installed App private key.

## Scope and Non-Goals

Add a focused pull-request validation workflow using the immutable Action SHA. Rewrite the existing synchronization
workflow to check out `master`, obtain the selected short-lived or otherwise explicitly approved credential, and call
the Action for TupoSoft Project 9 with compatible status and generator settings. Preserve serialized execution and the
manual dry-run default. Once compatibility is proven, remove the local plan implementation and tests, remove the
`plans:sync` package script, and update the plan-sync road map and operational documentation.

Repository work under this ExecPlan ends when the implementation pull request is reviewed, validated, and merged. The
merge authorizes the atomic writer replacement. The resulting default-branch live run and immediate unchanged rerun
are governed post-merge operations. The same boundary applies to the recovery decision and retirement of the
superseded credential. Retain their evidence in private workflow runs and the merged pull request rather than a later
edit to this plan.

Do not change application modules, HTTP endpoints, database schema, authentication behavior, ExecPlan syntax,
existing issue numbers, Project 9 schema, human-owned Project fields, orphan lifecycle, cross-repository dependencies,
or the public Action source. Do not roll the Action out to another repository, introduce organization-wide scheduling,
store a credential in source, expose a credential to pull requests, or assume a paid GitHub feature that is unavailable
to this repository. Bruno coverage is not applicable because this work changes repository automation rather than the
observable HTTP API.

## Plan of Work

Consume `docs/maintenance/execplan-sync-adoption-inputs.md` from plan 07 as preparation evidence. Its recommendations,
missing evidence, or completion do not approve a credential model or satisfy the immutable release requirement.

Before editing, record the approved `v0.1.0` full release SHA and the TupoSoft-selected credential-hosting model in the
Decision Log and Artifacts. Inspect the release commit, its `action.yml`, bundled code, release checks, and security
notes. Confirm that the credential can be restricted to the required repository and organization Project authority,
that branches without review cannot retrieve it, and that the workflow will not emit private plan content into public
logs. If no available model satisfies that boundary, leave this plan blocked rather than reusing a broad secret by
default.

Add `.github/workflows/validate-execplans.yml` for pull requests that touch `.agents/plans/**` or the validation
workflow. Grant only `contents: read`, use a full-SHA-pinned checkout, disable persisted checkout credentials, and call
the full-SHA-pinned external Action with `mode: validate`. Keep this job independent of Corepack, pnpm, application
dependencies, GitHub App creation, repository secrets, and `pull_request_target`.

Add `scripts/workflows/execplan-sync-workflows.spec.ts` using the existing `yaml` dependency. Parse both ExecPlan
workflows and assert that they reference the same literal 40-character Action SHA. Assert that validation is
tokenless and does not use `pull_request_target`; synchronization retains non-canceling concurrency, safe manual
dry-run defaults, reviewed default-branch checkout, Project 9 inputs, compatibility generator, and exactly one active
writer. These tests replace only the consumer contract coverage, not the upstream Action's parser tests.

Refactor `.github/workflows/sync-execplans.yml` without changing its default-branch, path, manual-dispatch, or
non-canceling concurrency intent. Force checkout of the repository default branch with persisted credentials
disabled. Mint or retrieve the approved token only in the authenticated job and call the pinned Action with
`mode: sync`, `project-owner: TupoSoft`, `project-number: 9`, `source-ref: master`, and
`issue-generator: pnpm plans:sync`. Map statuses explicitly if Project 9 names differ from the Action defaults. Keep
manual dispatch dry-run by default and ensure a push run cannot select a source ref that has not passed review.

Run a manual authenticated dry run while the legacy workflow remains disabled from writing. Compare every reported
issue number, marker, label, Project membership, status, and orphan with the existing board; zero unexpected creates,
updates, removals, or status regressions are required. Correct configuration or the external Action through its own
focused plan and pull request if the dry run reveals a defect.

After dry-run acceptance, remove `scripts/plans/`, its `plans:sync` package entry, and workflow-only setup steps that
installed the application dependency graph solely for synchronization. Keep unrelated TypeScript tooling and tests.
Update `.agents/plans/plan-sync/README.md` to make the Action workflow the current operating procedure. Merge only
after repository validation and required review.

Before merge, document the exact post-merge operator sequence. Replacing the existing workflow and removing its local
entry point in one merge must make the old writer incapable of running before the new default-branch workflow starts.
The operator then inspects that first live run and immediately dispatches the same release SHA and configuration again.
The second run must report every plan unchanged and no unexpected orphan. Retain the old credential without workflow
access until this evidence is captured; then remove the superseded secret and record only its name and deletion time,
never its value. Store those results in private workflow summaries and a comment on the merged implementation pull
request.

## Interfaces and Dependencies

The new caller contract is `TupoSoft/execplan-sync@<FULL_V0_1_0_RELEASE_SHA>`. Pull-request validation supplies only
`mode: validate`. Synchronization supplies `mode: sync`, `github-token`, `project-owner`, `project-number`,
`source-ref`, `issue-generator`, and `dry-run`, plus explicit status names if required by the live Project 9 schema.
The final SHA is an implementation-time constant recorded in this plan and both workflows.

The selected credential interface is intentionally unresolved until TupoSoft chooses it. A GitHub App path requires
Issue write, metadata read, and organization Project write; its private key and client identifier must follow the
approved storage and token-minting boundary. A broker or coordinator must validate the requested repository, default
branch, and Project instead of trusting arbitrary caller input. A temporary or long-lived token must not be treated as
equivalent to a protected short-lived App token without an explicit risk decision.

Expected additions and edits are `.github/workflows/validate-execplans.yml`,
`.github/workflows/sync-execplans.yml`, `.agents/plans/plan-sync/README.md`, this ExecPlan, and `package.json` plus its
lockfile only if removing the package script changes the lockfile. The retained consumer contract test is
`scripts/workflows/execplan-sync-workflows.spec.ts` and uses the existing `yaml` package. Expected removals are the
four local plan source files and their focused specifications under `scripts/plans/`. No application dependency
should be removed merely because a plan script happened to use it; confirm each dependency's repository-wide usage
first.

## Acceptance Criteria

- Pull requests that change plans run the released Action in validation mode without any repository or organization
  write credential, application dependency installation, or network mutation.
- Both workflows pin checkout, token-minting Actions if any, and `TupoSoft/execplan-sync` to reviewed 40-character SHA
  values; no workflow references a movable branch or version tag.
- Authenticated synchronization runs only from reviewed default-branch content, uses the approved credential boundary,
  and retains non-canceling repository concurrency.
- A compatibility dry run reports every existing managed plan against its existing issue marker and number, with zero
  unexpected creates, body updates, label changes, Project additions, status regressions, or orphans.
- The legacy writer is incapable of writing before the first external Action live run, so two implementations cannot
  race.
- The checked-in operator procedure requires inspection of the first default-branch live run and an immediate rerun
  with the same immutable Action SHA and configuration; the rerun must report all plans unchanged and no unexpected
  orphan.
- Existing discussion comments, unrelated labels, assignees, `Priority`, `Size`, `Iteration`, assigned work in
  progress, completed status, and issue history remain unchanged.
- The repository-local plan parser, adapter, synchronizer, entry point, focused tests, and `plans:sync` package command
  are removed only after the external path is proven; no unrelated application source or dependency is removed.
- Static workflow contract coverage fails if either workflow loses its full-SHA pin, least-privilege mode, safe
  trigger, Project 9 configuration, concurrency, or single-writer invariant.
- The operator procedure retires the superseded credential only after unchanged-rerun and rollback evidence exists,
  and no credential value or private plan content appears in source, public logs, the ExecPlan, or public artifacts.
- Required repository validation passes, and the change has no externally observable HTTP API effect.

## Validation

Before removing the local implementation, run `corepack pnpm test -- scripts/plans/execplan.spec.ts
scripts/plans/execplan-repository-fixture.spec.ts scripts/plans/sync.spec.ts --runInBand` to preserve a baseline against
the checked-in plan graph. Inspect Project 9 status option names and the existing `execplan`-labeled issue markers
with read-only GitHub queries. Record counts and identifiers, not tokens or private body content.

After editing, run `corepack pnpm docs:lint -- .agents/plans/plan-sync/README.md
.agents/plans/plan-sync/05-adopt-reusable-execplan-sync-action.md`, `corepack pnpm lint`, `corepack pnpm typecheck`,
`corepack pnpm test -- scripts/workflows/execplan-sync-workflows.spec.ts --runInBand`, `corepack pnpm test:ci`, and
`git diff --check`. Inspect the workflow YAML and every `uses:` value; use the pull-request checks as the authoritative
execution proof for the SHA-pinned validation workflow. Run the repository's broader required validation if removing
scripts or package metadata affects the normal build.

Dispatch the new sync workflow with dry run enabled and retain its private run URL and summary. Compare it with the
pre-migration issue and Project inventory. Before merging, inspect the checked-in operator procedure and require it to
use the same Action SHA, source ref, Project, status mapping, and generator for the post-merge live run and immediate
rerun. The first run must match the reviewed dry-run delta; the second must report every plan unchanged. The operator
inspects representative completed, assigned-in-progress, dependency-blocked, and ready plans directly on Project 9
and records the results in private workflow evidence and the merged pull request.

Bruno: not applicable — the plan changes GitHub repository automation and removes repository-local tooling without
changing endpoints, request contracts, response contracts, validation, authentication, authorization, or HTTP
workflows.

## Idempotence and Recovery

Tokenless validation and authenticated dry-run mode are safe to repeat. The concurrency group serializes runs within
LeadEmailFinder, and marker-based reconciliation skips matching issue bodies and statuses. If a live run fails after a
GitHub mutation, stop all writers, inspect the reported issue and Project item, correct the credential or
configuration, and rerun the same immutable Action SHA; ambiguous issue creation is not retried automatically.

Do not delete the old secret or recovery branch before the external Action completes an unchanged rerun. If the new
workflow cannot complete safely, disable it and revert the migration pull request to restore the local scripts and
workflow, then re-enable only the legacy writer. If an unexpected duplicate issue appears, stop synchronization,
retain the issue with the canonical `execplan` label and marker, remove the managed marker or label from the duplicate,
and dry-run again before any live retry. Never run both writers as a rollback shortcut.

## Artifacts and Notes

During implementation, record the `v0.1.0` release URL and full SHA, selected credential-hosting decision, migration
issue and pull request, pre-migration counts, validation run, and authenticated dry run in this plan before merge. The
operator records the first live run, unchanged rerun, representative Project 9 checks, and superseded-secret deletion
time in private workflow summaries and a comment on the merged implementation pull request. Never record a secret
value, App private key, authorization header, installation token, or copied private API payload.

## Plan readiness

Ready after TupoSoft selects a credential-hosting model for private repositories and publishes the immutable version
0.1.0 release commit SHA.
