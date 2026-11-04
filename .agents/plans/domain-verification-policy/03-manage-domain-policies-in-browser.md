# Manage Domain Verification Restrictions in the Platform Console

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A platform operator can inspect the forbidden-domain registry, block verification for one domain, and allow it
again from the browser console. The page shows confirmed server policy and explains its exact scope. A live browser
check demonstrates that blocking rejects a customer's new verification without charging a credit, and allowing
the same domain restores admission. Existing results remain readable.

## Progress

- [ ] (2026-09-18) Publish the operator capability and generated browser management contract.
- [ ] (2026-09-18) Implement the registry, domain lookup, confirmed changes, and uncertain-outcome recovery.
- [ ] (2026-09-18) Verify permissions, customer rejection, browser lifetimes, and the disposable live lifecycle.
- [ ] (2026-09-18) Update interface documentation and record focused validation and architectural trade-offs.

## Plan dependencies

- `domain-verification-policy/02`
- `frontend/08`
- `frontend/09`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Add `/app/platform/domains` with capability `platform.domains.manage`. Rationale: global verification
  policy belongs beside the platform proxy and organization consoles; every request remains authorized by backend
  `platform:admin`. Date/Author: 2026-09-18, Codex.
- Decision: Show canonical domains and exact matching, without wildcard or inherited subdomain controls.
  Rationale: the management API and enforcement share this policy. Date/Author: 2026-09-18, Codex.
- Decision: Confirm absolute policy changes and reconcile uncertain completion with a fresh domain read.
  Rationale: a lost response does not establish failure; repeating a write can overwrite another operator's later
  decision. Use no automatic mutation retry or optimistic update. Date/Author: 2026-09-18, Codex.
- Decision: Reuse the approved design and shared components. Rationale: this is a routine platform console
  extension, not a request for a redesign. Date/Author: 2026-09-18, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, the ideal customer profile at
`docs/product/ideal-customer-profile.md`, and the repository frontend design, premium, React, and testing skills.
This is operator administration; the customer profile supplies context, not evidence of market demand.

`apps/web/src/app/routes.tsx` registers platform organization, proxy, and credit pages. `app/navigation.ts` filters
working destinations by current-account capabilities. Their backend owner is
`src/libs/modules/bff-session/src/application/browser-capability-policy.ts`; they guide presentation and never
replace HTTP authorization. `features/platform-proxies/` supplies a sibling registry and confirmation flow.
`features/auth/auth-session.ts` and `api/browser-api-client.ts` fence responses by session generation and clear
protected state at authentication boundaries. The stack is React, Vite, React Router, TanStack Query, and CSS Modules.

Prerequisite `domain-verification-policy/02` provides the global management API after enforcement is available.
A missing policy permits verification. Canonicalization uses lowercase ASCII IDNA form and removes one terminal
root dot; matching is exact. `example.com` does not block `mail.example.com`. Newly started work observes policy;
a probe already started may finish. Owned reads and keyed replay remain available. The enforcement prerequisite
also teaches single verification to show `domain_verification_forbidden` as a local business rejection, preserving
genuine authorization-403 recovery. This PR consumes and regression-tests those completed contracts.

The browser operation allow list is `src/lead-email-finder-api/src/openapi/browser-document.ts`. Its snapshot is
`packages/api-client/openapi/lead-email-finder.json`; `packages/api-client/src/schema.d.ts` is generated.

## Scope and Non-Goals

Deliver one PR titled `feat(web): manage domain verification restrictions`. Add the operator capability, browser
contract, registry, domain form, confirmations, recovery, and focused tests. Update the durable interface
contract and exercise customer rejection together with the operator flow.

Do not introduce tenant-owned policy, new backend permissions, wildcards, bulk import, reasons, audit history,
expiry, automatic policy changes, DNS discovery, or production deployment. Do not change enforcement, charges,
result access, or keyed replay. No migration or reset is required. Backend management and customer rejection
implementation belong to prerequisites; preserve unrelated work.

## Plan of Work

Read `src/libs/modules/AGENTS.md`, its canonical README, and the BFF session README before changing capabilities.
Add `platform.domains.manage` to `BROWSER_CAPABILITIES` and only the `platform_admin` mapping; extend
`browser-capability-policy.spec.ts` and current-account contract coverage. Plan 02 already adds the three
management operations to `BROWSER_OPERATIONS`. Regenerate the snapshot and types for the capability change, and
update `scripts/openapi/contracts.test.mjs` while preserving the runtime/browser document distinction.

