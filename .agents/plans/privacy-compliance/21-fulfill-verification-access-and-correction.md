# Fulfill Verification Access with Secure One-Time Exports

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Extend the organization-submitted verification request workflow with one bounded outcome: collect the organization's
contract-approved retained verification data into a secure one-time access export. After this change, the internal
request application can accept `access`, collect one consistent organization/subject snapshot, publish an encrypted
export only through an atomic revision/generation compare-and-set, and make one revision claimable once for at most 24
hours. Successful, failed, and expired claims end in confirmed physical object deletion.

The HTTP feature and every verification privacy route remain concealed and committed off. Plan 22 is the first plan
allowed to activate them after it captures an exact versioned contract response rule and deadline snapshot at intake.
Dual-subject correction is deliberately absent from this pull request and belongs to plan 31.

## Progress

- [ ] (2026-08-30) Add `access` policy, request state, collection ports, and consistent snapshot validation.
- [ ] (2026-08-30) Add encrypted staged export writes through the shared plan-06 object-security contract.
- [ ] (2026-08-30) Publish only through one atomic request-revision/subject-generation/resource-generation CAS.
- [ ] (2026-08-30) Add one-time authenticated streaming, expiry, purge, and crash cleanup.
- [ ] (2026-08-30) Append and verify plan-33 available, claimed, purge-required, and purged events before each local
      terminal export transition.
- [ ] (2026-08-30) Register access-export invalidation as `verification.access-exports.v1` with plan 15.
- [ ] (2026-08-30) Add focused, storage-contract, authorization, concurrency, restore, architecture, and default-off
      Bruno validation.

## Plan dependencies

- `privacy-compliance/06`
- `privacy-compliance/15`
- `privacy-compliance/20`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Add only `access` to the plan-20 organization-owned request aggregate, permission, idempotency, retry,
  policy-version, and receipt model.
  Rationale: Access shares processor request identity and evidence, while correction has a separate dual-subject
  concurrency and restored-replay responsibility large enough for plan 31.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep `VERIFICATION_PRIVACY_ENABLED=false`, leave the controllers unregistered, and fail initialization if this
  plan is configured true without the plan-22 `verification.response-admission.v1` capability.
  Rationale: An access request must not be accepted before its immutable contract response rule and deadline snapshot
  can be persisted at intake.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Build an access candidate from stable subject/resource IDs, then atomically publish only if the request
  build revision, subject generation, organization ingestion epoch, and resource-manifest generation all still equal
  the captured values. A failed CAS deletes the staged object and never makes it available.
  Rationale: Rechecking values before upload is insufficient because a writer can commit between the recheck and
  publication; the final availability transition must itself fence stale snapshots.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Include only plan-10-approved customer verification categories and per-category disposition explanations.
  Exclude secrets, credentials, control fingerprints, and plan-12 controller evidence unless that contract expressly
  routes one item into the processor response.
  Rationale: Access is not authority to export infrastructure secrets or records LeadEmailFinder keeps in a different
  legal role.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store each export through the common plan-06 `CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN` and
  `CustomerObjectWriteSecurity` value. Production writes require authenticated HTTPS and exact KMS/no-store options.
  Rationale: Privacy exports cannot use weaker transport, encryption, or cache controls than other customer objects.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Cap availability at 24 hours, permit one authenticated claim, and physically delete after a completed,
  disconnected, failed, or expired claim. A failed/disconnected claim is never reusable; the request may build a new
  revision only after the prior one is inaccessible.
  Rationale: This is deterministic one-time behavior even when the server cannot know how many bytes reached a client.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Stream through the authenticated API and never return a presigned or reusable object URL. Send exactly
  `Cache-Control: no-store`, `Pragma: no-cache`, and `Expires: 0`.
  Rationale: Claim authorization and one-time state must remain server-enforced, and intermediaries must not cache the
  response.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Register `verification.access-exports.v1` to invalidate and purge every access-export revision found in a
  restored generation before release. Never use plan 21 for correction replay.
  Rationale: A restore can roll claim/purge state backwards. Fail-closed invalidation avoids making a consumed or
  expired revision downloadable again; a customer can build a fresh revision after release.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Append one minimal plan-33 authority event before local terminal `available`, `claimed`, `purge_pending`, or
  `purged` state. Reserve the local transition first so the object is inaccessible, and record event ID, sequence,
  digest, and fence in the terminal compare-and-set. An abandoned publish reservation appends a later abort/purge-
  required event rather than editing the accepted event.
  Rationale: An older database restore can roll lifecycle state back and expose an already claimed export. Authority-
  first terminal ordering preserves every safety-relevant transition without making an ambiguous object downloadable.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use TypeORM synchronization against disposable development data and add no migration, backfill,
  production activation, or production recovery procedure.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 20 creates authenticated organization-owned requests, `verification-privacy:manage`, exact human and M2M grant
