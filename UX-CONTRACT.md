# Lead Email Finder UX Contract

This contract records observable frontend behavior that later product screens must preserve. Business policy remains
in its maintained source and is referenced here rather than repeated. Visual intent and token values live in
[`DESIGN.md`](DESIGN.md).

## Product Context

- **Audience:** People assessing email-address deliverability signals before deciding whether to send.
- **Primary jobs:** Understand what the product checks, follow the technical signal path, understand the limits of the
  result, sign in to an organization workspace, and recover from an unknown URL.
- **Target markets:** No country-specific market is established for this release.
- **Active locales:** `en` only.
- **Language and content register:** English-first, concise, factual, and respectful. Copy is centralized by product
  area. Native-language review becomes required when another locale is added.
- **Timezone and calendar policy:** Not applicable to the public entry and not-found routes.
- **Accessibility target:** `WCAG 2.2 AA`.

## Business-Context Sources

| Domain or scope                            | Authoritative source                                                         | Source type                     | Reviewed date |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------- | ------------- |
| Product purpose                            | `README.md`                                                                  | Repository product overview     | 2026-09-05    |
| Public-entry scope and behavior            | `.agents/plans/frontend/01-establish-product-experience-and-public-entry.md` | Approved ExecPlan               | 2026-09-05    |
| Frontend route and architecture boundaries | `.agents/plans/frontend/README.md`                                           | Frontend road map               | 2026-09-05    |
| Verification-data responsibility boundary  | `docs/privacy/email-verification-processing-contract.md`                     | Engineering processing contract | 2026-09-05    |

The public entry explains technical deliverability evidence. It does not introduce a permission, privacy, billing,
authentication, or email-verification business decision.

## Visual Contract

- **Project design contract:** `DESIGN.md`.
- **Approved reference:** `apps/web/design/concepts/public-entry-approved.png`.
- **Token owner:** `DESIGN.md`.
- **Runtime token adapter:** `apps/web/src/styles/tokens.css`.
- **Mapping and drift gate:** `premium-ui.json` maps durable design paths to CSS custom properties;
  `corepack pnpm ui:audit` compares their values.
- **Supported themes:** One light theme, with system forced-colors behavior.
- **Review policy:** An approved durable system change updates the design contract, runtime adapter, manifest mapping,
  and visual evidence in the same pull request.

## Canonical UI Map

The shared owners below apply to public and authenticated routes. Later features register their own working routes
and reuse these primitives; navigation visibility follows effective capabilities returned by the API.

| Capability             | Canonical owner                                                | Source of truth | Allowed variants                                                             | Verification                                                          |
| ---------------------- | -------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Scrollbar              | Global application stylesheet                                  | `DESIGN.md`     | Document baseline; named geometry exceptions                                 | Computed style and browser review                                     |
| Navigation             | `ResponsiveNavigation`                                         | This contract   | Desktop navigation; inline narrow disclosure                                 | Component focus tests and Playwright                                  |
| Session                | `AuthProvider` and `AuthSession`                               | `frontend/08`   | Bootstrap, expiry, account failure, sign-out                                 | Generation, cache, and browser tests                                  |
| Action                 | `Action.module.css`                                            | `DESIGN.md`     | Primary and secondary                                                        | Browser focus and state checks                                        |
| Recovery               | `StateMessage`                                                 | This contract   | Pending, failure, signed-out, and forbidden                                  | Route, accessibility, and browser tests                               |
| Data panel             | `ProductPanel`                                                 | This contract   | Independent loading, retained data, read retry, and optional header action   | Billing and team component and browser tests                          |
| Content spacing        | `Stack`                                                        | `DESIGN.md`     | Content groups and related controls; parent owns direct-child spacing        | Static declaration checks and billing browser geometry                |
| Supporting text        | `SupportingText`                                               | `DESIGN.md`     | Compact explanatory paragraphs                                               | Static token checks and billing browser typography                    |
| Detail list            | `SignalDetails`                                                | `DESIGN.md`     | Evidence fields; supporting balance figures with regular-weight labels       | Billing and verification component and browser tests                  |
| Billing                | `BillingView` and billing query adapters                       | `frontend/10`   | Catalog, summary, history, and payment return                                | Component, API, Bruno, and stub browser tests                         |
| Form                   | `Form.module.css`                                              | This contract   | Email, role, password, description, and permission fields                    | Field validation and browser tests                                    |
| Select/Listbox         | Native select                                                  | This contract   | Operating-system role popup                                                  | Keyboard and narrow browser tests                                     |
| Dialog                 | `TeamDialog`                                                   | This contract   | Permission and lifecycle confirmations; one-time invitation and API key      | Focus, dismissal, and restoration tests                               |
| Team                   | `TeamPage`                                                     | `frontend/13`   | Active and disabled memberships                                              | Component, API, Bruno, and browser tests                              |
| Verification           | `VerificationPage`, `VerificationJobPage`, and `SignalDetails` | `frontend/11`   | Single submission, bounded job reads, and evidence fields                    | API, component, Bruno, and browser tests                              |
| File upload            | Native file input and `BatchVerificationPage`                  | `frontend/12`   | One CSV; local selection and explicit replacement/removal                    | Cache-boundary, component, and browser tests                          |
| Progress               | `ProgressIndicator`                                            | `frontend/12`   | Indeterminate upload or exact finite server progress                         | Semantic and narrow browser tests                                     |
| Batch verification     | `BatchVerificationJobPage` and shared polling policy           | `frontend/12`   | Validation, counts, safe failures, and retained CSV download                 | API, Bruno, component, and browser tests                              |
| API keys               | `ServiceClientsPage`                                           | `frontend/14`   | Server-ordered list, create, rotate, disable, and delete                     | Contract, component, privacy, and live browser tests                  |
| Platform organizations | `PlatformOrganizationsPage`                                    | `frontend/15`   | Cursor directory, tenant creation, and one-time owner invitation             | API, PostgreSQL, component, Bruno, and browser tests                  |
| Platform credits       | `PlatformCreditsPage`                                          | `frontend/17`   | Authoritative balance, confirmed add and absolute set, and explicit recovery | API, component, Bruno, accessibility, and browser tests               |
| Platform proxies       | `PlatformProxiesPage`                                          | `frontend/18`   | Cursor registry, credential-safe forms, and confirmed lifecycle actions      | API, component, Bruno, privacy, accessibility, and live browser tests |
| Invitation             | `InvitationPage` and invitation bootstrap                      | `frontend/13`   | Pending preview and generic terminal recovery                                | Secret lifecycle and live browser tests                               |

