# Authenticate M2M clients with OIDC

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Allow machine clients to call protected LeadEmailFinder endpoints with short-lived Keycloak access tokens. The API validates tokens locally and resolves each service account to one application-owned organization.

## Progress

- [x] Add OIDC JWT verification and JWKS caching. (2026-08-15)
- [x] Resolve service credentials to an `AuthPrincipal`. (2026-08-15)
- [x] Register default-deny authentication and integration coverage. (2026-08-15)

## Surprises & Discoveries

- `AuthPrincipal`, `AuthRole`, `AuthPermission`, and the `Organization`/`OrganizationMembership`/`ServiceCredential` entities already existed before this PR (delivered by plan 01, PR #312). Only the authentication mechanics that populate `AuthPrincipal` on a request were missing; the contract and persistence were reused as-is.
- `AuthPrincipal.membershipRole` is a required `AuthRole`, but neither service credentials nor legacy API keys have a real membership role. Resolved without a contract change: `service_client` principals get `membershipRole: 'admin'` (matching the precedent already present in the merged `auth-principal.spec.ts`); `legacy_api_key` principals mechanically mirror the existing `KeyPermissions.ADMIN` bit (`'platform_admin'` if set, else `'member'`). Neither is the authorization source of truth for its credential kind — plan 04's policy is expected to key off `permissions`/scopes for service principals.
- `jose@6` is ESM-only (`"type": "module"`, no `require` export condition) and is incompatible with this repo's CommonJS TypeScript output. Pinned to `jose@^5.10.0`, which ships dual `import`/`require` conditions.
- The Keycloak realm-relative path convention already used by `scripts/keycloak/provisioning.ts` and `smoke-test.ts` (`${issuer}/protocol/openid-connect/token`, `/auth`) extends cleanly to JWKS: the JWKS URI is derived as `${OIDC_ISSUER_URL}/protocol/openid-connect/certs` rather than configured or discovered, avoiding a second network round-trip/failure mode.
- Confirmed empirically against a live Keycloak 26.7 realm (local Compose stack, real Client Credentials token): the access-token `typ` header is `JWT`, matching the `jwtVerify` configuration as coded — no fix needed.
- The dockerized `api` service in `docker/compose.yaml` sets `OIDC_ISSUER_URL: http://localhost:58080/...`, but that service has no `network_mode: host`/`extra_hosts`, so `localhost` inside that container refers to the container itself, not the host-mapped Keycloak port — the containerized API cannot reach Keycloak's JWKS endpoint as configured. This is a pre-existing gap in the compose file (unrelated to anything this PR touches) discovered while setting up live verification; worked around by running the API on the host instead, pointed at the infra containers' host-exposed ports. Flagging as a possible follow-up for whoever next touches `docker/compose.yaml`, out of scope here.
- `jose`'s `createRemoteJWKSet` caches fetched keys by `kid` for the life of the returned function, not just for a fixed TTL. A live test confirmed that once a token's `kid` has been successfully verified once, an already-running app keeps successfully verifying tokens signed with that same `kid` even through a full Keycloak outage — the cache-miss/fetch-failure path (the one that produces `401`) only triggers for a `kid` not yet seen by that process (e.g. right after a cold start, or on real key rotation). Verified both paths live: a warm process survived a Keycloak outage without any failed requests; a cold-started process (started while Keycloak was down) correctly failed closed with `401` and recovered automatically once Keycloak came back, with no restart needed.

## Decision Log

- Decision: Use `jose` for standards-based JWT and JWKS verification.
  Rationale: It supports asymmetric verification and key rotation without coupling application policy to Keycloak adapters.
  Date/Author: 2026-08-14, project planning.
- Decision: Keep API keys only as an undocumented bridge until PR 9.
  Rationale: Intermediate PRs must remain usable while the new authorization and resource-ownership paths are added.
  Date/Author: 2026-08-14, project planning.
- Decision: Use `jose@^5.10.0`, not `^6`.
  Rationale: `jose@6` publishes ESM-only with no `require` condition; this repo compiles to CommonJS.
  Date/Author: 2026-08-15, implementation.
- Decision: Leave all 8 currently API-key-guarded controllers (`credits`, `proxy`, `api-key`, `email`, and the four verification controllers) completely untouched in this PR. The new `AuthGuard` runs as an additional, earlier, default-deny layer via `APP_GUARD`; it does not replace any existing `@UseGuards(ApiKeyGuard)`/`@RequireApiPermissions(...)` line.
  Rationale: Plan 04's own Progress list already owns "replace controller permission declarations." Splitting that across two PRs would create an inconsistent halfway state for no benefit, and keeps this PR strictly about authentication mechanics per its own Scope section. Consequence: no OIDC token can reach an existing business endpoint until plan 04 lands; this PR proves the guard/principal/decorator wiring end-to-end via its own throwaway test controller instead.
  Date/Author: 2026-08-15, implementation (confirmed with the user before implementation).
- Decision: No CI wiring for the live-Keycloak integration test in this PR; it stays local-only, skip-gated on `TEST_OIDC_ISSUER_URL`/`TEST_OIDC_CLIENT_ID`/`TEST_OIDC_CLIENT_SECRET`/`TEST_OIDC_AUDIENCE`, mirroring the existing `describeWithPostgres` pattern in `identity-schema.integration.spec.ts`.
  Rationale: Keeps this PR scoped to application code; a Keycloak service container plus realm provisioning in `.github/workflows/validate.yml` is a real CI complexity/runtime addition best proposed and reviewed on its own.
  Date/Author: 2026-08-15, implementation (confirmed with the user before implementation).
- Decision: `AuthModule` lives at `src/libs/modules/auth/src/`, a new sibling to `identity` and `api-key`, not a new layer inside `identity`.
  Rationale: `identity` is the stable data/vocabulary module (organizations, memberships, service credentials, the `AuthPrincipal` type); authentication mechanics (guards, JWT/JWKS adapters, request-scoped principal plumbing) are a distinct, growing concern that plans 06/08 will add to further, and plan 09 needs a clean module boundary to delete the legacy bridge from.
  Date/Author: 2026-08-15, implementation.

## Outcomes & Retrospective

Delivered a new `src/libs/modules/auth` module providing: a `CredentialExtractor` (the sole header-parsing site for the new pipeline), an ordered `AuthenticationService` composing two `CredentialAuthenticator` implementations (`OidcCredentialAuthenticator` verifying Keycloak-issued Client Credentials tokens via `jose`'s cached `createRemoteJWKSet` + `jwtVerify` and resolving them to an active `ServiceCredential`; `LegacyApiKeyCredentialAuthenticator` bridging the existing `ApiKeyService`/`Key` lookup into the same `AuthPrincipal` contract), a global default-deny `AuthGuard` registered via `APP_GUARD`, a `@Public()` decorator (health switched to it) and `@CurrentPrincipal()` param decorator, and a `LegacyBridgeOrganizationResolver` that idempotently seeds one real `Organization` row for legacy-key principals to attach to.

All 8 existing API-key-guarded controllers were left untouched per the locked-in decision above — they still authorize exactly as before; the new guard runs as an additional, earlier layer that currently only distinguishes "some valid credential" from "none/invalid," with authorization unchanged until plan 04. `/health` remains public. `OIDC_ISSUER_URL`/`OIDC_AUDIENCE` are now required environment variables (already set unconditionally in `docker/compose.yaml`, so no deployment-config change was needed).

Full acceptance criteria coverage: unit tests cover every rejection path (wrong issuer/audience/algorithm/signature/expiry/not-before/JWKS failure, unknown/disabled service credential, invalid/expired legacy key, missing credential, unsupported credential shape) as `UnauthorizedException`/401; `auth-guard-wiring.integration.spec.ts` proves the guard + `@Public()` + `@CurrentPrincipal()` wiring end-to-end over real HTTP via `supertest`.

A second pass exercised everything live against the real local stack (Postgres, Redis, Garage, Keycloak via `docker compose`, provisioned with `pnpm keycloak:provision`, API run on the host against their host-exposed ports): `jose-oidc-token-verifier.live-keycloak.integration.spec.ts` (previously skip-gated, no Keycloak available) now passes all 4 cases for real — valid token, wrong audience, tampered token, JWKS-unreachable. The full jest suite, including this live spec and the `TEST_POSTGRES_URL`-gated identity schema test, passes with 0 skipped (268/268 across all 56 suites, run with the two gates satisfied separately). Manual HTTP checks against the running API confirmed every locked-in behavior end-to-end, not just via mocks: `/health` public with no headers (`200`); no credential (`401`, rejected by the new global guard before any controller runs); the seeded admin legacy key (`201`, unchanged); a non-admin legacy key (`403`, unchanged); a JWT-shaped garbage bearer token (`401`, real `jose` verification against the live JWKS endpoint); and — after inserting a `ServiceCredential` row matching a real Keycloak-issued Client Credentials token's `iss`/`sub` — that real token against an untouched controller (`403`: passes the new guard, then correctly rejected by the still-independent legacy `ApiKeyGuard` downstream, exactly as the locked-in layering decision intends). Both Bruno collections (`m2m-oidc-authentication` new, `api-key-administration` regression) ran for real via `bru run --env local` and passed 8/8 requests with all assertions green.

Remaining work, explicitly deferred to later plans: no controller accepts an OIDC token for business operations yet (plan 04); no automated CI run of the live-Keycloak test (deferred, see Decision Log).

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
