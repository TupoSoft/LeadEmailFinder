# Prepare the Sync Adoption Decision Inputs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the preparation for reusable plan synchronization independently deliverable. A maintainer can read
`docs/maintenance/execplan-sync-adoption-inputs.md` and identify the current writer, the available credential
approaches, the evidence for the required release, and the exact decisions still needed for plan 05. This plan
delivers one documentation pull request. Missing approvals or an unpublished release are valid recorded outcomes.

## Progress

- [ ] (2026-09-11) Record the source revision, current synchronization contract, and required authority.
- [ ] (2026-09-11) Compare credential approaches using current evidence and record unresolved owner questions.
- [ ] (2026-09-11) Record the required release evidence or the precise missing evidence and review steps.
- [ ] (2026-09-11) Publish the decision inputs and verify that plan 05 retains its readiness conditions.

## Plan dependencies

- `plan-sync/04`

## Surprises & Discoveries

- Plan 05 requires a selected credential model and immutable release before implementation. Preparing the evidence
  for those decisions can finish independently of their approval or the upstream release schedule.

## Decision Log

- Decision: Deliver an evidence document with recommendations and explicit unknowns, without selecting an approved
  credential model or publishing a release. Rationale: The engineer must be able to complete preparation without
  external approval. Date/Author: 2026-09-11, project planning.
- Decision: Keep plan 05 conditional after this plan completes. Rationale: A proposal does not establish approval,
  release provenance, credential availability, or successful adoption. Date/Author: 2026-09-11, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`.github/workflows/sync-execplans.yml` runs the current writer on the default branch and serializes its executions.
`package.json` exposes `plans:sync`; `scripts/plans/sync-project.ts` discovers the plans and invokes
`ExecPlanSynchronizer` in `scripts/plans/sync.ts`. `scripts/plans/execplan.ts` derives readiness from repository
progress. The GitHub adapter is `scripts/plans/github-project-api.ts`.

Generated issue descriptions, synchronization labels, Project membership, and Status belong to the current writer. It preserves
human scheduling fields and assigned work in progress. Plan 05 proposes replacing that writer with the public
`TupoSoft/execplan-sync` Action. Its recorded credential and GitHub subscription assumptions must be checked again
instead of being treated as current facts.

The source plan is `.agents/plans/plan-sync/05-adopt-reusable-execplan-sync-action.md`. Its full release SHA,
tokenless validation, private data, and single-writer requirements remain authoritative. This task does not run
that migration. The document is a handoff for the repository maintainer and the person responsible for GitHub
credentials; use a named owner only when the project has actually identified one.

## Scope and Non-Goals

Add `docs/maintenance/execplan-sync-adoption-inputs.md`, link it from the plan-sync README, and update this plan's
progress and evidence in one pull request. The document contains an evidence inventory, a credential comparison,
a release checklist, and a decision table with responsible roles and precise questions.

Workflow edits, App configuration, token creation, subscription changes, release publication, and writer replacement
are outside this task. GitHub issues and Project fields remain untouched. No production environment,
runtime service, database change, or new dependency is needed. Do not copy private plan bodies or credential values
into the document. This preparation does not authorize messages to other people.

## Plan of Work

First inspect the source files above and record the reviewed commit, writer trigger, input contract, managed fields,
and required repository and Project permissions. Capture source paths and symbols instead of secrets. Separate
repository facts from external configuration that cannot be established through source inspection.

Compare the approaches already named in plan 05: a repository-scoped credential, a separately bounded GitHub App,
a trusted coordinator or credential broker, and a subscription change that enables the required protected boundary.
For each, document who can retrieve the credential, which repositories and Projects it can affect, how reviewed
branch restrictions are enforced, operational ownership, known cost implications, and missing evidence. Use current
official GitHub documentation for platform capabilities. Mark facts that cannot be verified as unknown and name
the exact read-only check or owner question that would resolve them. A recommendation must remain visibly proposed.

Inspect the upstream release and tag metadata when accessible. Record an immutable commit and its provenance only
when verified. If the required release is absent or access fails, record that fact, the observation date, and the
remaining release review steps. Do not replace the required release with a convenient branch head. The document
must identify the later review of `action.yml`, bundled code, release checks, and the private consumer boundary.

Finish with a decision table containing the question, evidence reference, observations, verification status, recommendation,
responsible role, and resolution state. Keep approvals pending unless supplied with a verifiable reference. Link
the document from the road map and record completion here. Plan 05 consumes this evidence and remains conditional
until its own credential and release requirements are actually satisfied.

## Interfaces and Dependencies

The only new interface is the Markdown handoff at `docs/maintenance/execplan-sync-adoption-inputs.md`. GitHub
inspection uses existing read-only access. Unavailable access results in an explicit evidence gap and does not
require credential installation to finish the preparation. There are no API, workflow, configuration, or schema
changes. `plan-sync/04` supplies the existing metadata contract; this plan does not depend on plan 05.

## Acceptance Criteria

- A reviewer can trace the current writer and its managed authority to a recorded source revision and concrete files.
- Every compared credential approach identifies its trust boundary, responsible role, and unresolved evidence.
- The release section contains verified provenance or a dated, explicit gap; an absent release is not represented
  as an approved SHA or a failed preparation task.
- Every unresolved choice has a precise question and responsible role. No approval, owner identity, platform
  capability, or cost is invented to make the document appear complete.
- The README links to the delivered document. Plan 05 retains its existing conditional readiness and migration
  boundaries even when this plan's progress is complete.
- The pull request contains only the document, the road map link, and this plan's progress and evidence updates.
  Focused validation passes without a GitHub write or runtime change.

## Validation

Run `corepack pnpm docs:lint -- docs/maintenance/execplan-sync-adoption-inputs.md
.agents/plans/plan-sync/README.md .agents/plans/plan-sync/07-prepare-sync-adoption-decisions.md` and
`corepack pnpm test --runInBand --runTestsByPath scripts/plans/execplan-repository-fixture.spec.ts`. Run `git diff --check`.

Inspect `gh api repos/TupoSoft/execplan-sync/releases` and `gh api repos/TupoSoft/execplan-sync/tags` with existing
read access. Summarize the relevant release identifiers and dates; record unavailable evidence without adding
credentials. Confirm that each platform capability has a current official source and each repository claim has a
path and revision. Review the diff for unintended workflow changes. Confirm that the readiness section of plan 05
still requires the credential decision and immutable release. These read-only checks do not execute the proposed adoption.

Bruno: not applicable — this plan produces preparation documentation without changing HTTP API behavior.

## Idempotence and Recovery

Refresh the same document rather than creating parallel decision records. Preserve dates and identify evidence that
has become outdated. If a read fails, retain the last dated result and add the current gap. Revert the documentation
pull request to remove the packet; no credential, workflow, Project, or application recovery is required.

## Artifacts and Notes

Keep only source links, reviewed revisions, public release metadata, and concise decision evidence. Never record
tokens, private keys, authorization headers, or copied private workflow output. Completion means that the evidence
and questions are ready for review; it does not complete or approve plan 05.

## Plan readiness

Ready to implement