## Route and Copy Ownership

| Route or target | Owner                 | Document title                                            | Primary heading                          | Recovery or destination |
| --------------- | --------------------- | --------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| `/`             | Public-entry route    | `Lead Email Finder \| Verify the signal before you send.` | `Verify the signal before you send.`     | In-page section links   |
| Unknown UI path | Not-found route       | `Page not found \| Lead Email Finder`                     | `This signal ends here.`                 | Working link to `/`     |
| `#how-it-works` | Public-entry route    | Inherits the root title                                   | `Verify the signal before you send.`     | Remains on `/`          |
| `#signals`      | Signal-path component | Inherits the root title                                   | `Verification signals` (visually hidden) | Remains on `/`          |
| `#principles`   | Principles component  | Inherits the root title                                   | `Our principles guide every signal.`     | Remains on `/`          |

English copy lives outside `JSX` in the public-entry product-area copy module. Route components compose that copy and
must not create local synonyms for navigation, signal names, principles, recovery actions, skip navigation, or the
brand-home accessible name.

## Component Behavior

| Component    | Default                | Hover                 | Focus                               | Active                             | Disabled       | Busy           | Error          |
| ------------ | ---------------------- | --------------------- | ----------------------------------- | ---------------------------------- | -------------- | -------------- | -------------- |
| Header link  | Real fragment link     | Underline strengthens | Ink or evergreen outline is visible | Browser location reflects target   | Not applicable | Not applicable | Not applicable |
| Section link | Real fragment link     | Underline strengthens | Ink or evergreen outline is visible | Target section is reached          | Not applicable | Not applicable | Not applicable |
| Home link    | Real route link to `/` | Underline strengthens | Ink or evergreen outline is visible | Root route replaces the error view | Not applicable | Not applicable | Not applicable |

The signal path, principle icons, circuit traces, and brand marks are explanatory or decorative content. They do not
receive pointer handlers, button semantics, or focus stops.

## Flow Ledger

| Operation           | Trigger                           | Pending | Success destination  | Success feedback                                              | Failure recovery                                                 | Focus outcome                                             | Source ref    |
| ------------------- | --------------------------------- | ------- | -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------- |
| Navigate to section | Activate a header or section link | None    | Named section on `/` | URL fragment and the named section or visible signal sequence | Browser-native fragment behavior leaves the full document usable | Logical link order continues into the destination section | `frontend/01` |
| Open unknown path   | Navigate to an unmatched UI URL   | None    | Not-found route      | Specific title, heading, and explanation                      | Home link returns to `/`                                         | Main content precedes the recovery link in document order | `frontend/01` |
| Return home         | Activate the not-found home link  | None    | `/`                  | Root title and public entry replace the error view            | Browser back remains available                                   | Root landmark and heading retain logical reading order    | `frontend/01` |

These routes perform no API request and expose no loading, stale, empty, mutation, optimistic, retry, or conflict
state. A later API-backed plan must define those states before adding the corresponding workflow.

## Navigation and Responsive Behavior

- React Router owns `/`, `/auth/error`, `/app/**`, and the catch-all UI route. API path spaces remain reserved by the frontend road map.
- Preserve documented shareable navigation state through reload and browser history. Feature contracts determine
  which values belong in the URL. Email input, credentials, uploaded data, and one-time results must not become
  navigation state; organization and proxy continuation cursors remain transient. Invitation bootstrap retains its
  documented capture-and-clear behavior.
- The public header exposes `How it works`, `Signals`, and `Principles`, each with a real matching target, plus
  `Sign in`, which starts the existing browser sign-in flow with `/app` as its destination.
- The hero closes with `Continue to the principles` and a down cue targeting `#principles`. The principles section
  closes with `Back to how it works` and an up cue targeting `#how-it-works`; directional cues match the scroll result.
- Document titles are route-specific and set when route content changes; the static HTML title is only a startup
  fallback.
- The heading hierarchy contains one page heading followed by ordered section headings. Landmarks use semantic header,
  navigation, main, section, and footer elements.
- Keyboard order follows visual and document order. Every link has a visible focus indicator that is not obscured by a
  sticky surface.
- Wide layouts use an asymmetric thesis-and-diagram composition. Narrow layouts use one content column and a vertical
  signal path without changing the content tree, action set, or reading order.
- Text and actions remain available at a width of 320 CSS pixels without unintended horizontal document scrolling.
- At 200% zoom, text and controls remain readable and operable without clipping, overlap, or lost actions. Preserve
  document scrolling and the existing content order.
- Truncated essential copy is forbidden. Diagrams may simplify at narrow widths only when all text remains available.
- The not-found route is visually distinguishable from `/`, states what happened without blame, and leaves a direct
  keyboard-operable path home.

## Overlays and Feedback

The narrow application navigation is an inline, non-modal disclosure. It has no focus trap or obscured background.
Opening it focuses the first link; Escape and route selection close it and return focus to its trigger. The static public entry has no overlays. Team owns the confirmation and one-time-result dialog behavior below.

## Async and Resilience

The public entry and not-found routes are static client content with no browser-to-API interface. They render without
NestJS, Docker, authenticated state, network data, or browser storage. Unknown-route recovery remains available when
optional decoration, animation, or an icon fails to render.

