# Build the Controller-Privacy Request Core

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Create a durable, authenticated controller-privacy request engine without crossing into identity, Keycloak, session,
organization, service-client, credit, payment, audit, security, or provider implementation. After this change, the
`controller-privacy` module owns request/API orchestration, identity binding, idempotency, versioned crypto, deadlines,
appeals, an exact adapter registry, truthful per-item receipts, and secure short-lived access exports. Real rights
processing remains disabled until every adapter required by plan 12 is registered.

A developer can enable the workflow only in a test composition with complete fake adapters, exercise all endpoints,
download an export once, and observe physical object deletion. The normal application remains disabled by default until
plans 16, 17, and 27–30 provide every real adapter and plan 18 registers the mandatory controller lifecycle/restore
capability.

## Progress

- [ ] (2026-08-30) Add the layered controller-privacy module, policy projection, durable request/action/receipt state,
      and BullMQ request orchestration.
- [ ] (2026-08-30) Add human-session self-service and privileged recovery intake bound to the plan-12 receipt contract.
- [ ] (2026-08-30) Add exact adapter registration/capability validation and the default-disabled feature gate.
- [ ] (2026-08-30) Define the narrow lock-aware controller hold-query/guard port consumed by owner adapters; plan 32
      supplies its durable provider.
- [ ] (2026-08-30) Add the exact human-only permission mapping, recovery-receipt carrier, and durable HMAC alias/key-
      retirement rules.
- [ ] (2026-08-30) Add versioned authenticated encryption/HMAC, idempotency, deadlines, appeals, and truthful status.
- [ ] (2026-08-30) Add SSE-KMS/`no-store` exports, one-time authenticated download, and physical deletion.
- [ ] (2026-08-30) Validate with fakes, PostgreSQL/S3/Redis fixtures, authorization, concurrency, Bruno, architecture,
      and full checks.

## Plan dependencies

- `privacy-compliance/06`
- `privacy-compliance/12`
- `privacy-compliance/15`
- `module-architecture/09`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: The controller-privacy module owns orchestration and defines narrow data-owner ports; plans 16, 17, and
  27–30 own real adapters. This pull request composes fakes only in tests.
  Rationale: One PR can prove the engine without bypassing module ownership or combining every external system.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: `CONTROLLER_PRIVACY_ENABLED` defaults to `false`. A `true` initialization fails unless the policy projection is
  approved and every required adapter ID, version, data-item ID, and action capability is registered exactly once.
  Rationale: Partial rights fulfillment is worse than an unavailable feature because it can issue a false completion.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Map `privacy:manage` to every human membership role (`member`, `admin`, `owner`, and `platform_admin`) for
  self-service only, and map `privacy:admin` only to the human `platform_admin` role for account recovery. Mark both
  permissions human-only and reject them from service-credential creation/update even if their strings reach a DTO.
  Rationale: Every signed-in person needs access to their own rights workflow, while recovery is privileged and no M2M
  credential may acquire either human authority through the shared permission enum.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Derive self-service subject and organization only from a freshly resolved active `human_session`. Recovery
  requires a human `platform_admin` with `privacy:admin` and one plan-12 verification receipt carried only in the
  redacted `X-Controller-Privacy-Recovery-Receipt` header. The request body contains action only and never email,
  issuer, subject, organization, receipt, or other identity selector; recovery correction is rejected until a future
  approved signed correction-reference contract exists.
  Rationale: Body-supplied identity creates enumeration and cross-subject mutation risk, and a compact receipt should
  not enter ordinary JSON logging or be mixed with an unverified correction value.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store only request IDs in BullMQ; authenticate-encrypt resumable values with versioned AES-256-GCM and use
  versioned HMAC-SHA-256 fingerprints for matching/idempotency.
  Rationale: Queue/log/receipt state does not need plaintext identity or correction values, and rotation must preserve
  old nonterminal records.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use durable purpose-scoped HMAC alias rows and query every lookup-enabled key version. Exactly one key is
  active for writes; a version cannot be removed or reused while any alias, receipt-consumption record, nonterminal
  request, disposition marker, or restorable generation can still require it.
  Rationale: Computing only the newest digest would make pre-rotation records invisible and allow duplicate requests;
  deleting an old key while durable fingerprints remain would make replay and restored-data matching fail open.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Declare `controller.legal-holds.v1` and `controller.data-lifecycle.v1` mandatory production capabilities
  in the policy projection from this first core PR. Fake tests may supply both, but a real registry is not eligible for
  activation through plans 16, 17, and 27–30; plan 18 is the first PR permitted to demonstrate real
  `CONTROLLER_PRIVACY_ENABLED=true` initialization after plan 32 supplies the real hold provider.
  Rationale: Rights execution without scheduled lifecycle enforcement and restored-data replay can resurrect data or
  issue a misleading terminal receipt.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Define pure `ControllerHoldQuery` and `ControllerHoldMutationGuard` ports in this core, but provide only
  deterministic fakes in this PR. A guard sorts canonical scope keys and acquires every hold-scope guard before any
  owner lock. It returns the effective decision plus a fence/version pair and must be validated again before a mutation
  is reported complete. Plan 32 owns the durable provider and all hold administration.
  Rationale: Every destructive, restrictive, corrective, or retention adapter needs one consistent fail-closed race
  boundary, while the request core must not own legal-hold persistence or administration.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store access exports through the common plan-06 `CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN`. Production requires
  authenticated HTTPS, SSE-KMS, and `Cache-Control: no-store`. Downloads stream through one authenticated atomic claim
  and never expose a reusable presigned URL.
  Rationale: Controller exports must not create a weaker storage or bearer-link path than verification objects.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Delete an export physically after the first completed download or at 24 hours, whichever comes first.
  A claimed/failed transfer is inaccessible and requires generating a new export; deletion retries until confirmed.
  Rationale: One-time semantics and physical minimization must remain truthful under transfer/delete failure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use TypeORM synchronization against disposable data and no migration, backfill, or production rollout.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 12 supplies stable controller-data item IDs, actions, deadlines, appeal rules, retained/restricted reason codes,
