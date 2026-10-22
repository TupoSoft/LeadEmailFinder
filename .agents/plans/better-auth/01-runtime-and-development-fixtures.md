# Add the Better Auth Runtime and Disposable Development Fixtures

This is a living document maintained according to `.agents/PLANS.md`. It describes one implementation pull request.

## Purpose / Big Picture

Planned conventional commit and pull-request subject: `feat(auth): add Better Auth runtime and development fixtures`.

A developer can initialize the pinned Better Auth library against disposable PostgreSQL data, deliver a test authentication message to the checkout's Mailpit service, and seed native human identities without passwords. Existing Keycloak login and machine authentication continue working after this pull request. Later plans consume one tested runtime instead of creating competing instances, schemas, or mail transports.

## Progress

- [ ] (2026-10-19) Add the singleton runtime, configuration, mapped schema, and native ESM loading.
- [ ] (2026-10-19) Add authentication mail capture, compiled seed tooling, and checkout ownership validation.
- [ ] (2026-10-19) Run focused unit, disposable PostgreSQL, compiled-runtime, and existing authentication regression checks.
- [ ] (2026-10-19) Update runtime documentation and record validation and outcomes.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- (2026-10-19, user and planning agent) Replace Keycloak in stages; retain local organizations, memberships, permissions, credits, and audit ownership. This pull request adds infrastructure without changing accepted credentials.
- (2026-10-19, user) Development data may be reset and reseeded. Add no database migrations, production migration, imported passwords, or compatibility backfills.
- (2026-10-19, planning agent) Use `src/libs/better-auth/src/` as a technical library with one `BetterAuthRuntimeModule`; use PostgreSQL through the already installed `pg` driver. TypeORM owns disposable schema synchronization; Better Auth owns authentication operations.
- (2026-10-19, planning agent) Pin `better-auth` to `1.7.11`, whose official package and documentation were inspected during planning. Verify the installed version's schema and APIs in contract tests before use; a changed dependency contract requires updating this plan, not silently substituting a version.
- (2026-10-19, planning agent) Use the fixed internal identity namespace `urn:lead-email-finder:auth`, defined in identity's domain and exported through its public barrel as `AUTH_IDENTITY_ISSUER`. Do not derive persistence identity from an application URL or expose a configurable issuer.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The verified planning base is commit `352553caa799acee39311007821d50a7a98c4cd7`. The API uses NestJS, CommonJS output (`tsconfig.base.json`), SWC (`.swcrc`, `nest-cli.json`), TypeORM, PostgreSQL, and `pg`. `src/main.ts` enables raw request bodies for Paddle webhooks; this plan does not reorder its parsers.

`src/lead-email-finder-api/src/postgres-module-options-factory-impl.ts` builds the shared TypeORM connection with `autoLoadEntities` and configurable synchronization. `src/libs/modules/identity` owns business identity records. Native Better Auth tables are separate technical records, not replacements for those entities.

`docker/compose.yaml` includes `docker/infra.yaml`. The existing SMTP verification fixture is an optional overlay, `docker/compose.smtp-dev.yaml`; its Mailpit image is pinned to `axllent/mailpit:v1.30.7`. Authentication delivery must be available in the base stack, independently of that SMTP verification overlay.

`scripts/testing/development-stack.mjs` verifies repository ownership and Compose labels and uses private metadata files. `docker/scripts/dev-reset.sh` has explicit confirmation and ownership checks. Preserve these protections. Existing `scripts/keycloak/` seed scripts supply active browser and machine fixtures and remain the default until the browser cutover.

Before implementation, read root `AGENTS.md`, the business-module contract if wiring an affected module, and the PostgreSQL repository skill. No customer-facing copy or visual design changes are included here.

## Scope and Non-Goals

Add the reusable runtime, native core and TOTP schema, configuration, mail delivery, isolated tests, development service, and seed infrastructure. Add supporting build aliases and compiled tooling only where required for those capabilities.

Do not expose the HTTP handler supplied by Better Auth, change API routes, replace browser guards, or switch machine credentials. Do not introduce OAuth-provider/JWT/bearer/organization plugins, public registration, welcome credits, Keycloak removal, or primary checkout changes. API-key schema and business integration belong to `better-auth/02`; browser login belongs to `better-auth/03`.

## Plan of Work

First create `src/libs/better-auth/src/index.ts`, `better-auth-runtime.module.ts`, and small configuration, native-runtime, persistence, mail, and fixture helpers. Add the bare technical alias `@tuposoft/lead-email-finder/better-auth` to TypeScript and Jest configuration. Consumers use that barrel; native library objects and SDK types stay inside technical and infrastructure code. Provide a single async Nest factory for the runtime and one `pg.Pool`, close the pool and mail transport on application shutdown, and allow tests to inject disposable dependencies.

