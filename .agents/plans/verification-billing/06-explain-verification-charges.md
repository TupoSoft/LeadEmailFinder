# Explain Actual Verification Charges in the Browser

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the agreed billing policy understandable in the existing browser product. Users can distinguish available,
reserved, and deducted credits; see whether a result was cached or shared; and understand why a batch with
duplicates costs less than its row count. The UI displays the server's settled amounts and preserves uncertainty.

## Progress

- [x] (2026-09-23) Merge current `master`, including payer identity fix #676 and result availability fix #734.
- [x] (2026-09-23) Align failed-batch copy, component coverage, browser coverage, and the UX contract with unavailable results after failure.
- [x] (2026-09-23) Validate the combined branch locally and refresh publication evidence. Hosted validation and review readiness are tracked on PR #666.

- [x] (2026-09-17) Correct the CI browser-suite inventory after reproducing the shared policy and backend test failure.
- [x] (2026-09-16) Extend billing summary presentation with available and reserved credits.
- [x] (2026-09-16) Update single-verification copy, outcome details, and recovery metadata.
- [x] (2026-09-16) Update batch counts, charges, and duplicate/output explanations.
- [x] (2026-09-16) Update shared behavior contracts and focused browser/accessibility evidence.
- [x] (2026-09-16) Complete generated-client, design-contract, prose, component, and mocked browser validation.
- [x] (2026-09-23) Pass all three live accounting scenarios after incorporating #676: three passed, zero failed,
  zero skipped, and zero runner errors against the isolated `lef666-3cea` stack.

- [x] (2026-09-16) Reduce billing summary density using the approved compact type and content spacing; verify desktop and mobile rendering.

## Plan dependencies

- `verification-billing/05`
- `frontend/11`
- `frontend/12`

## Surprises & Discoveries

The implementation checkout at `a4680b0` contains the prerequisite single and batch screens and generated billing
contracts. Their original copy still assumes upfront charges. Queued single responses do not provide operation
accounting; the UI must retain an unknown charge state until authoritative metadata arrives.

The initial dependency installation encountered a read-only default pnpm store. A task-specific store under `/tmp`
allows validation without changing the shared package cache. No development containers were running at discovery.
The isolated `lef577` stack supplied the API, authentication, database, and SMTP fixtures for live validation.
Its containers and network were removed afterward; its three named volumes were preserved.
Browser review found native disabling removed status-refresh focus; the shared action treatment and both result
screens now preserve it. Cached responses currently expose a null cache expiry; the browser shows that uncertainty.

Live duplicate-batch validation exposed an existing backend defect at `a4680b0`: batch admission claims an execution
with one payer request ID, then materializes the request with another ID. Settlement marks that request as shared,
so status and CSV accounting report zero even though the ledger captures credits. The four-row/two-unique fixture
returned `billing: { state: settled, reserved: 2, charged: 0 }`; database inspection confirmed two captured credits
and both mismatched payer IDs. The owning Plan 05 records the required repair and regression coverage.

## Decision Log

- Decision: Follow the corrected #734 contract for failed batches: preserve confirmed charges while explaining
  that results are unavailable. Keep the server availability flag authoritative. Replace the impossible failed-job
  download fixture with settled-charge and unavailable-download coverage. Date/Author: 2026-09-23, Codex.

- Decision: Keep available credits as the primary figure. Add a `balance` variant to the existing `SignalDetails`
  owner for compact secondary amounts with regular-weight labels. Separate shorter reservation guidance with
  the existing 1.5rem content gap. Preserve ink contrast and server-owned accounting. Date/Author: 2026-09-16,
  user-approved density refinement.

- Decision: Keep the duplicate-batch live assertion at two charged credits and record the backend defect in Plan 05.
  The UI displays the server's accounting without calculating replacement amounts from row counts or balance changes.
  Backend repair remains outside this UI implementation. Date/Author: 2026-09-16, live validation.

- Decision: Label operation reservation metadata as the original reservation. The server retains `reservedCount`
  after charging or releasing credits, including during partial batch settlement. The organization summary alone
  reports currently held credits. Date/Author: 2026-09-16, implementation.
- Decision: Preserve the documented terminal polling stop. A terminal result with pending accounting offers
  explicit status refresh; it does not restart automatic polling. Date/Author: 2026-09-16, implementation.
