#!/bin/sh

set -eu

admin_api_key="$(cat /run/secrets/admin_apikey)"
action="${1:-reconcile}"

proxies="$(
    curl --fail --silent --show-error \
        --header "X-Api-Key: ${admin_api_key}" \
        "http://api:3000/v1/proxies?pageSize=100"
)"
proxy_id="$(
    printf '%s' "${proxies}" | sed -n \
        's/.*"id":"\([^"]*\)"[^{}]*"host":"smtp-dev-proxy\.lef\.test".*/\1/p'
)"

if [ "${action}" = "cleanup" ]; then
    if [ -n "${proxy_id}" ]; then
        curl --fail --silent --show-error \
            --request DELETE \
            --header "X-Api-Key: ${admin_api_key}" \
            "http://api:3000/v1/proxies/${proxy_id}" >/dev/null
    fi

    exit 0
fi

if [ "${action}" != "reconcile" ]; then
    printf 'Unknown action: %s\n' "${action}" >&2
    exit 1
fi

until curl --fail --silent --show-error --max-time 5 \
    --request NOOP \
    --proxy-user smtp-dev:smtp-dev \
    --socks5-hostname smtp-dev-proxy.lef.test:1080 \
    smtp://smtp.lef.test:2525 >/dev/null; do
    sleep 2
done

proxy_payload='{"protocol":3,"host":"smtp-dev-proxy.lef.test","port":1080,"auth":{"user":"smtp-dev","pass":"smtp-dev"},"state":"active","maxConcurrent":1,"requestsPerMinute":10,"description":"Local SMTP development proxy"}'

if [ -n "${proxy_id}" ]; then
    curl --fail --silent --show-error \
        --request PATCH \
        --header "Content-Type: application/json" \
        --header "X-Api-Key: ${admin_api_key}" \
        --data "${proxy_payload}" \
        "http://api:3000/v1/proxies/${proxy_id}" >/dev/null
else
    curl --fail --silent --show-error \
        --request POST \
        --header "Content-Type: application/json" \
        --header "X-Api-Key: ${admin_api_key}" \
        --data "${proxy_payload}" \
        "http://api:3000/v1/proxies" >/dev/null
fi
