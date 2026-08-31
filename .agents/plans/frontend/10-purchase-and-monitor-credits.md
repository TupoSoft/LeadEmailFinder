# Purchase and Monitor Credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an organization owner understand the current credit balance, choose a server-defined credit pack, leave the
application for a hosted payment flow, and return to an authoritative purchase history. After this change, the billing
screen shows the current organization's balance and safe catalog, creates a `checkout` from a pack identifier only,
and renders `pending`, `paid`, `failed`, and `expired` purchases without inventing a payment result or balance. A
developer can observe the complete flow against the deterministic stub provider; a Paddle sandbox run is an
optional account-bound confirmation, not a prerequisite for accepting the pull request.

## Progress

- [ ] (2026-08-31) Add current-organization billing summary and customer-safe credit-pack endpoints with `OpenAPI` coverage.
- [ ] (2026-08-31) Regenerate the API client and implement the capability-gated billing and checkout routes.
- [ ] (2026-08-31) Render authoritative return, history, balance, and recovery states for every purchase status.
- [ ] (2026-08-31) Extend focused API, Bruno, component, accessibility, and stub-runtime browser coverage.
- [ ] (2026-08-31) Run repository, design-contract, generated-client, and premium UX validation and record results.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `module-architecture/09`
- `payments/03`
- `payments/04`
- `payments/05`
- `payments/08`

## Surprises & Discoveries

- `module-architecture/09` will move payment controllers, use cases, catalog policy, and adapters into their final
  layers without changing financial behavior. This plan must extend those layered boundaries rather than recreate
  the current flat source layout.

## Decision Log

- Decision: Add `GET /v1/billing/summary` for the caller's organization and
  `GET /v1/billing/credit-packs` for a customer-safe pack projection; neither request accepts an organization identifier.
  Rationale: A customer UI should not call the platform-only `/credits/:organizationId` surface or be able to select
  another tenant through request input.
  Date/Author: 2026-08-31, project planning.
- Decision: A customer-safe pack contains only `id`, `credits`, `amountMinor`, and `currency`; `providerPriceId` and other
  provider details remain server-side.
  Rationale: The server-owned catalog is the pricing authority, while a provider price identifier is an internal
  `checkout` implementation detail with no UI purpose.
  Date/Author: 2026-08-31, project planning.
- Decision: Order the public credit-pack catalog by `credits ASC, id ASC`.
  Rationale: JSON object insertion order is a configuration artifact, not a customer contract; a numeric order with
  a unique ID tie-breaker is stable and presents increasing pack sizes predictably.
  Date/Author: 2026-08-31, project planning.
- Decision: The browser starts `checkout` by sending only `packId` to the existing `POST /v1/credit-purchases` route
  and performs a top-level navigation to the returned hosted-payment URL only after a confirmed success response.
  Rationale: Client-supplied credit or money values are untrusted, and the hosted payment page keeps payment details outside
  this application.
  Date/Author: 2026-08-31, project planning.
- Decision: Validate every provider checkout URL on the server against an exact configured origin policy and repeat
  scheme/origin/credential checks in the browser before top-level navigation.
  Rationale: A provider adapter is an infrastructure boundary, not authority to turn an arbitrary returned string
  into an authenticated open redirect.
  Date/Author: 2026-08-31, project planning.
- Decision: Remove `provider` and `providerReference` from the customer purchase-history DTO and remove the stub
  provider reference from its return query.
  Rationale: Both are internal correlation details with no customer workflow purpose and must not enter the
  generated client, query cache, URL, or rendered markup.
  Date/Author: 2026-08-31, project planning.
- Decision: Purchase creation is pessimistic and is never retried automatically. A timeout or network failure is
  presented as an uncertain outcome and triggers an authoritative history refresh before the user may deliberately
  start another `checkout`.
  Rationale: Retrying the mutation can create a second purchase/provider transaction and an optimistic result can
  misstate money or credits.
  Date/Author: 2026-08-31, project planning.
- Decision: The checkout-return route may perform bounded, read-only refreshes while a purchase remains pending,
  but it never changes a status or balance locally and never resubmits `checkout`.
  Rationale: Webhook confirmation may lag the browser redirect; safe polling of organization-scoped reads improves
  feedback without fabricating a financial result.
  Date/Author: 2026-08-31, project planning.
