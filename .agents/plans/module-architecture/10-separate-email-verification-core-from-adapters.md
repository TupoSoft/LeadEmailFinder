# Separate the Email-Verification Core from Persistence

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the email-verification rules and central orchestration runnable without Nest, TypeORM, DNS, HTTP, SMTP,
proxy, catch-all, BullMQ, S3, or transport DTOs. This pull request also moves the four existing persistence models
behind TypeORM store adapters and layers the existing admin-only email-cache vertical slice. Network behavior stays
in its current locations behind compatibility implementations of the new ports; plans 13 and 14 relocate those
adapters. A developer can observe the result through pure application/domain tests, real-PostgreSQL store contract
tests, unchanged organization-scoped `/emails` behavior, and unchanged verification responses through the
compatibility wiring.

## Progress

- [ ] (2026-08-30) Complete the binding size projection and, if required, replace this plan with the prescribed split.
- [ ] (2026-08-30) Characterize verification, persistence, organization ownership, and email-administration behavior.
- [ ] (2026-08-30) Define the pure domain/application core and narrow persistence and network ports.
- [ ] (2026-08-30) Implement TypeORM stores and layer the email-administration API/application slice.
- [ ] (2026-08-30) Bind legacy network components as compatibility adapters and shrink only this plan's baseline keys.
- [ ] (2026-08-30) Complete focused, PostgreSQL, HTTP, runtime, architecture, and full validation.

## Plan dependencies

- `module-architecture/08`
- `privacy-compliance/03`
- `privacy-compliance/04`

## Surprises & Discoveries

- The current `src/domain/` directory is a cached-Internet-domain feature slice containing TypeORM, Nest,
  Automapper, HTTP retrieval, DTO, and pure parsing concerns; it is not an architectural domain layer.
- `EmailVerificationService` is stored in the synchronous delivery folder even though sync, deprecated-sync, async,
  and batch callers all use it.
- The historical repository size classifier counted non-Markdown additions plus deletions, ignored
  `pnpm-lock.yaml`, and classified 1,000 or more modifications as `size/xl`. This road map retains that bound as a
  planning gate even when a checkout does not run the former labeler workflow.

## Decision Log

- Decision: Put plain email, cached-domain, verification-result, and mailbox-probe records, policies, value objects,
  and errors under `src/domain/`; put central verification and email/domain administration use cases and ports under
  `src/application/`.
  Rationale: Business rules and orchestration must be independently testable and must point outward only through
  purpose-specific interfaces.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Put `Email`, `Domain`, `EmailVerification`, and `SmtpVerification` entities, mappers, and store adapters
  under `src/infrastructure/persistence/typeorm/`, preserving the post-privacy-plan-04 organization-owned schema.
  Rationale: Persistence is one cohesive adapter family and can be separated without moving any network protocol.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Move `/emails` controllers, DTOs, validation, serialization, and HTTP error mapping to
  `src/api/http/email-administration/`; move its orchestration to application and keep TypeORM private.
  Rationale: The existing admin cache is a bounded vertical slice over the same stores and is independently
  verifiable without discovery, SMTP, queue, or storage relocation.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Define narrow `MxResolver`, `DomainSynonymDiscovery`, `AccountDiscovery`, and `MailboxProbe` ports, but
  leave their existing concrete code in place as compatibility implementations. Do not move or redesign DNS, HTTP,
  provider, SMTP, or proxy behavior here.
  Rationale: Ports let the core point inward while plans 13 and 14 keep the two network-adapter changes reviewable.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve the PII-safe logging contract from privacy plan 03 and every organization identifier, composite
  key, lookup, and isolation rule from privacy plan 04.
  Rationale: Architecture relocation cannot recreate address-bearing logs or cross-organization caches.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Before editing production code, create a per-path projection table for every non-Markdown file in scope.
  Record expected additions and deletions. Count a new file at its expected full length and a rewritten file at its
  expected changed lines. Count a move as delete plus add unless a rename-only scratch diff proves Git's rename-aware
  `numstat` is smaller. Sum additions plus deletions exactly as the repository classifier did; Markdown and
  `pnpm-lock.yaml` are excluded. A projected total of 1,000 or more is `size/xl`.
  Rationale: One ExecPlan must remain one reviewable PR and must not rely on optimistic rename detection.
  Date/Author: 2026-08-30, Codex planning.