Create `apps/web/src/features/platform-domains/PlatformDomainsPage.tsx`, `platform-domains-api.ts`,
`use-platform-domains.ts`, `platform-domains-copy.ts`, and scoped CSS only where shared styles do not suffice.
The adapter owns endpoint serialization and generated response types; the hook owns queries and mutation lifetimes;
the page owns fields, focus, confirmation, and copy. Register the route and navigation label `Domain restrictions`
with the new capability, using the same heading and document-title prefix. Add no class hierarchy, generic manager,
or business-module import to the browser.

Render canonical domains with `Allow verification` on each forbidden row. Request `limit=50`, pass returned
`nextAfter` unchanged as `after`, deduplicate appended rows by domain, and show `Load more` only for a non-null
cursor. Disable duplicate loads and infer neither totals nor snapshot consistency. After a confirmed policy change,
reset traversal because registry membership can change. Retain readable rows during failed refresh, mark them
stale, and disable changes until refresh succeeds. Separate initial loading, empty registry, terminal page, and retry.

Provide one labeled domain field and `Review domain`. Send input through the detail operation so the server
normalizes or rejects it; reject only empty input locally. Show the returned canonical domain and current policy
before offering the opposite action. Unknown valid domains display allowed state. Keep input and cursors out of
browser history and persistent storage. Associate validation errors with their field and focus the first error.

Require `TeamDialog` confirmation for `Block verification` and `Allow verification`. Show the canonical target,
current state, and effect across customer organizations. Explain exact matching, independently controlled
subdomains, retained result access, and completion of probes already underway. Refresh the selected domain before
confirmation; if its state changed, show that state and require a fresh decision. Cancel receives initial focus;
Escape closes and returns focus. Send one absolute boolean after confirmation, disable duplicate activation while
pending, and use the response as confirmed state before refreshing detail and registry. Never update optimistically.

Use membership-scoped query keys and `useAuth().mutationOptions()` for generation-fenced callbacks. Validation
and authorization rejections retain established transport behavior. Transport loss, timeout, abort after dispatch,
malformed success, and server failure leave the write unconfirmed. Before dispatch, set an in-memory marker
containing only canonical domain and requested boolean, scoped to the authenticated API instance and membership.
Clear it on confirmed success or rejection; otherwise preserve it across route departure and pagehide until a
fresh detail read reconciles it. Register synchronous authentication-boundary cleanup in application composition,
independent of the mounted page; do not import this feature into shared authentication code. Preserve the marker
during transient loading for cached-page restoration, and discard it if the verified identity differs. Offer
`Check current policy` and disable writes until that read succeeds. Show observed state without attributing its cause; a different state requires a new explicit confirmation to change it.

On full reload, read registry and detail afresh without restoring or replaying a write. Cancel on unmount/pagehide,
invalidate local request generations, and ignore late callbacks; browser abort does not cancel server work.
Existing session bootstrap protects cached-page restoration. Keep reconciliation outside ordinary query data so
clearing queries during restoration does not silently lose the marker for the continuing principal.

Reuse `ProductPanel`, `StateMessage`, canonical form/action styles, and `TeamDialog`. Preserve readable domains,
keyboard order, focus across refreshes, and meaningful settled-state announcements. Add route, recovery behavior,
and canonical ownership to `UX-CONTRACT.md`; record reuse of approved tokens in `DESIGN.md` and verification
commands in `premium-ui.json`. Shared token changes require corresponding runtime changes only when a shared
visual decision actually changes. Do not redesign this screen or create copies of shared components.

Add `platform-domains.test.tsx` and `platform-domains-api.test.ts` beside the feature; extend
`apps/web/src/shared/ResponsiveNavigation.test.tsx` and `app/AuthRoutes.test.tsx`.
Exercise a customer submission through the real application session composition: a domain prohibition retains the
verification form with the prerequisite's safe inline error, while genuine permission denial uses shared recovery.
Keep verification endpoint lists and domain codes out of shared authentication code when testing this behavior.

Add `apps/web/tests/e2e/platform-domains-ui.spec.ts` and `platform-domains.spec.ts`, with explicit configurations
`apps/web/playwright.platform-domains.config.ts` and `playwright.platform-domains-live.config.ts`. Each `testMatch`
selects only its corresponding suite. Register `test:platform-domains` and `test:platform-domains-live` in
`apps/web/package.json`; add both suites to the default configuration's `testIgnore`. The mocked configuration
starts an owned preview and runs 1440 by 900 and 320 by 720 projects. The live configuration uses existing
`privileged-login` and `browser-fixture-environment` helpers with real MFA, without injected sessions. Keep cookies
and tokens out of reports; disable screenshots, traces, and video for authenticated live tests. Wire commands into
`.github/workflows/validate.yml` beside platform browser checks and extend `scripts/ci/validate-workflow.spec.ts`
to prove explicit selection and fixture ordering.

## Interfaces and Dependencies

