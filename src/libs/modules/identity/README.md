# Identity

Owns the persistence for organizations and their memberships, external identities (both human and service),
invitations, the credit ledger, and the audit trail. It also defines the shared domain types —
`AuthPrincipal` and the role/permission/status enums — that every other business module depends on to describe
who is acting and what they are allowed to do.

## Responsibility

- Organizations, their memberships, and the roles/status of each membership.
- External human identities (one row per Keycloak subject, or per native Better Auth user under the fixed
  `AUTH_IDENTITY_ISSUER` namespace `urn:lead-email-finder:auth`) and service credentials (one row per organization API key).
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
  business rules (strict-vs-clamped debit, platform replay conflicts, exception mapping). `debit()`/`debitUpTo()`
  compare against `balance - reserved`, so an active hold narrows what strict and clamped spending can consume.
- Atomic credit-reservation persistence (`CreditReservationStore`) — hold admission, capture, release, and
  fenced batch closure — used by `credits` since `verification-billing/02`. A hold reduces an account's
  `available` credit (`balance - reserved`) without reducing `balance`; capture reduces `balance` once and
  releases the hold; release restores `available` with no grant or debit. The account row is the sole
  serialization point: every mutating method first inserts an absent account (its organization foreign key as
  the conflict target), then locks that account, before reading or writing reservation rows. `identity` owns
  this locking discipline and reports typed outcomes; `credits` owns which outcome maps to which exception.
- Organization/invitation registration, invitation lookup, narrow invitation preview reads, and failure-audit append, locked invitation-acceptance
  sessions, membership listing, and locked membership-mutation sessions (`OrganizationRegistrationStore`,
  `InvitationStore`, `InvitationPreviewReader`, `InvitationAcceptanceStore`, `MembershipDirectory`, `MembershipMutationStore`) — used by
  `organization-onboarding` since `module-architecture/06`. The two session-shaped ports
  (`InvitationAcceptanceStore`, `MembershipMutationStore`) hold one open, locked transaction across a caller's
  Keycloak call. Each exposes only `complete()`/`abort()`, or `changeRole()`/`disable()`/`abort()`. The external
  call happens inside the same lock window a single transaction gave the pre-migration code, and this module
  never learns anything about Keycloak.
- Organization directory reads (`OrganizationDirectoryReader`) return names, identifiers, and timestamps for
  `organization-onboarding`. Identity owns deterministic pagination over millisecond creation times and UUIDs;
  a UUID lookup returns the same safe projection or null when absent. Onboarding owns platform authorization,
  not-found interpretation, HTTP query validation, and opaque cursor encoding.
- Organization-scoped service-credential lookup/listing and atomic credential/audit mutation
  (`ServiceCredentialDirectory`, `ServiceCredentialWriter`) — used by `service-client-management` since
  `module-architecture/07`. The directory returns persistence-independent credential records; the writer owns the
  TypeORM transactions while service-client management owns authorization and one-time key issuance.

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

The public surface is exported from [`src/index.ts`](src/index.ts). Persistence adapters stay internal, while
application contracts and the entity classes used for test fixtures form two supported parts:

