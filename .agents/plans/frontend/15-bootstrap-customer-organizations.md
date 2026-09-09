# Bootstrap Customer Organizations from the Platform Console

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A signed-in platform operator can open a post-MVP organization console, page through a truthful directory without a
fabricated total, create a customer organization, and copy its one-time first-owner invitation URL. Customer roles
cannot see platform navigation or call the endpoints. The browser, OpenAPI contract, generated client, focused tests,
Bruno, and a disposable live flow all observe the same organization and invitation behavior.

## Progress

- [x] (2026-09-09) Add the identity-owned paginated organization directory reader and adapter.
- [x] (2026-09-09) Expose platform organization list and existing creation contracts in OpenAPI.
- [x] (2026-09-09) Implement cursor-driven directory, creation, and one-time invitation UX.
- [x] (2026-09-09) Cover platform authorization, cursor, secret, loading, empty, error, and recovery states.
- [x] (2026-09-09) Update generated client, Bruno, module documentation, and design context.
- [x] (2026-09-09) Run focused backend, real PostgreSQL, generated-client, browser, artifact, full regression,
  architecture, premium, and prose validation. Record commands, counts, and limits below.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `frontend/13`
- `module-architecture/08`

## Surprises & Discoveries

- The existing API-host middleware already applies `no-store` and `no-referrer` to organization creation before
  parsing, guards, and validation. HTTP tests now verify success, invalid input, unauthenticated, forbidden, and
  application-failure responses rather than adding duplicate middleware.
- The authenticated shell clears its entire query cache on pagehide and restored pageshow. The unconfirmed-creation
  guard therefore needs a secret-free marker outside that cache to survive restoration; invitation data is still
  discarded synchronously.
- The BFF Bruno collection asserts the complete OpenAPI path allow list. It also needs the newly exposed
  `/v1/organizations` path, even though the main HTTP workflow belongs to the onboarding collection.

- `OrganizationOnboardingModule` already exposes platform-admin `POST /v1/organizations`, but the controller is
  excluded from Swagger and there is no organization-list endpoint.
- The `Organization` entity belongs to identity and has ID, name, `createdAt`, and `updatedAt`. Onboarding must not
  import its TypeORM repository to implement a directory.
- Creation returns a raw first-owner invitation token once because the project has no invitation-email delivery.

## Decision Log

- Decision: Persist only a membership-scoped reconciliation flag in session storage, before sending creation.
  Rationale: An ordinary reload must not hide an unresolved outcome. Confirmed success or rejection, or the operator's
  explicit acknowledgment, clears the flag. A document-local marker remains available when storage is blocked;
  that fallback cannot survive a full reload. Neither marker contains form fields, an organization ID, or a token.
  Date/Author: 2026-09-09, implementation review.
- Decision: Use direct generated-client creation outside the query and mutation caches, as existing team invitations
  do. Store the URL in a local reference and an uncontrolled dialog input only.
  Rationale: This avoids retaining sensitive response data or mutation variables in the first place. Generation and
  abort checks still invalidate late settlement, and successful copy or dismissal clears the input and reference.
  Date/Author: 2026-09-09, implementation.
- Decision: Reuse the existing form, product panel, service-client metadata table styles, and team dialog without
  new visual tokens. Record the platform workflow in the design and UX contracts and add its evidence to the audit.
  Rationale: The approved system already supports this directory and one-time invitation flow.
  Date/Author: 2026-09-09, implementation.

- Decision: Keep organization bootstrap as a post-MVP platform route separate from customer navigation and data.
  Rationale: Creating tenants and first owners is an operational power; browser visibility does not replace backend
  `platform:admin` authorization.
  Date/Author: 2026-08-31, project planning.
- Decision: Add cursor pagination ordered by database-truncated millisecond creation time descending and ID
  descending, with no total count; accept `pageSize` from 1 through 100 and default it to 50.
  Rationale: A unique tie-breaker creates stable pages, while a numeric total/page claim is not required and becomes
  stale as organizations are inserted. Using the same millisecond expression for ordering, seeking, cursor encoding,
  and JavaScript serialization avoids PostgreSQL microsecond precision drifting from hydrated `Date` values.
  Date/Author: 2026-08-31, project planning.
