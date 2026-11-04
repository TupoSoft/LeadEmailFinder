# Reuse the Tested Web Image When Starting Browser CI

This is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The `browser-live` job will build its web image once, test that image with the existing gateway checks, and start the disposable application stack with the same image. A developer can verify that the running `lef-web-1` container uses the image ID tested by the gateway suite and that reset does not rebuild the web image. The normal local reset continues to build all services.

This plan is `ci-performance/03` and maps to one LeadEmailFinder pull request titled `perf(ci): reuse the tested browser web image`.

## Progress

- [ ] 2026-09-17: Add image identity metadata and explicit reset reuse validation.
- [ ] 2026-09-17: Wire browser CI to reuse its tested image and add failure coverage.
- [ ] 2026-09-17: Validate the isolated stack, document results, and open the implementation pull request.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- 2026-09-17, Codex: Reuse a verified image through an explicit reset option, represented by environment variables. Keep the default reset behavior unchanged.
- 2026-09-17, Codex: Preserve the existing Compose project, filenames, service definitions, ports, volume allowlist, and cleanup. Reuse the base configuration's existing `lef-web` image name rather than introducing an overlay.
- 2026-09-17, Codex: Verify the immutable local image ID, checked-out commit, and all payment build arguments before any destructive reset operation. A tag alone is insufficient because it can point to an older or differently configured image.
- 2026-09-17, Codex: Continue building API and Garage images. Skipping all builds would leave a fresh disposable Docker daemon unable to start the stack.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The inspected run, `35156566067`, built `lead-email-finder-web:frontend-06` with a separate Buildx builder and subsequently rebuilt the same web application as `lef-web` during `dev:reset`. The first build took 454 seconds, mostly retrieving cached layers; the second web dependency installation took 40.6 seconds and its compilation took 8.5 seconds. The second build overlapped API work, so removing it does not imply an equivalent reduction in elapsed time.

Current reset ownership checks require the exact base Compose configuration file. Introducing an override file would change that identity and require wider recovery changes. Tagging a verified local image to the existing Compose image name avoids an override.

`.github/workflows/validate.yml` builds `docker/web.Dockerfile`, loads `lead-email-finder-web:frontend-06`, runs `corepack pnpm test:gateway`, and invokes `corepack pnpm dev:reset -- --confirm-project=LEF`. Buildx uses a separate container builder with `use: false`. The reset script in `docker/scripts/dev-reset.sh` invokes the default Compose builder through `up -d --build`.

`docker/compose.yaml` defines a web build without an explicit image tag. With its fixed project name, Compose uses `lef-web`. Its payment arguments are `PAYMENTS_PROVIDER=stub`, `PAYMENTS_CHECKOUT_URL=http://localhost:53000/billing/complete` at the supported reset port, and `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS`, which defaults to an empty value. `docker/infra.yaml` also builds the Garage image. Reset validates the resolved project and ports, requests confirmation, verifies ownership of existing containers and volumes, removes browser enrollment state, and then provisions Keycloak and application fixtures.

`scripts/frontend/gateway.test.mjs` already accepts `WEB_GATEWAY_IMAGE` and can run against a local immutable image ID. `scripts/testing/dev-reset.test.mjs` uses fake Docker commands to assert ordering and preservation of state on rejection. `scripts/ci/validate-workflow.spec.ts` verifies build wiring, browser prerequisites, suite inventory, and cleanup conditions. These are the nearest existing contracts.

## Scope and Non-Goals

Change `docker/web.Dockerfile`, `docker/scripts/dev-reset.sh`, `.github/workflows/validate.yml`, `scripts/testing/dev-reset.test.mjs`, `scripts/ci/validate-workflow.spec.ts`, and `docker/README.md`. Add assertions to the nearest existing Dockerfile or gateway contract test only if needed to verify emitted image metadata. Keep validation selection accurate for these paths.

This pull request removes duplicate web construction within `browser-live`. It does not change remote cache storage, runner images, runner capacity, the separate `images` job, product UI, API behavior, payment providers, browser suite ownership, or the artifact security prerequisite. It adds no database migration or production rollout.

## Plan of Work

First, add optional `LEF_WEB_SOURCE_REVISION` build metadata to `docker/web.Dockerfile`. In the final runtime stage, declare the source revision and the three existing payment build arguments, with the same defaults used by the build stage. Emit labels named `io.tuposoft.lef.web.source-revision`, `io.tuposoft.lef.web.payments-provider`, `io.tuposoft.lef.web.payments-checkout-url`, and `io.tuposoft.lef.web.payments-checkout-allowed-origins`. The labels contain only public configuration. An ordinary local build may have an empty source revision and remains usable through the default reset; explicit reuse requires a complete matching revision.

