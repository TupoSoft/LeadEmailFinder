# Seal Identity Persistence Behind Module Ports

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make `identity` the owner of persistence rather than the public source of TypeORM entities and repositories. After
this change, authentication, browser sessions, credits, organization onboarding, and service-client management use
the purpose-specific ports established by prerequisite plans; no consumer can inject an identity entity repository
through `IdentityModule`. A developer can observe the boundary by running `corepack pnpm architecture:check`, by
inspecting the narrow `src/libs/modules/identity/src/index.ts` barrel, and by exercising the same identity-backed HTTP
workflows against PostgreSQL and Keycloak without a route, schema, or response change.

## Progress

- [ ] (2026-08-29) Inventory every remaining identity entity, repository, and `TypeOrmModule` consumer after the prerequisite plans land.
- [ ] (2026-08-29) Remove the legacy TypeORM-coupled resolver after every caller uses the framework-free replacement and purpose-specific ports.
- [ ] (2026-08-29) Remove entity compatibility exports and the transitive `TypeOrmModule` export from the identity public surface.
- [ ] (2026-08-29) Rewire and test all identity-backed consumers without changing persistence or HTTP behavior.
- [ ] (2026-08-29) Shrink the architecture baseline and complete focused, PostgreSQL, runtime, Bruno, and full validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/06`
- `module-architecture/07`

## Surprises & Discoveries

- The current `src/libs/modules/identity/src/index.ts` exports all nine TypeORM entities, and `IdentityModule` exports
  its complete `TypeOrmModule.forFeature(...)` registration. Consumer module tests therefore override identity
  repository tokens even when the consumer needs only one narrow operation.
- Plan 02 adds a framework-free `ExternalIdentityResolver` over `EXTERNAL_IDENTITY_STORE` but deliberately retains
  the legacy TypeORM-coupled `HumanIdentityResolver` because invitation acceptance currently passes it an
  `EntityManager`. Plan 03 migrates BFF callers, and plan 06 moves the transactional onboarding use into
  `InvitationStore.accept`, making the legacy resolver removable here.
- The current identity README describes the whole `src/` tree as public. That compatibility promise must be replaced
  with the ports defined by plan 02 and consumed by plans 03, 04, 06, and 07.

## Decision Log

- Decision: Keep `AuthPrincipal`, authentication/authorization enums, status enums, `AuditOutcome`, and the stable
  application contracts needed by consumers in the identity public barrel; remove only infrastructure classes and
  persistence-shaped compatibility types.
  Rationale: These are shared business vocabulary, while TypeORM entities and repositories are implementation
  details. Consumers should not reproduce the shared vocabulary merely to avoid an infrastructure dependency.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep the prerequisite plans' purpose-specific persistence capabilities public:
  `ExternalIdentityStore`, `ActiveMembershipReader`, `ActiveServiceCredentialReader`, `CreditLedgerStore`,
  `OrganizationRegistrationStore`, `InvitationStore`, `InvitationAcceptanceStore`, `MembershipDirectory`,
  `MembershipMutationStore`, `ServiceCredentialDirectory`, and `ServiceCredentialWriter`, with their matching tokens. Return domain records or
  purpose-built results, never TypeORM entity instances, `Repository`, `EntityManager`, `DataSource`, or query
  builders.
  Rationale: A small use-case contract preserves identity's ownership and lets focused tests use in-memory fakes
  without granting consumers general table access.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Make `IdentityModule` compose the private TypeORM adapters and export only application services and port
  tokens. Do not export `TypeOrmModule`.
  Rationale: Nest module exports are an architectural surface even when TypeScript barrels are narrow. Leaving the
  module export would preserve the same repository escape hatch under a different import shape.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve every table name, column, index, relation, lock, transaction, and deletion behavior.
  Rationale: This plan changes dependency direction, not identity data semantics. Development continues to use
  TypeORM synchronization against disposable data; no migration or backfill belongs in this pull request.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Remove compatibility exports only after all prerequisite ports are present and every production consumer
  has moved to them; do not retain deprecated entity aliases or add architecture-baseline exceptions.
  Rationale: A staged internal rewire keeps the branch buildable, while a compatibility alias would make the
  intended boundary optional and permanent.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Delete `HumanIdentityResolver` after plans 03 and 06 remove its callers; keep the framework-free
  `ExternalIdentityResolver` introduced by plan 02 as the public application resolver.
  Rationale: Wrapping the legacy resolver would preserve its `EntityManager` transaction escape hatch. The additive
  replacement and onboarding persistence operation already cover its legitimate responsibilities.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/identity/src/infrastructure/persistence/` owns `Organization`, `ExternalIdentity`,
