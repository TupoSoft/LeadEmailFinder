# Make proxy persistence private to the proxy module

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

SMTP verification should request proxy registry and allocation behavior through a public proxy contract rather than
querying the proxy table itself. After this change, the proxy module exclusively owns its TypeORM entity and mapping,
while SMTP verification retains the same candidate lookup, explicit proxy lookup, blacklist update, allocation,
and lease behavior.

## Progress

- [x] (2026-08-21) Define and export the narrow proxy registry contract and injection token.
- [x] (2026-08-21) Move registry persistence and mapping behind the proxy module boundary.
- [x] (2026-08-21) Rewire SMTP verification and add contract/regression coverage.
- [x] (2026-08-21) Run focused, static, and proxy/SMTP Bruno validation and record the result.

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
- The two `ProxyNotFoundException` classes did not have identical HTTP semantics: SMTP's own was a bare `Error`
  with no HTTP status (never actually routed through a controller, since `ProxyRegistryService.getById()` has no
  caller in `SmtpVerifier` and its one `addToBlacklist()` call site is already inside a swallowed `catch`), while
  the proxy module's own extends Nest's `NotFoundException` (404), used by `ProxyController`'s admin endpoints.
- `ProxyService` (the proxy module's existing CRUD/admin service) and `TypeOrmProxyCandidateRepository`
  (allocation-shaped) both already exist, but neither implements `IProxyService`'s exact `get`/`getById`/
  `addToBlacklist`-in-`IProxy`-shape contract — the registry implementation was genuinely new proxy-owned code,
  not an adaptation of an existing service, confirming the plan's own Decision Log framing.
- `bruno/proxy-registry`'s own blacklist request (`07-report-proxy-blacklist`) exercises `ProxyController`/
  `ProxyService.reportProxyBlacklist` -- a *separate*, pre-existing admin-facing blacklist-write path, untouched
  by this refactor. It is not proof of the relocated `ProxyRegistryService`/`IProxyService.addToBlacklist` path;
  only `bruno/smtp-dev`'s `02-verify-local-email` (via `SmtpVerifier`) exercises that.
- `bruno/proxy-registry` and `bruno/smtp-dev` need mutually exclusive Docker stack configurations: the former
  expects the plain base stack (host-facing Keycloak issuer); the latter's overlay overrides the API's issuer
  validation to the container-internal Keycloak URL, which rejects a host-minted token with the wrong `iss`
  claim. They cannot run against the same running stack -- had to bring the stack up, run one collection, tear
  down, bring the smtp-dev overlay up, run the other.

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
- Decision: `PROXY_SERVICE_TOKEN` becomes a `Symbol` defined in `src/libs/common/src/interfaces/proxy/proxy.tokens.ts`
  (alongside `PROXY_ALLOCATOR_TOKEN`/`PROXY_LEASE_SERVICE_TOKEN`/`ALLOCATION_OBSERVER_TOKEN`), replacing the
  SMTP-local plain-string constant of the same name.
  Rationale: matches the already-established pattern for every other proxy-module-exported token exactly, rather
  than inventing a second convention for this one.
  Date/Author: 2026-08-21, implementation.
- Decision: delete SMTP's own `ProxyNotFoundException` (bare `Error`, no HTTP status) and use the proxy module's
  existing `NotFoundException`-based one in the relocated registry service.
  Rationale: they were never actually identical, but the SMTP one's status code never surfaced through any HTTP
  boundary anyway (see Surprises & Discoveries), so consolidating removes needless duplication with zero
  observable behavior change -- satisfies the plan's own conditional ("...if the proxy module's existing error
  has the same HTTP semantics") in the only sense that matters for this call graph.
  Date/Author: 2026-08-21, implementation.

## Outcomes & Retrospective

Implemented and fully validated, including live regression against both affected Bruno collections.

`ProxyRegistryService` moved from `email-verifier/smtp/` to `src/proxy/src/` verbatim (same query logic, same blacklist dedup, same `IProxy` mapping), now legitimately injecting `Repository<Proxy>` in-module. `PROXY_SERVICE_TOKEN` moved from an SMTP-local string constant to a `Symbol` in `src/libs/common/src/interfaces/proxy/proxy.tokens.ts`, matching the existing `PROXY_ALLOCATOR_TOKEN`/`PROXY_LEASE_SERVICE_TOKEN`/`ALLOCATION_OBSERVER_TOKEN` pattern exactly. `ProxyModule` now provides and exports it (`useExisting: ProxyRegistryService`). `SmtpModule` no longer imports `Proxy`, registers it in `TypeOrmModule.forFeature`, or locally provides `ProxyRegistryService`/`PROXY_SERVICE_TOKEN` — resolution flows entirely through the already-imported `ProxyModule`'s export. SMTP's own duplicate `ProxyNotFoundException` (a bare `Error`, no HTTP status) was deleted in favor of the proxy module's existing `NotFoundException`-based one (see Decision Log).

Test suite: the 4 existing `ProxyRegistryService` tests moved to `src/proxy/src/proxy-registry.service.spec.ts` unchanged (same assertions, updated same-directory imports). `proxy.module.spec.ts`'s exact-array `exports` assertion updated to include `PROXY_SERVICE_TOKEN`, plus a new provider-registration assertion matching the existing style. `smtp.module.spec.ts` gained a new test proving `SmtpModule` imports `ProxyModule` and no longer locally provides `ProxyRegistryService`, following this suite's existing static-metadata-reflection convention rather than a full DB-backed compile.

Acceptance-criteria boundary check: `rg -n "proxy\.entity|proxy\.dto|proxy-candidate\.repository|TypeOrmProxyCandidateRepository" src/lead-email-finder-api/src/email-verification-module` returns zero matches. Focused suite (`src/proxy/src` + `email-verifier`, `--runInBand`): 14/14 suites, 68/68 tests. Repo-wide: `lint` clean (baseline only), `test:ci` 707/707 non-skipped (up from 706 — one new `smtp.module.spec.ts` test; the moved registry spec's 4 tests are a relocation, not new), `typecheck`/`build` clean (435 files), `git diff --check` clean; git correctly recorded the service/spec moves as renames.

Live Bruno regression, run in two separate stack configurations since the two collections need mutually exclusive Keycloak issuer wiring (see Surprises & Discoveries): `bruno/proxy-registry` against the plain base stack — 8/8 passing, including the blacklist request (which exercises a *different*, pre-existing admin path via `ProxyService`, untouched by this refactor — confirms it stayed unaffected, not a direct proof of the relocated code). `bruno/smtp-dev` against the `smtp-dev` overlay, run from inside the Docker network per its own README — 6/6 passing, including `02-verify-local-email`, which is the one request that actually exercises the relocated `ProxyRegistryService`/`PROXY_SERVICE_TOKEN` path end to end via `SmtpVerifier` and a real SOCKS5-proxied verification. The same pre-existing, unrelated ~136s delay from the `proxy-fleet/14` PR reappeared on that same request (traced there to a dead external `CATCH_ALL_HTTP_PROXY_URL`) — not investigated again since it was already root-caused as unrelated to proxy/SMTP wiring.

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

**Cross-boundary import search** (`rg -n "proxy\.entity|proxy\.dto|proxy-candidate\.repository|TypeOrmProxyCandidateRepository" src/lead-email-finder-api/src/email-verification-module`): zero matches.

**Focused test counts**: `src/proxy/src` + `email-verifier` (`--runInBand`): 14 suites / 68 tests, all passing.

**Bruno statuses** (redacted — no credentials recorded):
- `bruno/proxy-registry` (plain base stack): 8/8 requests passing.
- `bruno/smtp-dev` (smtp-dev overlay, run from inside `lef_default`): 6/6 requests passing, including `02-verify-local-email` (the relocated-code-path proof).

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
