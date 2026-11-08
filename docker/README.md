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

Compose defaults to the watched `pnpm start`. Automated browser runs set `API_START_COMMAND='pnpm exec nest start'`
so type checking and API-documentation generation finish before health succeeds. The web image contains built
assets and a pinned, unprivileged Nginx runtime. Its loopback health endpoint on port 8081 checks static serving,
not API readiness; full browser validation requires both web and API health.

For fresh **disposable** default data:

```sh
corepack pnpm dev:reset -- --confirm-project=LEF
```

Reset rebuilds/provisions the stack, seeds authentication fixtures, and checks public web and authenticated billing.
It deletes development data only after checking checkout ownership, Compose configuration, labels, and allowlisted
volumes. Stop overlays first and inspect the printed targets. Never reset another checkout or globally prune Docker.

Machine callers use direct Bearer API keys. Provisioning writes ignored, owner-only (`0600`) files:
`.dev/auth/platform-api-key.json` and `.dev/auth/customer-api-key.json`. Repeated seeding preserves active keys;
reset removes them because the corresponding database rows are discarded. Reseed after incompatible schema changes.
The SMTP verification overlay privately mounts the platform file. Human browser fixtures still use Keycloak until
that authentication path is switched.

## Authentication Mail

`auth-mail` captures Better Auth transactional messages without relaying them. Containers send SMTP (the mail
protocol) to `auth-mail:1025`; hosts use SMTP at `127.0.0.1:51025` and Mailpit's inbox at `http://127.0.0.1:8025`.
Override `AUTH_MAIL_PUBLISHED_SMTP_PORT` or `AUTH_MAIL_HTTP_PORT` if needed. This service is independent of the SMTP
verification overlay. Reset clears captured messages.

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

## Verification and Recovery

```sh
corepack pnpm test:gateway
corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install chromium
corepack pnpm test:web-live
corepack pnpm bruno:bff-sessions
```

Build the tagged web image before `test:gateway`, which compares Vite/Nginx routing, forwarding, caching, headers,
and sanitized logs in temporary containers. The live browser runner checks real login, expiry/replacement,
competing callbacks, browser history, keyboard navigation, and logout across tabs. It verifies ownership/health,
creates and deletes temporary ordinary members, expires only the test session, and suppresses credential-bearing
artifacts. Bruno executes API request collections; its launcher requires every request and test to run.

For isolated stacks, set `COMPOSE_PROJECT_NAME` and free host ports through `WEB_PORT`, `KEYCLOAK_PORT`,
`POSTGRES_PORT`, `REDIS_PORT`, `GARAGE_PORT`, `BULLBOARD_PORT`, and the authentication-mail overrides. Provision with
matching public `KEYCLOAK_URL`, `KEYCLOAK_BFF_REDIRECT_URIS`, and `KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS`;
host fixture scripts also need `API_URL` and `POSTGRES_URL`. BFF means backend for frontend, the server handling
browser authentication. The reset command supports only default `LEF` and standard ports. Launchers discover owned
endpoints and reject stale or foreign resources. Retry repaired builds/tests directly; stop only the verified project.
