# Keep Batch Browser Fixtures Compatible with the Public Status Contract

This living ExecPlan follows `.agents/PLANS.md` and must remain current during implementation.
It describes exactly one pull request: `test(web): align batch browser fixtures with status contract`.

## Purpose / Big Picture

Restore the batch browser suite after the billing status contract adds required fields. Valid mocked responses
must reach the existing progress, failure, and download screens, while malformed responses remain rejected.
An engineer observes success when the unchanged workflows pass in both desktop and narrow Chromium projects.

## Progress

- [x] (2026-10-12) Confirmed the prerequisite contract and inventoried mocked batch status responses. Merged PR #633
  had already added `resultsAvailable`, `counts`, and `billing` to the browser `snapshot()` fixture, so the reviewed
  `ApiError(502)` rejection no longer reproduces. The fixture remained untyped and its states were incoherent.
  Issue #650 is assigned and moved to `In Progress`.
- [x] (2026-10-12) Replaced `snapshot(status, extra)` with fixtures typed by the generated `GET /verifyBatch/{id}`
  response and gave each state coherent status, address counts, and billing fields.
- [x] (2026-10-12) Ran focused static and component checks, built once, and executed both browser projects.
- [x] (2026-10-12) Recorded validation evidence, reviewed the test-only diff, and prepared the single pull request.

## Plan dependencies

- `verification-billing/05`

## Surprises & Discoveries

- The reviewed defect was fixed before merge: PR #633 added the required fields to the browser fixture, and PR #666
  later added the settled `processing_failed` billing override. On `master` at `6b1ab4a`, every mocked status
  passed runtime validation. The remaining gaps were acceptance criteria 1 and 2. A `snapshot(status: string, extra = {})`
  factory let the compiler accept missing fields. Its states were also incoherent: the completed fixture charged 60
  credits with zero completed or conclusive addresses and a zero original reservation, queued reported 37.5 percent
  progress, and both `invalid_csv` and `insufficient_credits` reported an 80-credit reservation.
- The server derives `total`, `processed`, and `unprocessed` from the admission's unique addresses and unsettled
  count, so a job with no admission reports zero totals. `billing.reserved` is the cumulative original reservation
  and stays set after settlement. `billing.state` becomes `settled` only once every unique address completes.
- The repeated inventory found no other successful batch status mock under `apps/web/tests`. The `verification-billing-ui`
  browser spec mocks only single verification and billing. The component and adapter fixtures already carry every field;
  the adapter's malformed payloads remain untyped.
- `test:e2e:prebuilt` passes its own fixed spec list to Playwright, so a trailing file argument does not narrow it.

## Decision Log

- Decision: Repair test data at its existing owner without changing runtime validation or product behavior.
  Rationale: The new response fields belong to the prerequisite API contract; accepting incomplete successful
  fixtures would conceal contract drift. Date/Author: 2026-09-15, Codex planning.
- Decision: Use the generated endpoint response type to check valid fixtures, keeping deliberately invalid payloads
  outside that type. Rationale: Type checking should detect missing successful-response fields without preventing
  defensive transport tests from exercising malformed input. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep the fixture helper local to the browser test unless inspection finds another actual consumer.
  Rationale: A shared fixture framework adds no value for one owner. Date/Author: 2026-09-15, Codex planning.
- Decision: Model the `processing_failed` example as a failure after every address settled, such as a result file
  that could not be written, rather than a failure before admission. Rationale: The existing assertion that the
  failed page shows 30 settled credits keeps its observable purpose. The server reports `settled` only after every
  unique address completes. The plan permitted either shape. Date/Author: 2026-10-12, Claude implementation.
- Decision: For the queued state, assert the existing validation copy instead of the `80` row count.
  Rationale: The corrected queued fixture has zero counts, so the page shows its validation message. Asserting that
  message preserves the check that server-provided counts reach the screen. Date/Author: 2026-10-12, Claude implementation.

## Outcomes & Retrospective

Delivered as a test-only change to `apps/web/tests/e2e/batch-verification-ui.spec.ts`. Its fixtures are now typed
`Record` maps of the generated successful response, with no casts. Temporarily deleting `resultsAvailable` from the queued
fixture made `typecheck` fail with `TS2741`; the field was then restored. Queued, running, completed, unavailable,
and the three failure examples carry coherent counts and billing. Application code, API contracts, visual tokens,
copy, and screenshot baselines are unchanged. Validation on 2026-10-12:

