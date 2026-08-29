# Layer Credits Behind Persistence Ports

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Credit rules should be readable and testable without TypeORM. After this change, the credits module has a clear API,
application, and domain boundary; `CreditsService` coordinates balance operations through a purpose-specific
credit-ledger port implemented by identity; and identity remains the sole owner of the three existing credit
persistence entities. The final ordinary debit/grant behavior and the clamp-and-record adjustment behavior delivered
by `payments/06` remain unchanged.

A developer can observe the result by running credits unit tests entirely against a port fake, running the existing
real-Postgres debit/grant integration test against the identity adapter, and driving purchase and verification
workflows over the unchanged HTTP API.

## Progress

- [ ] (2026-08-29) Move credits HTTP, application, and domain concerns into their standard layers.
- [ ] (2026-08-29) Introduce an identity-owned credit-ledger port and TypeORM adapter.
- [ ] (2026-08-29) Preserve strict debit/grant, adjustment clamp-and-record, replay, and administrative balance behavior.
- [ ] (2026-08-29) Run static, database, full-suite, and affected Bruno regressions.

## Plan dependencies

- `module-architecture/02`
- `module-architecture/03`
- `payments/06`

## Surprises & Discoveries

- `payments/06` settles insufficient adjustment debits as clamp-and-record: apply only the available balance, persist
  the shortfall, return the originally applied amount on replay, and let an inverse clear shortfall before restoring
  only credits actually removed. The port extracted here must preserve that completed contract, not model only the
  older all-or-nothing debit path.

## Decision Log

- Decision: Keep `OrganizationCreditAccount`, `CreditDebit`, and `CreditGrant` persistence in identity.
  Rationale: Identity owns their existing schema and organization relations. Moving entity classes would add a
  persistence-ownership and foreign-key change to a layering pull request.
  Date/Author: 2026-08-29, Codex planning.
- Decision: This plan adds a public identity `CreditLedgerStore` contract and `CREDIT_LEDGER_STORE` token with an
  identity TypeORM implementation. `CreditsService` does not inject identity entities, repositories, `DataSource`,
  or `EntityManager`.
  Rationale: Credits owns the business meaning of debit, grant, and balance administration while identity's adapter
  owns transaction mechanics.
  Date/Author: 2026-08-29, Codex planning.
- Decision: The persistence port reports operation-shaped outcomes for missing/insufficient balance, applied amount,
  and replay. It supports both an all-or-nothing debit for spending and the bounded debit operation delivered by
  `payments/06`; `CreditsService` maps those outcomes to the established behavior.
  Rationale: Atomic locking and insert decisions must occur in one database transaction, but the infrastructure
  adapter must not own the HTTP exception or broader credit policy.
  Date/Author: 2026-08-29, Codex planning.
- Decision: An absent layer is valid when the module owns no implementation in that category.
  Rationale: Credits' TypeORM adapter remains in identity, so an empty `infrastructure/` placeholder would add no
  information and cannot be tracked meaningfully by Git.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All eleven credits files currently sit directly under `src/libs/modules/credits/src`. `CreditsController`, DTOs,
and `CreditGuard` form the HTTP surface. `CreditsService` contains debit, grant, balance read, and administrative set
logic but injects `Repository<OrganizationCreditAccount>` and `DataSource`; its transactions directly query
`CreditDebit` and `CreditGrant` from identity. `CreditsModule` imports `IdentityModule`, registers the controller and
guard dependencies, and exports `CreditsService` and `CreditGuard` to payments and email verification.

Debit takes a pessimistic write lock, treats a debit already stored for `(organizationId, reference)` as success, rejects a
missing or insufficient account, subtracts balance, and inserts the debit atomically. Grant similarly locks or
creates the account, treats an existing grant reference as idempotent, updates balance, and inserts the grant.
Those invariants are correctness requirements, not implementation details to relax during re-layering.

Plan 02 introduces the identity records and read ports needed by auth but deliberately does not anticipate credit
mutation semantics. Plan 03 stabilizes the public HTTP helpers from auth used by `CreditGuard` and the controller.
The `payments/06` dependency lands first and extends the credit path with durable adjustment results. An approved
debit-causing adjustment applies at most the available balance, records any shortfall in payments, and receives the
same applied amount when its credit reference is replayed. An inverse clears attributable shortfall before restoring
only credits that were actually debited.

## Scope and Non-Goals

Move controller and DTO files plus their specs to `api/`; place `CreditGuard` with the HTTP API because it consumes
an Express/Nest request and produces HTTP rejection; place `CreditsService` in `application/`; and place the
insufficient-credit error and pure credit operation/outcome types in `domain/`. Keep `credits.module.ts` and
`index.ts` as root composition/public entry points.

Define `CreditLedgerStore` and `CREDIT_LEDGER_STORE` in identity application and implement the port in identity
infrastructure. Migrate `CreditsService` to that port. Keep the service responsible for business
decisions and for translating strict missing/insufficient outcomes to `InsufficientCreditsException`. Preserve the
public credit-operation result delivered by `payments/06` and all exports used by payments and verification. Update
README paths and remove only credits violations from the ratchet baseline.

Make `CreditsService` a framework-free class and bind it with an explicit factory in `CreditsModule`. Keep all Nest
decorators, HTTP status translation, request access, validation, and serialization inside `api/`.

Do not change controller paths, permissions, Swagger exclusion, response bodies, credit cost, guard timing,
reference formats, transaction isolation, pessimistic locking, idempotency, balance defaults, table metadata, or
schema. Do not add migrations, move credit entities, combine credits with payments, or expose controllers/DTOs in
the public barrel.

