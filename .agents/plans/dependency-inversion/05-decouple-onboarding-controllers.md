# Invoke Organization and Membership Operations Through Ports

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.
Proposed commit and PR title: `refactor(organization-onboarding): inject controller use-case ports`.

## Purpose / Big Picture

`OrganizationsController` will depend on explicit application operations instead of nine concrete services.
Developers can test HTTP argument forwarding, serialization, and error mapping using typed substitutes without
access to implementation internals. The real module will bind each capability to the existing service, preserving
organization, directory, invitation, and membership behavior.

## Progress

- [ ] (2026-09-17) Declare operation contracts and their existing result types under application ports.
- [ ] (2026-09-17) Bind current services, migrate the controller, and update focused contract substitutes.
- [ ] (2026-09-17) Verify HTTP behavior, provider resolution, architecture, types, and documentation.

## Plan dependencies

None.

## Surprises & Discoveries

The module already depends on identity persistence ports and its private `KeycloakOrganizationAdmin` contract.
The remaining concrete dependency is at the controller-to-application boundary, including newer directory and
invitation-preview operations. The completed `module-architecture/06` plan preserved locked transaction sessions
and final-owner safety; neither those mechanisms nor its historical plan require another implementation.

## Decision Log

- Decision: Keep operation-shaped contracts alongside the existing separately owned use cases.
  Rationale: Creation, invitation acceptance, listing, and membership mutation have different authorization and
  transaction rules. A combined manager or new forwarding facade would add indirection without removing an
  existing responsibility. Date/author: 2026-09-17, Codex.
- Decision: Keep contracts and tokens private to onboarding.
  Rationale: The controller is the only production consumer; the public module exports no service capability.
  Date/author: 2026-09-17, Codex.
