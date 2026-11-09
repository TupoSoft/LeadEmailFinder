# Credits

Applies organization credit rules and exposes customer billing summaries and platform balance administration.

## Responsibility

- Return `{ balance, reserved, available }`, where `reserved` is held for unfinished work and `available = balance - reserved`.
- Grant/set balances for platform operators and maintain a ledger (persisted credit movements). Operations are idempotent:
  retries with the same reference do not charge or grant twice.
- Reserve credits before an outcome is known, then settle them by capture (charge once) or release (remove the hold).
- Validate operation IDs and positive integer amounts before calling persistence.

## Non-Responsibilities

[`identity`](../identity/README.md) owns database transactions, locks, and ledger/reservation rows.
[`payments`](../payments/README.md) owns pricing, refunds, and shortfall accounting. Callers decide which outcomes
justify charging; verification uses reservations rather than the upfront `CreditGuard`.

## Public API

[`src/index.ts`](src/index.ts) exports `CreditsModule`, `CreditGuard`, `CreditsService`, `CreditReservationService`,
and the errors `InsufficientCreditsException`, `CreditIdempotencyConflict`, `BalanceBelowReservedException`,
`CreditReservationAmountConflict`, `CreditReservationConflict`, and `CreditReservationNotFound`.
Controllers and request/response types remain internal.

- `debit` requires sufficient available credit; `debitUpTo` clamps the debit to the available amount.
- `creditOnce` and `debitUpTo` return the original reference's recorded amount on replay. Even a zero debit is
  recorded, preventing an old adjustment from charging a later top-up.
- `reserve`/`reserveMany` hold credits; group admission is atomic (all or none).
- `capture`/`release` settle once. A conflicting amount or opposite terminal transition fails.
- `closeAdmissionMany` durably closes denied/canceled operation IDs, including IDs never reserved, so a delayed retry
  cannot create a new hold after replenishment.
- `CreditGuard` debits one credit before a guarded request; insufficient credit becomes HTTP `402`.

## Dependencies

- [`identity`](../identity/README.md): `CreditLedgerStore` and `CreditReservationStore` interfaces and implementations.
- [`auth`](../auth/README.md): principal lookup and permission guards.

## HTTP Surface

| Method | Path                       | Permission       | Behavior                                                              |
| ------ | -------------------------- | ---------------- | --------------------------------------------------------------------- |
| `GET`  | `/v1/billing/summary`      | `billing:read`   | Authenticated organization's balance, reserved, and available credits |
| `GET`  | `/credits/:organizationId` | `platform:admin` | Current balance; zero if no account exists                            |
| `POST` | `/credits/:organizationId` | `platform:admin` | Add a positive integer `amount`                                       |
| `PUT`  | `/credits/:organizationId` | `platform:admin` | Set a nonnegative integer balance                                     |

`POST` requires exactly one `Idempotency-Key` header containing a canonical lowercase UUID (a unique operation ID).
Use the same organization, key, and amount for a retry; use a new key for a new addition. Success and equivalent
replay return `201 { balance }` with the current balance. Reusing the key with a different amount returns `409`
without mutation. The private ledger reference is prefixed with `platform-credit-add:`.

Invalid IDs, amounts, or missing/repeated/malformed keys return `400`; invalid authentication returns `401`; missing
permission returns `403`. Errors never echo the supplied key. `PUT` rejects a target below `reserved` with `409`.
`GET`/`PUT` need no idempotency key. A zero balance does not prove organization existence; use the onboarding detail read.

Browser mutations use session cookies with Origin checking and CSRF (cross-site request forgery) protection: a separate
request token prevents
another website from submitting authenticated changes. Bearer credentials also remain supported.

## Persistence

None owned. All account, debit, grant, and reservation operations go through identity's ports, never direct repositories.
The account lock serializes balance and reservation changes, including concurrent first grants and batch closure.

## Configuration

None: this module reads no environment variables.

## Validation

Run focused unit/HTTP suites under `src/api/` and `src/application/`; `credits.module.spec.ts` checks wiring.
Real PostgreSQL integration suites require a separately provisioned disposable test database.

Coverage includes replay/conflict, concurrent first grants, zero-debit replay after top-up, reserve/capture/release,
and reserve-versus-close races. A closed denial must remain closed after replenishment.

Bruno (the HTTP collection runner) covers [platform credit administration](../../../../../bruno/platform-credits/README.md),
[payment/billing summary](../../../../../bruno/credit-purchases/README.md), and verification charging through
[batch](../../../../../bruno/batch-verification/README.md) workflows.
