# Grant credits idempotently

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make adding credits as safe as spending them. After this change, replaying the same credit grant leaves the balance unchanged, and every balance increase leaves a durable row explaining where it came from. A developer can observe it by calling the grant twice with one reference and seeing the balance move once.

## Progress

- [ ] Add the `CreditGrant` entity and register it with `IdentityModule`.
- [ ] Add `CreditsService.credit(organizationId, amount, reference)` mirroring `debit`.
- [ ] Route the admin `POST /credits/:organizationId` endpoint through the new method.
- [ ] Add unit and integration coverage for replay and concurrency.
- [ ] Run typecheck, lint, jest, and the relevant Bruno collection.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Credit grants get their own `credit_grants` table rather than reusing `credit_debits` with a signed amount.
  Rationale: `credit_debits` is a spend ledger consumed by verification flows; mixing signs into it would change the meaning of every existing query and of the `amount` column. A separate table keeps `balance = sum(grants) - sum(debits)` reconstructible and each ledger single-purpose.
  Date/Author: 2026-08-17, project planning.
- Decision: `addCredits` is replaced by `credit`, not kept alongside it.
  Rationale: Leaving a non-idempotent path available invites a later caller to use it from a retrying context, which is exactly the defect this plan removes. The admin controller supplies its own reference.
  Date/Author: 2026-08-17, project planning.
- Decision: The admin endpoint generates a server-side `randomUUID()` reference per request rather than accepting one from the caller.
  Rationale: Nothing retries that endpoint, and accepting a client reference would change the endpoint's request contract for no current benefit. `CreditGuard` already uses the same `randomUUID()` approach for non-retried debits.
  Date/Author: 2026-08-17, project planning.
- Decision: `setBalance` keeps its current non-ledger behavior.
  Rationale: It is a development reset hatch, not an accounting operation, and forcing it through the ledger would either falsify grant history or require a compensating-entry design that no caller needs.
  Date/Author: 2026-08-17, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/credits/credits.service.ts` holds three balance operations. `debit` is transactional: it locks the `organization_credit_accounts` row with `pessimistic_write`, returns early when a `(organizationId, reference)` row already exists in `credit_debits`, then decrements and inserts the ledger row. `addCredits` and `setBalance` are plain read-modify-write calls with no lock and no ledger, so two concurrent grants can lose one increment and a retried grant applies twice.

`CreditDebit` lives at `src/libs/modules/identity/src/infrastructure/persistence/credit-debit.entity.ts` with a composite primary key of `organizationId` and `reference`. `OrganizationCreditAccount` carries a `balance >= 0` check constraint. Both are registered in `IdentityModule`'s `TypeOrmModule.forFeature` list and exported from `src/libs/modules/identity/src/index.ts`.

The only current caller of `addCredits` is `CreditsController.addCredits`, reached by `POST /credits/:organizationId` behind `RequirePermissions('platform:admin')`, and exercised by `bruno/smtp-dev/01-add-verification-credit.yml`.

## Scope and Non-Goals

Add an idempotent, concurrency-safe credit grant and move the existing admin top-up onto it. Do not add payment providers, purchase records, customer-facing endpoints, or refund handling. Do not change `debit`, `getBalance`, or the observable request and response shapes of any existing endpoint.

## Plan of Work

Add `credit-grant.entity.ts` next to `credit-debit.entity.ts`, mirroring its shape: composite primary key of `organizationId` and `reference`, an integer `amount`, a `CreateDateColumn`, and the same `ManyToOne` relation to `Organization` with `onDelete: 'CASCADE'`. Register it in `IdentityModule` and export it from the identity barrel file.

Replace `addCredits` with `credit(organizationId, amount, reference)` built as the mirror of `debit`: open a transaction, load the account with `lock: { mode: 'pessimistic_write' }`, return the current balance early when a matching `CreditGrant` exists, otherwise increment, save, and insert the grant row. Unlike `debit`, a missing account is not an error — create it with a zero balance first, because the first purchase for an organization arrives before any account row exists. Return the resulting balance so the controller response is unchanged.

Update `CreditsController.addCredits` to pass `randomUUID()` as the reference, matching how `CreditGuard` calls `debit`.

## Interfaces and Dependencies

`CreditsService.credit(organizationId: string, amount: number, reference: string): Promise<number>` replaces `addCredits(organizationId: string, amount: number): Promise<number>`. `CreditGrant` is exported from `@tuposoft/lead-email-finder/modules/identity`. No new configuration, libraries, or services. This plan depends on nothing and unlocks every later plan in this roadmap.

## Acceptance Criteria

- Granting twice with the same `(organizationId, reference)` pair raises the balance once and returns the same balance both times.
- Concurrent grants to one organization with distinct references sum correctly, with no lost update.
- A grant for an organization that has no credit account creates the account and applies the amount.
- Every successful grant writes exactly one `credit_grants` row recording the organization, reference, and amount.
- `POST /credits/:organizationId` keeps its current status codes, request body, and response body.
- `debit`, `getBalance`, and `setBalance` behavior is unchanged.
- No non-idempotent credit-increasing method remains on `CreditsService`.

## Validation

Extend `credits.service.spec.ts` with unit coverage for the replay path, the account-creation path, and the returned balance. Extend `credits.service.integration.spec.ts`, which already runs against a real PostgreSQL database, with a duplicate-reference grant and a concurrent-grant case, mirroring the existing concurrent-debit test. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Run `bru run --env local` against the `bruno/smtp-dev` collection to confirm the admin top-up path still works end to end.

## Idempotence and Recovery

The grant ledger makes repeated execution safe by construction. Adding `credit_grants` is an additive schema change that `TYPEORM_SYNCHRONIZE=true` applies against disposable data; no backfill is needed because existing balances stay as they are and only lack grant provenance. To restore a clean environment, drop and re-synchronize the development database, then reseed credits through the admin endpoint.

## Artifacts and Notes

Record the concurrent-grant integration test's observed final balance with synthetic identifiers only.

## Plan readiness

Ready to implement.
