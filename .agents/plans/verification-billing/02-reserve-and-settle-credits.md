# Reserve Credits and Settle Each Reservation Once

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give verification a durable credit hold before work starts and a single final choice: capture the held credit or
release it. A hold reduces the credits available for other work without reducing the total balance. Capture reduces
the total balance once; release makes the held credit available again. Concurrent requests, worker retries, payment
adjustments, and platform balance changes must preserve those facts.

This pull request supplies the ledger contract independently of verification delivery. A developer can reserve
credits through the application service, observe `{ balance, reserved, available }` through the authenticated billing
summary, settle the reservation repeatedly, and observe exactly one financial effect. Later plans decide which
verification evidence warrants capture and persist the result that authorizes settlement.

## Progress

- [x] (2026-09-10) Add organization-scoped reservation persistence and narrow application contracts.
- [x] (2026-09-10) Implement atomic reservation groups and immutable capture or release under account locks.
- [x] (2026-09-10) Close canceled or denied admission before a delayed reservation can acquire credits.
- [x] (2026-09-10) Make existing debits, payment adjustments, grants, and balance setting respect active holds.
- [x] (2026-09-10) Publish the additive billing summary and platform balance-conflict response.
- [x] (2026-09-10) Add focused, real PostgreSQL, HTTP, and Bruno coverage, including payment interactions.
- [x] (2026-09-10) Complete architecture, type, contract, prose, and disposable-runtime validation.

## Plan dependencies

None.

## Surprises & Discoveries

The current `TypeOrmCreditLedgerStore.setBalance()` reads and saves the account without the transaction and write
lock used by ordinary debits. Checking reservations only in new methods would still let this existing operation
overwrite concurrent settlement. The same account lock must govern every account mutation.

`scripts/testing/credits-postgres.ts` currently runs only `credits.service.integration.spec.ts`. Payment adjustment
integration tests use `TEST_PAYMENT_WEBHOOK_POSTGRES_URL` and reset their schema. The dedicated runner must execute
both suites serially against its own disposable database and prove that neither was skipped.

`CreditResponseDto` is shared by platform balance responses and the customer billing summary. The expanded summary
needs its own DTO so platform read/add/set success bodies remain `{ balance }`.

A real bug surfaced in the first draft of `closeAdmissionMany`: the disposition-computation loop read
`existingByOperationId.get(item.operationId)?.state === 'released'` after an earlier loop in the same method had
already mutated that same object's `.state` to `'released'` in place. Because `existingByOperationId` is a `Map` of
live entity references, not a snapshot, every fresh release was misreported as `'replayed'`. Fixed by snapshotting
each item's original state into a separate `Map` before any mutation runs, and reading disposition from that
snapshot instead. Caught by the new `typeorm-credit-reservation-store.spec.ts` before ever reaching Postgres.

Adding the `reserved`-aware insufficiency check to `debit()` uncovered a latent gap in the existing ledger-store
test fixtures: none of them set `reserved` on their mock `OrganizationCreditAccount` objects, so
`account.balance - account.reserved` evaluated to `NaN` and `NaN < amount` was always `false` — silently defeating
the insufficient-balance path for any fixture missing `reserved`. Real TypeORM rows always populate it via the
column default, so this was a test-fixture gap, not a production bug; all affected fixtures now set `reserved`
explicitly.

The check-expression test in `identity-entities.spec.ts` used `.find()` against the checks metadata for
`OrganizationCreditAccount`, which was safe with one `@Check` decorator but became nondeterministic once the entity
gained a second one for the `reserved` bound. Switched to `.filter()` plus `expect.arrayContaining` over both
expressions.

`pg` (the raw Postgres client used by Bruno launcher scripts, distinct from TypeORM) has no registered parser for
this custom `auth_permission[]` enum array type, so reading `service_credentials.permissions` back returns the raw
Postgres array-literal text (e.g. `"{verification:run,verification:read}"`) rather than a JS array. Spreading that
string to append a permission silently iterated it character-by-character, producing an invalid enum array and a
`fixture_bootstrap`-stage failure with no useful detail. Fixed by parsing the literal (`slice(1, -1).split(',')`)
before use.

