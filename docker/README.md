# Single-Origin Development Gateway

The base Compose stack serves the product at `http://localhost:53000`. The `web` service publishes `53000:8080`
and proxies API requests to `api:3000`. The API has no default published port. Keycloak keeps its public issuer at
`http://localhost:58080/realms/lead-email-finder` and uses the existing internal provider addresses for server calls.
`APP_BASE_URL`, BFF callbacks, and payment return URLs remain on port 53000.

## Build and Start

Build the images independently from the repository root:

```sh
docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .
docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .
docker compose -f docker/compose.yaml config --quiet
docker compose -f docker/compose.yaml up -d --build --wait --wait-timeout 240
```

The API image installs the backend workspace, compiles NestJS, and retains the existing development watcher.
Compose defaults `API_START_COMMAND` to `pnpm start`. Automated browser runs set it to `pnpm exec nest start` for
both initial provisioning and SMTP attachment. This completes type checking and Swagger metadata generation before
the API starts, preventing a watched restart after the first successful health check.
The web image builds the web workspace and its client dependency in Node 24, then copies only static assets and
Nginx configuration into a version- and digest-pinned unprivileged runtime. Its health check requests static service
health on a separate loopback listener at port 8081. It does not call the API. The full browser smoke requires both
services to be healthy.

For a fresh disposable development stack, `corepack pnpm dev:reset -- --confirm-project=LEF` rebuilds the services,
provisions Keycloak, seeds development fixtures, waits for web and API health, and checks the public product and an
authenticated credit balance. Reset refuses another checkout's containers or an unexpected Compose configuration,
and validates the project labels and exact allowlisted volume names before deletion. Stop overlays before reset.
The command removes development data; inspect its printed targets before confirming it.

## Recover an Older SMTP Network

The SMTP overlay now uses a separate `smtp-dev` network. Its fixed subnet no longer replaces the base stack's
default network. Enable it on an already provisioned base stack with:

```sh
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

An older overlay may have left `172.28.0.0/24` assigned to `<project>_default`. That network must be replaced once
before the new fixture network can use the subnet. Inspect it with `docker network inspect lef_default` for the
default project; substitute the project name when using `-p`.

For disposable object data, the following recovery retains the named PostgreSQL, Keycloak, and Redis volumes,
but **deletes Garage's container-local object data**. Do not use it when existing batch files must be preserved:

```sh
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

To preserve object data, retain the Garage container instead. Stop the owned stack, record the container IDs and
network configuration, and back up `/tmp/garage-meta` and `/tmp/garage-data` from Garage with `docker cp`.
Disconnect every owned container from the old default network and remove only that network. Running
`docker compose -f docker/compose.yaml create --no-recreate garage` creates the base network again. Reconnect
each retained base service with `docker network connect --alias <service> --alias <container> <project>_default <container>`;
include `smtp-dev-dns-cache-reset` if its container already exists. Then run the overlay startup command above.
Compose recreates the fixture containers with their new network attachments. Verify service-name resolution,
container identities, and health before discarding the backup. Never use `down -v` for this recovery.

## Route Ownership

| Public path | Owner and result |
| --- | --- |
| `/` and other UI routes | Static product; hard refreshes use the SPA document and React Router's not-found handling. |
| `/v1`, `/verify`, `/verifyAsync`, `/verifyBatch`, `/emails`, `/credits`, and descendants | API; preserve methods, bodies, queries, cookies, redirects, errors, and content type. |
| `/docs` and descendants | API Swagger UI and assets; its server URL is `/` for same-origin requests. |
| `/health`, `/openapi.json` | API health and normalized browser contract. |
| `/docs-json`, `/docs-yaml` | API-reserved paths returning JSON `404`. |

The Vite proxy uses the same explicit path boundaries. Similar names such as `/v1-other` remain UI-owned.
Unknown API children remain backend errors; a matched protected endpoint can return an authentication error even
when its resource ID does not exist. Test unknown routes with an unmatched child when a JSON `404` is required.

Run `corepack pnpm --filter @tuposoft/lead-email-finder-web dev` for UI hot updates. Vite forwards explicit API paths
to `http://localhost:53000` by default; `WEB_API_PROXY_TARGET` can select a standalone backend. Use the built gateway
on port 53000 for the full cookie session workflow because the API's `APP_BASE_URL` owns the redirect and CSRF origins.
Vite's development-only policy uses a nonce for its refresh bootstrap and style updates and permits local HMR
WebSocket connections. The built gateway uses the strict policy below.

## Headers, Caching, and Logs

Product documents and static assets receive `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a permissions policy disabling camera, microphone,
geolocation, payment, and USB. The Content Security Policy permits same-origin scripts, styles, connections, and
fonts; images may also use data URLs. It disables objects and framing and restricts base URLs to the same origin.
The Nginx policy has no `unsafe-inline` or `unsafe-eval`. HTML uses `Cache-Control: no-cache`; hashed assets use
immutable caching. Proxied API responses preserve their own headers, including callback `no-store` and `no-referrer`.
Public invitation documents, including the sanitized `/accept-invitation` route, use `Cache-Control: no-store`
and `Referrer-Policy: no-referrer` in both Vite and Nginx. The policy survives the internal SPA document redirect.

Gateway access logs contain only a fixed method label, a fixed path label, status, and a generated request ID.
Unknown paths also receive fixed labels. OAuth, invitation, email, cookie, authorization, query, and request-body
values never enter the access format. Nginx request error logs are disabled because their raw messages cannot be
sanitized; failed requests remain visible through status codes in the structured access log. Configuration failures
remain observable through process exit and health checks. The API keeps its existing safe request logger. API uploads retain backend size validation, and the gateway allows
one hour of idle response time for the existing synchronous SMTP workflow.

## Verification and Recovery

```sh
corepack pnpm test:gateway
corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install chromium
corepack pnpm test:web-live
corepack pnpm bruno:bff-sessions
```

The gateway test uses its own temporary Docker network and fixture containers to compare Vite and Nginx routing,
request forwarding, caching, headers, and sanitized logs. Build the tagged web image above before running it.
The live browser launcher verifies current checkout ownership and creates two transient Keycloak members in one
application organization. Its six tests cover real login, safe destination recovery, session expiry, account
replacement, competing callbacks, browser history restoration, keyboard navigation, and signing out across tabs with
CSRF protection.
It checks both log streams with synthetic markers and removes its own member fixtures. Only the current test's
session key is expired; no shared Redis or database reset is used. Browser traces and artifacts that contain
credentials are disabled. The Bruno launcher executes `bru run --env local` with the repository-pinned CLI and
requires all requests and tests to run.

For a separately named stack, set `COMPOSE_PROJECT_NAME` when invoking the live launchers. The optional Compose
variables `WEB_PORT`, `KEYCLOAK_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `GARAGE_PORT`, and `BULLBOARD_PORT` retain their
usual defaults but allow another checkout to use free host ports. Web and Keycloak public URLs follow those port
settings. When provisioning such a stack, set `KEYCLOAK_URL`, `KEYCLOAK_BFF_REDIRECT_URIS`, and
`KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS` to its public URLs. Host-run fixture scripts also need its `API_URL` and
`POSTGRES_URL`. The reset command is reserved for the default `LEF` project and its standard ports. The launchers discover
port 53000 through the owned gateway and keep internal API ownership checks. They reject missing, foreign, or stale
resources. Retry image builds and tests directly after repairing failures. Stop only a confirmed checkout-owned
Compose project; never use a global container or volume prune. This topology is for disposable development and CI.
