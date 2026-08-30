# Own Persisted Verification State by Organization

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make every persisted record that identifies an email address belong to the organization that requested the
verification. After this change, two organizations can verify the same address without sharing cached email,
verification-result, or SMTP-mailbox state, and neither organization can list or export the other's records. A
developer can observe the change through two-organization persistence tests, unchanged verification responses, and
the existing not-found behavior for foreign async and batch work.

## Progress

- [ ] (2026-08-30) Characterize current sync, deprecated-sync, async, batch, email-cache, and SMTP-cache ownership.
- [ ] (2026-08-30) Add organization identity to every address-bearing persistence model and lookup.
- [ ] (2026-08-30) Carry organization context through every verification entry point and batch-result query.
- [ ] (2026-08-30) Add tenant-isolation, persistence, HTTP, SMTP, and batch regression coverage.
- [ ] (2026-08-30) Reset disposable data and complete focused, Bruno, documentation, and full validation.

## Plan dependencies

- `privacy-compliance/01`
- `auth/05`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: `emails`, `email_verifications`, and `smtp_verifications` are organization-owned, including cache
  reads and writes that are not directly exposed by a read endpoint.
  Rationale: Ownership follows the processing purpose and data subject, not the existence of a public GET route.
  This supersedes the earlier auth plan-05 decision not to add organization identity to synchronous results.
  Date/Author: 2026-08-30, Codex planning.
- Decision: `domains` remains a shared technical-policy table.
  Rationale: The current verification path only reads operator-managed domain rules and does not persist a tenant or
  address association there. A future tenant-derived domain cache must revisit this classification.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Controllers and queue adapters translate `AuthPrincipal` or job data into a narrow verification command;
  core services and stores receive `organizationId`, not an authentication object.
  Rationale: Organization ownership is a business invariant, while credential and HTTP details remain at delivery
  boundaries.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Existing `/emails` routes become scoped to the authenticated platform administrator's organization and
  do not gain a cross-organization query parameter.
  Rationale: A hidden administrative endpoint must not remain an unrestricted tenant-wide address browser.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Use TypeORM synchronization against disposable development data and add no migration or backfill.
  Rationale: The repository has no production environment, and `.agents/PLANS.md` requires incompatible schema
  changes to use the documented reset and reseed workflow.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The current module lives under `src/libs/modules/email-verification/src/`. `EmailVerificationService` in
`sync-email-verification/email-verification.service.ts` lowercases the address, reads or creates a global `Email`,
runs `EmailVerifier`, and saves an `EmailVerification`. `SmtpVerifier` in
`email-verifier/smtp/smtp-verifier.ts` caches conclusive mailbox results globally by exact address. The corresponding
entities in `email/email.entity.ts`, `sync-email-verification/email-verification.entity.ts`, and
`email-verifier/smtp/smtp-verification.entity.ts` have no organization column.

Async and batch job data already carries `organizationId` and `credentialId`, and status/result services conceal
foreign jobs with `404`. The async processor passes the wider job object into `verify()`, but the current
`VerifyOptions` contract in `src/libs/common/src/interfaces/email-verification/verify-options.interface.ts` ignores
organization identity. Sync and deprecated-sync controllers do not inject `CurrentPrincipal`. Batch result creation
in `batch-email-verification/batch-email-verification.processor.ts` selects result rows by `batchId` alone.

Module-architecture plan 10 will later move the same persistence and verification behavior behind application ports
and infrastructure adapters. That refactor must preserve the organization-aware command, composite identities,
tenant-scoped store operations, and tests delivered here; it must not restore the older global contracts merely to
match the pre-privacy schema described in that plan.

## Scope and Non-Goals

Add organization ownership to exact-address persistence; pass organization context through current sync,
deprecated-sync, async, batch, email-administration, and SMTP flows; tenant-scope result generation; and add focused
and real-PostgreSQL isolation coverage. Preserve public verification response bodies, queue names, S3 key format,
credit behavior, and verification algorithms.

Do not add retention sweeps, privacy-request endpoints, data-subject identity verification, public consumer intake,
California DROP integration, migrations, backfills, or production rollout. Do not tenant-scope the operator-managed
`domains` table or change SMTP, catch-all, DNS, proxy, retry, or billing policy.

## Plan of Work

First extend characterization tests beside the current controllers and services. Prove the existing HTTP methods,
statuses, DTOs, permissions, credit guards, queue data, and batch result columns before changing persistence. Add a
two-organization fixture that uses the same normalized address and gives each organization different stored test
outcomes so a global cache lookup cannot pass accidentally.

Change the current `VerifyOptions`/`IEmailVerificationService` path to require `organizationId`; callers must construct
that value from `CurrentPrincipal().organizationId` or existing job data. Update
`sync-email-verification.controller.ts` and `old-sync-email-verification.controller.ts` to inject the principal.
Keep `organizationId` and `credentialId` in async and batch job payloads, and make the processor construct an
explicit verification command instead of relying on structural excess properties.

