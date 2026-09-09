# Organization Onboarding

Creates organizations with a first owner, and issues and accepts the invitations that add members afterward. It
administers membership — role changes and removal — under a final-owner invariant that a locked organization
row makes concurrency-safe, and handles the Keycloak compensation needed when a local mutation and a realm-role
change must stay consistent.

## Responsibility

- Creating a new organization together with its first owner's invitation (`platform:admin` only).
- Listing organizations for platform operators through a cursor-based directory without a total count.
- Issuing invitations into an existing organization, previewing pending invitations, and accepting an invitation (public, bearer-token
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
port/adapter, and every DTO are internal.

## Architecture

Layered per `module-architecture/06`. `api/` holds the controller, DTOs, and HTTP integration test — the only
layer that may import Nest/`class-validator`/Swagger. `application/` holds the use-case services and the
private `KeycloakOrganizationAdmin` port; both are framework-free, constructed through explicit factories in
`organization-onboarding.module.ts`. `domain/` holds invitation token generation/hashing/TTL, and the typed
errors `NotInOrganizationError`/`InsufficientPermissionError`/`MembershipNotFoundError`/`InvitationNotFoundError`/
`InvitationExpiredError`/`InvitationConsumedError`/`ConflictingMembershipError`/`FinalOwnerConflictError`/
`InvalidOrganizationCursorError`. `infrastructure/` holds the
`KeycloakOrganizationAdminClient` adapter. The controller's private `handleErrors()` maps each domain error to
the `ForbiddenException`/`NotFoundException`/`ConflictException`/`GoneException`/`BadRequestException` HTTP behavior.

`OrganizationListingService` checks platform authorization and converts an opaque continuation token into a typed
identity seek key. Tokens contain version 1, an integer creation timestamp in milliseconds, and a lowercase UUID.
Parsing requires canonical base64url without padding and canonical JSON; unknown fields, unsupported versions, malformed
UUIDs, fractional timestamps, and dates outside years 0001 through 9999 fail with `400`. Only identity implements
the database ordering and seek predicate.

Every use case that must call Keycloak while a lock is held — `InvitationAcceptanceService`,
`MembershipRoleChangeService`, `MembershipRemovalService` — does so through one of identity's two session-shaped
ports, `InvitationAcceptanceStore` or `MembershipMutationStore`. A `begin()` call returns either a terminal
outcome or a session that stays open across the Keycloak call. The service completes or aborts that session in a
`try`/`finally`, so a Keycloak failure always rolls back the lock and any partial state — exactly reproducing the
single-transaction correctness this module had before the split.

## Dependencies

- [`identity`](../identity/README.md) — `AuthPrincipal`/`AuthRole`, and the persistence ports
  `OrganizationRegistrationStore`, `InvitationStore`, `InvitationPreviewReader`, `InvitationAcceptanceStore`, `MembershipDirectory`,
  `MembershipMutationStore`, `OrganizationDirectoryReader` (plus their record types and tokens). This module no longer imports any identity
  TypeORM entity or `DataSource`/`EntityManager`.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `CurrentPrincipal`, `Public`,
  `RequirePermissions`.
- `@tuposoft/lead-email-finder/keycloak-admin-http` — the shared Keycloak Admin HTTP transport
  (`KeycloakAdminHttpModule`, `KEYCLOAK_ADMIN_HTTP`), also imported by
  [`service-client-management`](../service-client-management/README.md). This module's own
  `KeycloakOrganizationAdminClient` adapter, its business port, and its provider registration stay private and
  not shared.

## HTTP Surface

`OrganizationsController` at `v1/organizations`. Platform directory and creation, team, and invitation operations
appear in the runtime and browser OpenAPI contracts:

| Method   | Path                                                     | Access                                                |
| -------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `GET`    | `v1/organizations/invitations/:token`                    | Public — authenticated by the invitation token itself |
| `POST`   | `v1/organizations/invitations/:token/accept`             | Public — authenticated by the invitation token itself |
| `POST`   | `v1/organizations`                                       | `platform:admin`                                      |
| `GET`    | `v1/organizations`                                       | `platform:admin`                                      |
| `POST`   | `v1/organizations/:organizationId/invitations`           | `members:manage`                                      |
| `GET`    | `v1/organizations/:organizationId/members`               | `members:manage`                                      |
| `PATCH`  | `v1/organizations/:organizationId/members/:membershipId` | `members:manage`                                      |
| `DELETE` | `v1/organizations/:organizationId/members/:membershipId` | `members:manage`; `204 No Content`                    |

Member listing preserves active and disabled rows, nullable email, and deterministic `createdAt ASC, id ASC`
ordering. Role and removal operations retain server hierarchy and final-owner protection.

Organization listing accepts `pageSize` from 1 through 100, defaults to 50, and accepts an optional opaque
`pageToken`. It returns `organizations`, with only each organization's ID, name, creation timestamp, and update
timestamp. Ordering uses the database creation time truncated to milliseconds descending, then UUID descending.
The response includes `nextPageToken` only when another row exists; terminal pages omit it. There is no total,
invitation authority, or owner email in directory reads. Creation retains its existing request and one-time owner
invitation response; callers must reconcile an uncertain outcome before explicitly creating again.

Preview hashes the supplied token and uses identity's narrow `InvitationPreviewReader`. Only pending, unexpired
invitations expose organization name, invited email, role, expiry, and pending status. Unknown tokens return `404`;
expired or consumed tokens return `410` with `invitation_expired` or `invitation_consumed` and no invitation details.
A replayed acceptance returns only `{ "status": "accepted" }`, including a concurrent replay that loses the
conditional acceptance update. First acceptance retains organization ID, email, and role. Password validation keeps
its 12-character minimum.

Invitation responses, including platform creation and authentication or validation failures, receive
`Cache-Control: no-store` and `Referrer-Policy: no-referrer` from API-host middleware before body parsing, guards, and pipes run. Issued
raw tokens are returned once; this module provides no token recovery or email delivery. Cookie-authenticated
mutations retain the application Origin and CSRF-header requirements owned by authentication.

## Persistence

None owned. This module operates entirely through the persistence ports owned by `identity`, which read and
write the `Organization`, `OrganizationMembership`, `OrganizationInvitation`, `ExternalIdentity`, and
`AuditLogEntry` tables `identity` owns.

## Configuration

- `OIDC_ISSUER_URL`
- `KEYCLOAK_ADMIN_API_BASE_URL` (optional — overrides where the Keycloak Admin API is reached from)
- `KEYCLOAK_ORG_ADMIN_CLIENT_ID`
- `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`

## Validation

Focused tests live in `src/`: `application/organization-creation.service.spec.ts`,
`application/organization-listing.service.spec.ts`,
`application/invitation-issuance.service.spec.ts`, `application/invitation-acceptance.service.spec.ts`,
`application/invitation-preview.service.spec.ts`,
`application/membership-listing.service.spec.ts`, `application/membership-role-change.service.spec.ts`,
`application/membership-removal.service.spec.ts`,
`application/membership-mutation-concurrency.integration.spec.ts` (real-Postgres concurrent-mutation coverage for
the final-owner invariant, gated on `TEST_POSTGRES_URL`, built from the real `IdentityModule` port wiring),
`api/organizations.controller.spec.ts` (including its `handleErrors()` error-mapping cases),
`api/organization-onboarding-http.integration.spec.ts`, `organization-onboarding.module.spec.ts` (factory-provider
wiring), and the live-Keycloak-gated
`infrastructure/keycloak-organization-admin.live-keycloak.integration.spec.ts`.

Directory tests cover first, continuation, empty, and terminal pages; the default and boundary sizes; invalid and
unsupported cursors; cursor encodings that are not canonical; customer-role denial; and safe response serialization. HTTP creation tests
verify `no-store` on success, invalid bodies, malformed JSON, missing authentication, denied permission, and an
unexpected application failure. Identity owns the real PostgreSQL ordering and page-boundary tests. Generated
browser contract tests live in [`scripts/openapi/contracts.test.mjs`](../../../../scripts/openapi/contracts.test.mjs).

[`bruno/organization-onboarding`](../../../../bruno/organization-onboarding/README.md) proves organization
creation with a pending owner invitation, no-session invitation acceptance, generic duplicate acceptance, pending/unknown/expired/consumed preview responses and cache headers,
`409` on a duplicate owner invitation, cross-organization invitation rejection, and unknown-token rejection.
Role-hierarchy enforcement, final-owner protection, and Keycloak MFA-role assignment on promotion require a
genuine human session and are instead covered by `organization-onboarding-http.integration.spec.ts` and the
live-Keycloak spec above.
