# Add self-service M2M client management

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow organization owners and admins to create and manage least-privilege OAuth clients for integrations without exposing or reusing the legacy API-key system.

## Progress

- [ ] Add service-client lifecycle application services and endpoints.
- [ ] Provision Keycloak clients through the administration adapter.
- [ ] Add secret, scope, isolation, and failure tests.

## Plan dependencies

- `auth/07`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Client secrets are displayed only at creation or explicit rotation.
  Rationale: Recoverable plaintext secrets would recreate the current raw-token risk.
  Date/Author: 2026-08-14, project planning.
- Decision: Rotation invalidates the old secret immediately.
  Rationale: Development clients needing overlap can create a replacement client before deleting the old one.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

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