`OrganizationMembership`, `ServiceCredential`, `OrganizationCreditAccount`, `CreditDebit`, `CreditGrant`,
`OrganizationInvitation`, and `AuditLogEntry`. `identity.module.ts` registers all of them with
`TypeOrmModule.forFeature(...)`, then exports `TypeOrmModule`. The top-level `index.ts` also exports each entity.
That arrangement lets auth, BFF sessions, credits, organization onboarding, service-client management, and payments
use identity persistence as if it were their own infrastructure.

Plan `module-architecture/02` defines `ExternalIdentityStore`/`EXTERNAL_IDENTITY_STORE`,
`ActiveMembershipReader`/`ACTIVE_MEMBERSHIP_READER`, and
`ActiveServiceCredentialReader`/`ACTIVE_SERVICE_CREDENTIAL_READER`. Plan 04 adds
`CreditLedgerStore`/`CREDIT_LEDGER_STORE`; plan 06 adds `OrganizationRegistrationStore`, `InvitationStore`,
`InvitationAcceptanceStore`, `MembershipDirectory`, and `MembershipMutationStore` with their tokens; and plan 07 adds
`ServiceCredentialDirectory` and `ServiceCredentialWriter` with their tokens. Plan 03 migrates auth and BFF
consumers while preserving their composed guard order; plans 04, 06, and 07 migrate credits, organization onboarding,
and service-client management. Those consumer plans deliberately leave entity and `TypeOrmModule` compatibility
exports in place until this plan can remove them together. The API host remains the composition root and may import
the public `IdentityModule`, but it must not receive identity repositories.

The architecture checker introduced by plan 01 uses `corepack pnpm architecture:check`. Its exact current-debt
allowance lives in `scripts/architecture/module-architecture-baseline.json`; `corepack pnpm architecture:baseline`
may only remove stable violation keys after the source is fixed.

## Scope and Non-Goals

Refactor identity application services, port bindings, module metadata, public exports, tests, and documentation so
all persistence adapters remain below `src/libs/modules/identity/src/infrastructure/persistence/`. Update consumer
wiring and tests only where removal of the compatibility exports requires it. Keep the pure identity domain types
and purpose-specific application contracts public.

Do not redesign authentication, authorization, sessions, credit policy, onboarding, invitation, final-owner,
service-client, or payment behavior. Do not rename tables or columns, change relations, add entities, alter lock or
transaction boundaries established by prerequisite plans, or change any HTTP route, status, body, permission, queue,
or configuration key. Do not add TypeORM migrations, Keycloak data migrations, backfills, production rollout, or
production recovery work.

## Plan of Work

First run the architecture checker and search all production and test imports for the nine identity entities,
`getRepositoryToken(...)`, `InjectRepository`, `Repository`, `EntityManager`, `DataSource`, and `TypeOrmModule`.
Classify remaining uses as identity-owned persistence, consumer contract tests, or forbidden compatibility access.
Confirm that plans 03, 04, 06, and 07 consume every prerequisite store operation they need before deleting an export.

Under `src/libs/modules/identity/src/application/`, retain the framework-free `ExternalIdentityResolver` and remove
the legacy `HumanIdentityResolver` after confirming it has no callers. Keep port inputs and results free of
decorators and TypeORM classes. Under `infrastructure/persistence/`, implement those ports with the existing entities
and preserve the exact query, transaction, locking, and relation-loading behavior. Add contract tests that run the
same cases against an in-memory fake and the TypeORM adapter where the transaction behavior matters.

Update `identity.module.ts` to register private entities and adapters, bind public application tokens with
`useExisting`, and export only those tokens and services. Remove `TypeOrmModule` from its exports. Narrow
`src/index.ts` to the public domain vocabulary, application contracts, injection tokens, services, and
`IdentityModule`; remove every infrastructure entity export. Update affected test fixtures to construct domain
records or use port fakes instead of importing entities solely for repository-token overrides.

Search the complete repository again. No file outside identity infrastructure may import an identity entity or
obtain an identity repository. Update `src/libs/modules/identity/README.md` and dependent module documentation whose
public-dependency descriptions changed. Run `corepack pnpm architecture:baseline` only after all renamed or removed
source edges are clean; the update must delete identity-related violation keys and must not add replacement keys.

## Interfaces and Dependencies

The public `@tuposoft/lead-email-finder/modules/identity` barrel continues to expose `IdentityModule`, the pure
principal/role/permission/status/audit vocabulary, `ExternalIdentityResolver`, and the purpose-specific port
contracts and tokens established by plans 02, 04, 06, and 07. It no longer exposes `HumanIdentityResolver`, `Organization`, `ExternalIdentity`,
`OrganizationMembership`, `ServiceCredential`, `OrganizationCreditAccount`, `CreditDebit`, `CreditGrant`,
`OrganizationInvitation`, or `AuditLogEntry` as persistence classes. `IdentityModule` no longer exports
`TypeOrmModule`.

