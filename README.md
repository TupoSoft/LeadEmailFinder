# Lead Email Finder

API and web application for email discovery and verification. The API runs on NestJS; the web application uses React
and Vite. PostgreSQL stores application data, Redis handles queues and caches, and Garage provides S3-compatible
object storage for uploaded files and results.

The API and its internal modules live in `apps/api/src/`; root API commands delegate to that workspace. The web
application and MCP server live in `apps/web/` and `apps/mcp-server/`, and `packages/api-client/` contains the browser
API client and generated contract.

## Getting Started

Install Docker with Compose v2. For commands outside containers, use Node 24 and the pnpm version pinned in
[`package.json`](package.json); Corepack selects that version.

```sh
git clone https://github.com/TupoSoft/LeadEmailFinder.git
cd LeadEmailFinder
corepack pnpm install --frozen-lockfile
docker compose -f docker/compose.yaml up -d --build
```

Wait for API and web health checks before opening the product. Configure the Keycloak realm, application identities,
and development data separately; starting Compose does not provision them.

| Service             | Host address                          | Purpose                                            |
| ------------------- | ------------------------------------- | -------------------------------------------------- |
| Web and API gateway | <http://localhost:53000>              | Product; forwards API requests                     |
| Swagger             | <http://localhost:53000/docs>         | Interactive API documentation                      |
| OpenAPI             | <http://localhost:53000/openapi.json> | Machine-readable browser API contract              |
| Health              | <http://localhost:53000/health>       | API readiness check                                |
| PostgreSQL          | `localhost:55432`                     | Application database                               |
| Redis               | `localhost:56379`                     | Queues and caches                                  |
| Bull Board          | <http://localhost:54000>              | Queue dashboard                                    |
| Garage              | <http://localhost:59000>              | S3-compatible file storage                         |
| MCP server          | <http://localhost:53002/health>       | AI-agent access through the Model Context Protocol |

The API listens internally on `api:3000`; only the gateway publishes the browser API. See
[`docker/README.md`](docker/README.md) for routing and network recovery.

Keep development credentials and `docker/secrets/` private. Never commit real credentials, browser enrollment
secrets, or raw request/response captures containing authentication data.

## Development

The Compose stack uses `NODE_ENV=development` and optional overrides from ignored `docker/.env`. Database, Redis,
and storage credentials come from files in `docker/secrets/`.

For UI development:

```sh
corepack pnpm --filter ./apps/web dev
```

Vite forwards API requests to `http://localhost:53000`; `WEB_API_PROXY_TARGET` overrides that destination. Use the
built gateway for authenticated browser workflows: `APP_BASE_URL` controls login redirects and accepted browser
origins. An origin is the scheme, hostname, and port, without a path.

For a debugger, start the Node Inspector endpoint and attach to `localhost:59229`:

```sh
docker compose -f docker/compose.yaml -f docker/compose.debug.yaml up -d --build
```

### Authentication Routing

OIDC (OpenID Connect) is the login protocol used with Keycloak. The BFF (backend for frontend) handles that protocol
on the server so browser JavaScript never stores provider tokens.

| Variable               | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | Public realm URL used in redirects and token identity checks                 |
| `OIDC_BACKCHANNEL_URL` | Optional internal URL for server-side token and logout calls                 |
| `OIDC_JWKS_URI`        | Optional URL for JWKS, the public keys used to verify signed identity tokens |

The local public issuer is `http://localhost:58080/realms/lead-email-finder`; container-to-container calls use
`http://keycloak:8080/realms/lead-email-finder`. Internal routing must not change the trusted public issuer.

### Browser API Contracts

OpenAPI describes endpoint paths and request/response types; Swagger renders that description as an interactive
page. The browser contract uses an explicit [operation allowlist](apps/api/src/lead-email-finder-api/src/openapi/browser-document.ts).
The full API remains available at `/docs`; `/docs-json` and `/docs-yaml` are disabled.

The generated contract lives in `packages/api-client/openapi/lead-email-finder.json` and
`packages/api-client/src/schema.d.ts`. Keep these artifacts consistent with included controllers and DTOs (data
transfer objects) when changing the browser API.

Browser calls use `createBrowserApiClient` with relative URLs and same-origin cookies. For mutations it adds
`x-csrf-token` from the readable `lef_csrf_token` cookie. This protects against CSRF (cross-site request forgery),
where another website tries to act through the user's session. JavaScript cannot read the HTTP-only session cookie.

### Production Configuration

The development stack uses plaintext local connections and automatic schema synchronization; it is not a production
template. `NODE_ENV=production` requires:

- PostgreSQL and Redis connections with TLS, encryption that also verifies the server's certificate. Standalone
  Redis uses `rediss://`; Redis Sentinel, which discovers the current primary server, also requires TLS on discovery
  and data connections. Optional trusted certificate authorities use `POSTGRES_TLS_CA` and `REDIS_TLS_CA`.
- HTTPS for `S3_URL`, `S3_SERVER_SIDE_ENCRYPTION=aws:kms`, and a nonempty `S3_KMS_KEY_ID`. KMS is the key-management
  service used for server-side encryption. Batch writes specify the encryption key and `Cache-Control: no-store`.
- One source per secret: the direct environment variable or its `_FILE` counterpart, never both. Startup errors
  identify rejected keys without printing their secret values.

External account discovery means checking a provider for evidence that an account exists. It requires a supported
`CATCH_ALL_PROVIDER`, proxy URL, approval ID, region, and a matching active approval. A proxy URL alone enables nothing.
The runtime always reads `config/privacy/account-discovery-approvals.yaml`, even with providers disabled; a missing
or malformed file prevents initialization. Retention cleanup for verification data is incomplete; do not assume a
documented lifetime is automatically enforced.

### Optional Verification Fixtures

For SMTP (Simple Mail Transfer Protocol, used between mail servers) testing without outbound port 25, first
provision the disposable base stack, then enable the local overlay:

```sh
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

The fixture uses internal DNS (domain-name lookup), a SOCKS5 proxy (a relay for outbound connections), and Mailpit
(a test mail server) on port 2525. It publishes none of those services to the host. Mailpit accepts every recipient,
so passing proves local wiring rather than external deliverability. Follow the
[SMTP collection guide](bruno/smtp-dev/README.md) for cleanup and
[older-network recovery](docker/README.md#recover-an-older-smtp-network) when needed.

For real sandbox payments, follow the [Paddle fixture](docker/paddle-dev/README.md). A sandbox is the provider's
isolated test environment. Its temporary tunnel exposes only checkout, health, and webhook routes. A webhook is a
provider-to-API event callback; only a verified payment event grants credits. Deactivate the fixture-owned
notification destination before removing the tunnel and its secrets.

## Validation

Use focused checks for the changed area:

```sh
corepack pnpm test -- <focused-test-files> --runInBand
corepack pnpm typecheck
corepack pnpm --filter ./apps/web test:ci
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web build
```

All browser suites use `apps/web/playwright.config.ts`. Existing package scripts set `LEF_PLAYWRIGHT_SUITE` for
specialized runs; the default runs ordinary UI tests.
Unit tests, synthetic fixtures (controlled test data/services), and live-stack tests provide different evidence;
report which actually ran.

### Continuous Integration

CI runs the remaining backend, web, image, and browser checks on independent GitHub-hosted Ubuntu 24.04 machines.
Jobs can share pnpm downloads and Docker build-layer caches, but not workspaces or running containers.
Frozen-lockfile installs and cache-miss builds remain required. Validation builds images without publishing them;
this repository does not schedule application deployment.

For ownership and dependency rules, see the [business-module guide](apps/api/src/libs/modules/README.md).
