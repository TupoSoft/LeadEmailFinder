# Internalize Account-Discovery Provider Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Email verification should own both its account-discovery policy and the provider adapters that implement it. After
this change, all four supported provider clients and their HTTP composition live privately inside
`src/libs/modules/email-verification/src/infrastructure/account-discovery/`. The retired `src/libs/catch-all/`
library and its TypeScript and Jest aliases no longer exist. The running verification path continues using the
internal `AccountDiscovery` boundary established by `account-discovery/01`, with unchanged results and default-deny
behavior. Developers can observe this through fixture tests, the architecture gate, a static retirement inventory, and
the existing local SMTP Bruno workflow.

This is one pull request. It follows the delivery cutover from `module-architecture/18` and the internal boundary
from `account-discovery/01`, preserving the subsequently merged DNS and delivery layering work. It creates no
separate business module or public account-discovery API.

## Progress

- [x] (2026-09-07) Inventory the provider tree, common verifier contract, aliases, consumers, and existing fixtures.
- [x] (2026-09-07) Move provider clients and tests into private email-verification infrastructure.
- [x] (2026-09-07) Introduce the private provider contract and consolidate HTTP, manifest, and token composition.
- [x] (2026-09-07) Retire the old library, aliases, and unused common contract without a compatibility barrel.
- [x] (2026-09-07) Add focused boundary and composition regression coverage and update current documentation.
- [x] (2026-09-07) Complete focused, architecture, security, full-suite, build, Harper, and runtime SMTP Bruno checks.

## Plan dependencies

- `account-discovery/01`

## Surprises & Discoveries

- The starting checkout is `5265f737acebf72ced9642ae18ed5dc922a89277`. Issue #547 is closed; subsequent DNS,
  synchronous, and asynchronous layering plans have also merged. The old `EmailVerifierModule` and synchronous
  composition wrapper no longer exist. The active composition is `infrastructure/email-verification-core.module.ts`.
- The complete provider inventory is 17 files in four directories, plus the HTTP factory and its specification.
  Common verifier consumers are confined to these adapters and account-discovery application policy and fixtures.
- Other worktrees occupy the documented Docker ports. This checkout initially has neither installed dependencies
  nor ignored development credentials. Dependency installation uses the writable Codex package cache; existing
  containers from other worktrees cannot validate this checkout.

## Decision Log

- Decision: Import the private `AccountDiscoveryModule` into `EmailVerificationCoreModule` and retain the actual
  core wiring suite in `account-discovery-wiring.spec.ts`.
  Rationale: Merged delivery refactors removed the wrapper modules named during planning. Recreating them would
  reverse accepted architecture work. SMTP composition remains in the current core module.
  Date/Author: 2026-09-07, Codex implementation.
- Decision: Keep account discovery inside the existing email-verification business module and put provider clients
  under its current `infrastructure/account-discovery/` directory.
  Rationale: These adapters currently serve one fixed email-verification purpose. Internal ownership supplies the
  required boundary without another business module or a second infrastructure directory.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Move the complete provider tree in this pull request and remove its aliases and public barrel together.
  Rationale: A partial move or compatibility reexport would leave two supported locations for private infrastructure.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Define `AccountDiscoveryProvider` inside `application/account-discovery/` and retain selection and
  approval enforcement in application code. Nest, Axios, manifest loading, and provider construction remain in
  infrastructure.
  Rationale: The application owns the small interface it consumes; external protocol details must not become its
  dependencies. Moving transport code must not move business policy outward with it.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Keep the retired catch-all prefix in the architecture scanner's technical dependency deny list and the
  canonical module guide. Verify retirement through static inventory and existing architecture checks.
  Rationale: Removal of an implementation does not justify permitting future core imports of its former technical
  namespace or changing unrelated architecture rules.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Preserve the fixed approval manifest, configuration names, provider payloads, source literals, request
  counts, error handling, and regional selection. Use only synthetic fixtures and the existing local SMTP workflow.
  Rationale: This is an ownership refactor; it neither approves a provider nor changes an outbound disclosure.
  Date/Author: 2026-09-06, Codex planning.

