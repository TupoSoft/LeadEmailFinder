# Reuse Validation Caches Across Runners

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let validation jobs reuse pnpm package downloads and Docker build layers across disposable runner environments.
Repeated Actions runs can restore compatible stores and image layers while continuing to execute every selected
validation command. Developers can observe cache restoration and cached Docker steps in the job logs.

## Progress

- [x] (2026-09-13) Inspect validation, the runner lifecycle, the reusable publishing workflow, and upstream actions.
- [x] (2026-09-13) Choose separate dependency groups and image scopes, preserving unconditional installs and checks.
- [x] (2026-09-13) Implement explicit pnpm store restoration and cached Docker builds in an isolated checkout.
- [x] (2026-09-13) Pass 211 focused tests, 67 selection fixtures, ESLint, actionlint, and Harper for three files.
- [x] (2026-09-13) Review the diff independently and prepare the single cache pull request.
- [x] (2026-09-13) Record initial hosted cache exports and Docker cache reuse in this plan and PR #597.

## Plan dependencies

None.

## Surprises & Discoveries

- The main development checkout contains unrelated runner-migration edits. Implementation uses
  `/home/kyrylo/WebstormProjects/worktrees/lef-ci-caching` on `kk/ci-shared-caches`, based on master commit
  `38a93415ca1c3fff839592d5826c3302ae7f6634`. Runner migration is separately proposed in PR #595.
- The reusable publishing workflow in `TupoSoft/GitHubActions` already uses the GitHub Actions Docker cache.
  Validation has five dependency-installing jobs and four explicit Docker builds without remote caches.
- The API, web, and full-workspace installs download different package sets. One immutable cache key for every
  group would let the first filtered install determine the cache contents for the other groups.
- `docker/scripts/dev-reset.sh` uses a separate Compose build for the browser live stack. That path and the
  Dockerfiles' mutable BuildKit cache mounts are outside the explicit workflow build cache.
- The issue lookup for `ci-caching/01` returned no synced issue on 2026-09-13. There is no existing issue to assign
  or move on Project 9; the plan synchronizer can create it once the plan reaches `master`.

## Decision Log

- Decision: Use `actions/cache@v4` after Corepack and discover the actual store path and pnpm version at runtime.
  Rationale: This preserves the pinned package manager and existing installs without hard-coding a home directory.
  Date/Author: 2026-09-13, Codex implementing the user's cache recommendation.
- Decision: Share the API cache between repository-policy, backend, and contract jobs; keep web and workspace
  cache groups separate. Include OS, architecture, Node major version, pnpm version, and lockfile hash in keys.
  Rationale: Compatible filtered installs share downloads without fixing every job to one partial store snapshot.
  Date/Author: 2026-09-13, Codex.
- Decision: Use a private Buildx builder with `use: false` and name that builder explicitly in cached build steps.
  Rationale: Exporting cache layers must not change the default builder used by later Compose operations.
  Date/Author: 2026-09-13, Codex.
- Decision: Export GHA v2 caches in `max` mode with `lef-production`, `lef-api`, and `lef-web` scopes. Reuse
  `lef-web` in both jobs, load the original local tags, disable image pushes and build-record uploads.
  Rationale: Separate images keep separate cache entries while the existing container checks retain their inputs.
  Date/Author: 2026-09-13, Codex.
- Decision: Make pnpm cache restoration and Docker cache export failures advisory.
  Rationale: An absent or unavailable optional cache must not skip dependency installation or hide build failures.
  This does not promise recovery from every Docker cache importer or builder failure.
  Date/Author: 2026-09-13, Codex.

## Outcomes & Retrospective

The workflow, tests, and documentation are implemented. All 211 focused tests and 67 selection fixtures passed.
Focused ESLint, actionlint 1.7.12, the diff whitespace check, and Harper for all three changed Markdown files passed.
Independent review found no concrete defect or material architecture concern. Business-module boundaries and
application behavior remain unchanged. The first hosted CI run created pnpm caches and reused the web image cache
across two runner machines: the initial build took 101 seconds and the later build took 8 seconds. At that checkpoint,
all consumers except browser had passed, and browser was still running. Further run results and measurements are
recorded in PR #597. Swarm execution remains unverified until the separate runner migration is available. The later
browser Compose rebuild remains outside this cache configuration.

## Context and Orientation

`.github/workflows/validate.yml` selects repository-policy, backend, web, contract, images, and browser consumers.
Every consumer validates discovery, reports an unselected no-op, and runs its selected steps. The final `validate`
job preserves the stable required check. Five consumers install Node dependencies; images builds three Dockerfiles,
and browser independently builds the web gateway image before container tests.

`scripts/ci/validate-workflow.spec.ts` parses workflow YAML and protects command ownership, conditions, ordering,
permissions, and summary failure behavior. `scripts/ci/select-validation.mjs` already selects all consumers for a
workflow change. `README.md` documents the validation model. No business module is affected.

## Scope and Non-Goals

One pull request changes validation cache configuration, its workflow tests, the README, and this plan and road map.
It does not alter runner labels, the pending runner migration, the reusable publishing workflow, ExecPlan sync,
Dockerfiles, Compose reset behavior, package versions, HTTP behavior, or required check names. It introduces no
registry, package proxy, shared host filesystem, infrastructure deployment, schema change, or migration.

