# Claw Back Refunded Credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Stop refunds and chargebacks from becoming free credits without double-debiting when Paddle later reverses an
adjustment. After this change, an approved debit-causing adjustment removes no more than the credits attributable to
that purchase, an inverse adjustment restores only the credits previously removed, and every applied amount or
shortfall is durably recoverable. A developer can observe it by refunding a sandbox transaction, replaying the event,
and then exercising an inverse adjustment without any duplicate balance movement.

## Progress

- [x] (2026-08-29) Settle the insufficient-balance policy: clamp the debit to the available balance, record the
  shortfall, and never make the credit balance negative.
- [ ] (2026-08-28) Normalize Paddle debit, restore, and ignored adjustment actions into explicit provider-event variants.
- [ ] (2026-08-28) Add a durable adjustment state machine that serializes purchase accounting and converges after partial failure.
- [ ] (2026-08-28) Add full, partial, inverse, insufficient-balance, replay, and concurrent-adjustment coverage.
- [ ] (2026-08-28) Run typecheck, lint, Jest, Bruno, and sandbox refund and inverse-adjustment passes.

## Plan dependencies

- `payments/04`
- `payments/05`
- `payments/07`
- `payments/08`

## Surprises & Discoveries

- Paddle distinguishes debit-causing `refund`, `credit`, and `chargeback` actions from `chargeback_warning` and
  inverse actions such as `chargeback_reverse`, `chargeback_warning_reverse`, and `credit_reverse`. Treating every
  action whose name contains "reverse" as a debit would move the customer's balance in the wrong direction.
- `PaymentEventHandler`, `PaymentPurchaseStore`, and `CreditsService` currently perform purchase-state and credit
  changes through separate transactions. An idempotent credit-ledger reference prevents duplicate application of one
  event, but it does not serialize two distinct partial adjustments or make purchase adjustment state converge after
  a failure between those transactions.
- Plan `payments/08` changed paid and failed event correlation to `PurchaseCorrelation` and added the
  purchase-ID/reference conflict contract. This plan must extend the current contract rather than restoring the
  provider-reference-only lookup from plan 04.

## Decision Log

- Decision: Reversal is a debit through `CreditsService.debit`, not a status change on the purchase.
  Rationale: `debit` already locks the account row and uses the idempotency ledger, and the balance must move by the same mechanism spending uses. The purchase status records what happened to the sale; the ledger records what happened to the balance.
  Date/Author: 2026-08-17, project planning.
- Decision: The debit reference is derived from the provider adjustment id, not the purchase id.
  Rationale: One purchase can be refunded in several partial adjustments, so keying on the purchase id would silently drop every reversal after the first. The adjustment id makes each reversal distinct and each redelivery idempotent.
  Date/Author: 2026-08-17, project planning.
- Decision: Only approved reversals move the balance.
  Rationale: Paddle creates most refunds in live accounts as `pending_approval` and can later reject them. Clawing back on creation would remove credits for refunds that never happen, so the handler acts on the approved state and ignores pending and rejected ones.
  Date/Author: 2026-08-17, project planning.
