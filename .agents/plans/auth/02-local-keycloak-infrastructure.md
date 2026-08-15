# Add disposable local Keycloak infrastructure

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Provide a reproducible local identity provider that can issue browser and M2M tokens. A developer can start Compose, wait for Keycloak readiness, and obtain an API-audience token from a seeded service client.

## Progress

- [x] 2026-08-15 11:44 EEST — Add pinned Keycloak and database services.
- [x] 2026-08-15 12:11 EEST — Add idempotent realm provisioning.
- [x] 2026-08-15 12:15 EEST — Add readiness and authentication smoke tests.

## Surprises & Discoveries

- Keycloak authentication execution responses expose both a human display name such as `Cookie` and a provider ID such as `auth-cookie`; reconciliation must use provider identity and detect the newly created execution rather than assuming they are equal.
- A nested flow created with type `form-flow` accepts only form-action providers. The browser username/password and conditional-OTP authenticators require a `basic-flow` subflow; provisioning detects and repairs the partially created incompatible subflow.
- The audience mapper requires the public client ID `lead-email-finder-api`, not Keycloak's internal UUID. The live token smoke test exposed this because the first token contained the UUID in `aud`.
- The existing `lef_default` Docker network had active SMTP-fixture endpoints, so runtime validation used isolated Compose project `lef-keycloak-plan` without disrupting the running stack.

## Decision Log

- Decision: Pin Keycloak 26.7.0 and provision it through an idempotent script.
  Rationale: Reproducibility requires a fixed version, while repeated development setup must not duplicate realm resources.
  Date/Author: 2026-08-14, project planning.
- Decision: Do not modify `swarm.yml`.
  Rationale: Production infrastructure is explicitly out of scope.
  Date/Author: 2026-08-14, project planning.
- Decision: Store generated development service credentials in `.dev/keycloak/service-client.json` with mode `0600`, and ignore the directory.
  Rationale: Provisioning and smoke tests need repeatable local access without committing or printing the secret.
  Date/Author: 2026-08-15, Codex.
- Decision: Model privileged MFA with a composite `mfa_required` realm role and a conditional OTP browser execution.
  Rationale: `owner`, `admin`, and `platform_admin` can inherit one stable MFA condition while `member` remains unaffected.
  Date/Author: 2026-08-15, Codex.

## Outcomes & Retrospective

Delivered the disposable Keycloak 26.7.0/PostgreSQL topology, configuration-driven local issuer and audience, idempotent Admin REST provisioning, ignored service credentials, focused model/reconciliation tests, and a live smoke test. Repeated provisioning recovered from a partial authentication-flow run and then completed twice without duplicates. The issued Client Credentials token had issuer `http://localhost:58080/realms/lead-email-finder` and audience `lead-email-finder-api`; a plain-PKCE authorization request was rejected with `invalid_request`. Production deployment and application-side OIDC enforcement remain in later plans.

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

Run `docker compose -f docker/compose.yaml config`, `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/keycloak/provisioning.spec.ts src/lead-email-finder-api/src/environment-variables.dto.spec.ts --runInBand`, `corepack pnpm typecheck`, `corepack pnpm lint`, and `git diff --check`. Start the isolated runtime with `docker compose -p lef-keycloak-plan -f docker/compose.yaml up -d keycloak`, confirm both services are healthy, run `corepack pnpm keycloak:provision` twice, and run `corepack pnpm keycloak:smoke` to request a Client Credentials token, inspect issuer/audience, and reject a plain-PKCE request.

## Idempotence and Recovery

Provisioning reads before creating or updating resources. A failed run can be repeated. If configuration drifts beyond safe reconciliation, delete only the named Keycloak development database volume and reprovision it; no production recovery path is required.

## Artifacts and Notes

- Observed image digest during runtime validation: `quay.io/keycloak/keycloak@sha256:0f198be292568439d700cdbfb893e69a6009bb43a94a06a945b1d3d506c76b13`. Compose pins the requested version tag rather than the platform-specific digest.
- Focused Jest suites: 2 passed, 17 tests passed.
- `pnpm typecheck`, Compose config rendering, and `git diff --check` passed. `pnpm lint` passed with two pre-existing explicit-return-type warnings in unrelated tests.
- Isolated runtime: Keycloak and its PostgreSQL service became healthy; provisioning passed twice; `pnpm keycloak:smoke` passed issuer, audience, Client Credentials, and non-S256 PKCE rejection checks.

## Plan readiness

Implemented and validated as one pull request after PR 1.
