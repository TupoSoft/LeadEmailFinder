# Establish the Product Experience and Public Entry

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Create an independently buildable browser application and the durable design contracts that later product screens
will follow. A developer can start `apps/web`, open the public root, navigate the page by keyboard at desktop and
narrow widths, and see a deliberate Lead Email Finder experience plus a useful not-found screen without starting
the API. The accepted visual concept, design tokens, interaction rules, automated accessibility checks, and visual
baselines make later frontend pull requests extensions of one product rather than unrelated screens.

## Progress

- [ ] (2026-08-31) Generate a product-specific public-entry concept with `ImageGen` and obtain explicit user approval.
- [ ] (2026-08-31) Record the approved visual and interaction contract in root `DESIGN.md`, root `UX-CONTRACT.md`,
      and `premium-ui.json`.
- [ ] (2026-08-31) Add the independently buildable React 19, TypeScript, and Vite 8 `apps/web` workspace.
- [ ] (2026-08-31) Implement the polished public root and not-found routes from the approved concept.
- [ ] (2026-08-31) Add `Vitest`, React Testing Library, Playwright, `axe`, visual-regression coverage, and required web CI.
- [ ] (2026-08-31) Validate keyboard use, narrow layouts, reduced motion, accessibility, and approved visual fidelity.
- [ ] (2026-08-31) Run focused validation and update this living plan with evidence and outcomes.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep the frontend in this repository as an independently buildable `apps/web` pnpm workspace package.
  Rationale: Backend and browser contracts can change atomically while package-level scripts and Docker layers keep
  frontend work independently testable and cacheable.
  Date/Author: 2026-08-31, project planning.
- Decision: Use React 19, TypeScript 5.9, Vite 8, React Router 7, CSS Modules, and project-owned CSS custom
  properties.
  Rationale: The stack is small, typed, fast to build, and sufficient for the client-rendered application without
  adopting a styling framework or global state library before their need is demonstrated.
  Date/Author: 2026-08-31, project planning.
- Decision: Generate the first public-entry concept with `ImageGen` and require explicit user approval before writing
  implementation styling.
  Rationale: The approved concept is the visual source of truth; coding first would turn incidental CSS choices into
  a design system that has not been approved.
  Date/Author: 2026-08-31, project planning.
- Decision: Maintain root `DESIGN.md`, root `UX-CONTRACT.md`, and `premium-ui.json` as repository-owned contracts.
  Rationale: Later agents need exact visual tokens, route behavior, component ownership, and verification commands
  without depending on conversation history or a generated image alone.
  Date/Author: 2026-08-31, project planning.
- Decision: The first release is client-rendered and English-first, with copy centralized by product area.
  Rationale: Authenticated application workflows do not require server rendering, while centralized copy avoids
  scattering text before a later localization decision.
  Date/Author: 2026-08-31, project planning.
- Decision: Do not present sign-in, account, pricing, or API actions that are not functional in this pull request.
  Rationale: A polished entry must not contain misleading controls. Authentication and same-origin API access arrive
  in later plans.
  Date/Author: 2026-08-31, project planning.
- Decision: Do not add server-side rendering, search-engine optimization, analytics, or a production deployment.
  Rationale: These are separate product and operations decisions and are unnecessary to validate the first product
  experience locally.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The repository currently contains a NestJS API in `src/`, a single root `package.json`, and a
`pnpm-workspace.yaml` that pins pnpm behavior but declares no workspace package globs. There is no browser source,
frontend build, product design contract, or browser test project. The existing API and Docker stack remain outside
this pull request; `frontend/06` will connect them through one origin. The current Validate workflow covers only the
backend, so this plan must add required web checks rather than leave the new package locally validated only.

`DESIGN.md` is the durable visual system: product character, approved reference image, typography, color, spacing,
shape, motion, responsive rules, and rationale. `UX-CONTRACT.md` is the canonical route and interaction map:
navigation, control ownership, loading, error, focus, and copy behavior. `premium-ui.json` points
the premium UI audit at the web source, the canonical contract, project-owned validation commands, and evidence.

The public root is a real product entry, not an authenticated dashboard. It should explain the product's focused
email-verification value through a compact narrative and in-page navigation. The not-found route is the catch-all
UI experience and always offers a working path home. Neither route makes API requests.

## Scope and Non-Goals

