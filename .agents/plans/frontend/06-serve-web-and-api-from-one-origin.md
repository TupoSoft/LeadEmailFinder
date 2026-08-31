# Serve the Web App and API from One Origin

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the independently buildable web app and NestJS API behave as one browser origin in development. Opening
`http://localhost:53000/` serves React; explicit API, health, Swagger, and OpenAPI paths proxy to NestJS; and unknown
API paths retain JSON errors rather than becoming the SPA. A developer can complete a real Keycloak cookie session
through the gateway, while API and web images remain separate and independently buildable.

## Progress

- [ ] (2026-08-31) Add matching explicit API route maps to the Vite proxy and Nginx gateway.
- [ ] (2026-08-31) Build the web in Node 24 and serve it from a pinned unprivileged Nginx image.
- [ ] (2026-08-31) Move host port 53000 from the API container to the web gateway.
- [ ] (2026-08-31) Update health, reset, and developer workflows for the two-image topology.
- [ ] (2026-08-31) Add required API/web image, route, and same-origin browser CI coverage.
- [ ] (2026-08-31) Add route-ownership smoke tests and live same-origin Playwright coverage.
- [ ] (2026-08-31) Add static security headers and query/secret-safe gateway access logging.
- [ ] (2026-08-31) Run image, Compose, browser, architecture, prose, and repository validation.

## Plan dependencies

- `frontend/01`
- `frontend/02`
- `frontend/05`
- `privacy-compliance/03`

## Surprises & Discoveries

- `docker/compose.yaml` currently publishes API port 3000 as host port 53000. The future web gateway must become the
  only owner of that host port without breaking the API's internal health check.
- The API contains both versioned and legacy unversioned route prefixes. A broad SPA fallback would disguise unknown
  children such as `/verify/not-real` as successful HTML.
- The development reset script knows the current service set and has explicit project-ownership safeguards that must
  remain intact when `web` is added.
- `privacy-compliance/03` owns the API's `pino-http` request serializer and proves that address-bearing `/emails/:email`
  paths and request data never enter API logs. This plan consumes that logger and owns the separate Nginx boundary.

## Decision Log

- Decision: Keep one browser origin at `http://localhost:53000`; the web gateway owns the host port and reaches the API
  at `api:3000` inside Compose.
  Rationale: BFF cookies, CSRF origin checks, redirects, and relative generated-client URLs remain coherent without
  CORS or browser token storage.
  Date/Author: 2026-08-31, project planning.
- Decision: Build static assets in a Node 24 stage and serve them from a pinned unprivileged Nginx runtime; keep NestJS
  in its own image.
  Rationale: Images remain independently cacheable and testable, and the static gateway needs no Node application
  server at runtime.
  Date/Author: 2026-08-31, project planning.
- Decision: Proxy only an explicit API route map and apply SPA fallback only after API paths are excluded.
  Rationale: Unknown API routes must keep backend status and JSON content type instead of looking like UI success.
  Date/Author: 2026-08-31, project planning.
- Decision: Use the same route ownership in Vite development and Nginx runtime.
  Rationale: A feature must not work under one development server and fail only after the production-style image is
  built.
  Date/Author: 2026-08-31, project planning.
- Decision: Add the topology's image, route, and browser checks unconditionally before optimizing job selection in
  `frontend/07`.
  Rationale: This pull request proves the new runtime directly; change discovery is independently reviewable and must
  not obscure whether the gateway checks are required.
  Date/Author: 2026-08-31, project planning.
- Decision: Apply an explicit browser security-header baseline to web documents/assets and consume the safe API
  logger from `privacy-compliance/03`. Gateway logging emits only a sanitized method/path label with no query string,
  credentials, headers, request body, address, or secret-bearing path segment.
  Rationale: The gateway and `pino-http` are separate logging boundaries. Framework defaults do not prevent
  clickjacking, MIME confusion, referrer leakage, or OAuth/invitation secrets entering either log stream.
  Date/Author: 2026-08-31, project planning.
- Decision: Stop at reproducible local Compose and CI artifacts.
  Rationale: Production domains, TLS, scaling, observability, and rollout are separate operations decisions.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`frontend/01` provides the Vite application. `frontend/02` makes public-issuer and internal-provider routing work in
Compose. `frontend/05` provides `/docs`, `/openapi.json`, the generated browser client, and same-origin transport.
`privacy-compliance/03` supplies the API request-logging contract. This plan wires those independently testable pieces
into one runtime; it does not redefine their contracts.

The API health check runs inside its container. `APP_BASE_URL`, public Keycloak redirect URIs, and payment-completion
URLs already use `http://localhost:53000`. The gateway must preserve request methods, bodies, queries, cookies,
locations, and forwarding information required by those flows.

The API-owned path spaces are `/v1` and descendants; legacy `/verify`, `/verifyAsync`, `/verifyBatch`, `/emails`, and
`/credits` with descendants; `/health`; `/docs`; and `/openapi.json`. Swagger's disabled `/docs-json` and
`/docs-yaml` siblings still remain API-reserved paths and return API `404`, never SPA HTML. Every other path is
UI-owned and may use React Router's global not-found fallback.

