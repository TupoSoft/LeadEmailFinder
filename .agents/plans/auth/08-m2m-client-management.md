# Add self-service M2M client management

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow organization owners and admins to create and manage least-privilege OAuth clients for integrations without exposing or reusing the legacy API-key system.

## Progress

- [x] Add service-client lifecycle application services and endpoints.
- [x] Provision Keycloak clients through the administration adapter.
- [x] Add secret, scope, isolation, and failure tests.
- [x] Run full validation (typecheck, lint, jest, live-stack pass, Bruno) and commit.

## Plan dependencies

- `auth/07`

## Surprises & Discoveries

- `ServiceCredential` already existed (from PR 3's OIDC M2M work) but had no column addressing the Keycloak *client* resource itself — only `subject` (the service-account *user* UUID). Added `keycloakClientId` (unique, class-level `@Index`, matching `organization_invitations`' `tokenHash` house style) rather than deriving it, since rotate/delete need to address `/admin/realms/{realm}/clients?clientId=` directly.
- `ServiceCredentialResolver.resolveActive` (merged in PR 3) already re-queries Postgres on every request with no caching and already rejects on `status !== 'active'` — the "disabled/deleted rejected even with a valid unexpired JWT" acceptance criterion required zero new code, only reuse. Confirmed live: a token minted before disabling was rejected 401 on its very next use with no Keycloak call involved.
- Adding the new required `keycloakClientId` column broke an existing test outside this plan's own files: `oidc-permission-check.live-keycloak.integration.spec.ts` (PR 3) constructs `ServiceCredential` rows directly and needed a `keycloakClientId` value added to its three fixtures. Not a design flaw in that test — it predates this plan's column and needed updating alongside it, the same way PR 7 updated `bff-session`'s call sites when it relocated `HumanIdentityResolver`.
- The `lef-org-admin-service` account's realm-management role list needed exactly two more roles (`manage-clients`, `view-clients`) beyond PR 7's four (`manage-users`, `view-users`, `query-users`, `view-realm`) — guessed from Keycloak's standard role names, confirmed empirically via a live provisioning run and a direct role-mappings check before any code exercised them, no widening needed.
- `bruno/organization-onboarding`'s two Keycloak-touching requests (accept/duplicate-accept) reproduced the exact known container-to-Keycloak networking gap during this plan's own regression pass — unrelated to this plan's changes, confirmed via `docker logs` (`fetch failed: ECONNREFUSED`) and by the identical requests succeeding immediately against a host-run instance. Documented as expected in this plan's own Bruno README rather than re-litigated.

## Decision Log

- Decision: Client secrets are displayed only at creation or explicit rotation.
  Rationale: Recoverable plaintext secrets would recreate the current raw-token risk.
  Date/Author: 2026-08-14, project planning.
- Decision: Rotation invalidates the old secret immediately.
  Rationale: Development clients needing overlap can create a replacement client before deleting the old one.
  Date/Author: 2026-08-14, project planning.
- Decision: A new service client's `permissions` must be a subset of `RolePermissionPolicy`'s effective permissions for the creating owner/admin actor (`ROLE_PERMISSIONS[actor.membershipRole]`), enforced only at creation (no permissions-update endpoint exists). Rejected with `400 BadRequestException` listing the excess permissions.
  Rationale: No per-organization scope-allowlist table exists anywhere in the schema; "cannot exceed the organization-allowed scope set" is satisfied without new schema by reusing the actor's own already-computed effective permissions.
  Date/Author: 2026-08-18, implementation.
- Decision: Only a `human_session` credential kind may create, list, rotate, disable, or delete service clients — checked explicitly in every application service, even though a `service_client` principal holding `credentials:manage` would otherwise pass `PermissionsGuard`.
  Rationale: `RolePermissionPolicy` grants `credentials:manage` verbatim from a service client's own `permissions` array, and `membershipRole` is meaningless for that credential kind; without this check, one M2M client could spawn, rotate, or delete other M2M clients for the same organization, which is outside this plan's "organization owners and admins" framing.
  Date/Author: 2026-08-18, implementation.
