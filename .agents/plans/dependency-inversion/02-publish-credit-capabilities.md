# Publish Credit Capabilities for Their Current Consumers

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Credit consumers should depend on the balance, administration, payment, spending, or reservation operations they
use. After this change, controllers, payment handlers, verification workflows, and supported Bruno fixtures accept
independent contracts and resolve them through public tokens. Typed fakes can exercise failures and replay without
pretending to be `CreditsService` or `CreditReservationService`; real modules continue using the existing instances
and identity-owned persistence. Credit amounts, concurrency behavior, and HTTP outcomes remain unchanged.

This plan maps to one implementation pull request. Proposed commit subject and PR title:
`refactor(credits): publish purpose-specific application capabilities`.

## Progress

- [ ] (2026-09-17) Publish independent credit and reservation contracts with public tokens.
- [ ] (2026-09-17) Bind existing service instances and migrate all current consumer and fixture wiring.
- [ ] (2026-09-17) Verify typed substitutions, real module resolution, accounting, and reservation recovery.
- [ ] (2026-09-17) Update affected documentation and record completed validation and architectural review.

## Plan dependencies

- `dependency-inversion/01`

## Surprises & Discoveries

Credits already depends on identity's `CreditLedgerStore` and `CreditReservationStore` interfaces. Its persistence
boundary requires no redesign. The remaining coupling is at the public service boundary and local API consumers.
Payment tests use `Pick<CreditsService, ...>` followed by an `unknown` cast; verification admission, settlement,
reconciliation, and batch tests similarly coerce partial fakes into `CreditReservationService`.

Reservation consumers also exist outside `src/`: `scripts/bruno/reservation-bootstrap-module.ts` constructs a
fixture module, and `reservation-fixture.ts` and `run-platform-credits.ts` retrieve the concrete service. These
supported fixtures must continue exercising real reservation behavior after token migration.

The reservation service already defines credits-owned result types separate from identity's persistence records.
Preserving this distinction prevents a consumer contract from exposing persistence outcomes or transaction details.

## Decision Log

- Decision: Publish five balance/payment capabilities and one coherent reservation lifecycle contract.
  Rationale: Balance, administration, strict spending, grants, adjustments, and hold settlement have different
  consumers; reservation methods jointly enforce one lifecycle and do not need a facade per method.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Keep the two existing service implementations and alias each capability to its existing instance.
  Rationale: No policy, persistence, or service-lifetime change is required. Date/Author: 2026-09-17, Codex planning.
