# Substitute Proxy Administration and Lease Dependencies Through Their Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The proxy HTTP controller should consume administration operations through a private contract. The allocator should
also honor the private lease token the module already defines. After this change, developers can substitute either
collaborator in a real Nest test without registering or replacing its concrete implementation. Proxy administration,
allocation, authorization, and HTTP behavior remain unchanged.

The proposed conventional commit subject and pull request title are
`refactor(proxy): inject administration and lease contracts`. This plan delivers exactly one pull request.

## Progress

- [ ] (2026-09-17) Extract private administration contracts and shared application errors.
- [ ] (2026-09-17) Inject administration and lease tokens while preserving one instance per implementation.
- [ ] (2026-09-17) Verify token substitution through real Nest composition and preserve HTTP regressions.
- [ ] (2026-09-17) Update Bruno assertions and documentation; run focused and repository checks.

## Plan dependencies

None.

## Surprises & Discoveries

The allocator already accepts `IProxyLeaseService`, but `proxy.module.ts` injects `ProxyLeaseService` into its
factory even though `PROXY_LEASE_SERVICE_TOKEN` is registered privately. Replacing that token therefore does not
replace the allocator's dependency. The module README describes token-based wiring that source does not yet honor.

`ProxyValidationError` and four command/result types live in `application/proxy.service.ts`. Changing only the
controller constructor would leave its error import coupled to the implementation file.

## Decision Log

- Decision: Define one private `ProxyAdministration` contract containing the seven operations this controller uses.
  Rationale: Registry administration is one cohesive boundary; one interface per HTTP method adds no useful seam.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Reuse `PROXY_LEASE_SERVICE_TOKEN` and retain concrete factories plus `useExisting` aliases.
  Rationale: Composition roots may construct implementations; consumers must receive the intended replaceable
  contract without creating duplicate instances or additional wrappers.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Keep administration and lease tokens private and preserve the current public export list.
  Rationale: SMTP consumers need registry, allocator, and observer contracts, not administrative access or lease
  bookkeeping. No cross-module API expansion is needed.
  Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All paths are relative to the repository root. Proxy owns its global registry and SMTP allocation under
`src/libs/modules/proxy/src/`. Its HTTP controller is `api/proxy.controller.ts`; the private administration service
is `application/proxy.service.ts`. That service already receives `ProxyRepository`, declared in
`application/ports/proxy-repository.ts`, and returns domain `ProxyRecord` values. API mapper functions redact stored
credentials and expose permitted response fields. The controller translates application errors to HTTP errors.

`proxy.module.ts` constructs administration, registry, lease, and allocation services, binds infrastructure adapters,
and publishes only `PROXY_ALLOCATOR_TOKEN`, `ALLOCATION_OBSERVER_TOKEN`, and `PROXY_SERVICE_TOKEN`.
`application/proxy-allocator.service.ts` already accepts a candidate repository, `IProxyLeaseService`, and an observer.
The lease contract and token live in `domain/proxy-lease.interface.ts` and `domain/proxy.tokens.ts`.

Read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and `src/libs/modules/proxy/README.md` before
implementation. Completed `module-architecture/05` and `proxy-fleet/07` established the existing separation. Their
historical paths and baseline commands are not current instructions; retain the strict architecture gate.

## Scope and Non-Goals

Change the private administration contract, controller injection, lease factory dependency, composition tests, affected
HTTP fixtures, existing Bruno assertions, and proxy documentation. Preserve routes, DTOs, public exports, error
semantics, persistence, Redis behavior, and configuration. This plan needs no changes to another business module.

Do not change weighted selection, lease limits, blacklist policy, concurrency, retries, SMTP behavior, billing, or
permissions. Do not split the controller, introduce a generic service interface, derive contracts from implementation
classes, or replace pure mapper functions with injectable wrappers. No schema changes, migrations, or data resets apply.

## Plan of Work

