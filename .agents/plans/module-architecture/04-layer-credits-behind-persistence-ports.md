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

- [x] (2026-08-30) Move credits HTTP, application, and domain concerns into their standard layers.
- [x] (2026-08-30) Introduce an identity-owned credit-ledger port and TypeORM adapter.
- [x] (2026-08-30) Preserve strict debit/grant, adjustment clamp-and-record, replay, and administrative balance behavior.
- [x] (2026-08-30) Run static, database, full-suite, and affected Bruno regressions.

## Plan dependencies

- `module-architecture/02`
- `module-architecture/03`
- `payments/06`

## Surprises & Discoveries

- `payments/06` settles insufficient adjustment debits as clamp-and-record: apply only the available balance, persist
  the shortfall, return the originally applied amount on replay, and let an inverse clear shortfall before restoring
  only credits actually removed. The port extracted here must preserve that completed contract, not model only the
  older all-or-nothing debit path.
- Two consumer test files construct `IdentityModule`/`CreditsService` inside their own `TestingModule` without a
  real `TypeOrmModule.forRoot`. `payments.module.spec.ts` wholesale-overrides `CreditsService` itself, so it
  never previously needed to satisfy its constructor dependencies. `payment-event.handler.integration.spec.ts`
  listed the *old* bare `CreditsService` class as a provider — something a framework-free class with no
  decorator metadata can no longer auto-construct. Nest eagerly instantiates every provider in every imported
  module regardless of what the test itself exercises. Adding `TypeOrmCreditLedgerStore` to `IdentityModule` — a
  provider neither test previously needed to think about — surfaced the absence of a `DataSource` in one case and
  the absence of a factory in the other. Fixed with a `@Global()` stub `DataSource` module in `payments.module.spec.ts`
  (mirroring the `TestRedisModule` pattern this repository's live-Keycloak specs already use), since
  `TypeOrmCreditLedgerStore` is intentionally not exported for direct override, and by rewiring
  `payment-event.handler.integration.spec.ts` to import the real `IdentityModule` and factory-bind
  `CreditsService` from `CREDIT_LEDGER_STORE`, exactly like `CreditsModule` itself does.
- The `TypeOrmModule.forFeature` call owned by `IdentityModule` registers repositories for all nine identity
  entities.
  Any test that imports the real `IdentityModule`, rather than re-registering a handful of entities itself, must
  give its root `DataSource`/`TypeOrmModule.forRoot` all nine entities too, or repository resolution fails with a
  "no metadata found" error. Both real-Postgres integration specs rewired in this plan
  (`credits.service.integration.spec.ts` and `payment-event.handler.integration.spec.ts`) needed their `entities`
  array expanded from three or four credit/purchase tables to the full nine-entity identity set plus their own
  tables.

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
- Decision: The three throw sites in `debit()` (`account-missing`; a reference already recorded, checked before
  the balance comparison, reported as `replayed`; and `insufficient-balance`) moved into
  `TypeOrmCreditLedgerStore` verbatim, in their exact original order, only changing each `throw` into a `return`
  of the matching outcome string. `debitUpTo`/`credit`/`creditOnce`/`getBalance`/`setBalance` moved unchanged —
  none of them throw a credits-domain error, so none needed an outcome type.
  Rationale: The identical ordering matters for correctness: a replayed reference must succeed even when the
  current balance is now below what a fresh debit would require, exactly as before this move.
  Date/Author: 2026-08-30, implementation.
- Decision: The `assertNonNegativeInteger` guard for `debitUpTo`/`creditOnce` stays in `CreditsService`
  (application), not the identity adapter.
  Rationale: This check has no persistence dependency and is pure input validation, thrown as a plain `Error`
  before the store is ever called. Moving it to infrastructure would add nothing, and would let a malformed amount reach
  the adapter instead of failing fast in the same layer that already owns the module's other validation.
  Date/Author: 2026-08-30, implementation.

## Outcomes & Retrospective

Implemented and fully validated, including live verification against a rebuilt local development stack.

Every acceptance criterion was met:

- Credits source is organized under `api/`, `application/`, and `domain/`, with only `credits.module.ts` and
  `index.ts` at its root — no `infrastructure/` directory, since its one adapter lives in identity.
- No credits application/domain file imports `@nestjs/`, TypeORM, or an identity persistence entity/deep path;
  `CreditsService` depends only on identity's public `CreditLedgerStore` port.
- Ordinary `debit()` still locks and applies once per `(organizationId, reference)`, rejects missing/insufficient
  accounts, and never writes a debit without the matching balance change. Unit tests against a mocked
  `CreditLedgerStore` prove this, as does the real-Postgres integration suite's concurrent-debit and
  duplicate-reference coverage, run through the exact production wiring (`IdentityModule` plus factory-bound
  `CreditsService`).
- `debitUpTo()` still clamps to the available balance without going negative, returns the applied amount on
  first application and replay, and payments' own real-Postgres suite (`payment-event.handler.integration.spec.ts`,
  21/21 passing) confirms it still persists the exact shortfall and restores only credits actually removed.
