# Keycloak authentication roadmap

This roadmap replaces raw API-key authentication with self-hosted Keycloak for browser users and machine-to-machine clients. It is development-only: all current PostgreSQL, Redis, BullMQ, S3, credit, API-key, and future Keycloak data is disposable. TypeORM synchronization and deterministic reset/reseed workflows replace migrations until a production environment exists.

Implement the plans in order. Each plan follows `.agents/PLANS.md` and represents one pull request with its own acceptance criteria and validation. The identity foundation is already complete in PR #312; new implementation starts with plan 02.

1. [Add organization and identity contracts](01-organization-identity-contracts.md) — completed by PR #312
2. [Add disposable local Keycloak infrastructure](02-local-keycloak-infrastructure.md)
3. [Authenticate M2M clients with OIDC](03-oidc-m2m-authentication.md)
4. [Authorize roles and product permissions](04-role-permission-authorization.md)
5. [Own credits and verification resources by organization](05-organization-owned-resources.md)
6. [Add Redis-backed browser sessions](06-bff-sessions.md)
7. [Add invite-only organization onboarding](07-organization-onboarding.md)
8. [Add self-service M2M client management](08-m2m-client-management.md)
9. [Remove API-key authentication](09-remove-api-key-authentication.md)
10. [Add the unified development reset workflow](10-development-reset-workflow.md)

Shared decisions:

- Keycloak is the identity provider; LeadEmailFinder owns product authorization, organization-resource ownership, and credits.
- Browser tokens remain server-side behind a backend-for-frontend session.
- M2M clients use OAuth Client Credentials.
- Organizations are invite-only with `owner`, `admin`, and `member` roles plus the internal `platform_admin` role.
- Existing API keys are only an implementation bridge and are removed immediately after the new development flows are complete.
- No plan may add database migrations or production deployment work.
