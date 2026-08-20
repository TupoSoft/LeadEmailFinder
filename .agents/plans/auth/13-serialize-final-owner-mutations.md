# Serialize final-owner membership mutations

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Concurrent membership requests must never leave an organization without an active owner. After this change, two
simultaneous owner removals or demotions serialize on one organization lock: at most one succeeds and the other
returns `409`, while ordinary member changes preserve their current HTTP behavior and audit trail.

## Progress

- [ ] (2026-08-20) Move membership lookup, owner-count validation, and mutation into organization-locked transactions.
- [ ] (2026-08-20) Add real PostgreSQL concurrency coverage for removal and demotion races.
- [ ] (2026-08-20) Run focused and full validation and record the outcome.

## Plan dependencies

- `auth/07`

## Surprises & Discoveries

- Both `MembershipRemovalService` and `MembershipRoleChangeService` read the target and count active owners through
  an injected repository before opening the transaction that writes the membership.
- The existing unit tests cover a static owner count but cannot detect two requests that both observe count `2`.

## Decision Log

- Decision: Serialize membership removal and role changes by pessimistically locking the local `Organization` row,
  then reloading the target membership and counting owners inside that transaction.
  Rationale: A stable organization-scoped lock protects different owner rows with one simple ordering rule and is
  reusable by both mutation services.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: For a role change that requires Keycloak assignment, acquire the organization lock and validate the
  final-owner invariant first, call Keycloak while the transaction remains open, then save the local role and audit.
  Rationale: This is a low-volume administrative path; accepting a longer lock is safer than mutating Keycloak for a
  request that the committed local state must reject. A Keycloak failure still rolls back the local transaction.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`MembershipRemovalService.remove()` and `MembershipRoleChangeService.changeRole()` authorize an `AuthPrincipal`,
load an `OrganizationMembership`, and reject removal/demotion when the repository reports one active owner. Each
method opens a TypeORM transaction only after this check. `OrganizationMembership` has a per-organization/identity
unique index but no constraint expressing at least one active owner. `Organization` provides a stable row that can
be locked with PostgreSQL `pessimistic_write`.

## Scope and Non-Goals

Make the final-owner invariant concurrency-safe in the two existing mutation services and retain their audit rows,
idempotent disabled-member behavior, role hierarchy, Keycloak integration, endpoints, status codes, and DTOs. Do
not add migrations, advisory-lock infrastructure, multi-organization membership, or broaden platform-admin policy.

## Plan of Work

Refactor both services so authorization that depends only on the actor remains outside the transaction, while the
organization lock, target membership reload, status/role checks, active-owner count, mutation, and audit insert all
use the transaction's `EntityManager`. Always acquire the organization row before the membership row to establish
a deterministic lock order. Return `404` for a missing organization-scoped membership and `409` when the committed
state would remove the final active owner.

Preserve Keycloak realm-role assignment behavior for promotions. After the locked preconditions pass, perform any
required idempotent Keycloak role assignment before saving the local role and audit in that transaction; a Keycloak
failure rolls the transaction back. Update unit mocks to assert manager usage and lock ordering. Add a gated
PostgreSQL integration spec that creates one organization with two owners,
starts concurrent removal/demotion operations against different memberships, and asserts one active owner remains,
one operation conflicts, and successful audit rows match committed changes.

The serial HTTP contract is unchanged. Bruno is not applicable to the race itself because deterministic proof
requires simultaneous transactions and direct database assertions; the real PostgreSQL integration test is the
appropriate boundary. Run existing organization-onboarding HTTP tests as regression coverage.

## Interfaces and Dependencies

No public or schema changes. Both services continue to depend on `DataSource`; repository injection may be removed
if all reads move to the transaction manager. Reuse `Organization`, `OrganizationMembership`, `AuditLogEntry`, and
TypeORM pessimistic locks.

## Acceptance Criteria

- With one active owner, removal or demotion returns `409` and changes neither membership nor audit state.
- With two active owners, one removal or demotion succeeds and leaves the other owner active.
- Two concurrent operations targeting the two owners cannot both succeed; the final committed owner count is one.
- Removing an already disabled membership remains an idempotent no-op.
- Member removal, role hierarchy, Keycloak failure behavior, and success/failure HTTP schemas remain unchanged.
- Each successful mutation writes exactly one audit row inside the same transaction.

## Validation

Run `membership-removal.service.spec.ts`, `membership-role-change.service.spec.ts`, the new PostgreSQL concurrency
spec with its guarded `TEST_POSTGRES_URL`, and `organization-onboarding-http.integration.spec.ts`. Then run
`corepack pnpm typecheck`, `corepack pnpm lint`, and the full Jest suite with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`.
Bruno: not applicable to concurrency proof; run the existing organization-onboarding collection only as an
optional unchanged-contract smoke test when its Keycloak fixture is available.

## Idempotence and Recovery

Transactions roll back membership and audit writes together. A request that loses the race can reload current
membership state and retry only if another owner has since been added. Disposable integration data uses TypeORM
synchronization and the guarded test database; local recovery uses `pnpm dev:reset -- --confirm-project=LEF`.

## Artifacts and Notes

Record the two operation outcomes, final active-owner count, and audit-row count from the PostgreSQL test. Do not
record real user identity data.

## Plan readiness

Ready to implement.
