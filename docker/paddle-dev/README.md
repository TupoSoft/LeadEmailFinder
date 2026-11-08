# Paddle Sandbox Purchase Fixture

Tests real Paddle checkout, signed payment events, replay, and refunds in Paddle's sandbox (its isolated test
account). The ordinary development stack uses a stub, a predictable local substitute for the provider.

Use a clean checkout and a dedicated Bash shell with Docker Compose, Node/pnpm, `curl`, and `jq` (a JSON query tool).
The fixture uses a separate Compose project: a named group of containers, networks, and volumes. Host ports must be
free; do not stop another checkout's stack to claim them.

A Cloudflare Quick Tunnel temporarily exposes only `/checkout.html`, `/health`, and `/v1/payments/webhook`.
A webhook is a provider-to-API event callback. Keep the tunnel URL private and deactivate its Paddle notification
destination before cleanup. The local checkout page is `http://localhost:57000/checkout.html`.

## 1. Provision the Starter Catalog

List active sandbox products and prices before creating anything. Reuse only matching entries:

| Resource       | Required fields                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product        | Name `LeadEmailFinder Starter Credits`; description `100 LeadEmailFinder email-verification credits`; `tax_category=saas`; `custom_data.lefPackId=starter`; `custom_data.credits=100` |
| One-time price | Description `Starter — 100 credits`; amount `500` US cents; currency `USD`; no billing cycle; minimum and maximum quantity both 1                                                     |

`saas` means software as a service; do not substitute another tax category. Keep the resulting price ID in the shell:

```sh
export PADDLE_STARTER_PRICE_ID=pri_replace_with_the_sandbox_price_id
```

## 2. Create Local Secret Files

Under **Paddle > Developer tools > Authentication**, create a sandbox API key and client-side token. The API key
needs transaction read access and read/write access to adjustments, notifications, notification settings, and client
tokens. Sandbox keys start with `pdl_sdbx_apikey_`; client tokens start with `test_`.

Hidden prompts keep secrets out of shell history. `umask 077` and mode `600` limit files to their owner:

```sh
mkdir -p .dev/paddle
umask 077
read -r -s -p 'Paddle sandbox API key: ' LEF_PADDLE_SECRET
printf '%s' "$LEF_PADDLE_SECRET" > .dev/paddle/api-key.txt
unset LEF_PADDLE_SECRET
printf '\n'
read -r -s -p 'Paddle sandbox client-side token: ' LEF_PADDLE_SECRET
printf '%s' "$LEF_PADDLE_SECRET" > .dev/paddle/client-token.txt
unset LEF_PADDLE_SECRET
printf '\n'
chmod 600 .dev/paddle/api-key.txt .dev/paddle/client-token.txt
```

Resolve exactly one active token ID without printing the token; keep that ID for revocation:

```sh
(
  set -euo pipefail
  LEF_PADDLE_CLIENT_TOKEN_ID="$(
    LEF_PADDLE_TOKEN_PAGE='https://sandbox-api.paddle.com/client-tokens?per_page=200'
    while test -n "$LEF_PADDLE_TOKEN_PAGE"; do
      LEF_PADDLE_TOKEN_RESPONSE="$(
        curl --fail --silent --show-error \
          -H "Authorization: Bearer $(cat .dev/paddle/api-key.txt)" \
          "$LEF_PADDLE_TOKEN_PAGE"
      )"
      jq -r --rawfile token .dev/paddle/client-token.txt \
        '.data[] | select(.token == $token and .status == "active") | .id' \
        <<<"$LEF_PADDLE_TOKEN_RESPONSE"
      LEF_PADDLE_TOKEN_PAGE="$(
        jq -r 'if .meta.pagination.has_more then .meta.pagination.next else empty end' \
          <<<"$LEF_PADDLE_TOKEN_RESPONSE"
      )"
    done |
      jq -Rse 'split("\n") | map(select(length > 0)) |
        if length == 1 then .[0] else error("expected one active client token") end'
  )"
  printf '%s' "$LEF_PADDLE_CLIENT_TOKEN_ID" > .dev/paddle/client-token-id.txt
  chmod 600 .dev/paddle/client-token-id.txt
)
```

