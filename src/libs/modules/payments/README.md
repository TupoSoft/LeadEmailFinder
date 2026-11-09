# Payments

Creates credit-pack checkouts, verifies payment webhooks, grants paid credits once, and handles approved refunds and
chargebacks (payment reversals initiated through a bank/provider).

## Responsibility

- Return a safe credit-pack catalog and organization-scoped purchase history.
- Create purchases using catalog prices and validate the provider's checkout URL.
- Verify webhook signatures: cryptographic proof that the provider sent the event.
- Grant credits idempotently (retries cannot grant twice), debit approved adjustments, and restore only credits
  actually removed by the original adjustment.
- Support deterministic local stub payments and Paddle sandbox payments.

## Non-Responsibilities

[`credits`](../credits/README.md) owns ledger operations (persisted credit movements);
[`identity`](../identity/README.md) owns their persistence.
Payments calculates adjustment amounts and records recovery state, but does not manage verification reservations
(credit holds). Card/bank details remain with the payment provider.

## Public API

[`src/index.ts`](src/index.ts) exports `PaymentsModule`, `PaymentsProviderName`, `PaddleEnvironmentName`, and
`PaymentConfiguration`. Controllers, services, entities, and provider interfaces/adapters remain private.

## Architecture

Framework-independent application services depend on purchase/adjustment stores, a payment-provider interface, a
checkout-redirect policy, and an event logger. Infrastructure implements those interfaces. External provider calls
run outside database transactions; persisted ownership markers and one-time credit-operation IDs recover interruptions between steps.

## Dependencies

- [`credits`](../credits/README.md): grants, clamped adjustment debits, and one-time restoration.
- [`identity`](../identity/README.md): `AuthPrincipal`, the authenticated actor type.
- [`auth`](../auth/README.md): permission guards and principal lookup.
- `@paddle/paddle-node-sdk`: external software development kit used only by the Paddle adapter.

## HTTP Surface

| Method | Path                       | Access                                            |
| ------ | -------------------------- | ------------------------------------------------- |
| `GET`  | `/v1/billing/credit-packs` | `billing:read`                                    |
| `POST` | `/v1/credit-purchases`     | `billing:manage`                                  |
| `GET`  | `/v1/credit-purchases`     | `billing:read`                                    |
| `POST` | `/v1/payments/webhook`     | Public route; authenticated by provider signature |

The catalog contains exactly `id`, `credits`, `amountMinor`, and `currency`, ordered by credits then ID.
`amountMinor` uses the currency's smallest unit. History contains only `id`, `packId`, `credits`, `amountMinor`,
`currency`, `status`, `createdAt`, and `updatedAt`, scoped to the authenticated organization. Provider identifiers,
prices, webhook correlation, and grant timestamps stay private. Invalid authentication returns `401`; missing
permission returns `403`.

Purchase input contains only a pack ID; stored prices/credits come from the server catalog. Checkout URLs must be
absolute HTTP(S), contain no credentials or fragment, and match an allowed origin exactly (scheme, host, and port).
HTTPS is required except explicit loopback HTTP. Rejection marks the purchase failed and returns generic `502`
without revealing the URL. A checkout return URL or purchase-ID hint never proves payment: only a verified webhook
authorizes the grant.

## Persistence

| Entity                     | Table                         | Purpose                                                                           |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `CreditPurchase`           | `credit_purchases`            | Organization purchase, settled provider total, and grant-completion marker        |
| `CreditPurchaseAdjustment` | `credit_purchase_adjustments` | Provider adjustment ID, requested/applied movement, shortfall, and recovery state |

Adjustment processing locks the purchase before cumulative proportional accounting. Distinct partial events are
serialized, rounding favors the customer, full adjustments use the settled provider total, and total debits cannot
exceed the original grant. Ledger references include the operation kind and provider ID, preventing collisions and making retries crash-safe.

Adjustment debits use only available credit, preserving active holds. Any unmet debit is recorded as a shortfall
(the amount not collected); inverse adjustments restore only previously applied debits. Audit/processing state must
not imply completion before the related credit movement is confirmed.

## Configuration

- `PAYMENTS_PROVIDER`: `stub` or `paddle`.
- `PAYMENTS_CREDIT_PACKS`: JSON pack catalog.
- `PAYMENTS_CHECKOUT_URL`: canonical checkout page URL.
- `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS`: exact comma-separated origins, required for Paddle. The stub derives its
  sole allowed origin from its loopback return URL. The same normalized nonsecret origins feed the web build.
- `PAYMENTS_STUB_WEBHOOK_SECRET`: required for the stub.
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT`: required for Paddle; environment must be `sandbox`.

Invalid origins stop startup. The removed `PAYMENTS_CHECKOUT_RETURN_URL` setting also stops startup, even if empty;
replace it with `PAYMENTS_CHECKOUT_URL` and remove the old key. Errors omit configured values.
See the [Paddle sandbox runbook](../../../../docker/paddle-dev/README.md) for checkout, tunnel, and webhook replay.

## Validation

Unit/HTTP suites cover signatures, provider events, adjustment accounting, safe responses, permissions, and redirect
validation. Key suites are `api/http/billing-http.integration.spec.ts`,
`application/payment-adjustment.handler.spec.ts`, `domain/payment-adjustment-accounting.spec.ts`, and the adapters
under `src/infrastructure/`.

`application/payment-event.handler.integration.spec.ts` requires `TEST_PAYMENT_WEBHOOK_POSTGRES_URL` pointing to
an owned disposable test database. It covers concurrent/replayed events, interrupted processing, inverse ordering,
shortfalls, and active reservation holds. [Bruno credit purchases](../../../../bruno/credit-purchases/README.md)
exercises the signed stub checkout/adjustment flow; genuine Paddle behavior requires the sandbox runbook.