- `credit()`/`creditOnce()` still apply once per reference with their distinct replay semantics (current balance
  vs. originally granted amount).
- Existing public credits imports in payments and verification compile unchanged — neither module needed a
  source change, only two of their test files needed new module-wiring accommodations for identity's new
  eagerly-instantiated adapter (see Surprises & Discoveries).
- `corepack pnpm architecture:baseline` shrank the baseline from 173 to 166 violations with zero new ones.

Validation performed:

- `TMPDIR=/tmp corepack pnpm test -- src/libs/modules/credits/src src/libs/modules/identity/src --runInBand` —
  13 suites, 91 tests, all passing.
- `corepack pnpm architecture:baseline` then `architecture:check` — shrank 173 → 166 violations, check passes.
- `tsc --noEmit` (scratch tsconfig off the root-owned `dist/`) — clean.
- `TMPDIR=/tmp corepack pnpm test -- src/libs/modules/payments/src src/libs/modules/email-verification/src
  --runInBand` — 36 suites, 284 tests, all passing (after fixing the two consumer test files described in
  Surprises & Discoveries).
- `TMPDIR=/tmp corepack pnpm test:ci` — 149 suites, 1145 tests passing, 49 skipped, plus a to-do test that
  predates this plan and is unrelated to it.
- `corepack pnpm lint` — 0 errors, 2 preexisting warnings in unrelated files.
- `nest build` (scratch configuration off the root-owned `dist/`) — 0 type-check issues, 492 files compiled.
- `git diff --check` — clean.
- Real-Postgres integration suites, each against a disposable `_test` database:
  `credits.service.integration.spec.ts` — 8/8 passing, through the real `IdentityModule`/
  `TypeOrmCreditLedgerStore` wiring. `payment-event.handler.integration.spec.ts` — 21/21 passing, proving the
  full payments-06 clamp-and-record/shortfall/restore/replay contract holds unchanged through the new port.
- Live verification: ran `pnpm dev:reset --confirm-project=LEF` to rebuild the local `lef-*` Compose stack with
  these changes (the reset's own smoke test read a real balance through the new wiring). Then, against the live
  stack:
  - `bruno/credit-purchases` (`--sandbox developer`) — the full grant/replay, debit-adjustment/replay, and
    inverse-restore/replay lifecycle plus rejection cases, 22/22 requests passing.
  - `bruno/batch-verification` (customer M2M credentials fetched live from Keycloak per its documented recipe) —
    proves the strict per-row `debit()` path (the same method `CreditGuard` uses) end to end, 3/3 requests
    passing.
  - `GET /health` returns `200` afterward.

No material architectural trade-off surfaced beyond what the Decision Log above already records.

Bruno: no new endpoint, request body, status code, or credits behavior was introduced, so no Bruno file changed,
but `bruno/credit-purchases` and `bruno/batch-verification` were both run live against the rebuilt stack and
both pass in full.

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

Implemented and fully validated, including live verification against a rebuilt local development stack.
Pull request not yet opened.
