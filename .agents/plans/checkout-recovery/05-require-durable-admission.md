# Require Durable Checkout Admission

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Every newly accepted credit checkout uses the durable, keyed workflow. After the browser and repository clients
understand asynchronous preparation, remove the temporary no-header path so no caller can accidentally create an
unrecoverable purchase through the old synchronous implementation.

## Progress

- [ ] (2026-09-17) Update remaining repository callers and require the checkout idempotency header.
- [ ] (2026-09-17) Remove the old creation branch and align generated contracts and developer instructions.
- [ ] (2026-09-17) Run rejection, workflow, client, and architecture validation.

## Plan dependencies

- `checkout-recovery/04`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Remove the compatibility path in a separate PR after browser adoption. Rationale: each intermediate
  commit remains usable, and the final system has one creation workflow. Date: 2026-09-17. Author: Codex.
- Decision: Keep one-time pack input and existing billing permissions. Rationale: request identity is additional
  transport metadata; prices and organization selection remain server-controlled. Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 03 adds keyed durable admission to `POST /v1/credit-purchases`, a status endpoint, and generated response
unions while retaining no-header creation for the old browser. Plan 04 updates the browser to persist a request
key and handle `201`, `202`, and ready or terminal `200` results. The existing Bruno collection and Paddle fixture documents
also contain immediate-URL assumptions. `docker/paddle-dev/README.md` currently tells developers to create a fresh
purchase after a failed non-idempotent request; that instruction becomes unsafe for an unresolved durable attempt.

Read the module architecture contract and affected module documentation before editing. This PR spans API contract publication,
repository API callers, and developer documentation; it does not redesign the browser workflow delivered in plan 04.

## Scope and Non-Goals

Require `Idempotency-Key`, remove the synchronous no-job creation branch, and update all maintained callers and
instructions in this one PR. Preserve the durable states, wait budget, observer policy, and ready URL validation
from plan 03. Do not add another endpoint, a compatibility flag, a new provider, migrations, an administrative
force-retry action, or production rollout work. This PR unlocks the final development crash fixture in plan 06.

## Plan of Work

Search repository sources, generated clients, Bruno requests, test helpers, and developer docs for
`credit-purchases` and `createCheckout`. Update every intentional creation call to supply one canonical lowercase
UUID version 4 key per logical attempt. Reuse that key on an equivalent retry; create another only for an explicitly new
purchase. Do not mechanically add random key generation to a low-level HTTP function, because that would change
the identity on every retry. Confirm that the browser owner introduced in plan 04 supplies the key from its recovery record.

In `src/libs/modules/payments/src/api/http/credit-purchase.controller.ts`, make the header mandatory and keep the
existing duplicate/combined-header rejection. Missing or invalid keys return `400` before catalog reads,
persistence, or provider work. Delete the dispatch branch that selects old `CreditPurchaseService.start()` when
no header is present. Remove now-unused synchronous creation wiring and internal methods only where reference
search confirms they have no other owner. Preserve the guarded purchase store methods used by webhooks and workers.

Retain the read-only status GET endpoint with `billing:manage` permission, the existing purchase history
projection with `billing:read` permission, and the typed `200`/`201`/`202` union. Regenerate Swagger/browser contracts through the existing
OpenAPI commands, never by hand. Update DTO and HTTP integration tests to make missing-header rejection explicit.
Keep malformed body, authentication, Origin/CSRF, key conflict, and cross-organization tests.

Update `bruno/credit-purchases/02-create-purchase.yml`, `26-create-failed-fixture.yml`, and any requests added by
plan 03. Separate variables for deliberate distinct purchases from variables reused for replay. Ready and pending
responses must both be handled; poll only the returned safe status path with bounded waits. Update collection
counts in `scripts/bruno/run-collection.mjs`, launcher tests, and any other contract inventory affected by new
requests. Keep stub webhook credit, adjustment, inverse, and held-credit assertions intact.

Rewrite `docker/paddle-dev/README.md` to show the required header, the `202` status path, and same-key recovery after
a lost response. Explicitly remove the fresh-purchase-on-uncertainty instruction. Document that API keys need
transaction read access and that unavailable or unresolved results do not authorize another provider create.
Update the payments and Bruno documentation and API examples. Do not rewrite completed historical ExecPlans to pretend
this behavior existed when they were delivered.

## Interfaces and Dependencies

Final POST body remains `{ packId }`. `Idempotency-Key` is required; ownership derives exclusively from the
current principal. Equal keys are scoped to the organization and retained with the purchase. The status endpoint
and response variants remain those defined by plan 03. No additional public module export is needed.
Proposed PR title: `refactor(payments): require durable checkout admission`.

## Acceptance Criteria

- If the key is missing, malformed, repeated, or combined, the API returns `400` before creating a purchase, job, or provider request.
- Every successful new checkout commits exactly one purchase/job pair and runs through the durable worker.
- Equivalent retries, including after an HTTP response is lost, resolve the same purchase. A changed pack returns
  `409`; a catalog change cannot alter an admitted attempt.
- Both the browser and maintained API examples handle ready, preparing, reconciling, and terminal responses.
- A fresh attempt with `checkoutStatus: ready` returns `201`. Ready replay and completed/failed/unavailable return `200`, and unfinished work returns
  `202` with the status location. Removing the compatibility path does not change this matrix.
- No application creation path calls Paddle before durable dispatch, and no old no-header fallback remains.
- Existing history, payment confirmation, refund, credit reservation, authorization, and redirect-origin contracts
  remain valid. The credit-purchase collection executes every request, and its count matches the updated inventory.

## Validation

Run the following after implementation and contract generation:

```sh
corepack pnpm test -- src/libs/modules/payments/src/api/http/credit-purchase.controller.spec.ts src/libs/modules/payments/src/api/http/checkout-http.integration.spec.ts src/libs/modules/payments/src/application/checkout-admission.spec.ts --runInBand
corepack pnpm test:credits-postgres
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:credit-purchases
corepack pnpm test:oidc-runners
corepack pnpm --filter ./apps/web test:ci src/features/billing src/routes/BillingPage.test.tsx
corepack pnpm --filter ./apps/web typecheck
corepack pnpm architecture:check
corepack pnpm typecheck
git diff --check
```

Rerun the plan 04 focused browser test for a lost response and same-key recovery after this removal. Bruno runtime
requires the owned stub stack; report unavailable runtime separately from static validation. Do not count generated
client compilation as proof of browser navigation or provider reconciliation.

## Idempotence and Recovery

This PR adds no schema. Existing jobs and keys retain their meaning. If a development client still omits the key,
update that caller instead of restoring the unsafe branch. Use the current disposable PostgreSQL test runner for
repeatable database checks. A full `dev:reset` is unnecessary for contract-only changes and must not be run merely
to clear an unresolved request. Inspect the same purchase using its key or authenticated status resource.

## Artifacts and Notes

Record the final search of maintained callers and the exact OpenAPI and Bruno inventory checks. Historical plans
are not runnable API examples and remain historical. Start the synced issue only when implementing this plan,
following root `AGENTS.md`; authoring this file does not change GitHub state.

## Plan readiness

Ready to implement.
