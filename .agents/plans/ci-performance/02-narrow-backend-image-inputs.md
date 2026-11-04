# Keep Backend Image Caches When Unrelated Files Change

This is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Preserve cached backend image builds when a change affects web files, repository documentation, or CI test
specifications. Developers can observe unchanged backend image IDs and cached compilation steps after those
changes, while application source, compiler configuration, dependencies, and the packaged approval manifest
continue to affect the images. This plan delivers one LeadEmailFinder pull request with the conventional subject
`perf(docker): narrow backend image build inputs`.

## Progress

- [ ] (2026-09-17) Implement explicit backend inputs and Dockerfile-specific exclusions.
- [ ] (2026-09-17) Add and run isolated container tests for cache invalidation and packaged files.
- [ ] (2026-09-17) Verify compiler, development, workflow, and documentation contracts; record results and open the single pull request.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep the compiler configuration and non-test script inputs intact. Exclude only script files matching
  the existing build exclusion `scripts/**/*spec.ts`, and omit unrelated top-level directories through explicit
  COPY instructions. Rationale: preserve the existing compiler contract while removing the measured invalidation
  trigger. Date/Author: 2026-09-17, Codex.
- Decision: Add `Dockerfile.dockerignore` and `docker/Dockerfile.dockerignore`, preserving applicable exclusions
  from the root `.dockerignore`. Leave the shared `.dockerignore` and web image unchanged. Rationale: backend
  context policy must not remove files needed by web builds. Date/Author: 2026-09-17, Codex.
- Decision: Measure actual BuildKit cache behavior in temporary contexts; do not add tests that merely search
  Dockerfile text for a particular COPY spelling. Date/Author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Planning evidence: `tsconfig.json` includes `scripts/**/*.ts` and `jest.config.ts`; `tsconfig.build.json` excludes
`**/*spec.ts`. Removing every script would silently reduce the existing build type checks. Preserve non-test
scripts and compiler configuration. The current development image already copies `src`, `scripts`, and `config`
separately, but its script copy still includes the excluded CI specifications.

The production `Dockerfile` installs dependencies from the root package manifests, runs `COPY . .`, and compiles
with `pnpm build`. Its final stage installs production dependencies and copies `/app/dist` and the approval
manifest. `docker/Dockerfile` builds the development API image, copying compiler configuration, `src`, `scripts`,
and `config` before compilation. Both builds use the root directory as their context.

`nest-cli.json` enables SWC and TypeScript checks. `tsconfig.json`, `tsconfig.base.json`, `tsconfig.build.json`,
`.swcrc`, and `jest.config.ts` all contribute to the existing compilation environment. Retain the complete `src`
and `config` trees, including module assets and `config/privacy/account-discovery-approvals.yaml`. Non-test files
under `scripts/keycloak`, `scripts/openapi`, `scripts/privacy`, and the other script directories remain available.
The production runtime reads its package version from `package.json` and its approval manifest from the fixed
configuration path. The final image runs as `node`; the manifest must remain root-owned and not writable by that user.

`docker/compose.yaml` mounts the checkout at `/app`, preserves container dependencies through `/app/node_modules`,
and starts `pnpm start`, or the existing `API_START_COMMAND` override. These source-watch and development tools
remain governed by the mounted checkout. The image is not a replacement for the complete development checkout.

The completed `ci-caching/01` plan already added GitHub Actions caches and separate image scopes. This plan does
not repeat that work. Existing `scripts/ci/validate-workflow.spec.ts` checks the packaged manifest smoke test and
image workflow. `scripts/ci/select-validation.mjs` conservatively selects validation for new root configuration
and already selects backend, images, and browser checks for `docker/` changes.

## Scope and Non-Goals

Change `Dockerfile`, `docker/Dockerfile`, new `Dockerfile.dockerignore`, new `docker/Dockerfile.dockerignore`, a new
`scripts/ci/backend-image-inputs.test.mjs`, the validation explanation in `README.md`, and this plan. Keep compiler
configuration, package versions, source files, module boundaries, image commands, image users, Compose mounts,
registry/cache backends, runner allocation, image job selection, and required check names unchanged. There are no
API, database, provider, authorization, or production rollout changes. Faster remote downloads and concurrent
image builds belong to separate plans.

## Plan of Work

Begin in an isolated implementation checkout. Find the synced issue using marker `ci-performance/02`, assign it
to the requesting user, and move its project status to In Progress using the repository instructions. Preserve
unrelated work in the original checkout.

