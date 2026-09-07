# Manage an Organization's Team and Accept Invitations

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An organization owner or administrator can open a responsive team page, see both active and disabled memberships,
invite a person, copy the one-time invitation URL, change an allowed role, and disable a member. A recipient can open
the public invitation URL, preview which organization, email, role, and expiry it represents without submitting a
password, then accept it with a password of at least 12 characters. The behavior is observable through the browser,
the documented HTTP contract, and focused API and browser tests.

## Progress

- [x] (2026-09-07) Expose truthful member-list and no-store invitation-preview contracts.
- [x] (2026-09-07) Implement the responsive team-management and public invitation-acceptance routes.
- [x] (2026-09-07) Cover hierarchy, final-owner, permission, one-time-token, loading, empty, error, and recovery states.
- [x] (2026-09-07) Update `OpenAPI`, the generated browser client, Bruno, module documentation, and design context.
- [x] (2026-09-07) Run focused, browser, architecture, prose, and repository-wide validation and record the evidence.
- [x] (2026-09-07) Validate the approved member-header layout follow-up: align Refresh members with the heading on
  desktop, place it below the description on mobile, and consolidate the separator and feedback spacing.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `auth/07`
- `auth/13`
- `module-architecture/06`

## Surprises & Discoveries

- Playwright's no-copy-prompt option suppresses page snapshots but can still write assertion text to an error-context
  file. Invitation tests convert errors to safe scalar failures before recording. Eight deliberately failing browser
  subprocesses prove that tokens, passwords, DOM content, and late output never reach logs or artifacts.

- The existing API and gateway already use fixed labels for sensitive paths. This change extends their tested
  invitation cache and referrer contracts rather than introducing a parallel logging mechanism.
- Route middleware runs after Nest body parsing. Sensitive response headers therefore belong in a host helper
  registered before parsing, so malformed JSON and guard failures remain protected from caching.
- The authenticated client redirected every operation-level forbidden response. Team mutation rejections now remain
  local; member-list authorization still uses the shared forbidden route.
- Playwright waits for a load event during its default Back navigation even when Chromium restores a cached page.
  Browser-history actions followed by observable-state assertions verify that restoration without that false timeout.

- `module-architecture/06` moved the controller into `api/`, made onboarding application services framework-free,
  and placed membership and invitation persistence behind identity-owned ports. This plan must extend those ports
  and adapters without importing TypeORM into onboarding.

## Decision Log

- Decision: Place Refresh members in an optional `ProductPanel` header action and share its reserved feedback region
  with the mounted team operation feedback.
  Rationale: The action belongs to the member list. A single separator and feedback region remove the detached
  button and excess space while preserving announcements, focus, and stable loading geometry.
  Date/Author: 2026-09-07, approved visual follow-up.
- Decision: Use direct generated-client operations for invitation secrets, with feature-local abort and generation
  guards, and keep every invitation operation outside the shared query and mutation caches.
  Rationale: Avoiding secret-bearing cache entries removes the need for mutation retention and reset timing. Team
  issuance still uses the authenticated transport fence; public operations omit credentials and invalidate on shared
  session boundaries. This preserves the acceptance criteria with less state to erase.
  Date/Author: 2026-09-07, implementation.
- Decision: Register one-time-route cleanup in layout effects and exclude only invitation-entry documents from
  development-only synthetic `StrictMode` remounts.
  Rationale: Cleanup is synchronous before paint, and a synthetic remount cannot reconstruct one-time authority.
  Ordinary routes retain `StrictMode` diagnostics. Full-page history and delayed-settlement tests exercise real cleanup.
  Date/Author: 2026-09-07, implementation.
- Decision: Validate against an isolated `lef-issue508` Compose project with dedicated ports.
  Rationale: The existing stack belongs to another checkout. No shared reset is required for this implementation.
  Date/Author: 2026-09-07, implementation.

- Decision: Keep team management and public invitation acceptance in one vertical pull request.
  Rationale: An issued invitation is not a complete user outcome until the recipient can inspect and accept it, and
  both halves share the same one-time URL contract and security treatment.
  Date/Author: 2026-08-31, planning.
- Decision: Preserve the endpoint's existing inclusion of active and disabled memberships, and rename the misleading
  `MembershipListingService.listActive()` method to reflect that behavior.
  Rationale: The response already contains both states. The UI must represent them truthfully, while the source name
  must not lead a future maintainer to add an incorrect active-only filter. Disabled membership is terminal in the
  current model; this plan does not imply reactivation.
  Date/Author: 2026-08-31, planning.
