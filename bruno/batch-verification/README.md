# Batch Verification Bruno Collection

Uploads a small fixture CSV through `POST /verifyBatch/csv`, then polls `GET /verifyBatch/:id` until the
job completes, asserting every observed `progress` value is a finite number within `[0, 100]` and that
the completed job reports exactly `100`.

Run it against the local Compose API, authenticating as the pre-provisioned `lef-development-service` M2M
client via OAuth Client Credentials:

```shell
pnpm keycloak:provision
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
cd bruno/batch-verification
npx @usebruno/cli run --env local --sandbox developer
```

`keycloak:bootstrap-credential` grants that client `platform:admin` (among every other permission)
locally, which includes `verification:run`/`verification:read` — see
`.agents/plans/auth/09-remove-api-key-authentication.md`'s Decision Log. A collection-root
`before-request` script mints and caches a Client Credentials token as `{{serviceClientToken}}` before the
first request that needs it, reused for every request in this collection.

`fixtures/sample.csv` uses the local SMTP-development fixture domain (`lef.test`, see
`bruno/smtp-dev/`) so verification resolves deterministically without external network access.