## Scope and Non-Goals

This pull request adds the Vite proxy, Nginx gateway, web image, two-service Compose topology, route smoke tests,
reset/developer documentation, required image checks, and a live same-origin browser test. It adjusts
the API image only as required to build independently in the workspace.

It does not change DTOs, generate new API operations, add any feature screens, redesign auth, add CORS, combine the images,
store tokens in the browser, add server-side rendering, or change persistent data. Production hosting, domains, TLS,
high availability, migrations, backfills, and production recovery remain outside scope.

## Plan of Work

Add a Vite development proxy and Nginx gateway with the same explicit API locations. Preserve method, body, query,
cookies, redirects, and forwarding headers. Do not cache API responses or rewrite error bodies. Proxy `/docs` assets
and `/openapi.json` directly. Reserve every API prefix even when no current controller matches a child.

Serve hashed web assets with immutable caching and the HTML entry with no-cache semantics. Apply `try_files`/SPA
fallback only to UI-owned paths. Add route tests proving `/not-real` renders the React not-found page while
`/v1/not-real` and `/verify/not-real` retain the API's JSON `404` response and content type.

On every SPA document and static asset response, set `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy` disabling camera, microphone,
geolocation, payment, and USB, and a tested Content Security Policy with at least `default-src 'self'`,
`script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, `img-src 'self' data:`, `object-src 'none'`,
`base-uri 'self'`, and `frame-ancestors 'none'`. Keep the development-only Vite policy explicit if HMR needs an
additional WebSocket source; never add `unsafe-inline` or `unsafe-eval` to the production-style Nginx response.
Verify that the built application needs no forbidden inline script or style. Proxied API responses retain their own
`Set-Cookie`, `Location`, cache, and tighter referrer headers without gateway rewriting.

Define a gateway access-log format that never uses `$request` or `$request_uri` and omits query strings, cookies,
authorization, and request bodies. Log method plus a sanitized path label derived from `$uri`. Replace
`/v1/auth/callback`, login and sign-out routes, `/accept-invitation/:token`,
`/v1/organizations/invitations/:token`, and `/emails/:email` with fixed route templates before logging. Apply the
same fixed-template rule to any future route segment classified as sensitive by the shared API route inventory.
Preserve the original path/query only for proxying.

Consume the API-owned safe request-log adapter from `privacy-compliance/03`; do not create a second `pino-http` serializer or
factory here. Add gateway and full-topology regression tests that send synthetic callback code/state, invitation token,
email-path, cookie, authorization, query, and body markers. Assert every marker is absent from both gateway and API
logs while the fixed route label, method, status, and safe correlation field remain. Require callback responses to
preserve `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Create `docker/web.Dockerfile` with a Node 24 workspace-aware build stage and pinned unprivileged Nginx runtime. Add a
web health check that proves static service health without depending on API health. Keep `docker/Dockerfile` rooted in
the backend package and ensure neither runtime image copies the other's unnecessary artifacts.

Update Compose so `web` publishes `53000:8080`, `api` only exposes port 3000 to the Compose network, and the full-stack
browser smoke waits for API health. Preserve `APP_BASE_URL`, public Keycloak URLs, provider-return URLs, the API's
internal health check, and container service discovery. Update `docker/scripts/dev-reset.sh` to recognize and wait for
the web service without broadening its destructive project boundary.

Set the runtime Swagger server entry to the relative same-origin URL `/` so Try it out uses whichever origin served
`/docs`, including the gateway after direct API host-port removal. Do not advertise `localhost:3000` or an internal
Compose hostname. Proxy `/docs` assets and `/openapi.json`; reserve `/docs-json` and `/docs-yaml` as API paths whose
expected response is JSON `404` because Plan 05 configures Swagger with `raw: false`.

Extend `.github/workflows/validate.yml` with required web-image, route-matrix, and Compose browser coverage. Preserve
all existing backend architecture, lint, typecheck, Jest, integration, build, and API-image checks, and keep the web
and contract checks introduced by earlier plans. Run the new checks unconditionally in this pull request;
`frontend/07` owns change discovery and successful no-op job conversion.

Add a live Playwright smoke scenario through port 53000. It loads the product root, requests each proxy-owned path,
completes genuine Keycloak login, reads current account with the opaque cookie session, sends one unsafe request with
the CSRF middleware, and logs out. It inspects status, content type, redirect location, and safe cache headers rather
than status alone.

## Interfaces and Dependencies

Host-facing ownership after this change is:

| Path space                                                                       | Owner | Behavior                                                                          |
| -------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| `/`, UI routes, unknown non-API paths                                            | web   | Static assets and React Router; unknown paths render the UI not-found experience. |
| `/v1/**`                                                                         | API   | Proxied unchanged; unknown children remain API JSON errors.                       |
| `/verify`, `/verifyAsync`, `/verifyBatch`, `/emails`, `/credits` and descendants | API   | Legacy/current unversioned API paths, proxied unchanged.                          |
| `/health`                                                                        | API   | Proxied health response.                                                          |
| `/docs` and `/docs/**`                                                           | API   | Swagger UI and assets.                                                            |
| `/openapi.json`                                                                  | API   | Machine-readable OpenAPI JSON.                                                    |
| `/docs-json` and `/docs-yaml`                                                    | API   | Reserved and proxied; API returns JSON `404`, never SPA HTML.                     |

Compose adds `web`, which publishes `53000:8080` and reaches `api:3000`. The API no longer publishes a default host
port. Its internal health check and service dependencies remain unchanged.

This plan adds an unprivileged Nginx runtime but no hosted service or browser library. It consumes the generated
client and route documentation from `frontend/05` without changing their output paths or scripts.

## Acceptance Criteria

- `http://localhost:53000/` serves the built React product, and the API has no default host port exposure.
- UI navigation and hard refresh work. Unknown UI paths render the React not-found experience; unknown versioned and
  legacy API descendants retain backend status, JSON content type, and body.
- `/docs` loads Swagger UI with a relative same-origin server, `/openapi.json` returns JSON, and both bypass SPA
  fallback. `/docs-json` and `/docs-yaml` return API JSON `404` rather than implicit raw docs or SPA HTML.
- SPA documents/assets carry the exact CSP, anti-framing, MIME, referrer, and permissions headers. Proxied cookies,
  redirects, cache policy, and tighter headers remain intact.
- Gateway and API logs contain no query string, cookie, authorization value, request-body marker, authorization-code
  value, state value, invitation token, or email-address path segment. Fixed labels replace every sensitive path
  before logging while upstream requests remain unchanged.
- Browser requests preserve cookies, CSRF headers, queries, bodies, and redirect locations through the gateway. A real
  Keycloak login, current-account read, unsafe request, and sign-out complete through port 53000.
- API and web images build separately. The web health check is independent, while the full-stack smoke waits for API
  health.
- The reset workflow starts and waits for the new topology and retains explicit checkout/project ownership safety.
- Required CI builds both images and exercises the route matrix and same-origin browser smoke without weakening any
  existing backend, web, or contract check.
- Image, Compose, route, Playwright, accessibility, visual, docs, architecture, and repository checks pass in one
  pull request.

## Validation

Run workspace and package checks without changing generated contracts:

    corepack pnpm install --frozen-lockfile
    corepack pnpm lint
    corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
    corepack pnpm --filter @tuposoft/lead-email-finder-web build
    corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
    corepack pnpm openapi:check
    corepack pnpm architecture:check

Build both images and inspect the resolved topology:

    docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .
    docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .
    docker compose -f docker/compose.yaml config

After confirming Compose ownership, reset the disposable stack and request the route matrix:

    corepack pnpm dev:reset -- --confirm-project=LEF
    curl --fail --silent --show-error http://localhost:53000/
    curl --fail --silent --show-error http://localhost:53000/health
    curl --fail --silent --show-error http://localhost:53000/openapi.json
    curl --fail --silent --show-error http://localhost:53000/docs
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y
    corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual

Request `/not-real`, `/v1/not-real`, `/verify/not-real`, `/docs-json`, and `/docs-yaml` and assert owner-specific
responses. Complete the live Keycloak cookie/CSRF flow. Inspect the Swagger document's relative server and exercise
one Try-it-out request through port 53000. Assert the exact security headers on HTML/assets and preserved API headers.
Send synthetic callback query, invitation-token, and email-path markers, then search the gateway/API logs and prove they are
absent. Then run:

    corepack pnpm docs:lint -- README.md docker/README.md .agents/plans/frontend/06-serve-web-and-api-from-one-origin.md
    git diff --check

Capture exact build, health, route, required-CI, and Playwright results. A Vite-only check does not satisfy the Nginx
and Compose acceptance criteria.

## Idempotence and Recovery

Image builds, Compose configuration resolution, route smoke tests, and browser tests are repeatable. Before reset or
cleanup, inspect labels and confirm the stack belongs to this checkout. If startup fails, retain web/API logs, stop
only the confirmed project, repair configuration, and rerun.

If gateway and backend route ownership diverge, fail the smoke test and add the exact missing API location; do not
broaden the SPA fallback. No schema reset, migration, production rollback, or shared-resource cleanup is introduced.

## Artifacts and Notes

Record image digests, service/port topology, route status/content-type/cache/security-header matrix, sanitized-log
assertions, Swagger server result, required CI results, redacted login network evidence, and Playwright summary.
Never record cookies, CSRF values, OAuth codes or tokens, client secrets, full environment dumps, or container
volumes.

## Plan readiness

The route map, image boundary, security headers, privacy-plan API logger dependency, gateway email/secret path
sanitization, Compose topology, reset safety, required CI coverage, browser smoke, validation, and one-pull-request
scope are decision-complete.

Ready to implement.
