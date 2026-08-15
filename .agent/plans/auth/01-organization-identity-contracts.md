# Add organization and identity contracts

This ExecPlan is a living document maintained according to `.agent/PLANS.md`.

## Purpose / Big Picture

Introduce the application-owned identity vocabulary needed by both browser and machine authentication. This foundation was delivered by PR #312 and is retained as a completed living plan so later tasks can rely on current repository evidence rather than recreate it.

## Progress

- [x] (2026-08-14) Added framework-independent identity contracts in PR #312.
- [x] (2026-08-14) Added TypeORM entities, module wiring, metadata tests, and an empty-schema integration test in PR #312.
- [x] (2026-08-14) Confirmed the merged foundation is present on `master` at commit `b5e61ce`.

## Surprises & Discoveries

- Observation: The identity foundation merged before this roadmap was checked into the repository.
  Evidence: `master` contains commit `b5e61ce feat(auth): add identity and organization domain (#312)` and the `src/libs/modules/identity` module.

## Decision Log

- Decision: Use TypeORM synchronization and disposable development data rather than migrations.
  Rationale: The project has no production environment or data-preservation requirement.
  Date/Author: 2026-08-14, project planning.
- Decision: Keep Keycloak types outside the domain contracts.
  Rationale: Authentication providers are infrastructure adapters and must not define application policy.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

PR #312 delivered `AuthPrincipal`, role and permission constants, organization and identity persistence entities, module wiring, focused metadata tests, PostgreSQL schema integration coverage, and CI support. Development fixture orchestration remains intentionally assigned to plan 10, where application and Keycloak state can be seeded together.

## Context and Orientation

The existing `src/libs/modules/api-key` module still authenticates raw tokens and exposes `KeyPermissions`. Credits in `src/lead-email-finder-api/src/credits` are still keyed by those tokens. The merged `src/libs/modules/identity` module now provides the stable application model without changing either legacy flow.

## Scope and Non-Goals

The completed pull request created `src/libs/modules/identity/src`, registered its entities with the existing TypeORM connection, and defined organization, membership, external identity, service credential, credit-account, role, permission, credential-kind, and `AuthPrincipal` contracts. It did not integrate Keycloak, change guards or controllers, convert existing data, or add migrations.

## Plan of Work

The implementation defined small domain contracts that import no NestJS, TypeORM, Redis, or Keycloak APIs, added TypeORM entities, and wired `IdentityModule` into `LeadEmailFinderApiModule`. Deterministic cross-service development fixtures are deferred to plan 10 so Keycloak and application identifiers are created as one coherent seed set.

## Interfaces and Dependencies

Define `AuthPrincipal` with credential kind, issuer, subject, organization ID, membership role, permissions, and credential ID. Roles are `platform_admin`, `owner`, `admin`, and `member`. Permissions are `verification:run`, `verification:read`, `members:manage`, `credentials:manage`, `billing:read`, and `platform:admin`.

This completed plan has no dependency and unlocks every later auth plan.

## Acceptance Criteria

- Every membership and service credential belongs to exactly one organization.
- Issuer plus subject uniquely identifies an external identity.
- Domain contracts import no framework or infrastructure packages.
- Starting against an empty database with `TYPEORM_SYNCHRONIZE=true` creates the new tables.
- Existing API-key endpoints and protected routes behave as before.
- No migration file, migration command, or backfill is added.

## Validation

The merged pull request added domain tests, entity metadata tests, and an empty PostgreSQL schema integration test. When revalidating this completed task, run `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:ci`, and `corepack pnpm build`; the schema integration suite requires its configured PostgreSQL CI service.

## Idempotence and Recovery

Entity creation is driven by TypeORM synchronization. If the schema becomes incompatible, delete only the named LeadEmailFinder development volumes through the later reset workflow or documented Compose commands, then restart and reseed. No existing data is preserved.

## Artifacts and Notes

Record the final entity names, seed output, and focused test results during implementation.

## Plan readiness

Completed in PR #312 (`b5e61ce`).
