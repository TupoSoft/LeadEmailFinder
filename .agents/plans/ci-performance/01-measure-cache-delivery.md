# Measure CI Cache Delivery

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Deliver one LeadEmailFinder pull request, `ci(cache): measure cache transfer and build costs`, that makes
cache decisions reproducible on the existing isolated PC runners. A developer can compare complete dependency
installation and image-build durations with and without remote cache imports, using identical source and tool
versions. The output is a sanitized comparison report and a supported recommendation for `ci-performance/04`.
This PR adds measurement tooling; it does not change the default validation cache policy.

## Progress

Planning evidence was inspected on 2026-09-17. Implementation has not started.
- [ ] (2026-09-17) Add the bounded manual benchmark workflow, measurement helper, fixtures, and documentation.
- [ ] (2026-09-17) Validate successful, failed, incomplete, and interrupted measurements locally.
- [ ] (2026-09-17) Record repeated measurements on the approved runner pool and update the adoption plan.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Measure before replacing the cache service. Rationale: the observed transfers were slow, but the
  logs do not identify a network, storage, CPU, or service-rate-limit cause. Date/Author: 2026-09-17, Codex.
- Decision: Separate the benchmark PR from the cache-policy PR. Rationale: a manual workflow must first be
  available on the default branch, and policy selection depends on its measurements. Date/Author: 2026-09-17, Codex.
- Decision: Require no new registry for the baseline. Rationale: no suitable nearby registry was verified during
  planning. An optional registry trial needs an existing approved endpoint and credentials. Registry provisioning
  belongs to separate infrastructure work. Date/Author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`.github/workflows/validate.yml` restores pnpm stores in API, web, and workspace groups, then always performs a
frozen-lockfile install. Its image and live-browser jobs use private Docker-container Buildx builders with GHA v2
cache scopes `lef-production`, `lef-api`, and `lef-web`. The image exports and mandatory smoke checks are part of
the measured work. Mutable package-store cache mounts inside Docker are not equivalent to exported build layers.

The PC ARC runners observed on 2026-09-17 have disposable workspaces and private Docker daemons, with no persistent
cache volume. Each runner and Docker sidecar has limits of two CPUs and `4Gi` of memory. Those observations explain repeated cache
retrieval but do not establish historical CPU demand. Run 35156566067 took 33 minutes and 28 seconds. Its two backend image cache
restores consumed 24 minutes and 41 seconds; compilation took 10.8 seconds and 9.4 seconds. A workspace cache of 196 megabytes took up to 2 minutes and 51 seconds to restore,
followed by an 11-second install. Treat these as one baseline, not an expected speedup.

`scripts/ci/validate-workflow.spec.ts` protects the main workflow. Add independent benchmark tests rather than
changing its required consumer inventory. Existing completed plans `ci-caching/01` and `browser-ci/01` cover the
original cache installation and an older serial browser baseline; this plan measures the current ARC topology.

## Scope and Non-Goals

Create `.github/workflows/benchmark-ci-cache.yml`, `scripts/ci/benchmark-cache.mjs`,
`scripts/ci/benchmark-cache.test.mjs`, and `docs/development/ci-cache-benchmark.md`. Add a focused workflow contract
test if the helper tests cannot cover workflow scheduling and permissions. Keep the helper responsible for
measurement and report generation, with command execution injected for deterministic tests.

Do not change the main workflow defaults, runner selection, test inventory, capacity, package versions, build
inputs, live application stack, image publishing, or GitHub permissions outside the new manual workflow. Do not
deploy a registry or share Docker data directories. No product, HTTP, database, or UI behavior changes.

## Plan of Work

Follow root `AGENTS.md` for issue assignment and the one implementation PR. Add a manual-only workflow on
`tuposoft-pc-wsl` with read-only contents permission and a dedicated concurrency group that serializes benchmarks
without canceling normal validation. Accept a full source commit SHA, a target (`production`, `api`, `web`,
`pnpm-api`, `pnpm-web`, or `pnpm-workspace`), cache mode (`gha` or `none`), and sample count from three through five.
Reject invalid input before Docker or dependency commands. Keep the benchmark workflow and helper from the
dispatched trusted revision; place the requested source snapshot in a separate directory and record both commit hashes.

Use one fresh job per sample, with `max-parallel: 1`, so no sample inherits a previous job's
Docker or pnpm store. Install pinned tooling in the same way as validation. For image targets, keep the exact
Dockerfile, build arguments, local export, and image check for both modes. In `none` mode omit remote cache import
and export; do not use `--no-cache` as a substitute because it changes other cache behavior. In `gha` mode use
a benchmark-only scope or key derived from the comparison-set ID, source, target, and tool versions. Seed that
shared key once and reuse it across all fresh sample jobs. Assert the intended hit before classifying a warm
sample; retain unexpected misses as separate observations rather than including them in the warm median.
Never replace validation's caches with benchmark output. For pnpm, restore a compatible benchmark store or use an
empty store, then execute the exact corresponding frozen install. Preserve install scripts and package filters.