## Outcomes & Retrospective

The four providers and HTTP factory now belong to private email-verification infrastructure. The private Nest
module supplies one `ACCOUNT_DISCOVERY_TOKEN`; application policy depends on its own narrow provider interface.
The old library, aliases, and common verifier export are removed, with no new architecture debt or public exports.
Production provider bodies, headers, response mapping, regional selection, and logging behavior are unchanged.
The final responsibility review found no material SOLID trade-off. SMTP and other core factories remain intact.

Focused provider and Nest fixtures, repository tests, type checking, lint, build, architecture, approval validation,
and security scanning passed. After the user removed the conflicting containers and network, a fresh development
stack was provisioned for this checkout without deleting existing volumes. The SMTP Bruno launcher passed all
28 requests and 57 tests, with no skips. Correlated API logs prove a fresh trusted STARTTLS exchange and rejection
of the plaintext fixture after only `EHLO`. Local runtime validation is complete; live vendor acceptance remains
outside the scope of this refactor.

## Context and Orientation

The current implementation follows the merged `account-discovery/01` prerequisite and subsequent delivery
refactors. `infrastructure/email-verification-core.module.ts` composes persistence, DNS, SMTP, and the mailbox
application service. Before this change, it imports `CatchAllModule` and four concrete clients from the technical
library, registers the discovery clock, and injects `ACCOUNT_DISCOVERY_TOKEN` into `MailboxVerificationService`.
`infrastructure/account-discovery/configured-account-discovery.ts` already loads the fixed approval manifest and
passes narrow configuration to `account-discovery-composition.ts`. The private Nest module replaces only the
provider and discovery registrations; the remaining core composition stays intact.

Application policy under `application/account-discovery/` checks provider, purpose, region, effective time, expiry,
and approval status. The common verifier interface is at
`src/libs/common/src/interfaces/catch-all/catch-all-verifier.interface.ts`, with sibling and parent barrel exports.
This plan replaces that technical contract with the private application-owned `AccountDiscoveryProvider` interface.

The running consumer is `application/mailbox-verification.service.ts`. Its internal `AccountDiscovery` dependency
returns a read-only array of `{ sourceName: string }` evidence. Invalid startup configuration or approval rejects
composition; approval that becomes unavailable immediately before disclosure and provider failures yield empty
evidence. Verification callers still decide when to consult discovery and how recognized sources affect results.
The old `EmailVerifierModule` and synchronous composition wrapper have already been removed by merged work.

At the start of implementation, the technical library contained `catch-all.module.ts`, `http-module-options.factory.ts` and its test,
`index.ts`, and these provider directories, including their local barrels, response types, helpers, and specifications:

- `microsoft-get-credential-type/`
- `microsoft-login/`
- `mimecast-login/`
- `office-apps/`

The Microsoft clients already isolate request bodies between concurrent calls. Mimecast binds one of the existing
`us` or `uk` regions through `forRegion`. The HTTP options factory declares only `CATCH_ALL_HTTP_PROXY_URL` and does
not activate a provider merely because a proxy exists. No provider owns persistence or routes.

The fixed runtime manifest is `config/privacy/account-discovery-approvals.yaml`. An absent provider selection
dispatches no external request; selecting a provider against the current empty approvals list fails initialization.
Manifest validation and session-material scanning have existing CLI commands and
focused tests under `scripts/privacy/` and `scripts/security/`. The existing `bruno/smtp-dev` collection exercises
real local API composition and verifies results without external account-discovery sources.

## Scope and Non-Goals

Move the four provider directories to
`src/libs/modules/email-verification/src/infrastructure/account-discovery/providers/`, preserving their directory
names. Move the HTTP factory and its test directly into `infrastructure/account-discovery/`. Replace the retired
`CatchAllModule` with a private `account-discovery.module.ts` there. Reuse the prerequisite's application service,
token, selector, approval wrapper, and clock contract, and retain the existing infrastructure composition helper.

