# Ingest payment webhooks idempotently

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Turn a completed payment into credits. After this change a signed provider event marks its purchase `paid` and grants the pack's credits exactly once, no matter how many times the provider redelivers it. A developer can observe it by posting the same signed stub event twice and seeing the balance rise once.

## Progress

- [x] (2026-08-19) Enable raw body capture in the application bootstrap.
- [x] (2026-08-19) Add the public, signature-verified webhook route.
- [x] (2026-08-19) Add `PaymentEventHandler` granting credits through `CreditsService.credit`.
- [x] (2026-08-19) Add replay, out-of-order, unknown-reference, and bad-signature coverage.
- [x] (2026-08-19) Extend the Bruno collection and run it against the stub provider.

## Plan dependencies

- `payments/01`
- `payments/02`
- `payments/03`

## Surprises & Discoveries

- The long-running Compose API compiled changed files but did not reload its Nest process, so `POST /v1/payments/webhook` returned `404` during Bruno execution. Restarting it would first require reconciling unrelated stale auth-schema state, and the full authenticated collection also returned `401` because the container's host-facing OIDC issuer is unreachable from inside that container. The synthetic purchase used for the attempted public run was removed.
- The local `keycloak:bootstrap-credential` attempt exposed an unrelated stale unique constraint (`UQ_service_credentials_keycloak_client_id`) that conflicts with the current issuer-scoped entity index. It created the conventional disposable platform organization and one credential before failing; no repository auth code was changed in this plan.
- The first full Jest run inside the restricted sandbox failed only where existing tests needed to bind sockets (`listen EPERM`). Re-running outside that restriction passed all non-gated suites.
- Recreating and provisioning the disposable Compose stack resolved the earlier stale API and OIDC fixture state. Because the SMTP-development API uses the container-internal Keycloak issuer, Bruno had to run inside `lef_default`, matching the established `bruno/smtp-dev` execution pattern.

## Decision Log

- Decision: The webhook route is `@Public()` and authenticated solely by the provider signature.
  Rationale: The provider cannot present an OIDC token, and `AuthGuard` is registered as an `APP_GUARD`, so the route must opt out explicitly. The signature is therefore the entire authentication boundary, which is why nothing in the handler may be derived from the request except through the verified event.
  Date/Author: 2026-08-17, project planning.
- Decision: Credits granted come from the stored `CreditPurchase`, never from the event payload.
  Rationale: The payload arrives at a public endpoint. Even with a valid signature, reading an amount from it would couple credit issuance to provider-controlled data rather than to the catalog the customer actually bought from.
  Date/Author: 2026-08-17, project planning.
- Decision: The grant reference is the purchase id, not the provider event id.
  Rationale: One purchase must yield one grant. Providers may emit several distinct event ids for the same payment, so keying on the event id would allow a second grant for the same purchase; keying on the purchase id makes duplicate grants impossible by construction.
  Date/Author: 2026-08-17, project planning.
- Decision: Unknown, duplicate, and unhandled events return `200`.
  Rationale: A non-`2xx` response causes the provider to retry indefinitely. Only an unverifiable signature returns `400`, and only an unexpected internal failure returns `500`, because those are the two cases where a retry is the correct outcome.
  Date/Author: 2026-08-17, project planning.
- Decision: Status transitions never move a purchase out of `paid`.
  Rationale: Events can arrive out of order, and a late `purchase_failed` after a real payment must not silently unwind a granted purchase. Refund handling is plan 06's job and goes through an explicit clawback, not a status regression.
  Date/Author: 2026-08-17, project planning.
- Decision: Put locked TypeORM status transitions behind `PaymentPurchaseStore`, then invoke the idempotent credit ledger after the status transaction commits.
  Rationale: `PaymentEventHandler` remains application policy rather than a TypeORM adapter. Returning an already-paid purchase makes replay retry the same purchase-id grant, so a failure between the status commit and credit grant converges safely without double credit.
  Date/Author: 2026-08-19, Codex.

## Outcomes & Retrospective

Implemented and runtime-verified raw-body capture, a public `Paddle-Signature`-verified webhook endpoint, provider-event orchestration, a narrow TypeORM purchase store, idempotent credit granting, failure monotonicity, focused unit coverage, and a real PostgreSQL concurrency test. Typecheck, lint, the full Jest suite, the dedicated PostgreSQL test, and all 11 Bruno requests pass. Bruno proves valid payment, stored-credit ownership, replay idempotency, and tamper rejection against the stub provider.

## Context and Orientation

Plan 03 leaves purchases stuck at `pending`: nothing consumes payment events. Plan 02's port exposes `parseEvent(rawBody, signature)` returning a `PaymentEvent` union of `purchase_paid`, `purchase_failed`, and `ignored`, and throwing `InvalidPaymentSignatureError` on a bad signature. Plan 01's `CreditsService.credit(organizationId, amount, reference)` is idempotent per reference.

`src/main.ts` creates the application with `NestFactory.create<NestExpressApplication>(LeadEmailFinderApiModule)` and no `rawBody` option, so `req.rawBody` is undefined today. Signature verification hashes the exact bytes the provider sent, so a body that has been JSON-parsed and re-serialized will never verify.

A global `ValidationPipe` and a global `ClassSerializerInterceptor` with `strategy: 'excludeAll'` are installed in `src/main.ts`. The webhook body must not be routed through a validating DTO, because that would both reject provider-shaped payloads and discard the raw bytes.

