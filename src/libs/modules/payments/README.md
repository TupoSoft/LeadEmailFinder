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
interface, and `PaymentsModule`. The controllers, services, entities, provider ports, and adapters (stub and
Paddle) are internal.

## Architecture

Layered per `module-architecture/09`. `api/http/` holds the controllers and DTOs — the only layer that may import
Nest/`class-validator`/`class-transformer`/Express. `application/` holds `CreditPurchaseService`,
`CreditPackCatalog`, `PaymentEventHandler`, `PaymentAdjustmentHandler`, and their ports under
`application/ports/`; all are framework-free, constructed through explicit factories in `payments.module.ts`.
`domain/` holds purchase/adjustment status and direction vocabulary, the `PaymentEvent` union, the pure
proportional-debit/shortfall calculation in `payment-adjustment-accounting.ts`, and `payment-configuration.ts`.
`infrastructure/` holds the TypeORM entities under `persistence/typeorm/`, their store adapters, the stub and
Paddle providers, and a small `PaymentEventLogger` adapter wrapping the real `Logger` so `PaymentEventHandler`
never imports `@nestjs/common`.

`CreditPurchaseService` and the two event handlers depend only on `PaymentPurchaseStore`, `PaymentAdjustmentStore`,
`PaymentProvider`, and `PaymentEventLogger` — never a TypeORM repository or `ConfigService` directly. Unlike the
session-shaped identity ports used by `organization-onboarding`, no provider call here ever happens
mid-transaction: Paddle/stub calls (`createCheckout`, `parseEvent`) always run fully before or after a
`dataSource.transaction()`, so the stores use the plain `dataSource.transaction()` sugar throughout.

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

Owns two entities under `infrastructure/persistence/typeorm/`:

- `CreditPurchase` → `credit_purchases`, indexed on `organizationId`. Its nullable internal `providerTotalMinor` is
  filled by a verified paid event with the settled gross amount used as the adjustment denominator, while
  `creditsGrantedAt` fences adjustment handling from the gap between recording a paid purchase and committing its
  credit grant. Reachable through `PaymentPurchaseStore`, whose `PurchaseRecord` results use a plain domain
  `PurchaseStatus` string union rather than the entity's TypeORM-decorated status enum.
- `CreditPurchaseAdjustment` → `credit_purchase_adjustments`, keyed by the provider adjustment ID and indexed on the
  purchase ID. It stores the provider's gross amount, whether the provider marked the adjustment full, requested
  movement, applied debit or restore, original and outstanding shortfall, and processing state. Reachable through
  `PaymentAdjustmentStore`.

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

Focused tests live in `src/`: `api/http/credit-purchase.controller.spec.ts`,
`api/http/payment-webhook.controller.spec.ts`, `application/credit-purchase.service.spec.ts`,
`application/credit-pack-catalog.spec.ts`, `application/payment-event.handler.spec.ts`,
`application/payment-adjustment.handler.spec.ts`, `domain/payment-adjustment-accounting.spec.ts`,
`infrastructure/persistence/typeorm/credit-purchase.entity.spec.ts` and
`credit-purchase-adjustment.entity.spec.ts`, the provider specs under `infrastructure/` (the Paddle adapter matrix
covers every supported action, status, and adjustment webhook type), the TypeORM store specs under
`infrastructure/persistence/`, and `payments.module.spec.ts` (factory-provider wiring). The gated
`application/payment-event.handler.integration.spec.ts` exercises locking, replay, shortfall, inverse ordering,
and injected recovery boundaries against real PostgreSQL.

[`bruno/credit-purchases`](../../../../bruno/credit-purchases/README.md) exercises the checkout flow, purchase
listing, signed webhook crediting, debit adjustment, replay, inverse restoration, and inverse replay end to end
against the local stub provider, including a tampered-signature rejection. It also links to the manual Paddle
sandbox purchase and refund procedure.
