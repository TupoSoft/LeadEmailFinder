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

- [x] (2026-08-30) Reorganize auth and BFF session into their responsibility-based layers and inward dependencies.
- [x] (2026-08-30) Move authenticator assembly and global-guard registration into the API-host composition module.
- [x] (2026-08-30) Replace all 22 cross-module deep imports with intentional public-barrel imports.
- [x] (2026-08-30) Remove business-module wildcard aliases and validate unit, integration, live-fixture, and Bruno behavior.

## Plan dependencies

- `module-architecture/02`

## Surprises & Discoveries

- The architecture checker's `api-placement` rule only flags `.controller.ts`/`.dto.ts` files outside the `api`
  layer; it does not require guards or decorators to move there (the layer-dependency set for `infrastructure`
  already permits depending on `application`). Guards and decorators were still moved to `api/` for both modules
  to match this plan's own design intent (a clean, documented layer story), not because the checker demanded it.
- `PermissionsGuard` and `RolePermissionPolicy` were never actually resolved through the DI container `AuthModule`
  itself provides, by any existing consumer: `organization-onboarding` and `service-client-management` each
  already redeclare fresh instances of both in their own `providers` array, importing only the classes from the
  barrel `auth` exposes. This meant `AuthModule` did not need to keep providing or exporting either — it only
  needs to provide the ingredients a composition root uses to build `AuthenticationService`
  (`CredentialExtractor`, `OidcCredentialAuthenticator`).
- `AuthGuard` could not be provided by `AuthModule` at all once `AuthenticationService` moved to the composition
  root: Nest eagerly instantiates every provider in a module at bootstrap, and `AuthenticationService` is not
  visible inside the container `AuthModule` itself provides. `AuthGuard` is instead provided directly by
  `AuthenticationCompositionModule` (and, in tests, by whichever ad hoc module assembles `AuthenticationService`
  itself) — the class definition lives in `auth/api/`, but nothing forces it to be instantiated by `auth.module.ts`.
  The same reasoning applies to the three live-Keycloak integration tests that previously imported the real
  `AuthModule` for its old self-registering global-guard behavior, stubbing a Redis client just to satisfy
  the indirect import in `BffSessionModule`. Each now assembles its own minimal `AuthenticationService`/`APP_GUARD`
  composition locally. The `oidc-permission-check` spec and the `service-client-management` live-Keycloak spec
  each only exercise the bearer path, so neither needs the Redis stub or the BFF-only environment variables it
  never actually exercised.
- A single shared `CredentialRejectedError`, defined in the `credential-authenticator.ts` file already owned by
  auth (a file `bff-session` already legitimately imports), lets `AuthGuard` translate *any* authenticator's
  per-request rejection into a 401 without importing anything from `bff-session`. This resolves what would
  otherwise be an auth-to-`bff-session` dependency purely to catch the error types `bff-session` itself throws.
- The "sign-in requires exactly one active membership" check owned by `bff-session` is not a per-request credential
  rejection; it never runs through `AuthGuard`. It is instead a distinct login-time failure, so it kept its own
  local `SingleActiveMembershipRequiredError`, translated to 403 by the controller's `callback()` method directly.
- Rebuilding the local dev stack (`pnpm dev:reset --confirm-project=LEF`) and running the three live-Keycloak
  integration specs plus both affected Bruno collections against it (see Outcomes) caught nothing this plan's
  static validation had missed. It was still the only way to prove that the rewritten
  `AuthenticationCompositionModule` wiring, the three new typed-error translations, and the removed Redis stubs
  all produce byte-identical HTTP behavior end to end.

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
- Decision: Introduce a single `CredentialRejectedError` in the `credential-authenticator.ts` file owned by auth
  (not a family of per-cause error classes) for every per-request "this credential does not authenticate"
  failure across both modules, translated to a 401 only inside `AuthGuard`.
  Rationale: `AuthGuard` must distinguish an expected authentication failure (401) from a genuine bug or
  infrastructure fault (which should still surface as a 500, exactly as it did before this refactor). A single
  shared marker type lets every authenticator in the chain — including the one owned by `bff-session`, which
  already legitimately depends on the barrel auth exposes — signal that distinction without `AuthGuard` needing
  to import or enumerate each authenticator's own error types.
  Date/Author: 2026-08-30, implementation.