Load the ESM-only package and selected plugins with native `import()` inside the async factory. Keep imports elsewhere type-only when appropriate. Configure SWC CommonJS output with `ignoreDynamic: true`; do not convert the application to ESM. Compile new seed entry points with a dedicated SWC command into an ignored output directory and execute the emitted JavaScript with Node. Do not assume the existing CommonJS `ts-node` commands preserve dynamic imports. Add a compiled-process test that constructs the real runtime; mocking the import does not prove compatibility.

Add TypeORM entities for the pinned native `user`, `session`, `account`, `verification`, and `twoFactor` schemas, mapped to `better_auth_users`, `better_auth_sessions`, `better_auth_accounts`, `better_auth_verifications`, and `better_auth_two_factors`. Use explicit Better Auth `modelName`/field mappings and UUID generation. Match the installed core schema and extensions, including indexes, foreign keys, nullable fields, encrypted TOTP/recovery data, and attempt counters and temporary access restrictions. Do not invent a reduced schema based only on documentation examples. Keep these entities in the technical library; do not add authentication tables to identity's public business API.

Register the entities through `TypeOrmModule.forFeature` when the runtime module is composed. Add real-PostgreSQL contract coverage using a randomly named schema in a database ending with `_test`: TypeORM synchronization creates the schema, the real native library creates/reads users and verification records, and the test checks constraints and repeat initialization. Do not invoke the Better Auth migration CLI at runtime. Native sessions use the database only; leave secondary session storage and cookie caching disabled. Select magic-link and passwordless TOTP plugins, with magic-link registration disabled until the explicit onboarding plan. No authentication route is mounted in this pull request.

Add a small `AuthMailDelivery` capability and a `nodemailer` SMTP adapter, reusing `pg` and adding only the missing mail dependency and types. Delivery accepts an address and authentication message, validates configured sender/transport, uses bounded connection/send timeouts, and propagates delivery failures without logging addresses, tokens, links, or provider payloads. This module sends transactional authentication email only; it must not call the email-verification module or its SMTP probes.

Add an `auth-mail` Mailpit service to `docker/infra.yaml` using the existing pinned image. It listens on port 1025 inside Compose; publish its HTTP interface on `127.0.0.1` using `AUTH_MAIL_HTTP_PORT`, default 8025, and publish SMTP on `127.0.0.1` using `AUTH_MAIL_PUBLISHED_SMTP_PORT`, default 51025, for host tooling. Container configuration uses `auth-mail:1025`. Use health checks and no externally routed delivery. Add checked-out project metadata for the allocated endpoints, validating Docker labels, canonical checkout paths, private file permissions, and matching port bindings before reading or deleting messages.

Add `BETTER_AUTH_SECRET` with existing `_FILE` support, `AUTH_MAIL_SMTP_HOST`, `AUTH_MAIL_SMTP_PORT`, `AUTH_MAIL_SMTP_SECURE`, optional user/password with `_FILE` support, and `AUTH_MAIL_FROM`. Application origin remains `APP_BASE_URL`. Avoid reusing existing SMTP-verification port/CA variables. Validate newly composed runtime configuration without printing values. Generate a checkout-owned ignored secret during reset/bootstrap rather than committing it. Preserve startup for processes that do not compose this runtime; do not make unrelated workers require authentication mail settings.

Add `scripts/better-auth/seed-development.ts` and an `auth:seed` package script that compiles then executes it. In this pull request its explicit `--native-only` mode idempotently creates native owner, admin, member, and platform-operator users for future tests, plus their local external-identity links under `AUTH_IDENTITY_ISSUER`, without changing current Keycloak memberships or granting credits. Native subjects are `better_auth_users.id`. Seed metadata goes under `.dev/auth/native-users.json` with mode 0600; it contains IDs and fixture emails, not passwords, magic-link tokens, or TOTP secrets. Repeating the seed must preserve an existing enrollment and must reject ambiguous records or records from another repository directory. Later plans extend the same command for their own fixtures.

Keep the new runtime additive until a consumer imports it: the native-only seed and isolated integration harness compose it now; existing API authentication composition remains unchanged. Prepare Compose secrets and development metadata without introducing an inactive provider-selection flag. Document the explicit native-only command and its separate fixture ownership. Add `test:auth-runtime` as the owned disposable integration/compiled-smoke runner, following existing runner report checks that fail on zero or skipped required cases.

Update `src/libs/better-auth/README.md`, `docker/README.md`, and `docs/auth/README.md` (create this focused guide if absent) with configuration names, mail access, native-only seed, TLS/cookie expectations, resource cleanup, and reset instructions. Preserve the existing `dev:reset` Keycloak flow for this additive step and make it clean the newly owned metadata/mail state without deleting another checkout's data. Extend relevant development-stack/reset tests and CI path selection for the technical library.

## Interfaces and Dependencies