The seeded `credit-purchases` customer fixture (`lef-svc-dev-fixture`) is deliberately provisioned with
member-equivalent permissions that exclude all `billing:*` scopes (see `customer-fixture.ts`), so it cannot read
its own organization's billing summary. Proving the active-hold summary check against that same isolated
organization needed a temporary, restorable elevation of that one credential's `permissions` row — mirroring the
existing `withRestoredBalance` idiom this file already uses for balance — rather than a second Keycloak client or a
schema/permission-policy change.

Rebuilding the dev stack (`docker/scripts/dev-reset.sh`) failed with "Refusing to reset containers owned by another
checkout or Compose configuration" because the running containers had been started with the SMTP-dev overlay
(`docker/compose.yaml` plus `docker/compose.smtp-dev.yaml`), while the reset script's ownership check expects
exactly the base compose file alone. Resolved by tearing the overlay stack down explicitly
(`docker compose -p lef -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans`)
before rerunning `dev-reset.sh` against zero preexisting containers.

The dev container's hot-reload process recreates `dist/` as root-owned after every rebuild, blocking the
incremental build-info write `tsc` needs. Verified `pnpm typecheck` by pointing `--tsBuildInfoFile` at a scratch path
instead of waiting on the destructive `sudo rm -rf dist` cleanup, so validation was never blocked on it.

## Decision Log

- Decision: Keep `balance` as the total unspent credit balance and add `reserved`; calculate `available` as
  `balance - reserved`. Rationale: A hold is a temporary restriction, while capture is the final charge. Existing
  `getBalance()` and platform response semantics retain their total-balance meaning.
  Date/Author: 2026-09-08, Codex planning.
- Decision: Identity owns reservation rows and locked persistence, credits owns validation and outcome interpretation,
  and email-verification owns billable evidence, durable results, work ownership, and reconciliation. Rationale:
  Preserve `email-verification -> credits -> identity` without a reverse dependency or transaction handle crossing
  module boundaries. Date/Author: 2026-09-08, Codex planning.
- Decision: Reserve a batch's required credits through one atomic `reserveMany` operation. Rationale: A batch must
  not acquire a partial set of new holds when available credits cannot fund the entire set. Existing equivalent
  reservations are observed without reserving them again. Date/Author: 2026-09-08, Codex planning.
- Decision: Strict debit and payment `debitUpTo()` consume only available credits. Payment adjustments retain their
  clamp, shortfall, and replay behavior. Rationale: Accepted work retains its reserved funding, and payments records
  the amount that the ledger actually removed. Date/Author: 2026-09-08, Codex planning.
- Decision: An absolute platform balance target below reserved returns `409` without mutation. Rationale: An
  administrative overwrite must not invalidate funding promised to accepted operations.
  Date/Author: 2026-09-08, Codex planning.
- Decision: Reservation age alone never releases credits. Rationale: A late worker could otherwise return a paid
  result after its funds had been reused. The verification owner must first fence further work through its durable
  terminal state, then request release. Date/Author: 2026-09-08, Codex planning.
- Decision: Close denied or canceled admission durably through `closeAdmissionMany` after the owner fences
  admission. Rationale: An insufficient-funds response alone cannot prevent a delayed duplicate reservation from
  succeeding after a top-up. Released receipts for missing IDs block those late admissions without spending credits.
  Date/Author: 2026-09-08, Codex planning.
- Decision: Give the platform Bruno launcher's sixth ("held") organization a reservation created through a real,
  short-lived Nest application context (`IdentityModule` plus a `CreditReservationService` factory), never raw SQL.
  Rationale: The plan requires proving the hold through the application service; a shared bootstrap module
  (`scripts/bruno/reservation-bootstrap-module.ts`) avoids duplicating that Nest wiring between the platform-credits
  launcher and the new standalone `scripts/bruno/reservation-fixture.ts` CLI the credit-purchases launcher spawns as
  a child process. Date/Author: 2026-09-10, implementation.
- Decision: Prove the credit-purchases collection's active-hold summary check against the existing, isolated
  seeded customer organization rather than the shared platform organization the rest of that collection exercises.
  Rationale: The platform organization's balance is exercised by exact-amount clawback assertions (a debit-adjustment
  that removes an entire grant down to zero); any concurrent hold there would clamp that debit short and break an
  unrelated, already-passing test. The customer organization is otherwise untouched by this collection's flow, and
  `withRestoredBalance` already establishes the "mutate a controlled fixture, execute, restore in `finally`" idiom
  this reservation fixture reuses for both balance and hold, plus a temporary permission elevation.
  Date/Author: 2026-09-10, implementation.

