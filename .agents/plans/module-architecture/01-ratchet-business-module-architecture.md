# Ratchet Business-Module Architecture

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Developers should receive an immediate, deterministic failure when a change introduces a new business-module
boundary violation. After this change, `corepack pnpm architecture:check` scans the contract described by
`src/libs/modules/README.md`, accepts the repository's existing debt only through an itemized baseline, rejects both
new violations and stale baseline entries, and runs in the existing validation workflow and pre-commit hook. A
developer can observe the gate by running the command on the current tree, then exercising its fixture tests for new,
resolved, and baseline-growth cases. Coding agents receive the same workflow through a concise root `AGENTS.md`
bridge and scoped `src/libs/modules/AGENTS.md` instructions that point to the executable contract instead of
restating it.

## Progress

- [ ] (2026-08-29) Clarify the enforceable module-layer contract and its narrow root exceptions.
- [ ] (2026-08-29) Publish root and module-scoped agent instructions for applying and validating the contract.
- [ ] (2026-08-29) Implement and test the architecture scanner, diagnostics, baseline comparison, and shrink-only updater.
- [ ] (2026-08-29) Capture the current violation baseline and wire the check into local and GitHub validation.
- [ ] (2026-08-29) Run focused and repository validation, then record the final rule counts and enforcement evidence.

## Plan dependencies

- `module-boundaries/08`
- `module-readmes/01`

## Surprises & Discoveries

- The literal statement that every module must contain all four layer directories would currently report 26 missing
  directories. Git does not track empty directories, and modules such as `auth` intentionally own no controller, so
  mandatory empty layers are not a durable enforcement mechanism.
- A source-tree inspection found 129 production TypeScript files outside the proposed layer locations after allowing
  each barrel and matching root composition module. It also found 29 controllers or DTOs outside `api` and 22
  cross-module deep-import occurrences across eight files. These shell-derived counts are preliminary; the scanner's
  deterministic per-rule report will be the authoritative baseline evidence.
- Production imports make `auth` and `bff-session` a cyclic module component. The baseline must record the component
  without legitimizing it as a supported direction.
- TypeScript and Jest retain wildcard aliases for every business module, so type checking currently permits deep
  imports. Those mappings cannot be removed until their consumers are migrated, but an independent scanner can reject
  new uses immediately.
- The repository already has TypeScript, ts-node, Jest, and full-history CI checkout, so the checker needs no new
  package.
- Live GitHub API checks found that `TupoSoft/LeadEmailFinder` is private and that both the master branch-protection
  endpoint and repository rule set endpoint return HTTP 403 with “Upgrade to GitHub Pro or make this repository
  public.” A failing workflow is useful evidence but is not currently a merge restriction that cannot be bypassed.

## Decision Log

