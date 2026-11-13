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

### Worker authentication email

The [Cloudflare mail adapter](apps/api/worker/auth-mail.ts) implements `AuthMailDelivery` using the `AUTH_EMAIL`
binding and the existing five-minute, single-use [magic-link template](apps/api/src/libs/better-auth/src/mail/magic-link-message.ts).
It is separate from the SMTP verification worker and the legacy Nest mail transport. The Worker currently exposes
session lookup and sign-out; this adapter does not add magic-link HTTP routes.

Run `corepack pnpm dev:worker` with `BETTER_AUTH_SECRET` set in the ignored `apps/api/.dev.vars` file
(at least 32 characters). `AUTH_MAIL_FROM` defaults to the local sender `no-reply@example.test`; it accepts one
mailbox, optionally written as `Lead Email Finder <no-reply@example.test>`. Invalid sender or binding configuration
fails at startup. The adapter returns redacted delivery errors without logging recipients, links, or provider diagnostics.

The binding uses [Wrangler's native local simulation](https://developers.cloudflare.com/email-service/observability/local-development/sending/).
It saves message bodies to local files and prints metadata and the capture file path. Inspect that file to read the
link; no inbox API or capture database is required. `remote: true` would send real email and is not enabled.
Run `corepack pnpm --filter ./apps/api test:worker` to exercise message construction, native capture,
configuration errors, and delivery failures.

Before live delivery, use a [Workers Paid account](https://developers.cloudflare.com/email-service/) for arbitrary
recipients, manage the sender domain in Cloudflare DNS, and [onboard it for Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/).
Verify the required SPF, DKIM, DMARC, and bounce MX records, then replace `AUTH_MAIL_FROM` in the deployment
configuration with an address on that onboarded domain. The Worker binding requires no SMTP credentials or API token.
Domain onboarding, DNS records, and live sender configuration are prerequisites only; this change does not configure them.

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
