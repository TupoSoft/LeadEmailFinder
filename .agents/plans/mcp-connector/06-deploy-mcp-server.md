# Deploy the MCP Connector

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, the MCP connector is a real, independently buildable and runnable Compose service — `docker
compose up -d mcp-server` brings it up alongside `api`/`web`, reachable on its own published port, healthy per
its own healthcheck, and built as part of the same CI `images` job that already builds `api` and `web`. A
developer observes success by bringing up the full local dev stack and reaching the connector's `/health` and
`/mcp` endpoints from the host exactly as they already can for `api`.

This plan's only structural prerequisite is `mcp-connector/03` (a buildable package exists). Implementing it
after `mcp-connector/04` and `mcp-connector/05` land is recommended, so the deployed service has its full toolset
from the start, but is not required — the connector from plan 03 alone (with `check_credit_balance`) is already a
legitimate, if minimal, deployable service.

## Progress

- [x] (2026-09-22) Added `docker/mcp-server.Dockerfile`, a single-stage build (not multi-stage — see Surprises &
  Discoveries) scoped via `--filter @tuposoft/lead-email-finder-mcp-server...`.
- [x] (2026-09-22) Added the `mcp-server` Compose service block to `docker/compose.yaml`: no `secrets:` block,
  published port `${MCP_SERVER_PORT:-53002}:3002`, `depends_on: api: condition: service_healthy`, a
  curl+jq healthcheck mirroring `api`'s own, and `API_URL`/`OIDC_BACKCHANNEL_URL` pointed at the Compose-internal
  `api`/`keycloak` hostnames.
- [x] (2026-09-22) Added a matching `images` CI job step for `docker/mcp-server.Dockerfile` in
  `.github/workflows/validate.yml`, and updated `scripts/ci/validate-workflow.spec.ts`'s expected build list to
  include it; confirmed `apps/mcp-server/` and `docker/` paths already select the `images` consumer in
  `scripts/ci/select-validation.mjs` from prior plans, so no discovery-logic change was needed.
- [x] (2026-09-22) Verified all Acceptance Criteria against the real dev stack: standalone `docker build`, `docker
  compose config --quiet`, `docker compose up -d mcp-server` reaching healthy, `curl /health` returning `200`, and
  a full `@modelcontextprotocol/inspector --cli` round trip (`tools/list` showing all 8 registered tools,
  `check_credit_balance` returning a real balance) against the containerized service's published port, matching
  the locally-run process used for manual verification in plans 02-05.

## Plan dependencies

- `mcp-connector/03`

## Surprises & Discoveries

