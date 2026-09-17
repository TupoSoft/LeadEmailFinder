# Preserve Paid Purchases During Checkout Races

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An early payment webhook must remain authoritative when checkout reference binding or checkout error handling
runs later. After this change, neither write can change a paid purchase to pending or failed, and
an established provider reference cannot be replaced. This is one independently useful bug-fix pull request.

## Progress

- [ ] (2026-09-17) Make checkout binding and failure transitions atomic and monotonic.
- [ ] (2026-09-17) Add concurrency regressions and update the module contract.
- [ ] (2026-09-17) Run focused, PostgreSQL, HTTP workflow, and architecture validation.

## Plan dependencies

- `payments/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Guard both checkout writes under the same purchase-row lock used for webhook correlation; modify only
  the intended columns. Rationale: locking only the webhook path cannot prevent a stale checkout entity from
  overwriting its result. Date: 2026-09-17. Author: Codex.
- Decision: Keep the current HTTP response shape and provider port. Rationale: this PR fixes an existing race before
  the durable workflow is activated. Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/payments/src/application/credit-purchase.service.ts` creates a purchase, calls the provider,
validates its URL, and invokes `bindProviderReference`. Its catch block invokes `markFailed`.
`src/libs/modules/payments/src/infrastructure/persistence/typeorm-payment-purchase.store.ts` currently implements
both methods with an unlocked read followed by a full entity save. `markFailed` unconditionally changes status.
By contrast, `recordPaid` and `recordFailed` lock rows, and the latter only changes pending purchases.
`payments/08` added early-webhook correlation by purchase ID but did not make these checkout writes safe.

Before implementation, read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and the payments README.
The store is an infrastructure adapter; the application depends on its internal port. Credit operations remain in
`CreditsService`, imported through the credits module's public barrel.

## Scope and Non-Goals

Change only purchase binding and failure transitions, their tests, and the payments README. Preserve signed-event
correlation and totals validation. Do not introduce jobs, idempotency headers, polling, reconciliation, schema
changes, new public exports, or direct ledger writes. This PR unlocks `checkout-recovery/03`.

## Plan of Work

In `typeorm-payment-purchase.store.ts`, implement both methods with `dataSource.transaction` and a pessimistic
purchase-row lock. For binding, require a null or equal provider reference. A different reference raises the
existing `PurchaseReferenceConflictError`; binding never changes status or grant markers. Use a targeted column
update and return a record reflecting current persisted state. For failure, change only `pending` to `failed`;
leave `paid`, `failed`, and `expired` unchanged. Repeated equal binding and repeated failure are no-ops.

Keep the public `PaymentPurchaseStore` signatures if possible. Adjust the service error path only as needed to
preserve a confirmed paid outcome: after provider or local persistence errors, the guarded failure write must not
regress payment. Do not classify every provider exception as proof of no remote transaction; that larger change
belongs to plan 03. Document this remaining limitation explicitly.

Add focused store tests for equal/conflicting references and every status. Extend
`application/payment-event.handler.integration.spec.ts` to exercise the actual checkout store methods against real
PostgreSQL with controlled barriers: bind reads while a paid webhook commits, failure after paid, and both lock
orders. Assert status, reference, settled total, grant marker, and exactly one credit grant. Extend the existing
credit-purchase Bruno history/replay assertions to preserve paid state after a later signed failed event; use the
PostgreSQL test for the checkout-specific interleaving, not timing sleeps in Bruno.

## Interfaces and Dependencies

Keep `POST /v1/credit-purchases`, purchase history, and the webhook endpoint unchanged. Use existing
`PurchaseReferenceConflictError` for a conflicting binding. Do not change the module barrel. Proposed PR title:
`fix(payments): preserve paid purchases during checkout races`.

## Acceptance Criteria

- Binding after a paid webhook preserves `paid`, the settled total, and `creditsGrantedAt`.
- A checkout failure after payment confirmation cannot change status or revoke credits.
- Equal-reference replay succeeds; conflicting binding fails without modifying either reference or status.
- Pending checkout failures still become failed, and existing failed or expired rows remain unchanged.
- Controlled concurrent executions in both lock orders retain one provider binding and one credit grant.
- Existing catalog, redirect rejection, authentication, and webhook response contracts remain unchanged.

## Validation

Run from the repository root after implementation:

```sh
corepack pnpm test -- src/libs/modules/payments/src/infrastructure/persistence/typeorm-payment-purchase.store.spec.ts src/libs/modules/payments/src/application/credit-purchase.service.spec.ts src/libs/modules/payments/src/application/payment-event.handler.spec.ts --runInBand
corepack pnpm test:credits-postgres
corepack pnpm bruno:credit-purchases
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/payments/README.md .agents/plans/checkout-recovery/01-preserve-paid-purchases.md
git diff --check
```

The PostgreSQL command already includes the payment-event integration suite. Its barriers must exercise actual
checkout methods, not only two webhook calls. Bruno uses the checkout-owned local stub stack through its launcher;
if unavailable, report static checks and leave runtime execution unverified. Do not claim a pod-crash test here.

## Idempotence and Recovery

This PR changes no schema or developer fixture. Equal binding and terminal failure writes are repeatable. A failed
local test can be rerun against the disposable PostgreSQL runner without resetting application data. Do not run the
full development reset for this store-only change. During later implementation, start the synced issue according
to root `AGENTS.md`; this planning task does not modify issue assignment or status.

## Artifacts and Notes

Source inspection at `1f7b3c6` identified the two unlocked methods. Earlier focused payment tests passed, but they
are not evidence for the new concurrency acceptance criteria. Record new commands and results during implementation.

## Plan readiness

Ready to implement.
