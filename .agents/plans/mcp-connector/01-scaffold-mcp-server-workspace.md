# Scaffold the MCP Connector Workspace

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Today there is no MCP (Model Context Protocol) server anywhere in this repository. After this plan, a new
workspace package, `apps/mcp-server`, exists as a runnable, lint/typecheck/test-covered, CI-covered Node process
that speaks MCP over Streamable HTTP and exposes exactly one placeholder tool (`ping`), with no authentication yet
(that arrives in `mcp-connector/02`). A developer can observe success by running the server locally and calling
`tools/list`/`tools/call` against it with the official MCP Inspector CLI, and by seeing `corepack pnpm lint`,
`corepack pnpm typecheck`, and `corepack pnpm test` all pick up and pass against the new package with zero new
per-package CI YAML beyond the two install/typecheck fixes this plan makes.

This plan exists to prove every piece of shared repository plumbing (pnpm install filtering, the root typecheck
chain, CI path-based validation selection, and Jest's ability to resolve and execute the real
`@modelcontextprotocol/sdk` package under this repo's CommonJS `@swc/jest` setup) before any real business
capability is built on top in later plans. Getting this scaffold wrong would otherwise surface as a confusing
failure deep inside `mcp-connector/03` or later.

## Progress

- [ ] (2026-09-16) Not started.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: `apps/mcp-server` is a plain Node/TypeScript package using the official `@modelcontextprotocol/sdk`
  directly, not a NestJS application. Rationale: it has no dependency-injection needs beyond a couple of
  constructor-injected collaborators (a token cache and an API client, added in later plans), no ORM, and no
  business logic of its own — it is a thin protocol bridge. `apps/web` already establishes the precedent that an
  `apps/*` package outside the core monolith uses whatever framework actually fits (React/Vite for the frontend),
  not a forced NestJS shape. Date/Author: 2026-09-16, Codex planning.
- Decision: Host the MCP transport on plain Node `node:http`, not Express. Rationale:
  `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` operates directly on `IncomingMessage`/
  `ServerResponse` and is documented to work with a raw `http.Server`; Express is a common example in the SDK's
  own docs, not a requirement. No `express` dependency exists anywhere else in this repository outside `apps/web`'s
  own frontend tooling, and adding one here would be an unnecessary dependency for a single-route server.
  Date/Author: 2026-09-16, Codex planning.
- Decision: `apps/mcp-server`'s `package.json`/`tsconfig.json` are standalone (mirroring `packages/api-client`),
  not extensions of the root `tsconfig.base.json`. Rationale: the root base config targets the CommonJS,
  decorator-heavy NestJS app; this package is a plain ESM Node package with no decorators, and
  `packages/api-client` already establishes the standalone-config pattern for a workspace member outside the core
  app. Date/Author: 2026-09-16, Codex planning.
- Decision: Fix the CI install-filter and root-typecheck gaps in this same plan rather than deferring them.
  Rationale: every later plan's CI signal (lint/typecheck/test) is meaningless until these are fixed; discovering
  the gap in a later plan would force reopening this one anyway. Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All paths below are repository-relative.

**Workspace layout.** `pnpm-workspace.yaml` declares `packages: ['apps/*', 'packages/*']`. The real backend is
**not** Nest-CLI monorepo mode: `nest-cli.json` sets `sourceRoot: "src"` and has no `projects` field, so the live
NestJS application is root `src/main.ts` + `src/libs/modules/*`. Of the existing `apps/*` directories,
`apps/api-key`, `apps/async-email-verification-worker`, `apps/lead-email-finder`, `apps/lead-email-finder-api`,
and `apps/proxy` each contain only orphaned `.proto` files from a retired gRPC-microservices design — nothing
live. Only `apps/web` is a real, independently configured pnpm workspace application (own `package.json`,
`tsconfig.json`, `eslint.config.mjs`, Vitest config). `apps/mcp-server` becomes the second real one.

`packages/api-client` (`@tuposoft/lead-email-finder-api-client`) is the concrete precedent for a standalone
workspace package: `package.json` has `"private": true`, `"type": "module"`, an `exports` map pointing at
`src/index.ts`, and a `build` script running `tsc -p tsconfig.json`. Its `tsconfig.json` does not extend
`tsconfig.base.json`; it declares its own complete `compilerOptions` (`target: ES2022`, `module`/
`moduleResolution: NodeNext`, `strict: true`, `rootDir: src`, `outDir: dist`, `include: ["src"]`).

**Root pipelines that already auto-discover new packages.** `jest.config.ts`'s `testRegex` is
`'.*\.spec\.ts$'` with only `testPathIgnorePatterns: ['<rootDir>/apps/web/']` (and the matching
`coveragePathIgnorePatterns`) — no other path is excluded, so a new `apps/mcp-server/**/*.spec.ts` is picked up by
plain `corepack pnpm test` automatically. `eslint.config.mjs`'s `ignores` list is
`['eslint.config.mjs', 'apps/web/**', 'docker/scripts/**', '**/dist/**', 'deploy/**', '**/metadata.ts',
'packages/api-client/src/schema.d.ts']` — again nothing excludes a new `apps/mcp-server/**`, and
`tseslint.configs.recommendedTypeChecked`'s `parserOptions.projectService: true` auto-discovers any `tsconfig.json`
found under the repo, exactly how `packages/api-client` already lints cleanly with no dedicated override block.

**Root pipelines that do NOT already cover a new package (the two gaps this plan fixes).**

1. Root `tsconfig.json`'s `include` is `["src/**/*.ts", "scripts/**/*.ts", "jest.config.ts"]` — it does not cover
   `apps/**`, so root `corepack pnpm typecheck` (`tsc --noEmit -p tsconfig.json`) will never see a type error
   inside `apps/mcp-server` on its own.
2. `.github/workflows/validate.yml`'s `backend` job installs dependencies with
   `corepack pnpm --filter @tuposoft/lead-email-finder... --filter @tuposoft/lead-email-finder-api-client...
   install --frozen-lockfile` (confirmed at the job's "Install dependencies" step). The `...` filter pnpm uses here
   includes a package's dependents and dependencies, but `apps/mcp-server` will have no `package.json` dependency edge to
   either `@tuposoft/lead-email-finder` (the root package) or `@tuposoft/lead-email-finder-api-client` — it is an
   unrelated sibling workspace member. Under this filter, `apps/mcp-server`'s own dependencies (including
   `@modelcontextprotocol/sdk`) will not be installed, so anything in the `backend` job that touches it (lint,
   typecheck, test) will fail to resolve its imports. The `repository-policy` and `contract` jobs install with the
   identical filter but do not currently run lint/typecheck/test against arbitrary backend paths, so they are
   lower-risk; verify this remains true when implementing.

**CI path selection.** `scripts/ci/select-validation.mjs` decides which CI job categories a given changed-file set
triggers. It has a `backendPrefixes` list (existing entries include things like `scripts/testing/`,
`scripts/bruno/`) and falls through to running every consumer when a path matches none of its known
categories — meaning a new `apps/mcp-server/**` path would currently (safely, but wastefully) trigger everything.
Adding it to `backendPrefixes` scopes CI correctly. `scripts/ci/validation-fixtures.json` holds the test fixtures
for this script; extend it with one new case.

**MCP SDK.** `@modelcontextprotocol/sdk` (the official TypeScript SDK) exports `McpServer` (the high-level
tool-registration API) and `StreamableHTTPServerTransport` (the current recommended remote-HTTP transport,
superseding the older plain-SSE transport). Confirm the exact current published version and its `exports` map
covers the subpaths used (typically `@modelcontextprotocol/sdk/server/mcp.js` and
`@modelcontextprotocol/sdk/server/streamableHttp.js`) when adding the dependency — this repo's Jest runs
CommonJS via `@swc/jest` (no `--experimental-vm-modules`), so a spec that imports the SDK is the first real proof
that this works here; do not assume it from the SDK's own docs alone.

## Scope and Non-Goals

This plan creates the package skeleton, one smoke-test tool, and the shared CI plumbing fixes. It does not add
authentication (plan 02), does not call the real LeadEmailFinder API (plan 03 onward), and does not add a
Dockerfile or Compose service (plan 06). Do not add speculative tool scaffolding, a generic "tool registry"
abstraction, or any dependency beyond `@modelcontextprotocol/sdk` and `@types/node` — later plans add exactly the
dependencies they need when they need them.

## Plan of Work

Create `apps/mcp-server/package.json`: name `@tuposoft/lead-email-finder-mcp-server`, `"private": true`,
`"type": "module"`, dependency `@modelcontextprotocol/sdk` (pin the current published version), dev dependencies
`typescript` and `@types/node` matching versions already used elsewhere in the repo, scripts `"build": "tsc -p
tsconfig.json"` and `"start": "node dist/main.js"`.

Create `apps/mcp-server/tsconfig.json` mirroring `packages/api-client/tsconfig.json`'s standalone shape
(`target: ES2023` to match this repo's other Node code, `module`/`moduleResolution: NodeNext`, `strict: true`,
`skipLibCheck: true`, `rootDir: src`, `outDir: dist`, `include: ["src"]`; omit DOM libs — this package never runs
in a browser).

Create `apps/mcp-server/src/create-server.ts` exporting a factory function that constructs an `McpServer` instance
(name and version read from the package's own `package.json` or a literal constant) and registers one tool,
`ping`, taking no input and returning a fixed text content result (e.g. `"pong"`). Keep this file free of any
transport or HTTP concern — it only builds and returns the configured `McpServer`.

Create `apps/mcp-server/src/main.ts`: a plain `node:http` server. `GET /health` returns `200` with a small JSON
body (e.g. `{status: "ok"}`) for container health checks (used starting in plan 06). Any other request is handed to
a `StreamableHTTPServerTransport` connected to the server built by `create-server.ts`, mounted at `POST /mcp` (and
`GET`/`DELETE /mcp` as the transport's session-management protocol requires — follow the SDK's documented request
routing for this transport exactly). Read the listen port from an environment variable (e.g. `PORT`, default
`3002` — confirm this does not collide with any port already published in `docker/compose.yaml` before finalizing
the default). Log startup only; never log request bodies or headers at this stage (there is nothing sensitive yet,
but establish the discipline now since later plans add real credentials).

Create `apps/mcp-server/src/create-server.spec.ts`: a Jest spec that builds the server, starts it on an ephemeral
port (`listen(0)`), issues a real `GET /health` request via the global `fetch`, and asserts a `200` with the
expected body; then issues a minimal MCP `tools/list` JSON-RPC request against `/mcp` and asserts the response
lists exactly one tool named `ping`. This spec is the proof that Jest can resolve and execute code importing the
real `@modelcontextprotocol/sdk` in this repository's Jest configuration — if it cannot, resolve that here (e.g.
by adjusting how the SDK is imported, not by adding a Jest `moduleNameMapper` workaround that would mask the same
problem for every later plan).

Edit root `package.json`'s `typecheck` script from `"tsc --noEmit -p tsconfig.json"` to
`"tsc --noEmit -p tsconfig.json && tsc --noEmit -p apps/mcp-server/tsconfig.json"`, following the existing
precedent of chaining shell commands with `&&` already used elsewhere in this repository's scripts.

Edit `.github/workflows/validate.yml`'s `backend` job "Install dependencies" step to add
`--filter @tuposoft/lead-email-finder-mcp-server...` alongside the existing two filters. Check whether the
`repository-policy` or `contract` jobs' steps actually touch `apps/mcp-server` (e.g. via a repo-wide lint/typecheck
invocation) and apply the same filter fix there only if they do — do not change jobs that never need it.

