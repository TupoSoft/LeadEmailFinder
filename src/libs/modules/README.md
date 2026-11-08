# Business Modules

This is the architecture contract for business modules.

## Module Structure

Each kebab-case module contains `README.md`, `src/`, and `src/index.ts`. The last is its **public barrel**: the
supported exports other modules may use. Create only needed layers; omit empty placeholders.

Only `index.ts` and an optional matching `<module-name>.module.ts` may sit directly in `src/`. The latter is the
Nest **composition root**, where dependencies are constructed and connected. Other production TypeScript belongs in:

| Layer             | Owns                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `api/`            | Controllers, DTOs (request/response data shapes), and transport handling |
| `application/`    | Use cases, workflow coordination, and ports (required capabilities)      |
| `domain/`         | Business entities, values, rules, and contracts                          |
| `infrastructure/` | Adapters implementing ports for storage, providers, and frameworks       |

Production files are `.ts` files outside `__tests__/` without `.spec.ts` or `.test.ts` suffixes.
Production controllers and DTOs must be under `api/`.

## Layer Dependency Contract

A check mark permits the source layer to import the target:

| Source layer     | `api` | `application` | `domain` | `infrastructure` |
| ---------------- | :---: | :-----------: | :------: | :--------------: |
| `api`            |   ✓   |       ✓       |    ✓     |                  |
| `application`    |       |       ✓       |    ✓     |                  |
| `domain`         |       |               |    ✓     |                  |
| `infrastructure` |       |       ✓       |    ✓     |        ✓         |

Layer files cannot import their own root barrel. The matching root composition module may wire every internal layer.

Application/domain code cannot import these technical packages or their subpaths:
`@automapper/`, `@aws-sdk/`, `@nestjs/`, `@paddle/`, `axios`, `bullmq`, `class-transformer`, `class-validator`,
`express`, `ioredis`, `jose`, `multer-s3`, `nestjs-s3`, `pg`, `pino`, or `typeorm`.
They also cannot import technical aliases rooted at `@tuposoft/lead-email-finder/` with suffixes
`catch-all`, `config`, `dns`, `key`, `redis`, or `socket`.

Shared `common` contracts and bare business-module barrels are allowed. Put technical integrations behind ports
implemented by infrastructure adapters.

## Public Boundaries and Module Dependencies

External consumers, including tests, may import a business module only through:

```text
@tuposoft/lead-email-finder/modules/<module-name>
```

Cross-module relative imports and deeper aliases are unsupported. Deep aliases within the importing file's own
module are allowed. A barrel may export only relative paths inside its own module.

List every production business-module dependency under `Dependencies` in the consumer's README. Also document
capabilities supplied through shared injection tokens—runtime identifiers used to connect implementations—even
without direct imports. Dependencies must be **acyclic**: following imports must never lead back to the same module.

## Test Treatment

Tests may compose internal layers and technical packages without production placement/import restrictions.
Cross-module public-barrel boundaries still apply.

## Module Documentation

Every module README requires `Responsibility`, `Non-Responsibilities`, `Public API`, `Dependencies`, `HTTP Surface`,
`Persistence`, `Configuration`, and `Validation` sections. Add queue or storage sections when applicable.
Document ownership and exclusions, exact barrel exports, module dependencies, routes/queues, storage, setting names
without secrets, and focused tests/Bruno coverage. Bruno is the repository's HTTP request-collection test tool.
Existing unsupported deep imports are defects, not public contracts.

## Module Catalog

- [`auth`](auth/README.md): credential authentication and permission checks.
- [`bff-session`](bff-session/README.md): browser login, sessions, and cross-site request protection.
- [`credits`](credits/README.md): organization credit balances and administration.
- [`email-verification`](email-verification/README.md): direct, asynchronous, and batch verification.
- [`identity`](identity/README.md): organizations, memberships, credentials, credit ledger, and audit storage.
- [`organization-onboarding`](organization-onboarding/README.md): organization creation and invitations.
- [`payments`](payments/README.md): credit-pack checkout and payment notifications.
- [`proxy`](proxy/README.md): proxy registry, health selection, and temporary allocation.
- [`service-client-management`](service-client-management/README.md): organization-owned machine credentials.
