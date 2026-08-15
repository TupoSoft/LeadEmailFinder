# Secure proxy registry endpoints

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Protect proxy-registry management and keep proxy credentials out of administrative responses. This foundation was delivered by PR #301 so provisioning and operators can use the registry without exposing fleet secrets to unauthenticated callers.

## Progress

- [x] (2026-08-10) Required an `ADMIN` API key for every proxy-registry route.
- [x] (2026-08-10) Redacted proxy authentication from create, read, list, update, selection, and delete responses.
- [x] (2026-08-10) Added the OpenCollection proxy-registry smoke suite and merged PR #301.

## Surprises & Discoveries

- Observation: DTO redaction alone was insufficient because list serialization and delete response mapping did not consistently use the public DTO shape.
  Evidence: PR #301 changed `ProxyListDto`, automapper profile behavior, and deletion mapping in addition to adding the controller guard.
- Observation: The final list/delete Bruno assertion fixes were merged without a recorded post-fix live rerun.
  Evidence: The PR validation notes explicitly require rebuilding the API and rerunning the collection.

## Decision Log

- Decision: Protect the complete controller with `ApiKeyGuard` and `KeyPermissions.ADMIN`.
  Rationale: Every registry operation can expose or alter shared proxy capacity and must use one consistent authorization boundary.
  Date/Author: 2026-08-10, PR #301.
- Decision: Use response DTO exclusion instead of deleting stored credentials.
  Rationale: SMTP adapters still require credentials internally, while management reads must never serialize them.
  Date/Author: 2026-08-10, PR #301.

## Outcomes & Retrospective

PR [#301](https://github.com/TupoSoft/LeadEmailFinder/pull/301) merged as `bbedc1e`. The registry is admin-only, public DTOs redact authentication, list responses have a stable `proxies` envelope, and delete returns the deleted proxy descriptor. The OpenCollection suite remains the local authorization and CRUD regression path.

## Context and Orientation

The registry lives under `src/proxy/src` and exposes `/v1/proxies` through `ProxyController`. `ProxyService` owns registry behavior, `ProxyProfile` maps persistence entities to public DTOs, and `ApiKeyModule` supplies the authorization guard. The collection is under `bruno/proxy-registry` and reads `ADMIN_API_KEY` from ignored local configuration.

## Scope and Non-Goals

The completed PR changed registry authorization, response serialization, focused tests, and Bruno coverage. It did not change SMTP allocation, capacity limits, lifecycle semantics, credential storage at rest, or database schema through a migration.

## Plan of Work

Import `ApiKeyModule` into `ProxyModule`, protect the controller at class level, exclude `auth` from `ProxyDto`, and ensure all controller responses pass through the redacted mapping. Correct list and delete contracts and exercise unauthenticated denial, CRUD, healthy selection, blacklist reporting, redaction, and cleanup through kebab-case OpenCollection requests.

## Interfaces and Dependencies

The externally visible API remains `/v1/proxies`; callers must now supply an admin API key and never receive `auth`. This plan depended on the existing API-key guard and unlocked safe capacity, provisioning, and reconciliation work.

## Acceptance Criteria

- A request without an API key receives `401` and a non-admin key receives `403` for every registry route.
- An admin key can create, list, read, update, select, blacklist, and delete proxies.
- No management response includes proxy username or password.
- List responses expose `proxies` as an array and delete responses preserve the deleted proxy ID.
- The OpenCollection request filenames are kebab-case and its environment does not commit the admin key.

## Validation

PR #301 recorded 13 focused proxy tests and 14 changed-file pre-commit tests passing, plus successful typecheck and lint with two pre-existing unrelated warnings. Live Bruno execution verified route statuses before the final list/delete assertion fixes; a completed post-fix live rerun was not recorded and must not be inferred.

## Idempotence and Recovery

Authorization and serialization changes are stateless and repeatable. The Bruno collection creates and removes its own smoke proxy. If interrupted, rerun its delete request or remove only the smoke proxy through the authenticated API.

## Artifacts and Notes

Merged commit: `bbedc1e`. Primary paths: `src/proxy/src/proxy.controller.ts`, `src/proxy/src/proxy.dto.ts`, `src/proxy/src/proxy.profile.ts`, and `bruno/proxy-registry`.

## Plan readiness

Completed in PR #301 (`bbedc1e`).
