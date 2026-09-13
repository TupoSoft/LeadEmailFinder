# Remove Resolution Aliases for the Deleted API-Key Library

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

TypeScript and Jest should advertise only libraries that exist. After this change, neither resolver maps
`@tuposoft/lead-email-finder/key` or nested imports to the deleted `src/libs/key` directory. Existing Keycloak transport
imports still resolve correctly, and the architecture gate continues to prohibit the retired technical alias in
application and domain code.

## Progress

- [x] (2026-09-13) Remove the deleted library's TypeScript and Jest mappings and its obsolete ordering comment.
- [x] (2026-09-13) Verify current Keycloak and authentication resolution with existing focused tests: 92 tests passed.
- [x] (2026-09-13) Run architecture, type, build, and prose checks, review scope, and record results.

## Plan dependencies

- `auth/09`

## Surprises & Discoveries

The implementation inventory confirmed that `src/libs/key` is absent and no TypeScript source import uses the
retired alias. The architecture guide, scanner, and tests intentionally retain their prohibition. Issue #559 was
assigned to `KyryloKupin` and moved to `In Progress` on Project 9 before implementation on 2026-09-13.

## Decision Log

- Decision: Remove only resolution mappings for the absent `key` library and the comment required by those mappings.
  Rationale: API-key authentication is already removed; advertising a nonexistent directory is stale build metadata.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Retain the architecture guide, scanner, and tests that prohibit the retired alias in application and
  domain code.
  Rationale: A prohibition prevents reintroduction and does not make an alias resolvable. Removing resolver entries
  does not justify weakening the architecture policy.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Use existing resolution, authentication, and architecture checks without adding behavior tests.
  Rationale: The removed mappings point to absent files and have no current source consumers. Existing tests exercise
  the nearby Keycloak imports and preserved rules directly.
  Date/Author: 2026-09-07, Codex planning.

## Outcomes & Retrospective

The bare and wildcard mappings for the deleted API-key library have been removed from TypeScript and Jest,
together with the obsolete Jest ordering comment. Both Keycloak mappings and the general wildcard ordering
guidance remain unchanged. Existing focused tests, the architecture gate, type checking, and the build passed.
The HTTP contract and architecture prohibition remain unchanged; no new behavior tests were needed.

## Context and Orientation

The completed `auth/09` plan removed static API-key authentication. The current auth module authenticates bearer
tokens through OIDC, and the host composes that authenticator with browser sessions. `src/libs/key` no longer exists.
However, `tsconfig.json` still defines its bare and wildcard aliases, and `jest.config.ts` maps both forms to that
nonexistent directory.

Jest's mapping expressions lack start and end anchors. Its comment requires the bare `keycloak-admin-http` mapping to
precede `key` because the shorter expression would otherwise match the longer name. Deleting the `key` mapping
removes that hazard. The general rule placing wildcard mappings before their bare counterparts still applies.

`src/libs/keycloak-admin-http` is an active technical library implementing shared Keycloak Admin HTTP transport.
Its public imports appear in organization onboarding and service-client management. Separately,
`src/libs/modules/README.md`, `scripts/architecture/module-architecture.ts`, and
`scripts/architecture/module-architecture.spec.ts` prohibit technical `key` imports inside application and domain
code. Those policy references intentionally remain after this cleanup.

## Scope and Non-Goals

This pull request changes only `tsconfig.json`, `jest.config.ts`, and this plan's implementation record. It removes
the retired library's resolver entries and one obsolete comment. It changes no authentication flow, credentials,
controller, schema, provider, package, frontend, or current import boundary. It retains all Keycloak mappings,
all other resolver ordering, and the architecture prohibition of the old alias. REST-client environments and
deployment descriptors have separate retirement plans.

## Plan of Work

Before implementation, confirm that `src/libs/key` is absent and no current source import uses its exact bare alias
or nested paths. Read `src/libs/modules/README.md` to distinguish prohibited technical imports from supported mappings.
Assign this plan's synced issue, found by its `legacy-retirement/04` marker, and move its Project 9 status to
`In Progress` using the root `AGENTS.md` workflow. Report any unavailable project-scope write separately while
continuing authorized repository work.

Remove the `@tuposoft/lead-email-finder/key` and `@tuposoft/lead-email-finder/key/*` entries from `tsconfig.json`.
Remove the corresponding bare and wildcard entries from `jest.config.ts`, together with the comment requiring
`keycloak-admin-http` to precede `key`. Keep both `keycloak-admin-http` mappings and their current order. Keep the
broader explanation about wildcard entries preceding their bare counterparts.

Inspect the architecture guide, scanner, and tests to confirm the old alias remains prohibited. Do not modify them
merely to eliminate textual references to `key`. Run the existing Keycloak transport, organization onboarding,
service-client management, auth, and architecture tests below to prove that deleting the shorter resolver prefix has
not affected active imports. Add no replacement library, fallback mapping, alias assertion test, or adapter.

