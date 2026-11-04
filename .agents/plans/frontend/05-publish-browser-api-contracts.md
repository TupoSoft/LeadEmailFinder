# Publish Browser API Contracts and a Generated Client

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Create one reproducible boundary between the NestJS API and browser code before feature screens proliferate. A
developer can export the running API's normalized OpenAPI document, regenerate a typed client package, and prove that
the web app calls the current-account operation through one cookie and CSRF-aware transport. Swagger moves away from
the product root, contract drift fails validation, and browser code contains no handwritten copies of server DTOs.

## Progress

- [x] (2026-09-06) Confirmed all prerequisites, assigned issue #500, and moved its project item to In Progress.

- [x] (2026-09-06) Made full runtime Swagger and filtered browser export share one annotated source.
- [x] (2026-09-06) Moved Swagger UI to `/docs` and published normalized JSON at `/openapi.json`.
- [x] (2026-09-06) Documented only the initial BFF/current-account and health browser operations.
- [x] (2026-09-06) Added the generated `packages/api-client` workspace and reproducible root scripts.
- [x] (2026-09-06) Added the web-owned same-origin cookie and CSRF transport with focused tests.
- [x] (2026-09-06) Added required contract/client CI and repository documentation.
- [x] (2026-09-06) Ran generation twice, focused tests, architecture, prose, and repository validation.

## Plan dependencies

- `frontend/01`
- `frontend/03`
- `frontend/04`

## Surprises & Discoveries

- (2026-09-06) The initial browser routes have the `/v1/auth` prefix. The three prerequisite plans are complete.
- (2026-09-06) A clean workspace install exposed an undeclared `tsconfig-paths` dependency required by the root
  TypeScript runner. It is now an explicit development dependency.

- `src/main.ts` currently creates the Swagger document and mounts its UI at `/`, which conflicts with the public
  product route delivered by `frontend/01` once both are served through one origin.
- `src/lead-email-finder-api/src/generate-metadata.ts`, `nest-cli.json`, and the `Makefile` contain stale generation
  paths that do not match the current repository layout.
- Swagger currently scans the whole application, so payments, verification, and proxy operations already appear in
  the runtime document. A browser snapshot cannot rely on those controllers being excluded.

## Decision Log

- Decision: Read the shared Swagger plugin options from `nest-cli.json` and load generated metadata in both paths.
  Use the package manifest as the API version source, including when Node starts the compiled API directly.
  Rationale: Preview export and the compiled runtime produce the same document without depending on shell metadata.
  Date/Author: 2026-09-06, implementation.
- Decision: Model CSRF as the existing header security scheme, combined with cookie authentication, without a
  redundant required header parameter.
  Rationale: The browser transport supplies the header; generated callers must not duplicate this responsibility.
  Date/Author: 2026-09-06, implementation.
- Decision: Exclude only Nest's generated `src/metadata.ts` aggregate from architecture scanning and hide the
  already-excluded `ProxyDto.auth` property from the Swagger plugin.
  Rationale: Generated DTO imports are metadata, while the proxy response intentionally never contains credentials.
  Other files named `metadata.ts` still undergo the normal architecture checks.
  Date/Author: 2026-09-06, implementation.

- Decision: Build a full runtime document and an explicitly filtered browser document from one reusable API-host
  function, one metadata builder, and the same annotated route/DTO source.
  Rationale: Runtime documentation must not lose existing operations, while the generated browser contract must grow
  only through reviewed route-method entries rather than by scanning every controller implicitly.
  Date/Author: 2026-08-31, project planning.
- Decision: Serve the full Swagger UI at `/docs` and the filtered browser JSON at `/openapi.json`.
  Rationale: `/` belongs to the product; developers retain complete human documentation, and browser generation gets
  one stable machine contract without scraping HTML.
  Date/Author: 2026-08-31, project planning.
- Decision: Configure Swagger UI with `raw: false` and publish only the explicitly owned `/openapi.json` document.
  Rationale: `@nestjs/swagger` otherwise registers `/docs-json` and `/docs-yaml` sibling endpoints that the gateway
  route map and browser contract do not own.
  Date/Author: 2026-08-31, project planning.
- Decision: Limit the initial snapshot to BFF login, callback, logout, current account, and health.
  Rationale: Each later feature plan should expose and validate the operations it actually consumes instead of
  declaring the entire legacy API browser-ready.
  Date/Author: 2026-08-31, project planning.
