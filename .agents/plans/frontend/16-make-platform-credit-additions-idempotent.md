# Make Platform Credit Additions Idempotent

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the existing additive platform-credit endpoint safe to retry before a browser depends on it. A caller supplies
one UUID idempotency key for one logical grant. Repeating the same organization, key, and amount returns the
authoritative balance without another ledger effect; reusing the key for another amount returns `409`. Concurrent
first grants to a newly bootstrapped organization serialize correctly even when no credit-account row existed when
the requests began.

## Progress

- [x] (2026-09-04) Require canonical caller-owned UUID keys, reject repeated headers, and preserve authentication and authorization.
- [x] (2026-09-04) Return inserted/existing persistence facts and keep platform replay/conflict policy in `CreditsService`.
- [x] (2026-09-04) Serialize account creation and grants, including first operations without an existing account row.
- [x] (2026-09-04) Update every additive HTTP caller, source contract, Bruno request, and fixture.
- [x] (2026-09-04) Add sequential and real-PostgreSQL concurrency/conflict coverage; all 19 database tests passed.
- [x] (2026-09-04) Focused, repository, architecture, build, prose, controlled Bruno, live Keycloak-backed Bruno, and SMTP workflow checks passed; validation evidence is recorded below.

## Plan dependencies

- `payments/01`
- `module-architecture/04`

## Surprises & Discoveries

- (2026-09-04) The pinned Bruno launcher and disposable-stack metadata described in frontend Plan 02 do not exist in this checkout.
  This task adds the narrow platform-credit launcher and an isolated PostgreSQL test runner; full OIDC stack work
  remains in Plan 02. Docker is available, and PostgreSQL concurrency validation can run independently.
- (2026-09-04) This pnpm version forwards the separator in `pnpm test -- <arguments>` to Jest. Options after that
  separator become test-name patterns. The database runner uses `pnpm exec jest` so JSON reporting and serial
  execution are applied, and removes old reports before starting to prevent stale success evidence.

- `CreditsController` currently generates `randomUUID()` for every `POST /credits/:organizationId`, so a caller
  cannot repeat the same durable reference after losing a response.
- The existing grant table suppresses repeated `(organizationId, reference)` effects, but the persistence port returns
  only a balance and cannot tell the application whether an existing reference recorded another amount.
- Organization bootstrap does not create an `OrganizationCreditAccount`. The ledger locks an existing account row,
  but its absent-row path constructs an unsaved account that cannot serialize two first operations with a row-level lock.

## Decision Log

- Decision: Add a dedicated PostgreSQL Compose file and a narrow platform-credit Bruno launcher in this task.
  Rationale: The referenced shared launcher is absent. The database runner validates ownership of existing containers, keeps
  credentials in ignored private metadata, and can prove ledger races without implementing the broader OIDC plan.
  The Bruno launcher requires an existing verified local stack and fails when its metadata is missing.
  Date/Author: 2026-09-04, implementation.
- Decision: Accept only lowercase canonical UUID text at the HTTP boundary.
  Rationale: Equivalent textual representations must not create separate operation references. Malformed, combined,
  repeated, uppercase, and namespaced input is rejected before ledger access.
  Date/Author: 2026-09-04, implementation.

- Decision: Require a caller-supplied UUID `Idempotency-Key` on additive platform-credit requests and prefix it with a
  private platform-adjustment namespace before passing it to persistence.
  Rationale: One operation key must survive a lost-response retry, while namespacing prevents collision with payment,
  reversal, or other ledger references.
  Date/Author: 2026-08-31, project planning.
- Decision: Make the credit-ledger port return the persisted reference amount and authoritative balance together with
  whether this call inserted the grant or found an existing grant.
  Rationale: Persistence owns atomic insert/replay observation; `CreditsService` needs enough fact to decide whether
  replay is equivalent without embedding business conflict policy in TypeORM code.
  Date/Author: 2026-08-31, project planning.
