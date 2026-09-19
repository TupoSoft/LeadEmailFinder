# Give Payment Consumers Explicit Application Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Payment controllers and collaborating use cases should accept small contracts that describe the operations they
need. A developer can supply a typed object fake without inheriting a concrete service or asserting through
`unknown`, while the real Nest module resolves the same existing catalog and service instances. Checkout, customer
catalogs, purchase history, and payment webhooks retain their current behavior.

This plan maps to one implementation pull request. Proposed commit subject and PR title:
`refactor(payments): inject explicit application contracts`.

## Progress

- [ ] (2026-09-17) Extract the payment consumer contracts and their independent value and error types.
- [ ] (2026-09-17) Bind the existing implementations once and migrate the selected consumers.
- [ ] (2026-09-17) Verify typed fakes, real module resolution, and existing HTTP and payment behavior.
- [ ] (2026-09-17) Update module documentation and record completed validation and architectural review.

## Plan dependencies

None.

## Surprises & Discoveries

The current canonical layer matrix permits `api` to import `application`. `CreditPackCatalog` is framework-free,
so its use by `BillingCreditPacksController` is not a forbidden infrastructure import. The concrete problem is the
consumer contract: the controller needs only `listForCustomer`, purchase creation needs only `get`, and the class's private
state makes structural test substitution inconvenient.

Existing tests demonstrate this cost. `credit-purchase.service.spec.ts` casts a catalog fake through `unknown`;
`credit-purchase.controller.spec.ts` does the same for `CreditPurchaseService`; the webhook and event-handler suites
cast `PaymentEventHandler` and `PaymentAdjustmentHandler`. These are existing test seams, not hypothetical providers.

`payments.module.spec.ts` compiles the real module with repository and configuration overrides. Its identity
repository overrides are still necessary because imported Nest modules instantiate their internal providers;
replacing a public injection token does not remove that requirement.

## Decision Log

- Decision: Add consumer contracts at the existing application boundaries, with symbol tokens and no new service
  layer. Rationale: Existing implementations already own the behavior; their consumers need independent types.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Separate customer catalog reads from checkout catalog lookup, and checkout creation from purchase
  history. Rationale: Each capability has a different result exposure or operation, and each consumer needs only
  its declared operations. Date/Author: 2026-09-17, Codex planning.
- Decision: Leave the concrete credits dependency for `dependency-inversion/02`. Rationale: Credits owns that
  public contract, and its payment and verification consumers must migrate together in that separate PR.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Keep class factories and alias their instances with `useExisting`. Rationale: Configuration parsing
  and service lifetime remain unchanged, and concrete implementations belong in the composition root.
  Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All payment paths below are relative to `src/libs/modules/payments/`. `src/api/http/` owns transport behavior;
`src/application/` owns the catalog, purchase workflow, and event and adjustment handling;
`src/application/ports/` already contains provider, persistence, redirect, and logging contracts.
`src/payments.module.ts` constructs framework-free classes using factories and registers their class tokens.

`BillingCreditPacksController` calls `CreditPackCatalog.listForCustomer()`. The catalog parses
`PAYMENTS_CREDIT_PACKS`, freezes its entries, and projects only customer-safe fields in deterministic order.
`CreditPurchaseService` calls `get(packId)`, saves a pending purchase, creates a provider checkout, validates the returned
redirect, then binds the provider reference. Provider or redirect failure marks the purchase failed and raises
`PaymentCheckoutError`. `CreditPurchaseController` maps known failures to the current HTTP responses and projects
purchase history to safe fields.

`PaymentWebhookController` verifies the raw webhook through `PaymentProvider` before invoking `PaymentEventHandler`.
That handler delegates adjustment events to `PaymentAdjustmentHandler`; paid events record payment, grant credits,
then record that the credit grant completed. Adjustment processing claims durable work, applies the idempotent
credit operation, then records the actual applied amount. Changing constructor types must preserve this ordering.

Completed plans `module-architecture/09` and `frontend/10` established the layers and customer billing HTTP
surfaces. This plan adds consumer contracts to that implementation; it does not repeat either plan or reopen
financial behavior delivered by `payments/06` and `verification-billing/02`.

## Scope and Non-Goals

Change the three controllers, four application classes, module wiring, directly affected tests, and payments
README. Add the contract files specified below. Keep payment contracts internal to the payments module: its public
TypeScript barrel continues to expose only the configuration vocabulary and `PaymentsModule`.