For API-backed workflows, distinguish initial loading, empty results, background refresh, confirmed rejection, and
an unconfirmed mutation outcome where applicable. Keep confirmed data visible during refresh only while the feature
contract permits it, identify stale data, and provide the documented recovery action. Superseded responses must not
replace newer results or restore content after authentication, permission, or lifecycle boundaries. Refreshes and
repeated polls preserve focus and announce meaningful state changes according to the feature's flow.

## Validation

There is no product form in this slice. Do not add a disabled, placeholder, or nonfunctional input to demonstrate a
future workflow. A later form plan must define schema ownership, error association, first-error focus, duplicate-submit
prevention, and recovery before implementation.

## Permission and Clipboard

The public header provides sign-in. Authenticated routes display account context and effective capabilities.
Navigation filters only registered destinations by their required capability; the API remains the authorization
authority. Billing, team, service-client, and verification tools gain navigation entries when their working routes
ship. Team invitations use the one-time clipboard behavior defined below.

## Accessibility and Motion

- Use native links for navigation and native buttons for actions. Interactive controls have accessible names and
  preserve standard keyboard behavior. Decorative graphics are hidden from assistive technology; meaningful
  icons have adjacent visible text.
- Form fields have associated labels and expose validation errors in text through the field's accessible description
  and invalid state. Preserve the feature's first-error focus, duplicate-submit prevention, and sensitive-value cleanup.
- Focus indicators use an ink or evergreen outline with at least 3:1 adjacent contrast. Orange may provide an optional
  halo but never carries the focus indication alone. Forced-colors mode uses the system highlight.
- Color is never the only distinction between stages, principles, links, or focus state.
- `prefers-reduced-motion: reduce` disables decorative transitions, transforms, and smooth scrolling without removing
  content or changing hierarchy.
- Automated `axe` checks must report no serious or critical `WCAG 2.2 A` or `AA` violations.
- Browser review covers keyboard-only navigation, visible focus, and reachable controls at narrow and desktop
  viewports, including the open state of changed dialogs or disclosures. Automated checks do not establish complete
  accessibility; manually verify the affected keyboard and focus behavior.

## Verification

- **Static commands:** Web lint, typecheck, component tests, production build, `Design.md` lint, the strict premium UI
  audit, documentation lint, and `git diff --check`.
- **Browser matrix:** Chromium projects at 320 by 720 and 1440 by 900 CSS pixels, plus explicit 390 by 844 checks;
  both routes receive normal and reduced-motion coverage.
- **Accessibility checks:** React Testing Library semantics, Playwright keyboard coverage, and `axe` browser checks.
- **Component and visual regression:** Root and not-found screenshots at the committed desktop and narrow project
  viewports, compared with the approved concept where applicable.
- **Public-root evidence:** `apps/web/tests/e2e/public-entry.spec.ts`.
- **Not-found evidence:** `apps/web/tests/e2e/not-found.spec.ts`.
- **Accessibility evidence:** `apps/web/tests/e2e/accessibility.spec.ts`.
- **Visual evidence:** `apps/web/tests/e2e/visual.spec.ts` and its committed Playwright snapshots.
- **Project audit:** `corepack pnpm ui:audit` must exit zero in strict mode. The audit does not execute or replace the
  runtime commands declared in `premium-ui.json`.
- **Design contract lint:** `corepack pnpm design:lint` must exit zero with no warnings.

## Browser Origin and Route Ownership

The built product is served at `http://localhost:53000/` by the web gateway. Hard refreshes of UI routes preserve
React Router navigation and its global not-found experience. The gateway reserves `/v1`, `/verify`, `/verifyAsync`,
`/verifyBatch`, `/emails`, `/credits`, and `/docs`, including their descendants, for the API. It also reserves
`/health`, `/openapi.json`, `/docs-json`, and `/docs-yaml`. Unknown API paths retain backend JSON errors.

The gateway preserves API cookies, redirect locations, CSRF headers, and restrictive callback cache and referrer
headers. The gateway itself introduces no authentication controls; the application owns the sign-in link and shell. Its source contract is
`.agents/plans/frontend/06-serve-web-and-api-from-one-origin.md`; browser verification is owned by
`apps/web/tests/gateway` and the `corepack pnpm test:web-live` launcher.

## Authentication and Application Navigation

The source contract is `.agents/plans/frontend/08-sign-in-and-navigate-application-shell.md`. The browser uses the
existing generated API client and BFF cookies. It never handles OAuth tokens. The current-account response owns
identity and effective capabilities; roles are not interpreted as frontend permissions. Missing email uses the exact
copy `Email unavailable`. Organization and account information wrap in full and appear in the main content on phones.

| Route                      | Heading and document title prefix | Recovery                                          |
| -------------------------- | --------------------------------- | ------------------------------------------------- |
| `/app`                     | `Your workspace`                  | Refresh account or sign out                       |
| `/app/session-expired`     | `Your session has expired`        | Sign in to the preserved safe destination         |
| `/app/account-unavailable` | `Account unavailable`             | Start a fresh sign-in attempt                     |
| `/app/forbidden`           | `Access denied`                   | Back to workspace; keep the authenticated context |
| `/auth/error`              | `Sign-in did not complete`        | Start a fresh sign-in attempt                     |
| Unknown `/app/**`          | `Page not found`                  | Back to workspace                                 |

Every title ends with ` | Lead Email Finder` and contains no account information. Pending, unavailable, signing-out,
signed-out, and uncertain sign-out states use their own heading as the title prefix. The callback-error page uses only the
three public error codes to select stable copy; unknown codes receive generic recovery copy. They never render provider
messages or replay callback parameters. Public and callback-error routes do not request the session on mount.

