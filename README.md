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

---

## Prerequisites

Before running the project, ensure you have the following installed on your system:

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js (optional)](https://nodejs.org/) — for connecting a debugging client if needed.

---

## Getting Started

Clone this repository:

```shell
  git clone https://github.com/TupoSoft/LeadEmailFinder.git
  cd LeadEmailFinder
```

## Development

### Running the Application

To start the application in development mode, use the following command:

```shell
  docker compose -f docker/compose.yaml up -d --build
```

This will:

- Build the necessary Docker images.

- Start the application in a detached mode.

Access the application API at http://localhost:3000 (adjust the port if configured differently).

### Debugging the Application

To run the application in debugging mode:

```shell
  docker compose -f docker/compose.yaml -f docker/compose.debug.yaml up -d --build
```

Once running, connect your preferred debugging client using the Node.js Inspector protocol. Detailed instructions for
setting up a client can be found in
the [Node.js debugging guide](https://nodejs.org/en/learn/getting-started/debugging#inspector-clients).