- Decision: Keep status refresh focusable with `aria-disabled` during a read and retain the existing dispatch guard.
  Native disabling removes keyboard focus in Chromium. Date/Author: 2026-09-16, browser validation.

- Decision: Explain reservations as credits temporarily set aside, and label deductions only from settled server
  metadata. Rationale: A lower available count does not mean the user was charged. Date/Author: 2026-09-08, policy planning.
- Decision: Keep verification forms usable with a zero balance. Rationale: Only the server can determine whether
  an address is cached or can join funded work. Date/Author: 2026-09-08, policy planning.
- Decision: Reuse the approved visual system and session/query contracts. Rationale: This is a behavior and copy
  change, not a redesign or a new frontend architecture. Date/Author: 2026-09-08, policy planning.

## Publication Review

The 2026-09-23 continuation incorporates merged PRs #676 and #734. Both backend blockers are resolved. The
combined branch passes all local acceptance checks, including all three live accounting scenarios. Fresh hosted
validation is tracked by PR #666 checks. The following publication notes describe the historical September 16 snapshot.

The publication snapshot is based on `e4c1062`; its only additional commit after `a4680b0` adds unrelated planning
documents. Compose recovery, shared spacing, and the divider fix have separate draft pull requests. This UI draft
continues to display authoritative server values, even where backend behavior is still incorrect.

The original batch payer identity defect was tracked by issue #644. Review also confirmed issue #649: failed batch
status could advertise results even though the download endpoint rejected non-completed batches. The merged repairs
resolve both inconsistencies. Failed-batch acceptance now checks unavailable results while preserving confirmed
charges; it does not require a new partial-download capability.

Publication review found that a UUID request key rejected because the device clock is ahead was mislabeled as an
invalid email. The frontend now preserves only that specific public rejection code, explains clock correction,
and permits a deliberate fresh submission without marking a valid address invalid. The retry timer must also
respect a corrected device clock. Focused regression checks cover this behavior without a backend change.

Publication validation on this isolated snapshot passed: 676 web unit tests, 142 mocked browser, accessibility,
and visual cases, and seven runner/privacy checks. Frontend and runner ESLint, the production build, module
architecture, OpenAPI consistency, design lint, and the strict UI audit also passed. No screenshot baseline changed. The live accounting
runner was not rerun on that snapshot; its historical result was two passed and one failed.
The publication process did not reset data or change the running development stack.

## Outcomes & Retrospective

Completion (2026-09-23): the updated branch incorporates both merged backend fixes. The strict command
`COMPOSE_PROJECT_NAME=lef666-3cea corepack pnpm test:verification-billing-web` passed all three live scenarios with
zero failures, skips, or runner errors. Fresh conclusive evidence charges once, cached reuse works at zero balance,
inconclusive SMTP evidence is free, and the four-row/two-unique batch reports two charges consistently in the UI,
API, CSV, and balance. The run used the real local API, Keycloak with MFA, PostgreSQL, Redis, object storage, DNS,
proxy, and SMTP fixture. It restored the customer balance and removed the exclusive fixture lock. Proxy cleanup
and Compose shutdown removed all owned containers and networks; the three named data volumes were retained.

Failed-batch copy and regression coverage now follow #734: confirmed charges remain visible while results are
unavailable. All 676 component tests, 142 browser/accessibility/visual cases, and seven runner/privacy checks pass.
No screenshot baseline changed. Hosted CI results are tracked on PR #666; the earlier failure below is historical.


CI repair (2026-09-17): PR #666 added the verification-billing browser suite but left the workflow test's expected
suite list unchanged. Both the policy and backend jobs failed on that single assertion; the final validation job
reported their failure. The expected list now includes the new suite and retains exact inventory, build-order,
and failure-propagation checks. The focused policy checks passed all 315 tests, and the validation-selection
fixtures and scoped ESLint also passed. This repair changes only test expectations and documentation.

All 98 runner tests passed separately. The full local Jest run passed 3330 tests but failed an unchanged security
scanner test: local Git 2.43 emits line-delimited output where the scanner expects null-delimited history. The
original CI run used Git 2.55 and passed that test. Local full-suite validation therefore remains limited by the
Git version; this CI repair does not change the scanner. The 113 conditional integration tests were skipped.

