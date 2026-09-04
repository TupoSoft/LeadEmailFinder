# Service Client Management

Lets an organization's human members create, list, rotate, disable, and delete their own M2M (OAuth Client
Credentials) service clients, with the Keycloak client itself as the provider of record and local persistence
kept consistent through compensation on partial failure.

## Responsibility

- Self-service life cycle for organization-owned M2M service clients: create, list, rotate the client secret,
  disable, and delete.
- Authoritative rejection of requested service-client permissions outside the auth-owned grant ceiling for the
  caller's membership role.
- Keeping the local `ServiceCredential` record and the corresponding Keycloak client consistent, including
  compensating (reverting the Keycloak-side change) when the paired local mutation fails.

## Non-Responsibilities

- No `ServiceCredential` persistence of its own (owned by [`identity`](../identity/README.md)); this module only
  requests purpose-specific reads and atomic credential/audit writes through identity's public ports.
- No request-time M2M authentication (owned by [`auth`](../auth/README.md)); this module only manages the
  credentials auth later authenticates.

## Public API

[`src/index.ts`](src/index.ts) exports only `ServiceClientManagementModule`. Every service, the Keycloak admin
client, and every DTO are internal.

## Architecture

Layered per `module-architecture/07`. `api/` holds the controller, DTOs, HTTP integration test, and mapping from
typed service-client errors to the unchanged Nest HTTP exceptions. `application/` holds the five life-cycle use
cases and the private `KeycloakServiceClientAdmin` port. `domain/` holds the framework-free service-client error
vocabulary. `infrastructure/config/` adapts Nest configuration to the plain application contract, while
`infrastructure/keycloak/` holds the `KeycloakServiceClientAdminClient` adapter together with live-Keycloak coverage.

Application and domain import neither Nest nor TypeORM. `service-client-management.module.ts` constructs each use
case through an explicit factory, injecting identity's directory/writer ports, the private Keycloak port, the
framework-free auth-owned service-client grant policy, and the issuer as plain configuration. The controller alone
translates application/domain failures to HTTP behavior.

## Dependencies

- [`identity`](../identity/README.md) — `AuthPrincipal`/`AuthPermission`, `ServiceCredentialDetailRecord`, and the
  `ServiceCredentialDirectory`/`ServiceCredentialWriter` persistence ports with their injection tokens. This module
  imports no identity TypeORM entity, repository, or `DataSource`.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `CurrentPrincipal`, `RequirePermissions`,
  and the shared `ServiceClientGrantPolicy` contract and injection token.
- `@tuposoft/lead-email-finder/keycloak-admin-http` — the shared Keycloak Admin HTTP transport
  (`KeycloakAdminHttpModule`, `KEYCLOAK_ADMIN_HTTP`), also imported by
  [`organization-onboarding`](../organization-onboarding/README.md). This module's own
  `KeycloakServiceClientAdminClient` adapter, its business port, and its provider registration stay private and
  not shared.

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

None owned. This module operates entirely through `ServiceCredentialDirectory` and `ServiceCredentialWriter`,
whose TypeORM adapters are owned by `identity`. The directory performs organization-scoped lookups and oldest-first
listing, including disabled credentials. The writer keeps each create, rotate, disable, or delete mutation atomic
with its corresponding audit entry in the `ServiceCredential` and `AuditLogEntry` tables. Its conditional,
organization-scoped mutation outcomes prevent a stale pre-provider snapshot from re-enabling or recreating a
credential that was concurrently disabled or deleted.

## Configuration

- `OIDC_ISSUER_URL`
- `KEYCLOAK_ADMIN_API_BASE_URL` (optional — overrides where the Keycloak Admin API is reached from)
- `KEYCLOAK_ORG_ADMIN_CLIENT_ID`
- `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`

## Validation

Focused tests live in `src/`: `application/service-client-creation.service.spec.ts`,
`application/service-client-listing.service.spec.ts`, `application/service-client-rotation.service.spec.ts`,
`application/service-client-disablement.service.spec.ts`, `application/service-client-deletion.service.spec.ts`,
`api/service-clients.controller.spec.ts`, `api/service-client-management-http.integration.spec.ts`,
`service-client-management.module.spec.ts` (factory-provider wiring),
`infrastructure/config/service-client-management-configuration.spec.ts`,
`infrastructure/keycloak/keycloak-service-client-admin-client.service.spec.ts`, and the live-Keycloak-gated
`infrastructure/keycloak/service-client-management.live-keycloak.integration.spec.ts`. Identity's adapter behavior
is covered by `infrastructure/persistence/typeorm-service-credential-directory.spec.ts` and
`infrastructure/persistence/typeorm-service-credential-writer.spec.ts` in the identity module.

The creation service tests cover the injected grant-policy boundary and reject forged or stale broader permission
selections before any Keycloak side effect.

[`bruno/service-client-management`](../../../../bruno/service-client-management/README.md) proves only
rejection paths — missing credential, a cross-organization actor, and unsupported/duplicate permissions —
because Bruno cannot mint a `human_session`. The full create/list/rotate/disable/delete life cycle is instead
covered by `infrastructure/keycloak/service-client-management.live-keycloak.integration.spec.ts` above.
