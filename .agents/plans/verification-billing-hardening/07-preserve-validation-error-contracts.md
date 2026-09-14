# Preserve Verification Validation Error Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the published verification error types match the responses callers receive. Both single-verification
routes return an array of messages for invalid email bodies and a string for invalid idempotency headers.
After this PR, OpenAPI and the generated browser client describe both forms without changing runtime responses.
The proposed PR title is `fix(email-verification): preserve validation error message variants`.

## Progress

- [ ] (2026-09-15) Correct both response schemas and regenerate the browser contract.
- [ ] (2026-09-15) Add runtime and generated-type regression coverage and extend existing Bruno assertions.
- [ ] (2026-09-15) Complete focused validation and record its results.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`

## Surprises & Discoveries

The review of PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c` found that both controllers describe
`400.message` as a string. The current HTTP tests still assert `message: ['email must be an email']` for an
invalid body. The async HTTP suite passed all 24 tests during that review. This is a documentation and generated
type defect, not a request to change Nest validation behavior.

## Decision Log

- Decision: Use `oneOf` with a string schema and an array-of-strings schema for `message`.
  Rationale: These disjoint alternatives express the existing response contract precisely.
  Date/Author: 2026-09-15, Codex remediation planning.
- Decision: Keep `/verify` in the full runtime document only.
  Rationale: The browser document intentionally exposes the async workflow; fixing an error type does not expand it.
  Date/Author: 2026-09-15, Codex remediation planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The affected business module is `src/libs/modules/email-verification/`. Its transport files are
`src/api/http/asynchronous-verification/async-email-verification.controller.ts` and
`src/api/http/synchronous-verification/current/sync-email-verification.controller.ts`.
Each has an inline `ApiBadRequestResponse` schema. Nest `ValidationPipe` produces body-validation arrays,
while controller `HttpException` calls produce scalar header-error messages.

`scripts/openapi/contracts.mjs` exports full runtime and filtered browser documents without network access.
`src/lead-email-finder-api/src/openapi/browser-document.ts` owns the browser allowlist.
The tracked browser outputs are `packages/api-client/openapi/lead-email-finder.json` and
`packages/api-client/src/schema.d.ts`. `scripts/openapi/contracts.test.mjs` verifies both exported documents
and compiles exact TypeScript assertions. Read `apps/web/AGENTS.md` before changing this client boundary.

## Scope and Non-Goals

Correct the two 400 schemas, regenerate the browser outputs, and test the existing response variants.
Preserve status codes, message values, required fields, authentication, permissions, and admission behavior.
No frontend screen changes, new endpoints, database changes, or general error-format redesign belong in this PR.
Plan 08 first restores the existing contract test baseline; this plan adds the missing union assertions.

## Plan of Work

Change each inline `message` property to `oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]`.
Keep `statusCode` and `message` required and keep `error` optional. Add examples for a body-validation array and
a header-validation string using existing safe messages. Do not include submitted addresses in new examples.

Extend `src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts` and
`src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts` within the module.
Use valid credentials and an allowed submission limiter. An invalid email must exercise `ValidationPipe`;
a malformed or future header must use a valid email so body validation does not mask the header branch.
Assert that rejected input never reaches admission, reservation, or execution.

Extend `scripts/openapi/contracts.test.mjs` to inspect the full runtime 400 schemas for both routes and the
browser schema for `/verifyAsync`. Add a compiled type assertion that the generated async response message is
exactly `string | string[]`. Keep the assertion that `/verify` is excluded from the browser document.
Regenerate through the repository commands rather than editing generated TypeScript manually.

Extend the existing invalid-email request under `bruno/async-verification/` to assert an array of strings.
Retain its 400 and zero-effect assertions. Existing Jest header cases provide precise scalar-path coverage;
do not add a new collection or a redundant request solely for this schema repair.

## Interfaces and Dependencies

The public documentation changes from `message: string` to `message: string | string[]` on HTTP 400 responses.
The runtime remains compatible. The generated client gains the accurate union, so direct consumers must narrow
the type before string operations. Check existing consumers with the API-client and web type checks.
No new package, application port, configuration key, or module dependency is needed.

## Acceptance Criteria

- Invalid or missing email bodies still return HTTP 400 with an array containing only strings on both routes.
- Malformed and future idempotency headers still return HTTP 400 with their existing scalar message.
- Both runtime schemas and the browser async schema describe both message forms with no `any` or unknown type.
- The generated async `message` type is exactly `string | string[]` and remains required.
- Invalid input produces no admitted operation, reservation, or probe. Existing authorization tests pass.
- Browser export still excludes `/verify`, and existing success and polling contracts remain unchanged.
- Focused runtime, contract, generated-client, and type checks pass; live Bruno status is recorded separately.

## Validation

Run these commands from the implementation checkout after generating the artifacts:

```sh
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts src/libs/modules/email-verification/src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-verification.openapi.spec.ts
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
node --test scripts/openapi/*.test.mjs
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm bruno:async-verification
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/07-preserve-validation-error-contracts.md
git diff --check
```

Bruno: update the nearest existing invalid-email assertion. The launcher runs the pinned CLI with the owned
local environment. When that fixture is unavailable, report the static assertions and HTTP tests separately
and leave live Bruno execution explicitly unverified. Include any other changed Markdown files in Harper.
These are implementation commands, not results already obtained for this plan.

## Idempotence and Recovery

Export and generation are repeatable. A second generation must leave both tracked outputs unchanged.
Use the existing collection launcher to restore its fixture balance after success or failure.
This plan needs no schema reset, migration, provider request, or production rollout.

## Artifacts and Notes

Evidence: [PR #629](https://github.com/TupoSoft/LeadEmailFinder/pull/629), reviewed at the SHA recorded above.
The original planning checkout used `2ac6ea303e40e78efca92da8baf82d838a337a6d`. This documentation PR is based on
the PR #629 merge, `d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`, where plan 04 and its controllers are delivered.
Recheck the implementation base, then record the final generated types and exact test totals in this document.

## Plan readiness

Ready to implement