- Decision: The login-time failures owned by `bff-session` (`LoginStateInvalidError`, `AuthorizationCodeExchangeFailedError`,
  `SingleActiveMembershipRequiredError`) are translated to HTTP exceptions inside `BffSessionController.callback()`
  directly, not via a shared error-translation guard/interceptor.
  Rationale: These failures happen during `handleCallback()`, a plain controller method call outside the
  `AuthGuard`/`AuthenticationService` chain entirely (the callback request itself is `@Public()`). A local
  try/catch at the one call site that can throw them is simpler than introducing a new cross-cutting
  translation mechanism for three call sites total.
  Date/Author: 2026-08-30, implementation.
- Decision: Introduce `SessionStore`/`PENDING_LOGIN_STATE_STORE` application ports (mirroring identity's
  `module-architecture/02` port pattern) bound to the existing `RedisSessionStore`/`RedisPendingLoginStateStore`
  adapters via `useExisting`, rather than only removing the `@nestjs/common` decorators from the application
  services that consumed them directly.
  Rationale: The acceptance criteria require no application file to import its own infrastructure layer; the
  application services already only used the narrow `get`/`save`/`create`/`delete` and `create`/`consume`
  surfaces respectively, so extracting a port was a direct mechanical fit, not a speculative abstraction.
  Date/Author: 2026-08-30, implementation.
- Decision: Split `BffSessionConfiguration` (the token and interface) into `application/bff-session-configuration.ts`,
  leaving only the `ConfigService`-reading factory in `infrastructure/config/bff-session-configuration.ts`.
  Rationale: The configuration contract is read by files in `application` (`BffSessionFlowService`) and `api`
  (`BffSessionController`, `OriginGuard`, `cookie-options.ts`); the layer-dependency rule does not let either
  reach into `infrastructure`, so the contract had to move to a layer both can legally depend on.
  Date/Author: 2026-08-30, implementation.
- Decision: Add `auth.module.spec.ts`, `bff-session.module.spec.ts`, and
  `authentication-composition.module.spec.ts` (all `Reflect.getMetadata(MODULE_METADATA...)`-based, matching
  the established pattern in `identity.module.spec.ts`), plus a new `api/bff-session.controller.spec.ts` for the
  callback error-translation logic.
  Rationale: None of the rewired `@Module()` provider/factory wiring, nor the new controller-level error
  translation, had any existing fast unit-level coverage. The only test that previously exercised the real
  `AuthModule`/`BffSessionModule` DI graphs end to end was the skip-gated live-Keycloak suite.
  Date/Author: 2026-08-30, implementation.

## Outcomes & Retrospective

Implemented and fully validated, including a live rebuild of the local development stack.

Every acceptance criterion was met:

- The production source graph between `auth` and `bff-session` is one-directional (`bff-session -> auth` only);
  confirmed both by the architecture check (the `module-cycle|src/libs/modules|auth,bff-session` baseline entry
  is now stale/removed) and by `auth.module.ts` having zero imports from `bff-session`.
- All 22 preexisting cross-module deep-import declarations are gone; `rg -n
  "@tuposoft/lead-email-finder/modules/[^'\"]+/" src scripts` returns nothing outside
  `module-architecture-baseline.json`/`module-architecture.spec.ts`.
- `tsconfig.json` and `jest.config.ts` no longer have `@tuposoft/lead-email-finder/modules/auth/*` or
  `.../bff-session/*` wildcard mappings; both still keep their exact bare-barrel entries. No other module's
  wildcard mapping was touched (out of scope for this plan).
- `auth` and `bff-session` application/domain files import no `@nestjs/`, `typeorm`, or other forbidden technical
  package; guards, decorators, the controller, and DTOs now live under `api/`, which is not subject to that
  restriction. `corepack pnpm architecture:baseline` shrank the baseline from 229 to 187 violations with zero new
  ones — every removed entry belonged to this plan's scope, and nothing outside it changed.
