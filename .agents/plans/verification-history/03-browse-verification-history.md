# Browse Single and Batch Verification History

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.
One implementation PR delivers this plan: `feat(web): browse verification history`.

## Purpose / Big Picture

Organization members can find recent single-email and CSV-batch submissions without retaining every job link.
The Verification history page lists server-owned records and opens their existing result or status page. Members
can browse, revisit, and refresh without starting verification or spending credits. Discovery covers submissions
created within seven days; it is neither permanent history nor reconciliation of an unconfirmed submission.

## Progress

- [ ] (2026-09-18) Add generated-client history adapters and organization-scoped page state.
- [ ] (2026-09-18) Add navigation, type tabs, bounded pages, and existing-job links.
- [ ] (2026-09-18) Preserve submission uncertainty, session cleanup, and accessible recovery states.
- [ ] (2026-09-18) Complete focused component/browser checks and update interface documentation.

## Plan dependencies

- `verification-history/01`
- `verification-history/02`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use Single and CSV batches tabs, defaulting to Single. Rationale: Separate server lists avoid
  misleading merged ordering or browser pagination. Date/Author: 2026-09-18, Codex planning.
- Decision: Keep only type in the URL and cursors in session memory. Rationale: Existing organization/proxy
  directories keep opaque cursors transient; addresses must not enter navigation state.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Preserve create-to-detail navigation and uncertain-submission guards. Rationale: Discovery cannot
  establish which request produced an ambiguous outcome. Date/Author: 2026-09-18, Codex planning.
- Decision: Preserve batch uncertainty across in-app navigation using a session-scoped guard. Rationale: Its
  existing component-local phase disappears when the new History link unmounts the form. Files and request bodies
  remain local and are released on departure. Date/Author: 2026-09-18, Codex planning.
- Decision: Reuse approved panels and responsive tables with Previous and Next. Rationale: This is a bounded
  record-finding task within the existing design. Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Paths are repository-relative. Before implementation, read root `AGENTS.md`, `apps/web/AGENTS.md`, `DESIGN.md`,
`UX-CONTRACT.md`, `premium-ui.json`, and `docs/product/ideal-customer-profile.md`. Apply repository frontend design,
premium design, React, and frontend testing skills. The outreach-team customer profile remains a working hypothesis;
this plan makes no validated demand, accuracy, or bounce-reduction claim.

`apps/web/src/app/routes.tsx` exposes single/batch creation and detail routes. Navigation lives in
`apps/web/src/app/navigation.ts`; `shared/ResponsiveNavigation.tsx` currently matches only `/app` exactly.
A parent history destination would otherwise appear active alongside a creation destination.

Under `apps/web/src/features/verification/`, `verification-api.ts` and `batch-verification-api.ts` own HTTP
translation. `use-verification.ts` owns an organization-scoped submission coordinator that survives navigation;
the batch form owns its file locally. Job hooks share bounded polling. Existing detail pages are
`apps/web/src/routes/VerificationJobPage.tsx` and `BatchVerificationJobPage.tsx`.

`shared/ProductPanel.tsx` owns loading, refresh, retry, retained content, and header actions. Shared action/form
styles, `StateMessage`, and service-client table styles establish labeled narrow rows. The organization directory
demonstrates cursor reads and safe response projection. Authentication clears the QueryClient on session loss,
sign-out, principal replacement, and cached-page restoration. No query cache persists to browser storage.

The prerequisites supply single-request history, excluding batch children, and durable batch-submission receipts.
A batch receipt may exist before queue dispatch is confirmed. Its unavailable status claims no success, failure,
or charge. History discovers IDs; existing details remain authoritative for evidence and downloads.

## Scope and Non-Goals

Add one history route, navigation entry, two tabs, bounded server pages, manual refresh, and existing-detail links.
Update the maintained UX contract and focused tests. Reuse approved typography, palette, spacing, and document scrolling.

Add no All tab, search, status/date filters, actor display, billing columns, filenames, batch-row previews, direct
history downloads, bulk actions, cancellation, submission retries, or permanent local history. Do not change
retention, permissions, charging, status semantics, or the explicit acknowledgment required before another upload.
The batch guard gains an in-session lifetime so navigation cannot bypass that acknowledgment. This PR adds no schema, migration, backfill,
package, deployment, or infrastructure change.

## Plan of Work

Implement against the prerequisite's OpenAPI output. Add
`apps/web/src/features/verification/verification-history-api.ts` with separate single and batch read functions.
Use the generated same-origin client, `AbortSignal`, and `cache: 'no-store'`; send `limit: 20` and the cursor unchanged.
Project only public fields into query data. Validate identifier, timestamp, status, nullable email, and cursor shape.
Malformed responses are read failures, not empty lists. Unavailable single rows must not retain or display an email
from an earlier response. The backend supplies row statuses; the browser makes no per-row detail requests.

