# Secure API key administration

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Close the privilege-escalation path in API-key administration and preserve one usable bootstrap administrator. PR #302 delivered the authorization dependency required by proxy-fleet administration and automated provisioning.

## Progress

- [x] (2026-08-10) Required an `ADMIN` key for API-key management endpoints.
- [x] (2026-08-10) Made bootstrap admin-key seeding repair missing permission or expiry.
- [x] (2026-08-10) Added OpenCollection authorization/revocation coverage and merged PR #302.

## Surprises & Discoveries

- Observation: Protecting proxy administration was incomplete while the API-key controller itself allowed public callers to request admin permissions.
  Evidence: PR #302 moved `ApiKeyGuard` and the admin-permission requirement onto the API-key controller.
- Observation: An existing bootstrap token could be present but unusable because it lacked `ADMIN` or had expired.
  Evidence: `AdminKeySeederService` was changed to repair the configured token rather than treating record existence as success.

## Decision Log

- Decision: Reuse the configured `ADMIN_API_KEY_FILE` value as the bootstrap root instead of adding another identity mechanism.
  Rationale: It preserves the existing local secret flow while making every subsequent key mutation authenticated.
  Date/Author: 2026-08-10, PR #302.
- Decision: Repair the known bootstrap key idempotently.
  Rationale: Disposable development state may persist stale key records across restarts; startup must converge them to an active administrator.
  Date/Author: 2026-08-10, PR #302.

## Outcomes & Retrospective

PR [#302](https://github.com/TupoSoft/LeadEmailFinder/pull/302) merged as `f3f077b`. API-key creation, permission inspection, and revocation are admin-only, and the configured bootstrap token is repaired to an active admin key during startup.

## Context and Orientation

API-key application and HTTP code lives in `src/libs/modules/api-key`. `ApiKeyController` exposes administration, `ApiKeyGuard` authenticates requests, and `AdminKeySeederService` reconciles the configured bootstrap token. The collection is under `bruno/api-key-administration`.

## Scope and Non-Goals

The completed PR secured key administration and repaired bootstrap behavior. It did not replace API keys with OIDC, change proxy allocation, alter credit behavior, or add migrations.

## Plan of Work

Apply the admin guard and permission decorator to API-key management routes. During seeding, look up the configured token and update it when permission or expiry is invalid. Cover unauthenticated generation, admin creation, non-admin rejection, permission checks, and revocation in unit tests and OpenCollection requests.

## Interfaces and Dependencies

The existing API-key endpoints retain their request/response contracts but now require `KeyPermissions.ADMIN`. This plan follows PR #301 and completes the authenticated administration path later provisioning scripts rely on.

## Acceptance Criteria

- Unauthenticated and non-admin callers cannot generate or revoke API keys.
- The configured bootstrap key is active, unexpired, and has `ADMIN` after startup, including when an old record is stale.
- An admin can create a restricted key, inspect its permissions, and revoke it.
- A revoked or restricted key cannot perform admin-only operations.
- No secret key value is committed by the OpenCollection environment.

## Validation

PR #302 recorded 12 focused controller, seeder, and guard tests passing; typecheck passed; lint passed with two pre-existing unrelated warnings; and all five OpenCollection YAML requests parsed with ordered kebab-case filenames.

## Idempotence and Recovery

Seeder reconciliation is repeatable and updates the one configured bootstrap token rather than creating duplicates. If disposable key data becomes incompatible, reset the named development database and restart so the existing seeder recreates the bootstrap state.

## Artifacts and Notes

Merged commit: `f3f077b`. Primary paths: `src/libs/modules/api-key/src/application/admin-key-seeder.service.ts`, `src/libs/modules/api-key/src/infrastructure/http/api-key.controller.ts`, and `bruno/api-key-administration`.

## Plan readiness

Completed in PR #302 (`f3f077b`).
