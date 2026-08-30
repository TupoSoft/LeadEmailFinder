# Layer Payments Without Changing Financial Semantics

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Put the payments capability behind explicit API, application, domain, and infrastructure layers after its refund and
chargeback behavior is complete. The same routes and provider contracts continue to expose checkout creation,
purchase listing, signed webhook processing, idempotent credit grants, refund debits, inverse adjustments, and failure
recovery. Payment use cases no longer inject TypeORM, configuration, Paddle, or Nest HTTP concerns. A developer can
observe the result through the folder layout, a clean architecture report, the real-PostgreSQL payment
tests, the stub Bruno collection, and the Paddle sandbox workflow with unchanged balances and statuses.

## Progress

- [ ] (2026-08-29) Reconcile the final payment and adjustment contracts delivered by `payments/06` with the target layers.
- [ ] (2026-08-29) Move payment models, policies, ports, and use cases into domain and application without framework dependencies.
- [ ] (2026-08-29) Move controllers, DTOs, configuration, TypeORM stores, and stub/Paddle providers into API and infrastructure.
- [ ] (2026-08-29) Recompose `PaymentsModule` and preserve checkout, webhook, grant, credit-reversal, and recovery behavior.
- [ ] (2026-08-29) Shrink the architecture baseline and complete focused, PostgreSQL, Paddle, Bruno, and full validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/08`
- `payments/06`

## Surprises & Discoveries

- Payments already has useful `PaymentProvider` and `PaymentPurchaseStore` seams, but most controllers, DTOs,
  services, entities, configuration parsing, and event handling remain flat under `src/`. `CreditPurchaseService`
  injects both `Repository<CreditPurchase>` and `ConfigService` directly.
- `CreditPurchaseResponseDto` imports `CreditPurchaseStatus` from the TypeORM entity, so the HTTP schema currently
  treats a persistence enum as a transport contract.
- `PaymentsModule` imports `IdentityModule`, and its module test overrides every exported identity repository even
  though payments owns only `CreditPurchase`. Plan 08 removes that compatibility surface before this refactor.
- Plan `payments/06` delivers adjustment entities, store ports, and credit-operation outcomes based on the
  insufficient-balance policy settled by that plan. This plan must layer those contracts rather than replace or
  reinterpret them.

## Decision Log

- Decision: Put purchase and adjustment states, credit-pack values, event classifications, financial invariants, and
  domain errors under `src/domain/` as plain TypeScript. Keep TypeORM entities and mapping under
  `src/infrastructure/persistence/typeorm/`.
  Rationale: Payment rules must be testable without a database or framework, while the existing table representation
  remains an adapter detail.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Put checkout, listing, webhook, and adjustment orchestration under `src/application/`, depending on
  purpose-specific purchase, adjustment, catalog, provider, and credit ports. Inject already-resolved typed
  configuration through adapters rather than reading `ConfigService` inside use cases.
  Rationale: Application services own workflow and recovery decisions; Nest configuration and external provider SDKs
  are infrastructure concerns.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep HTTP controllers and DTOs under `src/api/http/`; map domain/application results into response DTOs
  without importing a TypeORM entity.
  Rationale: Validation, serialization, authentication decorators, and HTTP exception translation belong at the
  delivery boundary.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the exact financial behavior delivered by `payments/06`, including the settled
  insufficient-balance policy, partial-adjustment arithmetic, cumulative caps, inverse-adjustment handling,
  idempotency references, concurrency serialization, and retry convergence.
  Rationale: Architecture work must not become a second product-policy decision or invalidate audited ledger
  behavior.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep the top-level public barrel limited to `PaymentConfiguration`, provider/environment names, and
  `PaymentsModule`. All payment use cases, entities, provider ports, tokens, and adapters remain private.
  Rationale: Other modules compose payments through HTTP and the module, not through its internal transaction model.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the existing payment and adjustment schemas through TypeORM synchronization; add no migration,
  backfill, provider-event replay job, or production rollout mechanism.
  Rationale: This repository still has disposable development data and no production migration history.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/payments/src/payments.module.ts` currently composes `CreditPurchaseController`,
`PaymentWebhookController`, `CreditPurchaseService`, `PaymentEventHandler`, the TypeORM purchase store, the stub
provider, and the Paddle provider. Files such as `credit-purchase.entity.ts`, `credit-purchase.dto.ts`,
`credit-purchase.service.ts`, `payment-provider.ts`, and `payment-event.handler.ts` are peers at the source root.
Only some adapters already live under `infrastructure/`.

