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

| Capability | Canonical owner               | Source of truth | Allowed variants                             | Verification                      |
| ---------- | ----------------------------- | --------------- | -------------------------------------------- | --------------------------------- |
| Scrollbar  | Global application stylesheet | `DESIGN.md`     | Document baseline; named geometry exceptions | Computed style and browser review |
| Navigation | `ResponsiveNavigation` | This contract | Desktop navigation; inline narrow disclosure | Component focus tests and Playwright |
| Session | `AuthProvider` and `AuthSession` | `frontend/08` | Bootstrap, expiry, account failure, sign-out | Generation, cache, and browser tests |
| Action | `Action.module.css` | `DESIGN.md` | Primary and secondary | Browser focus and state checks |
| Recovery | `StateMessage` | This contract | Pending, failure, signed-out, and forbidden | Route, accessibility, and browser tests |
| Data panel | `ProductPanel` | This contract | Independent loading, retained data, and read retry | Billing component and browser tests |
| Billing | `BillingView` and billing query adapters | `frontend/10` | Catalog, summary, history, and payment return | Component, API, Bruno, and stub browser tests |

## Route and Copy Ownership

| Route or target | Owner                    | Document title                                            | Primary heading                      | Recovery or destination |
| --------------- | ------------------------ | --------------------------------------------------------- | ------------------------------------ | ----------------------- |
| `/`             | Public-entry route       | `Lead Email Finder \| Verify the signal before you send.` | `Verify the signal before you send.` | In-page section links   |
| Unknown UI path | Not-found route          | `Page not found \| Lead Email Finder`                     | `This signal ends here.`             | Working link to `/`     |
| `#how-it-works` | Public-entry route       | Inherits the root title                                   | `Verify the signal before you send.` | Remains on `/`          |
| `#signals`      | Signal-path component    | Inherits the root title                                   | `Verification signals` (visually hidden) | Remains on `/`      |
| `#principles`   | Principles component     | Inherits the root title                                   | `Our principles guide every signal.` | Remains on `/`          |

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

| Operation           | Trigger                           | Pending | Success destination  | Success feedback                                   | Failure recovery                                                 | Focus outcome                                             | Source ref    |
| ------------------- | --------------------------------- | ------- | -------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------- |
| Navigate to section | Activate a header or section link | None    | Named section on `/` | URL fragment and the named section or visible signal sequence | Browser-native fragment behavior leaves the full document usable | Logical link order continues into the destination section | `frontend/01` |
| Open unknown path   | Navigate to an unmatched UI URL   | None    | Not-found route      | Specific title, heading, and explanation           | Home link returns to `/`                                         | Main content precedes the recovery link in document order | `frontend/01` |
| Return home         | Activate the not-found home link  | None    | `/`                  | Root title and public entry replace the error view | Browser back remains available                                   | Root landmark and heading retain logical reading order    | `frontend/01` |

These routes perform no API request and expose no loading, stale, empty, mutation, optimistic, retry, or conflict
state. A later API-backed plan must define those states before adding the corresponding workflow.

## Navigation and Responsive Behavior

- React Router owns `/`, `/auth/error`, `/app/**`, and the catch-all UI route. API path spaces remain reserved by the frontend road map.
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
- Truncated essential copy is forbidden. Diagrams may simplify at narrow widths only when all text remains available.
- The not-found route is visually distinguishable from `/`, states what happened without blame, and leaves a direct
  keyboard-operable path home.

## Overlays and Feedback

The narrow application navigation is an inline, non-modal disclosure. It has no focus trap or obscured background.
Opening it focuses the first link; Escape and route selection close it and return focus to its trigger. The public
routes have no overlays. Later plans resolve shared dialog and notification owners before adding those behaviors.

## Async and Resilience

The public entry and not-found routes are static client content with no browser-to-API interface. They render without
NestJS, Docker, authenticated state, network data, or browser storage. Unknown-route recovery remains available when
optional decoration, animation, or an icon fails to render.

## Validation