- Decision: Deletion deletes the Keycloak client first (treating a 404 as success, so retries are safe), then the local row and an audit row in one transaction.
  Rationale: Unlike a human Keycloak user (left untouched by PR 7's membership removal, since the person may still need to exist for other memberships), a service client has no purpose beyond its one credential — leaving it live in Keycloak on "delete" would be an orphaned, secret-bearing OAuth client no admin could see or manage again.
  Date/Author: 2026-08-18, implementation.
- Decision: Disable stays local-only (no Keycloak call), matching PR 7's "membership status is authoritative" precedent for `MembershipRemovalService`. Rotating an already-disabled credential is rejected with `409 ConflictException`; there is no re-enable operation.
  Rationale: `ServiceCredentialResolver` already gates every request on local status with no caching, so a Keycloak-side call would add nothing but latency and a new failure mode.
  Date/Author: 2026-08-18, implementation.
- Decision: Creation generates the local id and a deterministic `keycloakClientId` (`lef-svc-<uuid>`) up front, runs every Keycloak step (find-or-create client, assign the existing `lef-api-audience` scope, fetch the secret, fetch the service-account subject) before opening any database transaction, and only then inserts the local row. No client-supplied idempotency key.
  Rationale: Matches PR 7's `InvitationAcceptanceService` "external call first, then commit" ordering, so a failed Keycloak step never leaves a local row; a caller's retry is simply calling the endpoint again, and a stray abandoned Keycloak client from a failed attempt is inert (its secret was never returned to anyone) and needs no special reconciliation, per this ExecPlan's own Idempotence and Recovery section.
  Date/Author: 2026-08-18, implementation.
- Decision: Rotation calls Keycloak's regenerate-secret endpoint before any local write (nothing local to roll back on failure); the local transaction that follows only bumps `updatedAt` and writes an audit row.
  Date/Author: 2026-08-18, implementation.
- Decision: `KeycloakAdminHttpClient`/`KeycloakAdminHttpConfiguration` are duplicated locally in this plan's own module rather than imported from `organization-onboarding`, matching this codebase's established norm of per-module provider registration (`OrganizationOnboardingModule` itself declares no `exports`).
  Date/Author: 2026-08-18, implementation.

## Outcomes & Retrospective

All acceptance criteria implemented and verified. `pnpm typecheck`/`pnpm lint` clean. Full jest suite (116 suites / 676 tests, 1 todo, 0 skipped) passed with every live gate active simultaneously across 6 dedicated test databases, including the new `service-client-management.live-keycloak.integration.spec.ts` (passing on the first run against a freshly-provisioned realm).

Live-stack verification, from a from-scratch rebuild through `pnpm keycloak:provision` (confirming the widened `lef-org-admin-service` role grant directly via the Keycloak Admin API) and `pnpm keycloak:smoke`: the full create → mint a client_credentials token → use it against a real `PermissionsGuard`-protected route (200 for a granted permission, 403 for one not granted) → rotate (old secret's token grant fails, new one works) → disable (a token minted before disabling is rejected on its very next use) → delete (the Keycloak client and its default-scope assignment are actually gone, and the pre-disable token stays rejected) lifecycle ran end to end against a real Keycloak realm inside the live-Keycloak Jest spec. `bru run` (via `npx @usebruno/cli run --env local`) passed for `bruno/service-client-management` (3/3) and, as a regression check, `bruno/organization-onboarding` (6/6 against a host-run instance; the two Keycloak-touching requests reproduce the already-documented container networking limitation when run against the container, exactly as before this plan).

## Context and Orientation

PR 3 authenticates a seeded M2M client, while PR 7 gives customer administrators a browser session and organization-management capability. This task exposes a safe product workflow for creating further Keycloak service clients and binding them locally.

## Scope and Non-Goals

Add organization-scoped create, list, rotate, disable, and delete operations for service clients. Extend the Keycloak administration adapter for client lifecycle. Do not support secret recovery, permanent API keys, or cross-organization administration.

## Plan of Work

Authorize the caller using `credentials:manage`, create a stable local service-credential record, provision the corresponding Keycloak service account, and activate the binding only after both sides succeed. Return the secret once. Enforce allowed scopes and consult local status during every token authentication so disable/delete takes effect immediately.

## Interfaces and Dependencies

Expose service-client descriptors containing ID, client ID, description, scopes, status, and timestamps, never the secret. Creation and rotation responses add a one-time secret field. This plan depends on PR 7 and unlocks API-key removal.

## Acceptance Criteria

- Owners/admins manage clients only within their organization.
- Creation provisions a working Keycloak client and local binding.
- The secret is returned only at creation or explicit rotation and never in list responses or logs.
- Rotation invalidates the previous secret.
- Disabled/deleted local clients are rejected even with an otherwise valid unexpired JWT.
- Configured scopes cannot exceed the organization-allowed scope set.
- Cross-organization client access returns `404`.
- Partial provisioning does not create active orphan access and is retryable.

## Validation

Run application-service and Keycloak-adapter contract tests; run an end-to-end create/token/use/rotate/disable/delete scenario; run scope escalation and tenant-isolation negative tests; then run all project checks.

## Idempotence and Recovery

Stable operation and credential IDs allow safe retry after partial provisioning. Development cleanup may delete the local binding and Keycloak client, or reset both identity stores when reconciliation is not useful.

## Artifacts and Notes

Record only synthetic client IDs and redacted secret responses.

## Plan readiness

Ready to implement.
