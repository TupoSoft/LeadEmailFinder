# Credit Purchases Bruno Collection

This collection verifies the credit-pack checkout and signed webhook workflow against the local stub payment provider. It rejects an unauthenticated purchase, creates and lists a purchase, grants the stored pack credits from a public signed webhook exactly once, and rejects a tampered body.

Start the local stack with `PAYMENTS_PROVIDER=stub`, obtain an access token whose application principal belongs to the target organization and has `billing:read` plus `billing:manage`, and expose it only through the process environment:

```shell
pnpm keycloak:bootstrap-credential
export OWNER_ACCESS_TOKEN=replace-with-a-short-lived-token
export OIDC_ISSUER_URL=http://localhost:58080/realms/lead-email-finder
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
export PLATFORM_ORGANIZATION_ID=$(jq -r .organizationId .dev/keycloak/service-credential.json)
export PAYMENTS_STUB_WEBHOOK_SECRET=replace-with-the-local-stub-secret
cd bruno/credit-purchases
bru run --env local
```

The owner token must belong to `PLATFORM_ORGANIZATION_ID` and have `billing:read` plus `billing:manage`. The service client must have `platform:admin` so the collection can observe the balance. The checked-in local Compose catalog defines the `starter` pack as 100 credits for 500 USD minor units. Override `packId`, `expectedCredits`, `expectedAmountMinor`, and `expectedCurrency` when running against a different disposable catalog. Never commit an access token or provider secret.

## Paddle sandbox setup

Use the Paddle adapter only with a sandbox account:

1. In Paddle sandbox, create one-time products and prices for each configured credit pack. Put each `pri_...` identifier in that pack's `providerPriceId` field in `PAYMENTS_CREDIT_PACKS`.
2. Configure an approved default payment-link page that loads Paddle.js. When Paddle is selected, `PAYMENTS_CHECKOUT_RETURN_URL` must be that approved checkout page; configure the post-payment success redirect separately in Paddle Checkout settings.
3. Create a URL notification destination for the publicly reachable `POST /v1/payments/webhook` endpoint. Subscribe it to `transaction.completed`, `transaction.canceled`, and `transaction.past_due`.
4. Start the API with `PAYMENTS_PROVIDER=paddle`, `PADDLE_ENVIRONMENT=sandbox`, and the sandbox API key and notification destination secret supplied through `PADDLE_API_KEY_FILE` and `PADDLE_WEBHOOK_SECRET_FILE` (or the corresponding direct environment variables for local-only use).
5. Start a purchase through `POST /v1/credit-purchases`, open the returned checkout URL, and pay with a Paddle sandbox test card. Confirm that `GET /v1/credit-purchases` marks the purchase paid and that the organization credit balance rises exactly once. Redeliver the completed notification from Paddle and confirm the balance does not rise again.

The checked-in Bruno requests continue to target the deterministic stub so they remain repeatable and require no Paddle account. Run them after Paddle configuration changes to prove that the local provider path still works. Do not commit Paddle keys, notification secrets, or customer transaction payloads.
