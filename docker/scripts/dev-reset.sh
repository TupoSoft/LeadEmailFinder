#!/bin/sh
# Tears down and recreates the entire disposable LeadEmailFinder development stack: PostgreSQL, Keycloak's
# own PostgreSQL, Redis, the Garage/S3 container, and the authentication mail capture, then reprovisions Keycloak,
# seeds deterministic application and native Better Auth fixtures, and runs an authenticated smoke test. See
# .agents/plans/auth/10-development-reset-workflow.md for the full rationale.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

COMPOSE_FILE="docker/compose.yaml"
# PROJECT_NAME is what a developer types/passes to confirm (matching docker/compose.yaml's own `name: LEF`
# field, the human-readable identity of this stack). COMPOSE_PROJECT_ID is the lowercase form Docker Compose's
# own -p flag requires on the CLI (it rejects uppercase there, even though the same value in the YAML's name:
# field is accepted and silently lowercased) — the two must always agree on which stack they name, only the
# casing differs.
PROJECT_NAME="LEF"
COMPOSE_PROJECT_ID="lef"
COMPOSE="docker compose -p ${COMPOSE_PROJECT_ID} -f ${COMPOSE_FILE}"

CONTAINERS="lef-postgres-1 lef-redis-1 lef-garage-1 lef-keycloak-postgres-1 lef-keycloak-1 lef-auth-mail-1 lef-api-1 lef-web-1 lef-bullboard-1"
VOLUME_PATTERN="^lef_(postgres-data|redis-data|keycloak-postgres-data)\$"
EXPECTED_VOLUME_COUNT=3

print_targets() {
    printf '\nThis will stop and recreate the following %s development containers:\n' "${PROJECT_NAME}"
    # shellcheck disable=SC2086 -- deliberate word-splitting of a fixed, literal space-separated list.
    printf '  %s\n' ${CONTAINERS}
    printf '\nIt will delete the following named volumes (all application, Keycloak, and queue state):\n'
    printf '  lef_postgres-data  lef_redis-data  lef_keycloak-postgres-data\n'
    printf '\nObject storage (garage) has no named volume; its data is already ephemeral inside the\n'
    printf 'container and is cleared simply by recreating that container. Captured authentication mail is\n'
    printf 'likewise held only inside the auth-mail container.\n'
    printf '\nCompose project: %s (%s)\n\n' "${PROJECT_NAME}" "${COMPOSE_FILE}"
}

require_confirmation() {
    flag_value=""
    for arg in "$@"; do
        case "${arg}" in
            --confirm-project=*)
                flag_value="${arg#--confirm-project=}"
                ;;
        esac
    done

    if [ -n "${flag_value}" ]; then
        if [ "${flag_value}" != "${PROJECT_NAME}" ]; then
            printf 'The --confirm-project value must be exactly %s (got: %s)\n' "${PROJECT_NAME}" "${flag_value}" >&2
            exit 1
        fi
        return 0
    fi

    printf 'Type %s to continue: ' "${PROJECT_NAME}"
    read -r answer
    if [ "${answer:-}" != "${PROJECT_NAME}" ]; then
        printf 'Confirmation did not match %s; aborting with no changes made.\n' "${PROJECT_NAME}" >&2
        exit 1
    fi
}

verify_checkout_ownership() {
    container_ids="$(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_ID}")"
    for container_id in ${container_ids}; do
        if ! inspected_container="$(docker inspect "${container_id}")" ||
            ! printf '%s' "${inspected_container}" | jq -e \
            --arg root "${REPO_ROOT}" --arg project "${COMPOSE_PROJECT_ID}" '
            length == 1 and all(.[]; .Config.Labels as $labels |
                $labels["com.docker.compose.project"] == $project and
                ($labels["com.docker.compose.project.working_dir"] == $root or
                 $labels["com.docker.compose.project.working_dir"] == ($root + "/docker")) and
                $labels["com.docker.compose.project.config_files"] == ($root + "/docker/compose.yaml"))
            ' > /dev/null; then
            printf 'Refusing to reset containers owned by another checkout or Compose configuration.\n' >&2
            exit 1
        fi
    done
}

verify_and_delete_volumes() {
    found_volumes="$(docker volume ls -q --filter "name=${VOLUME_PATTERN}")"
    found_count="$(printf '%s\n' "${found_volumes}" | grep -c . || true)"

    # 0 is expected on a first-ever run (nothing to delete yet); anything other than 0 or the exact expected
    # count means the volume set has drifted from what this script knows how to safely target, so refuse
    # rather than guess.
    if [ "${found_count}" -eq 0 ]; then
        remove_browser_fixture_state
        ${COMPOSE} down
        return 0
    fi
    if [ "${found_count}" -ne "${EXPECTED_VOLUME_COUNT}" ]; then
        printf 'Refusing to proceed: expected 0 or exactly %d named volumes matching %s, found %d (%s)\n' \
            "${EXPECTED_VOLUME_COUNT}" "${VOLUME_PATTERN}" "${found_count}" "${found_volumes}" >&2
        exit 1
    fi
    if [ -z "${container_ids}" ]; then
        printf 'Refusing to delete existing volumes without checkout-owned containers proving their provenance.\n' >&2
        exit 1
    fi

    for volume in ${found_volumes}; do
        if ! inspected_volume="$(docker volume inspect "${volume}")" ||
            ! printf '%s' "${inspected_volume}" | jq -e --arg project "${COMPOSE_PROJECT_ID}" \
            'length == 1 and all(.[]; .Labels["com.docker.compose.project"] == $project)' > /dev/null; then
            printf 'Refusing to delete a volume without the expected Compose project label.\n' >&2
            exit 1
        fi
    done

    remove_browser_fixture_state
    ${COMPOSE} down
    # shellcheck disable=SC2086 -- pre-verified names from the allowlisted filter above, never an unresolved expansion.
    docker volume rm ${found_volumes}
}

