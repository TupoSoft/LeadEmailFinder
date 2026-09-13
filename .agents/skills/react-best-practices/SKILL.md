---
name: react-best-practices
description: LeadEmailFinder React guidance for state ownership, rendering, Effects, data fetching, and measured performance. Use when writing, reviewing, or refactoring apps/web components and hooks. Adapts Vercel guidance to the repository's React, Vite, React Router, and TanStack Query stack.
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

## Repository Scope

This copy is adapted for LeadEmailFinder. Apply the relevant React and JavaScript guidance to `apps/web`, which uses React, Vite, React Router, CSS Modules, and CSS custom properties. The frontend road map selects TanStack Query for authenticated server state. Do not introduce SSR, `Next.js` server components, `Next.js` APIs, or SWR from the generic examples below.

Read root `DESIGN.md`, `UX-CONTRACT.md`, and `premium-ui.json` before UI changes; approved design decisions take precedence over generic aesthetic advice. Routine features extend that system without new concept generation. Root `corepack pnpm ui:audit` remains the audit owner. Use the current package test scripts for browser validation when plugin tools are unavailable. Provenance and adaptations are recorded in `SOURCE.local.json`.

## Repository React Practices

Apply these rules to the affected feature. The [frontend architecture instructions](../../../apps/web/AGENTS.md)
own application boundaries and data lifetimes; the [UX contract](../../../UX-CONTRACT.md) owns observable behavior.

### State Ownership

| State | Owner and decision |
| --- | --- |
| Server data | Existing TanStack Query adapters or the feature's documented direct-request boundary; avoid a second copy in component or global state. |
| Shareable navigation | React Router URL state for permitted filters, sort, or paging; follow the UX contract's sensitive and transient state exceptions. |
| Editable drafts and temporary UI | The nearest component or feature hook shared by their consumers, within the feature's cleanup contract. |
| Workflow coordination | The owner and lifetime required by the feature contract, including coordination that survives route changes. |
| Calculated values | Derive from authoritative inputs during render; do not synchronize another state value with an Effect. |

- Distinguish an editable draft from its server snapshot. Define when editing starts, resets, and reconciles with a
  refresh; background reads must not silently overwrite unsaved input. Sensitive values retain their stricter owners.
- Use explicit states or a discriminated union when independent flags would allow impossible workflow combinations.
  Simple independent UI toggles do not need a state machine.
- Include every changing input that determines query results in the established query-key scheme, including the
  required principal or organization scope and applicable filters or paging. Pass the query's abort signal through
  its adapter where supported; keep authentication generation checks and the established retry policy.

### Rendering and Effects

- Keep rendering pure: do not start requests, mutate shared data, or write browser storage during render. Keep Hooks
  unconditional and preserve stable item identity with data-derived keys for lists whose items can move or change.
- Handle user-triggered submissions and workflow actions in event handlers. Use Effects to synchronize external
  systems such as subscriptions, timers, or browser APIs. Use existing query adapters for ordinary server reads;
  preserve documented direct-request exceptions, including invitations and one-time secrets.
- Declare all reactive Effect dependencies. Restructure the work when dependencies cause unnecessary repetition;
  do not suppress dependency checks or use a ref to hide a stale dependency.
- Pair setup with cleanup for listeners, timers, and requests owned by the Effect. Setup, cleanup, and setup again
  must preserve behavior under the route's lifecycle contract. Preserve the documented one-time invitation exception
  to development Strict Mode remounts; ordinary routes retain those checks. Do not use a run-once ref to conceal
  missing cleanup or let component cleanup cancel coordination whose contract outlives that component.

See the React guidance on [state structure](https://react.dev/learn/choosing-the-state-structure) and
[when an Effect is needed](https://react.dev/learn/you-might-not-need-an-effect).

### Measured Performance

- For performance work, identify an affected route or interaction and capture a baseline with representative data
  and device or network conditions. Choose evidence for the problem: a production bundle report, browser performance
  trace, React Profiler recording, or relevant Core Web Vitals. State the conditions and compare after the change;
  distinguish local measurements from field evidence and report when measurement is unavailable.
- Use existing React and Vite loading boundaries to split substantial optional code when load evidence justifies it.
  Preserve useful loading and failure recovery. Memoization, deferred rendering, and virtualization require a
  concrete cost or measured benefit; they must preserve focus, input responsiveness, and workflow semantics.
- Apply upstream rules selectively. Their impact labels are priorities for investigation, not measured defects in
  this application. Do not add dependencies, caching, or memoization solely to satisfy the catalog. Performance work
  does not relax authentication, data retention, or accessibility contracts.

The [Core Web Vitals guide](https://web.dev/articles/vitals) explains loading, responsiveness, and layout metrics.

## Upstream Performance Reference

The Vercel guide below contains 64 rules across 8 categories for React and `Next.js`. Use only examples supported by
the repository scope and the evidence for the current task.

## When to Apply

Reference these guidelines when:
- Writing new React components or `Next.js` pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/`Next.js` code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Rerender Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use `Promise.all()` for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use next/dynamic for heavy components
- `bundle-defer-third-party` - Load analytics/logging after hydration
- `bundle-conditional` - Load modules only when feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `server-auth-actions` - Authenticate server actions like API routes
- `server-cache-react` - Use `React.cache()` for per-request deduplication
- `server-cache-lru` - Use LRU cache for cross-request caching
- `server-dedup-props` - Avoid duplicate serialization in RSC props
- `server-hoist-static-io` - Hoist static input/output (fonts, logos) to module level
- `server-serialization` - Minimize data passed to client components
- `server-parallel-fetching` - Restructure components to parallelize fetches
- `server-after-nonblocking` - Use `after()` for non-blocking operations

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners
- `client-passive-event-listeners` - Use passive listeners for scroll
- `client-localstorage-schema` - Version and minimize `localStorage` data

### 5. Rerender Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional `setState` for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-simple-expression-in-memo` - Avoid memo for simple primitives
- `rerender-split-combined-hooks` - Split hooks with independent dependencies
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use startTransition for non-urgent updates
- `rerender-use-deferred-value` - Defer expensive renders to keep input responsive
- `rerender-use-ref-transient-values` - Use refs for transient frequent values
- `rerender-no-inline-components` - Don't define components inside components

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use `content-visibility` for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-hydration-suppress-warning` - Suppress expected mismatches
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals
- `rendering-usetransition-loading` - Prefer `useTransition` for loading state
- `rendering-resource-hints` - Use React DOM resource hints for preloading
- `rendering-script-defer-async` - Use `defer` or `async` on script tags

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache `localStorage`/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist `RegExp` creation outside loops
- `js-min-max-loop` - Use loop for minimum/maximum instead of sort
- `js-set-map-lookups` - Use Set/Map for `O(1)` lookups
- `js-tosorted-immutable` - Use `toSorted()` for immutability
- `js-flatmap-filter` - Use `flatMap` to map and filter in one pass

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-init-once` - Initialize app once per app load
- `advanced-use-latest` - useLatest for stable callback refs

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
