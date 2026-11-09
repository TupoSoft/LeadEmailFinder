# Service Client Management

A service client is an application calling the API with its own key rather than a human browser session.

## Responsibility

Owns API-key issuance, rotation, disablement, and deletion for organization owners/admins. Validates grants against
the caller's role and reveals a new key only after its credential and audit record commit together.

## Non-Responsibilities

[`identity`](../identity/README.md) owns persistence; [`auth`](../auth/README.md) authenticates each request using
current credential state; [`bff-session`](../bff-session/README.md) owns human browser login.

## Public API

The [public barrel](src/index.ts) exports only `ServiceClientManagementModule`. Services, request/response models,
and key generation remain internal.

## Dependencies

- [`identity`](../identity/README.md): safe credential records, principal/permission types, `AUTH_IDENTITY_ISSUER`,
  and directory/writer ports. A principal is the authenticated caller; a port is an interface for an external capability.
- [`auth`](../auth/README.md): guards, role authorization, and the grant policy defining permissions a human can issue.

Application code uses these ports; infrastructure uses Node cryptography. Keys contain `lef_` plus 32 random bytes
encoded as base64url (URL-safe text): 47 characters total. Stored key material is limited to the complete key's
SHA-256 hash (a one-way fingerprint) and the key's first 12 display characters.

## HTTP Surface

Routes use `/v1/organizations/:organizationId/service-clients`:

| Method   | Suffix                      | Result                                   |
| -------- | --------------------------- | ---------------------------------------- |
| `POST`   | `/`                         | `201`, metadata and one-time `apiKey`    |
| `GET`    | `/`                         | Metadata list, including disabled keys   |
| `POST`   | `/:serviceClientId/rotate`  | `200`, metadata and replacement `apiKey` |
| `POST`   | `/:serviceClientId/disable` | Empty `204`                              |
| `DELETE` | `/:serviceClientId`         | Empty `204`                              |

Every operation requires an owner/admin **human** session with `credentials:manage`; API keys cannot manage keys.
Browser mutations also validate Origin and CSRF protection, which prevents another website acting through a user's
session. IDs must be UUIDs (the API's standard unique-identifier format). Creation accepts an optional 1–200 character
description and nonempty, unique permissions within `grantableServiceClientPermissions`.

Metadata contains `id`, `keyPrefix`, `description`, `permissions`, `status`, `createdAt`, and `updatedAt`; never
`keyHash`. Existing secrets cannot be retrieved. Create/rotate responses, including early errors, prohibit caching
and referral URL disclosure with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

| Status | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Invalid input                                                                     |
| `401`  | Missing authentication                                                            |
| `403`  | Wrong role, credential kind, grant, browser check, or organization on create/list |
| `404`  | Missing or foreign target on mutation; indistinguishable to callers               |
| `409`  | Rotation of a disabled key                                                        |
| `500`  | Persistence failure                                                               |

Disablement is terminal: no re-enable endpoint exists. If an issuance response is lost, inspect safe metadata before
an explicit recovery action. Never automatically retry creation or rotation: the first request may have committed.

## Persistence

Identity commits each mutation and its audit in one transaction, so both succeed or both roll back. Rotation updates
only an active scoped row, preserving ID and permissions; stale rotations cannot undo concurrent disablement/deletion.
Disablement is idempotent (repeating it has no extra effect); deleting an absent key returns `404`. Lists use
`createdAt DESC, id DESC` order.

The API-key schema replaces legacy OAuth machine credentials without a production migration. For incompatible
disposable development data, recreate only the owned database and prepare identities and keys again.
Keep Keycloak human identities until browser-login cutover.

## Configuration

No provider credentials or module-specific settings are required.

## Validation

Application/HTTP tests cover authorization, one-time disclosure, uncertain responses, serialization, cache headers,
and key generation. Identity's `api-key-credential-postgres.integration.spec.ts` uses an owned `_test` database via
`TEST_POSTGRES_URL` to verify uniqueness, audit rollback, uncached lookup, and mutation races.

[`Bruno checks`](../../../../bruno/service-client-management/README.md) cover missing authentication and machine-key
rejection; Bruno runs API request collections. Review dependency boundaries and run type checking and focused tests;
substituted HTTP tests do not prove real database or login behavior.
