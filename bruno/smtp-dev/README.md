# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through the opt-in, Docker-network-only SMTP fixture. The fixture
accepts every recipient, so this checks application, DNS, proxy, and SMTP wiring rather than real-world
deliverability. The collection then drains the fixture proxy, confirms that proxy selection excludes it, and
restores it without restarting the fixture. Finally, the deprecated `GET /verify` compatibility route proves
that it requires the same credit as `POST /verify`. It returns `402` at zero balance and debits one credit after
a successful request.

The draining check calls `GET /v1/proxies/healthy` rather than `POST /verify` again. `SmtpVerifier` caches its
internal catch-all probe per domain, so a second `/verify` call for the same domain does not allocate another
proxy. `/v1/proxies/healthy` runs the same `state = active` eligibility query as the allocator without that
cache in the way.

Start the fixture from the repository root:

```shell
pnpm dev:reset
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

`dev:reset` provisions Keycloak and seeds the platform service credential before the overlay bind-mounts the
generated `.dev/keycloak/service-client.json` file. If the file is missing, the overlay fails without creating a
directory in its place. Provisioning also repairs an empty directory left by older Compose configurations, while
refusing to remove a nonempty directory.

The overlay runs `smtp-dev-dns-cache-reset` before starting the API or reconciling the fixture proxy. This
one-shot service clears the shared Redis `DNS_CACHE:*` namespace so answers cached by the base stack cannot
override the overlay's CoreDNS fixture. It is safe when the cache is already empty; DNS answers are populated
again on demand.

`keycloak:bootstrap-credential` seeds a `Platform Operations (development)` organization. It grants the
pre-provisioned `lef-development-service` M2M client every permission, including `platform:admin`, under both
the host-facing Keycloak issuer and the container-internal issuer used by `smtp-dev`. Both `bootstrap-proxy.sh`
and this collection authenticate as that client through OAuth Client Credentials instead of a raw API key.

**This collection must run inside the Docker network created for `smtp-dev`, not on the host.** The
`docker/compose.smtp-dev.yaml` file overrides `OIDC_ISSUER_URL` for `api` with the container-internal
`http://keycloak:8080/realms/lead-email-finder` URL. The same constraint required `bootstrap-proxy.sh` to move
away from `X-Api-Key`; see the Decision Log in `.agents/plans/auth/09-remove-api-key-authentication.md`. A
token minted from the host-published `http://localhost:58080/...` URL has a different `iss` claim and is
rejected. Run the collection in a throwaway container attached to the same network:

```shell
docker run --rm --network lef_default \
  -v "$(pwd)/bruno/smtp-dev:/collection" \
  -e OIDC_ISSUER_URL="http://keycloak:8080/realms/lead-email-finder" \
  -e KEYCLOAK_SERVICE_CLIENT_ID="lef-development-service" \
  -e KEYCLOAK_SERVICE_CLIENT_SECRET="$(jq -r .clientSecret .dev/keycloak/service-client.json)" \
  -e PLATFORM_ORGANIZATION_ID="$(jq -r .organizationId .dev/keycloak/service-credential.json)" \
  node:22-alpine sh -c "cd /collection && npm install -g @usebruno/cli && bru run --env local --sandbox developer --env-var baseUrl=http://api:3000"
```

`--sandbox developer` is required because the default `safe` sandbox does not provide the `fetch` function
needed by the token-minting `before-request` script. `--env-var baseUrl=http://api:3000` replaces the
host-facing `baseUrl` from the `local` environment with the container-internal URL. The host address
`localhost:53000` is not reachable from this throwaway container.
