# Credit Purchase Road Map

This road map lets a customer pay for credits instead of waiting for a `platform:admin` top-up through the internal `/credits` endpoints. Customers buy fixed one-time credit packs through Paddle Billing; Paddle acts as merchant of record and owns tax registration, calculation, and remittance. It is development-only: PostgreSQL, Redis, BullMQ, S3, credit, and purchase data is disposable, and TypeORM synchronization replaces migrations until a production environment exists.

Follow the dependency graph below. Numeric prefixes are stable plan identities, so dependency order takes precedence over numeric order when the road map branches. Each plan follows `.agents/PLANS.md` and represents one pull request with its own acceptance criteria and validation.

1. [Grant credits idempotently](01-idempotent-credit-grants.md)
2. [Add the payment provider port and stub adapter](02-payment-provider-port-and-stub.md)
3. [Sell credit packs through a checkout endpoint](03-credit-pack-checkout-endpoint.md)
4. [Ingest payment webhooks idempotently](04-payment-webhook-ingestion.md)
5. [Add the Paddle provider adapter](05-paddle-provider-adapter.md)
6. [Correlate early payment webhooks to pending purchases](08-correlate-early-payment-webhooks.md)
7. [Provide a reusable Paddle sandbox purchase fixture](07-paddle-sandbox-purchase-fixture.md)
8. [Claw back refunded credits](06-refund-clawbacks.md)

Shared decisions:

- Only one-time credit packs are sold. Subscriptions and metered billing are out of scope for this road map; recurring grants need a scheduler and proration handling that no plan here provides.
- Paddle Billing is the payment provider, chosen as merchant of record so the project does not register for or remit VAT. Recorded 2026-08-17, project planning.
- Card data never reaches this application. Payment is collected on Paddle's hosted checkout, which keeps the project out of PCI scope.
- The pack catalog is server-side. A request names a `packId` only; credit amounts and prices are never read from client input or from webhook payloads.
- Payments never write balances directly. Every balance change goes through `CreditsService` with an idempotency reference, so a redelivered webhook cannot double-credit.
- The payment provider stays behind a `PaymentProvider` port. A stub adapter drives local development and Bruno runs without network access or live keys.
- Browser purchase flows depend on `.agents/plans/auth/06-bff-sessions.md`. Plans 1 and 2 are independent of it; plan 3 onward assume an authenticated principal exists, however it was obtained.
- No plan may add database migrations or production deployment work.

## Durable Purchase Follow-Up

The [checkout recovery road map](../checkout-recovery/README.md) extends this work with atomic purchase/job
admission, provider observation, durable checkout processing, browser recovery, and repeatable crash validation.
Its six ExecPlans preserve the completed payment plans above and define one pull request per change.