- Decision: Add an unauthenticated, read-only invitation preview keyed by the same bearer token as acceptance,
  returning organization identity, invited email, role, and expiry only while pending. Consumed/accepted tokens return
  a generic no-detail terminal response, with `Cache-Control: no-store` throughout.
  Rationale: A recipient needs enough context to decide whether to set a password, while member lists, other
  invitations, identity-provider details, and the stored token hash remain private.
  Date/Author: 2026-08-31, planning.
- Decision: Treat an invitation token as a one-time secret throughout the gateway, API, browser, and test tooling.
  Rationale: The raw token grants public acceptance. It may appear only in the issued URL and the immediate request;
  it must not enter analytics, access/application logs, telemetry, toast text, persistent browser storage, referrer
  headers, fixtures, screenshots, or recorded validation artifacts.
  Date/Author: 2026-08-31, planning.
- Decision: Extract a token from `/accept-invitation/:token` during browser bootstrap and immediately replace the
  current history entry with `/accept-invitation` before any preview request or application telemetry can run.
  Rationale: No-store and no-referrer prevent caches and referrers, but they do not remove a secret-bearing URL from
  browser history. The sanitized route makes refresh, Back, and Forward fail safely without restoring the secret.
  Date/Author: 2026-08-31, planning.
- Decision: Order membership rows by `createdAt ASC, id ASC`.
  Rationale: Long-standing members remain stable at the top, and the unique identifier resolves equal timestamps for
  deterministic API and browser tests.
  Date/Author: 2026-08-31, planning.
- Decision: Reuse server hierarchy and final-owner rules and present their `403` and `409` outcomes rather than
  reproducing those rules as frontend business logic.
  Rationale: Navigation and controls can use account capabilities for guidance, but concurrent authorization and the
  final-owner invariant remain authoritative only under the backend's organization lock.
  Date/Author: 2026-08-31, planning.
- Decision: Apply the existing frontend design context in this feature and complete the premium UX audit here.
  Rationale: Responsive layout, accessibility, stable loading states, destructive confirmations, and recovery are
  acceptance criteria of every feature; there will be no later catch-all polish plan.
  Date/Author: 2026-08-31, planning.

## Outcomes & Retrospective

Delivered the responsive team route, generated member and invitation contracts, public preview and acceptance,
and complete one-time-secret cleanup. The live owner flow issued and copied an invitation; a new recipient
previewed and accepted it; the owner changed the role and disabled access. Browser history restoration revealed no
previous token, preview, password, or issued-link dialog. Existing public visual baselines remain unchanged.

No schema change or migration was needed. The default backend suite still gates 80 environment-dependent tests;
the three focused PostgreSQL tests were run separately and passed against a dedicated test database, which was then
removed. These skips do not represent additional provider validation. The initial review used an isolated development
stack. The later review of the member header uses this checkout's default `lef` stack at port 53000; only its web container
was rebuilt and recreated. No merge was performed.

## Context and Orientation

`frontend/08` provides the authenticated application shell, account context, permission-aware navigation, the
same-origin browser client, CSRF handling, shared request-state patterns, and the durable design context. This plan
adds an authenticated `/app/team` route plus initial `/accept-invitation/:token` and sanitized
`/accept-invitation` routes without exposing OAuth tokens to JavaScript.

The `organization-onboarding` business module owns invitation and membership use cases, policy, and HTTP delivery;
identity owns organization, invitation, and membership persistence plus lock/session adapters. The onboarding
`OrganizationsController` in
`src/libs/modules/organization-onboarding/src/api/organizations.controller.ts` is currently excluded from Swagger. It
already supports issuing an invitation, accepting it, listing active members, changing a role, and removing a member.
The response DTO already carries membership `status`, and the identity-owned `MembershipDirectory` already returns
active and disabled members. The method name `MembershipListingService.listActive()` is stale and should be corrected
while tests make the all-status behavior explicit.

Role hierarchy is enforced in the application services: an administrator cannot grant, modify, or remove an owner,
and only an owner can manage the owner role. Demoting or removing the final active owner returns `409`; `auth/13`
serializes those decisions with an organization lock. Removal changes membership status to `disabled` and is already
an idempotent no-op for a disabled membership. The UI must refresh authoritative data after every mutation and must
not optimistically claim that a rejected hierarchy or final-owner change succeeded.