| Operation | Contract |
| --- | --- |
| `GET /v1/domain-verification-policies` | Query `limit=50` bounded to 1–100; optional `after`. Returns `{items,nextAfter}` with canonical ASCII lexicographic order and `nextAfter: string \| null`. Items are forbidden records with `domain`, `isVerificationForbidden: true`, and `updatedAt`. |
| `GET /v1/domain-verification-policies/{domain}` | Returns `{domain,isVerificationForbidden,updatedAt}`. A missing valid domain returns false and a null timestamp. |
| `PUT /v1/domain-verification-policies/{domain}` | Body `{isVerificationForbidden:boolean}`; returns the same detail shape. First PUT creates a technical row; repeated identical state preserves its timestamp. |

Use generated schemas and encode the domain path segment through the generated client. PUT sets absolute state;
ordinary last-committed-write behavior applies. A detail read is an observation, not a lock against another operator.
Management requires `platform:admin`; cookie mutations retain Origin and CSRF checks. Only platform administrators
receive the new browser capability. No library, external service, configuration secret, or table is introduced.

## Acceptance Criteria

- Platform operators can inspect, block, refresh, and allow a canonical domain. Customer navigation omits this
  page; customer deep links and direct API calls reveal no policy data.
- Equivalent case, IDNA spelling, and terminal root dot display one policy. Subdomains remain independent.
  Invalid domains show an associated error without a write.
- Pagination follows the server cursor, prevents duplicate loads, and invents no total. Changed membership resets
  traversal; stale or failed reads never enable a write based on unconfirmed data.
- Every change requires confirmation and sends one absolute mutation. Uncertainty requires a detail read before
  another decision, without automatic replay or optimistic success.
- Navigation, pagehide, account replacement, logout, and delayed responses cannot restore stale state or apply
  success to another principal. Reload reads current policy without replaying earlier intent.
- Operator blocking causes the customer's new single submission to show domain rejection without charging a
  credit; the authenticated form remains usable. Genuine permission denial, replay, and owned reads retain
  prerequisite behavior. Allowing the domain restores ordinary admission.
- Desktop and narrow layouts retain readable text and all controls; keyboard and dialog focus work; `axe` reports
  no serious or critical violations. Focused contract, browser, and architecture checks pass.

## Validation

Run from the repository root after implementing the explicitly named new files and scripts:

```sh
corepack pnpm test -- browser-capability-policy.spec.ts browser-document.openapi.spec.ts --runInBand
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
node --test scripts/openapi/contracts.test.mjs
corepack pnpm --filter ./apps/web test:ci src/features/platform-domains src/app/AuthRoutes.test.tsx src/shared/ResponsiveNavigation.test.tsx src/features/verification/VerificationPage.test.tsx
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web build
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm test -- scripts/ci/validate-workflow.spec.ts --runInBand
corepack pnpm --filter ./apps/web test:platform-domains
corepack pnpm design:lint
corepack pnpm ui:audit
git diff --check
```

On a confirmed owned disposable stack, set `COMPOSE_PROJECT_NAME` to its existing project name and run:

```sh
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm bruno:domain-verification-policies
corepack pnpm --filter ./apps/web test:platform-domains-live
```

The Bruno launcher comes from plan 02. Extend its current-account capability assertion in this PR and rerun
management authorization/CSRF coverage. Stub browser responses do not prove HTTP authorization. The live test uses
separate operator/customer sessions, owns a unique run-specific `.test` domain, captures customer balance,
blocks, verifies rejection and unchanged balance, allows, and proves restored admission with HTTP `202`. Wait for
that operation to settle before cleaning its owned records; do not claim a mailbox verdict from admission. Restore
only that policy fixture in `finally`. Record missing dependencies rather than resetting another stack. Use the
Browser plugin when available; otherwise record why repository Playwright was used. Manually check focus, reduced
motion, 200% zoom, and console errors at both widths.

## Idempotence and Recovery

GET is repeatable. PUT repeats absolute state but is never automatically replayed after uncertainty: another
operator may have changed policy. Reconciliation shows current state and requires a fresh decision before another
write. Use a unique fixture domain and retain its original policy; follow the owned-fixture cleanup in plan 02. No broad
table cleanup, schema reset, migration, or removal of other operators' entries is permitted. Interrupted tests
resume by reading the recorded fixture domain before restoring it.

## Artifacts and Notes

Planning uses the platform proxy console and browser capability policy inspected on 2026-09-18. No implementation
or runtime validation is claimed. Before implementation, assign the synced issue and move its project item to
In Progress using the root workflow. The PR uses its conventional commit subject as title, assigns the requesting
user, and closes that issue. Record exact results and runtime limits; review the final diff for responsibility
or dependency violations.

## Plan readiness

Ready to implement
