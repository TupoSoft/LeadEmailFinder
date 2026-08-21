# Relocate proxy into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Proxy management should be discoverable beside the repository's other internal business modules. After this change,
the feature lives at `src/libs/modules/proxy/src`, consumers import its public package alias, and the running API
retains the same proxy administration, registry, allocation, lease, persistence, and observability behavior.

## Progress

- [ ] (2026-08-21) Move the proxy module and its tests without changing implementation behavior.
- [ ] (2026-08-21) Add the public alias/barrel and replace all legacy relative imports.
- [ ] (2026-08-21) Verify source, compiled output, runtime wiring, and proxy/SMTP HTTP regression behavior.

## Plan dependencies

- `module-boundaries/02`

## Surprises & Discoveries

- `src/proxy` is not an executable application; `LeadEmailFinderApiModule` and `SmtpModule` import it directly.
- Unlike `auth`, `identity`, and `bff-session`, proxy has no TypeScript package alias and consumers reach into
  `src/proxy/src` with relative paths.

## Decision Log

- Decision: Move proxy to `src/libs/modules/proxy/src` and expose
  `@tuposoft/lead-email-finder/modules/proxy`.
  Rationale: This follows the existing internal-business-module convention with less churn than introducing a new
  top-level `src/modules` convention.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Preserve the files' internal organization during relocation.
  Rationale: Re-layering every proxy class would mix a structural move with design changes and obscure regressions.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The proxy feature currently resides under `src/proxy/src`. Its Nest module is imported by
`src/lead-email-finder-api/src/lead-email-finder-api.module.ts` and the SMTP module. Shared proxy interfaces and
tokens currently live in `src/libs/common/src/interfaces/proxy`. `tsconfig.json` already maps aliases for the three
modules under `src/libs/modules`.

## Scope and Non-Goals

Move all proxy source and colocated specs to `src/libs/modules/proxy/src`, create a deliberate `index.ts`, add exact
and wildcard aliases, and update all consumers. Remove the empty legacy `src/proxy` path. Preserve public HTTP
routes, DTOs, entity metadata, provider tokens, random weighting, Redis lease semantics, and logging. Do not change
business logic, reorganize internal layers, move shared contracts, or rename public classes.

## Plan of Work

Move files with Git-aware renames where practical so history remains reviewable. Add `index.ts` exports limited to
`ProxyModule` and cross-module contracts/tokens established in plan 02; do not export persistence internals merely
to make compilation convenient. Add alias entries to `tsconfig.json` following auth/identity conventions.

Replace API and SMTP relative imports with `@tuposoft/lead-email-finder/modules/proxy`. Update test imports and any
Jest/ESLint resolver configuration only if the existing TypeScript alias handling does not already cover the new
path. Inspect compiled output for stale `src/proxy` assumptions and run the existing API bootstrap wiring tests.

## Interfaces and Dependencies

Adds the internal package alias `@tuposoft/lead-email-finder/modules/proxy` and its wildcard form. Runtime Nest
tokens retain identity by being exported from one canonical module. No endpoint, database, environment, or package
dependency changes.

## Acceptance Criteria

- All proxy implementation and tests live under `src/libs/modules/proxy/src`; `src/proxy` no longer exists.
- No tracked TypeScript file imports from `proxy/src` or reaches into proxy persistence internals.
- `LeadEmailFinderApiModule` and SMTP resolve `ProxyModule` and its exported tokens through the package alias.
- Existing proxy HTTP schemas, pagination, allocation, leasing, blacklist, and observability behavior are unchanged.
- A clean build contains the relocated module and starts without a module-resolution error.

## Validation

Run `rg -n "src/proxy|proxy/src|\.\./.*proxy" src scripts docker` and inspect every remaining match. Run
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/proxy/src
src/lead-email-finder-api/src/email-verification-module/email-verifier/smtp --runInBand`. Run
`corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`,
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand`, and `git diff --check`. From each collection
directory, run `bru run --env local` for `bruno/proxy-registry` and `bruno/smtp-dev` when available.

## Idempotence and Recovery

The change moves source without changing stored data. If interrupted, use `git status` to distinguish renamed,
deleted, and untracked files, then complete or reverse only this plan's paths. No database or Redis reset is needed.

## Artifacts and Notes

Record the final legacy-path search, alias-resolution evidence, focused test counts, and redacted Bruno statuses.

## Plan readiness

Ready to implement.
