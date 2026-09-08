# Manage Organization Service Clients Without Losing Secrets

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An organization owner or administrator can use a responsive browser page to list service clients, choose only the
permissions the server says that account may grant, create a client, rotate its secret, disable it, and delete it.
Create and rotate reveal a secret exactly once in an accessible modal with explicit copy and download actions. The
page never persists or logs that secret and never retries an outcome-uncertain create or rotate automatically. The
complete result is observable through the documented API, generated client, Bruno boundary checks, and a disposable
live browser life-cycle test.

## Progress

- [x] (2026-09-08) Publish service-client browser contracts and server-provided permission choices in `OpenAPI`.
- [x] (2026-09-08) Implement responsive list, create, rotate, disable, and delete flows with one-time secret handling.
- [x] (2026-09-08) Cover permissions, confirmations, uncertain outcomes, loading, empty, error, and recovery states.
- [x] (2026-09-08) Update the generated client, Bruno, module documentation, and design context.
- [x] (2026-09-08) Run focused, live-browser, security, architecture, prose, and full validation and record evidence.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `auth/08`
- `module-architecture/07`
- `service-client-hardening/01`

## Surprises & Discoveries

- (2026-09-08) All five prerequisite plans are complete in this checkout. Issue #509 is assigned to the
  implementing user and its Project 9 status is In Progress.
- (2026-09-08) The existing `lef` Compose stack belongs to another checkout. Validation uses a separate `lef509`
  project with alternate ports, preserving the existing stack and its data.
- (2026-09-08) Team invitation issuance already bypasses TanStack mutations for one-time values. Service-client
  operations follow that established pattern; sensitive responses never enter the shared MutationCache.

- `module-architecture/07` moved service-client HTTP, application, domain, Keycloak, and persistence concerns into
  final layers while preserving routes and secret behavior. This implementation extends those framework-free
  application services and the existing API boundary.

## Decision Log

- Decision: Use direct generated-client requests with local generation and abort control for create and rotate.
  Rationale: Following the completed team feature keeps response data entirely outside MutationCache, avoiding
  retention before `reset()` or garbage collection. The cache assertion remains required. This supersedes the
  earlier mutation-cache implementation mechanism while preserving its no-retention requirement.
  Date/Author: 2026-09-08, implementation.
- Decision: Reuse the shared dialog, form, action, and panel owners and page ten server-ordered rows locally.
  Rationale: The endpoint returns a complete list; URL page state and clamping match the team page without
  inventing server pagination or changing ordering.
  Date/Author: 2026-09-08, implementation.

- Decision: Obtain the service-client permissions the account may grant from authenticated server context and make
  account presentation and create enforcement consume one auth-owned grant policy.
  Rationale: A browser-maintained copy would drift. One small shared server policy keeps the choices and authoritative
  validation aligned without making `bff-session` and `service-client-management` depend on each other.
  Date/Author: 2026-08-31, planning.
- Decision: Keep the one-time secret only in local component memory until its modal closes; list/query caches receive
  only the secret-free service-client representation.
  Rationale: Create and rotate responses are the sole opportunity to retrieve the value. Browser storage, global
  state, logs, telemetry, and cached mutation data would unnecessarily extend the secret's lifetime.
  Date/Author: 2026-08-31, planning.
- Decision: Keep create and rotate responses outside TanStack MutationCache entirely.
  Rationale: Direct generated-client requests follow the completed team flow and remove the need for mutation
  retention settings or `reset()`. Local generation and abort control fence every settlement.
  Date/Author: 2026-09-08, implementation; supersedes the 2026-08-31 cache-reset proposal.
- Decision: Offer explicit copy and user-initiated download actions, but never include the secret in a toast,
  filename, URL, analytics event, screenshot, or validation artifact.
  Rationale: Operators need a practical handoff path. Clipboard and a downloaded file are deliberate user-controlled
  exports; the application must not create another persistent copy silently.
  Date/Author: 2026-08-31, planning.
- Decision: Disable automatic retries for create and rotate, including retries inherited from a shared mutation
  client, and represent a lost response as `outcome unknown`.
  Rationale: Retrying create may provision a second client, while retrying rotate may invalidate a secret that the
  user just received or never saw. Refresh and explicit reconciliation are safer than guessing.
  Date/Author: 2026-08-31, planning.
- Decision: Require explicit confirmation before rotate, disable, and delete, with consequences named in the dialog.
  Rationale: Rotation invalidates the current secret, disable has no re-enable endpoint, and delete removes the
  provider client. These operations must not look like harmless row actions.
  Date/Author: 2026-08-31, planning.
