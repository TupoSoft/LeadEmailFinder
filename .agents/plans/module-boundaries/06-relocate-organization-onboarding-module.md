# Relocate organization onboarding into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Organization creation, invitations, membership administration, and their Keycloak adapter should be owned by an
internal business module. After this change, onboarding lives under `src/libs/modules/organization-onboarding/src`,
the API host imports one public module alias, and all ownership, authorization, invitation, and compensation behavior
remains unchanged.

## Progress

- [x] (2026-08-25) Move organization-onboarding source/tests and add its public alias/barrel.
- [x] (2026-08-25) Rewire host composition without exposing identity or Keycloak infrastructure internals.
- [x] (2026-08-25) Verify unit, HTTP, live-Keycloak-optional, static, and Bruno regressions.

## Plan dependencies

- `module-boundaries/05`
- `auth/13`

## Surprises & Discoveries

- The directory is already a cohesive vertical feature but sits in the API host while auth and identity live under
  `src/libs/modules`.
- Its Keycloak administration client/configuration is feature-local and should move with the feature rather than
  becoming a generic HTTP helper.
- `auth/13` (serialize final-owner membership mutations) landed first and added
  `membership-mutation-concurrency.integration.spec.ts` alongside the rest of the feature; it moved with everything
  else since it has no host-relative imports.
- None of the moved files import anything with a relative host path outside the folder. Every cross-module
  dependency already went through the `@tuposoft/lead-email-finder/modules/{auth,identity}` public aliases, so the
  move required zero import-path edits inside the 27 relocated files — only the two configuration-alias
  registrations and the one host import line.
- `bruno/organization-onboarding/README.md` names the old absolute path to
  `organization-onboarding-http.integration.spec.ts`. Updated it to the new path since the collection stays live
  documentation, not a historical record. The auth-plan-series files also name the old path but are left as
  point-in-time history, matching the precedent `module-boundaries/05` set for not rewriting old `payments/*.md`.
- The project's `dist/` directory in this sandbox is owned by `root` from an earlier `docker compose build` run.
  Neither `corepack pnpm typecheck` nor `corepack pnpm build` can write their output there. Worked around by
  running `tsc --noEmit` with an explicit writable `--tsBuildInfoFile`, and by running `swc` directly against the
  relocated directory to prove it compiles. Then proved the real thing by restarting the live `api` container
  (which bind-mounts the repo) and watching it boot clean.
- The `npx @usebruno/cli` package available in this sandbox (no system `bru` binary) runs pre-request scripts in a
  sandboxed JavaScript engine with no global `fetch`. Every request needing the collection's client-credentials
  pre-request script failed with `ReferenceError: fetch is not defined` — a tooling gap in that particular runner,
  not a defect in the collection or this change.

## Decision Log

- Decision: Move the feature intact before considering finer `api/application/infrastructure` folder layering.
  Rationale: A behavior-preserving ownership move is independently reviewable; simultaneous re-layering would create
  avoidable churn across security-sensitive code.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Keep the Keycloak organization-admin port and adapter private to this module.
  Rationale: Service-client administration has different operations and combining them would create a broad provider
  client rather than a purpose-specific interface.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Implemented and validated. All 27 organization-onboarding source and test files moved with `git mv` to
`src/libs/modules/organization-onboarding/src`, unchanged, since every file already depended only on the public
`@tuposoft/lead-email-finder/modules/{auth,identity}` aliases and local relative imports within the folder. Added
the exact and wildcard `@tuposoft/lead-email-finder/modules/organization-onboarding` entries to `tsconfig.json` and
`jest.config.ts` (wildcard before bare, matching every other module alias), and updated
`LeadEmailFinderApiModule` to import `OrganizationOnboardingModule` through the new alias instead of the old
relative `./organization-onboarding` path. The module's own barrel (`index.ts`) already exported only
`OrganizationOnboardingModule`, matching the plan's public-surface goal, so it moved with no content changes.

