# Payments

Sells credit packs through a checkout flow and ingests the resulting payment-provider webhooks. It grants purchased
credits idempotently when payment is confirmed, claws back credits for approved refunds and chargebacks, and restores
only credits previously removed when Paddle sends an approved inverse adjustment.

## Responsibility

- Creating a credit-pack purchase and returning the provider's checkout URL, and listing an organization's past
  purchases.
- Verifying and processing signed payment-provider webhooks for purchases, failures, and payment adjustments.
- Idempotent credit granting on a confirmed payment and durable, replay-safe debit or restore orchestration for
  approved adjustments.
- Provider abstraction over a stub adapter for deterministic local development and testing, and a real Paddle
  adapter.

## Non-Responsibilities

- No credit ledger persistence or account mutation logic (owned by [`credits`](../credits/README.md)); payments calls
  purpose-specific credit operations after calculating and persisting the permitted adjustment movement.
- No card/bank detail handling — that is delegated entirely to the configured provider.

## Public API

[`src/index.ts`](src/index.ts) exports `PaymentsProviderName`, `PaddleEnvironmentName`, the `PaymentConfiguration`
interface, and `PaymentsModule`. The controllers, services, entity, provider ports, and adapters (stub and
Paddle) are internal.

## Dependencies

- [`credits`](../credits/README.md) — `CreditsService`, to grant credits on paid events, debit approved adjustments,
  and restore an adjustment's applied debit once.
- [`identity`](../identity/README.md) — the `AuthPrincipal` type.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `CurrentPrincipal`,
  `RequirePermissions`, `Public`.
- `@paddle/paddle-node-sdk` (external) — used only by the Paddle adapter.

## HTTP Surface

`CreditPurchaseController` at `v1/credit-purchases`:

| Method | Path                  | Access           |
| ------ | --------------------- | ---------------- |
| `POST` | `v1/credit-purchases` | `billing:manage` |
| `GET`  | `v1/credit-purchases` | `billing:read`   |

`PaymentWebhookController` at `v1/payments`:

| Method | Path                  | Access                                                             |
| ------ | --------------------- | ------------------------------------------------------------------ |
| `POST` | `v1/payments/webhook` | Public — authenticated instead by the provider's request signature |

## Persistence

Owns two entities:

- `CreditPurchase` → `credit_purchases`, indexed on `organizationId`. Its nullable internal `providerTotalMinor` is
  filled by a verified paid event with the settled gross amount used as the adjustment denominator, while
  `creditsGrantedAt` fences adjustment handling from the gap between recording a paid purchase and committing its
  credit grant.
- `CreditPurchaseAdjustment` → `credit_purchase_adjustments`, keyed by the provider adjustment ID and indexed on the
  purchase ID. It stores the provider's gross amount, whether the provider marked the adjustment full, requested
  movement, applied debit or restore, original and outstanding shortfall, and processing state.

Adjustment claims lock the purchase row before cumulative proportional gross accounting. This serializes distinct
partial events, rounds debit targets in the customer's favor, normalizes a full adjustment to the provider total,
caps debits at the purchase grant, and makes replay and partial-process recovery converge through namespaced ledger
references.

## Configuration

- `PAYMENTS_PROVIDER` — selects `stub` or `paddle`
- `PAYMENTS_CREDIT_PACKS` — JSON catalog of purchasable packs
- `PAYMENTS_CHECKOUT_URL` — canonical payment-link page URL used to create provider checkouts
- `PAYMENTS_CHECKOUT_RETURN_URL` — deprecated alias accepted only when the canonical value is absent or identical
- `PAYMENTS_STUB_WEBHOOK_SECRET` (required only when `PAYMENTS_PROVIDER=stub`)
- `PADDLE_API_KEY` (required only when `PAYMENTS_PROVIDER=paddle`)
- `PADDLE_WEBHOOK_SECRET` (required only when `PAYMENTS_PROVIDER=paddle`)
- `PADDLE_ENVIRONMENT` (required only when `PAYMENTS_PROVIDER=paddle`; must be `sandbox`)

The reusable Paddle sandbox checkout, tunnel, and notification-replay workflow is documented in
[`docker/paddle-dev/README.md`](../../../../docker/paddle-dev/README.md).

## Validation

Focused tests live in `src/`: the purchase controller, service, entity, event-handler, webhook-controller, and module
specs; `credit-purchase-adjustment.entity.spec.ts`; `payment-adjustment-accounting.spec.ts`;
`payment-adjustment.handler.spec.ts`; and the provider and TypeORM adapter specs under `infrastructure/`. The Paddle
adapter matrix covers every supported action, status, and adjustment webhook type. The gated
`payment-event.handler.integration.spec.ts` exercises locking, replay, shortfall, inverse ordering, and injected
recovery boundaries against real PostgreSQL.

[`bruno/credit-purchases`](../../../../bruno/credit-purchases/README.md) exercises the checkout flow, purchase
listing, signed webhook crediting, debit adjustment, replay, inverse restoration, and inverse replay end to end
against the local stub provider, including a tampered-signature rejection. It also links to the manual Paddle
sandbox purchase and refund procedure.
