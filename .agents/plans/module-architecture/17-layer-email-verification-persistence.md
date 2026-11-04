# Implement the Email-Verification TypeORM Persistence Stores

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the pure application core from `module-architecture/10` real, organization-aware persistence. This plan
moves the four email-verification entities (`Email`, `Domain`, `EmailVerification`, `SmtpVerification`) to
`infrastructure/persistence/typeorm/` and implements `EmailStore`, `DomainStore`, `VerificationStore`, and
`SmtpVerificationStore` against them, each proven by a contract test and, for the three organization-owned
stores, a real-Postgres cross-organization isolation test. The old flat entity classes and repositories keep
serving every existing route until `module-architecture/18` performs the cutover; this plan adds the new stores
additively and does not wire them into `email-verification.module.ts`.

## Progress

- [x] Confirm this plan's own size projection stays under 1,000 non-documentation additions plus deletions.
  Actual: 721 (`git diff --numstat -M origin/master...HEAD -- . ':!*.md' ':!pnpm-lock.yaml'`), purely additive.
- [x] Move the four entities to `infrastructure/persistence/typeorm/`, updated for the organization-owned shape
  from privacy-compliance/04.
- [x] Implement `TypeOrmEmailStore`, `TypeOrmDomainStore`, `TypeOrmVerificationStore`, and
  `TypeOrmSmtpVerificationStore` against the ports from `module-architecture/10`.
- [x] Add contract tests for each store and real-Postgres organization-isolation tests for the three
  organization-owned stores.
- [x] Complete focused, architecture, and full validation for the new code (additive only; nothing is wired in
  yet).

## Plan dependencies

- `module-architecture/10`
- `privacy-compliance/04`

## Surprises & Discoveries

- This plan exists because the original, unsplit `module-architecture/10` was found to be `size/xl` even under
  its own prescribed two-way split; see the Surprises section of `module-architecture/10` for the full record.
  This plan covers only the persistence quarter of that original scope.
- "Move" the four entities turned out to mean duplicate, not relocate. The old entity files and their repository
  consumers stay completely untouched, matching the additive-only discipline of `module-architecture/10` and
  this plan. The new TypeORM classes are new files mapping the same tables, coexisting with the originals until
  the cutover in `module-architecture/18` deletes the originals. Named them with an explicit `Entity` suffix
  (`EmailEntity`, `DomainPolicyEntity`, `EmailVerificationEntity`, `SmtpVerificationEntity`) to keep them
  unambiguous from both the old entity classes and the plain domain interfaces sharing the same bare names.
- The old `SmtpVerification` entity's `reason` column used the `SmtpVerificationReason` enum from
  `email-verifier/smtp/smtp.enums.ts`, a file with no recognized architecture layer. Importing it from the new
  `infrastructure/` entity would have been a genuine new `layer-dependency` violation (an infrastructure file
  importing an unclassified "module root" file), not a baselined one — the checker flags any classified-layer
  source importing an unclassified target. Declared the same string-literal set locally in the new entity file
  instead, keyed against `ISmtpVerificationResponse['reason']` from `@tuposoft/lead-email-finder/common` with a
  `satisfies` clause so the enum column values and the domain type can never silently drift apart.
- The plan's own Validation section prescribed a dedicated `email_verification_persistence_test` database
  created ad hoc against the running container. CI's real convention (`.github/workflows/validate.yml`) is
  different. A single shared Postgres service database (`lef_identity_test`) backs every real-Postgres test.
  Each test file gets its own dedicated CI step naming that file by path plus a uniquely named environment
  variable (`TEST_POSTGRES_URL`, `TEST_CREDITS_POSTGRES_URL`, `TEST_PAYMENT_WEBHOOK_POSTGRES_URL`, all pointing at
  the same database), with per-test-run schema isolation (`schema = '<name>_${process.pid}'`) preventing
  collisions. The main `Test` step (`pnpm test:ci`) sets none of these, so any real-Postgres test — including the
  existing `verification-organization-ownership.integration.spec.ts` in this same module — silently skips unless
  it has its own dedicated CI step. This plan's new test uses `TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL` and
  adds the matching CI step (`Test email-verification persistence stores against a real database`) so it
  actually executes in CI instead of always skipping.