Replace the module's remaining legacy provider contract with `AccountDiscoveryProvider`, remove the old common
interface and reexports once the complete consumer inventory confirms they are unused, and delete both exact and
wildcard catch-all aliases from `tsconfig.json` and `jest.config.ts`. Remove the old library and its root barrel;
do not leave a compatibility shim. Update current module and privacy documentation paths.

Do not change provider names, source literals, endpoints, payloads, headers, proxy semantics, regional behavior,
timeouts, retries, result interpretation, approval requirements, logging behavior, or configuration names. Do not
change HTTP routes, validation, authentication, authorization, credits, persistence, queues, SMTP probing, DNS,
domain-synonym discovery, or the completed core cutover. Do not add a migration, reset requirement, public export,
provider approval, vendor call, or separate business module. Keep historical completed plans unchanged.

## Plan of Work

Read `src/libs/modules/AGENTS.md`, the canonical `src/libs/modules/README.md`, and the email-verification README.
Inspect the current checkout and the prerequisite's delivered names before editing. Find the synced issue by its
`<!-- execplan: account-discovery/02 -->` marker, assign it to the implementing user, and set its project-9 Status to
In Progress using the root workflow. Preserve existing user changes and record the inventory in this plan.

Create `application/account-discovery/account-discovery-provider.ts` with one framework-free
`AccountDiscoveryProvider` interface: `readonly sourceName: string` and
`verify(email: string): Promise<boolean>`. Change the existing selector factories and approval wrapper to depend on
that interface. Preserve every concrete source literal and the application's handling of unrecognized evidence.
Do not expose provider selection, approval objects, Axios responses, or concrete classes through the higher-level
`AccountDiscovery` port. Once all clients are inside the module, update their `implements` clauses and the Mimecast
regional factory return type through ordinary internal imports.

Move each provider directory and its adjacent fixtures as a unit. Keep deterministic response mappings and all
existing payload, proxy, logging, and concurrency behavior. Move `http-module-options.factory.ts` and its test to the
existing infrastructure directory. Remove the old top-level `index.ts`; provider-local barrels may remain private if
they simplify local imports, but none may escape through the business module's public barrel.

Introduce `infrastructure/account-discovery/account-discovery.module.ts` as the sole private Nest composition for
this feature. It imports `ConfigModule`, configures `HttpModule` through the moved options factory, registers the
four clients, supplies the clock, loads the fixed manifest, and builds the existing application service using
explicit factory providers. Export only the prerequisite's `ACCOUNT_DISCOVERY_TOKEN` from this private Nest module.
Do not export concrete provider classes to consumers or duplicate selection and approval enforcement in Nest
factories. Inject the narrow configuration shape already used by this feature; do not import the API host's
aggregate environment DTO.

Update `infrastructure/email-verification-core.module.ts` to import the private `AccountDiscoveryModule` and
continue injecting `ACCOUNT_DISCOVERY_TOKEN` into the mailbox service factory. Remove concrete provider imports
and duplicate discovery and clock registrations from the core module. Preserve SMTP, DNS, persistence, and all
other service registrations. Do not recreate the retired wrapper modules.

Add `infrastructure/account-discovery/account-discovery.module.spec.ts` for private Nest initialization. Update
`infrastructure/account-discovery/account-discovery-wiring.spec.ts` to verify the real core mailbox composition,
resolution of both the mailbox probe and discovery dependencies, and absence of duplicate discovery registration.
The active mailbox service continues consuming the same port; no further delivery cutover occurs here. The sole
public business-module export remains `EmailVerificationModule`.

