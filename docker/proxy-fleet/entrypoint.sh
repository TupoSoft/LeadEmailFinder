#!/bin/sh
# Reads the read-only listener manifest and credentials file, validates and renders them via
# render-config.sh, writes the runtime configuration under /run, then execs 3proxy as PID 1. See
# .agents/plans/proxy-fleet/11-fleet-capable-3proxy-image.md for the manifest/credential contracts.
set -eu

umask 077

manifest_path="${LEF_PROXY_FLEET_MANIFEST:-/etc/lead-email-finder/proxy-fleet/listeners.json}"
credentials_path="${LEF_PROXY_FLEET_CREDENTIALS:-/run/secrets/proxy_credentials}"
rendered_config_dir="/run/3proxy"
rendered_config_path="${rendered_config_dir}/3proxy.cfg"

mkdir -p "$rendered_config_dir"

/usr/local/bin/render-config.sh "$manifest_path" "$credentials_path" >"$rendered_config_path"
chmod 600 "$rendered_config_path"

exec 3proxy "$rendered_config_path"
