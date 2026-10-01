# Keep One Divider at the Billing Panel Boundary

This living ExecPlan follows `.agents/PLANS.md` and describes one independently reviewable pull request.

## Purpose / Big Picture

The credit-pack list ends with one section divider before Purchase history. Separators remain between packs,
without a second line after the final pack. The same ownership rule guides future generated panel content.

## Progress

- [x] (2026-09-16) Confirmed the final pack's bottom border duplicates the following panel's top border. No synced issue matched `frontend-spacing/02`.
- [x] (2026-09-16) Restricted pack separators to interior rows and documented divider ownership.
- [x] (2026-09-16) Verified multiple, single, and empty catalogs at desktop and phone widths; rebuilt the local web container.
- [x] (2026-10-01) Resolved the conflicts with current `master`, preserving its newer behavior and the seven files from the divider commit. No synced issue matched `frontend-spacing/02`.
- [ ] (2026-10-01) Verify the updated PR with hosted checks. Local commands are unavailable because the shell process cannot start.

## Plan dependencies

None.

## Surprises & Discoveries

The shared spacing work covered the balance summary; the pack list still drew a border beneath every row.
The following `ProductPanel` already owns the section rule. No new separator component or token is needed.
Initial mobile screenshot capture failed after the layout assertions passed because the requested clip was below
the viewport. Full-page capture with the same clip now includes both panels; this was a test artifact issue.

PRs #666 and #667 merged separately, leaving the original stacked commits in this branch. Its comparison with
`master` therefore included 60 files and conflicts. The divider commit still applies to current `master` with
unique matching context in every existing file.

## Decision Log

- 2026-09-16, Codex: Apply the existing soft rule only to direct pack rows that are not the last child. Preserve row
  padding, purchase controls, and the following panel's top border.
- 2026-09-16, Codex: Add a concise boundary-ownership instruction and browser regression coverage. Use Playwright
  because Browser control tools and the browser skill are unavailable in this session.
- 2026-10-01, Codex: Preserve the branch history with a merge commit. Start from the current `master` tree and apply
  only the original divider commit, then update this plan. Use the GitHub API because the local shell cannot start.
  Existing hosted checks own the new validation; the September results do not verify the updated branch.

## Publication Review

This draft now targets `master`, including merged PRs #666 and #667. Its resolved tree contains only the divider
fix, its guidance, browser coverage, and this plan relative to `master`. The divider fix has no dependency on
verification accounting. Current validation remains pending.

On September 16, all 22 billing browser cases passed on the original publication branch. The production build,
scoped ESLint, design lint, strict UI audit, and diff checks also passed. Desktop and phone screenshots showed
the intended single section boundary; no screenshot baseline changed.

The local container and asset evidence below describe the original implementation checkout. Publication does not
rebuild that container or mutate account data. The CSS change introduces no material architectural trade-off.

## Outcomes & Retrospective

The October 1 conflict resolution preserves the current `master` files outside this fix. Exact patch-context checks
passed for all six existing files, and the new plan remains the seventh changed file. Independent source review
confirmed that the catalog fixtures and panel markup still support all six added browser cases. No local build,
browser test, design audit, or Harper command has run in this session; hosted results remain pending.

The following implementation and local delivery results were recorded on September 16.

The last pack no longer draws a bottom border. Internal pack separators and the following section rule remain.
All 22 billing browser cases passed at 1440 and 320 pixels, including the six new catalog-boundary cases and the
existing keyboard purchase and recovery flows. The build, design lint, UI audit, documentation lint, and diff checks
passed. Both desktop and phone screenshots were inspected; they show a single section boundary. No baseline was
updated. The existing Vite loader and bundle-size warnings remain unrelated.

The local web container now serves `index-oJ2sfAcX.css` and `index-DAw4Bm30.js`; `/health` returns HTTP 200. No live
purchase or account mutation was needed. This CSS-only change introduces no new responsibility or architectural
trade-off. Other panel layouts are outside this fix.

## Context and Orientation

`apps/web/src/features/billing/BillingView.module.css` applies a bottom rule to every pack. `BillingPage.tsx` places
`PurchaseHistoryPanel` after `CreditPacksPanel`; `ProductPanel.module.css` draws the section's top rule. Panel padding
separates the two lines. Existing browser fixtures in `apps/web/tests/e2e/billing-ui.spec.ts` supply synthetic packs
and exercise the checkout controls without changing real accounts.

## Scope and Non-Goals

Change only pack-divider placement, its agent/design guidance, manifest evidence, and focused browser coverage.
Preserve existing balance spacing, rows, prices, padding, permissions, payment behavior, and all unrelated work.
No API, dependency, database, authentication, or backend change is needed.

## Plan of Work

Move the pack border declaration to `.packs > li:not(:last-child)`. Record section-boundary ownership in
`apps/web/AGENTS.md` and `DESIGN.md`, and register the browser evidence in `premium-ui.json`. Extend the existing
billing browser tests to check internal pack borders, the absence of a final row border, and the retained section
rule for two packs, one pack, and an empty catalog. Inspect desktop and phone screenshots, then rebuild only web.

## Interfaces and Dependencies

There are no new interfaces. Use the existing rule tokens, CSS Modules, `ProductPanel`, and Playwright fixtures.

## Acceptance Criteria

- Multiple packs retain dividers between rows; the last pack has no bottom divider.
- A single pack and an empty catalog create no trailing row divider.
- The Purchase history panel retains its section rule at desktop and phone widths.
- Purchase controls, accessible empty states, and keyboard interaction keep working, with no unintended overflow.
- Build, focused browser coverage, ESLint, design lint, UI audit, documentation lint, and diff checks pass.

## Validation

Run from the repository root:

- `corepack pnpm --filter @tuposoft/lead-email-finder-web build`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/lef577-ui-playwright WEB_API_PROXY_TARGET=http://127.0.0.1:9 corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/billing-ui.spec.ts --workers=2 --output=/tmp/lef-credit-pack-divider-results`
- `corepack pnpm --filter @tuposoft/lead-email-finder-web exec eslint tests/e2e/billing-ui.spec.ts`
- `corepack pnpm design:lint`
- `corepack pnpm ui:audit`
- `corepack pnpm docs:lint -- apps/web/AGENTS.md DESIGN.md .agents/plans/frontend-spacing/README.md .agents/plans/frontend-spacing/02-remove-duplicate-billing-divider.md`
- `git diff --check`

Review rendered evidence at 1440 and 320 pixels. The browser checks use synthetic responses; no live purchase is
needed. Bruno is not applicable because this changes presentation only, with no observable HTTP API change.

## Idempotence and Recovery

Checks are repeatable without data resets. Keep screenshots outside tracked source. Revert only this task's CSS
and supporting changes to restore the previous appearance, preserving all other local edits.

## Artifacts and Notes

After validation, deliver the local UI with `BUILDX_CONFIG=/tmp/lef-billing-buildx docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml build web`
and `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --no-deps web`.
Verify that `/app/billing` serves the fresh assets and `/health` returns HTTP 200.

Rendered evidence: `/tmp/lef-credit-pack-dividers-1440.png` and `/tmp/lef-credit-pack-dividers-320.png`.
Single-pack and empty-catalog images use the same paths with `-single` and `-empty` suffixes. The final Playwright
result in `/tmp/lef-credit-pack-divider-results/.last-run.json` reports `passed` with no failed tests.

## Plan readiness

Ready to implement