- Decision: If the projection is `size/xl`, stop before production edits. Repurpose this plan to contain only the
  pure core and TypeORM stores. Create the next unused module-architecture ExecPlan for the email-administration
  API/integration and final core/persistence compatibility composition. Make plan 13 depend on that new plan, and
  update the road map and plan 12. Do not weaken the threshold, omit tests from the projection, or defer the split
  until review.
  Rationale: This is the predetermined decomposition seam and leaves both PRs operational and independently tested.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Add no migration or backfill. Use TypeORM synchronization only against disposable development data.
  Rationale: The repository has no production environment and the schema meaning is established by privacy plan 04.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The module is under `src/libs/modules/email-verification/`. `sync-email-verification/email-verification.service.ts`
currently normalizes an address, consults the shared `Domain` policy, reads or creates `Email`, invokes
`email-verifier/`, stores `EmailVerification`, and links the email to the latest result. The same service is called by
all delivery modes. `email/`, the current `domain/`, `sync-email-verification/`, and `email-verifier/smtp/` each mix
entities or repositories with framework and business code.

Privacy plan 04 changes `emails`, `email_verifications`, and `smtp_verifications` to organization-owned records while
keeping `domains` a shared technical-policy table. Every store operation in this plan must use the resulting
organization-aware keys and must preserve foreign-record concealment. Privacy plan 03 establishes an allowlisted log
contract that excludes raw or encoded addresses, SMTP transcripts, provider payloads, and message-bearing external
errors. Plan `module-architecture/08` supplies the sealed identity principal boundary used by retained controllers.

The existing `/emails` routes are platform-admin-only, excluded from Swagger, and scoped to the caller's
organization. Within one organization, duplicate `POST /emails` returns `409`; missing or foreign reads return
`404`; and `PATCH /emails/:email` creates a missing record only for the caller. Network code and all sync, deprecated,
async, and batch delivery folders remain compatibility callers after this PR.

## Scope and Non-Goals

Create the pure core, application ports, TypeORM persistence adapters, and the email-administration API/application
slice. Move tests with their owners, bind the old DNS/HTTP/provider/SMTP/proxy implementations to the new ports
without relocating them, narrow internal barrels, update the module README, and remove only baseline keys resolved
by these changes.

Do not move network implementations; plans 13 and 14 own them. Do not layer sync, deprecated-sync, async, or batch
delivery; plans 11, 15, and 16 own them. Do not change verification heuristics, domain synonym behavior, provider
selection, SMTP protocol order, queue contracts, S3 keys, credit charging, routes, permissions, DTO schemas, public
exports, configuration, or post-privacy table schemas. Do not add endpoints, migrations, backfills, production
rollout, or recovery mechanisms.

## Plan of Work

First inventory all affected production and test paths and complete the size projection. If it reaches `size/xl`,
perform the mandatory plan split and stop this implementation. Otherwise, capture characterization tests for
normalization, domain prohibition, email upsert, prior-result behavior, adapter outcomes, persistence failures, and
two-organization isolation.

Create framework-free records and policies under `src/domain/`. Create application commands, results, and
purpose-specific stores and network ports under `src/application/`; avoid generic repositories and manager
services. Move the central verification sequence from `sync-email-verification/` into application. Domain and
application files must not import Nest, TypeORM, Automapper, class validation/serialization, DNS/HTTP/SMTP clients,
catch-all providers, proxy implementations, BullMQ, Redis, multer, S3, or transport DTOs.

Move all four TypeORM schemas to `src/infrastructure/persistence/typeorm/` and add explicit domain/entity mappers.
Implement organization-aware `EmailStore`, `VerificationStore`, and `SmtpVerificationStore` plus the shared
technical `DomainStore`. Preserve table/column names, composite identities, indexes, enum/null/default behavior,
timestamps, batch linkage, latest-verification linkage, and insert-versus-update semantics. Add contract tests that
run against in-memory fakes and each real adapter, plus a real-PostgreSQL round trip.

Move `/emails` transport code to `src/api/http/email-administration/` and its operations to application. Keep guards,
Swagger exclusion, validation, mapping, and status codes unchanged. Add a Nest/TypeORM integration test for
unauthenticated, unauthorized, platform-admin, duplicate, invalid, missing, foreign, and cross-organization cases.

Adapt the existing DNS, synonym, provider, and SMTP classes at their legacy paths to the new network ports. This is
temporary inward-pointing compatibility wiring, not permission to export or deep-import those implementations.
Recompose only what is needed for the core and email administration to run. Keep the four delivery folders in place
and rewire them to the new core token. Update `src/libs/modules/email-verification/README.md`; run the shrink-only
baseline command and reject any new or renamed violation key.