## Plan of Work

After enabling Corepack in each selected job, discover the store path and pnpm version, then restore the compatible pnpm
store with an optional cache action. Keep the existing frozen-lockfile install immediately after restoration and
retain its selection condition regardless of cache hit. Restore older lockfiles only within the same group and
runtime prefix. Keep workspace output and installed project modules out of the cached path.

Create a Docker-container Buildx builder in each selected image-building job. Replace the four shell build steps
with Docker's build action, retaining their context, Dockerfiles, tags, and ordering. Import and export scoped cache
layers while loading images into the job's daemon. Preserve every packaged manifest, gateway, browser, and cleanup
check. Extend the workflow tests to protect the new action contracts and cache failure policy.

## Interfaces and Dependencies

The workflow uses `actions/cache@v4`, `docker/setup-buildx-action@v4`, and `docker/build-push-action@v7`.
Existing GitHub job tokens supply cache access; there are no new secrets or permissions. The Docker actions use
Node 24 and require a compatible runner, as does the existing reusable publishing workflow.

The only shared state is GitHub-managed cache storage. Branch access restrictions apply. Multiple API jobs may
race to save the same immutable pnpm key; their install filters match. The two web builds use identical Dockerfile
inputs and a common scope. GitHub's normal expiration and storage limits apply to both dependency and image caches.

## Acceptance Criteria

- All five selected dependency-installing consumers restore the runtime pnpm store after Corepack and before their
  original frozen-lockfile install. Cache misses and cache restoration failures do not skip installation.
- API consumers share a key; web and workspace groups have distinct keys. Every restore prefix retains OS,
  architecture, Node major version, pnpm version, and dependency group boundaries.
- All four explicit image builds use the original context, Dockerfile, and image tag, load the image locally, and
  import/export the corresponding GHA v2 scope in `max` mode. No validation step pushes a container image.
- The image and browser web builds share a scope; production and API builds use distinct scopes.
- Every cache and builder step retains the appropriate selected-consumer condition. Failed installs, builds, and
  checks remain failures. Existing unselected, failed-discovery, summary, and cleanup behavior remains intact.
- Focused workflow, selection, and real-plan tests, selection fixtures, ESLint, actionlint, and Harper pass.
- Repeated eligible Actions runs show pnpm cache restoration and cached Docker steps without changing validation
  results. Record measured times and any remaining uncached operations separately from local evidence.

## Validation

Run from the implementation checkout:

```sh
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- validate-workflow --runInBand
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- select-validation execplan-repository-fixture --runInBand
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/validate-workflow.spec.ts
actionlint .github/workflows/validate.yml
corepack pnpm docs:lint -- README.md .agents/plans/ci-caching
git diff --check
```

Local tests validate workflow configuration, execution guards, and preserved checks. After publication, compare
two Actions runs with unchanged dependency manifests and source on a ref allowed to restore the earlier cache.
Verify store restoration, cached Docker steps, local container checks, and the final required check. Record jobs
that fail, skip, queue, or never run separately. No local Docker reset against the developer daemon is required.

Bruno: not applicable — only CI caching and workflow tests change; HTTP behavior remains unchanged.

## Idempotence and Recovery

Every cache is optional state and may expire or be deleted through GitHub's cache management. Rerunning validation
performs the same installs and checks. To invalidate an incompatible cache format, change its namespace; do not
share Docker data directories or project workspaces. Reverting this pull request restores the former cache-free
validation configuration without a data reset or infrastructure action.

## Artifacts and Notes

The implementation checkout preserves the original development checkout. Workflow tests passed 111 cases; the
selection and repository-plan suites passed another 100. The official actionlint 1.7.12 release was downloaded to
`/tmp/lef-ci-caching-tools/actionlint` and verified against its published checksum before execution. Harper required
four legitimate tool names in `.harper-dictionary.txt` and prose corrections before passing.

Initial live evidence comes from [Actions run 34749443337](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34749443337)
at workflow commit `c7aa21853670e07f386272b9c9bbff35c4f6cdf8`. The repository-policy log records an API-store cache miss
followed by a successful save. GitHub's cache inventory also confirmed the API and web stores and the production
and web Docker cache indexes.

The browser web-image step ran from 09:25:15 to 09:26:56 UTC. On a different runner, the image job's web-image step
ran from 09:29:22 to 09:29:30 UTC, imported the GitHub cache manifest, and reported cached build stages. These step
times include cache transfer and image loading and come from one workflow run. The images job passed, including
the packaged manifest and Compose configuration checks. The browser gateway check passed before its test suite.

The initial validation checkpoint establishes Docker cache sharing on hosted runners. It does not establish a
stable speedup for pnpm or execution on the Swarm pool. The [pull request](https://github.com/TupoSoft/LeadEmailFinder/pull/597)
records subsequent CI results without requiring a workflow change for every measurement update.

No application services need to run for the local checks. Upstream behavior is documented in [GitHub dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
and [Docker's GitHub Actions cache guide](https://docs.docker.com/build/ci/github-actions/cache/).

## Plan readiness

Ready to implement
