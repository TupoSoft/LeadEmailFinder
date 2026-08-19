#!/bin/sh
# Validates a listener manifest and a credentials file, then renders a 3proxy configuration to stdout.
# On any validation failure, prints a diagnostic to stderr and exits nonzero without emitting a rendered
# configuration. See .agents/plans/proxy-fleet/11-fleet-capable-3proxy-image.md for the manifest/credential
# contracts this enforces.
#
# Usage: render-config.sh <manifest.json> <credentials.json>
#
# The set of addresses considered "assigned to this host" is normally discovered via `ip -j addr show`. Set
# LEF_ASSIGNED_ADDRESSES (newline-separated) to override this, which is how the table tests exercise the
# unassigned-address rejection path without real matching interfaces.
set -eu

fail() {
    printf 'render-config: %s\n' "$1" >&2
    exit 1
}

manifest="${1:-}"
credentials="${2:-}"
[ -n "$manifest" ] && [ -f "$manifest" ] || fail "manifest file not found: ${manifest:-<missing>}"
[ -n "$credentials" ] && [ -f "$credentials" ] || fail "credentials file not found: ${credentials:-<missing>}"

jq -e . "$manifest" >/dev/null 2>&1 || fail "manifest is not valid JSON"
jq -e . "$credentials" >/dev/null 2>&1 || fail "credentials file is not valid JSON"

# --- structural / value validation --------------------------------------------------------------

jq -e '(.workerCidrs // []) | length > 0' "$manifest" >/dev/null || fail "workerCidrs must not be empty"
jq -e '(.allowedDestinationPorts // []) | length > 0' "$manifest" >/dev/null \
    || fail "allowedDestinationPorts must not be empty"
jq -e '(.listeners // []) | length > 0' "$manifest" >/dev/null || fail "listeners must not be empty"

dupes="$(jq -r '[.listeners[].egressId] | group_by(.) | map(select(length > 1)) | flatten | unique | .[]' "$manifest")"
[ -z "$dupes" ] || fail "duplicate egressId: $(printf '%s' "$dupes" | tr '\n' ' ')"

dupes="$(jq -r '[.listeners[] | "\(.bindIp):\(.port)"] | group_by(.) | map(select(length > 1)) | flatten | unique | .[]' "$manifest")"
[ -z "$dupes" ] || fail "duplicate bindIp/port pair: $(printf '%s' "$dupes" | tr '\n' ' ')"

dupes="$(jq -r '[.listeners[].egressIp] | group_by(.) | map(select(length > 1)) | flatten | unique | .[]' "$manifest")"
[ -z "$dupes" ] || fail "duplicate egressIp: $(printf '%s' "$dupes" | tr '\n' ' ')"

jq -e '[.listeners[].port, .allowedDestinationPorts[]] | all(type == "number" and . >= 1 and . <= 65535)' \
    "$manifest" >/dev/null || fail "listener and allowed destination ports must be integers between 1 and 65535"

jq -e '[.listeners[].maxConnections] | all(type == "number" and . > 0)' "$manifest" >/dev/null \
    || fail "maxConnections must be a positive number for every listener"

# --- credentials one-to-one match with manifest egressIds ----------------------------------------

manifest_ids="$(jq -r '.listeners[].egressId' "$manifest" | sort -u)"
credential_ids="$(jq -r 'keys[]' "$credentials" | sort -u)"

manifest_ids_file="$(mktemp)"
credential_ids_file="$(mktemp)"
printf '%s\n' "$manifest_ids" >"$manifest_ids_file"
printf '%s\n' "$credential_ids" >"$credential_ids_file"
missing="$(comm -23 "$manifest_ids_file" "$credential_ids_file")"
extra="$(comm -13 "$manifest_ids_file" "$credential_ids_file")"
rm -f "$manifest_ids_file" "$credential_ids_file"

if [ -n "$missing" ] || [ -n "$extra" ]; then
    fail "credentials do not match manifest egressIds 1:1 (missing: $(printf '%s' "$missing" | tr '\n' ' '); extra: $(printf '%s' "$extra" | tr '\n' ' '))"
fi

jq -e '[.[] | ((.user // "") | length > 0) and ((.pass // "") | length > 0)] | all' "$credentials" >/dev/null \
    || fail "every credential entry must have a non-empty user and pass"

# --- host network namespace check -----------------------------------------------------------------

if [ -n "${LEF_ASSIGNED_ADDRESSES:-}" ]; then
    assigned_addresses="$LEF_ASSIGNED_ADDRESSES"
else
    assigned_addresses="$(ip -j addr show | jq -r '.[].addr_info[]? | select(.family == "inet") | .local')"
fi

manifest_addresses="$(jq -r '.listeners[] | .bindIp, .egressIp' "$manifest" | sort -u)"
# shellcheck disable=SC2086 -- deliberate word-splitting of a newline-separated address list.
for address in $manifest_addresses; do
    printf '%s\n' "$assigned_addresses" | grep -qx "$address" \
        || fail "address not assigned to this network namespace: $address"
done

# --- render ------------------------------------------------------------------------------------

worker_cidrs="$(jq -r '.workerCidrs | join(",")' "$manifest")"
allowed_ports="$(jq -r '.allowedDestinationPorts | join(",")' "$manifest")"

printf 'auth strong\n'
printf 'users'
jq -r '.listeners[].egressId' "$manifest" | while read -r egress_id; do
    user="$(jq -r --arg id "$egress_id" '.[$id].user' "$credentials")"
    pass="$(jq -r --arg id "$egress_id" '.[$id].pass' "$credentials")"
    printf ' %s:CL:%s' "$user" "$pass"
done
printf '\n'

jq -c '.listeners[]' "$manifest" | while read -r listener; do
    egress_id="$(printf '%s' "$listener" | jq -r '.egressId')"
    bind_ip="$(printf '%s' "$listener" | jq -r '.bindIp')"
    port="$(printf '%s' "$listener" | jq -r '.port')"
    egress_ip="$(printf '%s' "$listener" | jq -r '.egressIp')"
    max_connections="$(printf '%s' "$listener" | jq -r '.maxConnections')"
    user="$(jq -r --arg id "$egress_id" '.[$id].user' "$credentials")"

    printf '\nflush\n'
    # HTTP_CONNECT (not the bare CONNECT operation name used by 3proxy's SOCKS service) is the ACL operation
    # that gates the `proxy` (HTTP) service's CONNECT method.
    printf 'allow %s %s * %s HTTP_CONNECT\n' "$user" "$worker_cidrs" "$allowed_ports"
    printf 'deny *\n'
    printf 'maxconn %s\n' "$max_connections"
    printf 'proxy -n -a -i%s -e%s -p%s\n' "$bind_ip" "$egress_ip" "$port"
done
