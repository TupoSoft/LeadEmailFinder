# Make Auth and BFF Session Acyclic and Layered

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Authentication should have one explicit composition point and no mutual module dependency. After this change,
`auth` owns bearer authentication and authorization contracts, `bff-session` owns browser-session behavior, and the
API host assembles both credential authenticators and installs the two global guards. Source dependencies point only
from BFF session to the public API of auth, never back from auth into BFF session.

Developers can observe the result by running the module-architecture check and finding no cross-module deep import
or auth/BFF cycle. Runtime tests and Bruno still show default-deny bearer authentication, BFF login, OIDC return,
session, and logging out behavior, plus global CSRF/Origin protection with the same guard order and status codes.

## Progress

- [ ] (2026-08-29) Reorganize auth and BFF session into their responsibility-based layers and inward dependencies.
- [ ] (2026-08-29) Move authenticator assembly and global-guard registration into the API-host composition module.
- [ ] (2026-08-29) Replace all 22 cross-module deep imports with intentional public-barrel imports.
- [ ] (2026-08-29) Remove business-module wildcard aliases and validate unit, integration, live-fixture, and Bruno behavior.

## Plan dependencies

- `module-architecture/02`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Implement one `AuthenticationCompositionModule` at
  `src/lead-email-finder-api/src/authentication/authentication-composition.module.ts`.
  Rationale: The executable host is the legitimate outer composition root. It can depend on both modules without
  making either business module depend outward or on the other module's implementation.
  Date/Author: 2026-08-29, Codex planning.
- Decision: The host composition module imports public `AuthModule` and `BffSessionModule`, assembles the
  `CREDENTIAL_AUTHENTICATORS` array from `OidcCredentialAuthenticator` and
  `BffSessionCredentialAuthenticator`, provides `AuthenticationService`, and registers `AuthGuard` before
  `BrowserSessionMutationGuard` as `APP_GUARD` providers.
  Rationale: This preserves the existing authentication-before-CSRF ordering while removing source imports from auth
  into BFF session.
  Date/Author: 2026-08-29, Codex planning.
