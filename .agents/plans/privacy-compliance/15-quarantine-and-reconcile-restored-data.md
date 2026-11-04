# Quarantine and Reconcile Restored Application Data

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Ensure a restored application generation cannot serve ordinary traffic or run ordinary workers until every reconciler
required for that backup has completed against the restored snapshot and one freshly authorized out-of-band operator
releases it.
After this change, initialization explicitly declares normal or restore mode, quarantined generations are durable and
retryable, and release is a compare-and-set transition over a snapshotted reconciler set.

The observable outcome is a layered `privacy-operations` business module, fail-closed initialization/readiness/worker behavior,
assertion-protected restore-control endpoints, and synthetic PostgreSQL integration evidence. This is development-grade
application safety, not a production restore or disaster-recovery rollout.

## Progress

- [ ] (2026-08-30) Add the layered privacy-operations module, restore configuration contract, persistence, and public
      reconciler port.
- [ ] (2026-08-30) Require explicit restore mode/generation declarations and bind backup generation/captured-at to
      immutable metadata from the approved source-store adapter.
- [ ] (2026-08-30) Gate ordinary HTTP traffic, readiness, and workers while reconciliation is incomplete.
- [ ] (2026-08-30) Add restore endpoints protected only by fresh, action-bound, single-use out-of-band control-plane
      assertions whose verification keys/configuration are outside restored stores.
- [ ] (2026-08-30) Implement bounded checkpoints and compare-and-set release over the snapshotted reconciler set.
- [ ] (2026-08-30) Add the generic backup-control-range and external restore-fence extension points that plan 33 binds
      to its real non-restored authority.
- [ ] (2026-08-30) Add authorization, configuration, concurrency, failure/retry, integration, Bruno, architecture, and
      documentation validation.

## Plan dependencies

