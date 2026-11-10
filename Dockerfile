# syntax=docker/dockerfile:1
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-alpine AS builder

ENV PATH="/app/node_modules/.bin:$PATH"

ARG TARGET_APP

# Install Corepack to enable the pnpm version pinned by package.json.
RUN npm install --global corepack@0.36.0 && \
    corepack enable

WORKDIR /app

# Install the API dependencies and the shared build tools before copying sources.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/verification-contracts/package.json packages/verification-contracts/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder --filter @tuposoft/lead-email-finder-api... install --frozen-lockfile

# Copy the rest of the source files into the image.
COPY . .

# Generate metadata and build the application.
RUN pnpm --filter @tuposoft/lead-email-finder-verification-contracts build && pnpm --filter @tuposoft/lead-email-finder-api build

FROM node:${NODE_VERSION}-alpine

ENV PATH="/app/node_modules/.bin:$PATH"

ENV APP_MAIN_FILE="dist/main"

RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update-cache \
    wget \
    # curl is for the healthcheck
    curl \
    # bind-tools is for DNS, see https://github.com/nodejs/docker-node/issues/339
    bind-tools \
    # jq is for the healthcheck
    jq

# Install Corepack to enable the pnpm version pinned by package.json.
RUN npm install --global corepack@0.36.0 && \
    corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/verification-contracts/package.json packages/verification-contracts/package.json

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder-api... install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/verification-contracts/dist ./packages/verification-contracts/dist

WORKDIR /app/apps/api
USER node

EXPOSE 3000

# Run the application.
SHELL ["sh", "-c"]
CMD node $APP_MAIN_FILE