There is no product form in this slice. Do not add a disabled, placeholder, or nonfunctional input to demonstrate a
future workflow. A later form plan must define schema ownership, error association, first-error focus, duplicate-submit
prevention, and recovery before implementation.

## Permission and Clipboard

The public header provides sign-in. Authenticated routes display account context and effective capabilities.
Navigation filters only registered destinations by their required capability; the API remains the authorization
authority. Billing, team, service-client, and verification tools gain navigation entries when their working routes
ship. These screens expose no clipboard action or secret value.

## Accessibility and Motion

- All navigation uses native links. Decorative graphics are hidden from assistive technology; meaningful icons have
  adjacent visible text.
- Focus indicators use an ink or evergreen outline with at least 3:1 adjacent contrast. Orange may provide an optional
  halo but never carries the focus indication alone. Forced-colors mode uses the system highlight.
- Color is never the only distinction between stages, principles, links, or focus state.
- `prefers-reduced-motion: reduce` disables decorative transitions, transforms, and smooth scrolling without removing
  content or changing hierarchy.
- Automated `axe` checks must report no serious or critical `WCAG 2.2 A` or `AA` violations.
- Browser review covers keyboard-only navigation and visible focus at narrow and desktop viewports.

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

| Route | Heading and document title prefix | Recovery |
| --- | --- | --- |
| `/app` | `Your workspace` | Refresh account or sign out |
| `/app/session-expired` | `Your session has expired` | Sign in to the preserved safe destination |
| `/app/account-unavailable` | `Account unavailable` | Start a fresh sign-in attempt |
| `/app/forbidden` | `Access denied` | Back to workspace; keep the authenticated context |
| `/auth/error` | `Sign-in did not complete` | Start a fresh sign-in attempt |
| Unknown `/app/**` | `Page not found` | Back to workspace |

Every title ends with ` | Lead Email Finder` and contains no account information. Pending, unavailable, signing-out,
signed-out, and uncertain sign-out states use their own heading as the title prefix. The callback-error page uses only the
three public error codes to select stable copy; unknown codes receive generic recovery copy. They never render provider
messages or replay callback parameters. Public and callback-error routes do not request the session on mount.

| Operation | Pending | Success | Failure and recovery |
| --- | --- | --- | --- |
| Open a protected route | Stable session-check region | Account and shell | Initial unauthenticated state starts sign-in; transient failure offers Try again |
| Refresh account | Stable session-check region | Fresh current-account value | Session loss leads to session expired; unusable context leads to account unavailable |
| Sign out | Account and caches disappear immediately | A confirmed 204 renders You are signed out | Uncertain completion keeps data hidden and offers Retry sign-out or a fresh sign-in |
| Restore a cached page | Protected content is hidden before restoration | Fresh account bootstrap | Normal session recovery; no restored account snapshot |
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

The shell registers Home and capability-gated Billing. Later plans add their working destinations and required capabilities to the shared
navigation registry. This avoids presenting unfinished billing, team, service-client, or verification screens as
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
headings, stable loading feedback, retained safe data, and a read retry when a panel fails. The document owns scrolling.
History uses a semantic table that becomes labeled rows at narrow widths. Ten rows appear per page, with explicit
previous and next actions. Pagination is local to the complete server response; no server pagination is implied.
The `page` query parameter preserves history navigation and is clamped to the available rows.
Dates use English formatting with an explicit UTC timezone. Money uses the server currency code and its
`Intl.NumberFormat` fraction digits, including zero-decimal currencies. Status always appears as text.

| Operation | Pending | Confirmed response | Failure and recovery |
| --- | --- | --- | --- |
| Start checkout | Keep the selected action busy and prevent a second POST | Save only a temporary purchase hint, then navigate to the validated URL | An unavailable pack reloads the catalog; a provider failure reloads history; an uncertain result reloads history and balance before a deliberate retry |
| Return from payment | Refresh history and summary | Render the status from history and the balance from summary | A missing or unknown hint shows a generic notice and history; failed and expired purchases offer a return to billing |
| Monitor pending payment | Read every five seconds, at most twelve times | Stop on a terminal status | Pause while hidden or offline; offer manual refresh after the bounded checks |

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
