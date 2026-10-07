# Apply Shared Content Spacing

This living document is maintained according to `.agents/PLANS.md` and describes one independently reviewable pull request.

## Purpose / Big Picture

AI-generated and maintained product panels use the same spacing owner. A developer can compose vertical content with
`Stack` and explanatory copy with `SupportingText`, then verify the billing summary at desktop and phone widths.

## Progress

- [x] (2026-09-29) Confirmed that PR #666 is merged and the shared spacing owners are still absent from `master`.
- [x] (2026-09-29) Prepared the conflict resolution from current `master` plus the original 15-file spacing change.
  Preserved the later billing fixes and the current UX contract. Every original spacing patch matched its context.
- [x] (2026-10-07) Verified successful hosted validation for the final PR #667 commit,
  `9dec5e7c57106867edef184f3a1f818ae93e3a9b`, in [run 36873176744](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/36873176744).
  PR #667 merged into `master` on October 1, 2026. This evidence completes the validation left pending on September 29.

- [x] (2026-09-16) Inspected the design tokens, agent guidance, billing layout, audit, and browser coverage. The synced issue search for `frontend-spacing/01` returned no issue.
- [x] (2026-09-16) Added shared owners, the billing consumer, and synchronized design and agent contracts.
- [x] (2026-09-16) Added exact CSS token bindings and permanent browser geometry, recovery, and hidden-content checks.
- [x] (2026-09-16) Passed focused validation, inspected desktop and phone screenshots, and rebuilt the local web container.

## Plan dependencies

- `verification-billing/06`

## Surprises & Discoveries

The existing audit checks token values and their presence in consumer files, but not their use by a specific CSS
selector and property. Billing screenshots were captured without an assertion on the gap above reservation guidance.
The working tree already contains verification-charge explanations and a separate Compose repair; preserve them.

The design schema accepts `size` as the component token for gap bindings and rejects scalar typography references.
The manifest therefore binds stack gaps and supporting-text color; browser checks cover typography. The canonical
map parser initially recognized only Scrollbar, so it now also recognizes the two new owners. The source audit
matches unsafe HTML identifiers even when they occur in a type exclusion; the shared components instead explicitly
select the small set of semantic attributes they support.

Independent review found that unconditional grid display overrides the browser's hidden attribute. Grid display
now applies only to stacks without that attribute, and the browser test checks hiding and restoring the real stack.

## Decision Log

- 2026-10-07, Codex: Complete the pending validation item using the successful hosted run for the final PR commit.
  Preserve the September 16 local checks and screenshots as historical evidence; this update makes no new local
  execution, screenshot inspection, or deployment claim.

- 2026-09-29, Codex: Preserve branch history with a merge commit whose tree starts from current `master` and applies
  only the original spacing change. This keeps the later billing fixes and avoids replaying the stale dependency.

- 2026-09-16, Codex: Reuse the existing content and control tokens. Introduce small presentation components without new
  dependencies, business rules, or state. The user authorized this shared spacing contract.
- 2026-09-16, Codex: Migrate only the balance summary now. Apply the instructions to new or changed content groups;
  avoid a global panel layout change that would invalidate unrelated screens.
- 2026-09-16, Codex: Use the existing UI audit and CI-selected verification-billing browser suite. Browser control tools
  and the browser skill are absent, so use the repository Playwright workflow for rendered verification.

## Publication Review

