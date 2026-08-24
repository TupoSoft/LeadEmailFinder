# Serialize Final-Owner Membership Mutations

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Concurrent membership requests must never leave an organization without an active owner. After this change, two
simultaneous owner removals or demotions serialize on one organization lock: at most one succeeds and the other
returns `409`, while ordinary member changes preserve their current HTTP behavior and audit trail.

## Progress

- [x] (2026-08-24) Move membership lookup, owner-count validation, and mutation into organization-locked transactions.
- [x] (2026-08-24) Add real PostgreSQL concurrency coverage for removal and demotion races.
- [x] (2026-08-24) Run focused and full validation and record the outcome.

## Plan Dependencies

- `auth/07`

## Surprises & Discoveries

- Both `MembershipRemovalService` and `MembershipRoleChangeService` read the target and count active owners through
  an injected repository before opening the transaction that writes the membership.
- The existing unit tests cover a static owner count but cannot detect two requests that both observe count `2`.
- A redundant membership-row `pessimistic_write` lock cannot be combined with the role-change query's
  `externalIdentity` relation: PostgreSQL rejects `FOR UPDATE` on the nullable side of the outer join from TypeORM. The
  organization lock alone is the shared serialization boundary; the membership is reloaded after acquiring it.

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

Implemented and validated.

- `MembershipRemovalService` and `MembershipRoleChangeService` now authorize the actor before starting a transaction,
  acquire a PostgreSQL `pessimistic_write` lock on the organization, and use only that transaction's manager to
  reload the target membership, count active owners, write the mutation, and insert its audit row.
- Role promotion calls Keycloak only after the locked local preconditions pass and before the local role and audit
  commit. A Keycloak failure leaves local membership and audit state unchanged.
- The two service unit suites pass 21 tests, including organization-first lock ordering, final-owner conflicts,
  idempotent disabled membership removal, audit writes, and Keycloak failure behavior.
- The new PostgreSQL integration suite deliberately holds the organization lock until both requests are waiting.
  Concurrent removal/removal and demotion/demotion races both produced one success, one conflict, one remaining
  active owner, and one committed audit row.
- The organization-onboarding HTTP integration suite passes 12 tests, confirming unchanged endpoint status and
  response behavior. The full Jest suite passes 724 tests with 26 environment-gated tests skipped and the repository's
  existing to-do test. TypeScript type-checking passes. ESLint passes with two preexisting warnings in unrelated specs.
- `corepack pnpm docs:lint -- .agents/plans/auth/13-serialize-final-owner-mutations.md` passes.
- Bruno is not applicable because the public HTTP contract is unchanged and deterministic proof requires simultaneous
  transactions plus direct database assertions.

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

## Plan Readiness

Implemented and validated.