Search source, tests, aliases, and active build and test configuration for every old import and contract. Remove the
unused common verifier interface, its now-empty directory, and relevant barrel export after updating all consumers.
Delete `src/libs/catch-all/` and the exact and wildcard TypeScript and Jest aliases in the same change. Do not remove
the retired prefix from `scripts/architecture/module-architecture.ts`, its technical-dependency fixtures, or the
canonical module guide. Do not broaden any baseline entry to accommodate the move.

Verify retirement with a static inventory of source, configuration, and exports. The old library and alias entries
must be absent, no source consumer may reference the retired namespace or common verifier contract, and the public
business-module barrel must remain unchanged. Existing architecture fixtures intentionally retain the prohibited
technical prefix. Use type checking, build validation, and the architecture gate alongside the inventory; no custom
source-scanning framework or directory-structure snapshot test is needed.

Update `src/libs/modules/email-verification/README.md` to describe private provider ownership, the token composition,
and relocated validation paths while preserving its public contract. Update the source references in
`docs/privacy/email-verification-processing-contract.md`; do not rewrite unrelated processing or provider-approval
decisions. Keep this plan current. Run the architecture gate, removing only resolved baseline keys when necessary,
and complete the validation below. Review the final diff for responsibility and dependency-direction violations.

## Interfaces and Dependencies

The existing internal `AccountDiscovery` interface and `ACCOUNT_DISCOVERY_TOKEN` come from `account-discovery/01`.
`discover(email: string): Promise<readonly { sourceName: string }[]>` remains unchanged. The new private
`AccountDiscoveryProvider` interface replaces the technical `ICatchAllVerifier` dependency inside application policy
and provider implementations. No contract is added to `src/index.ts` or shared `common`.

Selection and approval enforcement continue to own the fixed purpose `email_verification.account_discovery`, one
selected provider at most, and exact approval identity, provider, region, status, and validity matching. Configuration
remains `CATCH_ALL_PROVIDER`, `CATCH_ALL_PROVIDER_APPROVAL_ID`, `CATCH_ALL_PROVIDER_REGION`, and
`CATCH_ALL_HTTP_PROXY_URL`. Manifest loading continues through the existing configuration library and cannot be redirected
by environment configuration. Transport, provider construction, and Nest wiring depend inward on application
contracts; application and domain code import neither Nest nor infrastructure.

## Acceptance Criteria

- All four provider implementations, helper types, and fixtures reside below
  `infrastructure/account-discovery/providers/`, and HTTP and private Nest composition reside directly under
  `infrastructure/account-discovery/`.
- `src/libs/catch-all/`, its root barrel, both TypeScript aliases, both Jest mappings, and the unused common verifier
  contract are absent. No consumer imports the retired namespace. Intentional retirement and scanner fixtures remain.
- The private Nest module supplies `ACCOUNT_DISCOVERY_TOKEN` once and exposes no concrete client. The active
  core composition resolves it and the existing mailbox probe with mocked provider transports. SMTP remains
  available through its existing factory and injected dependencies in `EmailVerificationCoreModule`.
- The active mailbox service retains the prerequisite's evidence contract. Recognized positive evidence, negative
  outcomes, provider failures, and approval expiry preserve their verification-result behavior.
- An absent provider, including a proxy-only configuration, dispatches no provider request. Invalid, partial,
  unapproved, suspended, revoked, expired, premature, or mismatched configuration prevents application initialization
  before any dispatch.
- With a synthetic approved selection, exactly one provider is invoked. Approval is checked again immediately before
  disclosure; a now-invalid approval dispatches nothing and returns empty evidence through `discover`. Transport
  failure also returns empty evidence without replacing startup validation with silent success.
- Four provider fixture suites preserve positive, negative, malformed/error response, source-name, and request-shape
  behavior. Overlapping requests cannot share address-bearing state; Mimecast calls only its selected region.
- Provider and composition errors expose no raw or encoded address, remote body, credential, or external message in
  logs. The fixed manifest remains empty and the approval validator and working-tree security scan pass.
