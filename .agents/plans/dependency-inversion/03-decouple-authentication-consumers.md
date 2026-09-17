# Authenticate Requests Through Explicit Capabilities

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.
Proposed commit and PR title: `refactor(auth): inject authentication capabilities through ports`.

## Purpose / Big Picture

Authentication guards and application orchestration will accept small, framework-independent contracts instead
of concrete authentication and credential/membership resolver classes. Developers can
substitute those capabilities with typed object literals and resolve the real Nest providers without reproducing
implementation state. Request authentication, permission decisions, and browser membership checks remain unchanged.

## Progress

- [ ] (2026-09-17) Introduce explicit auth and active human-membership contracts and provider aliases.
- [ ] (2026-09-17) Migrate consumers and composition sites while preserving authentication and guard ordering.
- [ ] (2026-09-17) Verify substitution, existing success and rejection paths, architecture, types, and documentation.

## Plan dependencies

None.

## Surprises & Discoveries

The completed `module-architecture/03` plan removed framework dependencies and the auth/BFF cycle, but its
application services and guards still inject concrete peers. `CredentialAuthenticator` already describes both
OIDC and browser authenticators; adding a second interface for either implementation would duplicate that contract.
The pure credential extractor and permission policy remain unchanged. This plan addresses service orchestration
seams while preserving those local policy helpers.

## Decision Log

- Decision: Reuse `CredentialAuthenticator` with distinct provider tokens for its OIDC and BFF implementations.
  Rationale: The host owns chain ordering, while each module owns its implementation. Date/author: 2026-09-17, Codex.
- Decision: Keep both active-membership operations in one small `HumanMembershipLookup` contract.
  Rationale: They share membership validity rules; each caller still chooses its existing lookup operation.
  Date/author: 2026-09-17, Codex.
