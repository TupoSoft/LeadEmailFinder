# Observe Existing Provider Checkouts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Payments can inspect an existing provider checkout after losing its creation response, without creating another
transaction. A narrow read port returns authenticated provider evidence and explicit incomplete or conflicting
results. This PR supplies a tested capability for the durable workflow without changing customer HTTP behavior.

## Progress

- [ ] (2026-09-17) Define provider observation contracts and immutable correlation inputs.
- [ ] (2026-09-17) Implement Paddle and stub adapters with shared behavioral tests.
- [ ] (2026-09-17) Verify REST pagination, evidence validation, and the unchanged SDK create path.

## Plan dependencies

- `payments/05`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Model observation separately from checkout creation. Rationale: a read retry must never repeat an
  ambiguous external create. Date: 2026-09-17. Author: Codex.
- Decision: Zero matches is inconclusive, not proof of absence. Rationale: the consulted Paddle documentation gives
  no visibility deadline that makes a negative scan authoritative. Date: 2026-09-17. Author: Codex.
- Decision: Keep the stub deterministic and identify that guarantee in its adapter contract. Rationale: a local
  calculated URL has different effects from a Paddle transaction; its behavior must not imply Paddle idempotency.
  Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/payments/src/application/ports/payment-provider.ts` exposes `createCheckout` and `parseEvent`.
`infrastructure/paddle/paddle-client.ts` exposes only transaction creation and webhook verification.
`paddle-payment-provider.ts` already sends purchase and organization IDs in `customData`; completed events map to
paid evidence after validating gross totals and currency. The package range is `^3.10.0`; inspect the installed
version before implementation and retain tests against the actual SDK surface.

Read the module architecture instructions and the module documentation for payments, credits, and identity before changing shared
settlement code. Use the repository Paddle webhook skill. Framework and SDK types stay in infrastructure.

## Scope and Non-Goals

Add a provider observation port, plain evidence types, adapters, and tests. Do not schedule scans, add persistence,
change endpoints, grant credits, modify catalog resources, or introduce a new payment provider. Plan 03 owns
matching scan results to durable attempts, retry policy, and settlement. This PR represents exactly one pull request.

## Plan of Work

Add `application/ports/checkout-observer.ts` and `domain/checkout-observation.ts`. The port supports retrieving a
known reference and reading one candidate page. Inputs contain provider/environment, local purchase and
organization IDs, the persisted price ID and quantity, expected currency, the original checkout-page URL,
dispatch time, a fixed `scanUpperBound`, `orderBy: 'id[ASC]'`, and an optional opaque cursor. Page results contain plain observations, an opaque next cursor,
and explicit completion information. A successful page with zero candidates does not mean the whole scan finished.
Use typed failures for unavailable provider reads, malformed evidence, and provider/environment mismatch.

Extend `PaddleClient` with transaction `get` and an infrastructure-only `transactions.listPage`. Implement the latter
with authenticated REST GET `/transactions`, consuming documented `data` and `meta.pagination`; the SDK collection
does not expose a durable continuation token through its public interface. Keep SDK creation and known-reference
GET behind the same existing composition boundary. Never inspect or cast private SDK pagination fields.

Without a known reference, request `origin=api`, all statuses, `order_by=id[ASC]`, `per_page` at most 30, and
`created_at[GTE]` / `created_at[LTE]` bounds from dispatch minus five minutes through `scanUpperBound`. Keep both
bounds and ordering fixed throughout one full scan. If `has_more=false`, finish and ignore `next`, which Paddle
may still populate on the last page. Otherwise, require a valid continuation URL with the configured Paddle API
origin, `/transactions` path, unchanged filters/order, and an `after` cursor. Extract only that cursor and rebuild
the next request from trusted configuration and the original scan inputs. Never forward authorization to an
unchecked URL. Return only plain evidence and the opaque cursor across the port. An empty page with continuation
is incomplete; repeated cursors or invalid pagination produce an explicit incomplete/error result.

Persisting progress belongs to plan 03. On the next full scan advance the upper bound and restart from the original
lower bound; delayed visibility must not be excluded forever. Do not add an unsupported custom-data query filter.

Decode SDK `customData` and REST `custom_data` into the same plain evidence types. A broad list normally includes
unrelated records: skip missing or different purchase IDs. For a record claiming this purchase, validate its
organization and immutable terms; preserve conflicting correlated evidence so it prevents unique-match adoption.
Do not silently drop a conflict and treat the remaining candidate as unique. Retain transaction ID, status, price IDs and quantities, currency,
the redirect URL, and completed gross totals. Reuse pure validation helpers extracted from the current completed-event
mapping where needed. Validate positive safe-integer gross totals and matching totals currency for `completed`;
`paid` alone is not completed evidence. The observed price and quantity must match the purchase snapshot. Gross totals
can differ from catalog prices because of tax or discount rules; never replace settled gross totals with catalog
amounts. Do not fabricate a webhook event ID for a provider read.

Implement the stub observer as deterministic calculation from the same immutable checkout inputs and reference
format as its create operation. It may reconstruct its local checkout because creation has no external effect;
document this capability explicitly. Shared observer tests cover evidence shape and no credit effects. Stateful
fault tests use a dedicated fake, not invented guarantees in the ordinary stub.

Test the REST page adapter and installed SDK through intercepted HTTP responses. Verify actual query serialization
and public pagination metadata. Cover a final page with a nonempty next URL, an empty intermediate page with continuation,
repeated cursors, foreign-origin continuation, conflicting filters, and invalid responses. Keep create
single-attempt: its request timeout remains an unknown outcome, and no SDK or wrapper retry may send another POST.

## Interfaces and Dependencies

The proposed port provides `getCheckoutObservation(input)` and `listCheckoutObservations(input)` with plain
return values. Wire it through a payments-owned injection token and factories in `payments.module.ts`. Avoid a
provider-wide generic manager. The Paddle API key needs `transaction.read`; document this permission in
`docker/paddle-dev/README.md` without reading or printing credentials. Keep the existing API and public barrel.
Proposed PR title: `feat(payments): observe existing provider checkouts`.

## Acceptance Criteria

- Known-reference observation performs one GET and no create.
- Missing-reference observation pages through supported REST queries and returns correlation metadata locally.
- Empty, incomplete, failed, or repeated-cursor scans never authorize another create.
- Continuation survives adapter restart with fixed bounds/order; an untrusted next URL never receives credentials.
- Unrelated transactions are skipped; a conflicting record claiming this purchase prevents unique adoption.
- Mismatched organization, price, quantity, currency, or provider context cannot become valid settlement evidence.
- Completed gross totals use the same validation as signed completed webhooks; pending processing grants nothing.
- The ordinary stub remains deterministic and does not require Paddle credentials.
- Both adapter contracts pass and existing create and webhook behavior remains unchanged.

## Validation

Add the named observer suites, then run:

```sh
corepack pnpm test -- src/libs/modules/payments/src/infrastructure/paddle/paddle-checkout-observer.spec.ts src/libs/modules/payments/src/infrastructure/stub-checkout-observer.spec.ts src/libs/modules/payments/src/infrastructure/paddle/paddle-payment-provider.spec.ts src/libs/modules/payments/src/infrastructure/stub-payment-provider.spec.ts src/libs/modules/payments/src/payments.module.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
git diff --check
```

Bruno is not applicable to this inactive internal read capability: no endpoint, wiring behavior at HTTP, or
customer response changes. Account-bound sandbox reads are optional supporting evidence; automated REST-adapter and SDK
contract tests must not require live credentials. Record actual installed SDK version and executed evidence.

## Idempotence and Recovery

Observation is read-only at the provider. Retrying GET or list does not create checkouts. No schema reset is needed.
Keep temporary intercepted responses and fake transactions synthetic and local. Do not call real Paddle creation
or mutate notification subscriptions to validate this PR.

## Artifacts and Notes

Primary references checked on 2026-09-17:

- [Paddle retry guidance](https://developer.paddle.com/sdks/libraries/): no client-supplied idempotency key contract
  for arbitrary operations; a timed-out create may already have succeeded.
- [List transactions](https://developer.paddle.com/api-reference/transactions/list-transactions/) and
  [get a transaction](https://developer.paddle.com/api-reference/transactions/get-transaction/): read permissions,
  time filters, all statuses, custom data, and returned provider evidence.
- [SDK transaction resource at 3.10.0](https://github.com/PaddleHQ/paddle-node-sdk/blob/v3.10.0/src/resources/transactions/index.ts)
  and its `operations/list-transaction-query-parameters.ts`: existing create/get surface and filter mappings.
- [Paddle pagination](https://developer.paddle.com/api-reference/about/pagination/): public continuation metadata
  and the rule to use `has_more`, rather than the presence of `next`, to detect completion.

The no-match policy is a conservative application decision, not a claimed Paddle consistency guarantee.

## Plan readiness

Ready to implement.
