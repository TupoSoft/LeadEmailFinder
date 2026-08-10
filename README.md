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

---

## Prerequisites

Before running the project, ensure you have the following installed on your system:

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) v2

Node.js is only needed when running the package scripts outside Docker. The development containers use the pnpm version pinned in `package.json`.

---

## Getting Started

Clone this repository:

```shell
  git clone https://github.com/TupoSoft/LeadEmailFinder.git
  cd LeadEmailFinder
```

## Development

### Environment Variables

Docker Compose loads `docker/.env` for the API container. Before the first start, create this file and configure:

```dotenv
NODE_ENV=development
CATCH_ALL_HTTP_PROXY_URL=<HTTP proxy URL reachable from the API container>
```

`CATCH_ALL_HTTP_PROXY_URL` is required for catch-all verification. The Compose stack also reads its database, Redis, S3, and API-key settings from files in `docker/secrets/`; keep those files available locally and never commit real production credentials.

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

Once running, connect your preferred debugging client using the Node.js Inspector protocol. Detailed instructions for
setting up a client can be found in
the [Node.js debugging guide](https://nodejs.org/en/learn/getting-started/debugging#inspector-clients).

Attach the client to `localhost:59229`.

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
