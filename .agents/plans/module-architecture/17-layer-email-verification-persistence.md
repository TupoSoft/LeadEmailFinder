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

- [ ] Confirm this plan's own size projection stays under 1,000 non-documentation additions plus deletions.
- [ ] Move the four entities to `infrastructure/persistence/typeorm/`, updated for the organization-owned shape
  from privacy-compliance/04.
- [ ] Implement `TypeOrmEmailStore`, `TypeOrmDomainStore`, `TypeOrmVerificationStore`, and
  `TypeOrmSmtpVerificationStore` against the ports from `module-architecture/10`.
- [ ] Add contract tests for each store and real-Postgres organization-isolation tests for the three
  organization-owned stores.
- [ ] Complete focused, architecture, and full validation for the new code (additive only; nothing is wired in
  yet).

## Plan dependencies

- `module-architecture/10`
- `privacy-compliance/04`

## Surprises & Discoveries

- This plan exists because the original, unsplit `module-architecture/10` was found to be `size/xl` even under
  its own prescribed two-way split; see the Surprises section of `module-architecture/10` for the full record.
  This plan covers only the persistence quarter of that original scope.

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

Before running the real-Postgres specs, create a disposable test database against the running container:

    docker exec lef-postgres-1 psql -U postgres -c "CREATE DATABASE email_verification_persistence_test;"

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
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/17-layer-email-verification-persistence.md
    git diff --check

No runtime/Docker/Bruno validation is needed beyond the real-Postgres specs above — this plan changes no running
behavior. Bruno: not applicable — this plan adds no route and wires nothing into the live module.

## Idempotence and Recovery

This plan only adds files; rerunning any step is safe. Drop and recreate the disposable test database if a prior
run left it in an inconsistent state:

    docker exec lef-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS email_verification_persistence_test;"
    docker exec lef-postgres-1 psql -U postgres -c "CREATE DATABASE email_verification_persistence_test;"

No other database, queue, or Docker state is affected.

## Artifacts and Notes

Record the per-path size projection and actual count, and the final store file list. Also record the reset/reseed
steps for the moved entities. TypeORM synchronization recreates the moved tables' schema automatically against
disposable development data. Document the exact table names here once the move lands, so schema-incompatible
resets are easy to script later.

## Plan readiness

Ready after `module-architecture/10` merges and this plan's own binding size projection confirms fewer than
1,000 non-documentation additions plus deletions.
