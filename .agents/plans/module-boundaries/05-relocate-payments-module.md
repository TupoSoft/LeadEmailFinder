# Relocate payments into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Credit purchase policy and payment-provider adapters should form a self-contained business module rather than depend
on the API host's environment DTO. After this change, payments live under `src/libs/modules/payments/src`, expose a
deliberate public API, own their provider configuration types, and preserve checkout and webhook behavior.

## Progress

- [x] (2026-08-23) Separate payment configuration contracts from the host environment DTO.
- [x] (2026-08-23) Move payment source/tests and publish the module alias/barrel.
- [x] (2026-08-23) Rewire the host and verify stub/Paddle, persistence, credit grant, and HTTP regressions.

## Plan dependencies

- `module-boundaries/04`
- `payments/08`

## Surprises & Discoveries

- Payment services and adapters import `EnvironmentVariablesDto` from the API host, so the feature currently points
  outward to its composition root.
- `PaymentsProviderName` and `PaddleEnvironmentName` are declared in that host DTO even though only the payment
  capability gives them meaning.
- The module already has explicit provider and purchase-store ports with stub, Paddle, and TypeORM adapters.
- A full `pnpm test:ci` run needs local-listener permission for the repository's HTTP integration suites. The
  sandboxed run failed with `listen EPERM`, while the same command passed after that permission was granted.
- The local Compose stack was running, but none of the six required `bruno/credit-purchases` environment variables
  was present, including `OWNER_ACCESS_TOKEN`; live Bruno execution therefore remained unavailable.

## Decision Log

- Decision: Move payment-specific enums and a narrow configuration shape into the payment module, while the root
  environment DTO imports and validates those public enums.
  Rationale: The host may validate the complete environment, but a feature must not import its host's aggregate DTO.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Preserve the existing provider/store ports and adapter selection factory.
  Rationale: They already express the relevant variation points; relocation does not justify redesign.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Implemented and validated. All 27 payment source and test files moved to `src/libs/modules/payments/src` with their
existing responsibilities and Nest tokens intact. The new `PaymentConfiguration` contract owns the seven payment
keys, plus `PaymentsProviderName` and `PaddleEnvironmentName`; the API host imports the enums for aggregate
environment validation, while payment code no longer imports the host DTO. The exact and wildcard payment aliases
are registered for TypeScript and Jest, and the public barrel exposes only the configuration contract and
`PaymentsModule`.

`LeadEmailFinderApiModule` now composes payments through the public alias. Focused payment, credit, and environment
tests passed with 107 tests and seven environment-gated skips. Type checking and build passed, lint passed with two
preexisting warnings, and the full Jest suite passed 721 tests with 24 environment-gated skips and one pending test.
Bruno was not run because the running local stack had none of the collection's required environment variables,
including the owner access token.

## Context and Orientation

Before this change, `src/lead-email-finder-api/src/payments` owned the credit-pack catalog, purchase
controller/service, webhook controller/handler, `CreditPurchase` entity, payment provider and purchase-store ports,
stub provider, Paddle adapter, TypeORM store, and focused tests. They now live under
`src/libs/modules/payments/src`. `PaymentsModule` imports configuration, TypeORM, credits, identity, and auth. The
root `EnvironmentVariablesDto` still validates payment provider selection, catalog, return URL, stub secret, and
Paddle credentials through configuration enums imported from the payment module.

## Scope and Non-Goals

Move payments to `src/libs/modules/payments/src`, add its alias and public barrel, move payment-owned configuration
enums/types inward, and update the API host plus tests. Preserve routes, DTOs, raw webhook body handling, signature
verification, idempotent event correlation, credit grants, provider selection, payment URLs, and persistence schema.
Do not change catalog contents, prices, Paddle API behavior, webhook semantics, or add migrations.

## Plan of Work

Introduce a small payment configuration contract containing only keys read by payment code and relocate
`PaymentsProviderName`/`PaddleEnvironmentName` with it. Update payment services/adapters to type `ConfigService`
against that contract. Keep the root environment DTO responsible for validation by importing the enums from the
module public API without causing the module to import the host.

Move source/specs with Git-aware renames, add exact/wildcard aliases, and replace credits imports with the alias from
plan 04. Limit `index.ts` to `PaymentsModule`, payment-owned configuration enums, and application contracts genuinely
used elsewhere. Update `LeadEmailFinderApiModule` and all test fixtures. Confirm provider token identity and raw-body
webhook wiring survive the move.

## Interfaces and Dependencies

Adds `@tuposoft/lead-email-finder/modules/payments`. Moves internal TypeScript configuration types without changing
environment variable names or accepted values. Existing HTTP endpoints, payment provider port, purchase-store port,
entity metadata, and Nest tokens retain behavior.

## Acceptance Criteria

- Payment source/tests live under `src/libs/modules/payments/src`; no payment implementation imports the API host.
- The root environment validator accepts/rejects the same payment configurations as before.
- Stub and Paddle provider selection resolves the same adapter for the same `PAYMENTS_PROVIDER` value.
- Payment session creation, webhook verification, early-event correlation, idempotent purchase updates, and credit
  grants retain existing behavior and schemas.
- No table, column, route, status code, or environment variable changes.
- A clean build and API bootstrap resolve the relocated module and both provider configurations in focused tests.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/payments/src
src/libs/modules/credits/src src/lead-email-finder-api/src/environment-variables.dto.spec.ts --runInBand`. Run
`corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`,
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci`, and `git diff --check`. From
`bruno/credit-purchases`, run `bru run --env local` against its documented stub fixture. Paddle live/sandbox
validation is not required for a source-only move; retain existing adapter tests and report live verification
accurately.

## Idempotence and Recovery

The move changes no payment or credit rows. Provider configuration names remain stable, so retrying a partial move
requires only reconciling source paths and imports. Use the documented disposable reset only if the local Bruno
fixture is contaminated, never against non-disposable data.

## Artifacts and Notes

Focused Jest: 14 suites passed and two environment-gated suites skipped; 107 tests passed and seven skipped.

Repository validation: type checking passed; build compiled 438 files; lint passed with two preexisting warnings;
full Jest passed 118 suites and skipped eight environment-gated suites, with 721 tests passed, 24 skipped, and one
pending test; `git diff --check` passed.

Bruno: not run. `docker compose -f docker/compose.yaml ps --status running --services` confirmed the local stack was
running, but `OWNER_ACCESS_TOKEN`, `OIDC_ISSUER_URL`, `KEYCLOAK_SERVICE_CLIENT_ID`,
`KEYCLOAK_SERVICE_CLIENT_SECRET`, `PLATFORM_ORGANIZATION_ID`, and `PAYMENTS_STUB_WEBHOOK_SECRET` were all absent from
the process environment. No credentials or secrets were recorded.

## Plan readiness

Implemented and validated, except for live Bruno execution because its required environment variables were absent.