- Static inventory finds no old source consumer or resolver alias. The generic architecture deny list and module
  guide retain the retired prefix, architecture checks pass, and no baseline entry is added or broadened.
- The business module still publicly exports only `EmailVerificationModule`. Existing HTTP, queue, persistence,
  configuration, and SMTP contracts remain unchanged. Current documentation points to the owned provider paths.
- Focused tests, type checking, lint, full tests, and build pass. The existing local SMTP Bruno collection
  passes when its disposable dependencies are available; any unavailable runtime validation is explicitly recorded.

## Validation

Run focused provider, policy, composition, consumer, and security fixtures from the repository root:

```shell
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/account-discovery src/libs/modules/email-verification/src/application/account-discovery src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts scripts/privacy/account-discovery-approvals.spec.ts scripts/security/scan-linkedin-session-material.spec.ts --runInBand
```

Use mocked HTTP transports and injected fixture clocks/manifest loaders for approved-provider cases. Exercise every
provider's existing source and response mapping, concurrent distinct addresses, and both allowed Mimecast regions.
Exercise the actual private Nest module during application initialization. Resolve its `AccountDiscovery` service
and call it before and after approval expiry. Do not insert fixture approvals into the runtime manifest or send
requests to a vendor.

Run the architecture and privacy/security gates:

```shell
corepack pnpm architecture:check
corepack pnpm privacy:account-discovery-approvals-check
corepack pnpm security:scan-linkedin-session-material --scope=working-tree
```

If the architecture gate reports only stale entries, inspect their ownership, run
`corepack pnpm architecture:baseline`, and rerun `corepack pnpm architecture:check`. A new violation requires a code
fix. Retaining a retired technical prefix in the scanner is intentional and must not be mistaken for a leftover
runtime dependency. Verify the retirement inventory separately:

```shell
test ! -e src/libs/catch-all
rg -n 'ICatchAllVerifier|@tuposoft/lead-email-finder/catch-all' src tsconfig.json jest.config.ts --glob '*.ts' --glob '*.json'
```

The directory check must exit zero. The search must produce no matches and exit one; scanner fixtures under
`scripts/architecture/` and documentation, including the canonical module guide, are outside that search.

Run repository-wide compatibility and build checks:

```shell
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm typecheck
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm lint
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm build
git diff --check
```

Check the current checkout's disposable development stack and follow `bruno/smtp-dev/README.md` to provision its
ignored credentials and start the SMTP overlay if required. Rebuild the API with the relocated providers before
running the supported launcher:

```shell
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
corepack pnpm bruno:smtp-dev
```

The launcher verifies that the containers belong to the current worktree and runs the pinned Bruno CLI with `bru run --env local --sandbox
developer` inside the API container. It fails on missing dependencies, skipped requests, or zero executed tests and
loads ignored development credentials without printing them. Keep the runtime manifest empty. Confirm the existing
trusted SMTP success, plaintext rejection, and absent external-source assertions still pass; these are local wiring
checks, not proof of vendor acceptance.

Bruno coverage is applicable because private Nest composition changes the existing verification workflow's runtime
wiring. Reuse its current success and rejection assertions. Extend only a missing material assertion in the same
collection; do not create a new collection or add provider activation to the development environment. In the final
implementation response, report `Bruno: added/updated and <result>` if assertions change. Otherwise, report
`Bruno: not applicable — no definition change; existing smtp-dev coverage reused`, followed by the actual launcher
result. If dependencies are unavailable, report static and unit evidence and state that Bruno execution remains
unverified.

## Idempotence and Recovery

This change alters no schema or stored data and requires no reset or reseed. Move files with Git-aware renames where
available and inspect the diff before deleting obsolete directories. If interrupted, inventory both locations and
finish the planned move; do not create a second provider registration or restore aliases merely to make tests pass.
Restore only this task's edits from the known pre-change revision if rollback is necessary, preserving unrelated
user work. Stop only this checkout's disposable containers if runtime verification fails. Missing runtime
dependencies do not justify changing provider selection or populating the approval manifest.

