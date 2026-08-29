# Retire the Module-Architecture Baseline

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Turn module architecture from a ratcheted debt policy into a permanent zero-violation invariant. After every module
cleanup is complete, the repository no longer carries a violation baseline or a command that can rewrite one;
`corepack pnpm architecture:check` scans the current tree and fails on any violation. A developer can observe the
result through an absent `scripts/architecture/module-architecture-baseline.json` and strict checker fixtures that
reject each forbidden edge. A clean repository-wide run also proves unchanged end-to-end application behavior across
the major HTTP, queue, SMTP, storage, identity, proxy, and payment workflows. Active root and module-scoped
`AGENTS.md` guidance contains no baseline-maintenance path, and the scoped workflow requires every coding agent to
finish with a clean strict check.

## Progress

- [ ] (2026-08-29) Reconcile the final checker report and prove every prerequisite removed its assigned violation keys.
- [ ] (2026-08-29) Remove the baseline artifact, shrink-only updater, bootstrap path, and base-revision debt logic.
- [ ] (2026-08-29) Make `architecture:check` require zero violations and strengthen strict regression fixtures.
- [ ] (2026-08-29) Update agent instructions, architecture documentation, and CI for the permanent zero-violation invariant.
- [ ] (2026-08-29) Complete focused, full, runtime, Bruno, documentation, and recovery validation.

## Plan dependencies

- `module-architecture/05`
- `module-architecture/08`
- `module-architecture/09`
- `module-architecture/11`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Delete `scripts/architecture/module-architecture-baseline.json` rather than commit an empty baseline.
  Rationale: An empty debt artifact implies that future exceptions can be recorded there. Strict enforcement needs no
  exception inventory because the only accepted violation count is zero.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Remove the `architecture:baseline` package command and its shrink/bootstrap implementation after the last
  violation is gone. Keep `architecture:check` as the single public architecture command.
  Rationale: A rewrite command is useful while retiring known debt but becomes an unnecessary escape hatch under a
  permanent zero-violation policy.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Remove `ARCHITECTURE_BASE_SHA` and the CI comparison that rejects baseline keys absent from the base
  revision; the check should inspect only the current source and require an empty result.
  Rationale: Base-revision logic protects a shrinking baseline. Once the baseline is gone, it adds complexity without
  strengthening the invariant.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Express legitimate composition-root and test-fixture behavior in the checker rules defined by the module
  contract, never as inline suppressions, ignored paths, or replacement allow lists.
  Rationale: A structural rule can distinguish an intended boundary from a violation consistently; local exemptions
  reintroduce untracked debt.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep the same rule set, stable diagnostics, nonzero exit behavior, package command, and required CI
  position introduced by plan 01; change only the accepted count and remove transitional machinery.
  Rationale: Developers should not learn a second enforcement tool when the ratchet reaches zero.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the root `AGENTS.md` bridge unless it contains stale ratchet wording, and update
  `src/libs/modules/AGENTS.md` to remove the shrink-only baseline workflow while preserving its pointer to the
  canonical module contract.
  Rationale: current coding-agent instructions must describe the command that exists after this pull request; leaving
  a removed updater in active guidance would create an unsafe and impossible completion path.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Make no application, schema, queue, provider, or configuration change and add no migration or rollout
  mechanism.
  Rationale: This plan closes enforcement after the behavior-preserving module refactors; it must not hide new feature
  work inside the final validation pull request.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 01 introduces `scripts/architecture/module-architecture.ts`,
`scripts/architecture/check-module-architecture.ts`, focused tests, the `architecture:check` command, and the exact
debt file `scripts/architecture/module-architecture-baseline.json`. The baseline schema stores unique, stable
violation keys in lexicographical order. While debt exists, the default check requires exact equality between current
violations and that file: a current-only key is new debt and a baseline-only key is stale debt. The separate
`architecture:baseline` command may only shrink the set after bootstrap. CI passes `ARCHITECTURE_BASE_SHA` so a pull
request cannot introduce a key that was absent from its base revision.

