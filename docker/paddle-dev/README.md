# Paddle Sandbox Purchase Fixture

This opt-in fixture proves the real Paddle purchase path while keeping the ordinary Compose stack on the
deterministic stub provider. It serves the configured Paddle payment-link page at
`http://localhost:57000/checkout.html`, runs the API with the sandbox adapter, and creates a temporary public
Cloudflare Quick Tunnel for Paddle notifications.

The Quick Tunnel exposes the whole API published on host port 53000, not only the webhook route. Its URL changes
on every restart. Start it only for this verification, do not share or record the URL, and stop it immediately
afterward.

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

Create a sandbox API key and client-side token under **Paddle > Developer tools > Authentication**. Enter them
through hidden prompts so they do not enter shell history. The webhook secret is added after the notification
destination is created in the next section.

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

Only use sandbox values: API keys start with `pdl_sdbx_apikey_`, and client-side tokens start with `test_`.
`.dev/paddle/` is gitignored. Never put these values, an access token, an account-specific price identifier, a
customer payload, or a raw webhook body in a tracked file.

## 3. Start the Tunnel and Notification Destination

Start the tunnel by itself. It has no API dependency and can run before the rest of the stack:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d paddle-webhook-tunnel
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml logs -f paddle-webhook-tunnel
```

Copy the temporary `https://...trycloudflare.com` URL from the logs, then stop following them with `Ctrl+C`.
In the Paddle sandbox dashboard, create a Platform notification destination at:

```text
https://replace-with-the-quick-tunnel.trycloudflare.com/v1/payments/webhook
```

Subscribe only to `transaction.completed`, `transaction.canceled`, and `transaction.past_due`. Copy that
destination's secret into its local file without putting it in shell history:

```shell
read -r -s -p 'Paddle notification destination secret: ' LEF_PADDLE_SECRET
printf '%s' "$LEF_PADDLE_SECRET" > .dev/paddle/webhook-secret.txt
unset LEF_PADDLE_SECRET
printf '\n'
chmod 600 .dev/paddle/webhook-secret.txt
```

If the tunnel restarts, update the destination URL before testing again. A destination secret belongs to that
destination and must not be replaced with an API key or a secret from another environment.

## 4. Start and Inspect the Fixture

Start the full overlay after all three files exist and `PADDLE_STARTER_PRICE_ID` is exported:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d --build
curl --fail --silent --show-error http://localhost:57000/health
curl --fail --silent --show-error http://localhost:53000/health | jq -e '.status == "ok"'
```

The checkout container reads its client-side token from `/run/secrets`, renders the page once, and never logs the
token. Verify the runtime page without printing it:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml exec -T paddle-checkout sh -ec \
  "grep -q \"Paddle.Environment.set('sandbox')\" /usr/share/nginx/html/checkout.html && \
   ! grep -q '\${PADDLE_CLIENT_TOKEN}' /usr/share/nginx/html/checkout.html && \
   ! grep -Eq 'pdl_sdbx_apikey_|pdl_ntfset_' /usr/share/nginx/html/checkout.html"
```

## 5. Bootstrap Authentication

The API uses the container-internal Keycloak issuer in this overlay. Provision and seed the development M2M
credential from inside the API container so its token has the matching issuer claim:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml exec -T api sh -ec '
  export KEYCLOAK_URL=http://keycloak:8080
  export POSTGRES_URL="$(cat /run/secrets/postgres_url)"
  pnpm keycloak:provision
  pnpm keycloak:bootstrap-credential
'
```

Mint a short-lived token without printing the client secret or access token:

```shell
export LEF_ACCESS_TOKEN="$(
  docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml exec -T api sh -ec '
    client_id="$(jq -r .clientId .dev/keycloak/service-client.json)"
    client_secret="$(jq -r .clientSecret .dev/keycloak/service-client.json)"
    curl --fail --silent --show-error \
      --data-urlencode grant_type=client_credentials \
      --data-urlencode "client_id=$client_id" \
      --data-urlencode "client_secret=$client_secret" \
      http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/token
  ' | jq -er .access_token
)"
export LEF_ORGANIZATION_ID="$(jq -er .organizationId .dev/keycloak/service-credential.json)"
```

## 6. Complete One Purchase

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
purchase is not idempotent; abandon any unpaid duplicate and create a fresh purchase for a retry.

## 8. Restore the Stub Stack

Stop the public tunnel and all overlay services, clear sensitive shell variables, and discard the local Paddle
files when they are no longer needed:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml down
unset LEF_ACCESS_TOKEN LEF_ORGANIZATION_ID LEF_STARTING_BALANCE LEF_PAID_BALANCE
unset LEF_PURCHASE_ID LEF_CHECKOUT_URL LEF_PURCHASE_RESPONSE LEF_PAID_PURCHASE LEF_REPLAYED_PURCHASE
unset PADDLE_STARTER_PRICE_ID
rm -f .dev/paddle/api-key.txt .dev/paddle/webhook-secret.txt .dev/paddle/client-token.txt
docker compose -f docker/compose.yaml up -d --build
```

The sandbox product and price are durable provider state. Keep matching active entries for the next run. If an
unusable entry was created, archive only that explicitly identified entry; do not modify unrelated catalog data.
