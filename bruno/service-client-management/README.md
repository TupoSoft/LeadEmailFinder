# Service Client Management Bruno Collection

This collection proves the HTTP-boundary rejection behavior of ExecPlan `.agents/plans/auth/08-m2m-client-management.md`: creating a service client without a credential is rejected, an actor whose organization does not match the target organization is rejected, and unsupported or duplicate permissions are rejected.

**Every success path in this feature (create/list/rotate/disable/delete) requires a genuine owner/admin human browser session** — enforced by the decision that only a `human_session` credential kind may manage service clients (see the ExecPlan Decision Log). Bruno has no way to mint a real browser session, the same limitation `bruno/bff-sessions/README.md` already documents, so none of the 2xx/204 life cycle responses are reachable from this collection. The requests below authenticate as the pre-provisioned `lef-development-service` M2M client through OAuth Client Credentials (`service_client` credential kind). This is deliberately the wrong credential kind for every success path, which makes it useful for proving the rejection paths and nothing else.

The full life cycle is covered instead by `src/libs/modules/service-client-management/src/service-client-management.live-keycloak.integration.spec.ts` (skip-gated on `TEST_SVC_*`). It creates a real Keycloak client, mints a `client_credentials` token, uses it against a protected route, and then verifies rotation, disablement, and deletion. Authorization, tenant isolation, and scope-ceiling rules that do not require live Keycloak are covered by the unit specs and `service-client-management-http.integration.spec.ts` (real `PermissionsGuard` and `ClassSerializerInterceptor`, mocked services).

Run it against the normal containerized stack:

```shell
pnpm keycloak:provision
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
cd bruno/service-client-management
npx @usebruno/cli run --env local --sandbox developer
```