Record queue time, job/tool setup, cache retrieval, dependency installation, image building, export, validation, cleanup, bytes where
available, exit status, runner identity, image digests, tool versions, and concurrent workflow activity. Record
unavailable resource metrics as unavailable, never as zero. Keep raw credential-bearing logs out of artifacts;
emit an allowlisted JSON summary and Markdown report without environment dumps or signed cache URLs. Failed,
canceled, timed-out, or incomplete samples remain visible and never enter the successful-duration median.

Use three successful matched samples per mode as the minimum comparison and report median plus range. Hold
source, runner image, resources, tool versions, and build output constant. Compare complete setup plus build cost,
not only the time marked `CACHED`. Prefer the existing mode unless an alternative has at least a 10 percent lower
median, no additional failures, and a repeatable improvement in a second matched set. These are adoption criteria,
not a guaranteed performance target. Do not claim a percentile from this sample count.

If an approved nearby registry already exists when implementing, first record its endpoint, TLS/authentication
method, private namespace, retention, and default-branch writer policy in this plan. Add a registry mode only after
those details are fixed and reviewed in this same PR. Otherwise, mark that candidate unavailable and finish the
GHA-versus-none comparison; new registry provisioning requires its own infrastructure ExecPlan and PR. After merge, retain the measured recommendation in Actions reports and the original implementation PR. Carry
the repository updates to this plan and `ci-performance/04` in the adoption PR, including any unresolved decision.
This avoids a second implementation PR merely to record the benchmark results.

## Interfaces and Dependencies

The helper CLI is `node scripts/ci/benchmark-cache.mjs --help`; its documented modes accept only the target and
cache-mode enums above. Summary JSON uses `schemaVersion: 1`, immutable source and harness revisions, mode, target,
sample number, phase durations, nullable byte/metric fields, outcome, and an optional sanitized failure category.
The workflow uploads only these summaries. No persistent service, application API, or package dependency is needed.

## Acceptance Criteria

- Invalid source commit hashes, targets, modes, and sample counts fail before installing dependencies or starting builds.
- Each sample uses a fresh job and private Docker daemon; samples are serialized and their source/tool identities
  are recorded. A seeded GHA hit and an empty-cache build both execute the same mandatory target validation.
- Cache misses, build errors, interrupted runs, and missing timestamps produce explicit non-success results;
  incomplete samples cannot make the chosen mode appear faster.
- Reports contain no tokens, signed URLs, raw environment, or browser artifacts, and cleanup targets only the
  current sample's resources. Report fixtures cover all these failure cases.
- At least three matched successful samples per available mode establish a median and range. A second matched
  set supports any proposed policy change. Unavailable registry and metrics are stated explicitly.
- Existing required validation checks and normal cache behavior remain unchanged, and focused checks pass.

## Validation

Run the following after implementing the named helper and workflow; none has run for this plan yet:

```bash
node --test scripts/ci/benchmark-cache.test.mjs
corepack pnpm exec eslint scripts/ci/benchmark-cache.mjs scripts/ci/benchmark-cache.test.mjs
corepack pnpm exec jest select-validation validate-workflow execplan-repository-fixture --runInBand --cacheDirectory=/tmp/lef-ci-performance-jest
corepack pnpm test:ci-paths
actionlint .github/workflows/benchmark-ci-cache.yml .github/workflows/validate.yml
git diff --check
```

Local tooling and workflow contracts are the pre-merge gate for this manual-only feature. Live measurements
follow its merge and remain explicitly pending until executed. After the measurement PR is merged, run `gh workflow run benchmark-ci-cache.yml --ref master` with the documented
source SHA, target, mode, and sample inputs. Run all six targets in each available mode; collect the reports and
record their run URLs. Use a full representative Validate run to check whether the recommended changes address
both image and browser completion paths. Infrastructure/tool errors are separate from target validation failures.

Bruno: not applicable — this PR measures builds and installs without changing HTTP behavior or live-stack wiring.

## Idempotence and Recovery

Use one benchmark-only cache scope or key per comparison set, shared by its seed and sample jobs. Use unique
resource names and report IDs for each sample. Retrying creates a new sample; retain the failed sample record. An always-run cleanup removes only the sample's builder and temporary files. Cancellation still
lets the ephemeral runner dispose of its private daemon. Never prune a shared daemon or delete validation caches.
Reverting the PR removes only the manual benchmark entry point and helper.

## Artifacts and Notes

Historical evidence: [run 35156566067](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/35156566067),
PR head `9f329dcf59dbe321f4c85955426adfd2ef08d109`, executed merge
`c754712bd6bf34e367e0165030509dbd6b7c90d1`. The inspected workflow matches at those revisions.
Implementation must begin from current master; the planning checkout is `451798dadf82e316ba68b4333ddba32bf0f99a97`.
Preserve any newer workspace package filters. Docker documents the existing
[GHA backend](https://docs.docker.com/build/cache/backends/gha/) and the optional
[registry backend](https://docs.docker.com/build/cache/backends/registry/).

## Plan readiness

Ready to implement
