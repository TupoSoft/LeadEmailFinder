# Frontend Road Map

This road map adds a browser product to the existing repository. Each ExecPlan follows `.agents/PLANS.md`, maps to
exactly one pull request, and starts only after its listed dependencies are complete.

## Order and Dependencies

1. [Establish the product experience and public entry](01-establish-product-experience-and-public-entry.md) — no
   dependencies.
2. [Route OIDC provider traffic safely](02-route-oidc-provider-traffic-safely.md) — depends on `auth/06` and
   `auth/10`.
3. [Publish the browser current-account contract](03-publish-browser-current-account-contract.md) — depends on
   `frontend/02`, `auth/06`, `auth/08`, and `auth/12`.
4. [Harden authorization callbacks](04-harden-authorization-callbacks.md) — depends on `frontend/02`, `frontend/03`,
   `auth/06`, and `auth/12`.
5. [Publish browser API contracts and a generated client](05-publish-browser-api-contracts.md) — depends on
   `frontend/01`, `frontend/03`, and `frontend/04`.
6. [Serve the web app and API from one origin](06-serve-web-and-api-from-one-origin.md) — depends on `frontend/01`,
   `frontend/02`, `frontend/05`, and `privacy-compliance/03`.
7. [Make validation path-aware](07-make-validation-path-aware.md) — depends on `frontend/01`, `frontend/05`, and
   `frontend/06`.
8. [Sign in and navigate the application shell](08-sign-in-and-navigate-application-shell.md) — depends on
   `frontend/06`.
9. [Provision MFA-aware browser test identities](09-provision-mfa-aware-browser-test-identities.md) — depends on
   `frontend/08` and `auth/10`.
10. [Purchase and monitor credits](10-purchase-and-monitor-credits.md) — depends on `frontend/08`, `frontend/09`,
    `module-architecture/09`, `payments/03`, `payments/04`, `payments/05`, and `payments/08`.
11. [Run a single email verification](11-run-single-email-verification.md) — depends on `frontend/08`, `frontend/10`,
    `auth/05`, and `module-architecture/15`.
12. [Run batch email verification](12-run-batch-email-verification.md) — depends on `frontend/08`, `frontend/10`,
    `frontend/11`, `module-architecture/16`, `verification-reliability/02`, and `verification-reliability/03`.
13. [Manage an organization's team](13-manage-organization-team.md) — depends on `frontend/08`, `frontend/09`,
    `auth/07`, `auth/13`, and `module-architecture/06`.
14. [Manage organization service clients](14-manage-service-clients.md) — depends on `frontend/08`, `frontend/09`,
    `auth/08`, `module-architecture/07`, and `service-client-hardening/01`.
15. [Bootstrap customer organizations](15-bootstrap-customer-organizations.md) — depends on `frontend/08`,
    `frontend/09`, `frontend/13`, and `module-architecture/08`.
16. [Make platform credit additions idempotent](16-make-platform-credit-additions-idempotent.md) — depends on
    `payments/01` and `module-architecture/04`.
17. [Administer organization credits](17-administer-organization-credits.md) — depends on `frontend/09`,
    `frontend/10`, `frontend/15`, and `frontend/16`.
18. [Operate the proxy fleet](18-operate-proxy-fleet.md) — depends on `frontend/08`, `frontend/09`, and
    `proxy-fleet/10`.

## Shared Constraints

- The frontend lives in this repository as the independently buildable `apps/web` workspace package.
- The browser stack is React 19, TypeScript, Vite 8, React Router, CSS Modules, and project-owned CSS custom
  properties. TanStack Query owns server state once authenticated API-backed screens arrive; no general client-state
  store is added without a demonstrated need.
- Browser OAuth tokens remain server-side behind the existing BFF session. Browser code uses same-origin relative
  URLs, includes cookies deliberately, and treats server-provided capabilities as presentation hints rather than
  authorization.
- Every logout, expired/unusable session, or membership-principal replacement clears all authenticated query and
  mutation caches before new account data is installed. Sensitive mutation responses and variables use explicit
  reset and zero post-settlement retention.
- Plan 09 owns a development-only, MFA-aware Playwright fixture for the seeded owner and platform operator. Every
  later privileged live-browser gate bootstraps and uses that real conditional-OTP flow; no plan may claim live
  coverage from password-only automation, a service credential, a weakened realm role, or an injected BFF session.
- Authenticated product pages live under `/app/**`. Deliberate exceptions are `/`, `/auth/error`, the initial
  `/accept-invitation/:token` link, its immediately sanitized `/accept-invitation` route, `/billing/complete`, and the
  global React not-found fallback for any unknown non-API path. API path spaces remain reserved even when their names
  would otherwise suit a page.
- Full runtime Swagger remains available to developers. The normalized browser OpenAPI document uses an exact
  allow list that grows with the product slice consuming an operation; foundation work must not expose every
  controller speculatively.
- The only generated TypeScript output is `packages/api-client/src/schema.d.ts`. `openapi:export` and
  `openapi:generate` update committed artifacts; read-only `openapi:check` generates in a temporary directory and
  compares byte for byte. Batch binary schemas map to `Blob`, with explicit multipart and blob transport adapters.
- Root `DESIGN.md`, root `UX-CONTRACT.md`, and `premium-ui.json` are durable product contracts. User-approved visual
  concepts and established interaction behavior remain consistent across later plans. Plan 01 also establishes the
  portable `corepack pnpm ui:audit` command; later plans use it rather than a workstation-specific skill-cache path.
- Product copy is English-first and centralized for later localization. These plans do not add a localization
  framework, server-side rendering, search-engine optimization, or analytics.
- Each feature owns its loading, empty, error, recovery, responsive, keyboard, screen-reader, reduced-motion, and
  layout-stability behavior. There is no final catch-all polish plan.
- Every plan adds focused unit, accessibility, browser, OpenAPI, Bruno, and architecture coverage when its observable
  behavior crosses those boundaries. Generated types and source contracts must not drift silently.
- Plan 02 establishes a pinned, secret-safe Bruno launcher. A later plan that changes a collection registers an exact
  `bruno:<collection>` root command with collection-specific credential bootstrap, developer-sandbox selection, and a
  nonzero-execution check; validation never depends on a global CLI or ambient shell exports.
- Plans 01 through 14 form the customer-facing MVP and its required foundation. Plans 15 through 18 are platform or
  post-MVP work and may proceed independently as soon as their listed prerequisites are complete; there is no hidden
  whole-MVP completion barrier.
- The road map is development-only. It does not add production deployment, domains, TLS termination, high
  availability, database migrations, backfills, or production recovery work.