- Decision: Apply the durable frontend design context and complete the premium UX audit as part of this feature.
  Rationale: Secret comprehension, focus containment/return, responsive layouts, accessibility, and recovery are
  feature correctness and will not be deferred to a final polish plan.
  Date/Author: 2026-08-31, planning.

## Outcomes & Retrospective

The API and responsive page implement create, list, rotation, disablement, and deletion with server-provided
permissions. One-time secrets stay outside shared caches and React state, are initially masked, and are cleared
at dismissal and document/session boundaries. Review identified an uncertainty-state reset through pagination
and a live-fixture cleanup timing race; both are covered by the final corrections and validation below.

The live owner lifecycle passes against isolated Keycloak, PostgreSQL, and the same-origin gateway after real MFA
login. Export tests intercept the operating-system clipboard and file write while checking the actual application
payload, object URL creation, and revocation in memory. They do not prove an operating-system download or clipboard
permission prompt. No production or non-Chromium browser validation is claimed. Independent review found no remaining material architecture or secret-disclosure issue after the corrections.

## Context and Orientation

`frontend/08` establishes the authenticated shell, account-context query, server-provided effective capabilities,
same-origin CSRF-aware API client, generated-contract workflow, form conventions, request states, and `DESIGN.md`.
This plan adds the authenticated `/app/service-clients` feature only when account context grants the browser
capability `service_clients.manage`.

The `service-client-management` business module owns create, list, rotate, disable, and delete behavior under
`/v1/organizations/:organizationId/service-clients`. Every route requires `credentials:manage`, and every
application service also requires a `human_session`, so an M2M token cannot administer clients even if it carries
that permission. Prerequisite `module-architecture/07` moves the controller into the module's `api/` layer and keeps
it excluded from Swagger until this plan publishes the browser contract.

Create and rotate return `ServiceClientSecretResponseDto`, including `clientSecret`; list returns
`ServiceClientResponseDto` and deliberately never contains that field. `frontend/03` fixes the account-context grant
list for administrators at `verification:run`, `verification:read`, `members:manage`, and `credentials:manage`;
owners additionally receive `billing:read` and `billing:manage`, while members and platform administrators receive
an empty list. Current-account assembly and service-client creation already consume the same auth-owned policy after
that prerequisite. Lists include disabled clients and order by `createdAt DESC, id DESC`, making equal-timestamp rows deterministic.
Disabled clients cannot be rotated. Disable is local and immediately revokes request authentication; delete treats an
already-missing provider client as success. `service-client-hardening/01` preserves provider compensation and tenant
nondisclosure for partial failures.

Before implementation changes this business module, read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and `src/libs/modules/service-client-management/README.md`, and update the module README
with the final browser-facing contract.

## Scope and Non-Goals

Expose accurate Swagger schemas and responses for service-client list/create/rotate/disable/delete, consume the
existing server-derived grant choices, and make list ordering deterministic. Regenerate the browser client and
implement the complete organization-scoped management page.

Render active and disabled states truthfully. Provide accessible forms and confirmations, a one-time secret modal,
copy actions, download actions, safe loading and empty states, permission denial, validation/server failures, and explicit
outcome-unknown recovery. Support keyboard and screen-reader use, stable focus, non-color-only status, narrow mobile
cards or rows equivalent to the desktop table, reduced motion, and layout stability.

Do not reveal an existing secret, persist a new secret, mint an OAuth token in the browser, add re-enable behavior,
change provider/local compensation, redesign audit records, add bulk actions, or create a generic credentials vault.
Do not add a standalone component-library or final-polish plan. No schema change or database migration is needed.

## Plan of Work

Consume the `grantableServiceClientPermissions` field and auth-owned grant policy delivered by `frontend/03`; do not
recreate or rewire that policy in this pull request. Add a focused regression proving the displayed ordered choices
match the authoritative creation rule and a forged broader value is rejected. Preserve DTO `@ArrayUnique` validation
and add the corresponding framework-free duplicate-permission check to the application service beside the existing
unsupported/excess-permission rule. Test both direct service calls and the HTTP boundary.

Change service-client listing to order by `createdAt DESC, id DESC` and add an equal-timestamp test. Keep active and
disabled rows and every tenant filter unchanged. Use the same returned order in generated-client and browser tests;
do not sort independently in JavaScript.