Plans 02 through 11 remove the legacy edges in bounded pull requests. Plan 05 completes proxy contracts; plan 08
seals identity persistence after the auth/BFF, credits, onboarding, and service-client consumers use ports; plan 09
layers the final payment behavior; and plan 11 completes email-verification delivery after plan 10 extracts its core.
Because those dependencies transitively include every earlier cleanup, this plan begins only when the baseline is
expected to contain zero entries and the ordinary checker already passes.

The permanent architecture contract remains in `src/libs/modules/README.md`. The Validate workflow and pre-commit
hook remain enforcement signals, but the verified GitHub plan currently provides no branch-protection or rule set API
that can make the workflow an unavoidable merge boundary. This plan removes only the temporary debt-accounting path
and proves the complete repository still meets both architecture and runtime contracts.

Plan 01 also adds a root `AGENTS.md` trigger and `src/libs/modules/AGENTS.md` workflow. During the ratchet phase, the
scoped instructions allow the shrink-only baseline command only for stale entries produced by removing known debt and
forbid baseline growth. Once this plan removes the updater, the root bridge must remain valid and the scoped file must
require only the strict read-only check; neither file may contain active baseline-maintenance direction.

## Scope and Non-Goals

Verify zero current violations and simplify the architecture checker to reject any nonempty scan result. Delete the
baseline JSON, shrink/bootstrap updater, package command, base-SHA input, and their obsolete tests. Add strict clean
and violating fixtures; update CI and the module-scoped `AGENTS.md` instructions; audit the root `AGENTS.md` bridge;
update module architecture documentation, the road map, plan outcomes, and developer guidance; and run the final
repository-wide validation matrix.

Do not weaken, rename, or exclude an architecture rule to reach zero. Do not add another baseline, allow list,
grandfathered path, warning mode, inline suppression, or changed-files-only scan. Do not refactor application code in
this pull request; a discovered violation means a prerequisite is incomplete and must be corrected there or in a new
bounded ExecPlan. Do not change routes, schemas, permissions, queues, S3 behavior, providers, configuration, Docker
topology, dependencies, migrations, backfills, production rollout, or production recovery.

## Plan of Work

First run the existing ratcheted checker and print the normalized scan result through its tested internal API. Require
that both the current list and baseline `violations` array are empty. If either contains a key, map it back to the
owning prerequisite and stop; do not modify the scanner, delete the key, or broaden a rule to force this plan
forward.

Refactor `scripts/architecture/module-architecture.ts` so the scan and deterministic diagnostic formatting remain,
but baseline loading, schema validation, current-versus-baseline comparison, base-revision inspection, bootstrap,
and shrink update code are removed. Refactor `check-module-architecture.ts` to scan the complete repository, print
every stable violation in sorted order, and exit nonzero whenever the list is nonempty. Preserve actionable rule,
source module/path, and forbidden target/specifier detail in diagnostics.

Delete `scripts/architecture/module-architecture-baseline.json`. Remove `architecture:baseline` from `package.json`
and remove any updater CLI file that has no strict-check responsibility. Remove `ARCHITECTURE_BASE_SHA` setup from
`.github/workflows/validate.yml`; keep the architecture check in the required validation job and keep complete-tree
behavior. Search scripts, workflows, plans, module documentation, and tests for stale baseline/bootstrap/shrink
instructions. Audit the root `AGENTS.md` bridge and update it only if it contains transitional wording. Update
`src/libs/modules/AGENTS.md` in the same pass: retain the requirement to read the canonical modules guide and affected
module README, identify ownership and dependency direction, and run focused validation, but remove every instruction
to invoke or maintain a baseline. Require `architecture:check` to pass with zero violations and direct an agent that
cannot satisfy the contract to update or create an ExecPlan rather than add an exception.
Historical completed ExecPlans retain truthful recorded evidence, but current developer guidance must describe the
zero-violation command.

