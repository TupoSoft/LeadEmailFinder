# Standalone Docker Images

Run image builds from the repository root:

```sh
docker build --file Dockerfile --tag lead-email-finder:local .
docker build --file docker/Dockerfile --tag lead-email-finder-api:local .
docker build --file docker/web.Dockerfile --tag lead-email-finder-web:local .
docker build --file docker/mcp-server.Dockerfile --tag lead-email-finder-mcp-server:local .
docker build --file docker/proxy-fleet/Dockerfile --tag lead-email-finder-proxy-fleet:local .
```

Provision services, networks, credentials, and application configuration separately. The API requires PostgreSQL,
Redis, S3-compatible storage, and configured authentication/payment integrations; see the
[root setup guide](../README.md#getting-started). The MCP connector requires its own `API_URL`; see its
[local instructions](../apps/mcp-server/README.md#running-locally).

## Single-Origin Gateway

The web image contains built assets and an unprivileged Nginx gateway listening on port 8080. Its configuration
resolves `api:3000` through Docker DNS; provide the API's `api` network alias on a shared Docker network. Publish
the gateway port as appropriate for your environment and set `APP_BASE_URL` and provider callback URLs to that
public origin (scheme, host, and port).

The loopback health endpoint on port 8081 checks static serving, not API readiness. Full browser validation
requires both web and API health. Configure the Keycloak realm, application identities, and API keys separately
before testing authenticated workflows.

## Route Ownership

| Public path                                                                            | Owner                                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/` and other UI paths                                                                 | Static product; browser routing handles unknown pages after a hard refresh. |
| `/v1`, `/verify`, `/verifyAsync`, `/verifyBatch`, `/emails`, `/credits`, and descendants | API; requests and response contracts are forwarded intact.                  |
| `/docs` and descendants                                                                | Swagger UI, the interactive API reference.                                  |
| `/health`, `/openapi.json`                                                             | API health and machine-readable browser API contract.                       |
| `/docs-json`, `/docs-yaml`                                                             | API-reserved JSON `404`.                                                    |

Similar names such as `/v1-other` remain UI-owned. Unknown API children retain backend errors; protected routes may
reject authentication before looking up a resource.

For hot updates, run `corepack pnpm --filter @tuposoft/lead-email-finder-web dev`. Vite forwards API paths to
`http://localhost:53000`, or `WEB_API_PROXY_TARGET`. Use the built gateway for full browser login and configure
`APP_BASE_URL` for its origin.

## Headers, Caching, and Logs

The gateway disables MIME sniffing, framing, and unused device permissions. Its Content Security Policy restricts
scripts, styles, connections, and fonts to the same origin, permits data-URL images, and disallows inline scripts,
dynamic code evaluation, and object embeds. HTML is revalidated (`no-cache`); hashed assets are immutable. API
headers pass through unchanged. Invitation pages use `no-store` and `no-referrer`, including after the internal
document redirect.

Access logs retain fixed method/path labels, status, and generated request IDs. They exclude credentials, cookies,
queries, bodies, email addresses, and invitation/authentication URLs. Raw Nginx request-error logging is disabled;
status logs, process exits, and health checks expose failures. Backend upload limits still apply. The gateway allows
one hour of idle response time for synchronous mailbox verification.
