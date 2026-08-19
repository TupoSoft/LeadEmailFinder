# Add the unified development reset workflow

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give developers one safe, repeatable way to recreate all disposable application and identity state after an incompatible schema or realm change. The workflow ends with a seeded organization and a successful authenticated API request.

## Progress

- [x] Add the targeted confirmation-based reset command.
- [x] Add deterministic application and Keycloak reseeding.
- [x] Add the final authenticated smoke test and documentation.

## Plan dependencies

- `auth/09`

## Surprises & Discoveries

- No product HTTP path can produce a `platform_admin` membership: `KeycloakOrganizationAdminClient.assignRealmRole`'s type signature is literally `'owner' | 'admin'`, `IssueInvitationDto`/`ChangeMembershipRoleDto` both validate role against `['owner','admin','member']`, and `POST /v1/organizations` always issues an `owner` invitation. A genuine human platform-operator identity has never existed in this codebase in any form before this plan — it's seeded directly (Keycloak user + realm-role assignment + local `ExternalIdentity`/`OrganizationMembership` rows via raw SQL), mirroring PR 9's own precedent for bypassing product flows that structurally can't reach a given state.
- The customer-org M2M client fixture is blocked from the self-service `POST /v1/organizations/:organizationId/service-clients` route the same way: that route requires a real `human_session` BFF cookie from an owner/admin, and `bff-session-flow.live-keycloak.integration.spec.ts` already proves a scripted login can't complete for owner/admin/platform_admin (all three carry the `mfa_required` composite role from `provisioning.ts`, and a freshly-created user has no OTP credential enrolled, so the realm's conditional-OTP flow structurally dead-ends). Seeded the same bypass way as the platform credential, with permissions fixed at `MEMBER_PERMISSIONS` (`verification:run`/`verification:read`) rather than anything broader.
- **The customer-fixture seeding step, run for real against the actual reset stack (not a host-run workaround), surfaced a genuine, previously-undiagnosed root cause behind every container-networking limitation this whole roadmap has hit since PR 7**: `OIDC_ISSUER_URL` is read directly, unconditionally, by both `JoseOidcTokenVerifier` (server-side JWKS fetch + issuer-claim pinning) and `KeycloakAdminHttpConfiguration` (server-side Admin REST API base URL) — but it's also the *browser*-facing redirect target `KeycloakOAuthClient` builds from the same value. The host-facing value (`http://localhost:58080/...`) is correct for the browser and for a token's own `iss` claim (Keycloak issues tokens carrying whatever host the requester used), but is unreachable from inside the `api` container's own network namespace, so the container could never verify an incoming token or call the Admin API against its own realm — this was previously worked around per-collection with host-run Bruno instructions (PR 7/8/9), never fixed at the root. Since this plan's own acceptance criteria require the reset workflow's smoke test to succeed against the *actual* recreated stack (not a manually-run host instance), fixed it properly: `OIDC_JWKS_URI` and `KEYCLOAK_ADMIN_API_BASE_URL` are new, optional env vars that let the container reach Keycloak via its container-internal hostname for these two purposes specifically, independently of the host-facing `OIDC_ISSUER_URL` used everywhere else. Verified directly: the same `POST /v1/organizations` call that previously 401'd against the container now succeeds, and invitation acceptance (previously 500, the exact class of failure `bruno/organization-onboarding/README.md` already documented) now succeeds too. This doesn't retroactively rewrite the already-merged PR 7/8/9 Bruno READMEs' host-run instructions (out of this plan's scope, and those instructions still work), but it means the containerized stack now genuinely "just works" for OAuth-authenticated traffic, which is what this plan's reset workflow itself depends on.
- `docker compose -p LEF ...` rejects the CLI `-p`/`--project-name` flag outright ("invalid project name... must consist only of lowercase alphanumeric characters") even though the identical value in the compose file's own `name: LEF` field is silently accepted and lowercased. Fixed by using the lowercase `lef` for the actual `-p` flag while keeping `LEF` (matching the YAML's declared, human-readable name) as what a developer types to confirm.
- `dash`'s (this system's default `/bin/sh`) `printf` builtin treats a format string starting with `--` as an option marker and errors (`printf: Illegal option --`) rather than treating it as literal text — caught by actually running the confirmation-rejection path, not just reading the script. Avoided by rewording the one affected message rather than fighting `printf`'s option-parsing.
- The volume-count safety check needed a "0 is also acceptable" branch: a truly fresh clone has none of the three named volumes yet, and requiring exactly 3 would incorrectly abort the very first run.

## Decision Log

- Decision: Reset PostgreSQL, Keycloak PostgreSQL, Redis/BullMQ, and development S3 together.
  Rationale: Cross-service fixtures contain shared identifiers and are safer when recreated as one coherent set.
  Date/Author: 2026-08-14, project planning.
- Decision: Require confirmation before volume deletion.
  Rationale: Even disposable data should not be removed accidentally or through an overly broad command.
  Date/Author: 2026-08-14, project planning.
- Decision: Confirmation is a value-gated `--confirm-project=LEF` flag (or an interactive prompt typing the same string), not a bare boolean `--yes`/`--force`. A wrong value hard-errors immediately and never falls through to the interactive prompt.
  Rationale: The acceptance criteria specifically required the non-interactive flag to carry the Compose project name itself, not just generic consent — this makes accidental reuse against the wrong project structurally harder than a boolean flag would.
  Date/Author: 2026-08-19, implementation.
