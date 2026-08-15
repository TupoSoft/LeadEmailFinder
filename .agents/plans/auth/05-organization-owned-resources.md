# Own credits and verification resources by organization

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make customer data genuinely tenant-isolated. Credits, verification jobs, and batch files belong to an organization, and an authenticated principal cannot read or charge another organization’s resources.

## Progress

- [ ] Move credits from token ownership to organization ownership.
- [ ] Carry organization identity through sync, async, batch, queue, and S3 flows.
- [ ] Add idempotent charging and tenant-isolation tests.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Cross-organization resource lookups return `404`.
  Rationale: This avoids disclosing that another tenant’s resource exists.
  Date/Author: 2026-08-14, project planning.
- Decision: Existing development balances, jobs, and objects are discarded.
  Rationale: There is no production data and migrations are out of scope.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`CreditsService` currently updates a balance by raw token. `CreditGuard` extracts the token from the request. Batch job data contains `apiKey`, and async/batch status endpoints look up BullMQ jobs by UUID without checking an owner. S3 result keys are not organization-scoped.

## Scope and Non-Goals

Change credits, synchronous verification, async verification, batch verification, BullMQ payloads, and S3 paths to use organization and credential IDs. Add idempotent debit references. Do not preserve existing data, add migrations, or build organization-management endpoints.

## Plan of Work

Pass `AuthPrincipal` from controllers into application services. Persist or carry organization ownership when work is created. Replace token credit keys with organization credit accounts and an idempotent debit record/reference. Namespace uploaded and generated objects under the organization. Check ownership before returning status or result streams.

## Interfaces and Dependencies

Verification application services accept an organization context instead of a token. Queue data contains `organizationId` and `credentialId`; it never contains a secret. This plan depends on PR 4 and unlocks safe browser and customer-management access.

## Acceptance Criteria

- All credentials in an organization use one shared balance.
- Queue payloads contain organization and credential IDs but no raw credentials.
- Async status, batch status, and batch results are accessible only within their organization.
- Cross-organization access returns `404`.
- S3 inputs and results are namespaced by organization.
- Concurrent debits cannot make a balance negative.
- Retrying the same debit reference does not charge twice.
- Empty-database synchronization and reseeding produce usable credit accounts without migrations.

## Validation

Run concurrent credit tests, retry/idempotency tests, queue-payload assertions, S3-key tests, controller/service tenant-isolation tests, a clean-database integration test, and all project checks.

## Idempotence and Recovery

Debit references make worker retries safe. On incompatible schema change, reset disposable PostgreSQL, Redis/BullMQ, and S3 state and reseed. No conversion or partial-data recovery is required.

## Artifacts and Notes

Record representative queue data and S3 keys with synthetic identifiers only.

## Plan readiness

Ready to implement after PR 4.
