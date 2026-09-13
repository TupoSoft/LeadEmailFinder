# Frontend Architecture

Apply these instructions to frontend implementation, refactoring, and architecture review. Root
[`AGENTS.md`](../../AGENTS.md) also routes changes to the browser API boundary here. Follow the current task,
repository contracts, and applicable repository skills. This file adds architecture guidance; it does not authorize
new features, a redesign, or unrelated refactoring.

## Choose the Smallest Useful Boundary

- Read the affected page, feature hooks, API functions, and tests before choosing a design. Verify earlier review
  observations against the current code.
- Preserve the React, Vite, React Router, TanStack Query, CSS Modules, and CSS custom property stack. Follow
  [`DESIGN.md`](../../DESIGN.md), [`UX-CONTRACT.md`](../../UX-CONTRACT.md), and the active feature plan.
- Keep straightforward screens as focused components, hooks, and feature API functions. Extract a separate workflow
  when state transitions, recovery rules, reuse, or meaningful isolated tests justify it.
- Do not add domain/application/infrastructure folders, classes, a dependency injection container, or an interface
  for every function solely to resemble an architecture diagram. A function dependency can be a sufficient port.

## Assign Responsibilities Explicitly

| Responsibility | Appropriate owner |
| --- | --- |
| Rendering, focus, field state, dialog visibility, and navigation | Page or UI component |
| React lifecycle integration and server query subscriptions | Feature hook |
| Complex workflow transitions, eligibility, and outcome classification | Plain feature functions or a small application module |
| Endpoint paths, HTTP status translation, serialization, and response projection | Feature API adapter using the generated browser client |
| Session invalidation, authenticated transport, and cache lifetime | Shared authentication and transport code |
| Reusable UI behavior, styles, and browser utilities | An established canonical owner or a purpose-specific shared module |

- Keep extracted workflow policies independent of React, router, query-cache, and HTTP-client imports. Let hooks
  connect those policies to the application. Moving all code into a hook does not establish this independence.
- For a workflow that needs isolation, define a small contract around required operations and meaningful outcomes.
  For example, a verification submission can return a created job, invalid input, insufficient credits, or an
  unknown outcome. Its adapter translates the existing server contract; the UI decides how to present the result.
- Keep each such contract with the consuming feature or application module. Inject its implementation where the
  application or feature is assembled. Avoid requiring the workflow to import its concrete adapter.
- For each extracted port, state the accepted inputs and relevant promises about outcomes, errors, side effects,
  cancellation, and retries. Every implementation must accept inputs permitted by the port without stronger
  preconditions and preserve its promises without weaker guarantees.
- Keep adapters interchangeable through observable behavior; their internal implementations need not match. Do not
  make application code inspect adapter identity or invent success, retry, or cancellation guarantees to satisfy a
  contract. Preserve the documented distinction between an aborted request and a confirmed server outcome.
- Return semantic data and outcome codes from application rules. Keep user-facing wording, translations, styling,
  focus, and navigation in the UI. For example, return `insufficient-credits`; the UI chooses its message and any
  permitted billing link. Adapters translate transport details; application code owns workflow decisions.
- Retain generated API types for direct API presentation. Introduce a separate application model and mapping when
  independent policy or presentation requirements justify it; do not copy every response type mechanically. Change generated
  contracts through the repository's existing OpenAPI workflow.

## Apply Frontend Practices at Their Owner

- Give each state value one authoritative owner and an explicit lifetime. Keep state close to its consumers unless
  the feature contract requires a longer lifetime; derive values that can be calculated from existing state.
