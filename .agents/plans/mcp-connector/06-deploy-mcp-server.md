# Deploy the MCP Connector

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, the MCP connector is a real, independently buildable and runnable Compose service — `docker
compose up -d mcp-server` brings it up alongside `api`/`web`, reachable on its own published port, healthy per
its own healthcheck, and built as part of the same CI `images` job that already builds `api` and `web`. A
developer observes success by bringing up the full local dev stack and reaching the connector's `/health` and
`/mcp` endpoints from the host exactly as they already can for `api`.

## Progress

- [ ] (2026-09-16) Not started.

## Plan dependencies

- `mcp-connector/03`

Implementing this plan after `mcp-connector/04` and `mcp-connector/05` land is recommended (so the deployed
service has its full toolset from the start) but not required — the connector from plan 03 alone (with
`check_credit_balance`) is already a legitimate, if minimal, deployable service.

## Surprises & Discoveries

None yet.

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

Not started.

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

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector/06-deploy-mcp-server.md
```

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
