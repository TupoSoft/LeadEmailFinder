# Explain Actual Verification Charges in the Browser

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the agreed billing policy understandable in the existing browser product. Users can distinguish available,
reserved, and deducted credits; see whether a result was cached or shared; and understand why a batch with
duplicates costs less than its row count. The UI displays the server's settled amounts and preserves uncertainty.

## Progress

- [ ] (2026-09-08) Extend billing summary presentation with available and reserved credits.
- [ ] (2026-09-08) Update single-verification copy, outcome details, and recovery metadata.
- [ ] (2026-09-08) Update batch counts, charges, and duplicate/output explanations.
- [ ] (2026-09-08) Update shared behavior contracts and focused browser/accessibility evidence.
- [ ] (2026-09-08) Complete generated-client, design-contract, prose, and runtime validation.

## Plan dependencies

- `verification-billing/05`
- `frontend/11`
- `frontend/12`

## Surprises & Discoveries

The current checkout has the billing screen but not the single/batch feature screens described by `frontend/11`
and `/12`. Those plans assume upfront charges and unknown debit consequences on failure. This plan deliberately
depends on their delivered screens and replaces those billing-specific assumptions after the backend policy ships.

## Decision Log

- Decision: Explain reservations as credits temporarily set aside, and label deductions only from settled server
  metadata. Rationale: A lower available count does not mean the user was charged. Date/Author: 2026-09-08, policy planning.
- Decision: Keep verification forms usable with a zero balance. Rationale: Only the server can determine whether
  an address is cached or can join funded work. Date/Author: 2026-09-08, policy planning.
- Decision: Reuse the approved visual system and session/query contracts. Rationale: This is a behavior and copy
  change, not a redesign or a new frontend architecture. Date/Author: 2026-09-08, policy planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The React/Vite frontend is `apps/web`. Existing billing files include `src/features/billing/BillingPanels.tsx`,
`billing-api.ts`, `use-billing.ts`, and `src/content/billing.ts`. Shared components and routes live under `src/shared`
and `src/routes`; the session generation and QueryClient owners are under `src/features/auth`. The prerequisite
frontend plans add the verification and batch feature folders and routes; inspect their final paths before editing.

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
On partial failure, present the confirmed charge and safe failure state, and enable download when the server
reports `resultsAvailable`; avoid claiming zero charges unless the
server confirms it. Download/reload/status actions do not resubmit work or deduct credits.

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
- The 100-row/80-unique/20-cached/45-charged fixture shows exactly those counts, and the download retains all rows.
- Network ambiguity, refresh, route navigation, and duplicate activation do not create a second submission/key
  automatically. Manual keyed recovery reports the original charge without implying another debit.
- Session replacement clears all operation inputs and prevents late results or charges from rendering for another
  organization. No addresses, keys, or result bodies are stored in local/session storage or URLs beyond UUID handles.
- Keyboard, screen-reader, reduced-motion, narrow, and desktop users can understand and recover from every billing
  state. Automated accessibility checks report no serious or critical violations.

## Validation

```bash
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

Bruno is not applicable to UI-only implementation when the backend contracts remain unchanged. If implementation
finds a missing HTTP behavior, update the owning backend plan and nearest collection rather than hiding the change
inside this UI PR. Include any additionally edited Markdown files in the Harper invocation.

## Idempotence and Recovery

Read refresh and result download remain safe to repeat. Never derive a new paid operation from component mounting,
polling, history navigation, or a lost response. Keep deliberately supplied request keys only within the existing
session-owned coordinator and honor server expiry. Use seeded synthetic identities and results for browser tests;
do not reset another checkout's stack or record real customer addresses in screenshots.

## Artifacts and Notes

This is a plan for extending the approved screens after their prerequisites. No new image concept or visual
approval is needed. Runtime and browser acceptance remain unverified until the implementation PR runs these checks.

## Plan readiness

Ready to implement