- Decision: Treat `api`, `application`, `domain`, and `infrastructure` as the only allowed production layers, but
  require only layers a module actually uses. Permit `src/index.ts` and an optional
  `src/<module-name>.module.ts` composition root outside them.
  Rationale: this enforces source ownership rather than untracked empty directories and gives Nest wiring one explicit
  location without making arbitrary root files legal.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Implement one repository-local TypeScript scanner instead of adding an ESLint boundary plug-in.
  Rationale: a single scanner can validate filesystem structure, Markdown catalogs, resolved imports, dependency
  cycles, and an exact set baseline. The installed TypeScript compiler API supplies parsing and module resolution.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Identify a violation by rule, normalized repository-relative source, offending target or specifier, and
  an occurrence ordinal when identical violations repeat. Exclude line and column from the identity.
  Rationale: diagnostics should show current positions, while harmless line movement must not masquerade as new and
  resolved debt.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Require exact equality between the current violation set and the checked-in baseline. Treat a current-only
  key as new debt and a baseline-only key as a resolved violation whose stale waiver must be removed.
  Rationale: count-only or subset checks allow one violation to replace another or allow fixed debt to be
  reintroduced.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Make the baseline updater shrink-only and make CI compare the committed baseline with the baseline at the
  pull request base or preceding master commit.
  Rationale: a contributor must not be able to introduce debt and make CI green merely by regenerating the baseline.
  The absent-base-baseline case is allowed once for this bootstrap plan.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Exempt tests from source placement, layer direction, and technical-package restrictions, but enforce
  cross-module public barrels in tests as well as production code.
  Rationale: integration tests may deliberately compose concrete layers, while deep imports still create unsupported
  contracts and make refactoring unsafe.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Do not add inline suppressions, per-file exceptions, or a general baseline-growth switch.
  Rationale: a legitimate policy change must update the human contract, scanner, tests, and implementation without
  silently widening existing debt.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Add a short business-module trigger to the root `AGENTS.md` and put the detailed workflow in
  `src/libs/modules/AGENTS.md`; the root trigger explicitly requires agents working on or importing a business module
  to read the scoped file.
  Rationale: agents commonly start at the repository root, so scoped instructions cannot be the only discovery path.
  Keeping the rule matrix in `src/libs/modules/README.md` and making both instruction files point to it avoids a
  second architecture contract that can drift.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/README.md` defines nine business modules, four architectural layers, inward dependencies, module
documentation, and `src/index.ts` as the public boundary. The current tree has all nine module README files and
barrels, but its layout predates the contract: several modules remain flat, email verification is grouped by workflow
rather than layer, and application/domain files import framework and persistence packages directly.

`tsconfig.json` maps both each bare module alias and a wildcard below it. `jest.config.ts` mirrors those mappings.
The wildcard mappings are compatibility infrastructure for current debt and are therefore not evidence that a deep
import is supported. The executable API host at `src/lead-email-finder-api` is outside a business module and consumes
module barrels as the application composition root.

The existing `Validate` workflow in `.github/workflows/validate.yml` checks out full history and runs lint,
typecheck, Jest, build, and image build. `.husky/pre-commit` currently runs affected Jest tests. The new checker will
be a dedicated command in both places rather than being hidden inside ESLint.

The root `AGENTS.md` currently supplies general SOLID, adapter, controller, testing, and ExecPlan guidance, but it
does not require an agent to read the business-module contract, identify an owning layer and public boundary, or run
an architecture command. There is no `src/libs/modules/AGENTS.md`. This plan adds those workflow instructions
alongside the README and command so all three describe the same enforceable policy.

A “production TypeScript file” in this plan is a `.ts` file that is not below `__tests__` and does not end in
`.spec.ts` or `.test.ts`. The scanner still examines test imports for cross-module boundary violations.

## Scope and Non-Goals

Revise `src/libs/modules/README.md` to say that unused layers may be absent, define the root barrel/composition
exceptions, make the layer dependency matrix explicit, and document the architecture command and ratchet semantics.
Add a concise trigger to the root `AGENTS.md` and create `src/libs/modules/AGENTS.md` so coding agents read that
canonical guide, identify the owner, layer, public contract, and dependency direction before editing, and run the
same architecture gate before completion. The scoped instructions must explain how to shrink resolved debt without
allowing baseline growth, but must not duplicate the guide's package-prefix list or dependency matrix.
Add the scanner, its focused Jest specification, its CLI, and the initial JSON baseline under
`scripts/architecture/`. Add `architecture:check` and `architecture:baseline` package scripts. Run the check from
`.husky/pre-commit` and from an explicit step in the existing `validate` job.

This pull request does not move source files, fix any existing architecture violation, change module exports, remove
TypeScript or Jest wildcard aliases, add a generator, or redesign Nest providers. It does not change routes, DTOs,
authorization, persistence, queues, configuration, provider calls, or application runtime behavior. It does not
claim to prove semantic qualities such as single responsibility or the accuracy of module ownership prose. It adds
no package, TypeORM migration, database reset, Docker fixture, Bruno request, GitHub billing change, repository
visibility change, branch protection, or rule set.

## Plan of Work

First, make `src/libs/modules/README.md` a precise human counterpart to the checker. State that modules create only
the layers they need. Allow only `src/index.ts` and the matching optional root Nest module outside those layers.
Document the dependency matrix, controller/DTO placement, framework-free application/domain intent, bare-barrel
cross-module rule, test treatment, and the fact that baseline entries are temporary debt rather than supported
exceptions.

Then update the root `AGENTS.md` with a business-module trigger that applies whenever a task edits a module or imports
one from elsewhere. It requires reading `src/libs/modules/AGENTS.md`, the canonical modules guide, and the affected
module README before coding. Create `src/libs/modules/AGENTS.md` with the concrete agent workflow. Require agents to
name the owning module, target layer, public surface, and dependency direction and to keep application and domain
framework-independent. They must put technical integrations behind injected ports and adapters, use only bare public
barrels across modules, preserve contracts outside the plan, and run `architecture:check`, focused tests, and
typecheck before finishing. When a remediation produces only stale baseline entries, the instructions may direct the
agent to the shrink-only `architecture:baseline` command. They must forbid new or broadened baseline entries and
require a new or updated ExecPlan when a requested design cannot fit the contract. Keep detailed rule definitions in
the modules guide rather than copying them into either instruction file. These commands are interfaces delivered by
this plan and are validated only after their package scripts and implementations exist.

Then implement `scripts/architecture/module-architecture.ts`. Discover immediate module directories and validate
kebab-case names, `README.md`, `src`, `src/index.ts`, the root catalog, and the standard README sections. Treat the
catalog-level `README.md` and `AGENTS.md` as documentation rather than module entries, and cover the new scoped file in
a discovery fixture so its presence cannot change the module inventory. Parse TypeScript with the compiler API, load
compiler options from `tsconfig.json`, and resolve relative and aliased module specifiers. Scan static imports,
type-only imports, export declarations, import-equals declarations, literal `import()` and `require()` calls, and
literal Jest mock/require calls. Normalize all stored paths to `/` and stop with an error on any parse or resolution
failure relevant to a boundary decision.

Apply these source rules:

- Production files live in `api`, `application`, `domain`, or `infrastructure`, except the barrel and matching root
  composition module.
- Production `*.controller.ts` and `*.dto.ts` files live below `api`.
- Within one module, `api` may import `api`, `application`, and `domain`; `application` may import `application` and
  `domain`; `domain` may import only `domain`; and `infrastructure` may import `infrastructure`, `application`, and
  `domain`. Layer files may not import the module root. The root composition module may compose every own layer.
- Application and domain files may not import package prefixes `@automapper/`, `@aws-sdk/`, `@nestjs/`, `@paddle/`,
  `axios`, `bullmq`, `class-transformer`, `class-validator`, `express`, `ioredis`, `jose`, `multer-s3`, `nestjs-s3`,
  `pg`, `pino`, or `typeorm`. They also may not import the internal technical aliases rooted at
  `@tuposoft/lead-email-finder/catch-all`, `config`, `dns`, `key`, `redis`, or `socket`. The shared `common` contracts
  and bare public business-module barrels remain allowed.
- A consumer outside a target module may import that module only through
  `@tuposoft/lead-email-finder/modules/<target>`. A deeper alias and any relative cross-module import are violations.
  An internal deep alias that targets the importing file's own module is allowed.
- A module barrel may export only relative paths that resolve inside its own module.
- Every production module-to-module edge must be linked in the source module's README Dependencies section. Extra
  documented capability dependencies are allowed because some runtime contracts arrive through shared tokens.
- The production module graph must be acyclic. Report one stable key for each cyclic strongly connected component,
  using its sorted module names rather than an incidental traversal path.

Represent each violation with a stable key and a separate diagnostic containing its current line and column. When
two identical violations occur in one source, append an AST-order occurrence ordinal so duplication cannot hide
behind one baseline key. Sort keys before comparing or writing. The baseline JSON has a schema version and a sorted,
unique list; reject unknown versions, malformed entries, duplicates, and incorrect ordering.

Implement `scripts/architecture/check-module-architecture.ts` as the CLI. Its default mode scans and compares exact
sets, prints grouped new and stale diagnostics, and exits nonzero for either difference. Its `--write-baseline` mode
creates the initial baseline when absent, but once present refuses current-only keys and writes only the smaller
current set through a temporary sibling followed by an atomic rename. Repeating the update with no changes must
produce byte-identical JSON.

When `ARCHITECTURE_BASE_SHA` is a nonzero 40-character commit SHA, load the earlier baseline with
`git show <sha>:scripts/architecture/module-architecture-baseline.json` using an argument-array process call. Reject
every current baseline key not found in that earlier baseline. Permit a missing earlier file only when bootstrapping
this first plan. Empty or unavailable base context skips only this cross-revision comparison; current-tree exact-set
validation always runs.

Use temporary fixture repositories in `scripts/architecture/module-architecture.spec.ts`; do not commit a second
sample architecture tree. Cover compliant and violating structure, every allowed and denied layer edge, technical
package prefixes, import forms, boundary resolution, documentation edges, cycles, stable keys, malformed input,
exact comparison, shrink-only writes, growth rejection, and bootstrap behavior.

Finally, add the two package scripts without changing dependencies or `pnpm-lock.yaml`. Add
`corepack pnpm architecture:check` to `.husky/pre-commit`. Add a named “Check module architecture” workflow step
before general lint and pass:

    ARCHITECTURE_BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}

Generate and review the initial baseline, rerun the default command, and record scanner-derived counts in this living
plan. Do not edit application files merely to reduce the bootstrap baseline; those changes belong to later plans.

## Interfaces and Dependencies

`module-architecture.ts` exposes pure scanning and comparison functions to its Jest specification. The public command
interfaces are:

    corepack pnpm architecture:check
    corepack pnpm architecture:baseline

The check command is read-only. The baseline command is the only mode that writes
`scripts/architecture/module-architecture-baseline.json`, and after bootstrap it may only remove keys. Diagnostics
name the rule, repository-relative source, current line and column when available, offending target, and whether the
key is new or stale.

The baseline format has `schemaVersion: 1` and a `violations` array of stable strings sorted in lexicographical order.
A key contains the rule ID, normalized source or module identity, target/specifier, and duplicate occurrence when
needed; it never contains absolute paths or line numbers.

No runtime interface, environment variable, package dependency, TypeScript alias, Jest mapping, endpoint, database
contract, or Nest injection token changes. `ARCHITECTURE_BASE_SHA` is a CI-only checker input; it is not application
configuration. The developer-facing instruction surfaces are the root `AGENTS.md`, which provides the repository-wide
trigger, and `src/libs/modules/AGENTS.md`, which defines the scoped workflow while treating
`src/libs/modules/README.md` and `architecture:check` as authoritative.

## Acceptance Criteria

- The modules guide and scanner agree on optional layers, root exceptions, the dependency matrix, API placement,
  technical dependencies, public barrels, test treatment, and ratchet behavior.
- The root `AGENTS.md` requires agents editing or importing business modules to read
  `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and the affected module README before coding.
