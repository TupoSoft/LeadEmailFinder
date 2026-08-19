# Service Client Management Bruno Collection

This collection proves the HTTP-boundary rejection behavior of ExecPlan `.agents/plans/auth/08-m2m-client-management.md`: creating a service client without a credential is rejected, an actor whose organization does not match the target organization is rejected, and unsupported or duplicate permissions are rejected.

**Every success path in this feature (create/list/rotate/disable/delete) requires a genuine owner/admin human browser session** — enforced by this plan's own decision that only a `human_session` credential kind may manage service clients (see the ExecPlan's Decision Log). Bruno has no way to mint a real browser session, the same limitation `bruno/bff-sessions/README.md` already documents, so none of the 2xx/204 lifecycle responses are reachable from this collection. The requests below authenticate as the pre-provisioned `lef-development-service` M2M client via OAuth Client Credentials (`service_client` credential kind) — deliberately the wrong credential kind for every success path in this feature, which is exactly why it's useful for proving the rejection paths and nothing else.

The full lifecycle — create a real Keycloak client, mint a client_credentials token against it, use that token against a protected route, rotate (old secret stops working, new one works), disable (a token minted before disabling is rejected on its very next use), delete (the Keycloak client is actually gone) — is covered instead by `src/lead-email-finder-api/src/service-client-management/service-client-management.live-keycloak.integration.spec.ts` (skip-gated on `TEST_SVC_*`). Authorization/tenant-isolation/scope-ceiling business rules that don't require live Keycloak are covered by the unit specs and `service-client-management-http.integration.spec.ts` (real `PermissionsGuard`/`ClassSerializerInterceptor`, mocked services).

**Known limitation (same one documented in `bruno/organization-onboarding/README.md`): the containerized `api` service cannot reach Keycloak (Admin REST API or JWKS) from inside its own Docker network namespace.** Every request in this collection now sends a real OAuth Client Credentials bearer token, which the api service must verify against Keycloak's JWKS endpoint — if that fails against the containerized stack, run the API on the host instead, following `bruno/organization-onboarding/README.md`'s exact workaround.

```shell
pnpm keycloak:provision
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
cd bruno/service-client-management
npx @usebruno/cli run --env local --sandbox developer
```