No endpoint, DTO, queue, configuration key, database schema, or external library changes. This plan consumes the
contracts established by its four prerequisites and unlocks payments layering in `module-architecture/09` and the
email-verification core extraction in `module-architecture/10`.

## Acceptance Criteria

- `IdentityModule` exports no `TypeOrmModule`, repository token, entity class, `DataSource`, or `EntityManager`.
- The identity public barrel exports no class decorated with `@Entity`, and no production consumer imports an
  identity infrastructure path or an identity entity compatibility symbol.
- Identity application and domain files import no Nest, TypeORM, or `@nestjs/typeorm` package and use no framework
  decorator.
- Auth, BFF sessions, credits, organization onboarding, service-client management, payments, and the API host compile
  and resolve through public application contracts only.
- The identity TypeORM adapters preserve all table names, columns, indexes, relationships, cascade behavior,
  pessimistic locks, idempotency keys, and transaction boundaries established before this plan.
- External identity resolution returns the same principal and membership outcomes for missing, inactive, and active
  identities without exposing an entity instance, and the legacy `HumanIdentityResolver` no longer exists.
- Credit debit/grant replay, final-owner serialization, invitation workflows, and service-credential mutations retain
  their focused and real-PostgreSQL behavior.
- The existing BFF, M2M authentication, organization-onboarding, service-client-management, credit-purchase, and
  verification HTTP contracts remain unchanged.
- `corepack pnpm architecture:baseline` removes all identity compatibility violations without adding or renaming a
  violation, and `corepack pnpm architecture:check` passes afterward.
- TypeScript, lint, focused tests, the full Jest suite, the production build, documentation lint, and diff checks pass.

## Validation

Run the architecture command before and after the refactor, inspect the shrink-only baseline diff, and prove no
consumer escape hatch remains:

    corepack pnpm architecture:check
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    rg -n "TypeOrmModule|InjectRepository|getRepositoryToken|Repository<|EntityManager|DataSource" src/libs/modules/identity/src src/libs/modules/{auth,bff-session,credits,organization-onboarding,service-client-management,payments}/src

The final `rg` output may contain TypeORM only under identity infrastructure and each consuming module's own private
persistence adapter; inspect every match rather than accepting a nonzero list mechanically. Run the identity and
consumer suites together so stale repository-token overrides cannot hide:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/identity/src src/libs/modules/auth/src src/libs/modules/bff-session/src src/libs/modules/credits/src src/libs/modules/organization-onboarding/src src/libs/modules/service-client-management/src src/libs/modules/payments/src --runInBand

Against a disposable PostgreSQL database, run the schema, ledger, and serialized-membership proofs with both test
variables pointing at that database:

    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TEST_CREDITS_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- identity-schema.integration.spec.ts credits.service.integration.spec.ts membership-mutation-concurrency.integration.spec.ts --runInBand

Run the live Keycloak-gated auth, BFF, organization, and service-client tests when their documented `TEST_OIDC_*`,
`TEST_BFF_*`, `TEST_ORG_*`, and `TEST_SVC_*` variables are available. Start from a disposable stack with
`pnpm dev:reset -- --confirm-project=LEF`, require
`curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'`, and run
the existing `bruno/m2m-oidc-authentication`, `bruno/bff-sessions`, `bruno/organization-onboarding`,
`bruno/service-client-management`, and `bruno/credit-purchases` collections with
`bru run --env local --sandbox developer` using the short-lived credentials documented by each collection. No Bruno
requests need a semantic change; these collections are the required runtime wiring regression.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/identity/README.md .agents/plans/module-architecture/08-seal-identity-persistence.md
    git diff --check

Bruno is required because module-export and adapter wiring changes can break externally visible workflows even
though their HTTP contracts are intentionally unchanged.

## Idempotence and Recovery

Port extraction and export removal are deterministic and safe to repeat. Keep the branch buildable by adding and
wiring adapters before removing compatibility exports. If interrupted, use `git status`, the architecture report,
and the identity export audit to distinguish incomplete work from unrelated user changes; do not restore progress by
exporting an entity again or enlarging the baseline. A failed baseline update is recoverable by fixing the current-only
or baseline-only edge and rerunning the shrink-only command.

All data remains disposable. If an integration run encounters incompatible local state, verify ownership of the
`LEF` Compose project, then run `pnpm dev:reset -- --confirm-project=LEF` to reset and reseed it. There is no migration
to roll back. Preserve an existing stack owned by another checkout and never use broad destructive Compose commands
as a shortcut for cleaning up tests.

## Artifacts and Notes

Record the final public identity exports, exported Nest providers, removed baseline keys, repository-import audit,
focused and PostgreSQL test results, live collection totals, and full validation results. Record only redacted
Keycloak identifiers and no access tokens, client secrets, database URLs with credentials, or customer data.

## Plan readiness

Ready to implement.
