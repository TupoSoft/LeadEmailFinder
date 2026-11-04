# Require Secure Storage Transport and Encrypted Customer Objects

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Reject production startup unless PostgreSQL, Redis, and S3 use authenticated encrypted transport. Require every S3
adapter writing customer or individual data to consume one shared, pure object-write security contract.
This pull request applies the contract to email-verification CSV inputs and results. The controller-privacy export
adapter in plan 13 must consume the same token rather than copy or weaken its settings.

A developer can observe insecure production settings being rejected, both batch writers emitting exact SSE-KMS and
`no-store` parameters, and the development-only Compose stack continuing to use its local plaintext fixtures.

## Progress

- [x] (2026-08-31 19:45 +02:00) Extracted strict PostgreSQL, Redis, and S3 configuration into focused factories.
- [x] (2026-08-31 19:45 +02:00) Rejected insecure production transport with stable, value-redacted configuration errors.
- [x] (2026-08-31 19:45 +02:00) Added the common `CustomerObjectWriteSecurity` value/token and bound one frozen
      value in the API composition root.
- [x] (2026-08-31 19:45 +02:00) Injected the shared token into both email batch-object writers and covered their
      exact production and development AWS mappings with one reusable contract.
- [x] (2026-08-31 20:00 +02:00) Proved production rejection, local-development compatibility, packaging, root wiring,
      and full repository validation.

## Plan dependencies

- `privacy-compliance/01`

## Surprises & Discoveries

- The common library had no README even though this plan's validation and documentation scope named one. This change
  creates `src/libs/common/README.md` to document the new contract and its testing-only adapter suite.
- Ioredis keeps one `redis-sentinel://` configuration syntax. Authenticated production transport is expressed through
  `enableTLSForSentinelMode`, peer-verified `tls` options for the selected master, and matching `sentinelTLS` options
  for discovery rather than through a second URL scheme.
- Optional values supported through `@WithFileVars()` need an explicit `@IsFileVar` condition when the canonical
  variable is not otherwise required. The security variables therefore validate their `/run/secrets/` paths
  explicitly and reject simultaneous direct and `_FILE` sources before loading either value.
- Privacy plan 04 landed while this pull request was under review and changed the same batch processor, specification,
  and module README. The conflict resolution preserved its organization-scoped query and CSV behavior alongside this
  plan's injected object-write security contract. Its direct processor integration fixture also needed the new
  development security argument.

## Decision Log

- Decision: Enforce secure transport and object encryption whenever `NODE_ENV=production`. Preserve plaintext
  PostgreSQL, Redis, and Garage only for the explicit local development environment.
  Rationale: The repository has no production environment, and its deterministic fixtures do not provide trusted
  certificates or KMS.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Production PostgreSQL uses peer-verified TLS with optional trusted CA contents; standalone Redis requires
  `rediss://`; Redis Sentinel uses TLS for discovery and the selected master; S3 requires an `https://` endpoint.
  Rationale: Encryption without peer verification is not an authenticated transport control.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Production object writes require `S3_SERVER_SIDE_ENCRYPTION=aws:kms`, a nonempty `S3_KMS_KEY_ID`, and
  `CacheControl: no-store` on every request.
  Rationale: Bucket defaults are defense in depth; application writes must state and test their security intent.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Place the framework-free `CustomerObjectWriteSecurity` type and
  `CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN` under
  `src/libs/common/src/interfaces/customer-object-storage/`. Bind one immutable value from validated configuration in
  `src/lead-email-finder-api/src/customer-object-write-security.module.ts`, a global composition-root module.
  Rationale: Email verification does not own a contract also required by controller privacy. Common may expose a pure
  value/token, while Nest and configuration stay in the outer composition root.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Business modules import only the type/token from the common barrel and inject it into infrastructure
  adapters. They do not import the API composition module, `ConfigService` in application/domain code, or another
  module's storage adapter.
  Rationale: This preserves the canonical module direction and keeps provider-specific mapping at infrastructure
  edges.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: This pull request wires only the two existing email batch writers. Plan 13 must independently register its
  export adapter against the same token and shared contract tests.
  Rationale: Defining the shared boundary now prevents drift without inventing the later rights workflow here.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Configuration failures identify only the offending key and stable reason code.
  Rationale: Fail-closed startup must not echo a URL, host, username, password, CA, KMS identifier, or credential.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Format new configuration failures as `<KEY>: <stable-kebab-reason>` and retain the existing Sentinel URL
  syntax while setting all required ioredis TLS controls explicitly.
  Rationale: One redacted format is testable across factories, and preserving the Sentinel syntax avoids an unrelated
  configuration migration without weakening discovery or selected-master transport.
  Date/Author: 2026-08-31, implementation.
