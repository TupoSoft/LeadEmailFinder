# Bootstrap Customer Organizations from the Platform Console

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A signed-in platform operator can open a post-MVP organization console, page through a truthful directory without a
fabricated total, create a customer organization, and copy its one-time first-owner invitation URL. Customer roles
cannot see platform navigation or call the endpoints. The browser, OpenAPI contract, generated client, focused tests,
Bruno, and a disposable live flow all observe the same organization and invitation behavior.

## Progress

- [ ] (2026-08-31) Add the identity-owned paginated organization directory reader and adapter.
- [ ] (2026-08-31) Expose platform organization list and existing creation contracts in OpenAPI.
- [ ] (2026-08-31) Implement cursor-driven directory, creation, and one-time invitation UX.
- [ ] (2026-08-31) Cover platform authorization, cursor, secret, loading, empty, error, and recovery states.
- [ ] (2026-08-31) Update generated client, Bruno, module documentation, and design context.
- [ ] (2026-08-31) Run focused, PostgreSQL, live-browser, premium, architecture, prose, and full validation.

## Plan dependencies

- `frontend/08`
- `frontend/09`
- `frontend/13`
- `module-architecture/08`

## Surprises & Discoveries

- `OrganizationOnboardingModule` already exposes platform-admin `POST /v1/organizations`, but the controller is
  excluded from Swagger and there is no organization-list endpoint.
- The `Organization` entity belongs to identity and has ID, name, `createdAt`, and `updatedAt`. Onboarding must not
  import its TypeORM repository to implement a directory.
- Creation returns a raw first-owner invitation token once because the project has no invitation-email delivery.

## Decision Log

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

Not started.

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
success, extract the first-owner URL into local modal memory only when the operation generation is current, then
immediately reset mutation data and variables. Keep that local URL only until explicit copy/dismissal, navigation,
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

Record the cursor contract, redacted synthetic IDs, page sizes, HTTP statuses, generated operation names, test counts,
browser widths, premium result, and cleanup outcome. Never record invitation URLs/tokens, passwords, cookies, access
tokens, real customer names, or screenshots containing secrets.

The directory ownership, cursor contract, platform creation flow, one-time invitation handling, state matrix,
validation, and one-pull-request boundary are decision-complete.

## Plan readiness

Ready to implement.
