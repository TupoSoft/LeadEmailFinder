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

- [ ] (2026-08-30) Extract strict PostgreSQL, Redis, and S3 configuration into focused factories.
- [ ] (2026-08-30) Reject insecure production transport without exposing connection strings, trust material, or keys.
- [ ] (2026-08-30) Add the common `CustomerObjectWriteSecurity` value/token and bind it in the API composition root.
- [ ] (2026-08-30) Inject the shared token into both email batch-object writers and verify exact AWS parameters.
- [ ] (2026-08-30) Prove production rejection, local-development compatibility, packaging, runtime wiring, and full
      validation.

## Plan dependencies

- `privacy-compliance/01`

## Surprises & Discoveries

None yet.

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

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/lead-email-finder-api.module.ts` currently constructs TypeORM options inline.
`src/libs/redis/src/parse-connection-string-options.factory.ts` accepts plaintext standalone and Sentinel connections.
`src/lead-email-finder-api/src/s3-module-options-factory-impl.ts` accepts the configured endpoint without a
production transport check.

Email batch input writes use
`src/libs/modules/email-verification/src/batch-email-verification/multer-options-factory-impl.service.ts`, and
`BatchEmailVerificationProcessor` creates result uploads. Neither write requests server-side encryption. The common
library already exposes framework-free interfaces and symbol tokens, including proxy tokens, and is an allowed
cross-module dependency. The API project is the outer Nest composition root.

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
non-HTTPS production endpoints and require the KMS pair. Use the platform trust store or `NODE_EXTRA_CA_CERTS`; never
set an agent that disables verification.

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

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/lead-email-finder-api/src/environment-variables.dto.spec.ts src/lead-email-finder-api/src/postgres-module-options-factory-impl.spec.ts src/lead-email-finder-api/src/s3-module-options-factory-impl.spec.ts src/lead-email-finder-api/src/customer-object-write-security.factory.spec.ts src/libs/redis/src/parse-connection-string-options.factory.spec.ts src/libs/modules/email-verification/src/batch-email-verification/multer-options-factory-impl.service.spec.ts src/libs/modules/email-verification/src/batch-email-verification/batch-email-verification.processor.spec.ts --runInBand
    corepack pnpm architecture:check

Cover every insecure production combination, CA pass-through, redacted errors, immutable returned values, explicit fake
bindings in isolated module tests, and both AWS mappings. Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- README.md src/libs/common/README.md src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/06-require-secure-storage-transport.md
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

Record the sanitized configuration matrix, common-token contract-test result, adapter request-field assertions,
development health, Bruno totals, and full check results. Never record connection strings, CA contents, KMS IDs,
credentials, customer addresses, or object contents.

## Plan readiness

Ready to implement