- Decision: Maintain an exact route-method or stable-operation-ID allow list, regression-test both included and
  excluded operations, and retain only components transitively reachable from the included surface.
  Rationale: The existing full document contains later-slice controllers, so browser filtering must be affirmative
  and exclude unlisted operations and their schemas by default instead of depending on controller annotations that
  are not present.
  Date/Author: 2026-08-31, project planning.
- Decision: Commit normalized JSON and generated TypeScript in `packages/api-client` using `openapi-typescript` and
  `openapi-fetch`.
  Rationale: Both backend-only and frontend-only changes can compile independently, and reviewers can see contract
  drift in a normal diff.
  Date/Author: 2026-08-31, project planning.
- Decision: Keep browser transport in `apps/web`, not the generated package.
  Rationale: Relative origin, cookies, and readable CSRF-cookie behavior are application concerns; the generated
  package stays transport-neutral.
  Date/Author: 2026-08-31, project planning.
- Decision: Define `openapi:export`, `openapi:generate`, and `openapi:check` as the only generation commands and
  `packages/api-client/src/schema.d.ts` as the only generated TypeScript output.
  Rationale: Later ExecPlans and CI need one exact command/path contract rather than competing package scripts.
  Date/Author: 2026-08-31, project planning.
- Decision: Make `openapi:check` read-only by generating both artifacts in a temporary directory and comparing
  them byte for byte with the committed outputs.
  Rationale: A drift check must detect missing or untracked required outputs without first overwriting the evidence
  it is supposed to compare.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Delivered the five-operation browser contract, generated client package, same-origin browser transport, and typed
current-account adapter. Full Swagger documentation remains available at `/docs`; the normalized filtered contract
is at `/openapi.json`, with no root UI or implicit Swagger JSON/YAML routes. Both generation commands are repeatable;
the check rejects missing, untracked, and stale artifacts without repairing them. Compiled metadata and offline
export were compared and produced identical normalized browser documents.

Validation passed: 1,807 repository Jest tests, 15 runner tests, six contract-tooling tests, and 45 web tests. The
repository suite skipped 65 tests across 11 suites that require separately configured integration environments.
API, client, and web builds, type checks, lint, and the architecture gate passed. Root lint retains one preexisting
return-type warning in `load-secrets.spec.ts`. Two successive drift checks passed with identical Git status output.

Bruno coverage now has 13 requests and 14 assertions. The actual pinned CLI passed against the existing synthetic
runner fixture. Live stack execution remains unverified because this checkout has no development-stack or credential
metadata under `.dev/keycloak`. No gateway, database, or production deployment change belongs to this plan.

## Context and Orientation

`frontend/01` creates `apps/web` and the pnpm workspace. `frontend/03` defines the human current-account contract,
and `frontend/04` defines the authorization-response contract that forms the first authenticated browser surface.
The API remains directly runnable before the gateway in `frontend/06`; this plan changes its documentation paths
and generation behavior, not its host-port topology.

The current API bootstrap in `src/main.ts` owns global pipes, serialization, guards, Swagger, and application startup.
Metadata generation must load the same Swagger plugin metadata and DTO configuration. A normalized snapshot removes
environment-specific server values and unstable object ordering while preserving every semantic schema field.

The opaque `lef_session` cookie is HTTP-only. Browser code may read only `lef_csrf_token` and must send its decoded
value as `x-csrf-token` on unsafe cookie-authenticated methods. `auth/12` remains the authoritative server guard.

## Scope and Non-Goals

This pull request repairs Swagger/bootstrap reuse and metadata paths and establishes `/docs` and `/openapi.json`. It
consumes the source schemas owned by Plans 03 and 04 through an exact browser allow list, creates the generated
API-client workspace, adds exact generation/drift scripts, implements the web transport factory, and adds focused
tests and CI.

It does not add Nginx, a Vite proxy, Docker images, Compose topology, path-aware multi-job CI, feature screens,
controller contracts beyond the initial BFF and health slice, CORS, OAuth token storage, React query state, production
hosting, or database changes. Those concerns belong to `frontend/06`, `frontend/07`, `frontend/08`, and later verticals.

## Plan of Work

Extract Swagger document construction from `src/main.ts` into one API-host helper used by runtime bootstrap and
metadata export. Keep title, version, global prefix behavior, bearer security, cookie security, DTO metadata, and
global serialization identical. Produce a complete runtime document for Swagger UI and derive the browser document
through a checked exact allow list. Mount the full UI at `/docs` with `raw: false` and filtered JSON at
`/openapi.json`; assert `/docs-json` and `/docs-yaml` are not registered. Correct the
metadata generator, Nest configuration, and `Makefile` paths to the repository's actual source and TypeScript
configuration.

