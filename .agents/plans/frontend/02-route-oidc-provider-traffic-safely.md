# Route OIDC Provider Traffic Safely

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the existing browser session flow work in the real Docker topology without weakening issuer validation. A
developer can start the local stack, send the browser to the public Keycloak URL, and let the containerized API
exchange, refresh, and revoke tokens through the internal Keycloak address. Tokens still advertise the public issuer,
and no container-only hostname appears in browser redirects or identity claims.

## Progress

- [ ] (2026-08-31) Add a validated optional OIDC back-channel URL with a compatibility fallback.
- [ ] (2026-08-31) Route token exchange, refresh, and provider logout through the internal address only.
- [ ] (2026-08-31) Give BFF ID-token verification an internal JWKS retrieval address.
- [ ] (2026-08-31) Configure the public Keycloak hostname and dynamic back channel in local Compose.
- [ ] (2026-08-31) Remove development-overlay issuer workarounds and rerun their token flows.
- [ ] (2026-08-31) Update BFF, environment, Docker, and Bruno documentation.
- [ ] (2026-08-31) Validate focused configuration, live Keycloak, architecture, and repository behavior.

## Plan dependencies

- `auth/06`
- `auth/10`

## Surprises & Discoveries

- `OIDC_ISSUER_URL` currently serves two incompatible purposes. It is the public issuer and browser authorization
  base, but `KeycloakOAuthClient` also posts server-side token, refresh, and logout requests to it.
- Compose configures the public issuer as `http://localhost:58080/realms/lead-email-finder`, which is correct for the
  browser and token `iss` claim but unreachable from the API container.
- `OIDC_JWKS_URI` already separates an internal retrieval address from public issuer validation, so the project has
  an established precedent for safe network routing without identity drift.

## Decision Log

- Decision: Add optional `OIDC_BACKCHANNEL_URL` and default it to `OIDC_ISSUER_URL` when absent.
  Rationale: Existing host-run and single-origin environments remain compatible, while Compose can use its internal
  service address explicitly.
  Date/Author: 2026-08-31, project planning.
- Decision: Use the public issuer for authorization URL construction, identity, nonce, and issuer validation; use the
  back-channel URL only for token exchange, refresh, and provider logout HTTP calls.
  Rationale: Network reachability must not alter browser-visible URLs or the identity that signed tokens assert.
  Date/Author: 2026-08-31, project planning.
- Decision: Inject `OIDC_JWKS_URI` into the BFF ID-token verifier as its retrieval URL while continuing to validate
  the public `OIDC_ISSUER_URL` claim.
  Rationale: Bearer verification already has this separation, but the BFF verifier currently derives JWKS from the
  public issuer and cannot reach `localhost` from its container.
  Date/Author: 2026-08-31, project planning.
- Decision: Configure local Keycloak with `KC_HOSTNAME=http://localhost:58080` and
  `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`.
  Rationale: Keycloak must advertise one stable public origin while accepting trusted internal protocol requests.
  Date/Author: 2026-08-31, project planning.
- Decision: Add one repository `test:bff-live` command that provisions a dedicated database ending in `_test`,
  supplies every required `TEST_BFF_*` variable from ignored disposable-stack metadata, and fails when the live suite
  is skipped or runs zero tests.
  Rationale: Calling the skip-gated Jest file without its environment exits successfully while validating no live
  provider behavior.
  Date/Author: 2026-08-31, project planning.
- Decision: Keep current-account DTOs, browser capabilities, authentication-error UX, and React work out of this pull
  request.
  Rationale: Provider routing has one observable runtime outcome and can be reviewed independently from the browser
  account contract in `frontend/03`.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The BFF session module under `src/libs/modules/bff-session/` owns Authorization Code with PKCE, encrypted Redis
sessions, access-token refresh, and provider logout. `BffSessionConfiguration` currently exposes a single issuer URL.
`KeycloakOAuthClient` builds both the browser authorization URL and all server-to-server protocol URLs from it.