- `eslint tests/e2e/batch-verification-ui.spec.ts` and the web `typecheck` passed.
- `test:ci` for the batch adapter and page tests passed: 2 files, 98 tests.
- `corepack pnpm ui:audit` reported 0 violations and 0 unresolved findings; the web build succeeded.
- `test:e2e:prebuilt --project=desktop-chromium --project=narrow-chromium` passed 142 tests, including 12 batch UI
  cases per project, with none skipped or flaky.

## Context and Orientation

The reviewed code is PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`. The current checkout's
`master` baseline, `451798dadf82e316ba68b4333ddba32bf0f99a97`, does not yet contain its richer contract.
Implement this plan after `verification-billing/05` is present; do not copy its application changes into this PR.

`apps/web/src/features/verification/batch-verification-api.ts` derives `BatchVerificationStatus` from the generated
`GET /verifyBatch/{id}` response and validates successful responses before caching their public fields. The
reviewed version requires `resultsAvailable`, every address count, and `billing.state`, `reserved`, and `charged`.
`packages/api-client/src/schema.d.ts` is the generated type owner; its source contract is
`packages/api-client/openapi/lead-email-finder.json`.

`apps/web/tests/e2e/batch-verification-ui.spec.ts` owns a local `snapshot(status, extra)` fixture. It still returns
only `id`, `status`, `progress`, `total`, `processed`, and `unprocessed`. Requests succeed with HTTP 200, but
`readBatchVerification` throws `ApiError(502, 'request-failed')` before the screen receives those snapshots.
The component and adapter fixtures under `apps/web/src/features/verification/` already include the new fields.

`apps/web/src/routes/BatchVerificationJobPage.tsx` renders server progress and counts, safe failure copy, and
completed-result download controls. `use-batch-verification.ts` and `use-verification-polling.ts` preserve bounded
reads, stale data, and explicit recovery. These are existing behavior owners, not edit targets for this task.

The reviewed test inventory finds no other mocked batch status owner under `apps/web/tests`. The live
`tests/e2e/batch-verification.spec.ts` uses real HTTP. `accessibility.spec.ts` and `visual.spec.ts` exercise public
routes and contain no batch fixtures. Recheck that inventory against the implementation base.

## Scope and Non-Goals

Change valid response fixtures and their necessary test assertions in
`apps/web/tests/e2e/batch-verification-ui.spec.ts`. Update another browser fixture only if the inventory finds the
same batch-status omission. Keep negative transport fixtures intentionally malformed.

This PR adds no UI, copy, design, runtime, API, generated schema, authentication, billing, or polling behavior.
It does not implement failed-result downloads, revise availability semantics, weaken validation, increase timeouts,
skip tests, or regenerate visual baselines. It introduces no migration, library, service, or configuration setting.
It restores reliable browser regression evidence for subsequent batch work and can merge independently of the
other hardening plans once its single prerequisite is available.

## Plan of Work

First read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, and the repository frontend design, premium,
React, and testing skills. Reuse the approved design. Inspect the merged status contract and repeat the fixture
inventory across browser, accessibility, visual, component, and transport tests.

Next import the generated `paths` type from `@tuposoft/lead-email-finder-api-client` into the browser spec and
derive a local alias for the successful `GET /verifyBatch/{id}` JSON response. Give the valid fixture factory an
explicit return type and constrain supported status values to that alias. Use `satisfies` on state-specific fixture
objects where useful; do not use type assertions to force incomplete data through the compiler. The existing
`apps/web/tsconfig.node.json` includes `tests`, so the ordinary web typecheck covers this fixture.

Keep fixture state coherent. An initial queued batch has zero counts, zero charges, pending billing, and no result.
A running fixture can retain 80 unique addresses, 30 completed addresses, and 37.5 percent progress; its reserved
amount covers admitted fresh work and its charged amount matches completed conclusive work. A completed fixture
has 80 completed addresses, zero unprocessed addresses, 100 percent progress, settled billing, and an available
result. Use no duplicate, shared, cached, or cooldown addresses in these ordinary examples. An unavailable fixture
may retain the last running counts and pending billing, without advertising a result or a safe failure code.

Provide separate failed fixtures for the existing safe failure codes. Invalid input carries no admitted work;
insufficient funds carries parsed counts but no reservation or charge; a processing failure before admission can
carry zero completed work and no charge. Choose their `resultsAvailable` values from the prerequisite's actual
response semantics and document that field's existing meaning in the test fixture if needed. This plan must not
resolve the separate failed-download defect or create a dependency on its fix. Adapt numerical assertions when
the corrected queued fixture changes its initial totals; preserve the assertions' observable purpose.

Finally preserve existing terminal polling, failure recovery, upload acknowledgment, download retry, offline,
keyboard, accessibility, and narrow viewport assertions. Leave the raw unknown-status and malformed-field payloads
in `batch-verification-api.test.ts` untyped as successful responses. Run validation and record exact outcomes.
Review the diff for accidental runtime or design changes before preparing the single PR.

## Interfaces and Dependencies

The only imported contract is a type from the existing generated API client. No endpoint or public type changes.
The fixture remains test-owned; no application class, abstraction, injection boundary, or new shared owner is
needed. The browser suite continues using Playwright routes, existing authentication fixtures, and the configured
desktop and narrow projects. Preserve organization identity and existing request counts in those tests.

## Acceptance Criteria

1. Every ordinary mocked batch status response satisfies the generated successful-response type without casts;
   omitting a required field causes the existing web typecheck to fail.
2. Queued, running, completed, failed, and unavailable examples carry coherent counts and billing for their
   chosen scenario and reach the expected existing screen instead of the generic read-error screen.
3. Terminal reads remain bounded; upload acknowledgment, stale counts, offline recovery, download retries,
   keyboard interaction, and accessible geometry retain their existing assertions in both browser projects.
4. Existing transport tests still reject missing fields and malformed counts and still map unsupported status
   values safely. No rejection path is converted into a successful-response fixture merely to satisfy TypeScript.
5. The scan finds no remaining incomplete successful batch response fixture in the relevant test surfaces.
   Application code, API contracts, visual tokens, and product copy remain unchanged.
6. The specified lint, typecheck, component/adapter, audit, build, and browser commands pass without newly skipped
   cases, relaxed assertions, extra retries, longer time limits, or baseline replacement.

## Validation

Run these commands from the repository root. The first command inventories candidate fixture owners; inspect
matches to distinguish successful mock responses from URL-routing tests and live HTTP tests.

```sh
rg -n 'verifyBatch|resultsAvailable|unprocessed' apps/web/tests apps/web/src/features/verification
corepack pnpm --filter @tuposoft/lead-email-finder-web exec eslint tests/e2e/batch-verification-ui.spec.ts
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci src/features/verification/batch-verification-api.test.ts src/features/verification/BatchVerificationPage.test.tsx
corepack pnpm ui:audit
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt --project=desktop-chromium --project=narrow-chromium
```

The build runs once before the existing prebuilt browser command. That command includes the batch suite and
its configured sibling smoke suites; the batch cases already perform their focused accessibility checks.
If browser installation is needed, use the repository's pinned Playwright setup before the browser command:
`corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium`.
Report the executed projects, case counts, and any remaining environment failure. Missing browsers are not a
passing result and do not relax the acceptance criteria. These mocked tests need no API, database, or SMTP stack.

Bruno: not applicable — this implementation changes browser test fixtures only and preserves HTTP API behavior.

## Idempotence and Recovery

Fixture edits and mocked browser runs are repeatable and create no server data. Rerun a failed check after fixing
its actual cause. Restore only this PR's test edits if abandoned, preserving unrelated checkout changes. Rebuild
after any later source changes before reusing the prebuilt browser command. No database reset or reseed is needed.

## Artifacts and Notes

The review compiled the pinned production adapter and evaluated the unchanged browser `snapshot()` source:
queued, running, completed, failed, and unavailable all rejected with `ApiError(502, 'request-failed')`.
Full browser execution was unavailable in that review because Chromium binaries were absent. The separate
`ui:audit` passed with zero findings; that static result does not prove these browser cases pass.
Planning inspected the required contracts and readiness checklist. No implementation or new browser validation
has been completed. This plan contains no unresolved product decision and maps to one test-only pull request.

## Plan readiness

Ready to implement
