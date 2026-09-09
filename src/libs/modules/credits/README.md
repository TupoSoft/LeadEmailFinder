# Credits

Owns the business rules for organization credit balances: administrative grant and set operations, strict
per-request debiting through a guard, and the narrow idempotent debit and grant operations used by verification and
billing workflows.

## Responsibility

- Reading an organization's current credit balance, including the authenticated billing summary.
- Administrative balance mutation (`addPlatformCredits`, `setBalance`) for platform operators. Additions use a
  caller-owned operation key, return the current balance for equivalent retries, and reject conflicting amounts.
- `CreditGuard` — an HTTP guard that debits one credit from the caller's organization before a request proceeds,
  rejecting with `402` when the balance is insufficient.
- `CreditsService.debit()`/grant application logic used directly by other modules (for example, batch
  verification debits per validated CSV row, and payments grants a purchased pack's credits).
- `CreditsService.debitUpTo()` and `creditOnce()` for payment adjustments. These methods return the amount recorded for
  a ledger reference on both the first application and replay; a clamped zero debit is persisted so later top-ups are
  never charged by an old adjustment.

## Non-Responsibilities

- No ledger persistence, locking, or transaction mechanics — the credit account and debit/grant rows, and the
  atomic operations against them, are owned by [`identity`](../identity/README.md) behind its `CreditLedgerStore`
  port; this module only decides which operation to call and how to interpret the outcome.
- No payment processing, adjustment accounting, shortfall policy, or credit-pack pricing (owned by
  [`payments`](../payments/README.md)); credits applies the ledger operation that payments has already authorized.
- No opinion on what a request should cost — callers (guards, processors) decide the debit amount.

## Public API

[`src/index.ts`](src/index.ts) exports `CreditsModule`, `CreditGuard`, `CreditsService`,
`InsufficientCreditsException`, and `CreditIdempotencyConflict`. The controller and its DTOs are internal — they back
the admin and customer HTTP surfaces below but are not part of the intentional public API other modules should import.

`CreditsService` is a framework-free `application/` class built from an explicit factory in `credits.module.ts`;
it has no `infrastructure/` layer of its own since its one adapter (`TypeOrmCreditLedgerStore`) lives in identity.

## Dependencies

- [`identity`](../identity/README.md) — the `CreditLedgerStore` port and its `CREDIT_LEDGER_STORE` token,
  through the public barrel `IdentityModule` exposes.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `RequirePermissions`, and
  `getAuthPrincipal`.

## HTTP Surface

`BillingSummaryController` exposes `GET /v1/billing/summary` with the `billing:read` permission. The response contains
only `{ "balance": <current balance> }`. The controller derives the organization from the authenticated principal;
it accepts no organization parameter and never invokes the platform administration surface. Missing or invalid
authentication returns `401`, and an authenticated caller without billing read permission receives `403`. Explicit
serialization and Swagger metadata expose the balance contract to the generated browser client.


`CreditsController` at `/credits`, restricted to the `platform:admin` permission and published in runtime and browser OpenAPI:

| Method | Path                       | Access           |
| ------ | -------------------------- | ---------------- |
| `GET`  | `/credits/:organizationId` | `platform:admin` |
| `POST` | `/credits/:organizationId` | `platform:admin` |
| `PUT`  | `/credits/:organizationId` | `platform:admin` |

An additive `POST` requires exactly one `Idempotency-Key` header containing a canonical lowercase UUID and a body
with a positive integer `amount`. One logical addition owns one UUID. A retry uses the same organization, key, and
amount; a separate addition uses a new UUID. Both the first successful addition and an equivalent replay return
`201` with `{ "balance": <current balance> }`. The response reflects the authoritative balance at the time of the
request, including any intervening operations. Reusing the same organization and key with a different amount returns
`409` without another grant or balance change.

Missing, repeated, combined, or malformed keys return `400`, as do invalid organization UUIDs or amounts. Invalid
requests never reach the ledger. Missing or invalid authentication returns `401`; an authenticated caller without
`platform:admin` receives `403`. Error responses do not include the supplied key. Absolute `PUT` and balance `GET`
operations do not require an idempotency key. GET returns the current balance, including zero when no account exists.
PUT accepts an integer of zero or greater and replaces the absolute balance, including zero. Complete Swagger annotations
publish UUID paths, amounts, balances, validation, authentication, authorization, and additive replay/conflict responses.
Browser mutations use session cookies with Origin and CSRF protection; bearer credentials remain supported.
Organization existence and display details come from the onboarding detail read, because zero credits does not prove
that an organization exists. This publication does not change ledger or absolute-set semantics.

`addPlatformCredits()` prefixes the accepted key with the private `platform-credit-add:` namespace and interprets the
ledger's inserted or existing grant result. Only an existing grant with a different recorded amount raises
`CreditIdempotencyConflict`, which the controller maps to `409`. General `credit()` still returns the current balance
for either persistence outcome, preserving payment grant behavior and references.

`CreditGuard` is applied by other modules' controllers (for example synchronous and async email verification) —
it is not itself mounted on any route here.

Strict spending still uses `CreditsService.debit()`: insufficient balance raises `InsufficientCreditsException`, and
`CreditGuard` exposes that as HTTP `402`. Only the payment-adjustment path uses `debitUpTo()` to clamp at the available
balance and report the applied amount for durable shortfall accounting.

## Persistence

None owned directly. Credits reads and writes the `OrganizationCreditAccount` (`organization_credit_accounts`),
`CreditDebit` (`credit_debits`), and `CreditGrant` (`credit_grants`) tables owned by `identity`, exclusively
through `CreditLedgerStore` — never through a direct repository or `DataSource` injection.

## Configuration

None. This module reads no environment variables.

## Validation

Focused tests live in `src/`:

- `api/billing-summary-http.integration.spec.ts` covers authenticated organization scoping, read permissions,
  safe serialization, and Swagger response metadata.
- `api/credits.controller.spec.ts` and `api/credits.guard.spec.ts` cover transport orchestration and spending.
- `api/credit-idempotency-key.spec.ts` covers canonical parsing and duplicate-header rejection.
- `api/credits-http.integration.spec.ts` covers real Nest authentication and permission guards, validation, status
  codes, replay/conflict mapping, serialization, and unchanged balance lookup and set behavior.
- `application/credits.service.spec.ts` mocks `CreditLedgerStore` directly.
- `credits.module.spec.ts` covers provider and export wiring.
- `application/credits.service.integration.spec.ts` runs schema-level checks, gated on `TEST_CREDITS_POSTGRES_URL`,
  through the real `IdentityModule` and its `TypeOrmCreditLedgerStore` adapter.

The integration tests cover clamped debit results, zero-result replay after replenishment, one-time
restoration, and concurrent ledger idempotency against real PostgreSQL. Platform addition coverage includes sequential
replay, amount conflicts, and concurrent grants with matching and different keys, including organizations without a
credit account. `corepack pnpm test:credits-postgres` runs the dedicated disposable database suite.

The PostgreSQL runner starts only `docker/compose.credits-test.yaml`, using a Compose project derived from the
checkout's absolute path and a database named `credits_test`. It validates existing container ownership before
starting or reusing the container. It saves the generated password and loopback connection URL in ignored
`.dev/credits-postgres/stack.json` with private file permissions, reloads that metadata for Jest, and rejects
skipped or empty test runs. An externally supplied `TEST_CREDITS_POSTGRES_URL` cannot redirect this runner.
Each run synchronizes a fresh schema in that test database; it does not reset application data or seed customers.
The container keeps its database in temporary memory. To remove it after testing, read `projectName` from the
ignored metadata and run `CREDITS_TEST_PASSWORD=unused docker compose -p <projectName> -f docker/compose.credits-test.yaml down`.
Rerunning the test command recreates the same isolated stack and schema.

[`bruno/platform-credits`](../../../../bruno/platform-credits/README.md) exercises organization detail, balance reads, absolute sets including zero, additive success, replay, conflict,
input validation, authentication, authorization, and concurrent retries. Run it with
`corepack pnpm bruno:platform-credits` against the developer sandbox.
[`bruno/credit-purchases`](../../../../bruno/credit-purchases/README.md) reads the customer billing summary and
verifies the resulting balance after a webhook grant. Both
[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) and
[`bruno/batch-verification`](../../../../bruno/batch-verification/README.md) exercise the one-credit debit and
`402` rejection as a side effect of driving email verification end to end.
