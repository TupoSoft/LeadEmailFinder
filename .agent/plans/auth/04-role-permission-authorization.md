# Authorize roles and product permissions

This ExecPlan is a living document maintained according to `.agent/PLANS.md`.

## Purpose / Big Picture

Replace generic API-key roles with explicit product permissions so each human or machine principal receives only the operations intended for its organization role and configured scopes.

## Progress

- [ ] Add the role-to-permission policy.
- [ ] Replace controller permission declarations.
- [ ] Add matrix and privilege-escalation tests.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: LeadEmailFinder owns product authorization.
  Rationale: Keycloak proves identity, while application policy remains testable and independent of provider configuration.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

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