- Decision: BFF session may depend on the public credential contract, cookie-name constant, decorators, and
  request-principal helpers. Auth has no source dependency on BFF session.
  Rationale: A browser session is one authentication adapter; the authentication policy must not depend on that
  optional adapter.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Move controllers, DTOs, HTTP guards, decorators, and HTTP helpers to `api/`; keep use cases and ports in
  `application/`, pure records/rules in `domain/`, and JSON Web Token, Keycloak, Redis, configuration, and cryptography
  implementations in `infrastructure/`.
  Rationale: The current BFF controller is incorrectly under infrastructure, and BFF application services directly
  import Redis and configuration implementations.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Remove every `@tuposoft/lead-email-finder/modules/<module>/*` mapping from `tsconfig.json` and the
  corresponding module wildcard mapper from `jest.config.ts` after imports are repaired.
  Rationale: Exact aliases are the supported public barrels. Removing wildcard resolution makes future deep imports
  fail in both TypeScript and Jest instead of relying only on lint convention.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/auth/src/auth.module.ts` currently imports `BffSessionModule`,
`BffSessionCredentialAuthenticator`, and `BrowserSessionMutationGuard` through three deep paths. It builds the
two-authenticator array and installs `AuthGuard` followed by the browser mutation guard globally. BFF production
source imports five auth internals for the credential contract, session cookie name, principal accessor, and HTTP
decorators. This creates the repository's only source-level business-module cycle.

There are exactly 22 deep-import declarations under the module aliases: eight production imports, all between auth
and BFF session, and fourteen test-only imports in BFF session, organization onboarding, and service-client
management. Most test imports already name symbols exported by the auth barrel. The BFF mutation guard and the
session-cookie constant from auth need deliberate public exports because they are genuine composition contracts.

BFF application services also import `RedisSessionStore`, `RedisPendingLoginStateStore`, and infrastructure
configuration directly. Auth and BFF application code directly read identity persistence today; plan 02 provides
active-membership and service-credential ports plus a port-backed `ExternalIdentityResolver`. Those contracts
replace the membership repository in BFF, the credential repository in auth, and the legacy
`HumanIdentityResolver` use in BFF here.

## Scope and Non-Goals

Move auth and BFF files with history-preserving renames into the standard layer directories. Introduce BFF session
store and pending-login-state store interfaces/tokens in application and bind the existing Redis implementations in
`BffSessionModule`. Put configuration contracts/tokens where application and API can depend inward while keeping
environment parsing in infrastructure. Migrate service-credential resolution in auth and BFF membership reads to
the identity ports from plan 02, and migrate BFF OIDC return identity resolution to the new
`ExternalIdentityResolver`.

Remove Nest decorators/exceptions from application and domain. Represent authentication, session, membership, and
authorization failures with framework-free typed errors. Translate them to the existing HTTP exceptions in API
guards/controllers. Construct dependency-bearing application services with explicit factories in the root module or
API-host composition module.

Create `AuthenticationCompositionModule`, change `LeadEmailFinderApiModule` to import it instead of importing
`AuthModule` directly, and preserve global provider order. Narrowly update the auth and BFF public barrels for the
contracts that host composition or BFF genuinely consumes. Update all production and test deep imports to exact
module aliases, then delete only business-module wildcard aliases; generic library aliases are outside this plan.

Do not change OIDC issuer/audience/JWKS validation, credential precedence, cookie names/options, token encryption,
session timeouts, PKCE, refresh, logout, membership invalidation, role-to-permission mapping, public-route metadata,
CSRF/Origin rules, routes, payloads, redirects, or status codes. Do not merge auth and BFF into one module, add a
plugin registry, use runtime self-registration, or create a shared dumping-ground package.

## Plan of Work

First introduce layer paths and application ports without changing behavior. In auth, place authentication and
authorization contracts/use cases in application or domain, HTTP guards/decorators in API, and JSON Web Token
configuration and verification in infrastructure. In BFF session, move the controller/DTO/cookie/HTTP guard surface
to API and retain session records in domain. Keep login, OIDC return, refresh, authentication, and membership
orchestration in application. Place Redis, Keycloak, JSON Web Token, cryptography, and environment configuration in
infrastructure. Update local relative imports and adjacent specs with each move.

Replace the concrete Redis dependencies in BFF with `SessionStore` and `PendingLoginStateStore` application ports and
stable tokens. Replace direct identity repositories with the public active-membership and active-service-credential
contracts from plan 02, and replace the legacy resolver dependency in BFF with `ExternalIdentityResolver`. Ensure no
application file imports its own infrastructure layer or TypeORM.

Make the application services plain TypeScript classes. Add typed application errors for current unauthorized,
forbidden, refresh, and state-mismatch cases, and map them at the API boundary without changing messages/statuses.
Use explicit Nest provider factories in `AuthModule`, `BffSessionModule`, and `AuthenticationCompositionModule` so
framework-free constructors still receive their ports.

Make `AuthModule` provide and export the OIDC authenticator and its infrastructure dependencies but no longer
provide `AuthenticationService`, import BFF session, or register global guards. Ensure `BffSessionModule` provides
and exports the BFF authenticator and browser mutation guard. In the API host, create
`AuthenticationCompositionModule` with both modules imported, the two-authenticator factory, `AuthenticationService`,
and the ordered `APP_GUARD` providers. Add a focused composition integration test that resolves the real provider
graph and demonstrates auth runs before browser mutation checks.

Change all 22 deep-import declarations to the appropriate exact barrel. Export the auth session-cookie name as a
named contract without widening the barrel to unrelated extractor internals. Export only the BFF authenticator,
mutation guard, and module required by host composition. Remove all module wildcard mappings from TypeScript and
Jest, retaining exact mappings and the documented wildcard mappings for non-module technical libraries. Update the
three module documentation files and remove all violations fixed here from the ratchet baseline.

## Interfaces and Dependencies

`@tuposoft/lead-email-finder/modules/auth` remains the public source for `AuthModule`, authentication and credential
contracts, `AuthenticationService`, the OIDC authenticator class needed by host composition, role/permission policy,
guards, decorators, request-principal helpers, and the shared session-cookie-name constant.

`@tuposoft/lead-email-finder/modules/bff-session` exports `BffSessionModule`,
`BffSessionCredentialAuthenticator`, and `BrowserSessionMutationGuard`. Redis stores, controllers, DTOs, OAuth and JSON Web Token
clients, configuration factories, and crypto remain private.

The API-host composition module is not a reusable business-module API. `LeadEmailFinderApiModule` imports it as the
single authentication runtime entry point. Auth and BFF continue to use identity's public domain records and the
purpose-specific ports introduced by plan 02. No new external package is required.

## Acceptance Criteria

- Between these two modules, the production source graph has `bff-session -> auth` only; auth has no import from BFF
  session, and neither has a deep import into identity or another module.
- All 22 current cross-module deep-import declarations are gone, including test-only imports.
- `rg` finds no import matching a module alias followed by an additional path segment.
- `tsconfig.json` and `jest.config.ts` retain exact aliases for all nine business modules and contain no business-
  module wildcard mapping.
- Auth and BFF application/domain files have no import from their own infrastructure directories, any `@nestjs/`
  package, TypeORM, or another forbidden technical package from the module contract.
- The host provider graph contains both credential authenticators exactly once and applies `AuthGuard` before
  `BrowserSessionMutationGuard`.
- Missing/invalid credentials remain `401`; `/health` and public BFF login/OIDC return behavior remains unchanged;
  permissions remain default-deny; and unsafe human-session mutations retain Origin/CSRF enforcement without
  affecting bearer requests.
- Existing session login, refresh, logout, replay rejection, disabled-membership invalidation, and M2M permission
  integration tests retain their results.
- The architecture baseline removes every fixed auth/BFF/deep-import entry and contains no stale entry.

## Validation

Run focused auth, BFF, host-composition, and affected consumer integration tests:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/auth/src src/libs/modules/bff-session/src src/lead-email-finder-api/src src/libs/modules/organization-onboarding/src/organization-onboarding-http.integration.spec.ts src/libs/modules/service-client-management/src/service-client-management-http.integration.spec.ts --runInBand

Prove the source and alias boundaries:

    rg -n "@tuposoft/lead-email-finder/modules/[^'\"]+/" src scripts
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/module-architecture/03-make-auth-and-bff-session-acyclic-and-layered.md src/libs/modules/auth/README.md src/libs/modules/bff-session/README.md src/libs/modules/identity/README.md src/libs/modules/README.md
    git diff --check

Run the existing HTTP regressions against the normal local Compose stack:

    (cd bruno/m2m-oidc-authentication && bru run --env local)
    (cd bruno/bff-sessions && bru run --env local)

No Bruno definition change is expected because the HTTP contract is unchanged. Run the skip-gated
`oidc-permission-check.live-keycloak.integration.spec.ts` and
`bff-session-flow.live-keycloak.integration.spec.ts` with their documented disposable Keycloak/PostgreSQL fixtures
when available; report unavailable fixtures truthfully.

## Idempotence and Recovery

File moves and import changes are repeatable. The provider rewiring does not mutate Redis, Keycloak, or PostgreSQL.
If host composition fails partway through, keep the old `AuthModule` import and guard providers until the new
composition integration test passes; never leave both global compositions active because that would duplicate
guards. If a local live run creates session or login-state keys, use the documented disposable development reset,
not ad hoc deletion against shared Redis. Preserve unrelated worktree changes.

## Artifacts and Notes

Record the final public exports, the exact zero-result deep-import search, provider-order test evidence, focused/full
test totals, live-fixture availability, and Bruno results. Do not record tokens, cookies, client secrets, or session
encryption keys.

## Plan readiness

Ready to implement.
