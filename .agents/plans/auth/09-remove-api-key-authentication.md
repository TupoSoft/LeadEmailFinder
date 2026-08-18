# Remove API-key authentication

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Complete the development cutover so every browser user authenticates through a BFF session and every machine authenticates through OAuth Client Credentials. Raw API keys cease to exist in the application, configuration, documentation, and development clients.

## Progress

- [ ] Remove API-key runtime and persistence code.
- [ ] Update Bruno collections and bootstrap scripts to OAuth.
- [ ] Remove obsolete configuration and verify the clean cutover.

## Plan dependencies

- `auth/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Perform an immediate breaking development cutover with no compatibility window.
  Rationale: There is no production environment or customer data to migrate.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The preceding plans leave the existing `src/libs/modules/api-key` path available only to keep intermediate branches usable. Credits and jobs no longer depend on tokens, and customer M2M clients can be created through Keycloak, so the bridge can now be deleted.

## Scope and Non-Goals

Remove the API-key module, entity, guards, services, seeding, administration routes, permission checks, token-addressed credits, Docker secrets, and documentation. Update all Bruno collections and development bootstrap scripts to request Keycloak tokens. Do not add deprecation headers, sunset periods, data conversion, or migration code.

## Plan of Work

Delete API-key composition and references after proving each consumer has an OAuth replacement. Remove obsolete environment variables and secret mounts. Add a shared Bruno pre-request or helper flow that requests and caches a short-lived Client Credentials token without committing credentials. Update Swagger and README to describe only OIDC bearer and BFF sessions.

## Interfaces and Dependencies

`X-Api-Key`, `Bearer api_*`, `/v1/api-keys`, and token-addressed credit routes are removed. This plan depends on PR 8 and completes the authentication cutover.

## Acceptance Criteria

- `X-Api-Key` and `Bearer api_*` are rejected on every protected endpoint.
- No API-key generation, listing, revocation, or permission-check route remains.
- No raw-token persistence or token-owned credit contract remains.
- Bruno collections obtain tokens through Client Credentials.
- Local bootstrap uses a seeded Keycloak service client.
- Swagger and README describe only OIDC bearer and BFF-session authentication.
- Obsolete API-key environment variables, secrets, aliases, and tests are removed.
- The full API works after a clean development reset without migration.

## Validation

Search the repository for obsolete module symbols, routes, headers, and secret names. Run full static and test checks, Bruno authentication/endpoint smoke tests, and clean-stack runtime verification.

## Idempotence and Recovery

The cutover deliberately discards development API keys. If the new stack needs to be recreated, use the reset/reseed workflow. Reverting the PR restores source code but not discarded development secrets, which are not preserved by design.

## Artifacts and Notes

Record the final repository-search patterns and Bruno smoke-test results.

## Plan readiness

Ready to implement.
