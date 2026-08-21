# Remove the inert migration placeholder

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The source tree should not advertise a database-migration subsystem that the running application does not use.
After this change, `src/db` is absent, development schema creation continues through TypeORM synchronization, and
the documented reset/reseed workflow remains the only recovery path for incompatible development schema changes.

## Progress

- [ ] (2026-08-21) Remove the empty migration barrel and verify that no build or runtime input references it.
- [ ] (2026-08-21) Document the current synchronization and disposable-data boundary where developers discover it.
- [ ] (2026-08-21) Run focused static and container-startup validation and record the result.

## Plan dependencies

None.

## Surprises & Discoveries

- `src/db/migrations/index.ts` contains only `export {}`.
- `LeadEmailFinderApiModule` configures TypeORM with `autoLoadEntities: true` and the validated
  `TYPEORM_SYNCHRONIZE` flag; it does not configure a migrations list or run migrations.

## Decision Log

- Decision: Delete `src/db` instead of turning it into a generic database module.
  Rationale: Entities and repositories belong to their feature modules, and the project explicitly has no
  production migration workflow yet.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Do not introduce a replacement migration directory.
  Rationale: A speculative location would recreate the same ambiguity without executable behavior.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/db/migrations/index.ts` is the only file below `src/db`. Runtime database configuration lives in
`src/lead-email-finder-api/src/lead-email-finder-api.module.ts`. Feature modules register their own entities through
`TypeOrmModule.forFeature`, and the root connection uses `autoLoadEntities`. The repository's development policy
uses `TYPEORM_SYNCHRONIZE=true` with disposable data and `corepack pnpm dev:reset -- --confirm-project=LEF` when a
schema change is incompatible.

## Scope and Non-Goals

Delete the empty migration barrel and remove any stale documentation or configuration reference found during
implementation. Clarify the current development schema policy in the narrowest existing developer documentation.
Do not move entities, create migrations, change TypeORM options, alter Compose volumes, reset developer data, or
change application behavior.

## Plan of Work

Re-run `rg` across source, scripts, configuration, Docker files, and documentation for `db/migrations`,
`src/db`, and TypeORM migration options. Delete `src/db/migrations/index.ts`. If a stale statement still describes
the empty directory as active, update that statement to name TypeORM synchronization and the existing reset command;
do not create a new general architecture document in this PR.

Build the application and inspect generated output to prove no runtime import expects `dist/db`. If the disposable
Compose stack is available, start or recreate the API with its documented development configuration and verify its
health endpoint without changing any persisted non-disposable data.

## Interfaces and Dependencies

No TypeScript interface, endpoint, environment variable, database table, or package dependency changes. The
existing `TYPEORM_SYNCHRONIZE` validation and `dev:reset` command remain authoritative.

## Acceptance Criteria

- `src/db` no longer exists and no tracked source or configuration references it.
- `LeadEmailFinderApiModule` still registers feature entities through the existing TypeORM connection.
- A clean build emits no missing-module reference to database migrations.
- The documented disposable development reset/reseed path remains accurate.
- No HTTP route, schema, or database entity changes.

## Validation

Run `rg -n "db/migrations|src/db|migrations:" src scripts docker README.md package.json nest-cli.json tsconfig*.json`
and confirm there are no active references. Run `corepack pnpm typecheck`, `corepack pnpm build`, the repository lint
command, and `git diff --check`. If Docker dependencies are available, run the documented Compose startup and verify
`/health`; record runtime validation as unavailable rather than successful when those dependencies are absent.

## Idempotence and Recovery

Deleting an empty source directory is repeatable and changes no data. Restore the single deleted file from Git if an
unexpected consumer is discovered. No database reset is required by this PR.

## Artifacts and Notes

Record the final reference search and, when run, the redacted API health result. Do not include connection strings.

## Plan readiness

Ready to implement.
