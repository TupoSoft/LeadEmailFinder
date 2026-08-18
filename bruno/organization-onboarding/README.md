# Organization Onboarding Bruno Collection

This collection proves the HTTP-boundary behavior of ExecPlan `.agents/plans/auth/07-organization-onboarding.md`: a platform admin creates an organization with a pending owner invitation, the invitation is accepted without any existing session (the server handles Keycloak user creation internally, so Bruno never has to talk to Keycloak directly), a duplicate acceptance of the same token is idempotent, an actor outside an organization cannot issue invitations into it, and an unknown token is rejected.

Unlike `bruno/bff-sessions`, invitation acceptance genuinely is HTTP-testable end to end here — it is a plain JSON POST, not a Keycloak-hosted login form. Behavior that requires a genuine owner/admin *human browser session* (role-hierarchy enforcement beyond the org-scoping check, final-owner protection on role change/removal, Keycloak MFA-role assignment on promotion) is covered instead by the Jest integration tests `src/lead-email-finder-api/src/organization-onboarding/organization-onboarding-http.integration.spec.ts` (fabricates arbitrary `AuthPrincipal`s directly) and `keycloak-organization-admin.live-keycloak.integration.spec.ts` (skip-gated on `TEST_ORG_*`, drives the real Keycloak adapter).

**Known limitation (same one already documented for `bruno/bff-sessions` and PR 3/PR 6's manual verification): the containerized `api` service cannot reach Keycloak's Admin REST API over `OIDC_ISSUER_URL=http://localhost:58080/...` from inside its own Docker network namespace** (no `network_mode: host` in `docker/compose.yaml`). Requests 01/02/05/06 don't touch Keycloak and pass against the container fine, but 03 (`accept`, which calls the Keycloak admin adapter) will fail with a 500 (`fetch failed: ECONNREFUSED`) if the API is running in the container. Run the API on the host instead for a full pass:

```shell
# from the repo root, with the Compose stack up except its own `api` service
docker compose -f docker/compose.yaml stop api
npx nest build -c .nest-cli.local.json -p tsconfig.local.json   # scratch config: outDir outside dist/, see PR 6's precedent
port=53000 NODE_ENV=development API_URL=http://localhost:53000 APP_BASE_URL=http://localhost:53000 \
  TYPEORM_SYNCHRONIZE=true OIDC_ISSUER_URL=http://localhost:58080/realms/lead-email-finder OIDC_AUDIENCE=lead-email-finder-api \
  BFF_CLIENT_ID=lef-web-bff BFF_CLIENT_SECRET=lef-web-bff-development-only-client-secret \
  SESSION_ENCRYPTION_KEY=<value from docker/secrets/session_encryption_key.txt> \
  KEYCLOAK_ORG_ADMIN_CLIENT_ID=lef-org-admin-service KEYCLOAK_ORG_ADMIN_CLIENT_SECRET=<value from docker/secrets/keycloak_org_admin_client_secret.txt> \
  ADMIN_API_KEY=<value from docker/secrets/admin_apikey.txt> \
  REDIS_URL=redis://localhost:56379 POSTGRES_URL=postgresql://postgres:postgres@localhost:55432/lef \
  S3_ACCESS_KEY_ID=minioadmin S3_SECRET_KEY=minioadmin-local S3_URL=http://localhost:59000 S3_REGION=us-east-1 S3_FORCE_PATH_STYLE=true S3_BUCKET=batch-email-verification \
  node .local-dist/main.js
```

Use `port=53000` (matching the Compose-published port) so it lines up with the `lef-web-bff` Keycloak client's already-registered `redirect_uri`. Then, with the host instance up:

```shell
cd bruno/organization-onboarding
ADMIN_API_KEY=<value from docker/secrets/admin_apikey.txt> npx @usebruno/cli run --env local
```

Restart the containerized `api` service afterward (`docker compose -f docker/compose.yaml start api`) to restore the normal stack.
