# syntax=docker/dockerfile:1
#
# A fleet-capable, multi-listener 3proxy image. See .agents/plans/proxy-fleet/11-fleet-capable-3proxy-image.md
# for the governing ExecPlan. The entrypoint reads a read-only listener manifest and a read-only credentials
# file, validates both, renders /run/3proxy/3proxy.cfg, and execs 3proxy.
#
# Base: the 0.9.8.busybox release variant published by https://github.com/3proxy/3proxy — musl-linked (built
# against docker.io/alpine). The musl build lets the binary run directly against this image's own
# Alpine musl loader with no relinking.
FROM ghcr.io/3proxy/3proxy:0.9.8.busybox@sha256:5cd3650349be841b88c5742336d1f8031edd9596b3e8c113c6e62bb911fb48bb AS proxy-base

FROM alpine:3.22

# jq validates and renders the listener manifest/credentials; iproute2 lists this container's own assigned
# addresses so the entrypoint can reject a manifest address the host network namespace doesn't actually own.
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update-cache \
    jq \
    iproute2

COPY --from=proxy-base /bin/3proxy /usr/local/3proxy/bin/3proxy
COPY --from=proxy-base /usr/local/3proxy/libexec /usr/local/3proxy/libexec
ENV PATH="/usr/local/3proxy/bin:${PATH}"

COPY docker/proxy-fleet/entrypoint.sh docker/proxy-fleet/render-config.sh docker/proxy-fleet/healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/render-config.sh /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/entrypoint.sh"]
