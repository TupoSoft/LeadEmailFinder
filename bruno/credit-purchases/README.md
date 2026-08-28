# Credit Purchases Bruno Collection

This collection verifies the credit-pack checkout and signed webhook workflow against the local stub payment provider. It rejects an unauthenticated purchase, creates and lists a purchase, grants the stored pack credits from a signed public webhook exactly once, and rejects a tampered body.

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

## Paddle Sandbox Setup

Use the Paddle adapter only with a sandbox account. The opt-in Compose fixture and the complete catalog, secret,
tunnel, authentication, checkout, notification-replay, and cleanup procedure live in
[`docker/paddle-dev/README.md`](../../docker/paddle-dev/README.md).

The checked-in Bruno requests continue to target the deterministic stub so they remain repeatable and require no Paddle account. Run them after Paddle configuration changes to prove that the local provider path still works. Do not commit Paddle keys, notification secrets, or customer transaction payloads.