Invitation issuance returns the raw token once because the project has no invitation-email delivery. Acceptance is
currently `POST /v1/organizations/invitations/:token/accept`, public and idempotent after successful acceptance, with
unknown, expired, and conflicting identities mapped to explicit HTTP failures. There is no preview endpoint. The
existing DTO enforces a minimum password length of 12 characters.

Before changing this business module, implementation must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and `src/libs/modules/organization-onboarding/README.md`, then keep that README current.

## Scope and Non-Goals

Keep the member-list response's current active-and-disabled behavior, rename the misleading application method, and
make the status coverage explicit in tests. Add a narrow invitation-preview application service and unauthenticated
`GET` route. Expose only the team and invitation operations in Swagger and regenerate the checked browser client
without handwritten copies of server DTOs. Keep platform organization creation excluded for `frontend/15`.

Build the `/app/team` page with an accessible member list, status labels, role controls allowed by account context,
invitation form, one-time URL presentation, copy action, confirmations, and authoritative refresh. Build the public
invitation route with preview, password entry, expired/used/unknown/conflict states, acceptance, and a sign-in call to
action. Include compact mobile layouts, keyboard operation, screen-reader operation, focus management, non-color-only status,
skeleton/loading behavior, empty membership handling, inline validation, recoverable failure states, and layout
stability.

Do not add invitation listing, revocation, resend, email delivery, public account registration, membership reactivation,
organization switching, token analytics, token-bearing logs or telemetry, or a general audit-log UI. Do not add a
standalone design-system or final-polish task. Do not add database migrations; this plan needs no schema change.

## Plan of Work

Rename `MembershipListingService.listActive()` to describe its existing all-status result and keep the controller and
tests aligned. Order the identity-owned `MembershipDirectory` adapter by `createdAt ASC, id ASC` and add a focused
case proving active and disabled rows both reach the response. Map each row's real status without presenting disabled
users as active or offering unsupported reactivation. Keep organization scoping and `members:manage` enforcement
unchanged.