Add a small, purpose-specific preflight function inside `docker/scripts/dev-reset.sh`. Reuse is enabled only when both `LEF_RESET_WEB_IMAGE` and `LEF_RESET_WEB_IMAGE_ID` are nonempty. Reject a partial pair, malformed image ID, unavailable image, tag resolving to another ID, absent labels, a source revision different from `git rev-parse HEAD`, or payment labels differing from the resolved Compose web build arguments. Normalize the absent allowed-origins argument to the empty string; do not normalize distinct nonempty values. Reject tracked modifications and untracked additions to the web Docker build inputs, including ignored files that Docker would consume, so a matching commit label cannot conceal a changed working tree. In particular, ignored Vite environment files such as `apps/web/.env.local` must fail preflight. Exempt only the generated output and dependency directories excluded from the source check explicitly below. Those inputs are `docker/web.Dockerfile`, `docker/web/`, `.dockerignore`, the root package and lock/workspace files, `apps/web/`, `packages/api-client/`, `src/libs/common/src/checkout-redirect.ts`, and `scripts/keycloak/browser-fixture-identities.ts`. Exempt `node_modules`, `.git`, `.cache`, and `.dev` directories already excluded by the Docker context, plus generated `apps/web/dist`, `packages/api-client/dist`, `apps/web/test-results`, and `apps/web/playwright-report` output. Inspect both ignored and ordinary untracked files; do not use a clean Git status alone as proof. Add a regression for an ignored Vite environment file.

Run this preflight after the existing configuration and confirmation checks and before `verify_and_delete_volumes`, which also removes enrollment state and stops containers. Preserve existing ownership checks. In the reuse branch, build the remaining build-defined services with the existing base Compose command, explicitly `build api garage`, before deleting state. Recheck the source reference's image ID after those builds, then tag the validated immutable ID as `lef-web` and verify that tag. A missing or changed image must therefore fail while the old stack and enrollment state remain intact. After the existing reset deletion, start with `up -d --no-build`. The default branch retains `up -d --build`. Do not silently fall back to rebuilding an invalid requested image.

Update the browser job to derive the revision from the actual checkout, not the pull request head field. Keep the existing mandatory web build, cache configuration, and selected-job guard. Pass the source revision and the exact resolved payment build arguments to that build. Resolve the loaded image's actual ID with `docker image inspect`, record it as a step output, and pass that ID as `WEB_GATEWAY_IMAGE` to the existing gateway suite. Pass the source image reference plus the recorded ID only to the reset step. This also avoids assuming a Buildx manifest digest equals Docker's locally inspected image ID. The later SMTP restart uses the existing `lef-web` image; assert its image ID is still the recorded one after both initial startup and SMTP attachment. Keep artifact suppression prerequisites and every existing test command.

Extend the fake-Docker reset tests with successful reuse, a partial option pair, missing image, wrong ID, stale revision, dirty relevant source, and a mismatch in each payment argument. Each rejection must preserve enrollment metadata and contain no Compose `down`, volume deletion, or stack startup. Cover remaining-image build failure with the same preservation assertions. Successful reuse must build API and Garage, never build web, tag only the validated ID, and use `up -d --no-build`. Retain every existing confirmation, foreign-checkout, foreign-volume, unexpected-volume-count, overlay, port, symlink, and default-reset test.

Update workflow contracts to prove the checkout revision and payment arguments flow into the build, the same inspected image ID flows into gateway tests and reset, and browser inventory and cleanup are unchanged. Document the explicit reuse variables, matching requirements, normal local behavior, and failure recovery in `docker/README.md`.

## Interfaces and Dependencies

`LEF_RESET_WEB_IMAGE` identifies the already loaded local image by reference. `LEF_RESET_WEB_IMAGE_ID` is the expected full `sha256:` image ID from local Docker inspection. Neither variable changes the default path when both are absent. They are opt-in developer/CI inputs, not HTTP API fields. `LEF_WEB_SOURCE_REVISION` is optional image build metadata; reuse requires it to match the actual checkout.

Continue using the existing POSIX shell, Git, Docker, Compose, and `jq` dependencies. No new runtime library, business service, or frontend abstraction is required. The image metadata is a consistency check for the locally built CI artifact, not an attestation system for untrusted remote images. Browser CI already provides an isolated Docker daemon; concurrent reset operations against one local daemon remain unsupported, as they are today.