## Decision Log

- Decision: Move the four entities into `infrastructure/persistence/typeorm/` in this plan rather than in the
  narrowed `module-architecture/10`.
  Rationale: Entities are infrastructure, not domain or application code, and moving them alongside the stores
  that use them keeps this plan self-contained and independently reviewable; `module-architecture/10` never
  touches TypeORM at all.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: Each store implements exactly one port from `module-architecture/10` (`EmailStore`, `DomainStore`,
  `VerificationStore`, or `SmtpVerificationStore`), with no shared generic repository base class.
  Rationale: `AGENTS.md` forbids generic manager services; four narrow adapters are simpler to test and reason
  about than one parameterized store.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: Prove organization isolation with real Postgres (a disposable `*_test` database against the running
  `lef-postgres-1` container), not mocks, for `EmailStore`, `VerificationStore`, and `SmtpVerificationStore`;
  `DomainStore` needs no such test since `domains` is a shared, non-tenant table under privacy-compliance/04.
  Rationale: This session's prior module-architecture plans (04, 06, 08, 09) established that organization
  isolation bugs only surface against real query planning and constraints, not stubbed repositories.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: This plan does not wire the new stores into `email-verification.module.ts` and does not delete the
  old entities or repositories.
  Rationale: Matching the additive-only discipline of `module-architecture/10` keeps this plan's blast radius to
  zero live routes; `module-architecture/18` performs the single cutover that cuts every delivery folder over at
  once, avoiding a half-migrated intermediate state in production traffic.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: Add no migration; use TypeORM synchronization against disposable development data, and document the
  reset/reseed steps for the moved entities in this plan's Artifacts and Notes once implementation completes.
  Rationale: Repository-wide policy — no production environment exists yet.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).

## Outcomes & Retrospective

Not started.

## Context and Orientation

`module-architecture/10` defines `EmailStore`, `DomainStore`, `VerificationStore`, and `SmtpVerificationStore` as
plain interfaces plus DI tokens under `application/ports/`, and defines the domain records they exchange
(`Email`, `Domain`, `EmailVerification`, `SmtpVerification`) under `domain/`. The current entity classes living in
`email/email.entity.ts` (46 lines), the current `domain/domain.entity.ts` (38 lines), and the SMTP verification
entity under `email-verifier/smtp/smtp-verification.entity.ts` (33 lines), plus the sync-folder's
`email-verification.entity.ts` (65 lines), are the source shapes for the four moved entities. Privacy-compliance/04
already changed `emails`, `email_verifications`, and `smtp_verifications` to carry an organization identifier and
adjusted their composite keys and lookups accordingly; `domains` remains a shared, non-tenant table. This plan's
entities and stores must preserve those shapes exactly — this is a relocation and adapter implementation, not a
schema redesign.

## Scope and Non-Goals

Move the four entities; implement the four stores; add contract and real-Postgres isolation tests. Do not touch
any network port (`MxResolver`, `DomainSynonymDiscovery`, `MailboxProbe`, `AccountDiscovery`) — those remain a
concern for `module-architecture/18`. Do not touch `email-verification.module.ts`, any controller, any delivery
folder, or any HTTP route/DTO/status code. Do not delete the old entities, repositories, or any existing file. Do
not add a migration.

## Plan of Work

Complete this plan's own size projection using the same conservative move-as-delete-plus-add convention as
`module-architecture/10`, before writing any code; if it reaches `size/xl` on its own, narrow further before
proceeding.

Move `Email`, `Domain`, `EmailVerification`, and `SmtpVerification` to
`infrastructure/persistence/typeorm/<name>.entity.ts`, preserving column names, indexes, and the
privacy-compliance/04 organization-owned shape exactly. Implement `TypeOrmEmailStore`,
`TypeOrmDomainStore`, `TypeOrmVerificationStore`, and `TypeOrmSmtpVerificationStore`, each implementing exactly
one port and mapping between the TypeORM entity and the domain record. Add a focused contract test per store
against an in-memory or lightly stubbed repository, and a real-Postgres cross-organization isolation test for
`EmailStore`, `VerificationStore`, and `SmtpVerificationStore` using a disposable `*_test` database.

