# Layer Proxy and Publish Its Owned Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Proxy registry and allocation behavior should own both its implementation and the contracts consumers use. After
this change, proxy source is separated into API, application, domain, and infrastructure layers; email verification
depends on proxy's public barrel rather than feature-specific declarations in `libs/common`; and TypeORM/Redis/logging
details remain behind narrow ports.

A developer can resolve `ProxyModule` and its three exported runtime tokens through the public alias. The developer
can also run allocator, lease, and registry tests without concrete persistence and drive proxy-registry HTTP behavior
and real SMTP allocation through the existing Bruno workflows.

## Progress

- [ ] (2026-08-29) Move proxy HTTP, application, domain, persistence, Redis, and observability code into layers.
- [ ] (2026-08-29) Move proxy-owned contracts/tokens out of `libs/common` and publish them through the proxy barrel.
- [ ] (2026-08-29) Update SMTP verification to consume the public proxy API without a deep import.
- [ ] (2026-08-29) Run focused, static, full-suite, and both proxy/SMTP runtime regressions.

## Plan dependencies

- `module-architecture/03`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Proxy owns `IProxy`, registry, allocator, and lease contracts; lease and allocation records/events; observer
  contracts, and their DI tokens.
  Rationale: These are proxy business contracts, not generic utilities. Keeping them in `libs/common` obscures
  ownership and lets consumers bypass the module's intentional public API.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Export the consumer-facing contracts and `PROXY_SERVICE_TOKEN`, `PROXY_ALLOCATOR_TOKEN`, and
  `ALLOCATION_OBSERVER_TOKEN`; keep the lease-store and repository implementation tokens private.
  Rationale: SMTP needs registry/allocation/observation behavior, not direct lease bookkeeping or persistence.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Separate Redis lease storage from application allocation/lease rules behind a private port.
  Rationale: Redis commands, key layout, and expiry mechanics are infrastructure; capacity and release behavior are
  application policy.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep proxy and email verification as separate modules with a one-way
  `email-verification -> proxy` public dependency.
  Rationale: Proxy allocation is independently useful and already has its own HTTP/persistence responsibility; SMTP
  is merely one consumer.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Fourteen production proxy files currently sit directly under `src/libs/modules/proxy/src`, including `index.ts`.
The controller and DTOs, application services, TypeORM entity/repositories, Redis-backed lease service,
mapping profile, and structured logger are mixed together. `ProxyService` and `ProxyRegistryService` inject TypeORM
repositories directly. `ProxyLeaseService` issues Redis commands directly while enforcing lease rules.

Proxy's actual consumer contracts live under `src/libs/common/src/interfaces/proxy/`. That directory defines the
proxy shape, registry, allocator, lease service, lifecycle events, observer, and four tokens. Proxy implementations
import those declarations from `common`; SMTP verification imports the same declarations while importing
`ProxyModule` from the proxy barrel. No other business feature consumes them.

The current public proxy barrel exports only `ProxyModule`. `ProxyModule` exports the allocator, observer, and
registry tokens but deliberately keeps the lease-service token private. Preserve that runtime encapsulation.

## Scope and Non-Goals

Move the controller, DTO, and HTTP mapping concerns to `api/`; allocation, registry, CRUD, lease policy, and their
ports to `application/`; proxy state/profile and public value types to `domain/`; and TypeORM, Redis, configuration,
and structured logging implementations to `infrastructure/`. Keep `proxy.module.ts` and `index.ts` as root
composition/public entry points.

Move only the `interfaces/proxy` feature contracts from `libs/common` into proxy's domain/application directories,
update `common` barrels, and publish the supported contracts through proxy's root barrel. Update proxy and SMTP
imports to the exact proxy alias. If removing the directory leaves no proxy content in `common`, remove it; keep
generic enum/time utilities and non-proxy contracts untouched for their owning later plans.

Introduce private, purpose-specific repository/lease-storage ports where application services currently import
TypeORM or Redis. Preserve current implementations and tests behind those ports. Update proxy and email-verification
module documentation files and remove the corresponding architecture-baseline entries.

Make proxy application/domain framework-free. Use typed not-found/validation outcomes or errors in application and
translate them to the current Nest HTTP exceptions in API. Build application services with explicit provider
factories in `ProxyModule`; configuration and logger instances arrive through ports or factory arguments rather than
application-layer Nest decorators.

Do not change proxy routes, DTO schemas, status codes, permissions, default state, weighting, healthy-selection
query, blacklist deduplication, requests-per-minute/concurrency limits, lease TTL, Redis key semantics, structured
event fields, allocation ordering, or SMTP behavior. Do not merge socket or SMTP implementations into proxy, add a
new package, or change database metadata.

## Plan of Work

Move public proxy value types and contracts first so implementations and consumers can target their final imports.
Use explicit named exports from `src/libs/modules/proxy/src/index.ts`; do not export controllers, DTOs, TypeORM
entities/repositories, Redis stores, or concrete services merely to simplify tests. Update SMTP verifier, client,
factory, and their specs to import only supported proxy contracts/tokens from the exact alias.