- Decision: Retain existing public class exports for compatibility, while migrating every current injected
  production consumer and fixture lookup to the capabilities. Rationale: Removing public exports is separate
  compatibility work; composition roots and implementation tests may still construct classes.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Sequence after `dependency-inversion/01` to avoid simultaneous payment wiring edits.
  Rationale: This is coordination of shared files, not a semantic need for the new payment contracts.
  Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/credits/src/application/credits.service.ts` interprets identity ledger outcomes for strict debit,
grant, adjustment, balance, and platform administration. `credit-reservation.service.ts` validates reservation
inputs and maps identity outcomes to credits-domain exceptions. `credits.module.ts` constructs both from public
identity store tokens. `src/index.ts` and Nest exports currently expose their concrete classes.

`CreditsController` uses balance read/add/set, `BillingSummaryController` uses a consistent balance snapshot, and
`CreditGuard` calls strict debit. In payments, `PaymentEventHandler` grants a paid purchase and
`PaymentAdjustmentHandler` uses clamped debit or one-time credit. In email verification, single and batch admission
reserve credits and fence denied admission; settlement captures or releases; reconciliation reads reservations
and releases canceled work. These are current consumers, not proposed business features.

Completed `module-architecture/04` owns the existing persistence separation. `verification-billing/02` owns held
credits and settlement, and completed plans `verification-billing/03` through `/05` integrate durable single and
batch verification. `frontend/10` and `/16` establish billing summaries and platform idempotency. Preserve their
current contracts; this PR only changes the types and wiring through which callers reach them.

## Scope and Non-Goals

Change credits contracts, existing service declarations, module exports, the three local API consumers, payment
credit consumers, four verification credit consumers, their composition roots, supported reservation fixtures,
focused tests, and affected module documentation. All imports across modules remain through bare public barrels.

Do not change identity stores, database entities, locking, reservations, ledger references, prices, billing
classification, verification scheduling, settlement ordering, permissions, routes, DTOs, or exception handling.
Do not repair unrelated verification races or rewrite service bodies. No schema, migration, production rollout,
provider, frontend, or package change belongs in this PR.

## Plan of Work

Create the six files specified below under `src/libs/modules/credits/src/application/ports/`. Move the existing
credits-owned reservation types into `credit-reservations.ts`, preserving every field and `readonly` qualifier.
Declare `CreditBalanceSummary` explicitly in the balance-reader contract. Have `CreditsService` implement its
five consumer capabilities and `CreditReservationService` implement `CreditReservations`; keep their business
methods and exception mappings unchanged. Preserve public reservation type names through the credits barrel.

In `credits.module.ts`, keep the existing identity-port factories and bind each new token using `useExisting`.
Export the capability tokens through Nest and export tokens and interfaces through `src/index.ts`. Keep class
exports for compatibility. Add explicit `@Inject` annotations in `api/credits.controller.ts`,
`api/billing-summary.controller.ts`, and `api/credits.guard.ts`, using the matching narrow interfaces.

In payments, update `application/payment-event.handler.ts` to consume `CreditGranter` and
`application/payment-adjustment.handler.ts` to consume `CreditAdjustmentOperations`. Update the argument types and
`inject` arrays in `payments.module.ts`; preserve the internal contracts established by plan 01. Both capabilities
must resolve to credits' existing ledger-backed service, not locally provided replacement instances.

Migrate email verification's `application/operations/verification-admission.service.ts`,
`verification-settlement.service.ts`, `verification-reconciler.ts`, and
`application/delivery/batch/batch-admission.service.ts` to `CreditReservations`. Update
`infrastructure/email-verification-core.module.ts` and
`infrastructure/queues/batch-verification/batch-email-verification.module.ts` to inject `CREDIT_RESERVATIONS`.
Leave their other collaborators, queue behavior, and independent refactors to their owning plans.

Add the reservation token alias/export to `scripts/bruno/reservation-bootstrap-module.ts`, retaining its existing
factory and complete identity entity registration. Change `reservation-fixture.ts` and `run-platform-credits.ts`
to `app.get<CreditReservations>(CREDIT_RESERVATIONS)`. Preserve connection settings, fixture ownership, restoration,
and application-context cleanup. This composition root may continue constructing `CreditReservationService`.

Replace concrete-service casts in affected tests with interface-checked fakes. A reservation fake implements the
six operations explicitly and returns the documented receipt types. Update credits and payments module tests to
compile real provider graphs and prove aliases share their class instances. Add focused module wiring coverage
for the verification factories and reservation bootstrap alias, including resolution through imported modules.
Migrate `src/libs/modules/email-verification/src/infrastructure/account-discovery/account-discovery-wiring.spec.ts`:
its global billing fixture currently exports only `CreditReservationService` while replacing `CreditsModule`
with an empty module. Provide and export a typed `CREDIT_RESERVATIONS` fake there so actual Nest compilation
continues to work. Also replace the concrete reservation fake and cast in
`infrastructure/queues/batch-verification/batch-email-verification-queue.integration.spec.ts` under that module.
Update credits, payments, and email-verification documentation to describe their exact supported contracts and tests.

## Interfaces and Dependencies

Each interface is independently declared and exported with a uniquely named symbol. Do not derive it from
`CreditsService` or `CreditReservationService` with `Pick`, `Parameters`, or `ReturnType`.
All `organizationId`, `reference`, `operationId`, and `idempotencyKey` parameters below are `string`; `amount` is
`number`. Spell these types explicitly in the implementation.

| Port file | Interface and token | Operations |
| --- | --- | --- |
| `credit-balance-reader.ts` | `CreditBalanceReader`, `CREDIT_BALANCE_READER` | `getBalanceSnapshot(organizationId): Promise<CreditBalanceSummary>` |
| `platform-credit-administration.ts` | `PlatformCreditAdministration`, `PLATFORM_CREDIT_ADMINISTRATION` | `getBalance(organizationId): Promise<number>`; `addPlatformCredits(organizationId, amount, idempotencyKey): Promise<number>`; `setBalance(organizationId, amount): Promise<number>` |
| `credit-debiter.ts` | `CreditDebiter`, `CREDIT_DEBITER` | `debit(organizationId, amount, reference): Promise<void>` |
| `credit-granter.ts` | `CreditGranter`, `CREDIT_GRANTER` | `credit(organizationId, amount, reference): Promise<number>` |
| `credit-adjustment-operations.ts` | `CreditAdjustmentOperations`, `CREDIT_ADJUSTMENT_OPERATIONS` | `debitUpTo(organizationId, amount, reference): Promise<number>`; `creditOnce(organizationId, amount, reference): Promise<number>` |
| `credit-reservations.ts` | `CreditReservations`, `CREDIT_RESERVATIONS` | The six lifecycle methods below. |

`CreditBalanceSummary` has `readonly` `balance`, `reserved`, and `available` numeric fields. Declare reservation
contracts independently of identity: `ReservationInput` has `readonly` `operationId: string` and `amount: number`;
`ReservationRecord` adds `readonly` `state: 'reserved' | 'captured' | 'released'`, `createdAt: Date`, `updatedAt: Date`,
and `settledAt: Date | null`. `ReservationAdmission` extends the record with `readonly`
`disposition: 'inserted' | 'existing'`; `ReservationSettlement` extends it with `readonly`
`disposition: 'applied' | 'replayed'`.

```ts
interface CreditReservations {
    reserve(organizationId: string, item: ReservationInput): Promise<ReservationAdmission>
    reserveMany(organizationId: string, items: readonly ReservationInput[]): Promise<readonly ReservationAdmission[]>
    getReservation(organizationId: string, operationId: string): Promise<ReservationRecord | null>
    capture(organizationId: string, operationId: string): Promise<ReservationSettlement>
    release(organizationId: string, operationId: string): Promise<ReservationSettlement>
    closeAdmissionMany(organizationId: string, items: readonly ReservationInput[]): Promise<readonly ReservationSettlement[]>
}
```

Existing credits-domain error classes remain the same objects, preserving consumers' `instanceof` checks. The
summary remains authoritative with `available === balance - reserved`; `credit` returns current balance, while
`creditOnce` and `debitUpTo` return the recorded applied amount. No new cross-module direction is introduced.

## Acceptance Criteria

- Every current API/payment/verification consumer and supported fixture lookup uses the selected interface and
  token. Concrete classes remain only where implementations are constructed, tested, or retained as public exports.
- Consumer fakes type-check without asserting through `unknown` to either credits service. Public result types do
  not depend on service-class types or identity's persistence outcomes.
- The real credits module exports all six tokens; each resolves to the existing service instance. Payment and
  verification consumers resolve through their imported modules, and fixture bootstrap resolves its alias.
- Billing and platform routes retain authorization, schemas, status codes, organization scoping, zero-balance
  reads, platform key validation, equivalent replay, amount-conflict `409`, and below-reserved `409` behavior.
- Strict debit still rejects insufficient available credit; payment grants remain idempotent; clamped zero debits
  remain zero on replay after replenishment; adjustment restoration never returns unapplied credits.
- Reservation admission and closure remain atomic for a group. Terminal states never reopen, matching retries
  retain their dispositions, amount conflicts preserve the entire group, and denied admission cannot be funded by
  a delayed reserve. Capture charges once; release never grants or debits credits.
- Verification preserves reservation ownership, durable intention before settlement, canceled-work release,
  retry recovery, and single/batch accounting. Existing regression assertions are preserved without weaker mocks.
- Architecture, focused tests, type checking, prose checks, and the disposable PostgreSQL regression pass. Runtime
  HTTP checks and any unavailable dependencies are reported separately from unit evidence.

## Validation

Run from the repository root after implementation; no command below has run for this plan:

```sh
corepack pnpm architecture:check
corepack pnpm test -- src/libs/modules/credits/src/application/credits.service.spec.ts src/libs/modules/credits/src/application/credit-reservation.service.spec.ts src/libs/modules/credits/src/api/credits.controller.spec.ts src/libs/modules/credits/src/api/credits.guard.spec.ts src/libs/modules/credits/src/api/credits-http.integration.spec.ts src/libs/modules/credits/src/api/billing-summary-http.integration.spec.ts src/libs/modules/credits/src/credits.module.spec.ts src/libs/modules/payments/src/application/payment-event.handler.spec.ts src/libs/modules/payments/src/application/payment-adjustment.handler.spec.ts src/libs/modules/payments/src/payments.module.spec.ts --runInBand
corepack pnpm test -- src/libs/modules/email-verification/src/application/operations/verification-admission.service.spec.ts src/libs/modules/email-verification/src/application/operations/verification-settlement.service.spec.ts src/libs/modules/email-verification/src/application/operations/verification-reconciler.spec.ts src/libs/modules/email-verification/src/application/delivery/batch/batch-admission.service.spec.ts src/libs/modules/email-verification/src/infrastructure/email-verification-core.module.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/batch-email-verification.module.spec.ts scripts/bruno/reservation-bootstrap-module.spec.ts --runInBand
corepack pnpm test:credits-postgres
corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/account-discovery/account-discovery-wiring.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/batch-verification/batch-email-verification-queue.integration.spec.ts --runInBand
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/credits/README.md src/libs/modules/payments/README.md src/libs/modules/email-verification/README.md .agents/plans/dependency-inversion/02-publish-credit-capabilities.md
```

The two new verification module suites and the new reservation bootstrap suite are part of this PR. They must
exercise construction/resolution, not only compare metadata. The PostgreSQL command uses the repository's isolated,
disposable Docker fixture and runs the real credits and payment-webhook suites; a skipped gated suite is not proof.
If Docker is unavailable, record this required verification as outstanding instead of claiming it passed.
Run the batch queue suite with `TEST_REDIS_URL` pointing to disposable Redis owned by this checkout; a gated
skip does not verify the updated reservation fixture under real queue execution.

When the checkout-owned development stack and SMTP fixture are available, run `corepack pnpm bruno:credit-purchases`,
`corepack pnpm bruno:platform-credits`, `corepack pnpm bruno:smtp-dev`, and `corepack pnpm bruno:batch-verification`.
Update existing billing-summary and platform-credit rejection assertions to verify numeric balance fields,
`available === balance - reserved`, and an unchanged balance/hold after rejected administration. Update the batch
completion assertion to require coherent reserved/charged values of zero or more from the seeded reservation flow.
Preserve the collections' reservation fixture paths. These updates cover changed integration wiring without
introducing new HTTP behavior. Report unavailable runtime execution explicitly. No live Paddle account is required.

## Idempotence and Recovery

Aliases do not create credit accounts, reservations, or additional service instances. Apply and revert contracts,
exports, and consumers together; no data migration or reset is needed. Rerun unit checks after partial edits.
The dedicated PostgreSQL runner uses its own disposable database; follow its documented fixture cleanup rather
than resetting application data. Preserve the Bruno launchers' balance restoration and context shutdown behavior.

## Artifacts and Notes

Inspection on 2026-09-17 identified all named consumers and existing casts. Implementation and runtime evidence are
not yet collected. This plan's wider file set is one public-boundary migration with all existing callers updated;
it introduces no replacement persistence, credit policy, or extra execution phase. Follow root `AGENTS.md` for
synced issue assignment/status at implementation start and PR assignee/closing-keyword requirements at delivery.

## Plan readiness

Ready to implement
