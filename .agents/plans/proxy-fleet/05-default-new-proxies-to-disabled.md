# Default new proxies to disabled

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prevent newly provisioned or unverified endpoints from receiving SMTP traffic automatically. PR #305 made disabled the consistent creation default while preserving explicit activation for already validated endpoints.

## Progress

- [x] (2026-08-11) Changed service, DTO/OpenAPI, and entity defaults to disabled.
- [x] (2026-08-11) Preserved explicit active creation for validated endpoints.
- [x] (2026-08-11) Added focused default/override coverage and merged PR #305.

## Surprises & Discoveries

- Observation: Service, DTO documentation, and database defaults all needed to agree; changing only one layer could still activate a new record unexpectedly.
  Evidence: PR #305 changed all three default declarations and their tests.

## Decision Log

- Decision: Default every omitted lifecycle value to `disabled`.
  Rationale: Provisioning must validate connectivity and egress identity before activation.
  Date/Author: 2026-08-11, PR #305.
- Decision: Continue accepting explicit `state: active`.
  Rationale: An authenticated administrator or health-gated automation may already have validated the endpoint before creation.
  Date/Author: 2026-08-11, PR #305.

## Outcomes & Retrospective

PR [#305](https://github.com/TupoSoft/LeadEmailFinder/pull/305) merged as `8a1f078`. Omitting lifecycle state now creates a disabled proxy across service and persistence paths; explicit activation remains possible.

## Context and Orientation

`CreateProxyDto`, `Proxy` entity metadata, and `ProxyService.createProxy` each participate in creation defaults. Candidate selection already excludes any state other than active.

## Scope and Non-Goals

The completed PR changed only proxy-creation defaults and focused tests. It did not add health checks, change existing records, alter leases, add automatic activation, or add a migration.

## Plan of Work

Align the DTO/OpenAPI default, TypeORM entity default, and service fallback on `ProxyLifecycle.DISABLED`. Add tests for omitted state and explicit active state so future refactors cannot silently restore active-by-default behavior.

## Interfaces and Dependencies

`POST /v1/proxies` retains its existing request shape. The observable change is the returned/persisted state when `state` is omitted. This plan depended on lifecycle support from PR #304 and established the activation invariant used by later provisioning.

## Acceptance Criteria

- Creating a proxy without `state` persists and returns `disabled`.
- Creating a proxy with explicit `active` persists and returns `active`.
- OpenAPI documentation and entity metadata report the same disabled default.
- Existing records are not rewritten.
- No health check, allocation behavior, or migration is added.

## Validation

PR #305 recorded 15 focused proxy tests and 22 changed-file pre-commit tests passing, plus successful typecheck and lint with two pre-existing unrelated warnings.

## Idempotence and Recovery

Creation is deterministic for the supplied state. Existing disposable records are unaffected; operators can patch lifecycle explicitly or recreate development data through the synchronized reset flow.

## Artifacts and Notes

Merged commit: `8a1f078`. Primary paths: `src/proxy/src/proxy.dto.ts`, `proxy.entity.ts`, `proxy.service.ts`, and `proxy.service.spec.ts`.

## Plan readiness

Completed in PR #305 (`8a1f078`).
