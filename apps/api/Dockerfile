# syntax=docker/dockerfile:1
FROM node:lts-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# https://github.com/npm/cli/issues/8075
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run -r build
RUN pnpm deploy --filter=api --prod /prod/app

FROM base AS app
COPY --from=build /prod/app /app
WORKDIR /app
EXPOSE 3000
CMD [ "pnpm", "start" ]
