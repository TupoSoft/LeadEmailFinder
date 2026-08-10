FROM dxflrs/garage:v2.3.0 AS garage

FROM busybox:1.37.0-musl

COPY --from=garage /garage /garage
COPY docker/garage-entrypoint.sh /garage-entrypoint.sh

ENTRYPOINT ["/bin/sh", "/garage-entrypoint.sh"]
