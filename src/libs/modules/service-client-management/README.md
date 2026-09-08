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

`ServiceClientsController` at `v1/organizations/:organizationId/service-clients`, published in runtime and browser OpenAPI, every
route requiring `credentials:manage`:

| Method   | Path                                           | Notes                    |
| -------- | ---------------------------------------------- | ------------------------ |
| `POST`   | `.../service-clients`                          | `201`; secret returned once |
| `GET`    | `.../service-clients`                          | List                     |
| `POST`   | `.../service-clients/:serviceClientId/rotate`  | `200`; replacement secret returned once |
| `POST`   | `.../service-clients/:serviceClientId/disable` | `204 No Content`         |
| `DELETE` | `.../service-clients/:serviceClientId`         | `204 No Content`         |

Every route additionally requires a `human_session` credential kind at the service layer — an M2M bearer token
can never call these endpoints, regardless of its permissions. Cookie mutations also require the existing Origin
and CSRF checks. Organization and service-client parameters must be UUIDs. Create accepts an optional description
of 1–200 characters and at least one unique permission from the current account's
`grantableServiceClientPermissions`; the auth-owned grant ceiling remains authoritative for stale or forged requests.
Duplicate permissions are rejected at both the DTO and application boundaries.

Create and rotate return the one-time `clientSecret`. List returns only `id`, `clientId`, nullable `description`,
`permissions`, `status`, `createdAt`, and `updatedAt`. Create and rotate responses carry `Cache-Control: no-store` for every success and failure. API-host middleware sets
the header before body parsing, authentication guards, and validation.
No endpoint retrieves an existing secret. Disabled clients cannot rotate, and there is no re-enable route.

Invalid inputs return `400`; missing authentication returns `401`; disallowed credentials, roles, permissions, or
browser requests return `403`. A missing client and a client outside the caller's organization both return `404`
for rotate, disable, and delete. Create/list reject a different organization with `403`. Disabled rotation returns
`409`. Provider or persistence failures return `500`; a lost create or rotate response requires explicit
reconciliation because the operation may already have taken effect. Disable and delete return empty `204` responses.
No schema change, migration, reset, or reseed is required.

## Persistence

None owned. This module operates entirely through `ServiceCredentialDirectory` and `ServiceCredentialWriter`,
whose TypeORM adapters are owned by `identity`. The directory performs organization-scoped lookups and lists
credentials in `createdAt DESC, id DESC` order, including disabled credentials. The writer keeps each create, rotate, disable, or delete mutation atomic
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
`api/service-client-lifecycle-http.integration.spec.ts`,
`service-client-management.module.spec.ts` (factory-provider wiring),
`infrastructure/config/service-client-management-configuration.spec.ts`,
`infrastructure/keycloak/keycloak-service-client-admin-client.service.spec.ts`, and the live-Keycloak-gated
`infrastructure/keycloak/service-client-management.live-keycloak.integration.spec.ts`. Identity's adapter behavior
is covered by `infrastructure/persistence/typeorm-service-credential-directory.spec.ts` and
`infrastructure/persistence/typeorm-service-credential-writer.spec.ts` in the identity module.

The creation service tests cover ordered grant-policy choices and reject duplicate, forged, or stale broader
permission selections before any Keycloak side effect. HTTP tests verify serialization, lifecycle authorization,
validation, and cache prevention on successful responses and failures from body parsing, guards, and applications.
The generated contract suite in `scripts/openapi/contracts.test.mjs` checks the five browser operations, exact status
codes, UUID parameters, permission enums, and secret-free list types.

[`bruno/service-client-management`](../../../../bruno/service-client-management/README.md) covers unauthenticated
creation and M2M rejection for all five operations, including cache prevention on create and rotate failures.
Bruno cannot mint a genuine human session. The dedicated live browser suite instead exercises the successful human
lifecycle, and `infrastructure/keycloak/service-client-management.live-keycloak.integration.spec.ts` covers the
provider lifecycle. Provider and persistence ports are substituted in the focused HTTP suite, so passing that suite
alone does not establish live Keycloak or PostgreSQL behavior.
