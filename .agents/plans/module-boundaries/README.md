# Module Boundary Consistency Road Map

This road map makes `src/` follow one ownership model without changing HTTP behavior. Each plan follows
`.agents/PLANS.md`, represents exactly one pull request, and must preserve the existing routes, authorization,
serialization, persistence semantics, queue names, and provider behavior.

1. [Remove the inert migration placeholder](01-remove-inert-migration-placeholder.md)
2. [Make proxy persistence private to the proxy module](02-encapsulate-proxy-persistence.md)
3. [Relocate proxy into the standard module hierarchy](03-relocate-proxy-module.md)
4. [Relocate credits into the standard module hierarchy](04-relocate-credits-module.md)
5. [Relocate payments into the standard module hierarchy](05-relocate-payments-module.md)
6. [Relocate organization onboarding into the standard module hierarchy](06-relocate-organization-onboarding-module.md)
7. [Relocate service-client management into the standard module hierarchy](07-relocate-service-client-management-module.md)
8. [Relocate email verification into the standard module hierarchy](08-relocate-email-verification-module.md)
9. [Share the Keycloak Admin HTTP transport across feature modules](09-share-keycloak-admin-http-transport.md)

Shared decisions:

- `src/lead-email-finder-api` remains the executable NestJS host and composition root.
- Business capabilities live under `src/libs/modules/<feature>/src` and expose a deliberate public `index.ts`.
- Generic technical libraries remain directly under `src/libs`; feature-specific code does not move into
  `src/libs/common`.
- Cross-module consumers use package aliases and public contracts, never another module's TypeORM entity, DTO,
  repository, or deep relative path.
- Relocation PRs preserve externally observable behavior and do not redesign business logic.
- The empty `src/db` placeholder is removed while development uses TypeORM synchronization. No plan adds
  migrations, backfills, production rollout, or production recovery work.
- Existing behavioral ExecPlans that touch a module complete before its relocation so their paths and evidence do
  not become stale mid-implementation.