- Decision: Server permission `billing:read` governs summary, catalog, and history access; `billing:manage`
  additionally governs the `checkout` action. Browser capabilities `billing.read` and `billing.manage` control
  presentation only, and every route keeps server authorization.
  Rationale: Read and spend privileges are distinct even though the current owner role has both.
  Date/Author: 2026-08-31, project planning.
- Decision: The billing UI extends the shared patterns and tokens in `DESIGN.md` and
  `UX-CONTRACT.md`; money, status, table/list, notice, and destructive/financial mutation behavior is not
  redefined locally.
  Rationale: Billing should look and behave like the authenticated shell while applying the stricter pessimistic
  rules already required for financial actions.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The payments module in `src/libs/modules/payments/` already owns the server-defined `CreditPackCatalog`, hosted
`checkout` orchestration, the `CreditPurchase` record, webhook handling, the deterministic stub provider, and the
Paddle sandbox adapter. `POST /v1/credit-purchases` requires `billing:manage`, accepts `{ packId }`, and returns a
purchase `id`, initial `status`, and `redirectUrl`. `GET /v1/credit-purchases` requires `billing:read` and returns
the caller organization's purchases newest first. A purchase may be `pending`, `paid`, `failed`, or `expired`.
A synchronous checkout-provider creation failure may mark its new purchase failed. Only a verified
provider webhook may mark a purchase paid and grant credits.

Prerequisite `module-architecture/09` relocates payment HTTP, application, domain, and infrastructure concerns while
preserving those routes and financial semantics. Implementation starts from that layered result: add the catalog
query to the payment application/API boundaries and keep provider/configuration details in infrastructure.

The missing read contracts block a safe customer billing screen. `CreditsController` in
`src/libs/modules/credits/src/api/credits.controller.ts` reads a balance only through
`GET /credits/:organizationId`, requires `platform:admin`, and is deliberately excluded from Swagger. The catalog
has only an internal `get(packId)` method, and each internal `CreditPack` includes `providerPriceId`. The frontend
must not guess packs from configuration, call the administrative credits route, or receive the provider identifier.

Plan `frontend/05` supplies the generated-client transport, and `frontend/08` supplies current account, effective
capabilities, the application shell, shared `401`/`403` handling, and common responsive/accessibility primitives. This plan adds
billing under `apps/web/src/features/billing` and route modules under `apps/web/src/routes`; it does not add a second
fetch wrapper or another design system.

Paddle payment completion is asynchronous. Returning from the hosted payment page does not prove that a signed webhook has
been received, and the balance may legitimately remain unchanged while the purchase is pending. Conversely, a
`checkout` creation timeout may occur after the local purchase or provider transaction was created. Every message and
recovery action must preserve those uncertainties.

## Scope and Non-Goals

This pull request adds two narrow customer billing reads, their DTOs, and their Swagger contracts. It also updates
the generated client and adds billing and checkout-return routes with safe price/history presentation. Focused API,
Bruno, and browser coverage prove the behavior. The credits module owns the balance query and the payments module owns the pack query;
controllers remain orchestration-only and neither module reaches into the other's concrete service.

It does not collect card or bank details, embed `Paddle.js`, create products or prices, add subscriptions, invoices,
refund controls, organization switching, promotional pricing, tax calculations, reconciliation jobs, purchase
cancellation, manual credit mutation, or a production payment rollout. It does not change provider/webhook
accounting, automatically retry `checkout`, optimistically increment credits, expose provider price identifiers, or
perform unrelated payment hardening or catch-all error handling.

## Plan of Work

Add a customer-facing balance query inside the credits module and expose it as
`GET /v1/billing/summary`. It derives the organization from `@CurrentPrincipal()`, delegates to the credits
application service, and returns a summary DTO with `balance`. Do not accept an organization identifier and do not
change the existing platform-only credits routes.