Add a non-null organization column to `EmailVerification`. Make `(organizationId, id)` the composite primary key for
`Email` and `SmtpVerification`, where `id` remains the normalized address. Add indexes on
`EmailVerification(organizationId, email, createdAt)`, `EmailVerification(organizationId, batchId)`,
`Email(organizationId, updatedAt)`, and `SmtpVerification(organizationId, updatedAt)`. Add created/updated timestamps
to the SMTP cache so plan 07 can expire it. Resolve an email's `lastVerificationId` only inside the same organization.

Update `EmailService`, `EmailVerificationService`, and `SmtpVerifier` so every repository predicate includes
organization identity. Update `BatchEmailVerificationProcessor.uploadResults()` to stream only rows matching both
the job's organization and batch ID. Scope `EmailController` operations to the principal organization while
preserving its current paths, platform-admin permission, Swagger exclusion, DTOs, and duplicate/not-found behavior.

Update module wiring and focused specs without exporting persistence types from
`src/libs/modules/email-verification/src/index.ts`. Update `src/libs/modules/email-verification/README.md` with the
ownership invariant. Because the schema is intentionally incompatible, validate on a disposable database after the
documented `pnpm dev:reset -- --confirm-project=LEF` ownership check and reseed.

## Interfaces and Dependencies

The current command becomes equivalent to:

    interface VerifyOptions {
        organizationId: string
        email: string
        format?: EmailPatternEnum
        batchId?: string
    }

Email operations become organization-scoped equivalents of `createEmail(organizationId, request)`,
`getEmails(organizationId)`, `getEmail(organizationId, email)`, and
`updateEmail(organizationId, email, changes)`. SMTP verification becomes
`verify(organizationId, normalizedEmail)`. The later plan-10 application ports must expose the same ownership
explicitly rather than hiding it in TypeORM entities or ambient request state.

Public routes remain `POST /verify`, deprecated `GET /verify`, `POST /verifyAsync`, `GET /verifyAsync/:id`, the three
`/verifyBatch` operations, and the hidden `/emails` operations. Successful DTOs remain unchanged. A missing or
foreign organization-owned record uses the current `404` concealment behavior.

This plan uses existing TypeORM, auth, identity, BullMQ, and email-verification dependencies. It adds no package.

## Acceptance Criteria

- Two organizations can persist the same normalized email without a uniqueness conflict.
- An email, prior verification, or SMTP result saved for one organization is never read or updated by another.
- Sync and deprecated-sync requests pass the authenticated organization to the same core verification operation.
- Async and batch processors use the organization already present in their job data, without storing credentials or
  bearer tokens.
- Batch result generation requires both `organizationId` and `batchId`; a synthetic row with the same batch ID in a
  second organization is absent from the CSV.
- `/emails` creates, lists, reads, and updates only the caller organization's cache; a foreign address appears not
  found.
- Existing verification methods, statuses, response schemas, permissions, credit charges, queue names, retry
  behavior, and S3 keys remain unchanged.
- `domains` remains schema-compatible and shared, with a test proving that no organization identifier is written to
  it during verification.
- Empty disposable-database synchronization and reseeding succeed without a migration.
- Focused, PostgreSQL, full, architecture, build, documentation, SMTP Bruno, and batch Bruno checks pass.

## Validation

Run focused tests against the current paths, including new controller, service, repository, batch-query, and SMTP
tenant-isolation cases:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/sync-email-verification src/libs/modules/email-verification/src/old-sync-email-verification src/libs/modules/email-verification/src/async-email-verification src/libs/modules/email-verification/src/batch-email-verification src/libs/modules/email-verification/src/email src/libs/modules/email-verification/src/email-verifier --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_verification_ownership_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-organization-ownership.integration.spec.ts --runInBand

Before using the shared Compose project, inspect the `lef-api-1` working-directory label and stop if another checkout
owns it. For an owned disposable project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'

Run the exact container-network commands documented in `bruno/smtp-dev/README.md` and
`bruno/batch-verification/README.md`. Bruno requests do not need any new response assertions because the public schemas do
not change, but both existing collections must pass against the rebuilt organization-aware application.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/04-own-verification-state-by-organization.md
    git diff --check

Bruno: no collection change is planned because the HTTP schema is unchanged; rerun both existing verification
collections to validate real tenant-aware wiring.

## Idempotence and Recovery

Repository operations use the composite organization/address identity, so replay updates or reuses only the owning
organization's state. Queue retries retain their organization field and cannot cross scopes. Reapplying the schema
against an already-reset disposable database converges on the same tables and indexes.

If implementation stops after the incompatible entity change, do not attempt to preserve partial development data.
After confirming Compose ownership, run `pnpm dev:reset -- --confirm-project=LEF` to recreate PostgreSQL, Redis, and
ephemeral Garage data, then reprovision the deterministic fixtures. Preserve unrelated worktree changes and never
use a destructive repository reset.

## Artifacts and Notes

Record the final entity keys/indexes, a redacted two-organization test matrix, focused and PostgreSQL test totals,
the reset/health result, and SMTP/batch Bruno totals. Do not record real addresses, tokens, credentials, customer
CSV rows, or unredacted database output.

## Plan readiness

Ready to implement
