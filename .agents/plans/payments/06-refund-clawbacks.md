# Claw back refunded credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Stop refunds from being free credits. After this change, an approved Paddle refund or a chargeback removes the credits it paid for, and the outcome is recorded even when the customer has already spent them. A developer can observe it by refunding a sandbox transaction and watching the balance fall.

## Progress

- [ ] Decide the clawback policy for a balance that cannot absorb the reversal.
- [ ] Add the `purchase_reversed` event kind and map Paddle adjustments onto it.
- [ ] Add reversal handling with an idempotent debit and a recorded shortfall.
- [ ] Add coverage for full, partial, insufficient-balance, and replayed reversals.
- [ ] Run typecheck, lint, jest, Bruno, and a sandbox refund pass.

## Plan dependencies

- `payments/04`
- `payments/05`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reversal is a debit through `CreditsService.debit`, not a status change on the purchase.
  Rationale: `debit` already holds the row lock and the idempotency ledger, and the balance must move by the same mechanism spending uses. The purchase status records what happened to the sale; the ledger records what happened to the balance.
  Date/Author: 2026-08-17, project planning.
- Decision: The debit reference is derived from the provider adjustment id, not the purchase id.
  Rationale: One purchase can be refunded in several partial adjustments, so keying on the purchase id would silently drop every reversal after the first. The adjustment id makes each reversal distinct and each redelivery idempotent.
  Date/Author: 2026-08-17, project planning.
- Decision: Only approved reversals move the balance.
  Rationale: Paddle creates most live refunds as `pending_approval` and can later reject them. Clawing back on creation would remove credits for refunds that never happen, so the handler acts on the approved state and ignores pending and rejected ones.
  Date/Author: 2026-08-17, project planning.
- Decision: Chargebacks are treated as reversals on the same path as refunds.
  Rationale: The money is gone in both cases, and Paddle delivers both as `adjustment.created` with different `action` values. Reversal-specific policy differences, if any emerge, belong in a later plan.
  Date/Author: 2026-08-17, project planning.
- Decision (open): what happens when the balance is smaller than the reversal.
  Options: clamp the debit to the available balance and record the shortfall, or drop the `balance >= 0` check constraint and let the balance go negative.
  Recommendation: clamp and record. Negative balances complicate every read path and every guard in the verification flow, and the shortfall record preserves the information a later collections or suspension decision would need.
  This decision must be settled before implementation begins; it changes the schema, the acceptance criteria, and `CreditGuard`'s behavior for an affected organization.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 04 grants credits on `purchase_paid` and maps everything else to `ignored`. Plan 05's adapter explicitly maps `adjustment.created` to `ignored`, leaving that event free for this plan to claim.

Paddle delivers refunds, credits, and chargebacks as `adjustment.created` with an `action` of `refund`, `credit`, `chargeback`, or one of the reversal variants, and a `status` of `pending_approval`, `approved`, `rejected`, or `reversed`. An adjustment references its transaction, and amounts may be partial. `adjustment.updated` carries later status changes, so an approval that follows a `pending_approval` creation arrives on that event.

`OrganizationCreditAccount` carries the check constraint `balance >= 0`, so a debit larger than the balance throws at the database level. `CreditsService.debit` already raises `InsufficientCreditsException` before reaching that point when the balance is too small. `CreditGuard` maps that exception to `402` for verification requests.

## Scope and Non-Goals

Handle reversal of a completed credit purchase. Do not issue refunds from this application, add a refund request endpoint, suspend organizations, pursue collections, or send customer notifications. Do not change how successful purchases are granted.

## Plan of Work

Settle the open policy decision first and record it in the Decision Log with its rationale and date.

Add `purchase_reversed` to the `PaymentEvent` union, carrying `providerEventId`, `providerReference`, an adjustment identifier, and the reversed amount in minor units. In the Paddle adapter, map `adjustment.created` and `adjustment.updated` with an approved status and a reversing action onto it, and keep pending and rejected adjustments as `ignored`. The stub adapter gains the same event kind so the flow is testable without Paddle.

In `PaymentEventHandler`, resolve the purchase by `providerReference` and compute the credits to reverse from the stored purchase, proportionally for a partial amount, rounding in the customer's favor. Acknowledge an unknown reference as plan 04 does. Call `CreditsService.debit` with a reference derived from the adjustment id, apply the settled shortfall policy when the balance cannot absorb it, and record the purchase's reversed credits so a second partial reversal cannot exceed what was granted.

Extend the Bruno collection with a stub reversal case asserting the balance falls, and a replay asserting it falls once.

## Interfaces and Dependencies

New event kind `purchase_reversed` on the port. Schema additions to `CreditPurchase` for reversed credits, plus whatever the settled policy requires to record a shortfall. No new endpoint and no new configuration. Depends on plans 04 and 05.

## Acceptance Criteria

- An approved full reversal removes exactly the credits that purchase granted.
- An approved partial reversal removes the proportional share, rounded in the customer's favor.
- Two partial reversals never remove more credits than the purchase granted.
- Replaying a reversal event leaves the balance unchanged and returns `200`.
- A `pending_approval` or `rejected` adjustment changes nothing.
- A chargeback reverses on the same path as a refund.
- A reversal larger than the available balance behaves exactly as the settled policy states and is recorded.
- An organization with an unabsorbed shortfall still receives a clear `402` rather than a `500` on its next verification request.
- A reversal for an unknown `providerReference` returns `200` and changes nothing.

## Validation

Add handler unit tests for full, partial, repeated-partial, replayed, pending, rejected, and insufficient-balance reversals, and adapter tests for each Paddle adjustment mapping. Add an integration test against a real PostgreSQL database proving a reversal against a spent balance behaves as the policy states and never violates the check constraint. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Run `bru run --env local` for `bruno/credit-purchases`. Finish with a manual sandbox pass: buy a pack, refund it in the Paddle sandbox dashboard, and confirm the balance falls once.

## Idempotence and Recovery

The debit ledger keyed by adjustment id makes redelivery safe. A missed reversal is recoverable by replaying the event from the Paddle dashboard, or by an admin correction through `PUT /credits/:organizationId`. Reset by dropping and re-synchronizing the development database.

## Artifacts and Notes

Record redacted adjustment payloads for each mapped action and status. Never commit live customer or transaction data.

## Plan readiness

Ready after the insufficient-balance clawback policy decision recorded in the Decision Log.
