# Report Validation and Permission Failures Accurately

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, an MCP caller can distinguish invalid input and missing permissions from an upstream service
failure. An API response with HTTP `400` becomes `validation_failed`; HTTP `403` becomes `permission_denied`.
The caller receives a fixed, safe explanation through the existing MCP tool error format. A developer observes
the behavior by exercising the shared API client and credit-balance tool with controlled upstream responses.

This document specifies one future implementation PR, titled
`fix(mcp): distinguish validation and permission failures`. Creating this plan implements no connector behavior.

## Progress

- [x] (2026-09-20) Added `permission_denied` and the `400 -> validation_failed`/`403 -> permission_denied`
      mappings to `apps/mcp-server/src/lef-api/errors.ts`, matching the exact status-to-code table specified.
- [x] (2026-09-20) Extended `errors.spec.ts`, `client.spec.ts`, and `check-credit-balance.spec.ts` with the new
      cases and reconciled plans 03 and 04's superseded guidance.
- [x] (2026-09-20) Ran focused and full test suites, the named API integration suites, and prose validation.
      Recorded results below.

## Plan dependencies

- `mcp-connector/03`
- `mcp-connector-hardening/04`

## Surprises & Discoveries

- Reusing the existing `validationFailed` object literal for both the `400` and `422` table entries (rather than
  two separate literals with identical `code`/`message` fields) makes the "map `400` and `422` to the exact same
  fixed shape" acceptance criterion trivially, structurally true rather than merely tested to be true.
