#!/bin/sh
# Builds docker/proxy-fleet/Dockerfile, brings up a disposable two-listener smoke topology, and exercises
# the acceptance criteria in .agents/plans/proxy-fleet/11-fleet-capable-3proxy-image.md's Validation section:
# an allowed authenticated CONNECT succeeds, missing/wrong credentials and a non-worker source are rejected,
# a destination port outside the allowlist is rejected, and two listeners render distinct -e egress bindings.
#
# Removes only its own named containers/networks/addresses and its generated credentials file on exit.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/compose.smoke.yaml"
PROJECT="lef-proxy-fleet-smoke"

CRED_FILE="$(mktemp)"
export LEF_PROXY_FLEET_CREDENTIALS_FILE="${CRED_FILE}"

COMPOSE="docker compose -p ${PROJECT} -f ${COMPOSE_FILE}"

cleanup() {
    ${COMPOSE} down -v --remove-orphans >/dev/null 2>&1 || true
    rm -f "${CRED_FILE}"
}
trap cleanup EXIT

random_hex() {
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

pass_a="$(random_hex)"
pass_b="$(random_hex)"
cat >"${CRED_FILE}" <<EOF
{
  "egress-a": {"user": "egress-a", "pass": "${pass_a}"},
  "egress-b": {"user": "egress-b", "pass": "${pass_b}"}
}
EOF

wait_healthy() {
    service="$1"
    timeout="${2:-60}"
    elapsed=0
    while :; do
        container_id="$(${COMPOSE} ps -q "${service}" 2>/dev/null || true)"
        status="$(docker inspect --format='{{.State.Health.Status}}' "${container_id}" 2>/dev/null || echo missing)"
        [ "${status}" = healthy ] && return 0
        if [ "${elapsed}" -ge "${timeout}" ]; then
            printf 'Timed out waiting for %s to become healthy (last status: %s)\n' "${service}" "${status}" >&2
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
}

fail() {
    printf 'smoke: %s\n' "$1" >&2
    exit 1
}

# Prints "OK" if the CONNECT tunnel is established (regardless of what curl's own SMTP client does with it
# afterward -- smtp:// is not HTTP, so curl's exit code past a successful CONNECT is not a reliable success
# signal), or "REJECTED:<code>" if 3proxy itself refused the tunnel. Never exits nonzero itself.
attempt_connect() {
    from_service="$1"
    bind_port="$2"
    proxy_user="$3"
    dest_port="$4"

    if [ -n "${proxy_user}" ]; then
        output="$(${COMPOSE} exec -T "${from_service}" curl -sS -o /dev/null -v --max-time 5 -p \
            -x "http://172.29.10.2:${bind_port}" --proxy-user "${proxy_user}" \
            "smtp://172.29.23.3:${dest_port}" 2>&1 || true)"
    else
        output="$(${COMPOSE} exec -T "${from_service}" curl -sS -o /dev/null -v --max-time 5 -p \
            -x "http://172.29.10.2:${bind_port}" \
            "smtp://172.29.23.3:${dest_port}" 2>&1 || true)"
    fi

    code="$(printf '%s\n' "${output}" | sed -n 's/.*CONNECT tunnel failed, response \([0-9]*\).*/\1/p')"
    if [ -n "${code}" ]; then
        printf 'REJECTED:%s' "${code}"
    else
        printf 'OK'
    fi
}

printf 'Building fleet image...\n'
${COMPOSE} build fleet

printf 'Starting smoke topology...\n'
${COMPOSE} up -d

wait_healthy smtp-target
wait_healthy fleet

printf '\n1. allowed CONNECT with correct credentials\n'
result="$(attempt_connect worker 13001 "egress-a:${pass_a}" 2525)"
[ "${result}" = "OK" ] || fail "allowed CONNECT with correct credentials was rejected (${result})"
printf 'ok   - allowed CONNECT with correct credentials reaches the allowlisted SMTP target\n'

printf '\n2. missing/wrong credentials rejected\n'
result="$(attempt_connect worker 13001 "egress-a:wrong-password" 2525)"
case "${result}" in
    REJECTED:*) ;;
    *) fail "wrong credentials were not rejected (${result})" ;;
esac
result="$(attempt_connect worker 13001 "" 2525)"
case "${result}" in
    REJECTED:*) ;;
    *) fail "missing credentials were not rejected (${result})" ;;
esac
printf 'ok   - missing and wrong credentials are rejected\n'

printf '\n3. non-worker source rejected\n'
result="$(attempt_connect non-worker 13001 "egress-a:${pass_a}" 2525)"
case "${result}" in
    REJECTED:*) ;;
    *) fail "a non-worker source was not rejected (${result})" ;;
esac
printf 'ok   - a non-worker source is rejected\n'

printf '\n4. disallowed destination port rejected\n'
result="$(attempt_connect worker 13001 "egress-a:${pass_a}" 2526)"
case "${result}" in
    REJECTED:*) ;;
    *) fail "a disallowed destination port was not rejected (${result})" ;;
esac
printf 'ok   - a destination port outside the allowlist is rejected\n'

printf '\n5. two listeners render distinct -e egress bindings\n'
rendered="$(${COMPOSE} exec -T fleet cat /run/3proxy/3proxy.cfg)"
printf '%s\n' "${rendered}" | grep -qx 'proxy -n -a -i172.29.10.2 -e172.29.23.2 -p13001' \
    || fail "listener egress-a did not render its declared -e binding"
printf '%s\n' "${rendered}" | grep -qx 'proxy -n -a -i172.29.10.2 -e172.29.24.2 -p13002' \
    || fail "listener egress-b did not render its declared -e binding"
printf 'ok   - two listeners render distinct -e egress bindings\n'

printf '\nAll proxy-fleet smoke assertions passed.\n'
