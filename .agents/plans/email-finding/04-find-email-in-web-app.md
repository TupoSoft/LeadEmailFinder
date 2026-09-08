# Find an Email from a Name and Company Domain in the Web App

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an authenticated user enter a first name, last name, and company domain, set a maximum credit spend, and
follow one email-finding request through a URL that can be bookmarked. The browser presents the server's candidate
evidence and actual charge without treating technical acceptance as proof that an address belongs to the named
person. A developer can submit synthetic fixture input, refresh the returned job route, and see the same result
and settled charge without starting another search.

## Progress

- [ ] (2026-09-08) Add the generated-client finder adapter, request-key helper, and session-scoped submission state.
- [ ] (2026-09-08) Add the finder form, job route, navigation, evidence presentation, and credit-limit copy.
- [ ] (2026-09-08) Reuse shared polling and recovery behavior and cover permissions, uncertainty, and session boundaries.
- [ ] (2026-09-08) Update the UX contract, register browser evidence, and add focused component and runtime checks.
- [ ] (2026-09-08) Run focused validation, inspect rendered states, and record results and architectural trade-offs.

## Plan dependencies

- `email-finding/03`
- `frontend/11`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Deliver one form and one result route within the approved application shell. Rationale: The user
  requested API and web support, and the existing single-verification workflow supplies the relevant visual and
  recovery patterns. This is one PR for a working browser finding workflow. Date/Author: 2026-09-08, planning.
- Decision: Default the required `maxCredits` input to 16 and allow integers from zero through 16. Explain that
  each new conclusive candidate result costs one credit, including a conclusive non-match; cached, shared, and
  inconclusive results are free. There is no separate search fee. Rationale: The server policy and caller-selected
  limit govern spending; the browser must expose that consequence before submission. Date/Author: 2026-09-08, planning.
- Decision: Use explicit submission and deliberate replay of the original UUIDv7 key and unchanged body after an
  uncertain response. Rationale: Recovery must retrieve the same request instead of silently creating another
  search or selecting a new spending limit. Date/Author: 2026-09-08, planning.
- Decision: Show only the server's outcome, candidate order, counts, stop reason, and charged/reserved summary.
  Rationale: A browser must not infer a unique match or calculate a charge from displayed candidates.
  Date/Author: 2026-09-08, planning.
- Decision: Reuse `verification.run` and `verification.read` capabilities and the server's corresponding permissions.
  Rationale: The prerequisite API deliberately shares the current organization verification permission boundary.
  Navigation visibility does not confer backend access. Date/Author: 2026-09-08, planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The frontend in `apps/web` uses React, Vite, React Router, TanStack Query, CSS Modules, and the generated client in
`packages/api-client`. `apps/web/src/app/routes.tsx` registers routes inside `ProtectedApplication`, and
`apps/web/src/app/navigation.ts` registers working destinations by effective capability. The server owns identity,
organization membership, and permissions through the current-account contract; the browser does not derive
capabilities from role names.

The existing sibling is `apps/web/src/routes/VerificationPage.tsx` and `VerificationJobPage.tsx`, with transport,
submission coordination, polling, and copy under `apps/web/src/features/verification/`. Its session QueryClient
retains an in-progress or uncertain submission across in-app navigation; authentication generation fences discard
late results after sign-out or principal replacement. Its active jobs are read every five seconds for at most
sixty automatic checks, paused while hidden or offline, and stopped after a read failure until manual refresh.

`ProductPanel`, `StateMessage`, `SignalDetails`, `Form.module.css`, `Action.module.css`, and
`use-browser-availability.ts` under `apps/web/src/shared/` own reusable presentation and availability behavior.
Root `DESIGN.md` owns the approved canvas, evergreen, Inter, flat-panel design. `UX-CONTRACT.md` owns shared
interaction behavior, and `premium-ui.json` maps tokens and records canonical owners and validation evidence.
Use the repository-local frontend-design, frontend-design-premium, React, and frontend-testing-debugging skills.