**Supported application ports** — the contract new and migrating consumers should depend on: `IdentityModule`,
`ExternalIdentityResolver`, the fifteen ports and their injection tokens (`ExternalIdentityStore`/
`EXTERNAL_IDENTITY_STORE`, `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, `ActiveServiceCredentialReader`/
`ACTIVE_SERVICE_CREDENTIAL_READER`, `CurrentAccountReader`/`CURRENT_ACCOUNT_READER`, `CreditLedgerStore`/
`CREDIT_LEDGER_STORE`, `CreditReservationStore`/`CREDIT_RESERVATION_STORE`,
`OrganizationDirectoryReader`/`ORGANIZATION_DIRECTORY_READER`,
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
The framework-free `AUTH_IDENTITY_ISSUER` constant is the issuer that native identity adapters use.
The ledger port also exports `CreditDebitOutcome`, `CreditGrantPersistenceResult`, `CreditBalanceSnapshot`, and
`SetBalanceOutcome`. The grant result contains the `inserted` or `existing` disposition, the recorded grant
amount, and the current authoritative balance. `CreditBalanceSnapshot` carries `balance` and `reserved`;
`SetBalanceOutcome` is `{ kind: 'applied', balance }` or `{ kind: 'below-reserved' }` when a target undercuts an
active hold. Identity does not interpret amount mismatches or platform reference namespaces.

The reservation port also exports `CreditReservationState`, `CreditReservationItem`, `CreditReservationRecord`,
`CreditReservationAdmission`, `CreditReservationSettlement`, and the `kind`-discriminated
`CreditReservationAdmissionOutcome`, `CreditReservationSettlementOutcome`, and `CreditReservationClosureOutcome`
unions. `reserveMany` admits a complete group atomically. An existing reservation with a matching amount is
observed rather than recreated. A different amount conflicts the whole group. If the aggregate amount needed for
missing operation IDs exceeds available credit, neither a reservation nor a balance change occurs. `capture` and
`release` each report `settled` (with an `applied`/`replayed` disposition), `missing`, or `conflict` (the
opposite terminal transition, or — for capture — an unexpected preexisting debit under the reservation's private
reference). `closeAdmissionMany` inspects every ID in the batch before mutating any row. An existing captured
receipt or amount mismatch conflicts the whole closure. Otherwise, a reserved receipt is released, a missing ID
gets a durable released receipt with no preceding hold (blocking a later delayed reserve), and a replay of an
already-released ID returns the same record. Closure and release never touch `balance` and never insert a grant
or debit.
`ExternalIdentityResolver` separates lookup, email synchronization, and explicit create-if-missing behavior so a
consumer can defer identity writes until its own authorization preconditions have passed.
The directory port also exports `OrganizationDirectoryReadInput`, `OrganizationDirectorySeekKey`,
`OrganizationDirectoryRecord`, and `OrganizationDirectoryPage`. Its typed input contains a limit from 1 through
100 and an optional `before` key with `createdAtMilliseconds` and `id`. Its result contains at most that many
organization records and a `hasMore` flag, without a total count or invitation fields. `findById(organizationId)`
returns one `OrganizationDirectoryRecord` or null without scanning directory pages or reading credit accounts.

**Test-fixture-only surface** — every entity class listed under Persistence below, exported from the TypeScript
barrel for exactly one purpose. It lets another module's own real-Postgres or live-Keycloak integration test build
its own disposable database (`dropSchema`/`synchronize`) and create/assert fixture rows across identity's tables,
without this module owning that test. `module-architecture/08` sealed everything else. `IdentityModule` no longer
exports `TypeOrmModule` or any repository token at the Nest DI level. A repository-wide audit confirmed zero
production, non-test files import an identity entity by name, so no production code path can obtain an identity
repository through this module. Supported consumers of this surface are `.spec.ts` files that
construct disposable schemas, including: `oidc-permission-check.live-keycloak.integration.spec.ts` (`auth`),
`bff-session-flow.live-keycloak.integration.spec.ts` (`bff-session`), `credits.service.integration.spec.ts`
(`credits`), `membership-mutation-concurrency.integration.spec.ts` and
`keycloak-organization-admin.live-keycloak.integration.spec.ts` (`organization-onboarding`),
`payments.module.spec.ts` and `payment-event.handler.integration.spec.ts` (`payments`). Building a
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
| `CreditReservation`         | `credit_reservations`          |
| `OrganizationInvitation`    | `organization_invitations`     |
| `AuditLogEntry`             | `audit_log_entries`            |

Every entity carries an `organizationId` foreign key back to `Organization`, cascading on delete except
`OrganizationInvitation.acceptedByExternalIdentity`, which is set to null instead. The same ten tables are also
reachable through the fifteen supported ports above, for the narrower operations and fields each contract exposes.
`OrganizationCreditAccount` carries a `reserved` column (default zero) alongside `balance`, with a database check
that `0 <= reserved <= balance`; `CreditReservation` is keyed by `(organizationId, operationId)`, with a positive
integer `amount` and `state` one of `reserved`, `captured`, or `released` — terminal states never reopen.
`ActiveMembershipReader`, `ActiveServiceCredentialReader`, `CurrentAccountReader`, `InvitationPreviewReader`,
`MembershipDirectory`, `OrganizationDirectoryReader`, and
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
`ServiceCredentialDirectory` includes active and disabled credentials in `createdAt DESC, id DESC` order, with the
ID providing a deterministic tie-breaker for equal timestamps. Safe credential records carry `keyPrefix`, never
`keyHash`. `ActiveServiceCredentialReader.findByKeyHash` performs an uncached lookup of the complete SHA-256 hash
and returns that safe record, including current permissions and status. The issuer/subject read remains available
for explicit identity lookup; machine authentication uses hashes exclusively.

`ServiceCredential` stores a unique non-null `keyHash` (excluded from default entity reads) and a non-null
12-character `keyPrefix`. Machine issuer is `AUTH_IDENTITY_ISSUER`; subject equals the stable credential UUID.
Create and rotation accept hash/prefix material only; raw keys never enter these ports or audit details. Rotation
conditionally replaces hash/prefix only on an active organization-scoped row. The database serializes concurrent
updates, so disablement and deletion remain terminal. Audit failure rolls back each accompanying mutation.

This schema intentionally discards OAuth machine credentials in disposable development data. Do not add migrations
or backfills. Use the guarded checkout-owned reset described in [`docker/README.md`](../../../../docker/README.md),
synchronize with `TYPEORM_SYNCHRONIZE=true`, and rerun development seeding. Human Keycloak identities remain intact
in the reproducible fixture workflow until the later browser cutover.

`OrganizationDirectoryReader` orders by `date_trunc('milliseconds', createdAt) DESC, id DESC`. The selected
creation time and tuple seek predicate use that same expression, so PostgreSQL microseconds cannot disagree
with the JavaScript `Date` used to encode a cursor. The adapter fetches one extra row to determine `hasMore`
and omits it from the result. A new organization inserted before the current boundary appears on refresh;
it does not shift later pages or repeat existing rows. UUID lookup uses the existing organization primary key and
selects only ID, name, and timestamps with the same millisecond creation projection. No schema change, migration,
or reset is required.

Credit grants atomically insert a zero-balance account with `ON CONFLICT DO NOTHING`, then acquire a pessimistic
write lock on the persisted account row. This serializes first grants even when no account existed before either
transaction started, without resetting an existing balance. Under that lock, the grant lookup detects retries for
the same organization/reference pair and returns the recorded grant amount and current balance. A new reference
uses a plain grant insertion; any database error, including an unexpected uniqueness violation, aborts the
transaction. Both `credit()` and `creditOnce()` use this path; `creditOnce()` still returns the originally recorded
amount. `setBalance()` follows the same insert-then-lock sequence before comparing the target against
`reserved`. No schema change, migration, or data reset is required.

Reservation admission (`reserveMany`) and batch closure (`closeAdmissionMany`) follow the identical insert-then-lock
sequence on the account before reading or writing any `credit_reservations` row, sharing one small internal helper
(`lock-credit-account.ts`) with the ledger store rather than duplicating the pattern. `capture` and `release` lock
the already-present account directly, since a reservation cannot exist without one. This keeps the account row as
the single serialization point for every change to its `balance` and `reserved` fields, matching the ledger's own
locking discipline. No schema change, migration, or data reset is required.

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
`infrastructure/persistence/typeorm-organization-directory-reader.spec.ts`,
`infrastructure/persistence/typeorm-credit-ledger-store.spec.ts`,
`infrastructure/persistence/typeorm-credit-reservation-store.spec.ts`,
`infrastructure/persistence/typeorm-organization-registration-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-store.spec.ts`,
`infrastructure/persistence/typeorm-invitation-preview-reader.spec.ts`,
`infrastructure/persistence/typeorm-invitation-acceptance-store.spec.ts`,
`infrastructure/persistence/typeorm-membership-directory.spec.ts`,
`infrastructure/persistence/typeorm-membership-mutation-store.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-directory.spec.ts`,
`infrastructure/persistence/typeorm-service-credential-writer.spec.ts`, and
`infrastructure/persistence/identity-schema.integration.spec.ts` (schema-level, gated on `TEST_POSTGRES_URL`). The
real-Postgres behavioral coverage for `CreditLedgerStore` and `CreditReservationStore` (locking, concurrent
debit/grant, reservation admission/settlement/closure, replay) lives in the
`application/credits.service.integration.spec.ts` file owned by `credits`, exercised through the real adapters.
The platform cases include first grants without an existing account, duplicate and distinct concurrent keys,
and amount conflicts. The ledger unit suite covers immutable persistence results, account insertion before
locking, replay without another grant, and propagation of database errors, including unexpected unique conflicts.
`MembershipMutationStore` final-owner locking is exercised through the
`application/membership-mutation-concurrency.integration.spec.ts` file owned by `organization-onboarding`.

`infrastructure/persistence/organization-directory.integration.spec.ts` verifies empty, first, middle, and
final pages, equal timestamps, distinct microseconds within one millisecond, insertion between requests,
a deleted boundary row, and UUID detail lookup with an absent result against PostgreSQL. Set `TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL` to a disposable
database whose name ends with `_test`. The suite creates and removes its own randomly named schema;
it never resets another test suite's tables. Run it with:

    corepack pnpm exec jest organization-directory.integration.spec.ts --runInBand

No Bruno collection targets identity directly — its persistence is exercised indirectly through every other
module's collection (see the [root README](../../../../README.md) for the full list).

`infrastructure/persistence/api-key-credential-postgres.integration.spec.ts` uses a unique schema inside an owned
disposable `_test` database selected by `TEST_POSTGRES_URL`. It verifies hash uniqueness, safe records, uncached
permissions, committed replacement, concurrent rotation/disable/delete, organization isolation, and rollback of
create/rotate/disable/delete when audit insertion fails. The suite drops only its own schema during cleanup.
