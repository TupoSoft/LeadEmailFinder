# Layer Service-Client Management

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Service-client life-cycle rules should not depend directly on TypeORM or the Keycloak HTTP implementation. After
this change, the module separates its HTTP API, application orchestration, domain contracts, and infrastructure.
Application services read and persist identity-owned credentials through two small identity ports. The existing
Keycloak compensation and tenant/credential-kind protections remain unchanged.

A developer can observe the result through fast port-based service tests, the real auth/serialization HTTP
integration suite, the optional full Keycloak life-cycle suite, and the existing Bruno rejection workflow.

## Progress

- [ ] (2026-08-29) Move service-client HTTP, application, domain, Keycloak, configuration, and provider code into layers.
- [ ] (2026-08-29) Replace repositories and `DataSource` with identity's credential directory and writer contracts.
- [ ] (2026-08-29) Preserve provisioning, compensation, rotation, disablement, deletion, audit, and concealment behavior.
- [ ] (2026-08-29) Run focused, live-Keycloak-optional, repository-wide, documentation, and Bruno validation.

## Plan dependencies

- `module-architecture/02`
- `module-architecture/03`
- `module-boundaries/09`

## Surprises & Discoveries

- `module-boundaries/09` will replace this feature's duplicated Keycloak HTTP transport and configuration with the
  shared `KeycloakAdminHttp` technical-library port before this plan starts. The layering work must retain that shared
  dependency and move only the feature-specific service-client adapter.

## Decision Log

- Decision: This plan adds identity's public `ServiceCredentialDirectory`/`SERVICE_CREDENTIAL_DIRECTORY` and
  `ServiceCredentialWriter`/`SERVICE_CREDENTIAL_WRITER` contracts.
  Rationale: Identity owns `ServiceCredential` and `AuditLogEntry` persistence, while this module owns life-cycle,
  authorization, provider sequencing, and compensation rules. Separating reads from atomic credential/audit writes
  avoids a generic life-cycle manager and keeps fakes purpose-specific.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Persistence operations return public credential records or operation-specific outcomes and never expose
  TypeORM repositories, entity managers, find options, or persistence entities.
  Rationale: The port must remove the infrastructure dependency rather than rename it.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep `KeycloakServiceClientAdmin` private and distinct from the organization-admin port in onboarding.
  Rationale: Client provisioning/secret rotation/deletion and human-user/realm-role operations have different
  interfaces, failure modes, and compensation rules. Both adapters may share the neutral transport from
  `module-boundaries/09` without sharing a business capability.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the current external-first/local-second ordering for rotation and deletion and the current
  compensation for creation failure.
  Rationale: Reordering provider and local state is a product/recovery change, not a layering change.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The module's production files currently sit flat under
`src/libs/modules/service-client-management/src`. `ServiceClientsController` and its DTO expose create, list,
rotate, disable, and delete routes. Five services enforce organization membership, human-session-only access,
owner/admin roles, and permission ceilings. All five services inject TypeORM repositories and/or `DataSource`;
creation also uses a raw transaction. They write identity's `ServiceCredential` and `AuditLogEntry` entities
directly.

At authoring time, the module has a narrow `KeycloakServiceClientAdmin` port and a feature-local HTTP
configuration/client/adapter. The `module-boundaries/09` dependency removes the duplicate transport/configuration and
leaves the feature adapter on the shared technical port. Creation provisions Keycloak first, then writes credential and audit atomically; on local failure it
best-effort deletes the newly generated Keycloak client and preserves the original error. Rotation obtains a new
secret before local audit persistence. Disablement is local and immediately authoritative for auth. Deletion treats
an already-gone Keycloak client as success, then deletes the local row and audits. These orderings must remain.

Plan 02 supplies the public credential record and active-credential reader required by authentication, but
deliberately does not anticipate service-client mutation operations. This plan adds the directory and writer ports
with their identity TypeORM adapters in the same pull request that consumes them. Plan 03 supplies the stable auth
barrel, human/service credential types, policy, decorators, and guards without deep imports.

## Scope and Non-Goals

Move the controller, DTOs, HTTP integration, and serialization concerns into `api/`. Move create/list/rotate/
disable/delete orchestration and the Keycloak/persistence port contracts into `application/`. Put pure credential
commands/results and validation vocabulary in `domain/`, and move the feature-specific Keycloak adapter to
`infrastructure/`. Keep the shared HTTP transport in `src/libs/keycloak-admin-http` and keep
`service-client-management.module.ts` and `index.ts` at root.

Replace every direct TypeORM read with `SERVICE_CREDENTIAL_DIRECTORY` and every atomic credential/audit mutation
with `SERVICE_CREDENTIAL_WRITER`. Keep authorization, permission ceiling, generated IDs/client IDs, external-call
ordering, and compensation in the application services; keep Nest exception mapping in API. Use a feature-specific
configuration contract/token rather than injecting the API host's aggregate environment type. Keep the
service-client public barrel restricted to `ServiceClientManagementModule`; identity exports only the contracts,
records, and tokens needed for binding.

Application/domain remain framework-free: represent authorization, validation, conflict, and not-found cases with
typed service-client errors, map them to the current Nest exceptions in API, and construct use cases with explicit
factories in the root module.

