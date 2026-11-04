# Layer Organization Onboarding

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Organization creation, invitations, and membership administration should express business and concurrency rules
without direct TypeORM or Keycloak implementation dependencies. After this change, onboarding has explicit API,
application, domain, and infrastructure layers. Application services use small identity-owned persistence ports and
a private Keycloak port. All invitation, role, final-owner, audit, and compensation behavior remains observable
through the same HTTP endpoints.

Developers can observe the boundary through port-based unit tests, real-Postgres final-owner concurrency tests,
live-Keycloak adapter tests, and the existing onboarding Bruno collection.

## Progress

- [x] (2026-08-31) Move onboarding controllers/DTOs, use cases, domain rules, and Keycloak/configuration adapters into layers.
- [x] (2026-08-31) Replace repositories, `DataSource`, and `EntityManager` with small identity persistence ports.
- [x] (2026-08-31) Preserve invitation idempotency, organization locking, final-owner safety, audit, and compensation tests.
- [x] (2026-08-31) Run focused, database, live-Keycloak-optional, repository-wide, and Bruno validation.

## Plan dependencies

- `module-architecture/02`
- `module-architecture/03`
- `module-boundaries/09`

## Surprises & Discoveries

- `module-boundaries/09` had already removed the duplicated feature-local Keycloak HTTP transport and
  configuration before this plan started; `KeycloakOrganizationAdminClient` already consumed the shared
  `KeycloakAdminHttp` port. Nothing to do there — confirmed by reading the adapter before starting.
- `MembershipRoleChangeService`/`MembershipRemovalService` turned out to need the exact same session pattern as
  invitation acceptance: each calls Keycloak (`assignRealmRole`) while the organization row is locked, between
  the load and the save. This was not explicit in the Decision Log's wording. It fell out of reading
  `membership-role-change.service.ts` line by line. So `MembershipMutationStore` grew the same `begin()`/session
  shape as `InvitationAcceptanceStore`, rather than a single-call outcome contract. The already-disabled no-op
  case in `MembershipRemovalService` calls `session.abort()` directly (a no-op transaction that never reaches the
  final-owner check), matching the original early return before any write. Both session ports use a manually
  managed `QueryRunner` (`connect()`/`startTransaction()`), not the `dataSource.transaction()` sugar, since the
  transaction must stay open across the external Keycloak call.
- Once these six services depend on ports instead of raw TypeORM, their unit tests stop asserting exact
  `Repository`/`EntityManager` call shapes; they mock the port instead. That freed the new adapters to choose
  their own query shape. For example, `TypeOrmMembershipMutationStore` always joins `externalIdentity`, even for
  `disable()`, which never needs it, without touching any test.
- No existing unit test asserted exact Forbidden/Conflict/Not-Found error message text — only
  `.rejects.toThrow(SomeNestException)`, with no message argument. So the new domain error classes
  (`domain/organization-onboarding.errors.ts`) were free to choose their own messages. The original wording was
  kept anyway since it was free and preserves existing UX.
- `HumanIdentityResolver` in `identity` had exactly one consumer, `invitation-acceptance.service.ts`. This plan
  moved that consumer onto the inline resolve-or-create-and-lock logic owned by `InvitationAcceptanceStore`. That
  logic is reimplemented against the session's `QueryRunner.manager`, not delegated to the already-provided but
  transaction-unaware `ExternalIdentityResolver`/`ExternalIdentityStore`. That store commits via the default
  non-transactional repo and would break the all-or-nothing rollback on a Keycloak failure. With its only
  consumer gone, `HumanIdentityResolver` and its spec were deleted as dead code; `ExternalIdentityResolver`
  remains provided-but-unconsumed, unrelated to this plan.
- `membership-mutation-concurrency.integration.spec.ts` was rewired to import the real `IdentityModule`, not
  `OrganizationOnboardingModule`, and factory-bind `MembershipRemovalService`/`MembershipRoleChangeService`
  directly via `MEMBERSHIP_MUTATION_STORE` — mirroring the integration-spec precedent owned by `credits`. That is
  narrower than importing the whole onboarding module. Importing the whole module would have required faking
  Keycloak-admin-HTTP configuration environment variables purely to satisfy Nest's eager instantiation of an
  unrelated provider, while this approach still exercises the real identity port/adapter wiring end to end.

## Decision Log

