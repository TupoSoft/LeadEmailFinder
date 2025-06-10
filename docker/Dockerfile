# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-alpine

ARG TARGET_APP

ENV APP=$TARGET_APP

ENV METADATA_FILE_PATH="apps/$TARGET_APP/src/generate-metadata.ts"

ENV PATH="/app/node_modules/.bin:$PATH"

WORKDIR /app

RUN apk add --no-cache curl wget bind-tools jq

# Install pnpm.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# Leverage a bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=../package.json,target=package.json \
    --mount=type=bind,source=../pnpm-lock.yaml,target=pnpm-lock.yaml \
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

RUN

# Run the application.
CMD \[ -f "$METADATA_FILE_PATH" ] && ts-node "$METADATA_FILE_PATH"; pnpm start:dev $APP