Add `use-verification-history.ts`. Scope server queries and cursor stacks by organization and type. The first page
has no cursor; Next stores its continuation only after a successful read, and Previous uses an earlier cursor.
Disable duplicate page requests, stop Next when `nextCursor` is null, and never guess a total or fetch all pages.
Keep each tab's page position in session query state. Refresh resets the active tab to page one; switching tabs
retains their independent positions. Browser Back from details restores that position. Full reload starts at page one.

Use session query state so shared authentication cleanup also removes cursors. Add no module-global store,
persistent query storage, local/session storage, or protected router state. Reuse authentication fencing and abort
signals so a response from an earlier organization or type cannot replace current rows. Do not poll history or
retry reads automatically. Offline controls explain why reading is paused; reconnect offers explicit refresh.

Add `apps/web/src/routes/VerificationHistoryPage.tsx` and centralized
`features/verification/verification-history-copy.ts`. Use Verification history for the heading and title prefix.
Register `/app/verifications` with `verification.read`. Preserve existing verification capability checks for direct
routes; permitted requests still obey authoritative server 401/403 responses and shared recovery. Create links
independently require `verification.run`, so read-only members can browse without submitting.

Render Single and CSV batches as a labeled tab list with native buttons, `aria-selected`, associated panels,
roving focus, and Arrow/Home/End navigation. Manual activation with Enter/Space commits the tab and sets
`kind=single` or `kind=batch`. Missing/invalid kind normalizes to Single without querying an unsupported type.
Back/Forward restores type; cursors and addresses never enter URLs. Record this intentional pagination-state
exception in `UX-CONTRACT.md`, including the reload behavior.

Use a semantic table with full wrapping IDs, submitted time in English with explicit UTC, text status, and
View status links. Single rows also show the email or Unavailable for null. Batch rows use CSV batch and ID,
without an invented filename. Map only the five public statuses to neutral labels; Completed describes finished
work rather than deliverability. An unavailable record remains linkable by ID; the existing detail route may
return 404. Never imply a refund, failure, or permission to resubmit from that discovery state.

Use `ProductPanel` for loading, refresh, retained rows, and failures. Distinguish no recent submissions from
loading, offline, and errors. Explain seven-day discovery without a physical-deletion claim. A failed later read
retains the prior rows and page with an explicit retry. A 400 `invalid_history_cursor` instead offers Reset list,
which clears that tab's stack and explicitly requests page one. Do not repeat the invalid cursor automatically.
Paging uses a fixed initial upper bound but a moving seven-day cutoff, so it is not a frozen snapshot guarantee.

Keep headers and controls stable during reads; updates preserve focus. Announce page changes without claiming
an unknown total. The document owns scrolling. At 320 CSS pixels, the same records become labeled rows without
hiding fields/actions or creating a duplicate mobile content tree. Compare with the existing billing/table language.

Link single rows to `/app/verifications/:id` and batch rows to `/app/verifications/batches/:id` using validated IDs.
Add History links on creation and detail pages while preserving successful submissions opening their job page.
Finding or failing to find a history row never clears pending/uncertain submission guards. Browsing issues no POST.

Make that guarantee concrete for the batch form, whose phase currently disappears on unmount. Add a narrow
`use-batch-submission-guard.ts` beside the verification hooks. Store only `idle`, `pending`, or `uncertain` under
an organization-scoped disabled query with `gcTime: Infinity`, following the query-instance identity fence in
`use-verification.ts`. This is workflow state without a query function or persistent storage. A removed or replaced
query cannot be recreated by an old callback. Keep the file, filename, multipart body, active fetch, and acknowledgment
checkbox local to the form; returning to uncertainty starts with an unchecked checkbox.

Set the guard pending when a deliberate upload begins. On route departure during upload, synchronously mark it
uncertain before aborting and releasing local data, only if the same query instance remains current. A late response
from the departed form must neither navigate nor clear uncertainty. A mounted successful upload or confirmed rejection
uses the existing classifications; an ambiguous outcome leaves the guard uncertain. Only the existing acknowledged
Start a new upload action clears uncertainty to idle. Keep authentication cleanup authoritative: logout, principal
replacement, and page-hide cleanup remove the guard, and old cleanup handlers cannot repopulate it. Reload behavior
remains ephemeral. Returning from History within the same session restores the guard and requires acknowledgment;
it never restores a file or automatically sends another request.

Add optional exact matching to `ApplicationDestination` and enable it for History. Pass it to
`ResponsiveNavigation` while preserving existing destination behavior, and add a focused regression. Update
`UX-CONTRACT.md` with the route, owner, tabs, cursor lifetime, discovery boundary, and recovery; replace old
no-history statements with this workflow. Register browser evidence in `premium-ui.json`. Reuse existing tokens;
if a shared visual decision changes, update `DESIGN.md`, runtime styles, and mappings together. Avoid unrelated cleanup.

## Interfaces and Dependencies