This pull request adds the pnpm workspace globs, `apps/web`, its package and TypeScript/Vite/test configuration,
root design contracts, approved concept artifact, public root route, and not-found route. It may add narrow root
scripts that delegate to the web package, update the shared lockfile, and add CI that installs, lints, type-checks,
tests, and builds the web package on every pull request.

It does not add authentication, an application dashboard, billing, verification forms, API calls, generated API
types, a same-origin gateway, Docker images, path-based CI optimization, server rendering, search-engine
optimization, analytics, localization infrastructure, or production hosting. It does not imitate a future control
with a disabled or placeholder action.

## Plan of Work

Before implementing visual styling, use `ImageGen` to produce one clean, airy product concept for the public root at
desktop and narrow widths. The concept should feel precise, trustworthy, and human; it must avoid generic neon
gradients, stock dashboard chrome, excessive cards, and decorative controls. Show the generated artifact to the
user, record requested changes, generate a revision if needed, and obtain explicit approval. Save the accepted
reference under `apps/web/design/concepts/` and use image inspection during implementation to compare rendered
screens with it. Structural workspace and test scaffolding may precede approval, but styled component work may not.

Write root `DESIGN.md` in the `Design.md` format with exact, nonempty tokens and the reasoning behind the accepted
concept. Include typography assets, fallbacks, foreground/background pairs, spacing, width, border, and radius
conventions, focus treatment, restrained motion, breakpoint behavior, and disallowed patterns. Write root
`UX-CONTRACT.md` with the canonical ownership and behavior of `/`, the UI catch-all, header navigation, in-page
actions, the back-home action, keyboard focus, reduced-motion behavior, and centralized copy. Add
`premium-ui.json` with `apps/web/src` as the source root, `en` as the locale, `UX-CONTRACT.md` as the canonical map,
repo-owned unit/browser/accessibility/visual commands, and evidence paths for the root and not-found workflows.
Add a repository-owned `scripts/frontend/audit-premium-ui.mjs` strict audit entry point and root `ui:audit` script. It
loads `premium-ui.json`, validates the durable design/UX contract and source-root rules, runs without a user-specific
plugin-cache path, emits actionable findings, and exits nonzero on violations. Keep the frontend-design-premium skill
as the implementation-time design authority, but make the recorded project validation command portable.

Turn the root into an explicit pnpm workspace by adding `apps/*` and `packages/*` package globs without changing
the pinned package manager or backend package ownership. Create `apps/web/package.json` as the private
`@tuposoft/lead-email-finder-web` package. Configure React 19, React DOM, React Router 7, Vite 8, React SWC
integration, strict TypeScript, ESLint, `Vitest` 4 with `jsdom`, React Testing Library, Playwright, and `axe`. Keep package
scripts independently runnable: `dev`, `lint`, `typecheck`, `test`, `test:ci`, `build`, `preview`, `test:e2e`,
`test:a11y`, `test:visual`, and `verify:ui`.

Implement route composition and page components with semantic HTML, locally scoped CSS Modules, and shared CSS
custom properties. Keep global CSS limited to normalization, fonts, tokens, and base document behavior. Centralize
English copy outside `JSX`. Use responsive CSS rather than rendering separate mobile markup. Motion must be optional,
short, and disabled under `prefers-reduced-motion: reduce`. Ensure the root has no false affordances and the
not-found experience states what happened without blaming the user.

Add component tests for semantic structure, copy, route selection, and working navigation. Add Playwright projects
for a narrow Chromium viewport and a desktop Chromium viewport. Use `@axe-core/playwright` for accessibility and
committed screenshots for approved root and not-found states. Cover keyboard-only navigation, visible focus,
unknown-route recovery, no horizontal scrolling at narrow widths, and reduced-motion computed styles. Check for the
Browser capability at implementation time; use it for interactive review when available, otherwise record
why Playwright was used directly. Inspect the final screenshots next to the accepted concept and record any
intentional differences in `DESIGN.md` and this plan.

Extend `.github/workflows/validate.yml` with stable web validation that runs the package's lint, typecheck, unit,
accessibility, visual, and production-build commands. Keep these checks unconditional in this first frontend pull
request so the new package cannot merge without CI coverage. `frontend/07` may later make job selection path-aware
while preserving successful required-check names.

## Interfaces and Dependencies

The new workspace package is `@tuposoft/lead-email-finder-web` under `apps/web`. Its public development commands are:

    corepack pnpm --filter @tuposoft/lead-email-finder-web dev
    corepack pnpm --filter @tuposoft/lead-email-finder-web build
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e
    corepack pnpm --filter @tuposoft/lead-email-finder-web verify:ui
    corepack pnpm ui:audit

