# Add proxy lifecycle and capacity leases

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Represent proxy lifecycle and capacity explicitly and enforce shared concurrency and request-rate limits atomically in Redis. PR #304 created the capacity mechanism required before SMTP could stop racing the entire pool.

## Progress

- [x] (2026-08-11) Replaced the boolean enabled flag with active, draining, and disabled states.
- [x] (2026-08-11) Added per-proxy concurrency/RPM and global per-MX RPM configuration.
- [x] (2026-08-11) Added atomic Redis lease acquisition/release and merged PR #304.

## Surprises & Discoveries

- Observation: Capacity enforcement had to be added before SMTP allocation changed so the lease primitive could be reviewed independently from connection behavior.
  Evidence: PR #304 explicitly left the then-existing SMTP fan-out unchanged.

## Decision Log

- Decision: Use a Redis Lua script for acquisition.
  Rationale: Concurrency, per-proxy RPM, and per-MX RPM must be checked and consumed as one atomic cross-worker operation.
  Date/Author: 2026-08-11, PR #304.
- Decision: Default to one concurrent lease, ten proxy requests per minute, ten MX requests per minute, and a 60-second TTL.
  Rationale: These conservative defaults provide bounded initial capacity and defensive expiry without hard-coding fleet size.
  Date/Author: 2026-08-11, PR #304.

## Outcomes & Retrospective

PR [#304](https://github.com/TupoSoft/LeadEmailFinder/pull/304) merged as `442d90e`. Registry members now expose lifecycle and capacity, environment configuration validates global MX/TTL limits, and `ProxyLeaseService` atomically acquires and releases bounded leases.

## Context and Orientation

`Proxy` persists lifecycle, weight, `maxConcurrent`, and `requestsPerMinute`. `ProxyLeaseService` stores active leases and minute-window counters in Redis. `ProxyModule` owns the lease service, while SMTP allocation wiring was intentionally deferred.

## Scope and Non-Goals

The completed PR added lifecycle/capacity contracts, persistence fields, environment validation, Redis scripts, API/Bruno updates, and tests. It did not change SMTP fan-out, add candidate selection, add metrics, implement cooldowns, or add a migration.

## Plan of Work

Replace the boolean proxy state with `ProxyLifecycle`; add validated capacity fields and safe service/entity defaults; implement atomic lease acquisition that cleans expired leases, rejects exhausted limits, increments fixed-minute counters, and stores a TTL-backed lease identity; implement idempotent release behavior; and update the admin API examples.

## Interfaces and Dependencies

The registry added `state`, `maxConcurrent`, and `requestsPerMinute`. Environment configuration added `PROXY_MX_REQUESTS_PER_MINUTE` and `PROXY_LEASE_TTL_MS`. `ProxyLeaseService.acquire` returns a lease only when all limits permit it. This plan depended on PR #303 and unlocked serial allocation.

## Acceptance Criteria

- Only active proxies are eligible; draining and disabled are represented distinctly.
- Lease acquisition never exceeds the proxy concurrency limit.
- Proxy and MX request counters reject attempts beyond their configured minute limits.
- A granted lease expires defensively after the configured TTL and can be released explicitly.
- Competing worker requests cannot acquire capacity beyond the same Redis limits.
- Existing registry reads remain credential-redacted.
- No SMTP connection behavior or migration is changed in this PR.

## Validation

PR #304 recorded seven changed-file suites and 29 tests passing, plus the focused lease, registry, controller, adapter, and environment suite. Typecheck, build, lint with two existing unrelated warnings, OpenCollection YAML parsing, and `git diff --check` were also recorded as successful.

## Idempotence and Recovery

Expired Redis leases self-clean during acquisition and lease keys expire defensively. Releasing an absent/expired lease returns false without restoring spent rate tokens. Disposable Redis state can be reset by removing only the named development Redis volume; incompatible PostgreSQL development schema is reset through the documented synchronized-data workflow.

## Artifacts and Notes

Merged commit: `442d90e`. Primary paths: `src/proxy/src/proxy-lease.service.ts`, `proxy.entity.ts`, `proxy.dto.ts`, and `src/lead-email-finder-api/src/environment-variables.dto.ts`.

## Plan readiness

Completed in PR #304 (`442d90e`).