remove_browser_fixture_state() {
    if [ -L .dev ] || [ -L .dev/keycloak ] || [ -L .dev/auth ]; then
        printf 'Refusing to remove browser fixture state through a symbolic-link directory.\n' >&2
        exit 1
    fi
    # Only the enrollment keys are reset here, after confirmation and every ownership/volume check.
    # Routine seed commands preserve this file. Removing a file symlink never follows its target.
    rm -f -- .dev/keycloak/browser-users.json
    # Native fixture identifiers name rows in the deleted database. The ignored runtime secret is kept.
    rm -f -- .dev/auth/native-users.json
}

wait_healthy() {
    container="$1"
    timeout="${2:-120}"
    elapsed=0
    while :; do
        status="$(docker inspect --format='{{.State.Health.Status}}' "${container}" 2>/dev/null || echo missing)"
        [ "${status}" = healthy ] && return 0
        if [ "${elapsed}" -ge "${timeout}" ]; then
            printf 'Timed out waiting for %s to become healthy (last status: %s)\n' "${container}" "${status}" >&2
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
}

run_api_smoke_test() {
    api_url="${API_URL:-http://localhost:53000}"
    service_client_file=".dev/keycloak/service-client.json"
    customer_fixture_file=".dev/keycloak/customer-fixture.json"

    issuer="$(jq -r .issuer "${service_client_file}")"
    client_id="$(jq -r .clientId "${service_client_file}")"
    client_secret="$(jq -r .clientSecret "${service_client_file}")"
    customer_org_id="$(jq -r .organizationId "${customer_fixture_file}")"

    token="$(
        curl --fail --silent --show-error \
            --data-urlencode "grant_type=client_credentials" \
            --data-urlencode "client_id=${client_id}" \
            --data-urlencode "client_secret=${client_secret}" \
            "${issuer}/protocol/openid-connect/token" \
            | jq -r .access_token
    )"

    balance="$(
        curl --fail --silent --show-error \
            --header "Authorization: Bearer ${token}" \
            "${api_url}/credits/${customer_org_id}" \
            | jq -r .balance
    )"

    if [ "${balance}" != "1000" ]; then
        printf 'Smoke test failed: expected credit balance 1000 for %s, got %s\n' "${customer_org_id}" "${balance}" >&2
        exit 1
    fi
    printf 'Authenticated API smoke test passed: organization %s has balance %s\n' "${customer_org_id}" "${balance}"
}

if ! resolved_config="$(${COMPOSE} config --format json)"; then
    printf 'Unable to resolve the %s Docker Compose configuration; no containers or volumes were changed.\n' \
        "${PROJECT_NAME}" >&2
    exit 1
fi
resolved_name="$(printf '%s' "${resolved_config}" | jq -r '.name')"
if [ "${resolved_name}" != "${COMPOSE_PROJECT_ID}" ]; then
    printf 'Unexpected Compose project id: %s (expected %s; check for a COMPOSE_PROJECT_NAME override)\n' \
        "${resolved_name}" "${COMPOSE_PROJECT_ID}" >&2
    exit 1
fi
if ! printf '%s' "${resolved_config}" | jq -e '
    . as $config | all([
        ["web", 8080, "53000"], ["keycloak", 8080, "58080"], ["postgres", 5432, "55432"], ["auth-mail", 8025, "8025"]
    ][]; . as $port | any($config.services[$port[0]].ports[];
        .target == $port[1] and (.published | tostring) == $port[2]))
    ' > /dev/null; then
    printf 'Refusing to reset a stack with alternate public ports; provision that isolated project explicitly.\n' >&2
    exit 1
fi

print_targets
require_confirmation "$@"
verify_checkout_ownership
verify_and_delete_volumes

${COMPOSE} up -d --build

wait_healthy lef-postgres-1
wait_healthy lef-redis-1
wait_healthy lef-garage-1
wait_healthy lef-keycloak-postgres-1
wait_healthy lef-keycloak-1
wait_healthy lef-auth-mail-1

# Every provisioning command must target the same fixed project and public endpoints as this reset.
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_ID}"
export API_URL="http://localhost:53000"
export KEYCLOAK_URL="http://localhost:58080"
export KEYCLOAK_PUBLIC_URL="${KEYCLOAK_URL}"
export KEYCLOAK_BFF_REDIRECT_URIS="${API_URL}/v1/auth/callback"
export KEYCLOAK_BFF_POST_LOGOUT_REDIRECT_URIS="${API_URL}/"
unset OIDC_BACKCHANNEL_URL
pnpm keycloak:provision

wait_healthy lef-api-1
wait_healthy lef-web-1
curl --fail --silent --show-error http://localhost:53000/ > /dev/null

# Replace a previous isolated-stack selection so later commands from a fresh shell use this reset stack.
node scripts/testing/refresh-development-stack.mjs

postgres_password="$(cat docker/secrets/postgres_password.txt)"
export POSTGRES_URL="postgresql://postgres:${postgres_password}@localhost:55432/lef"
pnpm keycloak:bootstrap-credential
pnpm keycloak:bootstrap-operator
pnpm keycloak:seed-customer-fixture
pnpm auth:seed -- --native-only

pnpm keycloak:smoke
run_api_smoke_test

printf '\nDevelopment stack reset complete.\n'