- Decision: Add a purpose-specific `CreditsService.addPlatformCredits()` method for equivalent replay/conflict while
  keeping the existing general `credit()` method's public behavior unchanged.
  Rationale: Idempotency meaning is an application rule, but payment grants already use `credit()` and must not gain a
  new platform-HTTP conflict policy. The adapter reports durable facts; each application method maps them for its use
  case.
  Date/Author: 2026-08-31, project planning.
- Decision: Persist the organization credit account with an atomic insert-if-absent step, then lock the persisted row
  before applying or observing a grant.
  Rationale: A row-level lock cannot protect an object that is not stored. Atomic account creation closes the first-grant
  race without a migration or process-local mutex.
  Date/Author: 2026-08-31, project planning.
- Decision: Change all repository callers in the same pull request.
  Rationale: The required header is a breaking HTTP contract; no script, Bruno workflow, or integration fixture may
  continue relying on a server-generated key.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Implemented the additive HTTP contract and atomic ledger behavior. Matching retries return the current balance with
`201`; conflicting amounts return `409`. General payment grants and one-time restoration preserve their existing
return semantics. Account creation and grant persistence share a transaction and persisted-row lock. No schema change
or migration was required, and no new architecture debt was introduced.

The dedicated PostgreSQL suite passed all 19 tests. Both a controlled Nest HTTP fixture and the full local
Keycloak-backed launcher passed the 16-request Bruno collection against real PostgreSQL. The live run used a new
checkout-owned Compose project and the existing provisioning, platform credential, operator, and customer fixture
scripts. The launcher also rejected missing metadata before any side effects. The existing SMTP workflow passed
22 requests and 44 tests through the repository's TLS mail servers and proxy setup, with no skipped requests.

## Context and Orientation

The credits business module owns balance and grant rules. Identity persistence implements its narrow ledger port
with `OrganizationCreditAccount` and `CreditGrant` rows. Payment grants and reversals already carry durable private
references; only the platform additive controller invents a new reference per HTTP call.

The current grant transaction loads the organization's credit account with a pessimistic lock when it exists. On a
newly created organization, there is no row to lock. Correctness therefore requires a persisted-row bootstrap before
the balance mutation, plus a unique grant reference that resolves concurrent duplicate insertion.

The project has no production environment. TypeORM synchronization against disposable data remains the schema
workflow, and this plan changes no columns or constraints. Before editing credits or identity, implementation must
read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and both affected module README files.

## Scope and Non-Goals

This pull request changes additive `POST /credits/:organizationId`, the credits ledger port/result, the TypeORM
adapter's absent-account and duplicate-reference behavior, application conflict mapping, every repository HTTP
caller, focused tests, source Swagger annotations, Bruno, and module documentation.

It does not build React UI, expose the credit endpoints in the browser allow list, change absolute set semantics,
change payment/refund references, alter credit units, add ledger history, create organizations, add a migration, or
define production rollout/recovery. `frontend/17` consumes this completed contract and updates generated browser
artifacts.

## Plan of Work

Require `Idempotency-Key` on additive platform requests. Parse exactly one header value, require canonical UUID text,
and reject missing, repeated, or malformed input with `400` without touching the ledger. Prefix the accepted UUID as
`platform-credit-add:<uuid>` inside the application boundary. Never accept a caller prefix or reuse this namespace
from payment/refund code.

Replace the ledger port's balance-only grant result with an immutable result equivalent to:

    type CreditGrantPersistenceResult = {
      readonly disposition: 'inserted' | 'existing'
      readonly recordedAmount: number
      readonly balance: number
    }

The identity adapter reports what persistence observed. Add `CreditsService.addPlatformCredits()`, which compares
`recordedAmount` with the requested amount. `inserted` or same-amount `existing` returns the balance;
different-amount `existing` throws a named `CreditIdempotencyConflict` that the controller maps to `409`. Keep
`CreditsService.credit()` for payment and other existing callers, mapping either disposition to the authoritative
balance exactly as before. No TypeORM exception or storage-specific code enters the application service or HTTP
response.

