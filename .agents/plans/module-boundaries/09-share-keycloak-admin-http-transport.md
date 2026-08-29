# Share Keycloak Admin HTTP Transport Across Feature Modules

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Organization onboarding and service-client management should use one Keycloak Admin HTTP transport without either
business capability depending on the other. After this change, both feature-specific Keycloak adapters resolve one
shared, injected transport, use one access-token cache, and retain their existing user, role, OAuth-client, recovery,
authorization, and HTTP behavior. A developer can observe the result through one transport implementation and
configuration factory in `src/libs/keycloak-admin-http/src`, a Nest wiring test proving provider identity across both
consumers, and the unchanged organization-onboarding and service-client life-cycle checks.

## Progress

- [ ] (2026-08-29) Add the shared Keycloak Admin HTTP port, implementation, configuration, and Nest module.
- [ ] (2026-08-29) Rewire both feature adapters to the shared port and remove their duplicated transport files.
- [ ] (2026-08-29) Consolidate focused tests and update module documentation without changing public feature barrels.
- [ ] (2026-08-29) Complete static, focused, full-suite, runtime, and applicable Bruno regression validation.

## Plan dependencies

- `module-boundaries/07`

## Surprises & Discoveries

- `.agents/plans/auth/08-m2m-client-management.md` deliberately duplicated the HTTP client and configuration because
  `OrganizationOnboardingModule` exported no providers. That avoided a feature-to-feature dependency, but it also
  duplicated provider registration and access-token state.
- The copies are no longer identical. The service-client version treats an explicitly accepted `404` as a response
  without a body so an idempotent delete race succeeds; the organization-onboarding version handles only `204` and
  empty bodies at that point.
- Both production feature adapters call only `request`; `requestOrUndefined` is covered by the duplicated transport
  specs but has no production caller under `src/`.
- `scripts/keycloak/keycloak-admin-api.ts` is a separate command-line provisioning client. It authenticates with the
  master-realm administrator password instead of the API's realm service account and is not another runtime consumer
  of this transport.

## Decision Log

- Decision: Put the shared transport in `src/libs/keycloak-admin-http/src`, exposed as
  `@tuposoft/lead-email-finder/keycloak-admin-http`, rather than in either business module or `src/libs/common`.
  Rationale: Keycloak HTTP authentication and response handling are reusable technical infrastructure; the parent
  `src/libs` directory is the established home for technical libraries, while `common` should not become an
  unstructured dependency bucket.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep `KeycloakOrganizationAdminClient` and `KeycloakServiceClientAdminClient`, their business ports, and
  their provider registrations private and separate.
  Rationale: User/realm-role administration and OAuth-client life-cycle management have different operations and
  recovery semantics. Sharing their transport does not justify merging their capability interfaces.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Export a small `KeycloakAdminHttp` interface and `KEYCLOAK_ADMIN_HTTP` injection token; keep
  `FetchKeycloakAdminHttpClient`, its credential-bearing configuration, and the configuration token private to the
  shared library.
  Rationale: Feature adapters should depend on an injected port rather than a concrete fetch client, and no consumer
  needs access to the administrator client secret.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Make the port accept realm-relative Admin API paths and let the transport prepend the configured
  `/admin/realms/<realm>` prefix.
  Rationale: The transport already needs the realm to obtain its service-account token. Owning realm path construction
  removes the remaining reason for feature adapters to inject the credential-bearing configuration.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Use one ordinary, statically configured `KeycloakAdminHttpModule` imported by both feature modules; do not
  make it global or expose a dynamic `forRoot` API.
  Rationale: Explicit imports preserve visible dependency direction, and Nest reuses one static module instance in the
  composed application. A focused wiring test will make the single-provider assumption executable.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve the hardened service-client response semantics as the shared behavior and remove the unused
  `requestOrUndefined` method instead of publishing it.
  Rationale: An accepted `404` must return without parsing a body during idempotent deletion, even when Keycloak returns
  text content.
  Organization onboarding never accepts `404` through `request`, and an unused method would unnecessarily broaden the
  new public port.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`LeadEmailFinderApiModule` imports both `OrganizationOnboardingModule` and `ServiceClientManagementModule`. Each feature