[PR #667](https://github.com/TupoSoft/LeadEmailFinder/pull/667) merged into `master` on October 1, 2026,
with merge commit `0ada6049540c374b711c4d5edcd902eff1ba520f`. Its prerequisite, PR #666, merged on September 27.
The September 29 conflict resolution used `06563e6f923fa7673ec676f5deab61da3d33cf29` as its base and preserved the
original spacing change from `ee4af068`, together with the later verification, accounting, download, and recovery behavior.

[Hosted validation run 36873176744](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/36873176744)
succeeded for final PR commit `9dec5e7c57106867edef184f3a1f818ae93e3a9b`. The workflow tested its merge
with the base branch at `55d9fd64335e202e75998bc71110a128489e688d`. The web job ran and passed tests,
type checking, the build, lint, design lint, and the strict UI audit. The browser jobs passed billing geometry and recovery checks at desktop and phone widths, accessibility checks,
public-page visual baseline tests, artifact protection checks, and live integration checks. The repository policy job
passed Harper and architecture checks, and the image builds and final validation gate passed.

Historical validation on the September 16 publication branch passed:

- 24 billing component tests and 40 UI audit tests.
- 30 mocked browser cases at desktop and phone widths.
- The production build and both ESLint checks.
- Design lint and the strict UI audit.

Desktop and phone screenshots were inspected without changing baselines. The validation and local delivery
recorded below describe the original implementation checkout. Publication does not rebuild its running web
container or mutate billing data. The shared owners retain their presentation-only responsibility.

## Outcomes & Retrospective

Completion review (2026-10-07): the implementation is merged and hosted validation for the final PR commit passed.
All seven progress items are complete. The earlier validation gap was caused by unavailable local execution on
September 29; the successful hosted run supplies the missing evidence. No implementation work remains in this plan.

On September 29, `master` still lacked the shared owners and their CSS binding and browser geometry checks.
The conflict resolution preserved the spacing implementation and later UX contract changes, but the local shell
could not start and the Node runtime rejected the workspace path. Those limits describe that session, not the
subsequent hosted validation. The local validation and delivery results below describe the September 16 checkout.

The shared owners and agent guidance are implemented. Billing now demonstrates control spacing within related
values and content spacing before explanatory text. Validation passed: 23 billing component tests, 40 audit tests,
30 focused browser cases, and two targeted browser reruns after the hidden-attribute fix. The build and diff checks passed. Frontend ESLint, audit-script ESLint, design lint, strict UI audit, and
documentation lint also passed. The design lint has
zero errors and warnings; the UI audit has zero findings.

Screenshots at desktop and phone widths were inspected. No screenshot baseline was updated. The local web image
was rebuilt and the web container alone was recreated; the billing URL serves the verified assets and `/health`
returns HTTP 200. Existing Vite loader and chunk-size warnings remain unrelated to this change.

The architecture review found no business coupling: the shared owners only render content, and billing keeps its
existing query and live-region ownership. The deliberate trade-off is a narrow semantic-attribute API with no
feature styling overrides. Future content grouping still requires agent and reviewer judgment; static declarations
and the billing examples do not prove every screen's layout. The earlier backend accounting and download blockers
were resolved before PR #666 merged.

## Context and Orientation

`DESIGN.md` owns spacing roles: content is 1.5rem and control is 0.75rem. The runtime adapter is
`apps/web/src/styles/tokens.css`; `premium-ui.json` records ownership and mappings. `ProductPanel` reserves loading
and feedback space. Before this change, its children chose their own content margins, and `BalancePanel` in
`apps/web/src/features/billing/BillingPanels.tsx` added a local margin and compact type to reservation guidance.
The completed change uses `Stack` and `SupportingText` in that billing summary.
The shared `SignalDetails` owns labeled values. `apps/web/AGENTS.md` is read before frontend changes.

## Scope and Non-Goals

Add shared vertical spacing and supporting text, demonstrate them in the billing summary, document their use,
and guard the shared CSS contract and rendered billing spacing. Existing API calls, accounting, authorization,
loading, retry, and live-region behavior stay with their current owners. This plan makes no database, backend,
Compose, public-page redesign, or repository-wide layout changes. PR #667 delivered this scope to `master`; its verification-charge UI dependency is also merged.

## Plan of Work

Create `apps/web/src/shared/Stack.tsx` and its CSS module with content and control gap roles. The parent owns the
space between direct children and removes their outer margins. Create `SupportingText.tsx` and its CSS module
for compact, regular-weight explanatory paragraphs using the existing ink color. Preserve the supported semantic attributes
and ARIA, while omitting styling overrides from these small components' public props.

Replace the billing summary's local note styling with nested stacks and supporting text. Keep available credits,
reserved credits, and total balance together with control spacing; use content spacing before the note. Register
both owners in `UX-CONTRACT.md` and `premium-ui.json`. Document the concrete composition in `apps/web/AGENTS.md`
and the visual contract in `DESIGN.md`.

Extend the existing audit only as needed to check the new shared owners' CSS declarations, with focused failure
fixtures. Add actual gap and typography assertions to the existing CI-selected
`apps/web/tests/e2e/verification-billing-ui.spec.ts`, including recovery from an unavailable summary. Inspect the
screenshots before declaring visual verification complete. Screenshot baselines must not be updated automatically.

## Interfaces and Dependencies

`Stack` renders a div and accepts `gap?: 'content' | 'control'`, defaulting to content. `SupportingText` renders a
paragraph. Both accept children, `id`, `role`, `hidden`, `lang`, `dir`, `title`, and ARIA attributes, with no local styling overrides.
No API or third-party dependency changes are required. Existing CSS custom properties remain the token adapter.

## Acceptance Criteria

- New or changed product-panel content groups have clear agent instructions and a working shared composition example.
- The billing summary has a 12-pixel gap between its primary figure and detail list, and a 24-pixel gap before reservation
  guidance at the default root font size, on desktop and phone layouts.
- Supporting copy renders at 14 pixels, regular weight, with readable ink contrast and no competing outer margin.
- Loading, failure, and keyboard retry preserve the panel's behavior; successful recovery restores the same spacing.
- Static checks reject drift in the new shared CSS contracts. Browser checks reject missing or doubled billing gaps.
- Focused component, browser, build, lint, design, UI audit, and documentation checks pass. No unintended horizontal
  overflow or relevant browser console errors occur in the tested states.

## Validation

Run from the repository root unless stated otherwise:

- `corepack pnpm --filter @tuposoft/lead-email-finder-web exec vitest run src/routes/BillingPage.test.tsx`
- `corepack pnpm --filter @tuposoft/lead-email-finder-web build`
- `node --test scripts/frontend/audit-premium-ui.test.mjs`
- `corepack pnpm design:lint`
- `corepack pnpm ui:audit`
- `corepack pnpm --filter @tuposoft/lead-email-finder-web lint`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/lef577-ui-playwright WEB_API_PROXY_TARGET=http://127.0.0.1:9 corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/billing-ui.spec.ts tests/e2e/verification-billing-ui.spec.ts --workers=2 --output=/tmp/lef-shared-spacing-results`
- After the hidden-content fix: `PLAYWRIGHT_BROWSERS_PATH=/tmp/lef577-ui-playwright WEB_API_PROXY_TARGET=http://127.0.0.1:9 corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/verification-billing-ui.spec.ts --grep 'billing spacing survives' --workers=2 --output=/tmp/lef-shared-spacing-hidden-results`
- `corepack pnpm exec eslint scripts/frontend/audit-premium-ui.mjs scripts/frontend/audit-premium-ui.test.mjs`
- `corepack pnpm docs:lint -- apps/web/AGENTS.md DESIGN.md UX-CONTRACT.md .agents/plans/frontend-spacing/README.md .agents/plans/frontend-spacing/01-apply-shared-content-spacing.md`
- `git diff --check`

Browser fixtures use synthetic API responses at the local preview, not live customer data. Inspect 1440-pixel and 320-pixel
screenshots; the existing suite also exercises a 390-pixel viewport. Bruno is not applicable because the change affects the layout,
agent guidance, and static validation, with no observable HTTP API change.

## Idempotence and Recovery

The checks can be repeated without changing accounts or stored data. Keep temporary screenshots, browser caches,
and reports outside tracked source. Revert only this plan's changes to restore the earlier composition; preserve
all unrelated work. Do not reset local authentication, credits, or Docker volumes for these checks.

## Artifacts and Notes

The September 16 and September 29 searches for the `frontend-spacing/01` marker found no synced issue.
[Issue #742](https://github.com/TupoSoft/LeadEmailFinder/issues/742) was created on October 1, 2026,
at 14:59:47 UTC, after PR #667 merged at 14:57:46 UTC. The PR had no closing reference to the later issue.
The generated issue retained the old six-of-seven progress count. This correction records the missing completion evidence.
The accounting and download fixes from PR #666 remain part of the base. This spacing change adds no HTTP behavior.

Rendered evidence is stored outside the repository:

- `/tmp/lef-shared-spacing-billing-recovered-1440-desktop-chromium.png`
- `/tmp/lef-shared-spacing-billing-recovered-320-narrow-chromium.png`

Local delivery used `BUILDX_CONFIG=/tmp/lef-billing-buildx docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml build web`
followed by `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --no-deps web`.
The served assets are `index-DeAZ9ju4.js` and `index-Bhu6K7oC.css`. The browser preview used synthetic API responses;
no live billing mutation was needed to validate spacing.

## Plan readiness

Ready to implement
