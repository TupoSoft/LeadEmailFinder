# Explain the Batch CSV Format with an Inline Example

This living ExecPlan follows `.agents/PLANS.md` and must remain current during implementation.
It describes exactly one pull request: `feat(web): explain batch CSV format with an inline example`.

## Purpose / Big Picture

Customers preparing an email list can see the required CSV structure before selecting a file. The upload page
will explain the lowercase `email` header, show one address per row, and display a small example customers can copy.
An engineer observes success by opening `/app/verifications/batches/new` with `verification.run` and finding the
guidance above the native picker without uploading anything.

## Progress

- [ ] (2026-09-18) Add the shared fictional CSV example and concise format guidance to the existing page.
- [ ] (2026-09-18) Cover initial guidance, accessible description, and unchanged selection behavior.
- [ ] (2026-09-18) Update the UX contract and execute the focused static, component, and browser checks.
- [ ] (2026-09-18) Record results, review scope and architecture, and prepare the single implementation PR.

## Plan dependencies

- `frontend/12`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Display the example directly above the picker, without a disclosure or separate help route.
  Rationale: Customers need the format while preparing their file. Date/Author: 2026-09-18, Codex planning.
- Decision: Store literal CSV bytes in one feature-local constant and keep explanatory prose in the existing copy
  file. Rationale: The next PR can download the same example without duplicating content or introducing
  infrastructure. Date/Author: 2026-09-18, Codex planning.
- Decision: Explain the current input contract without changing validation. Rationale: This task addresses
  discoverability; the server remains authoritative. Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The customer hypothesis in `docs/product/ideal-customer-profile.md` includes outreach operators preparing lists
they already hold. This is product context, not evidence of measured demand or authorization to expand verification.

`apps/web/src/app/navigation.ts` links to `/app/verifications/batches/new` as "Verify a CSV file" for accounts with
`verification.run`. `apps/web/src/routes/BatchVerificationPage.tsx` also checks that capability. Its `BatchForm`
renders `batchVerificationCopy.format` in `batch-file-help` before the native file input, which references that
help through `aria-describedby`. Current guidance mentions a header and the `100 MB` limit but provides no example.
The form validates extension and size, keeps selected files local, and guards pending and uncertain uploads.

`apps/web/src/features/verification/batch-verification-copy.ts` owns English batch messages.
`apps/web/src/features/verification/VerificationView.module.css`, `apps/web/src/shared/Form.module.css`, and
`apps/web/src/shared/Action.module.css` own the presentation. Existing tests are
`apps/web/src/features/verification/BatchVerificationPage.test.tsx` and
`apps/web/tests/e2e/batch-verification-ui.spec.ts`.

The backend adapter at
`src/libs/modules/email-verification/src/infrastructure/storage/batch-verification/s3-batch-input.ts` parses
headers, trims whitespace, skips blank lines, validates each row, and yields its `email` property.
`batch-email-verification-csv-row.ts` and `is-verifiable-email.decorator.ts` in the same directory require an email
under that exact lowercase property. Headers are not normalized to lowercase. Additional declared columns are
ignored in emitted input. This plan uses a simple one-column example and makes no promise that result files
preserve additional columns. Backend files are evidence, not edit targets.

## Scope and Non-Goals

Add visible guidance and an example customers can copy, extend the nearest component and browser tests, and update the batch
section of `UX-CONTRACT.md`. This PR independently improves format discovery and enables `batch-csv-guidance/02`.

The download link belongs to the next plan. This PR adds no help route, clipboard button, CSV preview, client parser,
column mapping, Excel importer, validation rule, API contract, billing behavior, or authentication behavior.
It does not refactor upload, polling, or result-download lifecycles.

## Plan of Work

Read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, and the repository frontend design,
premium, React, and testing skills. Reuse the approved design. At implementation start, follow the root issue
assignment and project-status workflow for the synced `batch-csv-guidance/01` issue. Link that issue with a closing
keyword and assign the requesting user when opening the implementation PR.

Create `apps/web/src/features/verification/batch-csv-example.ts` with one exported string named `batchCsvExample`.
Its exact value is `email\nalice@example.com\nbob@example.com\n`: UTF-8-compatible text, line feed endings, no
byte-order mark, and a final newline. These are fictional formatting examples, not a deliverability promise.
Keep CSV bytes and the literal header independent of translated prose; add no generic CSV generator.

