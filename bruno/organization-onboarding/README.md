# Organization Onboarding Bruno Collection

This collection proves the HTTP-boundary behavior of ExecPlans `.agents/plans/auth/07-organization-onboarding.md` and `.agents/plans/auth/11-preserve-existing-user-credentials.md`: a platform admin creates an organization with a pending owner invitation, the invitation is accepted without any existing session (the server handles Keycloak user creation internally, so Bruno never has to talk to Keycloak directly), a duplicate acceptance of the same token is idempotent, a second invitation for the existing owner's email is rejected with `409`, an actor outside an organization cannot issue invitations into it, and an unknown token is rejected.

Unlike `bruno/bff-sessions`, invitation acceptance genuinely is HTTP-testable end to end here — it is a plain JSON POST, not a Keycloak-hosted login form. Bruno verifies the existing-user conflict status, while the original-password and no-realm-role guarantees are covered by `keycloak-organization-admin.live-keycloak.integration.spec.ts`, because the collection does not own a repeatable browser-password authentication fixture. Behavior that requires a genuine owner/admin _human browser session_ (role-hierarchy enforcement beyond the org-scoping check, final-owner protection on role change/removal, Keycloak MFA-role assignment on promotion) is covered instead by the Jest integration tests `src/libs/modules/organization-onboarding/src/organization-onboarding-http.integration.spec.ts` (fabricates arbitrary `AuthPrincipal`s directly) and that same live-Keycloak spec (skip-gated on `TEST_ORG_*`, drives the real Keycloak adapter).

Run it against the normal containerized stack. Requests 02/05 authenticate as the pre-provisioned `lef-development-service` M2M client via OAuth Client Credentials (`platform:admin`, granted by `pnpm keycloak:bootstrap-credential` — see `.agents/plans/auth/09-remove-api-key-authentication.md`), obtained by a collection-root `before-request` script and cached as `{{serviceClientToken}}`.

```shell
pnpm keycloak:bootstrap-credential
export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_ID=$(jq -r .clientId .dev/keycloak/service-client.json)
export KEYCLOAK_SERVICE_CLIENT_SECRET=$(jq -r .clientSecret .dev/keycloak/service-client.json)
cd bruno/organization-onboarding
npx @usebruno/cli run --env local --sandbox developer
```