- Decision: Put the typed directory reader port and TypeORM adapter in identity, and put query parsing, cursor
  validation, and the platform listing application service in organization-onboarding.
  Rationale: The data owner keeps persistence details; the consuming business module depends only on a narrow injected
  interface.
  Date/Author: 2026-08-31, project planning.
- Decision: Reuse the one-time invitation presentation and cleanup contract from `frontend/13`.
  Rationale: A first-owner token is the same bearer secret and must not acquire a weaker cache, log, toast, or artifact
  path in the platform console.
  Date/Author: 2026-08-31, project planning.
- Decision: Mark organization-creation responses `no-store` and clear the one-time result across page lifecycle and
  back/forward-cache transitions, not only when React unmounts.
  Rationale: The creation response contains an unrecoverable bearer invitation URL. A closed modal is not proof that
  the browser, mutation cache, or restored document released it.
  Date/Author: 2026-08-31, project planning.
- Decision: Leave credit read/add/set operations to `frontend/16` and `frontend/17`.
  Rationale: Organization discovery/bootstrap and credit administration are independently useful outcomes; the latter
  also needs a breaking idempotency-header contract and separate caller updates.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

The API exposes platform-authorized directory reads and the existing organization creation contract through runtime
OpenAPI and the generated client. Identity owns the typed directory adapter, while onboarding owns cursor validation
and authorization. The platform route supports metadata-only pagination, explicit creation, one-time invitation copy,
and reconciliation after uncertain outcomes. No schema or credit behavior changed.

Validation confirmed the database boundary, generated contract, and live API flows. Browser checks covered MFA
operator creation, customer rejection, synthetic fixture cleanup, responsive behavior, and artifact suppression.
The command results and remaining environment limits appear below.

## Context and Orientation

`frontend/08` supplies the authenticated shell, server account context, generated-client query layer, permission-aware
navigation, and durable design context. `frontend/13` supplies the one-time invitation modal and token handling rules.
This plan adds `/app/platform/organizations` outside the customer-facing MVP. It may begin as soon as its listed
prerequisites are complete; finishing every customer feature is not an implementation dependency.

`POST /v1/organizations` currently creates the organization and pending first-owner invitation and returns the raw
token once. The identity module owns `Organization` persistence. In the current source its public barrel still
exports TypeORM entities; prerequisite `module-architecture/08` seals those exports. This plan consumes only the
sealed application ports and does not reopen entity access.

Before implementation changes either business module, it must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and the identity and organization-onboarding module README files. No database schema
change is required; the project remains on TypeORM synchronization for disposable development data.

## Scope and Non-Goals

This pull request adds the organization-directory port/adapter/service/controller path, exposes list and create in
OpenAPI, regenerates the client, and builds responsive directory, creation, and one-time invitation workflows. It
adds cursor, authorization, secret-lifetime, API, browser, Bruno, and accessibility coverage.

It does not read or mutate credits, edit organizations, delete organizations, switch a customer user's organization, list/revoke
or resend invitations, send email, add bulk creation, build an audit viewer, add a generic admin framework, or add a
schema/migration. Production rollout and recovery are outside scope.

## Plan of Work

In identity, add `OrganizationDirectoryReader` as a narrow application port that accepts a typed limit and optional
typed millisecond/UUID seek key. Its TypeORM adapter orders by
`date_trunc('milliseconds', createdAt) DESC, id DESC` and uses that exact expression in the seek predicate. Bind an
injectable token, export only the port contract, fetch one extra row, and report whether another row exists. The port
and adapter do not parse HTTP strings or construct HTTP errors.

