# Organization Onboarding

Creates organizations and owner invitations, accepts invitations, and manages members through Keycloak, the external
identity server. Concurrent changes must never leave an organization without an active owner.

## Responsibility

- Create an organization and its first owner's invitation for platform operators.
- List/read safe organization details and list members.
- Issue, preview, and accept invitations; change roles and disable memberships.
- Compensate external role changes (attempt to undo them) when the related local transaction fails.

## Non-Responsibilities

[`identity`](../identity/README.md) owns persistence. [`service-client-management`](../service-client-management/README.md)
owns machine credentials. [`bff-session`](../bff-session/README.md) owns browser login. Invitations authenticate by
their bearer token: anyone possessing the token can use it, without an existing browser session.

## Public API

[`src/index.ts`](src/index.ts) exports only `OrganizationOnboardingModule`. Services, transport types, and the
`KeycloakOrganizationAdmin` interface/adapter remain private.

## Architecture

Application services use identity's narrow persistence interfaces. Invitation acceptance and membership changes
open a locked transaction through `InvitationAcceptanceStore` or `MembershipMutationStore`, keep it open across
the Keycloak call, and always complete or abort it. This serializes final-owner checks and rolls back partial local
state on failure. Application/domain code remains framework-independent; Nest and database/provider wiring stay
at the module boundary.

## Dependencies

- [`identity`](../identity/README.md): actor/role types, organization/invitation/member persistence interfaces.
- [`auth`](../auth/README.md): permission guards and principal lookup.
- `@tuposoft/lead-email-finder/keycloak-admin-http`: shared Keycloak Admin HTTP transport; this module's business
  adapter remains private.

## HTTP Surface

Paths below are relative to `/v1/organizations` and appear in the runtime/browser OpenAPI contract (the generated
HTTP API schema).

| Method        | Path                                     | Access                                      |
| ------------- | ---------------------------------------- | ------------------------------------------- |
| `POST`, `GET` | `/`                                      | `platform:admin`; create/list organizations |
| `GET`         | `/:organizationId`                       | `platform:admin`; read organization         |
| `POST`        | `/:organizationId/invitations`           | `members:manage`                            |
| `GET`         | `/:organizationId/members`               | `members:manage`                            |
| `PATCH`       | `/:organizationId/members/:membershipId` | `members:manage`                            |
| `DELETE`      | `/:organizationId/members/:membershipId` | `members:manage`; returns `204`             |
| `GET`         | `/invitations/:token`                    | Public token-authenticated preview          |
| `POST`        | `/invitations/:token/accept`             | Public token-authenticated acceptance       |

Organization detail exposes only `{ id, name, createdAt, updatedAt }`. Authorization precedes lookup: invalid UUIDs
(unique IDs) return `400`, missing authentication `401`, insufficient permission `403`, and absent organizations `404`.
Credit balances are not part of this read.

Listing accepts `pageSize` 1–100 (default 50) and an opaque `pageToken`: a continuation boundary clients must not
construct themselves. Results sort by millisecond creation time descending, then ID descending. `nextPageToken`
appears only when another page exists. There is no total count or owner/invitation data. Malformed, noncanonical,
or unsupported-version tokens return `400`. Member lists include active/disabled rows, nullable email, and stable
`createdAt ASC, id ASC` order. Role hierarchy and final-owner protection remain authoritative on the server.

Only pending, unexpired invitations reveal name, email, role, expiry, and status. Unknown tokens return `404`;
expired/consumed tokens return `410` with `invitation_expired`/`invitation_consumed`, without private details.
First acceptance returns organization ID, email, and role; repeated/concurrent acceptance returns only
`{ status: 'accepted' }`. Passwords require at least 12 characters.

Raw invitation tokens are returned once; there is no token recovery or email delivery. Invitation responses,
including failures, use `Cache-Control: no-store` (do not cache) and `Referrer-Policy: no-referrer` (do not forward the
URL to other sites). Cookie-authenticated mutations also require Origin checks and CSRF (cross-site request forgery) protection.
After an uncertain organization-creation response, reconcile the outcome before submitting another creation.

## Persistence

None owned. Identity stores organizations, memberships, invitations, external identities, and audit records.

## Configuration

- `OIDC_ISSUER_URL`: identity provider URL; OIDC is the OpenID Connect login standard.
- `KEYCLOAK_ADMIN_API_BASE_URL`: optional transport override.
- `KEYCLOAK_ORG_ADMIN_CLIENT_ID`, `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`: administrative service credentials.

## Validation

Application services have focused tests in `src/application/`; HTTP validation/permissions/serialization are covered
by `api/organization-onboarding-http.integration.spec.ts`. `organization-onboarding.module.spec.ts` checks wiring.
The membership concurrency integration test uses `TEST_POSTGRES_URL`; the live-Keycloak integration test checks
external role changes, including MFA (multi-factor authentication: an additional login proof).

Bruno collections cover [creation/invitations](../../../../bruno/organization-onboarding/README.md) and
[platform organization detail](../../../../bruno/platform-credits/README.md). Human-session role hierarchy,
final-owner races, and MFA assignment require the integration suites rather than machine-only HTTP fixtures.
