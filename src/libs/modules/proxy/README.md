# Proxy

Owns the proxy registry: administrative CRUD, blacklist reporting, health-based selection, and rate-limited
leased allocation for outbound SMTP connections that must originate from a rotating set of egress IPs.

## Responsibility

- Administrative CRUD over registered proxies, including reporting a proxy as blacklisted by a remote mail
  server.
- Health-based proxy selection (`GET /v1/proxies/healthy`) using the same eligibility query the allocator uses.
- Rate-limited, lease-based allocation (`ProxyAllocatorService`/`ProxyLeaseService`) so no single proxy exceeds
  its configured requests-per-minute budget while a connection is in flight.
- Structured allocation/lease/connection-outcome observability (`StructuredLoggingAllocationObserver`).
- Owning the `IProxy`/registry/allocator/lease contracts and their DI tokens that
  [`email-verification`](../email-verification/README.md) consumes — these are proxy business contracts, not
  generic shared utilities.

## Non-Responsibilities

- No SMTP verification itself — [`email-verification`](../email-verification/README.md) is the only consumer of
  proxy allocation, through this module's public barrel.
- No organization or credit concepts — proxies are a global resource, not scoped to any organization.

## Public API

[`src/index.ts`](src/index.ts) exports `ProxyModule`; the consumer-facing contracts `IProxy`, `IProxyService`,
`IProxyAllocator`, `LeasedProxy`, `ProxyLease`/`ProxyLeaseRequest`, the allocation/connection/lease-release event
types, `IAllocationObserver`; and only the DI tokens a consumer currently injects:
`PROXY_SERVICE_TOKEN`, `PROXY_ALLOCATOR_TOKEN`, `ALLOCATION_OBSERVER_TOKEN`.

`ProxyController`, the two internal application services (`ProxyService` for CRUD/admin, `ProxyRegistryService`
for the lookup contract other modules consume), the `Proxy` entity, its DTOs, the lease-service interface
(`IProxyLeaseService`) and its token (`PROXY_LEASE_SERVICE_TOKEN`); the persistence, Redis, and observability
adapters are internal too. `ProxyModule` resolves `PROXY_LEASE_SERVICE_TOKEN` for its own internal wiring — the
dependency `ProxyAllocatorService` has on `ProxyLeaseService` — but does not export it.

## Dependencies

- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `RequirePermissions`.
- Redis, injected directly (via the technical `libs/redis` package registered at the composition root) for
  lease bookkeeping — an infrastructure dependency, not a business-module one.

## HTTP Surface

`ProxyController` at `v1/proxies`, restricted to the `platform:admin` permission:

| Method   | Path                        | Notes                                     |
| -------- | --------------------------- | ------------------------------------------ |
| `POST`   | `v1/proxies`                | Create                                    |
| `GET`    | `v1/proxies`                | List                                      |
| `GET`    | `v1/proxies/healthy`        | Same eligibility query the allocator uses |
| `GET`    | `v1/proxies/:id`            | Read one                                  |
| `PATCH`  | `v1/proxies/:id`            | Update (state, weight, limits, and so on) |
| `DELETE` | `v1/proxies/:id`            | Delete                                    |
| `POST`   | `v1/proxies/:id/blacklists` | Report a blacklist; `204 No Content`      |

The generated browser contract includes create, list, read, update, delete, and blacklist reporting for the platform
console. `GET /v1/proxies/healthy` remains outside that contract and available in the full runtime OpenAPI document.
All serialized proxy responses, including healthy selection and deletion, exclude authentication and include the
stored nonsecret `blacklists` array, defaulting to an empty array. Request metadata marks authentication as
write-only. Supplied authentication must be an object with a complete, nonempty username and password; null and
arrays are rejected. An omitted `auth` on update preserves stored authentication; the API does not provide
credential or blacklist removal.

Create defaults to `disabled`; `active` opts into allocation, while `draining` and `disabled` exclude new allocation.
Neither excluded state proves that existing leases have ended. List orders by ID, accepts `pageSize` from 1 to 100
(default 100), and returns `nextPageToken` unchanged as the next request's `pageToken`. An empty string marks the end
of the traversal. The API supplies no total.

Every create and update response carries `Cache-Control: no-store`, including errors. API-host middleware applies
this header before body parsing, authentication, and validation, so malformed JSON and rejected requests also
prevent caching. A read cannot resolve the outcome of uncertain authentication replacement because responses
always redact stored credentials.

## Persistence

Owns one entity: `Proxy` → `proxy_registry`, behind the private `ProxyRepository` and `ProxyCandidateRepository`
application ports (`TypeOrmProxyRepository`/`TypeOrmProxyCandidateRepository` are their only adapters). Lease
bookkeeping lives in Redis behind the private `ProxyLeaseStore` port (`RedisProxyLeaseStore` is its only
adapter) — see Configuration below for the values that govern it.

## Configuration

- `PROXY_MX_REQUESTS_PER_MINUTE` (optional, default 10)
- `PROXY_LEASE_TTL_MS` (optional, default 60000)

## Validation

Focused tests live in `src/`, organized by layer: `api/proxy.controller.spec.ts`,
`api/proxy-response.mapper.spec.ts`, `api/proxy.swagger.spec.ts`, `api/proxy-http.integration.spec.ts`, `application/proxy.service.spec.ts`,
`application/proxy-registry.service.spec.ts`, `application/proxy-allocator.service.spec.ts`,
`application/proxy-lease.service.spec.ts`, `infrastructure/persistence/typeorm-proxy-repository.spec.ts`,
`infrastructure/persistence/typeorm-proxy-candidate.repository.spec.ts`,
`infrastructure/redis/redis-proxy-lease-store.spec.ts`,
`infrastructure/observability/structured-logging-allocation-observer.spec.ts`, and `proxy.module.spec.ts`.

The HTTP regression uses the real permission guard, validation, serialization, and application service with a mocked
repository. It verifies response redaction, blacklist visibility, disabled defaults, partial updates, cursor behavior,
customer denial, and cache headers on success and failure. `scripts/openapi/contracts.test.mjs` checks the browser
route allow list and generated response types, including the absence of stored authentication and healthy selection.

[`bruno/proxy-registry`](../../../../bruno/proxy-registry/README.md) exercises the secured CRUD life cycle above
end to end and removes the proxy it creates. In addition,
[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) proves the health-selection and allocation behavior
live: it drains the fixture proxy, confirms selection excludes it, and drives a real SMTP verification through
the allocator.
