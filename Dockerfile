# syntax=docker/dockerfile:1
ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-alpine AS builder

ENV PATH="/app/node_modules/.bin:$PATH"

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

WORKDIR /app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# Leverage a bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile i

# Copy the rest of the source files into the image.
COPY . .

# Build the application.
RUN pnpm build

FROM node:${NODE_VERSION}-alpine

# Container dependencies
RUN apk add --no-cache \
    # curl is for the healthcheck
    curl \
    # bind-tools is for DNS, see https://github.com/nodejs/docker-node/issues/339
    bind-tools \
    # jq is for the healthcheck
    jq

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

WORKDIR /app

ENV PATH="/app/node_modules/.bin:$PATH"

COPY package.json .
COPY pnpm-lock.yaml .

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile -P i

USER node

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Run the application.
CMD ["pnpm", "start"]
