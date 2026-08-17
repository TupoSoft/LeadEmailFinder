# Sell credit packs through a checkout endpoint

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give a customer a way to start paying. After this change an authenticated organization owner names a credit pack, receives a checkout redirect URL, and leaves behind a `pending` purchase record. A developer can observe it by posting a `packId` with the stub provider configured and seeing a redirect URL plus a pending row scoped to their organization.

## Progress

- [ ] Add `CreditPurchaseService` with purchase creation.
- [ ] Add the `billing:manage` permission and grant it to `owner`.
- [ ] Add `POST /v1/credit-purchases` and `GET /v1/credit-purchases`.
- [ ] Add controller, service, and permission tests.
- [ ] Add the Bruno collection and run it against the stub provider.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: The request body carries `packId` only.
  Rationale: Any client-supplied credit amount or price turns the endpoint into a free-credit generator. The catalog resolves everything else server-side.
  Date/Author: 2026-08-17, project planning.
- Decision: Purchasing requires a new `billing:manage` permission granted to `owner` only.
  Rationale: `role-permission-policy.service.ts` already reserves billing for `owner` — `admin` receives `members:manage` and `credentials:manage` but not `billing:read`. Spending an organization's money follows the same boundary. Widening it later is a one-line change; narrowing it after customers rely on it is not.
  Date/Author: 2026-08-17, project planning.
- Decision: The purchase row is written before the provider call, and a provider failure marks it `failed` rather than deleting it.
  Rationale: The row is the record that later lets a webhook resolve which organization and how many credits an event refers to. Creating it after a successful provider call would leave a window where a paid checkout has no local counterpart.
  Date/Author: 2026-08-17, project planning.
- Decision: Service clients may hold `billing:manage` but the flow targets browser users.
  Rationale: `RolePermissionPolicy` returns a service client's own permissions rather than role-derived ones, so an M2M client can be provisioned for purchasing if an operator chooses. Hosted checkout still requires a human to complete payment, so nothing special is built for that case.
  Date/Author: 2026-08-17, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 02 added `PaymentsModule`, the `CreditPurchase` entity, the `PaymentProvider` port with `createCheckout`, and the server-side pack catalog, but no route reaches any of it.

Authentication is global: `AuthModule` registers `AuthGuard` as an `APP_GUARD`, so every route is authenticated unless marked with `@Public()`. Controllers reach the caller through `getAuthPrincipal(request)` or the `@CurrentPrincipal()` decorator in `src/libs/modules/auth/src/infrastructure/http/`, and `AuthPrincipal` carries `organizationId`, `membershipRole`, and `permissions`. Route-level authorization uses `@UseGuards(PermissionsGuard)` with `@RequirePermissions(...)`, as `CreditsController` does with `platform:admin`.

Permissions are a closed union: `AUTH_PERMISSIONS` in `src/libs/modules/identity/src/domain/auth-principal.ts` lists them, and `ROLE_PERMISSIONS` in `src/libs/modules/auth/src/application/role-permission-policy.service.ts` maps roles to them. `billing:read` already exists on `owner` and has no consumer.

Responses are serialized by a global `ClassSerializerInterceptor` with `strategy: 'excludeAll'`, so response DTO fields need `@Expose()`, as in `credits.dto.ts`.

## Scope and Non-Goals

Add the customer-facing purchase-start and purchase-history endpoints and the service behind them. Do not add the webhook route, credit granting, the Paddle adapter, or refunds. No balance changes in this plan; a completed payment does nothing until plan 04.

## Plan of Work

Add `CreditPurchaseService` in `src/lead-email-finder-api/src/payments/`. Its `start(principal, packId)` resolves the pack from the catalog, inserts a `pending` `CreditPurchase` carrying the organization id, pack id, resolved credits, price, and currency, calls `createCheckout` through the port with the purchase id and configured return URL, persists the returned `providerReference`, and returns the redirect URL. A provider error marks the purchase `failed` and rethrows as a `502`-mapped exception so the caller can distinguish a provider outage from a bad request. Its `listForOrganization(organizationId)` returns purchases newest first.

Add `billing:manage` to `AUTH_PERMISSIONS` and to `OWNER_PERMISSIONS`. Because `PLATFORM_ADMIN_PERMISSIONS` spreads `OWNER_PERMISSIONS`, platform admins inherit it.

Add `CreditPurchaseController` at `v1/credit-purchases`. `POST` requires `billing:manage`, accepts `CreateCreditPurchaseDto` with a validated `packId`, and returns `201` with the purchase id, status, and `redirectUrl`. `GET` requires `billing:read` and returns the organization's purchase history. Both derive the organization from the principal; neither accepts an organization identifier from the caller. Unknown `packId` returns `400`.

Register `PaymentsModule` in `LeadEmailFinderApiModule` and import `CreditsModule` and `IdentityModule` into it.

Add `bruno/credit-purchases/` following the layout of `bruno/proxy-registry/`: an `opencollection.yml`, an `environments/local.yml` using variables rather than secrets, and a `README.md` documenting required environment values.

## Interfaces and Dependencies

New endpoints: `POST /v1/credit-purchases` with body `{ packId: string }` returning `{ id, status, redirectUrl }`, and `GET /v1/credit-purchases` returning a purchase list. New permission: `billing:manage`. Depends on plans 01 and 02; unlocks plan 04.

## Acceptance Criteria

- An owner posting a known `packId` receives `201`, a redirect URL, and a `pending` purchase owned by their organization.
- The stored credits and price come from the catalog, and a body containing extra amount or credit fields does not change them.
- An unknown `packId` returns `400` and creates no purchase.
- A principal without `billing:manage`, including a `member` and an `admin`, receives `403`.
- An unauthenticated request receives `401`.
- `GET /v1/credit-purchases` returns only the caller's organization's purchases.
- A provider failure leaves the purchase `failed` and returns a non-`2xx` status.
- No endpoint in this plan changes a credit balance.

## Validation

Add controller tests for the success, unknown-pack, and forbidden paths; service tests for catalog resolution, provider failure handling, and organization scoping; and a permission-policy test asserting `owner` has `billing:manage` while `admin` and `member` do not. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Run `bru run --env local` for `bruno/credit-purchases` against a stack configured with `PAYMENTS_PROVIDER=stub`, covering unauthorized purchase, successful purchase, unknown pack, and history listing.

## Idempotence and Recovery

Repeated posts create separate purchases, which is correct: a customer may genuinely buy two packs. Purchases are inert until a payment event arrives, so duplicates cost nothing. Abandoned `pending` rows are expected and are not cleaned up in this plan. Reset by dropping and re-synchronizing the development database.

## Artifacts and Notes

Record a sample request and response with synthetic identifiers. Never record a live provider key or a real checkout URL.

## Plan readiness

Ready to implement after plan 02.