- The Plan of Work's assumption of a multi-stage "slim runtime" Dockerfile (build stage, then a runtime stage
  copying only `dist` plus production `node_modules`) turned out not to fit this monorepo's actual pnpm layout.
  `pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile`, run with only the root and
  `apps/mcp-server` manifests present in the build context (mirroring `docker/web.Dockerfile`'s own partial-copy
  technique), still resolves and installs the *entire* monorepo's dependency tree (NestJS, TypeORM, Jest, ESLint,
  and everything else), confirmed by inspecting the built image's `node_modules` directly — `--filter` here scopes
  which workspace package's own scripts/lifecycle run, not which dependencies get fetched, given this repository's
  single root lockfile. `pnpm deploy` (the pnpm-native tool for exactly this slimming problem) requires either
  `inject-workspace-packages=true` in a workspace-wide `.npmrc` (a configuration change out of this plan's scope) or its
  `--legacy` mode, which was tested directly and produces the identical full-tree result. Since `docker/Dockerfile`
  (the `api` service) already accepts this same full-tree install with no attempt at slimming, a single-stage
  Dockerfile mirroring that established, already-CI-proven shape is consistent with existing repository
  convention, not a regression introduced here — documented instead of chased further, per this plan's own
  Artifacts and Notes preference for matching established shapes over inventing a new one.
- During manual verification, bringing `mcp-server` up on the already-running local dev stack with
  `docker compose up -d --build mcp-server` triggered a `docker compose` network-recreation attempt (because
  Compose detected pre-existing orphan containers from `docker/compose.smtp-dev.yaml`, which was not included in
  this narrower command) that failed partway through, briefly stopping `postgres`/`redis`/`api`/`garage` and
  leaving one container in a broken "not connected to its own network" state. This is a real, reproducible Docker
  Compose fragility unrelated to any file this plan adds — restored by a clean `docker compose down
  --remove-orphans` followed by `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d`
  (both overlay files together, matching how the stack was actually running beforehand), which brought every
  service back healthy with no data loss (all state lives in named volumes, not container filesystems). Worth
  flagging to whoever next touches `docker compose up` against a stack with active overlay files: always include
  every overlay file already in use, not just `docker/compose.yaml` alone, to avoid tripping this same orphan-
  container path.

## Decision Log

- Decision: The `mcp-server` Compose service has no `secrets:` block. Rationale: the connector holds no long-lived
  secret of its own (per `mcp-connector/02`'s design) — customer credentials arrive per-request as HTTP Basic auth
  and are never persisted; the only configuration it needs is non-secret (the upstream API base URL, the internal
  OIDC token-endpoint base URL, its own listen port). Date/Author: 2026-09-16, Codex planning.
- Decision: `docker/mcp-server.Dockerfile`, named after the `docker/web.Dockerfile` precedent (a non-default
  service gets a `<name>.Dockerfile`, the default/primary service uses the bare `docker/Dockerfile`). Rationale:
  matches this repository's own existing naming convention exactly rather than inventing a new one.
  Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

The connector is now a real, independently buildable and runnable Compose service exactly as scoped: both
Decision Log choices (no `secrets:` block, `docker/mcp-server.Dockerfile` naming) held up unchanged. The one
planning-time assumption that did not survive contact with the real repository was the multi-stage "slim
runtime" shape; a single-stage Dockerfile mirroring `docker/Dockerfile`'s already-established, already-CI-proven
convention was the correct, lower-risk choice once the pnpm workspace's actual install behavior was verified
directly rather than assumed. All acceptance criteria were verified live, including a full tool round trip
through the containerized service's published port, not just a `/health` check.

## Context and Orientation

All paths below are repository-relative. `docker/compose.yaml` today declares exactly two real services: `web`
(built from `docker/web.Dockerfile`) and `api` (built from `docker/Dockerfile`). Read both the `api` service's
block and `docker/Dockerfile` directly before writing the new Dockerfile/service block, to match the existing
multi-stage build shape (Node base image, `pnpm install --frozen-lockfile` scoped with the same `--filter` pattern
plan 01 introduced, build, slim runtime stage) rather than inventing a different one.

`.github/workflows/validate.yml`'s `images` job already builds and (depending on the workflow's own conditions)
pushes the `api` and `web` images using `docker/build-push-action` steps; read its exact current step list before
adding a third, mirroring one of the two existing steps as closely as possible (same caching strategy, same
conditionals gating whether it publishes).

## Scope and Non-Goals

This plan adds the Dockerfile, the Compose service block, and the CI image-build step. It does not add production
ingress, TLS, or any publicly reachable deployment — this is a locally and CI-buildable/runnable Compose service
only, matching how `api`/`web` themselves have no production ingress story in this repository either. It does not
change the connector's own application code beyond whatever minimal environment-variable wiring is needed to
match the existing Compose service-naming conventions (e.g. reading the upstream API URL from an environment variable rather
than a hardcoded `localhost`).

## Plan of Work

Create `docker/mcp-server.Dockerfile`, mirroring `docker/Dockerfile`'s multi-stage structure: a build stage
installing dependencies with `pnpm install --frozen-lockfile` scoped via
`--filter @tuposoft/lead-email-finder-mcp-server...`, running `pnpm --filter @tuposoft/lead-email-finder-mcp-server
build`, and a slim runtime stage copying only the built `apps/mcp-server/dist` output plus its production
`node_modules`, running `node apps/mcp-server/dist/main.js` (adjust the exact copy paths to match whatever the
build stage actually produces once plan 01's package is in place — verify by building locally before finalizing).

Edit `docker/compose.yaml` to add a `mcp-server` service: `build.context: ..`, `build.dockerfile:
docker/mcp-server.Dockerfile`; `depends_on: api: condition: service_healthy` (the connector calls the same API,
and — for local development before a dedicated token-endpoint variable is wired — the same Keycloak used by
`api`); environment variables for the upstream API base URL and the internal OIDC token-endpoint base URL
(reusing whichever existing Compose environment-variable names already carry these values for the `api` service,
rather than inventing new ones, if such variables already exist — check `api`'s own environment block first); a
published port (pick an unused one, following the existing `ports:` block pattern in the same file — confirm no
collision with any port `api`/`web`/any other already-published service uses); a healthcheck hitting `GET
/health` (mirroring whichever healthcheck mechanism `api`'s own service block already uses, e.g. `wget`/`curl`
inside the container). No `secrets:` entries, per this plan's Decision Log.

Edit `.github/workflows/validate.yml`'s `images` job to add one new build step for `docker/mcp-server.Dockerfile`,
mirroring the existing `api` image build step's exact shape (same action version, same caching configuration,
same conditionals).

## Interfaces and Dependencies

New `docker/mcp-server.Dockerfile`. New `mcp-server` service block in `docker/compose.yaml`. One new step in the
`images` CI job. No change to any other service's configuration. Depends on `mcp-connector/03` having produced a
buildable `apps/mcp-server` package; recommended (not required) after `mcp-connector/04`/`05`.

## Acceptance Criteria

- `docker build -f docker/mcp-server.Dockerfile .` succeeds standalone.
- `docker compose -f docker/compose.yaml config --quiet` succeeds with the new service present and no syntax
  error.
- `docker compose -f docker/compose.yaml up -d mcp-server` (with `api` already healthy) reaches a healthy state
  within a reasonable timeout.
- `curl http://localhost:<published-port>/health` from the host returns `200`.
- The new `images` CI job step builds the connector's image successfully alongside the existing `api`/`web`
  steps.

## Validation

```sh
docker build -f docker/mcp-server.Dockerfile -t lef-mcp-server-standalone-check .
docker compose -f docker/compose.yaml config --quiet
```

Manual: bring up the full local dev stack (`corepack pnpm dev:reset` if a fresh one is needed, then `docker
compose -f docker/compose.yaml up -d --build`), confirm `mcp-server` reaches healthy, `curl` its `/health`
endpoint from the host, and run `@modelcontextprotocol/inspector --cli` against its published `/mcp` endpoint
(rather than a locally-run `node dist/main.js` process as in earlier plans) to confirm the containerized service
behaves identically to the locally-run one used for manual verification in plans 02–05.

## Idempotence and Recovery

`docker compose up -d mcp-server` is safe to repeat. Removing the service (`docker compose down mcp-server`, or a
full `dev:reset`) and bringing it back up is always safe since the connector holds no persisted state of its own.
No database or volume is introduced by this plan.

## Artifacts and Notes

Read `docker/Dockerfile` and `docker/web.Dockerfile` directly before writing the new Dockerfile, and the `api`
service's exact current `environment`/`healthcheck`/`depends_on` block in `docker/compose.yaml` before writing the new
service block, so the new pieces match established shapes rather than introducing a third convention.

## Plan readiness

Ready to implement