notice versions, and the signed account-recovery receipt contract. Plan 06 supplies the common object-write token.
Plan 15 supplies restore contracts but deliberately uses separate out-of-band restore authority. This plan adds
`privacy:manage` and controller-recovery-only `privacy:admin` to the ordinary human authorization policy. Existing auth
binds a request to `AuthPrincipal` and applies browser Origin/CSRF protection.

The real data remains owned by identity, BFF session, organization onboarding, service-client management, credits,
payments, Keycloak/provider, and managed operational systems. This core must not import their entities, repositories,
SDK clients, or infrastructure internals.

The real-adapter handoffs are exact: plan 16 supplies `identity-attribution.controller-data.v1` and
`bff-session.controller-data.v1`; plan 17 supplies `credits.controller-data.v1` and
`payments.controller-data.v1`; plan 27 supplies `human-organization.controller-data.v1`; plan 28 supplies
`service-client.controller-data.v1`; plan 29 supplies `audit-security.controller-data.v1`; and plan 30 supplies
`managed-provider.controller-data.v1`. Plan 32 supplies mandatory `controller.legal-holds.v1`, and plan 18 supplies
mandatory `controller.data-lifecycle.v1`. No range or generic “remaining adapter” may satisfy the policy registry.

Plan 32 implements the hold ports before any real mutating adapter is implemented. The global lock order is fixed here:
sort canonical hold-scope keys, acquire all hold guards, then acquire owner locks in the owner's canonical row-key
order. Code must never acquire a hold guard while retaining an owner lock. A denied, expired-lease, stale-version, or
unavailable guard produces pending/manual state and cannot yield a terminal mutation receipt.

## Scope and Non-Goals

Create `src/libs/modules/controller-privacy/` with canonical layers and README; private TypeORM/BullMQ/S3/crypto
adapters for request state and exports; `config/privacy/controller-data-policy.yaml` generated from approved plan-12
IDs; feature/configuration validation; public HTTP endpoints; and fake adapter contract/integration tests.

