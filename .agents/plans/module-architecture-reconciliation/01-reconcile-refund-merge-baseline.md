# Reconcile the Concurrent Refund Merge in the Architecture Baseline

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Restore the business-module architecture gate after the refund-accounting pull request and the initial architecture
ratchet were merged in quick succession from branches based on the same earlier revision. After this change, the
baseline records the eight payment-module violations that were already on `master` when the ratchet was adopted, and
the `Validate` job passes without turning the baseline updater into a general debt-growth switch. A developer can
observe the correction by running the updater against the architecture adoption commit, then proving that an
ordinary later source change still cannot grow the baseline.

## Progress

- [x] (2026-08-30) Reproduce the failing architecture check and identify the merge-order cause.
- [x] (2026-08-30) Add focused coverage for the one-time adoption-base reconciliation and its fail-closed boundaries.
- [x] (2026-08-30) Implement the narrow reconciliation guard and update the checked-in baseline from 221 to 229 entries.
- [x] (2026-08-30) Run focused and repository validation, sync the completed plan, and record local evidence.

## Plan dependencies

- `module-architecture/01`
- `payments/06`

## Surprises & Discoveries

- Pull request #433, `fix(payments): honor tax-inclusive refunds`, and pull request #448,
  `feat(architecture): ratchet business module boundaries`, both diverged from commit
  `19535e47d7bbd67e56a70329274d31894eaa5004`. GitHub merged #433 first and #448 second, so the architecture branch's
  221-entry baseline never scanned the four refund-accounting files that had just reached `master`.
- The first combined `master` validation run, GitHub Actions run `33307805377`, reports exactly eight current-only
  violations and no stale entries: four `source-placement` violations and four `layer-dependency` violations in the
  payments module.
- The existing updater correctly refuses the growth. Editing only the JSON would make a local exact-set check pass
  but would still fail the pull-request comparison against the 221-entry base baseline.
- The scanner parses every TypeScript file named by the resolved `tsconfig.json`, including source outside business
  modules, and its resolution also depends on inherited configuration and installed package versions. A three-path
  scanner-input check was therefore too narrow; the implementation uses a whole-branch allowed path set plus
  source-aware candidate validation.
- A repository-wide `**/tsconfig*.json` path specification also matched ignored dependency files below `node_modules`.
  Restricting that ignored-file probe to root TypeScript configurations retained the fail-closed check without making
  a normal installed checkout ineligible.

## Decision Log

- Decision: Treat the eight entries as an initial-adoption reconciliation rather than refactoring the payment module
  in this pull request.
  Rationale: The refund behavior was independently reviewed and merged before the ratchet reached `master`; this task
  is to make the baseline describe that adoption state. The planned payment layering remains owned by
  `module-architecture/09`.
  Date/Author: 2026-08-30, project owner and Codex.
- Decision: Permit baseline growth only when the configured pull-request base is the first baseline-bearing commit in
  all of its parent ancestry. Limit the branch diff to the baseline, its CLI and focused specification, and this plan.
  Rationale: The ancestry condition identifies the adoption window without a hard-coded commit exception or reopening
  a deleted baseline. The whole-tree allowed path set prevents source, configuration, dependency, and scanner-policy
  changes from accompanying the reconciliation.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Require every reconciled key to identify an unchanged source file and require the base baseline to be an
  exact subset of the current scan.
  Rationale: The CLI and focused specification are TypeScript files parsed by the scanner. Source-aware additions and
  an additions-only comparison prevent their allowed edits, or a simultaneous stale waiver, from becoming new debt.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Keep every Git inspection fail-closed once the configured base is available.
  Rationale: A missing parent, unreadable historical file, or failed diff is not evidence that growth is safe.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Implemented locally. The checked-in baseline now has 229 entries: the previous 221 plus four payment
`source-placement` keys and four payment `layer-dependency` keys already present at the adoption commit. Both the
default architecture check and the check with `ARCHITECTURE_BASE_SHA=f80d596a525f279822c4a86031f139ff9264ddbd`
pass for all nine modules. Repeating the updater reports the baseline as current and preserves SHA-256
`910236cfdce6fa6b96a9e0a5d7ddc1dd2f845c970e20ad28624f42aec4ed0859`.

The reconciliation path is narrower than the initial proposal. It requires an existing base and current baseline.
The adoption base must be a single-parent ancestor of `HEAD`, with no earlier baseline anywhere in parent history.
The candidate set must contain additions only, and the branch diff is limited to the baseline, CLI, focused
specification, and this plan.
Every added key must also map to an unchanged source file. The 89 focused tests cover successful reconciliation and
idempotency plus later history, deleted/recreated history, merge history, unrelated tracked, untracked, and ignored
inputs, a changed allowed TypeScript source, unavailable history, and mixed additions and removals.