- Use the repository [React practices](../../.agents/skills/react-best-practices/SKILL.md#repository-react-practices)
  for state placement, pure rendering, Effects, query dependencies, and performance work supported by measurements.
- Use the [UX contract](../../UX-CONTRACT.md#navigation-and-responsive-behavior) for URL behavior and responsive
  layouts, and its [accessibility rules](../../UX-CONTRACT.md#accessibility-and-motion) for controls and feedback.
  Evaluate these rules within the affected workflow; report observed gaps without expanding an unrelated task.

## Keep Shared Infrastructure Free of Feature Policy

- Do not add product-feature imports or feature endpoint lists to shared authentication and transport code. Express
  necessary feature cleanup or operation-specific recovery through small explicit dependencies wired at application
  setup. Keep session expiry handling global; locate feature-specific rejection presentation with its feature.
- Preserve cleanup timing when introducing these boundaries. A callback or lifecycle registration must run at the
  required authentication transition even when its feature page is unmounted. Preserve failure isolation so one
  cleanup cannot prevent session invalidation. Do not replace synchronous cleanup with a later React effect.
- Reuse canonical UI owners before creating alternatives. Existing shared behavior may still live under a feature,
  such as `TeamDialog`; its location does not authorize a migration during an unrelated task.
- When shared ownership is part of the task, move the generic implementation and styles together, update affected
  consumers and canonical ownership records, and preserve behavior. Avoid routing shared utilities through unrelated
  features. Keep intentional dependencies on another feature's public contract explicit and small.

## Preserve Workflow and Data Lifetimes

- Distinguish UI state, server state, and workflow state. Choose each lifetime from the maintained contract. In
  particular, preserve the single-verification coordinator across in-app navigation and clear it at authentication
  boundaries; moving it into component state would change behavior.
- Preserve organization or principal scoping of query keys and recovery records. Retain cancellation and request
  generation checks, including protection against late callbacks and response parsing after session changes.
- Preserve the documented handling of page hide and restoration from the browser's back/forward cache. Clear
  protected or ephemeral data at the required boundary and reconfirm identity before restoring protected content.
- Keep upload files, multipart bodies, invitation tokens, passwords, and one-time secrets out of shared caches and
  persistent storage. Preserve existing local cleanup and download URL revocation. Keep explicitly permitted recovery
  records limited to the fields, scope, and retention required by their feature contract.
- Distinguish confirmed rejection from an unknown mutation outcome. Preserve duplicate-submission guards and
  acknowledgment or reconciliation requirements. Aborting a browser request does not prove the server canceled work.
- Do not introduce automatic mutation retries or replay merely to simplify a hook. Preserve each operation's
  established idempotency and recovery contract. Keep polling bounded, pause it when required, and stop at the
  documented terminal or recovery states.
- Keep server authorization, charging, and validation authoritative. Do not invent permissions, statuses, backend
  cancellation, history, or retry guarantees to make a frontend abstraction convenient.

## Verify the Boundary You Changed

- Test extracted decisions with ordinary inputs and explicit outcomes. Test adapters at the HTTP boundary and use
  component or integration tests for lifecycle, navigation, cache, and authentication behavior. Avoid tests that only
  assert internal helper calls or repeat the implementation.
- When multiple adapters implement the same port, reuse focused contract tests for the observable guarantees that
  consumers rely on, including relevant input, failure, side-effect, and cancellation cases. Add adapter-specific
  checks where needed. Fakes must preserve the semantics exercised by their tests; they need not reproduce unrelated
  infrastructure. A focused stub does not prove that an adapter satisfies the full contract.
- For changes to submission, session, or recovery logic, select relevant cases such as duplicate activation,
  uncertain completion, route departure, logout with a late response, principal replacement, or cached-page
  restoration. Preserve existing behavior tests when extracting code; do not rewrite their expected outcomes just
  to accommodate a new structure.
- Run the focused checks required by the active plan and changed behavior. Use the existing web lint, typecheck,
  test, build, and browser scripts as applicable; shared UI changes also use the repository's design and UI audits.
  Follow the root Bruno policy when observable HTTP behavior changes and the prose policy for documentation.
- In reviews, cite the actual import or responsibility that causes coupling and explain its practical consequence.
  Distinguish a demonstrated defect, a maintainability trade-off, and an optional refinement. Evaluate existing
  injectable functions and adapters before claiming that a feature has no ports.
- Report checks actually executed, any missing runtime evidence, and material architectural trade-offs. These
  instructions guide decisions; they are not an automated architecture gate.