| Operation                      | Pending                                                | Success                                     | Failure and recovery                                                                        |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Open a protected route         | Stable session-check region                            | Account and shell                           | Initial unauthenticated state starts sign-in; transient failure offers Try again            |
| Refresh account                | Stable session-check region                            | Fresh current-account value                 | Session loss leads to session expired; unusable context leads to account unavailable        |
| Sign out                       | Account and caches disappear immediately               | A confirmed 204 renders You are signed out  | Uncertain completion keeps data hidden and offers Retry sign-out or a fresh sign-in         |
| Restore a cached page          | Protected content is hidden before restoration         | Fresh account bootstrap                     | Normal session recovery; no restored account snapshot                                       |
| Receive another tab's boundary | Clear caches, abort old work, and hide account context | Fresh bootstrap after principal replacement | During sign-out, a still-valid old session is withheld and sign-out retry remains available |

The single application QueryClient defaults to no retries. Session bootstrap explicitly permits one retry for a
transient read failure; authentication and authorization failures are never retried. Mutation retries stay disabled.
An incrementing authentication generation and abort controller fence generated-client responses, including late
success, failure, and body parsing. Every session-loss, unusable-account, principal-replacement, and sign-out boundary
clears queries and mutations before installing a new account. Feature mutations use `useAuth().mutationOptions()` so late mutation callbacks also respect the authentication
generation. No cache is persisted to browser storage.

Same-origin tabs exchange only a boundary reason through `BroadcastChannel`. Each document announces its first
account installation once, because OIDC navigation replaces the originating document. An earlier incoming event does not cancel that pending announcement; later bootstrap responses to received
events do not announce again. A tab receiving sign-out never installs the old account from a bootstrap that races the server.
A reason-only event cannot distinguish a fresh session for the same membership from an old session during sign-out;
a suppressed tab therefore remains conservative and offers a fresh sign-in as well as sign-out retry. An unavailable
channel cannot block local cleanup. Page hide clears protected content so a cached page snapshot does
not contain the previous account; a persisted page show always checks the session again.

The shell registers Home, Verify an email, Billing, and Team with their effective capabilities. Later plans add their working destinations and required capabilities to the shared
navigation registry. This avoids presenting unfinished service-client screens as
available tools. Component tests exercise each capability independently of role and of route authorization.
The shared transport turns an operation-level 403 into access denied without signing out. No frontend capability
check predicts whether the backend will permit a deep link.

Focused evidence lives in `apps/web/src/app/AuthRoutes.test.tsx`, `apps/web/src/shared/ResponsiveNavigation.test.tsx`,
`apps/web/src/features/auth`, `apps/web/tests/e2e/auth-shell.spec.ts`, and `apps/web/tests/gateway`. Browser checks cover
the desktop and narrow baselines, keyboard navigation, recovery, reduced motion, and automated accessibility.

## Credit Purchases and Payment Return

The source contract is `.agents/plans/frontend/10-purchase-and-monitor-credits.md`. The credits module owns the
current-organization balance and the payments module owns the catalog and purchase history. Both UI routes reuse
the authenticated shell and generated-client transport. `/app/billing` uses the heading and title prefix `Billing`;
`/billing/complete` keeps the Billing title and adds a payment return notice. Billing navigation and reads require `billing.read`; purchase actions
additionally require `billing.manage`. The server enforces the corresponding permissions on every request.

Summary, catalog, and history load independently with organization-scoped cache keys. `ProductPanel` owns section
headings, optional header actions, stable loading feedback, retained safe data, and a read retry when a panel fails.
Header actions follow the description in reading order and retain their native button semantics. The document owns scrolling.
History uses a semantic table that becomes labeled rows at narrow widths. Ten rows appear per page, with explicit
previous and next actions. Pagination is local to the complete server response; no server pagination is implied.
The `page` query parameter preserves history navigation and is clamped to the available rows.
Dates use English formatting with an explicit UTC timezone. Money uses the server currency code and its
`Intl.NumberFormat` fraction digits, including zero-decimal currencies. Status always appears as text.

| Operation               | Pending                                                 | Confirmed response                                                      | Failure and recovery                                                                                                                                   |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start checkout          | Keep the selected action busy and prevent a second POST | Save only a temporary purchase hint, then navigate to the validated URL | An unavailable pack reloads the catalog; a provider failure reloads history; an uncertain result reloads history and balance before a deliberate retry |
| Return from payment     | Refresh history and summary                             | Render the status from history and the balance from summary             | A missing or unknown hint shows a generic notice and history; failed and expired purchases offer a return to billing                                   |
| Monitor pending payment | Read every five seconds, at most twelve times           | Stop on a terminal status                                               | Pause while hidden or offline; offer manual refresh after the bounded checks                                                                           |

The checkout request sends only `packId` and never retries automatically. A redirect, query parameter, or local hint cannot mark
a purchase paid or increment the balance. URL validation uses the same pure origin policy in the API and browser;
the browser receives only the normalized nonsecret origin array. Customer history and browser caches exclude
provider names, provider references, price identifiers, event identifiers, and raw payloads.

An organization-scoped record in the session QueryClient preserves the checkout lock and uncertain-result recovery
across in-app navigation. Session boundaries clear that record with the other authenticated data. A response that
arrives after leaving Billing cannot navigate from another screen. Reopening Billing offers `Continue to checkout`
for that confirmed response and does not create another purchase. History must refresh successfully before an
uncertain request permits another deliberate purchase action.

The optional same-tab hint expires after thirty minutes and contains the purchase UUID and expiry only.
It never supplies ownership authority or payment state. The return route accepts only a UUID hint
from the URL and finds it within the current organization's history. Terminal states clear the local hint. Initial
return navigation focuses the notice once; polling preserves the user's focus. Offline notices and partial errors
remain readable alongside previously loaded data.

## Verification Credit Accounting

The source contract is `.agents/plans/verification-billing/06-explain-verification-charges.md`. Billing leads with
available credits and separately labels reserved credits and total balance. Reserved credits are temporarily set
aside, not deducted. A check that finishes without a charge returns its reservation to availability. All three
figures come from the latest server summary. Loading and read errors preserve the existing independent panel
boundaries, and settlement updates use polite announcements without moving keyboard focus.

## Team Management and Public Invitations