- Decision: Treat the direct and `_FILE` forms of each optional security secret as mutually exclusive configuration
  sources.
  Rationale: Rejecting ambiguity keeps application initialization deterministic and prevents an inline value from
  silently shadowing a mounted secret.
  Date/Author: 2026-08-31, implementation.
- Decision: Supply the AWS SDK's Node HTTP-handler constructor options with `httpsAgent.rejectUnauthorized=true` in
  production.
  Rationale: An HTTPS scheme is not authenticated transport if a process-wide Node setting disables certificate
  verification. Explicit agent options override that setting while retaining the configured default trust roots.
  Date/Author: 2026-08-31, final security audit.

## Outcomes & Retrospective

Completed. The application now refuses to start in production unless PostgreSQL, Redis, and S3 meet the authenticated
transport requirements, and S3 also has an explicit SSE-KMS algorithm and key. Development keeps the existing
disposable PostgreSQL, Redis, and Garage behavior.

One framework-free common contract now supplies a frozen security value to the API composition root. Both email batch
writers inject the token, always write `no-store`, and add the exact SSE-KMS request fields in production. A reusable
contract suite covers both adapters and is available to plan 13.

After merging the latest `master`, the focused suite passed 8 suites and 119 tests; the full suite passed 165 suites
and 1,280 tests, with the repository's 10 suites and 52 tests intentionally skipped. Typecheck, compilation, the
production Docker build, and the module architecture gate passed. Lint passed with zero errors and one preexisting
warning in `src/libs/config/src/load-secrets.spec.ts`.

No HTTP contract changed, so Bruno coverage is not applicable. The active Lead Email Finder Compose stack belonged to
the unrelated main checkout and was deliberately neither recreated nor used to claim worktree runtime coverage. No
migration was added.

The final SOLID review found no new material violation. The input mapping remains in the small multer-S3 adapter. The
result mapping remains in the preexisting `BatchEmailVerificationProcessor`, which already coordinates queue state,
database streaming, CSV generation, and S3 upload; extracting a dedicated result writer is preexisting architectural
debt outside this transport-policy pull request. The new mapping is a pure local function covered by the reusable
contract, which limits further responsibility growth and prevents policy drift. The S3 factory and common value factory
both validate the KMS pair deliberately: the former protects client initialization, and the latter protects the
injected write-policy boundary.

## Context and Orientation

At plan start, `src/lead-email-finder-api/src/lead-email-finder-api.module.ts` constructed TypeORM options inline,
`src/libs/redis/src/parse-connection-string-options.factory.ts` accepted plaintext standalone and Sentinel
connections, and `src/lead-email-finder-api/src/s3-module-options-factory-impl.ts` accepted the configured endpoint
without a production transport check. The implementation now delegates these decisions to focused factories.

Email batch input writes use
`src/libs/modules/email-verification/src/batch-email-verification/multer-options-factory-impl.service.ts`, and
`BatchEmailVerificationProcessor` creates result uploads. At plan start neither requested server-side encryption;
both now inject the common write-security token. The common library exposes framework-free interfaces and symbol
tokens, including proxy tokens, and is an allowed cross-module dependency. The API project remains the outer Nest
composition root.

The local Compose stack deliberately uses plaintext services on its private development network. That is a development
exception, not proof of production security.

## Scope and Non-Goals

Add production transport validation for PostgreSQL, standalone/Sentinel Redis, and S3. Extract testable configuration
factories. Add the shared common object-write value/token and API-root binding. Apply it to email batch input and result
writes. Add contract tests, documentation, and packaging/runtime coverage.

