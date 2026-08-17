# Own credits and verification resources by organization

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make customer data genuinely tenant-isolated. Credits, verification jobs, and batch files belong to an organization, and an authenticated principal cannot read or charge another organization’s resources.

## Progress

- [x] Move credits from token ownership to organization ownership.
- [x] Carry organization identity through sync, async, batch, queue, and S3 flows.
- [x] Add idempotent charging and tenant-isolation tests.
- [x] Run full validation (typecheck, lint, jest, live-stack pass, Bruno) and commit.

## Surprises & Discoveries

- `bruno/smtp-dev/01-add-verification-credit.yml` and `02-verify-local-email.yml` do exercise credits (a prior assumption from PR 4's research that no Bruno collection touched credits was wrong). Updated `01-add-verification-credit.yml` to post to `/credits/{{bridgeOrganizationId}}` and documented a manual `psql` lookup of the legacy-bridge organization's id in the collection's README, mirroring the existing `ADMIN_API_KEY` copy step.
- Batch's `Finish` job-data step previously dropped every non-essential field (mirroring how it already dropped the secret `apiKey`). Since most `getBatchStatus`/`getBatchResults` calls happen after a job reaches `Finish`, carrying `organizationId`/`credentialId` only through the earlier steps would have made ownership checks silently no-op for the common case — `Finish` now carries them too.
- Extracted the `/uploads/` → `/results/` S3 key derivation used in `uploadResults` into a standalone `deriveResultsKey` function so it has a direct unit test, instead of only being reachable through a heavily-mocked processor test involving streams and `@aws-sdk/lib-storage`.

## Decision Log

- Decision: Cross-organization resource lookups return `404`.
  Rationale: This avoids disclosing that another tenant’s resource exists.
  Date/Author: 2026-08-14, project planning.
- Decision: Existing development balances, jobs, and objects are discarded.
  Rationale: There is no production data and migrations are out of scope.
  Date/Author: 2026-08-14, project planning.
- Decision: `CreditsService.debit(organizationId, amount, reference)` locks the account row with `pessimistic_write` inside a single transaction, then checks a new `credit_debits` ledger table keyed by `(organizationId, reference)` before decrementing.
  Rationale: The row lock is the primary race-safety mechanism for concurrent debits against the same organization; the ledger is the idempotency backstop for retried debits with the same reference (only batch's `validateFile` step, which BullMQ genuinely retries, relies on this — sync/async use a fresh `randomUUID()` per call since nothing upstream of them retries).
  Date/Author: 2026-08-17, implementation.
- Decision: Async's credit debit stays at HTTP/enqueue time in `CreditGuard`, not moved into the processor.
  Rationale: Moving it would change the observable contract — today `POST /verifyAsync` fails fast with `402` before a job exists; moving debit to worker time would always return `202` and fail asynchronously later instead.
  Date/Author: 2026-08-17, implementation.
- Decision: `EmailVerification` (sync results) gets no organization column.
  Rationale: No GET-by-id route exists for sync results; batch results are already read through a job-ownership-checked path (`getBatchResults` queries by `batchId = job.id`, and that job's ownership is checked first), so an unused column would add state with no consuming code path.
  Date/Author: 2026-08-17, implementation.
- Decision: The legacy `Credit` entity is deleted outright, not deprecated.
  Rationale: Only 4 files referenced it, `autoLoadEntities: true` means no central registry needs editing, and per the existing decision above, dev balances are already discarded with no migration.
  Date/Author: 2026-08-17, implementation.

## Outcomes & Retrospective

All acceptance criteria met and verified:
- `pnpm typecheck` and `pnpm lint` clean.
- Full `jest` suite passes (63 suites, 319 tests; 4 live-gated suites skip without their env vars).
- `identity-schema.integration.spec.ts` and the new `credits.service.integration.spec.ts` both pass against a real, freshly-synced PostgreSQL database, proving concurrent debits never go negative and a duplicate reference doesn't double-charge.
- Live-verified against the `bruno/smtp-dev` docker-compose fixture, rebuilt from this branch: two real organizations (the legacy-bridge org via the admin API key, and a second org backed by a real Keycloak client-credentials token minted through `scripts/keycloak/provision.ts`) each debited credits correctly on `/verify`, `/verifyAsync`, and `/verifyBatch/csv`; each organization's async/batch status and results returned `404` for the other organization's job IDs; a drained-to-zero balance produced `402`; uploaded and result S3 objects were namespaced under `organizations/<id>/uploads|results/...`.
- `bru run --env local` (via `npx @usebruno/cli`) passed 6/6 against the same fixture with `BRIDGE_ORGANIZATION_ID` set from a manual `psql` lookup.
- The `02-verify-local-email` Bruno test failed on the first run with `no_mx_records`; this traced to a stale empty-array `DNS_CACHE:MX:lef.test` entry left in the fixture's Redis volume from before CoreDNS was ready in an earlier session, not a regression from this PR's code — confirmed by resolving the same MX record successfully from both the host and `node:dns/promises` inside the `api` container. Deleting the stale Redis key and re-running fixed it.

Not yet done: push and PR (per standing instruction, only on explicit request); plan 06 (blocked on this plan being confirmed merged).

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