Do not implement any real identity/session/Keycloak/organization/service-client/credit/payment/audit/security/provider
adapter, scheduled controller retention, restore reconciliation, California DROP, anonymous lookup, migrations,
production activation, or legal decision. Plans 16–18 and 27–30 own those later outcomes.

## Plan of Work

Generate `config/privacy/controller-data-policy.yaml` from plan 12 with immutable version, required adapter descriptors,
data-item/action mappings, deadline/appeal rules, receipt contract version, reason codes, and export TTL capped at 24
hours. Add a strict parser/test. Unknown, duplicate, pending, or unmapped items fail.

Create pure domain values for request, action, checkpoint, disposition, receipt, appeal, deadline event, export grant,
and adapter descriptor. Application use cases depend on `ControllerPrivacyAdapter`, `ControllerHoldQuery`,
`ControllerHoldMutationGuard`, request store, job publisher, crypto, clock, object store, and audit ports.
Infrastructure owns TypeORM, BullMQ, Node crypto, AWS, and Nest.

Add `privacy:manage` and `privacy:admin` to `AuthPermission`, then update `RolePermissionPolicy` explicitly:
`privacy:manage` is in `MEMBER_PERMISSIONS` and therefore inherited by `admin`, `owner`, and `platform_admin`, while
`privacy:admin` exists only in `PLATFORM_ADMIN_PERMISSIONS`. Add a human-only permission set consumed by service-client
creation/update validation so neither permission can be granted to a service credential. Self-service endpoints require
`privacy:manage` and exact `human_session` kind, then re-resolve the session/identity binding through a core port before
commit.

Recovery requires exact human `platform_admin` plus `privacy:admin`. Accept one compact JWS only in the case-insensitive
`X-Controller-Privacy-Recovery-Receipt` header, mark that header sensitive in HTTP logging/tracing, and reject query,
cookie, or body carriers. Require `Idempotency-Key` as a header. The JSON body schema is exactly
`{ "action": "access" | "delete" | "restrict" | "object" }`; unknown fields and `correct` are rejected. Verify and
atomically consume the plan-12 receipt, bind its issuer/subject claims to one local `ExternalIdentity`, and derive
organization scope internally. Email, issuer, subject, organization, raw receipt, and any other target identity value
never appears in the body or URL. Return the same accepted/concealed result regardless of account existence.

Canonicalize purpose, action, policy, identity issuer/subject, and organization into HMAC inputs. Persist a private
alias table with `{purpose, keyVersion, digest, canonicalRecordId, createdAt, requiredUntil}` and a unique constraint on
`{purpose, keyVersion, digest}`. Every lookup computes candidates under all `lookup_enabled` HMAC versions and queries
them in one bounded operation; zero matches creates one record with the active-write alias, one canonical target is a
match, and conflicting targets fail closed as key/alias corruption. The idempotency digest separately includes the
normalized `Idempotency-Key`; same key/input returns one request and conflicting reuse returns `409`.

The keyring schema has immutable, never-reused version IDs and statuses `active_write`, `lookup_enabled`, or
`retirement_pending`. Initialization requires exactly one active writer and rejects an unknown, duplicate, or
rolled-back version. It verifies that every persisted alias, receipt fingerprint, encrypted value, nonterminal request,
and disposition-marker reference has a loaded permitted key version. Rotation first adds a lookup-enabled key, then makes it the sole writer;
old versions remain available for lookup/decryption. Retirement is rejected while any durable reference or any backup
generation capable of restoring such a reference has not irreversibly expired under plans 11/18. A bounded checker
reports safe counts/version IDs only. Persist encrypted sensitive state with key version, nonce, tag, and AAD binding
request ID/policy version; new writes use the active version, reads accept retained versions, and ciphertext clears at
the approved terminal point without deleting required aliases early.