- Decision: Volume deletion verifies an explicit 3-name allowlist (`lef_postgres-data`, `lef_redis-data`, `lef_keycloak-postgres-data`, or 0 on a first-ever run) via `docker volume ls --filter` before calling `docker volume rm` on exactly those literal names — never `docker compose down --volumes`.
  Rationale: `--volumes` removes every volume declared in the compose file unconditionally with no observable signal if the runtime set has drifted from what's declared; an explicit pre-verified allowlist means the deletion set is always exactly what was printed to the user and independently confirmed to exist.
  Date/Author: 2026-08-19, implementation.
- Decision: The platform-operator and customer-fixture seeding scripts live under `scripts/keycloak/`, following the same library (`platform-operator.ts`/`customer-fixture.ts`) + thin CLI entry point (`bootstrap-operator.ts`/`seed-customer-fixture.ts`) split PR 9 established, kept as two separate scripts rather than one.
  Rationale: They have different preconditions — the platform operator needs only Keycloak+Postgres (same as `bootstrap-credential.ts`), the customer fixture needs the running `api` container answering HTTP — so collapsing them would force the earlier one to wait on a precondition it doesn't need.
  Date/Author: 2026-08-19, implementation.
- Decision: Fixed the root cause of the container-to-Keycloak networking gap for OAuth token verification and Admin API calls (`OIDC_JWKS_URI`, `KEYCLOAK_ADMIN_API_BASE_URL`) rather than adding another host-run workaround for this plan's own smoke test.
  Rationale: This plan's acceptance criteria require the smoke test to pass against the actual recreated stack, and "one safe, repeatable way" cannot mean "manually run the API on the host afterward." Both new env vars are optional and additive — nothing breaks where they're unset.
  Date/Author: 2026-08-19, implementation.
- Decision: `docker/scripts/dev-reset.sh`'s own logic (confirmation flag/prompt handling, the volume allowlist check) is validated by direct manual invocation (wrong flag value, interactive cancellation, a real end-to-end run) rather than a new shell-testing framework.
  Rationale: No `bats`/`shunit2`/similar tooling exists anywhere in this repo; introducing one for a single script is disproportionate. `docker compose -f docker/compose.yaml config -q` remains available as a static check.
  Date/Author: 2026-08-19, implementation.

## Outcomes & Retrospective

All acceptance criteria implemented and verified. `pnpm typecheck`/`pnpm lint` clean. Full jest suite (116 suites / 668 tests, 1 todo, 0 skipped) passed with every live gate active simultaneously across 6 dedicated test databases (one pre-existing, unrelated flaky crypto-tampering test — `session-encryptor.spec.ts`, untouched by this plan — failed once under parallel workers and passed reliably both in isolation and under `--runInBand`).

Live validation: ran `pnpm dev:reset -- --confirm-project=LEF` for real, from a running stack, end to end — printed targets, deleted exactly the three expected named volumes, rebuilt and started every service, waited on every healthcheck, reprovisioned Keycloak, seeded the platform credential/platform operator/customer organization+owner+credits+M2M client, ran the existing Keycloak-realm smoke test, and ran the new authenticated API smoke test (`GET /credits/:organizationId` for the seeded customer org returning `balance: 1000`) — all in one pass with no manual intervention. Separately verified: an invalid `--confirm-project` value hard-errors with zero destructive action taken; declining the interactive prompt (`not-lef`) aborts with no changes and the three volumes still present; the whole customer-fixture flow (organization creation, invitation acceptance, credit balance, M2M client provisioning) succeeds against the *containerized* stack now that `OIDC_JWKS_URI`/`KEYCLOAK_ADMIN_API_BASE_URL` are set, with no host-run workaround needed for this plan's own scripts.

## Context and Orientation

The project uses TypeORM synchronization and local Compose services. The auth roadmap adds a second PostgreSQL database for Keycloak and shared identity/application fixtures. There is no production data or migration history to preserve.

## Scope and Non-Goals

Add one repository command that confirms its action, targets only the named LeadEmailFinder development Compose project and volumes, recreates all relevant services, waits for readiness, provisions Keycloak, seeds application data, and runs an authenticated smoke test. Do not support selective preservation, production recovery, or migration execution.

## Plan of Work

Implement a small shell entrypoint under `docker/scripts` with explicit Compose project and volume names rather than broad globs. Validate the target before removal and require an interactive confirmation unless an explicit development-only confirmation flag is passed by CI. Start infrastructure in dependency order, wait on existing health checks, run Keycloak provisioning and application seeds, then obtain a Client Credentials token and call a protected endpoint.

## Interfaces and Dependencies

Add a package script such as `dev:reset` that delegates to the scoped Docker script. Seed one platform operator, one customer organization, one human member, an organization credit balance, and one M2M client. This plan depends on PR 9 and becomes the standard ongoing development workflow.

## Acceptance Criteria

- The command targets only explicitly named LeadEmailFinder development containers and volumes.
- It prints the targets and requests confirmation before deletion.
- A documented non-interactive flag is accepted only with the development Compose project name.
- It waits for PostgreSQL, Redis, S3, Keycloak, and API health before dependent steps.
- It synchronizes the schema, provisions Keycloak, and loads deterministic fixtures without migrations.
- Generated secrets are displayed once or written only to ignored development files.
- The final smoke test obtains an OAuth token and successfully calls a protected endpoint.
- Repeating the reset from a clean state produces the same logical fixtures and a healthy stack.

## Validation

Run Compose configuration validation, a confirmation-cancellation test, an invalid-target safety test, one full reset/reseed exercise, all service health checks, the authenticated smoke test, and project static checks.

## Idempotence and Recovery

Cancellation performs no deletion. A failed reset can be rerun because all targets are disposable and provisioning/seeding are idempotent. The script must never infer or recursively delete an unresolved path, workspace root, home directory, or unnamed volume.

## Artifacts and Notes

Record the exact named resources, sanitized seed summary, health results, and smoke-test response.

## Plan readiness

Ready to implement.