Add `InvitationPreviewService` behind a narrow identity-owned reader boundary, following the existing
`InvitationStore` conventions without importing its adapter. Hash the supplied token exactly as acceptance does and
load only the matching invitation and organization display fields. Return organization name, invited email, role,
expiry, and `pending` only while it still carries acceptance authority. The framework-free service throws typed
onboarding not-found, expired, or consumed errors. Reuse the existing not-found and expired errors and add a consumed
error only if needed; `OrganizationsController.handleErrors()` maps them to non-disclosing `404`,
`410 invitation_expired`, or `410 invitation_consumed` responses. The identity port/adapter and application service
must not construct Nest exceptions. Never return the raw token or token hash. Use a deterministic persistence/HTTP
fixture with `expiresAt` in the past to prove expiry without waiting for the fixed invitation TTL.
Add `GET /v1/organizations/invitations/:token` as `@Public()` and attach `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. A replayed acceptance remains effect-idempotent but returns only generic
`{ "status": "accepted" }` with no invitation or membership PII. Apply `Cache-Control: no-store` to invitation issue
and acceptance responses as well as preview, and add HTTP/cache-contract tests. Keep password validation.
Update the existing duplicate-acceptance Bruno assertion: it must stop comparing the replay body byte-for-byte with
the first PII-bearing response and instead require only the generic accepted status with all invitation and
membership fields absent.

Make only the member-list, invitation issue/preview/accept, role-change, and member-removal operations visible in the
browser OpenAPI allow list. Document cookie-session security, status codes, nullable member email, member statuses, hierarchy failures,
preview cache policy, the minimum password length, and the one-time nature of an issued token. Keep platform
organization creation excluded until `frontend/15`. Update the browser artifacts with `openapi:export` and
`openapi:generate`, run `openapi:check`, and use only generated contracts at the web boundary.

Update the gateway and API request logging so token-bearing frontend and API paths are omitted or replaced with a
fixed route label before logging. Apply `Referrer-Policy: no-referrer` to the public invitation document and ensure no
analytics or error-reporting integration receives the raw URL. Before application queries, logging, or telemetry
initialize, extract the path token into ephemeral memory and replace the current history entry with
`/accept-invitation`. Load preview through an uncached route request with `cache: 'no-store'`; do not put invitation
previews into the shared query cache. Refreshing the sanitized route or reaching it through Back/Forward shows a safe
missing-link state and never reconstructs the token.

Register secret cleanup before any one-time route or modal can enter the back/forward cache. On `pagehide`,
synchronously clear issued URL, invitation token, preview data, acceptance password, mutation data/variables, and
copy buffers. On `pageshow` with `persisted === true`, render the missing-link/dismissed-secret state before paint and
do not restart preview or restore a modal. Test full-page Back/Forward restoration, not only React unmount.

Give invitation preview, issue, and acceptance a feature-local ephemeral-operation generation and abort controller
in addition to the authenticated-session generation from Plan 08. Every request and settlement callback captures the
generation. Dismissal, unmount, pagehide, and back/forward-cache restoration advance it and abort in-flight work;
late success or failure from an older generation is ignored and cannot restore token, preview PII, password, modal,
or MutationCache data. Test delayed preview and mutation settlements on both sides of pagehide/pageshow.

Keep an issued URL only in local modal state. For issue and acceptance mutations, set zero retention where supported,
extract a current successful issue result into local modal memory before calling mutation `reset()`, then reset each
mutation immediately after every settlement as well as on unmount. Assert the shared MutationCache contains neither
response data nor variables afterward. Clear the local issued URL after copy/dismissal, navigation, unmount, or
pagehide. Clear acceptance password and token refs after success or failure, on unmount, and on pagehide. Success
feedback says only that the link was copied or accepted; it never repeats the link, token, or password in a toast.

Implement the team page and invitation route using the established application shell, request-state components, form
patterns, and design tokens. Disable duplicate submissions while a result is pending. Require explicit confirmation
for role changes involving owner and for member removal. On any `403`, `404`, or `409`, retain the user's safe form
input other than invitation tokens or acceptance passwords where useful, explain the server result without claiming
success, and reload the member list. A disabled
membership remains visible with its truthful state and no mutation controls.

Add focused API unit and HTTP tests, web component tests, accessibility checks, generated-client drift checks, and
browser scenarios. Extend `bruno/organization-onboarding` for the preview's success, unknown, accepted, and
no-store behavior without committing a token. Use a disposable live browser flow for a seeded owner to issue a link
and a new recipient to preview and accept it. Run the premium design audit against `DESIGN.md` at desktop and narrow
mobile widths and fix issues in this pull request. Disable trace, screenshots, video, DOM/network attachments, and
response dumps for the entire secret-bearing browser and Bruno segment, including failure paths. Assert synthetic
token/password markers are absent from output directories and CLI logs; do not rely on post-run redaction.
Register `corepack pnpm bruno:organization-onboarding` with the pinned launcher from Plan 02. It loads the ignored
development service credential internally, uses the developer sandbox, suppresses token-bearing response dumps, and
requires nonzero execution.

## Interfaces and Dependencies

`GET /v1/organizations/:organizationId/members` keeps returning active and disabled rows and continues to expose
membership ID, nullable email, role, and status. The implementation method is renamed so its source-level contract
matches the existing HTTP behavior. A null email renders `Email unavailable` and never becomes an empty or fabricated
address.

Add public `GET /v1/organizations/invitations/:token` with a response equivalent to:

    {
      "organizationName": "Acme Development Customer",
      "email": "person@example.test",
      "role": "member",
      "expiresAt": "2026-09-03T12:00:00.000Z",
      "status": "pending"
    }

The response is never cacheable. Unknown tokens return `404`; expired and consumed tokens return distinct generic
`410` codes without organization, email, role, or membership data. A replayed `POST` acceptance returns only generic
accepted status and keeps the minimum password length of 12 for the first effect.

The browser initially accepts `/accept-invitation/:token`, synchronously replaces it with `/accept-invitation`, and
keeps the token only for the current mounted flow. The sanitized route has no preview authority by itself.

No new database entity or external library is required. Frontend work uses the router, account context, query/mutation
layer, CSRF-aware client, form primitives, and design context established by `frontend/08`.

## Acceptance Criteria

- A signed-in owner or administrator with browser capability `team.manage` sees `/app/team` navigation. When the
  capability is absent, the link is hidden; direct navigation obeys the authoritative API result and renders `403`
  safely when backend permission `members:manage` is denied.
- The team page displays active and disabled memberships with their email, role, and status; null email uses the
  explicit fallback. Rows use `createdAt ASC, id ASC`; disabled rows are not presented as active and offer no
  unsupported reactivation action.
- Refresh members appears to the right of Organization members on desktop and below its description at widths of
  48rem or below. The member panel owns the separator and reserved operation feedback; refreshing retains the list
  and preserves the existing disabled and feedback focus behavior.
- An administrator cannot grant, modify, or remove an owner. A final-owner demotion or removal returns a clear
  recoverable conflict, leaves the member active, and refreshes the authoritative list.
- Removing an allowed member requires confirmation, returns only after server success, and leaves the row visible as
  disabled after refresh.
- Issuing an invitation returns one URL that can be copied from the immediate result. Closing or navigating away
  resets both local and mutation response state, making the URL unrecoverable from frontend cache or storage.
- Opening a token-bearing invitation replaces the current history entry with `/accept-invitation` before preview.
  Refresh, Back, and Forward never restore the token and render a safe missing-link state when ephemeral authority is
  gone.
- The public route previews organization name, invited email, role, and expiry only while pending. Unknown, expired,
  and consumed tokens reveal no invitation details; replayed acceptance returns only generic accepted status.
- Acceptance rejects a password shorter than 12 characters before submission, maps server validation/conflict
  failures without losing safe input, and on success offers sign-in.
- Preview, issue, and acceptance responses and the invitation document are `no-store`; token-bearing documents and
  responses are no-referrer. Raw tokens appear in no analytics event,
  API log, gateway log, toast, telemetry payload, screenshot, fixture, or committed artifact.
- After every invitation issue or acceptance settlement, the shared mutation cache contains no raw URL, token,
  preview PII, or password. A current successful issue may keep its URL only in the visible local modal until
  copy/dismissal or navigation. Acceptance settlement clears its password and token. Unmount, pagehide, and
  back/forward-cache restoration clear all page-local secret state; a restored page renders the
  missing-link/dismissed state before paint and sends no automatic request.
- A delayed preview, issue, or acceptance result from an invalidated ephemeral generation cannot repopulate page or
  mutation state after dismissal, pagehide, unmount, or back/forward-cache restoration.
- Every view has stable loading, empty, success, permission-denied, failure, and recovery behavior at desktop and
  mobile widths, with keyboard access, visible focus, semantic labels, and non-color-only status.
- `OpenAPI` and the generated client describe the implemented contract, focused and full checks pass, Bruno covers the
  public preview boundary, and a disposable live browser flow completes issue, preview, and acceptance.

## Validation

Run the focused organization-onboarding service, controller, HTTP, hierarchy, final-owner concurrency, web, and
contract checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- membership-listing invitation-preview organization-onboarding final-owner --runInBand
    corepack pnpm --filter ./apps/web test -- team invitation
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web build
    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    git diff --check

After confirming Compose ownership, execute mocked failure states and a disposable live Keycloak/PostgreSQL
issue/preview/accept flow.

Bootstrap the MFA-aware owner fixture, then run the pinned organization-onboarding collection when its dependencies
are available.

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:organization-onboarding
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/team-and-invitations.spec.ts --project=chromium
    corepack pnpm ui:audit

Run
`corepack pnpm docs:lint -- .agents/plans/frontend/13-manage-organization-team.md src/libs/modules/organization-onboarding/README.md bruno/organization-onboarding/README.md`
after prose changes, adjusting the file list to the English Markdown files actually changed. Record exact commands,
counts, skips, browser widths, and runtime limitations rather than predicting success.

Complete the frontend premium audit against `DESIGN.md`: navigation consistency, hierarchy comprehension, secret
treatment, focus return after dialogs, touch targets, responsive table/card equivalence, loading stability, empty states,
error recovery, reduced motion, and contrast. Fix findings before completing this plan; do not defer them to another
polish PR.

## Idempotence and Recovery

Invitation preview is read-only and safe to repeat only while the pending ephemeral token remains mounted. Acceptance
remains effect-idempotent after success but replays no invitation PII. Refreshing, pagehide/BFCache restoration, or
revisiting the sanitized browser route cannot repeat preview or acceptance and asks the recipient to reopen a still-
pending original link or sign in after a consumed link.
Role changes set an absolute role and member removal is already an idempotent disabled-state transition; after an
uncertain response, reload before offering another mutation. Final-owner decisions remain serialized by the backend.

Invitation issuance is not safe to retry automatically because a successful response may have been lost and the raw
token cannot be recovered. Keep one request in flight, surface an outcome-unknown state on transport failure, and do
not manufacture a second token silently. With no invitation list or revoke endpoint in scope, recovery is an explicit
operator decision; disposable development state can be reset with the repository's documented `pnpm dev:reset`
workflow. No migration, backfill, or production recovery step is introduced.

## Artifacts and Notes

Validation of the updated member header on 2026-09-07:

- `corepack pnpm --filter ./apps/web test:ci`: all 334 tests passed, including feedback focus and live-region checks.
- Web lint and build passed; the build includes TypeScript checking. Design lint and the UI audit reported no errors
  or warnings, and the diff passed whitespace validation.
- From `apps/web`, `node node_modules/@playwright/test/cli.js test tests/e2e/team-ui.spec.ts --workers=2` passed all
  ten checks. Desktop and narrow checks at widths of 1440 and 320 pixels verify header placement, separator spacing, keyboard refresh,
  retained membership data, accessible controls, and no horizontal overflow. All 16 billing browser checks passed.
- The same installed Playwright CLI ran `tests/e2e/accessibility.spec.ts tests/e2e/visual.spec.ts --workers=2`:
  all eight checks passed. The package runner was slow to start, so these runs invoked the pinned CLI directly
  against a Vite preview of the build. No browser configuration or dependency changed.
- Safe screenshots in `/tmp/refresh-members-ui/` confirm the approved desktop and mobile composition.
- `corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md .agents/plans/frontend/13-manage-organization-team.md`
  passed all three Markdown files. Bruno is not applicable to this layout-only follow-up; HTTP behavior is unchanged.

Final validation on 2026-09-07:

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci`: 219 Jest suites and 2,461 tests passed;
  13 suites and 80 environment-gated tests skipped. All 55 runner tests passed with no skips.