## Interfaces and Dependencies

The only interface change is removal of unsupported TypeScript and Jest mappings to nonexistent files. No supported
business-module barrel or runtime interface changes. `auth/09` is complete in this checkout and establishes that raw
API keys already have no implementation. This cleanup maps to one independently reviewable pull request and makes
resolver configuration accurately describe the supported library tree.

## Acceptance Criteria

- `src/libs/key` remains absent. Neither `tsconfig.json` nor `jest.config.ts` maps its bare alias or nested paths.
- No current production source import targets the retired alias. Existing Keycloak imports resolve through the
  retained `keycloak-admin-http` mappings.
- The obsolete ordering comment is removed; the general wildcard ordering guidance remains accurate.
- The canonical guide, scanner, and tests still prohibit the retired technical alias in application and domain code.
  The architecture baseline does not grow or require suppression.
- Existing focused tests, the architecture gate, type checking, and build pass. Runtime authentication, rejection,
  authorization, concurrency, idempotency, and HTTP contracts are unchanged. No new behavior tests are introduced.
- The final diff contains only the two resolver files and this plan's implementation record.

## Validation

Run these commands from the repository root:

```bash
test ! -e src/libs/key
rg -n 'src/libs/key/src|lead-email-finder/key(["/])' tsconfig.json jest.config.ts
rg -n 'lead-email-finder/key(["\x27/])' src
rg -n 'lead-email-finder/keycloak-admin-http' tsconfig.json jest.config.ts src/libs/modules/organization-onboarding src/libs/modules/service-client-management
rg -n 'lead-email-finder/key' src/libs/modules/README.md scripts/architecture/module-architecture.ts scripts/architecture/module-architecture.spec.ts
corepack pnpm test -- src/libs/keycloak-admin-http/src/keycloak-admin-http.module.spec.ts src/libs/modules/organization-onboarding/src/infrastructure/keycloak-organization-admin-client.service.spec.ts src/libs/modules/service-client-management/src/infrastructure/keycloak/keycloak-service-client-admin-client.service.spec.ts src/libs/modules/auth/src/application/credential-extractor.spec.ts src/lead-email-finder-api/src/authentication/authentication-composition.module.spec.ts scripts/architecture/module-architecture.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm build
corepack pnpm docs:lint -- .agents/plans/legacy-retirement/04-remove-api-key-resolution-aliases.md
git diff --check
git diff --stat
```

The first two `rg` commands must have no matches; their exit code `1` is the expected negative-search result. The
next searches must retain active Keycloak references and the explicit architecture prohibition. Existing tests use
mocked provider transport or inspect composition; passing them does not claim a live Keycloak session was exercised.
No additional provider or database runtime validation is necessary for mappings to absent files. Review the diff for
SOLID and module-boundary violations; this change introduces no service or dependency direction.

Bruno: not applicable because removing unused resolver mappings changes no externally observable HTTP behavior.
Retain existing authentication collections and tests without alteration.

## Idempotence and Recovery

Repeated searches and validation are safe and require no credentials or stored-data reset. The cleanup creates no
resource and alters no schema. If an unexpected active import appears, investigate it before removing any additional
code; this plan does not authorize deleting its consumer. Restore only this pull request's resolver edits when
reverting, preserving unrelated user changes. Do not recreate API-key authentication to satisfy a stale import.

## Artifacts and Notes

Validation on 2026-09-13 used the isolated branch `kk/559-remove-api-key-aliases`, based on master commit `fdb855a`.
The existing installation of dependencies was reused through a temporary `node_modules` link. Its lockfile matches
the implementation checkout. The focused test command above ran with `TMPDIR=/tmp TMP=/tmp TEMP=/tmp` and
`NODE_PATH=/home/kyrylo/WebstormProjects/LeadEmailFinder/node_modules`.

- The deleted directory remains absent. Searches for the retired resolver entries and TypeScript source imports
  returned no matches; both Keycloak mappings and their active consumers remain present.
- The canonical module guide, architecture scanner, and architecture tests retain the retired alias prohibition.
- All six focused test suites passed: 92 tests total. Provider transport was mocked; no live Keycloak session was
  exercised.
- `corepack pnpm architecture:check` passed with nine modules and zero violations.
- `corepack pnpm typecheck` passed. `corepack pnpm build` passed with zero type issues and 709 compiled files.
- `corepack pnpm docs:lint -- .agents/plans/legacy-retirement/04-remove-api-key-resolution-aliases.md` passed.
- `git -c lfs.storage=/tmp/lef-559-lfs diff --check` passed. The temporary cache avoids writes to the main
  checkout's read-only Git metadata.
- The final tracked diff contains only the two resolver files and this plan. Independent review found no SOLID
  or module-boundary violations and no material architectural trade-offs.

The retained architecture references are intentional. The pull request must include `Closes #559` and follow
the assignment and title rules in `AGENTS.md`.

## Plan readiness

Ready to implement
