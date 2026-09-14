# Restore Verification Validation Fixtures

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Restore the validation baseline for the verification contract introduced by PR #629. The existing checks must
accept its intended operation metadata and billing behavior while still rejecting unsafe response fields.
This PR changes test code and fixtures, with the proposed title
`test(email-verification): align validation fixtures with durable billing`.

## Progress

- [ ] (2026-09-15) Correct the typed query callback and the four outdated OpenAPI assertions.
- [ ] (2026-09-15) Update the existing Bruno runner fixture for the current billing workflow.
- [ ] (2026-09-15) Run the focused checks and record local results separately from CI.

## Plan dependencies

- `verification-billing/04`

## Surprises & Discoveries

At PR #629 head `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`, the backend CI job stopped at lint:
`typeorm-verification-execution.store.spec.ts:280` invoked a value narrowed from `unknown` to `Function`.
The contract CI job passed 19 tests and failed four assertions that still expected the old statuses, result
fields, and generated types. Later backend checks did not run in that job.

A focused local run of the Bruno runner test also failed at collection request 8. Its fake completed response
omitted the required `operation` block. It still modeled an immediate debit and a 15-request workflow, while the
current collection contains 22 requests. This additional local observation is separate from the CI failure.
Browser UI and live jobs had no executed steps in the reviewed run; their infrastructure cause is unverified.

## Decision Log

- Decision: Correct the fixtures without relaxing allowed-field checks, type checks, or failure diagnostics.
  Rationale: Validation must continue to detect leaked queue fields and incorrect billing responses.
  Date/Author: 2026-09-15, Codex remediation planning.
- Decision: Keep workflow scheduling and runner configuration outside this PR.
  Rationale: The observed source failures have narrow test fixes. Missing browser execution needs separate evidence.
  Date/Author: 2026-09-15, Codex remediation planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The callback fixture is in
`src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.spec.ts`.
Its fake query builder evaluates the callback passed to `andWhere` to test canceled-execution cleanup.
The production query needs no change to repair this lint error.

`scripts/openapi/contracts.test.mjs` exports the real Nest application document with network access disabled.
It checks filtered browser fields, runtime fields, examples, and generated TypeScript.
`scripts/bruno/async-verification-runner.test.mjs` starts a private fake HTTP server and runs the pinned Bruno CLI.
Its positive workflow and deliberately unsafe queue-state workflow share a fixture that must be reset between runs.

The corresponding production contracts are the async DTOs under
`src/libs/modules/email-verification/src/api/http/asynchronous-verification/`, the synchronous response DTO,
and the requests under `bruno/async-verification/`. `scripts/bruno/run-collection.mjs` owns expected counts.
The workflow `.github/workflows/validate.yml` uses `corepack pnpm lint` and
`node --test scripts/openapi/*.test.mjs` at the two observed failing steps.

## Scope and Non-Goals

Fix the three identified groups of stale test code. Keep test registration, privacy assertions, skip rejection,
and the current collection intact. Plan 07 separately fixes the inaccurate 400 message schema; this plan follows
the current runtime contract and does not invent new error variants. No application behavior, package upgrades,
workflow selectors, test disabling, or browser infrastructure repair belongs in this PR.

## Plan of Work

Give the query-builder callback an explicit local callable type with the fake builder parameter and its actual
return type. Use a union with the accepted string predicate if needed. Invoke it only after narrowing to that
callable branch. Keep the assertion that the generated cancellation query excludes already-cleaned rows.
Do not use `any`, a broad `Function` cast, or an ESLint suppression.

Update the four OpenAPI tests to cover the added 409, 410, and 429 statuses, completed and failed `operation`
metadata, exact generated status variants, and the synchronous result metadata. Preserve the five-state
discriminator. Queued, running, and unavailable variants still contain only `state`.
Check required fields against the actual DTO declarations: the async operation property is optional at the
reviewed head, while completed runtime responses populate it. Keep examples and compiled type assertions
consistent with that distinction. Continue to reject internal queue, credential, and execution fields.

Replace the outdated behavior within the existing Bruno fake with a small stateful fixture. Validate bodies
before admission. Track a fixed clock, request IDs, addresses, and organization-scoped idempotency keys.
Model the first fixture address as an inconclusive settled result with a released reservation and no debit.
Its immediate resubmission returns the documented address-limit response. A distinct keyed address must support
same-key replay, conflicting-input rejection, and expired-key rejection. Include the safe operation metadata
expected by the collection. Preserve missing/foreign-ID concealment and insufficient-funds rejection.

Assert the current 22-request workflow count and observed distinct submissions, deriving no billing result from
the request ordinal. The fake must not import the production admission service or simply return whichever shape
the next assertion wants. Reset its clock, balance, requests, and keys before the separate unsafe queue-state
run. That run must still fail at the intended polling step and retain sanitized diagnostics.

## Interfaces and Dependencies

There is no public interface or schema change. The only additional types are purpose-specific test fixture types.
The existing Node test runner, Jest, Bruno CLI, and OpenAPI exporter remain the validation tools.
This plan provides a usable contract baseline for plan 07 and should be implemented first among these repairs.

## Acceptance Criteria

- The callback fixture passes lint without weakening the unsafe-call rule or changing the production query.
- All OpenAPI tooling tests pass and still reject unexpected customer-visible fields and invalid status variants.
- The pinned Bruno fixture executes all 22 current requests successfully with the expected billing metadata.
- The deliberately unsafe queue response still fails at its intended polling request after an independent reset.
- Fixture failure output contains no raw addresses, headers, credentials, response bodies, or queue details.
- The existing broader runner suite passes. No test is skipped or removed to obtain a passing result.
- The final report distinguishes local success, observed CI results, and browser jobs that did not execute tests.

## Validation

Run from the implementation checkout, where generated artifacts remain tracked in Git:

```sh
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.spec.ts
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm openapi:check
node --test scripts/openapi/*.test.mjs
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm test:oidc-runners
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/08-restore-verification-validation.md
git diff --check
```

The Bruno runner test executes the pinned CLI against its private fake HTTP server. It is not live API/SMTP
validation. Bruno collection changes are not applicable to this fixture-only PR; the existing collection is
the contract being exercised. Do not claim that these commands ran during plan authoring or that all CI jobs pass.
If a focused test reveals another unrelated baseline failure, record it without silently expanding this PR.

## Idempotence and Recovery

Each fake-server run starts with fresh in-memory state and closes its listeners and temporary files in cleanup.
No development database or external service needs a reset. Repeat the tests to verify fixture isolation.
Do not rerun remote workflows or change runner capacity as part of this local repair plan.

## Artifacts and Notes

Reviewed CI run: [Validate 34871810463](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34871810463).
The additional local failure was reproduced with:

```sh
node --test --test-name-pattern='pinned CLI runs the async workflow once and rejects raw queue states' scripts/bruno/async-verification-runner.test.mjs
```

It reported one failed test and a sanitized collection failure at request 8, with 22 requests and 21 tests.
Treat these as review observations at the pinned head. Record new validation evidence during implementation.

## Plan readiness

Ready to implement
