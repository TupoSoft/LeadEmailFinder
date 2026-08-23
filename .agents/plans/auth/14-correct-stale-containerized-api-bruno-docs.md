# Correct stale "containerized API can't reach Keycloak" Bruno docs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

`bruno/organization-onboarding/README.md` and `bruno/service-client-management/README.md` each document a
"known limitation" instructing a developer to stop the containerized `api` service and run a host-process build
of it before these collections can pass fully. That limitation no longer holds. After this change, both READMEs
say plainly that the collections run against the normal containerized stack, and the now-dead host-run
workaround is removed rather than left to mislead the next developer who hits it.

## Progress

- [x] (2026-08-23) Remove the stale "known limitation" section and host-run workaround from both READMEs.
- [x] (2026-08-23) Replace it with the plain containerized run instructions, confirmed live.

## Plan dependencies

None.

## Surprises & Discoveries

- Found live, not assumed: `docker/compose.yaml`'s `api` service already sets `OIDC_JWKS_URI:
  http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs` and
  `KEYCLOAK_ADMIN_API_BASE_URL: http://keycloak:8080` — both container-internal — alongside the host-facing
  `OIDC_ISSUER_URL`. Both documented workarounds predate this fix and are now stale.
- Ran both collections against the plain containerized stack with no host-run workaround, from a fresh
  `pnpm dev:reset`: `bruno/organization-onboarding` 8/8 requests passing (including request 03, `accept`, which
  calls the Keycloak admin adapter and is exactly the request the stale doc says will fail with a `500`);
  `bruno/service-client-management` 4/4 requests passing (every request sends a real OAuth bearer token
  verified against Keycloak's JWKS endpoint, exactly what the stale doc says will fail).
- `bruno/bff-sessions/README.md` is *not* stale in the same way: its own limitation is that a full human browser
  login can't be driven by Bruno's plain HTTP model at all (a different, still-true constraint, covered instead
  by a live-Keycloak Jest test), not a container-network-reachability problem. Leave it untouched.

## Decision Log

- Decision: Delete the stale sections outright rather than mark them historical.
  Rationale: A workaround instructing a developer to stop the API and hand-build a host binary is actively
  harmful busywork once untrue; there is no reader value in keeping it as a footnote, and both READMEs already
  credit the underlying fix's compose configuration by referencing `OIDC_JWKS_URI`/`KEYCLOAK_ADMIN_API_BASE_URL`
  implicitly through normal containerized operation.
  Date/Author: 2026-08-22, source-audit finding from a full E2E pass.

## Outcomes & Retrospective

Implemented and validated live. Removed the "Known limitation" paragraph and its fenced host-run shell block
(the `docker compose stop api`, scratch `.nest-cli.local.json`/`tsconfig.local.json` build, and long
hand-copied environment variable list) from `bruno/organization-onboarding/README.md`, replacing it with a
one-sentence statement that the collection runs against the normal containerized stack; the already-correct
`pnpm keycloak:bootstrap-credential` / env-export / `npx @usebruno/cli run` block and its explanatory sentence
about requests 02/05 were kept unchanged. Removed the trailing "restart the containerized `api` service
afterward" sentence, which no longer applied. Removed the analogous, shorter "Known limitation" paragraph from
`bruno/service-client-management/README.md` (which only pointed at the other README's workaround), replacing it
with the same one-sentence statement; its own run block was already correct and untouched.

From a fresh `pnpm dev:reset`, ran both collections against the plain containerized stack exactly as their
updated READMEs now instruct: `bruno/organization-onboarding` 8/8 requests passing (including request 03,
`accept`, the exact request the stale doc claimed would fail with a `500`); `bruno/service-client-management`
4/4 requests passing (every request verifies a real OAuth bearer token against the containerized API's JWKS
endpoint, the exact mechanism the stale doc claimed would fail).

## Context and Orientation

Both READMEs currently open with a bolded "Known limitation" paragraph and a fenced shell block that stops the
`api` container, builds a scratch host binary (`.nest-cli.local.json`/`tsconfig.local.json`, referencing a "PR
6's precedent" that predates this repository's current ExecPlan numbering), and runs it directly with a long
list of hand-copied environment variables and Docker secret file paths. `bruno/organization-onboarding/README.md`
is the source workaround; `bruno/service-client-management/README.md` references it rather than repeating it.

## Scope and Non-Goals

Edit exactly these two README files. Do not change any Bruno request file, environment file, or the collections'
actual behavior. Do not touch `bruno/bff-sessions/README.md` or any other collection's docs. Do not change
`docker/compose.yaml` or any application code.

## Plan of Work

In `bruno/organization-onboarding/README.md`, delete the "Known limitation" paragraph and its host-run shell
block, and the trailing sentence about restarting the containerized `api` service afterward. Replace it with a
short paragraph stating the collection runs against the normal containerized stack, followed by the existing
plain `pnpm keycloak:bootstrap-credential` / env-export / `npx @usebruno/cli run` block (already correct, keep
as is). In `bruno/service-client-management/README.md`, delete its shorter "Known limitation" paragraph (which
only points at the other README) and keep its own already-correct run block unchanged.

## Interfaces and Dependencies

Documentation only. No code, schema, endpoint, or dependency changes.

## Acceptance Criteria

- Neither README references stopping the containerized `api` service, the scratch `.nest-cli.local.json`/
  `tsconfig.local.json` host build, or restarting the container afterward.
- Both READMEs still state the correct, current run instructions and pass the described requests when followed
  literally.

## Validation

From a fresh `pnpm dev:reset`, run `bru run --env local` (or `npx @usebruno/cli run --env local --sandbox
developer`) for both `bruno/organization-onboarding` and `bruno/service-client-management` directly against the
containerized stack, following each README's own updated instructions verbatim, and confirm every request
passes.

## Idempotence and Recovery

Documentation-only change with no runtime state. Re-editing is trivially safe.

## Artifacts and Notes

Live confirmation, run twice: first during the 2026-08-22 E2E audit that discovered the staleness, and again
on 2026-08-23 from a fresh `pnpm dev:reset` following the updated READMEs verbatim — both times plain
containerized `docker compose -f docker/compose.yaml` stack, no host-run workaround, `bruno/organization-onboarding`
8/8 requests passing and `bruno/service-client-management` 4/4 requests passing.

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
