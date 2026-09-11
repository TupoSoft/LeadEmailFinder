# Operate the Proxy Fleet from a Truthful Platform Console

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A signed-in platform operator can use a post-MVP responsive console to page through the proxy registry and create a
disabled-by-default proxy. The operator can edit visible fields without overwriting hidden authentication, move the
proxy deliberately through lifecycle states, report an MX blacklist, and delete it after confirmation. The page
follows the API's cursor instead of inventing totals, never receives stored proxy credentials, and exposes loading,
empty, failure, uncertain, and recovery states honestly. The complete behavior is observable through the `OpenAPI`
contract and generated client, focused tests, Bruno, and a disposable live browser lifecycle.

## Progress

- [x] (2026-09-09) Complete the credential-safe proxy registry and blacklist browser contract.
- [x] (2026-09-09) Implement paginated list, create, edit, lifecycle, blacklist, and delete workflows.
- [x] (2026-09-09) Cover cursor truth, hidden authentication, confirmations, permission, error, and recovery behavior.
- [x] (2026-09-09) Update generated client, Bruno, module documentation, and the durable design context.
- [x] (2026-09-09) Finish live browser, premium design, architecture, prose, and full validation and record it.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `proxy-fleet/10`

## Surprises & Discoveries

- The existing generated client marks request fields with schema defaults as required TypeScript properties even
  though the wire schema makes them optional. Creation supplies explicit defaults; ordinary edits omit lifecycle.
- The backend previously accepted null or array authentication through nested optional validation. Authentication
  now accepts omission or one complete object; null and arrays are rejected without enabling credential removal.
- The default running development stack belongs to another worktree. Validation uses the new isolated Compose
  project `lef5139e84` and alternate ports; the shared `lef` stack is untouched.
- A confirmation can mount before its detail read settles. The dialog remounts at the ready boundary so its safe
  initial-focus target exists; pending detail reads retain an explicit Cancel action.

## Decision Log

- Decision: Keep proxy writes outside the shared mutation cache, following the existing organization and
  service-client secret workflows, instead of allocating and resetting credential-bearing mutation entries.
  Rationale: Exclusion provides zero cache retention both during and after dispatch. Direct generated requests retain
  the authenticated transport, abort controller, and operation-generation fence. Local native inputs and request
  references are cleared on every settlement and lifecycle boundary.
  Date/Author: 2026-09-09, implementation.
- Decision: Keep cursor state transient and retain only a membership-scoped reconciliation boolean across route
  navigation and cached-page restoration. Do not persist submitted fields or authentication.
  Rationale: Continuations are not shareable resource locations. An unknown write requires a successful directory read
  and explicit acknowledgment before another action. Ordinary reload persistence is outside this plan's contract.
  Date/Author: 2026-09-09, implementation.
- Decision: Reuse the shared panel's reserved loading region and readable pending indicator without adding a
  separate skeleton component.
  Rationale: This preserves the approved panel behavior and keeps the header actions stable. The acceptance
  requirement is accessible, stable loading; duplicating a loading owner adds no useful registry information.
  Date/Author: 2026-09-09, implementation.

- Decision: Keep proxy operations in a platform-only post-MVP route and retain backend `platform:admin`
  authorization on every operation.
  Rationale: The registry is global SMTP infrastructure rather than an organization-owned customer resource.
  Permission-aware navigation cannot replace the server boundary.
  Date/Author: 2026-08-31, planning.
- Decision: Consume `nextPageToken` exactly as returned, use a `Load more` interaction, and display no row total,
  numeric page, or inferred last-page count.
  Rationale: The current API offers cursor-based pagination and an empty-string terminal cursor, not a stable count. The UI
  must state only what that contract proves.
  Date/Author: 2026-08-31, planning.
- Decision: Preserve disabled as both the backend and form default for newly created proxies.
  Rationale: A newly entered endpoint must be reviewed before the allocator can use it. The UI must not silently opt
  infrastructure into traffic.
  Date/Author: 2026-08-31, planning.
- Decision: Never populate authentication on edit. Blank authentication controls mean `leave unchanged`; replacement
  requires an explicit mode and a complete user/password pair that is omitted from all responses.
  Rationale: The API deliberately redacts stored credentials. Empty form controls must not be serialized as a new
  empty credential or imply that no stored credential exists.
  Date/Author: 2026-08-31, planning.