Remove `@ApiExcludeController()` from `HealthController`, add the exact response annotation, and include only its
health operation in the browser allow list. Do not remove that exclusion from any other controller merely to make
filtering easier.

Build metadata in a dedicated child-process entry point. It installs a complete fixed, nonsecret configuration
fixture before dynamically importing `LeadEmailFinderApiModule` from
`src/lead-email-finder-api/src/lead-email-finder-api.module.ts`. It creates the Nest application in metadata/preview
mode, never listens or connects to PostgreSQL, Redis, S3, SMTP, Keycloak, or payment providers, and closes cleanly.
Keep normal runtime environment validation unchanged. Tests must clear ambient environment variables, prove the
exporter still works from only that fixture, and fail if a lifecycle provider or socket is instantiated.

Describe the initial browser contract precisely: BFF login, callback, logout, current account, and health. Assert
request/query types, redirect statuses, cookie security, CSRF requirements, the nullable-email account schema,
service-client-bearer `403` response, unusable-membership `401` response, stable callback codes, and the absence of
tokens, credential identifiers, and session storage fields. Give included operations stable identifiers. Assert that
the full runtime document still contains representative payment, verification, and proxy operations while the
browser document excludes all of them until their owning feature plans extend the allow list.

After filtering path-method entries, rebuild `components` from the local references transitively reachable from the
kept paths, path-level parameters, request/response bodies, callbacks, links, and retained global or operation
security requirements. Follow `$ref` values to a fixed point with a visited set so cycles are safe, preserve only the
referenced security schemes, and fail on an unresolved local reference. Drop unreferenced schemas, parameters,
responses, request bodies, headers, examples, links, callbacks, security schemes, webhooks, and tags rather than
copying the full document's `components` wholesale. Add sentinel contracts reachable only from excluded payment,
verification, and proxy operations and prove they are absent from normalized JSON and generated `components`, while
every retained reference resolves.

Export the normalized browser document derived from runtime metadata to
`packages/api-client/openapi/lead-email-finder.json`. Normalization sorts keys
deterministically and removes environment-specific host values without altering schemas. Create private workspace
package `@tuposoft/lead-email-finder-api-client`. Generate `src/schema.d.ts` with `openapi-typescript`, expose the
transport-neutral typed `openapi-fetch` client surface, and begin generated files with a do-not-edit command header.

Add root and package scripts with these semantics:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check

`openapi:export` writes only normalized browser JSON from the real application document to the committed snapshot.
`openapi:generate` writes only `packages/api-client/src/schema.d.ts` from that checked-in snapshot. `openapi:check`
creates a unique temporary directory, exports normalized browser JSON there, generates TypeScript from that temporary
snapshot, and compares both temporary artifacts byte for byte with the committed paths. It fails when either
committed artifact is missing or differs and leaves the repository untouched. The update workflow is explicitly
`openapi:export`, then `openapi:generate`, then `openapi:check`.

In `apps/web`, add one API-client factory using a relative base URL and `credentials: 'same-origin'`. Add middleware
that normalizes the HTTP method, reads only `lef_csrf_token` from `document.cookie`, and sets `x-csrf-token` for
`POST`, `PUT`, `PATCH`, and `DELETE`. It does not add the header to safe methods, overwrite an explicit caller header,
read `lef_session`, log cookie values, or persist either cookie. Compile one narrow current-account smoke adapter
against generated types without implementing the application shell.

Add unit tests for cookie parsing, encoded values, absent tokens, safe and unsafe methods, explicit header
preservation, and no secret logging. Add API contract tests for exact paths/schemas/security and excluded controllers.
Extend the existing Validate workflow with unconditional contract export/generation drift and API-client build checks;
`frontend/07` may make job selection path-aware while preserving required check names.

## Interfaces and Dependencies

The API exposes full human documentation at `/docs` and filtered normalized browser JSON at `/openapi.json`. The committed source
snapshot is `packages/api-client/openapi/lead-email-finder.json`; generated TypeScript is
`packages/api-client/src/schema.d.ts`. No `src/generated` directory or package-level `generate` command exists.

`packages/api-client` exports generated `paths`, `components`, and related schema types plus a transport-neutral
`openapi-fetch` client type. `apps/web` owns the relative base URL, same-origin credentials, and CSRF middleware.