Extend `batch-verification-copy.ts` with the heading "CSV format example" and instruction "Replace the example
addresses with your own." Use this exact format message:

```text
Choose one .csv file, up to 100 MB (104,857,600 bytes). Use a header named email (lowercase), followed by one email address per row.
```

Render a labeled section with a heading and `pre`/`code` between the existing help and picker. Preserve the
input label and concise format help in `aria-describedby`; do not include the whole example in that accessible
description. Preserve text selection and line breaks. Use existing typography, colors, spacing, and borders,
adding only a feature-local style in `VerificationView.module.css` when needed for the example. No new shared
visual decision or token is needed. Document the guidance and shared example owner in the batch section of
`UX-CONTRACT.md`.

Extend the component test for format guidance to assert the lowercase instruction, exact example lines,
replacement instruction, and accessible help before selection. Keep existing extension, size, removal, capability,
and uncertain-upload tests. Add a focused initial-page browser scenario using the existing `account()` and
`accessible()` helpers: inspect the example, keyboard access to the picker, accessibility, narrow geometry, and
absence of verification requests. Preserve unrelated fixtures and application behavior.

## Interfaces and Dependencies

The new interface is the feature-local `batchCsvExample: string` export, consumed by the page and later the sample
download. It contains no customer data and needs no React state, service, provider, injected adapter, or new package.
API functions and generated client contracts remain unchanged. `frontend/12` supplies the existing page and tests;
this PR provides useful guidance without the later download.

## Acceptance Criteria

1. An authorized customer sees the lowercase `email` requirement, one-address-per-row instruction, unchanged size
   limit, replacement instruction, and three-line example before selecting or uploading a file.
2. The displayed example comes from one exported source, preserves line breaks, and can be selected and copied.
   Copying the full example produces a header and two separate address rows.
3. The picker retains its accessible name and format description. The example is labeled, readable by assistive
   technology, creates no horizontal page overflow at 320 pixels, and adds no serious or critical `axe` finding.
4. Reading the guidance creates no verification request. File selection and removal, invalid extension and size feedback,
   capability restrictions, upload guards, and uncertain-outcome recovery retain their behavior.
5. The focused component and browser checks, web lint and typecheck, build, design checks, and Markdown lint pass.

## Validation

Run from the repository root after implementation:

```sh
corepack pnpm --filter ./apps/web exec vitest run src/features/verification/BatchVerificationPage.test.tsx
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web typecheck
corepack pnpm design:lint
corepack pnpm ui:audit
corepack pnpm --filter ./apps/web build
corepack pnpm --filter ./apps/web exec playwright test tests/e2e/batch-verification-ui.spec.ts --project=desktop-chromium --project=narrow-chromium --output=/tmp/batch-csv-guidance-01-browser
corepack pnpm docs:lint -- UX-CONTRACT.md .agents/plans/batch-csv-guidance
git diff --check
```

Build once before the browser command. Existing preview and mocked account/API responses need installed Chromium
but no live API, database, SMTP, or Docker stack. Missing runtime dependencies mean an unverified check, not a pass.
For interactive inspection, use the browser plugin when available; otherwise record its absence and use repository
Playwright. Inspect desktop and 320 pixels layouts, keyboard focus, code line breaks, text selection, and accessible
labeling. Keep screenshots outside the repository.

Review the diff for responsibility and dependency violations; ordinary rendering and copy require no new
application abstraction. Bruno: not applicable — the change adds browser guidance and preserves externally
observable HTTP API behavior.

## Idempotence and Recovery

Static text and mocked tests are safe to repeat and create no server resources. Fix failures and rerun affected
checks; rebuild before browser checks after source changes. If abandoned, revert only this PR's code, tests, and
contract edits while preserving unrelated work. No database reset, migration, or reseed is needed.

## Artifacts and Notes

Planning inspected current page, copy, parser, tests, scripts, and product and UI contracts on 2026-09-18.
Application code has not been changed. The validation commands above are future implementation acceptance work,
not evidence that the feature already passes. Planning found no installed Chromium executable; implementation
must provide the existing pinned browser runtime before claiming browser acceptance.

## Plan readiness

Ready to implement
