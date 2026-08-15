# Authenticate M2M clients with OIDC

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow machine clients to call protected LeadEmailFinder endpoints with short-lived Keycloak access tokens. The API validates tokens locally and resolves each service account to one application-owned organization.

## Progress

- [ ] Add OIDC JWT verification and JWKS caching.
- [ ] Resolve service credentials to an `AuthPrincipal`.
- [ ] Register default-deny authentication and integration coverage.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use `jose` for standards-based JWT and JWKS verification.
  Rationale: It supports asymmetric verification and key rotation without coupling application policy to Keycloak adapters.
  Date/Author: 2026-08-14, project planning.
- Decision: Keep API keys only as an undocumented bridge until PR 9.
  Rationale: Intermediate PRs must remain usable while the new authorization and resource-ownership paths are added.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`ApiKeyGuard` currently extracts both bearer and `X-Api-Key` credentials and delegates directly to `ApiKeyService`. Several controllers also parse headers. There is no request principal or global default-deny guard.

## Scope and Non-Goals

Create authentication application contracts and a Keycloak OIDC adapter under the auth/identity modules. Attach `AuthPrincipal` to requests, register a global guard, and keep the old API-key adapter temporarily. Do not add browser sessions, resource authorization, or remove API keys.

## Plan of Work

Validate the configured issuer, `lead-email-finder-api` audience, approved asymmetric algorithm, token type, expiry, and not-before time using cached JWKS. Resolve service-account issuer/subject to an active local service credential rather than trusting organization claims. Move all header parsing into authentication adapters. Mark only health and later OAuth callback endpoints public. Update Swagger security definitions.

## Interfaces and Dependencies

Add a narrow `CredentialAuthenticator` interface, request-principal accessor/decorator, OIDC configuration variables, and a temporary composite authenticator. This plan depends on PRs 1 and 2 and unlocks permission authorization.

## Acceptance Criteria

- A valid Client Credentials token authenticates as its locally bound organization.
- A token cannot choose or override its organization through claims or headers.
- Wrong issuer, audience, signature, algorithm, token type, expiry, or not-before returns `401`.
- Unknown, disabled, or deleted local service credentials return `401`.
- Keycloak or JWKS failure never fails open.
- Controllers do not parse authentication headers.
- Authentication is globally default-deny and `/health` remains explicitly public.
- Existing API keys work only through the temporary internal bridge.

## Validation

Run focused JWT, JWKS-cache, principal-resolution, and guard tests; run integration tests against local Keycloak for valid and invalid tokens; simulate key rotation and JWKS outage; then run the full static and test suite.

## Idempotence and Recovery

JWKS refresh is cache-safe and retryable. Disabling the OIDC adapter during development leaves the temporary API-key bridge until PR 9. Resetting Keycloak and reseeding local credential bindings restores a clean environment.

## Artifacts and Notes

Record accepted token-header and claim shapes without recording live tokens.

## Plan readiness

Ready to implement after PRs 1 and 2.