The browser now distinguishes current account holds from historical operation reservations and settled charges.
Single submissions retain a cryptographic UUIDv7 key and their original input for deliberate recovery. Batch views
show original rows and unique, duplicate, cached, and shared addresses, with downloads controlled by the server's
availability flag. Both forms remain usable with a zero balance. Shared charge presentation and retry-time helpers
reuse generated types, existing panels, and the session boundary; no backend policy or API schema changed.

Static, component, mocked browser, accessibility, and visual checks passed as recorded below. Live fresh charging,
free cache reuse at zero balance, and actual inconclusive SMTP evidence passed. Duplicate-batch accounting failed
because of the prerequisite payer identity defect on that historical snapshot. The September 23 run above closes
the live acceptance gate. The
implementation retains existing feature hooks and adapters; no material architectural trade-off or new
infrastructure dependency was introduced.

The approved density refinement keeps available credits prominent while secondary figures and reservation
copy use compact type. Computed browser checks confirm regular-weight labels and a 24-pixel gap above the note.
The focused billing component suite passed 23 tests, and the billing and verification-accounting browser suites
passed 28 tests. Synthetic screenshots at widths of 1440, 390, and 320 pixels show no overflow. Accessibility checks
reported no violations; console and page-error checks were clean. Keyboard refresh on the mocked payment-return
screen updates authoritative balances. Browser plugin tools were unavailable, so validation used Playwright.
Build, focused lint, design lint, the UI audit, and Harper passed. The local web container was rebuilt and now
serves the updated assets at port 53000. No API contract changed; Bruno coverage is not applicable to this refinement.
Screenshot evidence is outside the repository at `/tmp/lef577-billing-refinement/`.

## Context and Orientation

The React/Vite frontend is `apps/web`. Existing billing files include `src/features/billing/BillingPanels.tsx`,
`billing-api.ts`, `use-billing.ts`, and `src/content/billing.ts`. Shared components and routes live under `src/shared`
and `src/routes`; the session generation and QueryClient owners are under `src/features/auth`. Single and batch
features live under `src/features/verification`, with their form and job pages under `src/routes`. Shared charge
presentation, request-key generation, and retry timing live under `src/shared`.

Plan 02 adds `{ balance, reserved, available }` to the current-organization billing summary. Plans 04 and 05 provide
operation source, evidence times, settled charges, batch counts, and safe recovery handles. Generated types live
in `packages/api-client/src/schema.d.ts`. Root `DESIGN.md`, `UX-CONTRACT.md`, and `premium-ui.json` govern reusable
visual/behavioral patterns. Read the local frontend-design, frontend-design-premium, React, and testing skills.

## Scope and Non-Goals

Update billing and the existing single/batch screens to explain authoritative policy and results. Do not add
checkout options, a new pricing model, forced refresh, automatic POST retries, history, cancellation, provider
details, or client-side confidence inference. Backend policy and charge calculation remain in Plans 01 through 05.

## Plan of Work

Keep the billing summary's current panel and loading/error boundaries. Lead with available credits, show reserved
credits as a separate labeled value, and retain total balance as an explicitly labeled figure. Explain that reserved
credits return to availability when a check finishes without a charge. Refresh authoritative summary after operation
completion or a confirmed admission failure, subject to the existing billing permission; do not subtract locally.

Single-submit copy states: one credit for a new conclusive result; cached and inconclusive results are free. Keep
duplicate-submit prevention and mutation retries disabled. Generate one canonical UUIDv7 request key per deliberate
submission through a shared helper with clock/format tests and cryptographic random bytes, then
retain it in the existing session-scoped operation coordinator until the outcome is known. A deliberate recovery
action can resend the same key and input; it must not silently generate a new key after an ambiguous response.
Clear keys/input with the existing authenticated-session boundary and never persist addresses in browser storage.

Show pending reservation separately from settled `1 credit charged` or `No credits charged`, with a plain reason
for cache reuse, shared work, inconclusive outcome, or failure. Show evidence observation time and cache expiry
using the application's explicit timezone convention. A new request timestamp must not imply fresh evidence.
Keep existing uncertainty labels for `exists` and `catchAll`; billable quality does not prove future delivery.

