# M2M OIDC Authentication Bruno Collection

This collection proves the global, default-deny `AuthGuard` added by ExecPlan `.agents/plans/auth/03-oidc-m2m-authentication.md`: `/health` stays public, and a request with no credential or a JWT-shaped-but-invalid bearer token is rejected with `401` before any controller runs.

Plan 04 has since wired real authorization onto every controller, so a valid OIDC token now *can* succeed against a business endpoint (given a matching, correctly-scoped `ServiceCredential` row). That case isn't a Bruno request here, though: minting/seeding a `ServiceCredential` row isn't an HTTP-reachable action in either plan, so Bruno has no way to set it up. It's covered instead by the Jest integration test `src/libs/modules/auth/src/oidc-permission-check.live-keycloak.integration.spec.ts` (skip-gated on `TEST_OIDC_*`/`TEST_OIDC_POSTGRES_URL`), which has direct database access to seed the credential.

Run it against the local Compose stack (API and Keycloak both up):

```shell
cd bruno/m2m-oidc-authentication
bru run --env local
```
