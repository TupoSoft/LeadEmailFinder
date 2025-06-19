# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-alpine

ARG GRPC=false

ARG TARGET_APP

ENV APP=${TARGET_APP:-lead-email-finder}

ENV METADATA_FILE_PATH="apps/$APP/src/generate-metadata.ts"

ENV PATH="/app/node_modules/.bin:$PATH"

WORKDIR /app

RUN <<EOF
apk add --no-cache curl wget bind-tools jq

GRPC_HEALTH_PROBE_VERSION=v0.4.38
wget -qO/bin/grpc_health_probe https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64
chmod +x /bin/grpc_health_probe
EOF

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# Leverage a bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=../package.json,target=package.json \
    --mount=type=bind,source=../pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=bind,source=../pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --frozen-lockfile i

# Run the application as a non-root user.
USER node

# Copy the rest of the source files into the image.
COPY . .

# Debug
EXPOSE 9229

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ([ -f "$METADATA_FILE_PATH" ] && ts-node "$METADATA_FILE_PATH" || true) && pnpm start "$APP"