rules, policy capture, idempotency, BullMQ orchestration, retry, receipts, and concealed/default-off controllers. Plan
08 supplies stable subjects, subject-generation gates, organization ingestion epochs, resource manifests, and stale-
writer prevention. Plan 06 supplies the framework-free `CustomerObjectWriteSecurity` type/token and API-root value.
Plan 15 supplies restore quarantine and the public reconciler SPI. Plan 33 supplies the non-restored ordered authority,
backup included watermark, restore target/fence, and sealed minimum object-revision selector.

An access response can draw from organization-owned `emails`, `email_verifications`, `smtp_verifications`, retained
jobs/results, and retained source/result artifact revisions within the plan-07 lifecycle. One subject can occur in a
shared object, so collection selects only the owned subject rows. A candidate export is not “available” merely because
an object upload succeeded: availability is the database pointer/state transition after the final version fence.

An export revision progresses through `building -> staged -> publish_prepared -> available -> claim_prepared -> claimed
-> purge_prepared -> purge_pending -> purged`. Prepared and staged objects have opaque keys and no public/customer-
visible pointer. A restore reconciler always invalidates restored export revisions and replays external lifecycle events;
it does not attempt to infer whether a pre-restore stream partially succeeded.

## Scope and Non-Goals

Add an exact access policy projection, the `access` request action, bounded collection ports, deterministic export
format, authenticated-encrypted staged object storage, atomic publication CAS, one-time authenticated streaming,
expiry/purge/orphan cleanup, plan-33 lifecycle events, `verification.access-exports.v1`, documentation, and focused/
runtime tests. Keep all HTTP controllers unregistered under the committed false flag and add only default-off Bruno
coverage.

Do not correct an address, mutate verification data, calculate a response deadline, activate the HTTP feature, grant
extensions, accept appeals, or implement DROP. Do not process controller-account rights, return a direct object URL,
call a verification provider, change credits, choose legal rules, add a migration/backfill, or claim compliance.

## Plan of Work

Create `config/privacy/verification-access-policy.yaml` as a strict projection of plan 10. Each immutable version names
allowed categories, format fields, per-category disposition explanations, export TTL, controller-item mappings approved
by plan 12, and stable evidence IDs. Reject a TTL above 24 hours, a controller-only item without explicit routing,
secrets/credentials/control fields, pending approvals, placeholders, and changed content without a version change.

Extend the internal plan-20 intake command with `{ email, action: 'access' }`. Derive organization exclusively from the
active principal and require `verification-privacy:manage` under the exact plan-20 human/service-client rules. Resolve the
subject through plan 08 before clearing DTO values. Store stable IDs and encrypted resumable values only where the
approved workflow requires them; queue jobs and logs carry request ID and safe codes only. Identical replay returns the
same request; conflicting reuse returns `409` when plan 22 later exposes HTTP.

Implement the future `GET /v1/privacy/verification-requests/:id/export` controller behind the shared feature gate but
do not register it. When disabled, every authenticated or unauthenticated route probe resolves to the ordinary `404`.
A true flag fails initialization until plan 22 provides `verification.response-admission.v1`. Unit and integration tests call
the application commands and controller fixture directly with synthetic admission state; Bruno tests only concealment.

Capture subject generation, organization ingestion epoch, resource-manifest generation, and request build revision.
Collect bounded pages through purpose-specific PostgreSQL, BullMQ, and S3 ports. Normalize items to a versioned,
deterministically sorted document containing only category ID, source kind, allowed value, observed time, and safe
disposition/reason. Never include another organization/subject or an unapproved controller record.

Serialize a bounded authenticated-encrypted stream whose AAD binds organization, request ID, export revision, policy
version, captured generations, and expiry. Write to an opaque staging key such as
`organizations/<organizationId>/privacy-exports/<requestId>/staging/<revision>` and a durable staging registry row.
The S3 adapter consumes `CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN`; production rejects non-HTTPS storage and sends exactly:

    ServerSideEncryption: 'aws:kms'
    SSEKMSKeyId: security.kmsKeyId
    CacheControl: 'no-store'

After upload and integrity verification, execute one database transaction that locks the request/staging row and uses
one compare-and-set conditioned on the exact expected request build revision, subject generation, organization epoch,
resource-manifest generation, policy version, and `building|staged` state. The CAS records the immutable object version,
advances to `publish_prepared`, and acquires the plan-08 generation/resource publication reservation that prevents those
captured versions from changing before finalization. Zero affected rows means publication failed: mark the staging
registry `purge_prepared` when possible, delete the staged object immediately, and never write an available pointer.

