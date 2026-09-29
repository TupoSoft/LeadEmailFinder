# Manage Service Clients Through Explicit Application Operations

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.
Proposed commit and PR title: `refactor(service-client-management): inject controller use-case ports`.

## Purpose / Big Picture

The service-client controller will consume explicit create, list, rotate, disable, and delete operations instead of
concrete service classes. Developers can substitute those operations with typed objects and validate the real
module's provider wiring. Human-only administration, organization isolation, secret handling, provider sequencing,
and audit behavior remain unchanged.

## Progress

- [ ] (2026-09-17) Declare service-client operation contracts and move their existing result records.
- [ ] (2026-09-17) Bind existing services, migrate controller injection, and update focused tests.
- [ ] (2026-09-17) Verify HTTP and application regressions, architecture, types, and documentation.

## Plan dependencies

None.

## Surprises & Discoveries

Application services already consume identity's `ServiceCredentialDirectory` and `ServiceCredentialWriter`, the
private `KeycloakServiceClientAdmin` port, plain configuration, and the auth-owned `ServiceClientGrantPolicy`. The concrete
seam is the controller's five injected use cases. The completed `module-architecture/07` and
`service-client-hardening/01` plans already established isolation, compensation, and typed failures; this plan does
not repeat their persistence or provider work.

## Decision Log

- Decision: Keep independently implemented lifecycle operations as small interfaces grouped in one contract file.
  Rationale: Their dependencies and failure modes differ; a manager facade would merely forward methods to the
  existing services. Date/author: 2026-09-17, Codex.
- Decision: Retain separate creation and rotation result names with the current fields.
  Rationale: Their present shapes match, but the operations have different semantics and neither should depend on
  the other's implementation. Date/author: 2026-09-17, Codex.