Re-layer proxy files with adjacent tests. Extract application-facing repository interfaces from direct TypeORM
usage and a lease-storage interface from direct Redis commands. TypeORM adapters retain current entity/query/mapping
behavior; the Redis adapter retains atomic acquire/release, expiry, and rate-window behavior. Application services
continue making eligibility, weighting, exclusion, allocation, and release decisions. Structured logging remains an
infrastructure implementation of the public observer contract.

Map TypeORM entities to domain records inside persistence infrastructure, then map domain records to response DTOs
inside API. Replace the current entity-to-DTO mapping profile rather than making API import an infrastructure entity
or infrastructure import an API DTO; response fields and serialization stay identical.

Replace Nest application exceptions and decorators with plain classes/errors. API controllers map proxy not-found
and validation failures to the same statuses/messages. `ProxyModule` uses explicit factories to inject repositories,
lease storage, observer, and plain configuration values into application services.

Update `ProxyModule` to bind private ports to adapters and public tokens to application services with `useExisting`.
Preserve the exact exported token set. Add or update a module contract test that fails if private repository,
lease-storage, or lease-service bindings become public. Delete fixed baseline entries only after
`architecture:check` observes the new layout and imports.

## Interfaces and Dependencies

The proxy barrel publicly exports `ProxyModule`; proxy/domain value types including the existing `IProxy` shape;
registry and allocator interfaces; `ProxyLease`/`LeasedProxy` and request shapes; allocation, connection, and release
events; the observer interface; and only the tokens consumers currently inject. Existing names should remain stable
to keep SMTP changes import-only.

Proxy depends on the public permission API from auth, TypeORM, Redis, and generic Nest/configuration/logging libraries.
Email verification imports the proxy public contracts and `ProxyModule`. No proxy implementation imports email
verification, and no public interface exposes TypeORM, Redis, Nest, or concrete entity types.

## Acceptance Criteria

- Proxy source follows the four layers with only its Nest composition file and public barrel at root.
- Proxy application/domain files do not import any `@nestjs/` package, TypeORM, Redis, another forbidden technical
  package, or infrastructure paths.
- `src/libs/common/src/interfaces/proxy` no longer exists, and proxy/SMTP imports resolve through the exact public
  proxy alias.
- The public barrel exports all current SMTP-facing proxy contracts but no controller, DTO, entity, repository,
  Redis adapter, or private persistence/lease token.
- `ProxyModule` resolves the same public registry, allocator, and observer tokens exactly once and retains the same
  private lease-provider behavior.
- Registry CRUD/blacklist/healthy queries, weighted allocation, exclusions, rate limits, leases, release, draining,
  and observability retain focused test behavior.
- Architecture checking has no new or stale proxy/common violation.
- Proxy registry and SMTP HTTP behavior remains unchanged.

## Validation

Run focused proxy and SMTP consumers:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/proxy/src src/libs/modules/email-verification/src/email-verifier/smtp --runInBand

Run boundary and repository checks:

    rg -n "IProxy|PROXY_(SERVICE|ALLOCATOR|LEASE_SERVICE)_TOKEN|ALLOCATION_OBSERVER_TOKEN" src/libs/modules/proxy src/libs/modules/email-verification/src/email-verifier/smtp
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/module-architecture/05-layer-proxy-and-publish-owned-contracts.md src/libs/modules/proxy/README.md src/libs/modules/email-verification/README.md
    git diff --check

No Bruno request definitions should change, but integration wiring does. Before touching Compose, inspect the
`lef-api-1` project working-directory label. Stop if another checkout owns it. For a stack owned by this checkout,
run `pnpm dev:reset -- --confirm-project=LEF`, provision the documented service credential, and run the base
collection in a subshell:

    (cd bruno/proxy-registry && npx @usebruno/cli run --env local --sandbox developer)

Still from the repository root and only for the confirmed owned stack, follow the documented SMTP switch: stop the
base Compose project, then start `docker/compose.smtp-dev.yaml` with the base file. Run `bruno/smtp-dev` from the
official/Node Bruno container attached to `lef_default`, with the container-internal Keycloak issuer and
`baseUrl=http://api:3000`. The two collections require different issuer wiring and must not be presented as one
simultaneous stack result.

## Idempotence and Recovery

The change moves source and contracts without changing data. TypeORM synchronization sees identical entity
metadata, and Redis uses the same keys and expiration values. Repeating imports or tests is safe. During a partial move, keep one
authoritative contract path and update all consumers before deleting the old `common` exports; do not duplicate
tokens because symbols from two files are not interchangeable. If runtime validation fails, stop only the
disposable stack owned by this worktree and restart the appropriate documented base or SMTP configuration.

## Artifacts and Notes

Record the final public export list, zero-result old-common import search, provider contract result, focused/full
test totals, and separate base-stack/SMTP-stack Bruno evidence. Do not record proxy passwords or client secrets.

## Plan readiness

Ready to implement.