Separately, add a customer-facing catalog query inside the payments module and expose it as
`GET /v1/billing/credit-packs`. It returns a defensive, immutable projection of configured packs containing only
`id`, `credits`, `amountMinor`, and `currency`, ordered by `credits ASC, id ASC`. Keep the internal `CreditPack` with
`providerPriceId` inside the payments module; do not serialize it or make controllers reach into configuration.
Guard both reads with `billing:read`. Add explicit `@Expose()` and Swagger metadata, then add exactly
`GET /v1/billing/summary`, `GET /v1/billing/credit-packs`, `POST /v1/credit-purchases`, and
`GET /v1/credit-purchases` to the browser allow list so serialization and generated types agree. Test successful owner
access, a caller without billing permission, current-organization scoping, safe
pack fields, stable ordering, empty purchase history, and the absence of `providerPriceId` in both JSON and the
`OpenAPI` schema. Update module wiring and public documentation only as needed for these APIs.

Replace the customer history serialization with a safe projection that contains purchase ID, pack/credit/amount,
currency, status, and timestamps but not `provider`, `providerReference`, provider price IDs, webhook identifiers, or
raw payload data. Keep those fields on the persistence entity and inside payment adapters. Update JSON, Swagger,
generated-type, and browser-cache tests so a regression fails at every boundary.

Add an application-owned `CheckoutRedirectPolicy` port between `CreditPurchaseService` and provider adapters. Parse
the returned URL and require an absolute HTTP(S) URL, no username/password, no fragment, HTTPS outside explicit
loopback development, and an exact origin in `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS`. Require the variable for Paddle and
derive the stub's sole allowed origin from the configured same-origin return URL. Reject a provider violation as a
safe `502` before returning a URL to the controller; never log the rejected URL. Make the stub return only the
purchase UUID hint and remove `providerReference` from its query. In the web adapter, reparse and enforce the matching
build-time exact-origin policy before `window.location.assign`; a mismatch renders a checkout-unavailable state and
does not navigate. Add contract tables for credentials, protocol-relative input, HTTP nonloopback, Unicode/punycode,
case/default ports, fragments, subdomain suffix tricks, and valid stub/sandbox/production origins.

Use the same `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS` input for the API runtime and the Vite web build. The Vite
configuration parses and normalizes it at build time and publishes only the resulting origin array to browser code;
Compose passes one value to the API environment and web build argument. Fail the web build when Paddle is selected
and the input is absent or malformed. For the deterministic stub, derive the sole loopback origin from the
same-origin return URL. Add resolved-Compose and build tests proving the server/browser lists are identical and that
no unrelated payment secret is exposed in the bundle.

Update the committed OpenAPI/client artifacts with `openapi:export` and `openapi:generate`, then prove them with
`openapi:check`. Under `apps/web/src/features/billing`, add
query and mutation adapters that use generated operations through the shared session/CSRF transport. Keep cache keys
organization-aware even though the current shell has no organization switch. Load summary, catalog, and purchase
history independently so a recoverable failure in one panel does not misrepresent the others. Treat all money and
credit data as server-owned. Format minor units using the currency's `Intl.NumberFormat` fraction rules, preserve
the server currency code, and test both ordinary and zero-decimal currencies without using floating-point values as
mutation input.

Build `/app/billing` with a clear balance summary, pack choices, and purchase history. Reuse the shared page header,
panel, notice, button, status badge, loading, empty, and error primitives from the design contracts. A pack choice
announces credits and fully formatted price and remains operable by keyboard and screen reader. If the caller can
read billing but cannot manage it, keep the information readable and replace the purchase control with concise
permission guidance. The API remains authoritative if capabilities become stale.

On purchase, lock only the selected pack action, prevent duplicate submission, and send `{ packId }`. After a
confirmed response, retain the returned purchase ID only as a local navigation/focus hint and perform a top-level
navigation to `redirectUrl`. Do not mark the row paid or alter balance. On `400`, show that the selected pack is no
longer available and reload the catalog. On `502`, reload history because the server records the failed attempt.
On an ambiguous network failure, state that `checkout` creation could not be confirmed, refresh history and balance,
and require a fresh explicit user action before another POST.

