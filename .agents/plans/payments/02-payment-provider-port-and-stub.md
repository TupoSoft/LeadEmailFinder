# Add the payment provider port and stub adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Establish the payments seam before any provider SDK exists. After this change the application can create a credit-pack purchase, hand it to a payment provider, and verify a signed provider event, with a stub adapter standing in for Paddle. A developer can observe it by running the payments unit and contract tests with no network access and no Paddle keys.

## Progress

- [ ] Add the `PaymentsModule` with the `CreditPurchase` entity.
- [ ] Define the `PaymentProvider` port and its event and checkout contracts.
- [ ] Add the server-side credit pack catalog and its configuration.
- [ ] Add `StubPaymentProvider` and the shared provider contract test suite.
- [ ] Run typecheck, lint, and jest.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: The port exposes `createCheckout` and `parseEvent` only.
  Rationale: These are the two operations the purchase flow needs. A broader provider interface would invite provider-shaped concepts such as customers, subscriptions, and invoices into application code, which is what the port exists to prevent.
  Date/Author: 2026-08-17, project planning.
- Decision: `parseEvent` throws on an invalid signature rather than returning a result object.
  Rationale: An unverifiable event is not a value the caller can act on, and a thrown domain error maps cleanly onto the `400` the webhook route must return.
  Date/Author: 2026-08-17, project planning.
- Decision: The port's event type is a small application-owned union, not a passthrough of the provider payload.
  Rationale: Later plans grant and claw back credits from these events. If provider field names leak into that logic, switching or stubbing the provider stops being possible, and webhook payload fields become de facto trusted inputs.
  Date/Author: 2026-08-17, project planning.
- Decision: The catalog lives in configuration keyed by `packId`, with credits and provider price identifier per pack.
  Rationale: Credits per pack is a product decision that must never come from the client or the provider, and prices are already defined in the Paddle dashboard. Keeping the mapping server-side makes the checkout endpoint incapable of minting arbitrary credits.
  Date/Author: 2026-08-17, project planning.
- Decision: `CreditPurchase` lives in the payments module rather than in the identity library.
  Rationale: `src/proxy/src/proxy.entity.ts` establishes that a feature module owns its entity and registers it with `TypeOrmModule.forFeature`, and `autoLoadEntities: true` means no central registry needs editing. Credit accounts stay in identity because they are shared across modules; a purchase record is used only by payments.
  Date/Author: 2026-08-17, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

There is no payments code in the repository today. Credits are added only through `POST /credits/:organizationId`, which requires `platform:admin`.

`CreditsService` lives in `src/lead-email-finder-api/src/credits/`, exported by `CreditsModule` alongside `CreditGuard`. Plan 01 adds `CreditsService.credit(organizationId, amount, reference)`, which is the only balance-changing call payments code may make.

Feature modules are registered in `src/lead-email-finder-api/src/lead-email-finder-api.module.ts`. Environment variables are declared on `EnvironmentVariablesDto` in `src/lead-email-finder-api/src/environment-variables.dto.ts`, validated at startup by `validate`, and secrets are read from `/run/secrets` through the `@IsFileVar()` and `_FILE` convention in `src/libs/config/src/`.

## Scope and Non-Goals

Add the payments module skeleton, the purchase record, the provider port, the pack catalog, and a stub adapter with a contract test suite. Do not add HTTP endpoints, webhook routes, the Paddle SDK, or refund handling. No route is reachable at the end of this plan.

## Plan of Work

Create `src/lead-email-finder-api/src/payments/`. Add `credit-purchase.entity.ts` with `id` (generated uuid), `organizationId`, `packId`, `credits`, `amountMinor`, `currency`, `provider`, a nullable unique `providerReference`, a `status` of `pending`, `paid`, `failed`, or `expired`, and create and update timestamps. Index `organizationId` for history queries; the unique constraint on `providerReference` is what later lets a webhook resolve exactly one purchase.

Define the port in `payment-provider.ts`: a `PAYMENT_PROVIDER` injection symbol, a `PaymentProvider` interface with `createCheckout(input: CheckoutInput): Promise<CheckoutResult>` and `parseEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent>`, and an `InvalidPaymentSignatureError`. `CheckoutInput` carries the purchase id, organization id, pack, and return URL. `CheckoutResult` carries `providerReference` and `redirectUrl`. `PaymentEvent` is a discriminated union over `kind`, initially `purchase_paid` and `purchase_failed`, each carrying `providerEventId` and `providerReference`, plus `ignored` for event kinds the application does not act on.

Add `credit-pack-catalog.ts` reading packs from configuration into a frozen map, with a lookup that throws a not-found error for an unknown `packId`. Declare the catalog and provider selection variables on `EnvironmentVariablesDto`.

Add `StubPaymentProvider`, selected when `PAYMENTS_PROVIDER=stub`, which mints a deterministic `providerReference` from the purchase id, returns a local redirect URL, and verifies events with an HMAC-SHA256 over the raw body using a configured development secret. Wire provider selection as a factory provider in `PaymentsModule`.

Write the contract test suite as a shared function parameterized by adapter, so plan 05 can run the same expectations against the Paddle adapter: a valid signature parses, a tampered body or wrong signature throws `InvalidPaymentSignatureError`, and an unrecognized event kind returns `ignored`.

## Interfaces and Dependencies

New: `PAYMENT_PROVIDER`, `PaymentProvider`, `CheckoutInput`, `CheckoutResult`, `PaymentEvent`, `InvalidPaymentSignatureError`, `CreditPack`, `CreditPackCatalog`, `CreditPurchase`, `PaymentsModule`. New configuration: `PAYMENTS_PROVIDER` (`stub` or `paddle`), `PAYMENTS_CREDIT_PACKS` (JSON pack definitions), `PAYMENTS_CHECKOUT_RETURN_URL`, and `PAYMENTS_STUB_WEBHOOK_SECRET` (file variable, required only when the provider is `stub`). No new runtime dependency. Depends on plan 01 for `CreditsService.credit`; unlocks plans 03 and 04.

## Acceptance Criteria

- `PaymentsModule` compiles into the application and registers `CreditPurchase` without a migration.
- Resolving `PAYMENT_PROVIDER` with `PAYMENTS_PROVIDER=stub` yields `StubPaymentProvider`.
- Application code outside `payments/infrastructure/` references only the port, never a provider SDK type.
- The catalog rejects an unknown `packId` and exposes credits and price identifier for a known one.
- The contract suite passes against `StubPaymentProvider` with no network access and no live keys.
- A tampered raw body fails signature verification.
- Startup fails with a clear validation error when a required payments variable is missing.

## Validation

Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Add unit tests for the catalog and the provider factory, and run the contract suite against the stub. Add a module compilation test in the style of `src/proxy/src/proxy.module.spec.ts` to prove wiring resolves. No Bruno work applies: this plan adds no HTTP surface.

## Idempotence and Recovery

All work is additive. `credit_purchases` is created by `TYPEORM_SYNCHRONIZE=true` against disposable data. Re-running the plan's tests has no persistent effect. To reset, drop and re-synchronize the development database.

## Artifacts and Notes

Record the pack catalog JSON shape with synthetic pack identifiers and prices only. Never record a live provider key.

## Plan readiness

Ready to implement after plan 01.
