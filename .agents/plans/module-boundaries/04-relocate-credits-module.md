# Relocate credits into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Credit balance, debit, grant, guard, and HTTP behavior should be owned by a named business module rather than the
API host directory. After this change, credits live at `src/libs/modules/credits/src`, payments and verification
consume their public API through a package alias, and all existing organization-scoped credit behavior remains
unchanged.

## Progress

- [x] (2026-08-21) Move the credits module and colocated tests without changing business behavior.
- [x] (2026-08-21) Publish a narrow module barrel/alias and update all consumers.
- [x] (2026-08-21) Verify credit, payment, verification, build, and HTTP regression behavior.

## Plan dependencies

- `module-boundaries/03`
- `verification-reliability/01`

## Surprises & Discoveries

- Credit persistence entities are intentionally owned by `modules/identity`, while `CreditsService` owns ledger
  operations and imports `IdentityModule` to receive their repositories.
- Payments, synchronous verification, asynchronous verification, and batch verification import credits through
  relative paths inside the API host.
- 17 files across `email-verification-module` (12) and `payments` (5) imported credits by relative path -- the
  payments imports reached two directory levels deeper still (`../credits/credits.service`,
  `../credits/credits.module`) than the email-verification ones (`../../credits`), since payments sits one level
  higher in the API host tree. Both patterns were mechanical `sed` replacements to the new alias.
- Restricting the barrel per the Decision Log (drop `credits.dto`) required checking every DTO/controller export was
  genuinely unused outside the directory first (`rg` confirmed zero external references to any DTO or to
  `CreditsController`) -- nothing needed re-adding.
- `payments.module.spec.ts` compiles the real `PaymentsModule` (which imports `CreditsModule`) through
  `Test.createTestingModule(...).compile()`, so the full repo-wide Jest run already proves the relocated module
  resolves correctly through Nest's DI container, not just at the TypeScript level -- this made a live
  `bruno/credit-purchases` run a belt-and-suspenders check rather than the only evidence of runtime wiring.
- `bruno/credit-purchases` needs an `OWNER_ACCESS_TOKEN` for a `human_session` principal with `billing:manage`,
  which (unlike every other collection touched by this session's module-boundaries work) has no established
  service-client-based minting path in this repo's scripts -- obtaining one requires the BFF's real OIDC/PKCE login
  flow. Recorded as unverified live per this plan's own Validation section, with the Jest DI-resolution proof above
  as the substitute evidence.

## Decision Log

- Decision: Move credit application/API behavior but leave credit entities in identity.
  Rationale: The established identity schema owns organization credit accounts, grants, and debits; relocating them
  would be a separate persistence-boundary decision rather than a source-layout correction.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Export only `CreditsModule`, `CreditsService`, `CreditGuard`, and errors/contracts used by consumers.
  Rationale: DTOs and controllers do not need to become cross-module dependencies.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Implemented and fully validated, including live where feasible. `src/lead-email-finder-api/src/credits` moved to
`src/libs/modules/credits/src` via `git mv` (all 11 files recorded as renames). Restricted `index.ts` to
`CreditsModule`, `CreditGuard`, `CreditsService`, and `InsufficientCreditsException` -- dropped the `credits.dto`
re-export since nothing outside the directory used any DTO. Credit persistence entities
(`OrganizationCreditAccount`, `CreditDebit`, `CreditGrant`) were already owned by `modules/identity`, per the plan's
own Decision Log, and were untouched. Added the `@tuposoft/lead-email-finder/modules/credits` alias (exact +
wildcard) to `tsconfig.json` and `jest.config.ts`, matching the auth/identity/proxy convention. Updated all 17
consumer files (12 in `email-verification-module`, 5 in `payments`) from relative imports to the new alias.

Validation: `rg` confirms zero remaining references to `src/credits` or `credits/credits.` anywhere in `src`,
`scripts`, `docker`, or `bruno`. Focused suite (credits + payments + email-verification-module): 33/35 suites
passing (2 pre-existing DB-integration skips), 158/164 tests. Repo-wide: `typecheck`/`lint` (2 pre-existing baseline
warnings only)/`build` (437 files, verified via `find` that compiled output lands under `libs/modules/credits/src`
with no stale `lead-email-finder-api/src/credits`) all clean; `test:ci` 711/711 non-skipped, unchanged from before
the move; `git diff --check` clean.

Live Bruno regression: `bruno/smtp-dev` against the `smtp-dev` overlay -- 11/11 passing, exercising both the credit
top-up endpoint and both verification routes' `CreditGuard` debits through the new alias at runtime.
`bruno/credit-purchases` could not be run live in this environment (see Surprises & Discoveries -- it needs a
human-session owner token with no established minting path here); its DI wiring is instead proven by
`payments.module.spec.ts`'s real `TestingModule.compile()` of `PaymentsModule`, which is part of the repo-wide Jest
run above.

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

**Final legacy-path search** (`rg -n "src/credits|credits/credits\." src scripts docker bruno`): zero matches.

**Focused test counts**: credits + payments + email-verification-module (`--runInBand`): 33/35 suites, 158/164
tests (2 suites / 6 tests are pre-existing, environment-gated DB-integration skips, unrelated to this move).

**Bruno statuses** (redacted -- no credentials recorded):
- `bruno/smtp-dev` (smtp-dev overlay, run from inside `lef_default`): 11/11 requests passing.
- `bruno/credit-purchases`: not run live (missing an owner-role human-session token minting path in this
  environment); DI wiring proven instead via `payments.module.spec.ts`'s real module compile, included in the
  711/711 repo-wide Jest pass.

## Plan readiness

Implemented and live-verified (credits' HTTP surface via `bruno/smtp-dev`; payments' DI wiring via Jest). See
Progress and Outcomes & Retrospective.
