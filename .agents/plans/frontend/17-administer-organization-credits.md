# Administer Organization Credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A signed-in platform operator can select an organization from the platform directory, inspect its authoritative
credit balance, add credits safely across a lost response, or set an absolute balance after explicit confirmation.
Add and set remain visibly different, customer roles cannot see or call them, and the browser never changes a
financial value optimistically. The UI consumes the completed caller-owned idempotency contract rather than changing
ledger semantics in the same pull request.

## Progress

- [x] (2026-09-09) Publish organization detail and credit read/add/set operations in the browser OpenAPI allow list and generated client.
- [x] (2026-09-09) Build the platform balance route with distinct add and absolute-set controls.
- [x] (2026-09-09) Retain one additive idempotency key across pending, uncertain, and explicit retry states.
- [x] (2026-09-09) Cover authorization, validation, confirmation, uncertainty, conflict, and recovery states.
- [x] (2026-09-09) Extend browser, accessibility, Bruno, documentation, and premium-design evidence.
- [x] (2026-09-09) Run focused, live-browser, architecture, prose, and repository validation.

## Plan dependencies

- `frontend/09`
- `frontend/10`
- `frontend/15`
- `frontend/16`

## Surprises & Discoveries

- The credit read, additive, and absolute-set controllers already exist and remain protected by `platform:admin`, but
  they are not yet part of the generated browser contract.
- `frontend/16` changes additive calls to require a caller UUID and guarantees same-key/same-amount replay without a
  second effect. The browser must preserve that key rather than generate one per fetch attempt.
- The current credit read returns zero when no credit-account row exists and does not distinguish an unknown
  organization. A refresh-safe detail page therefore needs a narrow platform organization-detail read rather than a
  fabricated interpretation of balance zero.
- The implementation checkout matched current `master` at `2c2edfa`; prerequisite issues 504, 505, 510, and 511 were
  closed. Issue 512 is assigned and its Project 9 status is In Progress.
- The worktree initially had no dependencies. Installation succeeded with a writable pnpm store under the Codex cache.
  Docker build metadata also needs a writable `BUILDX_CONFIG` in this sandbox.
- The legacy Bruno launcher expected separate metadata that normal development bootstrap did not write. It now reuses
  shared checkout-owned stack discovery without adding another configuration file or weakening ownership checks.
- Unrestricted web-test workers competed with Docker builds and timed out in existing billing, team, and directory
  suites. The complete suite passed with two workers; no global timeout or validation rule was relaxed.
- Cached organization details can report success while a fresh lookup is pending. Balance queries now wait for that
  lookup to settle successfully, including on an in-app revisit; a regression test proves a new `404` sends no credit read.
- A request-triggered authentication error can arrive before React unmounts the page. Mutation handlers now stop their
  local execution before cleanup can be followed by another storage write or balance read.

## Decision Log

- Decision: Enter the credit route from a concrete directory row and display that row's organization name and ID
  beside the freshly read balance.
  Rationale: The directory is the authoritative organization selection surface; the credit API remains the authority
  for balance and authorization.
  Date/Author: 2026-08-31, project planning.
- Decision: Add platform-authorized `GET /v1/organizations/:organizationId` through the identity directory reader and
  load it before balance on a hard refresh.
  Rationale: The UI needs an authoritative name/existence contract. Treating a zero credit balance as proof that an
  organization exists would be false, and scanning cursor pages to recover one row is unbounded.
  Date/Author: 2026-08-31, project planning.
- Decision: Generate one additive UUID only when the operator confirms and retain it until the operation is resolved,
  retried explicitly, or deliberately abandoned.
  Rationale: A new key on retry recreates the double-credit risk that `frontend/16` removed.
  Date/Author: 2026-08-31, project planning.
- Decision: Persist one unresolved additive operation per tab in authenticated, principal-scoped `sessionStorage`
  before sending the POST; never resend it automatically.
  Rationale: Component memory cannot preserve the only retry-safe key across hard refresh. A per-tab record supports
  explicit same-key recovery without turning financial operations into background work.
  Date/Author: 2026-08-31, project planning.
- Decision: Keep additive and absolute-set controls visually and behaviorally separate and reload after every result.
  Rationale: Add is relative, while set overwrites current state. Financial UI must not hide that difference or infer
  a balance before the server reports it.
  Date/Author: 2026-08-31, project planning.