- Decision: Approved `refund`, `credit`, and `chargeback` actions request a debit; `chargeback_warning` and the related reverse action
  do not move credits; `chargeback_reverse` and `credit_reverse` request restoration of the corresponding amount.
  Rationale: Paddle uses inverse actions when money previously removed is returned. Mapping an inverse action to the
  debit path would claw back twice, while moving credits for a warning would act before a financial loss exists.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Persist one purchase-adjustment record per provider adjustment before changing the credit account.
  Rationale: The record is the durable state machine for requested, applied, restored, and shortfall credits. Its
  unique provider adjustment ID makes replay convergent even when a process fails between purchase and credit work.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Serialize adjustment claims on the `CreditPurchase` row and calculate the permitted movement from stored
  purchase and adjustment records under that lock.
  Rationale: The credit-account lock serializes account balance changes but cannot stop two distinct partial events
  from calculating against stale purchase totals. The purchase lock ensures cumulative debits never exceed the
  granted credits and cumulative restores never exceed credits actually removed.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: An inverse adjustment clears recorded shortfall before restoring credits that were actually debited.
  Rationale: Credits that could not be removed never left the account. Restoring them would create value rather than
  undoing the earlier adjustment.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: When an approved debit-causing adjustment exceeds the available credit balance, debit only the available
  credits, leave the balance at zero, and persist the unapplied amount as a shortfall. Never make a credit balance
  negative.
  Rationale: Spendable credits and an adjustment shortfall are different domain concepts. Keeping them separate
  preserves the existing invariant that balances cannot be negative, records the full financial effect for later
  collections or suspension policy, and lets an inverse adjustment clear the recorded shortfall before restoring
  only credits that were actually debited.
  Date/Author: 2026-08-29, project owner.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 04 grants credits on `purchase_paid` and originally mapped everything else to `ignored`. The adapter from plan 05 still
maps adjustment events to `ignored`, leaving them for this plan. Plan 07 provides the reusable Paddle sandbox checkout,
managed webhook destination, secret mounts, and recorded purchase flow that this plan extends. Plan 08 made event
correlation safe when completion arrives before checkout creation stores the provider reference.

Paddle delivers refunds, credits, and chargebacks as `adjustment.created` with an `action` of `refund`, `credit`, `chargeback`, or one of the reversal variants, and a `status` of `pending_approval`, `approved`, `rejected`, or `reversed`. An adjustment references its transaction, and amounts may be partial. `adjustment.updated` carries later status changes, so an approval that follows a `pending_approval` creation arrives on that event.

`OrganizationCreditAccount` carries the check constraint `balance >= 0`, so a debit larger than the balance throws at
the database level. `CreditsService.debit` already raises `InsufficientCreditsException` before reaching that point
when the balance is too small. `CreditGuard` maps that exception to `402` for verification requests. The current debit
method returns no applied amount, and a duplicate reference returns without telling the caller what an earlier attempt
recorded, so the durable adjustment workflow needs a narrow idempotent credit-operation result.

## Scope and Non-Goals

Handle provider adjustments for a completed credit purchase, including debit-causing and inverse actions. Do not issue
refunds from this application, add a refund request endpoint, act on chargeback warnings, suspend organizations,
pursue collections, or send customer notifications. Do not change initial successful-purchase grants or accept
unverified adjustment input.

## Plan of Work

Apply the settled clamp-and-record policy throughout the credit operation, adjustment state, tests, and runtime
validation.

Extend `PaymentEvent` with explicit debit and restore adjustment variants. Each carries `providerEventId`,
`providerReference`, provider adjustment ID, amount in minor units, and currency. In the Paddle adapter, map only
approved debit-causing actions to the debit variant, inverse actions to the restore variant, and warnings plus pending
or rejected adjustments to `ignored`. Treat an original adjustment whose status later becomes `reversed` consistently
with its separately delivered inverse adjustment so the same financial reversal cannot restore twice. Extend the stub
adapter and shared provider contract with the same semantics.

Add a payments-owned `CreditPurchaseAdjustment` entity and a narrow store port. Claiming an adjustment locks the
purchase, validates provider reference and currency, calculates credits from the stored purchase amount, and inserts
or returns the provider-adjustment record. Store requested credits, applied debit, restored credits, shortfall, and a
small processing state. Debit calculations round in the customer's favor and cap cumulative debit at granted credits;
restore calculations first reduce shortfall and then cap re-crediting at credits previously debited.

Make the credit-side operation idempotently return the amount applied for its adjustment reference, including on
replay. `PaymentEventHandler` claims the adjustment, applies the credit operation, then records completion. A failure
after claim or credit application remains retryable: replay returns the same claim, the credit ledger returns the same
applied amount, and completion converges without recalculation. Keep purchase persistence and credit policy behind
their existing module boundaries rather than letting a repository write another module's tables directly.

