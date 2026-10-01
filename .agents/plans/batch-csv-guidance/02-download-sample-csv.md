# Download the Displayed CSV Example

This living ExecPlan follows `.agents/PLANS.md` and must remain current during implementation.
It describes exactly one pull request: `feat(web): add a matching batch CSV sample download`.

## Purpose / Big Picture

Customers can download the example shown on the upload page, replace its fictional addresses, and prepare their
own file. An engineer observes success when "Download sample CSV" saves `batch-verification-sample.csv` containing
exactly the displayed example without selecting a file, starting verification, or navigating away.

## Progress

- [ ] (2026-09-18) Add a native download link backed by the shared CSV example.
- [ ] (2026-09-18) Cover downloaded bytes, filename, keyboard activation, and preservation of upload state.
- [ ] (2026-09-18) Update the UX contract and execute focused static, component, and browser checks.
- [ ] (2026-09-18) Record results, review scope and architecture, and prepare the single implementation PR.

## Plan dependencies

- `batch-csv-guidance/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Download the same `batchCsvExample` string displayed on the page. Rationale: One content owner prevents
  divergence between instructions and the file customers receive. Date/Author: 2026-09-18, Codex planning.
- Decision: Use a native anchor, fixed filename, and encoded data URL for this tiny static example. Rationale: No
  server route, asynchronous request, object URL, Effect for resource disposal, or download service is needed.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Make sample download independent of selection, connectivity, and upload state while the page remains
  mounted. Rationale: Reading static example bytes cannot submit or alter verification.
  Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`apps/web/src/routes/BatchVerificationPage.tsx` owns `/app/verifications/batches/new`. It checks
`verification.run`, validates file extension and size, and posts through `createBatchVerification`. Selected
files stay local. Pending uploads disable conflicting controls; uncertain outcomes require acknowledgment before
another attempt.

The prerequisite adds `apps/web/src/features/verification/batch-csv-example.ts`, exporting `batchCsvExample` with
exact value `email\nalice@example.com\nbob@example.com\n`. It displays a labeled example above the picker and
keeps prose in `batch-verification-copy.ts`. Preserve its instruction to replace the fictional addresses.

`apps/web/src/features/verification/BatchResultDownload.tsx` handles authenticated result retrieval and object URL
cleanup. This separate asynchronous workflow is unnecessary for static sample content and is not an edit target.
Use action styles from `apps/web/src/shared/Action.module.css`. Existing test owners are
`apps/web/src/features/verification/BatchVerificationPage.test.tsx` and
`apps/web/tests/e2e/batch-verification-ui.spec.ts`.

Preview and gateway security headers are defined in `apps/web/gateway-routes.ts` and
`docker/web/security-headers.conf`. Validate the native download in the built preview with these existing headers.
This feature does not change content security policy or introduce an external destination.

## Scope and Non-Goals

Add one download link alongside the existing example, matching file content, focused regression tests, and the
corresponding `UX-CONTRACT.md` update. Reuse the current route, shared example, and approved action styling.

Add no API endpoint, static HTTP asset route, remote request, clipboard feature, upload shortcut, automatic file
selection, parser, customer-data export, job, billing action, or analytics. Do not alter real result downloads,
introduce a generic download abstraction, or change shared visual tokens. This completes the requested guidance
improvement and unlocks no further required PR.

## Plan of Work

Read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, and the repository frontend design,
premium, React, and testing skills. Confirm the prerequisite's shared example and guidance are present. At
implementation start, follow the root issue assignment and project-status workflow for the synced
`batch-csv-guidance/02` issue. Include its closing reference and requesting-user assignment in the implementation PR.

Add "Download sample CSV" to `batch-verification-copy.ts`. Derive the upload page anchor's `href` from
`'data:text/csv;charset=utf-8,' + encodeURIComponent(batchCsvExample)`, and set
`download="batch-verification-sample.csv"`. Render it in the example section using existing secondary action
styles. Use a real anchor with native keyboard behavior and no submit handler, synthetic click, new tab, or React
state. The fixed filename must never derive from a customer file.

Retain the link during selection, pending upload, uncertain outcome, and offline states while the page remains
mounted. It neither reads nor writes the selected `File`, resets validation, changes acknowledgment, nor calls
`createBatchVerification`. It does not bypass the route capability check. Native browser download handling owns
destination choice, cancellation, and retry; add no toast claiming the file was saved.

Extend the component suite to verify the link name, fixed filename, CSV media type, decoded content, and presence
before selection. Cover its independence from offline, pending, and uncertain states. Assert that decoded bytes
match an independently specified literal and the displayed example. This prevents tests from passing merely
because their expectations import the same erroneous constant.

Extend the browser suite with actual download events and byte inspection through `download.createReadStream()`.
Assert suggested filename and exact content, including the final newline. Exercise keyboard activation and repeated
downloads. Start with a selected synthetic file and prove its filename, file input, current URL, and verification
POST count remain unchanged. Check that activating the link preserves an existing validation error and leaves the
acknowledgment for an uncertain upload unchecked. Also download after the page loads and the context goes offline.
Reuse existing accessibility and overflow checks. Use fictional data and mocked responses, creating no real jobs.

Update the batch section of `UX-CONTRACT.md` with the link label, shared source, filename, local download behavior,
and preservation of upload state. Record executed validation and its limitations.

## Interfaces and Dependencies

Consume the prerequisite's `batchCsvExample` export. The public artifact is `batch-verification-sample.csv`,
encoded as UTF-8 without a byte-order mark, with line feed endings and a final newline. The declared media type is
`text/csv;charset=utf-8`. Its content is exactly:

```csv
email
alice@example.com
bob@example.com
```

No package, environment variable, server interface, persistence record, object URL lifetime, or cache entry is added.
The data URL contains only shipped fictional content and never customer input. Keep the literal `email` header
independent of any future prose translation. The prerequisite supplies both shared content and its visible section.

## Acceptance Criteria

1. An authorized customer can activate "Download sample CSV" before selecting a file. The browser suggests the
   exact filename `batch-verification-sample.csv`.
2. Downloaded bytes match both the displayed example and independently specified content: lowercase header, two
   fictional addresses on separate lines, line feed endings, no byte-order mark, and a final newline.
3. Keyboard activation and repeated downloads work in both browser projects under unchanged security headers.
   The link adds no serious or critical `axe` finding and no horizontal page overflow at 320 pixels.
4. Downloading preserves the route, selected file, existing validation error, and uncertainty acknowledgment.
   It sends no verification POST or results request. The link remains available during pending and uncertain
   uploads, and a loaded page can download while offline.
5. Accounts without `verification.run` retain the forbidden view. Existing authentication, upload, billing,
   rejection, and real result-download behavior remains unchanged.
6. The focused component and browser checks, web lint and typecheck, build, design checks, and Markdown lint pass.

## Validation

Run from the repository root after implementation:

```sh
corepack pnpm --filter ./apps/web exec vitest run src/features/verification/BatchVerificationPage.test.tsx
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web typecheck
corepack pnpm design:lint
corepack pnpm ui:audit
corepack pnpm --filter ./apps/web build
corepack pnpm --filter ./apps/web exec playwright test tests/e2e/batch-verification-ui.spec.ts --project=desktop-chromium --project=narrow-chromium --output=/tmp/batch-csv-guidance-02-browser
corepack pnpm docs:lint -- UX-CONTRACT.md .agents/plans/batch-csv-guidance
git diff --check
```

Build once before the browser command. The preview serves the built app with configured security headers; tests
mock account and API responses. Installed Chromium is required; no live API, database, SMTP, or Docker stack is
needed. Report missing runtime dependencies as unverified checks. For interactive inspection, use the browser
plugin when available; otherwise record its absence and use repository Playwright.

Validate actual bytes and browser behavior rather than DOM attributes alone. Record counts and both projects.
Inspect focus, selected-file preservation, existing validation errors, uncertainty acknowledgment, repeat
activation, offline download, and narrow layout. Review the diff for responsibility and dependency violations;
a static link does not justify a manager or service. Bruno: not applicable — the sample comes from browser-owned
text and does not change externally observable HTTP API behavior.

## Idempotence and Recovery

Each activation downloads the same public example without changing application or server state. Browsers may
rename repeated local files; the suggested filename remains fixed. Canceling a save leaves the form intact and
the link available for retry. Revert only this PR's link, tests, and contract additions if necessary; the earlier
inline guidance remains useful. Mocked tests need no server resource removal, migration, reset, or reseed.

## Artifacts and Notes

Planning inspected existing download patterns, security headers, build scripts, tests, and upload state ownership
on 2026-09-18. A browser probe could not run because the installed Playwright package has no Chromium executable.
Native data-URL download under the current policy remains unverified; the required built-preview test must prove
it during implementation. Do not weaken security headers to make the test pass. The design is decision-complete;
missing browser tooling is a validation prerequisite, not proof of success. Future commands above have not been
run against this proposed feature.

## Plan readiness

Ready to implement