In organization-onboarding, add a platform-authorized listing application service that consumes the injected reader.
The API DTO defaults `pageSize` to 50 and validates the 1-through-100 range. The framework-free application service
decodes the opaque, base64url, versioned `pageToken` into the typed seek key and encodes the final row's millisecond
epoch and UUID for the next page. It throws a typed invalid-cursor error for malformed, unsupported, out-of-range, or
type-invalid values; the API maps that error to `400`. Expose
`GET /v1/organizations?pageSize=&pageToken=` with `organizations` and optional `nextPageToken`. The controller
contains no TypeORM query logic and does not compute or imply a total. Add unit, adapter, controller, and real
PostgreSQL page-boundary tests, including equal timestamps and insertion between requests.
Create rows within the same database millisecond but with distinct microseconds and prove the UUID tie-breaker
neither skips nor duplicates them across pages.

Make the new list and existing platform creation operation visible in runtime OpenAPI and the browser allow list.
Document `platform:admin`, cursor bounds/errors, omitted terminal cursor, one-time invitation response, validation,
and authorization statuses. Attach `Cache-Control: no-store` to successful and error creation responses and cover the
header in HTTP tests.
Update the committed client through `corepack pnpm openapi:export` and `corepack pnpm openapi:generate`, then prove it
with `corepack pnpm openapi:check`; keep unrelated onboarding operations owned by earlier/later slices unchanged.

Implement `/app/platform/organizations` using browser capability `platform.organizations.manage`. Pass
`nextPageToken` unchanged, show `Load more` only when present, deduplicate appended rows by ID, and reload from the
first page after confirmed creation. Never display a numeric total, guessed page count, or `last page` claim. Render
desktop rows and narrow cards with equivalent name, identifier, and timestamps.

Create accepts the existing organization/owner input and sends one mutation with automatic retries disabled. On
success, extract the first-owner URL into local modal memory only when the operation generation is current. Use a
direct generated-client request outside the query and mutation caches, and clear submitted form references after
settlement. Keep that local URL only until explicit copy/dismissal, navigation,
pagehide, or unmount; do not clear it merely because the successful mutation settled. On failed settlement, clear all
secret state. Register cleanup before the modal can enter the back/forward cache. On `pagehide`, synchronously close
it, clear the invitation URL, form secret references, mutation data/variables, and any application-owned copy buffer.
On `pageshow` with `persisted === true`, render a dismissed-secret state before paint and do not restore the modal or
token. On a lost response, state that creation is unconfirmed, refresh the directory, and require explicit operator
reconciliation rather than silently creating another organization.

Give creation an ephemeral-operation generation and abort controller. Its settlement callback captures the
generation; modal dismissal, navigation, unmount, pagehide, and back/forward-cache restoration advance it and abort
in-flight work. Ignore a late success or failure from an older generation so it cannot reopen the modal or repopulate
local or MutationCache state. Test delayed responses across dismissal and pagehide/pageshow.

Add focused API/persistence/generated-client tests, web component/accessibility coverage, and live Playwright. Extend
the nearest platform or organization-onboarding Bruno workflow for platform authorization, first/middle/final pages,
malformed cursors, creation, and secret-free subsequent reads. Use uniquely labeled disposable organizations and
never store an invitation token in fixtures or artifacts. Disable Playwright trace, screenshot, and video capture for
the entire creation and one-time invitation segment, including failure paths, and disable DOM/network attachments,
response dumps, and Bruno token logging rather than trying to redact a recording afterward. Assert synthetic token
markers are absent from output directories and CLI logs. Secret-free mocked scenarios may retain ordinary failure
artifacts. Complete the premium design audit in this pull request.

## Interfaces and Dependencies

Add platform-admin `GET /v1/organizations` with `pageSize` default 50, minimum 1, maximum 100, and an opaque
`pageToken`. Its response is equivalent to:

    {
      "organizations": [
        {
          "id": "uuid",
          "name": "Acme Development Customer",
          "createdAt": "2026-08-31T12:00:00.000Z",
          "updatedAt": "2026-08-31T12:00:00.000Z"
        }
      ],
      "nextPageToken": "opaque-value"
    }

`nextPageToken` is omitted when no later row exists; it is never an empty string or null terminal sentinel.

`POST /v1/organizations` keeps its current request and one-time invitation response. Both routes remain protected by
backend `platform:admin`. Browser navigation uses `platform.organizations.manage` only as a presentation hint.

