# Add the unified development reset workflow

This ExecPlan is a living document maintained according to `.agent/PLANS.md`.

## Purpose / Big Picture

Give developers one safe, repeatable way to recreate all disposable application and identity state after an incompatible schema or realm change. The workflow ends with a seeded organization and a successful authenticated API request.

## Progress

- [ ] Add the targeted confirmation-based reset command.
- [ ] Add deterministic application and Keycloak reseeding.
- [ ] Add the final authenticated smoke test and documentation.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reset PostgreSQL, Keycloak PostgreSQL, Redis/BullMQ, and development S3 together.
  Rationale: Cross-service fixtures contain shared identifiers and are safer when recreated as one coherent set.
  Date/Author: 2026-08-14, project planning.
- Decision: Require confirmation before volume deletion.
  Rationale: Even disposable data should not be removed accidentally or through an overly broad command.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The project uses TypeORM synchronization and local Compose services. The auth roadmap adds a second PostgreSQL database for Keycloak and shared identity/application fixtures. There is no production data or migration history to preserve.

## Scope and Non-Goals

Add one repository command that confirms its action, targets only the named LeadEmailFinder development Compose project and volumes, recreates all relevant services, waits for readiness, provisions Keycloak, seeds application data, and runs an authenticated smoke test. Do not support selective preservation, production recovery, or migration execution.

## Plan of Work

Implement a small shell entrypoint under `docker/scripts` with explicit Compose project and volume names rather than broad globs. Validate the target before removal and require an interactive confirmation unless an explicit development-only confirmation flag is passed by CI. Start infrastructure in dependency order, wait on existing health checks, run Keycloak provisioning and application seeds, then obtain a Client Credentials token and call a protected endpoint.

## Interfaces and Dependencies

Add a package script such as `dev:reset` that delegates to the scoped Docker script. Seed one platform operator, one customer organization, one human member, an organization credit balance, and one M2M client. This plan depends on PR 9 and becomes the standard ongoing development workflow.

## Acceptance Criteria

- The command targets only explicitly named LeadEmailFinder development containers and volumes.
- It prints the targets and requests confirmation before deletion.
- A documented non-interactive flag is accepted only with the development Compose project name.
- It waits for PostgreSQL, Redis, S3, Keycloak, and API health before dependent steps.
- It synchronizes the schema, provisions Keycloak, and loads deterministic fixtures without migrations.
- Generated secrets are displayed once or written only to ignored development files.
- The final smoke test obtains an OAuth token and successfully calls a protected endpoint.
- Repeating the reset from a clean state produces the same logical fixtures and a healthy stack.

## Validation

Run Compose configuration validation, a confirmation-cancellation test, an invalid-target safety test, one full reset/reseed exercise, all service health checks, the authenticated smoke test, and project static checks.

## Idempotence and Recovery

Cancellation performs no deletion. A failed reset can be rerun because all targets are disposable and provisioning/seeding are idempotent. The script must never infer or recursively delete an unresolved path, workspace root, home directory, or unnamed volume.

## Artifacts and Notes

Record the exact named resources, sanitized seed summary, health results, and smoke-test response.

## Plan readiness

Ready to implement after PR 9.