The source contract is `.agents/plans/frontend/13-manage-organization-team.md`. Organization onboarding owns the
membership and invitation policies; identity owns persistence. The generated browser contract owns field and role
types. Navigation uses `team.manage`; direct authenticated navigation always requests the member list and obeys the
server's permission result. Team mutation rejections remain local so the form can explain hierarchy conflicts and
refresh authoritative data. Account and session failures retain the shared session recovery behavior.

| Route                       | Owner                | Title and heading                               | Recovery                                                    |
| --------------------------- | -------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `/app/team`                 | `TeamPage`           | `Team`                                          | Refresh members, inline mutation failures, or access denied |
| `/accept-invitation/:token` | Invitation bootstrap | Sanitized before router initialization          | Replace the current history entry with `/accept-invitation` |
| `/accept-invitation`        | `InvitationPage`     | `Accept invitation` with state-specific heading | Reopen the original link or sign in                         |

`Form.module.css` owns shared field, label, validation, and action-group styling. Forms use explicit labels,
application-owned validation, first-error focus, and duplicate-submit prevention. Native role selects use the
operating system's popup. `TeamDialog` owns the app's modal confirmation and one-time-result variants with native
background isolation, Escape dismissal, bounded scrolling, focus containment, and focus restoration. The least
destructive action receives initial focus for owner-role changes and membership removal.

The full member response includes active and disabled memberships in server order. Ten rows appear per local page;
the `page` query parameter preserves navigation and the visible page is clamped to available rows. Missing email
renders `Email unavailable`. Disabled memberships retain text status and expose no reactivation control. Role and
disable actions wait for the server and reload the list after success or rejection. A lost issuance response is
uncertain; a second invitation requires an explicit operator action and is never retried automatically.

Refresh members belongs to the Organization members panel header and stays disabled while a team operation or
member read is pending, or the browser is offline. It reloads authoritative membership data while retaining the
current list. Team operation feedback stays mounted within the panel's reserved live region; confirmed role changes
and disabled access retain their existing feedback focus behavior.

| Operation                           | Pending                                                                    | Confirmed result                                        | Failure and recovery                                                      |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Issue invitation                    | One request; safe email and role remain visible                            | One local dialog contains the URL                       | Explain rejection or uncertainty and refresh members                      |
| Copy invitation                     | Prevent duplicate copy                                                     | Remove the dialog and announce that the link was copied | Keep the current dialog available for manual copy                         |
| Change owner role or disable access | Confirm object and consequence before one request                          | Refresh server data and announce completion             | Keep server state authoritative and explain the rejection                 |
| Preview invitation                  | Stable loading region, no shared query                                     | Show organization, email, role, and UTC expiry          | Unknown, expired, and used states contain no invitation details           |
| Accept invitation                   | Clear the entered password after dispatch and prevent duplicate submission | Remove preview and authority; offer sign-in             | Clear all authority and password data; explain how to reopen or seek help |
| Restore a cached page               | Clear private data synchronously on page hide                              | A restored invitation asks for the original link        | No automatic preview, acceptance, or restored issued-link dialog          |

Preview, issue, and acceptance use direct generated-client requests with feature-local generation and abort control.
They never enter the shared MutationCache or query cache. Team issuance also retains the authenticated transport's
generation fence. Public requests omit credentials and CSRF data; subscribed session boundaries invalidate their
local authority. Old settlements cannot repopulate a dismissed or restored page. A token is held only in mutable
memory for the mounted public flow, and passwords remain in the input until submission or cleanup. Issued URLs
remain only in the current team dialog until copy, dismissal, navigation, or page hide. No secret enters storage,
feedback text, or browser telemetry. Clipboard contents explicitly requested by the user belong to the operating
system; the application clears its own copy buffers and selection without overwriting the user's clipboard.

The invitation bootstrap is the first application import. It removes the secret path, query, fragment, and history
state before initializing routes. Its one-time flow is excluded from development-only synthetic `StrictMode` remounts;
ordinary routes retain those diagnostics. React layout effects register cleanup before paint. Page hide and persisted page
show synchronously clear local authority, preview data, passwords, and issued URLs. Refresh and full-page history
navigation cannot reconstruct a consumed browser token. No sign-in session is requested on the public page.

Browser validation uses a dedicated configuration with trace, screenshots, video, DOM attachments, and raw failure
output disabled throughout invitation operations. Safe team-list screenshots are captured in a separate suite that
issues no invitations. Test fixtures generate authority at runtime; committed fixtures and validation artifacts
contain no real invitation token or password.

## Single Email Verification

The source contract is `.agents/plans/frontend/11-run-single-email-verification.md`. The form at
`/app/verifications/new` requires `verification.run`; the job route `/app/verifications/:id` requires
`verification.read`. Both use the generated same-origin client and the shared authentication boundary. The server
remains the permission and organization-ownership authority. Navigation registers only the working form destination.

The form states before submission that a new conclusive result costs one credit; cached and inconclusive results
are free. It uses a labeled native email field,
application-owned validation, first-invalid focus, and a stable submit button. A session-scoped coordinator preserves
pending and uncertain submission states across in-app navigation. Each deliberate submission creates a canonical
UUIDv7 request key using the browser cryptographic random source. A deliberate recovery reuses that key and the
original address. Neither value is placed in the URL, persistent storage, or logs. A confirmed identifier opens its
job route; a late success after leaving the form offers that same job link
on return. Authentication boundaries clear the coordinator and fence late responses.

A request rejected because the device clock is ahead explains how to correct that clock. The email remains valid,
and only a deliberate new submission creates a fresh request key after correction.