Implement `/billing/complete` as the provider return route. It reads a UUID purchase hint from the stub return URL or
the browser's short-lived same-tab state when available, but it never trusts provider query parameters for status,
amount, credits, or ownership. It immediately reloads the organization-scoped summary and history. If the identified
purchase is pending, perform a bounded series of read-only history and balance refreshes, pause when the page is
hidden or offline, and then offer a manual refresh. Render paid, failed, and expired as distinct terminal states;
render an unknown/missing hint as a generic returned-payment notice plus authoritative history. A paid banner uses
only the refreshed balance. Clear the local hint after a terminal state without deleting server history.

History rows/cards show purchase date, pack credits, formatted amount, and status, but not provider reference or raw
provider name. The empty state explains that no purchases exist and points to the catalog. Loading preserves table
or card geometry. A failed panel preserves previously loaded safe data and offers a read retry. At narrow widths,
history uses the design contract's responsive data pattern without horizontal page overflow or hidden labels. Every
status is conveyed by text as well as color. Dates and currency have accessible labels, and focus moves to the
returned-purchase notice after navigation without stealing focus on later polling updates.

Extend `bruno/credit-purchases` with the two reads, allowed pack-field assertions, current-organization balance,
and status/history checks against the existing stub webhook workflow. Add controller/application tests and web
component tests for all statuses, partial read failures, capability combinations, duplicate prevention, `400`,
`502`, and ambiguous network failure. Playwright runs a real stub `checkout` redirect and return, uses signed stub
events to prove pending then paid/failed server states, and confirms that the balance changes only after the paid
webhook. Mocked browser fixtures cover expired and narrow-view states that the stub does not produce naturally.
Register `corepack pnpm bruno:credit-purchases` with the pinned launcher from Plan 02. It bootstraps the development service
credential, reads the configured stub webhook secret without printing it, selects the developer sandbox, and requires
nonzero execution.

## Interfaces and Dependencies

Add these authenticated API responses:

    GET /v1/billing/summary
    200 { "balance": 125 }

    GET /v1/billing/credit-packs
    200 [{ "id": "starter", "credits": 100, "amountMinor": 500, "currency": "USD" }]

Both require `billing:read`, derive organization from the authenticated principal, and return `401` or `403`
through the established auth boundary. The pack array never contains `providerPriceId`. No endpoint accepts an
organization ID. The existing `POST /v1/credit-purchases` path and permission rules remain stable. The customer
`GET /v1/credit-purchases` response deliberately drops raw `provider` and `providerReference`; internal persistence
and webhook correlation remain unchanged.

The catalog array is ordered by `credits ASC, id ASC`. Both API and browser redirect validation consume the
normalized origins derived from `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS`; only that nonsecret origin array is embedded in
the web bundle.

`apps/web` gains `/app/billing` and the provider return route `/billing/complete`. It consumes only generated operations from
`packages/api-client` through the shared transport from `frontend/05` and query layer from `frontend/08`. Required server dependencies already exist:
`CreditPackCatalog` owns pack configuration and `CreditsService` owns balance semantics. Each new query stays in the
module that owns that business rule. Runtime acceptance uses `PAYMENTS_PROVIDER=stub`; an opt-in Paddle sandbox follows the existing
`docker/paddle-dev/README.md` and must not become a required automated check.

## Acceptance Criteria

- A caller with `billing:read` sees only their organization's current balance, safe pack catalog, and purchase
  history. A caller without it receives `403`, and no browser capability check bypasses that response.
- The pack API and generated schema expose exactly `id`, `credits`, `amountMinor`, and `currency`; provider price IDs
  are absent from JSON, `OpenAPI`, generated types, browser state, and rendered markup. Multiple packs are ordered by
  `credits ASC, id ASC` regardless of configuration insertion order.
- The checked browser contract and generated client contain all four consumed route-method pairs: billing summary,
  credit packs, credit-purchase creation, and credit-purchase history. Contract tests fail if any is absent or an
  unconsumed payment route is added.
- Customer history JSON/OpenAPI/generated types/query cache contain no provider name, provider reference, price ID,
  event ID, or raw payload. The stub return URL contains only the purchase UUID hint.
- A caller with `billing:manage` can select a pack and create `checkout` with `packId` only. Duplicate activation while
  the request is pending produces one POST and one top-level redirect.