- `TEST_POSTGRES_URL` selected a private, dedicated `lef_issue508_test` database for
  `membership-mutation-concurrency.integration.spec.ts` and `identity-schema.integration.spec.ts`: two suites and
  three tests passed. Both removal and demotion races preserved one active owner. The test database was removed.
- `corepack pnpm --filter ./apps/web test:ci`: all 334 tests passed. The focused invitation suite passed all
  33 tests, including the encoded route prefix regression.
- Web `typecheck`, `lint`, and `build`, root `typecheck`, `lint`, and `build`, `openapi:export`,
  `openapi:generate`, and `openapi:check` passed. The architecture gate passed with its 20 existing baseline entries.
- `corepack pnpm --filter ./apps/web test:e2e`: 70 tests passed across desktop 1440 by 900 and narrow 320 by 720.
  `test:a11y` and `test:visual` each passed four tests. The focused team suite passed all ten browser tests.
- `corepack pnpm --filter ./apps/web test:invitations`: 16 browser tests passed, including actual cached-page
  restoration, full-page Back/Forward navigation, and issued-dialog cleanup at both supported widths.
- `COMPOSE_PROJECT_NAME=lef-issue508 corepack pnpm --filter ./apps/web test:team-live`: one complete live flow passed,
  including MFA-aware owner sign-in and recipient acceptance at 390 by 844. No invitation artifacts were recorded.