| Operation               | Pending                                           | Confirmed response                                      | Failure and recovery                                                                                            |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Verify email            | One request; prevent duplicate activation         | Navigate using the returned job UUID                    | Preserve the address; associate validation errors with the field                                                |
| Insufficient credits    | Keep entered values                               | No verification is claimed                              | Billing link only with `billing.read`; otherwise contact an organization owner                                  |
| Uncertain submission    | Never repeat the POST automatically               | No invented identifier or history entry                 | Recover deliberately with the original key and input; preserve uncertainty until the server confirms the result |
| Read job status         | Retain the last confirmed response                | Show queued, running, completed, failed, or unavailable | Mark retained data stale and offer Refresh status; never submit again                                           |
| Monitor active job      | One read every five seconds, at most sixty checks | Stop for completed, failed, and unavailable states      | Pause while hidden or offline; after a read error require a manual refresh                                      |
| Open or refresh job URL | Validate UUID shape, then read that job           | Restore the same organization-scoped status             | Missing and cross-organization jobs share Verification not found                                                |

Each state has an explicit heading and document title without email or account data. Hidden or offline pauses keep
confirmed data visible. Status announcements change only when the state or recovery instruction changes, rather
than on every successful poll. Completion focuses the result heading once when no control already has focus. Status refresh keeps keyboard
focus on its action while a read is pending, using the existing disabled appearance with `aria-disabled` and a
dispatch guard.
The form remains usable when a previously read balance is zero. Only the server determines cache reuse and funded
shared work. A `429` exposes the server retry time when supplied and allows only a deliberate retry after that time.
No job-retention guarantee, recent-history list, cancellation, automatic resubmission, or credit adjustment is implied.

`SignalDetails` renders email, local part, domain, nullable existence and catch-all signals, reviewed reason and source
labels, and optional pattern and mail-exchange fields. True, false, and null remain Yes, No, and Unknown. Completion
uses neutral evidence styling and never claims guaranteed delivery. Operation metadata distinguishes fresh, cached,
and shared evidence. Evidence observation and expiry use UTC; the request time never implies fresh evidence.
Charge status separates the original reservation, settlement in progress, confirmed charges, and unknown amounts.
Operation reservations retain their historical amount after settlement; they do not describe the current account hold. A missing
amount never implies zero. Completion and confirmed admission rejection refresh authoritative billing data only
for accounts with `billing.read`; the browser never subtracts credits locally. Unexpected server fields never enter
the job cache or markup. The shared `useBrowserAvailability` hook owns visibility and connectivity subscriptions for billing
and verification. Desktop, narrow, keyboard, reduced-motion, stale, error, and accessibility checks cover the routes.

## Organization API Keys

The source contracts are `.agents/plans/better-auth/02-organization-api-keys.md`,
`.agents/plans/frontend/14-manage-service-clients.md`, and
`src/libs/modules/service-client-management/README.md`. The page at `/app/service-clients` uses the title and heading
`API keys`. Navigation and route access require `service_clients.manage`. The server remains authoritative
for human-session authorization, tenant ownership, and grantable permissions. The create form renders exactly
`grantableServiceClientPermissions` from account context, preserving their order. It accepts an optional description
and requires at least one unique permission; backend validation also rejects stale or forged selections.

The list retains the complete server order and displays active and disabled keys. It shows ten rows per local
page, stores the page in the URL, and clamps after deletion or a refresh. Safe key prefixes, descriptions, permissions,
status, and UTC timestamps wrap fully. Loading, empty, offline, stale refresh, validation, access denial, and persistence
failures reuse the existing panel and state owners. Changes appear only after an authoritative list refresh.

| Operation               | Pending                                            | Confirmed result                                           | Recovery                                                   |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Create API key          | One request; prevent duplicate submission          | Open the one-time key dialog and refresh keys              | Correct definite rejection or reconcile an unknown outcome |
| Rotate API key          | Confirm that the current key stops working         | Open the new key once and refresh keys                     | Review the key before explicitly rotating again            |
| Disable API key         | Confirm permanent disablement                      | Refresh the status; offer no rotation or re-enable control | Refresh before deciding what to do next                    |
| Delete API key          | Name the key prefix and explain permanent deletion | Refresh and clamp the visible page                         | Refresh before another explicit action                     |
| Copy or download        | Only after an explicit user action                 | Announce completion without the key                        | Keep the dialog open on failure for an explicit retry      |
| Close or leave the page | Invalidate pending work and scrub local references | Show no key when returning                                 | A lost value cannot be retrieved again                     |

Create and rotate return safe metadata and `apiKey` once; lists contain `keyPrefix`, never `apiKey` or `keyHash`.
The frontend selects only safe metadata fields before caching them. An API key authenticates directly as a Bearer credential;
there is no client ID or OAuth token exchange. One-time responses use direct generated-client requests and feature-local abort and generation control. They never
enter query data, MutationCache, React state, storage, URLs, feedback, or telemetry. The dialog uses a local
reference and renders the API key only in its uncontrolled, initially masked field. Show and Hide are explicit
keyboard-operable controls. Clipboard export uses only the user-requested value. Download creates a temporary object
URL on demand, downloads `api-key.json` containing only `{ apiKey }`, revokes the URL, and explains that the file contains sensitive data.
The operating system owns explicitly exported clipboard and download data.

Dismissal, unmount, authentication boundaries, `pagehide`, and persisted `pageshow` invalidate the operation generation,
abort requests, and synchronously clear the secret field and local references before a restored page can paint.
Late responses cannot reopen the dialog. Create and rotate never retry automatically, including on reconnect.
Canceling the wait or losing a response after dispatch leaves the outcome unknown and refreshes the list; another
creation requires an explicit acknowledgment. A user may reconcile a newly listed key through delete or a fresh,
confirmed rotation. No recovery action silently repeats a mutation.

`TeamDialog` remains the canonical modal owner, with native background isolation, focus containment, Escape,
bounded scrolling, and focus restoration. Destructive confirmations initially focus Cancel. Secret tests use a
dedicated Playwright configuration that suppresses trace, screenshots, video, automatic attachments, and raw failure
output for the whole run. Runtime fixture values and secret-bearing downloads never become validation artifacts.

## Batch Email Verification

