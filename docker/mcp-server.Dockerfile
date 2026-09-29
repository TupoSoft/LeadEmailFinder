# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine

ENV PATH="/app/node_modules/.bin:$PATH"

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update-cache \
    # curl is for the healthcheck \
    curl \
    # jq is for the healthcheck \
    jq

# Enable the pnpm version pinned by package.json.
RUN corepack enable

# The connector has no workspace-internal dependencies; only its own manifest is needed to resolve
# the scoped install against the root lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile

COPY apps/mcp-server apps/mcp-server

RUN pnpm --filter @tuposoft/lead-email-finder-mcp-server build

EXPOSE 3002

CMD ["pnpm", "--filter", "@tuposoft/lead-email-finder-mcp-server", "start"]
