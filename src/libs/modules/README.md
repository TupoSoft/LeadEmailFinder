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
