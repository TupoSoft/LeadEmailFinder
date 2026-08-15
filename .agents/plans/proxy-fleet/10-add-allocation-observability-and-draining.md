# Add allocation observability and prove draining

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make proxy allocation, SMTP connection, and lease release outcomes observable without coupling allocation policy to a metrics vendor. PR #311 also proved through the local fixture that draining and disabled proxies stop receiving new selections.

## Progress

- [x] (2026-08-14) Added the `IAllocationObserver` port and injection token.
- [x] (2026-08-14) Added structured-log events at allocation, connection, and release boundaries.
- [x] (2026-08-14) Extended the local collection with drain/exclusion/restore coverage and merged PR #311.

## Surprises & Discoveries

- Observation: Calling `/verify` twice for `lef.test` cannot prove drain behavior because `SmtpVerifier` caches its catch-all probe by domain.
  Evidence: PR #311 switched the Bruno assertion to `/v1/proxies/healthy`, which exercises the same active-state eligibility query without the cache.
- Observation: Draining exclusion already worked before observability was added.
  Evidence: `TypeOrmProxyCandidateRepository` already filtered `state = active`; the PR made the behavior visible and covered it end to end.

## Decision Log

- Decision: Add a small observer port with a structured-logging adapter and no public metrics endpoint.
  Rationale: Stable events are useful immediately, while the monitoring backend remains undecided and provider-specific code stays behind an adapter.
  Date/Author: 2026-08-14, PR #311.
- Decision: Emit connection outcomes from SMTP and allocation/release outcomes from the allocator.
  Rationale: Each service reports the event it actually knows without merging email verification and proxy-allocation responsibilities.
  Date/Author: 2026-08-14, PR #311.
- Decision: Swallow observer failures.
  Rationale: Telemetry must never prevent allocation or release.
  Date/Author: 2026-08-14, PR #311.

## Outcomes & Retrospective

PR [#311](https://github.com/TupoSoft/LeadEmailFinder/pull/311) merged as `8e6fd88`. Structured events now cover allocation acquired/exhausted, SMTP connected/failed, and lease released/failed with proxy ID, MX host, lifecycle state where known, and duration. Credentials are never event fields. The README documents the drain sequence and the Bruno fixture proves exclusion and restoration.

## Context and Orientation

`IAllocationObserver` lives in `src/libs/common/src/interfaces/proxy`. `StructuredLoggingAllocationObserver` is wired through `ALLOCATION_OBSERVER_TOKEN` in `ProxyModule`. `ProxyAllocatorService` emits allocation/release events, while `SmtpVerifier` emits connection outcomes. `bruno/smtp-dev` now finds, drains, checks exclusion, and restores the fixture proxy.

## Scope and Non-Goals

The completed PR added one observer contract, one logging adapter, emission tests, documentation, and local drain coverage. It did not add Prometheus, a metrics endpoint, tracing, active-lease administration, automatic draining, schema changes, or migrations.

## Plan of Work

Define stable credential-free event types. Inject the observer into allocation and SMTP through a token. Emit duration and outcome at each ownership boundary and isolate observer exceptions. Extend the local collection to transition the fixture proxy to draining, query eligibility without the verification cache, and restore active state.

## Interfaces and Dependencies

`IAllocationObserver` exposes `onAllocation`, `onConnectionOutcome`, and `onLeaseRelease`. `ProxyModule` exports the observer token for SMTP while keeping the concrete logger adapter internal. This plan depended on PR #308's ports and PR #310's local fixture and completes the application-side fleet groundwork.

## Acceptance Criteria

- Acquired and exhausted allocation paths emit one structured event with MX and duration.
- Connected and failed SMTP connection paths emit one event with proxy ID and no credentials.
- Successful and failed lease release paths emit one event and observer exceptions do not alter release behavior.
- Draining and disabled records receive no new eligible selection.
- The documented drain sequence waits at least one lease TTL and uses allocation/release logs before disable or delete.
- The local OpenCollection restores its fixture proxy so repeated runs remain safe.

## Validation

PR #311 added focused allocator, SMTP, observer-adapter, and module tests plus a six-request local OpenCollection flow. Its PR description does not record exact command totals or a final validation summary, so none are inferred here. Revalidation should run the focused specs, `corepack pnpm test:ci`, lint, typecheck, build, the local Bruno collection, and `git diff --check`.

## Idempotence and Recovery

Observer calls are side-effect-only logs and do not mutate allocation state. The Bruno collection restores the proxy to active after proving draining; if interrupted after drain, rerun its restore request or patch only the fixture proxy through the authenticated API.

## Artifacts and Notes

Merged commit: `8e6fd88`. Primary paths: `src/libs/common/src/interfaces/proxy/allocation-observer.interface.ts`, `src/proxy/src/structured-logging-allocation-observer.ts`, `proxy-allocator.service.ts`, `smtp-verifier.ts`, and `bruno/smtp-dev`.

## Plan readiness

Completed in PR #311 (`8e6fd88`).