`docker/compose.yaml` supplies the public host URL. `docker/infra.yaml` runs Keycloak at `keycloak:8080` inside the
Compose network and currently has no hostname-v2 settings. Development overlays may override the issuer to make
container-to-container calls succeed, but tokens then carry an issuer that differs from the browser and host
configuration. The correct fix is separate routing, not accepting two issuers.

Bearer validation already uses the public `OIDC_ISSUER_URL` for the `iss` check and retrieves keys through the
separately configurable internal `OIDC_JWKS_URI`. BFF ID-token verification does not yet consume that URI and instead
derives a JWKS address from its issuer. This plan applies the same trust/reachability split to both verifiers.

Before changing the BFF business module, implementation must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and `src/libs/modules/bff-session/README.md` and keep the module documentation current.

## Scope and Non-Goals

This pull request changes BFF configuration, provider protocol and JWKS URL selection, local Keycloak hostname settings,
affected development overlays, focused tests, environment documentation, and the nearest BFF Bruno workflow. It
does not change public auth paths, cookie names or attributes, session payloads, CSRF behavior, permissions, account
DTOs, authentication-error mapping, production identity configuration, or any database schema.

It does not expose internal hostnames to the browser, accept an internal issuer claim, add CORS, add a second
identity provider, or make production deployment decisions. No React or generated-client work belongs here.

## Plan of Work

Extend `BffSessionConfiguration` and its environment factory with optional URL-valued
`OIDC_BACKCHANNEL_URL`. Normalize the issuer and back-channel realm base URLs once, reject malformed or incompatible
values at startup, and use the normalized public issuer as the fallback. Do not log query data, credentials, or
tokens while reporting configuration failures.

Refactor `KeycloakOAuthClient` so authorization requests always use `OIDC_ISSUER_URL`. Token exchange, refresh, and
provider logout use `OIDC_BACKCHANNEL_URL`. Extend `BffSessionConfiguration` with the validated JWKS URI already
provided as `OIDC_JWKS_URI`, and inject it into `JoseIdTokenVerifier` for key retrieval. ID-token issuer validation,
nonce, audience, signature, and expiry continue to use the public issuer. When the JWKS variable is absent, derive
the existing public-issuer endpoint for host-run compatibility. Add focused tests for configured and fallback URLs,
trailing slashes, malformed values, every selected endpoint, internal JWKS retrieval, and rejection of a token that
claims the internal issuer.

Set the Compose API back-channel URL to `http://keycloak:8080/realms/lead-email-finder`. Configure the public Keycloak
hostname and dynamic back channel in `docker/infra.yaml`; keep realm and client redirect URIs public. Remove overlay
issuer overrides that existed only to make internal calls reachable, including the SMTP development overlay. Those
overlays must use the public issuer for validation and the internal back channel and JWKS addresses for network
access.

Update provisioning and smoke assertions only where necessary to prove the advertised issuer, browser redirect,
token endpoint selection, refresh, and logout behavior. Extend the closest BFF Bruno collection if its live flow
depends on the corrected topology. Keep fixture tokens and cookies in environment variables and out of committed
files and captured artifacts.

Pin `@usebruno/cli` as a root development dependency and add a repository-owned
`scripts/bruno/run-collection.mjs` launcher. It accepts only registered collection names, always selects the
developer sandbox when a collection uses token-minting scripts, and loads required ignored development metadata
without echoing secrets. It chooses the public or Compose-internal issuer/base URL explicitly and fails on missing
prerequisites, zero executed requests/tests, or a skipped collection. Register `corepack pnpm bruno:bff-sessions` and the
Compose-network `corepack pnpm bruno:smtp-dev` command here. Later
feature plans extend the registry with their collection-specific credential bootstrap rather than relying on a
globally installed `bru`, ambient exports, or unpinned `npx` downloads.

Create the reusable `test:bff-live` runner here. It must preflight all seven `TEST_BFF_*` inputs, refuse a PostgreSQL
database whose name does not end in `_test`, and create/reset only a dedicated database in the confirmed disposable
Compose project. It runs `bff-session-flow.live-keycloak.integration.spec.ts` and fails if Jest reports the suite
skipped or zero executed tests. Load client/admin secrets from ignored development metadata without echoing them. Later plans
reuse this command rather than invoking the skip-gated spec directly.

