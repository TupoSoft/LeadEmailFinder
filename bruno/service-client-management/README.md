# Service Client Management Bruno Collection

This collection proves the HTTP-boundary rejection behavior of ExecPlan `.agents/plans/auth/08-m2m-client-management.md`: creating a service client without a credential is rejected, an actor whose organization does not match the target organization is rejected, and a permission outside the supported set is rejected.

**Every success path in this feature (create/list/rotate/disable/delete) requires a genuine owner/admin human browser session** — enforced by this plan's own decision that only a `human_session` credential kind may manage service clients (see the ExecPlan's Decision Log). Bruno has no way to mint a real browser session, the same limitation `bruno/bff-sessions/README.md` already documents, so none of the 2xx/204 lifecycle responses are reachable from this collection. The admin API key used for the rejection requests above (`legacy_api_key`, `platform_admin`) is deliberately the wrong credential kind for every success path, which is exactly why it's useful for proving the rejection paths and nothing else.

The full lifecycle — create a real Keycloak client, mint a client_credentials token against it, use that token against a protected route, rotate (old secret stops working, new one works), disable (a token minted before disabling is rejected on its very next use), delete (the Keycloak client is actually gone) — is covered instead by `src/lead-email-finder-api/src/service-client-management/service-client-management.live-keycloak.integration.spec.ts` (skip-gated on `TEST_SVC_*`). Authorization/tenant-isolation/scope-ceiling business rules that don't require live Keycloak are covered by the unit specs and `service-client-management-http.integration.spec.ts` (real `PermissionsGuard`/`ClassSerializerInterceptor`, mocked services).

**Known limitation (same one documented in `bruno/organization-onboarding/README.md`): the containerized `api` service cannot reach Keycloak's Admin REST API from inside its own Docker network namespace.** This collection's own requests never touch Keycloak (they only exercise guard/validation rejections), so they run fine against the container. If this collection is ever extended to cover a success path against a real human session, run the API on the host instead — see `bruno/organization-onboarding/README.md` for the exact workaround.

Run it against the local Compose stack (API up; Keycloak does not need to be reachable for these specific requests):

```shell
cd bruno/service-client-management
ADMIN_API_KEY=<value from docker/secrets/admin_apikey.txt> npx @usebruno/cli run --env local
```