`@Public()` is `SetMetadata('isPublic', true)` from `src/libs/modules/auth/src/infrastructure/http/public.decorator.ts`, honored by `AuthGuard`.

## Scope and Non-Goals

Add webhook ingestion and credit granting for successful payments. Do not add the Paddle adapter, refunds, chargebacks, receipts, or customer notifications. All testing in this plan runs against the stub provider.

## Plan of Work

Change the bootstrap in `src/main.ts` to `NestFactory.create<NestExpressApplication>(LeadEmailFinderApiModule, { rawBody: true })`. This is the only change outside the payments module, and it is additive: `req.rawBody` becomes available while normal parsed-body routes are unaffected.

Add `PaymentWebhookController` with a single `@Public()` `POST /v1/payments/webhook`. It takes `@Req() request: RawBodyRequest<Request>` and the provider's signature header, rejects a missing raw body or missing signature with `400`, calls `parseEvent`, and delegates to `PaymentEventHandler`. It maps `InvalidPaymentSignatureError` to `400` and returns `200` with a minimal acknowledgement body otherwise. The route declares no body DTO.

Add `PaymentEventHandler` and an injected `PaymentPurchaseStore` implemented by a TypeORM adapter. For `purchase_paid`, the store locks the `CreditPurchase` by `providerReference`, marks it `paid` when necessary, commits, and returns only its grant fields. A miss is logged and acknowledged, because an event for a purchase this environment never created is expected when several environments share a provider account. The handler then calls `CreditsService.credit(purchase.organizationId, purchase.credits, purchase.id)`. An already-paid purchase is returned too, so replay retries a grant that may have failed after the status commit; the grant ledger keyed by `(organizationId, reference)` prevents double credit. For `purchase_failed`, the store sets `failed` only when the purchase is still `pending`. For `ignored`, the handler does nothing.

Extend `bruno/credit-purchases/` with webhook cases built on the stub provider's HMAC scheme, using a `PAYMENTS_STUB_WEBHOOK_SECRET` supplied through the Bruno environment: a valid paid event granting credits, the same event replayed leaving the balance unchanged, and a tampered body returning `400`. Read the balance through the existing admin `GET /credits/:organizationId` endpoint to assert the effect.

## Interfaces and Dependencies

New endpoint: `POST /v1/payments/webhook`, public, signature-verified, returning `200`, `400` for an unverifiable request, or `500` for an unexpected failure. New providers: `PaymentEventHandler` and the `PAYMENT_PURCHASE_STORE` port backed by `TypeOrmPaymentPurchaseStore`. Changed: `src/main.ts` gains `{ rawBody: true }`. Depends on plans 01, 02, and 03; unlocks plans 05 and 06.

## Acceptance Criteria

- A signed `purchase_paid` event marks its purchase `paid` and raises the organization's balance by the purchase's stored credits.
- Redelivering that event returns `200` and leaves the balance and the `credit_grants` row count unchanged.
- Credits granted equal the stored purchase credits even when the event payload claims a different amount.
- An invalid or missing signature returns `400` and changes nothing.
- An event whose `providerReference` matches no purchase returns `200` and changes nothing.
- A `purchase_failed` event arriving after a purchase is `paid` leaves it `paid` and the balance unchanged.
- The webhook route is reachable without any credential.
- Every other route continues to require authentication, and existing parsed-body routes are unaffected by `rawBody: true`.

## Validation

Add handler unit tests for the paid, replayed, unknown-reference, out-of-order-failure, and ignored paths, and controller tests for the bad-signature and missing-raw-body paths. Add an integration test that drives the handler against a real PostgreSQL database, in the style of `credits.service.integration.spec.ts`, asserting that two concurrent deliveries of one event produce exactly one grant row. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Run `bru run --env local` for `bruno/credit-purchases` against a stack with `PAYMENTS_PROVIDER=stub`, and separately re-run `bruno/smtp-dev` to confirm `rawBody: true` did not disturb existing routes.

## Idempotence and Recovery

Redelivery is the normal case and is safe: every paid replay may retry the purchase-id grant, and the grant ledger makes that retry idempotent. If the status commit succeeds but crediting fails, the provider receives `500`; its retry finds the paid purchase and safely retries the missing grant. A webhook lost entirely leaves a `pending` purchase, recoverable by replaying the event from the provider dashboard or by an admin top-up through `POST /credits/:organizationId`. Reset by dropping and re-synchronizing the development database.

## Artifacts and Notes

Record one signed stub event payload with synthetic identifiers. Never record a live signature, secret, or provider event body.

Validation evidence from 2026-08-19:

- `pnpm typecheck` passed.
- `pnpm lint` passed with two pre-existing warnings in unrelated config and Redis tests.
- Focused handler, TypeORM store, controller, and module tests passed (18 tests).
- The dedicated PostgreSQL concurrency test passed and observed one grant for two concurrent deliveries.
- Full Jest passed outside the socket-restricted sandbox: 107 suites and 640 tests passed; 8 suites and 22 tests skipped; 1 todo.
- `git diff --check` passed.
- Bruno CLI 3.4.2 passed all 11 requests and tests inside `lef_default`: unauthenticated purchase `401`, checkout `201`, unknown pack `400`, history and balance reads `200`, signed payment and replay `200`, tampered body `400`, one stored-credit balance increase, and no balance change after replay or tampering.

## Plan readiness

Ready to implement.
