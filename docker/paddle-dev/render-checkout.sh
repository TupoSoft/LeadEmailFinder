#!/bin/sh
set -eu

client_token="$(cat /run/secrets/paddle_client_token)"

if ! printf '%s' "$client_token" | grep -Eq '^test_[A-Za-z0-9_-]+$'; then
    echo 'Paddle checkout fixture requires a sandbox client-side token in /run/secrets/paddle_client_token.' >&2
    exit 1
fi

PADDLE_CLIENT_TOKEN="$client_token" envsubst '${PADDLE_CLIENT_TOKEN}' \
    < /paddle-dev/checkout.html.template \
    > /usr/share/nginx/html/checkout.html
unset client_token PADDLE_CLIENT_TOKEN

if grep -q '\${PADDLE_CLIENT_TOKEN}' /usr/share/nginx/html/checkout.html; then
    echo 'Paddle checkout fixture could not render its client-side token.' >&2
    exit 1
fi

exec nginx -g 'daemon off;'