- Decision: Disable automatic retries for both mutations. Offer only an explicit same-key retry for unresolved add;
  reload balance before any absolute-set recovery.
  Rationale: Network uncertainty needs visible operator control even when the additive API is idempotent, and an
  absolute overwrite deserves fresh context.
  Date/Author: 2026-08-31, project planning.
- Decision: Treat `platform.credits.manage` as presentation only and keep backend `platform:admin` authoritative.
  Rationale: Navigation hints improve usability but cannot replace concurrent server authorization.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Implemented and locally validated on `kk/512-organization-credits`. Platform operators can enter from the directory,
read authoritative organization identity and balance, add with durable explicit replay, and confirm absolute sets.
Recovery survives a matching same-tab reload, never resends automatically, expires only through acknowledgment, and
respects authentication boundaries. The operator procedure is in `docs/platform-credits.md`.

The detail service remains separate from listing, the identity adapter owns the UUID query, and the credit service
continues to own ledger semantics. React components reuse the existing visual primitives. The only architectural
trade-off is repeating the small platform authorization check in the two purpose-specific directory services.
No schema, migration, provider, or ledger-semantic change was introduced. GitHub review and merge remain separate
from the local acceptance evidence below.

## Context and Orientation

`frontend/10` establishes customer credit presentation and pessimistic financial UI rules. `frontend/15` supplies
the platform organization directory. `frontend/16` supplies the required `Idempotency-Key`, equivalent-replay,
conflict, and brand-new-account concurrency contract. This plan adds
`/app/platform/organizations/:organizationId/credits` and the directory action visible for browser capability
`platform.credits.manage`.

The credits business module owns balance and mutation semantics; identity persistence owns the injected ledger
adapter. This pull request consumes those boundaries and does not import entities or repositories into React or a
controller. The application shell's generated transport owns same-origin cookies and CSRF.

The credit API does not distinguish an unknown organization from an existing organization without a credit account.
The identity-owned directory reader from Plan 15 is the correct narrow boundary to extend with lookup by ID. Its platform
application service throws a typed organization-not-found error without making credits import an identity repository;
`OrganizationsController.handleErrors()` maps that error to a non-disclosing `404`.

Before changing these business modules, implementation must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and the credits, identity, and organization-onboarding module README files; keep all
three affected README files current.

## Scope and Non-Goals

This pull request adds one platform organization-detail read. It exposes that read and the completed credit read,
add, and set source contracts through the checked browser allow list, then regenerates the client. It builds the
responsive platform credit page with confirmations, authoritative refresh, uncertainty, same-key retry, and
accessibility coverage. It removes the credits controller's class-level Swagger exclusion and owns complete GET/PUT
annotations; Plan 16 owns the additive header/replay annotations.

It does not change ledger persistence, replay/conflict policy, caller migration, payment/refund accounting,
organization creation, credit units, absolute-set semantics, customer checkout, add a ledger/audit history, add bulk
adjustments, add migrations, or define production rollout/recovery.

## Plan of Work

Extend the identity-owned `OrganizationDirectoryReader` from Plan 15 with lookup by UUID and consume it through a
platform-authorized onboarding application service. The framework-free service throws a typed not-found error for
absence; the onboarding controller maps it to `404`. Add `GET /v1/organizations/:organizationId`, returning the same
safe ID/name/timestamps projection as a directory row and no membership or credit data. Keep the identity reader and
adapter HTTP-free. Add unit, adapter, controller, authorization, and HTTP tests.

Remove `@ApiExcludeController()` from `CreditsController`, preserve the complete POST/header annotations from Plan
16, add complete credit GET/PUT security/path/response/error Swagger annotations, and then add the exact organization-detail, credit `GET`,
additive `POST`, and absolute `PUT` route-method entries to the browser allow list. Assert platform security, UUID
paths, organization/balance/amount DTOs, required idempotency header, replay/conflict statuses, and validation
responses. Update committed artifacts with `openapi:export` and `openapi:generate`, then run the read-only
`openapi:check`.

Add the directory action and credit detail route. Use safe directory navigation state for immediate rendering, then
load the organization detail by ID before requesting balance so a hard refresh never scans cursor pages or trusts the
route ID for display. Fetch the balance before enabling mutations. Browser capability controls navigation and
controls; every request remains subject to server `platform:admin`. A malformed UUID returns to the directory;
organization-detail `404`, `403`, or a generic server error reveals no balance.

Build add and set as distinct panels with separate headings, descriptions, validation, and submit controls. Each
confirmation names the organization, current server balance, operation, and requested amount. Do not derive one form
from the other or present set as an advanced mode of add. Keep displayed balance unchanged while either mutation is
pending.

