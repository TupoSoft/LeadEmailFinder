# Lead Email Finder UX Contract

This contract records observable frontend behavior that later product screens must preserve. Business policy remains
in its maintained source and is referenced here rather than repeated. Visual intent and token values live in
[`DESIGN.md`](DESIGN.md).

## Product Context

- **Audience:** People assessing email-address deliverability signals before deciding whether to send.
- **Primary jobs:** Understand what the product checks, follow the technical signal path, understand the limits of the
  result, and recover from an unknown public URL.
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

Only capabilities used by the current public routes are resolved. A later feature must add its applicable capability
before implementation rather than infer an owner from this limited foundation.

| Capability | Canonical owner               | Source of truth | Allowed variants                             | Verification                      |
| ---------- | ----------------------------- | --------------- | -------------------------------------------- | --------------------------------- |
| Scrollbar  | Global application stylesheet | `DESIGN.md`     | Document baseline; named geometry exceptions | Computed style and browser review |

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

- React Router owns `/` and the catch-all UI route. API path spaces remain reserved by the frontend road map.
- The public header exposes only `How it works`, `Signals`, and `Principles`, each with a real matching target.
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

The current routes have no dialog, drawer, toast, alert banner, tooltip, destructive confirmation, or unsaved state.
They must not imitate one. Later plans resolve and record those canonical owners before use.

## Async and Resilience

The public entry and not-found routes are static client content with no browser-to-API interface. They render without
NestJS, Docker, authenticated state, network data, or browser storage. Unknown-route recovery remains available when
optional decoration, animation, or an icon fails to render.

## Validation

There is no product form in this slice. Do not add a disabled, placeholder, or nonfunctional input to demonstrate a
future workflow. A later form plan must define schema ownership, error association, first-error focus, duplicate-submit
prevention, and recovery before implementation.

## Permission and Clipboard

There is no permission-gated action, clipboard action, or secret value on these routes. Authentication, account,
pricing, API, and verification actions remain absent until their owning plans implement working behavior.

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
headers. The serving topology introduces no authentication controls or feature screens. Its source contract is
`.agents/plans/frontend/06-serve-web-and-api-from-one-origin.md`; browser verification is owned by
`apps/web/tests/gateway` and the `corepack pnpm test:web-live` launcher.
