# Single-Email Verification Tools

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, an AI agent connected to the MCP connector can verify one email address synchronously, submit
one for asynchronous verification and poll its status, and look up a previously completed result — the same
capabilities a human has through the sync/async verification API, now callable as tools. A developer observes
success by calling `verify_email` through `@modelcontextprotocol/inspector` against a real test address and
receiving a real verification outcome (or, for an address that cannot resolve within the synchronous budget, a
clear pointer to poll asynchronously instead of a bare timeout).

## Progress

- [ ] (2026-09-16) Not started.

## Plan dependencies

- `mcp-connector/03`
- `mcp-connector-hardening/02`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Include `get_verification_result` (backed by `GET /verifications/:id`) as a fourth tool alongside the
  three verb-shaped verification tools, even though it is an auxiliary lookup rather than an action. Rationale: it
  is independently confirmed customer-facing and permission-gated (`verification:read`) in the same way as the
  other three, and an agent that only has a result id (e.g. echoed back from an earlier `verify_email` call)
  needs a way to re-fetch it later without resubmitting a new verification. Date/Author: 2026-09-16, Codex
  planning.
- Decision: `verify_email`'s tool result for a synchronous call that does not resolve within the API's own
  synchronous budget (the API falls back to an async-style durable handle rather than blocking indefinitely) is a
  non-error result explicitly telling the agent to poll with `check_async_verification` using the returned id,
  not an error. Rationale: this is the API's own documented, expected behavior for slow-to-resolve mailboxes, not
  a failure; treating it as an error would train the calling agent to retry the wrong thing.
  Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All paths below are repository-relative. Read `src/libs/modules/email-verification/README.md` directly for the
exact current request/response DTO shapes before implementing — this plan's summary below is oriented for
planning, not a substitute for reading the module's own documentation of its public contract.

`POST /verify` (permission `verification:run`) takes `{email: string}`, runs synchronously, and returns the
verification result inline on success; the underlying implementation may fall back to a durable async-style
handle (an id to poll) if the address cannot be resolved within its synchronous time budget — the response shape
distinguishes these two outcomes (consult the module README for the exact discriminator field). `POST
/verifyAsync` (same permission) always takes `{email: string}` and always returns `{id: string}` immediately.
`GET /verifyAsync/:id` (permission `verification:read`) returns one of five states: `queued`, `running`,
`completed` (carrying the result), `failed` (carrying a failure code), `unavailable`. `GET /verifications/:id`
(permission `verification:read`) looks up a previously produced result by its own id, scoped to the caller's
organization (never a foreign one).

This plan now also depends on `mcp-connector-hardening/02`, which extends the shared `mapUpstreamError` from plan
03 with `400 -> validation_failed` and `403 -> permission_denied` mappings the original road map omitted. Confirm
that correction has landed in `apps/mcp-server/src/lef-api/errors.ts` before relying on those two codes here.

`apps/mcp-server/src/lef-api/client.ts` (from `mcp-connector/03`) already has `getBillingSummary` and the shared
`mapUpstreamError`; this plan adds sibling methods to the same class rather than creating a second client.

## Scope and Non-Goals

This plan adds exactly four tools mapped 1:1 onto the four endpoints above. It does not add batch tools (plan 05)
and does not change the shared client/error infrastructure from plan 03 beyond adding new methods to the same
class. It does not add any client-side retry/backoff loop for async polling — the agent itself decides when to
call `check_async_verification` again; the connector does not poll on the agent's behalf.

## Plan of Work

Extend `apps/mcp-server/src/lef-api/client.ts` with `verifySync(email: string)`, `submitAsyncVerification(email:
string): Promise<{id: string}>`, `getAsyncVerificationStatus(id: string)`, and `getVerificationResult(id: string)`,
each following the same bearer-token-attached, `mapUpstreamError`-on-failure shape as `getBillingSummary`. Type
each method's return value to match the real DTO shapes documented in the module README exactly (do not
loosely type these as `unknown` or `any`).