For add, create one UUID after confirmation and write a versioned
`{membershipId, organizationId, amount, key, state, createdAt}` record to `sessionStorage` synchronously before the
POST. Namespace the storage key by the current membership and permit only one unresolved record per tab. Never put
it in QueryClient or render/log the full key. On bootstrap/hard refresh, wait for current-account identity, accept
only a schema-valid record whose membership and route organization match, then load organization detail and balance
before showing explicit `Retry same adjustment` or `Abandon unresolved adjustment` actions; never auto-send. A
malformed, wrong-principal, or wrong-organization record is removed without displaying its data. Logout, expired or
unusable session, principal replacement, and `pageshow.persisted` cleanup from Plan 08 remove records that do not
belong to the newly confirmed principal.

Send the retained key through the generated header contract. On definite success or same-key replay, replace the displayed balance
only with the server response, invalidate/read the authoritative query, and clear the operation. On `409`, retain the
operation for diagnosis, refresh balance, and do not silently change amount or key. On timeout/disconnect, mark
outcome unknown, refresh the balance without inferring causality, and offer `Retry same adjustment` with the same key.
A separate adjustment requires explicit abandonment text acknowledging that the unresolved operation may have
applied. Clearing storage, closing the tab, or exceeding a documented 24-hour local recovery window loses safe
same-key recovery; show this limitation before abandonment and in operator documentation. Expiry removes the key only
after the operator acknowledges that server-side application remains unknown.

For absolute set, confirm the requested final value and issue one non-retried request. After definite or uncertain
response, reload the balance. If it equals the requested value after uncertainty, say only that the current balance
matches; do not claim which request caused it. A new set remains an explicit operator action.

Add generated-client assertions, web component/accessibility tests, and Playwright scenarios. Extend the Plan 16
`bruno/platform-credits` collection in this pull request with GET/read and PUT/set cases while preserving its add,
exact-replay, conflict, malformed-input, and authorization cases. Add browser-contract assertions where needed. Run
the live browser flow against a uniquely named disposable organization. Complete the premium audit for
financial hierarchy, confirmations, focus, uncertainty, narrow layout, and non-color status.

## Interfaces and Dependencies

Existing paths remain:

    GET /credits/:organizationId
    POST /credits/:organizationId
    Idempotency-Key: <uuid>
    { "amount": 100 }
    PUT /credits/:organizationId
    { "amount": 500 }

Add:

    GET /v1/organizations/:organizationId
    200 { "id": "<uuid>", "name": "Example Organization", "createdAt": "...", "updatedAt": "..." }

`POST` uses the Plan 16 replay/conflict contract. `GET` and `PUT` retain current balance semantics. Every endpoint
stays protected by backend `platform:admin`; `platform.credits.manage` is a browser capability only.

The web feature depends on directory selection from `frontend/15`, financial presentation/query primitives from
`frontend/10`, the generated transport from the foundation chain, and the completed backend idempotency contract from
`frontend/16`. No new external service, entity, schema, or production dependency is introduced.

## Acceptance Criteria

- Only browser capability `platform.credits.manage` exposes the route/action. Backend requests remain protected by
  `platform:admin`, and customer roles receive `403` without balance data.
- Selecting a directory organization shows its freshly read authoritative balance. Add and set are visually distinct,
  and each confirmation states organization, current value, operation, and requested amount.
- Add creates one UUID after confirmation and reuses it for pending, reconciliation, and explicit retry. A transport
  failure never generates a replacement key or claims that the grant did not occur.
- Hard refresh in the same tab restores only a schema-valid matching-principal unresolved record and offers explicit
  same-key retry/abandonment after authoritative reads; it never auto-sends. Logout/principal change and malformed or
  cross-principal records expose no operation data.
- Same-key success/replay updates from the server response; `409` and uncertain results refresh authoritatively
  without optimistic balance or causality claims. Starting a separate unresolved add requires explicit acknowledgment.
- Absolute set never updates optimistically. After a lost response it reloads balance and reports only observed state.
- Malformed route IDs and organization-detail `404`, `403`, or server errors render safe recovery without calling the
  credit read or disclosing balance. Hard refresh reacquires the authoritative organization name by ID.
- Loading, permission, validation, conflict, uncertain, retry, abandonment, success, and recovery states are
  accessible and visually stable at desktop and narrow widths.