The prerequisite API plan supplies `POST /emailFinds` and `GET /emailFinds/:id`, browser-generated types, same-origin
gateway forwarding, authenticated permission and organization isolation, bounded candidate processing, and
authoritative billing. A valid submission returns `202 { id }`, including when the organization has no available
credits. A completed response can still be inconclusive or stopped early; a terminal state means the parent request
and its billing have settled, not that the person's email address was found.

## Scope and Non-Goals

Deliver `/app/email-finder/new`, `/app/email-finder/:id`, one navigation destination, centralized English copy,
bounded status reading, deliberate idempotent recovery, and accessible candidate evidence and charge presentation.
Register focused browser tests and the workflow's shared UX contract. This plan unlocks ordinary browser use of
the API delivered by `email-finding/03`.

Do not change backend matching, candidate generation, billing, retention, authorization, gateway contracts, or
provider behavior in this PR. Do not add batch finding, CSV upload or export, search history, cancellation, contact
sending, email ownership claims, a new visual concept, pricing products, or persistent browser drafts. At most
16 candidates are returned, so render the complete ordered evidence set without pagination or local sorting.

## Plan of Work

First inspect the delivered API and its generated types, then add the new feature files
`apps/web/src/features/email-finder/email-finder-api.ts`, `use-email-finder.ts`, `email-finder-copy.ts`,
`EmailFinderResultView.tsx`, and `EmailFinderView.module.css`. Derive types from the generated `paths` contract.
The adapter accepts only the published response fields and validates shape, bounded arrays, numeric counts,
nullable observation times, and state/outcome discriminant values before caching. Unexpected data becomes an honest read error
with retry; unknown fields, raw provider data, and backend exception strings never enter markup or the session cache.
Reuse `SignalDetails` for evidence rows and shared labels only when meanings match. Candidate statuses need
their own reviewed labels because this API does not expose the single-verification `exists`, `catchAll`, or
source-enum contract. Reuse reviewed verification reason labels where the generated reason values match.
Do not fetch private child results or import another feature's page component to fill
fields that the finder API deliberately omits.

Add a canonical UUIDv7 helper at the new `apps/web/src/shared/idempotency-key.ts`, with an injected clock and
cryptographically secure random bytes. Reuse that exact shared owner if the verification-billing browser plan
has already introduced it. Produce canonical lowercase UUIDv7 keys and never fall back to version 4 UUIDs, timestamps
alone, or non-cryptographic randomness. Keep key generation separate from the API adapter and submission hook.

The session-scoped finder coordinator retains draft fields, the deliberate submission's frozen request body and
key, and the returned identifier. Scope it by organization and authentication generation. Prevent duplicate
activation synchronously before starting the request, set mutation retries to false, and retain uncertain work
across in-app navigation. A late success after leaving the form must not navigate from another screen; reopening
the form offers `View search` for that returned identifier. Authentication and page-restoration boundaries clear
private data using the existing session lifecycle, and old responses cannot restore it.

An uncertain response exposes `Recover this search`, which resends exactly the original body and key once on
deliberate activation. Freeze that request's inputs during recovery; editing a draft never changes the replayed
body. Explain that recovery checks the original search and retains its spending limit. A `410` response with
`idempotency_key_expired`
requires an explicit `Start another search` action and a new key; it never silently becomes a fresh POST. A hard
reload before a confirmed identifier loses this memory-only recovery handle; explain that limitation without
claiming the earlier request failed or was free. Do not store names, domains, addresses, response bodies, or keys
in local storage, session storage, URL parameters, history state, document titles, logs, or analytics.

Add new route components `apps/web/src/routes/EmailFinderPage.tsx` and `EmailFinderJobPage.tsx`. Register the two
routes and the `Find an email` destination in the existing route and navigation owners. The form requires
`verification.run`; the job page requires `verification.read`. Current-account and operation-level failures use
the shared authentication and access-denied handling. A malformed job UUID renders the same generic not-found
recovery without a request. Missing, expired, and foreign-organization jobs share `Search not found`; receiving
404 clears any retained evidence for that job.

