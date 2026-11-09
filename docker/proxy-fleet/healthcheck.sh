#!/bin/sh
# Fails unless the 3proxy process is running (as PID 1, per entrypoint.sh's final `exec`) and every
# declared listener port accepts a TCP connection. Invoke this script inside the running container.
set -eu

manifest_path="${LEF_PROXY_FLEET_MANIFEST:-/etc/lead-email-finder/proxy-fleet/listeners.json}"

[ "$(cat /proc/1/comm 2>/dev/null)" = "3proxy" ] || exit 1

# shellcheck disable=SC2046 -- deliberate word-splitting of newline-separated "ip:port" tokens into
# positional parameters. A piped `while read` here would run in a subshell and swallow a failing `exit`.
set -- $(jq -r '.listeners[] | "\(.bindIp):\(.port)"' "$manifest_path")
for endpoint in "$@"; do
    ip="${endpoint%:*}"
    port="${endpoint#*:}"
    nc -z -w 1 "$ip" "$port" || exit 1
done