Replace production `COPY . .` with copies of the following exact input groups: `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`; `nest-cli.json`, `tsconfig.json`, `tsconfig.base.json`, `tsconfig.build.json`, `.swcrc`,
`jest.config.ts`; `src` to `./src`; `scripts` to `./scripts`; and `config` to `./config`. Keep the dependency-install
layer before source copies. Keep the production runtime copies and its frozen production install unchanged.
The development Dockerfile already has these groups; make its compiler file list explicit and retain its
existing filtered dependency installation, commands, tools, and complete source/configuration trees.

Give each backend Dockerfile its own ignore file. Start with the applicable existing root exclusions, especially
nested `node_modules`, `.git`, `.cache`, `.dev`, and development-secret patterns. Add `scripts/**/*spec.ts` to both.
Do not apply a blanket script exclusion or exclude source/configuration assets. Dockerfile-specific ignore files
replace rather than extend the shared root ignore file, so explicitly preserve the relevant existing rules.
The explicit COPY list prevents `apps`, `packages`, `docs`, `.agents`, `.github`, and top-level Markdown from
entering backend source layers. Keep the web Dockerfile and its context policy untouched.

Add a Docker integration test using Node's built-in test runner. Require the explicit environment variable
`LEF_TEST_BACKEND_IMAGE_INPUTS=1` before starting Docker work; report a skip otherwise. The test snapshots the
committed implementation revision into a new temporary directory with `git archive`, creates a uniquely named
Buildx builder, builds both backend images, and repeats the scenarios below sequentially on that same builder.
No secret files or developer workspace mounts are needed. The existing Git large-file assets are outside these backend input
groups; do not fetch or test them through this harness. Use unique image tags and retain logs and image IDs until
the result is reported. No image push or shared cache write is needed.

For each successful build, inspect the output image and run bounded commands with `--rm` and `--network none`.
Check compiled application files, package version, approval manifest contents/ownership, and the production
user's inability to write the manifest. Check development compiler and non-test script files remain present.
Parse BuildKit plain progress by vertex ID to distinguish cached compilation from a command that ran; do not
hardcode stage numbers. Always restore each mutation from the baseline snapshot before starting the next.

Use the existing manifest smoke assertion rather than weakening it. Run existing workflow tests unchanged and
record any unrelated failure accurately. Update README with the new input boundary and the integration-test
command. Review the diff for preserved module responsibilities and ensure no application code moved into build
helpers. Open one PR whose title matches its conventional commit subject, assign `@me`, and close the synced issue
in its description.

## Interfaces and Dependencies

The only new execution interface is the opt-in Node test command and `LEF_TEST_BACKEND_IMAGE_INPUTS=1`.
It requires Docker, Buildx, Git, and the existing network access needed for a cold dependency build. It creates
only its own builder, temporary contexts, and image tags. No new library, credential, cache service, package
manager policy, or HTTP interface is introduced. Existing frozen installs and compilation failures remain fatal.

## Acceptance Criteria

- Both backend images build successfully from a clean committed context without host `node_modules` or build output.
- After warming each image, changes confined to `docs/`, `.agents/`, a top-level Markdown file, `apps/web/`, or
  `scripts/ci/validate-workflow.spec.ts` leave its image ID unchanged and its compilation vertex cached.
- Adding a valid source sentinel under `src/` invalidates compilation, and the compiled sentinel appears in each
  image. A TypeScript error in that file fails both builds rather than reusing the previous successful image.
- Changing `.swcrc` or compiler configuration invalidates the corresponding compilation stage. A malformed
  compiler configuration fails the build. Changing package dependency declarations incompatibly with the lockfile
  fails the frozen install rather than hiding the change behind a cache hit.
- Changing the approval manifest in a temporary context changes the packaged bytes in both images. The standard
  production manifest assertion still rejects an unexpected revision; the unchanged baseline passes.
- Production retains its package version, compiled application, configured user, and root-owned manifest without
  group/world write permissions. Reading succeeds and writing as the configured runtime user fails with `EACCES`.
- The development image retains its compiler and non-test provisioning scripts. Compose still mounts the checkout,
  retains its dependency volume, and preserves the start command and watch behavior. The web image is unchanged.
- The focused integration scenarios and existing workflow checks pass, and no global Docker pruning or removal of
  other projects' resources occurs. Record real CI timing separately; a fixed number of minutes saved is not an
  acceptance claim.