Handle `409` replay conflict separately from expired keys: explain that this search's original input must be
recovered unchanged and do not replace the key. A `429` shows the integer `Retry-After` delay and permits deliberate
recovery with the same request when eligible; it never schedules a POST. A `503` is an uncertain admission rather
than proof that no parent exists. Local field errors and server `400` field codes preserve the entered values;
`domain_not_allowed` belongs to the domain field. Session/CSRF and permission failures retain the shared 401/403
handling. This API does not return a root balance `402`.
The API returns `400` for a key more than five minutes ahead of its clock; explain the clock-related rejection
without changing that submitted key or automatically creating another search.

Use visible form labels `First name`, `Last name`, `Company domain`, and `Maximum credits`. Use native text
inputs for names and domain, with spelling/autofill settings appropriate to searching for another person, and a
native numeric input for the integer limit. Keep the limit visible and initially 16, with helper text explaining
zero as cached/shared work only and 16 as the maximum. The form's primary action is `Find an email`. Place the
maximum-spend consequence and per-candidate charging explanation beside that action, and update the stated
limit when the input changes. Explicit submission is the spending confirmation; no second routine modal is needed.

Use `noValidate`, field-associated validation and correction hints, first-invalid focus, and a stable button with
busy semantics. Validate required values, the limit of 100 Unicode code points for each raw name, the raw domain
limit of 253 characters, and the integer credit limit. The API owns normalization; the browser must not silently
transliterate names or invent different name/domain rules. Do not use a UTF-16 `maxLength` restriction
that rejects a name within its code-point limit. Explain that supported names become Latin-letter tokens after
the documented accent and separator normalization; preserve entered Unicode and compound names so backend
validation can explain unsupported input. Accept a company hostname rather than a URL or email address and do
not silently remove a subdomain. Do not fire remote work on
typing or clearing, and do not submit while IME composition is active. The form remains usable at zero balance;
the server can satisfy cached/shared candidates. A credit shortfall appears in the terminal result as a stop
reason. Link to Billing only with `billing.read`; otherwise explain that an organization owner can add credits.

Reuse bounded polling by extracting the existing five-second/sixty-check read lifecycle into the new shared
`apps/web/src/shared/use-bounded-job-polling.ts` and adapting the verification hook without changing its behavior.
Keep each feature's request coordinator and terminal-state predicate separate. The shared owner schedules safe
reads, pauses hidden/offline, aborts superseded reads, stops after a read error or the check limit, and offers a
read-only `Refresh status`. Terminal finder states are `completed` and `failed`. A status route refresh only reads
the UUID in the route. Retain confirmed data with a stale/offline notice, and avoid moving focus during polling.
On first transition to terminal evidence, follow the sibling's one-time result-heading focus behavior; subsequent
refreshes and repeated status announcements preserve the user's focus.

Render the server's `matched`, `no_match`, `ambiguous`, or `inconclusive` outcome with plain text. `matched`
means exactly one positive candidate with complete conclusive coverage of all other generated candidates;
`ambiguous` means at least two positive candidates. `no_match` means all generated candidates were conclusively
negative. Any unresolved or skipped candidate makes a result with fewer than two positives `inconclusive`, even
if a positive candidate is displayed. The UI explains that the bounded generated candidates do not cover every
possible address and that evidence does not prove identity, ownership, permission to contact, or future delivery.
Do not label a technical positive as a confirmed personal identity or hide unresolved candidates behind a single
address headline.

