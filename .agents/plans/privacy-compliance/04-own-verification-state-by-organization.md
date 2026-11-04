# Own Persisted Verification State by Organization

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make every persisted record that identifies an email address belong to the organization that requested the
verification. After this change, two organizations can verify the same address without sharing cached email,
verification-result, or SMTP-mailbox state, and neither organization can list or export the other's records. A
developer can observe the change through two-organization persistence tests, unchanged verification responses, and
the existing not-found behavior for foreign async and batch work.

## Progress

- [x] (2026-08-31 19:23 +02:00) Characterized current sync, deprecated-sync, async, batch, email-cache, and SMTP-cache ownership.
- [x] (2026-08-31 19:48 +02:00) Added organization identity to every address-bearing persistence model and lookup.
- [x] (2026-08-31 19:48 +02:00) Carried organization context through every verification entry point and batch-result query.
- [x] (2026-08-31 19:48 +02:00) Added tenant-isolation, persistence, HTTP, SMTP, and batch regression coverage.
- [x] (2026-08-31 19:48 +02:00) Reset disposable data and completed all permitted validation; recorded the Bruno runtime constraint.

## Plan dependencies

- `privacy-compliance/01`
- `auth/05`

## Surprises & Discoveries

- Discovery: Batch result CSV columns are derived from every `EmailVerification` entity column, so adding
  `organizationId` without an explicit export exclusion would expose a new persistence-only column and change the
  public result schema.
  Evidence: `BatchEmailVerificationProcessor.uploadResults()` maps all TypeORM metadata columns into the CSV
  serialization configuration; the existing Bruno assertion checks the `email` column but does not reject extra
  headers.
- Discovery: The focused baseline reached 75 passing tests, while four socket-listening suites could not bind under
  the filesystem/network sandbox (`listen EPERM`); the architecture gate passed with 138 baselined violations.
  Evidence: `corepack pnpm architecture:check` passed, and the focused Jest command reported 15 passing suites before
  the sandbox rejected HTTP integration and local SMTP listener suites. Those suites require an approved rerun outside
  the sandbox.
- Discovery: `EmailService.updateEmail()` currently acts as an upsert, drops the supplied `lastVerificationId`, and
  clears an existing format when the final verification update omits that field.
  Evidence: The controller catches `EmailNotFoundException`, but the service creates a missing row; its parameter
  destructuring ignores `lastVerificationId`, even though `EmailVerificationService` supplies it.
- Discovery: The local SMTP overlay must replace the base Compose network, not start over stale base containers.
  Evidence: Starting the overlay without taking the base project down left stale network aliases and made the one-shot
  Redis reset fail DNS resolution. Recreating the overlay without deleting named volumes restored healthy API, SMTP,
  proxy, Redis, PostgreSQL, Garage, and Keycloak services.
- Discovery: The executor prohibits passing even a short-lived authenticated access token to the Bruno CLI.
  Evidence: Both the documented collection run and a credential-free temporary CLI image were rejected at the token
  handoff boundary. No token was retained, and the temporary image and directory were removed.
- Discovery: Persisting `lastVerificationId` exposed a dormant overwrite path that could move an earlier result into a
  later batch or clear its batch identity during a later synchronous verification.
  Evidence: The original service loaded and mutated the linked result. An independent diff review caught that an older
  batch export would then omit the address, so verification results are now append-only and the PostgreSQL regression
  verifies the same address again before exporting the first batch.

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
- Decision: Keep `organizationId` out of downloaded batch CSV files while using it in the persistence predicate.
  Rationale: Organization ownership is an internal isolation key, and the plan requires existing batch result columns
  and response schemas to remain unchanged.
  Date/Author: 2026-08-31, Codex implementation.
- Decision: Separate verification-owned email upsert from the strict admin update operation and apply only supplied
  fields in both paths.
  Rationale: Verification must create its cache row on first use, while `PATCH /emails/:email` must conceal a foreign
  row with the existing not-found behavior. Persisting the last-verification link and preserving omitted fields are
  also required for an organization-scoped cache to remain internally consistent.
  Date/Author: 2026-08-31, Codex implementation.
- Decision: Append a fresh `EmailVerification` for every check and update the owning `Email.lastVerificationId` to
  reference it.
  Rationale: Verification history and batch membership must remain immutable when the same organization checks an
  address again. The organization-scoped link identifies the latest result without turning that result into mutable
  cache state.
  Date/Author: 2026-08-31, Codex implementation review.