## Acceptance Criteria

1. A selected browser run performs one web image build. Gateway tests, the initial `lef-web-1` container, and the container after SMTP attachment all report the same local image ID.
2. Explicit reuse with a matching image starts and seeds a fresh isolated stack while still building API and Garage. No web rebuild or registry fallback occurs in reset.
3. Invalid reuse inputs fail before stopping containers, deleting volumes, or removing browser enrollment state. This includes missing images, stale revisions, mismatched IDs or payment arguments, and incomplete option pairs. A remaining-image build failure has the same preservation behavior.
4. Without reuse variables, local reset retains its existing rebuild, confirmation, ownership, port, seed, health, and cleanup behavior. Existing rejection tests still pass.
5. The existing artifact guards, gateway tests, live browser session test, and Bruno BFF, async-verification, and batch-verification checks pass. The complete browser job remains required; no test is skipped to obtain a speed improvement.
6. Focused automated checks pass, and one isolated browser CI run records the build count, image identity checks, and elapsed setup time. Report measured timing without promising a fixed reduction.

## Validation

Run these focused checks from the implementation checkout:

```sh
sh -n docker/scripts/dev-reset.sh
node --test scripts/testing/dev-reset.test.mjs
corepack pnpm exec jest --runInBand --cacheDirectory=/tmp/lef-ci-performance-jest --runTestsByPath scripts/ci/validate-workflow.spec.ts scripts/ci/select-validation.spec.ts
corepack pnpm test:ci-paths
docker compose -f docker/compose.yaml config --quiet
git diff --check
```

Run container validation in a clean, committed checkout inside a disposable ARC runner with its isolated Docker-in-Docker daemon. Do not point reset at the developer's normal Docker daemon. The existing selected `browser-live` job is the runtime harness and must exercise the new wiring on the actual implementation commit. Its relevant existing commands are:

```sh
corepack pnpm test:gateway
corepack pnpm dev:reset -- --confirm-project=LEF
corepack pnpm test:web-live
corepack pnpm bruno:bff-sessions
corepack pnpm bruno:async-verification
corepack pnpm bruno:batch-verification
```

Use the workflow's existing order, fixture provisioning, SMTP attachment, and cleanup; these commands are not a standalone replacement for that setup. Supply the new image variables and `WEB_GATEWAY_IMAGE` through the workflow as specified above. The Bruno launchers execute the pinned CLI with `bru run --env local` and enforce that requests and tests are not skipped. No Bruno collection change is required because HTTP behavior is unchanged, but rerunning these existing collections validates the changed integration wiring. Record their exact results and report unavailable runtime execution explicitly.

Before the successful isolated run, exercise a deliberately missing image and an image with mismatched payment metadata against synthetic enrollment state in the disposable runner. Assert nonzero exit, unchanged enrollment state, and no stack teardown. The fake-Docker tests cover the full rejection matrix without requiring multiple costly stack runs.

## Idempotence and Recovery

Repeated explicit reuse is allowed only for the same locally available image identity, checkout, and configuration. It still performs the existing confirmed development data reset. A failed preflight leaves the stack unchanged; rebuild a matching image or unset both reuse variables to return to the normal reset path. A failure after teardown follows the existing reset recovery: fix the cause and rerun the confirmed reset against the same isolated checkout.

Do not globally prune containers, images, or volumes. Use the existing job cleanup for its disposable stack and discard the isolated runner afterward. Reverting the workflow reuse variables restores the previous build behavior without a schema or data migration.

## Artifacts and Notes

Historical evidence: [browser-live job in run 35156566067](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/35156566067/job/104999593088). The run tested merge commit `c754712bd6bf34e367e0165030509dbd6b7c90d1`; its pull request head was `9f329dcf59dbe321f4c85955426adfd2ef08d109`. Current planning inspected checkout `451798dadf82e316ba68b4333ddba32bf0f99a97`, including reset and workflow contracts. No implementation or runtime validation has been performed for this plan.

When implementation starts, find the synced issue by `<!-- execplan: ci-performance/03 -->`, assign it to the requesting user, and move its project item to In Progress under the repository instructions. The implementation pull request uses the conventional title above, is assigned to the requesting user, and closes that issue. Review the final diff for single-purpose responsibilities; the reset script continues to orchestrate one disposable-stack lifecycle and the new function only validates its web-image input.

## Plan readiness

Ready to implement