Show the ordered matches, complete bounded candidate evidence, tested/total and other supplied counts, and the
server stop reason when budget, deadline, or insufficient credits prevented full coverage. Preserve
the distinction between `coverage: complete`, which means every generated candidate has a settled verification record, and
conclusive coverage, which is necessary for a unique match or no-match result. List `omittedPatterns` separately
with the address-too-long explanation; they do not inflate the tested/total denominator. Use a semantic list and
shared description-list evidence rows, fully wrapping domains and addresses. Candidate rows show the exact
`not_checked`, `checking`, `positive`, `negative`, or `inconclusive` status through reviewed labels, contributing
patterns, safe reason, and settled source, observation time, and per-candidate charge when supplied. Reason labels
cover the generated `EmailVerificationReason` values plus `cooldown`, `deadline`, and `verification_failed`.
Keep untested rows visibly distinct; a cooldown row is `not_checked` with reason `cooldown`, and traversal can
continue afterward. Cooldown is not a parent stop reason. The checked count includes settled verification records
from fresh, cached, shared, and inconclusive checks; it excludes pending, skipped, unresolved, and failed attempts
that produced no verification record. Format observation times
in English with explicit UTC and render null/missing observation time as unavailable, never as the search's
creation time. Do not link `verificationId` to a job route whose identifier represents a different entity.
Display the server's charged and currently reserved credits,
distinguish reservations from deductions, and show settled terminal billing with zero reserved credits. Never
recompute charges from positive or tested counts. Refresh permitted billing-summary data after confirmed
settlement; do not subtract credits optimistically or request billing data without `billing.read`.

When a zero-limit search follows a shared execution that remains pending at the search deadline, render its
terminal inconclusive search, untested candidate with reason `deadline`, partial coverage, and settled zero
charge. Explain that this search stopped waiting; do not claim the shared execution was canceled or that its
other payer received a refund. No automatic refresh may later change this terminal search into another outcome.
Failed parents retain their candidate snapshot and actual settled charges alongside the safe failure message;
they never imply that every candidate was tested or that the whole search was free.

Update `UX-CONTRACT.md` with route titles, canonical owners, form/recovery behavior, outcome explanations, data
boundaries, and references to the backend policy. Register finder evidence in `premium-ui.json` and add the
synthetic finder suite to the existing web `test:e2e` script. Preserve the approved visual system. If a
new shared visual decision is required during implementation, update `DESIGN.md`, runtime styles, and manifest
mapping together; ordinary finder composition should reuse current tokens without changing them.

## Interfaces and Dependencies

The browser sends `POST /emailFinds` with the required lowercase UUIDv7 `Idempotency-Key` header and exactly
`{ firstName, lastName, domain, maxCredits }`, where `maxCredits` is an integer in `[0, 16]`. It expects `202 { id }`.
The API scopes key replay to the organization and frozen normalized request. First admission accepts keys at most
24 hours old and five minutes ahead of server time; existing keys are looked up before first-admission age checks.
Replay is available through the server's seven-day terminal visibility period. An expired handle never promises
indefinite recovery. The server owns the clock checks; the client helper and rejection handling prevent silent
replacement of a rejected key.

`GET /emailFinds/:id` supplies the generated discriminated status contract: `queued`, `running`, `completed`, or
`failed`. Every variant has the parent `id`, generation version, domain, `maxCredits`, `progress`, `billing`,
`candidates`, and `omittedPatterns` snapshot. The completed variant additionally has
`result: { outcome, matches, coverage, stopReason }`; `stopReason` is required, including
`exhausted_candidates` or `multiple_matches` when appropriate. Failed parents expose only the stable
`failureCode: finding_failed` in addition to their snapshot. Candidate evidence consists of ordered index,
address, patterns, status, optional safe reason and settled verification identifier/time/source, and charged amount. Keep the
parent response fields exactly as delivered by `email-finding/03`;
this PR must not create browser-only variants of the API or import backend business modules into the frontend.

Use organization-scoped keys such as `['email-finder', organizationId, 'job', id]` and a separate submission
coordinator key. The existing authenticated client owns same-origin credentials, CSRF, and generation fencing.
The finder adapter owns request/response translation; hooks own UI lifecycle; route components compose views.
No new runtime service, provider, frontend framework, or database change is needed.

## Acceptance Criteria

- An authorized user submits first name, last name, domain, and the visible default limit of 16, receives one
  identifier, and reaches `/app/email-finder/:id`. A hard refresh reads that identifier and produces no create POST.