- Decision: This plan adds five public identity persistence contracts: `OrganizationRegistrationStore`,
  `InvitationStore`, `InvitationAcceptanceStore`, `MembershipDirectory`, and `MembershipMutationStore`, each with a
  matching stable token.
  Rationale: Creation/invitation acceptance, membership reads, and locked membership mutations have different
  consistency requirements. Separate operation-shaped interfaces avoid a broad onboarding manager while preserving
  identity's ownership of TypeORM implementation.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Persistence methods are operation-shaped and return domain records or discriminated outcomes for
  not-found, already-accepted, conflicting-membership, and final-owner cases.
  Rationale: Atomic checks must occur with their locks, while HTTP exception mapping and role policy remain in
  application/API code.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep the organization-admin provider port and adapter private to onboarding. Place the adapter in
  infrastructure and make it consume the shared `KeycloakAdminHttp` port delivered by `module-boundaries/09`.
  Rationale: Service-client management has a different Keycloak operation set and recovery semantics; merging the
  two would create a broad provider client.
  Date/Author: 2026-08-29, Codex planning.
- Decision: `InvitationAcceptanceStore.begin` returns either a terminal result or a purpose-specific
  `InvitationAcceptanceSession` with only `complete()` and `abort()` operations. The application invokes Keycloak
  after `begin` has performed the existing identity lock and conflict checks, then completes or aborts the session in
  `try`/`finally` control flow.
  Rationale: The current correctness contract keeps the external role assignment inside the database lock window.
  The narrow session preserves that ordering while ensuring the application—not a repository or persistence
  callback—calls the HTTP-backed Keycloak port. It exposes no TypeORM object or general query/transaction operation.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Invitation token generation/hashing, expiration constants, and final-owner decision vocabulary belong
  to domain; Nest exceptions, controllers, validation DTOs, and Swagger decorators belong to API.
  Rationale: Pure rules should be testable without Nest, TypeORM, HTTP, or Keycloak.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

`organization-onboarding` now has `api/`, `application/`, `domain/`, `infrastructure/` layers plus root
composition; `identity` gained five new ports (`OrganizationRegistrationStore`, `InvitationStore`,
`InvitationAcceptanceStore`, `MembershipDirectory`, `MembershipMutationStore`) and their TypeORM adapters, and
lost `HumanIdentityResolver` (dead code once its one consumer migrated). All six application services are
framework-free classes wired through explicit factories in `organization-onboarding.module.ts`; the controller's
`handleErrors()` maps seven typed domain errors to the unchanged `Forbidden`/`NotFound`/`Conflict`/`Gone` HTTP
behavior.

Focused/unit totals: identity 87 tests (13 suites, 1 skipped without `TEST_POSTGRES_URL`), organization-onboarding
77 tests (12 suites, 2 skipped without `TEST_POSTGRES_URL`/live-Keycloak fixtures). Full `test:ci`: 1216 tests,
1166 passed, 49 skipped (preexisting gates), 1 marked pending — no regressions outside this plan's own files.
`architecture:baseline` shrank from 166 to 149 violations, confirmed via diff to be a pure removal with no added
lines. `architecture:check` passes. `typecheck`, `lint`, and `build` (via scratch `nest-cli`/`tsconfig.build`
configurations, deleted after use) all pass clean.

