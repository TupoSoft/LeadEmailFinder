# Single-Origin Development Gateway

Compose, Docker's multi-service configuration, serves the product at `http://localhost:53000`. An origin is a
scheme, host, and port. The Nginx gateway routes browser/API traffic from `53000:8080` to static assets or
`api:3000`; the API has no default host port. Keycloak, the identity provider, keeps its public issuer (the identity
URL used for token validation) at `http://localhost:58080/realms/lead-email-finder`. Browser callbacks and payment
returns use port 53000.

## Build and Start

Run from the repository root:

```sh
docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .
docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .
docker compose -f docker/compose.yaml config --quiet
docker compose -f docker/compose.yaml up -d --build --wait --wait-timeout 240
```

Compose defaults to the watched `pnpm start`. Set `API_START_COMMAND='pnpm exec nest start'` when a single API
startup is needed instead. The web image contains built assets and a pinned, unprivileged Nginx runtime. Its loopback health endpoint on port 8081 checks static serving,
not API readiness; full browser validation requires both web and API health.

Configure the Keycloak realm, application identities, and API keys separately before testing authenticated workflows.
Machine callers use direct Bearer API keys. The SMTP verification overlay expects a private platform credential in
`.dev/auth/platform-api-key.json` with owner-only permissions (`0600`); starting Compose does not create it.

## Authentication Mail

`auth-mail` captures Better Auth transactional messages without relaying them. Containers send SMTP (the mail
protocol) to `auth-mail:1025`; hosts use SMTP at `127.0.0.1:51025` and Mailpit's inbox at `http://127.0.0.1:8025`.
Override `AUTH_MAIL_PUBLISHED_SMTP_PORT` or `AUTH_MAIL_HTTP_PORT` if needed. This service is independent of the SMTP
verification overlay. Recreating its container clears captured messages.

## Recover an Older SMTP Network

The verification overlay now adds a separate `smtp-dev` network:

```sh
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

An older overlay may have assigned its `172.28.0.0/24` subnet to `<project>_default`. Inspect the owned network
(`docker network inspect lef_default` for the default project) before replacing it.

If Garage object data is disposable, the following retains named PostgreSQL, Keycloak, and Redis volumes but
**deletes Garage's container-local files**, including retained batch results:

```sh
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

To preserve Garage data, stop the owned stack and retain its containers. Record IDs/network settings and back up
`/tmp/garage-meta` and `/tmp/garage-data` with `docker cp`. Disconnect owned containers and remove only the old
default network. `docker compose -f docker/compose.yaml create --no-recreate garage` recreates the base network;
reconnect retained services with `docker network connect --alias <service> --alias <container> <project>_default <container>`,
including `smtp-dev-dns-cache-reset` if present. Start the overlay, then verify container identities, service-name
resolution, and health before deleting backups. **Never use `down -v` for this recovery:** it deletes named volumes.

## Route Ownership

| Public path                                                                              | Owner                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/` and other UI paths                                                                   | Static product; browser routing handles unknown pages after a hard refresh. |
| `/v1`, `/verify`, `/verifyAsync`, `/verifyBatch`, `/emails`, `/credits`, and descendants | API; requests and response contracts are forwarded intact.                  |
| `/docs` and descendants                                                                  | Swagger UI, the interactive API reference.                                  |
| `/health`, `/openapi.json`                                                               | API health and machine-readable browser API contract.                       |
| `/docs-json`, `/docs-yaml`                                                               | API-reserved JSON `404`.                                                    |

Similar names such as `/v1-other` remain UI-owned. Unknown API children retain backend errors; protected routes may
reject authentication before looking up a resource. Use an unmatched child when testing JSON `404`.

For hot updates, run `corepack pnpm --filter @tuposoft/lead-email-finder-web dev`. Vite forwards API paths to
`http://localhost:53000`, or `WEB_API_PROXY_TARGET`. Use the built gateway for full browser login: its
`APP_BASE_URL` defines callback and CSRF origins. CSRF protection blocks another website from submitting
cookie-authenticated changes. Vite's development policy permits local hot-reload connections; production assets
use the stricter gateway policy.

## Headers, Caching, and Logs

The gateway disables MIME sniffing, framing, and unused device permissions. Its Content Security Policy restricts
scripts, styles, connections, and fonts to the same origin, permits data-URL images, and disallows inline scripts,
dynamic code evaluation, and object embeds. MIME sniffing means guessing a response type instead of honoring its
Content-Type. HTML is revalidated (`no-cache`); hashed assets are immutable. API headers pass through unchanged.
Invitation pages use `no-store` (no retained response) and `no-referrer` (no URL forwarding), including after the
internal document redirect.

Access logs retain fixed method/path labels, status, and generated request IDs. They exclude credentials, cookies,
queries, bodies, email addresses, and invitation/authentication URLs. Raw Nginx request-error logging is disabled;
status logs, process exits, and health checks expose failures. Backend upload limits still apply. The gateway allows
one hour of idle response time for synchronous mailbox verification.

## Isolated Stacks

For isolated stacks, set `COMPOSE_PROJECT_NAME` and free host ports through `WEB_PORT`, `KEYCLOAK_PORT`,
`POSTGRES_PORT`, `REDIS_PORT`, `GARAGE_PORT`, `BULLBOARD_PORT`, and the authentication-mail overrides. Provision with
matching public `APP_BASE_URL` and `OIDC_ISSUER_URL` values and matching Keycloak client redirect URLs;
configure the application API and database addresses for that stack. BFF means backend for frontend, the server
handling browser authentication. Retry repaired builds/tests directly; stop only the verified project.