For batch views, show total rows, unique addresses, duplicate rows, cached/shared addresses, and charged/reserved
credits using Plan 05 metadata. Explain that every original row is retained in the CSV. While funding or settlement
is pending, show the server's reserved amount and state rather than predicting a charge from row or success counts.
On partial failure, present the confirmed charge and safe failure state, and explain that failed batches have no
downloadable results. Enable download only when the server reports `resultsAvailable`; avoid claiming zero charges
unless the server confirms it. Download/reload/status actions do not resubmit work or deduct credits.

Do not disable either form solely because a cached billing balance is zero. On backend `402`, preserve the existing
capability-aware purchase link or contact-owner instruction. On `429`, show the server's retry time and offer a
deliberate retry after it; do not auto-submit. On an uncertain POST, retain the known handle/key and existing safe
recovery state. Bounded read polling pauses offline/hidden, stops on terminal/unavailable states, and preserves focus.

Use centralized English copy, existing `ProductPanel` and Form owners, text labels in addition to color, polite live
announcements for settlement changes, and fixed space for pending values. Update `UX-CONTRACT.md` for changed
behavior. Change `DESIGN.md`, runtime styles, and `premium-ui.json` together only if a new shared visual decision is
actually required; ordinary content changes reuse the approved tokens. Reconcile billing-specific statements in
the frontend plans' living outcomes after implementation without rewriting unrelated historical decisions.

## Interfaces and Dependencies

Consume generated `VerificationOperationMetadata` and batch accounting contracts; never create independent string
unions that can drift. Cache query keys remain organization-scoped and are cleared on sign-out or principal
replacement. The same operation component vocabulary is used for single and batch outcomes while their counts
remain distinct. No new backend endpoint, external service, or runtime library is needed.

## Acceptance Criteria

- With total 10 and reserved 3, the UI shows available 7 and explains the reservation without claiming three
  credits were deducted. Server settlement/release updates the displayed snapshot without optimistic arithmetic.
- A zero-balance user can submit a cached address and see no charge. An uncached `402` offers only permitted
  recovery. Cache/shared results, pending settlement, and unknown outcomes remain distinguishable.
- The 100-row/80-unique/20-cached/45-charged completed fixture shows exactly those counts, and the download retains all rows.
- A failed batch with settled charges preserves those charges, explains unavailable results, and offers no download.
  Keyboard status refresh preserves focus and never starts another submission.
- Network ambiguity, refresh, route navigation, and duplicate activation do not create a second submission/key
  automatically. Manual keyed recovery reports the original charge without implying another debit.
- Session replacement clears all operation inputs and prevents late results or charges from rendering for another
  organization. No addresses, keys, or result bodies are stored in local/session storage or URLs beyond UUID handles.
- Keyboard, screen-reader, reduced-motion, narrow, and desktop users can understand and recover from every billing
  state. Automated accessibility checks report no serious or critical violations.

## Validation

```bash
corepack pnpm exec jest --runInBand select-validation validate-workflow execplan-repository-fixture
corepack pnpm test:ci-paths
corepack pnpm test:ci
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-web lint
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y
corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e
corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual
corepack pnpm test:verification-billing-web
corepack pnpm openapi:check
corepack pnpm design:lint
corepack pnpm ui:audit
corepack pnpm docs:lint -- UX-CONTRACT.md .agents/plans/verification-billing/06-explain-verification-charges.md
```

Add focused component cases beside billing and the delivered verification/batch features. Add a focused Playwright
file `apps/web/tests/e2e/verification-billing-ui.spec.ts` to the normal browser command. Cover 320 by 720, 390 by 844, and
1440 by 900 layouts, keyboard recovery, settlement announcements, offline/resume, and session replacement. Reuse the
existing MFA-aware live browser fixture from `frontend/09`. Register `test:verification-billing-web` with
`scripts/testing/verification-billing-web.mjs`, reusing the owned fixture/credential bootstrap in the delivered
verification live runners. Add `apps/web/playwright.verification-billing.config.ts` and
`apps/web/tests/e2e/verification-billing.spec.ts` for real cached, inconclusive, and duplicate-batch charges. The
launcher must reject skipped/empty runs and redact credentials and addresses from diagnostics. Mocked browser
evidence does not replace that local API/SMTP/ledger check.

Bruno is not applicable to this UI-only implementation because the backend contracts remain unchanged. If implementation
finds a missing HTTP behavior, update the owning backend plan and nearest collection rather than hiding the change
inside this UI PR. Include any additionally edited Markdown files in the Harper invocation.