The source contract is `.agents/plans/frontend/12-run-batch-email-verification.md`. The form at
`/app/verifications/batches/new` requires `verification.run`; the job URL at `/app/verifications/batches/:id`
requires `verification.read`. The browser reuses the generated same-origin transport and authentication boundary.

The visible native picker explains the lowercase `email` header, one address per row, and the 100-megabyte limit
before selection. That concise format help stays in the picker's accessible description. A labeled CSV format example
above the picker displays selectable literal bytes from the feature-local `batchCsvExample` constant, which is the
single source for any later sample download, and asks customers to replace its fictional `example.com` addresses.
Reading the guidance makes no request. Extension and size checks provide early feedback; server validation remains
authoritative. The selected file and filename stay local to the
mounted form. Acceptance, invalid-file rejection, removal, page hide, or route disposal clears file references and the native input.
A definite credit or rate-limit rejection retains the selection for a deliberate retry. No
file, multipart body, filename, or downloaded CSV enters shared caches, persistent storage, or diagnostics.

| Operation        | Pending                                                                   | Confirmed response                                                                            | Failure and recovery                                                                   |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Upload CSV       | Disable duplicate submission and replacement; indeterminate Uploading CSV | Open the returned batch UUID route                                                            | Associate a rejected file with correction guidance; clear selection                    |
| Uncertain upload | Never retry the POST automatically                                        | No invented job link                                                                          | Explain possible job creation and charging; require acknowledgment and fresh selection |
| Read batch       | Shared five-second polling with at most sixty checks                      | Show exact server progress and counts                                                         | Pause when hidden or offline; retain stale values and offer manual refresh             |
| Terminal status  | Stop automatic polling                                                    | The server’s `resultsAvailable` flag enables result download only for eligible completed jobs | Failure uses a safe code; unavailable makes no outcome or charging claim               |
| Download result  | Disable duplicate activation during the authenticated GET                 | Start the CSV download and revoke its object URL                                              | Retry only the GET; a later 404 renders Result no longer available                     |

`ProgressIndicator` owns determinate and indeterminate semantics. Job progress uses the finite server value without
smoothing, estimates, or upload percentages. Zero counts during validation do not mean that the input is empty.
Announcements describe state changes rather than each count update; manual status reads preserve the user's focus.
Completion is announced once. A missing or foreign job uses the same non-disclosing recovery state.

Invalid CSV offers correction through a fresh selection. Insufficient credits links to billing only with
`billing.read`, otherwise it advises contacting an organization owner. Generic processing failure preserves the
confirmed charge when supplied and otherwise leaves the amount unknown. Failed batches report no downloadable
results, including failures after settlement; failure copy explains that the results are unavailable. This follows
`.agents/plans/batch-verification-hardening/06-report-downloadable-results.md`. Unavailable states and download errors
never trigger another upload. There is no
batch history, cancellation, resumption, automatic retry, or browser result preview.

Batch accounting displays the server's total rows, unique addresses, duplicate rows, cached addresses, shared
addresses, original reservations, and charged credits. Every original CSV row is retained in the download. Funding and
settlement states stay visible, and neither row counts nor success counts predict a charge. A zero balance does not
disable upload. Status refresh, reload, and download only read existing work. Rate limits expose the supplied retry
time and require a deliberate retry. Terminal or settled accounting refreshes the billing summary with the existing
permission and session guards.

## Platform Organization Bootstrap

The source contract is `.agents/plans/frontend/15-bootstrap-customer-organizations.md`. The route
`/app/platform/organizations` has heading `Organizations` and title `Organizations | Lead Email Finder`.
Only `platform.organizations.manage` exposes its navigation and content. The API independently requires
`platform:admin` on both `GET` and `POST /v1/organizations`.

The directory uses the server's opaque continuation unchanged, appends unique IDs, and shows Load more only when
a continuation exists. Refresh organizations starts at the first page; confirmed creation also resets the directory.
There is no numeric total, guessed page count, or terminal-page claim. A malformed cursor offers a fresh read.
Failed later reads preserve existing rows and permit an explicit retry. Names, identifiers, and UTC timestamps wrap
fully in both desktop rows and narrow cards. The document owns scrolling. Cursors stay in transient query state;
they are not shareable navigation or persistent browser state.

Create organization validates Organization name and First owner email, focuses the first invalid field, and submits
once. This operation uses the generated client outside `QueryCache` and `MutationCache`, following the existing team
invitation pattern. An abort controller and operation generation ignore late responses after Cancel waiting,
navigation, unmount, pagehide, or restored pageshow. Successful creation keeps the invitation URL only in the visible
local dialog and an uncontrolled input. The copy action, dismissal, navigation, and page lifecycle events clear the URL.
Restoring a cached document cannot redisplay the invitation. The creation response is `no-store`, and the directory
never contains invitation data.

An unconfirmed outcome refreshes the directory and disables further creation until the operator explicitly selects
I have reconciled the unconfirmed creation. Cancellation cannot undo a server write. A secret-free reconciliation
marker survives route navigation and cached-page restoration in memory. A membership-scoped session-storage flag
also preserves reconciliation across an ordinary reload; it is written before dispatch and cleared on a confirmed
outcome or explicit acknowledgment. Neither mechanism stores submitted fields or invitation content. If session
storage is unavailable, the memory guard still covers the current document and its cached restoration. Automatic mutation retries are disabled. The UI provides no invitation recovery or email delivery.

The platform tests use the existing invitation artifact policy: no screenshots, traces, videos, response dumps, or
DOM attachments during creation or authentication. Deterministic browser tests cover 1440 by 900 and 320 by 720
viewports, keyboard focus, accessibility, lost responses, delayed settlement, and page restoration. A separate live
suite uses the owned development stack and MFA-aware operator fixture. The privacy guard exercises deliberate
assertion and timeout failures before inspecting output for runtime secret markers.

## Platform Organization Credits

