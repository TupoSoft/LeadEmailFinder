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

- [ ] (2026-09-16) Not started.

## Plan dependencies

- `mcp-connector/06`

## Surprises & Discoveries

None yet.

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

Not started.

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
how to obtain a service-client credential (linking `service-client-management`'s README), the exact MCP client
configuration JSON (remote HTTP URL, `Authorization: Basic <base64(clientId:clientSecret)>` header) for at least
Claude Desktop and Claude Code, and the full tool list with one example prompt per tool.

Add one link to `apps/mcp-server/README.md` from the root `README.md`'s existing list of module/guide links.

## Interfaces and Dependencies

New `scripts/testing/mcp-server-live.mjs` and root `test:mcp-server-live` script. One new step in the
`browser-live` CI job. Final content for `apps/mcp-server/README.md` and one new link from the root `README.md`.
Depends on `mcp-connector/06`'s deployed service and, transitively, every tool from plans 03–05.

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
