# Relocate Email Verification into the Standard Module Hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Email verification should be a named business capability composed by the API host, not the host's largest internal
subtree. After this change, synchronous, deprecated synchronous, asynchronous, batch, domain, email, SMTP, and
catch-all orchestration live under `src/libs/modules/email-verification/src`, depend on public credits/proxy contracts,
and preserve all existing HTTP, queue, storage, DNS, SMTP, billing, and persistence behavior.

## Progress

- [x] (2026-08-27) Isolate verification-owned configuration types from the API host DTO.
- [x] (2026-08-27) Move the complete verification subtree and add its public alias/barrel.
- [x] (2026-08-27) Rewire credits, proxy, queues, S3, DNS, catch-all, and root composition.
- [x] (2026-08-27) Verify focused, full, build, static, runtime-availability, and Bruno-applicability behavior.

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
- The Git index associated with this worktree is read-only, so `git mv` could not acquire its lock. A filesystem rename preserved all
  source contents, and Git's rename detection can represent the relocation without staging the files.
- The documented reset and SMTP-development overlay provide the disposable runtime needed for the remaining live
  checks. Bruno can run from the official CLI container on `lef_default`, which preserves the overlay's internal API
  and OIDC addresses without installing the CLI on the host or in the project.

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
- Decision: Model batch upload, catch-all proxy, and SMTP configuration as three private, purpose-specific interfaces.
  Rationale: Each adapter now declares only the environment keys it consumes and no longer depends on the API host's
  aggregate validation DTO; the root validation contract remains unchanged.
  Date/Author: 2026-08-27, Codex implementation.

## Outcomes & Retrospective

Implemented and statically validated. All 111 existing verification source and test files now live under
`src/libs/modules/email-verification/src`; 107 are byte-identical to their versions at `HEAD`, and the four edited
files only replace the API host environment DTO with three private, purpose-specific configuration interfaces. The
public barrel still exports only `EmailVerificationModule`, while TypeScript, Jest, and the API host resolve it through
the new exact and wildcard aliases.

The focused and full Jest suites, root environment validation tests, type check, production build, lint, documentation
lint, and whitespace checks passed. The compiled host imports the relocated module from its emitted library path. No
externally observable HTTP behavior changed, so Bruno definitions did not require edits. The disposable base stack
and SMTP-development overlay started successfully, `/health` reported PostgreSQL up, and the existing SMTP-development
and batch-verification Bruno workflows passed from the official Bruno CLI 4.0.0 container.

## Context and Orientation

Before this change, `src/lead-email-finder-api/src/email-verification-module` composed sync, deprecated sync, async,
and batch verification. The capability now lives under `src/libs/modules/email-verification/src` and contains its
domain/email persistence, verification orchestration, SMTP connection/client logic, BullMQ producers and processors,
S3 upload handling, DTOs, profiles, decorators, and focused tests. The API host imports only
`EmailVerificationModule` through the public alias. Nested code depends on feature-owned configuration types and the
public credits and proxy contracts established by the prerequisite plans.

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

Move the subtree and all nearby specs with Git-aware renames. Add
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

**Results (2026-08-27):**

- The focused Jest command passed 33 suites and 169 tests; one suite and five tests remained skip-gated.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed with zero errors.
- `./node_modules/.bin/nest build` found zero TypeScript issues and compiled 445 files. The emitted API host requires
  `dist/libs/modules/email-verification/src`, proving that the build rewrites the new public alias correctly.
- `./node_modules/.bin/eslint .` passed with zero errors and two unrelated, previously present warnings in
  `src/libs/config/src/load-secrets.spec.ts` and
  `src/libs/redis/src/parse-connection-string-options.factory.spec.ts`.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp ./node_modules/.bin/jest --runInBand` passed 121 suites and 752 tests; nine suites
  and 27 tests remained skip-gated, with one to-do item already recorded.
- A comparison against `HEAD` found 107 byte-identical relocated files, four intentionally edited configuration
  consumers, and no missing files. Searches found no API host import, deep module source import, or stale old source
  path in the implementation.
- `git diff --check` and an explicit trailing-whitespace scan of the untracked destination passed.
- The confirmed disposable reset, Keycloak bootstrap, customer fixture seed, and SMTP-development overlay completed.
  The API, Garage, Keycloak, Mailpit, PostgreSQL, and Redis reported healthy; `/health` returned `status: ok` with
  PostgreSQL up.
- `bruno/smtp-dev` passed 11 of 11 requests and 11 of 11 tests from
  `ghcr.io/usebruno/cli:4-alpine` (Bruno CLI 4.0.0) on `lef_default`.
- `bruno/batch-verification` passed three of three requests and five of five tests from the same disposable Bruno
  container. Its completed upload, polling, and result-download workflow also exercises the relocated batch worker
  and S3 result path.

## Idempotence and Recovery

The source move changes no rows, jobs, objects, or proxy leases. Complete or reverse interrupted renames using the
explicit old/new paths shown by `git status`; preserve unrelated changes. Runtime fixture runs must use disposable
data. If a queue/object fixture is interrupted, use the documented `dev:reset` confirmation and fixture cleanup,
then reseed before retrying.

## Artifacts and Notes

Record the old-path/deep-import search, focused/full test counts, build output, registered processor evidence, and
redacted Bruno statuses. Never record uploaded customer data, email lists, proxy credentials, storage secrets, or
bearer tokens.

Final evidence: the destination contains the 111 relocated files plus one private configuration file, and the old
source directory is absent. The public barrel exports only `EmailVerificationModule`; focused HTTP and queue/SMTP/S3
unit coverage passed; and the production build emitted all relocated controllers and processors. No customer data,
credentials, tokens, proxy secrets, or uploaded files were recorded.

## Plan readiness

Implemented and validated, including the live disposable stack, API health, SMTP-development workflow, and batch
upload, worker, storage, and result-download workflow. Bruno ran from the official disposable CLI container, so no
host or project installation was required.