- Server and browser accept checkout navigation only for an exact configured origin with safe scheme and no URL
  credentials or fragment. Their normalized origin lists come from the same Compose/build input. Malicious/malformed
  provider URLs produce safe recovery and no navigation or URL logging.
- A `checkout` timeout, `502`, or lost response never triggers an automatic POST, never claims that no purchase was
  created, and never changes balance or purchase status optimistically. History/balance refresh and a deliberate
  retry remain available.
- Returning from `checkout` reloads authoritative data and renders pending, paid, failed, and expired purchases with
  distinct copy and recovery. Bounded read polling may observe webhook completion; it stops and offers manual refresh.
- The balance changes on screen only after the summary endpoint reports the webhook-applied grant. A returned browser
  URL or provider query value cannot select another organization's purchase or supply amount, credits, or status.
- Loading, empty, partial-error, permission, offline, return-without-hint, and recovery states are responsive,
  keyboard operable, screen-reader understandable, stable in layout, and free of serious accessibility violations.
- API and module tests, generated-client freshness, the updated Bruno stub workflow, Playwright stub-runtime flow,
  repository checks, and the premium audit pass. Paddle sandbox evidence is clearly labeled optional if recorded.
- The implementation and updated ExecPlan map to exactly one pull request without changing webhook accounting,
  provider-event correlation, or unrelated repository behavior beyond the explicit checkout URL boundary.

## Validation

Run focused payments/credits query service, controller, DTO serialization, permission, and Swagger tests. Run web
billing queries, currency formatting, pack selection, return-state, history, capability, error, and accessibility
tests. Then run:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm architecture:check
    git diff --check

After confirming Compose ownership, start the `checkout` fixture with `PAYMENTS_PROVIDER=stub`. Bootstrap
the MFA-aware owner fixture from `frontend/09`, then run the expanded collection from its collection root and the
focused browser scenario:

    PAYMENTS_PROVIDER=stub corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:credit-purchases
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/billing.spec.ts --project=chromium

The live stub scenario must capture the initial balance, catalog, one `checkout` creation and return, pending history,
a valid signed paid event, paid history, and the server-confirmed new balance. Exercise a signed failed event in a
separate disposable purchase. Component/API fixtures prove `expired`, unauthorized, narrow viewport, offline, slow,
and partial-error states. If Paddle sandbox access is available, optionally repeat `checkout` and return through the
existing fixture and record only redacted evidence; lack of account access does not fail this plan.

Run the premium static audit and inspect desktop and narrow screenshots and interactive states:

    corepack pnpm ui:audit

Verify keyboard pack selection, focus after return, long localized currency/date values, text-only status meaning,
stable polling, reduced motion, and no overflow. If `DESIGN.md` or `UX-CONTRACT.md` changes, run
`corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md` and record the result.

## Idempotence and Recovery

All billing reads are safe to repeat and use the authenticated organization on each request. Read-only polling is
bounded and can be resumed manually after refresh. Creating a `checkout` is intentionally not idempotent: a repeated
POST creates another local purchase and may create another provider transaction. The UI therefore blocks duplicates
while pending and never automatically retries an uncertain mutation. Webhook grants retain their existing durable
idempotent behavior; this plan does not alter that mechanism.

If API/client generation stops partway, restore the OpenAPI source to a compiling state, rerun export/generate, and
use the read-only check to prove the result. If disposable entity state is incompatible, use the documented development reset and
reseed path with `TYPEORM_SYNCHRONIZE=true`; add no migration. Clean up only synthetic stub purchases and the stack
owned by this worktree. Never tear down shared Docker or Paddle resources without confirming ownership.

## Artifacts and Notes

Record the final safe pack schema, generated operation names, a redacted status-transition table, focused test and
Bruno counts, premium-audit result, and desktop/narrow screenshots for catalog, return, history, and errors. Do not
record cookies, access tokens, service-client secrets, webhook secrets, Paddle keys, provider payloads, real purchase
identifiers, or customer data.

## Plan readiness

The current-organization API boundary, customer-safe pack projection, `checkout` uncertainty policy, return-state behavior,
financial consistency rules, UI state matrix, validation, and one-pull-request scope are decision-complete.

Ready to implement.