Make the service-client controller and DTOs visible and complete in runtime OpenAPI and add only its consumed
route-method entries to the browser allow list. Document organization/client UUID parameters, the permission enum,
status values, one-time create/rotate responses, secret-free list responses,
validation, credential-kind restrictions, cross-organization nondisclosure, and success/error status codes. Consume
the existing `grantableServiceClientPermissions` account field rather than adding a frontend role table. Keep backend
validation authoritative even when the browser sends a stale selection. Update through `openapi:export` and
`openapi:generate`, run `openapi:check`, and prove `clientSecret` is absent from list types.

Attach `Cache-Control: no-store` to successful and error responses for create and rotate because those request/response
bodies contain one-time credentials or sensitive intent. Add controller/HTTP assertions that intermediaries cannot
cache either operation; list remains governed by its normal authenticated read policy.

Build the service-client page from actual design primitives already introduced by completed frontend plans. Fetch the
organization ID and permissions it may grant from account context, then list the organization's clients. The create form
accepts an optional description and at least one unique permission selected only from the server list. Disabled rows
remain visible, clearly labeled, and cannot offer rotate. Empty, loading, stale-refresh, permission-denied, and server
failure states must keep actions and status understandable on desktop and mobile.

Treat successful create/rotate response data specially. Extract the secret before invalidating the list, and do not
put it in query data, React state, or persistent global state. Send direct generated-client requests with no
automatic retry, and keep the value only in a feature-local reference and the uncontrolled dialog input. Add a MutationCache assertion that no response data containing
`clientSecret` remains. Render it only inside a focus-trapped one-time modal and clear the local reference when the
modal unmounts. Copy through the Clipboard API only after an explicit action. Download through a
short-lived object URL created only on request, use a secret-free filename, revoke the URL immediately, and explain
that the resulting user-owned file contains sensitive credentials. A success toast may say `Copied` or `Downloaded`
but must never include the value.

On `pagehide`, synchronously close the one-time modal, clear secret/local form references, abort create/rotate
requests, revoke object URLs, and clear any application-owned clipboard buffer. On `pageshow` with
`event.persisted === true`, render the normal secret-free list before paint and never restore the modal from the
back/forward cache. Add full-page Back/Forward and forced-navigation tests; React unmount alone is insufficient.

Give create/rotate an ephemeral-operation generation and abort controller. Every settlement callback captures the
generation; modal dismissal, unmount, pagehide, and back/forward-cache restoration advance it and abort outstanding
work. Ignore late success and failure from an older generation so they cannot reopen a modal or repopulate local or
MutationCache state. Test delayed create and rotate responses across pagehide/pageshow and dismissal.

Send create and rotate once per explicit action, outside shared mutation retry configuration. Confirm rotate with text explaining that the current secret stops
working; confirm disable with text explaining that no re-enable route exists; confirm delete using the displayed
client ID and explain that deletion removes the provider client. Do not optimistically remove or change rows. On a
transport failure after dispatch, show `Outcome unknown`, clear any absent secret result, refresh the list, and give
the explicit recovery choices without issuing another request. Definite validation and authorization errors may be
corrected and resubmitted by the user.

Add API/controller/schema tests, generated-client assertions, component/accessibility tests for all states, and
browser tests for the lifecycle and uncertain-mutation guardrails. Extend and run
`bruno/service-client-management` only for unauthenticated and M2M wrong-credential-kind rejection boundaries.
Cover wrong-organization, duplicate/unsupported permission, disabled rotation, secret-free list, and the full
positive lifecycle in focused HTTP integration and disposable live-browser tests because Bruno cannot mint a genuine
human session. Complete the
premium design audit against `DESIGN.md` and fix its findings within this pull request. Disable trace, screenshots,
video, DOM/network attachments, and response dumps for the entire secret-bearing browser and Bruno segment,
including failure paths. Assert synthetic client-secret markers are absent from output directories and CLI logs;
do not rely on post-run redaction.
Register `corepack pnpm bruno:service-client-rejections` with the pinned launcher from Plan 02. It loads the ignored service
credential internally, uses the developer sandbox, requires nonzero execution, and deliberately runs only M2M
wrong-credential-kind and other rejection boundaries; Playwright owns the human-session success lifecycle.

## Interfaces and Dependencies

The account-context response established by `frontend/03` exposes a server-calculated field equivalent to:

    {
      "grantableServiceClientPermissions": [
        "verification:run",
        "verification:read",
        "members:manage",
        "credentials:manage",
        "billing:read",
        "billing:manage"
      ]
    }