- `privacy-compliance/11`
- `auth/10`
- `module-architecture/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Create `src/libs/modules/privacy-operations/` with canonical API, application, domain, and infrastructure
  layers.
  Rationale: Restore quarantine is a business safety workflow shared by verification and controller data; it belongs
  neither in managed-store documentation nor in a data owner's private infrastructure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require `RESTORE_MODE=normal|quarantined` in every environment. In quarantined mode require a new local
  restore-generation ID plus an approved source-store ID and immutable provider backup-generation ID. Resolve
  `capturedAt` through the plan-11-approved generation-metadata adapter and reject any declared or restored value that
  does not match before creating checkpoints or invoking a reconciler.
  Rationale: An operator-supplied timestamp or stale restored row is not authoritative evidence of which backup was
  loaded; reconciliation must bind to the provider's immutable generation metadata.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Do not authorize restore control from any session, membership, permission, user, or key stored in restored
  PostgreSQL, Redis, or object storage. Require a fresh compact JWS assertion issued through a Security-approved
  out-of-band control plane and verified with read-only public keys/configuration mounted outside all restored stores.
  Rationale: Restored account/session state can be stale, compromised, disabled, or unavailable and therefore cannot
  serve as either authority or the only recovery path.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Bind each assertion to one generation and one action, a pseudonymous operator subject, `iat` strictly
  after that generation entered quarantine, a maximum five-minute lifetime, and a unique `jti` consumed once. Require
  a newly issued release assertion after reconciliation completes.
  Rationale: Short, action-specific, generation-specific, single-use authority limits replay and proves that release
  was approved against current reconciliation state rather than before the restore began.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: On declaration, snapshot stable reconciler ID and version pairs for the restore generation. Release uses one
  database compare-and-set and is possible only when each snapshotted pair has a complete checkpoint for the same
  generation, source store, and captured-at value.
  Rationale: Concurrent deploys or late registrations must not silently change the completion proof midway.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Let a restore rule require an external privacy-control range and authority descriptor. For such a rule,
  declaration must validate the backup's immutable capture ticket and included high-water mark, use the registered
  authority to fence prior writers and fix a target watermark, and snapshot every required consumer. Release requires
  the live fence/target plus every consumer checkpoint at that exact target.
  Rationale: A reconciler cannot enumerate privacy-control events created after an older PostgreSQL backup from that
  restored backup itself. The generic gate belongs here, while plan 33 supplies the real non-restored authority.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add TypeORM tables only through synchronization against disposable development data; add no migration,
  backfill, production rollout, HA, or real recovery procedure.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 11 supplies validated processor-side backup-store IDs, approved immutable generation-metadata adapter IDs, and
non-secret restore-procedure evidence but no runtime state. Plans 07 and 18 later supply age/controller lifecycle
reconcilers; plan 20 supplies `verification.subject-dispositions.v1`; plan 21 supplies access-export invalidation; and
plan 31 supplies the separate `verification.subject-corrections.v1` dual-subject correction reconciler. Plan 22 later
supplies `verification.request-control.v1`, plan 32 supplies `controller.legal-hold-events.v1`, and plan 33 supplies the
real `privacy.control-authority.v1` fence, target, and ordered event source used by all five privacy-control consumers
plus `controller.data-lifecycle.v1`.
The existing application auth state may itself come from restored PostgreSQL/Redis/Keycloak relationships and is
therefore intentionally outside the restore authorization decision. Security and Operations must select the real
out-of-band issuer, key distribution, revocation procedure, and operator workflow; this plan commits only a local test
signer fixture and never names a fictional production provider.

A restore generation is one coordinated application-data restoration from a named backup captured at a UTC instant.
Quarantine means ordinary routes, readiness, and ordinary BullMQ workers remain unavailable. A reconciler is a narrow
data-owner adapter responsible for processing bounded pages and returning sanitized monotonic progress.

## Scope and Non-Goals

Create the privacy-operations module and README, strict `config/privacy/restore-reconciliation.yaml` validation, and
restore generation/checkpoint persistence. Add configuration/bootstrap, request, readiness, and worker gates; restore
control endpoints and a dedicated assertion guard; a generic external authority/range extension seam; API-root
reconciler composition; and focused/integration/Bruno tests.

Do not configure backup retention, take/restore a backup, implement a verification/controller reconciler, contain raw
subject data, mutate immutable backup media, add migrations, build production orchestration, or claim recovery
readiness. Do not trust restored sessions, roles, permissions, memberships, or identity-provider state for restore
control, and do not invent a real assertion issuer. Plans 07, 18, 20, 21, and 31 own their data-specific
reconciliation; plan 22 owns request-control replay, plan 32 owns legal-hold replay, and plan 21 never owns correction
replay. Plan 33 owns the real authority/provider adapter, capture tickets, event stream, pseudonymization keys, and epoch
fence; this plan adds only its narrow generic integration seam and deterministic local fake.

## Plan of Work

Add `config/privacy/restore-reconciliation.yaml` with schema version, revision, and one record per plan-11 backup-store
ID. Each record names the exact approved immutable generation-metadata adapter plus required stable reconciler IDs and
versions. It can also require one stable external authority descriptor and an exact consumer set for a privacy-control
range. Add a Zod parser/checker under `scripts/privacy/` and `privacy:restore-readiness-check`. It rejects unknown
backup/adapter/authority IDs, duplicate reconcilers, placeholders, secrets, a plan-11 backup without a restore rule, or
a privacy-control consumer without `privacy.control-authority.v1` and the complete matching consumer set.

Build `src/libs/modules/privacy-operations/`. Domain values model immutable generation identity, captured-at, source
store, optional externally proven control range, snapshotted descriptors, checkpoint status, approval actor, and
release state. Application use cases depend on small `RestoreGenerationStore`, `RestoreReconciler`,
`RestoreGenerationAuthority`, `Clock`, and `RestoreReadinessPolicy` ports. TypeORM entities and Nest HTTP/configuration
code remain in infrastructure/API. This PR supplies only a deterministic fake authority for local contract tests; plan
33 later binds the selected real adapter.

At bootstrap, require `RESTORE_MODE`. `normal` rejects restore fields and starts normally. `quarantined` validates the
source store/rule and asks the configured `BackupGenerationMetadataReader` for the immutable provider generation ID,
source store, captured-at, expiry evidence, and any immutable privacy-control capture tuple. Compare that result with
the declared provider generation and any captured-at already present in the restored generation row. For a rule that
requires the control range, validate the externally finalized capture ticket, stream/epoch, included high-water mark,
and schema/consumer-set digest. Then call the registered authority to atomically fence the prior epoch and fix the
restore target. Only an exact authoritative match may atomically create or resume the local generation. A mismatch, unknown/
expired generation, unavailable metadata reader or authority, missing rule/capture tuple, stale fence, or unknown
registered reconciler fails before any reconciliation call. The process stays alive only in restricted mode so
liveness and restore endpoints work.

Add a global quarantine request guard that permits public liveness, dedicated restore-control endpoints, and nothing
else until release. Mark restore routes public only with respect to the ordinary `AuthGuard`; protect them with a
dedicated assertion guard that never resolves restored application sessions or membership. Readiness reports `503`
with generation ID and stable reason only. Ordinary BullMQ workers must not register or consume; restore
reconciliation executes only from its dedicated control use case.

Read the assertion public-key bundle, issuer, audience, allowed algorithms/key IDs, and limits from a read-only mount
outside restored PostgreSQL, Redis, S3, and backup media. Accept the compact JWS only in
`X-Restore-Operator-Assertion`, add the header to HTTP/proxy trace redaction, and reject query/body/cookie carriers.
Require claims `iss`, `aud=lead-email-finder-restore-control`, pseudonymous `sub`, `iat`, `nbf`, `exp`, unique `jti`,
`purpose=restore_control`, `restore_generation_id`, `backup_generation_id`, and `action=status|reconcile|release`.
Require `iat` strictly after `quarantinedAt`, `exp - iat <= 300` seconds, at most 30 seconds of clock skew, exact route
action, generation, and recovery-copy binding; current key status; and atomic first use of `jti`. A release assertion must also be
issued after the last required checkpoint completed. The local development signer fixture is test-only and cannot
satisfy non-local configuration validation.

Expose:

- `GET /v1/privacy/restore-generations/:id` for sanitized state/checkpoints.
- `POST /v1/privacy/restore-generations/:id/reconcile` to run one bounded page for pending reconcilers.
- `POST /v1/privacy/restore-generations/:id/release` to approve and attempt CAS release.

Missing/invalid/expired assertions are `401`; valid assertions with the wrong purpose/action are `403`; foreign,
missing, or assertion-mismatched generation and recovery-copy IDs are concealed as `404`; consumed `jti`, incomplete release, or
stale release is `409`. Domain reconciliation/release remains idempotent when retried with a newly issued assertion,
but an assertion itself is never replayable. Reconcile accepts no cursor/status from the request body.

At declaration, resolve the configured required descriptor set against providers assembled in
`LeadEmailFinderApiModule` through the bare privacy-operations public contract and snapshot it transactionally. If the
rule requires privacy-control authority, also snapshot the capture ticket, included watermark, fixed target watermark,
authority epoch/fence, schema/consumer-set digest, and exact required consumer descriptors. Checkpoint writes compare
expected prior cursor/version and, for those consumers, the expected authority sequence. Release locks the generation,
rechecks all snapshotted checkpoints and authoritative backup-generation/captured-at binding, asks the authority to
confirm the unchanged live target/fence, and requires every authority consumer checkpoint to equal the target. It then
consumes the fresh release assertion, records only its pseudonymous operator subject, key ID, safe JTI fingerprint, and
time, and performs one `quarantined -> released` CAS. A later release with a new assertion returns the released resource
without another effect; reuse of the old JTI is still rejected.

## Interfaces and Dependencies

The public barrel exports only `PrivacyOperationsModule`, `RestoreReconciler`,
`RestoreReconcilerDescriptor`, and the composition token. The central interface is:

    interface RestoreReconciler {
        readonly descriptor: { id: string; version: string }
        reconcile(input: {
            generationId: string
            sourceStoreId: string
            capturedAt: Date
            controlRange: null | {
                captureTicketId: string
                authorityEpoch: string
                authorityFence: string
                backupIncludedHighWatermark: string
                restoreTargetWatermark: string
                consumerSetDigest: string
            }
            cursor: string | null
            limit: number
        }): Promise<{ cursor: string | null; complete: boolean; sanitizedCount: number }>
    }

`RestoreGenerationStore` and TypeORM entities remain private. The API composition root supplies a frozen array token;
data-owner modules expose implementations through their bare barrels without importing privacy-operations persistence.
Two additional ports cross the quarantine boundary:

    interface BackupGenerationMetadataReader {
        readonly adapterId: string
        read(input: { sourceStoreId: string; backupGenerationId: string }): Promise<{
            sourceStoreId: string
            backupGenerationId: string
            capturedAt: Date
            immutableExpiresAt: Date
            evidenceVersion: string
            privacyControlCapture?: {
                captureTicketId: string
                authorityStreamId: string
                authorityEpoch: string
                includedHighWatermark: string
                schemaConsumerSetDigest: string
                evidenceVersion: string
            }
        }>
    }

    interface RestoreGenerationAuthority {
        readonly descriptor: { id: string; version: string }
        fenceForRestore(input: {
            restoreGenerationId: string
            sourceStoreId: string
            backupGenerationId: string
            privacyControlCapture: PrivacyControlCaptureMetadata
        }): Promise<RestoreAuthorityTarget>
        confirmTarget(input: RestoreAuthorityTargetIdentity): Promise<RestoreAuthorityTarget>
    }

    interface RestoreAssertionReplayStore {
        readonly adapterId: string
        consumeOnce(input: {
            issuer: string
            jtiDigest: string
            restoreGenerationId: string
            expiresAt: Date
        }): Promise<'consumed' | 'replayed'>
    }

The generation-metadata reader is the exact adapter named by the plan-11 store record. The replay store must be a
Security-approved control-plane store outside the restored PostgreSQL, Redis, object store, backup, and application
session boundary. Non-local quarantined initialization fails if either adapter is missing or mismatched. This PR supplies only
deterministic fake/in-memory local-test adapters, never a fictional real provider.

`RestoreGenerationAuthority` is required only by a restore rule that declares an external control range. Plan 33
registers its real `privacy.control-authority.v1` implementation and forbids a fake outside local tests. A covered rule
cannot downgrade to `controlRange=null`; missing capture evidence, target, fence, or provider keeps quarantine closed.

Configuration is exact:

    RESTORE_MODE=normal|quarantined
    RESTORE_GENERATION_ID=<UUID>                                  # required only when quarantined
    RESTORE_SOURCE_STORE_ID=<stable ID>                           # required only when quarantined
    RESTORE_BACKUP_GENERATION_ID=<immutable provider generation>  # required only when quarantined
    RESTORE_OPERATOR_ASSERTION_PUBLIC_KEYS_FILE=<external read-only mount>
    RESTORE_OPERATOR_ASSERTION_ISSUER=<Security-approved exact issuer>
    RESTORE_OPERATOR_ASSERTION_AUDIENCE=lead-email-finder-restore-control
    RESTORE_OPERATOR_ASSERTION_ALLOWED_ALGORITHMS=<exact allowlist>
    RESTORE_OPERATOR_ASSERTION_MAX_TTL_SECONDS=300
    RESTORE_OPERATOR_ASSERTION_CLOCK_SKEW_SECONDS=30
    RESTORE_OPERATOR_ASSERTION_REPLAY_STORE_ADAPTER_ID=<external control-plane adapter>

Assertion configuration is required only in quarantined mode and forbidden in normal mode. The public-key file and
replay adapter cannot resolve inside restored stores. `RESTORE_CAPTURED_AT` is removed as an operator input; the
approved metadata reader is authoritative. Plan 11 supplies source-store, generation-metadata adapter, and evidence
IDs. Ordinary auth/session guards provide no restore authority. Later plans register `verification.age-retention.v1`,
`verification.subject-dispositions.v1`, `verification.access-exports.v1`, `verification.request-control.v1`,
`verification.subject-corrections.v1`, `controller.legal-hold-events.v1`, and `controller.data-lifecycle.v1`
reconcilers. Plan 20 owns dispositions, plan 21 owns access-export invalidation only, plan 22 owns request control, plan
31 owns correction replay, plan 32 owns legal-hold replay, and plan 18 owns controller lifecycle replay. Plan 33 owns
the shared external ordered range and authority descriptor.

## Acceptance Criteria

- Missing/invalid `RESTORE_MODE` fails initialization; normal mode rejects restore fields; quarantined mode requires exact
  local generation, source, and provider-snapshot IDs plus external assertion and replay configuration.
- The approved metadata reader supplies the authoritative source, recovery generation, captured-at time, immutable expiry,
  and evidence version. A declared or restored mismatch stops processing before any reconciler invocation; no environment timestamp
  can override it.
- For a privacy-control-covered backup, the metadata reader also supplies an externally finalized capture ticket,
  stream/epoch, highest contiguous included sequence, schema/consumer-set digest, and evidence version. Missing or
  mismatched fields fail declaration and are never interpreted as an empty range.
- A declared restore atomically snapshots the authoritative metadata and every configured reconciler ID/version and
  cannot be resumed with different inputs.
- A covered declaration uses the registered authority to fence prior-epoch writers and fix one target watermark.
  Release requires the live unchanged fence/target and every required consumer checkpoint at that exact target; an old
  writer, event gap, authority outage, or incomplete consumer keeps quarantine.
- Unknown, missing, or duplicate reconcilers; failed or stale checkpoints; and incomplete pages keep ordinary routes,
  readiness, workers, and release unavailable.
- Restore endpoints never consult restored sessions, users, memberships, roles, permissions, CSRF state, or identity-
  provider state. They require a valid assertion only in the redacted header, with exact issuer/audience/purpose,
  generation/backup/action, pseudonymous subject, current key, post-quarantine `iat`, five-minute maximum TTL, and
  first-use JTI in an external replay store.
- Missing/invalid/expired, wrong-action, generation-mismatched, pre-restore, replayed, unavailable-replay-store, and
  local-session-only requests fail with the specified concealed/authorization status and no control effect.
- Reconciliation is bounded, cursor-monotonic, idempotent, retryable, and records no raw subject data.
- Concurrent release attempts produce one CAS transition only after every snapshotted descriptor completes and a
  newly issued post-completion release assertion is consumed once.
- Liveness and admin recovery remain available during quarantine; ordinary HTTP and BullMQ work remain unavailable.
- Normal development initialization works after explicitly setting `RESTORE_MODE=normal`.
- A deterministic local signer, metadata reader, and replay-store fixture prove the contract; non-local quarantine
  stays closed unless Security/Operations supply exact approved external adapters. No real recovery copy, migration,
  production rollout, HA, production recovery promise, or broad data deletion is added.
- Focused, PostgreSQL, authorization, concurrency, architecture, full, build, docs, and Bruno checks pass.

## Validation

Run focused and PostgreSQL suites:

    corepack pnpm privacy:restore-readiness-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- privacy-operations restore-reconciliation restore-quarantine --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_restore_gate_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- restore-reconciliation.integration.spec.ts --runInBand

Use fake reconcilers and external-control fixtures to cover multipage progress, failure, and retry; unknown or stale
versions; unavailable or inconsistent recovery metadata; and a restored captured-at mismatch. Also cover missing or
invalid keys, incorrect issuer/audience/action/generation claims, and `iat` before or equal to quarantine start. Cover
TTL and skew boundaries, replay-store outage, JTI races and replay, local-session-only rejection, concurrent
checkpoints, pre-completion and freshly issued release assertions, and concurrent release.

Use the deterministic authority fake to cover missing or mismatched capture tickets, included-watermark gaps, target-fence
race, and identical/conflicting declaration replay. Also cover old-writer rejection, bounded consumer progress,
authority outage, and release before and after every required consumer checkpoint reaches the exact target. Plan 33
owns the same contract against the selected real provider.

Add `bruno/privacy-operations` with fixture-minted assertions for missing/wrong header, ordinary session-only rejection,
wrong action/generation, stale/replayed assertion, status, incomplete release `409`, reconcile, one successful release,
and a new-assertion idempotent domain replay. Execute from `bruno/privacy-operations`:

    bru run --env local

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm exec prettier --check config/privacy/restore-reconciliation.yaml src/libs/modules/privacy-operations/README.md bruno/privacy-operations/README.md .agents/plans/privacy-compliance/15-quarantine-and-reconcile-restored-data.md
    git diff --check

## Idempotence and Recovery

Declaration and release domain transitions are idempotent for exact inputs when a fresh assertion is issued for each
call. An assertion JTI is never reusable. Checkpoints advance by compare-and-set and a failure leaves quarantine.
A covered declaration also reuses the same external target/fence for exact input; conflicting capture or generation
identity fails. A released generation cannot return to pending; a later restore uses a new UUID and new assertions.

Recover a partial synchronized development schema only by resetting/reseeding an owned disposable environment. Never
edit a checkpoint manually, bypass the assertion guard, fall back to restored application auth, place replay state in
a restored store, enable workers, delete a broad store, or reuse a generation for another backup.

## Artifacts and Notes

Record local, source, and recovery-generation IDs, authoritative captured-at/evidence versions, and snapshotted
descriptor IDs/versions. Also record safe capture-ticket, included/target watermark, epoch/fence, consumer-set digest,
sanitized cursor/count, assertion issuer/key ID, pseudonymous operator subject, safe JTI fingerprint, status code, and
test-total references. Never record raw assertions, application user/session/membership identifiers, recovery-copy contents,
addresses, identity subjects, tokens, legal details, credentials, or private provider evidence.

## Plan readiness

Ready after Security approves the exact out-of-band issuer, key-distribution/revocation, claim, header-redaction, and
external replay-store contract. Operations must also approve the authoritative plan-11 recovery-generation metadata-reader
contract, including the optional privacy-control capture tuple. Non-local quarantine stays closed until their real
adapters exist.
