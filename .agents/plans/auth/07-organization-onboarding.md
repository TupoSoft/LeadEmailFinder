# Add invite-only organization onboarding

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow platform operators to create customer organizations and allow organization owners or admins to invite members safely. Membership creation remains consistent between Keycloak identity data and LeadEmailFinder product authorization.

## Progress

- [x] Add organization and invitation application services.
- [x] Add the narrow Keycloak administration adapter.
- [x] Add lifecycle, authorization, and recovery tests.
- [x] Run full validation (typecheck, lint, jest, live-stack pass, Bruno) and commit.

## Surprises & Discoveries

- MFA enrollment on promotion turned out to already be solved at the realm level by PR 6's own `ensurePrivilegedBrowserFlow()` (the `mfa_required` composite role + conditional-OTP `lef-browser` flow), not by Keycloak's `requiredActions` mechanism as initially assumed. "Promotion requests MFA enrollment" is just assigning the matching Keycloak realm role (`owner`/`admin`) to the user — nothing new to provision.
- The client-secret chicken-and-egg problem (the running API needs `KEYCLOAK_ORG_ADMIN_CLIENT_SECRET` to boot, but Keycloak's own auto-generated secret isn't known until provisioning runs) already had a proven solution from PR 6: set a fixed, checked-in dev secret directly on the Keycloak client representation. Replicated the exact same trick for the new `lef-org-admin-service` client.
- Neither an invitation's `invitedBy*` actor nor an audit log entry's `actor*` fields can be a real foreign key to `ExternalIdentity`: a principal with `platform:admin`/`members:manage` can arrive via `legacy_api_key` (`credentialId` = `Key.id`) or `service_client` (`credentialId` = `ServiceCredential.id`), not only `human_session`. Both new entities store the actor identity denormalized (credentialKind/issuer/subject/credentialId as plain columns), matching how `AuthPrincipal` itself already represents a mixed-kind actor.
- `HumanIdentityResolver` (merged in PR 6, living in `bff-session`) turned out to be identity-domain logic misplaced in a feature-adjacent module — this plan needed the identical find-or-create-with-race-handling logic for invitation acceptance. Relocated it into `identity/src/application/` (widened with an optional `manager` parameter so it can participate in the acceptance transaction) rather than duplicating it, and updated `bff-session`'s two call sites to import it from `identity` instead.
- The already-documented (PR 3, re-confirmed PR 6) container-to-Keycloak networking limitation — the containerized `api` service cannot reach `localhost:58080` from inside its own Docker network namespace — also breaks invitation acceptance, since `KeycloakOrganizationAdminClient` calls the Keycloak Admin REST API at request time (not just at boot, unlike the BFF flow's mostly-browser-redirect-driven Keycloak calls). Manual live verification against the containerized stack produced a 500 (`fetch failed: ECONNREFUSED`, confirmed via `docker logs`); the identical request against a host-run instance (same DB, same Keycloak, only the network path differs) succeeded immediately. Documented the host-run workaround in `bruno/organization-onboarding/README.md`, matching PR 6's precedent.

## Decision Log

- Decision: Initial onboarding is invitation-only and invitations expire after 72 hours.
  Rationale: This avoids public-signup abuse controls while the product is under development.
  Date/Author: 2026-08-14, project planning.
- Decision: LeadEmailFinder membership status is authoritative for product access.
  Rationale: Removing access must not depend on waiting for an identity-provider token to expire.
  Date/Author: 2026-08-14, project planning.
- Decision: The running API authenticates to Keycloak's Admin REST API via a dedicated service-account client (`lef-org-admin-service`, `client_credentials`, least-privilege `realm-management` roles: `manage-users`, `view-users`, `query-users`, `view-realm`), not by reusing Keycloak's master-admin bootstrap credentials.
  Rationale: Least privilege — the master-admin password grant would hand the always-running app process realm-master super-admin power for a narrow need, and would require cross-realm token handling. This is also the substrate PR 8 is expected to extend for service-client lifecycle management. Confirmed with the user via AskUserQuestion before implementation.
  Date/Author: 2026-08-17, implementation.
- Decision: Invitation acceptance preserves the existing single-active-membership-per-identity invariant that login (`HumanMembershipResolver.resolveActiveForLogin`) already assumes — accepting an invitation while already holding an active membership anywhere is rejected with `409 Conflict` inside the same transaction that would otherwise create the new membership.
  Rationale: Allowing a second invitation to be accepted would silently break that identity's next login with no recovery path in this plan. Multi-org membership/org-switching is a materially larger feature (needs a "current organization" concept in `BffSessionFlowService`) deferred to a future plan. Confirmed with the user via AskUserQuestion before implementation.
  Date/Author: 2026-08-17, implementation.
- Decision: `OrganizationInvitation` and `AuditLogEntry` live in the `identity` library module, not the new `organization-onboarding` feature module.
  Rationale: `identity` is already the schema source of truth (its own dedicated schema/entity tests assert the complete table set), and `CreditDebit`/`OrganizationCreditAccount` already establish the precedent that org-scoped durable records live there even though the services that write them live in feature modules.
  Date/Author: 2026-08-17, implementation.
- Decision: The new feature module is a flat `src/lead-email-finder-api/src/organization-onboarding/` module (matching `credits/`), not a `src/libs/modules/` library module (matching `bff-session`).
  Rationale: `bff-session` only needed to be a library module because `auth.module.ts` had to import it to register a new `CredentialAuthenticator`. This plan adds no new authentication mechanism — it only consumes `PermissionsGuard`/`RolePermissionPolicy`/`CurrentPrincipal`/`RequirePermissions` from the existing `auth` barrel, exactly like `CreditsModule` already does. No cycle risk, no reason for a deep-import boundary.
  Date/Author: 2026-08-17, implementation.
- Decision: Invitation acceptance calls Keycloak first, then commits local state in one transaction — no third `keycloak_provisioning` status. If the Keycloak call fails, nothing local has changed (invitation still `pending`) and the caller just retries the same request; `ensureUser` is idempotent (find-by-email-or-create, always resets the password) so a retry after a mid-flight crash is harmless.
  Rationale: Simpler than a formal three-state machine per `AGENTS.md`'s "favour simple, testable designs" — this codebase's own `CreditsService.debit` precedent (idempotent side effect + conditional local commit) already validates the simpler shape.
  Date/Author: 2026-08-17, implementation.
- Decision: Audit rows are written via explicit inline `manager.insert(AuditLogEntry, {...})` calls at the point in each application service where the business fact is known — no interceptor, no decorator, no generic writer wrapper.
  Rationale: Matches how `CreditDebit` (the only existing append-only-ledger precedent) is written today; an interceptor can't cleanly express "write a failure row, then rethrow" for the mid-flow Keycloak-failure case and would need per-route secret-redaction configuration to guarantee "no secrets."
  Date/Author: 2026-08-17, implementation.

## Outcomes & Retrospective

All acceptance criteria implemented and verified. `pnpm typecheck`/`pnpm lint` clean. Full jest suite (100 suites / 564 tests, 0 skipped) passed with every live gate active simultaneously across 5 dedicated test databases, including the new `keycloak-organization-admin.live-keycloak.integration.spec.ts` (3/3 passing on the first run against a freshly-provisioned realm, confirming the guessed `realm-management` role list needed no widening).

Live-stack verification (host-run API, per the container-networking workaround discovered during this pass — see Surprises & Discoveries): platform admin creates an organization and its first-owner invitation via the admin API key; the invitation is accepted with no session, producing a real Keycloak user (`ensureUser`) with the `owner` realm role attached (verified directly via the Keycloak Admin API); a duplicate acceptance of the same token returns the identical result (idempotent, no second Keycloak call, no second membership row); logging in via the existing BFF flow as that user reaches Keycloak's `CONFIGURE_TOTP` required action, confirming the `owner` role correctly triggers PR 6's `mfa_required`/`lef-browser` conditional-OTP flow end to end. `bru run` (via `npx @usebruno/cli run --env local`) passed for both `bruno/organization-onboarding` (6/6, including the previously-500ing accept/duplicate-accept requests against the host-run instance) and the `bruno/bff-sessions` regression check (4/4).

Membership listing/role-change/removal and the role-hierarchy/final-owner/admin-cannot-grant-owner rejection paths were exercised only through the automated suite (unit specs plus `organization-onboarding-http.integration.spec.ts`'s real-guard/real-serialization HTTP-boundary test), not through a second live browser session — reaching those endpoints live requires a genuine owner/admin session, which requires completing Keycloak's TOTP enrollment ceremony; the automated coverage already exercises the real `PermissionsGuard`/`RolePermissionPolicy` and real DTO serialization at the HTTP boundary, and the specific new risk this plan introduced (Keycloak Admin API reachability from the running server) was the one live verification needed to catch, and did.

## Context and Orientation

PR 1 defines organizations and memberships, PR 4 defines role policy, and PR 6 authenticates browser users. Keycloak owns user identities and login, while local memberships decide which product organization and permissions the identity receives.

## Scope and Non-Goals

Add organization creation, invitation issuance/acceptance, membership listing, role changes, and member removal. Add one Keycloak administration adapter with narrowly scoped calls. Do not add public signup, social identity providers, production email delivery, or production reconciliation infrastructure.

## Plan of Work

Implement application services that authorize the actor before calling the Keycloak adapter. Store hashed, single-use invitation tokens with expiry. Link the accepting issuer/subject to the intended local membership. Protect the last owner and role hierarchy. Mark provisioning state so a failed Keycloak call never creates active local access, and allow safe retry.

## Interfaces and Dependencies

Add organization-scoped invitation and membership HTTP endpoints and a `KeycloakOrganizationAdmin` interface. Promotion to owner/admin requests Keycloak MFA enrollment. This plan depends on PR 6 and unlocks self-service service clients.

## Acceptance Criteria

- Platform admins can create an organization and invite its first owner.
- Owners/admins can invite users only into their organization.
- Invitations expire after 72 hours, are single-use, and are stored without a reusable raw token.
- Admins cannot grant owner or platform-admin roles.
- The final owner cannot be removed or demoted.
- Duplicate acceptance is idempotent and cannot create duplicate membership.
- A failed Keycloak call does not leave active local access and can be retried safely.
- Audit records include actor, organization, action, target, and outcome without secrets.

## Validation

Run invitation lifecycle, role hierarchy, final-owner, idempotency, audit, and adapter failure tests; run a local end-to-end organization creation and acceptance flow; then run all project checks.

## Idempotence and Recovery

Organization and membership provisioning uses stable local IDs and explicit state. Recoverable failures retry the same operation. Development reset can discard both Keycloak and application identity data and reseed them together.

## Artifacts and Notes

Record the endpoint shapes and synthetic onboarding transcript during implementation.

## Plan readiness

Ready to implement after PR 6.