## Artifacts and Notes

Implementation evidence from 2026-09-07:

- Moved 17 provider files and the HTTP factory/specification. Removed the legacy root module/barrel, both exact
  and wildcard TypeScript/Jest mappings, and the common verifier interface and its two barrel exports.
- Private graph: `EmailVerificationCoreModule` imports `AccountDiscoveryModule`, whose sole export is
  `ACCOUNT_DISCOVERY_TOKEN`. It owns provider registration, the clock, HTTP configuration, and the existing manifest
  factory. Tests resolve the real `SmtpMailboxProbe` factory with mocked boundary dependencies and find exactly one
  discovery registration. The public business-module barrel is unchanged.
- The focused command above passed 15 suites and 173 tests. After adding the real SMTP factory regression, the
  two Nest composition suites passed 31 tests. Provider fixtures independently passed 4 suites and 48 tests.
- Final `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci` passed 213 Jest suites and 2,331 tests, with
  13 suites and 80 tests skipped. All 32 launcher regression tests passed. Skipped integration tests provide no
  runtime evidence.
- `corepack pnpm typecheck`, `corepack pnpm lint`, and `corepack pnpm build` passed. Lint retains one existing
  missing-return-type warning in `src/libs/config/src/load-secrets.spec.ts`; changed tests have no lint warnings.
  The build compiled 612 files. Prettier passed for the changed application and infrastructure directories.
- `corepack pnpm architecture:check` passed with 9 modules and the same 20 baseline entries; no baseline edit was
  needed. The retirement directory check passed, and the TypeScript/configuration inventory returned no matches.
- `corepack pnpm privacy:account-discovery-approvals-check` passed with zero approvals, and
  `corepack pnpm security:scan-linkedin-session-material --scope=working-tree` returned an empty finding list.
- `corepack pnpm docs:lint -- .agents/plans/account-discovery/02-internalize-provider-adapters.md src/libs/modules/email-verification/README.md docs/privacy/email-verification-processing-contract.md`
  passed for all three files. `git diff --check` passed.
- The initial `corepack pnpm bruno:smtp-dev` attempt exited 1 before collection execution: this checkout lacked
  its own development stack and credentials, and another worktree occupied the fixed SMTP subnet and ports.
  The user subsequently removed the running containers and network and requested a runtime rerun.
- The rerun built this checkout's API, started a fresh `lef` Compose project, and provisioned Keycloak plus the
  platform service credential. Provisioning and `keycloak:smoke` passed. The base containers were recreated with
  `docker/compose.smtp-dev.yaml`; named volumes were preserved. The fixture proxy bootstrap exited zero.
- `corepack pnpm bruno:smtp-dev` passed with the pinned Bruno 4.1.0 CLI: 28 requests and 57 tests, with no skipped
  requests. The unchanged collection passed trusted SMTP success, plaintext rejection, empty external sources,
  proxy drain/restore, billing, compatibility, cache ownership, stored result reads, and asynchronous completion.
- API logs captured from immediately before that run contained a trusted synchronous command sequence of
  `ehlo`, `starttls`, `ehlo`, `mail_from`, `rcpt_to`, and `quit`. The plaintext synchronous result was
  `secure_transport_unavailable`, and its only SMTP command was `ehlo`. Correlation used the generated request
  identity, so cached results could not substitute for the fresh exchange evidence.
- An in-memory log scan found no fixture domain, raw or encoded fixture address, synthetic probe local part,
  caller-supplied correlation marker, or development client secret. Runtime inspection confirmed the fixture SMTP
  port and CA configuration with no account-discovery provider selected. The approval manifest remains empty.
  No collection definitions or production code changed for the rerun. The checkout's fixture stack remains running.

The DNS and delivery layering work has already merged; subsequent changes must reuse this account-discovery
boundary and leave its provider ownership intact.

## Plan readiness

Ready to implement
