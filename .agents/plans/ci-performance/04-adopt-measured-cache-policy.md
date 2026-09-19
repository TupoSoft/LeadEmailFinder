# Adopt the Measured CI Cache Policy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Deliver one LeadEmailFinder pull request, `ci(cache): use the measured cache delivery policy`, that removes
demonstrably slower cache imports while preserving complete validation. Its exact per-image and per-install-group
policy comes from `ci-performance/01`; no speedup or new cache provider is assumed before measurement.

## Progress

Planning evidence was inspected on 2026-09-17. Implementation has not started.
- [ ] (2026-09-17) Record the completed benchmark and resolve the exact per-target policy before implementation.
- [ ] (2026-09-17) Update only the selected cache imports and their workflow contracts and documentation.
- [ ] (2026-09-17) Validate miss, unavailable-cache, failure, and representative Actions behavior; record before/after evidence.

## Plan dependencies

- `ci-performance/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep policy adoption separate from measurement. Rationale: adding a cache backend without measured
  throughput could retain or worsen the bottleneck. Date/Author: 2026-09-17, Codex.
- Decision: Preserve default required checks, frozen installs, and isolated daemons. Rationale: cached content is
  optional acceleration, not proof that application validation passed. Date/Author: 2026-09-17, Codex.
- Decision: Start this plan only after recording a specific winning policy. Rationale: a missing measurement must
  remain a visible readiness condition, not a hidden implementation choice. Date/Author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`.github/workflows/validate.yml` uses `actions/cache@v4` with OS, architecture, Node, pnpm, install-group, and
lockfile identities. It restores API stores for repository-policy, backend, and contract jobs, a web dependency store for
web, and a workspace store for the three browser workers. Mandatory frozen installs follow cache restoration.
The images and browser-live jobs import and export GHA v2 BuildKit caches with separate image scopes.
`scripts/ci/validate-workflow.spec.ts` currently expects each installing job to have one store-cache action and
each explicit image build to have the corresponding GHA import/export. Update those expectations to the measured
policy without weakening mandatory builds, test ordering, selection, cancellation, cleanup, or aggregate results.

The 33-minute historical run had slow cache hits and short compilation. That supports a benchmark, but cannot identify
the fastest reliable replacement. Read the completed report from plan 01; if source, runner image, Docker inputs,
or browser image reuse changed since that comparison, repeat matched samples at the implementation revision.

## Scope and Non-Goals

Modify `.github/workflows/validate.yml`, `scripts/ci/validate-workflow.spec.ts`,
`docs/development/ci-cache-benchmark.md`, and this plan. Use the existing Docker actions and cache key boundaries.
No new generic cache abstraction is needed. Do not change image content, runner labels/resources, checks, build
parallelism, browser prerequisites, package versions, database state, or HTTP behavior.

Creating a registry, package proxy, shared cache volume, or persistent builder is outside this one PR. If the
winning candidate requires such infrastructure, create and complete one separately owned infrastructure plan,
record the deployed endpoint and trust policy here, and retain this readiness condition until it is available.

## Plan of Work

Before assigning implementation work, replace the pending policy in Artifacts and Notes with a table listing
every target, previous mode, selected mode, report URL, matched source and runner digests, median/range, and any
endpoint/credential prerequisite. Use the minimum improvement and repeatability criteria from plan 01. Keep GHA
where it wins or results are inconclusive; omit remote import/export where rebuilding wins. Do not implement a
runtime race between two cache providers or silently switch provider after a build failure.

For pnpm groups selected for no remote restore, remove only the store-cache operation and unused discovery step
where applicable. Preserve exact workspace filters and `--frozen-lockfile`. For Docker targets selected for no
remote cache, omit `cache-from` and `cache-to`, while keeping the mandatory build and downstream checks, including the required image output. Never substitute an old image or skip compilation based only on a cache hit. Preserve separate scopes and
advisory export failures where GHA remains.

A registry-selected target requires a verified, private cache namespace with TLS, fixed repository configuration,
and an explicit writer policy. Pull-request workflows must not gain publish credentials or broader permissions.
They may import only the approved cache available to their normal trust level. Cache warming, secret provisioning,
and registry deployment belong to the prerequisite infrastructure work, not an implicit step in this PR. If the
endpoint cannot be used under these constraints, select an already measured viable mode or keep adoption pending.

Extend the workflow tests with policy-specific cases proving that a miss or optional restore/export failure still
runs the frozen install and checks, while install/build/test failure remains fatal. Retain all existing skipped,
missing, canceled, and failed consumer handling. Compare complete image and browser paths across representative
successful Actions runs and document whether total workflow time improved. Revert any policy that fails its
measured acceptance criteria instead of broadening test deadlines.

## Interfaces and Dependencies

There are no application interfaces or package changes. Cache modes are fixed in the reviewed workflow after
measurement. Any new registry reference and read credential must be named here before readiness changes; no
secret values belong in this plan. Existing GHA scopes and pnpm group identities remain distinct where retained.

## Acceptance Criteria

- Every changed target has a recorded, reproducible winning policy with matched measurements; unchanged targets
  retain their prior configuration. No provider choice or infrastructure prerequisite remains unresolved.
- A cache miss, advisory pnpm restore failure, or advisory Docker cache-export failure never suppresses the
  frozen install or selected checks. A fatal BuildKit importer error remains a failed job; it cannot count as a
  passed build or cause an automatic provider switch. Invalid lockfiles, compilation errors, and test failures
  still fail the appropriate required aggregate check.
- Pull requests gain no image/cache publishing credential or write permission, and runners retain private Docker
  state and workspaces. Existing browser artifact guards and cleanup ordering remain intact.
- Focused workflow/selection tests and lint pass. Repeated complete runs satisfy the plan 01 improvement criteria
  for changed targets without increasing failed or incomplete runs; report whole-workflow changes separately.

## Validation

```bash
corepack pnpm exec jest validate-workflow select-validation execplan-repository-fixture --runInBand --cacheDirectory=/tmp/lef-ci-performance-jest
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- docs/development/ci-cache-benchmark.md .agents/plans/ci-performance
git diff --check
```

Run the plan 01 benchmark at the final implementation revision. Compare at least three successful samples per
selected mode and repeat the matched set. Record complete Validate runs exercising images and all browser workers.
Inject pnpm restore and Docker export unavailability in the bounded benchmark and use workflow tests for
install/build failure propagation. Verify that a fatal Docker importer error is reported as failure; advisory
export handling does not imply importer recovery. No measurements or implementation checks have run for this plan yet.

Bruno: not applicable — the cache policy preserves HTTP behavior and every existing Bruno invocation.

## Idempotence and Recovery

Cache deletion or expiry must remain safe. Rerun installs and builds rather than trusting a previous result.
Reverting this PR restores the earlier import/export configuration without resetting application data or changing
runner infrastructure. Do not remove registry resources or shared caches as part of application rollback.

## Artifacts and Notes

Policy selection is pending `ci-performance/01`. No nearby cache registry was verified during planning. If the
benchmark finds no repeatable improvement, record that result and leave this plan unimplemented; do not create
a cosmetic adoption PR. Plans 02 and 03 and the Kubernetes runner-image plan can improve runtime independently.

## Plan readiness

Ready after cache measurements identify the exact viable per-target policy
