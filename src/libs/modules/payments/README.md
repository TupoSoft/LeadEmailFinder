# Payments

Sells credit packs through a checkout flow and ingests the resulting payment-provider webhooks, granting the
purchased credits idempotently once a payment is confirmed.

## Responsibility

- Creating a credit-pack purchase and returning the provider's checkout URL, and listing an organization's past
  purchases.
- Verifying and processing signed payment-provider webhooks (`purchase_paid`, and provider-specific failure/
  cancellation events).
- Idempotent credit granting on a confirmed payment, and provider abstraction over a stub adapter (for
  deterministic local/dev/test use) and a real Paddle adapter.

## Non-Responsibilities

- No credit ledger persistence or debit logic (owned by [`credits`](../credits/README.md)); payments only calls
  `CreditsService` to grant on a paid event.
- No card/bank detail handling — that is delegated entirely to the configured provider.

## Public API

[`src/index.ts`](src/index.ts) exports `PaymentsProviderName`, `PaddleEnvironmentName`, the `PaymentConfiguration`
interface, and `PaymentsModule`. The controllers, services, entity, provider ports, and adapters (stub and
Paddle) are internal.

## Dependencies

- [`credits`](../credits/README.md) — `CreditsService`, to grant credits on a paid event.
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

Owns one entity: `CreditPurchase` → `credit_purchases`, indexed on `organizationId`.

## Configuration

- `PAYMENTS_PROVIDER` — selects `stub` or `paddle`
- `PAYMENTS_CREDIT_PACKS` — JSON catalog of purchasable packs
- `PAYMENTS_CHECKOUT_RETURN_URL`
- `PAYMENTS_STUB_WEBHOOK_SECRET` (required only when `PAYMENTS_PROVIDER=stub`)
- `PADDLE_API_KEY` (required only when `PAYMENTS_PROVIDER=paddle`)
- `PADDLE_WEBHOOK_SECRET` (required only when `PAYMENTS_PROVIDER=paddle`)
- `PADDLE_ENVIRONMENT` (required only when `PAYMENTS_PROVIDER=paddle`; must be `sandbox`)

## Validation

Focused tests live in `src/`: `credit-pack-catalog.spec.ts`, `credit-purchase.controller.spec.ts`,
`credit-purchase.entity.spec.ts`, `credit-purchase.service.spec.ts`, `payment-event.handler.spec.ts` (and its
`.integration.spec.ts` counterpart), `payment-webhook.controller.spec.ts`, `payments.module.spec.ts`, and the
provider adapter specs under `infrastructure/` (`stub-payment-provider.spec.ts`,
`paddle/paddle-payment-provider.spec.ts`, `typeorm-payment-purchase.store.spec.ts`).

[`bruno/credit-purchases`](../../../../bruno/credit-purchases/README.md) exercises the checkout flow, purchase
listing, and signed webhook crediting end to end against the local stub provider — including a
tampered-signature rejection — and documents a manual (not automated) Paddle sandbox verification procedure.
