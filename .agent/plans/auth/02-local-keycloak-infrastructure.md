# Add disposable local Keycloak infrastructure

This ExecPlan is a living document maintained according to `.agent/PLANS.md`.

## Purpose / Big Picture

Provide a reproducible local identity provider that can issue browser and M2M tokens. A developer can start Compose, wait for Keycloak readiness, and obtain an API-audience token from a seeded service client.

## Progress

- [ ] Add pinned Keycloak and database services.
- [ ] Add idempotent realm provisioning.
- [ ] Add readiness and authentication smoke tests.

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Pin Keycloak 26.7.0 and provision it through an idempotent script.
  Rationale: Reproducibility requires a fixed version, while repeated development setup must not duplicate realm resources.
  Date/Author: 2026-08-14, project planning.
- Decision: Do not modify `swarm.yml`.
  Rationale: Production infrastructure is explicitly out of scope.
  Date/Author: 2026-08-14, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`docker/compose.yaml` includes `docker/infra.yaml` and currently starts the API plus PostgreSQL, Redis, and S3-compatible services. There is no Keycloak runtime or frontend application. `src/lead-email-finder-api/src/environment-variables.dto.ts` validates API configuration.

## Scope and Non-Goals

Add Keycloak and a dedicated disposable PostgreSQL database to local Compose. Add `scripts/keycloak/provision.ts` and ignored development-secret handling. Configure the realm, organizations, API audience, BFF client, service accounts, roles, scopes, verified email, password recovery, brute-force protection, and privileged-role MFA. Do not add production domains, TLS, clustering, backups, monitoring, or migrations.

## Plan of Work

Extend the development Compose topology with health checks and dependency ordering. Add validated environment variables needed by later API integration. Implement an idempotent provisioning command using the stable Keycloak Admin REST API and existing HTTP facilities. Configure Authorization Code with PKCE S256, Client Credentials, and disable implicit and resource-owner password grants. Seed one development service client and write its generated secret only to an ignored file or one-time output.

## Interfaces and Dependencies

Realm name is `lead-email-finder`; API audience is `lead-email-finder-api`; confidential BFF client is `lef-web-bff`. The local Keycloak issuer is configuration-driven. Add package scripts for provisioning and the smoke test. This plan depends on PR 1 and unlocks OIDC and BFF plans.

## Acceptance Criteria

- Local Compose starts Keycloak 26.7.0 with its own PostgreSQL service and reaches ready state.
- Provisioning can run twice without duplicating organizations, clients, roles, or scopes.
- The BFF client permits only configured local callback and logout URLs.
- PKCE methods other than S256 are rejected.
- A seeded service client obtains a token whose audience includes `lead-email-finder-api`.
- Implicit and password grants are disabled.
- No generated secret is committed and `swarm.yml` is unchanged.
- No migration is added.

## Validation

Run `docker compose -f docker/compose.yaml config`, the focused provisioning tests, and the package static checks. Start the local stack, poll Keycloak readiness, run provisioning twice, request a Client Credentials token, inspect its issuer/audience, and exercise a negative PKCE configuration check.

## Idempotence and Recovery

Provisioning reads before creating or updating resources. A failed run can be repeated. If configuration drifts beyond safe reconciliation, delete only the named Keycloak development database volume and reprovision it; no production recovery path is required.

## Artifacts and Notes

Record the pinned image digest if one is adopted, realm export used for assertions, and smoke-test output.

## Plan readiness

Ready to implement after PR 1.
