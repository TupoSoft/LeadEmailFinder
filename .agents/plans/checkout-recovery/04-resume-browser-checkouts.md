# Resume Durable Credit Checkouts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.
Stable key: `checkout-recovery/04`. One pull request: `feat(billing): resume durable credit checkouts`.

## Purpose / Big Picture

A customer can recover the same credit purchase after a lost response, reload, or navigation without creating another
purchase. Billing tracks preparation of the hosted payment page separately from payment confirmation. It follows
durable server status and offers the payment page only while the server says that it remains usable.

## Progress

- [ ] (2026-09-17) Adapt billing to the generated durable checkout responses and status read.
- [ ] (2026-09-17) Persist one logical attempt before dispatch and preserve explicit same-key recovery.
- [ ] (2026-09-17) Implement bounded status polling, safe navigation, and authentication cleanup.
- [ ] (2026-09-17) Update focused component, browser, API-contract, and Bruno evidence and the UX contract.
- [ ] (2026-09-17) Run the specified validation and record actual results before opening the single pull request.

## Plan dependencies

- `checkout-recovery/03`
- `frontend/10`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Persist the original pack and canonical UUID version 4 key before the first request; never generate a key during retry.
  Rationale: A lost initial response must not lose the identity of the purchase. Date/Author: 2026-09-17, Codex planning.
- Decision: Keep recovery in principal-scoped, per-tab session storage and exclude keys and URLs from shared caches.
  Rationale: Reload recovery needs durable browser state with a narrowly defined lifetime. Date/Author: 2026-09-17, Codex planning.
- Decision: Do not apply an arbitrary local attempt expiry; old attempts require a fresh server check.
  Rationale: Server key identity lasts until the disposable database is reset. Date/Author: 2026-09-17, Codex planning.
- Decision: Retry mutations only explicitly; poll status at most twelve times at the server-permitted cadence.
  Rationale: Browser recovery must not start financial work unexpectedly. Date/Author: 2026-09-17, Codex planning.
- Decision: Reuse the approved billing layout and update the UX contract for recovery behavior.
  Rationale: This task improves recovery of a purchase attempt while retaining the visual system. Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`apps/web/src/features/billing/billing-api.ts` derives its checkout type only from HTTP 201 and sends `{packId}`.
`use-billing.ts` keeps an organization-scoped QueryClient lock across route changes, but a reload loses that lock.
After an uncertain result, a successful history refresh currently unlocks a separate purchase. Replace that recovery
rule: a history read cannot establish which request created a purchase.

`checkout-return-hint.ts` contains only an optional thirty-minute `{id, expiresAt}` navigation hint. It is not an
idempotency record. `checkout-navigation.ts` validates the URL with the shared exact-origin policy before navigation.
`apps/web/src/routes/BillingPage.tsx` renders payment-return status from current-organization history and balance from
the independent billing summary. Existing return polling uses five-second reads and a twelve-check limit.

`apps/web/src/features/platform-credits/credit-adjustment-recovery.ts` demonstrates verified storage writes and
principal-scoped recovery. Its twenty-four-hour retry expiry is specific to that workflow and must not be copied.
`apps/web/src/features/auth/auth-session.ts` owns session generations, request cancellation, cache clearing, and
page lifecycle handling. `apps/web/AGENTS.md` requires feature cleanup through explicit dependencies at application
setup, without adding feature imports or endpoint lists to shared authentication and transport code.

## Scope and Non-Goals

This pull request changes billing adapters, coordination of purchase attempts, local recovery, bounded reads, navigation, and
their tests. It updates `UX-CONTRACT.md` and uses the generated contract supplied by `checkout-recovery/03`.
It preserves the current catalog, purchase-history projection, summary, permissions, redirect policy, and visual tokens.
It does not change provider integration, ledger accounting, backend workers, request-key retention, or database schema.
`checkout-recovery/05` removes the temporary backend path for requests without a key after consumers are updated.
No redesign, provider switch, browser SDK checkout, server cancellation, migration, or production work is included.

## Plan of Work

At implementation start, find the synced issue by `<!-- execplan: checkout-recovery/04 -->`, assign it to the current
user, and move its Project 9 status to In Progress using the current field option ID. Follow root `AGENTS.md` for
scope failures. At pull-request creation, use the conventional title above, assign `@me`, and close the synced issue.