- Browser OpenAPI allow list/generated client, focused component tests, Bruno, live browser flow, premium audit,
  architecture, prose, and repository checks pass in one pull request.

## Validation

Update and check the generated browser contract, then run web and repository checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- credits.controller organization-directory --runInBand
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

Bootstrap the MFA-aware platform operator, then run the pinned `bruno:platform-credits` command with read,
set, one add, exact replay, conflict, malformed input, and authorization. Run Playwright as that operator against a worktree-owned disposable organization and
cover definite success, forced timeout, same-key retry, conflict, set uncertainty, hard refresh, desktop, and narrow
interaction. Run the premium audit against `DESIGN.md`.

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm bruno:platform-credits
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/platform-credits.spec.ts --project=chromium
    corepack pnpm ui:audit


Record exact balances before/after, statuses, redacted key suffixes only when needed, test/Bruno counts, browser
widths, and cleanup using synthetic identifiers.

## Idempotence and Recovery

Balance reads are repeatable. Additive credit retries reuse the same organization/key/amount and converge through the
Plan 16 contract. After uncertainty, refresh balance and retain the operation in principal-scoped per-tab storage
until definite resolution or acknowledged abandonment. Hard refresh restores the same key but never submits it.
Closing/clearing the tab or acknowledged expiry destroys local recovery and requires external reconciliation before
a new adjustment; the UI cannot infer server outcome from balance alone.

Absolute set converges for the same desired value, but after a lost response the UI reloads before another explicit
set. Tests reset only disposable organization data owned by this checkout. No migration, backfill, production
recovery, or shared-resource cleanup is introduced.

## Artifacts and Notes

Record redacted organization IDs, key suffixes only when necessary, requested amounts, status codes, before/after
balances, test counts, browser widths, and cleanup outcome. Never record complete keys, cookies, access tokens,
invitation secrets, real customer data, or payment-provider payloads.

The generated browser boundary, financial UI distinction, same-key lifecycle, uncertainty policy, recovery, design
states, validation, and one-pull-request scope are decision-complete.

### Implementation Evidence, 2026-09-09

- `corepack pnpm openapi:export`, `corepack pnpm openapi:generate`, and `corepack pnpm openapi:check` passed; the focused
  OpenAPI contract suite passed 21 tests. The generated POST contract requires `Idempotency-Key`.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci` passed 234 Jest suites and 2,707 tests, with 15 suites and
  92 tests skipped for optional environment dependencies; its Node runner suite passed all 76 tests. The subsequently
  updated Bruno runner passed four focused tests, and shared stack discovery passed 12 tests.
- `corepack pnpm exec jest organization-directory.integration.spec.ts --runInBand`, with
  `TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL` supplied privately, passed all six tests against a uniquely created
  disposable database. Both its schema and database were removed.
- `corepack pnpm --filter ./apps/web test:ci --maxWorkers=2` passed all 607 tests across 29 files, including 25 credit
  component tests. Web typecheck, focused web lint, root typecheck, and root lint passed. Root lint retains one existing
  warning in `src/libs/config/src/load-secrets.spec.ts`.
- `corepack pnpm --filter ./apps/web test:platform-credits` passed 24 browser scenarios at 1440 by 900 and 320 by 720.
  Coverage includes accessibility, confirmation focus, same-key recovery, hard refresh, expiration, permissions,
  storage failure, timeouts, delayed responses, and safe organization lookup failures. Browser plugin automation was
  unavailable; the repository Playwright configuration supplied rendered evidence.
- `corepack pnpm --filter ./apps/web browser-fixtures:bootstrap` passed for owner and MFA platform operator.
  `corepack pnpm --filter ./apps/web test:platform-credits-live` passed both live tests on `http://localhost:53000`.
  The owned organization moved through `0 -> 100 -> 125 -> 135`; replay stayed at `135`, a real key conflict returned
  `409` with observed balance `141`, and a lost absolute-set response refreshed to `500` before an explicit reset to zero.
  Success responses were `201` for additions and replay, and `200` for absolute sets. Customer reads and writes returned
  `403`. Cleanup verified no remaining organization, invitation, audit, account, grant, or debit rows for the fixture.
- `corepack pnpm bruno:platform-credits` passed 32 requests and 32 tests with Bruno 4.1.0 and no skips. Direct database
  checks verified balances `26`, `13`, `5`, and `19`, plus absolute set `33 -> 0`; all five fixture organizations and
  temporary reports were removed.
