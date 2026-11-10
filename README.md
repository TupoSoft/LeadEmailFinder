# Lead Email Finder

API and web application for email discovery and verification. The API runs on NestJS; the web application uses React
and Vite. PostgreSQL stores application data, Redis handles queues and caches, and S3-compatible object storage
holds uploaded files and results.

The API lives in `apps/api/src/`, with business modules in `modules/` and shared libraries in `libs/`;
root API commands delegate to that workspace. The web application and MCP server live in `apps/web/` and
`apps/mcp-server/`, and `packages/api-client/` contains the browser API client and generated contract.

## Getting Started

Use Node 26 and the pnpm version pinned in [`package.json`](package.json); Corepack selects that version.
Install Corepack separately because Node 26 does not bundle it.

```sh
git clone https://github.com/TupoSoft/LeadEmailFinder.git
cd LeadEmailFinder
npm install --global corepack@0.36.0
corepack enable
corepack pnpm install --frozen-lockfile
```

Provision PostgreSQL, Redis, S3-compatible storage, and the Keycloak realm separately. Supply the API settings
defined in [`EnvironmentVariablesDto`](apps/api/src/environment-variables.dto.ts), including database/storage
connections and credentials. See the [browser-session configuration](apps/api/src/modules/bff-session/README.md#configuration)
and [payment configuration](apps/api/src/modules/payments/README.md#configuration) for those integrations. Application
identities and development data also require separate provisioning.

Standalone Docker images remain available; see [`docker/README.md`](docker/README.md) for builds and gateway routing.
Keep credentials private. Never commit real credentials, browser enrollment secrets, or raw request/response captures
containing authentication data.

## Development

After configuring the API environment and its external services, start the API in watch mode:

```sh
corepack pnpm start
```

The API listens on port 3000 by default. `/health` checks readiness, `/docs` serves Swagger, and `/openapi.json`
publishes the browser API contract.

For UI development:

```sh
corepack pnpm --filter ./apps/web dev
```

Vite forwards API requests to `http://localhost:53000`; set `WEB_API_PROXY_TARGET=http://localhost:3000` to use the
API's default local port, or point it at your configured gateway. Use the
built gateway for authenticated browser workflows: `APP_BASE_URL` controls login redirects and accepted browser
origins. An origin is the scheme, hostname, and port, without a path.

For a debugger, start the Node Inspector endpoint and attach to `localhost:9229`:

```sh
corepack pnpm debug
```

### Authentication Routing

OIDC (OpenID Connect) is the login protocol used with Keycloak. The BFF (backend for frontend) handles that protocol
on the server so browser JavaScript never stores provider tokens.

| Variable               | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | Public realm URL used in redirects and token identity checks                 |
| `OIDC_BACKCHANNEL_URL` | Optional internal URL for server-side token and logout calls                 |
| `OIDC_JWKS_URI`        | Optional URL for JWKS, the public keys used to verify signed identity tokens |

Configure the public issuer for the provisioned realm. Internal routing must not change the trusted public issuer.

### Browser API Contracts

OpenAPI describes endpoint paths and request/response types; Swagger renders that description as an interactive
page. The browser contract uses an explicit [operation allowlist](apps/api/src/openapi/browser-document.ts).
The full API remains available at `/docs`; `/docs-json` and `/docs-yaml` are disabled.

The generated contract lives in `packages/api-client/openapi/lead-email-finder.json` and
`packages/api-client/src/schema.d.ts`. Keep these artifacts consistent with included controllers and DTOs (data
transfer objects) when changing the browser API.

Browser calls use `createBrowserApiClient` with relative URLs and same-origin cookies. For mutations it adds
`x-csrf-token` from the readable `lef_csrf_token` cookie. This protects against CSRF (cross-site request forgery),
where another website tries to act through the user's session. JavaScript cannot read the HTTP-only session cookie.

### Production Configuration

`NODE_ENV=production` requires:

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
Frozen-lockfile installs and cache-miss builds remain required. Validation builds images without publishing them.

For ownership and dependency rules, see the [business-module guide](apps/api/src/modules/README.md).
