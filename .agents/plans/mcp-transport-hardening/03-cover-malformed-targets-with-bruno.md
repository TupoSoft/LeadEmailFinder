# Cover Malformed MCP Request Targets with Bruno

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The MCP routing collection must exercise the HTTP 400 response introduced by PR #681.
A developer can send `GET //` through Bruno, observe the exact rejection body, and confirm that the same server still answers health checks.
The documentation will explain which malformed targets ordinary HTTP clients can send and why the raw socket process test remains useful.

## Progress

- [ ] (2026-09-17) Add the malformed target request before the final health check in the existing collection.
- [ ] (2026-09-17) Correct the client normalization claims in the collection README and prerequisite plan.
- [ ] (2026-09-17) Run focused validation, review the diff, and record actual results.

## Plan dependencies

- `mcp-transport-hardening/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Extend the existing routing collection with `{{baseUrl}}//`. Author: Codex, 2026-09-17.
  A review probe using the pinned Bruno CLI sent the literal target `//` and received HTTP 400.
  No raw socket feature or new collection is needed for this target.
- Decision: Keep the process regression and its second malformed target. Author: Codex, 2026-09-17.
  The regression proves that the same child process survives and supports a real MCP call.
  It also sends `http://[`, which an ordinary URL client may reject locally.
- Decision: Make one PR containing collection coverage and the explanation of that coverage. Author: Codex, 2026-09-17.
  The build prerequisite documentation is independently useful and belongs to sibling plan 04.

## Outcomes & Retrospective

Not started.

## Context and Orientation

PR #681 implemented `mcp-transport-hardening/01` and merged on 2026-09-17.
Its merge commit is `2921d88c10f1139adad4017dfe5ffbc3d315be56`.
The review inspected head `56ca699d6ec8784bcbc793b286dae66a0576ebf4`.
Start implementation from a current base containing that merge.

In `apps/mcp-server/src/main.ts`, `createApp()` catches exceptions from URL construction before route dispatch.
The literal request target `//` throws during parsing and receives HTTP 400 with `{"status":"bad_request"}`.
The response has JSON content type and contains no exception details.

The five requests under `bruno/mcp-request-routing/` cover public health, an unknown path, rejected GET and DELETE methods on `/mcp`, and final health.
They omit the newly supported error response.
The collection reads `baseUrl` from `MCP_BASE_URL` in `environments/local.yml`.
The repository pins `@usebruno/cli` to version 4.1.0.

The collection README claims that Bruno normalizes `//` and cannot reproduce the crash.
The completed prerequisite plan repeats this claim in its discoveries and implementation instructions.
Review validation disproved it: a scratch Bruno request to `{{baseUrl}}//` reached the server with `req.url` equal to `//`.
That request returned HTTP 400 and the exact JSON body.
Ordinary `fetch` and `curl` requests also preserved this double slash path.

The raw socket tests in `apps/mcp-server/src/main.spec.ts` exercise both `//` and `http://[`.
They build a fresh temporary executable, send the literal request lines, and verify health and `ping` afterward.
These checks provide stronger process evidence than the collection alone.

## Scope and Non-Goals

Proposed PR title: `test(mcp): cover malformed request targets in Bruno`.

Change the routing collection, its README, and the inaccurate passages in
`.agents/plans/mcp-transport-hardening/01-reject-malformed-request-targets.md`.
Maintain this ExecPlan with actual results.

This PR changes no server behavior, package, authentication, origin policy, business module, or deployment.
It adds no HTTP endpoint, database schema, migration, generic test runner, or CI workflow.
The README build instructions are owned by plan 04.

## Plan of Work

Inspect the current merged collection and preserve any intervening authentication or origin requirements.
Add `bruno/mcp-request-routing/05-malformed-target-is-bad-request.yml` using the existing YAML request format.
Set its sequence to 5, its method to GET, and its URL to `{{baseUrl}}//`.
Do not construct the target as a standalone URL or encode the slashes.
The base URL is an HTTP origin with no trailing slash, as in the existing local command.

Assert HTTP 400, a content type containing `application/json`, and the exact body `{ status: 'bad_request' }`.
Do not send credentials or an Origin header with this malformed request.
Target parsing precedes those policies, and the existing server must remain responsible for that ordering.
If the runtime no longer meets this contract, report the conflict instead of weakening the assertion or expanding this PR.