Append and strongly verify a plan-33 `export_available` event carrying only aliases, captured versions, expiry, and a
sealed exact object-version selector. While authority state is unavailable or ambiguous, the `publish_prepared` revision
remains inaccessible. Then compare-and-set the exact `publish_prepared` state/reservation to `available`, recording event
ID, sequence, digest, and fence and releasing the reservation. A crash after append retries the same event and finalization. If the
reservation is conclusively stale or cannot finalize, keep the object inaccessible, append a deterministic
`export_publish_aborted`/`export_purge_required` event, and purge it; never reinterpret or edit the accepted available
event. If deletion is unknown/failed, a bounded orphan sweeper retries by opaque registry ID. A crash before preparation
leaves a staged row for the same sweeper, while a completed terminal compare-and-set leaves one truthful available
revision backed by its authority event.

At claim, require the same active organization principal and permission. Conceal foreign/missing requests. Atomically
transition one available, unexpired revision into the inaccessible `claim_prepared` state; concurrent, expired, prior-
claimed, or wrong-revision claims cannot open storage. Append and verify the deterministic `export_claimed` event before the local
terminal `claimed` compare-and-set and before opening storage. Stream with `Content-Type: application/json`, an opaque
filename, and exact no-cache headers. On pipeline success, disconnect, read/decrypt failure, response error, or expiry,
append and verify `export_purge_required`, then transition permanently to `purge_pending` and delete. Mark `purged` only
after S3 confirms the exact object version is absent and the `export_purged` event is verified. A deletion or authority
failure is inaccessible and retryable, never available. Same-transition retry resolves the same authority event.

Implement `VerificationAccessExportRestoreReconciler` as descriptor `verification.access-exports.v1`. First page every
restored revision that is not yet purged, make it inaccessible, and delete its exact owned object version. Then consume
every plan-33 event in `(backupIncludedHighWatermark, restoreTargetWatermark]` through the target, preserving event order and purging
the sealed exact object version for available, claimed, aborted, or purge-required lifecycle. This catches an export
whose creation or claim occurred after the restored database snapshot. Unknown event/key/schema, event gap, stale fence,
object version, ownership, key, state, or deletion result returns incomplete and keeps quarantine. The reconciler
records safe cursors/counts only, checkpoints the exact target, and never handles a correction event.

Update the processor contract, controller-evidence mapping, email-verification README, and
`bruno/privacy-requests/README.md`. Document that plan 22 owns first activation and enabled Bruno behavior.

## Interfaces and Dependencies

Add purpose-specific contracts equivalent to:

    interface VerificationAccessCollector {
        collect(input: {
            organizationId: string
            subjectId: string
            policyVersion: string
            snapshot: VerificationResourceSnapshot
        }): AsyncIterable<VerificationAccessItem>
    }

    interface VerificationPrivacyExportStore {
        stage(input: PrivacyExportWrite, security: CustomerObjectWriteSecurity): Promise<StagedObjectVersion>
        openOwned(version: PublishedObjectVersion): Promise<Readable>
        deleteOwned(version: OwnedObjectVersion): Promise<'absent' | 'deleted' | 'unknown'>
    }

    interface VerificationExportPublisher {
        publish(input: {
            requestId: string
            expectedBuildRevision: number
            expectedSubjectGeneration: number
            expectedOrganizationEpoch: number
            expectedManifestGeneration: number
            stagedObject: StagedObjectVersion
        }): Promise<'published' | 'stale'>
    }

The API composition root binds the shared plan-06 object-security value. Application/domain code imports only common
types and narrow ports, never AWS/configuration implementations. Plan 20 supplies the request aggregate, permission,
ownership, idempotency, and retry. Plan 15 supplies `RestoreReconciler`; this plan registers only
`verification.access-exports.v1`. Plan 33 supplies append-once acknowledgments, sealed minimum object-version
selectors, bounded event enumeration, and the restore target/fence; provider infrastructure stays behind its adapter.
Plan 31 separately registers correction replay.

## Acceptance Criteria

- Existing plan-20 permission, organization binding, concealment, idempotency, retry, and receipt rules apply to
  `access` without creating a second authorization model.
- The committed false flag leaves every verification privacy controller unregistered; true fails initialization without
  the exact plan-22 admission descriptor.
- Collection includes every contract-approved retained item for only one organization/subject and excludes secrets,
  raw control fingerprints, unapproved controller evidence, and other subjects.
- Publication succeeds only through one CAS over request revision, subject generation, organization epoch, manifest
  generation, policy, and state followed by a plan-08 publication reservation, verified plan-33 event, and terminal CAS.
  A stale/failed preparation or reservation purges the staged object and never makes any revision readable.