This plan depends on the web workspace from `frontend/01`, account source DTOs from `frontend/03`, and
authorization-response source DTOs from `frontend/04`. It adds pinned `openapi-typescript` and `openapi-fetch`
workspace dependencies and no external hosted service.

## Acceptance Criteria

- Full runtime Swagger and filtered browser export use shared metadata and annotations plus the same serialization
  and security configuration; only the checked operation allow list differs.
- `/docs` serves the full Swagger UI, `/openapi.json` serves filtered browser JSON, and API `/` no longer owns the
  product path. Swagger's implicit `/docs-json` and `/docs-yaml` routes do not exist.
- The initial snapshot contains only the BFF/current-account and health operations required by this slice. It
  describes nullable email, service-client and unusable-membership rejection, authorization-response codes, cookies,
  and CSRF without secret fields.
- The browser snapshot contains only components transitively reachable from allowed operations. Excluded operation
  sentinels and schemas are absent from JSON and generated TypeScript, and every retained local reference resolves.
- Health is explicitly present in runtime and browser documents after removing its controller exclusion. Metadata
  export succeeds from a clean environment through the nonsecret preview bootstrap and opens no network connection.
- Representative payment, verification, and proxy operations remain in full runtime documentation but are absent
  from the initial browser snapshot; an unlisted operation cannot appear silently.
- `openapi:check` compares temporary regenerated JSON and TypeScript with committed artifacts, detects missing or
  stale outputs, leaves the worktree unchanged, and fails CI on drift.
- `packages/api-client` builds independently, and `apps/web` type-checks its current-account smoke adapter without a
  handwritten server DTO.
- Browser calls use relative URLs and same-origin credentials. Unsafe methods add the CSRF header; safe methods do
  not. Browser code never reads `lef_session` or stores an OAuth token.
- Later feature plans extend the exact browser allow list when they publish their source contracts; runtime Swagger
  remains complete throughout.
- Focused API/transport tests, package builds, CI checks, docs lint, architecture checks, and patch validation pass in
  one pull request.

## Validation

Update the committed artifacts once, then prove the read-only check is stable:

    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm openapi:check

Run focused source and browser-transport checks, then package/repository validation:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- openapi browser-api-client csrf --runInBand
    corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
    corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm architecture:check
    git diff --check

Start the API directly only when required by the exporter and capture `/docs` and `/openapi.json` status/content type.
Capture `git status --short` immediately before and after the two check commands and prove they are identical. Record
the intended generated diff from the update commands. No gateway or Compose browser test is required in this plan.

## Idempotence and Recovery

The two update commands overwrite only the normalized snapshot and generated schema and are safe to repeat. The
check command writes only to a unique temporary directory and removes it after comparison. Never hand-edit generated
output. If an update stops partway, repair the source DTO/decorator or generator, rerun `openapi:export` and
`openapi:generate`, inspect the intended diff, then run `openapi:check`; do not suppress drift.

Build, unit, and type checks create only ignored output. This plan has no persistent data or Docker cleanup. If a
temporary API process is used, stop only that process and retain safe logs on failure.

## Artifacts and Notes

Implementation artifacts are `packages/api-client/openapi/lead-email-finder.json`,
`packages/api-client/src/schema.d.ts`, `scripts/openapi/`, and `apps/web/src/api/`. Versions are
`openapi-typescript@7.13.0` and `openapi-fetch@0.17.0`. The generated TypeScript header names
`corepack pnpm openapi:generate` as its update command. Stage newly created artifacts before their first drift check.

Additional focused validation:

    node --test scripts/openapi/*.test.mjs
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
    corepack pnpm --filter @tuposoft/lead-email-finder-web lint
    corepack pnpm --filter @tuposoft/lead-email-finder-web build

The filter tests cover every retained local reference and generated sentinel exclusion. Export tests start from an
empty environment, reject TCP/UDP/DNS access, and exercise the provider-construction canary. HTTP tests verified
`200 text/html` at `/docs`, `200 application/json` at `/openapi.json`, and `404` at the three removed paths.
The architecture gate passed after a Nest build with its ignored metadata aggregate present.

Record the initial path/security matrix, normalized snapshot diff, generated-file header, exact package versions,
focused test counts, and two-run drift result. Never record cookies, CSRF values, authorization codes, tokens, client
secrets, raw environment dumps, or provider payloads.

The Swagger source, initial operation boundary, normalized artifact, generated output path, script contract,
transport behavior, validation, and one-pull-request scope are decision-complete.

## Plan readiness

Ready to implement.
