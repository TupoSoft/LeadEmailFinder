# Introduce Purpose-Specific Identity Persistence Ports

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Business modules should request identity data through narrow application contracts rather than inject repositories,
`DataSource`, or `EntityManager` for identity-owned TypeORM entities. After this change, identity exposes only the
purpose-specific read seams needed to migrate auth and browser sessions in the next pull request. A new
framework-free `ExternalIdentityResolver` depends inward on the external-identity port, while the TypeORM-coupled
`HumanIdentityResolver` and entity exports remain as temporary compatibility until their consumer follow-up plans
land. Credits, organization onboarding, and service-client management define their own operation-shaped persistence
ports when their use cases migrate, after their final requirements are known.

Developers can observe the new boundary in focused tests: application services run against in-memory port fakes,
TypeORM adapter tests preserve current query, locking, idempotency, and transaction behavior, and the unchanged API
host still starts with the existing identity schema.

## Progress

- [ ] (2026-08-29) Define public identity data shapes, purpose-specific ports, and stable injection tokens.
- [ ] (2026-08-29) Implement TypeORM adapters and a port-backed `ExternalIdentityResolver` without migrating consumers.
- [ ] (2026-08-29) Preserve and document transitional compatibility for consumers awaiting plans 03, 04, 06, and 07.
- [ ] (2026-08-29) Run focused, schema, repository-wide, documentation, and runtime-wiring validation.

## Plan dependencies

