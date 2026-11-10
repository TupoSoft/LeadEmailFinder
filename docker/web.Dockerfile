# syntax=docker/dockerfile:1
FROM node:26-alpine AS build
WORKDIR /app
RUN npm install --global corepack@0.36.0 && \
    corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter @tuposoft/lead-email-finder-web... install --frozen-lockfile --ignore-scripts
COPY apps/web apps/web
COPY packages/api-client packages/api-client
COPY apps/api/src/libs/common/src/checkout-redirect.ts apps/api/src/libs/common/src/checkout-redirect.ts
ARG PAYMENTS_PROVIDER=stub
ARG PAYMENTS_CHECKOUT_URL=http://localhost:53000/billing/complete
ARG PAYMENTS_CHECKOUT_ALLOWED_ORIGINS
RUN pnpm --filter @tuposoft/lead-email-finder-web build

FROM nginxinc/nginx-unprivileged:1.30.0-alpine@sha256:808f7846d21a9c94cf53833e8807a00a33fd0b65cc47fb05b79efe366c2d201f
COPY docker/web/nginx.conf /etc/nginx/nginx.conf
COPY docker/web/default.conf /etc/nginx/conf.d/default.conf
COPY docker/web/proxy.conf docker/web/security-headers.conf /etc/nginx/web/
# A dedicated root prevents the base image's sample HTML from becoming UI routes.
COPY --from=build /app/apps/web/dist /usr/share/nginx/lef
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8081/health || exit 1
# Skip image entrypoint scripts: configuration is immutable and already complete.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