currently declares a local `KEYCLOAK_ADMIN_HTTP_CONFIGURATION` symbol, the same configuration factory, and a concrete
`KeycloakAdminHttpClient`. Each concrete client obtains a token with `client_credentials`, caches it until five seconds
before expiry, serializes JSON requests, checks caller-supplied accepted statuses, and parses successful response
bodies. Because the classes, symbols, and Nest registrations are distinct, the running API has two provider instances
and two token caches even though both read `OIDC_ISSUER_URL`, optional `KEYCLOAK_ADMIN_API_BASE_URL`,
`KEYCLOAK_ORG_ADMIN_CLIENT_ID`, and `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET`.

`src/libs/modules/organization-onboarding/src/keycloak-organization-admin-client.service.ts` uses its local transport
to find or create users and assign realm roles. The adapter in
`src/libs/modules/service-client-management/src/keycloak-service-client-admin-client.service.ts` uses the other copy to
create, find, rotate, scope, and delete OAuth clients. Those adapters are the correct boundary for capability-specific
Keycloak behavior and remain in their feature modules.

The duplicated source and specs are
`keycloak-admin-http-client.service.ts`, `keycloak-admin-http-client.service.spec.ts`,
`keycloak-admin-http-configuration.ts`, and `keycloak-admin-http-configuration.spec.ts` under each feature's `src/`
directory. The service-client copy additionally returns `undefined` for an accepted `404`, which is required when
`deleteClient` accepts `[204, 404]` after a concurrent or retried deletion.

## Scope and Non-Goals

Create a neutral Keycloak Admin HTTP technical library with exact and wildcard TypeScript/Jest aliases. Move the
configuration, service-account authentication, token caching, request serialization, accepted-status handling, and
response parsing into one private fetch implementation exposed through a narrow port token.
Import the shared module from both features, inject the port into both feature adapters, remove the eight duplicated
transport/configuration source and spec files, and update the two feature README files.

Preserve all controller routes, DTOs, response schemas, status codes, authorization, tenant concealment, persistence,
audit writes, compensation order, idempotent deletion, Keycloak endpoint behavior, and environment-variable names.
Do not merge or export the feature-specific Keycloak business ports, change `LeadEmailFinderApiModule`, add a package
dependency, modify Keycloak provisioning, alter the command-line `scripts/keycloak/keycloak-admin-api.ts`, add schema
work or migrations, or promise coalescing of simultaneous first-token or refresh requests. The last behavior is not
provided by either current client and is independent concurrency hardening.

## Plan of Work

Under `src/libs/keycloak-admin-http/src`, add `keycloak-admin-http.ts`, `keycloak-admin-http.module.ts`,
`keycloak-admin-http-configuration.ts`, `fetch-keycloak-admin-http-client.service.ts`, and `index.ts`. The port file
defines `KeycloakAdminHttp` and `KEYCLOAK_ADMIN_HTTP`; its single operation accepts an HTTP method, a realm-relative
path, an optional body, and optional accepted statuses. The private configuration file preserves the existing issuer
parsing, container-reachable base-URL override, client ID, and client secret. `FetchKeycloakAdminHttpClient` preserves
the current token TTL default, five-second safety margin, authorization headers, content-type headers, error details,
empty-body handling, JSON parsing, and the service-client copy's accepted-`404` behavior.

Add `KeycloakAdminHttpModule` as a statically configured module that imports `ConfigModule`, registers the private
configuration and concrete client, binds the public token with `useExisting`, and exports only `KEYCLOAK_ADMIN_HTTP`.
Export the module, port type, and token from the library's `index.ts`; do not export the implementation, configuration,
or credentials. Add exact and wildcard mappings for `@tuposoft/lead-email-finder/keycloak-admin-http` to `tsconfig.json`
and `jest.config.ts`, keeping the Jest wildcard mapping before the bare mapping.

Change `OrganizationOnboardingModule` and `ServiceClientManagementModule` to import the shared module and remove their
local `ConfigService`, configuration factory, and concrete transport registrations. Change both feature adapters to
inject `KEYCLOAK_ADMIN_HTTP` as `KeycloakAdminHttp` and send realm-relative paths. Their existing business ports remain
unchanged. Update their specs to mock the shared interface directly, without casting a partial mock to a concrete
client. Delete both copies of the old client/configuration and their duplicate specs.

