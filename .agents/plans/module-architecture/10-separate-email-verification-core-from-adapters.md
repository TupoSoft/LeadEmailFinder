# Separate the Email-Verification Core from Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make email, domain, and mailbox-verification rules runnable without Nest, TypeORM, DNS, HTTP, SMTP, proxy, catch-all,
or mapping frameworks. The module retains its current verification results, cached email/domain data, SMTP behavior,
and internal administration endpoints, but core use cases depend only on explicit ports whose implementations live
under infrastructure. A developer can observe the separation through pure unit tests, contract tests against fake
and real adapters, the unchanged email administration API, and the same deterministic SMTP fixture result. The
sync, deprecated-sync, async, and batch delivery workflows remain in their existing mixed folders for plan 11 to
layer separately.

## Progress

- [ ] (2026-08-29) Define pure email, domain, verification, and mailbox-probe models, policies, ports, and use cases.
- [ ] (2026-08-29) Move email/domain/verification TypeORM state behind private persistence adapters without schema changes.
- [ ] (2026-08-29) Move DNS, HTTP synonym discovery, SMTP, proxy, and catch-all implementations behind infrastructure ports.
- [ ] (2026-08-29) Move the existing email administration HTTP boundary into API and recompose the core module.
- [ ] (2026-08-29) Shrink the baseline and complete pure, adapter, PostgreSQL, HTTP, SMTP, and full validation.

## Plan dependencies

- `module-architecture/05`
- `module-architecture/08`

## Surprises & Discoveries

- The current folder named `domain/` is a feature slice for cached Internet domains, not the module's architectural
  domain layer. It contains a TypeORM entity, Nest module/service, `Automapper` profile/DTO, `HttpService`-based HTML
  crawler, and pure parsing helpers together.
- `email/` similarly combines a TypeORM entity, repository-backed service, `Automapper` profile, Nest controller,
  validation DTOs, and exceptions. The admin-only `/emails` API is excluded from Swagger but is externally
  observable and protected by `platform:admin`.
- `EmailVerificationService` is the central verification use case, yet it injects a TypeORM verification repository
  and common-library email/domain service interfaces directly. `EmailVerifier` then combines DNS, SMTP, catch-all,
  and provider implementations.
- The top-level public barrel already exports only `EmailVerificationModule`. Internal barrels expose entities and
  services, but no other module should depend on them after plan 03 removes deep-import support.

## Decision Log

- Decision: Use the architectural `src/domain/` for plain email address, cached domain, verification-result, and
  mailbox-probe models, value objects, policies, and errors. Rename the current cached-domain feature concepts where
  necessary so “domain” does not ambiguously mean both an Internet domain and an architecture layer.
  Rationale: A clear vocabulary prevents framework code from returning to the domain layer under a misleading folder
  name.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Put verification orchestration and email/domain administration use cases under `src/application/` and
  make them depend on narrow `EmailStore`, `DomainStore`, `VerificationStore`, mailbox probe, MX resolver, and domain
  synonym ports. Keep DI tokens and Nest binding in the composition module, not in the pure contracts.
  Rationale: Application services coordinate business work; storage and network mechanisms remain replaceable
  adapters.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Put TypeORM entities/mappers/stores under `src/infrastructure/persistence/typeorm/`; DNS resolution,
  remote-page retrieval/synonym discovery, SMTP clients, proxy-backed SMTP verification, and catch-all providers
  under purpose-named infrastructure directories.
  Rationale: These components depend on databases, networks, providers, or frameworks and therefore point inward
  through ports.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Keep deterministic HTML parsing pure only if it can accept text and URLs without importing Nest or an
  HTTP client; the remote fetch/retry/logging behavior remains an HTTP adapter.
  Rationale: Parsing supplied data is a deterministic transformation, while obtaining it is an external side effect.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Move the existing `/emails` controller and DTOs to `src/api/http/email-administration/`, preserving its
  platform-admin protection, excluded-from-Swagger status, routes, validation, serialization, and error mapping. Do
  not add a new public domain-administration endpoint.
  Rationale: The current email cache API needs a clear delivery home; the internal domain query/policy service does
  not justify inventing a new HTTP contract during an architecture refactor.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Leave sync, deprecated-sync, async, and batch controllers, DTOs, BullMQ services/processors, upload/result
  storage, and their legacy folder names to plan 11. Rewire them only enough to consume the new core use case.
  Rationale: Separating the verification engine and persistence/network adapters is independently reviewable; moving
  four delivery workflows in the same pull request would obscure behavior regressions.
  Date/Author: 2026-08-29, Codex planning.