## Interfaces and Dependencies

The top-level barrel continues to export only `EmailVerificationModule`. New internal contracts include
organization-aware `EmailStore`, `VerificationStore`, and `SmtpVerificationStore`; shared-policy `DomainStore`; and
the `MxResolver`, `DomainSynonymDiscovery`, `AccountDiscovery`, and `MailboxProbe` network ports. Values crossing
these interfaces are domain records and application commands, never TypeORM entities, Nest providers, HTTP DTOs, or
provider responses.

No HTTP, queue, storage, configuration, or public TypeScript contract changes. The plan depends on the identity
boundary from module-architecture plan 08, PII-safe logging from privacy plan 03, and organization-owned persistence
from privacy plan 04. Plans 13 and 14 replace the compatibility network implementations; plans 11, 15, and 16 layer
delivery.

## Acceptance Criteria

- The recorded projection is below 1,000 non-documentation additions plus deletions, or this plan has been replaced
  by the mandated two-plan split before any production edit.
- Domain/application code imports no framework, ORM, Automapper, validation/serialization, network client, provider,
  proxy implementation, queue, Redis, multer, S3, or transport DTO.
- Pure tests run central verification and email/domain policy with fakes only.
- All four TypeORM schemas are private infrastructure details and preserve the post-privacy-plan-04 schema and
  organization boundaries with no migration.
- Two organizations can process the same address without sharing email, verification, or SMTP state; the shared
  domain policy remains non-tenant data.
- Compatibility network adapters produce the same outcomes and errors without adding a raw address, SMTP transcript,
  provider payload, or external message to logs.
- `/emails` retains its routes, platform-admin policy, Swagger exclusion, validation, serialization, organization
  isolation, `409`, `404`, and upsert behavior through the recomposed module.
- Sync, deprecated-sync, async, and batch behavior remains unchanged in legacy delivery folders.
- The public barrel remains module-only; the baseline loses only resolved core, persistence, and email-admin keys.
- Focused, PostgreSQL, HTTP integration, architecture, full-suite, build, documentation, runtime, and diff checks pass.

## Validation

Before production edits, record the projection table and sum its additions and deletions. After implementation,
compare the actual classifier-compatible count:

    git fetch origin master
    git diff --numstat -M origin/master...HEAD | awk '$3 !~ /\.md$/ && $3 != "pnpm-lock.yaml" { additions += $1; deletions += $2 } END { print additions + deletions }'

The projection must be less than 1,000. If the actual result reaches 1,000, do not open the PR as delivered; execute
the same prescribed split and revalidate each branch.

Run focused and persistence coverage:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/application src/libs/modules/email-verification/src/infrastructure/persistence src/libs/modules/email-verification/src/api/http/email-administration --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_email_verification_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-verification-persistence.integration.spec.ts email-administration-http.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Inspect the baseline diff and reject added or path-renamed debt. Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/10-separate-email-verification-core-from-adapters.md
    git diff --check

Before runtime checks, inspect the `lef-api-1` Compose labels and stop if another checkout owns the project. Against an
owned disposable stack, run the existing SMTP development collection from its README to prove the compatibility
wiring still reaches the unchanged network adapters and responses.

Bruno: add no requests because this is a behavior-preserving internal refactor; rerun `bruno/smtp-dev` as a wiring
regression.

## Idempotence and Recovery

Create ports and characterization tests before moving owners, then move one model/use case at a time. Repeated file
moves, adapter registration, and shrink-only baseline updates must be no-ops. If interrupted, use `git status`, the
architecture report, and focused tests to finish or revert only the current narrow move; never recover with a deep
import or new baseline key.

Post-privacy schemas are unchanged. Use only disposable synchronized data and, after confirming Compose ownership,
`pnpm dev:reset -- --confirm-project=LEF`. There is no migration rollback. Preserve unrelated user changes and
another checkout's containers.

## Artifacts and Notes

Record the per-path size projection and actual count, final layer map, port list, TypeORM mapping proof, email-admin
HTTP results, removed and deliberately retained baseline keys, test totals, sanitized runtime result, and full
validation. Do not record raw addresses beyond local fixtures, tokens, service-client secrets, SMTP credentials,
provider payloads, or customer data.

## Plan readiness

Ready after the binding size projection confirms fewer than 1,000 non-documentation additions plus deletions; otherwise replace this plan with the mandated split ExecPlans.
