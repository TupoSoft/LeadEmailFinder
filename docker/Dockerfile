# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine

ENV PATH="/app/node_modules/.bin:$PATH"

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update-cache \
    # curl is for the healthcheck \
    curl \
    # bind-tools is for DNS, see https://github.com/nodejs/docker-node/issues/339 \
    bind-tools \
    # jq is for the healthcheck \
    jq

# Enable the pnpm version pinned by package.json.
RUN corepack enable

# Install the API dependencies and the shared development tools independently of the web app.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/verification-contracts/package.json packages/verification-contracts/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder --filter @tuposoft/lead-email-finder-api... install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/verification-contracts ./packages/verification-contracts

# Compile during the image build; the startup command watches for source changes.
WORKDIR /app/apps/api
RUN pnpm --filter @tuposoft/lead-email-finder-verification-contracts build && pnpm build

# Debug
EXPOSE 9229

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ["pnpm", "start"]
