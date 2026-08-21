# Relocate email verification into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Email verification should be a named business capability composed by the API host, not the host's largest internal
subtree. After this change, synchronous, deprecated synchronous, asynchronous, batch, domain, email, SMTP, and
catch-all orchestration live under `src/libs/modules/email-verification/src`, depend on public credits/proxy contracts,
and preserve all existing HTTP, queue, storage, DNS, SMTP, billing, and persistence behavior.

## Progress

- [ ] (2026-08-21) Isolate verification-owned configuration types from the API host DTO.
- [ ] (2026-08-21) Move the complete verification subtree and add its public alias/barrel.
- [ ] (2026-08-21) Rewire credits, proxy, queues, S3, DNS, catch-all, and root composition.
- [ ] (2026-08-21) Verify focused, full, build, runtime, and Bruno regression behavior.

## Plan dependencies

- `module-boundaries/07`
- `verification-reliability/02`
- `verification-reliability/03`

## Surprises & Discoveries

- The current subtree contains several nested Nest modules and four externally observable workflows rather than one
  simple controller/service pair.
- Batch storage and SMTP factory code import the root `EnvironmentVariablesDto`, creating an outward dependency on
  the composition host.
- Batch processing imports `CreditsService`, while synchronous and asynchronous controllers import `CreditGuard`;
  SMTP consumes both proxy registry and allocator behavior.
- `src/libs/catch-all`, `dns`, `socket`, `redis`, and `common` are reusable dependencies and need not move with the
  feature in this PR.

## Decision Log

- Decision: Move the complete `email-verification-module` subtree as one PR after its reliability plans complete.
  Rationale: Its nested modules share entities, tokens, queues, and DTOs; splitting the physical move would create
  temporary duplicate ownership and fragile cross-tree imports.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Rename the destination to `modules/email-verification`, omitting the redundant `-module` suffix.
  Rationale: The parent directory already communicates that it contains modules.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Keep reusable catch-all, DNS, socket, Redis, and common libraries in place.
  Rationale: This plan fixes business-module ownership; reclassifying each technical/provider library is independent
  cleanup with no requirement for the target consistency outcome.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/email-verification-module` composes sync, deprecated sync, async, and batch verification.
It also contains domain/email persistence, verification orchestration, SMTP connection/client logic, BullMQ producers
and processors, S3 upload handling, DTOs, profiles, decorators, and extensive focused tests. The root imports only
`EmailVerificationModule`, but nested code reaches outward to host environment types and former host-local credits,
and historically reached into proxy persistence. Plans 02 through 04 establish public proxy and credits dependencies
before this move.

## Scope and Non-Goals

Move the complete subtree to `src/libs/modules/email-verification/src`, add exact/wildcard aliases and a narrow public
barrel, replace root environment DTO imports with verification-owned configuration shapes, and update the host/tests.
Preserve every endpoint, request/response DTO, permission, credit rule, queue name/job payload, BullMQ processing
behavior, S3 key, upload semantics, entity metadata, cache behavior, SMTP classification, proxy retry/lease behavior,
and deprecated-route compatibility. Do not rewrite verification logic, split nested modules, move generic libraries,
change schemas, or add migrations.

## Plan of Work

Define small configuration interfaces for the S3 keys read by batch upload code, SMTP settings, and catch-all proxy
selection. Type `ConfigService` against those shapes so no verification file imports the root aggregate environment
DTO; keep root validation unchanged.

Move the subtree and all colocated specs with Git-aware renames. Add
`@tuposoft/lead-email-finder/modules/email-verification` aliases and export only `EmailVerificationModule` plus an
existing contract proven necessary outside the feature. Update nested credits and proxy imports to the public aliases
from earlier plans. Preserve internal relative imports within the feature rather than forcing every sibling through
the public barrel.

Update `LeadEmailFinderApiModule` to import the new alias. Inspect Nest module graphs for duplicate/missing queue,
TypeORM, S3, proxy, credits, mapper, and controller registrations. Search build output and source for the old directory
name and verify worker processors are still discovered and execute with unchanged job names/data.

## Interfaces and Dependencies

Adds `@tuposoft/lead-email-finder/modules/email-verification`. Moves internal configuration typing without changing
validated environment keys. Public HTTP endpoints remain `/verify`, `/verifyAsync`, `/verifyBatch`, and existing
email/domain routes. Existing BullMQ names, DTOs, entities, provider tokens, and storage keys remain stable.

## Acceptance Criteria

- Verification implementation/tests live under `src/libs/modules/email-verification/src`; the old host subtree is
  absent.
- No verification file imports the API host or another module's persistence entity, DTO, or deep source path.
- Root environment validation accepts/rejects the same values, and verification reads the same runtime keys.
- Sync, deprecated sync, async, and batch routes retain paths, validation, authorization, billing, statuses, and
  response schemas.
- Async/batch producers and processors retain queue names, job payload compatibility, progress, durable result
  handling, and organization ownership.
- DNS, SMTP, catch-all, proxy allocation/leases, persistence caching, S3 upload, and failure classification preserve
  current focused behavior.
- A clean build starts the API and registers all relocated controllers and processors without module-resolution or
  duplicate-provider errors.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src
src/libs/modules/credits/src src/libs/modules/proxy/src --runInBand`. Run queue/TypeORM/S3 integration coverage whose
disposable dependencies are configured. Run `corepack pnpm typecheck`, `corepack pnpm build`,
`corepack pnpm lint`, `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand`, and
`git diff --check`.

Start the disposable development stack when available and run `bru run --env local` for `bruno/smtp-dev` and
`bruno/batch-verification`; run any other collection that covers a moved email/domain endpoint. Verify `/health` and
inspect worker logs for processor registration. If listener, Docker, S3, or SMTP fixture access is unavailable,
record those runtime checks as unverified rather than green.

## Idempotence and Recovery

The source move changes no rows, jobs, objects, or proxy leases. Complete or reverse interrupted renames using the
explicit old/new paths shown by `git status`; preserve unrelated changes. Runtime fixture runs must use disposable
data. If a queue/object fixture is interrupted, use the documented `dev:reset` confirmation and fixture cleanup,
then reseed before retrying.

## Artifacts and Notes

Record the old-path/deep-import search, focused/full test counts, build output, registered processor evidence, and
redacted Bruno statuses. Never record uploaded customer data, email lists, proxy credentials, storage secrets, or
bearer tokens.

## Plan readiness

Ready to implement.