The identity-owned reader port is consumed by organization-onboarding through dependency injection. No external
service, entity, migration, or production dependency is added.

## Acceptance Criteria

- Account context with `platform.organizations.manage` sees `/app/platform/organizations`; customer navigation does
  not. Direct API requests remain protected by `platform:admin` and customer roles receive `403` without directory
  data.
- The directory returns deterministic, non-overlapping pages and handles equal timestamps, including distinct
  PostgreSQL microseconds within one serialized millisecond. The API rejects malformed cursors and page sizes outside
  1 through 100, defaults the size to 50, emits a cursor only when another row exists, and never claims a total. The
  identity reader receives only a typed seek request.
- The UI passes each cursor unchanged, appends unique rows, represents empty and terminal pages truthfully, and resets
  to the first page after confirmed creation.
- A platform operator creates an organization once and can copy its first-owner invitation URL only from the immediate
  result. Creation responses are `no-store`; successful settlement immediately resets mutation state but may keep the
  URL only in the visible local modal. Copy/dismissal, navigation, unmount, pagehide, and back/forward-cache
  restoration clear local state, and a restored page cannot recover or redisplay the URL.
- No raw invitation token appears in subsequent reads, browser persistence, logs, analytics, toasts, filenames,
  screenshots, fixtures, or recorded evidence.
- A lost creation response is outcome-unknown, triggers directory reconciliation, and never retries automatically.
- A delayed creation result from an invalidated ephemeral generation cannot reopen the modal or restore invitation,
  form, or mutation data after dismissal, navigation, pagehide, unmount, or back/forward-cache restoration.
- Loading, empty, permission, malformed-cursor, validation, uncertain, success, and recovery states remain
  keyboard/screen-reader accessible and visually stable at desktop and narrow widths.
- OpenAPI and the generated client are current; focused and full checks, Bruno, live browser flow, premium audit, and
  architecture gate pass in one pull request.

## Validation

Run focused reader/adapter/service/controller and PostgreSQL pagination tests, plus frontend and contract checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- organization-directory organization-onboarding --runInBand
    corepack pnpm openapi:export
    corepack pnpm openapi:generate
    corepack pnpm openapi:check
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test
    corepack pnpm typecheck
    corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm architecture:check
    git diff --check

Run the updated Bruno platform/onboarding workflow and Playwright against a worktree-owned disposable stack. Exercise
first/middle/final pages, equal timestamps, malformed cursor, platform authorization, one creation, modal cleanup, and
outcome-unknown UI through deterministic browser fixtures. Bootstrap the MFA-aware platform operator from
`frontend/09`, then run the collection from its root:

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:organization-onboarding
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/platform-organizations.spec.ts --project=chromium
    corepack pnpm ui:audit

Run the premium static audit and inspect desktop and narrow states, including pagehide and back/forward-cache
restoration.

Run Harper over the actual changed prose, including:

    corepack pnpm docs:lint -- .agents/plans/frontend/15-bootstrap-customer-organizations.md src/libs/modules/identity/README.md src/libs/modules/organization-onboarding/README.md

Record exact test counts, cursor cases, browser widths, cleanup, and runtime limitations without invitation tokens or
customer data.

## Idempotence and Recovery

Directory reads are repeatable. Organization creation is not retried automatically because success may have created a
tenant and an unrecoverable raw invitation response. After an uncertain result, reload the directory and require an
explicit operator decision. The `pagehide` event and back/forward-cache restoration discard the one-time result rather than
attempting to reconstruct it.

Live tests use unique labels and clean up only captured synthetic IDs. If interrupted, inspect those IDs before
removal and never broadly reset shared data. No migration or production recovery step is introduced.

## Artifacts and Notes

Implementation evidence from 2026-09-09:

- `corepack pnpm test:ci` passed: 233 Jest suites and 2,676 tests, followed by 76 runner tests. The default suite
  skipped 15 optional integration suites with 91 tests; the new PostgreSQL suite was executed separately.