Focused tests, both architecture modes, lint, type checking, the full Jest suite, build, Harper, Prettier, and
whitespace checks pass locally. Lint reports only two unrelated preexisting missing-return-type warnings. No runtime
application file or architecture scanner rule changed. The helper decomposition keeps Git history inspection, changed
path collection, base comparison, and atomic writing separate; no material SOLID trade-off was found. The `Validate`
run `33309295753` for pull request #451 passed in 3 minutes 10 seconds, including the base-aware architecture gate,
all three PostgreSQL integration stages, the application build, and the production image build.

## Context and Orientation

`scripts/architecture/module-architecture.ts` scans the business modules under `src/libs/modules` and emits stable
violation keys. `scripts/architecture/module-architecture-baseline.json` records the exact accepted set.
`scripts/architecture/check-module-architecture.ts` compares the current scan with that JSON and, when
`ARCHITECTURE_BASE_SHA` is supplied by CI, compares the committed baseline with the base revision too. Its
`--write-baseline` mode creates a first baseline or removes stale entries, but refuses new keys after adoption.

The architecture baseline first reached `master` in commit `f80d596a525f279822c4a86031f139ff9264ddbd`. Its first
parent, `752acee7596538e1377ae83487f26f6604d4d0fb`, already contains the refund-accounting source but not the baseline.
The current scan therefore reports 229 violations while the just-adopted baseline contains 221. The eight missing
keys belong to four payments files added by the refund work; no runtime behavior needs to change here.

An “adoption base” in this plan means an available Git commit that contains the baseline while no commit reachable
from any parent has ever contained it. The reconciliation diff may contain only
`scripts/architecture/module-architecture-baseline.json`, `scripts/architecture/check-module-architecture.ts`,
`scripts/architecture/module-architecture.spec.ts`, and files below
`.agents/plans/module-architecture-reconciliation`. Each added violation must name a source file outside that changed
set, and every base key must remain present. These conditions are narrower than merely checking the baseline's entry
count or its immediate parent.

## Scope and Non-Goals

Change the architecture CLI to recognize one safe reconciliation case, add fixture tests for that case and its
rejections, and add the eight stable payment keys to the baseline. Update this ExecPlan with the actual validation
evidence and synchronize it to GitHub.

Do not move or redesign payment source, alter the architecture rules or stable-key format, or change a module README.
Do not add a general override environment variable, hard-code a commit SHA, or weaken exact-set and cross-revision
checks for later pull requests. Do not change endpoints, DTOs, authorization, persistence behavior, payment
calculations, provider events, database schema, dependencies, or runtime configuration.

## Plan of Work

First, extend the fixture suite in `scripts/architecture/module-architecture.spec.ts`. Create a history where a
module violation exists before the first baseline commit, then run `--write-baseline` from a descendant whose scanner
inputs are unchanged. Assert that the updater reconciles the additions-only set and that the default and base-aware
checks pass. Reject reconciliation when any parent ancestry previously contained a baseline or the current set also
removes a base key. Add cases where an added key comes from a changed allowed TypeScript file and where a path outside
the reconciliation path set changed after the adoption base. Preserve the existing unavailable-base and
malformed-history coverage.

Then refactor the base comparison in `scripts/architecture/check-module-architecture.ts` to return whether the
comparison matches and whether a current-only set is eligible for adoption reconciliation. Resolve every base parent
through argument-array Git calls and prove that no reachable ancestor has baseline history. Collect the full changed
path set relative to the base, including untracked files, and reject paths outside the narrow reconciliation path
set. Map every added key back to its current violation and reject an addition sourced from a changed file.
Expected “no prior history” and allowed-path states are explicit; every other Git failure throws and is reported by
the existing CLI error boundary.

Allow `--write-baseline` to atomically replace an existing baseline when, and only when, the base comparison grants
that reconciliation, the current scan has additions, and it has no removals relative to either the base or checked-in
baseline. Emit a distinct reconciliation message and permit the same verified result in read-only check mode, which
is what CI runs. Keep normal growth rejection, shrink behavior, exact current-tree comparison, and byte-level
idempotency unchanged. Run the guarded updater against `f80d596a525f279822c4a86031f139ff9264ddbd` to update
`scripts/architecture/module-architecture-baseline.json` from 221 to 229 sorted entries.