- Confirmed directly (not merely trusted from the plan's own evidence section) that
  `async-email-verification-http.integration.spec.ts` and `billing-summary-http.integration.spec.ts` both still
  pass unmodified, reconfirming the underlying API's `400`/`403` behavior this mapping now matches.

## Decision Log

- Decision: Map both `400` and `422` to the existing `validation_failed` code. Rationale: single-verification
  request and UUID validation use `400`, while batch upload file validation uses `422`; the caller needs the
  same category of corrective action. Date/Author: 2026-09-16, Codex planning.
- Decision: Add `permission_denied` for `403` while retaining `authentication_required` for `401`. Rationale:
  an authenticated credential can lack a required permission; repeating authentication or reporting a service
  fault does not identify that problem. Date/Author: 2026-09-16, Codex planning.
- Decision: Keep all status translation in the shared mapper established by `mcp-connector/03`. Rationale:
  every tool receives consistent errors without duplicating HTTP policy in tool handlers or changing the API's
  authentication and authorization rules. Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: `permission_denied` for `403`, `400` mapped identically to the
existing `422 -> validation_failed` shape, `retryAfterSeconds` still restricted to `429`/`503`, and every existing
code and message preserved unchanged. Reconciled `mcp-connector/03` and `04`'s superseded `422`-for-single-request
guidance. No API, DTO, permission, or billing behavior changed — this PR is connector-side error classification
and its tests only, matching the stated non-goals.

## Context and Orientation

All paths are repository-relative. The evidence baseline is merged commit
`e4c10620d377185c9f24e0087e2161cf8e8f6a25`. At this baseline, `apps/mcp-server` does not exist. The files below that
path are proposed interfaces from `mcp-connector/03`, not a currently implemented client. That prerequisite must
provide the shared client, mapper, and credit-balance tool before this implementation begins.

The current API already distinguishes the relevant failures:

- `src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification.controller.ts`
  documents `400` for missing or invalid email input and invalid UUID lookup parameters, and `403` for missing
  permissions. The adjacent `async-email-verification-http.integration.spec.ts` asserts those responses.
- `src/libs/modules/email-verification/src/api/http/synchronous-verification/current/sync-email-verification.controller.ts`
  documents the same `400` and `403` distinction for synchronous submission. Its request DTO validates the email.
- `src/libs/modules/credits/src/api/billing-summary.controller.ts` exposes `GET /v1/billing/summary`, requires
  `billing:read`, and documents `403` when that permission is absent. The adjacent
  `billing-summary-http.integration.spec.ts` covers the authenticated caller without that permission.
- `src/libs/modules/email-verification/src/api/http/batch-verification/batch-email-verification.controller.ts`
  uses `422` for missing files, invalid media types, or oversized CSV uploads. Address validation happens later
  during batch processing; malformed addresses do not produce an immediate upload `422`.

The proposed `apps/mcp-server/src/lef-api/errors.ts` exports `mapUpstreamError(response, body)` and an
`UpstreamError` value containing `code`, `message`, and optional `retryAfterSeconds`. The proposed
`apps/mcp-server/src/lef-api/client.ts` attaches the current bearer token and throws a mapped error on a non-success
HTTP response. `apps/mcp-server/src/tools/check-credit-balance.ts` converts that value into an MCP result with
`isError: true`. The original plan lists `401`, `402`, `404`, `422`, `429`, and `503`; its fallback currently
specifies `unexpected_upstream_error` for every other status. Following that contract would misclassify both
ordinary `400` and `403` responses.

## Scope and Non-Goals

This PR changes the connector's shared error classification, its focused tests, and the conflicting guidance in
the original connector plans. It preserves the existing success shape and every other error code. Later single
and batch tools inherit the correction through the same mapper; this plan does not depend on those tools being
implemented.

API endpoints, DTOs, permissions, credential grants, billing rules, token caching, polling, retry policy, CSV
processing, and deployment configuration are outside this PR. Add no new endpoint, runtime dependency, database
change, migration, or external service configuration. The implementation remains in the standalone connector
workspace and introduces no import from a business module.

## Plan of Work

First inspect the prerequisite's delivered `apps/mcp-server/src/lef-api/errors.ts`, `client.ts`, and
`tools/check-credit-balance.ts` with their corresponding specs. Preserve their injected token provider, HTTP
transport, and shared error propagation. Read `src/libs/modules/email-verification/README.md` and
`src/libs/modules/credits/README.md` to confirm the API evidence above; do not change these modules to fit the
connector's previous assumptions.

Extend `UpstreamError.code` in `apps/mcp-server/src/lef-api/errors.ts` with `permission_denied`. Add a `400`
branch that reuses the exact `422` mapping and its existing fixed message. Add a `403` branch with the fixed
message `The credential lacks the required permission.` Preserve every existing code and message. Neither
new branch may inspect or interpolate the response body, a credential, a token, or a transport exception message.

Keep `retryAfterSeconds` restricted to the existing `429` and `503` paths. A `Retry-After` header on a `400` or
`403` response must not appear in the result. Do not add automatic retries, token refresh, backoff, or a second
upstream call when either new mapping is selected. Retain the existing safe fallback for unmapped statuses and
network failures.

Extend `apps/mcp-server/src/lef-api/errors.spec.ts` with a table covering the complete mapping below. Include
`400` and `403` bodies containing arbitrary messages, submitted addresses, and synthetic secret/token sentinels.
Assert the entire mapped value equals the permitted fixed shape and contains none of those sentinels. Exercise
the `Retry-After` header on both new statuses and confirm it is omitted. Retain the established tests for
valid retry hints on `429` and `503` and for safe transport-error handling.

Extend `apps/mcp-server/src/lef-api/client.spec.ts` so a fake HTTP transport returning each new status causes
`getBillingSummary()` to reject with the corresponding mapped error after exactly one fetch. A controlled `400`
response here tests the shared transport path; it does not assert that the billing endpoint accepts invalid
parameters. Its empty request schema remains unchanged.

Extend `apps/mcp-server/src/tools/check-credit-balance.spec.ts` to prove a mapped `permission_denied` value reaches
the caller as `isError: true`, with only `code` and the fixed `message`. Also prove the common tool error path can
carry `validation_failed`, and retain the successful balance response. Modify `client.ts` or
`check-credit-balance.ts` only if the delivered prerequisite exhaustively enumerates codes and would otherwise
discard the new value. Keep that adaptation local; do not introduce another mapping layer.

In this same implementation PR, update
`.agents/plans/mcp-connector/03-api-client-error-mapping-credit-balance.md` to include `400` and `403` in its
context, code union, test matrix, and acceptance criteria. Correct the claim that malformed single-email input
uses `422`. Update `.agents/plans/mcp-connector/04-single-email-verification-tools.md` so its rejection-path
guidance explicitly includes the actual `400` and `403` responses. Preserve both plans' recorded implementation
progress and avoid changing their unrelated scope. Maintain this plan's progress and outcomes with the actual
implementation and validation evidence.

## Interfaces and Dependencies

The only new public connector error code is `permission_denied`. The `UpstreamError` fields and MCP error result
shape remain unchanged. The complete status mapping is:

| Upstream response | Connector code | Retry hint |
| --- | --- | --- |
| `400` or `422` | `validation_failed` | Absent |
| `401` | `authentication_required` | Absent |
| `402` | `insufficient_credits` | Absent |
| `403` | `permission_denied` | Absent |
| `404` | `not_found` | Absent |
| `429` | `rate_limited` | Existing `Retry-After` handling |
| `503` | `service_unavailable` | Existing `Retry-After` handling |
| Other non-success status or transport failure | `unexpected_upstream_error` | Absent |

The original plan 03 supplies the concrete client, mapper, tests, and workspace validation wiring. Hardening
plan 04 corrects the road map's dependency metadata before implementation proceeds. This change adds no library
or configuration. It allows subsequent tools to distinguish input and permission failures using the existing
shared client.

## Acceptance Criteria

- A controlled upstream `400` produces `validation_failed` with exactly the same fixed message as `422`.
- A controlled upstream `403` produces `permission_denied` with the exact fixed message specified above; `401`
  continues to produce `authentication_required`.
- Calling the credit-balance tool through its handler with an upstream permission failure yields `isError: true`
  and the mapped code and message. The success response remains `{balance, reserved, available}`.
- The mapper, API client, and tool result contain no submitted-address, secret, token, raw-body, or exception-message
  sentinel supplied by the failure tests. Neither new mapping exposes a retry hint.
- Each client call receiving `400` or `403` makes exactly one HTTP request. Existing mappings, including retry
  hints for `429` and `503`, retain their prior behavior; network failures still receive the safe fallback.
- The original plans 03 and 04 agree with the corrected status mapping. Focused tests, type checking, lint, and
  documentation validation pass without changing API authorization or validation behavior.

## Validation

After implementation, run these focused connector tests and static checks:

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/lef-api/errors.spec.ts apps/mcp-server/src/lef-api/client.spec.ts apps/mcp-server/src/tools/check-credit-balance.spec.ts
corepack pnpm typecheck
corepack pnpm lint
```

Confirm the existing API evidence with its HTTP integration suites, which exercise in-process test applications
and controlled dependencies rather than requiring a disposable stack:

```sh
corepack pnpm exec jest --runInBand src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts src/libs/modules/credits/src/api/billing-summary-http.integration.spec.ts
```

Run Harper for the documentation changed by the implementation PR:

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector-hardening/02-map-validation-and-permission-errors.md .agents/plans/mcp-connector/03-api-client-error-mapping-credit-balance.md .agents/plans/mcp-connector/04-single-email-verification-tools.md
```

Bruno: not applicable — this change maps upstream errors inside the connector, below its HTTP transport boundary;
it changes no API endpoint, request validation, authentication, authorization, or existing Bruno workflow. The API
keeps its current responses, and focused client/tool tests verify their translation. No container-runtime or live
credential test is required for this deterministic mapping change. Record these layers separately and never
describe simulated responses as live validation.

The commands above are the future implementation checks. They have not been run against connector code during
planning because that code does not yet exist.

## Idempotence and Recovery

The mapper is stateless and makes no external call. Independent or concurrent calls cannot change another
call's classification. Repeating the tests creates no customer operation, credit charge, credential, or stored
state. Implementation requires no reset, reseed, or data recovery. Reverting the implementation commit restores
the previous connector mapping without altering API behavior or persistent data.

## Artifacts and Notes

This plan addresses the missing `400` and `403` mappings identified in PR #652. Current API behavior is confirmed
by the controllers and existing tests named above; connector behavior remains proposed until its prerequisite
is delivered. Readiness covers one decision-complete PR and does not claim that dependency is complete.

## Plan readiness

Ready to implement
