# BFF Sessions Bruno Collection

This collection proves the HTTP-boundary behavior of the browser session endpoints added by ExecPlan `.agents/plans/auth/06-bff-sessions.md`: `GET /v1/auth/session` and `POST /v1/auth/logout` reject an unauthenticated request with `401`, and `GET /v1/auth/login` redirects to Keycloak with a correctly constructed Authorization Code + PKCE S256 request and sets an `HttpOnly` login-state cookie. `GET /v1/auth/callback` rejects a request whose login-state cookie is missing or doesn't match the `state` query parameter.

The full success round trip (a real Keycloak login completing through the hosted login form, an authenticated `GET /v1/auth/session`, CSRF/Origin rejection against a *genuine* session, silent token refresh, and the MFA-block behavior for privileged roles) all require a real authenticated session, which isn't something Bruno's plain HTTP request model can drive end to end — the login form itself is a Keycloak-hosted page outside this API. Those are covered instead by the Jest integration test `src/libs/modules/bff-session/src/bff-session-flow.live-keycloak.integration.spec.ts` (skip-gated on `TEST_BFF_*` environment variables), which drives the real form submission and has direct database access to seed the organization membership a login requires.

Run it against the local Compose stack (API and Keycloak both up):

```shell
cd bruno/bff-sessions
bru run --env local
```
