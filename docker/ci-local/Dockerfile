FROM docker:29.6.1-dind AS docker
FROM ruby:3.3-bookworm AS ruby
FROM node:24-bookworm

COPY --from=ruby /usr/local/ /usr/local/
COPY --from=docker /usr/local/bin/docker /usr/local/bin/dockerd /usr/local/bin/containerd /usr/local/bin/containerd-shim-runc-v2 /usr/local/bin/runc /usr/local/bin/docker-init /usr/local/bin/docker-proxy /usr/local/bin/
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git git-lfs iptables jq libyaml-0-2 libffi8 procps \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && git lfs install --system --skip-repo \
    && git config --system --add safe.directory /workspace

ENV CI=true HUSKY=0 LEF_LOCAL_CI_CONTAINER=1 DOCKER_HOST=unix:///var/run/docker.sock \
    API_START_COMMAND="pnpm exec nest start"
WORKDIR /workspace
# Each run owns an anonymous volume; never nest the daemon's data in the outer overlay layer.
VOLUME /var/lib/docker
COPY run-local-checks.mjs select-validation.mjs /opt/lef-ci/
COPY --chmod=755 entrypoint.sh /opt/lef-ci/entrypoint.sh
ENTRYPOINT ["/opt/lef-ci/entrypoint.sh"]
