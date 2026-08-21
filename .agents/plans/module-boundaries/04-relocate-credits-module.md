# Relocate credits into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Credit balance, debit, grant, guard, and HTTP behavior should be owned by a named business module rather than the
API host directory. After this change, credits live at `src/libs/modules/credits/src`, payments and verification
consume their public API through a package alias, and all existing organization-scoped credit behavior remains
unchanged.

## Progress

- [ ] (2026-08-21) Move the credits module and colocated tests without changing business behavior.
- [ ] (2026-08-21) Publish a narrow module barrel/alias and update all consumers.
- [ ] (2026-08-21) Verify credit, payment, verification, build, and HTTP regression behavior.

## Plan dependencies

- `module-boundaries/03`
- `verification-reliability/01`

## Surprises & Discoveries

- Credit persistence entities are intentionally owned by `modules/identity`, while `CreditsService` owns ledger
  operations and imports `IdentityModule` to receive their repositories.
- Payments, synchronous verification, asynchronous verification, and batch verification import credits through
  relative paths inside the API host.

## Decision Log

- Decision: Move credit application/API behavior but leave credit entities in identity.
  Rationale: The established identity schema owns organization credit accounts, grants, and debits; relocating them
  would be a separate persistence-boundary decision rather than a source-layout correction.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Export only `CreditsModule`, `CreditsService`, `CreditGuard`, and errors/contracts used by consumers.
  Rationale: DTOs and controllers do not need to become cross-module dependencies.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/credits` contains the Nest module, controller, DTO, guard, service, errors, and focused
unit/integration tests. `CreditsModule` imports `IdentityModule`, registers authorization providers, and exports
`CreditGuard` and `CreditsService`. Payments uses `CreditsService` for payment-event grants. Verification imports the
module and guard for billing protected operations.

## Scope and Non-Goals

Move the existing directory to `src/libs/modules/credits/src`, add the
`@tuposoft/lead-email-finder/modules/credits` alias, restrict its public barrel, and update consumers and tests.
Preserve endpoint paths, balance serialization, permission checks, debit/grant idempotency, error mapping, and entity
ownership. Do not change credit prices, refund behavior, organization scoping, tables, or guard policy.

## Plan of Work

Relocate the credits source and specs with Git-aware moves. Add exact and wildcard TypeScript aliases matching the
existing identity/auth aliases. Review `index.ts` and export only the Nest module and application symbols required by
payments and verification.

Update `LeadEmailFinderApiModule`, payments, synchronous/async/batch verification, and their tests to import the
public credits alias. Reject any workaround that exports identity persistence entities from credits or introduces a
generic ledger manager. Verify Nest wiring still supplies identity repositories, authorization policy, controller,
guard, and service exactly once.

## Interfaces and Dependencies

Adds the internal alias `@tuposoft/lead-email-finder/modules/credits`. Existing Nest provider classes and HTTP
contracts retain their names and semantics. No endpoint, environment variable, database schema, queue, or package
dependency changes.

## Acceptance Criteria

- Credits implementation and tests live under `src/libs/modules/credits/src`; the old API-host directory is absent.
- Payments and verification import credits only through the public module alias.
- Balance lookup, idempotent grants, idempotent debits, insufficient-credit rejection, and permission behavior match
  existing focused tests.
- Credit HTTP routes and serialized response shapes are unchanged.
- Identity remains the sole owner of credit persistence entities and schema registration.
- A clean build and API module bootstrap resolve the relocated module.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/credits/src
src/lead-email-finder-api/src/payments src/lead-email-finder-api/src/email-verification-module --runInBand`. Run
`corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`,
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand`, and `git diff --check`. From each collection
directory, run `bru run --env local` for `bruno/smtp-dev` and `bruno/credit-purchases` when their disposable
dependencies are available; otherwise record them as unverified.

## Idempotence and Recovery

This source move does not mutate credit data. If interrupted, reconcile only old/new credits paths and imports using
`git status`; do not reset a dirty checkout. Existing ledger idempotency keys remain unchanged. No database reset is
required.

## Artifacts and Notes

Record the cross-module import search, focused test counts, and redacted HTTP statuses/balances. Never record bearer
tokens, webhook secrets, or organization credentials.

## Plan readiness

Ready to implement.