Preserve routes, DTOs, OpenAPI, permissions, provider selection, configuration validation, database schema, catalog
values, financial calculations, idempotency keys, logs, and error mapping. Do not replace provider or persistence
ports, wrap TypeORM inside another abstraction, move pure accounting functions, add alternate providers, or edit
frontend code. No migration, data reset, or new dependency is required.

## Plan of Work

First create the six port files below. Put `CustomerCreditPack` in
`src/domain/customer-credit-pack.ts`, with explicit `readonly` `id: string`, `credits: number`, `amountMinor: number`,
and `currency: string` fields. Move `StartedCreditPurchase` into the checkout port file; it retains `readonly`
`purchase: PurchaseRecord` and `redirectUrl: string`. Move `PaymentCheckoutError` to
`src/application/credit-purchase.error.ts`, preserving its name, message, and cause. Consumers must no longer
import a concrete implementation to obtain an error or result contract. Keep `CreditPack`, `CreditPackNotFoundError`,
`PurchaseRecord`, and `PaymentEvent` in their existing domain files.

Have `CreditPackCatalog` implement both catalog interfaces, `CreditPurchaseService` implement checkout and history,
and the two handlers implement their event-processing interfaces. Keep all business method bodies unchanged except
for imports and declared types. Change the purchase service's catalog parameter to `CreditPackReader` and the event handler's
adjustment parameter to `PaymentAdjustmentProcessor`. Application code remains free of Nest decorators.

In `src/payments.module.ts`, retain one factory for each implementation and add `useExisting` aliases for the six
tokens. Update factory `inject` arrays and argument types for the two changed application dependencies. Add explicit
`@Inject` annotations to the controller parameters and type those parameters as the new contracts. The purchase
controller takes purchase-creation and history capabilities separately; both resolve to the same `CreditPurchaseService`.
Preserve current Nest exports for compatibility, and do not expand the public TypeScript barrel.

Replace concrete-class test fakes and casts at these seams with objects checked against the port interfaces.
Extend `src/payments.module.spec.ts` to compile the actual module, resolve every new token, prove each alias is
the same instance as its class provider, and exercise controller delegation with representative results.
The current helper replaces `PaymentEventHandler` and `PaymentAdjustmentHandler` with empty objects. Remove
those two replacements in the new composition scenarios and substitute their dependency ports so the real
event-to-adjustment factory is constructed and exercised. Retain necessary identity repository overrides.
Extend the existing HTTP integration suite to exercise the
new token bindings with real authentication and serialization. Add
`src/api/http/billing-credit-packs.controller.spec.ts` to resolve the controller with a typed catalog fake at the
new token and no concrete catalog provider. Update `README.md` to describe the internal contracts and validation evidence.

## Interfaces and Dependencies

Each file below is under `src/application/ports/`, exports the named interface and a uniquely named `Symbol`, and
imports only independent domain or public module contracts. Do not define interfaces using `Pick`, `Parameters`,
or `ReturnType` of implementation classes.

| File | Interface and token | Exact operation |
| --- | --- | --- |
| `customer-credit-pack-catalog.ts` | `CustomerCreditPackCatalog`, `CUSTOMER_CREDIT_PACK_CATALOG` | `listForCustomer(): readonly CustomerCreditPack[]` |
| `credit-pack-reader.ts` | `CreditPackReader`, `CREDIT_PACK_READER` | `get(packId: string): CreditPack` |
| `credit-purchase-checkout.ts` | `CreditPurchaseCheckout`, `CREDIT_PURCHASE_CHECKOUT` | `start(principal: AuthPrincipal, packId: string): Promise<StartedCreditPurchase>` |
| `credit-purchase-history.ts` | `CreditPurchaseHistory`, `CREDIT_PURCHASE_HISTORY` | `listForOrganization(organizationId: string): Promise<PurchaseRecord[]>` |
| `payment-event-consumer.ts` | `PaymentEventConsumer`, `PAYMENT_EVENT_CONSUMER` | `handle(event: PaymentEvent): Promise<void>` |
| `payment-adjustment-processor.ts` | `PaymentAdjustmentProcessor`, `PAYMENT_ADJUSTMENT_PROCESSOR` | `handle(event: PaymentAdjustmentEvent): Promise<boolean>` |

