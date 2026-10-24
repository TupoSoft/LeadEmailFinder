# Service Client Management

Organization owners and administrators create, list, rotate, disable, and delete application-owned API keys.
The resource paths and internal `service_client` kind remain stable while machine callers use each key directly
as a Bearer credential.

## Responsibility

- API-key issuance and lifecycle authorization, restricted to human owner/admin sessions with `credentials:manage`.
- Nonempty, unique permission grants within the auth-owned ceiling for the caller's membership role.
- One-time disclosure after identity commits the corresponding credential and audit transaction.

## Non-Responsibilities

- Persistence belongs to [`identity`](../identity/README.md), accessed through its purpose-specific public ports.
- Request authentication belongs to [`auth`](../auth/README.md), which reads current credential state on every request.
- Human login remains in `bff-session`; this module performs no external provider administration.

## Public API

[`src/index.ts`](src/index.ts) exports only `ServiceClientManagementModule`. Services, DTOs, the key generator,
and its injection token remain internal.

## Architecture

The API layer maps application errors to HTTP responses and exposes safe metadata. Application use cases inject
the identity directory/writer ports, the auth grant policy, and a small key-generation function. The infrastructure
generator uses Node cryptography: `lef_` plus 32 random bytes encoded as base64url, for 47 ASCII characters total.
It hashes the complete key using SHA-256 and exposes the first 12 characters as display metadata. Application and
domain code import neither Nest nor TypeORM. The composition root connects these capabilities through explicit factories.

## Dependencies

- [`identity`](../identity/README.md): principal and permission types, safe credential records, the stable
  `AUTH_IDENTITY_ISSUER`, and the directory/writer ports. This module imports no identity entity or database client.
- [`auth`](../auth/README.md): guards, controller decorators, role policy, and the shared service-client grant policy.

## HTTP Surface

`v1/organizations/:organizationId/service-clients` retains these resource paths:

| Method   | Path                                           | Result                                        |
| -------- | ---------------------------------------------- | --------------------------------------------- |
| `POST`   | `.../service-clients`                          | `201`, safe metadata and one-time `apiKey`    |
| `GET`    | `.../service-clients`                          | Safe metadata list                            |
| `POST`   | `.../service-clients/:serviceClientId/rotate`  | `200`, safe metadata and replacement `apiKey` |
| `POST`   | `.../service-clients/:serviceClientId/disable` | Empty `204`                                   |
| `DELETE` | `.../service-clients/:serviceClientId`         | Empty `204`                                   |

Every operation requires a human owner/admin session and `credentials:manage`. The application checks the
human credential kind and owner/admin role; both roles carry that capability in the auth role policy. The HTTP
permission guard enforces the same policy. Human principals carry an empty explicit permission array, so it is not
used to authorize these operations. API keys cannot manage keys,
regardless of their permissions. Cookie mutations retain Origin and CSRF validation. Organization and credential
parameters must be UUIDs. Create accepts an optional description of 1–200 characters and at least one unique
permission within `grantableServiceClientPermissions`.

Metadata contains `id`, `keyPrefix`, nullable `description`, `permissions`, `status`, `createdAt`, and `updatedAt`.
The `apiKey` field appears only in successful create/rotate responses. Neither metadata nor HTTP DTOs expose
`keyHash`. Existing secrets cannot be retrieved. All create/rotate responses, including failures before parsing,
carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer` through API-host middleware.

Invalid inputs return `400`; missing authentication returns `401`; disallowed credential kinds, roles,
permissions, or browser checks return `403`. Create/list reject a foreign organization with `403`. Mutations
return indistinguishable `404` responses for missing and foreign targets. Disabled rotation returns `409`;
disablement is terminal, and there is no re-enable endpoint. Persistence failures return `500`. A lost issuance
response requires explicit reconciliation using safe metadata before rotating, disabling, or deleting; never
retry creation or rotation automatically.

## Persistence

Identity owns the credential and audit tables. Each mutation and its audit commit in one local transaction.
Rotation conditionally updates only an active scoped row and preserves its ID and permissions. Concurrent
disablement or deletion cannot be undone by a stale rotation. Disablement remains idempotent; deleting an absent
credential returns `404`. Lists include disabled credentials in `createdAt DESC, id DESC` order.

The credential schema replaces the provider client ID with a unique non-null hash and display prefix. Existing
OAuth machine credentials are discarded with disposable development data. No migration or backfill is introduced.
Stop only the checkout-owned stack, follow the guarded reset in [`docker/README.md`](../../../../docker/README.md),
synchronize with `TYPEORM_SYNCHRONIZE=true`, and rerun the application seed. Preserve Keycloak human fixtures until
the later browser-login cutover.

## Configuration

None. Issuance uses application-owned cryptography and the stable identity issuer; no provider credentials are required.

## Validation

Focused application tests cover authorization, grant validation, one-time disclosure, uncertain outcomes, and
concurrent persistence outcomes. Controller and HTTP suites cover DTO serialization, status codes, authorization,
and cache headers. `infrastructure/api-key-generator.spec.ts` checks the cryptographic wire format and full-key hashing.

Identity's `api-key-credential-postgres.integration.spec.ts` exercises real local transactions in a randomly named
schema of an owned disposable database selected through `TEST_POSTGRES_URL` (database name ending in `_test`).
It covers hash uniqueness, safe projections, uncached permission lookup, rotation/disable/delete races, and rollback
when audit writes fail. The former provider administration tests were removed with that adapter.

[`bruno/service-client-management`](../../../../bruno/service-client-management/README.md) covers unauthenticated
requests and machine-key rejection. The live browser credential suite supplies human-session success evidence.
Run focused suites, the module architecture gate, type checking, OpenAPI checks, and relevant Bruno/browser runners;
passing substituted HTTP tests alone does not establish PostgreSQL or live human-login behavior.
