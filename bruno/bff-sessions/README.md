# BFF Sessions Bruno Collection

This collection checks the browser session HTTP contract against the local Compose API. Session lookup rejects a
missing session with the exact `401 { "code": "authentication_required" }` response, and a valid service-client bearer
with the exact `403 { "code": "human_session_required" }` response. An unauthenticated request to log out is rejected
with `401`. Login redirects to the configured public Keycloak authorization endpoint with PKCE S256, state, nonce, and a
public callback URL, and sets an `HttpOnly` login-state cookie. A callback with a missing or mismatched login-state
cookie is rejected with `401`.

Run the repository command from the checkout root after provisioning the development stack:

```shell
corepack pnpm bruno:bff-sessions
```

The repository launcher uses the pinned `@usebruno/cli` version, selects the `local` environment, and reads ignored
`.dev/keycloak/development-stack.json` metadata. It confirms that the running API and Keycloak containers belong to
this checkout and the recorded Compose project before sending requests. On the first run it discovers and records
the local stack; set `COMPOSE_PROJECT_NAME` when using a project other than `lef`. Public API and issuer URLs come
from that metadata, so no credential exports or global CLI installation are needed.

The launcher reads the checkout-owned service-client fixture, obtains a short-lived token without logging its client
secret or bearer value, and sends the token only for the human-session boundary check. It requires all five requests
and their tests to execute successfully. Missing prerequisites, a skipped request, zero executed tests, and mismatched
report counts fail the command. It captures raw CLI output, omits headers and bodies from temporary reports, and
removes those reports after execution to keep credentials and cookies out of logs and retained artifacts.

The complete Keycloak login, token refresh, logout, and internal provider-routing checks use the repository live
runner:

```shell
corepack pnpm test:bff-live
```

That runner supplies the required `TEST_BFF_*` inputs and rejects a skipped or empty test run. The live test submits
the hosted login form and seeds the organization membership required for a successful login. It covers the
current-account success shape, nullable email, inactive membership, and post-guard unavailable account state. The
guard-wiring integration test separately covers global Origin and CSRF enforcement for unsafe requests authenticated
by the `lef_session` cookie. Service-client bearer requests and public routes retain their existing behavior.