Read the product profile, `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, and local frontend design, premium,
React, and testing skills. Reuse `ProductPanel`, shared actions, existing focus behavior, and semantic status text.

Update `billing-api.ts` to send the generated `Idempotency-Key` header and classify all documented response variants.
Add a direct status-read adapter with an `AbortSignal`. Keep URLs and keys out of `QueryCache` and `MutationCache`;
use direct generated-client operations for this workflow while retaining ordinary billing queries for safe projections.
Validate returned fields and URL policy before making navigation possible; malformed responses mean unknown outcome.

Add `apps/web/src/features/billing/checkout-attempt-recovery.ts` for a strictly validated, versioned recovery record
and `checkout-workflow.ts` for plain workflow decisions. Keep these functions independent of React, router, and HTTP
client imports. Let a focused checkout hook connect them to the feature API adapter, authenticated lifecycle, and UI.
Before dispatch, generate a lowercase UUID version 4 using `crypto.randomUUID()`, persist the record below, and verify it can
be read back unchanged. A blocked storage write prevents the POST. One unresolved record blocks a separate attempt.
The record excludes prices, URLs for payment pages, provider identifiers, response bodies, and authentication material.

Use a membership-scoped storage namespace and require the confirmed organization to match before recovery. Preserve
the record through navigation, reload, and pagehide. Ignore foreign records and clear them at the identity boundary;
a malformed matching record must display safe recovery guidance and must not dispatch from untrusted contents.
Restore only after fresh authenticated bootstrap. A confirmed purchase ID enables status GET; without an ID, expose
explicit same-key, same-pack retry. Persist a returned purchase ID before acting on the response. Never infer payment
or permission to create a new key from a missing history row, a timeout, a stale record, or elapsed local time.

Represent creating, reconciling, ready, completed, definite failure, and unavailable outcomes explicitly. Retain the
attempt on network failure, conflict, or unavailable status. On a definite admission rejection or confirmed terminal
outcome, clear the record; on a failed clear, keep new submission blocked. An expired checkout URL or requires_review
is unavailable, not proof that payment failed. Do not replace its key or create another checkout automatically.

Schedule status `GET` requests only for creating/reconciling with a positive `retryAfterSeconds`, at intervals of
`max(5 seconds, retryAfterSeconds)`, at most twelve checks per active waiting session. A null delay stops automatic
polling. Pause while hidden or offline; stop at ready, completed, failed, unavailable, authentication boundaries,
route disposal, or the check limit. Keep a manual status refresh after polling stops. Do not reset the budget merely
because visibility or connectivity changes. No progress percentage or promised completion time is warranted.

An actively initiated, still-mounted flow can navigate after its current ready result passes validation. A resumed
or reloaded flow requires an explicit action to continue and performs a fresh status GET before navigation. A paid
purchase never redirects, even if an earlier response included a URL. Completed means the paid state and credit-grant
marker are confirmed; refresh history and summary without incrementing balance locally. A ready URL is locally usable
for at most the backend's thirty-minute bound; only a fresh server ready response can authorize its use.

Navigation or Cancel waiting aborts local waiting only and retains the logical attempt. Fence callbacks, body parsing,
storage updates, and redirects after operation or authentication generation changes. Add a narrow synchronous
authentication lifecycle dependency and compose feature cleanup in application setup, including when Billing is
unmounted. Clear checkout recovery for logout, unusable sessions, and principal replacement. Pagehide hides protected
content while preserving recovery; BFCache restoration reconfirms identity before exposing it. Preserve the existing
platform-credit cleanup timing and tests if its direct `AuthSession` dependency is moved to this composition boundary.

Update `BillingPanels.tsx`, `apps/web/src/content/billing.ts`, and `BillingPage.tsx` to expose stable preparation,
explicit retry, continue, unavailable, and manual-refresh states with existing controls and polite announcements.
Keep the optional payment-return hint separate and non-authoritative. Read-only customers retain history and return
status but receive no manage-only checkout URL. Update the billing and canonical ownership rows in `UX-CONTRACT.md`.
Do not edit `DESIGN.md`, runtime tokens, or `premium-ui.json` unless an actual shared visual decision changes.

## Interfaces and Dependencies

The durable entry request is `POST /v1/credit-purchases` with `{packId}` and exactly one canonical UUID version 4
`Idempotency-Key`. `checkout-recovery/03` retains the old no-header path temporarily; this client always sends the key.
POST waits within the configured budget (1.5 seconds by default). A newly admitted purchase returns 201 when
preparation is ready. Processing returns 202 with a relative Location pointing to `/v1/credit-purchases/:id/checkout`; a ready replay or any
completed/failed/unavailable result returns 200. Do not follow an arbitrary Location origin.
GET uses the generated path, requires `billing:manage`, and returns the same 404 for missing and foreign purchases.

The minimal status projection contains `{id, status, checkoutStatus}` with only variant-specific safe fields.
The `creating` and `reconciling` variants carry positive-or-null `retryAfterSeconds`. The `ready` variant carries a
validated `redirectUrl` only while payment is pending. The `completed` variant requires paid plus the grant marker;
`failed` is definite. The `unavailable` variant carries the safe reason `expired` or `requires_review`.
The adapter preserves the generated union without widening unknown values.
Unknown-create investigation ends in requires_review after fifteen minutes. A matched checkout is observed until
its original thirty-minute dispatch deadline; afterward it is unavailable/expired. Confirmed paid purchases keep
retrying any unfinished credit grant independently. The browser offers a read, not a command to restart provider work. Existing summary and history endpoints remain authoritative for their own data.

The only persisted attempt is `{version, membershipId, organizationId, packId, key, createdAt, purchaseId?}`.
There is no browser key TTL and no backend key reuse before the disposable database is reset. No new dependency or
environment variable is required. The browser continues using React, Vite, TanStack Query, and the generated client.

## Acceptance Criteria

- One initial action persists its key before POST; duplicate activation, route changes, and explicit retries retain one purchase.
- Reload after a lost response preserves the original key and pack; no mutation is sent until explicit user action.
- 201 ready, 202 processing, and ready or terminal 200 are classified correctly; processing does not require a redirect URL.
- A known purchase resumes through the manage-only status GET; a foreign or missing ID reveals no purchase details.
- Polling obeys server delay, twelve checks, null-delay stop, hidden/offline pause, and all terminal/unavailable states.
- Continue after reload or navigation rechecks status; paid-before-redirect and expired URLs never navigate.
- Unknown, conflict, requires_review, and failed status reads retain recovery and never permit a replacement key automatically.
- Storage failure prevents initial dispatch; keys and URLs appear in neither shared caches nor diagnostics or persisted responses.
- Logout, session loss, principal replacement, and late callbacks cannot recreate cleared records or navigate another account.
- BFCache restoration reconfirms identity, preserves matching recovery, and neither replays POST nor redirects automatically.
- Read-only billing remains usable; safe amounts, independent panels, focus, and responsive layout retain their current contracts.
- Focused automated checks and the live stub workflow pass; unavailable runtime evidence is explicitly recorded.

## Validation

Add adapter/workflow/storage tests under `apps/web/src/features/billing/`, including known-ID reads, unknown-ID
explicit replay, malformed responses, key conflict, blocked storage, stale URL, and a grant completed before redirect.
Extend `checkout-recovery.test.tsx`, `return-polling.test.tsx`, `apps/web/src/routes/BillingPage.test.tsx`, and add
`apps/web/src/features/auth/checkout-recovery-boundary.test.ts`. Preserve existing credit-boundary regression coverage.

Run these commands from the repository root; these are required future checks, not recorded passing results:

    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web test:ci src/features/billing src/routes/BillingPage.test.tsx src/features/auth/checkout-recovery-boundary.test.ts src/features/auth/credit-recovery-boundary.test.ts src/features/auth/auth-session.test.ts
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web build
    NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost corepack pnpm --filter ./apps/web exec playwright test tests/e2e/billing-ui.spec.ts
    corepack pnpm design:lint
    corepack pnpm ui:audit
    corepack pnpm architecture:check
    corepack pnpm docs:lint -- UX-CONTRACT.md .agents/plans/checkout-recovery/04-resume-browser-checkouts.md
    git diff --check

Extend `apps/web/tests/e2e/billing-ui.spec.ts` at its configured 1440 by 900 and 320 by 720 viewports. Cover keyboard
submission, reload, delayed ready, exhausted polling, explicit retry, unauthorized reads, and accessibility checks with `@axe-core/playwright`. Use the
existing Playwright workflow when the Browser plugin is unavailable and record the reason.

Extend the nearest `bruno/credit-purchases` flow to send a stable request key and validate the status read and explicit
replay. With the owned disposable stub stack selected by its actual COMPOSE_PROJECT_NAME, run
`corepack pnpm bruno:credit-purchases` and `corepack pnpm --filter ./apps/web browser-fixtures:bootstrap`, then
`corepack pnpm --filter ./apps/web exec playwright test --config playwright.billing.config.ts --project=chromium`.
The live scenario proves one logical purchase after a lost response/retry and authoritative balance after a signed
stub webhook. Stub evidence does not establish Paddle reconciliation; that belongs to the provider plan.

## Idempotence and Recovery

Repeat reads freely within their authorization and polling policy. Retry POST only with the stored key and original
pack. A local abort cannot cancel server work. Do not discard a valid old record merely because time elapsed; refresh
server status first. Closing the tab or clearing storage loses the browser record, so purchase history and the server
status remain the recovery evidence; the UI must not claim that the earlier purchase was canceled.
This plan changes no schema and requires no database reset. If prerequisite development data is reset, use its
documented disposable reset/reseed process and remove only the checkout recovery namespace for that test identity.

## Artifacts and Notes

Keep concise validation results, fixture purchase IDs where safe, and command failures here during implementation.
Never attach full checkout URLs, request keys, authentication state, or raw provider bodies. This plan unlocks removal
of the no-header compatibility path in `checkout-recovery/05`; verify all other repository consumers there first.

## Plan readiness

Ready to implement
