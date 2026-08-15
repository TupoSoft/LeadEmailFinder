# Add invite-only organization onboarding

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow platform operators to create customer organizations and allow organization owners or admins to invite members safely. Membership creation remains consistent between Keycloak identity data and LeadEmailFinder product authorization.

## Progress

- [ ] Add organization and invitation application services.
- [ ] Add the narrow Keycloak administration adapter.
- [ ] Add lifecycle, authorization, and recovery tests.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Initial onboarding is invitation-only and invitations expire after 72 hours.
  Rationale: This avoids public-signup abuse controls while the product is under development.
  Date/Author: 2026-08-14, project planning.
- Decision: LeadEmailFinder membership status is authoritative for product access.
  Rationale: Removing access must not depend on waiting for an identity-provider token to expire.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

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
