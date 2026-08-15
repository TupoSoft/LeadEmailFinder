# Allocate leased proxies serially

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Stop one email verification from opening connections through the entire proxy pool. PR #307 made SMTP acquire one bounded proxy lease at a time, try proxy/MX candidates serially, and release capacity on every terminal path.

## Progress

- [x] (2026-08-12) Added weighted active/non-blacklisted proxy allocation with Redis leases.
- [x] (2026-08-12) Replaced pool-wide `Promise.any` connection fan-out with serial fallback.
- [x] (2026-08-12) Covered release and result semantics and merged PR #307.

## Surprises & Discoveries

- Observation: Adding inventory increased outbound connection count because the old verifier raced every proxy/MX pair.
  Evidence: PR #307 removed the pool-wide `Promise.any` construction from `SmtpVerifier`.
- Observation: Capacity exhaustion and attempted connection failure require distinct verification outcomes.
  Evidence: The implementation preserves `no_connect` after attempted connections fail but returns `unknown` when no lease can be acquired.

## Decision Log

- Decision: Acquire one proxy lease per connection attempt and retry candidates serially.
  Rationale: Proxy inventory should distribute bounded attempts, not multiply them.
  Date/Author: 2026-08-12, PR #307.
- Decision: Release failed connection leases before trying another candidate and release successful allocations in `finally`.
  Rationale: Capacity must not leak on exceptions, cancellation, or normal SMTP completion.
  Date/Author: 2026-08-12, PR #307.
- Decision: Require explicit `proxyId` retries to acquire a lease too.
  Rationale: Administrative retry selection must not bypass shared concurrency or rate limits.
  Date/Author: 2026-08-12, PR #307.

## Outcomes & Retrospective

PR [#307](https://github.com/TupoSoft/LeadEmailFinder/pull/307) merged as `b24b0a8`. SMTP now holds at most one proxy lease per active attempt, falls back serially, and never bypasses capacity when a specific proxy is requested.

## Context and Orientation

`ProxyAllocatorService` orders eligible registry records by weight and calls `ProxyLeaseService`. `SmtpVerifier` loops MX candidates and allocations, creates one connection at a time, records whether any connection was attempted, and releases the allocation after failure or verification completion.

## Scope and Non-Goals

The completed PR added allocation behavior and SMTP integration. It did not introduce architecture ports/adapters, structured observability, health-based draining, fleet provisioning, or migrations.

## Plan of Work

Select only active, non-blacklisted records, order them by weighted random choice without replacement, and attempt atomic lease acquisition. Refactor SMTP connection setup into a serial loop. Track excluded proxy IDs after failed attempts, release before fallback, preserve explicit-proxy behavior, and map exhausted capacity separately from failed connections.

## Interfaces and Dependencies

The initial allocator was an injectable service returning a proxy plus lease. SMTP gained allocation/release integration but still depended on the concrete service until PR #308. This plan depended on PRs #304–#305 and unlocked safe fleet growth.

## Acceptance Criteria

- One verification starts no more than one proxy connection at a time.
- Only active, non-blacklisted proxies are considered.
- Every candidate must obtain a Redis lease before connecting, including explicit proxy retries.
- A failed connection releases its lease before the next candidate is tried.
- Successful or failed SMTP verification releases its lease in `finally`.
- No available lease returns `exists: null` with `unknown`; attempted connections that all fail retain `no_connect`.
- Per-proxy and per-MX capacity is never bypassed.

## Validation

PR #307 recorded 16 focused allocator, lease, registry, and SMTP tests plus four changed-file suites and 12 tests passing. Typecheck, build, lint with two unrelated existing warnings, and `git diff --check` were also recorded as successful.

## Idempotence and Recovery

Lease release and TTL expiry recover capacity after normal or interrupted attempts. Retrying a verification performs a new bounded allocation. Disposable Redis counters can be reset by removing only the named development Redis volume when intentionally resetting local state.

## Artifacts and Notes

Merged commit: `b24b0a8`. Primary paths: `src/proxy/src/proxy-allocator.service.ts` and `src/lead-email-finder-api/src/email-verification-module/email-verifier/smtp/smtp-verifier.ts`.

## Plan readiness

Completed in PR #307 (`b24b0a8`).
