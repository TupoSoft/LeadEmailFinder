#!/bin/sh
# Focused unit tests and a malformed-manifest/credentials table test for render-config.sh. Requires `jq` on
# the host running this script (no Docker needed).
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RENDER="${SCRIPT_DIR}/../render-config.sh"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures"

valid_manifest="${FIXTURES_DIR}/valid.two-listener.json"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

valid_credentials="${work_dir}/valid-credentials.json"
cat >"${valid_credentials}" <<'EOF'
{
  "egress-a": {"user": "egress-a", "pass": "fixture-only-a"},
  "egress-b": {"user": "egress-b", "pass": "fixture-only-b"}
}
EOF

pass_count=0
fail_count=0

expect_success() {
    name="$1"
    manifest="$2"
    credentials="$3"
    shift 3

    if output="$(env "$@" "${RENDER}" "${manifest}" "${credentials}" 2>&1)"; then
        pass_count=$((pass_count + 1))
        printf 'ok   - %s\n' "${name}"
    else
        fail_count=$((fail_count + 1))
        printf 'FAIL - %s (expected success, got failure)\n%s\n' "${name}" "${output}" >&2
    fi
}

expect_failure() {
    name="$1"
    manifest="$2"
    credentials="$3"
    shift 3

    if output="$(env "$@" "${RENDER}" "${manifest}" "${credentials}" 2>&1)"; then
        fail_count=$((fail_count + 1))
        printf 'FAIL - %s (expected failure, got success)\n%s\n' "${name}" "${output}" >&2
    else
        pass_count=$((pass_count + 1))
        printf 'ok   - %s\n' "${name}"
    fi
}

all_assigned="172.29.10.2
172.29.23.2
172.29.24.2"

# --- focused unit test: a valid two-listener manifest renders exactly two HTTP_CONNECT services --------

expect_success "valid two-listener manifest renders successfully" \
    "${valid_manifest}" "${valid_credentials}" LEF_ASSIGNED_ADDRESSES="${all_assigned}"

rendered="$(LEF_ASSIGNED_ADDRESSES="${all_assigned}" "${RENDER}" "${valid_manifest}" "${valid_credentials}")"
service_count="$(printf '%s\n' "${rendered}" | grep -c '^proxy -n -a -i')"
if [ "${service_count}" = "2" ]; then
    pass_count=$((pass_count + 1))
    printf 'ok   - valid manifest renders exactly two proxy services\n'
else
    fail_count=$((fail_count + 1))
    printf 'FAIL - valid manifest renders exactly two proxy services (got %s)\n' "${service_count}" >&2
fi

if printf '%s\n' "${rendered}" | grep -qx 'proxy -n -a -i172.29.10.2 -e172.29.23.2 -p13001' \
    && printf '%s\n' "${rendered}" | grep -qx 'proxy -n -a -i172.29.10.2 -e172.29.24.2 -p13002'; then
    pass_count=$((pass_count + 1))
    printf 'ok   - two listeners render distinct -e egress bindings\n'
else
    fail_count=$((fail_count + 1))
    printf 'FAIL - two listeners render distinct -e egress bindings\n%s\n' "${rendered}" >&2
fi

# --- malformed-manifest table -----------------------------------------------------------------------

for fixture in empty-listeners empty-worker-cidrs empty-allowed-ports duplicate-egress-id \
    duplicate-bind-port duplicate-egress-ip port-out-of-range non-positive-maxconn; do
    expect_failure "rejects ${fixture}" \
        "${FIXTURES_DIR}/invalid.${fixture}.json" "${valid_credentials}" LEF_ASSIGNED_ADDRESSES="${all_assigned}"
done

# --- host-namespace address check ---------------------------------------------------------------------

expect_failure "rejects a manifest address not assigned to this network namespace" \
    "${valid_manifest}" "${valid_credentials}" LEF_ASSIGNED_ADDRESSES="172.29.10.2"

# --- credential contract: missing / extra / empty ------------------------------------------------------

missing_credentials="${work_dir}/missing-credential.json"
cat >"${missing_credentials}" <<'EOF'
{"egress-a": {"user": "egress-a", "pass": "fixture-only-a"}}
EOF
expect_failure "rejects credentials missing an egressId" \
    "${valid_manifest}" "${missing_credentials}" LEF_ASSIGNED_ADDRESSES="${all_assigned}"

extra_credentials="${work_dir}/extra-credential.json"
cat >"${extra_credentials}" <<'EOF'
{
  "egress-a": {"user": "egress-a", "pass": "fixture-only-a"},
  "egress-b": {"user": "egress-b", "pass": "fixture-only-b"},
  "egress-c": {"user": "egress-c", "pass": "fixture-only-c"}
}
EOF
expect_failure "rejects credentials with an extra egressId" \
    "${valid_manifest}" "${extra_credentials}" LEF_ASSIGNED_ADDRESSES="${all_assigned}"

empty_password_credentials="${work_dir}/empty-password-credential.json"
cat >"${empty_password_credentials}" <<'EOF'
{
  "egress-a": {"user": "egress-a", "pass": ""},
  "egress-b": {"user": "egress-b", "pass": "fixture-only-b"}
}
EOF
expect_failure "rejects a credential entry with an empty password" \
    "${valid_manifest}" "${empty_password_credentials}" LEF_ASSIGNED_ADDRESSES="${all_assigned}"

printf '\n%s passed, %s failed\n' "${pass_count}" "${fail_count}"
[ "${fail_count}" -eq 0 ]
