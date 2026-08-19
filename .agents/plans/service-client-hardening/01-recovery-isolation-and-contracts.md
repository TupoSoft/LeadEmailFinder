# Harden service-client recovery and API contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Preserve the strongest recovery, tenant-isolation, validation, and deterministic-response behavior found while comparing the pre-merge issue #333 implementation with merged PR #363. Operators can observe failed local creation cleaning up its generated Keycloak client, cross-organization item operations returning `404`, duplicate permissions returning `400`, and stable oldest-first listing.

## Progress

- [x] (2026-08-19) Add best-effort Keycloak compensation after a failed local creation transaction.
- [x] (2026-08-19) Align cross-organization item access, duplicate validation, idempotent delete handling, and list ordering.
- [x] (2026-08-19) Run focused/full-suite validation and the service-client Bruno collection.

## Plan dependencies

- `auth/08`

## Surprises & Discoveries

- The merged service-client HTTP adapter accepted `404` for idempotent deletion but still attempted to parse a non-empty 404 response body as JSON, so a delete race could fail after Keycloak had already reached the desired state.
- PR #363 intentionally runs Keycloak provisioning before the local transaction. Its generated `lef-svc-<uuid>` client ID makes compensating deletion safe because no other operation can own that client.

## Decision Log

- Decision: Keep PR #363's external-first creation and audit transaction, adding only best-effort provider compensation if that transaction fails.
  Rationale: This preserves the merged design and avoids adding a provisioning database state while preventing known-secretless Keycloak clients from accumulating during database failures.
  Date/Author: 2026-08-19, implementation.
- Decision: Preserve local-only disablement and the merged audit model.
  Rationale: Local status already revokes every request immediately; restoring the alternate provider-disable lifecycle would add a new failure mode and override a documented merged decision.
  Date/Author: 2026-08-19, implementation.
- Decision: Return `404` when rotate, disable, or delete targets an organization other than the actor's, while create/list organization mismatch remains `403`.
  Rationale: Item operations must satisfy auth/08's cross-organization non-disclosure criterion; collection-level operations have no target client to hide.
  Date/Author: 2026-08-19, implementation.

## Outcomes & Retrospective

Preserved five narrow improvements without restoring the alternate pre-merge lifecycle: database-failure compensation, accepted-404 handling, item-level tenant non-disclosure, duplicate-permission rejection, and deterministic listing. PR #363's audit writes, endpoint shapes, external-first provisioning, and local-only disablement remain intact.

Typecheck, build, lint (two unrelated pre-existing warnings), and `git diff --check` passed. Focused service-client coverage passed 59 tests across 8 suites. The full default suite passed 109 suites / 659 tests, with 7 environment-gated suites skipped and one existing todo. Bruno filename/name/sequence static checks passed. The service-client Bruno collection passed all 4 requests and all 4 tests against the local API, including duplicate-permission rejection.

## Context and Orientation

PR #363 added `src/lead-email-finder-api/src/service-client-management/`. `ServiceClientCreationService` provisions a deterministic Keycloak client before inserting `ServiceCredential` and its audit row. Item services scope repository reads by local organization, while `KeycloakAdminHttpClient` handles accepted Admin API statuses. `CreateServiceClientDto` defines the externally visible permission-array contract.

## Scope and Non-Goals

Add compensation for local creation failure, correct accepted-404 handling, enforce unique permissions, return `404` for cross-organization item operations, and order list results by creation time. Add focused tests and Bruno duplicate-validation coverage. Do not redesign provisioning states, change endpoint paths or success response shapes, disable clients in Keycloak, alter audit semantics, or add schema/migration work.

## Plan of Work

Wrap the post-provision local transaction in `ServiceClientCreationService`; on failure, call the existing idempotent `deleteClient` port and rethrow the original database error even if cleanup also fails. Treat an accepted 404 response as bodyless in the service-client Keycloak HTTP adapter. Apply `ArrayUnique` at the DTO boundary. Sort repository listing by `createdAt ASC`. Change only item-operation organization mismatch errors to `NotFoundException`. Update the nearest unit, HTTP-integration, and Bruno tests.

## Interfaces and Dependencies

No new endpoint or dependency. Existing create requests with duplicate permission entries now return `400`. Cross-organization rotate, disable, and delete requests return `404`. List order becomes deterministic, oldest first.

## Acceptance Criteria

- A failed local create transaction attempts to delete the request's generated Keycloak client and returns the original local failure.
- Failure of compensating deletion does not mask the original local failure or expose the one-time secret.
- An accepted Keycloak `404` delete response resolves successfully without parsing its body.
- Duplicate permissions are rejected with `400` before the application service runs.
- Cross-organization rotate, disable, and delete operations return `404` without repository or provider access.
- Service-client lists are ordered by `createdAt ASC` and still include disabled clients.
- Existing endpoint shapes, audit writes, local-only disablement, and full-suite behavior remain intact.

## Validation

Run:

    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- service-client --runInBand
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test --runInBand
    cd bruno/service-client-management && ADMIN_API_KEY=<value> /run/user/1000/fnm_multishells/125294_1787124153492/bin/bru run --env local
    git diff --check

## Idempotence and Recovery

Compensating deletion already treats a missing Keycloak client as success. Repeating a failed create generates a fresh UUID and cannot delete or overwrite another operation's client. No persistent data reset is required because this follow-up changes no schema.

## Artifacts and Notes

No generated client secret was recorded.

## Plan readiness

Completed and validated.
