# Relocate organization onboarding into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Organization creation, invitations, membership administration, and their Keycloak adapter should be owned by an
internal business module. After this change, onboarding lives under `src/libs/modules/organization-onboarding/src`,
the API host imports one public module alias, and all ownership, authorization, invitation, and compensation behavior
remains unchanged.

## Progress

- [ ] (2026-08-21) Move organization-onboarding source/tests and add its public alias/barrel.
- [ ] (2026-08-21) Rewire host composition without exposing identity or Keycloak infrastructure internals.
- [ ] (2026-08-21) Verify unit, HTTP, live-Keycloak-optional, static, and Bruno regressions.

## Plan dependencies

- `module-boundaries/05`
- `auth/13`

## Surprises & Discoveries

- The directory is already a cohesive vertical feature but sits in the API host while auth and identity live under
  `src/libs/modules`.
- Its Keycloak administration client/configuration is feature-local and should move with the feature rather than
  becoming a generic HTTP helper.

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

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/organization-onboarding` contains `OrganizationsController`, organization and
membership application services, invitation-token handling, a Keycloak organization-admin port, HTTP configuration,
HTTP client/adapter, unit tests, HTTP integration tests, and an optional live-Keycloak test. It depends on auth and
identity modules plus root configuration, but not on other API-host features.

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

## Idempotence and Recovery

This source move changes no organizations, memberships, invitations, or Keycloak state. Interrupted file moves can
be reconciled from `git status`. Runtime verification must use disposable fixtures; if interrupted, use the existing
development reset/bootstrap commands rather than manually editing identity rows or Keycloak clients.

## Artifacts and Notes

Record final old-path searches, focused suite counts, and redacted HTTP/live-Keycloak results. Never record
invitation tokens, administrator credentials, client secrets, or bearer tokens.

## Plan readiness

Ready to implement.
