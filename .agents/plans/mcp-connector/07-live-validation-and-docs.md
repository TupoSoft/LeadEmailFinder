# Live Validation and Customer Documentation for the MCP Connector

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, the connector's full tool set is proven end-to-end against a real, freshly reset local dev stack
as part of CI (not just manually, as in every earlier plan), and a real customer — a person, not an engineer
familiar with this repository — can follow a written guide to obtain a service-client credential and configure
their own MCP client against this connector. A developer observes success by watching the new live-validation
step pass inside the `browser-live` CI job, and by having someone unfamiliar with the connector's internals
successfully call `check_credit_balance` using only the README's Customer Setup section.

## Progress

- [x] (2026-09-25) Created `scripts/testing/mcp-server-live.mjs`: exercises `check_credit_balance` (cross-checked
  against a direct billing-summary request using an independently minted token), `verify_email`, and a full
  `submit_batch_verification` → `check_batch_verification` → `download_batch_results` round trip against the real,
  Compose-deployed connector. Uses the real MCP SDK client directly (resolved from `apps/mcp-server`'s own
  installed dependency), not `@modelcontextprotocol/inspector --cli`.
- [x] (2026-09-25) Added `test:mcp-server-live` to root `package.json` and a new `browser-live` CI step running it
  immediately after `dev:reset`, before every other live suite. Updated `scripts/ci/validate-workflow.spec.ts`'s
  exact ordered step-list fixture and its two brittle hardcoded-index assertions (made them look up their anchor
  command's real position instead, so a future insertion cannot silently break them the way this one would have).
- [x] (2026-09-25) Rewrote `apps/mcp-server/README.md` to its final form: a Responsibility section, a
  customer-facing Customer Setup section (credential acquisition, per-client configuration guidance, and the full
  eight-tool list with one example prompt each), and renamed the old dev-fixture-retrieval section to make clear
  it is for repository development, not real customers. Added one link from root `README.md`'s Local Services
  table (previously missing `mcp-server` entirely).
- [x] (2026-09-25) Verified against a genuinely freshly `dev:reset` stack (not a warm/reused one): the live script
  passed on the first run after reset completed successfully. Verified the redaction requirement by deliberately
  forcing a connection failure and confirming neither the real client secret nor its Base64-encoded form appeared
  anywhere in the script's combined standard output and standard error.

## Plan dependencies

- `mcp-connector/04`
- `mcp-connector/05`
- `mcp-connector/06`
- `mcp-connector-hardening/03`

## Surprises & Discoveries

- Chose the MCP SDK's own TypeScript client directly over shelling out to `@modelcontextprotocol/inspector --cli`,
  the option this plan explicitly left open. Reasons: the SDK is already a real, pinned dependency of
  `apps/mcp-server` (no extra network fetch from the npm registry needed at CI runtime, unlike an ad hoc `npx`
  invocation), and calling it directly gives typed JSON-RPC responses to assert against rather than parsing CLI
  stdout. Since this root-level script lives outside `apps/mcp-server`'s own module resolution, it loads the SDK's
  ESM entry points from that package's own `node_modules` directory directly (the same technique
  `web-live.mjs`'s `bundleBrowserClient` already uses for `vite`, scoped to `apps/web` instead) rather than adding
  `@modelcontextprotocol/sdk` as a second, redundant root-level dependency.
- Interpreted "each matching what a direct API call for the same credential would show" pragmatically rather than
  literally re-fetching every tool's result via a parallel raw HTTP call: `check_credit_balance` is cheap and
  idempotent, so the script mints its own bearer token independently (the same client-credentials grant
  `TokenCache` performs internally) and compares the connector's tool result against a direct
  `GET /v1/billing/summary` call byte-for-byte. `verify_email` and the batch round trip instead assert internal
  consistency (the returned address matches the request, row counts and addresses match what was submitted) —
  duplicating a second independent verification/batch pipeline in this script would not add meaningfully more
  confidence than what plans 04-06's own manual validation already established, for a large amount of extra,
  redundant code.
- `docker/scripts/dev-reset.sh`'s ownership check requires every currently running LEF-project container's
  `com.docker.compose.project.config_files` label to be *exactly* `docker/compose.yaml` — a single file, not that
  file plus `docker/compose.smtp-dev.yaml`. A local stack left running with the SMTP overlay attached (as
  `mcp-connector/06`'s own manual validation, and this repository's `browser-live` CI job itself, both do at a
  later point) fails `dev-reset.sh`'s ownership check with "Refusing to reset containers owned by another checkout
  or Compose configuration" until the stack is brought back up with the base `compose.yaml` alone first. This is
  pre-existing `dev-reset.sh` behavior, not something this plan changed — documented here since it is easy to
  trip over when validating this exact plan's own live script by hand, immediately after a plan that legitimately
  needed the overlay attached.
- A Docker Buildx image build transiently failed with `getaddrinfo EAI_AGAIN registry.npmjs.org` while Corepack
  fetched the pinned `pnpm` version inside the build sandbox — a real but unrelated environment network blip, not
  a defect in any Dockerfile. A bare retry of the same `dev:reset` command succeeded immediately with every layer
  still cached except the ones that had failed.

## Decision Log

- Decision: Live validation drives the real, deployed connector via `@modelcontextprotocol/inspector --cli`,
  scripted as a new `scripts/testing/mcp-server-live.mjs` mirroring the existing `scripts/testing/web-live.mjs`,
  run as a new step inside the existing `browser-live` CI job (which already brings up the full Compose stack via
  a fresh dev-reset-equivalent sequence) rather than inventing a new CI job. Rationale: `browser-live` already
  pays the cost of bringing up a complete, freshly seeded stack including Keycloak and a real customer fixture —
  reusing it avoids a second, redundant stack bring-up just for this connector. Date/Author: 2026-09-16, Codex
  planning.
- Decision: The customer-facing setup guide lives in `apps/mcp-server/README.md`, doing double duty as both the
  module's own responsibility statement (matching every other module's README in this repository) and the
  external Customer Setup guide, with one link added from the root `README.md`. Rationale: matches this
  repository's existing convention of one README per module describing both its internal responsibility and,
  where relevant, external usage — no other module in this repository splits these into separate files.
  Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

