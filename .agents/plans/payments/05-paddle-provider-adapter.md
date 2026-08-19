# Add the Paddle provider adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Take real money. After this change, setting `PAYMENTS_PROVIDER=paddle` routes checkout and webhook verification through Paddle Billing sandbox, and a completed sandbox payment grants credits through the flow plans 03 and 04 already built. A developer can observe it by buying a pack in the Paddle sandbox and watching the balance rise.

## Progress

- [x] (2026-08-19) Add the `@paddle/paddle-node-sdk` dependency and client configuration.
- [x] (2026-08-19) Implement `PaddlePaymentProvider` against the existing port.
- [x] (2026-08-19) Map Paddle events onto the application event union.
- [x] (2026-08-19) Run the shared provider contract suite against the adapter.
- [ ] Verify a sandbox purchase end to end and record the result.

## Plan dependencies

- `payments/02`
- `payments/03`
- `payments/04`

## Surprises & Discoveries

- The official Node SDK and Paddle signature documentation both confirm that webhook verification is asynchronous and applies a five-second timestamp tolerance. Contract tests therefore generate fresh signed payloads rather than relying on stale signatures.
- Paddle's transaction `checkout.url` input is an approved payment-link page, not a post-payment redirect. The existing application setting remains named `PAYMENTS_CHECKOUT_RETURN_URL` for compatibility, so the Bruno guide now explains that Paddle Checkout's success redirect must be configured separately.
- No Paddle sandbox credentials or publicly reachable webhook destination are present in the repository, so the manual sandbox purchase and notification redelivery remain unverified.
- The checked-in Compose issuer is host-facing and cannot validate tokens from inside the API container. The stub Bruno regression passed after applying a runtime-only issuer override (`http://keycloak:8080`) to the isolated API and Keycloak containers; no Compose file was changed in this plan.

## Decision Log

- Decision: Paddle Billing is the provider, selected as merchant of record.
  Rationale: Paddle registers for and remits VAT and sales tax on the project's behalf, removing tax registration work that a payment-processor-only integration would leave with the project.
  Date/Author: 2026-08-17, project owner.
- Decision: Checkout uses a Paddle transaction's returned checkout URL, not an embedded card form.
  Rationale: Payment is collected on Paddle's hosted page, so no card data reaches this application and the project stays out of PCI scope. It also keeps the port's `redirectUrl` contract unchanged from the stub.
  Date/Author: 2026-08-17, project planning.
- Decision: The adapter maps `transaction.completed` to `purchase_paid`, not `transaction.paid`.
  Rationale: Paddle moves a transaction to `completed` after payment processing finishes, so `completed` is the point at which the sale is final. Mapping both would be harmless given the grant ledger, but mapping one keeps the intended trigger unambiguous.
  Date/Author: 2026-08-17, project planning.
- Decision: `providerReference` is the Paddle transaction id.
  Rationale: It is created at checkout time, returned synchronously, and present on every later event for that sale, which is exactly what plan 04's purchase lookup requires. `custom_data` also carries the purchase id, but as corroboration only — it is provider-echoed input and is not what credits are computed from.
  Date/Author: 2026-08-17, project planning.
- Decision: Only sandbox is exercised by this roadmap.
  Rationale: The project has no production environment, and `.agents/PLANS.md` places production rollout out of scope for every plan.
  Date/Author: 2026-08-17, project planning.

## Outcomes & Retrospective

The Paddle Billing SDK, sandbox-only client factory, hosted-checkout adapter, event mapping, conditional configuration, shared provider contract coverage, and sandbox setup guide are implemented. Static and automated validation are recorded below. A live Paddle sandbox purchase remains outstanding because it requires account credentials, an approved payment-link page, and a public notification destination.

## Context and Orientation

Plans 02 through 04 built the whole purchase flow against `StubPaymentProvider`. The port requires `createCheckout(input): Promise<{ providerReference, redirectUrl }>` and `parseEvent(rawBody, signature): Promise<PaymentEvent>`, throwing `InvalidPaymentSignatureError` on a verification failure, and plan 02 left a shared contract test suite parameterized by adapter.

Paddle Billing's Node SDK is `@paddle/paddle-node-sdk`, currently `3.10.0`. The client takes an API key and an environment, `Environment.sandbox` for sandbox. Creating a transaction with `items` referencing a price identifier returns the transaction id and a `checkout.url` to redirect to; a checkout URL may be supplied per transaction, and the account must have a default payment link configured. Webhooks arrive with a `Paddle-Signature` header shaped `ts=<unix>;h1=<hmac-sha256>`, and the SDK verifies them through `paddle.webhooks.unmarshal(rawBody, secret, signature)`, which also enforces a timestamp tolerance against replay. Refunds and chargebacks arrive as `adjustment.created` with an `action` of `refund`, `credit`, or `chargeback`, and are plan 06's concern.

Secrets follow the `@IsFileVar()` and `_FILE` convention validated by `src/libs/config/src/`, with values mounted under `/run/secrets` as in `docker/secrets`.

