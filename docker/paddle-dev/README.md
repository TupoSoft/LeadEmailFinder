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

Create a sandbox API key and client-side token under **Paddle > Developer tools > Authentication**. Enter them
through hidden prompts so they do not enter shell history. The webhook secret is added after the notification
destination is created or safely reused in the next section. Its destination ID is recorded beside the secret so
cleanup can target the exact external resource owned by this fixture.

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

## 3. Start the Tunnel and Configure Paddle

Start the tunnel and its checkout dependency before the rest of the stack:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d paddle-webhook-tunnel
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml logs -f paddle-webhook-tunnel
```

Copy the temporary `https://...trycloudflare.com` URL from the logs, then stop following them with `Ctrl+C`.
Keep it in the same shell that will start the full overlay:

```shell
export PADDLE_PUBLIC_URL=https://replace-with-the-quick-tunnel.trycloudflare.com
export PADDLE_CHECKOUT_URL="$PADDLE_PUBLIC_URL/checkout.html"
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
both shell variables before testing again. Update only the destination whose ID is recorded locally. A destination
secret belongs to that destination and must not be replaced with an API key or a secret from another environment.

## 4. Start and Inspect the Fixture

Start the full overlay after all three files exist and both `PADDLE_STARTER_PRICE_ID` and
`PADDLE_CHECKOUT_URL` are exported:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml up -d --build
curl --fail --silent --show-error http://localhost:57000/health
curl --fail --silent --show-error "$PADDLE_PUBLIC_URL/health"
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

Wait for the approved `adjustment.created` or `adjustment.updated` delivery to return HTTP 200. The handler uses the
adjustment subtotal, which is the comparable pretax purchase amount, to calculate the proportional credit target.
Verify that the full refund removed exactly the 100 credits granted by this purchase, then replay the approved
delivery and prove that the balance does not move again:

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

Before stopping the public tunnel, open the Platform destination whose ID is stored in
`.dev/paddle/notification-setting-id.txt`, deactivate it, and reload the destination list. Confirm that the exact
destination is inactive and that no other active `LeadEmailFinder paddle-dev` destination exists. Deactivation
preserves its delivery logs while preventing retries and avoiding consumption of Paddle's active-destination limit.

Only after that verification, stop the overlay, clear sensitive shell variables, and discard its local files:

```shell
docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml down
unset LEF_ACCESS_TOKEN LEF_ORGANIZATION_ID LEF_STARTING_BALANCE LEF_PAID_BALANCE
unset LEF_PURCHASE_ID LEF_CHECKOUT_URL LEF_PURCHASE_RESPONSE LEF_PAID_PURCHASE LEF_REPLAYED_PURCHASE
unset LEF_TRANSACTION_ID LEF_REFUND_RESPONSE LEF_REFUND_ADJUSTMENT_ID LEF_REFUNDED_BALANCE
unset LEF_REFUND_REPLAY_BALANCE
unset PADDLE_STARTER_PRICE_ID PADDLE_CHECKOUT_URL PADDLE_PUBLIC_URL
rm -f .dev/paddle/api-key.txt .dev/paddle/webhook-secret.txt .dev/paddle/client-token.txt \
  .dev/paddle/notification-setting-id.txt
docker compose -f docker/compose.yaml up -d --build
```

If deactivation fails, keep the tunnel running while diagnosing delivery, retain both the notification-setting ID
and webhook secret, and do not run the removal block or claim cleanup complete. Retry deactivation against that
exact ID; never compensate by deleting or disabling another destination.

The sandbox product and price are durable provider state. Keep matching active entries for the next run. If an
unusable entry was created, archive only that explicitly identified entry; do not modify unrelated catalog data.
