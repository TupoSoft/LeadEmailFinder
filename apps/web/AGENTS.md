# Frontend Architecture

Applies to frontend implementation, refactoring, reviews, and the browser API boundary. Follow the current task and
applicable repository instructions/skills; this file does not authorize new features or unrelated redesigns.

## Choose the Smallest Useful Boundary

- Read the affected page, hooks, API functions, and tests; verify earlier observations against current code.
- Preserve React, Vite, React Router, TanStack Query (server-data caching), CSS Modules, and CSS custom properties.
- Keep simple screens as components, feature hooks, and API functions. Extract a workflow only for meaningful state,
  recovery, reuse, or isolated tests. Do not add architecture folders, classes, containers, or an interface per function
  just to match a pattern. A function can be a port: a required capability supplied by a caller.

## Assign Responsibilities Explicitly

| Responsibility                                         | Owner                                                 |
| ------------------------------------------------------ | ----------------------------------------------------- |
| Rendering, focus, field state, dialogs, navigation     | Page/component                                        |
| React lifecycle and server-query subscriptions         | Feature hook                                          |
| Complex workflow transitions and outcome decisions     | Plain feature functions/application module            |
| URLs, HTTP errors, serialization, response mapping     | Feature API adapter using the generated client        |
| Authentication transport, invalidation, cache lifetime | Shared authentication/transport                       |
| Reusable UI behavior/styles                            | Existing canonical component or focused shared module |

- Keep extracted policies independent of React, routing, query caches, and HTTP clients. Hooks connect them to the UI;
  moving everything into a hook does not establish independence.
- Keep ports with consumers; inject implementations at assembly. Define accepted inputs and guarantees for outcomes,
  errors, side effects, cancellation, and retries. Adapters (implementations of ports) must not strengthen input
  requirements or weaken guarantees. Do not inspect adapter identity to choose behavior.
- Application rules return semantic outcomes such as `insufficient-credits`; UI owns wording, translations, styling,
  and focus. Keep generated API types for direct presentation; add separate models/mappings only for actual policy.
  Keep generated contracts consistent with the OpenAPI definitions (machine-readable API definitions).
- Give state one owner and an explicit lifetime. Keep it close to consumers; derive calculable values.
  Use pure rendering, appropriate Effects/query dependencies, and measured performance changes.
- Preserve responsive layouts, URL behavior, keyboard/focus behavior, accessible controls, and reduced-motion support
  within the affected workflow; report other gaps without expanding scope.

## Compose Product Content with Shared Spacing

- Use [`Stack`](src/shared/Stack.tsx) for vertical groups in product panels: `gap="content"` between logical groups,
  `gap="control"` within them. Defaults are content; spacing tokens resolve to 24/12 pixels at the default root size.
- Parent groups own spacing. `Stack` removes direct-child outer margins; do not add feature margin/gap overrides,
  empty spacers, or line breaks. Nest stacks for groups; retain internal padding/row separators.
- Use [`SupportingText`](src/shared/SupportingText.tsx) for short explanations: compact text, readable contrast, no
  outer margins. Keep customer wording in its feature.
- `ProductPanel` owns headers, loading/feedback, reserved content space, and its section divider. Draw list dividers
  only between rows; verify single/empty lists. Change only affected layouts.
- The [billing panels](src/features/billing/BillingPanels.tsx) show the pattern. Shared components accept standard
  identity, role, visibility, language/direction, title, and ARIA attributes (accessibility metadata), without local
  styling overrides. Add a justified shared variant when a recurring layout needs one.
- Check desktop/mobile loading and recovery states and assert important gaps in browser tests.
  Inspect screenshots before updating baselines (approved comparison images); passing static checks or
  recording a new baseline does not establish visual correctness.

## Keep Shared Infrastructure Free of Feature Policy

- Keep feature imports/endpoint lists out of shared authentication/transport. Supply feature cleanup and recovery
  through small dependencies at application setup. Session expiry is global; feature rejection presentation is local.
- Preserve synchronous authentication cleanup even when a feature is unmounted. One failing cleanup must not prevent
  invalidation; do not defer required cleanup to a React Effect.
- Reuse existing shared owners, including components currently located inside a feature. Do not migrate them during
  unrelated work. When moving shared behavior, move its styles, update consumers/ownership records, and preserve
  behavior. Avoid shared utilities importing unrelated features; document small intentional feature contracts.

## Preserve Workflow and Data Lifetimes

- Distinguish component, server, and workflow state. Keep the single-verification coordinator alive across in-app
  navigation and clear it at authentication boundaries.
- Scope query keys/recovery records to organization or principal (authenticated caller). Preserve cancellation,
  request-generation checks, and protection against callbacks/parsing that finish after the session changes.
- On page hide or back/forward-cache restoration (a saved live page restored by browser history), clear protected or
  temporary data at the established boundary and reconfirm identity before showing protected content.
- Keep files, multipart upload bodies, invitation tokens, passwords, and one-time secrets out of shared caches and
  persistent storage. Retain cleanup/download-URL revocation. Limit allowed recovery records by fields, scope, retention.
- Distinguish confirmed rejection from unknown mutation outcome. Aborting a browser request does not confirm server
  cancellation. Preserve duplicate guards, acknowledgment, and reconciliation (checking the server's actual result).
- Do not add automatic mutation replay/retries. Preserve idempotency (repeating one operation does not repeat its
  effect), bounded polling, pause conditions, and terminal/recovery states.
- Server authorization, charging, and validation remain authoritative. Do not invent permissions, statuses,
  cancellation, history, or retry guarantees to simplify a frontend abstraction.

## Verify the Boundary You Changed

- Test outcomes/branches for extracted policies, HTTP contracts for adapters, and lifecycle/navigation/cache/auth
  behavior through component/integration tests. Do not test only private calls or mirror implementation.
- Reuse contract tests for interchangeable adapters; cover relevant input, errors, side effects, and cancellation.
  Fakes must preserve tested semantics; a stub is not proof of full conformance.
- For stateful changes, cover relevant duplicates, uncertain completion, navigation, logout/late responses, principal
  replacement, and cached-page restoration. Preserve expectations during extraction.
- Run applicable web lint, typecheck, tests, build, and browser checks; inspect affected shared UI visually.
  Cover observable HTTP changes with the appropriate Bruno request collection. Follow active validation requirements.
- Reviews must cite actual imports/responsibilities and consequences. Distinguish defects, trade-offs, and optional
  improvements; recognize existing functions/ports. Report executed checks, missing runtime evidence, and trade-offs.