- `corepack pnpm architecture:check` passed for nine modules with zero violations. `corepack pnpm design:lint` passed
  without warnings; `corepack pnpm ui:audit` passed with zero findings. `git diff --check` passed.
- Harper passed the exact command below for all eight changed Markdown files:

      corepack pnpm docs:lint -- .agents/plans/frontend/17-administer-organization-credits.md DESIGN.md UX-CONTRACT.md docs/platform-credits.md src/libs/modules/credits/README.md src/libs/modules/identity/README.md src/libs/modules/organization-onboarding/README.md bruno/platform-credits/README.md

The screenshots use synthetic page data and stay outside the repository under `/tmp/lef-platform-credits-review`.
Live authentication and mutation runs suppress screenshots, traces, videos, and raw diagnostics. No complete recovery
key, cookie, token, invitation secret, or real customer data is recorded in this evidence. The development stack remains
available for review; only run-owned test resources were cleaned up. This is disposable local-stack evidence, not a
production validation claim.

### Back Navigation Spacing Follow-up, 2026-09-09

Review feedback identified insufficient separation between Back to organizations and the Organization credits title.
The link now uses a content-width block with the existing 24-pixel content-gap token below it. This is local page
spacing; shared tokens, interface behavior, API contracts, and ledger semantics are unchanged.

The web production build, focused ESLint, and premium audit passed. Direct browser measurements confirmed a 24-pixel
gap at 1440 by 900 and 320 by 720, visible keyboard focus, and no overlap or horizontal overflow. Bruno is not applicable to this follow-up because it changes
presentation only. A Docker registry connection failure prevented rebuilding the local gateway image; the newly built
static assets were copied into the verified checkout-owned gateway, and its served HTML matched the local build.

### Confirmation Button Spacing Follow-up, 2026-09-09

Review feedback showed the confirmation buttons touching the final details divider. Credit confirmation actions now
reuse the existing team dialog action spacing, adding the 24-pixel content gap above the button row. The same class
also separates abandonment actions from their recovery explanation. This reuses the shared visual contract without
changing API behavior or credit operations.

The web production build, focused ESLint, design lint, and premium audit passed. The built HTML, JavaScript, and CSS
were copied into the verified checkout-owned gateway and matched its served assets. Browser verification with
`node /tmp/lef-credit-dialog-spacing-check.mjs` passed all six add, set, and abandonment cases at 1440 by 900 and
320 by 720. Each footer had a 24-pixel gap, no horizontal overflow, visible Cancel focus, keyboard focus containment,
and Escape focus restoration. Accessibility checks found no serious or critical violations. Synthetic screenshots
remain under `/tmp/lef-platform-credits-review`. The Browser plugin was unavailable, so verification used Playwright.
Both existing success scenarios also passed with
`PLATFORM_CREDITS_SCREENSHOTS=1 corepack pnpm --filter ./apps/web test:platform-credits --grep='directory entry'`.
Bruno is not applicable because this follow-up changes presentation only.

### Organization Accessibility Timing Follow-up, 2026-09-09

Validation run `34366463913` failed the narrow organization recovery scenario during its accessibility scan; the
aggregate validation failure reported the same browser failure. The backend, web, contract, image, and repository
policy checks passed. Both earlier PR revisions passed the complete workflow.

A synthetic reproduction isolated a transient contrast ratio of 4.37 to 1 on the newly enabled Create organization button.
Its foreground changes immediately while its background completes the existing 140-millisecond transition. The
settled control passes the contrast check. The organization accessibility helper now waits for active animations to
finish before scanning, matching the existing credit helper. It retains every accessibility rule and assertion,
uses no fixed sleep or retry, and preserves the invitation artifact policy. Product code and HTTP behavior are unchanged.

An independent synthetic counterexample confirmed that the animation wait still rejects persistent low contrast.
The following checks passed with normal motion and the existing privacy reporter:

- `corepack pnpm --filter ./apps/web test:platform-organizations`: 16 of 16 scenarios.
- `corepack pnpm --filter ./apps/web test:platform-organizations --project=narrow-chromium --grep='lost response reconciles' --repeat-each=10`: 10 of 10 runs.
- `corepack pnpm --filter ./apps/web test:platform-credits`: 24 of 24 scenarios.
- Focused ESLint, web type checking, and `git diff --check`.

The PR's Validate workflow supplies remote validation for this fix. Bruno is not applicable because only browser
test timing changed; every HTTP assertion and product behavior remains unchanged.

## Plan readiness

Ready to implement.
