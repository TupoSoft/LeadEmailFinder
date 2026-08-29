# Credits

Owns the business rules for organization credit balances: administrative grant and set operations, strict
per-request debiting through a guard, and the narrow idempotent debit and grant operations used by verification and
billing workflows.

## Responsibility

- Reading an organization's current credit balance.
- Administrative balance mutation (`addCredits`, `setBalance`) for platform operators.
- `CreditGuard` — an HTTP guard that debits one credit from the caller's organization before a request proceeds,
  rejecting with `402` when the balance is insufficient.
- `CreditsService.debit()`/grant application logic used directly by other modules (for example, batch
  verification debits per validated CSV row, and payments grants a purchased pack's credits).
- `CreditsService.debitUpTo()` and `creditOnce()` for payment adjustments. These methods return the amount recorded for
  a ledger reference on both the first application and replay; a clamped zero debit is persisted so later top-ups are
  never charged by an old adjustment.

## Non-Responsibilities

- No ledger persistence — the credit account and debit/grant rows are owned by
  [`identity`](../identity/README.md); this module only reads and writes through them.
- No payment processing, adjustment accounting, shortfall policy, or credit-pack pricing (owned by
  [`payments`](../payments/README.md)); credits applies the ledger operation that payments has already authorized.
- No opinion on what a request should cost — callers (guards, processors) decide the debit amount.

## Public API

[`src/index.ts`](src/index.ts) exports `CreditsModule`, `CreditGuard`, `CreditsService`, and
`InsufficientCreditsException`. The controller and its DTOs are internal — they back the admin HTTP surface
below but are not part of the intentional public API other modules should import.

## Dependencies

- [`identity`](../identity/README.md) — `OrganizationCreditAccount`, `CreditDebit`, and `CreditGrant`, injected
  through the `TypeOrmModule` that `IdentityModule` exports.
- [`auth`](../auth/README.md) — `PermissionsGuard`, `RolePermissionPolicy`, `RequirePermissions`, and
  `getAuthPrincipal`.

## HTTP Surface

`CreditsController` at `/credits`, restricted to the `platform:admin` permission and excluded from Swagger:

| Method | Path                       | Access           |
| ------ | -------------------------- | ---------------- |
| `GET`  | `/credits/:organizationId` | `platform:admin` |
| `POST` | `/credits/:organizationId` | `platform:admin` |
| `PUT`  | `/credits/:organizationId` | `platform:admin` |

`CreditGuard` is applied by other modules' controllers (for example synchronous and async email verification) —
it is not itself mounted on any route here.

Strict spending still uses `CreditsService.debit()`: insufficient balance raises `InsufficientCreditsException`, and
`CreditGuard` exposes that as HTTP `402`. Only the payment-adjustment path uses `debitUpTo()` to clamp at the available
balance and report the applied amount for durable shortfall accounting.

## Persistence

None owned directly. Credits reads and writes the `OrganizationCreditAccount` (`organization_credit_accounts`),
`CreditDebit` (`credit_debits`), and `CreditGrant` (`credit_grants`) tables owned by `identity`.

## Configuration

None. This module reads no environment variables.

## Validation

Focused tests live in `src/`: `credits.controller.spec.ts`, `credits.guard.spec.ts`, `credits.service.spec.ts`, and
`credits.service.integration.spec.ts` (schema-level, gated on `TEST_CREDITS_POSTGRES_URL`). The service tests cover
clamped debit results, zero-result replay after replenishment, one-time restoration, and concurrent ledger
idempotency against real PostgreSQL.

No Bruno collection is dedicated to credits — its balance and debit behavior is exercised indirectly instead.
[`bruno/credit-purchases`](../../../../bruno/credit-purchases/README.md) reads the resulting balance back
through the admin API above after a webhook grant. Both
[`bruno/smtp-dev`](../../../../bruno/smtp-dev/README.md) and
[`bruno/batch-verification`](../../../../bruno/batch-verification/README.md) exercise the one-credit debit and
`402` rejection as a side effect of driving email verification end to end.
