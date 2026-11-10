# Lead Email Finder

Email discovery and verification with a NestJS API, React/Vite web app, SMTP worker, and MCP server.

## Getting Started

Requires Node 26. The pnpm version is pinned in [package.json](package.json).

```sh
git clone https://github.com/TupoSoft/lead_email_finder.git
cd lead_email_finder
npm install --global corepack@0.36.0
corepack enable
corepack pnpm install --frozen-lockfile
```

Provision PostgreSQL, Redis, S3-compatible storage, Keycloak, and Cloudflare Queues. Configure the
[API environment variables](apps/api/src/environment-variables.dto.ts) before starting the API.
The worker also needs an SMTP identity; see its [configuration](apps/worker/src/configuration.ts).

## Development

Run each service in a separate terminal:

```sh
# API with hot reload
corepack pnpm start

# Web, proxying requests to the local API
WEB_API_PROXY_TARGET=http://localhost:3000 corepack pnpm --filter ./apps/web dev

# Verification worker
corepack pnpm build
corepack pnpm start:worker
```

The API defaults to port 3000: `/health` checks readiness, `/docs` serves Swagger, and `/openapi.json`
serves the browser API contract. Use `corepack pnpm debug` to debug the API on port 9229.

For authenticated browser workflows, configure `APP_BASE_URL` and use the [Docker gateway](docker/README.md#single-origin-gateway).

## Checks

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:ci
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web test:ci
corepack pnpm --filter ./apps/web build
```

## Documentation

- [Authentication and sessions](apps/api/src/modules/bff-session/README.md)
- [Payments](apps/api/src/modules/payments/README.md)
- [MCP setup](apps/mcp-server/README.md)
- [Docker images and gateway](docker/README.md)
- [Module boundaries](apps/api/src/modules/README.md)
- [CI](.github/workflows/validate.yml)

## License

[Apache-2.0](LICENSE).