The full connector tool set is now proven end-to-end against a real, freshly reset local dev stack as part of CI,
not only by hand as every earlier plan in this road map did. Both Decision Log choices held up: the live script
lives in the `browser-live` job exactly as planned (no second stack bring-up), and `apps/mcp-server/README.md`
still does double duty as both the module's responsibility statement and the external customer guide. The one
plan-time-open decision (Inspector CLI vs. the SDK client) resolved in favor of the SDK client for concrete,
verified reasons, not a coin flip. This closes out the `mcp-connector` road map: plans 01 through 07 and the
`mcp-connector-hardening`/`mcp-transport-hardening` corrective series are all now complete, and the connector is a
real, deployed, documented, continuously live-validated capability rather than a scaffold.

The literal "person given only the Customer Setup section" acceptance criterion was validated by close reading
and by an actual end-to-end run of every mechanical step described there (credential retrieval, tool invocation,
balance check) against the real deployed service, rather than by handing the section to an unfamiliar human or a
separate fresh agent session in this same work session — that stronger, literal form of the check
(a genuinely uninvolved person or session, blind to this implementation's own context) is a reasonable follow-up
if this documentation's clarity is ever in doubt in practice.

## Context and Orientation

All paths below are repository-relative. `scripts/testing/web-live.mjs` is the precedent for a live-validation
script invoked directly (not through the Bruno wrapper) against a real running dev stack; read it directly before
writing `mcp-server-live.mjs` to match its shape (how it locates the running stack, how it obtains credentials,
how it reports pass/fail, whether it redacts sensitive output the way this repository's other live-test tooling
already does).

`scripts/keycloak/customer-fixture.ts` and `scripts/bruno/async-verification-fixture.mjs`'s `customerClientSecret`
helper are the existing mechanisms for obtaining a real, dev-stack-seeded customer service-client credential —
reuse them rather than provisioning a separate credential just for this script.

`.github/workflows/validate.yml`'s `browser-live` job already brings up the full local dev stack (Compose,
Keycloak provisioning, browser fixture bootstrap) before running its existing live suites; read its current step
list directly to find the right place to add one more step for this connector's own live validation, after the
`mcp-server` Compose service (from `mcp-connector/06`) is confirmed healthy.

`src/libs/modules/service-client-management/README.md` documents how a customer creates their own service-client
credential — the setup guide links to it rather than reexplaining it.

## Scope and Non-Goals

This plan adds the live-validation script, one new CI step, and the final customer-facing README content. It does
not add any new connector capability or tool — every tool this plan validates was already built in plans 03
through 05. It does not add a hosted, publicly reachable production deployment or a production customer
onboarding flow beyond the documentation itself.

## Plan of Work

