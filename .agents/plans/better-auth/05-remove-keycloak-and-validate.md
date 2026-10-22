# Run the Complete Application Without Keycloak

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.

## Purpose / Big Picture

A developer resets the disposable stack and obtains a working application, authentication email inbox, native
Better Auth sessions and MFA, local API keys, MCP, and seeded workspaces without starting or contacting Keycloak.
A fresh public user verifies an email link, names a workspace, enrolls required owner MFA, and receives exactly
100 trial credits. The explicit development customer fixture retains a reproducible balance of 1000 credits.

The pull request and conventional-commit subject are `chore(auth): remove Keycloak infrastructure and legacy flows`.

## Progress

- [ ] (2026-10-19) Replace development bootstrap, stack metadata, reset, and fixture authentication.
- [ ] (2026-10-19) Remove unused Keycloak/OIDC/BFF runtime code, infrastructure, and configuration.
- [ ] (2026-10-19) Update all live runners, CI wiring, documentation, and secret-safe diagnostics.
- [ ] (2026-10-19) Execute a clean reset and complete final browser, API-key, MCP, HTTP, and core validation.

## Plan dependencies

- `better-auth/01`
- `better-auth/02`
- `better-auth/03`
- `better-auth/04`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use a clean reset of disposable development data, with no Keycloak migration, backfill, dual-provider
  compatibility window, production rollout, or production recovery work. Rationale: the repository has no
  production environment, and the user explicitly accepts replacement development identities and credentials.
  Date: 2026-10-19. Author: user and Codex.
- Decision: Keep authentication email capture independent from SMTP-verification evidence. Rationale: the probe
  server rejects `DATA`, and the opt-in verification network is not an authentication dependency.
  Date: 2026-10-19. Author: Codex.
- Decision: Final end-to-end checks directly depend on all four earlier plans. Rationale: reset and runtime tests
  exercise native persistence, local API keys, magic-link/MFA login, and public trial onboarding together.
  Date: 2026-10-19. Author: user and Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Planning basis: commit `352553caa799acee39311007821d50a7a98c4cd7`. Read the root instructions, module instructions,
