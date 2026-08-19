# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through the opt-in, Docker-network-only SMTP fixture. The fixture accepts every recipient, so this checks application, DNS, proxy, and SMTP wiring rather than real-world deliverability. It then drains the fixture's proxy, confirms it's excluded from proxy selection, and restores it so the collection can be run again without restarting the fixture.

The draining check calls `GET /v1/proxies/healthy` rather than `POST /verify` again: `SmtpVerifier` caches its internal catch-all probe per domain, so a second `/verify` call for the same domain never re-attempts allocation regardless of proxy state. `/v1/proxies/healthy` runs the same `state = active` eligibility query the allocator uses, without that cache in the way.

Start the fixture from the repository root:

```shell
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
pnpm keycloak:provision
pnpm keycloak:bootstrap-credential
```

`keycloak:bootstrap-credential` seeds a `Platform Operations (development)` organization and grants the pre-provisioned `lef-development-service` M2M client every permission (including `platform:admin`), issued under both the host-facing and the smtp-dev overlay's container-internal Keycloak issuer — this fixture's own `bootstrap-proxy.sh` and this Bruno collection both authenticate as that client via OAuth Client Credentials, not a raw API key.

**This collection must run from inside the smtp-dev Docker network, not from the host.** `docker/compose.smtp-dev.yaml` overrides the `api` service's own `OIDC_ISSUER_URL` to the container-internal `http://keycloak:8080/realms/lead-email-finder` (the same reason `bootstrap-proxy.sh` had to move off `X-Api-Key` — see `.agents/plans/auth/09-remove-api-key-authentication.md`'s Decision Log): a token minted from the host-published `http://localhost:58080/...` carries a different `iss` claim and is rejected. Run it in a throwaway container attached to the same network instead:

```shell
docker run --rm --network lef_default \
  -v "$(pwd)/bruno/smtp-dev:/collection" \
  -e OIDC_ISSUER_URL="http://keycloak:8080/realms/lead-email-finder" \
  -e KEYCLOAK_SERVICE_CLIENT_ID="lef-development-service" \
  -e KEYCLOAK_SERVICE_CLIENT_SECRET="$(jq -r .clientSecret .dev/keycloak/service-client.json)" \
  -e PLATFORM_ORGANIZATION_ID="$(jq -r .organizationId .dev/keycloak/service-credential.json)" \
  node:22-alpine sh -c "cd /collection && npm install -g @usebruno/cli && bru run --env local --sandbox developer --env-var baseUrl=http://api:3000"
```

`--sandbox developer` is required (the default `safe` sandbox has no `fetch`, which the collection's token-minting `before-request` script needs). `--env-var baseUrl=http://api:3000` overrides the `local` environment's host-facing `baseUrl` with the container-internal one, since `localhost:53000` isn't reachable from inside this throwaway container either.
