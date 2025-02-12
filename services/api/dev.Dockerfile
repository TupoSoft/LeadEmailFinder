# syntax=docker/dockerfile:1

# Base stage: Sets up Node.js and basic dependencies.
ARG NODE_VERSION=lts
FROM node:${NODE_VERSION}-alpine AS base-stage
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"
# https://github.com/npm/cli/issues/8075
ENV COREPACK_INTEGRITY_KEYS=0
RUN apk add --no-cache curl bind-tools && corepack enable

# Builder stage: Installs dependencies and builds the project.
FROM base-stage AS builder-stage
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm deploy --filter=api /api

# Runtime stage: Prepares the runtime environment.
FROM base-stage AS runtime-stage
WORKDIR /app
COPY --from=builder-stage /api /app
EXPOSE 3000
CMD ["pnpm", "dev"]
