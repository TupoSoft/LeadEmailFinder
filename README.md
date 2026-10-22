# Lead Email Finder

Lead Email Finder is an API for finding email addresses.

The [ideal customer profile](docs/product/ideal-customer-profile.md) records the working customer hypothesis,
supporting product evidence, and guidance for AI agents making product decisions.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Privacy and Data Lifecycle](#privacy-and-data-lifecycle)
- [Development](#development)
    - [Environment Variables](#environment-variables)
    - [Running the Application](#running-the-application)
    - [Debugging the Application](#debugging-the-application)
    - [Local Services](#local-services)
    - [Resetting the Development Stack](#resetting-the-development-stack)

---

## Prerequisites

Before running the project, ensure you have the following installed on your system:

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) v2

The Node runtime is only needed when running the package scripts outside Docker. The development containers use the pnpm version pinned in `package.json`.

---

## Getting Started

Clone this repository:

```shell
  git clone https://github.com/TupoSoft/LeadEmailFinder.git
  cd LeadEmailFinder
```

## Privacy and Data Lifecycle

The [email-verification processing and lifecycle contract](docs/privacy/email-verification-processing-contract.md) is
the repository-owned engineering source of truth for customer-verification data flows, processor/controller
boundaries, recipients, fixed lifecycle defaults, rights routing, and follow-up control owners. Its retention defaults
are not yet enforced by the current runtime, and its pending Legal, DPO, Commercial, Security/vendor, Operations,
controller-data, incident, and California reviews are not compliance approvals, customer assent, or a published
privacy notice.

## Development

### Path-Aware Validation

The `Validate` workflow always runs on pull requests, pushes to `master`, and manual dispatch. Its `changes` job
selects six consumers. The final `Validate / validate` check succeeds only when discovery and every consumer succeed.
Each consumer starts even when unselected and explicitly reports that its checks were not run. A failed, canceled,
skipped, or missing dependency fails the summary. Branch protection continues to use the same required check.

Repository policy runs for every comparison. It retains account-discovery approval validation, the session-material
scanner, the module architecture ratchet, the ExecPlan repository test, and CI selection tests. The remaining
consumers follow this matrix; multiple changed paths select the union of their consumers:

| Changed paths | Additional consumers |
| --- | --- |
| Backend services, workers, tests, deployment files, configuration, and backend scripts | Backend, images, browser |
| API controllers, DTOs, module wiring, bootstrap code, domain sources, and shared contract types or policies | Backend, web, contract, images, browser |
| `packages/api-client/**`, `scripts/openapi/**` | Backend, web, contract, images, browser |
| `apps/web/**`, `scripts/frontend/**`, `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json` | Web, images, browser |
| `docker/**`, `Dockerfile`, `.dockerignore` | Backend, images, browser |
| Root package, lockfile, workspace, TypeScript, ESLint, Jest, Nest, and SWC configuration | Backend, web, contract, images, browser |
| `.github/workflows/**`, `scripts/ci/**`, unknown source or configuration paths | Backend, web, contract, images, browser |
| Other Markdown, documentation, ExecPlans, and repository guidance | None |
| A trustworthy empty comparison | None |

The [classifier](scripts/ci/select-validation.mjs) and its [fixtures](scripts/ci/validation-fixtures.json) define the
exact path rules, including precedence for design contracts and web-local documentation. Backend owns lint, types,
unit tests, Vagrant checks, four PostgreSQL integration suites, and application compilation. Web owns design audits,
lint, types, unit tests, and the static build. Contract owns OpenAPI drift, exporter tests, and client compilation.
Images owns all three image builds, the packaged approval manifest check, and Compose configuration. Browser owns
route ownership, browser workflows, accessibility, visual baselines, and the disposable same-origin stack with Bruno.
The browser job builds its own gateway image because each consumer has an isolated runner. An unselected backend
job starts no PostgreSQL service. A successful no-op is selection evidence only.

Pull requests compare their head with its merge base against the event's base SHA. Pushes compare the event's
`before` and head commit IDs directly. Git supplies paths separated by null bytes with rename detection disabled, so deletions and
both sides of a rename remain visible. Filenames are never evaluated as shell code. Manual dispatch, invalid input,
an unsupported event, an all-zero revision, or unavailable comparison history selects every consumer.

Run these commands to inspect selection and validate the workflow without starting application services:

```sh
node scripts/ci/select-validation.mjs --paths-json '["apps/web/src/App.tsx"]'
corepack pnpm test:ci-paths
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- select-validation validate-workflow --runInBand
```

The first command prints all six boolean flags. The fixture command verifies the matrix and prints stable JSON.
The Jest checks parse workflow YAML, preserve command ownership, and exercise discovery, no-op guards, and summary
failure handling. Live Actions runs remain separate evidence for GitHub's job and expression semantics.

### Safe Stack Startup Diagnostics

If the disposable stack reset fails, `browser-live` immediately runs a read-only collector before cleanup:

```sh
node scripts/testing/dev-stack-diagnostics.mjs
```

The collector accepts no arguments and targets only the fixed `lef` project. It checks exact Compose ownership
labels against its own checkout before reading logs. Missing, ambiguous, foreign, and unavailable services remain
explicit in the output. Keycloak and API collection take priority over the other six stack services.

The version-1 JSON summary contains only fixed service names, collection results, closed failure reasons,
state enums, health enums, bounded restart and probe counts, exit codes, numeric probe timestamps, and Docker's
`oomKilled` flag when available. For Keycloak and the API, `startupSample` reports the sampled line count and six
marker counters: `connection-refused`, `connection-timeout`, `name-resolution`, `memory-error`, `database-retry`,
and `startup-failed`. Counts describe only the bounded sample; zero does not rule out a condition, and a match
does not establish the cause of a startup failure.

Collection has a 45-second total budget, a five-second command limit, and a 32,768-byte JSON output limit.
Each log sample contains at most 200 lines. Commands exceeding 65,536 bytes across their captured streams are
terminated, and their output is discarded. Probe history contains at most five entries. Raw logs, probe
output, labels, container IDs, paths, environment variables, credentials, and error messages are never emitted
or saved as artifacts. The summary stays in the Actions log. Diagnostic failures remain advisory: the reset
and aggregate validation still fail, and the existing cleanup runs. Successful or skipped resets do not collect
diagnostics. This command neither resets nor repairs a stack.

### Shared CI Caches

Validation restores the pnpm store from GitHub Actions before each dependency install. Cache keys include the
operating system, architecture, Node major version, pnpm version, dependency group, and lockfile hash. Repository
policy, backend, and contract jobs share the API dependency group. Web and browser jobs use separate groups because
their filtered installs need different packages. A fallback can restore an older lockfile within the same group.
Every job still runs its frozen-lockfile install, including after a cache hit or a failed cache restore.

The image job imports and exports Docker build layers through GitHub Actions using separate production, API, and
web scopes. The browser job reuses the web scope. Each build loads its original image tag into the job's Docker
daemon so the existing container checks can run. Validation publishes no container images or build-record artifacts.
Cache export errors are advisory; build and container-check failures still fail validation.

The cache data lives on GitHub and can be reused across runner machines within GitHub's repository and branch
access rules. Runs on `master` can populate caches for pull requests. Cache entries can expire, so a cache miss
must remain a supported path. Runner workspaces and Docker daemons remain independent.

This configuration covers the workflow's explicit image builds. It does not configure the browser live-stack
rebuild performed by `pnpm dev:reset`. BuildKit cache mounts in Dockerfiles are also separate from exported image
layers; their pnpm stores are not restored by this change. Confirm the benefit using cache restoration logs,
Docker's cached build steps, and elapsed times from repeated Actions runs with the same lockfile and source.

### Browser API Contracts

The API serves its full Swagger UI at `/docs` and a normalized browser contract at `/openapi.json`.
The API root is reserved for the product. The implicit Swagger routes `/docs-json` and `/docs-yaml` are disabled.
The initial browser surface contains `GET /health`, `GET /v1/auth/login`, `GET /v1/auth/callback`,
`GET /v1/auth/session`, and `POST /v1/auth/logout`. Payments, verification, and proxy operations remain in the full
documentation. Each later browser feature must explicitly extend the method and path allow list in
`src/lead-email-finder-api/src/openapi/browser-document.ts` and publish its source annotations.

After changing an included controller or DTO, run these commands from the repository root:

```sh
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
```

The first command writes only `packages/api-client/openapi/lead-email-finder.json`. The second generates only
`packages/api-client/src/schema.d.ts` from that snapshot. Commit both artifacts with the source change; never edit
them by hand. Stage newly created artifacts before their first check; untracked files also fail validation.
The check command exports and generates in a temporary directory, compares both files byte for byte,
and fails on missing or stale output without changing either file. CI runs this check whenever contract inputs change,
or when change discovery selects every consumer.

Export uses the real application module and the same Swagger plugin options, annotations, serialization setup,
and document builder as the runtime. A dedicated child process installs a fixed configuration fixture, ignores
ambient settings and `.env` files, and uses Nest preview mode. Provider construction, lifecycle hooks, and network
connections are forbidden. PostgreSQL, Redis, S3, SMTP, Keycloak, and payment-provider services are unnecessary.
Normal application startup still validates its runtime configuration.

The private `@tuposoft/lead-email-finder-api-client` workspace exports generated schema types and a typed
`openapi-fetch` factory. It builds independently:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-api-client build
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
```

Browser callers use `createBrowserApiClient` in `apps/web/src/api/browser-api-client.ts`. This factory uses relative
URLs and same-origin credentials. Its middleware reads only the readable `lef_csrf_token` cookie and adds the
decoded value as `x-csrf-token` for unsafe methods, preserving an explicit caller header. The current-account
adapter uses generated response types. Browser code does not read the HTTP-only session cookie or store tokens.
The API and web images build independently and share the browser origin at `http://localhost:53000`.
The Nginx gateway serves the product and forwards explicit API paths, including Swagger and the browser contract.

### Environment Variables

The development Compose stack defaults `NODE_ENV` to `development`. It also loads `docker/.env` when that optional,
gitignored file exists. Create it only when you need to configure local overrides such as:

```dotenv
PROXY_MX_REQUESTS_PER_MINUTE=10
PROXY_LEASE_TTL_MS=60000
```

The committed account-discovery approval manifest is empty, so external account-discovery providers are disabled by
default. `CATCH_ALL_HTTP_PROXY_URL` alone never activates one. A future repository-approved activation must set one
supported `CATCH_ALL_PROVIDER` together with `CATCH_ALL_HTTP_PROXY_URL` (inline or through
`CATCH_ALL_HTTP_PROXY_URL_FILE`), `CATCH_ALL_PROVIDER_APPROVAL_ID`, and `CATCH_ALL_PROVIDER_REGION`; the application
still fails to start unless those values match one active, effective, unexpired approval in the fixed manifest. The
Compose stack reads its database, Redis, and S3 settings from files in `docker/secrets/`; keep those files available
locally and never commit real production credentials.

`PROXY_MX_REQUESTS_PER_MINUTE` and `PROXY_LEASE_TTL_MS` are optional proxy-fleet limits. They default to 10 MX attempts per minute and a 60-second egress lease.

#### Browser and Provider Routing

`OIDC_ISSUER_URL` is the public Keycloak realm URL used by browser redirects and token issuer validation.
`OIDC_BACKCHANNEL_URL` optionally selects the realm URL for server-side code exchange, refresh, and logout.
`OIDC_JWKS_URI` optionally selects the key retrieval URL for both bearer and BFF ID-token verification.
When omitted, these retrieval addresses fall back to the public issuer's protocol endpoints.

The local stack uses `http://localhost:58080/realms/lead-email-finder` as its public issuer and
`http://keycloak:8080/realms/lead-email-finder` for internal protocol calls. Keycloak pins its public hostname
and enables dynamic back-channel routing, so requests through either address produce the same public issuer.
The SMTP and Paddle overlays inherit this configuration. Host-run applications can omit both retrieval overrides.
URL configuration accepts HTTP or HTTPS, rejects credentials, queries, and fragments, and reports invalid keys
without printing their values.

After provisioning this checkout's stack, run the provider and HTTP checks:

```shell
corepack pnpm keycloak:smoke
corepack pnpm test:bff-live
corepack pnpm bruno:bff-sessions
# After starting the SMTP overlay:
corepack pnpm bruno:smtp-dev
```

For an isolated Compose project, set `COMPOSE_PROJECT_NAME` to its name when running these launchers. They verify
ownership of the working directory, load ignored fixture metadata, and fail if their suites skip or execute no tests.
The live BFF runner uses only the dedicated `bff_session_test` database. It never resets the application's database.

#### Production Transport and Customer-Object Storage

`NODE_ENV=production` enables fail-closed transport and object-write checks at startup:

- PostgreSQL uses peer-verified TLS, and `POSTGRES_URL` must not contain connection-string parameters that replace the
  application's TLS policy. `POSTGRES_TLS_CA` or `POSTGRES_TLS_CA_FILE` can supply an optional trusted CA; otherwise,
  PostgreSQL uses the `Node.js` runtime's configured default trust roots.
- A standalone `REDIS_URL` must use `rediss://`. Sentinel connections keep the existing `redis-sentinel://` syntax,
  but discovery and selected-master traffic both use peer-verified TLS. `REDIS_TLS_CA` or `REDIS_TLS_CA_FILE` can
  supply an optional trusted CA; otherwise, Redis uses the `Node.js` runtime's configured default trust roots.
- `S3_URL` must use HTTPS, `S3_SERVER_SIDE_ENCRYPTION` must be `aws:kms`, and `S3_KMS_KEY_ID` (or
  `S3_KMS_KEY_ID_FILE`) must be nonempty. S3 HTTPS uses the `Node.js` runtime's configured default trust roots, which
  can be extended with `NODE_EXTRA_CA_CERTS`. Production supplies explicit peer-verifying Node HTTP-handler options,
  so `NODE_TLS_REJECT_UNAUTHORIZED=0` cannot weaken S3 certificate verification.

Configure each optional secret through either its direct variable or its `_FILE` counterpart, never both. Duplicate
sources fail startup with a value-redacted `<KEY>: multiple-sources` error.

Every email-verification batch input and result write sends `Cache-Control: no-store`. Production writes additionally
state the configured SSE-KMS algorithm and key on the request instead of relying only on bucket defaults. Configuration
failures identify only the rejected key and a stable reason; they do not echo URLs, credentials, CA
contents, or KMS identifiers.

The checked-in Compose stack is explicitly a disposable development environment. Its plaintext PostgreSQL and Redis
connections and HTTP Garage endpoint remain supported only while `NODE_ENV=development`; do not use that stack as a
production configuration template.

#### Draining a Proxy

To take a proxy out of rotation without dropping in-flight verifications, `PATCH /v1/proxies/:id` with `{"state": "draining"}`. New allocations for that proxy stop immediately (it's excluded by the eligibility query, not by a background job), while any lease already held keeps running to completion and releases normally. Wait at least `PROXY_LEASE_TTL_MS` (60 seconds by default) after draining, then check the application logs for that proxy's ID: once only `Proxy lease release outcome` entries appear for it, with no further `Proxy allocation acquired` entries, it's safe to `PATCH` its state to `"disabled"` or `DELETE` it.

### Running the Application

To start the application in development mode, use the following command:

```shell
  docker compose -f docker/compose.yaml up -d --build
```

This will:

- Build the necessary Docker images.

- Start the application in a detached mode.

When both web and API health checks pass, use:

- Product: <http://localhost:53000/>
- API documentation: <http://localhost:53000/docs>
- [Browser API contract](http://localhost:53000/openapi.json)
- API health: <http://localhost:53000/health>

The web gateway publishes `53000:8080`. The API listens on `api:3000` inside Compose and has no default host port.
Unknown API descendants return JSON errors; unknown UI routes render the product's not-found page. Swagger uses the
relative server URL `/`, so its requests stay on the origin that served the documentation.

The editor HTTP client's `dev` environment in `http-client.env.json` uses this Compose gateway at
`http://localhost:53000`. This repository no longer schedules application deployment. Previously queued deployment
runs and remote resources require separate operator follow-up.

Use the built gateway for authenticated browser flows. To work on UI code with Vite while the gateway owns port
53000, run `corepack pnpm --filter @tuposoft/lead-email-finder-web dev` on Vite's default port. Its explicit API proxy
uses `http://localhost:53000`; `WEB_API_PROXY_TARGET` selects a different backend for standalone development.
The API's configured `APP_BASE_URL` still governs login redirects and CSRF origin checks.

See [the gateway development guide](docker/README.md) for route ownership, browser headers, safe logging,
independent image checks, and live browser validation.

### Debugging the Application

To run the application in debugging mode:

```shell
  docker compose -f docker/compose.yaml -f docker/compose.debug.yaml up -d --build
```

Once running, connect your preferred debugging client using the Node Inspector protocol. Detailed instructions for
setting up a client can be found in
the [Node debugging guide](https://nodejs.org/en/learn/getting-started/debugging#inspector-clients).

Attach the client to `localhost:59229`.

### ISP-Safe SMTP Verification

To exercise DNS lookup, proxy allocation, SOCKS5 transport, and SMTP verification without using outbound port 25,
prepare the base development stack first. For a fresh disposable stack, `pnpm dev:reset -- --confirm-project=LEF`
generates the gitignored Keycloak credentials that the fixture mounts. Reset deletes development data; skip it
when the stack is already provisioned. The overlay fails fast if the credentials file is missing.

Enable the local fixture directly on the running base stack:

```shell
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

The overlay configures the API to use port `2525` and adds Docker-network-only CoreDNS, Mailpit, and 3proxy services. It registers one active development proxy through the authenticated API. No DNS, SMTP, Mailpit, or proxy port is published to the host; the existing API remains available at `http://localhost:53000`. The fixed proxy credentials are development-only and cannot be reached through a published host port.

The fixture uses a separate `smtp-dev` network with subnet `172.28.0.0/24`. Enabling it preserves the base network
and its infrastructure service names. Repeating the same startup command is safe.

Older overlay versions assigned this subnet to the default network. If that network still exists, follow the
[network recovery instructions](docker/README.md#recover-an-older-smtp-network) before starting this version.

Use the OpenCollection smoke test in `bruno/smtp-dev` or submit `person@lef.test` to `POST /verify`. Mailpit accepts every recipient, so a successful result validates local application wiring rather than external deliverability.

Stop and remove the fixture containers with:

```shell
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml --profile smtp-dev-cleanup run --rm smtp-dev-proxy-cleanup
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down
```

The cleanup command removes the fixture proxy from the persistent registry before its container and DNS name disappear.

### Paddle Sandbox Purchase Verification

To exercise a real Paddle sandbox checkout and signed webhook without changing the default stub stack, use the
opt-in Paddle development overlay. It serves the local Paddle browser payment-link page on
`http://localhost:57000/checkout.html` and starts an ephemeral Cloudflare Quick Tunnel for a Paddle-approved
public checkout URL and webhook delivery.

The fixture requires sandbox account credentials, a client-side token, an approved temporary website, one locally
identified notification destination, and an active starter price. Follow the complete, repeatable setup and purchase/replay procedure in
[`docker/paddle-dev/README.md`](docker/paddle-dev/README.md). The tunnel exposes only the checkout, health, and
exact webhook routes at a temporary public URL. Deactivate and verify the fixture-owned notification destination
before stopping the tunnel or deleting its local ID and signature secret.

### Local Services

The development Compose stack starts the following supporting services:

| Service    | Host address                | Purpose                             |
| ---------- | --------------------------- | ----------------------------------- |
| API        | http://localhost:53000/docs | Lead Email Finder API documentation |
| PostgreSQL | `localhost:55432`           | Application database                |
| Redis      | `localhost:56379`           | Queue and cache storage             |
| Bull Board | http://localhost:54000      | Queue dashboard                     |
| Garage/S3  | http://localhost:59000      | S3-compatible object storage        |
| [MCP Server](apps/mcp-server/README.md) | http://localhost:53002/health | AI-agent access to this API over the Model Context Protocol |

The opt-in Paddle fixture additionally publishes its checkout page on `http://localhost:57000`; it is not part of
the ordinary development stack.

### Resetting the Development Stack

`pnpm dev:reset` is the one safe, repeatable way to recreate the entire disposable development stack — PostgreSQL,
the Keycloak PostgreSQL database, Redis, and the Garage/S3 container — after an incompatible schema or realm change.
It stops and removes the named `LEF` Compose containers and deletes only the three named volumes this stack owns:
`lef_postgres-data`, `lef_redis-data`, and `lef_keycloak-postgres-data`. Object storage has no volume and is already
ephemeral. The command then rebuilds and starts the stack, provisions Keycloak again, seeds deterministic fixtures,
and ends with an authenticated API request.

It always asks for confirmation before deleting anything:

```shell
pnpm dev:reset
# Type LEF to continue:
```

For CI or scripted use, pass the Compose project name as an explicit flag instead of answering interactively:

```shell
pnpm dev:reset -- --confirm-project=LEF
```

Any other value is rejected outright, never falls back to a prompt.

Each run seeds:

| Fixture                   | Identity                                       | Notes                                                                                                |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Platform M2M credential   | `lef-development-service` (Client Credentials) | `platform:admin`; see `scripts/keycloak/bootstrap-credential.ts`                                     |
| Platform operator (human) | `platform-operator@lef.test`                   | `platform_admin`; password is the fixed dev-only constant in `scripts/keycloak/platform-operator.ts` |
| Customer organization     | "Acme Development Customer"                    | Owner `owner@acme.lef.test`, 1000 starting credits                                                   |
| Customer M2M credential   | `lef-svc-dev-fixture` (Client Credentials)     | Scoped to `verification:run`/`verification:read` only                                                |

Generated secrets (Keycloak client secrets, id summaries) are written only to the gitignored `.dev/keycloak/*.json` files, never printed in full.

The two privileged human fixtures request TOTP enrollment on their first browser login. Run
`corepack pnpm --filter ./apps/web browser-fixtures:bootstrap` after the reset, then use the shared MFA-aware
Playwright login fixture. See [privileged browser testing](apps/web/tests/README.md) for repeat login, local secret
handling, isolated stack ownership, and reset recovery.