- Decision: Give every credential-bearing create/update mutation zero post-settlement retention and reset it on
  settlement, unmount, pagehide, and back/forward-cache restoration.
  Rationale: TanStack MutationCache retains request variables independently of form state; clearing input controls
  alone would leave proxy user/password values in the shared client.
  Date/Author: 2026-08-31, planning.
- Decision: Keep proxy authentication controls out of the document until the operator explicitly enables them and
  mark them as non-login credentials with conservative autocomplete hints.
  Rationale: Password managers and browser form restoration can mistake an infrastructure credential pair for an
  account login. Hidden or merely blank controls are not a sufficient secret-lifetime boundary.
  Date/Author: 2026-08-31, planning.
- Decision: Add the nonsecret blacklist array to the platform response so a successful report is visible after
  refresh, but do not add blacklist removal.
  Rationale: The domain record already owns this state while the response mapper drops it. Showing the actual set is
  necessary for truthful management; inventing removal would be a separate backend behavior.
  Date/Author: 2026-08-31, planning.
- Decision: Require consequence-specific confirmation for lifecycle transitions, authentication replacement, and
  deletion, and never update a row optimistically.
  Rationale: Activation can send production-like traffic, draining/disable affect allocation, credential replacement
  can break connectivity, and deletion removes the registry record. The server result must be authoritative.
  Date/Author: 2026-08-31, planning.
- Decision: Apply the shared design context and complete the premium UX audit in this pull request.
  Rationale: Operational comprehension, responsive density, accessibility, and recovery are part of the feature; no
  final polish plan will repair them later.
  Date/Author: 2026-08-31, planning.

## Outcomes & Retrospective

Implemented the platform-only console, generated browser contract, API response protections, and repeatable Bruno
workflow. Component, API, contract, architecture, design, prose, and browser checks pass. The isolated live lifecycle
and HTTP collections pass. The original purpose is met without new entities, migrations, providers, visual tokens,
or domain-service changes. Direct ephemeral writes keep credentials outside the mutation cache; the existing
application-service and adapter boundaries remain intact. The implementation is published in PR #590. The dated
validation record below distinguishes local checks from live-stack and remote CI results.

## Context and Orientation

`frontend/08` provides the authenticated shell, server account context, `platform.proxies.manage` browser capability, same-origin
CSRF-aware API client, generated-contract workflow, shared forms/dialogs/request states, and `DESIGN.md`. This plan
adds `/app/platform/proxies` outside the customer-facing MVP and may begin when its listed prerequisites are complete.

The `proxy` business module owns global registry CRUD, blacklist reporting, healthy selection, and leased allocation.
`ProxyController` in `src/libs/modules/proxy/src/api/proxy.controller.ts` protects every
`/v1/proxies` route with `platform:admin`. It supports create, paginated list, read, partial update, delete, healthy
selection, and `POST /v1/proxies/:id/blacklists`. The list accepts bounded `pageSize` and UUID `pageToken`, orders by
ID, fetches one extra row, and returns `nextPageToken` as the last visible ID or `""` when complete.

The domain record contains protocol, host, port, optional authentication, lifecycle state, weight, concurrency/rate
limits, description, blacklists, and timestamps. `toProxyDto()` deliberately excludes authentication, and no endpoint
may return it. The mapper currently also omits blacklists, although reporting deduplicates an MX host in persistence.
Create defaults lifecycle to `disabled`; supported states are `active`, `draining`, and `disabled`. `proxy-fleet/10`
documents that draining excludes new allocation and that operators must use lease/connection evidence before assuming
in-flight work is gone.

Before modifying the business module, read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and
`src/libs/modules/proxy/README.md`. Preserve the module's ports/adapters and run the architecture gate.

## Scope and Non-Goals

Complete the browser-consumed proxy OpenAPI responses without exposing authentication, including current blacklists
and pagination. Regenerate the browser client for create, list, get, update, delete, and blacklist reporting; keep
`GET /v1/proxies/healthy` outside the browser snapshot. Build one platform page containing a cursor-driven registry,
create and edit forms, lifecycle controls, MX blacklist reporting, and delete. Make disabled the visible create
default and make credential replacement explicit.