Rename `05-health-remains-available.yml` to `06-health-remains-available.yml`.
Update its display name and sequence to 6, preserving its HTTP 200 and exact health body assertions.
Run the collection against one server process without restarting it between requests.
Preserve the four earlier routing requests and all existing environment variables.

Correct the README explanation: the double slash path can be sent by Bruno and now has collection coverage.
Explain that literal malformed absolute URLs and same-process MCP recovery remain covered by the raw socket test.
Correct the corresponding discovery, rationale, and instruction passages in plan 01 without erasing its historical validation evidence.
Replace its prohibition on claiming that Bruno sends the malformed target with the verified distinction between the two targets.
Resolve actionable Harper findings in these touched documents, including long sentences, without changing commands or identifiers.

Review the final diff for unrelated changes and record local results separately from CI evidence.
Both new plans touch the README; preserve the other change when rebasing, but neither plan depends on the other.

## Interfaces and Dependencies

The existing HTTP 400 contract is unchanged.
The collection gains one request and keeps the final health check after all rejection responses.
Reuse `MCP_BASE_URL`, the pinned Bruno CLI, and the existing process regression.

Plan 01 supplies the parsing guard and original collection.
Plan 02 and the authentication bridge are not prerequisites.
This task makes the rejection contract repeatable through the normal HTTP client and unlocks no required later implementation.

## Acceptance Criteria

- The collection contains six ordered requests, with `GET {{baseUrl}}//` immediately before final health.
- The malformed request returns HTTP 400, JSON content type, and exactly `{"status":"bad_request"}` without credentials.
- Every collection assertion passes against the same locally started server process.
- The existing process tests still prove recovery after both malformed targets, including a real `ping` call.
- The README and plan 01 no longer claim that ordinary HTTP clients cannot send the double slash path.
- Documentation explains why the raw socket regression remains useful and preserves any current credential requirements for valid MCP calls.
- Focused Jest tests, the plan fixture, the live collection, Harper, and whitespace validation pass.
- Application source, package scripts, and runtime contracts remain unchanged.

## Validation

The following are planned implementation checks, not recorded successes.
From the repository root after installing the locked dependencies, run:

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/main.spec.ts apps/mcp-server/src/create-server.spec.ts scripts/plans/execplan-repository-fixture.spec.ts
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm docs:lint -- bruno/mcp-request-routing/README.md .agents/plans/mcp-transport-hardening/01-reject-malformed-request-targets.md .agents/plans/mcp-transport-hardening/03-cover-malformed-targets-with-bruno.md
git diff --check
```

Start the built scaffold in one terminal:

```sh
PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From another terminal, starting at the repository root:

```sh
cd bruno/mcp-request-routing
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

Expect six passing requests, including HTTP 400 followed by HTTP 200 from final health.
Keep the first terminal running throughout and stop only that process with `Ctrl+C` afterward.
Use a free port consistently in both commands if 3002 is occupied.
If authentication has since landed, use its existing disposable fixture for valid MCP requests.
Keep the malformed request unauthenticated and preserve the existing origin policy.

If live execution is unavailable, record the exact missing dependency and leave runtime acceptance unverified.
Do not replace live Bruno evidence with source inspection or only a Jest result.
The review probe cited below supports the design but does not validate the future committed collection.

## Idempotence and Recovery

The requests create no business data and can be repeated against the same local process.
Avoid shared ports, stop only processes started for validation, and retain unrelated user changes.
A failed assertion requires fixing the fixture or reporting a changed runtime contract; it does not authorize a database reset.
Reverting this PR removes only documentation and test coverage.

## Artifacts and Notes

Source finding: [PR #681](https://github.com/TupoSoft/LeadEmailFinder/pull/681),
`bruno/mcp-request-routing/README.md:9-11` at the reviewed head above.
A scratch request using Bruno 4.1.0 produced `req.url === '//'`, HTTP 400, and the exact rejection body.
The original five requests and eight focused Jest tests passed during review.
These observations preceded this plan and are not implementation results.

At implementation start, follow root `AGENTS.md` to locate and assign the synced issue for
`mcp-transport-hardening/03` and update its project status when access permits.
Use the proposed conventional commit subject as the PR title and include the issue closing reference.
Creating this plan does not start implementation or change external project state.

## Plan readiness

Ready to implement
