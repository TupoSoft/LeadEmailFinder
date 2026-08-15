# Decouple proxy allocation adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Restore dependency direction after serial allocation by making SMTP depend on a small allocation contract and keeping TypeORM and Redis behind proxy-module adapters. PR #308 delivered the boundary without changing allocation behavior.

## Progress

- [x] (2026-08-12) Added allocator and lease interfaces plus injection tokens in the common boundary.
- [x] (2026-08-12) Extracted TypeORM candidate selection behind a purpose-specific repository.
- [x] (2026-08-12) Hid Redis leasing behind the proxy module and merged PR #308.

## Surprises & Discoveries

- Observation: The first serial allocator queried TypeORM directly and SMTP imported its infrastructure-owned allocation type.
  Evidence: PR #308 introduced `IProxyAllocator`, `IProxyLeaseService`, `ProxyCandidateRepository`, and module tokens.
- Observation: `SmtpVerifier` still persisted SMTP verification records directly.
  Evidence: The PR explicitly recorded that existing persistence boundary as out of scope.

## Decision Log

- Decision: Put allocation/lease contracts in `src/libs/common` and implementations in `src/proxy`.
  Rationale: Email verification needs only allocation behavior, not TypeORM entities, Redis clients, or provider-specific services.
  Date/Author: 2026-08-12, PR #308.
- Decision: Export only the allocator token from `ProxyModule`; keep the lease service private.
  Rationale: Selection, capacity, and release remain one proxy-module responsibility.
  Date/Author: 2026-08-12, PR #308.

## Outcomes & Retrospective

PR [#308](https://github.com/TupoSoft/LeadEmailFinder/pull/308) merged as `9f7afa6`. SMTP consumes `IProxyAllocator`; TypeORM candidate mapping and Redis leases are adapters wired through `useExisting`; module-contract and repository tests preserve the boundary.

## Context and Orientation

`IProxyAllocator`, `IProxyLeaseService`, `LeasedProxy`, and their tokens live under `src/libs/common/src/interfaces/proxy`. `TypeOrmProxyCandidateRepository` implements the proxy module's small repository port. `ProxyModule` wires concrete providers but exports only application-facing tokens.

## Scope and Non-Goals

The completed PR refactored dependency boundaries and added contract-focused tests. It did not alter selection weights, lease limits, SMTP result semantics, persistence behavior, public APIs, or schema.

## Plan of Work

Define small interfaces representing acquire/release and lease operations. Inject the allocator token into SMTP. Extract candidate lookup and entity-to-domain mapping into a TypeORM adapter. Wire interfaces with `useExisting`, keep Redis private, and add tests that fail if concrete infrastructure leaks across the module boundary.

## Interfaces and Dependencies

`IProxyAllocator.acquire(mxHost, proxyId?, excludedProxyIds?)` returns `LeasedProxy | undefined`; `release` accepts that allocation. `IProxyLeaseService` remains an internal proxy dependency. This plan depended on PR #307 and became the architecture base for observability and fleet adapters.

## Acceptance Criteria

- `SmtpVerifier` imports and injects the allocator contract, not `ProxyAllocatorService`.
- Allocation policy does not query TypeORM directly.
- Redis clients and the lease implementation remain private to `ProxyModule`.
- The TypeORM adapter preserves lifecycle, blacklist, protocol, weight, and capacity mapping.
- Existing serial fallback, release, and result behavior remains unchanged.
- Focused module tests prove the intended exports and injected tokens.

## Validation

PR #308 recorded six focused suites and 18 tests, plus 20 changed-file suites and 76 tests passing. Typecheck, build, lint with two unrelated existing warnings, and `git diff --check` were also recorded as successful.

## Idempotence and Recovery

This was a behavior-preserving refactor with no data mutation. Reverting the commit restores the prior concrete wiring, but later plans rely on these interfaces. No reset, migration, or recovery workflow is required.

## Artifacts and Notes

Merged commit: `9f7afa6`. Primary paths: `src/libs/common/src/interfaces/proxy`, `src/proxy/src/proxy-candidate.repository.ts`, `typeorm-proxy-candidate.repository.ts`, and `proxy.module.ts`.

## Plan readiness

Completed in PR #308 (`9f7afa6`).