## Plan of Work

Move files into layers and repair relative imports/spec paths without changing class behavior. Update
`CreditsModule` imports to point inward and continue importing `IdentityModule` for the exported credit-ledger
provider. Keep the public barrel limited to `CreditsModule`, `CreditsService`, `CreditGuard`, and
`InsufficientCreditsException` unless a current compile-time consumer proves another contract is necessary.

Replace repository and `DataSource` constructor arguments with the credit-ledger port token. Express strict debit
results as applied, replayed, missing-account, or insufficient-balance outcomes; successful outcomes retain the
existing service result while the latter two preserve the existing exception. Express the adjustment debit as an
atomic bounded operation whose applied amount is zero through the requested amount and is stable on replay. Express
idempotent grant, restore, and balance mutation results without returning persistence entities. Ensure amounts,
references, and the payments-owned shortfall calculation flow unchanged.

Remove `@Injectable` from the application service and create it from `CREDIT_LEDGER_STORE` in the root module's
provider metadata. Keep `InsufficientCreditsException` as a plain domain/application error; `CreditGuard` remains in
API and maps it to the existing `402` response.

Update unit tests to use a typed port fake and assert each outcome mapping. Keep the real-Postgres integration tests
against the actual identity adapter, including duplicate debit/grant, bounded adjustment debit and replay, and
concurrent/locked balance safety.
Update affected consumer imports only when paths/public types require it; do not refactor payments or verification.
Run architecture checking after deleting the exact credits baseline entries fixed by the move.

## Interfaces and Dependencies

Credits depends on the public `CreditLedgerStore` token/provider from identity and on the public request-principal
and permission API from auth. The persistence contract includes atomic strict debit-once, bounded
adjustment-debit-once with a replay-stable applied amount, grant/restore-once, balance read, and administrative
balance set operations. It returns numbers or discriminated outcomes, never identity entities or TypeORM types. The
payments module continues to own adjustment state and shortfall; the identity adapter owns only atomic ledger and
balance mechanics.

Payments continues consuming `CreditsService.credit()`. Synchronous and asynchronous verification continue using
`CreditGuard`; batch verification continues calling `CreditsService.debit()`. Those public method signatures remain
source-compatible. No new external dependency is introduced.

## Acceptance Criteria

- Credits source is organized under `api/`, `application/`, and `domain/`, with only module composition and the
  public barrel at its root.
- No credits application/domain file imports any `@nestjs/` package, TypeORM, an identity persistence entity, or an
  identity deep path. API may import Nest HTTP concerns but not TypeORM.
- Ordinary debit still locks and applies once per `(organizationId, reference)`, rejects missing/insufficient
  accounts, and never writes a debit without the matching balance change.
- Adjustment debit still clamps to the available balance without making it negative, returns the applied amount on
  first application and replay, and lets payments persist the exact shortfall and restore only credits actually
  removed.
- Grant still applies once per reference, creates a missing account at zero, and returns the correct resulting
  balance. Balance read and administrative set retain current defaults/results.
- Existing public credits imports in payments and verification compile without exposing controller, DTO, or
  persistence internals.
- The real-Postgres credits integration suite passes against the unchanged schema.
- Architecture checking has no new or stale credits violation.
- All credits, purchase, synchronous, asynchronous, and batch HTTP contracts remain unchanged.

## Validation

Run focused unit and real-database coverage:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/credits/src --runInBand
    TEST_CREDITS_POSTGRES_URL=<disposable-postgres-url> TEST_PAYMENT_WEBHOOK_POSTGRES_URL=<same-disposable-postgres-url> TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- credits.service.integration.spec.ts payment-event.handler.integration.spec.ts --runInBand

Run affected consumer and repository checks:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/payments/src src/libs/modules/email-verification/src --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/module-architecture/04-layer-credits-behind-persistence-ports.md src/libs/modules/credits/README.md src/libs/modules/identity/README.md
    git diff --check

No Bruno request change is expected, but this refactor changes Nest/provider integration used by three workflows.
Inspect the `lef-api-1` project working-directory label before touching Compose and stop if another checkout owns the
stack. For an owned disposable stack, run `pnpm dev:reset -- --confirm-project=LEF`, then run
`bruno/credit-purchases` against the normal stub-provider stack. Next run the documented Docker-network
`bruno/smtp-dev` and customer-credential `bruno/batch-verification` commands against the disposable SMTP overlay.
The first two collections prove grant/subsequent balance reads and one-credit guard debit/`402`. Batch Bruno proves
that the recomposed credit provider works in the upload workflow; focused batch service/processor tests prove the
per-row debit count because that collection does not inspect balances. Record missing owner tokens, fixture
credentials, Docker, or Bruno tooling as unavailable rather than claiming success.

## Idempotence and Recovery

There is no data migration. Rerunning the implementation or tests does not alter durable development data unless a
developer explicitly points integration tests at it; always use a disposable PostgreSQL database. Debit/grant
retries retain their existing reference-based idempotency. If provider migration is incomplete, retain the old
constructor only until the port adapter test passes, but never register both write paths simultaneously. Reset and
reseed only the disposable Compose fixture through its documented workflow.

## Artifacts and Notes

Record the final file map, port outcome types, focused/full test totals, real-Postgres result, and each Bruno result.
Do not record organization credentials, access tokens, or payment secrets.

## Plan readiness

Ready to implement.
