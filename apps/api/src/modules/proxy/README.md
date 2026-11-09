# Proxy

## Responsibility

Owns the global proxy registry, health selection, and rate-limited allocation for outbound SMTP (Simple Mail Transfer
Protocol) connections. A proxy relays a connection through another IP address; a lease temporarily reserves its
capacity until release or expiry. Allocation and connection outcomes produce structured logs.

## Non-Responsibilities

Email verification belongs to [`email-verification`](../email-verification/README.md). Proxies have no organization
or credit ownership.

## Public API

The [public barrel](src/index.ts) exports `ProxyModule`; `IProxy`, `IProxyService`, `IProxyAllocator`, `LeasedProxy`,
`ProxyLease`, `ProxyLeaseRequest`; allocation/connection/release event types and `IAllocationObserver`; and
`PROXY_SERVICE_TOKEN`, `PROXY_ALLOCATOR_TOKEN`, `ALLOCATION_OBSERVER_TOKEN`.

Tokens identify injected capabilities at runtime. Controllers, persistence entities, administrative services, and
`IProxyLeaseService`/`PROXY_LEASE_SERVICE_TOKEN` remain internal.

## Dependencies

- [`auth`](../auth/README.md): permission guards and policy.
- Redis: infrastructure storage for leases, connected through the private `ProxyLeaseStore` port. A port is an
  interface implemented by an adapter, which connects application logic to a technical service.

## HTTP Surface

All routes require `platform:admin` under `/v1/proxies`:

| Method   | Suffix            | Action                                         |
| -------- | ----------------- | ---------------------------------------------- |
| `POST`   | `/`               | Create; defaults to `disabled`                 |
| `GET`    | `/`               | List                                           |
| `GET`    | `/healthy`        | Select using the allocator's eligibility rules |
| `GET`    | `/:id`            | Read                                           |
| `PATCH`  | `/:id`            | Update                                         |
| `DELETE` | `/:id`            | Delete                                         |
| `POST`   | `/:id/blacklists` | Report a mail-server blacklist; returns `204`  |

The browser OpenAPI contract (machine-readable endpoint definitions) includes all except `/healthy`.

Responses exclude credentials and include `blacklists`, defaulting to `[]`. Supplied `auth` requires a complete,
nonempty username/password object; omission during update preserves credentials. Credentials and blacklist entries
cannot be removed through the API. Create/update responses, including pre-validation errors, use
`Cache-Control: no-store` to prevent caching. A later read cannot reveal whether an uncertain credential change succeeded.

Lists are ordered by ID. `pageSize` accepts 1–100, default 100. Pagination uses a cursor: pass `nextPageToken`
unchanged as `pageToken`; an empty token ends traversal. No total is returned.

Only `active` proxies receive new work. `draining` and `disabled` block new allocations but do not end existing
leases. To retire a proxy, set `draining`, wait at least `PROXY_LEASE_TTL_MS`, and confirm its logs show releases with
no new `Proxy allocation acquired` events before disabling or deleting it.

## Persistence

Owns `proxy_registry`. Private repository ports separate registry and candidate queries from TypeORM, the database
mapping library. Redis stores lease bookkeeping separately.

## Configuration

- `PROXY_MX_REQUESTS_PER_MINUTE`: default 10 attempts per minute per mail exchanger (MX, the domain's receiving server).
- `PROXY_LEASE_TTL_MS`: default 60,000 milliseconds. TTL is the time a lease remains valid without release.

## Validation

Tests under `src/` cover authorization, credential redaction, defaults, pagination, cache headers, selection, and
Redis lease behavior. HTTP tests with substituted repositories do not establish live database behavior.

[`bruno/proxy-registry`](../../../../../bruno/proxy-registry/README.md) exercises the API lifecycle;
[`bruno/smtp-dev`](../../../../../bruno/smtp-dev/README.md) tests draining and real local SMTP allocation. Bruno is the
API-request runner used for those integration checks. Review dependency boundaries and run focused module tests after changes.