Creating a checkout persists a pending purchase, asks the selected provider for a redirect, then binds the provider
reference or marks the purchase failed. Signed webhook events locate a purchase by provider reference with a safe
purchase-ID fallback, transition it, and grant credits idempotently through the credits module. Plan `payments/06`
extends that flow with durable adjustments, debit, and restore operations, shortfall behavior, and concurrency/replay
recovery. Those behaviors are inputs to this plan.

Plan `module-architecture/03` ensures auth imports are public-only. Plan `module-architecture/04` provides the narrow
credits contract. Plan `module-architecture/08` removes identity repository exports, so payments cannot use
`IdentityModule` as a persistence shortcut. The plan-01 checker and
`scripts/architecture/module-architecture-baseline.json` provide the shrink-only enforcement mechanism.

## Scope and Non-Goals

Reorganize payments into `api/`, `application/`, `domain/`, and `infrastructure/`; separate persistence models from
domain records; move configuration and provider construction to infrastructure; recompose `PaymentsModule`; and
update focused tests, module documentation, and Bruno paths or assertions needed by the move. Include every
adjustment type and store delivered by `payments/06`.

Do not change the `POST` or `GET /v1/credit-purchases` routes, `POST /v1/payments/webhook`, permissions, validation,
serialization, HTTP statuses, webhook acknowledgment, signature rules, catalog format, payment-link URL compatibility,
provider event mapping, database schema, ledger references, credit arithmetic, or Paddle sandbox support. Do not add
customer payment data handling, refund-request endpoints, notifications, migrations, backfills, or production
deployment work.

## Plan of Work

First inspect the implemented `payments/06` diff and write a responsibility map for every production file. Define
plain domain records for purchases and adjustments and keep all delivered invariants in pure policies. Move the
provider event union and provider-independent financial event interpretation into domain/application contracts while
keeping raw Paddle and stub payload parsing in their adapters.

Under `application/`, create narrow use cases for starting a checkout, listing organization purchases, and processing
verified payment events. Depend on ports for catalog lookup, purchase/adjustment persistence, checkout/event
providers, and credits. Preserve the failure boundaries: a failed checkout marks only its purchase failed; an
unknown signed event is acknowledged without mutation; a claimed adjustment or applied ledger operation converges
on replay. Remove `ConfigService`, TypeORM decorators, repositories, Paddle types, Express request types, and Nest
HTTP exceptions from application and domain files.

Under `api/http/`, relocate controllers and DTOs. Translate an unknown pack to the existing `400`, a checkout
failure to the existing `502`, invalid signatures to the existing rejection, and successful or ignored webhooks to
the existing `200` acknowledgment. Define DTO status fields from a transport-safe domain enum or explicit union,
not from a TypeORM class.

Under `infrastructure/`, group payment configuration parsing and provider selection, the TypeORM purchase and
adjustment entities/stores/mappers, the deterministic stub adapter, and the Paddle SDK adapter. Preserve table names,
indexes, unique constraints, transaction locks, and early-webhook correlation. `PaymentsModule` remains the private
composition root, imports the public auth and credits modules it needs, registers private entities, and exports only
the existing intended surface. Remove the now-unnecessary `IdentityModule` import.

Move tests with their owners, add domain and application contract tests using fakes, and keep real-PostgreSQL tests
for lock, replay, early webhook, adjustment, and recovery behavior. Update `src/libs/modules/payments/README.md` and
any Paddle/Bruno links made stale by the move. Finally run `corepack pnpm architecture:baseline`; accept only removed
payment keys, never a new key caused by relocating the same forbidden edge.

## Interfaces and Dependencies

Externally visible interfaces remain:

- `POST /v1/credit-purchases` with `billing:manage`;
- `GET /v1/credit-purchases` with `billing:read`;
- The public `POST /v1/payments/webhook`, authenticated by the selected provider's signature;
- the existing `PaymentConfiguration`, `PaymentsProviderName`, `PaddleEnvironmentName`, and `PaymentsModule` barrel;
- All current `PAYMENTS_*` and `PADDLE_*` configuration keys and compatibility rules;
- `credit_purchases` and every adjustment table delivered by `payments/06`.

Internal application ports cover catalog lookup, creating checkouts, verifying events, persisting purchases and
adjustments, and idempotent credit grant/debit/restore operations. Adapters implement them without exposing Paddle
SDK or TypeORM types upward. This plan depends on public auth and credits contracts plus the completed identity seal;
it introduces no new inter-module dependency.