- `module-architecture/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Identity owns the TypeORM implementation and exports application-facing contracts, not repositories or
  provider-specific clients.
  Rationale: Identity already owns the organization, external-identity, membership, credential, credit-ledger,
  invitation, and audit tables. Keeping their persistence adapters in identity prevents every consumer from
  recreating TypeORM knowledge.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Introduce only `ExternalIdentityStore`/`EXTERNAL_IDENTITY_STORE`,
  `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, and
  `ActiveServiceCredentialReader`/`ACTIVE_SERVICE_CREDENTIAL_READER` in this pull request.
  Rationale: These are the three identity-owned capabilities required by plan 03. Defining the credits, onboarding,
  and service-client mutation contracts before those use cases migrate would guess at atomicity and outcome
  requirements. Those plans introduce small operation-shaped ports just in time.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Port methods return public domain records or operation-specific results and accept domain values; they
  never expose `Repository`, `DataSource`, `EntityManager`, query builders, TypeORM find options, or persistence
  entity classes.
  Rationale: Otherwise application code would remain coupled to infrastructure despite using an interface.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep the current `TypeOrmModule` and entity exports from `IdentityModule` only as explicitly temporary
  compatibility for consumers not yet migrated.
  Rationale: Removing them before the consumer plans would force an unsafe all-modules-at-once pull request.
  `module-architecture/08` removes the compatibility surface after every consumer has migrated.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Add a port-backed `ExternalIdentityResolver` but leave the existing `HumanIdentityResolver` signature
  and TypeORM implementation unchanged in this additive plan.
  Rationale: Invitation acceptance currently passes a TypeORM `EntityManager` to the legacy resolver so identity
  creation participates in its transaction. Removing that argument before plan 06 would break compilation or
  silently change atomicity. Plan 03 migrates BFF to the new resolver; plan 06 moves invitation acceptance to the
  onboarding persistence operations introduced with that migration; plan 08 then removes the legacy resolver.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/identity/src/identity.module.ts` currently registers nine TypeORM entities, provides
`HumanIdentityResolver`, and exports both the resolver and `TypeOrmModule`. `src/libs/modules/identity/src/index.ts`
also exports all persistence entity classes. The legacy `HumanIdentityResolver` is in `application/` but imports
`ExternalIdentity` from `infrastructure/persistence` and accepts an optional TypeORM `EntityManager`; this exact
compatibility remains recorded in the baseline until plans 03 and 06 remove its consumers.

Those exports let other modules bypass identity's application boundary. Auth injects a `ServiceCredential`
repository; BFF session injects an `OrganizationMembership` repository; credits owns credit rules but operates on
three identity entities directly; organization onboarding and service-client management use raw TypeORM
transactions over identity entities. Later plans migrate each consumer without combining unrelated business
changes.

In this plan, a port means an operation-shaped TypeScript interface plus a stable `Symbol` injection token under
`src/libs/modules/identity/src/application/ports/`. A TypeORM adapter under
`src/libs/modules/identity/src/infrastructure/persistence/` implements that interface. Public record types live in
`domain/` or beside the application contract when they are use-case results; persistence entities stay private to
infrastructure once the transition completes.

## Scope and Non-Goals

Create the port directory, public domain records required by the three ports, injection tokens, TypeORM adapters,
and focused contract/adapter tests. Add a framework-free `ExternalIdentityResolver` that preserves the behavior of the legacy resolver:
lookup, email-refresh, create, and PostgreSQL unique-race recovery semantics through `EXTERNAL_IDENTITY_STORE`.
Leave `HumanIdentityResolver` untouched so current BFF and invitation-acceptance consumers remain source- and
transaction-compatible. When plan 06 migrates onboarding, its operation-shaped persistence ports own atomic
identity resolution rather than passing a transaction handle through the application layer.

Make `ExternalIdentityResolver` and every new application contract a framework-free TypeScript class/interface.
Bind the new resolver in `IdentityModule` with an explicit factory that injects `EXTERNAL_IDENTITY_STORE`; Nest
decorators and tokens used for provider wiring stay in the root composition module or infrastructure. The legacy
resolver remains a compatibility exception explicitly recorded in the baseline, not a model for new code.

Register the new adapters and public tokens in `IdentityModule`. Keep current entity registration, table names,
columns, constraints, relations, and synchronization behavior unchanged. Keep legacy entity and `TypeOrmModule`
exports with an explicit compatibility comment and architecture-baseline entries naming the remaining consumers.

Do not migrate auth, BFF session, credits, onboarding, service-client application code, or the legacy
`HumanIdentityResolver` in this pull request.
Do not create a generic repository abstraction, generic manager service, generic transaction callback, or generic
CRUD API. Do not move business authorization or compensation rules into identity adapters. Do not add database
migrations, alter the development schema, change Keycloak behavior, or change HTTP routes and payloads.

## Plan of Work

Add identity domain records that contain only the fields plan 03 consumers need. Keep authentication types such as
`AuthPrincipal`, `AuthRole`, and `AuthPermission` stable. Define narrow port interfaces and tokens for resolving an
external identity, an active service credential, or an active organization membership. Do not anticipate mutation
contracts or offer arbitrary entity access.

Implement each contract in a focused TypeORM adapter. Preserve current query predicates, ordering, pessimistic-lock
placement, uniqueness handling, audit writes, and transaction boundaries. Add mappers between private TypeORM
entities and public records where returning the entity would leak decorators or mutable persistence state. Add
`ExternalIdentityResolver` over the external-identity port and prove its email-refresh and PostgreSQL
unique-violation recovery with adapter-level tests for the competing-insert path. Keep the legacy resolver tests and
implementation unchanged as compatibility evidence.

Wire adapters to tokens in `IdentityModule` with `useExisting` so one adapter instance backs each contract. Export
only the public tokens, interfaces, records, and resolver from the intended barrel additions. Retain legacy exports
unchanged for now and document the exact removal dependency on plans 03, 04, 06, and 07. Remove the violations this
plan actually fixes from the architecture baseline; do not remove compatibility violations that still exist.

Update `src/libs/modules/identity/README.md` to distinguish the new supported application API from the deprecated
persistence compatibility surface. Keep this ExecPlan current with implemented contract names and validation
evidence.

## Interfaces and Dependencies

The public API gains these stable symbols and interfaces:

- Immutable `ExternalIdentityRecord`, `OrganizationMembershipRecord`, and `ServiceCredentialRecord` shapes, using
  the `Record` suffix so they can coexist with the temporarily exported decorated entity classes without an
  ambiguous barrel export;

- `ExternalIdentityStore`/`EXTERNAL_IDENTITY_STORE` for lookup, email refresh, create, and unique-race recovery used
  by `ExternalIdentityResolver`;
- `ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER` for active membership lookup by organization/external identity
  and the exactly-one-active-membership login query;
- `ActiveServiceCredentialReader`/`ACTIVE_SERVICE_CREDENTIAL_READER` for issuer/subject lookup with status data.

Each token and contract has exactly the stated responsibility and must not be combined into `IdentityRepository`,
`IdentityManager`, `IdentityStore`, or an equivalent broad abstraction. Adapters depend on Nest TypeORM and TypeORM;
application contracts and domain records do not. Plans 04, 06, and 07 introduce their own small identity persistence
ports only when they migrate the associated use cases. No new package dependency is required.

## Acceptance Criteria

- Every newly added identity application/domain file has no import from infrastructure, any `@nestjs/` package,
  TypeORM, or another forbidden technical package. The legacy `HumanIdentityResolver` violation remains itemized in
  the ratchet until its consumers migrate.
- `ExternalIdentityResolver` matches the legacy lookup, email update, create, and concurrent unique-conflict
  behavior through an injected purpose-specific port; the legacy resolver remains source-compatible.
- Every new port has a stable token, a TypeORM adapter, and focused tests proving the current success, idempotency,
  not-found, ordering, transaction, or lock behavior relevant to that port.
- No port exposes TypeORM types or generic CRUD/query operations.
- Existing consumers continue compiling and running through the explicitly retained compatibility surface.
- Identity schema synchronization produces the same tables, columns, constraints, and relations as before.
- `corepack pnpm architecture:check` reports no new violation and rejects a stale baseline entry for any violation
  removed by this plan.
- No HTTP route, response, authentication decision, credit behavior, onboarding behavior, or service-client behavior
  changes.

## Validation

Run focused unit and adapter coverage:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/identity/src --runInBand

Run the existing real-Postgres schema test against disposable data:

    TEST_POSTGRES_URL=<disposable-postgres-url> TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- identity-schema.integration.spec.ts --runInBand

Run repository checks:

    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/module-architecture/02-introduce-identity-persistence-ports.md src/libs/modules/identity/README.md
    git diff --check

Bruno is not applicable because this plan adds unused internal ports/adapters and preserves every current consumer
and runtime provider path. No route, DTO, authentication decision, or externally exercised integration wiring
changes. The focused adapter/module tests and existing full suite are the relevant evidence.

## Idempotence and Recovery

The change is source- and provider-wiring-only. Rerunning tests or applying TypeORM synchronization to a disposable
database does not transform data. Adapters preserve the existing idempotency keys and lock semantics. If partial
implementation leaves both a direct repository and port binding, restore compilation by keeping the compatibility
export and finish one adapter at a time; do not delete entities or reset user data. For schema-test recovery, drop
and recreate only the disposable test database, then rerun synchronization and its fixture setup.

## Artifacts and Notes

Record the final port/token names, the remaining compatibility consumers, focused test totals, schema comparison,
and any environment-gated runtime checks here during implementation. Never record credentials or database URLs.

## Plan readiness

Ready to implement.
