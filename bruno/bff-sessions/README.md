# BFF Sessions Bruno Collection

This collection checks the intermediate native-session HTTP boundary through the checkout-owned development web
origin. It preserves exact missing-session `401 { "code": "authentication_required" }` and machine-key
`403 { "code": "human_session_required" }` account responses. An anonymous state read returns only
`{ "state": "signed_out" }`, expires the CSRF cookie, and prevents caching and referrer forwarding.

The narrow magic-link request and confirmation routes reject cross-origin requests and unsupported input fields.
The valid request route currently returns the redacted `503 { "code": "authentication_unavailable" }` without
claiming email delivery or creating a session. Magic-link token consumption, MFA writes, and authoritative logout
belong to the next checklist item in `better-auth/03`; the pending mutations deliberately remain unavailable.
An anonymous logout with the correct application Origin still receives `401`. Legacy login/callback routes and
raw native authentication routes are absent.

The remaining checks preserve Swagger UI, the exact reviewed browser OpenAPI operations and safe state schema,
product security headers, client-side fallback, and JSON errors for unknown API paths. All 17 requests and 18 tests
must execute; missing, skipped, or unsuccessful checks fail the launcher.

Run from the repository root with the checkout-owned development stack and platform API-key fixture available:

```sh
corepack pnpm bruno:bff-sessions
```

The launcher selects `bru run --env local` through the pinned CLI, validates existing Compose ownership metadata,
and supplies `baseUrl`, `appOrigin`, and the machine-key fixture without printing credentials. No real mailbox or
native human fixture is required for these anonymous and unavailable-workflow checks. Reports omit headers and
bodies and are removed after execution.

`node --test scripts/bruno/run-collection.test.mjs` runs the actual collection against a synthetic HTTP fixture to
check assertion execution, request counts, and report cleanup. That runner test is separate from live API evidence.
The old Keycloak browser/live tooling remains pending later plan items and is not proof of native sign-in behavior.