Consolidate the duplicate coverage in `keycloak-admin-http-configuration.spec.ts` and
`fetch-keycloak-admin-http-client.service.spec.ts`. Cover base-URL fallback and override, credential validation, token
acquisition and reuse, refresh near expiry, the default TTL when `expires_in` is absent, authentication failure,
rejected status details, JSON bodies, empty bodies, `204` responses, and an accepted `404` containing a non-JSON body.
Assert the exact token URL and form fields, the exact realm-prefixed Admin API URL with query strings intact, the Bearer
and content-type headers, and the serialized JSON body. In `keycloak-admin-http.module.spec.ts`, define two consumer
modules, each with a local probe provider that injects `KEYCLOAK_ADMIN_HTTP`. Resolve the probes from their owning
modules, compare their transport references, and issue sequential requests through both to prove provider identity and
shared token reuse. Update both feature README files to identify the shared technical dependency while retaining their
module-only public barrels and feature-specific adapter ownership.

Run static searches for old configuration tokens, old client imports, and duplicate implementations. Then run focused
and full validation, both live-Keycloak feature suites when their dedicated fixtures are available, and the existing
Bruno collections against a disposable API. Record unavailable runtime prerequisites as unverified rather than passed.

## Interfaces and Dependencies

Add this internal package alias and contract:

    @tuposoft/lead-email-finder/keycloak-admin-http

    export const KEYCLOAK_ADMIN_HTTP = Symbol('KEYCLOAK_ADMIN_HTTP')

    export interface KeycloakAdminHttp {
        requestRealm<T = void>(
            method: string,
            path: string,
            body?: unknown,
            acceptedStatuses?: readonly number[],
        ): Promise<T>
    }

`path` starts with `/` and is relative to `/admin/realms/<configured realm>`. The private implementation constructs the
same full URLs and error paths used today. `KeycloakAdminHttpModule` is the only public runtime provider. No endpoint,
DTO, entity, database table, queue, environment key, third-party package, or externally supported module export changes.

## Acceptance Criteria

- Exactly one fetch-based Keycloak Admin HTTP implementation, configuration factory, configuration provider, and
  service-account token cache remain under `src/`; neither feature contains a transport/configuration copy.
- Both feature modules import the shared module, and both feature adapters inject `KeycloakAdminHttp` through
  `KEYCLOAK_ADMIN_HTTP`; neither depends on a concrete infrastructure client or the other feature.
- The shared barrel exports only the module, interface, and injection token. Administrator credentials and the concrete
  fetch implementation remain private, while both feature barrels continue to export only their Nest modules.
- A composed Nest test resolves one local probe from each importing consumer module, and both probes hold the same
  transport object. Sequential requests through the probes obtain one service-account token until the configured expiry
  margin requires refresh.
- `OIDC_ISSUER_URL`, optional `KEYCLOAK_ADMIN_API_BASE_URL`, `KEYCLOAK_ORG_ADMIN_CLIENT_ID`, and
  `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET` retain their current required/optional meaning and URL-selection behavior.
- Successful JSON, `204`, empty-body, authentication-failure, and rejected-status responses retain current behavior and
  error details. Token and realm request URLs, query strings, authentication form fields, headers, serialized bodies,
  expiry fallback, and safety-margin behavior remain exact. An explicitly accepted `404` returns `undefined` without
  parsing its body.
- Organization user creation/reuse and realm-role assignment retain their current endpoints, idempotency, credential
  preservation, compensation, and failure behavior in focused and live-Keycloak coverage.
- Service-client provisioning, audience-scope assignment, secret rotation, local disablement, compensation, and
  idempotent deletion retain their current order, endpoint paths, and failure behavior in focused and live-Keycloak
  coverage.
- Existing authorization, tenant isolation, routes, request validation, response schemas, audit behavior, and
  persistence remain unchanged; no Bruno request definition requires modification.
- Type checking, linting, the production build, focused tests, the full suite, the ExecPlan repository fixture, and
  whitespace validation pass. A clean API bootstrap resolves both feature modules without missing or duplicate-provider
  errors.

## Validation