`.dev/paddle/` is ignored by Git and Docker builds. Do not commit credentials, account-specific IDs, customer data,
or raw event bodies.

## 3. Start the Tunnel and Configure Paddle

Keep this checkout-derived project name for every command:

```sh
export LEF_PADDLE_COMPOSE_PROJECT="lef-paddle-dev-$(printf '%s' "$PWD" | sha256sum | cut -c1-8)"
export COMPOSE_PROJECT_NAME="$LEF_PADDLE_COMPOSE_PROJECT"
export PAYMENTS_CHECKOUT_ALLOWED_ORIGINS=http://localhost:57000
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  up -d paddle-webhook-tunnel
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  logs -f paddle-webhook-tunnel
```

Copy the temporary `https://...trycloudflare.com` URL from the logs, then stop following logs with `Ctrl+C`:

```sh
export PADDLE_PUBLIC_URL=https://replace-with-the-quick-tunnel.trycloudflare.com
export PADDLE_CHECKOUT_URL="$PADDLE_PUBLIC_URL/checkout.html"
export PAYMENTS_CHECKOUT_ALLOWED_ORIGINS="$PADDLE_PUBLIC_URL"
```

In the sandbox dashboard, approve that hostname under **Checkout > Website approval** and set the default payment
link to `PADDLE_CHECKOUT_URL`. `localhost` is not an accepted website hostname.

Inspect existing **Platform** notification destinations. The fixture owns only the exact destination recorded in
`.dev/paddle/notification-setting-id.txt`, described as `LeadEmailFinder paddle-dev`:

- Reuse it only when its recorded ID and matching `webhook-secret.txt` are available.
- Deactivate an identified stale fixture destination before replacing it; never adopt one by description alone.
- Never alter unrelated destinations.

Set the destination URL to `$PADDLE_PUBLIC_URL/v1/payments/webhook` and subscribe only to `transaction.completed`,
`transaction.canceled`, `transaction.past_due`, `adjustment.created`, and `adjustment.updated`. Save its ID and
signature-verification secret:

```sh
read -r -p 'Paddle notification destination ID: ' LEF_PADDLE_SETTING_ID
printf '%s' "$LEF_PADDLE_SETTING_ID" > .dev/paddle/notification-setting-id.txt
unset LEF_PADDLE_SETTING_ID
read -r -s -p 'Paddle notification destination secret: ' LEF_PADDLE_SECRET
printf '%s' "$LEF_PADDLE_SECRET" > .dev/paddle/webhook-secret.txt
unset LEF_PADDLE_SECRET
printf '\n'
chmod 600 .dev/paddle/notification-setting-id.txt .dev/paddle/webhook-secret.txt
```

After a tunnel restart, update website approval, the default payment link, the recorded destination's URL, and all
three URL/origin variables. A destination secret must match that exact destination and sandbox environment.

## 4. Start and Inspect the Fixture

Require all five local secret/ID files and the exported price, checkout URL, and allowed-origin variables:

```sh
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d --build
curl --fail --silent --show-error http://localhost:57000/health
curl --fail --silent --show-error "$PADDLE_PUBLIC_URL/health"
curl --fail --silent --show-error http://localhost:53000/health | jq -e '.status == "ok"'
```

An origin is a URL's scheme, host, and port. `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS` accepts a comma-separated list of
exact origins; no paths, credentials, fragments, wildcards, or provider-wide suffixes. HTTP is allowed only for
explicit loopback development. Changing the tunnel origin requires rebuilding the web image and restarting the API.
Only the origin list enters the browser bundle; provider secrets stay server-side.

Verify that the generated checkout uses sandbox mode and contains neither unresolved placeholders nor server secrets:

```sh
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  exec -T paddle-checkout sh -ec \
  "grep -q \"Paddle.Environment.set('sandbox')\" /usr/share/nginx/html/checkout.html && \
   ! grep -q '\${PADDLE_CLIENT_TOKEN}' /usr/share/nginx/html/checkout.html && \
   ! grep -Eq 'pdl_sdbx_apikey_|pdl_ntfset_' /usr/share/nginx/html/checkout.html"
```

