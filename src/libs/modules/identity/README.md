# Identity

Owns the persistence for organizations and their memberships, external identities (both human and service),
invitations, the credit ledger, and the audit trail. It also defines the shared domain types —
`AuthPrincipal` and the role/permission/status enums — that every other business module depends on to describe
who is acting and what they are allowed to do.

## Responsibility

- Organizations, their memberships, and the roles/status of each membership.
- External human identities (one row per Keycloak subject) and service credentials (one row per M2M client).
- Organization-scoped credit accounts and the debit/grant ledger rows that back them.
- Invitations issued during organization onboarding, and audit log entries recorded by other modules.
- Resolving a human identity's active membership (`HumanIdentityResolver`), for session/principal construction —
  still used by `invitation-acceptance.service.ts` in `organization-onboarding`, which needs to enlist identity
  creation in its own ambient transaction; not used by `auth`/`bff-session` since `module-architecture/03`.
- A framework-free `ExternalIdentityResolver`, `ActiveMembershipReader`, and `ActiveServiceCredentialReader`,
  used by `bff-session` (identity resolution on OIDC return, active-membership checks) and `auth` (active
  service-credential checks) since `module-architecture/03`; `organization-onboarding` and
  `service-client-management` migrate to these ports in later plans.

## Non-Responsibilities

- No HTTP endpoints of its own — nothing in this module is reachable directly over HTTP.
- No authentication or authorization logic (owned by [`auth`](../auth/README.md)); this module only defines the
  shapes those decisions are made against.
- No credit business rules — debiting, granting, and balance checks are owned by
  [`credits`](../credits/README.md); this module only stores the resulting rows.
- No onboarding or invitation workflow logic (owned by
  [`organization-onboarding`](../organization-onboarding/README.md)); this module only stores the resulting
  entities.

## Public API

Everything under `src/` is exported from [`src/index.ts`](src/index.ts). Unlike most modules in this directory,
the public surface of `identity` is its whole `src/` tree — there is no internal implementation hidden behind the
barrel. It splits into two parts:

**Supported application ports** — the contract new and migrating consumers should depend on: `IdentityModule`,
`ExternalIdentityResolver`, the three ports and their injection tokens (`ExternalIdentityStore`/
`EXTERNAL_IDENTITY_STORE`, `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, `ActiveServiceCredentialReader`/
`ACTIVE_SERVICE_CREDENTIAL_READER`), their record types (`ExternalIdentityRecord`, `OrganizationMembershipRecord`,
`ServiceCredentialRecord`), and the domain enums/types (`AuthPrincipal`, `AuthCredentialKind`, `AuthRole`,
`AuthPermission`, `AuditOutcome`, `InvitationStatus`, `MembershipStatus`, `ServiceCredentialStatus`).

**Temporary compatibility surface (deprecated)** — `HumanIdentityResolver`, `TypeOrmModule` reexported for direct
repository injection, and every entity class listed under Persistence below. Each is still justified by a
consumer not yet migrated: `credits` operates on `OrganizationCreditAccount`/`CreditDebit`/`CreditGrant`
directly; `organization-onboarding` and `service-client-management` run raw TypeORM transactions over several
identity entities, including the `invitation-acceptance.service.ts` file in `organization-onboarding`, which
passes its own `EntityManager` into `HumanIdentityResolver`. `auth` and `bff-session` no longer use this surface
as of `module-architecture/03`. `module-architecture/08` removes what remains of it once plans `04`, `06`, and
`07` have migrated the rest.

## Dependencies

None. Identity imports no other `@tuposoft/lead-email-finder/modules/*` alias — it is the foundation every other
business module depends on, not the other way around.

## HTTP Surface

None. Identity has no controllers; it is consumed in-process by every other module.

## Persistence

Identity owns each of the following TypeORM entities, registered via `TypeOrmModule.forFeature(...)` in
`identity.module.ts` and exported so other modules can inject their repositories directly:

| Entity                      | Table                          |
| --------------------------- | ------------------------------ |
| `Organization`              | `organizations`                |
| `ExternalIdentity`          | `external_identities`          |
| `OrganizationMembership`    | `organization_memberships`     |
| `ServiceCredential`         | `service_credentials`          |
| `OrganizationCreditAccount` | `organization_credit_accounts` |
| `CreditDebit`               | `credit_debits`                |
| `CreditGrant`               | `credit_grants`                |
| `OrganizationInvitation`    | `organization_invitations`     |
| `AuditLogEntry`             | `audit_log_entries`            |

Every entity carries an `organizationId` foreign key back to `Organization`, cascading on delete except
`OrganizationInvitation.acceptedByExternalIdentity`, which is set to null instead. The same nine tables are also
reachable read-only through the three supported ports above, for the narrower set of fields each record exposes.

## Configuration

None. This module reads no environment variables.

## Validation

Focused tests live in `src/`: `application/human-identity-resolver.service.spec.ts`,
`application/external-identity-resolver.service.spec.ts`, `domain/auth-principal.spec.ts`,
`identity.module.spec.ts` (provider/export wiring), `infrastructure/persistence/identity-entities.spec.ts`,
`infrastructure/persistence/typeorm-external-identity-store.spec.ts`,
`infrastructure/persistence/typeorm-active-membership-reader.spec.ts`,
`infrastructure/persistence/typeorm-active-service-credential-reader.spec.ts`, and
`infrastructure/persistence/identity-schema.integration.spec.ts` (schema-level, gated on `TEST_POSTGRES_URL`).

No Bruno collection targets identity directly — its persistence is exercised indirectly through every other
module's collection (see the [root README](../../../../README.md) for the full list).