Create `application/ports/proxy-administration.ts` with an explicit `ProxyAdministration` interface and the private
`PROXY_ADMINISTRATION` symbol. Move `CreateProxyCommand`, `ListProxiesCommand`, `ListProxiesResult`, and
`ReportBlacklistCommand` from the service file into that contract. Define `UpdateProxyCommand` with the same optional
writable fields currently accepted through `ProxyFieldUpdates`: `protocol`, `host`, `port`, `auth`, `description`,
`weight`, `state`, `maxConcurrent`, and `requestsPerMinute`. Retain field types and absence semantics; the interface must
not import or derive its shape from `ProxyService`. Persistence contracts may remain structurally compatible.

Move `ProxyValidationError` into `application/proxy-validation.error.ts`. Update service, controller, and test imports
to that single definition. Retain the existing separate `ProxyNotFoundError` class. Preserve error names, messages, and
`instanceof` mapping, including propagation of unexpected errors.

Make `ProxyService implements ProxyAdministration`; keep its existing algorithms and repository collaborator. Add
`@Inject(PROXY_ADMINISTRATION)` to the controller and type its dependency as `ProxyAdministration`. Register
`{ provide: PROXY_ADMINISTRATION, useExisting: ProxyService }` alongside the existing service factory. Replace the
allocator factory's `ProxyLeaseService` entry in its `inject` array with `PROXY_LEASE_SERVICE_TOKEN`, preserving its
`IProxyLeaseService` parameter and the existing lease alias. Keep both private tokens out of exports.

Update `api/proxy.controller.spec.ts` to provide a typed administration fake through its token, with no concrete service
provider. Update `api/proxy-http.integration.spec.ts` to bind its real `ProxyService` instance through that same token;
keep the fake repository and real permission, validation, serialization, and HTTP error layers. Update application tests
only for relocated contract/error imports. Extend `proxy.module.spec.ts` with actual Nest composition in addition to
its existing public-export assertions. Substitute persistence, Redis, and observer adapters so tests require no network.
Import the real `ProxyModule` and override its TypeORM repository provider obtained with `getRepositoryToken(Proxy)`;
also replace `RedisProxyLeaseStore` and the candidate/observer contracts with typed fakes. These overrides allow the
imported provider graph to compile without a database connection or Redis client.

In that composition test, prove `PROXY_ADMINISTRATION` resolves to the existing `ProxyService` instance. Override
`PROXY_LEASE_SERVICE_TOKEN` with a typed fake, resolve the real allocator, acquire an eligible candidate, then release
the resulting allocation; both calls must reach the fake. Assert the returned lease and release result propagate.
Use a candidate-repository fake and retain the real module provider graph so a factory wired to the class token fails.

Because integration wiring changes, strengthen existing Bruno coverage rather than introducing a collection. In
`bruno/proxy-registry/15-get-healthy-proxy.yml`, also assert the selected proxy's blacklists exclude the queried
`mx.bruno.example.test`. In `27-get-deleted-proxy.yml`, assert the existing not-found message for the captured fixture ID.
Update the HTTP fixture in `scripts/bruno/proxy-registry-runner.test.mjs` to supply that existing error envelope. Retain
27 requests and 27 test blocks, reporting that protects credentials, and cleanup. Update the proxy and collection guides
with contract and validation details. Record executed results without claiming unavailable runtime evidence.

## Interfaces and Dependencies

`ProxyAdministration` exposes these operations using framework-independent types:

```ts
getProxy(id: string): Promise<ProxyRecord>
createProxy(command: CreateProxyCommand): Promise<ProxyRecord>
listProxies(command: ListProxiesCommand): Promise<ListProxiesResult>
updateProxy(id: string, command: UpdateProxyCommand): Promise<ProxyRecord>
deleteProxy(id: string): Promise<ProxyRecord>
getHealthyProxy(mxHost: string): Promise<ProxyRecord | undefined>
reportProxyBlacklist(id: string, command: ReportBlacklistCommand): Promise<void>
```