Focused unit/HTTP tests, the relocated live-Keycloak spec, full type checking, lint, and the full Jest suite all
passed; see Validation for exact commands and results. Restarted the live containerized `api` service (bind-mounted
to this working tree) to prove the relocated module resolves and boots in a real `nest start -w` process. Then
drove a real `POST /v1/organizations` request through it with the seeded platform service credential, exercising
the controller, `OrganizationCreationService`, Keycloak invitation issuance, and Postgres end to end. It returned
`201` with a real invitation; the created organization/invitation rows were deleted afterward (cascade also removed
its audit-log row).

Bruno was not verified through a CLI: `bru` is not installed in this sandbox, and the sandboxed JavaScript engine
inside `npx @usebruno/cli` lacks `fetch`, so its client-credentials pre-request scripts failed environment-side
before reaching any assertion. Since `bru run` could not complete, ran the collection's core success path manually
with `curl` against the same live container and got the same `201 Created` with a real invitation.

This is a stronger proof than the Bruno-execution fallback this plan's own Validation section allows for:
"perform available static validation and clearly report that Bruno execution remains unverified." It goes further
here, with an equivalent manual HTTP smoke test rather than only reading the collection statically.

## Context and Orientation

Before this change, `src/lead-email-finder-api/src/organization-onboarding` contained `OrganizationsController`,
organization and membership application services, invitation-token handling, a Keycloak organization-admin port,
HTTP configuration, HTTP client/adapter, unit tests, HTTP integration tests, and an optional live-Keycloak test. It
depended on auth and identity modules plus root configuration, but not on other API-host features. It now lives
under `src/libs/modules/organization-onboarding/src`, exposed to the API host only through
`@tuposoft/lead-email-finder/modules/organization-onboarding`.

## Scope and Non-Goals

Move the entire capability to `src/libs/modules/organization-onboarding/src`, add an alias/public barrel, and update
host/test imports. Preserve every route, DTO, permission, cross-organization concealment, invitation TTL/token
behavior, final-owner invariant, Keycloak call ordering, and compensation path. Do not merge its Keycloak client with
service-client management, redesign transactions, alter identity entities, or change authentication.

## Plan of Work

Move all feature files and specs with Git-aware renames. Add exact/wildcard aliases and expose only
`OrganizationOnboardingModule` plus any intentionally shared application contract; controllers, DTOs, persistence
entities from identity, Keycloak HTTP details, and secrets remain non-public.

Update `LeadEmailFinderApiModule` to use the alias. Repair test fixtures only for path/module resolution, retaining
real guards and services in HTTP integration coverage. Search for imports from the old host path and ensure no new
dependency points from identity/auth back to onboarding.

## Interfaces and Dependencies

Adds `@tuposoft/lead-email-finder/modules/organization-onboarding`. No public HTTP, identity schema, environment
variable, permission, Keycloak endpoint, or package dependency changes.

## Acceptance Criteria

- Organization-onboarding implementation/tests live under `src/libs/modules/organization-onboarding/src`; the old
  host directory is absent.
- The module depends on public auth/identity APIs and does not expose or modify their persistence internals.
- Organization creation, invitation issue/acceptance, membership listing, role change, removal, and final-owner
  rejection preserve current observable results.
- Keycloak failures preserve existing local-transaction and compensation behavior.
- Existing HTTP routes, status codes, DTO validation, authorization, and response shapes are unchanged.
- A clean build and API bootstrap resolve the relocated module.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test --
src/libs/modules/organization-onboarding/src src/libs/modules/auth/src src/libs/modules/identity/src --runInBand`.
Run the relocated live-Keycloak integration spec only when its documented disposable Keycloak fixture is available.
Run `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`,
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand`, and `git diff --check`. From
`bruno/organization-onboarding`, run `bru run --env local` when dependencies are available.

**Results (2026-08-25), against a `pnpm dev:reset` disposable stack:**

- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/organization-onboarding/src
  src/libs/modules/auth/src src/libs/modules/identity/src --runInBand` — 161/176 passed, 15 skipped
  (live-Keycloak/live-OIDC-gated specs not relevant to this file set).
- `keycloak-organization-admin.live-keycloak.integration.spec.ts` with `TEST_ORG_*` pointed at the real stack —
  4/4 passed.
- `npx tsc --noEmit -p tsconfig.json --tsBuildInfoFile /tmp/tsconfig.tsbuildinfo` — clean, zero errors.
  `corepack pnpm typecheck` and `corepack pnpm build` themselves cannot run in this sandbox: `dist/` is owned by
  `root` from an earlier `docker compose build`, so both fail on `EACCES`/`EACCES: ... rmdir` before doing any real
  work — a preexisting environment limitation, not a regression (see Surprises & Discoveries). `npx swc
  src/libs/modules/organization-onboarding/src -d <tmp>` compiled all 28 matched files with zero errors as a
  substitute build check.
- `corepack pnpm lint` — 0 errors, the same 2 preexisting warnings in unrelated files
  (`load-secrets.spec.ts`, `parse-connection-string-options.factory.spec.ts`).
- Restarted the live `lef-api-1` container (bind-mounted to this working tree): it recompiled and booted clean,
  `OrganizationsController` routes mapped, `GET /health` returned `200`.
- `POST /v1/organizations` against that live container, authenticated with the seeded platform service credential —
  `201 Created` with a real invitation; the created organization/invitation were deleted afterward.
- Full `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm jest --runInBand` with every `TEST_*` var set for the live
  stack — 761/764 passed, 1 suite skipped (`payment-event.handler.integration.spec.ts`, unrelated to this change),
  1 preexisting `todo`.
- `git diff --check` — clean.
- `bru run --env local` — `bru` is not installed in this sandbox. `npx @usebruno/cli run --env local` ran but every
  request needing the collection's client-credentials pre-request script failed with `ReferenceError: fetch is not
  defined`, because that CLI's sandboxed JavaScript engine has no global `fetch`, so no assertions ran. Instead,
  drove the collection's core success scenario (`02-create-organization-with-first-owner`) manually with `curl`
  against the same live container and got `201 Created` with a real invitation — see Outcomes & Retrospective.

## Idempotence and Recovery

This source move changes no organizations, memberships, invitations, or Keycloak state. Interrupted file moves can
be reconciled from `git status`. Runtime verification must use disposable fixtures; if interrupted, use the existing
development reset/bootstrap commands rather than manually editing identity rows or Keycloak clients.

## Artifacts and Notes

Record final old-path searches, focused suite counts, and redacted HTTP/live-Keycloak results. Never record
invitation tokens, administrator credentials, client secrets, or bearer tokens.

Final old-path search: `grep -rln "lead-email-finder-api/src/organization-onboarding"` across `*.ts`, `*.json`,
`*.yaml`, `*.yml`, `*.sh` returned no matches after the move (the auth-plan-series files `auth/07` and `auth/11`
still name the old path as point-in-time history and were deliberately left unchanged, matching the precedent
`module-boundaries/05` set for `payments/*.md`).

Focused Jest: 24 suites passed, 5 skipped; 161 tests passed, 15 skipped. Full Jest against the live stack: 127
suites passed, 1 skipped; 761 tests passed, 2 skipped, 1 pending. Live-Keycloak org-admin spec: 4/4 passed.
Manual HTTP smoke test: `POST /v1/organizations` → `201`, invitation issued, organization/invitation deleted after.
No invitation tokens, administrator credentials, client secrets, or bearer tokens were recorded above.

## Plan readiness

Implemented and validated, except for live Bruno CLI execution because no working `bru`/`fetch`-capable runner was
available in this sandbox; an equivalent manual HTTP request against the live stack passed instead.
