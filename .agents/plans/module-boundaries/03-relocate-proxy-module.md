# Relocate proxy into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Proxy management should be discoverable beside the repository's other internal business modules. After this change,
the feature lives at `src/libs/modules/proxy/src`, consumers import its public package alias, and the running API
retains the same proxy administration, registry, allocation, lease, persistence, and observability behavior.

## Progress

- [x] (2026-08-21) Move the proxy module and its tests without changing implementation behavior.
- [x] (2026-08-21) Add the public alias/barrel and replace all legacy relative imports.
- [x] (2026-08-21) Verify source, compiled output, runtime wiring, and proxy/SMTP HTTP regression behavior.

## Plan dependencies

- `module-boundaries/02`

## Surprises & Discoveries

- `src/proxy` is not an executable application; `LeadEmailFinderApiModule` and `SmtpModule` import it directly.
- Unlike `auth`, `identity`, and `bff-session`, proxy has no TypeScript package alias and consumers reach into
  `src/proxy/src` with relative paths.
- Only 2 non-spec source files imported `ProxyModule` via relative path (`lead-email-finder-api.module.ts`,
  `smtp.module.ts`), plus one spec file (`smtp.module.spec.ts`) -- the shared `IProxy`/`IProxyService`/tokens
  established in `module-boundaries/02` already live in `@tuposoft/lead-email-finder/common`, not in proxy
  itself, so nothing else needed updating. The relocation's actual blast radius was much smaller than the
  directory size suggested.
- No file inside `src/proxy/src` imported anything via a relative path reaching outside its own directory, so the
  whole-directory move needed zero internal import-depth adjustments -- every internal reference was already
  same-directory or alias-based.
- `jest.config.ts`'s `moduleNameMapper` needed both a wildcard and bare entry for the new alias, in that order
  (per the file's own documented ordering rule: a bare entry has no capture group, so if it matched first it
  would collapse any deep import down to the bare directory). `tsconfig.json`'s `paths` and ESLint's
  `typescript: true` resolver needed no equivalent care -- they don't have this first-match-wins ordering
  sensitivity.

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

Implemented and fully validated, including live regression against both affected Bruno collections.

`src/proxy/src` moved to `src/libs/modules/proxy/src` via `git mv` (all 20 files recorded as renames, internal organization untouched). New `index.ts` barrel exports only `ProxyModule` — deliberately narrow, per the plan's own "do not export persistence internals merely to make compilation convenient": nothing else was needed, since the cross-module contracts/tokens established in `module-boundaries/02` already live in `@tuposoft/lead-email-finder/common`. Added the `@tuposoft/lead-email-finder/modules/proxy` alias (exact + wildcard) to `tsconfig.json`'s `paths` and `jest.config.ts`'s `moduleNameMapper` (wildcard entry before the bare one, per that file's own documented first-match-wins ordering rule), matching the `auth`/`bff-session`/`identity` convention exactly. Updated the 3 files that referenced the old relative path (`lead-email-finder-api.module.ts`, `smtp.module.ts`, `smtp.module.spec.ts`) to import from the new alias. ESLint's `typescript: true` resolver picked up the new alias automatically — no config change needed there.

Validation: `rg -n "src/proxy|proxy/src|\.\./.*proxy" src scripts docker` returns zero matches; confirmed no file inside the moved directory has a relative import reaching outside it either. Focused suite (`src/libs/modules/proxy/src` + `email-verifier/smtp`, `--runInBand`): 12/12 suites, 61/61 tests. Repo-wide: `lint` clean (baseline only), `test:ci` 707/707 non-skipped (unchanged from before the move, as expected for a pure relocation), `typecheck`/`build` clean (436 files, verified via `find` that compiled output lands under `libs/modules/proxy/src` with no stale top-level `proxy/` directory), `git diff --check` clean.

Live Bruno regression, same two-stack-configuration approach as `module-boundaries/02` (the two collections need mutually exclusive Keycloak issuer wiring): `bruno/proxy-registry` against the plain base stack — 8/8 passing. `bruno/smtp-dev` against the `smtp-dev` overlay, run from inside the Docker network per its own README — 6/6 passing, confirming the API actually boots and resolves `ProxyModule` through the new package alias at runtime, not just at compile time. The same pre-existing, already-diagnosed-as-unrelated ~133s delay on `02-verify-local-email` (traced in the `proxy-fleet/14` PR to a dead external `CATCH_ALL_HTTP_PROXY_URL`) reappeared again, consistent with the two prior PRs — not investigated further.

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

**Final legacy-path search** (`rg -n "src/proxy|proxy/src|\.\./.*proxy" src scripts docker`): zero matches.

**Alias-resolution evidence**: a clean `corepack pnpm build` (436 files, 0 issues) with compiled output confirmed under `libs/modules/proxy/src/*.js`, no top-level `proxy/` directory in `dist`; both `lead-email-finder-api.module.ts` and `smtp.module.ts` import `ProxyModule` from `@tuposoft/lead-email-finder/modules/proxy` and resolve it correctly at runtime (proven by the live Bruno regression below, which requires the API to actually boot).

**Focused test counts**: `src/libs/modules/proxy/src` + `email-verifier/smtp` (`--runInBand`): 12 suites / 61 tests, all passing.

**Bruno statuses** (redacted — no credentials recorded):
- `bruno/proxy-registry` (plain base stack): 8/8 requests passing.
- `bruno/smtp-dev` (smtp-dev overlay, run from inside `lef_default`): 6/6 requests passing.

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