Provide equivalent information on desktop and narrow mobile views. Include accessible table/card semantics, keyboard
control, visible focus, non-color-only lifecycle labels, field descriptions and units, stable loading skeletons, and
empty/final-page states. Cover validation, permission, not-found, server, uncertain, and recovery states.
Update Bruno and documentation and perform the premium design audit in this plan.

Do not expose or recover stored proxy credentials, add credential removal, add blacklist removal, invent numeric
pagination or totals, add lease administration, health dashboards, metrics, automatic lifecycle transitions, bulk
operations, organization ownership, a new schema/migration, or production rollout. Do not merge this with SMTP
verification UI and do not defer quality to a generic polish plan.

## Plan of Work

Complete Swagger annotations for the browser-consumed proxy request and response fields, enum labels, pagination,
errors, and security. Keep `GET /v1/proxies/healthy` excluded from the browser snapshot/client because this UI does
not consume allocator selection. Include that endpoint in backend response-redaction regression tests anyway.
Add `blacklists: string[]` to `ProxyDto` and `toProxyDto()`, defaulting to an empty array, while retaining the explicit
exclusion of `auth`. Add contract tests proving create/get/list/update/delete responses and generated response types
cannot contain `auth`, `user`, or `pass`, and that blacklist state is returned. Add only the consumed management
route-method entries to the browser allow list; update with `openapi:export` and `openapi:generate`, then run
`openapi:check`. Attach `Cache-Control: no-store` to successful and error create/update responses and assert it at the
HTTP boundary.

Build the registry route with an initial page and append-only `Load more`. Pass the returned cursor unchanged,
deduplicate by proxy ID, disable duplicate loads, show the control only when a cursor is available, and reload after
mutations that change membership or order. Never infer a total from page length. Represent malformed cursor, empty
first page, empty terminal cursor, stale/deleted detail, and retryable fetch failures explicitly.

Build create around generated enums and backend limits. Default state to `disabled` even when the field is omitted.
Do not mount authentication inputs until the operator explicitly enables `Use authentication`; then require both
fields. Build edit from response-visible fields only. Do not mount authentication inputs until the operator enables
`Replace authentication`; when disabled, omit `auth` from the PATCH body. When enabled, require both fields and
explain that the old values cannot be shown. Use `autocomplete="off"` on these non-login forms and fields and
`autocomplete="new-password"` on proxy password inputs while acknowledging that hints are not a security boundary.
Use proxy-specific field names and never reuse the sign-in form's names.

Do not store entered authentication in query cache, persistent state, logs, analytics, telemetry, toast text,
snapshots, or artifacts. Configure credential-bearing create/update mutations with no automatic retry and zero
post-settlement retention; call `reset()` after every settlement and on unmount, then clear local form values. Before
the document can enter the back/forward cache, handle `pagehide` synchronously by disabling both authentication
modes, unmounting the controls, clearing values and mutation variables, and removing any application-owned copy
buffer. On `pageshow` with `persisted === true`, render both modes disabled before paint and submit no request. Assert
the shared MutationCache contains no `user` or `pass` variables afterward.

Give credential-bearing create/update an ephemeral-operation generation and abort controller. Every settlement
callback captures it; credential-mode dismissal, unmount, pagehide, and back/forward-cache restoration advance it
and abort in-flight work. Ignore late success and failure from older generations so they cannot repopulate input,
mode, or MutationCache state. Test delayed responses across pagehide/pageshow and mode dismissal.

Use explicit confirmation for every lifecycle transition, naming source/target and allocation consequence without
claiming that active leases have ended. Require confirmation before replacing authentication and before deleting a
specific `host:port`. Do not apply optimistic state. On success, reload the affected row/list. On an uncertain create,
do not retry automatically; refresh and reconcile. On an uncertain credential replacement, state that the outcome
cannot be inferred from a redacted response and require an explicit operator decision before another replacement.

Add an MX-host form on the selected proxy. Submit the existing blacklist-report route, then reload and show the
server's deduplicated blacklist array. Treat a repeated identical report as convergent, but do not offer removal. Keep
`GET /v1/proxies/healthy` outside this UI and generated browser surface; blacklist reporting and lifecycle state are
management operations, not a promise that an endpoint is currently eligible.