Inside one transaction, atomically insert the zero-balance account if absent without overwriting an existing balance,
then select the persisted account row with a pessimistic write lock. Look up or insert the namespaced grant under the
existing unique organization/reference constraint. When a concurrent insert loses the unique race, read the winning
grant and locked balance and return `existing`. Preserve debit, set, payment grant, and reversal behavior. Do not use
a process-local lock or catch all database errors as replay.

Add unit tests for header parsing, namespacing, service outcome policy, and error mapping. Add real-PostgreSQL tests
for sequential same-amount replay, same-key/different-amount conflict, concurrent duplicate requests, two different
keys, and all three cases when the organization begins without a credit-account row. Assert one account row, one
grant for one key, exact final balance, and no balance change on conflict.

Create a distinct `bruno/platform-credits` collection and update every script, test helper, and fixture that calls
additive platform credits. A single logical
retry reuses one generated UUID; distinct logical operations use distinct UUIDs. Add source Swagger annotations for
the required header, UUID organization path, amount/balance DTOs, exact replay semantics, `400`, `403`, and `409`.
Preserve `201 Created` for both the first successful add and an equivalent replay, and document `401` for missing or
invalid authentication.
Keep browser allow-list generation changes out of this pull request.
Register `corepack pnpm bruno:platform-credits` with the pinned launcher from Plan 02. It bootstraps and loads the ignored
platform service credential internally, uses the developer sandbox, requires nonzero execution, and never prints the
credential or full idempotency keys.

Add a `test:credits-postgres` runner for the skip-gated real-database suite. It must load
`TEST_CREDITS_POSTGRES_URL` from ignored disposable-stack metadata and refuse any database whose name does not end in
`_test`. It creates or resets only that dedicated database in the confirmed checkout-owned Compose project. It then
runs `credits.service.integration.spec.ts` and fails when the suite is skipped or executes zero tests. Never echo the
database password or full connection URL.

## Interfaces and Dependencies

The HTTP contract becomes:

    POST /credits/:organizationId
    Idempotency-Key: <uuid>
    { "amount": 100 }

Same organization/key/amount replay through `addPlatformCredits()` returns the current authoritative balance without another grant. Reuse of that
organization/key with another amount returns `409` and changes nothing. Keys are namespaced before persistence.
The first success and equivalent replay both return `201`; missing/invalid authentication returns `401`, and an
authenticated caller without `platform:admin` returns `403`. Backend protection remains unchanged.

The credits module owns `CreditIdempotencyConflict` and the platform replay policy. Its existing general `credit()`
method keeps payment semantics. The injected ledger port returns persistence facts; identity owns the TypeORM adapter
and entity access. This plan adds no external service, entity, migration, or browser dependency.

## Acceptance Criteria

- Missing, repeated, or malformed `Idempotency-Key` returns `400` and produces no credit account, grant, or balance
  effect. A canonical UUID reaches the service only through the platform namespace.
- Same organization/key/amount replay changes the ledger once and returns success. Different-amount reuse returns
  `409` and changes nothing. The first success and equivalent replay both return `201` with the authoritative balance.
- Missing/invalid authentication returns `401`; an authenticated non-platform caller returns `403`. Neither reaches
  the credit service.
- Concurrent same-key requests produce one account row, one grant, and one balance effect. The invariant holds when
  the organization had no credit account before either transaction began.
- The persistence adapter returns inserted/existing facts and the recorded amount; the purpose-specific
  `addPlatformCredits()` method, not the TypeORM adapter or general payment `credit()` path, owns equivalent-replay
  and conflict policy.
- Different keys retain normal additive behavior. Absolute set, debit, checkout, refund, and reversal regression
  tests remain unchanged in meaning and pass.
- Every additive repository caller supplies a per-operation UUID and reuses it only for a logical retry. Bruno covers
  success, exact replay, conflicting replay, malformed input, authorization, and concurrency.
- Focused unit/HTTP/PostgreSQL tests, module documentation, architecture gates, full repository checks, and patch
  validation pass in one pull request.

## Validation

