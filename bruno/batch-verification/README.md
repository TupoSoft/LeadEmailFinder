# Batch Verification Bruno Collection

Uploads a small fixture CSV through `POST /verifyBatch/csv`, then polls `GET /verifyBatch/:id` until the
job completes, asserting every observed `progress` value is a finite number within `[0, 100]` and that
the completed job reports exactly `100`. A third request independently polls `GET /verifyBatch/:id` to
completion (a fixed wait is not reliable here) and then downloads `GET /verifyBatch/:id/results`, asserting
the returned CSV's `email` column matches the uploaded fixture addresses exactly.

Run it against the local Compose API, authenticating as the seeded **customer** M2M client
`lef-svc-dev-fixture` (organization "Acme Development Customer", 1000 seeded credits) via OAuth Client
Credentials — **not** the platform-operations `lef-development-service` client used by most other
collections in this repo: `verification:run` debits a credit from the caller's own organization, and the
platform-operations organization is deliberately seeded with zero credits, so authenticating as
`lef-development-service` here fails every upload with `InsufficientCreditsException`.

```shell
pnpm dev:reset
```

`lef-svc-dev-fixture`'s secret is never written to disk (unlike `service-client.json`) — fetch it live from
the Keycloak Admin API using the org-admin service credentials `pnpm dev:reset` already wrote:

```shell
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export CUSTOMER_SERVICE_CLIENT_ID=lef-svc-dev-fixture

ORG_ADMIN_ID=$(jq -r .clientId .dev/keycloak/org-admin-client.json)
ORG_ADMIN_SECRET=$(jq -r .clientSecret .dev/keycloak/org-admin-client.json)
ADMIN_TOKEN=$(curl -s --data-urlencode grant_type=client_credentials \
    --data-urlencode "client_id=${ORG_ADMIN_ID}" --data-urlencode "client_secret=${ORG_ADMIN_SECRET}" \
    "${OIDC_ISSUER_URL}/protocol/openid-connect/token" | jq -r .access_token)
INTERNAL_ID=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://localhost:58080/admin/realms/lead-email-finder/clients?clientId=${CUSTOMER_SERVICE_CLIENT_ID}" \
    | jq -r '.[0].id')
export CUSTOMER_SERVICE_CLIENT_SECRET=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://localhost:58080/admin/realms/lead-email-finder/clients/${INTERNAL_ID}/client-secret" | jq -r .value)

cd bruno/batch-verification
npx @usebruno/cli run --env local --sandbox developer
```

A collection-root `before-request` script mints and caches a Client Credentials token as
`{{serviceClientToken}}` before the first request that needs it, reused for every request in this
collection.

`fixtures/sample.csv` uses the local SMTP-development fixture domain (`lef.test`, see
`bruno/smtp-dev/`) so verification resolves deterministically without external network access.