Implement an adapter registry keyed by stable ID/version. Each adapter declares owned item IDs and supported actions.
The policy also declares `controller.legal-holds.v1` and `controller.data-lifecycle.v1` as mandatory runtime
capabilities. When disabled, privacy
endpoints are concealed as `404` and no worker consumes jobs. When enabled, initialization compares the real registry with
every required policy item/capability and fails for missing lifecycle capability, extra ownership, duplicates, or
version mismatch. This PR proves enablement only with complete fake owner adapters plus fake hold and lifecycle
capabilities; real composition stays disabled until plan 18. The engine processes checkpoints durably and never marks complete while
an adapter returns pending, unknown, manual action, or ambiguous external state.

Create access exports as authenticated-encrypted JSON with approved item IDs, purpose/category, allowed values, and
dispositions. The S3 adapter injects the plan-06 common token and contract tests exact HTTPS intent, SSE-KMS,
`no-store`, and owned key shape. `GET .../export` atomically changes `available -> claimed` for the authenticated owner,
streams through the API, records `downloaded`, and enqueues immediate deletion. Expiry enqueues deletion at 24 hours.
A failed stream cannot reclaim the grant; a new export object is required. `purge_pending` is never downloadable and
retries until S3 confirms absence.

Track plan-12 due/extension/denial/appeal events with an injected clock. Receipts list every required item as exported,
corrected, deleted, restricted, retained, not-found, pending, or manual-action with an approved reason. No generic
adapter success can omit an item.

## Interfaces and Dependencies

Expose:

- `POST /v1/privacy/controller-requests` with idempotency key and
  `{ action: access|correct|delete|restrict|object, corrections? }`.
- `GET /v1/privacy/controller-requests/:id` for owned status/deadline/dispositions.
- `GET /v1/privacy/controller-requests/:id/export` for one owned, available, unexpired download.
- `POST /v1/privacy/controller-requests/:id/appeal` for the approved one-request appeal workflow.
- `POST /v1/privacy/controller-recovery-requests` for a human platform admin with `privacy:admin`, required
  `Idempotency-Key`, one signed receipt only in `X-Controller-Privacy-Recovery-Receipt`, and exact body
  `{ action: access|delete|restrict|object }`; it accepts no target identity field and never reveals account existence.

Use `401` unauthenticated, `403` wrong credential/permission, concealed `404` disabled/foreign/missing, and `409`
idempotency conflict, consumed receipt, unavailable export, or required manual input.

The public adapter SPI is equivalent to:

    interface ControllerPrivacyAdapter {
        readonly descriptor: { id: string; version: string }
        readonly itemIds: readonly string[]
        readonly actions: readonly ControllerPrivacyAction[]
        execute(input: ControllerPrivacyAdapterInput): Promise<ControllerPrivacyAdapterResult>
    }

The lock-aware hold boundary is equivalent to:

    interface ControllerHoldQuery {
        query(input: ControllerHoldScope): Promise<ControllerHoldDecision>
    }

    interface ControllerHoldMutationGuard {
        acquire(input: ControllerHoldGuardInput): Promise<ControllerHoldGuardLease>
    }

`ControllerHoldGuardLease` exposes only the approved decision, opaque lease/fence/version, `renew`, transaction-bound
`assertCurrentForCommit`, external `assertCurrent`, and idempotent `release`; it exposes no hold narrative, repository,
transaction client, or subject value. Mutating adapters acquire it before their owner locks, recheck it inside a local
owner transaction immediately before commit (or around an authoritative external confirmation), and treat loss or
uncertainty as pending/manual. Plan 32 supplies the real provider and infrastructure bridge.

Exact configuration includes `CONTROLLER_PRIVACY_ENABLED=false`,
`CONTROLLER_PRIVACY_ENCRYPTION_KEYRING_FILE`, `CONTROLLER_PRIVACY_HMAC_KEYRING_FILE`, and the existing plan-06
object/KMS configuration. The policy's required runtime-capability list includes exact `controller.legal-holds.v1` and
`controller.data-lifecycle.v1`. The public barrel exposes the module and narrow adapter/capability contracts/tokens
only.

