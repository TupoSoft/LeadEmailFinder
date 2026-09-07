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
- A framework-free `ExternalIdentityResolver`, `ActiveMembershipReader`, `ActiveServiceCredentialReader`, and
  `CurrentAccountReader`, used by `bff-session` (existing-identity lookup and deferred email synchronization on OIDC
  return, active-membership checks, and browser-safe current-account fields) and `auth` (active service-credential
  checks). `ExternalIdentityResolver.findExisting` performs a read without creating an identity, while
  `synchronizeEmail` updates an already accepted identity when needed; `resolveOrCreate` retains the explicit
  creation workflow. The current-account reader returns data only for exactly one active membership in the
  authenticated organization and preserves a nullable external-identity email.
- Atomic credit-ledger persistence (`CreditLedgerStore`) — locking, idempotent debit/grant, and balance
  mutation — used by `credits` since `module-architecture/04`. Identity owns the transaction and locking
  mechanics and reports immutable grant facts through `CreditGrantPersistenceResult`; `credits` owns the
  business rules (strict-vs-clamped debit, platform replay conflicts, exception mapping).
- Organization/invitation registration, invitation lookup, narrow invitation preview reads, and failure-audit append, locked invitation-acceptance
  sessions, membership listing, and locked membership-mutation sessions (`OrganizationRegistrationStore`,
  `InvitationStore`, `InvitationPreviewReader`, `InvitationAcceptanceStore`, `MembershipDirectory`, `MembershipMutationStore`) — used by
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
`ExternalIdentityResolver`, the thirteen ports and their injection tokens (`ExternalIdentityStore`/
`EXTERNAL_IDENTITY_STORE`, `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, `ActiveServiceCredentialReader`/
`ACTIVE_SERVICE_CREDENTIAL_READER`, `CurrentAccountReader`/`CURRENT_ACCOUNT_READER`, `CreditLedgerStore`/
`CREDIT_LEDGER_STORE`,
`OrganizationRegistrationStore`/`ORGANIZATION_REGISTRATION_STORE`, `InvitationStore`/`INVITATION_STORE`,
`InvitationPreviewReader`/`INVITATION_PREVIEW_READER`,
`InvitationAcceptanceStore`/`INVITATION_ACCEPTANCE_STORE`, `MembershipDirectory`/`MEMBERSHIP_DIRECTORY`,
`MembershipMutationStore`/`MEMBERSHIP_MUTATION_STORE`, `ServiceCredentialDirectory`/
`SERVICE_CREDENTIAL_DIRECTORY`, `ServiceCredentialWriter`/`SERVICE_CREDENTIAL_WRITER`), their input and record types
(`ExternalIdentityRecord`, `OrganizationMembershipRecord`, `CurrentAccountReadInput`, `CurrentAccountRecord`,
`ServiceCredentialRecord`,
`ServiceCredentialDetailRecord`, `OrganizationRecord`, `OrganizationInvitationRecord`,
`OrganizationMembershipDetailRecord`, `InvitationPreviewRecord`), and the domain enums/types (`AuthPrincipal`, `AuthCredentialKind`,
`AuthRole`, `AuthPermission`, `AuditOutcome`, `InvitationStatus`, `MembershipStatus`, `ServiceCredentialStatus`).
The ledger port also exports `CreditDebitOutcome` and `CreditGrantPersistenceResult`. The grant result contains
the `inserted` or `existing` disposition, the recorded grant amount, and the current authoritative balance.
Identity does not interpret amount mismatches or platform reference namespaces.
`ExternalIdentityResolver` separates lookup, email synchronization, and explicit create-if-missing behavior so a
consumer can defer identity writes until its own authorization preconditions have passed.

**Test-fixture-only surface** — every entity class listed under Persistence below, exported from the TypeScript
barrel for exactly one purpose. It lets another module's own real-Postgres or live-Keycloak integration test build
its own disposable database (`dropSchema`/`synchronize`) and create/assert fixture rows across identity's tables,
without this module owning that test. `module-architecture/08` sealed everything else. `IdentityModule` no longer
exports `TypeOrmModule` or any repository token at the Nest DI level. A repository-wide audit confirmed zero
production, non-test files import an identity entity by name, so no production code path can obtain an identity
repository through this module. The eight legitimate consumers of this surface, all `.spec.ts` files that
construct their own disposable schema, are: `oidc-permission-check.live-keycloak.integration.spec.ts` (`auth`),
`bff-session-flow.live-keycloak.integration.spec.ts` (`bff-session`), `credits.service.integration.spec.ts`
(`credits`), `membership-mutation-concurrency.integration.spec.ts` and
`keycloak-organization-admin.live-keycloak.integration.spec.ts` (`organization-onboarding`),
`payments.module.spec.ts` and `payment-event.handler.integration.spec.ts` (`payments`), and
`service-client-management.live-keycloak.integration.spec.ts` (`service-client-management`). Building a
port-based replacement for this — schema bootstrap plus arbitrary fixture creation/assertion across several
tables — would mean identity growing a second, broad "testing query" surface, directly against the narrow-ports
rationale above. So this plan kept the entity-class exports rather than inventing one.

## Dependencies

None. Identity imports no other `@tuposoft/lead-email-finder/modules/*` alias — it is the foundation every other
business module depends on, not the other way around.

## HTTP Surface

None. Identity has no controllers; it is consumed in-process by every other module.

## Persistence

Identity owns each of the following TypeORM entities, registered via `TypeOrmModule.forFeature(...)` in
`identity.module.ts` and exported through the test-fixture-only surface described above:

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
reachable through the thirteen supported ports above, for the narrower operations and fields each contract exposes.
`ActiveMembershipReader`, `ActiveServiceCredentialReader`, `CurrentAccountReader`, `InvitationPreviewReader`,
`MembershipDirectory`, and
`ServiceCredentialDirectory` are read-only. `OrganizationRegistrationStore`, `InvitationStore.issueWithAudit`, and
the operation-shaped `ServiceCredentialWriter` methods use identity-owned transactions for their paired state/audit
writes. Its conditional mutation outcomes keep disablement idempotent and prevent stale callers from overwriting a
concurrent disable or recreating a deleted credential. `InvitationAcceptanceStore` and `MembershipMutationStore`
instead hold a manually managed `QueryRunner` transaction open across the caller's Keycloak call (see Responsibility
above).

`InvitationPreviewReader` selects only organization name, invited email, role, expiry, and status for a matching
hashed token. It returns no token hash, raw token, IDs, audit metadata, or accepted identity. Onboarding owns the
pending, expired, and consumed interpretation. `MembershipDirectory` returns active and disabled rows in
`createdAt ASC, id ASC` order. Acceptance sessions return only generic accepted status when another request has
already consumed the invitation; the first acceptance retains its existing organization, email, and role result.
No schema change or reset is required.

Credit grants atomically insert a zero-balance account with `ON CONFLICT DO NOTHING`, then acquire a pessimistic
write lock on the persisted account row. This serializes first grants even when no account existed before either
transaction started, without resetting an existing balance. Grant insertion targets the unique organization and
reference pair; an insertion conflict reads the winning grant without changing the balance. Other database errors
abort the transaction. Both `credit()` and `creditOnce()` use this path; `creditOnce()` still returns the originally
recorded amount. No schema change, migration, or data reset is required.

## Configuration

None. This module reads no environment variables.

## Validation

Focused tests live in `src/`: `application/external-identity-resolver.service.spec.ts`,
`domain/auth-principal.spec.ts`, `identity.module.spec.ts` (provider/export wiring),
`infrastructure/persistence/identity-entities.spec.ts`,
`infrastructure/persistence/typeorm-external-identity-store.spec.ts`,
`infrastructure/persistence/typeorm-active-membership-reader.spec.ts`,
`infrastructure/persistence/typeorm-active-service-credential-reader.spec.ts`,
`infrastructure/persistence/typeorm-current-account-reader.spec.ts`,
`infrastructure/persistence/typeorm-credit-ledger-store.spec.ts`,
`infrastructure/persistence/typeorm-organization-registration-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-preview-reader.spec.ts`,
`infrastructure/persistence/typeorm-invitation-acceptance-store.spec.ts`,
`infrastructure/persistence/typeorm-membership-directory.spec.ts`,
`infrastructure/persistence/typeorm-membership-mutation-store.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-directory.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-writer.spec.ts`, and
`infrastructure/persistence/identity-schema.integration.spec.ts` (schema-level, gated on `TEST_POSTGRES_URL`). The
real-Postgres behavioral coverage for `CreditLedgerStore` (locking, concurrent debit/grant, replay) lives in the
`application/credits.service.integration.spec.ts` file owned by `credits`, exercised through the real adapter.
The platform cases include first grants without an existing account, duplicate and distinct concurrent keys,
and amount conflicts. The ledger unit suite covers immutable persistence results, account insertion before
locking, winning-grant lookup after a unique conflict, and propagation of unrelated database errors.
`MembershipMutationStore` final-owner locking is exercised through the
`application/membership-mutation-concurrency.integration.spec.ts` file owned by `organization-onboarding`.

No Bruno collection targets identity directly — its persistence is exercised indirectly through every other
module's collection (see the [root README](../../../../README.md) for the full list).