Update `scripts/architecture/module-architecture.spec.ts` with a clean multi-module fixture. Add focused fixtures for
every rule category: invalid top-level folder, cross-module private/deep import, forbidden layer edge,
framework/infrastructure import from domain or application, invalid public barrel, and composition-root misuse.
Each violating fixture must fail without a baseline and identify the stable source/target. Add a repository fixture
that scans the actual checkout and expects an empty list.

Update the active guidance in `AGENTS.md`, `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and
`.agents/plans/module-architecture/README.md` so agents and contributors run only
`corepack pnpm architecture:check` and understand that any violation fails the local gate and Validate workflow. Do
not claim that GitHub blocks merge or direct push unless repository capabilities are verified again and configured.
Then run the final static, full, PostgreSQL, Compose, Bruno, and documentation matrix. No runtime code should differ
in this plan; any behavior failure is evidence of incomplete prerequisite validation, not permission to suppress the
test.

## Interfaces and Dependencies

The sole public developer interface becomes:

    corepack pnpm architecture:check

It exits zero only when the complete repository scan reports zero violations; otherwise it prints sorted actionable
diagnostics and exits nonzero. `corepack pnpm architecture:baseline`,
`scripts/architecture/module-architecture-baseline.json`, and `ARCHITECTURE_BASE_SHA` cease to exist. The checker
continues to implement the exact module contract and rule categories established by plan 01.

No application TypeScript API, HTTP API, queue, database, storage, provider, environment variable, or external
dependency changes. The plan depends on the last cleanup for each transitive branch of the road map and unlocks the
permanent required architecture gate with no legacy allowance. The root and module-scoped `AGENTS.md` files remain
developer instruction surfaces, but their only architecture command is the read-only strict check.

## Acceptance Criteria

- The actual repository scan returns an empty violation list before transitional code is removed.
- `scripts/architecture/module-architecture-baseline.json` is absent, not present with an empty array.
- `package.json` exposes `architecture:check` and no `architecture:baseline` command; no updater/bootstrap entry point
  remains callable.
- The checker does not read a baseline, Git base revision, or `ARCHITECTURE_BASE_SHA`; it scans the complete current
  tree and fails on any violation.
- `.github/workflows/validate.yml` runs the strict architecture command without baseline or base-revision setup.
- A clean synthetic fixture and the actual repository pass, while a fixture for every architecture rule category
  fails with deterministic, sorted, repository-relative diagnostics.
- No ignored module path, inline architecture suppression, allow list, grandfathered key, or warning-only rule exists.
- `src/libs/modules/README.md` and the road map describe zero-violation enforcement and no longer instruct developers
  to update a baseline.
- The root `AGENTS.md` still delegates business-module work to the scoped workflow, and
  `src/libs/modules/AGENTS.md` requires the strict `architecture:check`. Neither file contains a baseline command or
  maintenance workflow, and both continue to point to the canonical guide rather than duplicating its rule matrix.
- All module public barrels remain narrow, all cross-module imports use bare public aliases, domain/application code
  is framework-independent, and infrastructure/API dependencies point inward.
- Focused architecture tests, full static/test/build validation, real-PostgreSQL integration tests, Compose health,
  and the representative Bruno matrix pass.
- No application TypeScript/runtime source, database schema, queue protocol, provider behavior, configuration, or
  migration changes in this pull request.

## Validation

Before deleting transitional files, require and record the zero state:

    corepack pnpm architecture:check
    baseline_sha_before="$(sha256sum scripts/architecture/module-architecture-baseline.json)"
    corepack pnpm architecture:baseline
    test "$baseline_sha_before" = "$(sha256sum scripts/architecture/module-architecture-baseline.json)"

Inspect the JSON and require `violations` to be `[]`. The byte-identical baseline command proves there is no stale
debt left regardless of index state; the baseline is then removed by this plan. After the change, run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/architecture/module-architecture.spec.ts --runInBand
    corepack pnpm architecture:check
    test ! -e scripts/architecture/module-architecture-baseline.json
    test -f src/libs/modules/AGENTS.md
    rg -n -F "src/libs/modules/AGENTS.md" AGENTS.md
    ! rg -n "architecture:baseline|ARCHITECTURE_BASE_SHA|module-architecture-baseline" AGENTS.md package.json scripts/architecture .github/workflows/validate.yml src/libs/modules/AGENTS.md src/libs/modules/README.md .agents/plans/module-architecture/README.md
    ! rg -n "baseline|bootstrap|shrink" AGENTS.md src/libs/modules/AGENTS.md

The focused test must include the actual-repository zero fixture and one rejecting fixture per rule category. Run
the final static and PostgreSQL matrix:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TEST_CREDITS_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TEST_PAYMENT_WEBHOOK_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- identity-schema.integration.spec.ts credits.service.integration.spec.ts membership-mutation-concurrency.integration.spec.ts payment-event.handler.integration.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build

For final runtime proof, first inspect Docker labels and confirm this checkout owns the `LEF` project. Run
`pnpm dev:reset -- --confirm-project=LEF`, require
`curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'`, and use
the short-lived credentials/setup in each collection README. Against the base stack, run
`bru run --env local --sandbox developer` from `bruno/m2m-oidc-authentication`, `bruno/bff-sessions`,
`bruno/organization-onboarding`, `bruno/service-client-management`, `bruno/credit-purchases`, and
`bruno/proxy-registry`. Record individual request/test totals rather than relying on a loop that hides the failing
collection.