- `src/libs/modules/AGENTS.md` requires agents to identify ownership, layer, public surface, and dependency direction;
  run the architecture gate and focused validation; shrink only stale debt; and stop rather than accept new debt.
  Neither instruction file duplicates the canonical dependency matrix or technical-package list.
- The scanner ignores the catalog-level `src/libs/modules/AGENTS.md` as documentation and still discovers exactly the
  business-module directories.
- A compliant fixture containing only the layers it needs produces no violation; empty placeholder directories are
  unnecessary.
- Every structural, placement, direction, technical-package, public-boundary, documentation-edge, barrel-escape, and
  module-cycle rule described above has a focused positive and negative test.
- The current repository passes `architecture:check` with a nonempty, deterministic, itemized baseline.
- A violation absent from the baseline fails with a new-debt diagnostic. Removing a known violation without shrinking
  the baseline fails with a stale-entry diagnostic.
- `architecture:baseline` removes resolved keys deterministically, refuses new keys, and is byte-idempotent when
  rerun.
- With a base SHA, CI rejects any baseline key not present at that revision. The first adoption works when the base
  revision has no baseline, but subsequent deletion and recreation cannot bypass the base comparison.
- Test-only layer composition is accepted, while a test that deep-imports another module fails.
- Parse, resolution, baseline-schema, duplicate-key, and baseline-order failures stop the check rather than silently
  reducing coverage.
