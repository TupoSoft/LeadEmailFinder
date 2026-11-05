# Paddle Sandbox Purchase Fixture

This opt-in fixture proves the real Paddle purchase path while keeping the ordinary Compose stack on the
deterministic stub provider. It serves a Paddle payment-link page, runs the API with the sandbox adapter, and
creates a temporary public Cloudflare Quick Tunnel for the checkout and Paddle notifications. The checkout is
also available locally at `http://localhost:57000/checkout.html` for inspecting the rendered fixture.

The Quick Tunnel exposes only `/checkout.html`, `/health`, and the exact `/v1/payments/webhook` proxy route. Its
URL changes on every restart. Start it only for this verification, do not share or record the URL, and stop it
immediately afterward.

## 1. Provision the Starter Catalog

Connect the Paddle plugin to the sandbox account and list active products and prices before creating anything.
Reuse an active product only when all of these fields match:

- `tax_category` is `saas`;
- `custom_data.lefPackId` is `starter`;
- `custom_data.credits` is `100`.

If no match exists, create a standard product named `LeadEmailFinder Starter Credits`, described as
`100 LeadEmailFinder email-verification credits`, with the `saas` tax category and that custom data. Do not
substitute another tax category when `saas` is unavailable.

Under that product, reuse an active one-time price only when it is USD 5.00 and its minimum and maximum quantity
are each one. Otherwise, create a standard one-time price described as `Starter — 100 credits`, with amount
`500`, currency `USD`, a null billing cycle, and quantity fixed at one. Repeating this inventory-first procedure
must return the same product and price rather than create duplicates. Keep the resulting `pri_...` identifier in
your shell only:

```shell
export PADDLE_STARTER_PRICE_ID=pri_replace_with_the_sandbox_price_id
```

## 2. Create Local Secret Files

Create a sandbox API key and client-side token under **Paddle > Developer tools > Authentication**. The API key needs
read access to transactions and read/write access to adjustments, notifications, notification settings, and client
tokens so the verification and exact cleanup calls can run. Enter both secrets through hidden prompts so they do not
enter shell history. The webhook secret is added after the notification destination is created or safely reused in
the next section. Resource IDs are recorded beside their secrets so cleanup can target only the external resources
owned by this fixture.

```shell
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

Resolve the selected token's `ctkn_...` identifier through the API without printing any token value. The query must
find exactly one active match:

```shell
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

Only use sandbox values: API keys start with `pdl_sdbx_apikey_`, and client-side tokens start with `test_`.
`.dev/paddle/` is excluded from both Git and Docker build contexts. Never put these values, an access token, an
account-specific price identifier, a customer payload, or a raw webhook body in a tracked file.

## 3. Start the Tunnel and Configure Paddle

Start the tunnel and its checkout dependency before the rest of the stack:

```shell
export LEF_PADDLE_COMPOSE_PROJECT="lef-paddle-dev-$(printf '%s' "$PWD" | sha256sum | cut -c1-8)"
export PAYMENTS_CHECKOUT_ALLOWED_ORIGINS=http://localhost:57000
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  up -d paddle-webhook-tunnel
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  logs -f paddle-webhook-tunnel
```

The path-derived project name keeps this fixture's containers, networks, volumes, and locally built images separate
from the ordinary `LEF` Compose project and other worktrees. Keep the same variable for every command below.

Copy the temporary `https://...trycloudflare.com` URL from the logs, then stop following them with `Ctrl+C`.
Keep it in the same shell that will start the full overlay:

```shell
export PADDLE_PUBLIC_URL=https://replace-with-the-quick-tunnel.trycloudflare.com
export PADDLE_CHECKOUT_URL="$PADDLE_PUBLIC_URL/checkout.html"
export PAYMENTS_CHECKOUT_ALLOWED_ORIGINS="$PADDLE_PUBLIC_URL"
```

In the Paddle sandbox dashboard, add the tunnel's fully qualified domain under **Checkout > Website approval**.
Do not enter `localhost`: the website approval field requires a fully qualified domain even in sandbox. Set the
account's default payment link to the public checkout URL held in `PADDLE_CHECKOUT_URL`.

Before changing notification settings, list the existing Platform destinations in the sandbox dashboard. This
fixture owns only a destination described as `LeadEmailFinder paddle-dev` whose exact ID is recorded in
`.dev/paddle/notification-setting-id.txt`.

- If that local ID and the corresponding `webhook-secret.txt` both exist, update that exact destination, set it active,
  and reuse it.