- Decision: Keep contracts private and alias existing instances.
  Rationale: Only this controller consumes the operations, and the public module contract should remain narrow.
  Date/author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/service-client-management/src/api/service-clients.controller.ts` injects
`ServiceClientCreationService`, `ServiceClientListingService`, `ServiceClientRotationService`,
`ServiceClientDisablementService`, and `ServiceClientDeletionService`. Their implementations live under
`src/libs/modules/service-client-management/src/application/`, each with an adjacent focused spec. The module
composition file constructs them with explicit factories, and the API boundary maps domain failures to HTTP errors.

Creation checks credential kind, role, and the auth-owned grant ceiling before provisioning Keycloak and writing
the credential/audit record; it compensates a failed local creation. Rotation rechecks a conditional persistence
outcome after the provider call. List output excludes secrets; create/rotate return their one-time secret.
Disablement and deletion retain organization-scoped, audited, idempotent semantics.

## Scope and Non-Goals

Change operation contracts, result type ownership, controller injection, `implements` declarations, provider aliases,
focused tests, and the module README. Leave methods, paths, UUID/body validation, statuses, guards, grant policy,
description limits, permission order, records, provider calls, compensation, concurrency, and audit untouched.
Do not introduce a provider alternative, secret lookup endpoint, re-enable behavior, schema changes, new public
module API, or UI work. Existing Nest guards and pure permission helpers remain concrete adapter composition.

## Plan of Work

Create `src/libs/modules/service-client-management/src/application/ports/service-client-operations.ts` with the
five interfaces and symbols below. Move `ServiceClientCreationResult` from `service-client-creation.service.ts`
and `ServiceClientRotationResult` from `service-client-rotation.service.ts` into this contract. Both retain
`readonly credential: ServiceCredentialDetailRecord` and `readonly secret: string`. Reference identity types through
its bare public barrel; do not derive public types from service classes using `Pick`, `Parameters`, or `ReturnType`.

Declare each existing service as implementing its operation interface without changing its method body. Update
result imports in controller, services, and specs. Domain error classes remain in their existing file; retaining
their runtime identity preserves the controller's existing `instanceof` mappings.

In `service-client-management.module.ts`, keep the existing factory providers and add `useExisting` aliases for
their operation symbols. Change each controller parameter to its interface and add `@Inject` for the symbol.
Keep the public `src/index.ts` export limited to `ServiceClientManagementModule`; operation ports do not need to
cross the module boundary. Do not introduce a wrapper service or a broad lifecycle manager.

Convert `api/service-clients.controller.spec.ts` substitutes to typed operation objects without concrete-service
casts. Extend `service-client-management.module.spec.ts` to verify each token resolves to the existing instance,
and keep the HTTP suites exercising actual controller resolution. Test delegated arguments, safe serialization,
secret-only responses, void mutations, and representative typed/unexpected failures through the new seam.
Retain application suites against the real use cases; controller substitutes do not prove authorization,
compensation, or concurrency. Document the private boundary in the module README.

## Interfaces and Dependencies

Contracts use the current input/output records and promises:

```ts
interface ServiceClientCreator {
    create(actor: AuthPrincipal, organizationId: string, description: string | null,
        permissions: readonly AuthPermission[]): Promise<ServiceClientCreationResult>
}
interface ServiceClientQuery {
    list(actor: AuthPrincipal, organizationId: string): Promise<readonly ServiceCredentialDetailRecord[]>
}
interface ServiceClientSecretRotator {
    rotate(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<ServiceClientRotationResult>
}
interface ServiceClientDisabler {
    disable(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<void>
}
interface ServiceClientDeleter {
    delete(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<void>
}
```

Use `SERVICE_CLIENT_CREATOR`, `SERVICE_CLIENT_QUERY`, `SERVICE_CLIENT_SECRET_ROTATOR`, `SERVICE_CLIENT_DISABLER`,
and `SERVICE_CLIENT_DELETER` symbols. Bind them to creation, listing, rotation, disablement, and deletion instances
respectively. Existing persistence and Keycloak ports remain unchanged. No new dependency, environment variable,
endpoint, secret storage behavior, or database schema is introduced.

## Acceptance Criteria

- The controller has no concrete service dependency declaration or service-derived result type. Typed object
  substitutes implement every operation without casts, and every token resolves to the intended existing singleton.
- Successful human creation/listing/rotation/disablement/deletion preserves responses and serialization, including
  one-time secrets, secret-free list output, deterministic ordering, and empty `204` mutations.
- Service clients cannot administer service clients. Invalid bodies, duplicate permissions, excess grant requests,
  invalid UUIDs, and unauthorized requests preserve their existing status and lack of provider side effects.
- Cross-organization create/list retain `403`; item operations conceal foreign and absent clients as `404`.
  Disabled rotation remains `409`. Secret responses and failures retain `Cache-Control: no-store`.
- Local creation failure still compensates the generated Keycloak client and preserves the original failure;
  conditional writer outcomes still prevent stale operations from restoring disabled or deleted credentials.
- Domain/unexpected error handling, cookie Origin/CSRF enforcement, OpenAPI, module public exports, and
  configuration remain unchanged. Focused, architecture, type, and documentation checks pass.

## Validation

Run from the repository root during implementation:

```sh
corepack pnpm test -- src/libs/modules/service-client-management/src/api/service-clients.controller.spec.ts src/libs/modules/service-client-management/src/api/service-client-management-http.integration.spec.ts src/libs/modules/service-client-management/src/api/service-client-lifecycle-http.integration.spec.ts src/libs/modules/service-client-management/src/service-client-management.module.spec.ts --runInBand
corepack pnpm test -- --testPathPatterns='service-client-management/src/application/.*\.service\.spec\.ts$' --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:check
corepack pnpm docs:lint -- .agents/plans/dependency-inversion/06-decouple-service-client-controllers.md src/libs/modules/service-client-management/README.md
```

Update `bruno/service-client-management/01-create-service-client-unauthorized-rejected.yml` to require exactly
`{ code: 'authentication_required' }`. Extend the existing create/rotate M2M rejection tests to exclude credential
records and provider subject/secret fields, retaining their `403` and no-store checks. Add assertions inside existing
test blocks so collection counts stay unchanged. Run `corepack pnpm bruno:service-client-rejections` from the root
when the owned local stack is available; otherwise perform static collection checks and report execution unverified.
The collection covers authentication and service-client rejection; the genuine human lifecycle remains covered by
the existing HTTP lifecycle suite and optional live fixture.
The focused HTTP lifecycle suite substitutes provider and persistence ports, while
`infrastructure/keycloak/service-client-management.live-keycloak.integration.spec.ts` requires its live fixture.
State which layers actually ran; do not claim live Keycloak/PostgreSQL evidence from in-process tests.

## Idempotence and Recovery

The change introduces no state transition of its own. Aliases reuse the existing provider instances and factories;
repeated editing must not duplicate registrations. Existing delete/disable idempotency and explicit reconciliation
after uncertain create/rotate responses stay intact. Reverting this PR restores previous wiring without migration,
database reset, provider cleanup, or key rotation. Use existing disposable fixture cleanup for optional live tests.

## Artifacts and Notes

At implementation start, find the synced issue by `dependency-inversion/06`, assign `@me`, and set project-9 to
In Progress using the runtime option ID as root `AGENTS.md` specifies. Assign the one PR to `@me`, use the proposed
conventional commit subject as its title, and include `Closes #<issue-number>`. Record exact validation and limits.
This plan closes a controller-to-business-operation seam while preserving already established infrastructure
ports; it does not require an interface for each framework or pure helper class in the module.

## Plan readiness

Ready to implement
