# Make proxy persistence private to the proxy module

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

SMTP verification should request proxy registry and allocation behavior through a public proxy contract rather than
querying the proxy table itself. After this change, the proxy module exclusively owns its TypeORM entity and mapping,
while SMTP verification retains the same candidate lookup, explicit proxy lookup, blacklist update, allocation,
and lease behavior.

## Progress

- [ ] (2026-08-21) Define and export the narrow proxy registry contract and injection token.
- [ ] (2026-08-21) Move registry persistence and mapping behind the proxy module boundary.
- [ ] (2026-08-21) Rewire SMTP verification and add contract/regression coverage.
- [ ] (2026-08-21) Run focused, static, and proxy/SMTP Bruno validation and record the result.

## Plan dependencies

- `module-boundaries/01`
- `proxy-fleet/14`

## Surprises & Discoveries

- `SmtpModule` imports `Proxy`, `ProxyModule`, and `ProxyRegistryService`, and registers the proxy entity in its own
  `TypeOrmModule.forFeature` call.
- `ProxyRegistryService` lives under SMTP but directly queries and mutates the proxy repository, including protocol
  mapping and blacklist persistence.
- The proxy module already exports allocator and observer tokens backed by concrete implementations, providing the
  established pattern for another narrow port.

## Decision Log

- Decision: Proxy owns registry reads and blacklist writes; SMTP consumes a tokenized `IProxyService`-compatible
  contract.
  Rationale: A feature must not depend on another feature's persistence entity or DTO representation.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Preserve the existing `IProxyService` contract unless focused tests demonstrate a missing operation.
  Rationale: The existing consumer-facing shape is already narrow and avoids an unnecessary parallel abstraction.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Keep allocation and registry behavior in one `ProxyModule` for this PR.
  Rationale: Splitting submodules is unrelated to closing the persistence leak.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/proxy/src/proxy.module.ts` registers the `Proxy` entity, administration controller, CRUD service, allocator,
lease service, TypeORM candidate repository, and allocation observer. It exports `PROXY_ALLOCATOR_TOKEN` and
`ALLOCATION_OBSERVER_TOKEN`. `src/lead-email-finder-api/src/email-verification-module/email-verifier/smtp/` contains
`ProxyRegistryService`, which separately injects `Repository<Proxy>` and maps `ProxyProtocol` to the shared `IProxy`
shape. `SmtpVerifier` consumes both `IProxyService` and `IProxyAllocator`.

## Scope and Non-Goals

Move registry persistence/mapping into `src/proxy/src`, expose it through a public token, and inject it into SMTP.
Delete the SMTP-owned repository adapter and its duplicated proxy-not-found exception if the proxy module's existing
error has the same HTTP semantics. Preserve routes, proxy selection, weighting, leases, blacklist behavior, DTOs,
entity schema, and error status. Do not relocate directories yet, redesign allocation, or change connection timeout
behavior delivered by `proxy-fleet/14`.

## Plan of Work

Add a proxy registry implementation beside the other proxy application services or adapt `ProxyService` only if that
keeps its responsibility cohesive. Bind the existing shared `IProxyService` contract to a stable proxy-owned token
and export that token from `ProxyModule`. Keep TypeORM queries, `ProxyLifecycle.ACTIVE` filtering, protocol mapping,
and deduplicated blacklist writes inside proxy-owned code.

Update `SmtpModule` to import `ProxyModule` but not `Proxy`, `ProxyLifecycle`, `ProxyProtocol`, or
`TypeOrmModule.forFeature([Proxy])`. Bind SMTP's existing local `PROXY_SERVICE_TOKEN` to the exported proxy registry
provider, or replace the local token consistently if doing so removes duplication without exposing infrastructure.
Move focused registry tests with their owner and update module wiring tests to prove the exported provider resolves.

## Interfaces and Dependencies

Export a proxy registry injection token and the narrow service interface from the proxy module's public surface.
Do not export `Proxy`, its repository, or administration DTOs for SMTP consumption. No endpoint, environment,
database, queue, Redis, or external package changes.

## Acceptance Criteria

- No file under email verification imports `proxy.entity`, `proxy.dto`, or a TypeORM proxy repository.
- Proxy registry lookup returns the same active proxies and protocol/authentication shape as before.
- Explicit lookup of a missing proxy preserves the existing not-found behavior.
- Blacklist updates remain deduplicated and persisted once per requested exchange.
- SMTP verification resolves both registry and allocator providers through `ProxyModule` and retains existing results.
- Proxy administration endpoints and schemas are unchanged.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/proxy/src
src/lead-email-finder-api/src/email-verification-module/email-verifier --runInBand`. Run
`corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`, and `git diff --check`. From each collection
directory, run `bru run --env local` for `bruno/proxy-registry` and `bruno/smtp-dev` when their documented
dependencies are available; otherwise record runtime coverage as unverified.

## Idempotence and Recovery

This is a wiring and ownership refactor with no data transformation. A partial move can be retried after restoring
imports to a compiling state. Existing proxy rows and Redis leases require no reset. Use the disposable development
reset only if runtime fixture data must be recreated for Bruno.

## Artifacts and Notes

Record the final cross-boundary import search, focused test counts, and redacted Bruno statuses. Never record proxy
credentials.

## Plan readiness

Ready to implement.