- If a stale `LeadEmailFinder paddle-dev` destination exists but its local ID or secret is unavailable, deactivate
  it before creating a replacement. Do not adopt it by description alone.
- Never deactivate or modify an unrelated destination, even when its URL or subscriptions look similar.

Create a Platform notification destination when no safely reusable destination remains. Use the description
`LeadEmailFinder paddle-dev` and this URL:

```text
https://replace-with-the-quick-tunnel.trycloudflare.com/v1/payments/webhook
```

Subscribe only to `transaction.completed`, `transaction.canceled`, `transaction.past_due`, `adjustment.created`, and
`adjustment.updated`. Copy the exact destination ID and its secret into local files without putting the secret in
shell history:

```shell
read -r -p 'Paddle notification destination ID: ' LEF_PADDLE_SETTING_ID
printf '%s' "$LEF_PADDLE_SETTING_ID" > .dev/paddle/notification-setting-id.txt
unset LEF_PADDLE_SETTING_ID
read -r -s -p 'Paddle notification destination secret: ' LEF_PADDLE_SECRET
printf '%s' "$LEF_PADDLE_SECRET" > .dev/paddle/webhook-secret.txt
unset LEF_PADDLE_SECRET
printf '\n'
chmod 600 .dev/paddle/notification-setting-id.txt .dev/paddle/webhook-secret.txt
```

If the tunnel restarts, update the approved website, default payment link, notification destination URL, and
the three URL and origin variables before testing again. Update only the destination whose ID is recorded locally. A destination
secret belongs to that destination and must not be replaced with an API key or a secret from another environment.

## 4. Start and Inspect the Fixture

Start the full overlay after the three runtime secret files (`api-key.txt`, `client-token.txt`, and
`webhook-secret.txt`) and two resource-ID files (`client-token-id.txt` and `notification-setting-id.txt`) exist, and
after `PADDLE_STARTER_PRICE_ID`, `PADDLE_CHECKOUT_URL`, and `PAYMENTS_CHECKOUT_ALLOWED_ORIGINS` are exported:

```shell
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d --build
curl --fail --silent --show-error http://localhost:57000/health
curl --fail --silent --show-error "$PADDLE_PUBLIC_URL/health"
curl --fail --silent --show-error http://localhost:53000/health | jq -e '.status == "ok"'
```

`PAYMENTS_CHECKOUT_ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins. Both the API and web build
normalize this same input. HTTP is accepted only for explicit loopback development. Do not use paths, credentials,
fragments, wildcard hosts, or a provider-wide domain suffix. A changed tunnel origin requires rebuilding the web
image and restarting the API. Only the normalized origin list enters the browser bundle; payment secrets stay on
the server. The stub provider derives its sole allowed origin from its loopback return URL.

The checkout container reads its client-side token from `/run/secrets`, renders the page once, and never logs the
token. Verify the runtime page without printing it:

```shell
docker compose -p "$LEF_PADDLE_COMPOSE_PROJECT" -f docker/compose.yaml -f docker/compose.paddle-dev.yaml \
  exec -T paddle-checkout sh -ec \
  "grep -q \"Paddle.Environment.set('sandbox')\" /usr/share/nginx/html/checkout.html && \
   ! grep -q '\${PADDLE_CLIENT_TOKEN}' /usr/share/nginx/html/checkout.html && \
   ! grep -Eq 'pdl_sdbx_apikey_|pdl_ntfset_' /usr/share/nginx/html/checkout.html"
```

## 5. Bootstrap Authentication

The overlay inherits the public Keycloak issuer and internal protocol routes from the base stack. Refuse to
overwrite a preexisting local Keycloak fixture, then mark the directory as owned by this run. Provision and seed
the development M2M credential through the internal administrator address while recording the public identity:

```shell
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

Load the checkout-owned platform API key without printing it:

```shell
pnpm keycloak:bootstrap-credential
export LEF_ACCESS_TOKEN="$(jq -er .apiKey .dev/auth/platform-api-key.json)"
export LEF_ORGANIZATION_ID="$(jq -er .organizationId .dev/auth/platform-api-key.json)"
```

The bootstrap runs from the host checkout and verifies Docker ownership before creating the key through the
application's transactional credential port. Rerunning it preserves a working key. The ignored file must remain a
private regular file with mode 0600. Do not print the key or save HTTP reports containing authorization headers.

## 6. Complete One Purchase