Export `PaymentAdjustmentEvent` from the processor contract as
`Extract<PaymentEvent, { kind: 'purchase_adjustment_debit' | 'purchase_adjustment_restore' }>`; this derives from a
stable domain union, not an implementation. `AuthPrincipal` continues to come from identity's bare public barrel.
The contracts preserve synchronous catalog reads, asynchronous workflows, mutability guarantees, and existing
exception types. Introduce no endpoint, configuration key, package, or cross-module dependency.

## Acceptance Criteria

- The three payment controllers and the selected catalog/adjustment collaborators depend on interfaces and explicit
  tokens; none imports the replaced implementation for a constructor type or a contract type.
- A plain typed fake implements each consumer seam without a concrete-class assertion, private state, Nest, or a
  database. Existing checkout, event, adjustment, and controller tests retain their success and failure assertions.
- The actual `PaymentsModule` resolves every new token and proves its identity with the one existing implementation
  instance. Controller resolution succeeds without runtime metadata inference for an erased interface.
- Catalog responses still expose exactly `id`, `credits`, `amountMinor`, and `currency`, ordered by credits then ID;
  unknown pack lookup still raises `CreditPackNotFoundError` before creating a purchase.
- The checkout flow remains organization-scoped and server-priced; unsafe redirects still fail the purchase and return the
  same generic `502`. Invalid pack/input, unauthenticated, and unauthorized requests retain their current outcomes.
- Webhook signature rejection, ignored and unknown events, purchase-reference conflicts, grant ordering, adjustment
  replay, shortfall, inverse restoration, and failure propagation retain existing behavior and log calls.
- The public payment barrel, schemas, OpenAPI responses, and provider contracts remain unchanged. The architecture
  gate, focused tests, type checking, and documentation checks pass, with runtime limits reported accurately.

## Validation

Run from the repository root after implementation. These are required commands, not completed evidence:

```sh
corepack pnpm architecture:check
corepack pnpm test -- src/libs/modules/payments/src/application/credit-pack-catalog.spec.ts src/libs/modules/payments/src/application/credit-purchase.service.spec.ts src/libs/modules/payments/src/application/payment-event.handler.spec.ts src/libs/modules/payments/src/application/payment-adjustment.handler.spec.ts src/libs/modules/payments/src/api/http/billing-credit-packs.controller.spec.ts src/libs/modules/payments/src/api/http/credit-purchase.controller.spec.ts src/libs/modules/payments/src/api/http/payment-webhook.controller.spec.ts src/libs/modules/payments/src/api/http/billing-http.integration.spec.ts src/libs/modules/payments/src/payments.module.spec.ts --runInBand
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/payments/README.md .agents/plans/dependency-inversion/01-decouple-payment-consumers.md
```

The module test must exercise the real provider graph, not only inspect decorator metadata. Retain static checks
and the existing HTTP integration coverage even when no running development stack is available.

When the development stack owned by this worktree is available, run `corepack pnpm bruno:credit-purchases`; its existing
collection covers purchase creation, catalog/history, signature rejection, billing, replay, and adjustments. Update its
existing catalog and unknown-pack requests with meaningful contract assertions: catalog field types and
ordering must match the selected fixture, and unknown-pack rejection must preserve the purchase count. Reuse
the existing request sequence where possible, adding a read only when needed to observe that invariant.
Integration wiring requires this coverage update even though HTTP behavior is unchanged. Report Bruno execution
as unverified when the stack is unavailable. Do not claim a real Paddle sandbox run from stub or unit evidence.

## Idempotence and Recovery

Contract extraction and alias registration have no persistent side effects. Reapplying the changes must not create
additional provider instances or duplicate webhook handling. Rerun focused tests after a partial implementation.
For rollback, revert the contract, consumer, and wiring edits together; no schema or data restoration is needed.
Preserve unrelated worktree edits and existing test fixtures. Do not reset development data to complete this plan.

## Artifacts and Notes

Repository inspection on 2026-09-17 establishes the current dependency and test-cast evidence; no implementation
or runtime validation has occurred for this plan. Its outcome is independent of new product decisions.
`dependency-inversion/02` follows to replace the shared credits contracts after this PR stabilizes payment files.
At implementation start, follow root `AGENTS.md` for the synced issue assignment and project status; at PR creation,
use this plan's conventional subject, assign the requester, and include the synced issue's closing keyword.

## Plan readiness

Ready to implement