Do not provision certificates or KMS keys, configure a cloud bucket, or attest encryption for disks, logs, or backup
copies. Do not add mutual TLS, rotate credentials, alter object keys or HTTP schemas, add migrations, create a
production rollout, or implement a controller-privacy export. Plan 11 owns managed processor-copy evidence for logs and backup copies; plan 13 owns export authorization,
content, one-time download, expiry, and deletion.

## Plan of Work

Extract `PostgresModuleOptionsFactoryImpl` under `src/lead-email-finder-api/src/` and replace the inline TypeORM
factory. In production, supply `ssl: { rejectUnauthorized: true, ca? }` from optional file-secret contents and reject
connection-string parameters that could override the explicit SSL object. Preserve current development synchronization.

Extend `EnvironmentVariablesDto` and focused tests for `POSTGRES_TLS_CA`, `REDIS_TLS_CA`,
`S3_SERVER_SIDE_ENCRYPTION`, and `S3_KMS_KEY_ID`. Make the Redis parser require `rediss://` in production standalone
mode and explicit peer-verified TLS for Sentinel discovery and master traffic. Make the S3 options factory reject
non-HTTPS production endpoints and require the KMS pair. Use the `Node.js` runtime's configured default trust roots or
`NODE_EXTRA_CA_CERTS`; never set an agent that disables verification.

Add these common files and exports:

    src/libs/common/src/interfaces/customer-object-storage/customer-object-write-security.ts
    src/libs/common/src/interfaces/customer-object-storage/customer-object-write-security.tokens.ts
    src/libs/common/src/interfaces/customer-object-storage/index.ts

Export them through the existing interface/common barrels. The files contain only the discriminated value type and
symbol token; they import no Nest, AWS, configuration, or business module.

Add `src/lead-email-finder-api/src/customer-object-write-security.module.ts` and
`customer-object-write-security.factory.ts`. The global module imports `ConfigModule`, provides the common token from
validated `EnvironmentVariablesDto` values, exports it, and is imported once by `LeadEmailFinderApiModule`. It creates
one frozen value. Business modules see the token through Nest global composition but never import an API source path.
Every isolated module test explicitly supplies a fake common-token value.

Inject the token into `MulterOptionsFactoryImpl` and the batch result upload adapter. Map production mode exactly to
`ServerSideEncryption: 'aws:kms'`, `SSEKMSKeyId`, and `CacheControl: 'no-store'`. Development omits KMS fields for
Garage but still sends `CacheControl: 'no-store'`. Neither adapter accepts a local override or reads `NODE_ENV`.

Add a shared contract-test helper under common test support or the API test tree that takes an adapter write spy and
asserts the exact production mapping. Run it for both email adapters. Plan 13 must reuse this helper for its export
adapter. Update the root/common/email-verification README files and Docker production packaging as needed.

## Interfaces and Dependencies

The common contract is:

    type CustomerObjectWriteSecurity =
        | {
              mode: 'production-kms'
              requireAuthenticatedHttps: true
              serverSideEncryption: 'aws:kms'
              kmsKeyId: string
              cacheControl: 'no-store'
          }
        | {
              mode: 'development-local'
              cacheControl: 'no-store'
          }

    const CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN: unique symbol

The API factory accepts a narrow validated configuration value and returns a frozen
`CustomerObjectWriteSecurity`. AWS infrastructure adapters map it to provider request fields. No public route, DTO,
queue shape, database table, S3 key, result media type, or business-module dependency changes.

Plan 01 supplies the processing/storage inventory. Plan 13 consumes the common token for controller-data exports. The
implementation uses existing TypeORM, ioredis, AWS SDK, Nest configuration, and multer-S3 packages.

## Acceptance Criteria

- Production PostgreSQL uses peer-verified TLS and rejects connection parameters that weaken or replace it.
- Production standalone Redis rejects `redis://`, and Sentinel verifies both discovery and master peers.
- Production S3 rejects HTTP and missing/non-KMS object security configuration.
- The object-write type/token is framework-free common code; the validated value is bound only in the API composition
  root; no business module imports API/configuration code or another business module's storage adapter.
