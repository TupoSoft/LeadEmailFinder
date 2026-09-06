# Business Modules

This directory contains internal business modules. This guide is the canonical human-readable contract for their
structure, dependencies, public boundaries, documentation, tests, and architecture-debt ratchet. The executable
counterpart is `corepack pnpm architecture:check`.

## Module Structure

Every module uses a kebab-case directory name and contains a `README.md`, a `src/` directory, and `src/index.ts` as its
public barrel. A module creates only the architectural layers it needs; unused layers may be absent, and empty
placeholder directories are unnecessary.

The only production TypeScript files permitted directly below a module's `src/` directory are:

- `index.ts`, the public barrel; and
- An optional `<module-name>.module.ts`, whose name exactly matches the module directory and which acts as the Nest
  composition root.

All other production TypeScript files belong in one of these optional layers:

- `api/` contains controllers, DTOs, and other transport-facing request or response code.
- `application/` contains use cases, orchestration, application services, and ports required by those use cases.
- `domain/` contains entities, value objects, domain services, and business contracts.
- `infrastructure/` contains persistence implementations, provider clients, framework wiring, and other technical
  adapters.

A production TypeScript file is a `.ts` file that is not below `__tests__/` and whose name does not end in `.spec.ts`
or `.test.ts`. Production `*.controller.ts` and `*.dto.ts` files must be below `api/`.

## Layer Dependency Contract

The following matrix governs imports between production files in the same module. A check mark means that the source
layer may import the target layer.

| Source layer     | `api` | `application` | `domain` | `infrastructure` |
| ---------------- | :---: | :-----------: | :------: | :--------------: |
| `api`            |   ✓   |       ✓       |    ✓     |                  |
| `application`    |       |       ✓       |    ✓     |                  |
| `domain`         |       |               |    ✓     |                  |
| `infrastructure` |       |       ✓       |    ✓     |        ✓         |

Layer files must not import their module's root barrel. The optional matching root composition module may import and
wire every layer in its own module.

Application and domain code must remain independent of frameworks and technical implementations. They must not
import these packages or package prefixes, including their nested paths:

- `@automapper/`
- `@aws-sdk/`
- `@nestjs/`
- `@paddle/`
- `axios`
- `bullmq`
- `class-transformer`
- `class-validator`
- `express`
- `ioredis`
- `jose`
- `multer-s3`
- `nestjs-s3`
- `pg`
- `pino`
- `typeorm`

They also must not import the internal technical aliases rooted at:

- `@tuposoft/lead-email-finder/catch-all`
- `@tuposoft/lead-email-finder/config`
- `@tuposoft/lead-email-finder/dns`
- `@tuposoft/lead-email-finder/key`
- `@tuposoft/lead-email-finder/redis`
- `@tuposoft/lead-email-finder/socket`

Shared `common` contracts and bare public business-module barrels remain allowed. Technical integrations belong behind
small application or domain ports implemented by infrastructure adapters.

## Public Boundaries and Module Dependencies

A consumer outside a module may import that module only through its bare public alias:

    @tuposoft/lead-email-finder/modules/<module-name>

Deeper aliases and relative cross-module imports are unsupported, including in tests. A deep alias that targets the
importing file's own module is allowed. A module's `src/index.ts` barrel may export only relative paths that resolve
inside that module.

Every production dependency on another business module must appear under `Dependencies` in the consuming module's
README. Extra documented capability dependencies are allowed when a runtime contract is supplied through a shared
token rather than a direct import. The production module-dependency graph must remain acyclic.

## Test Treatment

Tests are exempt from production source placement, same-module layer direction, and technical-package restrictions so
integration tests can compose concrete layers when necessary. Cross-module public boundaries still apply: tests must
use another module's bare public barrel and must not deep-import its internals.

## Module Documentation

Every module README must contain these standard sections:

- `Responsibility`
- `Non-Responsibilities`
- `Public API`
- `Dependencies`
- `HTTP Surface`
- `Persistence`
- `Configuration`
- `Validation`

Add sections such as `Queues` or `S3 / Storage` when the module exposes those capabilities. The README must document
what the module owns and explicitly does not own, exactly what its `src/index.ts` exports, and its business-module
dependencies. It must also cover its routes and queues, persistence, the configuration keys it reads but never their
values, and links to focused tests and Bruno coverage. Existing deep imports are architecture debt, not supported
public API, and must be described as such rather than presented as contracts.

## Architecture Gate and Debt Ratchet

Run the read-only gate after changing a module or one of its consumers:

    corepack pnpm architecture:check

The gate compares the complete current violation set with
`scripts/architecture/module-architecture-baseline.json`. Baseline entries identify temporary existing debt; they are
not exceptions to this contract. Exact equality is required:

- A current violation without a matching baseline entry fails the check as `new debt`.
- A baseline entry without a matching current violation fails the check as `stale debt` and must be removed.

The ignored host file `src/metadata.ts` is Nest's generated Swagger aggregate. The gate excludes this exact build
artifact because its DTO imports describe documentation metadata. Handwritten host files and every other file named
`metadata.ts` remain subject to the public import boundaries.

Violation identities are stable, sorted, unique keys that exclude absolute paths and source positions. Diagnostics
report current line and column information separately. The baseline has a schema version and a `violations` array
sorted in lexicographical order; malformed, duplicate, or incorrectly ordered entries cause the check to fail.

When a remediation leaves only stale entries, inspect the change and run the shrink-only updater, then rerun the gate:

    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

After its initial bootstrap, the updater may remove resolved keys but must refuse new keys. CI also compares the
committed baseline with the pull request's base revision to prevent baseline growth. Do not add inline suppressions,
per-file exceptions, or a general baseline-growth switch. A legitimate contract change must update this guide, the
scanner, its focused tests, and the relevant ExecPlan together.

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