- Decision: Leave pure credential/permission helpers and Nest `Reflector` concrete.
  Rationale: This task targets meaningful service orchestration seams, not an interface for each class.
  Date/author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/auth/src/api/auth.guard.ts` calls `AuthenticationService.authenticate()`. The service uses
`CredentialExtractor.extract()` and selects the first supporting `CredentialAuthenticator`. The OIDC authenticator
uses `ServiceCredentialResolver.resolveActive()` after token verification. `PermissionsGuard` obtains effective
permissions from `RolePermissionPolicy`; `DefaultServiceClientGrantPolicy` obtains role permissions from the same
class. Existing identity readers and OIDC verifier interfaces already isolate persistence and JOSE.

`src/lead-email-finder-api/src/authentication/authentication-composition.module.ts` constructs the ordered OIDC/BFF
chain and installs `AuthGuard` before `BrowserSessionMutationGuard`. Auth itself must continue to have no BFF
dependency. The BFF `HumanMembershipResolver` supplies both request-time membership lookup and the exactly-one-active-
membership login check. Its consumers are `application/bff-session-credential-authenticator.ts` and
`application/bff-session-flow.service.ts` under `src/libs/modules/bff-session/src/`.

## Scope and Non-Goals

Change the named consumers, their factories, tokens, focused tests, and affected module documentation.
Do not change credentials, headers, permission lists, token verification, response bodies, provider behavior,
configuration, persistence, cookies, authentication priority, or global guard registration order. This is not a new
authorization system. BFF flow/current-account/refresh ports and identity's existing-identity capability belong to
`dependency-inversion/04`. Completed `module-architecture/03` remains historical evidence, not unfinished work.

## Plan of Work

Add the auth contracts below in `src/libs/modules/auth/src/application/ports/`. Move only relevant data declarations
when necessary; do not derive contracts with `Pick`, `Parameters`, or `ReturnType` over implementation classes.
Declare existing classes as implementations, type consumer constructor parameters against the contracts, and add
explicit `@Inject` annotations only in the API layer. Application classes remain free of Nest imports.

In `auth.module.ts`, retain one factory per implementation and add `useExisting` aliases for its capabilities.
Export `RequestAuthenticator`, `REQUEST_AUTHENTICATOR`, and `OIDC_CREDENTIAL_AUTHENTICATOR` through `src/index.ts`,
alongside the existing `CredentialAuthenticator`. Export the OIDC token from `AuthModule`; the host owns the
request-authenticator binding. Keep the active-service resolver contract and token private. Retain existing class
exports for compatibility; migrated service consumers use the new contracts. Bind `REQUEST_AUTHENTICATOR` in the
host composition module to the existing
`AuthenticationService` instance. Build the chain using the two `CredentialAuthenticator` tokens in the current
order; export the request token wherever the previous host provider was exported.

Add `bff-session/src/application/human-membership-lookup.ts` and bind `HUMAN_MEMBERSHIP_LOOKUP` to the existing
resolver. Move `SingleActiveMembershipRequiredError` into this contract file so the flow and controller need no
resolver implementation import. Update both membership consumers and BFF factory parameter types. Add
`BFF_CREDENTIAL_AUTHENTICATOR` as a public alias of the existing BFF authenticator without changing its implementation.

Extend module and host wiring tests to resolve every new token, assert aliases return the original singleton, and
exercise guard behavior with independently typed object-literal substitutes. Retain unit tests of the real
authentication implementations; token substitution does not prove their business rules.

## Interfaces and Dependencies

Use these explicit contracts and symbol tokens; all types already come from auth or identity except the named ports:

```ts
type RequestHeaders = Record<string, string | string[] | undefined>
interface RequestAuthenticator {
    authenticate(headers: RequestHeaders): Promise<AuthPrincipal>
}
interface ActiveServicePrincipalCredentialResolver {
    resolveActive(issuer: string, subject: string): Promise<ServiceCredentialRecord>
}
interface HumanMembershipLookup {
    resolveActive(organizationId: string, externalIdentityId: string): Promise<OrganizationMembershipRecord>
    resolveActiveForLogin(externalIdentityId: string): Promise<OrganizationMembershipRecord>
}
```

Auth owns `REQUEST_AUTHENTICATOR`, `ACTIVE_SERVICE_PRINCIPAL_CREDENTIAL_RESOLVER`, and
`OIDC_CREDENTIAL_AUTHENTICATOR`. BFF owns `HUMAN_MEMBERSHIP_LOOKUP` and
`BFF_CREDENTIAL_AUTHENTICATOR`. The last two authenticator tokens use the existing `CredentialAuthenticator`
interface. Keep the service-principal and membership contracts private to their modules; publish only contracts and
tokens needed by actual cross-module consumers. No packages, HTTP endpoints, environment variables, or schemas change.

## Acceptance Criteria

- `AuthGuard`, OIDC authentication, and both BFF membership consumers can be constructed with typed contract
  substitutes without implementation-class casts.
- Every token resolves to the existing implementation instance; the host still runs OIDC before BFF selection and
  authentication before browser mutation checks. Auth has no import of BFF.
- Public requests bypass authentication; missing/rejected credentials return the exact code-only `401` response.
  Unexpected verifier or storage failures retain their existing error path. Bearer precedence remains unchanged.
- Service-client permissions remain token-scoped; human permission and grant tables are unchanged. Unknown/disabled
  credentials and memberships remain rejected; login still requires exactly one active membership.
- The auth, BFF, and host composition roots instantiate their providers, and existing focused tests, architecture
  checking, type checking, and prose lint pass without changing application behavior.

## Validation

Run from the repository root. These are implementation checks, not results claimed during planning:

```sh
corepack pnpm test -- src/libs/modules/auth src/lead-email-finder-api/src/authentication --runInBand
corepack pnpm test -- src/libs/modules/bff-session/src/application/human-membership-resolver.service.spec.ts src/libs/modules/bff-session/src/application/bff-session-credential-authenticator.spec.ts src/libs/modules/bff-session/src/application/bff-session-flow.service.spec.ts src/libs/modules/bff-session/src/bff-session.module.spec.ts src/libs/modules/bff-session/src/bff-session-guard-wiring.integration.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/dependency-inversion/03-decouple-authentication-consumers.md src/libs/modules/auth/README.md src/libs/modules/bff-session/README.md
```

Live-Keycloak suites remain gated and must be reported separately from unit and in-process HTTP results.
Update Bruno because DI wiring affects guarded HTTP paths. In `bruno/m2m-oidc-authentication`, strengthen the
existing missing-credential and malformed-token requests to require exactly `{ code: 'authentication_required' }`,
while retaining the public health success case. Run `bru run --env local` from that collection directory only
against the checkout-owned local stack, as its README documents. Also run `corepack pnpm bruno:bff-sessions` from
the repository root to preserve the browser authentication boundary. Keep assertion additions inside existing test
blocks so collection counts remain stable. If dependencies are unavailable, perform static collection validation
and report HTTP runtime execution as unverified, preserving focused guard evidence.

## Idempotence and Recovery

The refactor performs no data mutation or schema change. Register each symbol exactly once per existing provider
scope and use aliases rather than duplicate factories. A partial edit is repaired by completing its consumers and
provider aliases together; do not retain competing authentication chains. Reverting the PR restores old wiring
without resets, migrations, backfills, or data recovery.

## Artifacts and Notes

At implementation start, find the synced issue using marker `dependency-inversion/03`, assign it to `@me`, and set
its project-9 status to In Progress using the runtime option ID. Follow root `AGENTS.md` if project scope is missing.
The one PR uses the proposed conventional subject, is assigned to `@me`, and includes `Closes #<issue-number>`.
Record exact tests and any gated runtime omissions here before completion. This plan unlocks the BFF capability
refactor while preserving the existing module dependency direction. The stateless `CredentialExtractor` and
`RolePermissionPolicy` remain local helpers; their implementations and feature registration sites stay unchanged.
Concrete framework guard composition is also retained. These exclusions avoid superficial interface churn while
addressing the service dependencies that own persistence-backed authentication rules.

## Plan readiness

Ready to implement
