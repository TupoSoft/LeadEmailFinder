# Service Client Management

Lets an organization's human members create, list, rotate, disable, and delete their own M2M (OAuth Client
Credentials) service clients, with the Keycloak client itself as the provider of record and local persistence
kept consistent through compensation on partial failure.

## Responsibility

- Self-service life cycle for organization-owned M2M service clients: create, list, rotate the client secret,
  disable, and delete.
- Keeping the local `ServiceCredential` record and the corresponding Keycloak client consistent, including
  compensating (reverting the Keycloak-side change) when the paired local mutation fails.

## Non-Responsibilities

- No `ServiceCredential` persistence of its own (owned by [`identity`](../identity/README.md)); this module only
  operates on that entity.
- No request-time M2M authentication (owned by [`auth`](../auth/README.md)); this module only manages the
  credentials auth later authenticates.

## Public API

[`src/index.ts`](src/index.ts) exports only `ServiceClientManagementModule`. Every service, the Keycloak admin
client, and every DTO are internal.

## Dependencies

- [`identity`](../identity/README.md) — `ServiceCredential`, `AuditLogEntry`, and the `AuthPrincipal`/
  `AuthPermission` types.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `CurrentPrincipal`,
  `RequirePermissions`.

## HTTP Surface

`ServiceClientsController` at `v1/organizations/:organizationId/service-clients`, excluded from Swagger, every
route requiring `credentials:manage`:

| Method   | Path                                           | Notes                    |
| -------- | ---------------------------------------------- | ------------------------ |
| `POST`   | `.../service-clients`                          | Create                   |
| `GET`    | `.../service-clients`                          | List                     |
| `POST`   | `.../service-clients/:serviceClientId/rotate`  | Rotate the client secret |
| `POST`   | `.../service-clients/:serviceClientId/disable` | `204 No Content`         |
| `DELETE` | `.../service-clients/:serviceClientId`         | `204 No Content`         |

Every route additionally requires a `human_session` credential kind at the service layer — an M2M bearer token
can never call these endpoints, regardless of its permissions.

## Persistence

None owned. This module operates entirely on the `ServiceCredential` and `AuditLogEntry` tables owned by
`identity`.

## Configuration

- `OIDC_ISSUER_URL`
- `KEYCLOAK_ADMIN_API_BASE_URL` (optional — overrides where the Keycloak Admin API is reached from)
- `KEYCLOAK_ORG_ADMIN_CLIENT_ID`
- `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`

## Validation

Focused tests live in `src/`: `service-client-creation.service.spec.ts`,
`service-client-listing.service.spec.ts`, `service-client-rotation.service.spec.ts`,
`service-client-disablement.service.spec.ts`, `service-client-deletion.service.spec.ts`,
`service-clients.controller.spec.ts`, `service-client-management-http.integration.spec.ts`, and the
live-Keycloak-gated `service-client-management.live-keycloak.integration.spec.ts`.

[`bruno/service-client-management`](../../../../bruno/service-client-management/README.md) proves only
rejection paths — missing credential, a cross-organization actor, and unsupported/duplicate permissions —
because Bruno cannot mint a `human_session`. The full create/list/rotate/disable/delete life cycle is instead
covered by `service-client-management.live-keycloak.integration.spec.ts` above.
