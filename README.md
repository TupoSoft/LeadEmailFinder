# Lead Email Finder

Lead Email Finder is an API for finding email addresses.

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
and fails on missing or stale output without changing either file. CI runs this check unconditionally.

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
prepare the base development stack first. The reset generates the gitignored Keycloak credentials that the fixture
bind-mounts; the overlay now fails fast if this prerequisite is missing instead of creating a directory at the
expected location.

Then stop the base stack so Compose can recreate the default network with the fixture subnet, and start the opt-in
local fixture:

```shell
pnpm dev:reset
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

The overlay configures the API to use port `2525` and adds Docker-network-only CoreDNS, Mailpit, and 3proxy services. It registers one active development proxy through the authenticated API. No DNS, SMTP, Mailpit, or proxy port is published to the host; the existing API remains available at `http://localhost:53000`. The fixed proxy credentials are development-only and cannot be reached through a published host port.

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