- `COMPOSE_PROJECT_NAME=lef-issue508 corepack pnpm bruno:organization-onboarding`: Bruno 4.1.0 ran 12 requests and
  12 assertions successfully, with no skips. `node --test scripts/bruno/*.test.mjs` passed all 16 runner tests.
- `corepack pnpm --filter ./apps/web test:invitation-artifacts`: eight subprocess cases passed; only the safe
  last-run metadata file existed. Existing `test:privileged-artifacts` passed all five cases.
- `WEB_GATEWAY_IMAGE=lef-issue508-web:latest node --test scripts/frontend/gateway.test.mjs`: all four tests passed.
  API logging tests passed all 73 cases; live API and gateway log checks found neither runtime secret marker.
- `corepack pnpm design:lint` reported zero errors or warnings; `corepack pnpm ui:audit` reported zero findings.
  `corepack pnpm docs:lint -- $(git diff --name-only origin/master -- '*.md')` passed all seven changed Markdown
  files. `git diff --check` passed.

Browser plugin tools were unavailable, so validation used the repository's installed Playwright runtime. Local
commands supplied its cache path and system-library path. The isolated Compose project used web port 53208,
Keycloak port 58208, and PostgreSQL port 55408. Other checkouts' resources were not modified. Safe screenshots under
`/tmp/lef-team-ui/` contain only synthetic membership data; invitation test segments never capture screenshots.

Record only redacted organization and membership IDs, HTTP statuses, test counts, browser widths, and pass/fail
evidence. Never record invitation URLs, raw tokens, passwords, cookies, or screenshots containing them.

The member contract, invitation preview/acceptance boundary, secret lifecycle, response-generation fence, state
matrix, validation, recovery, and single-vertical-pull-request scope are decision-complete. There is no hidden
product choice, and the plan can be validated independently once its listed dependencies are complete.

## Plan readiness

Ready to implement.
