# Credit Purchases Bruno Collection

This 19-request collection verifies the credit-pack checkout and signed webhook workflow against the local stub
payment provider. It covers unauthenticated and invalid purchases, purchase creation and listing, one-time credit
granting, tampered-body rejection, full credit clawback and replay, and inverse restoration and replay. Every balance
transition is read back through the administrative credits API.

Start the local stack with `PAYMENTS_PROVIDER=stub`, then provision the development machine-to-machine credential.
The bootstrapped service client belongs to the target organization and has `billing:read`, `billing:manage`, and
`platform:admin`, so one short-lived client-credentials token can create purchases and inspect their resulting balance.
Expose only the client metadata through the process environment:

```shell
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=http://localhost:58080/realms/lead-email-finder
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
export PLATFORM_ORGANIZATION_ID=$(jq -r .organizationId .dev/keycloak/service-credential.json)
export PAYMENTS_STUB_WEBHOOK_SECRET=replace-with-the-local-stub-secret
cd bruno/credit-purchases
bru run --env local
```

The checked-in local Compose catalog defines the `starter` pack as 100 credits for 500 USD minor units. Override
`packId`, `expectedCredits`, `expectedAmountMinor`, and `expectedCurrency` when running against a different disposable
catalog. The collection keeps its minted token in a runtime variable. Never commit an access token, client secret, or
provider secret.

## Paddle Sandbox Setup

Use the Paddle adapter only with a sandbox account. The opt-in Compose fixture and the complete catalog, secret,
tunnel, authentication, checkout, notification-replay, and cleanup procedure live in
[`docker/paddle-dev/README.md`](../../docker/paddle-dev/README.md).

The checked-in Bruno requests continue to target the deterministic stub so they remain repeatable and require no
Paddle account. Run them after Paddle configuration changes to prove that the local provider path still works. Do not
commit Paddle keys, notification secrets, or customer transaction payloads.