Add API/mapper/schema tests, generated-client drift and redaction tests, web component/accessibility tests, and
Playwright scenarios for all states. Prove authentication fields are absent before explicit enablement, autocomplete
contracts are present, pagehide clears them, and back/forward-cache restoration cannot repopulate or submit browser-
restored values. Extend `bruno/proxy-registry` to assert disabled-by-default create, cursor
behavior, credential redaction across every response, blank-auth update omission where feasible, lifecycle,
blacklist visibility/deduplication, and cleanup. Run the positive browser lifecycle only against a disposable stack
with a uniquely labeled fixture and delete exactly that fixture afterward. Disable Playwright trace, screenshot, and
video capture plus DOM/network attachments and response dumps for the entire credential-entry browser and Bruno
segment, including failure paths. Assert synthetic user/password markers are absent from output directories and CLI
logs; do not rely on post-run redaction. Complete and fix the premium audit within this pull request.
Register `corepack pnpm bruno:proxy-registry` with the pinned launcher from Plan 02. It loads the ignored platform service
credential internally, selects the host or Compose-internal issuer/base URL explicitly, uses the developer sandbox,
requires nonzero execution, and suppresses credential-bearing request/response dumps.

## Interfaces and Dependencies

Existing proxy endpoint paths remain unchanged. `ProxyDto` gains a nonsecret `blacklists` array and continues to
exclude `auth` unconditionally. List remains equivalent to:

    {
      "proxies": [
        {
          "id": "uuid",
          "protocol": 3,
          "host": "proxy.example.test",
          "port": 1080,
          "state": "disabled",
          "weight": 1,
          "maxConcurrent": 1,
          "requestsPerMinute": 10,
          "description": "fixture",
          "blacklists": [],
          "createdAt": "2026-08-31T12:00:00.000Z",
          "updatedAt": "2026-08-31T12:00:00.000Z"
        }
      ],
      "nextPageToken": "uuid-or-empty"
    }

Create may accept optional `{ user, pass }` authentication but returns only `ProxyDto`. PATCH remains partial: omission
of `auth` means unchanged. The browser has no operation for clearing authentication because the API has none. Blacklist
report accepts one validated `mxHost`, returns `204`, and subsequent reads expose the deduplicated list.

`GET /v1/proxies/healthy` remains a backend-only allocator operation and is absent from the browser snapshot/client,
but its serialized `ProxyDto` remains subject to the same no-auth response regression. No new external service,
entity, or migration is introduced. Frontend dependencies are the platform shell/account
context, generated client, request-state primitives, forms/dialogs, and design tokens from `frontend/08`.

## Acceptance Criteria

- Only a session with browser capability `platform.proxies.manage` can navigate to `/app/platform/proxies`; every
  direct backend request remains protected by `platform:admin`, and requests from a customer role return `403`
  without registry data.
- The list passes each cursor unchanged, appends unique records, offers `Load more` only when another page exists, and
  never displays or announces an inferred total or numeric page count.
- Create defaults visibly and server-side to `disabled`; the new row receives no traffic unless an operator later
  confirms an activation.
- No create/get/list/update/delete/healthy response, generated browser response type, browser cache, log, telemetry
  item, toast, snapshot, screenshot, or artifact contains stored proxy authentication.
- Edit leaves authentication untouched when replacement is off or blank and omits `auth` from the request. Explicit
  replacement requires a complete pair, confirmation, and safe clearing of local form values afterward.
- Authentication controls are absent until explicit enablement and use non-login autocomplete contracts. A settled
  credential-bearing create/update resets its form and mutation entry immediately. Component unmount, `pagehide`, and
  back/forward-cache restoration do the same. Tests prove that neither authentication variable remains and that
  restored values cannot trigger a request.
- Delayed credential-bearing mutation results from an invalidated ephemeral generation cannot restore form, mode, or
  MutationCache data after dismissal, pagehide, unmount, or back/forward-cache restoration.
- Lifecycle transitions and deletion require consequence-specific confirmation, update only after server success,
  and never claim that draining has completed merely because state is `draining`.
