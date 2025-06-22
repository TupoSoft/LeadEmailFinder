# syntax=docker/dockerfile:1
ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-alpine AS builder

ENV PATH="/app/node_modules/.bin:$PATH"

ARG TARGET_APP

ENV METADATA_FILE_PATH="apps/$TARGET_APP/src/generate-metadata.ts"

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
    --mount=type=bind,source=pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile i

# Copy the rest of the source files into the image.
COPY . .

# Generate metadata and build the application.
RUN <<EOF
set -e
tsc --noEmit -p apps/$TARGET_APP/tsconfig.app.json
[ -f "$METADATA_FILE_PATH" ] && ts-node "$METADATA_FILE_PATH"
pnpm build $TARGET_APP
EOF

FROM node:${NODE_VERSION}-alpine

ENV PATH="/app/node_modules/.bin:$PATH"

ARG GRPC_HEALTH_PROBE_VERSION=v0.4.38

ARG TARGET_APP

ENV APP_MAIN_FILE="dist/apps/$TARGET_APP/main"

RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update-cache \
    wget \
    # curl is for the healthcheck
    curl \
    # bind-tools is for DNS, see https://github.com/nodejs/docker-node/issues/339
    bind-tools \
    # jq is for the healthcheck
    jq

RUN <<EOF
set -e
wget -qO/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64
chmod +x /bin/grpc_health_probe
EOF

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile -P i

USER node

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Run the application.
SHELL ["sh", "-c"]
CMD node $APP_MAIN_FILE