- `corepack pnpm --filter ./apps/web exec vitest run --maxWorkers=2` passed all 544 tests in 26 files. The platform
  subset contains 33 tests, including storage denial, membership isolation, generation races, and reload recovery.
  Two workers avoid contention with concurrent browser and container checks; an earlier full-concurrency run timed
  out in an unchanged team test, which passed both independently and in the final full run.
- The identity reader and module wiring passed eight focused tests. Five real PostgreSQL 18 tests passed with
  equal timestamps, distinct microseconds in one millisecond, inserted rows, deleted cursor boundaries, and empty
  results. The suite used its own random schemas; those schemas, its temporary container, and credentials were removed.
- The onboarding service, controller, HTTP, and composition checks passed 98 tests. The OpenAPI contract suite passed
  19 tests, and `corepack pnpm openapi:export`, `corepack pnpm openapi:generate`, and `corepack pnpm openapi:check`
  passed. The generated operations are `OrganizationsController_list` and `OrganizationsController_create`.
- `corepack pnpm --filter ./apps/web test:platform-organizations` passed 16 browser cases at 1440 by 900 and 320 by
  720. The cases include cursor forwarding, duplicate removal, form validation, copy cleanup, delayed settlement,
  cancellation, navigation, cached-page restoration, and reload reconciliation. No secrets were recorded.
- `COMPOSE_PROJECT_NAME=lef-510-b629 corepack pnpm --filter ./apps/web test:platform-organizations-live` passed two
  real browser tests at `http://localhost:53110`. MFA operator creation returned `201` with `no-store`; customer
  access returned `403`. The test removed and verified its exact created organization, invitation, and audit rows.
- `COMPOSE_PROJECT_NAME=lef-510-b629 corepack pnpm bruno:organization-onboarding` passed 23 requests and 23 tests;
  `COMPOSE_PROJECT_NAME=lef-510-b629 corepack pnpm bruno:bff-sessions` passed 15 requests and 16 tests. Neither run
  skipped a request. The onboarding CLI's synthetic success, failure, and secret-reporting tests also passed.
- `corepack pnpm --filter ./apps/web test:invitation-artifacts` passed 16 deliberate assertion, timeout, and teardown
  failure checks across the invitation, team, and two platform configurations. Runtime secret markers were absent
  from output files and CLI logs without after-the-fact redaction.
- Web and backend type checks and lint passed. Root lint retains one existing return-type warning in
  `src/libs/config/src/load-secrets.spec.ts`. `corepack pnpm architecture:check` passed with nine modules and zero
  violations. CI selector fixtures and `git diff --check` passed. Review found no material SOLID trade-off.
- `corepack pnpm design:lint` and `corepack pnpm ui:audit` passed without warnings or violations. Synthetic-only
  screenshots at both browser widths confirmed full wrapping, visible controls, no horizontal overflow, no console
  errors, and zero accessibility violations. Screenshots remain outside the repository at
  `/tmp/lef510-platform-desktop.png` and `/tmp/lef510-platform-narrow.png`.
- Harper passed all six edited Markdown files: this plan, `DESIGN.md`, `UX-CONTRACT.md`, the onboarding Bruno README,
  and both affected module `README.md` files, using `corepack pnpm docs:lint --` followed by those paths.
- Browser plugin not available: the repository's Playwright workflows supplied browser verification. Docker registry
  networking failed during a fresh dependency-image build. The isolated API image reused a cached image whose lockfile
  hash exactly matched this checkout, then compiled the current source. The web image used the current local production
  build. Fresh image dependency download remains an environment limitation; no Dockerfile change was required.
- If session storage is blocked, reconciliation survives navigation and cached-page restoration in the current
  document but cannot survive an ordinary reload. Invitation secrets never enter either storage mechanism.

Record the cursor contract, redacted synthetic IDs, page sizes, HTTP statuses, generated operation names, test counts,
browser widths, premium result, and cleanup outcome. Never record invitation URLs/tokens, passwords, cookies, access
tokens, real customer names, or screenshots containing secrets.

The directory ownership, cursor contract, platform creation flow, one-time invitation handling, state matrix,
validation, and one-pull-request boundary are decision-complete.

## Plan readiness

Ready to implement.