Run focused controller, service, ledger, and real-PostgreSQL tests, including the absent-account cases:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- credits.controller credits.service credit-ledger --runInBand
    corepack pnpm test:credits-postgres
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm architecture:check

Run the pinned `bruno:platform-credits` command with one add, exact replay, conflicting replay, malformed header,
unauthorized caller, and concurrent duplicate requests. Rerun every existing collection or fixture that invokes the
additive endpoint, including relevant SMTP development setup. Then run:

    corepack pnpm bruno:platform-credits
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    git diff --check

Record before/after balances, status codes, account/grant row counts, exact nonzero PostgreSQL/Bruno counts, and skipped external gates
using only synthetic/redacted identifiers.

## Idempotence and Recovery

Additive requests converge by organization and namespaced caller key. A lost-response retry reuses the same key;
mismatched reuse is rejected. Atomic account insertion is safe to repeat and never overwrites an existing balance.
After an interrupted concurrency test, inspect and clean only its unique synthetic organization.

No schema reset, migration, backfill, production rollback, or shared-resource cleanup is introduced. If a caller
cannot supply a stable key, it must not retry automatically; do not restore controller-generated references as a
workaround.

## Artifacts and Notes

Implementation branch: `kk/511-idempotent-platform-credits`. Issue #511 is assigned to the requesting user and remains
In Progress until review and merge.

Validation recorded on 2026-09-04:

- `corepack pnpm test:credits-postgres`: 19 passed, zero skipped. Existing and absent-account fixtures both cover
  equivalent replay, conflicting reuse, concurrent duplicates, different keys, and conflicting first requests.
  Duplicate first grants produce one account, one grant, and balance 5. Distinct first grants of 3 and 7 produce one
  account, two grants, and balance 10. Conflicting first amounts produce one winner and one conflict.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci`: 183 suites and 1,546 tests passed; 10 external suites and
  63 tests skipped because their environment variables were absent. The dedicated credits database run above
  supplies separate nonzero evidence for that suite.
- `corepack pnpm typecheck`, `corepack pnpm architecture:check`, and `corepack pnpm build`: passed. The architecture
  baseline remains unchanged at 108 entries. Build compiled 571 files.
- `corepack pnpm lint`: passed with one existing return-type warning in `src/libs/config/src/load-secrets.spec.ts`.
- Controlled Bruno execution: 16 requests and 16 tests passed. Synthetic fixture balances changed from 0 to 26, 13,
  5, and 17; account counts were 1 each and grant counts were 4, 1, 2, and 1. Synthetic organizations and temporary
  reports were removed afterward. No full keys or credentials were printed.
- `corepack pnpm bruno:platform-credits`: initially failed before side effects because ignored development metadata
  was absent. After starting the new `lef-511-d454` Compose project and running existing provisioning and fixture
  scripts, the live Keycloak-backed run passed all 16 requests and 16 tests with zero skips. The four fixture balances,
  account counts, and grant counts matched the controlled run. The launcher removed all synthetic organizations
  and temporary reports.
- The existing SMTP collection ran inside the API container with pinned Bruno 4.1.0, `bru run --env local`, and the
  developer sandbox: 22 requests and 44 tests passed, with zero failures, errors, or skips. Proxy bootstrap succeeded.
- `corepack pnpm docs:lint -- .agents/plans/frontend/16-make-platform-credit-additions-idempotent.md src/libs/modules/credits/README.md src/libs/modules/identity/README.md bruno/platform-credits/README.md`:
  all four Markdown files passed Harper. `git diff --check` passed.

Record redacted organization IDs, only key suffixes when necessary, requested amounts, statuses, before/after
balances, account/grant row counts, test counts, and cleanup outcome. Never record complete keys, cookies, access
tokens, invitation secrets, real customer data, or payment-provider payloads.

The header contract, namespacing, outcome-bearing port, application-owned conflict policy, absent-account
serialization, caller migration, validation, and one-pull-request scope are decision-complete.

## Plan readiness

Ready to implement.
