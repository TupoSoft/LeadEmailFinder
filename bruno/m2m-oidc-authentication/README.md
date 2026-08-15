# M2M OIDC Authentication Bruno Collection

This collection proves the global, default-deny `AuthGuard` added by ExecPlan `.agents/plans/auth/03-oidc-m2m-authentication.md`: `/health` stays public, and a request with no credential or a JWT-shaped-but-invalid bearer token is rejected with `401` before any controller runs.

This PR deliberately does not change authorization on any existing business endpoint (that is plan 04's scope), so there is no "valid OIDC token succeeds against a business endpoint" request here yet — every existing controller still requires its current legacy API key. That request becomes addable once plan 04 replaces the per-controller permission declarations.

Run it against the local Compose stack (API and Keycloak both up):

```shell
cd bruno/m2m-oidc-authentication
bru run --env local
```