- The pre-commit hook and the existing `validate` job invoke the same check command. A failed workflow is reported,
  without claiming GitHub blocks merge or direct push under the repository's current private-plan limitation.
- `package.json` gains no dependency, `pnpm-lock.yaml` is unchanged, and application TypeScript/runtime files are
  unchanged.
- Existing lint, typecheck, Jest, build, documentation lint, formatting, and whitespace checks pass.

## Validation

Run the focused architecture specification with temporary paths pinned to `/tmp`:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/architecture/module-architecture.spec.ts --runInBand

Generate the bootstrap baseline once, inspect its grouped rule counts and diff, and prove stable default and repeated
update behavior:

    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    baseline_sha_before="$(sha256sum scripts/architecture/module-architecture-baseline.json)"
    corepack pnpm architecture:baseline
    test "$baseline_sha_before" = "$(sha256sum scripts/architecture/module-architecture-baseline.json)"
    git diff --check

The hash comparison proves that the second baseline command makes no byte-level change. The focused fixtures must
explicitly prove new-debt, stale-entry, base-growth, duplicate-import, malformed-baseline, parse-failure, and
missing-base bootstrap scenarios; do not create probe violations in real module files.

Run repository validation:

    corepack pnpm lint
    corepack pnpm typecheck
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    git diff --check

