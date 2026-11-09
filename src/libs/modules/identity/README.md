# Identity

Stores organizations, memberships, identities, invitations, credits, and audit records. It supplies the shared
`AuthPrincipal` actor type and role/status/permission types used by other modules.

## Responsibility

- Persist human identities by issuer and subject (the login provider and its stable user ID), and service credentials
  by organization. Native identities use `AUTH_IDENTITY_ISSUER` (`urn:lead-email-finder:auth`).
- Provide narrow persistence ports: interfaces describing the database operations another module needs.
- Own transactions, account/member locks, organization isolation, and paired state/audit writes.
- Return safe records without credential hashes or invitation secrets.

## Non-Responsibilities

Authentication and authorization belong to [`auth`](../auth/README.md); credit rules to
[`credits`](../credits/README.md); invitations and membership workflows to
[`organization-onboarding`](../organization-onboarding/README.md). Identity has no HTTP endpoints.

## Public API

[`src/index.ts`](src/index.ts) exports `IdentityModule`, `ExternalIdentityResolver`, `AUTH_IDENTITY_ISSUER`, domain
records/enums, and these ports with their injection tokens and input/result types:

| Capability                    | Ports                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/session reads        | `ExternalIdentityStore`, `ActiveMembershipReader`, `ActiveServiceCredentialReader`, `CurrentAccountReader`                                                                                  |
| Credit persistence            | `CreditLedgerStore`, `CreditReservationStore`                                                                                                                                               |
| Organization/team persistence | `OrganizationDirectoryReader`, `OrganizationRegistrationStore`, `InvitationStore`, `InvitationPreviewReader`, `InvitationAcceptanceStore`, `MembershipDirectory`, `MembershipMutationStore` |
| API-key persistence           | `ServiceCredentialDirectory`, `ServiceCredentialWriter`                                                                                                                                     |

Injection tokens identify implementations when Nest wires dependencies. Entity classes listed below are also
exported **for disposable integration-test fixtures only**. Production consumers must use ports; `IdentityModule`
does not export database repositories or `TypeOrmModule`.

`ExternalIdentityResolver` separates existing-identity lookup, email synchronization, and explicit creation.
`CurrentAccountReader` requires exactly one active membership in the authenticated organization; email may be null.

## Dependencies

None: identity imports no other business module.

## HTTP Surface

None; other modules call its public API in-process.

## Persistence

TypeORM maps these classes to PostgreSQL tables:

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

### Credits and concurrency

The organization credit account is the shared serialization point: concurrent balance/reservation changes lock the
same row. Admission, grants, and absolute balance updates first insert a missing zero-balance account without
replacing an existing one, then lock it. Capture/release lock the existing account.

- `available = balance - reserved`, with database constraint `0 <= reserved <= balance`.
- A reservation holds available credit; capture charges it once; release removes the hold without charging.
- Reservations are unique by `(organizationId, operationId)`. Captured/released states never reopen.
- The ledger records credit movements. Its operation references are idempotent: retrying an operation
  does not apply it twice. Grant results preserve the original amount and return the current balance. Identity reports outcomes; credits interprets business conflicts.
- `reserveMany` admits the whole group or nothing. Amount conflicts or insufficient available credit leave it unchanged.
- `closeAdmissionMany` validates the whole group before mutation. It releases holds and records missing IDs as released
  receipts, permanently blocking delayed reservation attempts. A captured or amount-mismatched ID aborts the closure.
- Absolute balance changes below `reserved` are rejected.

### Identity, invitations, and credentials

Invitation/membership mutation sessions hold a locked transaction across the caller's Keycloak request. Keycloak is
the external identity server; identity itself never calls it. The caller must complete or abort the session.
Acceptance replays return generic accepted status. Invitation preview returns only name, email, role, expiry, and status.

API keys enter persistence only as a SHA-256 hash (a one-way digest) and a 12-character display prefix. Safe records
never expose hashes. Active-key lookup is uncached so permission/disable changes take effect immediately. Rotation,
disable, and deletion are organization-scoped conditional mutations; stale callers cannot revive disabled/deleted
credentials. Audit failure rolls back the accompanying write.

The organization directory returns only ID, name, and timestamps. Its cursor (a continuation boundary) uses creation
time truncated to milliseconds and ID, both descending; the query uses the same precision. It reads one extra row
for `hasMore`, supports limits 1–100, and does not return totals or invitation data. Member lists sort by
`createdAt ASC, id ASC`; credential lists sort by `createdAt DESC, id DESC`.

## Configuration

None: this module reads no environment variables.

## Validation

Unit tests are beside the resolver and adapters in `src/application/` and `src/infrastructure/persistence/`.
`identity.module.spec.ts` checks wiring. Real PostgreSQL coverage includes:

- `identity-schema.integration.spec.ts` and `api-key-credential-postgres.integration.spec.ts`: set `TEST_POSTGRES_URL`
  to an owned disposable database ending in `_test`; API-key tests create/drop only their own schema.
- `organization-directory.integration.spec.ts`: set `TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL` to a disposable `_test`
  database; tests cover page boundaries, timestamp precision, concurrent insertion, and detail reads in a private schema.
- Ledger/reservation races: [`credits`](../credits/README.md), against a disposable PostgreSQL test database.
- Final-owner locking: [`organization-onboarding`](../organization-onboarding/README.md)'s membership concurrency test.

Run the directory test with `corepack pnpm exec jest organization-directory.integration.spec.ts --runInBand`.
No Bruno collection calls identity directly; public workflows exercise its persistence through other modules.
