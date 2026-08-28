# Lead Email Finder

Lead Email Finder is an API for finding email addresses.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
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

## Development

### Environment Variables

The development Compose stack defaults `NODE_ENV` to `development`. It also loads `docker/.env` when that optional,
gitignored file exists. Create it only when you need to configure local overrides such as:

```dotenv
CATCH_ALL_HTTP_PROXY_URL=<HTTP proxy URL reachable from the API container>
PROXY_MX_REQUESTS_PER_MINUTE=10
PROXY_LEASE_TTL_MS=60000
```

`CATCH_ALL_HTTP_PROXY_URL` is optional; catch-all verifiers remain inactive when it is unset. The Compose stack reads
its database, Redis, and S3 settings from files in `docker/secrets/`; keep those files available locally and never
commit real production credentials.

`PROXY_MX_REQUESTS_PER_MINUTE` and `PROXY_LEASE_TTL_MS` are optional proxy-fleet limits. They default to 10 MX attempts per minute and a 60-second egress lease.

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

When the API health check passes, use:

- API documentation: http://localhost:53000/
- Health check: http://localhost:53000/health

The application listens on port `3000` inside its container and is published on host port `53000`.

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

### Local Services

The development Compose stack starts the following supporting services:

| Service | Host address | Purpose |
| --- | --- | --- |
| API | http://localhost:53000 | Lead Email Finder API and Swagger documentation |
| PostgreSQL | `localhost:55432` | Application database |
| Redis | `localhost:56379` | Queue and cache storage |
| Bull Board | http://localhost:54000 | Queue dashboard |
| MinIO API | http://localhost:59000 | S3-compatible object storage |
| MinIO Console | http://localhost:59001 | Object storage console |

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

| Fixture | Identity | Notes |
| --- | --- | --- |
| Platform M2M credential | `lef-development-service` (Client Credentials) | `platform:admin`; see `scripts/keycloak/bootstrap-credential.ts` |
| Platform operator (human) | `platform-operator@lef.test` | `platform_admin`; password is the fixed dev-only constant in `scripts/keycloak/platform-operator.ts` |
| Customer organization | "Acme Development Customer" | Owner `owner@acme.lef.test`, 1000 starting credits |
| Customer M2M credential | `lef-svc-dev-fixture` (Client Credentials) | Scoped to `verification:run`/`verification:read` only |

Generated secrets (Keycloak client secrets, id summaries) are written only to the gitignored `.dev/keycloak/*.json` files, never printed in full.