## Validation

After committing the intended implementation in the isolated checkout, run:

```sh
LEF_TEST_BACKEND_IMAGE_INPUTS=1 node --test scripts/ci/backend-image-inputs.test.mjs
corepack pnpm exec jest validate-workflow select-validation --runInBand --cacheDirectory=/tmp/lef-ci-performance-jest
corepack pnpm test:ci-paths
corepack pnpm exec eslint scripts/ci/backend-image-inputs.test.mjs
corepack pnpm build
corepack pnpm architecture:check
git diff --check
```

The Docker test performs baseline and warm builds using `docker buildx build --builder <owned-builder>
--progress=plain --load --file <Dockerfile> --tag <owned-tag> <temporary-context>` for `Dockerfile` and
`docker/Dockerfile`. The harness supplies the generated names as argument arrays and bounds each process.
Run every case from the same committed snapshot and restore it between cases:

| Context mutation | Required observation |
| --- | --- |
| Append a sentence to a file under `docs/`, then repeat separately for `.agents/` and a root Markdown file | Both image IDs remain unchanged; compilation stays cached. |
| Append a harmless comment to `apps/web/src/app/App.tsx` | Both backend images retain their cached compilation and IDs. |
| Append a comment to `scripts/ci/validate-workflow.spec.ts` | Both backend images retain their cached compilation and IDs. |
| Add `src/ci-image-input-probe.ts` exporting a unique string | Compilation runs; the emitted JavaScript in each image contains the string. |
| Replace that probe with an invalid TypeScript assignment | Both builds fail at compilation; no success result is reported. |
| Change `.swcrc`, then separately make `tsconfig.build.json` malformed | The valid edit invalidates compilation; malformed configuration fails. |
| Add a dependency to `package.json` without updating `pnpm-lock.yaml` | Both dependency installs fail because the lockfile is frozen. |
| Change the approval manifest revision to a test-only value | Packaged bytes change; the existing fixed-baseline manifest smoke assertion fails. |

Inspect the Compose model with `docker compose -f docker/compose.yaml config --format json` in a checkout whose
existing development fixtures are available; assert the checkout mount at `/app`, `/app/node_modules` volume, command,
and package watch path. Do not run `dev:reset` merely to validate this image-input change. The repository's selected
browser-live workflow supplies the existing live Compose and HTTP regression checks after publication. Report its
actual result, including unrelated failures or skipped checks, without claiming a new local live-stack test.

Bruno: not applicable — image input selection preserves HTTP behavior; existing browser-live Bruno checks remain
required. No new collection is needed. Docker integration, workflow tests, and Harper have not run during planning.

## Idempotence and Recovery

Every test invocation uses a new temporary context, builder name, and image-tag prefix. Tests run sequentially
within that namespace so cache observations have a known predecessor. In a finally block, remove only the builder
and tags created by that invocation, then its temporary directory. On interruption, use the recorded owned names
for the same cleanup; never use global prune commands. Test mutations never touch the working checkout.

A failed cold build can be retried after restoring network access. A failed mutation case must restore baseline
files before retrying. Reverting this single PR restores the earlier image input behavior without a data reset,
cache deletion, or infrastructure change. Existing development services and volumes remain untouched.

## Artifacts and Notes

[Run 35156566067, images job](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/35156566067/job/104997476988)
used merge commit `c754712bd6bf34e367e0165030509dbd6b7c90d1`, matching the inspected Docker configuration at PR head
`9f329dcf59dbe321f4c85955426adfd2ef08d109`. Its production cached dependency stage took 909.1 seconds, including an
882.4-second download and 26.1-second extraction of a 157.33 megabytes layer. The development cached stage took 572.3
seconds; its 157.33 megabytes download took 548 seconds and extraction took 22 seconds. Actual compilation took 10.8 and
9.4 seconds. The triggering commit changed only an ExecPlan and the CI workflow specification. This evidence
motivates avoiding unnecessary invalidation; it does not guarantee that all cache transfers disappear.

Docker documents that [Dockerfile-specific ignore files take precedence over the root file](https://docs.docker.com/build/concepts/context/#filename-and-location).
The trade-off is maintaining two small backend context policies. The behavioral container test protects their
meaning; do not introduce a generic context manager or alter application services to share these rules.

## Plan readiness

Ready to implement