Run the focused shared/consumer coverage with writable temporary and Corepack caches:

    COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/keycloak-admin-http/src src/libs/modules/organization-onboarding/src src/libs/modules/service-client-management/src --runInBand

The shared transport suite must cover configuration fallback/override, exact token/admin URLs and form fields, query
preservation, the Bearer authorization header, the JSON content-type header, and serialized request bodies. It must also
verify token reuse, expiry refresh, the default TTL, authentication rejection, non-accepted response details,
JSON/empty/`204` results, and an
accepted `404` with a text body. The module-wiring suite must compare the transport references injected into one local
probe per consumer and prove one sequential token acquisition through those probes. The feature suites must continue
to cover both business adapters and their application-level compensation.

Run repository-wide static and automated checks:

    COREPACK_HOME=/tmp/lef-corepack corepack pnpm typecheck
    COREPACK_HOME=/tmp/lef-corepack corepack pnpm build
    COREPACK_HOME=/tmp/lef-corepack corepack pnpm lint
    COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand
    COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm docs:lint -- .agents/plans/module-boundaries/README.md .agents/plans/module-boundaries/09-share-keycloak-admin-http-transport.md src/libs/modules/organization-onboarding/README.md src/libs/modules/service-client-management/README.md
    git diff --check

Search for stale copies and boundary violations. The old feature paths and tokens must have no matches, there must be
one concrete fetch implementation, and cross-feature/deep imports must remain absent:

    rg -n "KEYCLOAK_ADMIN_HTTP_CONFIGURATION" src
    rg -n "class KeycloakAdminHttpClient|requestOrUndefined" src
    rg -n "class FetchKeycloakAdminHttpClient" src
    rg -n "@tuposoft/lead-email-finder/modules/(organization-onboarding|service-client-management)/" src

The configuration-token matches, if that existing private name is retained, must occur only inside
`src/libs/keycloak-admin-http/src`. The removed class name and method must have no matches; the concrete fetch class must
have one definition; and the unsupported feature subdirectory import search must have no matches.

With dedicated disposable PostgreSQL databases and the documented `TEST_ORG_*` and `TEST_SVC_*` Keycloak fixtures,
run both real-adapter suites without allowing their environment gates to skip:

    COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/organization-onboarding/src/keycloak-organization-admin.live-keycloak.integration.spec.ts src/libs/modules/service-client-management/src/service-client-management.live-keycloak.integration.spec.ts --runInBand

When a disposable API stack for this checkout is available, rebuild and start it and verify `/health`. From
`bruno/organization-onboarding`, run:

    bru run --env local --sandbox developer

Separately, from `bruno/service-client-management`, run:

    bru run --env local --sandbox developer

The onboarding collection reaches the Keycloak-backed invitation-acceptance flow. The service-client collection covers
only rejection paths because it cannot mint a `human_session`, so the live-Keycloak service-client suite is the required
provider-life-cycle regression. No new Bruno requests are expected because the HTTP contract is unchanged. If Docker,
Keycloak, the dedicated test databases, the API, or Bruno is unavailable, retain the unit/build evidence and record the
specific live checks as unverified.

## Idempotence and Recovery

This refactor changes no database row, Keycloak realm object, secret, queue, or schema. Reapplying it only recreates the
same source/module wiring. If file removal or rewiring is interrupted, inspect `git status`, retain unrelated edits, and
complete or reverse only the explicit old/new paths before rerunning focused tests. Do not tear down a Compose project
owned by another checkout merely to validate this plan.

The existing organization and service-client live tests create uniquely named disposable Keycloak objects and perform
their documented cleanup. If a live run stops before cleanup, use its recorded generated identifier with the existing
test cleanup or the repository's confirmed development reset/reseed workflow; never retry a non-idempotent provider
operation against an object whose state is unknown. No TypeORM migration, backfill, or persistent-data recovery is
needed.

## Artifacts and Notes

Record the final list of deleted duplicate files, public-barrel exports, stale-copy search results, focused/full test
counts, provider-identity assertion, build/bootstrap result, and redacted live-Keycloak/Bruno outcomes. Do not record
administrator credentials, client secrets, bearer tokens, invitation tokens, or provider response bodies containing
secrets.

## Plan readiness

Ready to implement.
