# syntax=docker/dockerfile:1

# Base stage: Sets up Node.js and basic dependencies.
ARG NODE_VERSION=lts
FROM node:${NODE_VERSION}-alpine AS base-stage
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache curl wget bind-tools && corepack enable

# Builder stage: Installs dependencies and builds the project.
FROM base-stage AS builder-stage
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm deploy --filter=@tuposoft/lead-email-finder-api /api

# Runtime stage: Prepares the runtime environment.
FROM base-stage AS runtime-stage
WORKDIR /app
COPY --from=builder-stage /api /app
EXPOSE 3000
CMD ["pnpm", "dev"]