## Scope and Non-Goals

Add the Paddle adapter and its configuration, and prove it against sandbox. Do not change the port, the purchase flow, the webhook handler, or the catalog's meaning. Do not handle `adjustment.created`, subscriptions, customer records, or invoices. Do not add production configuration or rollout.

## Plan of Work

Add `@paddle/paddle-node-sdk` and create `payments/infrastructure/paddle/`. Build the client from configuration in a factory provider so the environment is explicit and the SDK stays confined to this directory.

Implement `PaddlePaymentProvider`. `createCheckout` creates a transaction with a single item referencing the pack's configured Paddle price identifier and quantity one, attaches `customData` carrying the purchase id and organization id, passes the configured return URL, and returns the transaction id as `providerReference` with the transaction's checkout URL as `redirectUrl`. A missing checkout URL is an error, not a silent success, because the customer would otherwise have nowhere to pay.

`parseEvent` calls `paddle.webhooks.unmarshal` with the raw body, the notification secret, and the signature header, translating any verification failure into `InvalidPaymentSignatureError`. It maps `transaction.completed` to `purchase_paid` with the transaction id as `providerReference`, maps `transaction.canceled` and `transaction.past_due` to `purchase_failed`, and maps everything else, including `adjustment.*`, to `ignored` so plan 06 can claim those without a behavior change here.

Confirm the SDK's timestamp tolerance during implementation and record it in `Surprises & Discoveries`. Documentation describes a short default window, which is enough to fail verification under clock skew, so the observed value and any configuration needed belong in the plan rather than in someone's memory.

Declare `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` as file variables and `PADDLE_ENVIRONMENT` on `EnvironmentVariablesDto`, required only when `PAYMENTS_PROVIDER=paddle`, and extend each pack's catalog entry with its Paddle price identifier. Document sandbox setup in `bruno/credit-purchases/README.md`: creating sandbox products and prices, configuring the default payment link, creating the notification destination, and copying the two secrets.

## Interfaces and Dependencies

New dependency: `@paddle/paddle-node-sdk`. New configuration: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT`, and a Paddle price identifier per catalog pack. No change to the port, endpoints, or database schema. Depends on plans 02, 03, and 04.

## Acceptance Criteria

- With `PAYMENTS_PROVIDER=paddle`, `PAYMENT_PROVIDER` resolves to `PaddlePaymentProvider`, and with `stub` it still resolves to the stub.
- The shared provider contract suite passes against the Paddle adapter with no live network calls, using recorded payloads and a test notification secret.
- A genuine `Paddle-Signature` header verifies; a tampered body or altered signature raises `InvalidPaymentSignatureError`.
- `transaction.completed` maps to `purchase_paid` carrying the Paddle transaction id; `adjustment.created` maps to `ignored`.
- A sandbox purchase returns a working Paddle checkout URL and, once paid, marks the purchase `paid` and grants exactly the catalog's credits.
- Redelivering the sandbox event from the Paddle dashboard does not grant twice.
- The Paddle SDK is imported only under `payments/infrastructure/paddle/`.
- Startup fails with a clear validation error when `PAYMENTS_PROVIDER=paddle` and a Paddle variable is missing.

## Validation

Run the contract suite and adapter unit tests over recorded sandbox payloads with a known test secret, covering signature success and failure and each event mapping. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Then run one manual sandbox pass: start the stack with `PAYMENTS_PROVIDER=paddle`, expose the webhook to Paddle, buy a pack with a sandbox test card, and confirm through `GET /credits/:organizationId` that the balance rose once. Re-run `bru run --env local` for `bruno/credit-purchases` under the stub provider to confirm the stub path still passes.

## Idempotence and Recovery

Checkout creation is not idempotent at the provider: retrying `start` creates a second transaction. That is acceptable because an unpaid transaction costs nothing and each retry produces its own purchase row. Granting stays idempotent through plan 04's ledger. A missed webhook is recoverable by replaying the event from the Paddle dashboard. Sandbox data is disposable; reset by dropping and re-synchronizing the development database and clearing sandbox transactions.

## Artifacts and Notes

The SDK's observed and documented signature tolerance is five seconds. Automated tests use representative Paddle event envelopes and fresh genuine signatures; no live transaction payload was available to record. Never commit an API key, notification secret, or live transaction payload.

Validation completed on 2026-08-19:

- `corepack pnpm typecheck` passed.
- `corepack pnpm lint` passed with two pre-existing explicit-return-type warnings outside the changed files.
- `corepack pnpm test --runInBand` passed 108 suites and 654 tests; 8 suites were skipped and 1 test remains marked todo by the repository.
- `corepack pnpm build` passed.
- `docker compose ... config --quiet` passed using the existing local environment file.
- `/run/user/1000/fnm_multishells/125294_1787124153492/bin/bru run --env local --sandbox developer` passed all 11 credit-purchase requests against a disposable isolated stub stack.
- `git diff --check` passed.

## Plan readiness

Ready to implement.