- Every production write uses authenticated HTTPS and exact KMS/no-store options through
  `CustomerObjectWriteSecurity`; omitted, overridden, or insecure values fail.
- Availability never exceeds 24 hours. One authenticated organization claim can stream one revision; no presigned URL
  exists; concurrent, foreign, expired, consumed, failed, and old-revision claims cannot read it.
- Every stream has exact no-cache headers. Successful, failed, disconnected, expired, and failed-CAS staged revisions
  reach confirmed physical absence; deletion uncertainty remains inaccessible and retryable.
- Every available, claimed, purge-required, and purged transition has one read-after-write-verified plan-33 event before
  its local terminal state. Authority outage/ambiguity remains inaccessible and nonterminal; append success followed by
  a local crash retries the same event, while a stale publish reservation appends abort/purge-required and never exposes
  the object.
- A restored generation remains quarantined until `verification.access-exports.v1` invalidates and purges every
  restored export revision and every object named by authority events through the fixed target; it never performs
  correction replay.
- No correction, response clock, activation, DROP, controller-rights implementation, migration, production rollout,
  credit effect, external probe, or compliance claim is added.
- Focused, object-security, PostgreSQL, S3, authorization, CAS/concurrency, restore, architecture, build,
  documentation, default-off Bruno, and whitespace checks pass.

## Validation

Run access policy, collection, publication, storage, and restore suites:

    corepack pnpm privacy:verification-access-policy-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-privacy-access verification-export-publication customer-object-write-security --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_privacy_access_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-access.integration.spec.ts verification-privacy-export.integration.spec.ts verification-access-restore.integration.spec.ts --runInBand

Use two organizations sharing an address and multi-subject artifacts. Cover empty, partial, restricted, suppressed,
expired, and concurrently changing snapshots, with every final CAS field changed alone. Cover CAS/upload/delete crashes,
exact AWS parameters, authenticated-encryption tampering, object ownership, claim races, exact response headers, and
disconnect/read failures. Also cover a new revision after purge, expiry, and restore invalidation. Assert a failed CAS
never produces `available`.

Cover authority failure before and after provider acceptance, append success before local terminal crash, stale
publication-reservation abort, claim-before-stream ordering, and purge confirmation before the purged event/state. Use a
backup predating available and claimed transitions; require bounded event replay, exact object purge, target checkpoint,
and fail-closed release for a missing event/key, stale fence, or authority outage.

Inspect `lef-api-1` ownership before runtime work. Against an owned disposable project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer

With the committed default, require ordinary `404` for unauthenticated, owner, service-client, and platform-admin
probes of intake, status, retry, withdrawal, and export. Do not enable the routes in this PR. Return to the repository
root before final checks.

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/21-fulfill-verification-access-and-correction.md
    corepack pnpm exec prettier --check config/privacy/verification-access-policy.yaml docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/21-fulfill-verification-access-and-correction.md
    git diff --check

Bruno: extend `bruno/privacy-requests` only to prove the committed feature is concealed/default-off. Plan 22 owns all
enabled access, export, authorization, ownership, idempotency, header, one-time claim, and purge cases.

## Idempotence and Recovery

Snapshots, candidates, staging object versions, and published revisions are immutable. Retrying a changed snapshot
discards the candidate. Publication preparation and the plan-08 reservation isolate the authority-first transition; the
terminal CAS makes one exact acknowledged revision available once. A stale reservation cannot publish and converges on
an append-only abort/purge-required event. One request can build a later revision only after the prior revision is
inaccessible and physical purge is pending or confirmed.

The staging registry lets a bounded sweeper recover a crash before publication. Delete treats confirmed absence of the
exact owned object version as success; unknown location/version/ownership remains blocked. Claim is one CAS, and every
terminal pipeline outcome converges on purge. Each lifecycle event uses a deterministic authority identity, so a lost
acknowledgment or local crash retries without duplication. Restore replay invalidates rather than re-exposes a restored
revision.

Never recover by marking a failed-CAS object available, returning an object URL, replaying a claimed export, marking
purge complete before confirmed absence, editing a captured generation, enabling HTTP before plan 22, or deleting a
broad object prefix. For incompatible synchronized development state, verify Compose ownership and reset/reseed only
the owned disposable project.

## Artifacts and Notes

Record policy/export-format versions, synthetic request/subject/export IDs, opaque key shapes, captured/CAS generation
values, safe authority event/sequence/fence and stream-state transitions, exact AWS/header assertions, and purge/restore
checkpoints. Also record focused/integration totals and Bruno default-off totals. Never record export content, raw
addresses beyond committed local fixtures, ciphertext, HMAC digests, keys/KMS IDs, credentials, customer identity, or
private legal/contract evidence.

## Plan readiness

Ready to implement