Edit `scripts/ci/select-validation.mjs` to add `'apps/mcp-server/'` to `backendPrefixes` (matching the existing
entries' shape). Add one corresponding case to `scripts/ci/validation-fixtures.json` asserting a path under
`apps/mcp-server/` selects the `backend` consumer (and not, e.g., `web` or `images`, unless a genuine reason
requires it — confirm against the existing fixture file's conventions).

Run `pnpm install` at the repo root to regenerate `pnpm-lock.yaml` with the new workspace member and its
dependency.

## Interfaces and Dependencies

New workspace package `@tuposoft/lead-email-finder-mcp-server` at `apps/mcp-server`, depending on
`@modelcontextprotocol/sdk`. New root script chain in `typecheck`. New CI install filter in the `backend` job (and
possibly `repository-policy`/`contract`, pending verification). New `backendPrefixes` entry in
`scripts/ci/select-validation.mjs`. No changes to any existing business module, controller, or public API.

## Acceptance Criteria

- `corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile` succeeds from a
  clean checkout.
- `corepack pnpm typecheck` fails when a deliberate type error is introduced in `apps/mcp-server/src/main.ts`, and
  passes once it is fixed — proving the new `tsc` invocation actually runs.
- `corepack pnpm lint` passes with no new entry added to `eslint.config.mjs`'s `ignores` list.
- `corepack pnpm test` discovers and passes `apps/mcp-server/src/create-server.spec.ts`.
- Running `pnpm --filter @tuposoft/lead-email-finder-mcp-server start` boots the server; `curl
  http://localhost:<port>/health` returns `200`; `npx @modelcontextprotocol/inspector --cli
  http://localhost:<port>/mcp --transport streamable-http --method tools/list` lists exactly one tool, `ping`, and
  `--method tools/call --tool-name ping` returns the fixed text result.
- `node scripts/ci/select-validation.mjs --fixtures` passes with the new fixture case.

## Validation

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm exec jest --runInBand apps/mcp-server/src/create-server.spec.ts
node scripts/ci/select-validation.mjs --fixtures
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start &
sleep 1 && curl -sf http://localhost:3002/health
npx --yes @modelcontextprotocol/inspector --cli http://localhost:3002/mcp --transport streamable-http --method tools/list
npx --yes @modelcontextprotocol/inspector --cli http://localhost:3002/mcp --transport streamable-http --method tools/call --tool-name ping
corepack pnpm docs:lint -- .agents/plans/mcp-connector/01-scaffold-mcp-server-workspace.md
```

Stop the server process running in the background after manual validation. No container or database is required for this plan.

## Idempotence and Recovery

Rerunning `pnpm install` is always safe. If the scaffold needs to be redone, delete `apps/mcp-server` and revert
the three touched shared files (`package.json`, `.github/workflows/validate.yml`,
`scripts/ci/select-validation.mjs` and its fixtures file) — nothing here persists any state or touches a database,
so no reset/reseed procedure is needed. `corepack pnpm dev:reset` is unrelated to this plan and must not be run as
part of it.

## Artifacts and Notes

Read `packages/api-client/package.json` and `packages/api-client/tsconfig.json` directly before writing the new
package's own files, to keep the two standalone-package conventions consistent rather than inventing a third
shape.

## Plan readiness

Ready to implement