React Router owns `/` and the catch-all not-found experience. No browser-to-API interface is introduced. The package
depends on React 19, React DOM 19, React Router 7, and development-only Vite 8, TypeScript, ESLint, `Vitest`, `jsdom`,
React Testing Library, Playwright, and `axe` packages. Styling depends only on CSS Modules and CSS custom properties.

`DESIGN.md`, `UX-CONTRACT.md`, and `premium-ui.json` are shared inputs for every later frontend plan. The concept
artifact is reference evidence, not a runtime dependency.

## Acceptance Criteria

- `apps/web` installs and runs through its package filter without booting NestJS or Docker, and a production build
  completes independently.
- The user explicitly approves an `ImageGen` concept before styled components are implemented, and the final desktop
  and narrow screenshots remain recognizably faithful to the accepted hierarchy, typography, color, and rhythm.
- Opening `/` shows a polished, product-specific public entry with only working in-page navigation and no API
  request, sign-in control, fake dashboard data, or placeholder action.
- Opening an unknown UI path shows the deliberate not-found experience, announces the page purpose, and provides a
  keyboard-operable link back to `/`.
- At 320 CSS pixels wide, neither page has unintended horizontal scrolling, clipped text, overlapping controls, or
  an inaccessible navigation path. Desktop layout remains intentional at 1440 by 900 CSS pixels.
- Every interactive element is reachable in logical order with a visible focus indicator. Landmarks and heading
  order are meaningful, and automated `axe` checks report no serious or critical `WCAG` 2.2 A/AA violations.
- With reduced motion enabled, decorative transitions and smooth scrolling are removed without hiding content or
  changing the information hierarchy.
- Component tests, accessibility checks, both browser projects, and approved visual snapshots pass from a clean
  checkout.
- Root `DESIGN.md` passes the `Design.md` linter, the premium UI audit passes in strict mode, and changed English
  Markdown passes the repository Harper command.

## Validation

Install and run the independent static checks and unit suite:

    corepack pnpm install --frozen-lockfile
    corepack pnpm --filter @tuposoft/lead-email-finder-web lint
    corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
    corepack pnpm --filter @tuposoft/lead-email-finder-web build

Require the same commands to complete in the Validate workflow; local success does not substitute for CI wiring.

Run the browser, accessibility, and visual checks against the package's configured preview server:

    corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install chromium
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual

Review `/` and an unknown route at 320 by 720, 390 by 844, and 1440 by 900 CSS pixels. Use only the keyboard to
exercise header and recovery navigation, repeat with reduced motion enabled, inspect the console and network log,
and compare captured screenshots with the approved concept. Record whether the Browser plugin or direct Playwright
performed the interactive review.

Validate the durable contracts and prose:

    npx -p @google/design.md designmd lint DESIGN.md
    corepack pnpm ui:audit
    corepack pnpm docs:lint -- DESIGN.md UX-CONTRACT.md .agents/plans/frontend/README.md .agents/plans/frontend/01-establish-product-experience-and-public-entry.md
    git diff --check

Do not mark browser or visual checks complete from component tests alone. Record snapshot-update rationale rather
than accepting changed images automatically.

## Idempotence and Recovery

Workspace generation, dependency installation, builds, and tests are safe to repeat. Keep the accepted concept in
version control before updating visual snapshots so a failed styling pass can be compared or reverted without
regenerating the design. Generated build, coverage, and Playwright-output directories remain ignored.

If installation or browser download fails, preserve the lockfile and source, retry with the repository's pinned
pnpm version and writable temporary directories, and record the checks that did not run. If visual approval is withdrawn,
stop styling work, retain the last accepted artifact, and obtain approval for a revised concept before continuing.
No persistent application data, schema reset, Docker cleanup, or reseed is involved.

## Artifacts and Notes

Retain the approved concept, the final narrow and desktop screenshots, a summary of the Playwright HTML report, the `axe` results,
and a short list of intentional concept-to-code differences. Do not commit browser caches, full test traces from
successful runs, or generated build output.

This plan has one independently observable outcome and maps to one pull request. The visual approval is an explicit
first implementation milestone, not a hidden product choice; all stack, scope, route, interaction, and validation
decisions needed to begin are recorded above.

## Plan readiness

Ready to implement.
