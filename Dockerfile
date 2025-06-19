# syntax=docker/dockerfile:1
ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-alpine AS builder

ARG TARGET_APP

ENV PATH="/app/node_modules/.bin:$PATH"

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
tsc --noEmit -p apps/$TARGET_APP/tsconfig.app.json
[ -f "$METADATA_FILE_PATH" ] && ts-node "$METADATA_FILE_PATH"
pnpm build $TARGET_APP
EOF

FROM node:${NODE_VERSION}-alpine

ARG TARGET_APP

ARG GRPC=false

ENV APP_MAIN_FILE=dist/apps/$TARGET_APP/main

ENV PATH="/app/node_modules/.bin:$PATH"

RUN <<EOF
apk add --no-cache \
wget \
# curl is for the healthcheck
curl \
# bind-tools is for DNS, see https://github.com/nodejs/docker-node/issues/339
bind-tools \
# jq is for the healthcheck
jq

GRPC_HEALTH_PROBE_VERSION=v0.4.38
wget -qO/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64
chmod +x /bin/grpc_health_probe
EOF

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile -P i

USER node

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Run the application.
SHELL ["sh", "-c"]
CMD node $APP_MAIN_FILE