## Acceptance Criteria

- Feature disabled is the committed default; endpoints are concealed and workers idle.
- Enabled initialization succeeds only with an approved policy, exact complete fake adapter registry, and fake
  `controller.legal-holds.v1` plus `controller.data-lifecycle.v1` capabilities; every incomplete, duplicate,
  mismatched, pending, or unknown mapping fails
  before requests, and no real composition is eligible for activation before plan 18.
- `privacy:manage` belongs to every human role and `privacy:admin` only to human `platform_admin`; service-credential
  create/update rejects both human-only permissions.
- Self-service identity comes only from a current human session. Recovery requires an exact human platform admin,
  `privacy:admin`, one valid/unused plan-12 receipt in the redacted recovery header, and an action-only body with no
  identity selector. Another carrier, unknown field, or recovery correction is rejected without enumeration.
- Idempotent replay returns one request; conflicting key or receipt reuse returns `409` under concurrency.
- BullMQ/logs contain only request IDs/safe codes. HMAC lookup checks every loaded lookup version through durable
  aliases; initialization rejects missing, reused, or regressed key versions and conflicting aliases. Retirement remains blocked
  while any live/restorable durable reference exists. Sensitive state uses versioned AES-GCM and clears when allowed.
- Deadlines, extensions, denials, appeals, and receipts cover every plan-12 item without false completion.
- Production exports require HTTPS/SSE-KMS/`no-store` via the shared token, use an owned key, and never expose a
  presigned bearer URL.
- The core exports only the narrow hold query/guard contracts, proves their lock ordering and fail-closed fake
  behavior, and includes no real hold persistence or hold-administration endpoint.
- One authenticated claim permits one download; completed or failed claims cannot replay. Objects delete physically
  after download or 24-hour expiry, and deletion failure remains `purge_pending` until confirmed.
- No real data-owner adapter, scheduled retention, restore reconciler, migration, production activation, or compliance
  claim is included.
- Focused, fake-contract, PostgreSQL, Redis, S3, authorization, concurrency, architecture, full, build, docs, and Bruno
  checks pass.

## Validation

Run policy/core/crypto/export and persistence tests:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy controller-data-policy customer-object-write-security --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy.integration.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy-export.s3.integration.spec.ts --runInBand

Use fake adapters and fake hold guards for complete/incomplete registries, every action/disposition, active/unknown/
lost holds, lock-order violations, timeout, ambiguous results, retries, deadlines, appeals, and key rotation. Also cover
idempotency races, receipt replay, export-claim races, stream failure, expiry, and deletion retries. Run S3 tests against
an owned Garage fixture and assert exact production request mapping separately.

Add `bruno/controller-privacy` for disabled concealment and enabled fake-composition self-service/status/appeal/export,
wrong credential, foreign concealment, idempotent replay/conflict, expired/claimed export, recovery-header/body
validation, and privileged recovery authorization. With the collection's local environment running, execute from
`bruno/controller-privacy`:

    bru run --env local

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check config/privacy/controller-data-policy.yaml src/libs/modules/controller-privacy/README.md bruno/controller-privacy/README.md .agents/plans/privacy-compliance/13-fulfill-controller-data-rights.md
    git diff --check

## Idempotence and Recovery

Request keys and receipt consumption are atomic. Adapter checkpoints advance monotonically. Exact retries resume the
same request; unknown adapter state stays pending. Export claims are one-way, and deletion retries never restore access.

Recover a partial development schema only through reset/reseed of an owned disposable environment. Never enable with a
partial registry, reset key versions while ciphertext exists, reuse a receipt/export grant, delete broad S3 prefixes,
or bypass module owners.

## Artifacts and Notes

Record policy/adapter/key versions, synthetic request/receipt IDs, sanitized dispositions/counts, export lifecycle
states, test totals, and Bruno totals. Never record names, emails, issuer subjects, correction values, raw receipts,
tokens, provider identifiers, object contents, keys, or private legal evidence.

## Plan readiness

Ready to implement