A `lef-*` dev stack was running (owned by this checkout, confirmed via the `lef-api-1` working-directory label),
which let all live validation run for real. `membership-mutation-concurrency.integration.spec.ts` against a disposable
`membership_mutation_test` database: 2/2 passed, proving the `MembershipMutationStore` session actually
serializes concurrent final-owner mutations against real Postgres locks. The live-Keycloak spec
(`keycloak-organization-admin.live-keycloak.integration.spec.ts`) against a disposable
`org_onboarding_live_test` database and the real Keycloak realm: 4/4 passed after updating its one assertion from
`ConflictException` to `ConflictingMembershipError` (it calls `InvitationAcceptanceService` directly, bypassing
the controller's HTTP mapping, so it must assert the domain error the service now throws). `bruno/organization-onboarding`
against the same stack (real `lef-development-service` M2M token): 8/8 requests, 8/8 tests passed, including the
`409` existing-owner-conflict path. Both disposable databases were dropped after use; no containers or shared
fixtures were touched.

No material SOLID trade-offs. Each of the five new ports is single-purpose, one persistence concern each. The
two session-shaped ports isolate transaction-suspension complexity in the infrastructure layer owned by
`identity`, rather than leaking `QueryRunner` into onboarding. No generic "manager" interface was introduced.

## Context and Orientation

At authoring time, the module's production source is flat under
`src/libs/modules/organization-onboarding/src`. `OrganizationsController` and `organizations.dto.ts` expose six
routes. Six application-like services import TypeORM `DataSource`, `Repository`, or Nest TypeORM and operate on
identity persistence entities. The Keycloak port, feature adapter, duplicated HTTP transport/configuration, and tests
sit beside those services. The `module-boundaries/09` dependency removes that duplicated transport first and leaves
the feature adapter on the shared technical port.

Current correctness depends on exact transaction behavior. Organization creation writes the organization, first
owner invitation, and two audit rows atomically. Invitation issuance writes invitation and audit atomically.
Acceptance resolves/creates an external identity, locks it, rechecks invitation status, rejects a second active
membership, conditionally assigns a Keycloak realm role, conditionally marks the invitation accepted, creates the
membership, and audits the result. Role change/removal lock the organization row before counting active owners so
concurrent mutations cannot eliminate the final owner. Keycloak failures and local failures retain their current
recording or compensation behavior.

Plan 02 provides identity-owned domain records and the external-identity lookup behavior needed during migration,
but intentionally does not guess at onboarding mutation contracts. This plan adds the five operation-shaped ports
and their identity TypeORM adapters in the same pull request that consumes them. Plan 03 stabilizes the public
decorators, guard, principal, and role/permission API from auth.

## Scope and Non-Goals

Move `OrganizationsController`, its DTOs, and HTTP serialization/integration concerns to `api/`. Move organization,
invitation, membership listing/change/removal, and acceptance orchestration to `application/`. Move token generation
and hashing, TTL, operation commands/results, and pure invariant vocabulary to `domain/`. Move the feature-specific
Keycloak organization-admin adapter and any remaining feature configuration adapter to `infrastructure/`; keep the
shared Keycloak HTTP transport in `src/libs/keycloak-admin-http`. Keep `organization-onboarding.module.ts` and
`index.ts` at root.

Migrate every onboarding use case from raw identity entities and TypeORM handles to the five identity persistence
ports. Keep actor/tenant/role policy and Keycloak call/compensation sequencing in onboarding application services.
Map persistence outcomes to the same `ForbiddenException`, `NotFoundException`, `ConflictException`, and
`GoneException` behavior. Keep the onboarding public barrel restricted to `OrganizationOnboardingModule`; identity
exports only the new contracts, records, and tokens required to bind them.

Application/domain remain framework-free: use typed onboarding errors/outcomes rather than Nest exceptions, map
those errors to the named existing HTTP exceptions in API, and instantiate use cases through explicit factories in
`OrganizationOnboardingModule`.

Do not change paths, DTO schemas, status codes, permissions, Swagger visibility, token entropy/hash/TTL, email
normalization, invitation replay behavior, Keycloak user preservation, realm-role rules, tenant concealment,
final-owner logic, lock ordering, audit actions/metadata, or compensation. Do not combine onboarding with identity,
auth, BFF session, or service-client management. Do not add migrations or change schema metadata.

## Plan of Work

Move files with adjacent specs into final layers and update local imports. Introduce application-facing
configuration types/tokens so use cases do not inject root environment DTOs or concrete configuration factories.
Keep `KeycloakOrganizationAdmin` as a small application port; move its feature-specific adapter into infrastructure,
inject the shared `KEYCLOAK_ADMIN_HTTP` contract from `module-boundaries/09`, and bind it in the root Nest module. Do
not restore a feature-local HTTP client, token cache, or credential configuration.

Replace repository and transaction code with the five identity persistence contracts. Use
`OrganizationRegistrationStore` for create-with-owner-invitation-and-audit; `InvitationStore` for issue-with-audit,
lookup, and failure-audit append; `InvitationAcceptanceStore` for beginning the locked acceptance attempt;
`MembershipDirectory` for active membership listing; and `MembershipMutationStore` for role change or disablement
under the organization lock with audit. Preserve the existing order of external calls relative to local
transactions. The application calls the privileged-role port only while a ready acceptance session exists, then
calls `complete()` or guarantees `abort()` in `finally`. Persistence results distinguish an already accepted
invitation from a newly accepted one and final-owner/conflict outcomes without throwing Nest exceptions.

Replace `@Injectable`, `@Inject`, `ConfigService`, and Nest exceptions in application with plain constructors,
configuration values, and typed errors. The root module uses factories to inject identity persistence, Keycloak, and
configuration ports. API controllers or an API-local exception mapper translate errors to unchanged HTTP behavior.

Rewrite service unit tests around typed persistence and Keycloak fakes while retaining every current success and
rejection scenario. Keep the real-Postgres concurrency test against the actual identity adapter, including both
mutation orderings. Keep HTTP integration tests using real auth/permissions and serialization wiring. Update module
documentation and remove only the onboarding entries that the architecture checker now observes as fixed.

## Interfaces and Dependencies

Onboarding depends on identity's public `AuthPrincipal`, roles, organization/invitation/membership records, and the
`ORGANIZATION_REGISTRATION_STORE`, `INVITATION_STORE`, `INVITATION_ACCEPTANCE_STORE`, `MEMBERSHIP_DIRECTORY`, and
`MEMBERSHIP_MUTATION_STORE` tokens. Each interface exposes only named semantic
commands and discriminated results, not repositories, query options, `DataSource`, `EntityManager`, TypeORM entities,
or a generic transaction function. `InvitationAcceptanceSession` exposes only `complete()` and `abort()`; it cannot
query arbitrary state or escape the acceptance use case. Auth supplies its public decorators, guards, and
role-permission policy.

The private `KeycloakOrganizationAdmin` port retains `ensureUser` and realm-role operations required by current use
cases. Its infrastructure adapter depends on the public `KeycloakAdminHttp` technical-library port; application and
domain do not depend on Nest configuration or HTTP. Auth supplies only its public decorators/guards/policies. No new
external dependency is required.

## Acceptance Criteria

- Onboarding has `api/`, `application/`, `domain/`, and `infrastructure/` directories with only composition and the
  public barrel at root.
- No application/domain file imports any `@nestjs/` package, TypeORM, `DataSource`, `EntityManager`, an identity
  persistence entity, another forbidden technical package, or onboarding infrastructure.
- Organization creation and invitation issuance retain atomic audit writes and normalized invitation data.
- Invitation acceptance retains unknown/expired/already-accepted/conflicting-identity behavior, Keycloak sequencing,
  conditional realm-role assignment, and duplicate-request idempotency.
- Role change and removal retain organization-row locking and prevent the final active owner from being demoted or
  removed under both concurrent orderings.
- Existing authorization, tenant isolation/concealment, audit records, Keycloak failure handling, and response
  serialization remain unchanged.
- The public barrel still exports only `OrganizationOnboardingModule`.
- Focused unit/HTTP tests, real-Postgres concurrency tests, and live-Keycloak-gated tests retain their results.
- Architecture checking reports no new or stale onboarding violation.

## Validation

Run focused unit and HTTP integration coverage:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/organization-onboarding/src --runInBand

Run final-owner behavior against disposable PostgreSQL:

    TEST_POSTGRES_URL=<disposable-postgres-url> TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- membership-mutation-concurrency.integration.spec.ts --runInBand

Run repository checks:

    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    git diff --check

No Bruno requests should change, but provider and persistence wiring do. Before touching Compose, inspect the
`lef-api-1` project working-directory label and stop if another checkout owns it. For a stack owned by this checkout,
run `pnpm dev:reset -- --confirm-project=LEF`, provision/bootstrap the documented service credential, and run:

    (cd bruno/organization-onboarding && npx @usebruno/cli run --env local --sandbox developer)

Run `keycloak-organization-admin.live-keycloak.integration.spec.ts` using the documented `TEST_ORG_*` fixture when
available. Bruno cannot prove genuine human-session role hierarchy, final-owner concurrency, or MFA realm-role
assignment; retain and report the focused HTTP, PostgreSQL, and live-Keycloak evidence for those cases.

## Idempotence and Recovery

There is no data migration. Invitation and membership retries preserve their existing idempotency and locking.
During implementation, switch one use case at a time but never leave both direct-TypeORM and port writes active for
the same request. Every ready acceptance session must complete or abort in `finally`, and tests must prove an external
failure releases its query runner and lock. If a disposable Keycloak/PostgreSQL run fails after creating fixtures, use the documented test or
documented development reset procedure; do not remove shared users, organizations, or containers manually.
Reapplying file moves and provider bindings is safe once each token has exactly one provider binding.

## Artifacts and Notes

Record the final layer map, persistence operation/outcome names, lock/concurrency evidence, focused/full test totals,
live-Keycloak availability, and Bruno request/test totals. Never record invitation tokens, passwords, access tokens,
or Keycloak client secrets.

## Plan readiness

Implemented and fully validated, including real-Postgres concurrency, live-Keycloak, and Bruno evidence.