Plans 01 and 02 provide `GET /v1/verification-history/single` and `GET /v1/verification-history/batches`, scoped to the
principal's organization and `verification:read`. Each accepts optional `cursor` and `limit`; the default is 20
and maximum 100. The UI always uses 20. Use the generated schema's actual path keys and existing client base URL.

Responses are `{ items, nextCursor }`, with an opaque string or null continuation. Each item contains `id`, ISO
`createdAt`, and `status`: `queued`, `running`, `completed`, `failed`, or `unavailable`. Single items add
`email: string | null`; batch items omit email. Preserve server ordering and use type plus ID as row identity.

Discovery includes submissions created in the previous seven days. Cursors bind kind, limit, and a fixed `asOf`
upper bound while every page applies the current seven-day cutoff. Malformed, wrong-kind, changed-limit, and
older-than-seven-days cursors produce 400 `invalid_history_cursor`. Existing single detail visibility stays seven
days after settlement; batch detail access continues to depend on the retained queue job. Discovery expiry implies
neither detail expiry nor deletion. Plan 01 owns single history and the shared cursor contract; plan 02 owns batch
receipts and history. Each API plan owns its generated contracts and HTTP tests. No new permission or package is required.

## Acceptance Criteria

- `verification.read` exposes History and both lists; missing run capability hides create actions only. Denied
  reads follow shared session/access recovery and expose no previous account data.
- Default/invalid kind selects Single. Tabs, keyboard interaction, URL Back/Forward, bounded paging, refresh,
  independent tab positions, detail return, and full-reload reset follow the stated contract.
- Server order/status remain intact. Null email and unavailable batch receipts are explicit. UTC and full IDs
  remain readable, and discovery expiry makes no deletion or snapshot guarantee.
- Read failures never appear as successful empty history. Ordinary retry preserves the cursor; invalid cursors
  offer explicit Reset list. Offline, stale, empty, and loading states retain meaningful recovery and focus.
- Browsing neither changes submission uncertainty nor creates verification work, charges, or automatic downloads.
  Existing creation, detail polling, and deliberate CSV downloads remain functional.
- Leaving an uploading or uncertain batch for History and returning retains uncertainty with an unchecked
  acknowledgment. Late responses cannot clear it; only a deliberate acknowledged new-upload action permits another
  selection. Files and request bodies are released, and authentication cleanup cannot be reversed by late callbacks.
- Session/principal transitions clear rows/cursors and fence late responses. No addresses, filenames, history
  records, or cursors enter persistent browser storage or URL navigation state.
- Desktop/narrow, keyboard, 200% zoom, reduced-motion, accessibility, lint, type, and focused checks pass.

## Validation

Run these planned commands from the implementation checkout; they are not completed implementation evidence:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-web lint
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci src/features/verification/verification-history-api.test.ts src/features/verification/VerificationHistoryPage.test.tsx src/features/verification/VerificationPage.test.tsx src/features/verification/BatchVerificationPage.test.tsx src/shared/ResponsiveNavigation.test.tsx
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test tests/e2e/verification-history-ui.spec.ts tests/e2e/verification-ui.spec.ts tests/e2e/batch-verification-ui.spec.ts
corepack pnpm openapi:check
corepack pnpm design:lint
corepack pnpm ui:audit
```

Add adapter/component tests at these paths for delayed page/type responses, null email, statuses, authorization,
invalid cursors, session replacement, and unchanged uncertainty guards. Add `verification-history-ui.spec.ts` to
the explicit `test:e2e:prebuilt` list in `apps/web/package.json`; default discovery alone does not cover that CI command.
Extend `BatchVerificationPage.test.tsx` with uploading and uncertain navigation, identity replacement, late-response,
acknowledgment-reset, and file-release scenarios. Exercise History and return in the browser as well.
Use synthetic fixtures in desktop/narrow projects, check WCAG rules with `@axe-core/playwright`, focus, no POST requests from browsing,
long values, zoom/reflow, and safe list screenshots.

With disposable API fixtures available, confirm list-to-detail behavior for a known single request and CSV job.
Stub browser tests prove presentation/transport handling; prerequisite integration/Bruno cases prove real server
scope, paging, and discovery boundaries. Report unavailable live validation separately. Bruno: not applicable
because this UI PR consumes unchanged prerequisite endpoints; plans 01 and 02 own their HTTP coverage.

## Idempotence and Recovery

All history operations are GET reads. Repeating one or resetting paging creates no submission. Discard affected
history query state after contract changes without clearing unrelated submission coordinators. Reverting this PR removes
the new route, navigation, and adapters while preserving prerequisite data and existing detail links. This PR
needs no reset/reseed; prerequisite plans own their disposable fixtures. Planning performs no application or
external issue mutation.

## Artifacts and Notes

Follow root issue assignment, project status, conventional PR title, and closing-issue instructions when
implementation starts. Record actual check counts, screenshots, local runtime limits, and CI evidence here.
The authorized planning task creates documentation only; the implementation checks above have not run yet.

## Plan readiness

Ready to implement
