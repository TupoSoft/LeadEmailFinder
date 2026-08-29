# Organization Onboarding

Creates organizations with a first owner, and issues and accepts the invitations that add members afterward. It
administers membership — role changes and removal — under a final-owner invariant that a locked organization
row makes concurrency-safe, and handles the Keycloak compensation needed when a local mutation and a realm-role
change must stay consistent.

## Responsibility

- Creating a new organization together with its first owner's invitation (`platform:admin` only).
- Issuing invitations into an existing organization, and accepting an invitation (public, bearer-token
  authenticated by the invitation itself) to create or reuse a Keycloak user.
- Listing members, changing a member's role, and removing a member, all under a final-owner protection that
  never allows an organization to be left without an active owner, even under concurrent requests.
- Compensating Keycloak realm-role assignments when a local transaction that depended on them fails or when a
  promotion/removal must also update realm roles.

## Non-Responsibilities

- No organization/membership/invitation persistence of its own (owned by
  [`identity`](../identity/README.md)); this module only operates on those entities.
- No M2M service-client life cycle (owned by
  [`service-client-management`](../service-client-management/README.md)).
- No browser login (owned by [`bff-session`](../bff-session/README.md)); invitation acceptance creates a
  Keycloak user directly through the Keycloak Admin API, independently of any browser session.

## Public API

[`src/index.ts`](src/index.ts) exports only `OrganizationOnboardingModule`. Every service, the Keycloak admin
client, and every DTO are internal.

## Dependencies

- [`identity`](../identity/README.md) — `Organization`, `OrganizationMembership`, `OrganizationInvitation`,
  `AuditLogEntry`, and the `AuthPrincipal`/`AuthRole` types.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `CurrentPrincipal`, `Public`,
  `RequirePermissions`.
- `@tuposoft/lead-email-finder/keycloak-admin-http` — the shared Keycloak Admin HTTP transport
  (`KeycloakAdminHttpModule`, `KEYCLOAK_ADMIN_HTTP`), also imported by
  [`service-client-management`](../service-client-management/README.md). This module's own
  `KeycloakOrganizationAdminClient` adapter, its business port, and its provider registration stay private and
  not shared.

## HTTP Surface

`OrganizationsController` at `v1/organizations`, excluded from Swagger:

| Method   | Path                                                     | Access                                                |
| -------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `POST`   | `v1/organizations/invitations/:token/accept`             | Public — authenticated by the invitation token itself |
| `POST`   | `v1/organizations`                                       | `platform:admin`                                      |
| `POST`   | `v1/organizations/:organizationId/invitations`           | `members:manage`                                      |
| `GET`    | `v1/organizations/:organizationId/members`               | `members:manage`                                      |
| `PATCH`  | `v1/organizations/:organizationId/members/:membershipId` | `members:manage`                                      |
| `DELETE` | `v1/organizations/:organizationId/members/:membershipId` | `members:manage`; `204 No Content`                    |

## Persistence

None owned. This module operates entirely on the `Organization`, `OrganizationMembership`,
`OrganizationInvitation`, and `AuditLogEntry` tables owned by `identity`.

## Configuration

- `OIDC_ISSUER_URL`
- `KEYCLOAK_ADMIN_API_BASE_URL` (optional — overrides where the Keycloak Admin API is reached from)
- `KEYCLOAK_ORG_ADMIN_CLIENT_ID`
- `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`

## Validation

Focused tests live in `src/`: `organization-creation.service.spec.ts`, `invitation-issuance.service.spec.ts`,
`invitation-acceptance.service.spec.ts`, `membership-listing.service.spec.ts`,
`membership-role-change.service.spec.ts`, `membership-removal.service.spec.ts`,
`membership-mutation-concurrency.integration.spec.ts` (real-Postgres concurrent-mutation coverage for the
final-owner invariant, gated on `TEST_POSTGRES_URL`), `organizations.controller.spec.ts`,
`organization-onboarding-http.integration.spec.ts`, and the live-Keycloak-gated
`keycloak-organization-admin.live-keycloak.integration.spec.ts`.

[`bruno/organization-onboarding`](../../../../bruno/organization-onboarding/README.md) proves organization
creation with a pending owner invitation, no-session invitation acceptance, idempotent duplicate acceptance,
`409` on a duplicate owner invitation, cross-organization invitation rejection, and unknown-token rejection.
Role-hierarchy enforcement, final-owner protection, and Keycloak MFA-role assignment on promotion require a
genuine human session and are instead covered by `organization-onboarding-http.integration.spec.ts` and the
live-Keycloak spec above.