- Editing the limit to zero is valid; blank, negative, fractional, or above-16 limits focus the field and issue no
  POST. The form never disables solely because a cached balance is zero, and states the selected maximum before
  submission. Server validation preserves entered values and presents field-associated correction guidance.
- Duplicate activation, navigation, offline transitions, and lost responses do not create an automatic second
  POST or key. Deliberate recovery sends byte-equivalent body fields and the same key, returning the original
  search. Session replacement clears private state and suppresses late responses from the previous account.
- Complete single-positive, multiple-positive, all-negative, and incomplete-coverage fixtures display matched,
  ambiguous, no-match, and inconclusive outcomes respectively. One positive plus an unresolved candidate never
  appears as a unique match. Candidate order, counts, stop reasons, and charges agree with the server response.
- A credit-shortfall terminal fixture displays the tested evidence and settled amount, with a Billing link only
  for `billing.read`. Reserved credits are distinct from charged credits; terminal reserved credits are zero.
  Cached/shared evidence is not presented as a fresh paid result.
- A zero-limit request can follow pending shared work. If its deadline arrives first, the browser displays the
  detached inconclusive search with `deadline`, accurate coverage, and settled zero charge. It never claims that
  the other payer's work was canceled. Complete attempted coverage with an inconclusive candidate does not
  become a conclusive match. Templates omitted for excessive length remain outside the attempted-candidate denominator.
- A cooldown candidate appears as untested with its safe reason, while later settled candidates retain their
  evidence. Pending shared work and failed attempts without verification records do not increase the checked
  count. The browser never presents `cooldown` as a root stop reason or invents missing nullable mailbox signals.
- Active jobs poll within the declared bounds, pause hidden/offline, stop at terminal states or read failure, and
  retain stale evidence safely. Manual refresh performs only GET. Missing, expired, and foreign jobs have the same
  not-found UI, and operation-level 403 does not sign the user out.
- Names, domains, candidate addresses, request keys, and raw errors never enter URL/title/storage/telemetry data.
  Unexpected response fields are discarded before caching; malformed contract data receives a recoverable read
  error rather than an invented finding outcome.
- At 320 by 720, 390 by 844, and 1440 by 900 CSS pixels, all fields, evidence, charges, and recovery actions remain
  readable and reachable without horizontal document overflow. Keyboard submission, visible focus, reduced
  motion, stable loading layout, and polite announcements work; automated accessibility checks report no serious
  or critical violations. Existing single-verification polling and recovery tests continue to pass.

## Validation

Add new focused component/adapter tests at
`apps/web/src/features/email-finder/EmailFinderPage.test.tsx` and `email-finder-api.test.ts`, and helper tests at
`apps/web/src/shared/idempotency-key.test.ts` and `use-bounded-job-polling.test.tsx`. Exercise successful and malformed
responses, every terminal outcome and stop reason, limit validation, UUIDv7 format/time boundaries, duplicate
activation, same-key replay, expired recovery, read-only refresh, capability changes, and stale/session races.
Cover exact `410 idempotency_key_expired`, future-skew `400`, conflicting replay, `429 Retry-After`, uncertain `503`, and the
zero-limit shared execution that remains pending until the parent deadline. Exercise raw input limits by
Unicode code point, supported accent/compound examples, preserved subdomains, and field-specific rejections.
Extend the existing `apps/web/src/features/verification/VerificationPage.test.tsx` only for regression coverage
needed by shared polling extraction. Run these exact focused commands from the repository root:

```bash
corepack pnpm --filter ./apps/web exec vitest run src/features/email-finder/EmailFinderPage.test.tsx src/features/email-finder/email-finder-api.test.ts src/shared/idempotency-key.test.ts src/shared/use-bounded-job-polling.test.tsx src/features/verification/VerificationPage.test.tsx
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web build
corepack pnpm openapi:check
corepack pnpm design:lint
corepack pnpm ui:audit
git diff --check
```

