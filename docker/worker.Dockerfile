# syntax=docker/dockerfile:1
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
RUN npm install --global corepack@0.36.0 && \
    corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/verification-contracts/package.json packages/verification-contracts/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder-worker... install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages/verification-contracts ./packages/verification-contracts
RUN pnpm --filter @tuposoft/lead-email-finder-verification-contracts build && \
    pnpm --filter @tuposoft/lead-email-finder-worker build

FROM node:${NODE_VERSION}-alpine
WORKDIR /app
RUN npm install --global corepack@0.36.0 && \
    corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/verification-contracts/package.json packages/verification-contracts/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder-worker... install --frozen-lockfile --prod
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages/verification-contracts/dist ./packages/verification-contracts/dist
WORKDIR /app/apps/worker
USER node
CMD ["node", "dist/main.js"]