- One frozen token value supplies production HTTPS intent, SSE-KMS algorithm/key, and `no-store` metadata.
- Both email batch writes emit the exact SSE-KMS and cache-control parameters and cannot override them.
- Development preserves disposable PostgreSQL, Redis, and Garage behavior while still applying `no-store`.
- Invalid configuration and logs reveal no URL, credential, CA content, KMS identifier, or customer data.
- A contract test demonstrates how a later plan-13 adapter consumes the same token without implementing that adapter.
- Existing verification, queue, database, upload, and result behavior remains unchanged apart from transport and object
  metadata.

## Validation

Run focused configuration, common-contract, and adapter tests:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/lead-email-finder-api/src/environment-variables.dto.spec.ts src/lead-email-finder-api/src/postgres-module-options-factory-impl.spec.ts src/lead-email-finder-api/src/s3-module-options-factory-impl.spec.ts src/lead-email-finder-api/src/customer-object-write-security.factory.spec.ts src/lead-email-finder-api/src/customer-object-write-security.module.spec.ts src/libs/redis/src/parse-connection-string-options.factory.spec.ts src/libs/modules/email-verification/src/batch-email-verification/multer-options-factory-impl.service.spec.ts src/libs/modules/email-verification/src/batch-email-verification/batch-email-verification.processor.spec.ts --runInBand
    corepack pnpm architecture:check

Cover every insecure production combination, CA pass-through, redacted errors, immutable returned values, explicit fake
bindings in isolated module tests, and both AWS mappings. Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    git diff --check

Inspect Compose ownership before runtime work. Against an owned disposable `LEF` stack, run the existing SMTP and batch
Bruno collections to prove the explicit development exception still composes.

## Idempotence and Recovery

Factories and the common value are deterministic and perform no writes. Reapplying S3 request parameters is safe.
Every module test binds an explicit fixture, so missing production composition fails instead of silently defaulting.

If runtime validation fails, preserve fail-closed production behavior and reset only an owned disposable `LEF` project.
Revert the configuration, token binding, and both adapter changes together. Never recover by weakening peer
verification, using a non-KMS production mode, adding a business-module-local replacement token, or deleting broad data.

## Artifacts and Notes

The sanitized configuration matrix is:

- Production PostgreSQL supplies `ssl.rejectUnauthorized=true`, optionally supplies the configured CA contents, and
  rejects URL parameters that could replace the explicit TLS policy.
- Production standalone Redis requires `rediss://`; Sentinel supplies peer-verified `tls` and `sentinelTLS`
  settings. Both optionally consume trusted CA contents.
- Production S3 requires HTTPS, `aws:kms`, and a nonempty KMS key. Development preserves the existing plaintext local
  endpoints. Production also supplies explicit peer-verifying Node HTTP-handler options.
- Both customer-object writers always map `no-store`; production also maps `aws:kms` and the configured key through
  provider-specific request fields. Security fields are applied last so local options cannot override them.
- The reusable Jest contract is reachable only through the common testing deep barrel and is excluded from production
  compilation.

Validation artifacts:

- Focused Jest after merging `master`: 8 suites and 119 tests passed.
- Full `test:ci` after merging `master`: 165 suites and 1,280 tests passed; 10 suites and 52 tests were intentionally
  skipped.
- `typecheck`: passed.
- `lint`: passed with zero errors and one preexisting explicit-return-type warning in
  `src/libs/config/src/load-secrets.spec.ts:14`.
- Post-merge `build`: passed with zero TypeScript issues and 536 SWC-compiled files.
- `architecture:check`: passed for 9 modules with the existing 138 baselined violations.
- Pre-merge production `docker build -f Dockerfile -t lef-issue-467-validation .`: passed with zero TypeScript issues
  and 532 SWC-compiled files. Image inspection confirmed the Jest-only contract was absent; the exact temporary image
  was removed afterward. The later merge had no packaging conflict, and its Nest production build passed separately.
- `docs:lint` for the four changed Markdown files: passed.
- `git diff --check`: passed.
- Bruno: not applicable — no externally observable HTTP API behavior changed. Exact startup and storage-request
  metadata behavior is covered below the HTTP boundary. The active Lead Email Finder stack was owned by another
  checkout, so its collections were not run.

No connection strings, CA contents, KMS IDs, credentials, customer addresses, or object contents were recorded.

## Plan readiness

Implemented and validated
