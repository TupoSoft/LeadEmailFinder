#!/bin/sh
set -eu

# The launcher provides no host mounts or published ports. Even fixed Compose
# names and reset commands therefore operate only on this disposable daemon.
dockerd --host=unix:///var/run/docker.sock > /tmp/lef-dockerd.log 2>&1 &
daemon_pid=$!
trap 'kill "$daemon_pid" 2>/dev/null || true' EXIT
attempt=0
until docker info > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ] || ! kill -0 "$daemon_pid" 2>/dev/null; then
        cat /tmp/lef-dockerd.log >&2
        echo 'The isolated Docker daemon could not start.' >&2
        exit 1
    fi
    sleep 1
done

corepack pnpm install --frozen-lockfile
node /opt/lef-ci/run-local-checks.mjs