## 5. Bootstrap Authentication

Keycloak is the current browser login provider. Refuse an existing local fixture directory so this run cannot
overwrite another fixture, then provision the isolated stack through its internal administrator address:

```sh
test ! -e .dev/keycloak || {
  printf '%s\n' '.dev/keycloak already exists; use a clean worktree or preserve that fixture explicitly.' >&2
  exit 1
}
mkdir -p .dev/keycloak
touch .dev/keycloak/.paddle-fixture-owned
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  exec -T api sh -ec '
  export KEYCLOAK_URL=http://keycloak:8080
  export KEYCLOAK_PUBLIC_URL=http://localhost:58080
  export POSTGRES_URL="$(cat /run/secrets/postgres_url)"
  pnpm keycloak:provision
'
```

Create/load the checkout-owned platform API key. This is a direct Bearer credential, not an OAuth access token
obtained through a token exchange; the legacy shell variable name remains for the commands below:

```sh
pnpm keycloak:bootstrap-credential
export LEF_ACCESS_TOKEN="$(jq -er .apiKey .dev/auth/platform-api-key.json)"
export LEF_ORGANIZATION_ID="$(jq -er .organizationId .dev/auth/platform-api-key.json)"
```

The host bootstrap verifies stack ownership and preserves a working key. Its `.dev/auth/` file must remain a private
regular file (`0600`). Never print the key or save reports containing its authorization header.

## 6. Complete One Purchase

The browser path is customer-owner login → `/app/billing` → checkout → `/billing/complete` on the local web origin
(default port 53000, overridden by `WEB_PORT`). The return page reads API state; only a signed webhook confirms
payment. A previously opened checkout may require a manual return, not another purchase.

For API verification, capture the balance and create one pending purchase. The server selects the pack's amount
and credits from `packId`; clients cannot choose their own grant:

```sh
export LEF_STARTING_BALANCE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    "http://localhost:53000/credits/$LEF_ORGANIZATION_ID" | jq -er .balance
)"

LEF_PURCHASE_RESPONSE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    --data '{"packId":"starter"}' \
    http://localhost:53000/v1/credit-purchases
)"
test "$(jq -r .status <<<"$LEF_PURCHASE_RESPONSE")" = pending
export LEF_PURCHASE_ID="$(jq -er .id <<<"$LEF_PURCHASE_RESPONSE")"
export LEF_CHECKOUT_URL="$(jq -er .redirectUrl <<<"$LEF_PURCHASE_RESPONSE")"
```

Open `LEF_CHECKOUT_URL` in a browser. Paddle's `_ptxn` query parameter opens the transaction. Pay with test card
`4242 4242 4242 4242`, any future expiry, and any three-digit CVC (card security code); never use a real card.

After payment, require `paid` and an exact 100-credit increase:

```sh
LEF_PAID_PURCHASE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    http://localhost:53000/v1/credit-purchases |
    jq -ec --arg id "$LEF_PURCHASE_ID" '.[] | select(.id == $id)'
)"
test "$(jq -r .status <<<"$LEF_PAID_PURCHASE")" = paid

export LEF_PAID_BALANCE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    "http://localhost:53000/credits/$LEF_ORGANIZATION_ID" | jq -er .balance
)"
test "$((LEF_PAID_BALANCE - LEF_STARTING_BALANCE))" -eq 100
```

In Paddle's delivery log, require HTTP 200 and `{"received":true}` for `transaction.completed`. Record only identifier
suffixes as evidence, never customer/card data or raw bodies.

## 7. Replay and Prove Idempotency

Idempotency means repeating an event has no additional accounting effect. Replay the original delivered notification
from Paddle's log; require HTTP 200, the same paid purchase, and no balance change:

```sh
LEF_REPLAYED_PURCHASE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    http://localhost:53000/v1/credit-purchases |
    jq -ec --arg id "$LEF_PURCHASE_ID" '.[] | select(.id == $id)'
)"
test "$(jq -r .status <<<"$LEF_REPLAYED_PURCHASE")" = paid

LEF_REPLAYED_BALANCE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    "http://localhost:53000/credits/$LEF_ORGANIZATION_ID" | jq -er .balance
)"
test "$LEF_REPLAYED_BALANCE" -eq "$LEF_PAID_BALANCE"
```

Replay a missed notification only after the API and tunnel recover. Purchase creation itself is not idempotent:
check purchase history after an uncertain response before deliberately creating another purchase. For
`transaction_checkout_url_domain_is_not_approved`, check that the current tunnel hostname is approved and matches
`PADDLE_CHECKOUT_URL`.

## 8. Refund and Prove the Credit Clawback

A clawback removes previously granted credits. Create a full sandbox refund for this transaction:

```sh
export LEF_TRANSACTION_ID="$(
  node -e "process.stdout.write(new URL(process.env.LEF_CHECKOUT_URL).searchParams.get('_ptxn') || '')"
)"
test -n "$LEF_TRANSACTION_ID"

LEF_REFUND_RESPONSE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $(cat .dev/paddle/api-key.txt)" \
    -H 'Content-Type: application/json' \
    --data "$(
      jq -nc --arg transactionId "$LEF_TRANSACTION_ID" \
        '{action:"refund",type:"full",transaction_id:$transactionId,reason:"LeadEmailFinder clawback verification"}'
    )" \
    https://sandbox-api.paddle.com/adjustments
)"
export LEF_REFUND_ADJUSTMENT_ID="$(jq -er .data.id <<<"$LEF_REFUND_RESPONSE")"
case "$(jq -r .data.status <<<"$LEF_REFUND_RESPONSE")" in
  pending_approval | approved) ;;
  *) exit 1 ;;
esac
```

`pending_approval` or rejected refunds must not change credits. Wait for an approved `adjustment.created` or
`adjustment.updated` delivery returning HTTP 200. The handler compares signature-verified payment and adjustment
totals after tax; a full refund removes the complete purchase grant. Require exactly 100 credits removed, then
replay the approved delivery and require no further change:

```sh
export LEF_REFUNDED_BALANCE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    "http://localhost:53000/credits/$LEF_ORGANIZATION_ID" | jq -er .balance
)"
test "$LEF_REFUNDED_BALANCE" -eq "$((LEF_PAID_BALANCE - 100))"

# Replay the approved adjustment delivery from Paddle's notification log before running this assertion.
LEF_REFUND_REPLAY_BALANCE="$(
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_ACCESS_TOKEN" \
    "http://localhost:53000/credits/$LEF_ORGANIZATION_ID" | jq -er .balance
)"
test "$LEF_REFUND_REPLAY_BALANCE" -eq "$LEF_REFUNDED_BALANCE"
```

Provider-generated `chargeback_reverse` or `credit_reverse` adjustments restore at most the credits actually
removed, clearing attributable shortfall first. A `status: reversed` update alone does not restore credits. If the
sandbox cannot generate a separate approved inverse adjustment, mark that path unverified; signed fixtures and real
PostgreSQL tests cover it automatically.

## 9. Deactivate the Destination and Restore the Stub Stack

**Before stopping the tunnel**, deactivate the exact recorded destination and verify it is inactive. No other active
`LeadEmailFinder paddle-dev` destination should remain. Revoke the recorded client token after the last checkout;
verify its `revoked` status. Keep delivery logs for diagnosis:

```sh
(
  set -euo pipefail
  LEF_PADDLE_API_KEY="$(cat .dev/paddle/api-key.txt)"
  LEF_PADDLE_SETTING_ID="$(cat .dev/paddle/notification-setting-id.txt)"
  curl --fail --silent --show-error \
    -X PATCH \
    -H "Authorization: Bearer $LEF_PADDLE_API_KEY" \
    -H 'Content-Type: application/json' \
    --data '{"active":false}' \
    "https://sandbox-api.paddle.com/notification-settings/$LEF_PADDLE_SETTING_ID" |
    jq -e --arg id "$LEF_PADDLE_SETTING_ID" '.data.id == $id and .data.active == false'
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_PADDLE_API_KEY" \
    "https://sandbox-api.paddle.com/notification-settings/$LEF_PADDLE_SETTING_ID" |
    jq -e --arg id "$LEF_PADDLE_SETTING_ID" '.data.id == $id and .data.active == false'
  LEF_PADDLE_SETTINGS_PAGE='https://sandbox-api.paddle.com/notification-settings?per_page=200'
  while test -n "$LEF_PADDLE_SETTINGS_PAGE"; do
    LEF_PADDLE_SETTINGS_RESPONSE="$(
      curl --fail --silent --show-error \
        -H "Authorization: Bearer $LEF_PADDLE_API_KEY" \
        "$LEF_PADDLE_SETTINGS_PAGE"
    )"
    jq -r '.data[] | select(.description == "LeadEmailFinder paddle-dev" and .active == true) | .id' \
      <<<"$LEF_PADDLE_SETTINGS_RESPONSE"
    LEF_PADDLE_SETTINGS_PAGE="$(
      jq -r 'if .meta.pagination.has_more then .meta.pagination.next else empty end' \
        <<<"$LEF_PADDLE_SETTINGS_RESPONSE"
    )"
  done | jq -Rse 'split("\n") | map(select(length > 0)) | length == 0'

  LEF_PADDLE_CLIENT_TOKEN_ID="$(cat .dev/paddle/client-token-id.txt)"
  curl --fail --silent --show-error \
    -X PATCH \
    -H "Authorization: Bearer $LEF_PADDLE_API_KEY" \
    -H 'Content-Type: application/json' \
    --data '{"status":"revoked"}' \
    "https://sandbox-api.paddle.com/client-tokens/$LEF_PADDLE_CLIENT_TOKEN_ID" |
    jq -e --arg id "$LEF_PADDLE_CLIENT_TOKEN_ID" '.data.id == $id and .data.status == "revoked"'
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $LEF_PADDLE_API_KEY" \
    "https://sandbox-api.paddle.com/client-tokens/$LEF_PADDLE_CLIENT_TOKEN_ID" |
    jq -e --arg id "$LEF_PADDLE_CLIENT_TOKEN_ID" \
      '.data.id == $id and .data.status == "revoked" and .data.revoked_at != null'
)
```

Only after those checks pass, remove the isolated fixture and its local secrets:

```sh
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  down --volumes --remove-orphans --rmi local
unset LEF_ACCESS_TOKEN LEF_ORGANIZATION_ID LEF_STARTING_BALANCE LEF_PAID_BALANCE
unset LEF_PURCHASE_ID LEF_CHECKOUT_URL LEF_PURCHASE_RESPONSE LEF_PAID_PURCHASE LEF_REPLAYED_PURCHASE
unset LEF_TRANSACTION_ID LEF_REFUND_RESPONSE LEF_REFUND_ADJUSTMENT_ID LEF_REFUNDED_BALANCE
unset LEF_REFUND_REPLAY_BALANCE
unset PADDLE_STARTER_PRICE_ID PADDLE_CHECKOUT_URL PADDLE_PUBLIC_URL PAYMENTS_CHECKOUT_ALLOWED_ORIGINS
rm -f .dev/paddle/api-key.txt .dev/paddle/webhook-secret.txt .dev/paddle/client-token.txt \
  .dev/paddle/client-token-id.txt .dev/paddle/notification-setting-id.txt
if test -f .dev/keycloak/.paddle-fixture-owned; then
  rm -rf .dev/keycloak
fi
unset LEF_PADDLE_COMPOSE_PROJECT COMPOSE_PROJECT_NAME
```

If deactivation fails, keep the tunnel, destination ID, and secret until that exact destination can be deactivated;
do not run cleanup or compensate by changing another destination. Restore any separately owned stub stack using
its own explicit project name, never the shared `LEF` project as part of this cleanup.

Keep matching catalog entries for reuse. Archive only explicitly identified unusable entries created by the fixture.
