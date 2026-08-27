# Modules Directory

This directory is intended to house internal business modules. Each module should follow a consistent architectural structure to ensure separation of concerns and maintainability.

## Standard Folder Structure

Each module in this directory must include the following subdirectories:

- **api/**: Contains the external interface of the module (e.g., controllers and DTOs).
- **application/**: Contains business logic and use cases. This layer coordinates domain objects to perform tasks.
- **domain/**: Contains the core business logic, including entities, value objects, domain services, and repository interfaces.
- **infrastructure/**: Contains technical implementation details, such as database repositories, external API clients, and other framework-specific code.

## Guidelines

1. **Dependency Rule**: Dependencies should point inwards. Infrastructure and API layers can depend on Application and Domain, but the Domain layer should have no dependencies on outer layers.
2. **Business vs. Technical**: This directory is for business domain logic. Generic technical utilities should reside in the parent `libs/` directory (e.g., `libs/redis`, `libs/socket`).

## Module Documentation

Every module below has a `README.md`. Each one documents what the module owns and explicitly does not own, its
intentional public API, and the modules it depends on. It also covers any HTTP routes or BullMQ queues the
module exposes, the persistence it owns, the runtime configuration keys it reads (never values), and links to
focused tests and Bruno coverage.

A module's public API is exactly what its `src/index.ts` barrel exports. Importing a deeper path from another
module is an internal coupling, not a supported integration point, even where it currently exists in this
codebase; a module README calls that out explicitly rather than presenting it as a contract.

## Module Catalog

- [`auth`](auth/README.md) — default-deny credential authentication and permission-based authorization
- [`bff-session`](bff-session/README.md) — browser session login, callback, refresh, logout, and CSRF/Origin protection
- [`credits`](credits/README.md) — organization credit balance lookup and administration
- [`email-verification`](email-verification/README.md) — synchronous, async, and batch email verification
- [`identity`](identity/README.md) — organizations, memberships, credentials, credit ledger, and audit persistence
- [`organization-onboarding`](organization-onboarding/README.md) — organization creation and invitation-based membership management
- [`payments`](payments/README.md) — credit-pack checkout and payment webhook ingestion
- [`proxy`](proxy/README.md) — proxy registry, health-based selection, and leased allocation
- [`service-client-management`](service-client-management/README.md) — organization-owned M2M client life cycle