## Interfaces and Dependencies

Add this optional environment variable:

    OIDC_BACKCHANNEL_URL=http://keycloak:8080/realms/lead-email-finder
    OIDC_JWKS_URI=http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs

`OIDC_ISSUER_URL` remains required and public. Omitting the new back-channel variable preserves the current
single-address behavior. `OIDC_JWKS_URI` is the independently configurable retrieval address for both bearer and BFF
ID-token verification and falls back to the public issuer's certs endpoint when absent. Token responses and ID tokens
obtained through internal routes must still carry the configured public issuer.

This plan depends on the BFF session implementation in `auth/06` and the Keycloak version already pinned by local
infrastructure. It adds pinned development-only `@usebruno/cli` and the secret-safe collection launcher, but no new
runtime service, persistence entity, browser API, or external dependency.

## Acceptance Criteria

- A browser login redirects to the public `localhost:58080` Keycloak origin, while the containerized API completes
  exchange, refresh, and logout calls through `keycloak:8080`.
- Tokens obtained through the internal route carry the public issuer and pass nonce, issuer, audience, signature, and
  expiry validation. A token that claims the internal URL is rejected.
- The containerized BFF retrieves ID-token keys through the internal `OIDC_JWKS_URI`; blocking access to the public
  `localhost` issuer does not break verification, and the retrieved key never changes issuer validation.
- Omitting `OIDC_BACKCHANNEL_URL` uses the public issuer for all provider calls. A malformed configured value prevents
  the service from starting and emits safe diagnostics.
- Local Keycloak advertises only the public hostname. No internal hostname appears in browser redirects, cookies,
  account data, or token claims.
- The SMTP and other affected development overlays no longer need an internal issuer override and their token and
  Bruno flows still pass.
- Focused tests, live-Keycloak coverage, relevant Bruno workflows, module documentation, architecture checks, and
  repository validation pass in one pull request.
- The pinned `bruno:bff-sessions` and Compose-network `bruno:smtp-dev` commands run without global CLI state or
  ambient secret exports, report nonzero execution, and never print loaded credentials.

## Validation

Run the focused BFF configuration and OAuth-client tests, then the repository checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- bff-session-configuration.spec.ts keycloak-oauth-client.spec.ts jose-id-token-verifier.spec.ts --runInBand
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm architecture:check

After confirming that the Compose project belongs to this checkout, reset the disposable stack and run the live
provider flow:

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm keycloak:smoke
    corepack pnpm test:bff-live
    corepack pnpm bruno:bff-sessions
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    corepack pnpm bruno:smtp-dev

Assert the live runner reports nonzero executed tests. Inspect redacted API and Keycloak logs to prove public browser routing, internal protocol routing, and the public
token issuer. Rerun each overlay whose issuer workaround was removed. Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/bff-session/README.md bruno/bff-sessions/README.md .agents/plans/frontend/02-route-oidc-provider-traffic-safely.md
    git diff --check

Record exact nonzero live test counts, skipped external gates, Compose ownership, and Bruno results. Host-only mocks do not satisfy the
container routing acceptance criteria.

## Idempotence and Recovery

Configuration and tests are safe to repeat. The optional variable has a compatibility fallback, and no persistent
schema changes. Live tests use disposable sessions and clients and must clean up only resources owned by this
checkout. If startup fails, retain redacted service logs, stop only the confirmed Compose project, repair the
configuration, and rerun.

If dynamic back-channel routing is unsupported by the pinned Keycloak image, stop implementation and record the
service-start evidence. Do not weaken issuer validation or replace public browser redirects with an internal
hostname.

## Artifacts and Notes

Record the normalized public and internal realm bases, redacted redirect host, token issuer value, selected protocol
destinations, focused test counts, overlay results, and Bruno summary. Never record authorization codes, cookies,
CSRF values, client secrets, access tokens, refresh tokens, or provider payloads.

## Plan readiness

The public/back-channel boundary, configuration fallback, Keycloak topology, overlay cleanup, validation, and
one-pull-request scope are decision-complete.

Ready to implement.