- `BetterAuthRuntimeModule` exports one technical runtime token/accessor, native entity registration, and fixture-safe helpers. Define `AUTH_IDENTITY_ISSUER = 'urn:lead-email-finder:auth'` in `identity/src/domain/auth-identity-issuer.ts` and export it through identity's bare public barrel; infrastructure consumers reuse it. Runtime access is asynchronous and singleton; application/domain code must not import the technical runtime, its SDK types, or HTTP effects.
- Export `NativeHumanUserProvisioner.ensureUnverifiedByEmail(email)` for infrastructure adapters. It idempotently inserts/reuses the mapped native user with no password/account/session and never upgrades an existing verification flag. Use the owned native persistence adapter with a unique-email race check; do not enable an admin plugin, call a disabled registration endpoint, or import private SDK paths. A separate fixture-only operation may create a verified fixture after proving stack ownership. Neither operation grants a business role, membership, session, or credits; business adapters link external identities through identity's public ports.
- `AuthMailDelivery.send(message): Promise<void>` is the narrow transport capability; implementations must preserve bounded failure and redaction behavior. The runtime's magic-link sender delegates through it.
- Reuse direct `pg` and `@types/pg`; add pinned Better Auth and the maintained `nodemailer` package/types to the root package and lockfile. Follow installed-package types rather than importing private package paths.
- No externally observable HTTP behavior changes. Bruno: not applicable for this pull request because no route, guard, credential acceptance, or response changes; existing authentication smoke remains a regression check.

## Acceptance Criteria

- A real compiled Node process loads the pinned package and plugins, constructs exactly one runtime, creates a native user against disposable PostgreSQL, and shuts down its resources cleanly.
- TypeORM synchronization and native operations agree on every mapped core/TOTP table; repeat initialization leaves existing users/enrollments intact and creates no migration files.
- An authentication test message reaches the owned base Mailpit service without requiring `compose.smtp-dev.yaml`; no authentication token or SMTP credential appears in captured logs.
- Repeated `auth:seed -- --native-only` keeps native user and external-identity IDs stable, preserves enrollment, grants no new credits or memberships, and refuses a foreign checkout or unsafe metadata path.
- Existing Keycloak BFF and bearer smoke tests still execute their required cases successfully. Existing browser routes and OpenAPI output are unchanged.
- The focused tests, architecture gate, type checking, build, documentation lint, and runner contract checks pass, or a precise environment blocker is recorded without claiming success.

## Validation

From the repository root, install the pinned lockfile dependencies and run these focused checks after implementation:

```sh
corepack pnpm test -- src/libs/better-auth scripts/better-auth src/lead-email-finder-api/src/environment-variables.dto.spec.ts --runInBand
node --test scripts/testing/development-stack.test.mjs scripts/testing/dev-reset.test.mjs scripts/testing/auth-runtime.test.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:auth-runtime
corepack pnpm auth:seed -- --native-only
corepack pnpm auth:seed -- --native-only
corepack pnpm test:bff-live
corepack pnpm bruno:bff-sessions
corepack pnpm test:ci-paths
corepack pnpm docs:lint -- .agents/plans/better-auth/01-runtime-and-development-fixtures.md src/libs/better-auth/README.md docker/README.md docs/auth/README.md
git diff --check
```

`test:auth-runtime` must verify repository ownership, use a unique disposable PostgreSQL schema, start/check `auth-mail`, run the real compiled import/schema/mail tests, and reject a report with zero or skipped required cases. Tests include schema mismatch, duplicate native email, pool shutdown, missing secret, unsafe endpoint, SMTP connection failures and rejection, unsafe metadata, changed port bindings, repeat seed, preserved enrollment, and log redaction. Run current live BFF checks only against the owned disposable stack and record actual executed/skipped counts. Do not report local validation as CI evidence.

## Idempotence and Recovery

All fixture creation uses stable unique keys and checks existing state before writing. A partial seed may be rerun; it must not reset enrollment, overwrite business roles, or issue duplicate ledger grants. Never print the stored metadata while diagnosing failure.

For incompatible native schema changes, stop the owned test harness, remove only its randomly named schema, rerun TypeORM synchronization, then run `auth:seed -- --native-only`. For a full development reset use the existing guarded `corepack pnpm dev:reset -- --confirm-project=LEF` only after its checkout ownership check succeeds, followed by the native-only seed. Retain existing reset confirmation semantics. Never run global Docker prune or delete unverified volumes. Roll back this additive pull request by removing its runtime wiring/configuration and restarting; Keycloak authentication remains active throughout.

## Artifacts and Notes

Planning inspected the exact base above; no implementation or runtime validation has occurred. Useful primary references: [Better Auth API](https://better-auth.com/docs/concepts/api), [database mapping](https://better-auth.com/docs/concepts/database), [passwordless TOTP](https://better-auth.com/docs/plugins/2fa), and [SWC dynamic imports](https://swc.rs/docs/configuration/modules#ignoredynamic). Validate assumptions against the pinned installed package, not mutable upstream source.

Before implementation, put the issue marked `<!-- execplan: better-auth/01 -->` in progress and assign it as required by root `AGENTS.md`. Use a narrow isolated worktree and one conventional-commit pull request assigned to the user; include the synced issue's closing keyword. Preserve unrelated work.

## Plan readiness

Ready to implement
