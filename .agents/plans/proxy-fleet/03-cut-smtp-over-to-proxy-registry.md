# Cut SMTP over to the proxy registry

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the secured `proxy_registry` table the only proxy inventory used by SMTP verification. PR #303 removed the disconnected legacy proxy persistence path so creating or updating a registry proxy affects the verification flow.

## Progress

- [x] (2026-08-10) Added an SMTP-facing adapter over the secured proxy registry.
- [x] (2026-08-10) Removed the duplicate SMTP-local proxy entity, service, module, and DTOs.
- [x] (2026-08-10) Preserved protocols, active filtering, blacklists, and credential access; merged PR #303.

## Surprises & Discoveries

- Observation: The public registry and SMTP verification used different tables and services.
  Evidence: PR #303 deleted `smtp/proxy/*` and registered `ProxyRegistryService` in `SmtpModule`.

## Decision Log

- Decision: Cut over directly without a migration or dual-write period.
  Rationale: The project has no production environment, data is disposable, and repository policy uses synchronization rather than migrations.
  Date/Author: 2026-08-10, PR #303.
- Decision: Keep credential retrieval inside the internal SMTP adapter.
  Rationale: Public DTOs remain redacted while connection infrastructure still receives the authentication it requires.
  Date/Author: 2026-08-10, PR #303.

## Outcomes & Retrospective

PR [#303](https://github.com/TupoSoft/LeadEmailFinder/pull/303) merged as `fc004ed`. SMTP verification now reads `proxy_registry`, and the duplicate `proxies` entity/service path no longer exists.

## Context and Orientation

`SmtpModule` wires `ProxyRegistryService` behind the SMTP proxy-service token. The adapter reads the registry entity and maps HTTP, HTTPS, SOCKS4, and SOCKS5 protocols into the internal proxy interface. Registry management remains in `src/proxy/src`.

## Scope and Non-Goals

The completed PR consolidated proxy inventory and removed dead types. It did not add capacity leasing, change the then-existing fan-out behavior, encrypt credentials, alter public registry authorization, or add a migration.

## Plan of Work

Implement a small SMTP adapter over the TypeORM registry, register it in `SmtpModule`, preserve active and blacklist eligibility, and retain internal credentials. Remove the legacy SMTP-local module and unused generic proxy CRUD interfaces after all consumers move.

## Interfaces and Dependencies

The internal `IProxyService` behavior remained available to SMTP, but its implementation changed to `ProxyRegistryService`. The public registry API was unchanged. This plan depended on PRs #301–#302 and unlocked lifecycle and capacity work.

## Acceptance Criteria

- SMTP selects proxies from `proxy_registry`, not a second table.
- Active/eligible filtering and MX blacklist exclusion behave as before.
- HTTP, HTTPS, SOCKS4, and SOCKS5 records map correctly for connection infrastructure.
- Public registry responses remain credential-redacted while internal SMTP mapping receives credentials.
- The legacy SMTP proxy entity, repository, service, and module are absent.
- No migration or dual write is introduced.

## Validation

PR #303 recorded 12 focused registry-adapter and proxy-service tests passing, plus successful typecheck, lint with two pre-existing unrelated warnings, and build.

## Idempotence and Recovery

The cutover is structural and repeatable. With disposable data, recovery from incompatible local schema is to stop Compose, remove only the named development database volume, restart with `TYPEORM_SYNCHRONIZE=true`, and recreate registry fixtures through the authenticated API.

## Artifacts and Notes

Merged commit: `fc004ed`. Primary paths: `src/lead-email-finder-api/src/email-verification-module/email-verifier/smtp/proxy-registry.service.ts` and `smtp.module.ts`.

## Plan readiness

Completed in PR #303 (`fc004ed`).