The exact array varies by the signed-in account. It is presentation input, not an authorization grant; create still
validates every submitted value through the same server grant policy.

Existing service-client endpoints retain their paths and semantics. Create accepts optional `description` and a
not-empty, unique `permissions` array and returns client metadata plus `clientSecret`. Rotate returns the same one-time
shape. List returns metadata/status only. Disable and delete return `204`. Cross-organization item lookup remains
`404`; collection-level organization mismatch remains `403`.

The auth-owned grant-policy interface/token already comes from `frontend/03`; this plan only consumes it. No new
external service or persistence schema is introduced. The web feature depends on the account context, generated
client, request/mutation layer, CSRF handling, dialogs, forms, and design tokens delivered by `frontend/08`.

## Acceptance Criteria

- Only a human session with browser capability `service_clients.manage` can navigate to
  `/app/service-clients`; backend operations continue to require `credentials:manage`. Direct unauthorized,
  service-client-token, and cross-organization API requests retain their documented rejection behavior.
- The permission selector contains exactly the server-provided set the account may grant and never a role-derived hard-coded
  list. A stale or forged disallowed permission is still rejected by the server, even when it is part of the actor's
  broader effective authorization set.
- The page renders active and disabled rows ordered by `createdAt DESC, id DESC`, including equal-timestamp fixtures,
  with accurate description, client ID, permissions, status, and timestamps. No list response, cache entry, or
  rendered row contains `clientSecret`.
- Create and rotate reveal a returned secret exactly once in an accessible modal. Copy and explicit download work,
  and closing the modal removes the secret from application memory to the practical extent JavaScript permits.
- Create and rotate never create shared mutation entries; MutationCache tests prove that no `clientSecret`
  response remains while the dialog is visible or after its closure.
- No secret appears in browser persistence, URLs, analytics, logs, telemetry, toast text, filenames, screenshots,
  fixtures, snapshots, or recorded validation artifacts.
- Create/rotate responses are `no-store`. The `pagehide` event and back/forward-cache restoration remove modal, local,
  MutationCache, object-URL, and application clipboard references before any restored page is visible.
- Delayed create/rotate success or failure from an invalidated ephemeral generation cannot reopen the modal or
  restore secret/local/mutation data after dismissal, pagehide, unmount, or back/forward-cache restoration.
- Create and rotate have automatic retries disabled. A lost response produces an outcome-unknown state and an
  authoritative refresh without silently creating or rotating again.
- Rotate, disable, and delete require consequence-specific confirmation. A disabled client cannot be rotated; delete
  and disable update the list only after server success.
- Loading, empty, permission-denied, validation, conflict, provider failure, outcome-unknown, success, and recovery
  states are stable and accessible at desktop and mobile widths.
- `OpenAPI` and the generated client are current; focused and full API/web checks pass; Bruno validates the available
  HTTP boundaries; and a disposable live browser test completes create, list, copy/download, rotate, disable, and
  delete without retaining a secret.

## Validation

Run focused service-client service/controller/HTTP, generated-client, web, accessibility, and repository checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- service-client-management service-client.controller service-client-hardening --runInBand
    corepack pnpm --filter ./apps/web exec vitest run src/features/service-clients/service-clients.test.tsx --maxWorkers=2
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

After confirming Compose ownership, run Playwright with deterministic mocked failures for validation, permission,
disabled-state, and outcome-unknown cases, then run the full positive lifecycle as a seeded human owner or
administrator.

Bootstrap the MFA-aware owner fixture on a checkout-owned stack, then run the pinned service-client rejection collection. Its positive
lifecycle remains browser-verified because Bruno cannot mint a human session.

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:service-client-rejections
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/service-clients.spec.ts --project=chromium
    corepack pnpm ui:audit

Run
`corepack pnpm docs:lint -- .agents/plans/frontend/14-manage-service-clients.md src/libs/modules/service-client-management/README.md bruno/service-client-management/README.md`
with the final changed Markdown list. Record exact results and skips without placing any credential in output.

Complete the frontend premium audit against `DESIGN.md`: hierarchy and labels, secret-modal comprehension, focus
trap/return, Clipboard failure recovery, download failure recovery, touch targets, responsive information equivalence, status
contrast, reduced motion, loading stability, and destructive-confirmation clarity. Resolve findings here rather than
creating a later polish plan.

## Idempotence and Recovery