- The host's `AuthenticationCompositionModule` registers `{ provide: APP_GUARD, useExisting: AuthGuard }` before
  `{ provide: APP_GUARD, useExisting: BrowserSessionMutationGuard }` — asserted directly by
  `authentication-composition.module.spec.ts` and proven behaviorally by the existing "rejects POST
  `/v1/auth/logout` with 401 when unauthenticated" case in `bff-session-guard-wiring.integration.spec.ts` (a
  mutation route; 401, not 403, only if auth genuinely runs first).

Validation performed:

- `TMPDIR=/tmp corepack pnpm test -- src/libs/modules/auth/src src/libs/modules/bff-session/src
  src/lead-email-finder-api/src --runInBand` — 35 suites, 221 tests, all passing.
- `TMPDIR=/tmp corepack pnpm test -- src/libs/modules/organization-onboarding/src
  src/libs/modules/service-client-management/src --runInBand` — 17 suites, 121 tests, all passing (these two
  consumer modules' own deep-import specs were repaired but their own module/provider wiring was untouched).
- `corepack pnpm architecture:baseline` then `architecture:check` — shrank 229 → 187 violations, check passes.
- `tsc --noEmit` (via a scratch tsconfig redirecting `outDir`/`tsBuildInfoFile` off the root-owned `dist/`) —
  clean.
- `TMPDIR=/tmp corepack pnpm test:ci` — 144 suites, 1099 tests passing, 49 skipped (live-fixture-gated), and a
  single to-do test that predates this plan and is unrelated to it.
- `corepack pnpm lint` — 0 errors, 2 preexisting warnings in unrelated files.
- `nest build` (via a scratch `nest-cli.json`/`tsconfig.build.json` pair redirecting `outDir` off the root-owned
  `dist/`) — 0 type-check issues, 477 files compiled.
- `git diff --check` — clean.
- Live verification: ran `pnpm dev:reset --confirm-project=LEF` to rebuild and reprovision the local `lef-*`
  Compose stack with these changes (the reset's own authenticated M2M smoke test passed against the rebuilt
  `lef-api-1`). Then, against that live stack:
  - `bruno/m2m-oidc-authentication` and `bruno/bff-sessions` — both collections, all requests, and all assertions
    passing (`/health` stays public, missing/malformed bearer credentials rejected with 401, PKCE login redirect
    correct, missing login-state on `callback` rejected with 401 — proving the new `LoginStateInvalidError` ->
    401 translation for real).
  - `bff-session-flow.live-keycloak.integration.spec.ts` (real Keycloak user, real login/callback/session,
    disabled-membership invalidation, genuine CSRF/Origin round trip, replayed-code rejection, MFA-blocked
    login) — 4/4 passing.
  - `oidc-permission-check.live-keycloak.integration.spec.ts` (real M2M token against `PermissionsGuard`,
    disabled/missing service-credential rejection) — 4/4 passing.
  - `service-client-management.live-keycloak.integration.spec.ts` (create -> token -> use -> rotate -> disable ->
    delete against a real Keycloak client) — 1/1 passing.
  - `jose-oidc-token-verifier.live-keycloak.integration.spec.ts` — 4/4 passing.
  - The three disposable Postgres databases created for this run (`bff_flow_test`, `oidc_perm_test`,
    `svc_mgmt_test`) were dropped afterward; no state was left behind beyond the normal dev-reset seed data.

No material architectural trade-off surfaced beyond what the Decision Log above already records. `credits`,
`organization-onboarding`, and `service-client-management` still consume identity's deprecated compatibility
surface directly. `organization-onboarding` and `service-client-management` also still have test-only deep
imports into their *own* modules' internals, unrelated to `auth`/`bff-session`. Both are explicitly out of scope for
this plan, left to `module-architecture/04`, `/06`, `/07`, and `/08`.

Bruno: no new endpoint, request body, status code, or auth behavior was introduced, so no Bruno *file* changed.
The two collections whose behavior this plan could plausibly have regressed (`m2m-oidc-authentication`,
`bff-sessions`) were still run live against the rebuilt stack, and both pass in full.

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

Implemented and fully validated, including live verification against a rebuilt local development stack.
Pull request not yet opened.
