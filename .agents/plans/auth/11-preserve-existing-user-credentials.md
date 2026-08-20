# Preserve existing Keycloak credentials during invitation acceptance

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Accepting an invitation for an email that already belongs to a Keycloak user must never replace that user's
password. After this change, a new invitee receives the password supplied during account creation, an existing
Keycloak user keeps all existing credentials, and an invitation that conflicts with an active local membership
returns `409` without changing either credentials or realm roles.

## Progress

- [ ] (2026-08-20) Separate existing-user lookup from new-user creation in the Keycloak adapter.
- [ ] (2026-08-20) Reorder invitation acceptance so local membership validation precedes realm-role mutation.
- [ ] (2026-08-20) Add adapter, service, live-Keycloak, and Bruno regression coverage.
- [ ] (2026-08-20) Run focused and full validation and record the outcome.

## Plan dependencies

- `auth/07`

## Surprises & Discoveries

- The current `KeycloakOrganizationAdminClient.ensureUser()` always calls Keycloak's `reset-password` endpoint,
  including when `findByEmail()` returned an existing user.
- `InvitationAcceptanceService.accept()` performs both password and realm-role mutations before its transaction
  checks the single-active-membership invariant, so a later `409` does not undo those identity-provider changes.

## Decision Log

- Decision: Existing Keycloak users keep their password unchanged; possession of a valid invitation token
  authorizes membership acceptance, not credential replacement.
  Rationale: Password recovery and invitation acceptance are separate security responsibilities.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Create a new Keycloak user with its initial non-temporary password in the user-creation request rather
  than creating the user and then issuing a second reset request.
  Rationale: One idempotent creation boundary avoids a crash window that could leave a newly created user without
  usable credentials while still ensuring retries never reset a pre-existing account.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Check and lock the local identity's active-membership state before assigning an owner/admin realm role.
  Rationale: A rejected invitation must not leave privileged Keycloak state behind.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/organization-onboarding/invitation-acceptance.service.ts` hashes the invitation token,
calls `KeycloakOrganizationAdmin.ensureUser`, optionally assigns an owner/admin realm role, and then creates the
local `ExternalIdentity` and `OrganizationMembership`. The active-membership check currently occurs only inside
that final transaction. `keycloak-organization-admin-client.service.ts` implements `ensureUser` by finding or
creating a Keycloak user and then unconditionally calling `reset-password`.

The local single-active-membership rule remains authoritative. Keycloak owns login credentials; the application
owns invitation validity, membership, and product authorization.

## Scope and Non-Goals

Change invitation acceptance and the narrow Keycloak organization-admin adapter so existing credentials and roles
survive rejected or successful invitation acceptance. Preserve the public endpoint, invitation token format,
response schema, password validation for new users, audit schema, and single-active-membership rule. Do not add a
password-reset flow, account linking by unverified email, multi-organization switching, migrations, or production
reconciliation.

## Plan of Work

Change the `KeycloakOrganizationAdmin` contract to return whether a user was newly created while keeping the stable
Keycloak subject. In `KeycloakOrganizationAdminClient`, return existing users without any credential write. For a
missing user, create the user with the supplied password in the same Admin API request, then resolve the created
subject using the existing exact-email lookup and return `created: true`.

Refactor `InvitationAcceptanceService.accept()` so it resolves or creates the local external identity, locks that
identity, and checks active membership before assigning a privileged realm role. Keep the role call retryable and
idempotent. Only after those checks and any required role assignment succeed may the transaction conditionally
mark the pending invitation accepted, create the membership, and append the audit row. A concurrent winning
acceptance must still return the stored result without inserting a second membership.

Update the existing adapter and service specs. Extend the live-Keycloak adapter test to create a user, authenticate
or otherwise verify its credential, call `ensureUser` again with a different password, and prove the original
credential remains valid and no reset request is made. Extend `bruno/organization-onboarding` with the existing-user
conflict workflow; automated adapter coverage proves the credential itself is unchanged because Bruno does not own
a repeatable browser-password authentication fixture.

## Interfaces and Dependencies

Change the internal `KeycloakUserRef` or introduce a result type containing `subject` and `created`. The public
`POST /v1/organizations/invitations/:token/accept` contract remains unchanged: new and eligible existing users
receive `201`, expired or unknown tokens retain existing behavior, and an identity with an active membership
receives `409`. No database schema or new dependency is required.

## Acceptance Criteria

- Accepting an invitation for a new email creates one Keycloak user with the supplied password and one local
  membership.
- Accepting an invitation for an existing Keycloak user never invokes `reset-password` and leaves the existing
  credential valid.
- If that existing identity already has an active membership, acceptance returns `409`; the invitation remains
  pending, the password is unchanged, and no owner/admin realm role is added.
- An eligible existing Keycloak user can accept an invitation using the invitation token without having their
  password changed.
- Duplicate and concurrent acceptance remain idempotent and create at most one local membership and success audit.
- Keycloak failures leave the invitation retryable and do not create active local access.

## Validation

Run the focused Jest specs for invitation acceptance and `KeycloakOrganizationAdminClient`. Run the gated live
Keycloak integration spec with its documented environment variables and explicitly verify old-password success and
new-password failure after an existing-user acceptance attempt. Run the organization-onboarding HTTP integration
spec, `corepack pnpm typecheck`, `corepack pnpm lint`, and the full Jest suite with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.
Run `bru run --env local` for `bruno/organization-onboarding` when the disposable Keycloak/API stack is available.

## Idempotence and Recovery

Exact-email lookup and Keycloak's unique username/email constraints make creation retryable. If the create response
is lost, retry finds the created user and leaves its already-set credential unchanged. If realm-role assignment or
the local transaction fails, retry the same invitation token. Reset disposable development identity state with
`pnpm dev:reset -- --confirm-project=LEF`; no migration or backfill is needed.

## Artifacts and Notes

Record synthetic Keycloak subjects and HTTP statuses only. Never record invitation tokens, passwords, client
secrets, session cookies, or access tokens.

## Plan readiness

Ready to implement.