For a browser purchase, sign in as the customer owner and open `/app/billing` on the local web origin. After a
successful payment, the checkout fixture returns to `http://localhost:53000/billing/complete` in the same tab.
The return port follows `WEB_PORT` when it is set. The return page reads purchase status and balance from the API;
only the signed webhook can confirm payment and grant credits. A checkout page opened before this configuration
was applied needs a manual return to `/billing/complete`; do not create another purchase just to return to the app.

Capture the balance and create a purchase. These commands keep the response in shell variables and assert that
the server, not the request, selected the 100-credit pack:

```shell
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

Open the URL held in `LEF_CHECKOUT_URL` in a browser. The checkout page initializes Paddle's browser library in sandbox mode;
Paddle's `_ptxn` parameter opens the transaction automatically. Pay with the sandbox card
`4242 4242 4242 4242`, any future expiry date, and any three-digit CVC. Do not use a real card.

After Paddle reports success, verify the stored purchase and exact balance delta:

```shell
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

In the Paddle notification destination's delivery log, confirm the original `transaction.completed` delivery
returned HTTP 200 with `{ "received": true }`. Record only suffixes of the transaction, event, and notification
identifiers if evidence is needed; never copy the raw body or customer/card data into the repository.

## 7. Replay and Prove Idempotency

Replay that same delivered notification from Paddle's notification log. Confirm the replay also returns HTTP 200,
then verify that the purchase remains paid and the balance did not change:

```shell
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

A missed notification is recoverable by replaying the original after the API and tunnel are healthy. Starting a
purchase is not idempotent; abandon any unpaid duplicate and create a fresh purchase for a retry. If Paddle
rejects a transaction with `transaction_checkout_url_domain_is_not_approved`, confirm that `PADDLE_CHECKOUT_URL`
uses the current tunnel domain and that the same fully qualified domain is approved in the sandbox dashboard.

## 8. Refund and Prove the Credit Clawback

Extract the Paddle transaction ID from the checkout URL without printing the API key, then create a full sandbox
refund. Paddle may create it as `pending_approval`; sandbox refunds are approved automatically on Paddle's periodic
approval cycle. A pending or rejected adjustment must leave the balance unchanged.

```shell
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

Wait for the approved `adjustment.created` or `adjustment.updated` delivery to return HTTP 200. The paid event stores
the transaction `grandTotal` from the signature-verified event, and the adjustment handler compares it with the
adjustment `total` from the signature-verified event, both after tax. A full adjustment also carries explicit full
scope, so a full remainder targets the entire purchase grant.
Verify that the full refund removed exactly the 100 credits granted by this purchase, then replay the approved delivery
and prove that the balance does not move again:

```shell
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

Seller API calls cannot manufacture Paddle's provider-generated chargeback or credit inverse actions. If this sandbox
transaction later produces an approved `chargeback_reverse` or `credit_reverse`, verify that its delivery restores no
more than the credits actually removed, clears any attributable shortfall first, and remains unchanged on replay. A
`status: reversed` update for the original adjustment is informational for credit accounting; the separate approved
inverse adjustment is the only restore event. When the sandbox cannot produce an inverse action, record that path as
unverified rather than treating the original `reversed` update as a substitute. Signed Paddle fixture tests and the
real-PostgreSQL integration suite provide the automated inverse proof.

## 9. Deactivate the Destination and Restore the Stub Stack

Before stopping the public tunnel, deactivate the Platform destination whose ID is stored in
`.dev/paddle/notification-setting-id.txt` and verify that exact destination is inactive. Confirm that no other active
`LeadEmailFinder paddle-dev` destination exists. Deactivation preserves its delivery logs while preventing retries and
avoiding consumption of Paddle's active-destination limit.

Revoke the fixture client token only after the final checkout is complete, then verify the exact recorded ID reports
`revoked`:

```shell
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

Only after that verification, stop the overlay, clear sensitive shell variables, and discard its local files:

```shell
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
unset LEF_PADDLE_COMPOSE_PROJECT
```

If you stopped a separately owned stub-provider stack before this run, restore it with its own explicit Compose
project name. Do not target the shared `LEF` project as part of this fixture's cleanup.

If deactivation fails, keep the tunnel running while diagnosing delivery, retain both the notification-setting ID
and webhook secret, and do not run the removal block or claim cleanup complete. Retry deactivation against that
exact ID; never compensate by deleting or disabling another destination.

The sandbox product and price are durable provider state. Keep matching active entries for the next run. If an
unusable entry was created, archive only that explicitly identified entry; do not modify unrelated catalog data.