Then start the SMTP overlay with
`docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build`. Run the exact
container-network `bruno/smtp-dev` command from its README. Fetch the customer service-client secret and run
`npx @usebruno/cli run --env local --sandbox developer` from `bruno/batch-verification`. Require proxy restore,
bounded batch completion, durable result download, and a healthy API after all collections.

Finish documentation and repository checks:

    corepack pnpm docs:lint -- AGENTS.md src/libs/modules/AGENTS.md src/libs/modules/README.md .agents/plans/module-architecture/README.md .agents/plans/module-architecture/12-retire-module-architecture-baseline.md
    corepack pnpm exec prettier --check AGENTS.md src/libs/modules/AGENTS.md src/libs/modules/README.md .agents/plans/module-architecture/README.md .agents/plans/module-architecture/12-retire-module-architecture-baseline.md
    git diff --check

Bruno: no new requests are expected in this enforcement-only pull request, but the complete representative matrix is
rerun to close the behavior-preserving road map with live evidence.

## Idempotence and Recovery

Once the zero state is proven, deleting transitional baseline machinery is deterministic. Rerunning
`architecture:check` is read-only. If a violating fixture unexpectedly passes, restore the strict rule before
continuing. If the actual repository reports a violation, stop. Repair its owning prerequisite or create a new
ExecPlan; do not recreate the baseline, add an exclusion, or weaken the scanner.

The plan changes no runtime state. Docker validation uses disposable data only after confirming Compose ownership;
recover with `pnpm dev:reset -- --confirm-project=LEF` and the collection-specific proxy/S3/Keycloak configuration. Preserve
another checkout's containers and all unrelated user changes. There is no migration or production rollback.

## Artifacts and Notes

Record the pre-removal zero baseline and current-scan counts, deleted transitional files/commands, strict fixture
matrix, final architecture output, updated root/scoped agent workflow, full/static/PostgreSQL totals, each Bruno
collection total, Compose health, and documentation result. Do not record tokens, Keycloak or Paddle secrets, raw
webhook bodies, customer CSV data, database credentials, or other sensitive runtime values.

## Plan readiness

Ready to implement.