## Outcomes & Retrospective

Delivered exactly the scope this plan describes: organization-scoped credit reservations (hold, capture, release,
and fenced batch closure) behind a new `CreditReservationStore` port and `TypeOrmCreditReservationStore` adapter in
`identity`, a `CreditReservationService` in `credits` with its own independent public types, `reserved`-aware ledger
reads (`debit`/`debitUpTo`/`setBalance`/`getBalanceSnapshot`), the additive `{ balance, reserved, available }`
billing summary, and the platform `409` below-reserved response. No reservation HTTP endpoint, verification
integration, migration, or production deployment work was added, matching Scope and Non-Goals.

Validation executed, in order:

- `corepack pnpm exec jest --runInBand` (full suite): 238 suites / 2788 tests passed, 15 suites / 104 tests skipped
  (environment-gated live-Keycloak/Postgres suites, expected without those services), 0 failed.
- `corepack pnpm test:credits-postgres`: 52 tests passed against a real, disposable Postgres database, covering
  both `credits.service.integration.spec.ts` (reservation lifecycle, concurrent lock-order races, batch closure,
  atomic rollback, delayed-duplicate fencing) and `payment-event.handler.integration.spec.ts` (hold-aware clamped
  debit, full-debit-after-release, concurrent duplicate under a hold, restore leaving a hold untouched) in one run,
  zero skipped.
- `corepack pnpm test:oidc-runners`: 89/89 node:test cases passed, including the updated `run-collection.test.mjs`
  synthetic-server coverage of the new credit-purchases reservation fixture wiring.