Create `apps/mcp-server/src/tools/verify-email.ts` (+ spec): input schema `{email: string}` (validate it is a
plausible email string shape before calling the API — reuse whatever minimal validation is simplest; the API
itself is the authority on real validity, this is only a cheap client-side guard against obviously malformed
input). On a completed result, return it as JSON text content. On the async-fallback outcome, return a clear text
result stating verification is still in progress and naming the id to pass to `check_async_verification`. On a
mapped upstream error, return the standard `isError` shape from plan 03.

Create `apps/mcp-server/src/tools/submit-async-verification.ts` (+ spec): input `{email: string}`, returns
`{id: string}` as JSON text content on success.

Create `apps/mcp-server/src/tools/check-async-verification.ts` (+ spec): input `{id: string}`, returns the current
state object as JSON text content, passing through all five states faithfully (including `failed`'s failure code
and `unavailable`).

Create `apps/mcp-server/src/tools/get-verification-result.ts` (+ spec): input `{id: string}`, returns the result
as JSON text content on success, or the standard `isError` shape (including the `not_found` case for an id that
does not exist or belongs to a different organization) on failure.

Edit `apps/mcp-server/src/create-server.ts` to register all four new tools.

## Interfaces and Dependencies

Four new methods on `LefApiClient`; four new tool modules and their specs. Depends on `mcp-connector/03`'s shared
client/error infrastructure and `mcp-connector/02`'s per-request token. Independent of `mcp-connector/05`; either
may be implemented first once `03` is available.

## Acceptance Criteria

- `verify_email` against a real, immediately-resolvable test address returns a completed result matching what
  `POST /verify` returns directly for the same address and credential.
- `verify_email` against an address that triggers the API's own async fallback returns the async-pointer result,
  not an error, and the returned id can be passed to `check_async_verification` to observe its progress to a
  terminal state.
- `submit_async_verification` + repeated `check_async_verification` calls observe a real submission progress from
  `queued`/`running` to a terminal state (`completed`, `failed`, or `unavailable`), matching what polling `GET
  /verifyAsync/:id` directly would show.
- `get_verification_result` against a real completed result's id returns that result; against a nonexistent or
  foreign id returns a clean `not_found` tool error, never another organization's data.
- Each tool's `400`/`401`/`402`/`403`/`404`/`422`/`429` rejection paths (as relevant to that tool, matching each
  endpoint's actual documented responses — single-request validation and invalid-UUID-lookup failures are `400`
  per `mcp-connector-hardening/02`'s correction, not `422`) are unit-covered using the fake-client convention
  from plan 03.

## Validation

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/tools/verify-email.spec.ts apps/mcp-server/src/tools/submit-async-verification.spec.ts apps/mcp-server/src/tools/check-async-verification.spec.ts apps/mcp-server/src/tools/get-verification-result.spec.ts apps/mcp-server/src/lef-api/client.spec.ts
corepack pnpm typecheck
corepack pnpm lint
```

Manual/live: against a real `dev:reset` stack with the dev-stack SMTP fixture (`docker/smtp-dev`) available, call
each tool via `@modelcontextprotocol/inspector --cli` for at least one immediately-conclusive address, one
async-fallback/slow address, and one nonexistent result id, confirming each matches the equivalent direct API
call.

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector/04-single-email-verification-tools.md
```

## Idempotence and Recovery

No persisted state in the connector itself. Re-running tests or the manual verification is always safe; a
submitted async verification is a real, billed operation against the dev stack exactly as it would be through any
other client, so repeated manual verification consumes real dev-stack credits — top up with the existing dev
fixture tooling if needed, following the same pattern any other live verification test in this repository already
uses.

## Artifacts and Notes

Read `src/libs/modules/email-verification/README.md` in full immediately before implementing this plan to confirm
the exact current DTO field names and the async-fallback discriminator on `POST /verify`'s response — do not guess
these from this plan's summary alone.

## Plan readiness

Ready to implement