Extend the Bruno collection with debit, replay, restore, and restore-replay cases. Add a sandbox refund followed by an
available inverse adjustment when Paddle's sandbox supports producing one; when it does not, record the provider
limitation and retain signed Paddle fixture coverage plus the real-PostgreSQL proof.

## Interfaces and Dependencies

New internal payment-event variants for debit and restore adjustments. New payments-owned
`CreditPurchaseAdjustment` persistence and a purpose-specific adjustment store port. The credit module gains a narrow
idempotent operation that reports the amount applied under the clamp-and-record policy. No endpoint or
configuration changes. Development schema changes use TypeORM synchronization against disposable data; no migration
or backfill is added. Depends on plans 04, 05, 07, and 08.

## Acceptance Criteria

- An approved full reversal removes exactly the credits that purchase granted.
- An approved partial reversal removes the proportional share, rounded in the customer's favor.
- Two partial reversals never remove more credits than the purchase granted.
- Replaying a reversal event leaves the balance unchanged and returns `200`.
- A `pending_approval` or `rejected` adjustment changes nothing.
- An approved chargeback debits credits on the same path as a refund.
- A chargeback warning and warning reversal change no balance or shortfall state.
- A `chargeback_reverse` or `credit_reverse` clears the attributable shortfall first, restores no more than credits
  actually debited, and is idempotent on replay.
- A later `reversed` update for the original adjustment cannot restore the same movement a second time.
- An approved debit-causing adjustment larger than the available balance debits only the available credits, leaves
  the balance at zero, and records the exact unapplied amount as a shortfall.
- An organization with an outstanding shortfall still receives a clear `402` rather than a `500` on its next
  verification request.
- A reversal for an unknown `providerReference` returns `200` and changes nothing.
- Two distinct partial adjustments delivered concurrently cannot cumulatively debit more than the purchase granted.
- A failure after adjustment claim, credit-ledger application, or adjustment completion converges on replay without a
  duplicate balance movement or lost shortfall.

## Validation

Add adapter and shared-contract tests for every supported Paddle action/status combination, including warnings,
inverse actions, and an original adjustment becoming `reversed`. Add handler/store tests for full, partial,
repeated-partial, replayed, inverse, insufficient-balance, unknown-reference, currency-mismatch, and each recovery
boundary.

Against a real PostgreSQL database, deliver two distinct partial adjustments concurrently and prove their cumulative
debit is capped. Repeat debit and restore events concurrently and prove one ledger effect per adjustment. Inject
failures after claim and after credit application, prove replay converges, and prove the settled shortfall behavior
never violates the account constraint.

Run `corepack pnpm typecheck`, `corepack pnpm lint`, the focused payment and credit suites, the full Jest suite,
`corepack pnpm build`, and `git diff --check`. Run `bru run --env local` for `bruno/credit-purchases`. Finish with the
plan 07 sandbox purchase, approved refund, replay, and inverse-adjustment scenario available in Paddle sandbox. Record
any provider limitation without claiming that a path that did not run is green.

## Idempotence and Recovery

The unique provider adjustment record plus credit-ledger reference makes redelivery and partial-process failure
convergent. A claimed but incomplete record is safe to resume, and an applied credit operation returns its original
result on replay so completion can be recorded. A missed adjustment is recoverable by replaying the provider event.
Manual balance correction remains a last resort through `PUT /credits/:organizationId` after inspecting adjustment
and ledger state. Reset disposable development data with `pnpm dev:reset -- --confirm-project=LEF`; no migration
rollback exists.

## Artifacts and Notes

Record a redacted action/status mapping table, concurrent PostgreSQL results, injected-failure recovery results, and
sandbox adjustment ID suffixes. Never commit raw webhook payloads, customer data, full transaction identifiers, or
provider credentials. Official Paddle references:

- <https://developer.paddle.com/webhooks/adjustments/adjustment-updated/>
- <https://developer.paddle.com/build/transactions/create-transaction-adjustments/>

## Plan readiness

Ready to implement.