affected module README files, Docker guidance, and existing fixture ownership checks before implementation. Frontend
fixture work also follows `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, and local frontend/testing skills.

The baseline defines `keycloak` and `keycloak-postgres` in `docker/infra.yaml`; the API and MCP receive provider
configuration through `docker/compose.yaml`. `docker/scripts/dev-reset.sh` checks ownership of the working directory, exact
service ports and allowlisted volumes before recreating the stack, running Keycloak provisioning, and seeding
platform/customer fixtures. Its protections are part of the maintained contract, not obsolete provider machinery.

`scripts/testing/development-stack.mjs` discovers services owned by the working directory and saves ignored metadata under
`.dev/keycloak`. Browser fixtures maintain TOTP enrollment provenance, suppress credential artifacts, and automate
Keycloak HTML forms. Bruno, SMTP/Paddle fixtures, MCP live checks, and CI depend on these same files and identities.
Replacing these fixtures must retain their safety properties while using the real native-auth workflows.

Earlier plans introduce `src/libs/better-auth/src/BetterAuthRuntimeModule`, mapped `better_auth_*` tables, native
magic-link sessions/MFA, local API keys, public workspace onboarding, and one-time trial issuance. Their shared
issuer is the identity-owned constant `AUTH_IDENTITY_ISSUER = 'urn:lead-email-finder:auth'`, independent of public URL.

## Scope and Non-Goals

Complete the infrastructure and fixture cutover, delete obsolete provider flows, and prove that the entire
application works without Keycloak. Retain PostgreSQL, application Redis/queues, object storage, current HTTP
feature contracts, financial accounting, role hierarchy, isolation, and frontend lifetime guarantees.
Do not redesign authentication, change the 100-credit public trial, introduce email marketing/invitation delivery,
add production deployment machinery, or remove unrelated JOSE/Redis code merely because the old BFF used it.

## Plan of Work

First audit the compiled application bootstrap at `scripts/better-auth/seed-development.ts` and the established
`corepack pnpm auth:seed` command from `better-auth/03`. Compile the application/module dependencies and execute JavaScript with Node; do not
run the ESM Better Auth dependency through the old CommonJS `ts-node` seed path. Reuse the compatibility and table
initialization decisions proved by `better-auth/01`. Use a seed-specific build configuration if the standard Nest
build does not emit the script; keep the single package command as the supported entry point.

The seed opens the existing application composition, waits for synchronized mapped tables, and calls application
ports for native users, platform/customer organizations, memberships, credentials, and credit operations. It must
not import another business module's entities or write fixture SQL to bypass those contracts. Provision a
platform operator and customer owner with native user IDs and explicit MFA-required roles. Preserve fixture
provenance so a rerun cannot take over an unrelated existing identity. Browser TOTP secrets are captured only by
the fixture's real enrollment flow and stored in checkout-owned ignored files with mode 0600.

Keep normal public onboarding and development seeding distinct. A public user obtains exactly one 100-credit trial
through the persisted claim/idempotency workflow from `better-auth/04`. The explicit customer seed initializes its
1000-credit balance using the existing privileged credit operation and a stable development reference. That seed
does not traverse public registration's trial grant and cannot accidentally create a 1100-credit balance. Reseeding
must not add 100 or 1000 again, reset a used customer's balance, duplicate a workspace, replace enrolled MFA, or
rotate/reissue existing fixture API keys automatically. A full confirmed reset creates a fresh fixture lineage.

Audit `.dev/auth/development-stack.json`, browser seed/enrollment metadata, and separate platform/customer API-key
fixture files established by the earlier plans. Remove retired `.dev/keycloak` readers instead of introducing
another metadata rename. Apply symlink rejection, `realpath` ownership,
permission, service URL, and Compose provenance checks before reads/writes. Discover service bindings rather than
assuming another checkout's ports. Never print connection secrets, keys, magic links, email bodies, or TOTP data.

Replace reset's known service and volume inventory and remove the Keycloak port assertion. Preserve a narrow
legacy-volume cleanup path for this checkout's old `lef_keycloak-postgres-data` only after the existing container
and volume provenance checks succeed; refuse ambiguity. The new normal inventory contains only application data
and queue volumes already owned by the reset. Keep explicit project confirmation and reject foreign checkout
containers/volumes, unexpected ports/configuration, partial unexplained volume sets, and symlink metadata roots.
Never use global deletion, `docker compose down -v`, or deletion based solely on a matching volume name.

Verify the base stack's `auth-mail` service established by `better-auth/01`, using Mailpit `v1.30.7`, internal SMTP
1025, and inbox/API 8025. Retain loopback publication through `AUTH_MAIL_HTTP_PORT` (default 8025) and
`AUTH_MAIL_PUBLISHED_SMTP_PORT` (default 51025), with actual bindings recorded in owned metadata.
Keep the development inbox disposable. The API sends transactional authentication mail to `auth-mail:1025`
without SMTP credentials. Keep it independent of `smtp-dev` overlay DNS, proxy, and STARTTLS settings.
Retain per-recipient/message correlation so
parallel tests can locate only their own generated email without draining another test's mailbox.

Update the reset order to build/start owned infrastructure and application, discover fresh stack metadata, run
`auth:seed`, exercise captured magic-link login and required browser MFA, then run API-key/current-account smoke
checks. Seed only once per lineage; enrollment bootstrap may be a separate repeat-safe step used by CI. Report
only safe counts and endpoints, never fixture credentials or email contents.

Remove Keycloak services, database volume declarations, provider-specific ports, health checks, environment fields,
secret declarations/files, and obsolete Keycloak library wiring. Remove old OIDC discovery/JWKS, PKCE login state,
authorization-code exchange, refresh-token encryption/refresh/revocation, Redis BFF session storage, and unsupported
callback endpoints only after all native consumers are switched. Retain any useful public session and sign-out facade
established by `better-auth/03`; its implementation must use native sessions rather than a second session store.
Remove `jose` only if a repository import search proves no remaining consumer. Preserve application Redis, TLS,
request logging, CSRF/Origin protection, current-account policy, and queue infrastructure.

The earlier plans already update their own seed, fixture, runner, and CI consumers so each PR is independently
testable; do not defer those working paths until this cleanup PR. Remove remaining legacy fixture branches and
verify browser login/enrollment fixtures use the actual app-owned magic-link screens, captured authentication
email, native TOTP UI, and API-key management. Update live runners for session expiry, replacement, two tabs,
BFCache, role changes, invitations, billing, platform tools, verification, batch work, and artifact suppression.
Keep host ownership checks and fail when required runtime tests would be skipped; never retain a direct database
session-insertion shortcut as evidence of a successful browser login.

Update Bruno launchers and collections to use local API keys and captured native human sessions where required.
Retain the existing collection names/launcher scripts where their business workflows remain, including
`bruno:bff-sessions`; rewrite its content and description around native session contracts. Keep the provider-neutral `test:bff-live` command adapted by `better-auth/03`. Remove obsolete
`keycloak:*` and `test:oidc-runners` script names, replacing the runner aggregate with
`test:auth-runners` and updating `test:ci` to call it. Preserve `test:web-live`, `test:mcp-server-live`, and
`browser-fixtures:bootstrap` as supported wrapper entry points.

Update SMTP proxy bootstrap/cleanup, Paddle fixture setup, generated OpenAPI, Docker/MCP/module README files, and CI
validation selection/wiring. CI must build and test the final Node artifact, then run the real disposable reset,
email/MFA browser bootstrap, API/MCP checks, and existing feature suites with no Keycloak container or secret.
Replace diagnostics' Keycloak special cases with safe native-auth/mail health diagnostics. Retain artifact scans
and failure-output suppression around one-time credentials. Historical completed plans can mention Keycloak;
active instructions and executable runtime paths must describe the final system.

## Interfaces and Dependencies

- `auth:seed` becomes the compiled repeat-safe development bootstrap; `dev:reset` retains explicit project
  confirmation and checkout ownership protection. `test:auth-runners` replaces the obsolete OIDC runner aggregate.
- `.dev/auth` remains the metadata owner established by the earlier plans. Its metadata describes API, web,
  PostgreSQL, Redis, auth-mail, and optional MCP/SMTP services without Keycloak endpoints/admin credentials.
- `auth-mail` exposes SMTP 1025 internally and its inbox/API 8025 on a loopback host binding. Authentication
  callback configuration uses the actual published application origin and discovered inbox endpoint.
- All four dependencies are direct: final reset/tests consume runtime schema/bootstrap (`01`), keys/MCP (`02`),
  magic links/MFA/native sessions (`03`), and public registration/trial accounting (`04`).

## Acceptance Criteria

- Starting from confirmed disposable old development data, one reset succeeds without a Keycloak container,
  provider endpoint, provider secret, or hidden provider database; native schema and fixture metadata are created.
- Rerunning the seed preserves identities, MFA enrollment, key validity, membership counts, and credit balances.
  A fresh public account receives 100 trial credits once; the explicit fresh customer fixture has exactly 1000.
- Real captured-email login, cross-device verification, required owner/operator MFA, sign-out, disabled access,
  two-tab invalidation, and cached-page restoration preserve their specified security/lifetime behavior.
- API-key issue/rotation/revocation, MCP initialize/list/tool authentication, organization invitations, credit
  purchase/replay, platform tools, and synchronous/asynchronous/batch verification pass against the final stack.
- Reset refuses foreign ownership, unexpected configuration/ports, unsafe symlinks, and ambiguous volume state;
  an interrupted setup can safely resume. No auth token, API key, TOTP secret, or mail body reaches artifacts/logs.
- Core checks and all selected runtime suites complete with truthful executed/skipped counts. Current runtime
  configuration and package scripts contain no required Keycloak/OIDC client or duplicate BFF session machinery.

## Validation

Run these core/static commands from the repository root after updating the package scripts and fixtures:

```bash
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm test:auth-runtime
corepack pnpm test:ci
corepack pnpm test:ci-paths
corepack pnpm openapi:check
node --test scripts/openapi/*.test.mjs
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm design:lint
corepack pnpm ui:audit
```

On this checkout's proven disposable stack run `corepack pnpm dev:reset -- --confirm-project=LEF`, then
`corepack pnpm auth:seed` again and compare safe fixture counts/balances/key-validation results. Run
`corepack pnpm test:gateway`, `corepack pnpm test:bff-live`, `corepack pnpm test:web-live`,
`corepack pnpm test:mcp-server-live`, and
`corepack pnpm --filter @tuposoft/lead-email-finder-web browser-fixtures:bootstrap`.

Run `corepack pnpm bruno:bff-sessions`, `corepack pnpm bruno:organization-onboarding`,
`corepack pnpm bruno:service-client-rejections`, `corepack pnpm bruno:platform-credits`,
`corepack pnpm bruno:proxy-registry`, and `corepack pnpm bruno:credit-purchases`. Attach the existing SMTP overlay
using the documented checkout-owned sequence, then run `corepack pnpm bruno:smtp-dev`,
`corepack pnpm bruno:async-verification`, and `corepack pnpm bruno:batch-verification`.

Run the web package's `test:e2e`, `test:a11y`, `test:visual`, `test:team-live`, `test:service-clients-live`,
`test:platform-organizations-live`, `test:platform-credits-live`, `test:platform-proxies-live`,
`test:verification-live`, and `test:batch-verification-live` scripts with `corepack pnpm --filter
@tuposoft/lead-email-finder-web <script>`. Include the auth/onboarding scenarios added by `03`/`04` in the maintained
browser launchers and require real email capture and MFA evidence. Run `corepack pnpm test:credits-postgres`,
`corepack pnpm test:verification-billing-postgres`, and `corepack pnpm test:verification-billing-web`.

Review a targeted `rg` inventory for `keycloak`, `OIDC_`, `BFF_CLIENT_`, old metadata paths, and obsolete package
script names. Classify historical documentation separately; every active reference needs removal or an explicit
remaining non-Keycloak purpose. Run `git diff --check`. Bruno is applicable: report each updated
collection's actual local result, distinguishing skipped/unavailable external Paddle sandbox evidence from stub
payment coverage and from a successful final native-auth cutover.

## Idempotence and Recovery

Seed/upsert behavior uses the fixture lineage owned by the working directory and stable native user/credential identities.
Normal reruns must preserve secrets, enrollment, and spent balances. Public trial claims use the durable one-time
grant reference from `04`, so refreshes/retries cannot grant again. Interrupted bootstrap resumes after checking
schema, metadata provenance, and existing records; it must refuse mismatches rather than overwrite them.

Reset is destructive only to the explicitly confirmed checkout-owned development target. Preserve provenance
checks before stopping containers or deleting allowlisted volumes/files. If a schema or fixture mismatch blocks
recovery, perform the same confirmed narrow reset and reseed; do not repair through ad hoc user/credit SQL.
Rollback during development means restoring the previous code and resetting its own disposable stack, never
trying to interpret native sessions or local API keys as legacy provider credentials.

## Artifacts and Notes

Capture safe service inventory, reset/second-seed counts, trial/balance assertions, browser test counts, MCP
revocation results, collection results, and validation gaps. Screenshots, traces, mail contents, auth metadata,
key fixture files, raw logs, and TOTP/one-time-secret data remain excluded from published artifacts.
The final PR uses this plan's conventional subject, links its synced issue, and updates this document as work proceeds.

## Plan readiness

Ready to implement