Add the new synthetic browser file `apps/web/tests/e2e/email-finder-ui.spec.ts` and its desktop/narrow snapshots.
Cover form, all outcomes, stopping reasons, offline/stale states, key recovery, zero limit, authorization, and
session replacement. Include `axe` accessibility checks, keyboard behavior, IME behavior, long input/evidence, reduced motion, exact
POST counts, request-body/key equality on deliberate recovery, and an explicit 390 by 844 scenario. Inspect
screenshots and compare the form/result to the existing single-verification sibling. Run:

```bash
corepack pnpm --filter ./apps/web exec playwright test tests/e2e/email-finder-ui.spec.ts tests/e2e/verification-ui.spec.ts --workers=2
corepack pnpm --filter ./apps/web test:a11y
corepack pnpm --filter ./apps/web test:visual
```

Add a dedicated live suite at the new `apps/web/tests/e2e/email-finder.spec.ts`, with the new
`apps/web/playwright.email-finder.config.ts` and root launcher `scripts/testing/email-finder-web.mjs`; register
the new root command `test:email-finder-web`. Reuse `scripts/bruno/email-finding-fixture.mjs`, the owned SMTP/DNS
and credit wrapper established by `email-finding/03`, and the existing MFA-aware `privileged-login` helper.
Exclude this suite from the ordinary
screenshot-enabled Playwright configuration and disable trace, screenshots, video, DOM attachments, and raw
authenticated failure output. Extend the existing browser-artifact test owner with a new
`scripts/testing/email-finder-browser-artifacts.spec.mjs` regression for that configuration. The launcher must
reject skipped/empty runs and restore its synthetic balance and fixture state in `finally` with a verified read.

After confirming the same-origin Compose stack belongs to this checkout and the prerequisite fixture is healthy,
run:

```bash
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
node --test scripts/testing/email-finder-browser-artifacts.spec.mjs
corepack pnpm test:email-finder-web
corepack pnpm docs:lint -- UX-CONTRACT.md apps/web/tests/README.md .agents/plans/email-finding/04-find-email-in-web-app.md
```

The live suite submits one synthetic name/domain, refreshes its confirmed URL, reads a non-unknown expected SMTP
result, and compares charged/reserved values with the server ledger-backed summary. It then submits the same
candidate request with a new key and zero maximum to verify cache reuse without a charge. It also verifies a
credit-limited incomplete search, safe insufficient-credit recovery, and session loss. Queue completion alone is
insufficient runtime evidence. Add any other changed Markdown files, including `DESIGN.md` if edited, to the Harper
command. Record each actual result; static or mocked browser checks cannot stand in for live SMTP and accounting
evidence. If the Browser plugin is available, use it for rendered inspection; otherwise record the reason for using
the repository Playwright tooling.

Bruno is not applicable to this UI-only PR because `email-finding/03` owns the API and its collection. If a missing
HTTP behavior is discovered, correct the owning API plan and its collection rather than expanding this PR silently.

## Idempotence and Recovery

GET refresh, browser reload with a confirmed UUID, and repeated rendering never create work or change charges.
Explicit keyed recovery retrieves the existing request and retains its credit cap. A genuinely new search needs
an explicit user action and a new UUIDv7 key. All browser submission data remains memory-only and is cleared at
the existing authentication and page-restoration boundaries; losing that handle does not prove backend failure.

Rerun generated-artifact checking after prerequisite updates, and regenerate only from the owning API source if
necessary. Recover development runtime only through the existing checkout-owned disposable fixture setup; never
reset another checkout's Compose project or weaken MFA. This PR needs no schema reset or migration. Review the
diff for unnecessary cross-feature imports, duplicated state ownership, and route components containing business
rules, and report any material SOLID trade-offs with the validation evidence.

## Artifacts and Notes

This is a plan for one browser implementation PR; no UI, runtime, or SMTP validation has run while authoring it.
All finder-specific files and commands named above are planned additions. The backend contract and charging
policy come from the prerequisite email-finding plans. The approved design already supplies the required visual
language; no new raster concept or visual approval step is introduced.

## Plan readiness

Ready to implement