- Reporting an MX host returns success, reloads the row, displays the real deduplicated blacklist, and does not offer
  unsupported removal.
- Loading, empty, terminal-page, malformed-cursor, permission, validation, not-found, server, uncertain, success, and
  recovery states remain accessible and visually stable on desktop and mobile.
- `OpenAPI` and the generated client are current; focused and full checks, updated Bruno, and a disposable live browser lifecycle all pass;
  the runtime fixture starts disabled and only the fixture created by the test is deleted.

## Validation

Run focused proxy controller, mapper, application-service, repository, module, serialization, generated-client,
frontend, accessibility, and production-build checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- proxy.controller proxy-response.mapper proxy.service proxy.repository --runInBand
    corepack pnpm --filter ./apps/web test -- platform-proxies
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

After confirming Compose ownership, run Playwright for mocked permission, page, hidden-auth, confirmation, uncertain,
and recovery cases, then run create/list/edit/lifecycle/blacklist/delete against a disposable stack with a uniquely
identifiable proxy.

    corepack pnpm --filter ./apps/web build
    corepack pnpm --filter ./apps/web test:platform-proxies

Bootstrap the MFA-aware platform operator, run the updated Bruno collection from its root, and rerun the relevant
`smtp-dev` drain/exclusion regression when the fixture is available:

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:proxy-registry
    corepack pnpm --filter ./apps/web test:platform-proxies-live
    corepack pnpm ui:audit
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    corepack pnpm bruno:smtp-dev

Run
`corepack pnpm docs:lint -- .agents/plans/frontend/18-operate-proxy-fleet.md src/libs/modules/proxy/README.md bruno/proxy-registry/README.md`
with any other changed English Markdown files appended. Record exact results, cleanup, and limits without credentials
or unredacted external infrastructure data.

Complete the frontend premium audit against `DESIGN.md`: platform navigation consistency, dense-data hierarchy,
responsive table/card parity, lifecycle comprehension, credential replacement clarity, focus trap/return, touch
targets, field units, reduced motion, contrast, loading stability, destructive confirmation, and uncertain-result
recovery. Fix findings here; do not create a later polish PR.

## Idempotence and Recovery

List/get are safe to repeat. Lifecycle and ordinary field updates set absolute values, blacklist reporting converges
through deduplication, and delete treats only the server result/reload as authoritative. After an uncertain response,
reload before deciding whether another request is needed. Do not automatically retry create because it may produce a
duplicate. Do not automatically retry authentication replacement because the redacted read model cannot reveal which
secret is active.

Browser/live tests use a unique description and explicit captured ID, start disabled, and delete only that exact
record. If interrupted, use the captured synthetic ID to inspect and remove the fixture rather than broadly stopping
Compose or deleting unrelated proxies. No schema reset is required. A wholly disposable environment may use
the documented `pnpm dev:reset` procedure; no migration or production recovery is added.

## Artifacts and Notes

Current validation evidence (2026-09-09):

