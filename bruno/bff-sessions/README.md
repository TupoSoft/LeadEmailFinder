# Browser Session Collection

The BFF (backend for frontend) handles browser authentication and session cookies. This Bruno API-request collection
requires a provisioned disposable Compose gateway. Configure its URLs and platform API key through
`environments/local.yml` before running the requests.

## Required Contract

- Missing sessions return `401 { "code": "authentication_required" }`; a valid machine credential returns
  `403 { "code": "human_session_required" }`. Unauthenticated logout returns `401`.
- Login redirects to Keycloak, the identity provider, with PKCE S256, state, and nonce. PKCE binds the authorization
  code to its initiator using a one-way SHA-256 fingerprint (`S256`); state binds the callback to a pending login;
  nonce binds the returned identity token.
- Login clears stale session and CSRF cookies, stores a safe application destination outside the provider URL,
  and sets an `HttpOnly` transient cookie, which browser scripts cannot read. CSRF protection blocks another
  website from making authenticated changes through the user's cookies.
- Missing or mismatched state redirects to `login_state_invalid` without consuming valid pending state.
  A matching state without a code is consumed and returns `authorization_code_exchange_failed`; replay then fails.
  Callback redirects clear transient cookies, disable caching/referrer forwarding, and expose no submitted code or state.
- `/docs` serves Swagger UI, the interactive API reference; `/openapi.json` describes browser operations.
  Unknown UI paths reach the product's not-found page. Unknown API paths retain JSON `404` responses.
