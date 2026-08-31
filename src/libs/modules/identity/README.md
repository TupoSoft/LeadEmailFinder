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
- A framework-free `ExternalIdentityResolver`, `ActiveMembershipReader`, and `ActiveServiceCredentialReader`,
  used by `bff-session` (identity resolution on OIDC return, active-membership checks) and `auth` (active
  service-credential checks) since `module-architecture/03`.
- Atomic credit-ledger persistence (`CreditLedgerStore`) — locking, idempotent debit/grant, and balance
  mutation — used by `credits` since `module-architecture/04`. Identity owns the transaction and locking
  mechanics; `credits` owns the business rules (strict-vs-clamped debit, replay semantics, exception mapping).
- Organization/invitation registration, invitation lookup and failure-audit append, locked invitation-acceptance
  sessions, membership listing, and locked membership-mutation sessions (`OrganizationRegistrationStore`,
  `InvitationStore`, `InvitationAcceptanceStore`, `MembershipDirectory`, `MembershipMutationStore`) — used by
  `organization-onboarding` since `module-architecture/06`. The two session-shaped ports
  (`InvitationAcceptanceStore`, `MembershipMutationStore`) hold one open, locked transaction across a caller's
  Keycloak call. Each exposes only `complete()`/`abort()`, or `changeRole()`/`disable()`/`abort()`. The external
  call happens inside the same lock window a single transaction gave the pre-migration code, and this module
  never learns anything about Keycloak.
- Organization-scoped service-credential lookup/listing and atomic credential/audit mutation
  (`ServiceCredentialDirectory`, `ServiceCredentialWriter`) — used by `service-client-management` since
  `module-architecture/07`. The directory returns persistence-independent credential records; the writer owns the
  TypeORM transactions while service-client management owns authorization, provider sequencing, and compensation.

## Non-Responsibilities

- No HTTP endpoints of its own — nothing in this module is reachable directly over HTTP.
- No authentication or authorization logic (owned by [`auth`](../auth/README.md)); this module only defines the
  shapes those decisions are made against.
- No credit business rules — strict-vs-clamped debit policy, replay-outcome interpretation, and HTTP exception
  mapping are owned by [`credits`](../credits/README.md); this module only executes the locked, idempotent
  ledger operations `credits` requests through `CreditLedgerStore`.
- No onboarding or invitation workflow logic (owned by
  [`organization-onboarding`](../organization-onboarding/README.md)); this module only stores the resulting
  entities.

## Public API

Everything under `src/` is exported from [`src/index.ts`](src/index.ts). Unlike most modules in this directory,
the public surface of `identity` is its whole `src/` tree — there is no internal implementation hidden behind the
barrel. It splits into two parts:

**Supported application ports** — the contract new and migrating consumers should depend on: `IdentityModule`,
`ExternalIdentityResolver`, the eleven ports and their injection tokens (`ExternalIdentityStore`/
`EXTERNAL_IDENTITY_STORE`, `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, `ActiveServiceCredentialReader`/
`ACTIVE_SERVICE_CREDENTIAL_READER`, `CreditLedgerStore`/`CREDIT_LEDGER_STORE`,
`OrganizationRegistrationStore`/`ORGANIZATION_REGISTRATION_STORE`, `InvitationStore`/`INVITATION_STORE`,
`InvitationAcceptanceStore`/`INVITATION_ACCEPTANCE_STORE`, `MembershipDirectory`/`MEMBERSHIP_DIRECTORY`,
`MembershipMutationStore`/`MEMBERSHIP_MUTATION_STORE`, `ServiceCredentialDirectory`/
`SERVICE_CREDENTIAL_DIRECTORY`, `ServiceCredentialWriter`/`SERVICE_CREDENTIAL_WRITER`), their record types
(`ExternalIdentityRecord`, `OrganizationMembershipRecord`, `ServiceCredentialRecord`,
`ServiceCredentialDetailRecord`, `OrganizationRecord`, `OrganizationInvitationRecord`,
`OrganizationMembershipDetailRecord`), and the domain enums/types (`AuthPrincipal`, `AuthCredentialKind`,
`AuthRole`, `AuthPermission`, `AuditOutcome`, `InvitationStatus`, `MembershipStatus`, `ServiceCredentialStatus`).

**Temporary compatibility surface (deprecated)** — `TypeOrmModule` reexported for direct repository injection,
and every entity class listed under Persistence below. No production business module needs this surface after
`service-client-management` moved to ports in `module-architecture/07`; some integration fixtures still construct
the persistence entities directly. `module-architecture/08` removes the compatibility exports together after the
complete consumer audit, rather than narrowing the surface piecemeal in prerequisite plans.

## Dependencies

None. Identity imports no other `@tuposoft/lead-email-finder/modules/*` alias — it is the foundation every other
business module depends on, not the other way around.

## HTTP Surface

None. Identity has no controllers; it is consumed in-process by every other module.

## Persistence

Identity owns each of the following TypeORM entities, registered via `TypeOrmModule.forFeature(...)` in
`identity.module.ts` and temporarily exported through the deprecated compatibility surface described above:

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
reachable through the eleven supported ports above, for the narrower operations and fields each contract exposes.
`ActiveMembershipReader`, `ActiveServiceCredentialReader`, `MembershipDirectory`, and
`ServiceCredentialDirectory` are read-only. `OrganizationRegistrationStore`, `InvitationStore.issueWithAudit`, and
the operation-shaped `ServiceCredentialWriter` methods use identity-owned transactions for their paired state/audit
writes. Its conditional mutation outcomes keep disablement idempotent and prevent stale callers from overwriting a
concurrent disable or recreating a deleted credential. `InvitationAcceptanceStore` and `MembershipMutationStore`
instead hold a manually managed `QueryRunner` transaction open across the caller's Keycloak call (see Responsibility
above).

## Configuration

None. This module reads no environment variables.

## Validation

Focused tests live in `src/`: `application/external-identity-resolver.service.spec.ts`,
`domain/auth-principal.spec.ts`, `identity.module.spec.ts` (provider/export wiring),
`infrastructure/persistence/identity-entities.spec.ts`,
`infrastructure/persistence/typeorm-external-identity-store.spec.ts`,
`infrastructure/persistence/typeorm-active-membership-reader.spec.ts`,
`infrastructure/persistence/typeorm-active-service-credential-reader.spec.ts`,
`infrastructure/persistence/typeorm-credit-ledger-store.spec.ts`,
`infrastructure/persistence/typeorm-organization-registration-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-acceptance-store.spec.ts`,
`infrastructure/persistence/typeorm-membership-directory.spec.ts`,
`infrastructure/persistence/typeorm-membership-mutation-store.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-directory.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-writer.spec.ts`, and
`infrastructure/persistence/identity-schema.integration.spec.ts` (schema-level, gated on `TEST_POSTGRES_URL`). The
real-Postgres behavioral coverage for `CreditLedgerStore` (locking, concurrent debit/grant, replay) lives in the
`application/credits.service.integration.spec.ts` file owned by `credits`, exercised through the real adapter;
the same is true for `MembershipMutationStore` final-owner locking, exercised through the
`application/membership-mutation-concurrency.integration.spec.ts` file owned by `organization-onboarding`.

No Bruno collection targets identity directly — its persistence is exercised indirectly through every other
module's collection (see the [root README](../../../../README.md) for the full list).