Finally, run focused architecture tests, the updater twice, the default and base-aware gates, formatting, Harper,
lint, type checking, the full Jest suite, and the production build. Review the diff for accidental runtime or SOLID
scope expansion, update this living plan, synchronize its issue, and deliver one follow-up pull request.

## Interfaces and Dependencies

No HTTP, module barrel, application service, persistence, provider, or database interface changes. The behavior change
is internal to the repository CLI. `architecture:baseline` may report a successful adoption reconciliation when
`ARCHITECTURE_BASE_SHA` names the first baseline-bearing commit, the diff stays within the approved path set, every
addition comes from an unchanged source, and no base key is removed. The existing `ARCHITECTURE_BASE_SHA` contract
remains the only configuration input. No package or lockfile change is planned.

## Acceptance Criteria

- The checked-in baseline has 229 sorted, unique stable keys and exactly matches the current nine-module scan.
- With `ARCHITECTURE_BASE_SHA=f80d596a525f279822c4a86031f139ff9264ddbd`, `architecture:baseline` accepts the eight
  violations already present at that adoption base and emits a distinct reconciliation result.
- Repeating the updater leaves the baseline byte-identical, and both default and base-aware architecture checks pass.
- Baseline growth is rejected when any base-parent ancestry previously contained a baseline.
- Baseline growth is rejected for a simultaneous removal, for an added key sourced from a changed allowed TypeScript
  file, or when any path outside the reconciliation path set differs from the adoption base.
- Unavailable base context retains its documented limited behavior, while malformed history and Git inspection
  failures remain fail-closed.
- No runtime application, API contract, database schema, package dependency, or business-module documentation changes.
- Focused tests, lint, type checking, the full Jest suite, production build, formatting, Harper, and whitespace checks
  pass.

## Validation

Run the focused unit suite:

    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/architecture/module-architecture.spec.ts --runInBand

Run the real baseline reconciliation and repeat it to prove byte-level idempotency:

    env ARCHITECTURE_BASE_SHA=f80d596a525f279822c4a86031f139ff9264ddbd COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm architecture:baseline
    first_hash=$(sha256sum scripts/architecture/module-architecture-baseline.json)
    env ARCHITECTURE_BASE_SHA=f80d596a525f279822c4a86031f139ff9264ddbd COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm architecture:baseline
    test "$first_hash" = "$(sha256sum scripts/architecture/module-architecture-baseline.json)"

Run both architecture check modes:

    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm architecture:check
    env ARCHITECTURE_BASE_SHA=f80d596a525f279822c4a86031f139ff9264ddbd COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm architecture:check

Run repository validation:

    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm typecheck
    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm lint
    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm build

Run prose, formatting, and whitespace checks:

    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm docs:lint -- .agents/plans/module-architecture-reconciliation/README.md .agents/plans/module-architecture-reconciliation/01-reconcile-refund-merge-baseline.md
    env PLANS_DRY_RUN=true COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm plans:sync
    env COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm exec prettier --check scripts/architecture/check-module-architecture.ts scripts/architecture/module-architecture.spec.ts scripts/architecture/module-architecture-baseline.json .agents/plans/module-architecture-reconciliation/README.md .agents/plans/module-architecture-reconciliation/01-reconcile-refund-merge-baseline.md
    git diff --name-only f80d596a525f279822c4a86031f139ff9264ddbd
    git diff --check

No Bruno collection applies because this work changes only repository architecture tooling and its debt inventory,
not externally observable HTTP behavior.

## Idempotence and Recovery

The baseline writer retains its temporary-sibling and atomic-rename behavior. A successful repeated reconciliation
must report that the baseline is current and leave identical bytes. Interrupted work can be retried after deleting
only a leftover `scripts/architecture/module-architecture-baseline.json.tmp`, if one exists; the checked-in baseline
remains intact until rename. Tests use isolated temporary Git repositories and require no cleanup. Revert this single
pull request to restore the previous CLI and 221-entry baseline; no database, container, credential, or external
runtime state is created.

## Artifacts and Notes

- Combined `master` workflow failure: GitHub Actions run `33307805377`.
- Successful pull-request workflow: #451, GitHub Actions run `33309295753`.
- Synced implementation issue: #450.
- Architecture adoption commit: `f80d596a525f279822c4a86031f139ff9264ddbd`.
- Refund-accounting parent commit: `752acee7596538e1377ae83487f26f6604d4d0fb`.
- Baseline transition: 221 to 229 entries, consisting of four `source-placement` and four
  `layer-dependency` keys.
- Reconciled baseline SHA-256: `910236cfdce6fa6b96a9e0a5d7ddc1dd2f845c970e20ad28624f42aec4ed0859`.

## Plan readiness

Ready to implement
