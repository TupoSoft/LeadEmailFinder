# Retire Deprecated GET Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Retire the deprecated `GET /verify?email=...` endpoint and its exclusive response adapter. A developer
can send an authenticated `GET` request and observe the API's normal `404`, with no verification or credit debit.
The supported synchronous operation remains `POST /verify` with a JSON body containing `email`, its current `201`
response, and the same validation, permissions, organization isolation, billing, and tracing behavior. Removing the
last mapper also removes Automapper from the runtime and dependency graph.

## Progress

- [x] (2026-09-07) Confirm the prerequisite is merged, verify the retirement inventory, and start the synced issue.
- [x] (2026-09-07) Remove the deprecated route, its response adapter, trace mode, and exclusive Automapper dependencies.
- [x] (2026-09-07) Add HTTP retirement coverage and preserve POST, tracing, serialization, and runtime Swagger contracts.
- [x] (2026-09-07) Update SMTP Bruno coverage and documentation, and verify the architecture baseline is unchanged.
- [x] (2026-09-07) Complete focused and repository validation, record runtime evidence, and open the single pull request.

## Plan dependencies

- `module-architecture/11`

## Surprises & Discoveries

The prerequisite merged on 2026-09-07 in [PR #553](https://github.com/TupoSoft/LeadEmailFinder/pull/553), as
`72a5a259100eb78894b49a6731841257e041e2ce`. Its source moves both routes into layered API folders and supplies the shared
`RunSynchronousVerification` command. This planning branch was rebased onto that commit and the removal targets were
verified there. This plan preserves the completed prerequisite; recheck current source before implementation.

The deprecated adapter owns no persistence or queue. Its Automapper profile is the only mapping consumer under
`src`. Other Automapper references are its DTO decorators, the shared response DTO, the API composition root, and
integration fixtures, including the prerequisite's combined synchronous HTTP suite. The prerequisite removes the
old synchronous directories and all 18 of their architecture-baseline entries, including the eleven previously
associated with the deprecated directory. This retirement therefore expects no baseline change.

`CreditGuard` debits before the global validation pipe runs. Preserving POST therefore means preserving its current
guard order, including the existing debit behavior when an authorized request reaches body validation and fails.
This retirement does not introduce a new charging policy for `400` responses.

The implementation checkout at `1635409` also contains newer async delivery work. Its SMTP collection already has
28 requests, including async rejection and final-balance checks. Preserving those requests and adding two retirement
checks requires 30 executed requests. Its async controller test is now under `api/http/asynchronous-verification/`.

The browser OpenAPI document currently includes only BFF and health operations. The full runtime Swagger document
includes verification. Checking only the generated browser snapshot would not prove that deprecated GET was removed.

## Decision Log

- Decision: Remove GET registration completely and use the normal API `404`; add no redirect, replacement GET,
  tombstone controller, or response translation. Rationale: The supported operation already exists, and a retained
  adapter would keep the obsolete contract alive. Date/Author: 2026-09-07, Codex planning.
- Decision: Remove Automapper together with its final consumer. Rationale: Its packages, overrides, registration,
  and metadata decorators otherwise become unused support for the retired route. Keep class transformation and
  validation, which serve current APIs. Date/Author: 2026-09-07, Codex planning.
- Decision: Convert existing deprecated billing scenarios to POST and add retirement checks to the same SMTP
  collection. Rationale: Preserve useful billing coverage while proving the removed route has no side effects.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Complete retirement after `module-architecture/11` merges, preserving its implemented structural work.
  Rationale: PR #553 already layers both routes and adds meaningful characterization tests. Retire GET from that
  completed structure while retaining current POST and its command. Do not reverse the dependency or revise the
  prerequisite's historical scope to claim it removed GET.
  Date/Author: 2026-09-07, Codex planning.

## Outcomes & Retrospective

Implemented on `kk/retire-deprecated-verification` from `1635409`, which contains merged PR #553. Authenticated GET
returns the normal `404` without verification or debit. POST retains its existing serialization, authorization,
organization, validation, credit, and tracing contracts. All eight deprecated adapter files and the exclusive
Automapper dependencies are removed. Async and batch delivery, the public module barrel, the browser contract, and
the architecture baseline remain unchanged. No material architectural trade-offs were introduced.

Local checks and the full SMTP runtime collection passed. Issue #556 is assigned to the requesting user and its
Project 9 Status is In Progress. [PR #564](https://github.com/TupoSoft/LeadEmailFinder/pull/564) is assigned to the
requesting user and closes #556 on merge. Implementation and local acceptance are complete.

## Context and Orientation

The implementation baseline is the merged result of `module-architecture/11`. The following paths were verified at
the merged revision above and describe the completed prerequisite.
The business module is `src/libs/modules/email-verification/`, and paths beginning with `src/` below are relative
to that module unless an explicit repository path is given. Its public barrel exports only `EmailVerificationModule`.
The root `src/email-verification.module.ts` directly registers both synchronous controllers, the old mapper profile,
email administration, and persisted-result lookup. It imports `infrastructure/email-verification-core.module.ts`,
the async and batch modules, and credits. The former synchronous composition directories are already absent.

The old controller in
`src/api/http/synchronous-verification/deprecated/old-sync-email-verification.controller.ts` accepts the address as
a query value, requires `verification:run`, invokes `CreditGuard`, and calls `RunSynchronousVerification.execute`
with the authenticated organization. The neighboring `old-sync-email-verification.profile.ts` converts the core
result into the old response.

The replacement controller is `src/api/http/synchronous-verification/current/sync-email-verification.controller.ts`. It accepts
`POST /verify` with JSON `{ "email": "person@example.test" }`, retains the same permission and credit guard, and
serializes `src/api/email-verification-response.dto.ts`. The current response exposes a persisted verification UUID,
`exists: boolean | null`, `catchAll: boolean | null`, and `sources`. The old response instead exposes string-valued
`deliveryStatus` and `catchAll`, omits the UUID, and adds `verifiedAt`. The current `createdAt` decorator permits
conversion into a class only, so it is not a replacement output timestamp. Do not add or rename current fields.

`src/application/delivery/synchronous/run-synchronous-verification.ts` exports the private
`RUN_SYNCHRONOUS_VERIFICATION` token and framework-free command. Its `SynchronousVerificationCore` dependency
contains only `verify`; the command normalizes the email and forwards organization and trace information. Its
`SynchronousVerificationCommand.trace` currently permits `sync` and `deprecated_sync`. The neighboring command
tests cover normalization, successful persistence, forbidden-domain failures, indeterminate outcomes, adapter
failure tracing, and organization isolation. The combined
`src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts` exercises both methods
through that real command over a fake core, real permission and credit guards, and production-equivalent validation
and serialization.

`src/libs/common/src/interfaces/email-verification/verification-trace-context.interface.ts` declares
`deprecated_sync`. The logging adapter at
`src/libs/modules/email-verification/src/infrastructure/verification-trace/logging-verification-trace-observer.ts`
allows this mode, and its neighboring integration suite composes both synchronous controllers. Async workers create
their own `async` or `batch_child` context; GET removal does not change stored jobs.

The API host installs Automapper in `src/lead-email-finder-api/src/lead-email-finder-api.module.ts`. Its three packages
are declared in `package.json`, with overrides in `pnpm-workspace.yaml` and entries in `pnpm-lock.yaml`. Runtime
Swagger comes from `src/lead-email-finder-api/src/openapi/api-document.ts`. The network-denied real-application export
fixture in `scripts/openapi/contracts.test.mjs` already reads both `runtime.json` and `browser.json`.

At implementation start, the ordered `bruno/smtp-dev/08-*` through `12-*` requests establish zero credits, check legacy `402`, add one credit,
verify through GET, and check the final zero balance. `scripts/bruno/run-collection.mjs` initially requires 28 requests
for this collection. Remaining requests exercise SMTP, proxy operations, email administration, persisted-result
lookup, and asynchronous verification.

## Scope and Non-Goals

Remove the deprecated HTTP feature and only its exclusive support. This includes its eight-file layered directory,
registration, trace mode, Automapper dependencies, manual request example, and documentation of current behavior.
Preserve useful coverage by replacing removed scenarios with supported-route and retirement assertions. Retain the
prerequisite's current controller, `RunSynchronousVerification`, core composition, and tests of supported behavior.
Expect no architecture-baseline diff because the prerequisite already removed the relevant debt.

Do not relocate current synchronous delivery or change the verification core, queues, job payloads, SMTP, DNS,
providers, cache, persistence schema, current response DTO shape, configuration, permissions, or credit policy.
Keep the shared validation implementation and its root compatibility export used by async and batch; those delivery
plans own that remaining export. Do not recreate old synchronous modules, barrels, constants, or service-token wiring.
Keep `/verify` in `apps/web/gateway-routes.ts` because POST still uses that prefix. Add no browser screen or operation
to the generated browser contract. Add no migration, backfill, database reset, production rollout, or external vendor
test. Preserve historical completed ExecPlans and the existing read-side `'linkedin'` source compatibility; neither
is a live deprecated endpoint.

## Plan of Work

Read root `AGENTS.md`, `src/libs/modules/AGENTS.md`, the canonical business-module README, and the email-verification
README. Confirm `module-architecture/11` is merged, inspect its final source and `git status`, and preserve unrelated
changes. Recheck every old-route and Automapper reference before editing. Do not implement against the earlier flat
folders or transplant the open prerequisite into this PR. Find the issue with
`gh issue list --label execplan --search "legacy-retirement/01 in:body"`, confirm its exact
`<!-- execplan: legacy-retirement/01 -->` marker, assign it with `gh issue edit <number> --add-assignee @me`, and set its
Project 9 Status to In Progress according to the root workflow. Resolve the status option at runtime. Missing project
scope skips only that Status write, with the prescribed explanation; it does not block local implementation.

Update `src/libs/modules/email-verification/src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts`
in place. Retain its current controller, real `RunSynchronousVerification` injected through
`RUN_SYNCHRONOUS_VERIFICATION`, fake `SynchronousVerificationCore`, fake credit service, real permission and credit
guards, fixture principals, and validation/serialization setup. Remove GET from its successful-method matrix and
remove old response enums and mapper setup. Keep every POST case: `201`, exact exposed fields, authenticated
organization, normalized email, trusted trace, one debit, `401`/`403` without debit, `402` without verification, and
`400` after one debit. The validation cases include malformed input and explicitly blocked DTO hosts such as
`tuposoft.com`. Keep the separate stored-domain and unexpected-adapter cases that currently return generic `500`
after one debit; do not change their error mapping or confuse them with DTO validation.

Delete `src/api/http/synchronous-verification/deprecated/`, including its eight files. Remove only its controller
and profile imports and registrations from `src/email-verification.module.ts`. Keep current POST,
`RUN_SYNCHRONOUS_VERIFICATION`, the command factory, the core module import, async, batch, administration, and
result-reader wiring. Remove `deprecated_sync` from the shared trace type, the observer allowlist, and
`SynchronousVerificationCommand.trace`; the latter now permits only `sync`. Update the command test's two-mode
normalization case to current sync and change its adapter-failure trace fixture to `sync` while retaining all
normalization, failure, result, and isolation assertions. The command's normalization and execution behavior remain
unchanged.

Add authenticated GET-retirement cases to the shared synchronous HTTP suite. They return `404` and observe zero
command, core-verifier, and debit calls, both with available credits and at zero balance. Spy on the real command's
`execute` method without replacing it for POST. Update the suite's Swagger assertion to require no GET operation
and preserve the current POST operation with its non-deprecated status and `201` metadata. Update the existing trace integration suite to keep
current synchronous, async, persistence, request-ID, and privacy checks without the removed controller or profile;
keep its real command wiring. Test the real registered API shape through the SMTP collection as well: an isolated
controller fixture cannot alone prove application registration.

Remove Automapper imports and registration from the API host, shared synchronous HTTP fixture, and trace fixture.
Remove only `@AutoMap` decorators
and their imports from the shared current response DTO. Keep its `@Expose`, validation, and serialization behavior.
Remove the three packages and their three targeted overrides, regenerate the lockfile using the repository's pinned
package manager, and verify that no other package or runtime consumer needs them. Do not manually prune unrelated
lockfile entries or remove `reflect-metadata`, Nest, `class-transformer`, or `class-validator`.

Extend `scripts/openapi/contracts.test.mjs` to assert that the actual exported runtime document contains
`paths['/verify'].post`, lacks `paths['/verify'].get`, and has no old request or response DTO schema. Assert that current
POST response metadata remains present and retain the existing byte-for-byte browser artifact check. Do not hand-edit
the ignored Swagger metadata file or remove `/verify` from gateway routing. The browser snapshot and generated client
must remain unchanged by this retirement.

Convert SMTP requests 08 through 12 to a current POST billing chain, renaming filenames, request names, test prose,
and `smtpLegacyCreditKey` consistently. Keep zero-balance setup, `402`, an idempotent one-credit addition, successful
`201` verification, and a final zero balance. Assert the current response's UUID, boolean catch-all result, reason,
and SMTP exchange instead of its old strings. Insert an authenticated `GET` request while that one credit is available
and a balance read immediately after it: GET returns `404`, the balance stays one, and the subsequent POST consumes
exactly that credit. Preserve sequential execution and existing SMTP/request-ID checks. Update the launcher from
28 to 30 expected requests and update its focused test if it asserts the registered count. Do not weaken checks for
missing, skipped, or failed requests.

Preserve general query redaction. The API-host test
`src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts` has its own synthetic GET controller;
rename that test-only route if its name would imply support for the retired API, while keeping its successful-query
coverage. Add or adapt a missing-route request with a unique sentinel query to prove a retired `GET` response still
returns a server request UUID and never logs raw or encoded input. Keep
`pii-safe-logger-options.spec.ts` coverage for sanitizing requests to `/verify`, including rejected requests.

Update `src/libs/modules/email-verification/README.md`, `bruno/smtp-dev/README.md`,
`docs/privacy/email-verification-processing-contract.md`, and the legacy block in
`src/libs/modules/email-verification/src/reqs.rest`. Document the retirement in current prose without claiming that
old logs or intermediate systems were erased. Run the architecture gate and verify an unchanged baseline. If the
merged source reveals a stale key directly resolved by this retirement, record that evidence before using the
shrink-only updater; remove only evidenced stale entries rather than meeting a predetermined removal count. Keep this
plan's progress and evidence current. Review the diff for
responsibility and dependency-direction violations before creating the single assigned pull request. Use the same
conventional subject for its commit and PR title, and include `Closes #<issue-number>` in the initial PR body.

## Interfaces and Dependencies

`GET /verify` is removed. An authenticated call receives the ordinary JSON API `404`; it cannot verify or debit.
`POST /verify`, `RUN_SYNCHRONOUS_VERIFICATION`, `RunSynchronousVerification.execute`, its core port, and the public
module barrel remain unchanged. `VerificationExecutionMode` loses only `deprecated_sync`, and
`SynchronousVerificationCommand.trace` narrows to `sync`. The three `@automapper/*` packages and exclusive overrides
are removed; current transformation and validation dependencies remain. No storage, provider, or configuration
contract changes. This plan depends on the merged `module-architecture/11` structure and preserves its supported
delivery work; it neither reimplements that refactor nor changes the prerequisite's completed history.

## Acceptance Criteria

- Authenticated GET verification returns `404` with both available and zero credits, invokes no verifier or debit,
  and retains the server request UUID and query-redaction guarantees.
- Supported POST retains its `201` response fields and exact serialization, organization context, permission,
  one-credit charging, rejection statuses, and existing guard/validation order. The prerequisite's command and
  combined HTTP tests retain all supported behavior, including generic `500` domain/adapter failures.
- The retired directory, registration, trace mode, Automapper runtime usage, packages, and exclusive overrides are
  absent. The module's supported sync, async, batch, and result-reader composition still resolves.
- The real runtime OpenAPI export retains POST, omits GET and its old DTO schemas, and leaves both committed browser
  artifacts unchanged. The gateway continues forwarding `/verify` to the API.
- The 30-request SMTP collection executes every request successfully, including unchanged secure SMTP and plaintext
  rejection, POST billing, GET retirement with an unchanged balance, and existing supported workflows. Unavailable
  dependencies are recorded as unverified runtime acceptance, not a passed collection.
- The architecture baseline is unchanged unless newly verified retirement-owned stale debt requires a documented,
  shrink-only removal. Current documentation and request examples describe
  supported behavior; no schema, job protocol, provider approval, historical row, or completed-plan history changes.
- Focused tests, architecture checks, type checking, lint, full tests, build, OpenAPI checks, and diff checks
  pass. Any unavailable runtime evidence is reported separately from these checks.

## Validation

Run the focused HTTP, trace, serializer, and privacy suites from the repository root:

```shell
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/api/http/synchronous-verification src/libs/modules/email-verification/src/application/delivery/synchronous src/libs/modules/email-verification/src/api/verification-result-http.integration.spec.ts src/libs/modules/email-verification/src/infrastructure/verification-trace src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification.controller.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts src/lead-email-finder-api/src/pii-safe-logger-options.spec.ts --runInBand
node --test scripts/openapi/contracts.test.mjs scripts/bruno/run-collection.test.mjs
corepack pnpm openapi:check
corepack pnpm architecture:check
```

Expect no baseline edit. Only if the merged source introduces a directly attributable stale entry and the gate
reports no new violations, document the exact evidence, inspect the proposed removal, then run:

```shell
corepack pnpm architecture:baseline
corepack pnpm architecture:check
```

The retirement inventory must find no executable production consumer or active configuration reference to the old
adapter, trace mode, or Automapper. The directory check must exit zero; the production/configuration search must
return no matches and exit one. Negative test assertions may name retired symbols or schemas to prove their absence;
they must not import, construct, register, or execute the removed implementation. Review remaining test references
with this distinction. Historical prose and generic architecture prohibitions are intentionally outside the search.

```shell
test ! -e src/libs/modules/email-verification/src/api/http/synchronous-verification/deprecated
test ! -e src/libs/modules/email-verification/src/old-sync-email-verification
rg -n 'OldSyncEmailVerification|OldEmailVerificationResponse|old-sync-email-verification|deprecated_sync|@automapper|AutomapperModule|AutoMap' src package.json pnpm-workspace.yaml pnpm-lock.yaml --glob '!**/*.spec.ts' --glob '!**/*.test.ts' --glob '!**/__tests__/**' --glob '!**/*.md'
```

Complete repository validation:

```shell
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm typecheck
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm lint
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm build
git diff --check
```

For runtime validation, follow `bruno/smtp-dev/README.md` against the current checkout's owned disposable stack.
Provision ignored fixture credentials and rebuild the API before the collection; keep external account-discovery
selection disabled. Use the supported launcher, which validates ownership and runs pinned Bruno with
`bru run --env local --sandbox developer` inside the API container:

```shell
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
corepack pnpm bruno:smtp-dev
```

Record all 30 executed requests and the actual passing test count. This proves local HTTP, credit, and SMTP fixture
wiring, not real-world provider acceptance. If dependencies are unavailable, record the cause and leave Bruno
execution explicitly unverified. The implementation's final response must state `Bruno: added/updated and <result>`.
Planning-time validation does not count as these future implementation checks.

## Idempotence and Recovery

No data changes occur, so this task needs no migration, reset, or reseed. Repeating GET retirement checks creates no
verification or credit entry. The converted credit fixture keeps its existing idempotency mechanism and deterministic
balance setup, making the local sequence repeatable. If interrupted, inspect current source and dependency diffs and
finish or restore only this task's changes; do not restore obsolete code as an unregistered compatibility copy. Use
the pre-change revision to revert the single retirement change if necessary, preserving unrelated work. Stop or
rebuild only containers whose ownership matches this checkout.

## Artifacts and Notes

Record the prerequisite's merged revision, eight removed files, unchanged baseline or justified exact removals,
final dependency inventory, counts from HTTP and runtime OpenAPI tests,
unchanged browser artifacts, and 30-request Bruno report. The observable outcome fits one PR:
retired GET behavior and the removal of its exclusive support. No additional product choice is required, and all
automated contract checks can run without provider activation. The required structural work belongs to the merged
prerequisite and is retained. Inspection of merged PR #553 supplied planning evidence only; its reported test results are
not validation of this retirement, and no retirement runtime check has been run while drafting this plan.

### Implementation Evidence (2026-09-07)

- The prerequisite is merged as `72a5a259100eb78894b49a6731841257e041e2ce` and is an ancestor of this checkout.
  Issue #556 has assignee `KyryloKupin` and the directly verified Project 9 Status `In Progress`.
- Deleted all eight files under `api/http/synchronous-verification/deprecated/`: the enums, query DTO, response DTO,
  response interface, controller, controller specification, HTTP integration specification, and mapper profile.
  The production/configuration retirement search in Validation returned no matches (exit 1); both removed-directory
  checks passed. Remaining retired-mode references are negative test assertions.
- `corepack pnpm install --no-frozen-lockfile --store-dir /home/kyrylo/.cache/codex/pnpm-store` succeeded with pinned
  pnpm 10.33.0. The regenerated lockfile removes only Automapper entries and overrides. Shared transformation,
  validation, and reflection packages remain. The existing Bruno dependency has a peer-version warning.
- The exact focused Jest command in Validation passed 9 suites and 119 tests. The synchronous HTTP suite retains
  all 16 POST cases and adds two retired GET cases plus the Swagger assertion. The retirement cases observe zero calls to the real command,
  core verifier, or credit debit. Request logging tests preserve the server UUID and conceal raw and encoded queries.
- `node --test scripts/openapi/contracts.test.mjs scripts/bruno/run-collection.test.mjs` passed 15 tests.
  The real runtime export contains POST and its current DTO metadata, with no GET operation or old DTO schemas.
  `corepack pnpm openapi:check` passed. Both tracked browser artifacts and the gateway file are unchanged.
- `corepack pnpm architecture:check` passed for 9 modules and 20 existing baseline entries; the baseline has no diff.
  Type checking and build passed; build compiled 604 files. Lint passed with one existing missing-return-type warning
  in `src/libs/config/src/load-secrets.spec.ts`. The SOLID and dependency-direction review found no material trade-off.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test:ci` passed 213 Jest suites and 2343 tests; 13 suites and 80 tests
  requiring optional runtime inputs were skipped. Its separate runner tests passed all 47 cases.
- Docker initially had no containers or volumes. The supported development reset provisioned this checkout's stack
  and passed its authenticated smoke test. The Docker build needed writable `BUILDX_CONFIG=/tmp/issue-556-buildx` on this host.
  After rebuilding the SMTP overlay, the first proxy bootstrap received connection refusal from the starting API.
  The first Bruno attempt failed; retrying the existing idempotent bootstrap after API health succeeded.
- `corepack pnpm bruno:smtp-dev` then passed all 30 requests and 61 tests with no skipped requests. The collection
  proves POST billing, retired GET with an unchanged available credit, STARTTLS success, plaintext rejection,
  proxy restoration, result lookup, and preserved async behavior. API log inspection found no raw or encoded fixture
  addresses; the plaintext-rejection request had no envelope-command log. This is local fixture evidence only.
- `corepack pnpm docs:lint -- .agents/plans/legacy-retirement/01-retire-deprecated-verification.md src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md docs/privacy/email-verification-processing-contract.md`
  passed all four files. `git diff --check` passed. An independent review found no actionable issues.

## Plan readiness

Ready to implement