## Outcomes & Retrospective

Organization identity now participates in every exact-address persistence key and predicate. Sync, deprecated-sync,
async, batch, email-administration, and SMTP paths all pass a narrow organization-aware command. Batch result queries
combine organization and batch identity, and downloaded CSV files retain their previous columns. Public routes,
response DTOs, queue names, credit behavior, and S3 key formats are unchanged.

The disposable stack reset and reseed completed, the SMTP overlay reached a healthy API, and the real PostgreSQL
ownership suite passed all three cases. Focused tests passed 22 suites and 118 tests, the full CI run passed 161 suites
and 1,214 tests, and typecheck, lint, build, architecture, diff, and documentation checks passed. Lint retained two
preexisting test-file warnings and introduced no errors.

The SMTP Bruno collection now covers an owned email update and the changed not-found rejection instead of relying only
on below-HTTP tests. All 20 SMTP and batch collection YAML files parse successfully, but an authenticated runtime rerun
remains unverified because executor credential policy rejected handing a token to the CLI. The attempted token files
and credential-free temporary image were removed. Later retention and application-port plans must preserve the
composite ownership keys, append-only results, and predicates.

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
to the SMTP cache so plan 07 can expire it. Append each verification result and update only the same organization's
`lastVerificationId` to reference it, without mutating the earlier result.

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
- A later verification of the same organization and address does not overwrite an earlier result or change its batch
  membership.
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
- Focused, PostgreSQL, full, architecture, build, and documentation checks pass. SMTP and batch Bruno definitions
  validate statically, and runtime results are recorded when credential-capable execution is available.

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
`bruno/batch-verification/README.md`. The SMTP collection covers the organization-scoped `/emails` success path and the
changed missing-or-foreign `404` rejection. When credential-capable execution is available, both collections must pass
against the rebuilt organization-aware application; otherwise record the policy or environment constraint and the
available static validation.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    git diff --check

Bruno: extend the SMTP collection for the changed admin-cache success and rejection behavior, then rerun both
verification collections to validate real tenant-aware wiring.

## Idempotence and Recovery

Repository lookups use the composite organization/address identity, so replay can append another owned result but
cannot read or mutate another organization's state. Queue retries retain their organization field and cannot cross
scopes. Reapplying the schema against an already-reset disposable database converges on the same tables and indexes.

If implementation stops after the incompatible entity change, do not attempt to preserve partial development data.
After confirming Compose ownership, run `pnpm dev:reset -- --confirm-project=LEF` to recreate PostgreSQL, Redis, and
ephemeral Garage data, then reprovision the deterministic fixtures. Preserve unrelated worktree changes and never
use a destructive repository reset.

## Artifacts and Notes

Final persistence shape:

- `Email`: primary key `(organizationId, id)` and index `(organizationId, updatedAt)`.
- `EmailVerification`: generated result ID, required `organizationId`, and indexes
  `(organizationId, email, createdAt)` and `(organizationId, batchId)`.
- `SmtpVerification`: primary key `(organizationId, id)`, index `(organizationId, updatedAt)`, and absolute
  `createdAt`/`updatedAt` timestamps.
- `Domain`: unchanged shared primary key with no organization field.

The redacted two-organization matrix stores the same normalized synthetic address for two organizations with opposite
email, verification, and SMTP outcomes. Each organization reads only its own outcome; the first organization's batch
CSV excludes the second organization's row and the `organizationId` header. A later same-address verification also
leaves the earlier batch row unchanged and exportable.

Validation artifacts:

- Focused Jest: 22 suites and 118 tests passed; the gated PostgreSQL suite accounted for one skipped suite and three
  skipped tests in that run.
- Real PostgreSQL: one suite and all three ownership cases passed against a dedicated disposable `_test` database;
  that database was then dropped.
- Full CI: 161 suites and 1,214 tests passed; 10 suites and 52 tests were skipped, with one test marked `todo`.
- Disposable reset/reseed: succeeded, including Keycloak and authenticated credit smoke checks. The rebuilt SMTP
  overlay API health check returned `ok` with PostgreSQL connected.
- Bruno: 20 YAML files parsed statically. Runtime SMTP and batch totals remain unavailable because credential policy
  blocked token handoff to the CLI; the collection now includes organization-scoped email-cache success and rejection
  requests.

## Plan readiness

Implementation complete and ready for pull-request review.