Update `src/libs/modules/email-verification/README.md` to note the new persistence layer, still marked as not
yet wired into the running module.

## Interfaces and Dependencies

Implements the four persistence ports from `module-architecture/10`; introduces no new public interface. Depends
on `module-architecture/10` for the port and record definitions, and on `privacy-compliance/04` for the
organization-owned schema shape. `module-architecture/18` consumes these stores when it performs the cutover.

## Acceptance Criteria

- This plan's own recorded projection is below 1,000 non-documentation additions plus deletions.
- Each store implements exactly one port from `module-architecture/10`; no generic repository abstraction is
  introduced.
- A contract test exists per store; a real-Postgres organization-isolation test exists for each organization-owned
  store.
- No existing file is deleted, renamed, or behaviorally changed; no route, DTO, status code, module wiring, or
  public export changes.
- Focused, architecture, full-suite, build, documentation, and diff checks pass.

## Validation

Before writing code, record the projection using the same command as `module-architecture/10`:

    git fetch origin master
    git diff --numstat -M origin/master...HEAD -- . ':!*.md' ':!pnpm-lock.yaml' | awk '{a+=$1; d+=$2} END {print a+d}'

Before running the real-Postgres spec locally, create a disposable `_test`-suffixed database against the
running container and point `TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL` at it (CI instead reuses the
shared `lef_identity_test` service database via a dedicated step in `.github/workflows/validate.yml`):

    docker exec lef-postgres-1 psql -U postgres -c "CREATE DATABASE lef_email_verification_test;"
    TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL="postgresql://postgres:postgres@localhost:<mapped-port>/lef_email_verification_test" \
      corepack pnpm test -- typeorm-stores-organization-isolation.integration.spec.ts --runInBand

Run focused and architecture coverage:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/persistence --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Then run the full suite:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    git diff --check

No runtime/Docker/Bruno validation is needed beyond the real-Postgres specs above — this plan changes no running
behavior. Bruno: not applicable — this plan adds no route and wires nothing into the live module.

## Idempotence and Recovery

This plan only adds files; rerunning any step is safe. Drop and recreate the local disposable database if a
prior run left it in an inconsistent state:

    docker exec lef-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS lef_email_verification_test;"
    docker exec lef-postgres-1 psql -U postgres -c "CREATE DATABASE lef_email_verification_test;"

No other database, queue, or Docker state is affected. CI's shared `lef_identity_test` service database resets
itself every run since it is a fresh container.

## Artifacts and Notes

Size projection: 721 non-documentation additions plus deletions (purely additive), against the 1,000-line gate.

New files: `infrastructure/persistence/typeorm/{email,domain-policy,email-verification,smtp-verification}.entity.ts`;
`infrastructure/persistence/typeorm-{email,domain,verification,smtp-verification}.store.ts` and their four
matching `.spec.ts` contract tests; `infrastructure/persistence/typeorm-stores-organization-isolation.integration.spec.ts`;
a new CI step in `.github/workflows/validate.yml` (`Test email-verification persistence stores against a real
database`, environment variable `TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL`).

Reset/reseed: TypeORM synchronization recreates `emails`, `domains`, `email_verifications`, and
`smtp_verifications` automatically against disposable development data — these are the same tables and columns
the original entities already own, so no separate reset procedure is needed beyond the existing one for those
tables.

## Plan readiness

Implemented and fully validated: 17 new focused tests pass (15 contract + 2 real-Postgres organization-isolation),
the full jest suite (197 suites, 1,780 tests) passes, `architecture:check` reports the same 108 baselined
violations as before (no growth), and `typecheck`/`lint`/`docs:lint`/`git diff --check`/`build` all pass (617
files compiled with `swc`, 0 issues). Pull request open (#538); CI's `validate` check passed.
