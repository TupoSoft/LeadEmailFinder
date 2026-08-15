# Authorize roles and product permissions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Replace generic API-key roles with explicit product permissions so each human or machine principal receives only the operations intended for its organization role and configured scopes.

## Progress

- [x] Add the role-to-permission policy. (2026-08-15)
- [x] Replace controller permission declarations. (2026-08-15)
- [x] Add matrix and privilege-escalation tests. (2026-08-15)

## Surprises & Discoveries

- Found and fixed a pre-existing, latent defect in `jest.config.ts`'s `moduleNameMapper`: bare module-path entries (e.g. `@tuposoft/lead-email-finder/modules/auth`) were listed *before* their wildcard counterparts (`.../auth/(.*)`). Jest's resolver (`jest-resolve`'s `resolveStubModuleName`) matches entries in listed order and, for a match with no capture group, builds the target from the mapped value alone — silently discarding the rest of the specifier. Any deep import under a module with both an exact and wildcard entry (e.g. `@tuposoft/.../modules/auth/infrastructure/http/permissions.guard`) collapsed to that module's bare barrel (`index.ts`) under test only, not under the real app (NestJS CLI's own path resolution is unaffected). This was invisible before because prior deep imports (`ApiKeyService`, `KeyPermissions`) were only read as type annotations or enum values inside method bodies — never called eagerly at import time — so a broken binding silently went unused in every test that mocked or type-only-referenced it. `@RequirePermissions(...)`/`PermissionsGuard`, applied as decorator factories at class-definition time, call the import immediately, turning the same latent defect into a hard crash. Fixed by reordering `jest.config.ts` so every wildcard entry precedes its bare counterpart — a real, repo-wide correctness fix, not scoped to this plan's own files.
- Discovered a second, real circular-module-import hazard introduced by this plan's own change: `AuthModule` already depended on `ApiKeyModule` (for `LegacyApiKeyCredentialAuthenticator`'s `ApiKeyService`). Once `ApiKeyController`/`ApiKeyModule` needed `PermissionsGuard`/`RolePermissionPolicy` from `auth`, importing `AuthModule` back from `ApiKeyModule` would have closed a real cycle. Fixed the same way as the other 7 feature modules — no module imports the other's module wholesale — but additionally: `AuthModule` no longer imports `ApiKeyModule` at all (it registers its own local `ApiKeyService` provider and `TypeOrmModule.forFeature([Key])`, both deep-imported), and `ApiKeyController`/`ApiKeyModule` deep-import `PermissionsGuard`/`RolePermissionPolicy` directly from their file paths rather than the `auth` barrel — not merely to satisfy NestJS's DI graph, but because a plain barrel import there is order-dependent on unrelated import statement ordering in the same file (safe today, but a future reformat could reintroduce a partial-module-evaluation bug); deep-importing removes that fragility entirely rather than relying on import order staying accidentally safe.
- Removing `ApiKeyModule` from all 7 feature modules' `imports` (no longer needed once they stopped using `ApiKeyGuard`) also removed the *only* path by which `ApiKeyModule` — and therefore `ApiKeyController` and `AdminKeySeeder` — was reachable from the app's module graph at all; nothing had ever imported it directly at the root. Caught live (routes silently 404'd, admin key only worked because Postgres still held a row seeded by an earlier run) rather than by any test, since no test boots the full `LeadEmailFinderApiModule`. Fixed by importing `ApiKeyModule` directly in `lead-email-finder-api.module.ts`, alongside `AuthModule`/`IdentityModule` — an explicit root-level import instead of the previous incidental transitive one.

## Decision Log

- Decision: LeadEmailFinder owns product authorization.
  Rationale: Keycloak proves identity, while application policy remains testable and independent of provider configuration.
  Date/Author: 2026-08-14, project planning.
- Decision: `RolePermissionPolicy.effectivePermissionsFor(principal)` is a stateless application service, not baked into `AuthPrincipal` at authentication time. For `credentialKind === 'service_client'`, returns `principal.permissions` verbatim (the configured `ServiceCredential.permissions`); for `'human_session'`/`'legacy_api_key'`, returns a fixed `ROLE_PERMISSIONS[principal.membershipRole]` lookup, ignoring `principal.permissions` (always `[]` for legacy-bridge principals today).
  Rationale: Plan 03's authenticators already exist and shouldn't be touched by this plan; `OidcCredentialAuthenticator` sets a filler `membershipRole: 'admin'` for every service client that must never be used for permission lookup, or a narrow-scope credential could escalate via the role matrix.
  Date/Author: 2026-08-15, implementation.
- Decision: role→permission matrix is cumulative — member ⊂ admin ⊂ owner ⊂ platform_admin — with `platform_admin` equal to the full `AUTH_PERMISSIONS` set, so no special-case "admin bypasses checks" code exists anywhere; it's pure data. "Owners additionally receive billing and organization-settings access" maps onto `billing:read`, the only remaining non-`platform:admin` permission in the fixed vocabulary — no separate "organization-settings" permission was added.
  Date/Author: 2026-08-15, implementation.
- Decision: "service principals receive the intersection of organization-allowed permissions and configured OAuth scopes" (Plan of Work) is read as: `ServiceCredential.permissions` already **is** that intersection — no separate per-organization permission-allowlist field exists in the data model, and adding one is out of this plan's Interfaces section.
  Date/Author: 2026-08-15, implementation.
- Decision: a *separate* `PermissionsGuard` (authorization-only, runs after the global `AuthGuard`) plus a `RequirePermissions(...permissions)` decorator, applied per-controller via `@UseGuards(PermissionsGuard)` — not global via `APP_GUARD`. Any-of matching, mirroring the legacy `RequireApiPermissions`'s `.some(...)` semantics.
  Rationale: the acceptance criteria's explicit "missing authentication → 401; missing permission → 403" split is a distinct-guards signal; `AuthGuard` already owns 401.
  Date/Author: 2026-08-15, implementation.
- Decision: all 8 controllers' new permission requirements — `platform:admin` for the 4 previously-ADMIN-gated controllers (credits, proxy, api-key, email — all platform-internal operations); `verification:run` for mutating verification routes and `verification:read` for read routes across the 4 verification controllers (old-sync/sync/batch/async), split at method level where a controller mixes both.
  Date/Author: 2026-08-15, implementation.

## Outcomes & Retrospective

Delivered `RolePermissionPolicy` (+ `ROLE_PERMISSIONS` matrix), `PermissionsGuard`, and `RequirePermissions` in `src/libs/modules/auth/src/`, and replaced the legacy `ApiKeyGuard`/`RequireApiPermissions(KeyPermissions.ADMIN)` stack on all 8 previously-guarded controllers with the new policy-driven guard/decorator, per the locked-in permission mapping. Each of the 8 owning modules now registers `RolePermissionPolicy`/`PermissionsGuard` as local providers rather than importing a shared module for them, avoiding the circular-dependency hazard described above. `ApiKeyModule` is now imported directly by the root `LeadEmailFinderApiModule` rather than incidentally through feature modules that no longer need it.

Verified live against the real local stack (same Postgres/Redis/Garage/Keycloak used for plan 03's testing, API run on the host): every one of the 8 controllers returns the exact expected status for both a `platform_admin` legacy key (succeeds everywhere, reaching business validation) and a freshly minted `member`-tier legacy key (`403 Missing required permission` on all 4 admin-gated controllers; `2xx`/legitimate business error — never `401`/`403` — on all 4 verification controllers, both `verification:run` and `verification:read` routes). No credential still returns `401` everywhere. The `sync`/`async` verification controllers' existing `CreditGuard` still runs after the new permission check and still only fires for permitted callers. Full jest suite (293 tests across 61 suites, 2 skip-gated as before) and both `bru run --env local` collections (`api-key-administration` unchanged 5/5; `proxy-registry` extended to 10/10 with a new non-admin-key 403 case) pass.

All Acceptance Criteria met: member/admin/owner/platform_admin permission sets match the documented cumulative matrix (parameterized unit coverage in `role-permission-policy.service.spec.ts`); service principals are capped at their configured `ServiceCredential.permissions` regardless of role (unit + integration coverage); 401-vs-403 distinction holds live and in tests; the policy exists in exactly one place (`RolePermissionPolicy`), not duplicated per controller.

Two real, pre-existing/latent defects were found and fixed along the way (see Surprises & Discoveries) rather than worked around: the jest moduleNameMapper ordering bug (repo-wide, not scoped to this plan's files) and the now-explicit root-level `ApiKeyModule` import (previously accidental/transitive, silently relied upon by every consumer of `ApiKeyGuard`).

## Context and Orientation

Existing controllers use `RequireApiPermissions` with `read`, `write`, and `admin`. PR 3 introduces an authenticated `AuthPrincipal`; this task converts that identity into application permissions without yet changing resource ownership.

## Scope and Non-Goals

Add one role-to-permission policy and purpose-specific authorization decorators/guards. Replace permission declarations on existing controllers and require `platform:admin` for global administration. Do not add invitation APIs, change credits, or implement per-resource tenant checks.

## Plan of Work

Implement policy in an application service rather than controller conditionals. Human roles receive their documented permission set; service principals receive the intersection of organization-allowed permissions and configured OAuth scopes. Standardize authentication versus authorization errors.

## Interfaces and Dependencies

Permissions are `verification:run`, `verification:read`, `members:manage`, `credentials:manage`, `billing:read`, and `platform:admin`. This plan depends on PR 3 and unlocks organization-owned resources and management APIs.

## Acceptance Criteria

- Members can run and read organization verification work.
- Admins additionally receive member and credential management.
- Owners additionally receive billing and organization-settings access.
- Platform admins can administer every organization.
- Service principals cannot exceed their configured scopes.
- Missing authentication returns `401`; missing permission returns `403`.
- Authorization policy is not duplicated across controllers.
- The complete role-permission matrix has parameterized contract coverage.

## Validation

Run policy unit tests for every role/scope combination, controller tests for allowed and denied operations, negative privilege-escalation tests, and the full project checks.

## Idempotence and Recovery

The change is stateless policy. Reverting this PR restores the earlier permission guard while PR 3 authentication remains intact.

## Artifacts and Notes

Keep the final role-permission matrix in this plan and in executable tests.

## Plan readiness

Ready to implement after PR 3.
