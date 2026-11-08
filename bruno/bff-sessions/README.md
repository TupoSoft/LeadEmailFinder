# Browser Session Collection

The BFF (backend for frontend) handles browser authentication and session cookies. Bruno runs API requests with
assertions against the checkout-owned Compose gateway:

```shell
corepack pnpm bruno:bff-sessions
```

Provision the development stack first. The launcher discovers its public URLs, verifies container ownership,
and loads the private platform API key. Set `COMPOSE_PROJECT_NAME` for a separately named stack. All 15 requests
and 16 tests must pass; missing, skipped, or empty results fail. Raw output is withheld and temporary reports are
removed so credentials, cookies, headers, and bodies are not retained.

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

## Additional Live Checks

```shell
corepack pnpm test:bff-live
corepack pnpm test:web-live
```

The API runner covers hosted login, token refresh, logout, membership eligibility, and account responses. The
browser runner covers real gateway login, session expiry/replacement, competing callbacks, history restoration,
and CSRF-protected logout across tabs. It verifies owned services' health, creates and removes temporary ordinary
members, and leaves realm authentication policy unchanged. Privileged MFA (password plus a second factor) uses
separate browser fixtures.

Tracing, screenshots, and video are disabled; temporary credentials and diagnostics are deleted. Browser origin
is discovered from the owned stack and normally uses `http://localhost:53000`.

Synthetic launcher and routing tests verify collection execution and cleanup. They do not replace these live runs.