## Idempotence and Recovery

Read refresh and result download remain safe to repeat. Never derive a new paid operation from component mounting,
polling, history navigation, or a lost response. Keep deliberately supplied request keys only within the existing
session-owned coordinator and honor server expiry. Use seeded synthetic identities and results for browser tests;
do not reset another checkout's stack or record real customer addresses in screenshots.

## Artifacts and Notes

Validation on the combined branch, 2026-09-23:

- `COMPOSE_PROJECT_NAME=lef666-3cea corepack pnpm test:verification-billing-web`: three live tests passed,
  zero failures, skips, or errors. The fixture restored its starting balance of 1000 and released its lock.

- Web component tests passed all 676 cases with `corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=2`.
  The first unrestricted run timed out in two unchanged lazy route tests while Docker images were building;
  the bounded full rerun passed. No unrelated test or runtime code was changed.
- Web lint and `build` passed; the build includes semantic type checking. Existing Vite loader and bundle-size
  warnings remain nonfatal.
- The normal browser selection plus accessibility and visual suites passed all 142 cases with two workers.
  After removing temporary screenshot capture, the six affected failure-recovery cases passed again.
- Desktop and narrow failed-batch screenshots were inspected at 1440 and 320 pixels. Charges remain readable,
  unavailable results have no download button, and keyboard refresh preserves focus without another POST.
  Evidence remains outside the repository at `/tmp/lef666-failed-batch-1440.png` and
  `/tmp/lef666-failed-batch-320.png`. Browser plugin tools were unavailable; the repository Playwright workflow
  used installed Chromium. Mocked UI validation ran at `http://127.0.0.1:4173`.
- All seven accounting-runner and browser privacy checks passed. The three CI policy suites passed 323 tests;
  the validation-selection fixtures also passed. OpenAPI consistency, design lint, strict UI audit, scoped runner
  lint, and the module architecture gate passed with zero violations.
- Independent review found no blocking runtime defects or material architectural trade-offs. Server accounting
  and availability remain authoritative, with feature-owned copy and shared charge presentation.

Historical validation recorded on 2026-09-16:

Validation recorded on 2026-09-16:

- Web `test:ci`: 670 tests passed across 31 files. The final singular-credit copy check also passed all 23 billing
  route tests. After the final pending-accounting copy correction, all 117 single/batch component tests passed.
- Web type checking, lint, production build, `openapi:check`, `design:lint`, and strict `ui:audit` passed.
- The normal browser selection exercised 134 cases. Five existing single-screen checks exposed stale mock setup;
  after updating those fixtures, all 22 single-screen cases passed. The other 112 cases passed in the integrated run.
- The final pending-accounting copy passed both desktop and narrow settlement recovery browser checks.
- Dedicated accessibility and visual-baseline checks passed all eight cases. New billing/browser cases cover
  320 by 720, 390 by 844, and 1440 by 900, keyboard recovery, reduced motion, and session replacement.
- The runner's four Node tests reject incomplete, skipped, and failed evidence, and check redacted reporting.
  All three browser artifact guards passed with Chromium available, including the new billing configuration.
- The final live configuration ran three tests: two passed, one failed, zero skipped, and zero runner errors. The
  retained failure is `verification-billing.spec.ts:168`, which expects two charged credits. Actual SMTP evidence
  was verified: fresh evidence had observation/expiry timestamps, cache reuse retained its observation timestamp,
  and the inconclusive result was `accepted_email` with `catchAll: true`.
- Harper passed all five changed Markdown files. Include both prerequisite frontend plans and the owning batch
  backend plan in the command in Validation after any further prose edits.
- Browser plugin not available. The repository Playwright workflow used Chromium from
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-577-playwright`; artifacts are outside the repository under `/tmp`.

The historical live command was `COMPOSE_PROJECT_NAME=lef577 PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-577-playwright corepack pnpm test:verification-billing-web`.
The launcher requires three passing scenarios and rejects skipped or empty evidence. The final strict run used
the same `playwright.verification-billing.config.ts` directly with a counts-only report under `/tmp`; it did not
pass the three-scenario gate. No new visual concept or shared design token was needed.

## Plan readiness

Ready to implement