Do not change routes, DTO schemas, status codes, Swagger exclusion, supported permissions, credential-kind
requirements, tenant concealment, ordering by `createdAt`, secret-return behavior, generated client ID format,
provider-of-record decision, disablement authority, compensation, audit actions/metadata, or Keycloak semantics. Do
not combine this module with auth, identity, or onboarding; do not add migrations or schema changes.

## Plan of Work

Move source and adjacent specs into the target layers, repairing only local paths at first. Keep the existing
Keycloak business-port operations and move only their feature adapter into infrastructure. Inject the shared
`KEYCLOAK_ADMIN_HTTP` contract from `module-boundaries/09`; do not recreate a feature-local HTTP client, token cache,
or administrator-credential configuration. Define an application configuration contract only for feature values
still consumed after that dependency and bind it from Nest configuration in the module root.

Migrate listing and lookups to `ServiceCredentialDirectory`, which returns organization credentials ordered oldest
first and exposes no mutation. Migrate creation to `ServiceCredentialWriter.createWithAudit` after provider
provisioning and preserve best-effort provider cleanup on any local rejection. Use operation-shaped writer methods
for rotation persistence, idempotent disablement, and delete-with-audit after the external call. Map
not-found/already-disabled and other persistence outcomes to the same current Nest behavior.

Rewrite service specs with typed persistence and Keycloak fakes, retaining failure ordering and original-error
precedence. Keep HTTP integration on real guards/policy/serialization. Keep the live-Keycloak suite exercising the
complete create/use/rotate/disable/delete flow. Update module/Bruno README paths where files move and delete only the
fixed service-client architecture baseline entries.

Remove Nest decorators, `ConfigService`, and Nest exceptions from application/domain. Provider factories inject the
identity persistence port, Keycloak port, plain configuration, and framework-free role-permission policy. API owns
the exception/status mapping and controller serialization.

## Interfaces and Dependencies

Service-client management depends on identity's public credential/audit records plus
`SERVICE_CREDENTIAL_DIRECTORY` for ordered listing and lookup and `SERVICE_CREDENTIAL_WRITER` for atomic
create-with-audit, rotate-with-audit, idempotent disable-with-audit, and delete-with-audit. Neither interface exposes
generic CRUD, transactions, repositories, TypeORM types, or Keycloak operations.

The private `KeycloakServiceClientAdmin` contract retains provision, rotate-secret, and idempotent delete operations.
Its feature adapter consumes the public `KeycloakAdminHttp` technical-library port. The public
`RolePermissionPolicy` from auth supplies effective-permission checks. Application/domain do not depend on concrete
provider or persistence clients. No new external package is required.

## Acceptance Criteria

- The module has `api/`, `application/`, `domain/`, and `infrastructure/` directories with only Nest composition and
  the public barrel at root.
- No application/domain file imports any `@nestjs/` package, TypeORM, `DataSource`, `Repository`, identity
  persistence entities, another forbidden technical package, or module infrastructure.
- Create retains permission ceilings, human-session/role/tenant checks, deterministic client ID format, atomic local
  credential/audit persistence, best-effort removal of the Keycloak resource, and original-error precedence.
- Listing remains organization-scoped and ordered by `createdAt ASC`, including disabled credentials.
- Rotation, disablement, and deletion retain not-found concealment, disabled-state behavior, provider/local ordering,
  local authorization authority, idempotency, and audit behavior.
- Only the creation/rotation success responses expose the current secret; listing and later reads never do.
- The public barrel still exports only `ServiceClientManagementModule`.
- Unit, HTTP integration, and environment-gated live-Keycloak behavior retain their results.
- Architecture checking reports no new or stale service-client violation.

## Validation

Run focused unit and HTTP integration coverage:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/service-client-management/src --runInBand

Run repository checks:

    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/module-architecture/07-layer-service-client-management.md src/libs/modules/service-client-management/README.md src/libs/modules/identity/README.md bruno/service-client-management/README.md
    git diff --check

No Bruno requests should change, but controller/provider/persistence wiring does. Before touching Compose, inspect
the `lef-api-1` project working-directory label and stop if another checkout owns it. For a stack owned by this
checkout, run `pnpm dev:reset -- --confirm-project=LEF`, provision/bootstrap the documented M2M credential, and run:

    (cd bruno/service-client-management && npx @usebruno/cli run --env local --sandbox developer)

That collection deliberately proves rejection paths because success requires a genuine browser session. Run
`service-client-management.live-keycloak.integration.spec.ts` using the documented `TEST_SVC_*` fixture for the
create/list/use/rotate/disable/delete success life cycle when available. Report it as environment-gated otherwise.

## Idempotence and Recovery

There is no data migration. Disable and provider deletion retain their current retry behavior; creation compensation
continues using a request-unique client ID. During implementation, migrate one use case at a time but never leave
both port and direct-TypeORM writes enabled. If a disposable live test stops after provisioning a client, run that
documented test steps to clean up or delete only the unique fixture client it created; do not alter shared realm clients or
identity rows. Provider binding and file moves are repeatable once each token has one implementation.

## Artifacts and Notes

Record the final layer map, persistence operation/outcome names, compensation-order evidence, focused/full test
totals, live-Keycloak availability, and Bruno request/test totals. Never record returned client secrets, bearer
tokens, admin credentials, or real organization IDs.

## Plan readiness

Ready to implement.
