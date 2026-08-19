# Proxy Registry Bruno Collection

This collection exercises the secured proxy-registry API and removes the proxy it creates.

Run it against the local Compose API, authenticating as the pre-provisioned `lef-development-service` M2M client via OAuth Client Credentials:

```shell
pnpm keycloak:provision
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
cd bruno/proxy-registry
npx @usebruno/cli run --env local --sandbox developer
```

`keycloak:bootstrap-credential` grants that client `platform:admin` (among every other permission) locally — see `.agents/plans/auth/09-remove-api-key-authentication.md`'s Decision Log. A collection-root `before-request` script mints and caches a Client Credentials token as `{{serviceClientToken}}` before the first request that needs it, reused for every request in this collection.
