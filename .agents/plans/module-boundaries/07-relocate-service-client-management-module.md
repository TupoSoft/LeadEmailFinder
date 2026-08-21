# Relocate service-client management into the standard module hierarchy

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Organization-owned machine-client provisioning should be a self-contained internal module rather than an API-host
folder. After this change, service-client management lives under `src/libs/modules/service-client-management/src`,
the host composes it through one public alias, and client creation, listing, rotation, disablement, deletion, and
Keycloak recovery behavior remain unchanged.

## Progress

- [ ] (2026-08-21) Move service-client source/tests and add its public alias/barrel.
- [ ] (2026-08-21) Rewire host composition while retaining narrow Keycloak and identity dependencies.
- [ ] (2026-08-21) Verify unit, HTTP, live-Keycloak-optional, static, and Bruno regressions.

## Plan dependencies

- `module-boundaries/06`
- `service-client-hardening/01`

## Surprises & Discoveries

- The feature already has a narrow `KeycloakServiceClientAdmin` port and adapter, but its source location differs
  from the auth and identity modules that define its security boundary.
- Its Keycloak HTTP configuration/client resembles organization onboarding structurally, but the two capabilities
  expose different provider operations and recovery rules.

## Decision Log

- Decision: Relocate the feature intact and keep its Keycloak service-client port private.
  Rationale: Combining provider clients during a path move would broaden interfaces and mix independent recovery
  semantics.
  Date/Author: 2026-08-21, Codex planning.
- Decision: Publish only the Nest module unless a current external consumer proves another export is necessary.
  Rationale: The API host needs composition, not access to application services or provider internals.
  Date/Author: 2026-08-21, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/service-client-management` owns `ServiceClientsController`, five lifecycle services,
DTOs, a Keycloak provider port, HTTP configuration/client/adapter, focused unit tests, HTTP integration coverage, and
an optional live-Keycloak flow. It imports auth and identity modules. Local `ServiceCredential` state is authoritative
for authorization after provider provisioning.

## Scope and Non-Goals

Move this capability to `src/libs/modules/service-client-management/src`, add an alias/public barrel, and update the
root host and test imports. Preserve routes, permissions, organization concealment, secret-return rules, deterministic
provider names, provisioning/compensation ordering, credential status transitions, rotation, disablement, and delete
semantics. Do not merge it with auth, identity, or organization onboarding; do not change Keycloak or schema behavior.

## Plan of Work

Move all source and specs with Git-aware renames. Add exact/wildcard TypeScript aliases following existing module
conventions. Create a restrictive `index.ts` that exports `ServiceClientManagementModule`; add another export only
when a current compile-time consumer requires a stable application contract.

Update `LeadEmailFinderApiModule` to import the alias and repair tests only for path/module resolution. Verify the
dependency direction remains service-client management to public auth/identity APIs, never the reverse. Search for
old paths and deep imports, and confirm configuration providers retain token identity and secret handling.

## Interfaces and Dependencies

Adds `@tuposoft/lead-email-finder/modules/service-client-management`. No HTTP route, DTO, permission, identity entity,
environment variable, Keycloak endpoint, or package dependency changes.

## Acceptance Criteria

- Service-client implementation/tests live under `src/libs/modules/service-client-management/src`; the old host
  directory is absent.
- The API host imports only the public module alias and no Keycloak implementation details.
- Create/list/rotate/disable/delete preserve current authorization, cross-organization `404`, status transitions,
  and response schemas.
- Secrets appear only on creation and explicit rotation, exactly as before.
- Provider failures and local persistence failures preserve established compensation and retry behavior.
- A clean build and API bootstrap resolve the relocated module.

## Validation

Run `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test --
src/libs/modules/service-client-management/src src/libs/modules/auth/src src/libs/modules/identity/src --runInBand`.
Run the relocated live-Keycloak integration test only with its documented disposable fixture. Run
`corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm lint`,
`TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- --runInBand`, and `git diff --check`. From
`bruno/service-client-management`, run `bru run --env local` when available.

## Idempotence and Recovery

Moving source changes no local credentials or Keycloak clients. Reconcile an interrupted move from `git status` and
rerun focused tests. Runtime verification uses disposable clients; use established cleanup/bootstrap behavior after
an interrupted live run instead of manually changing credential rows.

## Artifacts and Notes

Record final old-path searches, focused suite counts, and redacted HTTP/live-Keycloak statuses. Never record client
secrets, admin credentials, provider-internal identifiers returned only internally, or bearer tokens.

## Plan readiness

Ready to implement.