The source contract is `.agents/plans/frontend/17-administer-organization-credits.md`. The route
`/app/platform/organizations/:organizationId/credits` and directory action require `platform.credits.manage`.
The title and primary heading are Organization credits. All API operations independently require `platform:admin`.
The page reads organization details by UUID before reading balance. Invalid IDs return to the directory; missing or
denied organizations expose no balance. Navigation state may supply an initial name but never establishes authority.

Add credits and Set absolute balance are separate panels. Both confirm organization, current server balance, operation,
and requested value using `TeamDialog`, initially focusing Cancel. The displayed balance stays unchanged while the
request is pending. Both operations disable automatic retries and reload the authoritative balance after settlement.
A failed refresh blocks further mutations until a successful read. An uncertain absolute set reports only observed
balance; a matching value does not prove which request caused it.

An addition generates one UUID after confirmation and persists a versioned record before dispatch. Its membership,
organization, amount, key, state, and creation time live only in principal-scoped, per-tab session storage; the full
key never enters shared query or mutation caches, rendered content, or diagnostics. Storage failure prevents dispatch.
One unresolved record blocks a separate addition or absolute set until resolution or explicit abandonment.
Explicit retries preserve the original key and amount. Conflict retains the record and requests reconciliation.

Hard refresh restores only a valid record matching the confirmed membership and route organization, then requires
organization and balance reads before exposing recovery. It never resends automatically. Malformed and foreign records
are removed without displaying their contents. Logout, expired or unusable sessions, and principal replacement remove
inapplicable records. Page hiding preserves a matching recovery key while the session boundary hides account data;
cached-page restoration reconfirms identity before exposing recovery.

The local recovery window lasts 24 hours. Expiry disables retry but retains the record until the operator acknowledges
that server application remains unknown. Abandonment explains this uncertainty and the loss of recovery before clearing
the key. Closing the tab or clearing browser storage also loses recovery. The operator must reconcile the outcome
before making a separate adjustment; a balance read alone cannot establish causality. See
`docs/platform-credits.md` for the operator procedure.

## Platform Proxy Fleet

The source contract is `.agents/plans/frontend/18-operate-proxy-fleet.md`. The route `/app/platform/proxies`, its
navigation entry, and heading `Proxy fleet` require `platform.proxies.manage`. The document title is
`Proxy fleet | Lead Email Finder`. The API independently requires `platform:admin` for every management operation.

The registry consumes `nextPageToken` unchanged, appends unique IDs, and offers Load more only for a nonempty cursor.
Refresh proxies, creation, and deletion restart the directory. Edits and blacklist reports refresh all loaded pages
so their affected rows remain visible. No numeric total or page count is inferred. Cursors
remain transient query state because they are continuation instructions, not shareable resource locations. Initial
loading and retained data use `ProductPanel`; failed continuation reads keep existing rows and offer an explicit retry.
Invalid cursors request a fresh read. Denied reads hide registry data. Current details are read before any row action;
a missing record exposes no editable fields. Desktop and narrow layouts retain all metadata and actions.

The confirmed-change message appears while the resulting registry refresh is pending and clears when that refresh
settles. A failed refresh uses the panel's read-error state. Rejected writes and unconfirmed outcomes retain their
existing feedback and recovery actions. Dismissal or page hide also clears the transient confirmation.

Create proxy uses disabled as its explicit initial state. Edit proxy includes response-visible fields and omits state;
lifecycle changes have separate controls. Use authentication and Replace authentication start off with no credential
inputs in the document. Enabling either requires a complete pair. Replacement additionally requires an explicit
confirmation naming the endpoint and connectivity consequence. Turning replacement off omits authentication from
the PATCH body. Stored values cannot be read, removed, or recovered through this console.

Credential inputs are uncontrolled, proxy-specific, and excluded from application state. Forms and usernames use
`autocomplete="off"`; passwords use `autocomplete="new-password"` and offer explicit Show and Hide controls. These
hints supplement local cleanup and are not a security boundary. Direct generated-client writes stay outside
`QueryCache` and `MutationCache`, disable replay, discard mutation responses, and request `no-store`. An abort
controller and operation generation fence late results. Settlement, dismissal, unmount, pagehide, and persisted
pageshow clear credentials and close the form. Browser-restored values cannot submit automatically. Public reads
apply an explicit field projection before entering the query cache.

| Operation                | Confirmation and pending behavior                                        | Confirmed result                     | Recovery                                                           |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------ |
| Create proxy             | Starts disabled; prevent duplicate requests                              | Refresh the registry                 | Reconcile an unconfirmed creation before another write             |
| Edit visible fields      | Read current detail; omit authentication and lifecycle                   | Refresh the registry                 | Correct a rejection through a fresh form                           |
| Replace authentication   | Explain loss of old values and connectivity risk; initially focus Cancel | Clear input and refresh              | A redacted response cannot establish which credentials were stored |
| Activate, Drain, Disable | Name source, target, and allocation consequence; initially focus Cancel  | Refresh server state                 | Never infer that active leases or connections ended                |
| Report MX blacklist      | Validate one nonempty MX host                                            | Read the server's deduplicated array | Retry explicitly; no removal control                               |
| Delete proxy             | Name the exact endpoint and registry deletion; initially focus Cancel    | Refresh directory membership         | Reconcile before another explicit action                           |

No row changes optimistically. Mutations pause while a required read is pending, failed, or offline. Unexpected server
or network failure after dispatch is an unconfirmed outcome. Cancellation stops waiting but cannot undo a server write.
A secret-free, membership-scoped marker survives navigation and cached-page restoration in the current document.
It blocks another write until a successful registry read and explicit reconciliation acknowledgment; it does not
survive an ordinary reload. No recovery action automatically replays a mutation.

Credential browser tests disable traces, screenshots, videos, DOM attachments, and raw errors for the entire run.
Runtime marker guards exercise assertion, timeout, and teardown failures and inspect CLI output and artifact files.
Live tests use the owned disposable stack, the MFA-aware operator fixture, a unique description, and captured IDs;
The cleanup step deletes only the exact fixtures created by the tests.
