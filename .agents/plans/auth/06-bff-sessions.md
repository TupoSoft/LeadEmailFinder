# Add Redis-backed browser sessions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow a browser user to sign in through Keycloak without exposing OAuth tokens to browser JavaScript. The NestJS API acts as a backend for frontend, stores tokens in Redis, and presents the browser with an opaque session cookie.

## Progress

- [ ] Add login, callback, session, and logout endpoints.
- [ ] Add encrypted Redis sessions and CSRF protection.
- [ ] Add browser-flow and failure-path integration tests.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use Authorization Code with PKCE S256 and server-side token storage.
  Rationale: Browser code never needs to handle access or refresh tokens.
  Date/Author: 2026-08-14, project planning.
- Decision: Default local base URL is `http://localhost:53000`.
  Rationale: It matches the existing Compose-published API endpoint while remaining configurable for a later same-origin frontend proxy.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

There is currently no frontend or session layer. The API already uses Redis for BullMQ. PRs 3–5 provide authenticated principals, authorization policy, and organization-owned resources that a session principal can reuse.

## Scope and Non-Goals

Add `GET /v1/auth/login`, `GET /v1/auth/callback`, `POST /v1/auth/logout`, and `GET /v1/auth/session`. Add Redis session storage, server-side token refresh, OAuth state/nonce/PKCE handling, Origin checks, and CSRF tokens. Do not implement frontend UI, social login, or public signup.

## Plan of Work

Create a focused BFF application service and separate Keycloak OAuth and Redis session adapters. Generate state, nonce, PKCE verifier, session ID, and CSRF secret with cryptographic randomness. Encrypt provider tokens before Redis storage. Rotate the session identifier at authentication. Resolve membership and active organization from application state on protected requests. Invalidate local and Keycloak sessions on logout.

## Interfaces and Dependencies

Add `APP_BASE_URL`, session-encryption secret, session idle timeout, and absolute timeout configuration. Defaults are eight-hour idle and 24-hour absolute lifetimes. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` whenever `APP_BASE_URL` uses HTTPS. This plan depends on PRs 2, 4, and 5 and unlocks onboarding.

## Acceptance Criteria

- Login uses Authorization Code, PKCE S256, state, and nonce.
- OAuth tokens never appear in browser-visible responses, storage, or logs.
- Callback replay, invalid state, invalid nonce, and invalid PKCE are rejected.
- Session fixation is prevented by rotating the session ID after login.
- State-changing session requests without valid Origin and CSRF values are rejected.
- Refresh occurs server-side and logout invalidates Redis and Keycloak sessions.
- Disabled memberships stop authorizing new requests.
- Privileged users cannot establish a usable session until Keycloak MFA requirements are satisfied.

## Validation

Run focused OAuth, encryption, cookie, CSRF, expiry, and session tests; run a browser-flow integration test against local Keycloak; exercise refresh, logout, callback replay, Redis loss, and disabled membership; then run all project checks.

## Idempotence and Recovery

Repeated login starts replace prior transient state safely. Redis loss logs browser users out without corrupting persistent application data. Resetting Redis and signing in again restores local development.

## Artifacts and Notes

Record sanitized redirect URLs, cookie attributes, and test transcripts without tokens.

## Plan readiness

Ready to implement after PRs 2, 4, and 5.
