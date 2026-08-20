# Correlate early payment webhooks to pending purchases

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A provider completion event that arrives before checkout creation saves `providerReference` must still settle the
correct pending purchase and grant credits exactly once. After this change, the signed event's application-generated
purchase ID provides a safe fallback correlation key, the provider reference is bound atomically, and a conflicting
event is rejected for retry/investigation rather than acknowledged as an unknown purchase.

## Progress

- [ ] (2026-08-20) Carry verified purchase correlation through the provider event contract.
- [ ] (2026-08-20) Atomically resolve and bind pending purchases by purchase ID or provider reference.
- [ ] (2026-08-20) Add early-delivery, conflict, replay, Paddle, stub, PostgreSQL, and Bruno coverage.
- [ ] (2026-08-20) Run focused, full, and runtime validation and record the outcome.

## Plan dependencies

- `payments/03`
- `payments/04`
- `payments/05`

## Surprises & Discoveries

- Checkout sends `purchaseId` in Paddle `customData`, but `PaddlePaymentProvider.parseEvent()` discards it and emits
  only the provider transaction ID.
- `CreditPurchaseService.start()` saves the provider reference only after `transactions.create()` returns.
- Unknown references are intentionally acknowledged with `200`; therefore an event delivered inside that window is
  not retried and the paid purchase can remain pending forever.

## Decision Log

- Decision: Add the application purchase ID from verified provider custom data as an optional correlation value on
  paid/failed `PaymentEvent` variants.
  Rationale: The application generated and sent this UUID when creating the checkout; signature verification makes
  the returned custom data trustworthy, while stored purchase data remains authoritative for credits and ownership.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Resolve by provider reference first, then by purchase ID only when the stored reference is null; bind the
  received provider reference under the same pessimistic transaction lock.
  Rationale: This closes the early-delivery window without allowing one event to rebind an established purchase.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: A purchase-ID/reference conflict is an unexpected processing error and returns `500`, while genuinely
  unknown events retain `200` acknowledgement.
  Rationale: Silent acknowledgement could lose money; provider retry plus structured logging preserves recovery.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`CreditPurchaseService.start()` persists a pending `CreditPurchase`, calls `PaymentProvider.createCheckout`, then
saves `checkout.providerReference`. Both stub and Paddle adapters receive the local purchase ID. Paddle includes it
in transaction `customData`. `PaymentWebhookController` verifies/parses the raw event and calls
`PaymentEventHandler`; `TypeOrmPaymentPurchaseStore` currently locks and resolves only by `providerReference`.
Credits are idempotent by local purchase ID.

## Scope and Non-Goals

Close only the create-checkout/early-webhook correlation race. Preserve hosted checkout, stored pack values,
signature verification, idempotent credit grants, unknown-environment event acknowledgement, monotonic paid status,
and public endpoint shape. Do not add polling, reconciliation jobs, refunds, migrations, or trust event-supplied
organization/credit values.

## Plan of Work

Extend `PaymentEvent` paid/failed variants with optional `purchaseId`. Make Paddle parsing validate that
`event.data.customData.purchaseId`, when present, is a UUID/string in the expected shape and carry it without using
event-provided organization or credit amounts. Extend the stub signed-event format compatibly so contract and Bruno
tests can exercise the same path; events without purchase ID retain provider-reference lookup.

Change the `PaymentPurchaseStore` methods to accept a narrow correlation object. In one transaction, lock by
provider reference; if absent and a purchase ID is present, lock that purchase by ID, require a null-or-equal
reference, bind the received reference if null, then apply the existing status transition. Return
a distinct conflict/error for mismatched established references so the controller surfaces `500`. Preserve `null`
for a truly unknown purchase so shared-provider-account events still receive `200`.

Add unit tests for provider parsing, handler correlation, unknown/conflict behavior, and legacy events. Extend the
PostgreSQL integration test with a pending purchase whose reference is null, deliver concurrent signed paid events,
and assert one reference, paid status, one grant, and the stored organization/credit values. Update the
credit-purchases Bruno payloads to carry `purchaseId` and retain replay/tamper assertions.

## Interfaces and Dependencies

Change internal `PaymentEvent` and `PaymentPurchaseStore` contracts only. `POST /v1/payments/webhook` retains its
status schema: `200` for valid handled/duplicate/unknown events, `400` for unverifiable signatures, and `500` for
unexpected correlation conflicts. No database column or library is added.

## Acceptance Criteria

- A verified paid event with the local purchase ID settles a pending purchase whose provider reference is still
  null, binds the event's reference, and grants the stored credits once.
- Concurrent/replayed delivery produces one provider binding, one paid purchase, and one credit-grant row.
- An event cannot replace a different non-null provider reference on a purchase and the conflict is not acknowledged
  as success.
- A truly unknown event still returns `200` and changes nothing.
- Events without purchase ID continue to resolve by provider reference.
- Amount, organization, and credits are always read from the stored purchase, never custom data.
- Failed events remain unable to regress a paid purchase.

## Validation

Run payment-provider contract tests, Paddle and stub adapter specs, handler/controller/store specs, and the real
PostgreSQL payment-event integration spec. Run `corepack pnpm typecheck`, `corepack pnpm lint`, the full Jest suite
with `/tmp` temporary paths, and `git diff --check`. Run `bru run --env local` for `bruno/credit-purchases` against
the stub stack. Live Paddle delivery timing remains part of `payments/07`, not proof claimed by this plan.

## Idempotence and Recovery

The pessimistic purchase lock and unique provider-reference constraint make fallback binding convergent. Credit
replay remains idempotent by purchase ID. A correlation conflict returns `500` for provider retry and emits only
redacted identifiers; operators can inspect the stored purchase before replaying. Disposable recovery uses
`pnpm dev:reset -- --confirm-project=LEF` and no migration.

## Artifacts and Notes

Record synthetic purchase/reference/event IDs, transition outcomes, and grant counts. Never record real webhook
bodies, signatures, secrets, or customer data.

## Plan readiness

Ready to implement.
