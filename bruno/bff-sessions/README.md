# BFF Sessions Bruno Collection

This collection checks the browser session HTTP contract through the local Compose web gateway. Session lookup rejects a
missing session with the exact `401 { "code": "authentication_required" }` response, and a valid service-client bearer
with the exact `403 { "code": "human_session_required" }` response. An unauthenticated request to log out is rejected
with `401`. Login redirects to the configured public Keycloak authorization endpoint with PKCE S256, state, nonce,
and a public callback URL, and sets an `HttpOnly` login-state cookie. The login request includes a safe application
destination and an unusable session cookie. Its response clears both session and CSRF cookies with matching scope,
disables caching and referrer forwarding, and keeps the destination out of the provider authorization URL. The callback checks first prove that a missing
state and a mismatched state cookie redirect to `login_state_invalid` without consuming the valid pending state. The
same state with no authorization code is then consumed and redirects to `authorization_code_exchange_failed`, and a
replay redirects to `login_state_invalid`. All four redirects clear the transient cookie, disable caching and referrer
forwarding, and contain no submitted code or state value.

The collection also checks that `/docs` serves Swagger UI and `/openapi.json` publishes exactly the initial browser
operations, including the optional destination query, nullable account email, cookie and CSRF security, and stable callback error codes. The gateway root serves the product document with its browser security headers. Unknown UI paths reach that
document for client-side not-found handling. Unknown versioned and legacy API paths, `/docs-json`, and `/docs-yaml`
retain JSON `404` responses.

Run the repository command from the checkout root after provisioning the development stack:

```shell
corepack pnpm bruno:bff-sessions
```

The repository launcher uses the pinned `@usebruno/cli` version, selects the `local` environment, and reads ignored
`.dev/keycloak/development-stack.json` metadata. It confirms that the running web, API, and Keycloak containers belong to
this checkout and the recorded Compose project before sending requests. On the first run it discovers and records
the local stack; set `COMPOSE_PROJECT_NAME` when using a project other than `lef`. Public API and issuer URLs come
from that metadata, so no credential exports or global CLI installation are needed.

The launcher reads the checkout-owned service-client fixture, obtains a short-lived token without logging its client
secret or bearer value, and sends the token only for the human-session boundary check. It requires all fifteen requests
and their tests to execute successfully. Missing prerequisites, a skipped request, zero executed tests, and mismatched
report counts fail the command. It captures raw CLI output, omits headers and bodies from temporary reports, and
removes those reports after execution to keep credentials and cookies out of logs and retained artifacts.

The API-level Keycloak login, token refresh, logout, and internal provider-routing checks use the repository live
runner:

```shell
corepack pnpm test:bff-live
```

That runner supplies the required `TEST_BFF_*` inputs and rejects a skipped or empty test run. The live test submits
the hosted login form and seeds the organization membership required for a successful login. It covers the
current-account success shape, nullable email, inactive membership, and post-guard unavailable account state. The
guard-wiring integration test separately covers global Origin and CSRF enforcement for unsafe requests authenticated
by the `lef_session` cookie. Service-client bearer requests and public routes retain their existing behavior.

The launcher integration test executes the complete collection against a synthetic HTTP fixture to validate request
counts, assertion execution, and report cleanup. This is separate from running Bruno against a provisioned development
stack. The API documentation integration test exercises the shared runtime registration helper and its real routes.

The gateway browser smoke completes the hosted Keycloak login through the public web origin, reads the current
account with an opaque cookie, and proves CSRF protection. A request to log out without CSRF fails. The generated
browser client then uses the existing CSRF middleware to log out successfully. The smoke also exercises Swagger
Try it out and checks browser security headers, API route ownership, and marker redaction in both gateway and API logs:

```shell
corepack pnpm test:web-live
```

The wrapper confirms the current checkout's Compose ownership and health, creates one temporary ordinary member in
Keycloak with a matching development organization and membership, and removes those resources afterward. It changes
no realm authentication policy. Privileged owner and operator MFA enrollment remains in `frontend/09`. Passwords,
cookies, and callback URLs are excluded from retained browser artifacts: tracing, screenshots, and video are disabled,
and the wrapper deletes its private temporary fixture and report directory on success or failure. The browser origin
defaults to `http://localhost:53000`; a checkout using the documented Compose port overrides is discovered through the
same live ownership checks. A run against another port proves that isolated local topology; CI uses port 53000.
