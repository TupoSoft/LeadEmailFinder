# Correlate early payment webhooks to pending purchases

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A provider completion event that arrives before checkout creation saves `providerReference` must still settle the
correct pending purchase and grant credits exactly once. After this change, the signed event's application-generated
purchase ID provides a safe fallback correlation key, the provider reference is bound atomically, and a conflicting
event is rejected for retry/investigation rather than acknowledged as an unknown purchase.

## Progress

- [x] (2026-08-21) Carry verified purchase correlation through the provider event contract.
- [x] (2026-08-21) Atomically resolve and bind pending purchases by purchase ID or provider reference.
- [x] (2026-08-21) Add early-delivery, conflict, replay, Paddle, stub, PostgreSQL, and Bruno coverage.
- [x] (2026-08-21) Run focused, full, and runtime validation and record the outcome.

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
- A real concurrency hazard in the ID-fallback path itself, found only by writing the real-Postgres concurrent
  test: two concurrent deliveries of the same early paid event both miss the provider-reference lookup (neither
  has committed yet), so both fall through to the purchase-ID lookup. The second one to acquire the row lock sees
  the reference the first one just committed. Comparing only "is the stored reference non-null" would misclassify
  this as a genuine conflict and reject the second, identical delivery with `500` -- fixed by comparing the stored
  reference against the *incoming* one and only conflicting when they differ.
- `PaddleClient`'s SDK deserializes the webhook's raw snake_case `custom_data` into a camelCase `customData`
  property (confirmed by reading the SDK's own transaction entity mapping, not assumed), and types it as
  `Record<string, any>` -- so extracting `purchaseId` from it needs its own runtime type guard, same as the stub
  provider's already-`unknown` JSON payload.
- `bruno/credit-purchases` needs an `OWNER_ACCESS_TOKEN` for a `human_session` principal with `billing:manage`.
  Every Keycloak client in this repo has `directAccessGrantsEnabled: false` by design (see `auth/09`), and
  `bruno/bff-sessions/README.md` documents that a full human login round trip is *not* drivable through Bruno's
  plain HTTP model at all -- the repo's own established substitute for that gap is a dedicated Jest live-Keycloak
  integration test with direct database access, not a Bruno run. This is the same gap already recorded in
  `module-boundaries/04`'s Surprises & Discoveries; recorded again here since it also applies to this plan's own
  Validation section.

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

Implemented and fully validated, including a real-Postgres concurrency proof of the exact race this plan closes.
`PaymentEvent`'s paid/failed variants gained an optional `purchaseId`. `PaymentPurchaseStore.recordPaid`/`recordFailed`
now take a `PurchaseCorrelation` (`{ providerReference, purchaseId? }`) instead of a bare reference string.
`TypeOrmPaymentPurchaseStore` gained a shared `resolvePurchase` step used by both: lock and look up by provider
reference first; if not found and a purchase ID is present, lock and look up by ID; if that purchase's stored
reference is null, bind the incoming reference; if it already equals the incoming reference, treat it as already
resolved (no-op, not a conflict -- see Surprises & Discoveries for why this equality check, not just a
null-check, is required); if it's a genuinely different non-null reference, throw `PurchaseReferenceConflictError`.
The existing status-transition and idempotent-save behavior is unchanged and only saves once per outcome (binding
and status change share one `save` call, not two). `PaymentEventHandler` threads the correlation through and logs
(then rethrows) on conflict, matching the plan's "redacted identifiers, not raw payloads" logging intent; the
`PaymentWebhookController` needed no change; a rethrown, uncaught error already surfaces as `500` via Nest's default
exception filter, proven by an existing spec (`payment-webhook.controller.spec.ts`'s "lets event-handling failures
surface for provider retry").

`PaddlePaymentProvider.parseEvent` now extracts and type-guards `purchaseId` from the verified event's `customData`
for both paid and failed event kinds, never trusting it for anything but correlation. `StubPaymentProvider.parseEvent`
does the same from its already-`unknown`-typed JSON payload. The shared `payment-provider.contract.ts` gained a
case proving a purchase ID round-trips through parsing unchanged, exercised by both adapters.

Every touched or newly-relevant spec was updated or added: `typeorm-payment-purchase.store.spec.ts` (bind-on-fallback,
unknown-ID, same-reference-is-not-a-conflict, and genuine-conflict cases, alongside the untouched original
reference-only cases), `payment-event.handler.spec.ts` (correlation forwarding and conflict pass-through),
`paddle-payment-provider.spec.ts` (its `serializeEvent` helper now embeds `custom_data.purchaseId` when present),
and `payment-event.handler.integration.spec.ts` (a new real-Postgres case: seed a purchase with a null reference,
deliver the same early paid event concurrently twice, assert one bound reference, one paid status, and exactly one
credit grant -- this is what surfaced the equality-vs-null-check concurrency bug above). `bruno/credit-purchases`'s
`06-deliver-paid-webhook.yml` now sends `purchaseId` alongside the existing `providerReference`.

Amount, organization, and credit values are still read only from the stored purchase row, never from event-supplied
data (`claimedCredits` in the stub Bruno payload and the request-body `credits: 999999` in `02-create-purchase.yml`
both continue to be ignored, unchanged from before this plan).

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

**Focused Jest** (`src/lead-email-finder-api/src/payments`, `--runInBand`): 10/11 suites, 58/60 tests (the 11th
suite is this plan's own Postgres integration spec, environment-gated and run separately below).

**Real-Postgres integration** (`TEST_PAYMENT_WEBHOOK_POSTGRES_URL` against a disposable `lef_payments_test`
database, dropped afterward): 2/2 tests passing --
- Pre-existing case (unchanged): concurrent delivery of an already-referenced paid event grants exactly once.
- New case: a purchase seeded with `providerReference: null`, delivered the same synthetic paid event
  (`event-paid-early`, a fresh synthetic `stub_<uuid>` reference, real `purchaseId`) concurrently twice -> exactly
  one bound reference, one `paid` status, one `CreditGrant` row, balance moved by exactly the pack's credits once.

Repo-wide: `lint` (2 pre-existing baseline warnings only), `typecheck`, `build` (437 files) all clean; `test:ci`
719/719 non-skipped (up from 711 -- the 8 new unit/contract tests added by this plan); `git diff --check` clean.

**Bruno**: `bruno/credit-purchases`'s `06-deliver-paid-webhook.yml` now sends `purchaseId` alongside
`providerReference`; not run live in this environment (see Surprises & Discoveries -- no `OWNER_ACCESS_TOKEN`
minting path exists here, same gap already recorded in `module-boundaries/04`). Substituted with the real-Postgres
integration evidence above, which exercises the exact same store/handler code path the webhook controller calls.

## Plan readiness

Implemented and validated (unit, contract, and live real-Postgres concurrency proof). `bruno/credit-purchases`
itself unverified live for the environment reason above. See Progress and Outcomes & Retrospective.