`PROXY_ADMINISTRATION` is one symbol declared with its contract. Reuse the existing lease symbol; do not recreate it.
No new libraries, endpoints, configuration keys, business dependencies, or barrel exports are introduced. Existing
`ProxyRepository`, `ProxyCandidateRepository`, `ProxyLeaseStore`, and observer contracts remain authoritative.

## Acceptance Criteria

- The controller compiles and runs with only a typed administration fake registered through its symbol; its production
  imports no longer include `proxy.service.ts`, including for command types or errors.
- Real Nest composition resolves the administration symbol and service class to the same object. Substituting the
  lease symbol changes the collaborator actually called by the allocator for acquisition and release.
- The module exports exactly the existing allocator, observer, and registry tokens. Administration, lease, and
  persistence tokens remain private; application and domain code retain framework independence.
- HTTP regressions retain disabled creation, redaction, omitted-authentication preservation, complete replacement,
  cursor traversal, blacklist reporting, lifecycle exclusion, 204 responses, 400/404 translation, unexpected failures,
  permission denial before persistence, and create/update no-store headers on success and failure.
- Allocation weights, capacity limits, lease release results, and observer-failure isolation retain existing tests.
  No Redis key, script, TTL, query, schema, route, or generated browser contract changes occur.
- Updated Bruno tests preserve healthy-selection eligibility and not-found error mapping while retaining safe
  reporting and exact fixture cleanup. Static, focused, architecture, and prose checks pass.

## Validation

Run focused backend and collection-fixture checks from the repository root:

```sh
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/proxy/src --runInBand
node --test scripts/openapi/contracts.test.mjs
node --test scripts/bruno/proxy-registry-runner.test.mjs scripts/bruno/organization-onboarding-runner.test.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/dependency-inversion/07-decouple-proxy-administration.md src/libs/modules/proxy/README.md bruno/proxy-registry/README.md
git diff --check
```

Inspect module exports and the controller's imports, then review the diff for narrow contracts and unchanged behavior.
For runtime checks, first verify disposable stack ownership using `docker/README.md` and the collection guides.
Use the pinned launchers, which select the local environment and credentials safely:

```sh
corepack pnpm bruno:proxy-registry
corepack pnpm bruno:smtp-dev
```

Run the SMTP command only after following its documented fixture setup for the checkout-owned stack; the two commands
do not imply identical stack prerequisites. SMTP checks cover real allocation and drain/restore behavior. Do not invoke
an unconfigured credential-bearing Bruno CLI directly. If runtime dependencies are unavailable, report Bruno as updated
with fixture/static results and runtime execution unverified. Fixture tests do not prove live Redis/SMTP behavior.

## Idempotence and Recovery

Code and test changes are safe to repeat and require no persisted-data conversion. Keep each symbol and error class
defined once while updating all consumers. Revert this pull request to restore previous wiring without data changes.
Runtime tests create uniquely identified disposable proxies; preserve captured-ID cleanup and never reset shared data.
After interruption, follow collection recovery instructions to remove only this run's confirmed fixtures.

## Artifacts and Notes

The audit found concrete injection at `api/proxy.controller.ts:60` and class-token lease wiring at `proxy.module.ts:71`.
Existing module tests assert provider metadata but do not execute token substitution; executable Nest coverage is the
critical new evidence. Record command results, exact export assertions, and runtime limitations here during delivery.

Outside this plan, `src/libs/dns/src/dns.service.ts` and `src/libs/redis/src/redis.module.ts` are technical adapters;
`src/libs/socket/src/` contains protocol functions. Existing DNS consumers already accept `IDnsService`. Host health
and configuration adapters in `src/lead-email-finder-api/src/` legitimately compose framework services. None requires
an extra wrapper merely because a concrete infrastructure class appears in composition. Completed `account-discovery/01`
and `account-discovery/02` already removed the former catch-all library; this plan does not duplicate that work.

## Plan readiness

Ready to implement.
