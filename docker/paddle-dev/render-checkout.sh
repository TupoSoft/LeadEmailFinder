#!/bin/sh
set -eu

client_token="$(cat /run/secrets/paddle_client_token)"

if ! printf '%s' "$client_token" | grep -Eq '^test_[A-Za-z0-9_-]+$'; then
    echo 'Paddle checkout fixture requires a sandbox client-side token in /run/secrets/paddle_client_token.' >&2
    exit 1
fi

web_port="${WEB_PORT:-53000}"
case "$web_port" in
    ''|*[!0-9]*|0*|??????*)
        echo 'Paddle checkout fixture requires WEB_PORT to be an integer from 1 to 65535.' >&2
        exit 1
        ;;
esac
if [ "$web_port" -gt 65535 ]; then
    echo 'Paddle checkout fixture requires WEB_PORT to be an integer from 1 to 65535.' >&2
    exit 1
fi

PADDLE_CLIENT_TOKEN="$client_token" \
PADDLE_CHECKOUT_SUCCESS_URL="http://localhost:$web_port/billing/complete" \
    envsubst '${PADDLE_CLIENT_TOKEN} ${PADDLE_CHECKOUT_SUCCESS_URL}' \
    < /paddle-dev/checkout.html.template \
    > /usr/share/nginx/html/checkout.html
unset client_token web_port PADDLE_CLIENT_TOKEN PADDLE_CHECKOUT_SUCCESS_URL

if grep -Eq '\$\{PADDLE_(CLIENT_TOKEN|CHECKOUT_SUCCESS_URL)\}' /usr/share/nginx/html/checkout.html; then
    echo 'Paddle checkout fixture could not render its checkout configuration.' >&2
    exit 1
fi

exec nginx -g 'daemon off;'