- `corepack pnpm architecture:check`: 9 modules, 0 violations.
- `corepack pnpm typecheck` (via `tsc --noEmit`, redirecting `--tsBuildInfoFile` to a scratch path to work around a
  root-owned `dist/` left by the dev container's hot reload): clean.
- `corepack pnpm lint`: clean except one unrelated preexisting warning in `src/libs/config/src/load-secrets.spec.ts`.
- `corepack pnpm openapi:export` / `openapi:generate` / `openapi:check`: all passed; the generated client now carries
  `BillingSummaryResponseDto` and the `PUT /credits/:id` `409` response.
- `corepack pnpm bruno:platform-credits` against a freshly rebuilt dev stack: 34 requests / 34 tests passed,
  including the sixth held organization's real-service reservation, below-held `409`, and unchanged-balance read.
- `corepack pnpm bruno:credit-purchases` against the same stack, run twice for stability: 34 requests / 34 tests
  passed both times, including the new active-hold summary check against the isolated customer organization and its
  isolation from the platform organization.
- `corepack pnpm exec prettier --check` across every touched file: clean (after one `--write` pass and one
  follow-up fix — Prettier reflowed an unrelated preexisting `request(...)[method](...)` chain in
  `credits-http.integration.spec.ts`, which then tripped `no-unexpected-multiline`; resolved by naming the
  intermediate request object instead of chaining across the bracket-access line break).
- `git diff --check`: clean.
- `corepack pnpm docs:lint -- <touched docs>`: found and fixed several genuine parsing issues, all the same shape —
  a module name in backticks immediately followed directly by a possessive contraction, which Harper misreads as a
  standalone trailing letter — reworded to avoid it throughout. The remaining findings are all
  `[Readability]` sentence-length flags on dense, precise technical sentences consistent with this repository's
  existing documentation style; two of the longest were split for clarity, the rest were left as-is since they are
  not grammar or spelling findings and further mechanical splitting would fragment precise contract descriptions.
  Per repository policy, only actionable grammar/spelling findings are fixed; both were.
- `corepack pnpm build` (`nest build`): blocked locally by the dev container's hot-reload process leaving `dist/`
  root-owned after the stack rebuild; typecheck (which performs the same semantic check `tsc` needs for a build) is
  clean, and CI's own build runs in a container without this local ownership quirk.

Architecture/SOLID self-review of the diff: `identity` owns all reservation persistence, locking, and transaction
mechanics behind `CreditReservationStore`; `credits` owns validation and outcome-to-exception mapping in
`CreditReservationService`; neither imports the other's concrete adapters. `CreditReservationService` declares its
own `ReservationRecord`/`ReservationAdmission`/`ReservationSettlement` types rather than reexporting identity's port
types, preserving the same module-boundary independence the preexisting `CreditLedgerStore`/`CreditsService` split
uses. The one deliberate exception to "no duplication" is the small `insertAccountIfAbsent`/`lockAccount` helper
shared between `TypeOrmCreditLedgerStore` and `TypeOrmCreditReservationStore` — explicitly endorsed by the plan
("share only a small internal account-lock helper") to keep the account row as the single serialization point
without duplicating locking logic. `payments` required no code change: `PaymentAdjustmentHandler` already called
`debitUpTo()`/`creditOnce()` by name, so making those methods reserved-aware in `identity` was enough; payments'
README now documents that interaction without payments owning any reservation logic itself. No generic "manager"
service was introduced; `CreditReservationService` is purpose-specific to the hold/capture/release/closure
lifecycle, matching the narrow-interface convention `credits.README.md` already documents for `CreditsService`.

## Context and Orientation

`src/libs/modules/credits/src/application/credits.service.ts` wraps identity's `CreditLedgerStore` and maps strict
debit failures to `InsufficientCreditsException`. It also preserves payment grant and adjustment replay semantics.
Credits has no persistence adapter of its own.

`src/libs/modules/identity/src/application/ports/credit-ledger-store.ts` defines atomic ledger operations.
`src/libs/modules/identity/src/infrastructure/persistence/typeorm-credit-ledger-store.ts` implements them using
`OrganizationCreditAccount`, `CreditDebit`, and `CreditGrant`. The account's `balance` cannot be negative; debit and grant
references are unique within an organization. Grants insert an absent account before locking it, because a missing
row cannot provide a write lock.

`src/libs/modules/payments/src/application/payment-adjustment.handler.ts` calls `debitUpTo()` for approved adjustment
debits and `creditOnce()` for inverse adjustments. Payments records shortfall from the returned amount; its accounting
and provider mapping remain owned by payments.

`src/libs/modules/credits/src/api/billing-summary.controller.ts` exposes `GET /v1/billing/summary` using the principal's
organization and `billing:read`. `api/credits.controller.ts` exposes platform operations with `platform:admin`.
Neither route will expose reservation identifiers, work identifiers, or email addresses.

Read root instructions, `src/libs/modules/AGENTS.md`, the canonical module README, affected module README files, and the
local PostgreSQL skill before implementation. Existing payment, platform grant, and module architecture plans
describe completed behavior to preserve. Frontend plans 10 and 17 consume balances but do not own this ledger change.

## Scope and Non-Goals

Deliver one pull request for reservation storage, admission closure, reserve/read/capture/release methods, existing ledger
treatment of holds, the additive billing summary, and the platform `409` response. Include contract generation,
fixture registration, documentation, and focused tests required by those changes.

Verification evidence, result persistence, operation admission, request idempotency headers, rate limits, queue
dispatch, batch parsing, cache behavior, and reconciliation scheduling belong to later plans. Add no reservation
HTTP endpoints, user interface, payment provider change, pricing change, migration, or production deployment work.
Keep current verification credit guards and route charging until their delivery plans adopt the new contract.

## Plan of Work

Define persistence-independent input, record, and outcome types in identity's
`application/ports/credit-reservation-store.ts`, with a `CREDIT_RESERVATION_STORE` token. Add a purpose-specific
`CreditReservationService` under credits `application/`, composed through an explicit factory in
`credits.module.ts`. Keep balance operations in `CreditsService`. Export supported services and result types through
public barrels and document the new identity dependency surface.

Add `reserved` to `OrganizationCreditAccount`, defaulting to zero, with database checks for
`0 <= reserved <= balance`. Add `credit-reservation.entity.ts` under identity persistence, keyed by
`(organizationId, operationId)`, with positive integer `amount`, `state` chosen from `reserved`, `captured`, or
`released`, and creation, update, and nullable settlement timestamps. The organization foreign key cascades on
organization deletion. Operation IDs are opaque UUIDs supplied by the owner. Store no raw email, request body,
provider result, or authentication material. Register the entity in `identity.module.ts` and its public fixture
surface. Update every disposable test `DataSource` that explicitly lists identity entities.

Implement `TypeOrmCreditReservationStore` in identity infrastructure. Share only a small internal account-lock
helper with `TypeOrmCreditLedgerStore` if needed. Every mutation first inserts an absent account using its
organization key's conflict target, then locks that account, then reads or locks reservation or ledger rows. Use
this order consistently, including grouped reservation and existing `setBalance`; keep external calls out of these
transactions. The account is the serialization point for all changes to its total and reserved balances.

Validate complete admission input before mutation: nonempty unique operation IDs, positive integer amounts within
the database integer range, and an aggregate sum that cannot overflow. Reject duplicate operation IDs within one
input. Read existing organization reservations, reject any amount mismatch, and sum only missing rows. If their total
exceeds available credits, apply no new reservation and no balance change. Otherwise, insert all missing rows and
increase `reserved` by their sum in the same transaction. Return immutable results in input order. Queries may be
chunked inside this transaction to respect parameter limits; do not split admission into independently committed
chunks. Single reservation delegates to the same mechanism.

Add `closeAdmissionMany(organizationId, items)` for the owner's immutable admission list. The owner may call this
only after durably fencing a denied or canceled admission, before admitting outbound work. Validate IDs and amounts
as for reservation admission. In one account-locked transaction, inspect the complete list before changing any row.
An existing captured receipt or amount mismatch conflicts and rolls back the whole closure. Insert a released
receipt for each missing ID, release each reserved receipt while decreasing account `reserved`, and replay each
matching released receipt. Total balance never changes and no grant or debit is inserted. Return the matching
released records in input order with applied or replayed dispositions. Closure and reservation take the same account
lock: whichever arrives first, closure leaves no active hold for these IDs and a later reserve sees only released
receipts. The ordinary `release` method still rejects a missing reservation; only admission closure can create a
released receipt without a preceding hold.

Require owner code to inspect every admission record's state. Returning an existing released receipt from
`reserve` or `reserveMany` is a replay observation, never funding success. It must not queue work or reopen that
operation. A failed mixed group must close all of its newly owned execution IDs before publishing failed admission;
it must not close preexisting executions owned elsewhere. The owner records the immutable cancellation or denial
fence before calling credits, then confirms closure before finalizing the public failure. An uncertain closure
remains recoverable with the same immutable list.

Capture requires the existing reservation. In one transaction change `reserved` to `captured`, decrease account
`balance` and `reserved` by its amount, and insert a debit using the private namespace
`verification-reservation:<operationId>`. Release changes `reserved` to `released` and decreases only account
`reserved`; it creates no grant because no total credit was removed. Repeating the same transition returns the
recorded outcome. The opposite transition, an existing amount mismatch, or settlement of a missing reservation
returns a typed conflict without mutation. Terminal reservations never reopen; a new operation needs a new UUID.
Treat an unexpected preexisting debit reference as a conflict rather than silently claiming capture succeeded.

Extend the ledger port with a consistent balance snapshot read. Make `debit()` compare against `balance - reserved`
and make `debitUpTo()` clamp to that value. Preserve recorded zero debits and replay return values, so later top-ups
or releases cannot let an old adjustment charge again. Grants increase total balance without changing holds. Move
`setBalance()` into the shared lock discipline and reject a target below reserved before writing. Return typed
persistence facts; credits interprets the rejection, and the controller maps it to `409` with a stable message
containing no reservation or operation details.

Add a dedicated billing-summary DTO containing exactly `balance`, `reserved`, and `available`. Read all three from
one account snapshot; never combine reads from different transactions. An absent account returns zeros. Retain
permissions and principal-derived organization. Update Swagger, browser OpenAPI artifacts, and exact-key assertions.
Update module README files and the nearest Bruno collections, then complete validation below.

## Interfaces and Dependencies

`CreditBalanceSnapshot` has `readonly` integer fields `balance`, `reserved`, and `available`, with
`available === balance - reserved`. `CreditsService.getBalance(organizationId)` still returns the total.
`CreditsService.getBalanceSnapshot(organizationId)` supplies the consistent snapshot.

`CreditReservationService` exposes these framework-independent operations through the credits public barrel:

```ts
reserve(organizationId: string, item: { operationId: string; amount: number }): Promise<ReservationAdmission>
reserveMany(organizationId: string, items: ReadonlyArray<{ operationId: string; amount: number }>): Promise<ReadonlyArray<ReservationAdmission>>
getReservation(organizationId: string, operationId: string): Promise<ReservationRecord | null>
capture(organizationId: string, operationId: string): Promise<ReservationSettlement>
release(organizationId: string, operationId: string): Promise<ReservationSettlement>
closeAdmissionMany(organizationId: string, items: ReadonlyArray<{ operationId: string; amount: number }>): Promise<ReadonlyArray<ReservationSettlement>>
```

`ReservationRecord` contains operation ID, amount, state, and timestamps. Admission adds an `inserted` or `existing`
disposition; settlement adds an `applied` or `replayed` disposition. Equivalent retries return persisted amount and
state. Admission closure returns released settlement records, including durable receipts for IDs that never held
credits. Admission outcomes containing released records cannot authorize execution. Identity returns typed
insufficient, missing, and conflict outcomes; credits maps them to framework-independent
errors. Every lookup and mutation requires organization ID, including settlement. The same operation UUID in two
organizations identifies independent reservations.

No ledger method accepts verification results or a transaction callback. Later email-verification orchestration
persists a result and immutable settlement intent in its own operation store, calls capture or release using the
stable operation ID, and marks the result deliverable only after the matching ledger outcome. Recovery repeats that
settlement; it never recomputes a conflicting decision. Credits does not read verification tables, and identity
imports no business module. No environment variable or package is added.

`GET /v1/billing/summary` adds `reserved` and `available`, retaining total `balance`. Platform read, addition, and
absolute-set success responses retain `{ balance }`. `PUT /credits/:organizationId` returns `409` when
the requested total is below active reserved credits, retaining existing validation and authorization.

## Acceptance Criteria

- From ten total credits, reserving three gives total ten, reserved three, available seven. Capture gives total seven,
  reserved zero, and one three-credit debit. Release instead restores available ten with no grant or debit. Every
  replay preserves the original effect.
- Concurrent admissions reserve at most available credits. Duplicate organization and operation IDs create one hold;
  mismatched amounts conflict. An unaffordable group leaves all new items absent. Mixed existing and new items reserve
  only missing items. A group containing an amount conflict applies no new holds.
- Capture and release races have one terminal winner; the opposite decision conflicts. Balances never become negative,
  debit rows never duplicate, and account reserved matches active rows. Transaction failure rolls back reservation,
  debit, and account changes together.
- Closing admission races safely with reservation: a reserve that wins first is released; closure that wins first
  blocks later funding through its released receipt. A delayed duplicate after insufficient funds and a later top-up
  cannot acquire a hold after confirmed closure. Replaying closure has no financial effect. One captured ID or amount
  conflict rolls back the whole closure, including missing-ID receipts. Ordinary release of a missing ID still fails.
- Every reservation operation is organization-scoped. Reading another organization's ID returns no reservation;
  settling it reports missing. The customer summary accepts no organization override.
- Strict debit and refund clamping cannot consume held funds. A payment adjustment records exact shortfall; release
  or top-up does not change its replayed debit. An inverse still clears shortfall first and restores only applied debit.
- Platform targets below reserved return `409` without mutation; exactly reserved succeeds with zero available.
  Concurrent set, grant, admission, and settlement have no lost updates. Existing addition-key replay and conflict
  behavior remains intact, including first operations without an account row.
- The summary returns exactly the three consistent documented values, requires `billing:read`, and returns zeros
  for an absent account. Existing platform success shapes remain unchanged.
- Age never releases credits automatically. Settled reservations remain replayable and cannot reopen after a top-up.
  No verification, provider, queue, or HTTP client enters ledger code.
- Architecture, semantic type, focused tests, contract checks, and non-skipped real PostgreSQL suites pass. Relevant
  Bruno collections cover the changed success and rejection contracts.

## Validation

Run these commands from the repository root after implementation:

```sh
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/credits/src/application/credit-reservation.service.spec.ts src/libs/modules/credits/src/application/credits.service.spec.ts src/libs/modules/identity/src/infrastructure/persistence/typeorm-credit-reservation-store.spec.ts src/libs/modules/identity/src/infrastructure/persistence/typeorm-credit-ledger-store.spec.ts
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/credits/src/api/billing-summary-http.integration.spec.ts src/libs/modules/credits/src/api/credits-http.integration.spec.ts src/libs/modules/credits/src/api/credits.controller.spec.ts src/libs/modules/credits/src/credits.module.spec.ts
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/payments/src/application/payment-adjustment.handler.spec.ts src/libs/modules/payments/src/infrastructure/persistence/typeorm-payment-adjustment.store.spec.ts src/libs/modules/payments/src/domain/payment-adjustment-accounting.spec.ts scripts/testing/credits-postgres.spec.ts scripts/bruno/platform-credits-runner.spec.ts
corepack pnpm test:credits-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:platform-credits
corepack pnpm bruno:credit-purchases
```

Add reservation concurrency and rollback scenarios to the existing `credits.service.integration.spec.ts`, which
uses real identity persistence. Include concurrent close-versus-reserve with both lock orders, closure containing
missing/reserved/released IDs, atomic rollback for captured or mismatched IDs, and a delayed duplicate after an
insufficient-funds response, confirmed closure, and replenishment. Assert that replayed released admission records
never count as funded. Extend `payment-event.handler.integration.spec.ts` with holds during debit,
shortfall, replay, release, and inverse restoration. Extend the dedicated PostgreSQL runner to invoke these two
exact suites serially, passing its validated owned test URL through each suite's distinct variable. Each suite may
reset the disposable schema only after the previous suite completes. Require both suites in a fresh successful
report with positive counts and zero skips. Update runner tests to reject a report missing either suite. Never run
the two schema-resetting suites concurrently against one database or present skipped tests as database proof.

Extend the platform Bruno fixture launcher to create a reservation for one synthetic organization through the
application service, then clean it up through organization deletion. Add absolute-set success, below-held `409`, and
unchanged-balance assertions to the existing collection, updating request-count checks. Add no fixture HTTP endpoint.
Extend `bruno/credit-purchases/24-read-current-organization-summary.yml` to assert all three fields, their arithmetic,
and organization isolation. Include an active-hold summary check using the controlled fixture pattern. Launchers
must keep their pinned `bru run --env local` execution and verified local stack configuration.

Record exact executed counts and outcomes. If Docker, PostgreSQL, or the authenticated local stack is unavailable,
run static checks and state which database or Bruno runtime claims remain unverified. No live Paddle sandbox action
is needed because provider behavior does not change.

## Idempotence and Recovery

Retry admission with the same organization, operation IDs, and amounts. Retry settlement with the same operation ID
and final decision. A retry after commit returns the durable fact; after rollback it applies normally. There is no
compensating grant for release, no reopening of terminal rows, and no automatic retry with a new key.

After fencing a denied or canceled admission, retry `closeAdmissionMany` with the exact owned execution IDs and
amounts until closure is confirmed. A missing receipt is closed durably, not treated as proof that no delayed
reservation can arrive. The owner must not publish failed or terminal admission before this confirmation. A late
reserve observes the released receipt and cannot fund work, even if more credits have since been granted. Retain
closure receipts for the same replay horizon as other settled reservations.

Keep completed reservations for the owner's operation replay horizon. This plan adds no deletion job. An orphaned
or old hold remains reserved until the verification owner proves a fenced terminal state and requests settlement.
Later owner reconciliation supplies that recovery; a generic timer must not release the hold.

Use TypeORM synchronization only against disposable data. The dedicated database command recreates its own schema
and does not touch application data. For an incompatible application fixture, stop overlays and run
`corepack pnpm dev:reset -- --confirm-project=LEF` only for the confirmed default development project owned by this
checkout. This recreates PostgreSQL and Redis state together, starts the synchronized schema, reprovisions Keycloak,
and reseeds the existing fixtures. Follow `docker/README.md` for owned-stack preconditions; do not adapt the default
reset to another checkout's project. Run the relevant Bruno launchers afterward.

## Artifacts and Notes

Planning inspected credits and identity contracts, their ledger adapter, payment adjustment accounting, platform
grant tests, the PostgreSQL runner, and both Bruno collections. No implementation or runtime validation has occurred.
The local PostgreSQL skill's short-transaction and consistent-lock-order guidance applies; migration examples do not
override the repository's synchronization-only development policy.

The additive summary requires no visual change in this pull request. Later UI work owns presentation of total, held,
and available credits. The verification operation plan owns result publication and recovery; neither responsibility
may be pushed into identity to obtain a cross-module transaction.

## Plan readiness

Implemented, validated, and ready for review. All Progress items are complete; see Outcomes & Retrospective for
the exact validation matrix executed and its results.