List is read-only. Disable and delete converge on their terminal local/provider states, but the UI still reloads
before offering recovery after an uncertain response. Create is intentionally not retried: if refresh shows a newly
created client whose secret was lost, the user may explicitly delete it and create another. Rotate is intentionally
not retried: an uncertain response may have invalidated the old secret, so the user must explicitly choose a new
rotation after reviewing the refreshed client.

Closing the secret modal cannot recover the value. Copy/download failures leave the modal open for another explicit
attempt. No database reset is needed for normal recovery. Disposable development state can use `pnpm dev:reset` only
when the whole local environment is intentionally being recreated; no migration or backfill is added.

## Artifacts and Notes

Validation on 2026-09-08:

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci -- --cacheDirectory=/tmp/lef509-jest-cache` passed:
  228 Jest suites and 2,559 tests, with 14 existing optional suites and 82 tests skipped; all 72 runner tests passed.
  The extra cache argument was forwarded to the final runner command, so Jest used its normal temporary cache.
- `corepack pnpm --filter ./apps/web test:ci --maxWorkers=2` passed all 23 files and 427 tests. Unrestricted
  concurrent runs had existing timeout failures during container and browser work; the bounded final run passed.
- The focused service-client suite passed 29 tests, including late success/failure, clipboard completion after
  closure, cache exclusion, field scrubbing, local permission rejection, and pagination preserving uncertainty.
- The dedicated service-client browser suite passed 24 tests across 1440 by 900 and 320 by 720 viewports.
  Four delayed-settlement cases also passed after adding an explicit route-settlement barrier.
- Both dedicated configurations passed all eight artifact-suppression checks. The browser fixture guard passed
  four tests. The pinned service-client Bruno launcher passed its two tests.
- A real MFA-authenticated owner completed the disposable lifecycle at `http://localhost:53009`. Its secret
  exports were checked through an in-memory sink; no credential-bearing file or operating-system clipboard was saved.
- `COMPOSE_PROJECT_NAME=lef509 corepack pnpm bruno:service-client-rejections` passed six requests and six tests.
  `COMPOSE_PROJECT_NAME=lef509 corepack pnpm bruno:bff-sessions` passed 15 requests and 16 tests, including the
  expanded browser contract. Neither collection skipped requests.
- The broad browser regression completed 91 of 92 cases on its first run. A concurrent asset rebuild removed CSS
  during the remaining verification-page check; its screenshot confirmed an unstyled page. The final focused
  rerun passed with frozen assets. The separate accessibility and visual-baseline suites passed all eight tests.
- A separate metadata-only browser inspection at 1440 by 900 and 390 by 844 verified page identity, no horizontal
  overflow, no framework overlay or console errors, and the final permission layout. Screenshots contain only
  synthetic secret-free list data and are outside the repository.
- Backend and web typecheck, lint, and builds passed. Root lint retains one unrelated warning in
  `src/libs/config/src/load-secrets.spec.ts`. `openapi:export`, `openapi:generate`, and `openapi:check` passed.
  The OpenAPI regression suite passed 14 tests; focused backend and ordering checks passed 123 tests.
- `corepack pnpm architecture:check` passed nine modules with no baselined violations. `corepack pnpm design:lint`
  passed without warnings; `corepack pnpm ui:audit` passed without findings; `git diff --check` passed.
- Harper command: `corepack pnpm docs:lint -- .agents/plans/frontend/14-manage-service-clients.md DESIGN.md UX-CONTRACT.md src/libs/modules/service-client-management/README.md src/libs/modules/identity/README.md bruno/service-client-management/README.md` passed all six files.

The isolated validation stack uses Compose project `lef509`, public web port 53009, Keycloak port 58089,
PostgreSQL port 55439, Redis port 56389, and Garage port 59009. The API uses `pnpm exec nest start` without watch
mode. Its ignored browser-fixture metadata belongs to this checkout. No shared stack reset or migration was needed.
The API keeps persistence and provider ports separate; the browser uses direct ephemeral requests only for
operations whose response lifetime must stay outside shared mutation state. No material SOLID violation was found.


Record client IDs only when synthetic or redacted, plus status codes, test counts, browser widths, and pass/fail
evidence. Never record a client secret, session cookie, access token, clipboard payload, or secret-bearing download.

The grantable-permission boundary, list ordering, one-time create/rotate secret lifecycle, destructive actions,
late-response fence, state matrix, validation, recovery, and one-pull-request scope are decision-complete. There is
no hidden product choice, and the plan can be validated independently once its listed dependencies are complete.

## Plan readiness

Ready to implement.