- `corepack pnpm --filter ./apps/web test:ci`: 621 tests passed across 30 files. Focused proxy tests: 13 passed.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci`: 2,753 Jest tests passed in 235 suites;
  92 tests in 15 environment-dependent suites were skipped. All 79 runner tests passed.
- Focused proxy HTTP, mapper, Swagger, service, repository, and browser allowlist checks: 137 tests passed.
- `node --test scripts/openapi/contracts.test.mjs`: 23 tests passed. `openapi:export`, `openapi:generate`,
  and `openapi:check` passed. Root and web type checks and production builds passed.
- `corepack pnpm architecture:check`: nine modules checked with zero violations. Root lint passed with one
  preexisting warning in `src/libs/config/src/load-secrets.spec.ts`; web lint passed without errors.
- `corepack pnpm design:lint` passed with zero errors or warnings; `corepack pnpm ui:audit` reported zero findings.
- `COMPOSE_PROJECT_NAME=lef5139e84 corepack pnpm bruno:proxy-registry`: 27 requests and 27 tests passed.
- `COMPOSE_PROJECT_NAME=lef5139e84 corepack pnpm bruno:bff-sessions`: 15 requests and 16 tests passed.
- `COMPOSE_PROJECT_NAME=lef5139e84 corepack pnpm bruno:smtp-dev`: 30 requests and 61 tests passed, including
  allocation drain, exclusion, and restoration. Every live collection executed without skipped tests.
- The real operator browser lifecycle and customer-denial tests passed, with exact-fixture deletion. Browser
  artifact guards passed all ten deliberate failure cases; browser fixture guards passed all five tests.
- `PROXY_BROWSER_PORT=41759 corepack pnpm --filter ./apps/web test:platform-proxies`: 40 tests passed across
  1440 by 900 and 320 by 720 viewports. Coverage includes real cached-page restoration, cancellation, delayed
  success and failure, permission changes, malformed cursors, confirmations, and accessibility.
- `COMPOSE_PROJECT_NAME=lef5139e84 corepack pnpm --filter ./apps/web test:platform-proxies-live`: both tests
  passed again after the final web rebuild. The operator completed create, edit, lifecycle, blacklist, delete,
  and reload; customer access was denied by both route and API.
- Final browser output directories contain only `.last-run.json`. Separate credential-free desktop and narrow
  screenshot review found no clipping, horizontal overflow, missing controls, or runtime console errors.
  All preview processes started for this task were stopped.
- Final cleanup verified zero browser or Bruno proxy fixtures before removing the isolated stack with
  `docker compose -p lef5139e84 -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans`.
  No isolated containers, volumes, or networks remain. All eight original shared-worktree containers remain running
  with their original IDs. Ignored local fixture metadata is retained; it no longer points to a running stack.
- CI command inventory and prerequisite ordering checks passed 103 tests. The Validate workflow now runs proxy
  artifact guards, the mocked browser suite, live Bruno, and the live browser lifecycle. No remote CI was dispatched.
- The Browser plugin is unavailable. Playwright uses the repository configuration. Inherited HTTP proxy variables
  must be unset for local preview reads, with `NODE_USE_ENV_PROXY=0`; this affects local test transport only.
- On 2026-09-10, the end-of-list message gained the existing pagination padding after visual feedback. It now uses
  the shared 1.5rem content gap below the final divider on desktop and narrow layouts, without changing tokens or API
  behavior. Both focused browser checks passed. Text clearance measured 25.5 pixels on desktop and 25 pixels on the
  narrow viewport, exceeding the shared minimum of 24 pixels. Neither viewport had horizontal overflow or runtime
  errors.
- `corepack pnpm docs:lint -- .agents/plans/frontend/18-operate-proxy-fleet.md src/libs/modules/proxy/README.md bruno/proxy-registry/README.md DESIGN.md UX-CONTRACT.md`:
  five files passed. `git diff --check` passed.
- On 2026-09-11, the implementation was rebased onto `7f4e8e1`, which adds SMTP evidence classification. All 19
  shared Bruno runner checks and 103 CI workflow checks passed afterward. The architecture gate again found zero
  violations across nine modules, and all five changed Markdown files passed Harper. The live results above
  precede that upstream SMTP change; the disposable live stack was not recreated for publication.
- On 2026-09-11, a follow-up merge incorporated `master` at `099d1d0`. The only conflict was in
  `scripts/bruno/run-collection.mjs`: the resolution preserves the 34 credit-purchase requests from `master` and
  this PR's 27 proxy requests and tests, including credential-safe reporting. All 19 shared Bruno runner tests
  passed against disposable HTTP contract fixtures, and all 23 OpenAPI contract tests passed, including generated
  artifact comparisons. The architecture gate checked nine modules with zero violations; focused runner lint and
  `git diff --check` passed. The resolution introduces no additional API behavior or architectural changes. The
  full development stack and live browser suites were not rerun for this merge.

Record only synthetic/redacted proxy IDs, hostnames, cursor suffixes if necessary, lifecycle values, status codes,
test counts, browser widths, and cleanup outcome. Never record proxy users/passwords, cookies, access tokens, raw
external endpoints, or screenshots containing sensitive input.

The cursor and redaction contracts, explicit credential replacement, lifecycle/blacklist/delete behavior,
late-response fence, state matrix, validation, recovery, and one-pull-request scope are decision-complete. There is
no hidden product choice, and the plan can be validated independently once its listed dependencies are complete.

## Plan readiness

Ready to implement.