- Decision: Preserve all four current tables and use TypeORM synchronization against disposable development data;
  add no migration, backfill, cache conversion, or production rollout step.
  Rationale: The plan changes code ownership and mapping, not stored meaning.
  Date/Author: 2026-08-29, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/email-verification/src/domain/` currently owns cached domain state and policy;
`email/` owns cached email CRUD; `sync-email-verification/` owns the verification entity and central
`EmailVerificationService`; and `email-verifier/` owns MX/catch-all/SMTP decisions. `email-verifier/smtp/` combines
the SMTP client factory, proxy allocation, protocol client, verifier, TypeORM `SmtpVerification` entity, and Nest
module. The technical `src/libs/dns` and `src/libs/catch-all` libraries provide concrete network implementations.

The central flow lowercases an address, checks whether its domain permits verification, and creates or updates the
cached email. It then performs the mailbox probe. Finally, it saves or updates the verification result and links the
email to that result.
That ordering, cache behavior, result fields, and error behavior are invariants. Existing synchronous, asynchronous,
and batch callers share the service. The `/emails` controller creates, lists, reads, and patches cached records.
Duplicate `POST` requests return `409`; a missing single-record `GET` returns `404`; and `PATCH` creates the cached
record when it does not already exist.

Plan `module-architecture/05` moves proxy contracts and tokens to the proxy module's public domain/application API;
SMTP must use only that bare public alias. Plan `module-architecture/08` seals identity infrastructure while
retaining the pure principal contract used at HTTP boundaries. The checker and shrink-only baseline from plan 01
enforce the move; plan 11 consumes the completed core to layer delivery workflows.

## Scope and Non-Goals

Create the email-verification domain and application core, and extract persistence and network ports. Relocate and
map the existing email, domain, verification, and SMTP entities behind TypeORM adapters. Relocate DNS, HTTP, SMTP,
proxy, and catch-all implementations; move the email administration controller/DTOs; recompose module wiring; add
focused port contracts and HTTP integration coverage; and update documentation.

Do not layer the sync, deprecated-sync, async, or batch delivery folders beyond the minimal imports needed to call
the core; plan 11 owns them. Do not change verification heuristics, catch-all provider ordering, proxy lease rules,
SMTP commands/timeouts, DNS caching, domain synonym semantics, email-cache behavior, routes, permissions, DTOs,
queues, S3 keys, credit charging, configuration keys, table schemas, or public barrel. Do not add migrations,
backfills, new endpoints, production rollout, or production recovery work.

## Plan of Work

Begin with characterization tests for the verification sequence, domain prohibition, cached-email upsert, prior
verification reuse, result persistence, MX/catch-all/SMTP outcomes, and adapter failures. Define pure domain records
that carry the fields currently exposed by `DomainResponseDto`, `EmailResponseDto`, and
`EmailVerificationResponseDto` without decorators or ORM identity. Define application ports around the operations
actually used; avoid generic repositories or a single manager interface.

Move the central verification orchestration into application and inject the domain policy/store, email store,
verification store, and mailbox-probe ports. Move email and domain administration/query use cases alongside it.
Application/domain code must not import `@nestjs/*`, `@nestjs/typeorm`, `typeorm`, `@automapper/*`,
`class-transformer`, `class-validator`, `@tuposoft/lead-email-finder/dns`,
`@tuposoft/lead-email-finder/catch-all`, the proxy implementation, Node DNS calls, HTTP clients, SMTP clients, BullMQ,
or S3.

Under `infrastructure/persistence/typeorm/`, keep the existing `emails`, `domains`, `email_verifications`, and
`smtp_verifications` entity schemas and implement the new store ports with explicit mappers. Preserve null/default
semantics, enum encodings, timestamps, indexes, last-verification linking, batch IDs, and update-versus-insert
behavior. Add adapter contract tests and a real-PostgreSQL round trip that proves mapping and schema compatibility.

Under infrastructure network directories, wrap the DNS service, HTTP page retrieval, HTML synonym extraction,
catch-all provider set, proxy contract, SMTP factory/client, and SMTP verifier behind the new ports. Preserve optional
`CATCH_ALL_HTTP_PROXY_URL`, default `SMTP_PORT`, provider activation, lease release on success/failure/timeout, and
bounded SMTP connection behavior. Compose these adapters in internal Nest modules without exporting them from the
top-level barrel.

Move the existing email administration HTTP controller, DTOs, serialization, and validation under `api/http/` and
map application errors to the same HTTP responses. Extend its controller tests and add a focused
`email-administration-http.integration.spec.ts` using the real Nest module and TypeORM adapter wiring. Override only
the authentication boundary with unauthenticated, unauthorized, and platform-admin principals. Against disposable
PostgreSQL, prove unique-record creation, list/read/update success, duplicate `POST` returning `409`, missing `GET`
returning `404`, missing `PATCH` creating a record, and validation behavior. Do not add a domain endpoint or a new
Bruno collection for this internal refactor.

Rewire the four delivery workflows to the core application token without relocating them. Narrow internal barrels,
keep the top-level `index.ts` module-only, update the email-verification README, and run the shrink-only baseline
update after all core violations are gone. Baseline keys for delivery folders intentionally remain until plan 11.

## Interfaces and Dependencies

The public module barrel remains exactly `EmailVerificationModule`. Existing HTTP, queue, result, and configuration
interfaces remain unchanged. New interfaces are internal, purpose-specific application ports for email records,
cached domains/policy, verification results, mailbox probing, MX resolution, and domain synonym lookup. Port values
are domain records, not TypeORM entities or framework DTOs.

The infrastructure layer depends on TypeORM, Node/Nest DNS and HTTP facilities, the technical catch-all providers,
SMTP implementation, and the public proxy contracts delivered by plan 05. The application/domain layers depend on
none of them. Plan 08 seals the identity boundary used by the retained async and batch delivery workflows. Plan 11
depends on the new core use case and completes delivery layering.

## Acceptance Criteria

- Email-verification domain and application files contain no Nest, TypeORM, `Automapper`, DTO validation/serialization,
  BullMQ, S3, DNS-client, HTTP-client, SMTP-client, catch-all-provider, or proxy-adapter import.
- Pure unit tests execute domain policy and central verification orchestration with in-memory port fakes and no Nest
  testing module, database, network, queue, or environment configuration.
- TypeORM entities and mappers are private to `infrastructure/persistence/typeorm`; table names, columns, indexes,
  enum/null/default behavior, timestamps, and record linking are unchanged.
- DNS, HTTP synonym lookup, catch-all, proxy leasing, SMTP client creation, protocol execution, timeouts, and lease
  release implement explicit ports and satisfy focused adapter contracts.
- The same input and adapter outcomes produce the same email-verification response, domain rejection, email-cache
  state, stored verification row, SMTP reason/source fields, and error behavior.
- `POST /emails`, `GET /emails`, `GET /emails/:email`, and `PATCH /emails/:email` retain platform-admin protection,
  validation, response schemas, and Swagger exclusion behavior. Duplicate `POST` remains `409`, missing `GET`
  remains `404`, and `PATCH` continues to upsert a missing record.
- No new domain-administration endpoint exists, and the top-level public barrel still exports only
  `EmailVerificationModule`.
- Sync, deprecated-sync, async, and batch behavior remains operational but their remaining layer violations stay
  explicitly assigned to plan 11 rather than being renamed in the baseline.
- Focused email-administration controller and HTTP integration tests cover success plus material auth, duplicate,
  validation, and missing-record rejection paths through the recomposed Nest wiring.
- The SMTP development collection still proves deterministic DNS, proxy, SMTP, catch-all, and deprecated-route credit
  behavior.
- The shrink-only baseline update removes only the core/adapter violations fixed here, adds no key, and
  `corepack pnpm architecture:check` passes.
- Focused, PostgreSQL, full, build, documentation, Bruno, runtime, and diff checks pass without a migration.

## Validation

Run pure and adapter-focused suites after moving tests beside their owners:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/application src/libs/modules/email-verification/src/infrastructure src/libs/modules/email-verification/src/api/http/email-administration --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_identity_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-verification-persistence.integration.spec.ts --runInBand
    TEST_EMAIL_ADMIN_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_email_admin_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- email-administration-http.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

The implementation must add the named persistence integration spec if no equivalent real-PostgreSQL test exists.
Inspect the baseline diff and keep plan-11 delivery entries stable; do not accept path-renamed equivalents.

Before using the shared Docker project, inspect the `lef-api-1` Compose working-directory label and stop if another
checkout owns it. For an owned disposable stack, run `pnpm dev:reset -- --confirm-project=LEF`, then start the SMTP
overlay:

    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'

The dedicated email-administration command above must run rather than skip and must use its disposable database.
Then run the exact container-network command in `bruno/smtp-dev/README.md`, including `--network lef_default`, the
container-internal Keycloak issuer, `--sandbox developer`, and `baseUrl=http://api:3000`. The SMTP collection must
pass every request, including proxy drain/restore and the deprecated route's `402` and one-credit cases.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/10-separate-email-verification-core-from-adapters.md
    git diff --check

Bruno requests are not added or updated because this is an internal refactor with no HTTP contract change. Rerun
the existing SMTP collection because the SMTP/proxy adapter wiring moves.

## Idempotence and Recovery

Create ports and characterization tests before moving adapters, then rewire one side effect at a time. A second move
or baseline update must be a no-op. If interrupted, use `git status`, the architecture report, and focused tests to
locate incomplete adapters; recover by completing or reverting the narrow move while preserving unrelated user
changes, not by introducing deep imports or baseline entries.

The email/domain/verification tables remain schema-compatible. If disposable data must be reset, confirm Compose
ownership and use `pnpm dev:reset -- --confirm-project=LEF`; no migration rollback exists. SMTP fixture recovery uses
the documented proxy restore and DNS-cache reset services. A failed email-administration integration run uses a new
run-unique email after reset rather than mutating or deleting unrelated records.

## Artifacts and Notes

Record the final layer/import map, port list, TypeORM mapping proof, removed and deliberately retained baseline keys,
pure/adapter/PostgreSQL test totals, administration HTTP results, SMTP Bruno totals, health result, and full
validation. Do not
record access tokens, service-client secrets, SMTP credentials, raw email addresses beyond local fixture values, or
customer data.

## Plan readiness

Ready to implement.