## Acceptance Criteria

- Payments has explicit `api`, `application`, `domain`, and `infrastructure` ownership, with its composition module
  importing only public module barrels.
- Domain and application files import no Nest HTTP, Nest configuration, TypeORM, Paddle SDK, Express, or provider
  adapter implementation.
- Controllers and DTOs import no TypeORM entity, and application use cases inject no repository or `ConfigService`.
- Starting, listing, completing, failing, and replaying a purchase produces the same stored states, response bodies,
  statuses, ordering, redirect URL, and credit results as before this plan.
- Invalid and tampered webhook signatures are rejected before mutation; ignored and unknown-reference signed events
  remain acknowledged without balance changes.
- Early completion correlation, duplicate completion, full/partial adjustments, concurrent adjustments, inverse
  adjustments, insufficient-balance handling, and injected-failure recovery retain the exact `payments/06` behavior.
- Stub and Paddle adapters satisfy the same provider contract tests, and the Paddle sandbox checkout plus replay and
  adjustment scenario remains valid.
- Table names, columns, indexes, uniqueness, transactions, and lock modes are unchanged; no migration exists.
- The payments public barrel contains no controller, service, port, entity, adapter, or provider SDK type.
- The shrink-only baseline update removes all payments violations without adding or renaming keys, and
  `corepack pnpm architecture:check` passes.
- Focused, real-PostgreSQL, full, build, documentation, Bruno, Compose, and secret-safety checks pass.

## Validation

Run the architecture and focused suites:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/payments/src src/libs/modules/credits/src --runInBand
    TEST_PAYMENT_WEBHOOK_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TEST_CREDITS_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- payment-event.handler.integration.spec.ts credits.service.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

The PostgreSQL run must include the `payments/06` concurrent partial-adjustment, debit/restore replay, shortfall, and
injected-failure cases after those tests are delivered. Inspect the baseline diff and reject any current-only key or
any new key that merely follows a moved file.

After confirming this checkout owns the disposable Compose project, start a stub stack with
`pnpm dev:reset -- --confirm-project=LEF`, require
`curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'`, export the short-lived credentials
documented in `bruno/credit-purchases/README.md`, and run:

    cd bruno/credit-purchases
    bru run --env local --sandbox developer

The collection must cover unauthenticated access, unknown packs, purchase creation/listing, paid-event grant,
duplicate replay, tampered signature, and every refund/clawback case added by `payments/06`. Restore the repository
root before subsequent commands.

Then follow `docker/paddle-dev/README.md` with sandbox-only secrets. Render the overlay with
`docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet` and start it with `up -d
--build`. Complete one starter purchase, replay its completion, and exercise the approved adjustment and inverse path
available after `payments/06`. Verify exact status, balance, and shortfall outcomes, deactivate the exact
fixture-owned notification destination, and return to a healthy stub stack. Do not claim a provider path passed if
Paddle sandbox cannot produce it; retain the signed fixture and PostgreSQL evidence and record the limitation.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/payments/README.md bruno/credit-purchases/README.md docker/paddle-dev/README.md .agents/plans/module-architecture/09-layer-payments.md
    git diff --check

No Bruno definition change is expected in this internal refactor because `payments/06` owns the adjustment requests.
Run the resulting collection against the stub stack; the real Paddle workflow remains a separate opt-in runtime
proof.

## Idempotence and Recovery

File moves and port extraction are repeatable. Add domain/application contracts and adapter mappings before removing
old imports, and use the architecture report to distinguish temporary move edges from finished design. Never recover
by widening the public barrel, importing a private path, or adding a baseline violation. A failed checkout remains
safe to abandon; a missed or partially processed signed webhook is recovered by replay under the existing
idempotency and adjustment records.

Before stopping a Compose stack, inspect its project labels and working directory so another checkout's resources are
not removed. Paddle cleanup must deactivate only the destination whose ID is stored by the fixture before stopping
the tunnel. Development database recovery uses `pnpm dev:reset -- --confirm-project=LEF`; no migration rollback or
manual schema repair is part of this plan.

## Artifacts and Notes

Record the final layer tree, application ports, public exports, removed baseline keys, focused and PostgreSQL totals,
stub Bruno totals, redacted Paddle transaction/notification suffixes, exact balance and shortfall deltas, full-suite
results, and cleanup proof. Never store full provider identifiers, webhook bodies, tokens, keys, customer data, or
card data.

## Plan readiness

Ready to implement.