Validate all materially edited English Markdown with Harper and check its formatting:

    corepack pnpm docs:lint -- AGENTS.md src/libs/modules/AGENTS.md src/libs/modules/README.md .agents/plans/module-architecture/README.md .agents/plans/module-architecture/01-ratchet-business-module-architecture.md
    corepack pnpm exec prettier --check AGENTS.md src/libs/modules/AGENTS.md src/libs/modules/README.md .agents/plans/module-architecture/README.md .agents/plans/module-architecture/01-ratchet-business-module-architecture.md

Inspect the instruction bridge and scoped workflow directly:

    test -f src/libs/modules/AGENTS.md
    rg -n -F "src/libs/modules/AGENTS.md" AGENTS.md
    rg -n -F "src/libs/modules/README.md" AGENTS.md src/libs/modules/AGENTS.md
    rg -n -F "architecture:check" src/libs/modules/AGENTS.md
    rg -n -F "architecture:baseline" src/libs/modules/AGENTS.md

Inspect `git diff --name-only` and `git diff -- package.json pnpm-lock.yaml` to confirm there is no dependency or
lockfile change and no application TypeScript/runtime source change. Inspect the workflow diff to confirm the base SHA
expression and full-history checkout remain present. The eventual pull request's live workflow proves GitHub
execution; under the verified private-repository limitation, branch-protection enforcement remains unavailable
rather than unverified.

No container, database, or Bruno execution is required. Bruno is not applicable because this plan changes internal
architecture tooling and documentation without changing HTTP behavior.

## Idempotence and Recovery

The default checker is read-only and safe to repeat. Fixture tests create isolated temporary directories and remove
them in `finally` blocks. The baseline updater sorts output and uses a temporary sibling plus atomic rename, so a
completed rerun is byte-identical.

If baseline generation is interrupted, preserve unrelated changes, remove only the checker's known temporary sibling
after confirming its exact path, and rerun the updater. If the committed baseline is malformed or accidentally
expanded, restore that one file from the current branch's prior commit and rerun `architecture:check`; do not make
application changes merely to accommodate a tool failure. If the scanner reports a new violation during this
bootstrap PR, fix the checker-induced or incidental change rather than adding the key after the initial baseline is
reviewed.

No command mutates a database, queue, object store, container, GitHub setting, or deployed environment. A failed CI
base comparison is recovered by removing added debt or correcting an unintended baseline edit, not by bypassing the
comparison.

## Artifacts and Notes

Record the final baseline count grouped by rule, the stable checker output, focused-test count, full validation
results, the final root/scoped agent workflow, exact Harper command/result, and the live workflow result. Keep one
concise note that the GitHub protection and rule set APIs returned HTTP 403 for this private repository so later work
does not mistake a green workflow for a merge policy that cannot be bypassed. Do not record tokens, absolute
developer-specific paths in the baseline, or unrelated repository state.

## Plan readiness

Ready to implement.