- Decision: Preserve the exact existing result records and domain errors.
  Rationale: Changing the dependency declaration must not change serialization or error identity.
  Date/author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/organization-onboarding/src/api/organizations.controller.ts` injects creation, invitation issuance,
invitation acceptance, role change, removal, membership listing, invitation preview, organization listing, and
organization detail services. Its `handleErrors()` maps domain failures to HTTP responses. Application services
already receive identity stores/readers and Keycloak ports through factories in `organization-onboarding.module.ts`.

Application files reside in `src/libs/modules/organization-onboarding/src/application/`: `organization-creation.service.ts`,
`invitation-issuance.service.ts`, `invitation-acceptance.service.ts`, `membership-role-change.service.ts`,
`membership-removal.service.ts`, `membership-listing.service.ts`, `invitation-preview.service.ts`,
`organization-listing.service.ts`, and `organization-detail.service.ts`. Existing focused tests share those names.
`api/organization-onboarding-http.integration.spec.ts` verifies transport behavior; module tests verify factory wiring.

## Scope and Non-Goals

Change only the controller dependency declarations, application contracts/result ownership, service `implements`
declarations, provider aliases, focused tests, and onboarding README. Do not change routes, DTOs, status codes,
permissions, cursor parsing, invitation tokens, provider calls, locking, database records, transaction order, audit,
compensation, or caching. Do not replace existing persistence ports or change the module's public barrel.
Framework guards and stateless policy helpers remain at their established API/composition boundary.

## Plan of Work

Add `src/libs/modules/organization-onboarding/src/application/ports/organization-operations.ts`,
`invitation-operations.ts`, and `membership-operations.ts`. Group declarations by business capability for readability
while retaining small interfaces for each independently implemented operation. Contracts must explicitly declare
their types; do not expose `Pick<Service, ...>`, `Parameters`, or `ReturnType` derived from concrete services.

Move `OrganizationCreationResult`, `OrganizationListingResult`, and `InvitationIssuanceResult` into their matching
contract files, keeping their current fields unchanged. Reuse identity's public `InvitationAcceptanceResult`,
`InvitationPreviewRecord`, `OrganizationDirectoryRecord`, `OrganizationMembershipDetailRecord`, `AuthPrincipal`,
and `AuthRole` types. Use only identity's bare public barrel. Domain error classes remain in their existing file.
Make each existing application service implement its corresponding interface without changing its method body.

Retain the existing factories in `organization-onboarding.module.ts` and add one `useExisting` alias per operation.
Import the interfaces and symbols into the controller and annotate each dependency with `@Inject(TOKEN)`. The
controller should no longer import an implementation service for a constructor type or a result type. Keep all
existing decorators, response mapping, parameter handling, and error translation unchanged.

Convert `api/organizations.controller.spec.ts` substitutes to typed operation objects, removing casts to concrete
classes. Extend `organization-onboarding.module.spec.ts` to resolve every token and verify that aliases share the
existing factory-created instance. Exercise actual controller resolution through those aliases in the HTTP suite.
Retain real application tests; token substitutes alone must not replace final-owner, authorization, transaction,
or provider-failure coverage. Update the private application/API boundary description in the module documentation.

## Interfaces and Dependencies

Use these interfaces and tokens with the signatures already implemented:

```ts
interface OrganizationCreator {
    createWithFirstOwner(actor: AuthPrincipal, name: string, ownerEmail: string): Promise<OrganizationCreationResult>
}
interface OrganizationPageQuery {
    list(actor: AuthPrincipal, pageSize: number, pageToken?: string): Promise<OrganizationListingResult>
}
interface OrganizationDetailQuery {
    get(actor: AuthPrincipal, organizationId: string): Promise<OrganizationDirectoryRecord>
}
interface InvitationIssuer {
    issue(actor: AuthPrincipal, organizationId: string, email: string, role: AuthRole): Promise<InvitationIssuanceResult>
}
interface InvitationAcceptor {
    accept(rawToken: string, password: string): Promise<InvitationAcceptanceResult>
}
interface PendingInvitationQuery {
    preview(rawToken: string): Promise<InvitationPreviewRecord & { readonly status: 'pending' }>
}
interface MembershipDirectoryQuery {
    listForOrganization(actor: AuthPrincipal, organizationId: string): Promise<readonly OrganizationMembershipDetailRecord[]>
}
interface MembershipRoleChanger {
    changeRole(actor: AuthPrincipal, organizationId: string, membershipId: string, newRole: AuthRole): Promise<OrganizationMembershipDetailRecord>
}
interface MembershipRemover {
    remove(actor: AuthPrincipal, organizationId: string, membershipId: string): Promise<void>
}
```

The symbol names are `ORGANIZATION_CREATOR`, `ORGANIZATION_PAGE_QUERY`, `ORGANIZATION_DETAIL_QUERY`,
`INVITATION_ISSUER`, `INVITATION_ACCEPTOR`, `PENDING_INVITATION_QUERY`, `MEMBERSHIP_DIRECTORY_QUERY`,
`MEMBERSHIP_ROLE_CHANGER`, and `MEMBERSHIP_REMOVER`. Each names one existing operation and its existing service
instance. No new package, module dependency, runtime configuration, endpoint, or database schema is introduced.

## Acceptance Criteria

- The controller depends only on the nine explicit operation contracts and can be built with typed object
  substitutes without implementation-class casts. Each token resolves to its intended existing service instance.
- Organization creation still returns its one-time owner invitation. Directory/detail authorization, canonical
  cursors, safe projections, absence handling, and page boundaries preserve their existing HTTP behavior.
- Pending invitation preview retains unknown/expired/consumed responses; first acceptance retains its response,
  replay returns generic accepted status, and rejected requests disclose no additional invitation details.
- Membership role/removal operations retain hierarchy checks, cross-organization isolation, final-owner protection,
  session cleanup, audit behavior, and Keycloak compensation. Controller error mapping preserves each existing code.
- Cache/referrer headers, browser mutation guards, public invitation handling, and OpenAPI remain unchanged.
  Focused suites, architecture, and type checking pass.

## Validation

Run from the repository root during implementation:

```sh
corepack pnpm test -- src/libs/modules/organization-onboarding/src/api/organizations.controller.spec.ts src/libs/modules/organization-onboarding/src/api/organization-onboarding-http.integration.spec.ts src/libs/modules/organization-onboarding/src/organization-onboarding.module.spec.ts --runInBand
corepack pnpm test -- --testPathPatterns='organization-onboarding/src/application/.*\.service\.spec\.ts$' --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:check
```

If transaction or provider code changes unexpectedly, stop expanding this refactor and revisit scope; those changes
need their own behavioral justification. The unchanged `membership-mutation-concurrency.integration.spec.ts`
requires `TEST_POSTGRES_URL`, and live-Keycloak coverage has separate dependencies. Report them as gated if not run.
Update Bruno for HTTP DI wiring. Strengthen the existing successful creation request
`bruno/organization-onboarding/02-create-organization-with-first-owner.yml` to check the response contains only the
existing documented organization/invitation fields and never persistence-only token hashes. Strengthen
`13-list-requires-authentication.yml` to require exactly `{ code: 'authentication_required' }`. Keep existing test
block counts unchanged. Run `corepack pnpm bruno:organization-onboarding` and `corepack pnpm bruno:platform-credits`
from the root when the owned local stack is available. Otherwise, preserve static collection checks and report
runtime execution as unverified.

## Idempotence and Recovery

No data or schema mutation is introduced. A controller contract alias must point to the already registered service;
do not create a duplicate service with different injected stores. Repeating registration edits must not duplicate
tokens. Restore a partial refactor by completing its imports and bindings together or reverting this PR. No reset,
reseed, migration, backfill, or deployment choreography is required.

## Artifacts and Notes

At implementation start, find the synced issue by `dependency-inversion/05`, assign `@me`, and set project-9 to
In Progress with the runtime option ID according to root `AGENTS.md`. The one PR uses the proposed conventional
subject, is assigned to `@me`, and includes `Closes #<issue-number>`. Record exact validation evidence here.
This plan deliberately leaves framework adapters and same-layer pure helpers concrete; the new interfaces describe
business operations consumed across the controller boundary rather than applying an interface to every class.

## Plan readiness

Ready to implement