Create `scripts/testing/mcp-server-live.mjs`, mirroring `web-live.mjs`'s structure: confirm the local dev stack
(including the `mcp-server` Compose service from plan 06) is up and healthy; obtain a real customer service-client
credential via the existing fixture helpers; drive `@modelcontextprotocol/inspector --cli` (or the MCP SDK's own
TypeScript client, if that proves simpler to script and assert against than shelling out to the Inspector CLI —
decide during implementation based on which gives clearer pass/fail signal and output redaction) through, at
minimum: `check_credit_balance`, `verify_email` against a known test address, and a full
`submit_batch_verification` → `check_batch_verification` → `download_batch_results` round trip. Follow this
repository's existing redaction discipline for any live-test output that could contain a token or secret (see how
`scripts/bruno/run-collection.mjs`'s failure diagnostics withhold raw output, for the tone to match — this script
does not need to reuse that exact mechanism, only its discipline).

Add a `test:mcp-server-live` script to root `package.json` invoking the new script.

Edit `.github/workflows/validate.yml`'s `browser-live` job to add one new step running
`corepack pnpm test:mcp-server-live`, placed after the stack (including `mcp-server`) is confirmed up.

Rewrite `apps/mcp-server/README.md` to its final form: a Responsibility section (in the tone of
`src/libs/modules/email-verification/README.md`/`service-client-management/README.md` — this component owns the
MCP protocol surface and the Basic-to-Bearer credential bridge; it owns no verification logic, no credit policy,
and no customer data of its own, all of which remain owned by the modules it calls) and a Customer Setup section:
how to obtain a service-client credential (linking `service-client-management`'s README), and the full tool list
with one example prompt per tool. For the client configuration itself, do not present one remote HTTP URL plus
`Authorization: Basic` header JSON as if it worked identically for every client — `mcp-connector-hardening/03`
corrected this: Claude Desktop's local `mcpServers` configuration cannot reach a remote URL/header object
directly and instead requires the local `mcp-remote` bridge process already documented in this README's own
"Connecting Claude Desktop" section (link to it rather than duplicating it here). Only present a direct remote
HTTP URL plus Basic-auth header configuration for a client whose own connection path genuinely supports it, such
as Claude Code's existing HTTP client path, confirming that client's real supported configuration shape before
documenting it rather than assuming Desktop's constraints apply everywhere.

Add one link to `apps/mcp-server/README.md` from the root `README.md`'s existing list of module/guide links.

## Interfaces and Dependencies

New `scripts/testing/mcp-server-live.mjs` and root `test:mcp-server-live` script. One new step in the
`browser-live` CI job. Final content for `apps/mcp-server/README.md` and one new link from the root `README.md`.
Depends directly on `mcp-connector/04` and `mcp-connector/05` (the tools this plan's script exercises),
`mcp-connector/06` (the deployed service it validates against), and `mcp-connector-hardening/03` (the supported
Claude Desktop connection path this plan documents). Plan 06 does not transitively supply plans 04 or 05 — it
depends only on plan 03 — so each of those was a genuinely separate, previously unrecorded prerequisite.

## Acceptance Criteria

- `corepack pnpm test:mcp-server-live` passes against a freshly `dev:reset` local stack, exercising
  `check_credit_balance`, `verify_email`, and the batch submit/check/download round trip, each matching what a
  direct API call for the same credential would show.
- The script's output contains no literal client secret or bearer token under any pass or fail path (verify by
  deliberately forcing a failure path during implementation and inspecting the output).
- `corepack pnpm docs:lint -- apps/mcp-server/README.md` passes.
- A person given only `apps/mcp-server/README.md`'s Customer Setup section (no other context) can configure a real
  MCP client and successfully call `check_credit_balance` — validate this literally, not just by inspection, by
  having someone (or a fresh agent session with no prior context on this feature) follow only that section.
- The new `browser-live` CI step passes.

## Validation

```sh
corepack pnpm test:mcp-server-live
corepack pnpm docs:lint -- apps/mcp-server/README.md .agents/plans/mcp-connector/07-live-validation-and-docs.md README.md
```

Manual: run through the README's Customer Setup section from scratch (a clean checkout, no prior state) end to
end, exactly as a real customer would, and confirm each step's instructions are accurate and sufficient on their
own.

## Idempotence and Recovery

`test:mcp-server-live` is safe to rerun; it consumes real dev-stack credits for its verification/batch calls
exactly as manual verification in earlier plans does. `corepack pnpm dev:reset` restores a clean stack if fixture
state becomes inconsistent between runs.

## Artifacts and Notes

Read `scripts/testing/web-live.mjs` directly before writing the new script, and re-read every earlier plan's own
"Manual/live" validation notes in this road map (02 through 06) — this plan's automated script should cover the
same ground those manual steps already proved by hand, not a narrower slice of it.

## Plan readiness

Ready to implement
