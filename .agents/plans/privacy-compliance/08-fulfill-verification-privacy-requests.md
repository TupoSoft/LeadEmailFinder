# Establish Durable Verification-Subject Write Gates

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give every customer-verification write one durable, organization-scoped subject identity and one concurrency boundary
that later privacy actions can close safely. After this change, synchronous, asynchronous, and batch processing cannot
write PostgreSQL state, publish BullMQ work, expose staged S3 data, or publish a batch-result pointer unless it holds a
current renewable lease for the affected subject generation. A close operation blocks new work, drains or reconciles
old work, and proves that no effect from an earlier generation can become visible after the subject closes or reopens.

The difficult observable case is a multipart batch whose bytes arrive before its subjects are known. Upload starts only
after an organization-scoped staged-ingestion lease is durably registered. Closing any subject temporarily blocks new
ingestion for that organization, increments the organization ingestion epoch, and drains every older preparse lease
until its subjects and resources are indexed or its staged bytes are removed. Batch-result publication compare-and-
sets both the captured organization epoch and every included subject generation. Therefore, a pre-erasure upload or
result can never publish after erasure and cannot become valid merely because plain erasure later reopens the subject.

This pull request exposes framework-free write-gate and close primitives for later plans. It does not accept a privacy
request, select an action, erase or restrict a subject for a customer, create an access export, calculate a response
deadline, or return controller evidence.

## Progress

- [ ] (2026-08-30) Add stable organization/subject identities, versioned encryption and HMAC lookup rings, and safe
      rotation/retirement checks.
- [ ] (2026-08-30) Add the durable subject-generation gate, renewable writer leases, effect intents, and exact writer
      manifest.
- [ ] (2026-08-30) Add the organization ingestion epoch/barrier and preparse registration before multipart bytes.
- [ ] (2026-08-30) Integrate every synchronous, asynchronous, and batch PostgreSQL/BullMQ/S3 writer and result-pointer
      publication path.
- [ ] (2026-08-30) Add expired-lease and staged-effect reconciliation with deterministic crash recovery.
- [ ] (2026-08-30) Prove writer-first/close-first, upload-before-parse, pointer-before/after-close, crash, expiry,
      rotation, runtime, architecture, and full validation.

## Plan dependencies

- `privacy-compliance/03`
- `privacy-compliance/04`
- `privacy-compliance/07`

## Surprises & Discoveries

- A subject-only lock cannot cover a multipart upload because the application receives and stores bytes before it can
  resolve every row to a subject.
- Waiting for active jobs is insufficient. A crashed worker can leave a PostgreSQL intent, BullMQ job/result, staged
  object, or not-yet-published result revision after its lease expires.
- Reopening a subject after plain erasure cannot make an old staged result safe. Publication must compare immutable
  captured generations, not only the gate's current open/closed state.

## Decision Log

- Decision: Identify a verification subject by a stable UUID scoped to `(organizationId, normalizedAddress)` and keep
  HMAC aliases separate from that identity.
  Rationale: A stable ID preserves one gate and resource index across HMAC rotation; a digest cannot safely serve as
  both a lookup key that can be rotated and a durable concurrency identity.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Encrypt the normalized address with versioned AES-256-GCM and index it with aliases for every retained
  HMAC-SHA-256 lookup version. Bind ciphertext AAD to organization, subject ID, and schema version.
  Rationale: Later rights work needs exact organization-scoped lookup and controlled index regeneration without plaintext
  columns, queue payloads, or logs.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Retire an encryption version only after all referenced ciphertext is re-encrypted and its usage is zero;
  retire an HMAC version only after every required alias/reference is regenerated under retained versions and its
  usage is zero. Missing referenced versions fail startup.
  Rationale: Treating an unreadable subject or a subject that cannot be found as new would bypass a closed gate or later suppression.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require every address-bearing PostgreSQL, BullMQ, and S3 writer to appear in one versioned writer manifest.
  Each writer must acquire a current-generation renewable lease, record a durable effect intent, revalidate before its
  final durable effect, and release only after the effect is recorded.
  Rationale: A best-effort check at request intake does not serialize a running worker or object-pointer publication.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Acquire and durably register an organization-scoped staged-ingestion lease before multipart storage reads
  the first body byte. The lease captures the current ingestion epoch and owns the staging object identity.
  Rationale: Before CSV parsing there is no complete subject set, so only an organization barrier can account for the
  unknown bytes.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Beginning a subject close locks the organization barrier, blocks new staged ingestion, increments the
  organization epoch, increments the subject generation, and drains every preparse lease from the prior epoch. Each
  lease must either publish a complete subject/resource manifest or prove its staged resources absent.
  Rationale: A close must turn unparsed bytes into indexed resources or remove them before claiming a complete scan.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Reopen organization ingestion after prior-epoch preparse leases are resolved, even while the target
  subject remains closed. New parsing resolves subjects normally and is rejected by the target subject's gate.
  Rationale: A subject action may temporarily serialize one organization's uploads but must not indefinitely stop
  unrelated subjects.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Publish a batch-result pointer only with a compare-and-set over the captured organization epoch, the exact
  parsed-manifest digest, and every included subject ID/generation. A mismatch discards the staged revision and
  requires regeneration from current state.
  Rationale: An epoch or generation change permanently invalidates pre-close bytes, including after a later reopen.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat lease expiry as unknown, not clean. Each writer kind owns a deterministic reconciler that proves or
  removes its database, queue, staged-object, and pointer outcomes before a close can finish.
  Rationale: A process can crash after the external effect but before its checkpoint or lease release.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use TypeORM synchronization against disposable development data and add no migration, backfill, production
  rollout, or production recovery procedure.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

After privacy plan 04, `emails`, `email_verifications`, and `smtp_verifications` are organization-owned. Module-
architecture plan 14 completes the verification core/network composition, plans 11 and 15 layer synchronous and
asynchronous delivery, and plan 16 layers batch delivery and performs the final workflow composition. At that point,
verification orchestration is under `src/libs/modules/email-verification/src/application/`, HTTP delivery is under
`api/http/`, and TypeORM, BullMQ, CSV, SMTP/provider, and S3 mechanisms are under `infrastructure/`. Privacy plan 07,
which depends on module-architecture plan 16, adds organization-owned batch-artifact metadata and current-store
lifecycle removal before this plan integrates every writer.

Synchronous verification can debit credit, disclose an address to SMTP or an approved provider, and persist email,
SMTP, and verification rows. Asynchronous verification publishes an address-bearing BullMQ job and later performs the
same work. Batch verification stores a multipart CSV before parsing, publishes address-bearing child work, writes a
staged result CSV, and swaps a durable result pointer. These flows can overlap each other and a future privacy action.

A “subject generation” is a monotonically increasing version on one stable organization/subject gate. A “writer
lease” authorizes only the named writer, generation, and effect intent until its bounded expiry. An “organization
ingestion epoch” versions the set of uploads admitted before a close. A “preparse lease” accounts for an upload whose
full subject set is not known. A “resource manifest” maps a completed parse to every stable subject and every database,
queue, source-object, result-object, and pointer resource it can affect.

The single concurrency outcome of this plan is: no durable or externally visible effect captured before a subject
close may publish after that close begins or after that subject is reopened. Later plans can choose erasure,
suppression, restriction, access, or correction semantics only after this technical invariant exists.

## Scope and Non-Goals

Add private TypeORM persistence for stable subjects, lookup aliases, organization ingestion epochs, preparse leases,
subject gates/generations, writer leases, effect intents, and subject/resource manifests. Add framework-free domain and
application ports, key-ring loading and rotation checks, a source-controlled writer manifest and checker, and
infrastructure adapters for PostgreSQL, BullMQ, multipart/S3, verification workers, and result publication.

Integrate the gate before credit debit and external verification disclosure and around every address-bearing durable
write. Integrate the organization barrier before multipart bytes, subject indexing after parse, and epoch/generation
compare-and-set before result-pointer publication. Add bounded reconciliation for crashed/expired writers and staged
ingestion.

Do not add a privacy permission, customer endpoint, consumer endpoint, action policy, idempotency key for privacy requests, or
request receipt. Do not add erasure, restriction, suppression, objection/opt-out, withdrawal, access export, correction,
response clocks, extensions, disputes, appeals, escalations, DROP integration, or a controller-rights workflow. Do not
decide legal basis, evidence retention, customer terms, or exceptions. Plan 20 owns dispositions, plan 21 owns access,
plan 22 owns response clocks and activation, plan 31 owns correction, and plan 32 owns controller legal holds. Plan 33
owns the non-restored privacy-control authority/journal, backup-captured high-water marks, and restore reconciliation
fence. Plan 09 consumes plan 20. Do not add a migration, backfill, production activation, production restore, new
verification provider, or public compliance claim.

## Plan of Work

Create pure subject normalization and stable-identity types under
`src/libs/modules/email-verification/src/domain/privacy/`. Normalize with the same canonical address rule used by the
verification core, reject malformed values before identity creation, and scope every lookup to the authenticated
organization. Persist an opaque subject UUID, AES-GCM ciphertext, encryption version, and one alias per retained HMAC
version. Enforce unique `(organizationId, hmacVersion, digest)` aliases and never place plaintext or digests in logs.

Add validated file-secret settings:

    VERIFICATION_SUBJECT_ENCRYPTION_KEYRING_FILE
    VERIFICATION_SUBJECT_HMAC_KEYRING_FILE
    VERIFICATION_SUBJECT_WRITE_LEASE_SECONDS=60
    VERIFICATION_INGESTION_LEASE_SECONDS=300

Each ring contains `currentVersion` and a map of version IDs to `base64` 32-byte keys. New ciphertext uses only the
current encryption version; lookup computes all retained HMAC versions. When the application starts, it rejects duplicate key material,
malformed keys, an unknown referenced version, or a current version absent from the ring. Rotation commands re-encrypt
or regenerate aliases in bounded pages with compare-and-set checkpoints. Retirement is a separate checked transition
and remains blocked while any ciphertext, alias, gate, lease, resource manifest, or future registered reference
reports the version in use.

Add `config/privacy/verification-writer-manifest.yaml` with immutable manifest revision and one stable entry for every
synchronous, asynchronous, and batch writer or publisher. At minimum it covers verification intake before debit/probe,
email/verification/SMTP persistence, async publication and worker completion, batch input staging, parse/index,
child publication, result staging, result-pointer publication, and artifact rewrite/removal. The checker rejects a
duplicate or unknown writer ID, an unregistered binding, a writer without an expired-lease reconciler, and a manifest
revision that does not match runtime registration. Infrastructure implementations stay private; application code sees
only purpose-specific gate ports.

Implement `verification_subject_gates` with stable subject ID, state, monotonically increasing generation, close owner,
and timestamps. `open` admits a lease only at the current generation. `closing` and `closed` reject new leases.
Acquisition and the durable write intent commit in one PostgreSQL transaction. Heartbeat compares lease owner,
generation, status, and expiry. Before debit, external disclosure, queue publish, database commit, staged-object
promotion, or pointer swap, the writer calls `assertCurrent`; final effect/checkpoint uses a database compare-and-set.
Release is idempotent. Lock multiple resolved subjects in sorted UUID order.

Implement `verification_organization_ingestion_epochs`. Before the multipart storage engine consumes bytes, atomically
require `accepting`, create a preparse lease and input-artifact intent, and capture epoch `E`. The S3 key contains an
opaque ingestion ID, not an address. After upload, the parser resolves every unique normalized row to a stable subject,
captures each generation, and commits a complete manifest mapping row/resource references to subjects before it marks
the preparse lease indexed. A multi-subject source object remains one resource with per-subject membership metadata so
later deletion can stage a safe rewrite rather than delete another subject's rows.

Beginning a close locks the organization epoch row, changes it to non-accepting, advances `E` to `E+1`, and advances
the target subject generation in the same transaction. It then drains all preparse leases admitted at or before the
old epoch. A live parser can finish and index under its captured epoch; an expired parser is reconciled by completing a
bounded parse/index from the owned staged object or deleting the unreferenced object and recording absence. Unknown,
missing, or ambiguous resources keep the close incomplete. Once every prior lease is terminal and indexed or absent,
reopen organization ingestion at `E+1`; do not reopen the subject gate.

For parsed async and batch work, persist a manifest digest over sorted subject IDs, captured subject generations,
resource IDs, and organization epoch. Every child writer leases its subject generation. The result builder writes only
to a new staging revision. Result publication locks the organization epoch and all included subject gates in sorted
order, verifies exact epoch/generation/manifest equality, then compare-and-sets the canonical pointer. On any mismatch,
it leaves the old canonical pointer unchanged, deletes the unreferenced staged revision through the plan-07 artifact
workflow, and requires a fresh build. It never updates captured values to make an old result pass.

Add one bounded reconciliation application service. For each expired writer/preparse lease, dispatch by the exact
manifest writer ID and inspect only organization-owned intent/resources. It determines whether a PostgreSQL row
committed, a BullMQ job/result exists, an S3 revision exists, or a pointer changed; records or removes the effect;
and advances a monotonic checkpoint. An unknown mapper/store state remains blocking and alerts with safe IDs. A close
can return a sanitized outstanding summary but cannot finalize while any active, expired-unreconciled, staged, or
ambiguous effect remains.

Expose the close/drain/final-scan/reopen primitives only through the email-verification module's narrow public
application contract for plans 20, 21, 31, and 33. Terminal privacy actions from plans 20, 21, and 31 and legal-hold/
control events from plan 32 rely on plan 33 before terminal acknowledgment or restore release. Plan 33 is a downstream
consumer of this contract and an activation prerequisite for those terminal behaviors; it is not an implementation
dependency of this foundational plan. Do not expose an HTTP controller. Update module and privacy documentation,
preserve the module-only top-level barrel except for the explicitly approved application token/types, and keep all
TypeORM, BullMQ, AWS, crypto-file, and Nest implementations private.

## Interfaces and Dependencies

The application contracts are equivalent to:

    interface VerificationSubjectIdentityResolver {
        resolveOrCreate(input: {
            organizationId: string
            normalizedAddress: string
        }): Promise<{ subjectId: string }>
        resolve(input: {
            organizationId: string
            normalizedAddress: string
        }): Promise<{ subjectId: string } | null>
    }

    interface VerificationSubjectWriteGate {
        acquire(input: {
            subjectId: string
            writerId: string
            effectId: string
        }): Promise<SubjectWriteLease>
        heartbeat(leaseId: string): Promise<SubjectWriteLease>
        assertCurrent(leaseId: string): Promise<void>
        release(leaseId: string): Promise<void>
        beginClose(input: { subjectId: string; closeId: string }): Promise<SubjectCloseEpoch>
        inspect(close: SubjectCloseEpoch): Promise<OutstandingSubjectEffects>
        assertClean(close: SubjectCloseEpoch): Promise<void>
        reopen(input: { close: SubjectCloseEpoch; reasonCode: string }): Promise<void>
    }

    interface OrganizationIngestionBarrier {
        beginPreparse(input: { organizationId: string; ingestionId: string }): Promise<PreparseLease>
        registerManifest(input: ParsedIngestionManifest): Promise<void>
        heartbeat(leaseId: string): Promise<void>
        resolve(leaseId: string): Promise<void>
    }

    interface VerificationWriteRecovery {
        reconcileExpired(input: { organizationId: string; limit: number }): Promise<SanitizedRecoveryProgress>
    }

`SubjectWriteLease` carries lease ID, writer ID, subject ID, generation, expiry, and opaque operation ID. A parsed
manifest carries organization ID/epoch, sorted subject generation snapshots, resource IDs, and a digest, never a raw
address. The close primitive owns the organization epoch transition internally; callers cannot supply an epoch or
generation.

Plan 03 supplies PII-safe logging and errors. Plan 04 supplies organization-owned verification persistence. Plan 07
supplies the batch-artifact registry, bounded S3 removal, and current-store lifecycle ports reused for staged-resource
recovery. Existing Node crypto, TypeORM, BullMQ, AWS SDK, Nest, and YAML/Zod tooling are sufficient. No new package or
external provider is planned.

## Acceptance Criteria

- One organization/normalized address resolves to one stable subject UUID across retained HMAC versions; the same
  address in another organization resolves to a different subject and gate.
- Ciphertexts and aliases are versioned; lookup covers every retained HMAC version. Tampered ciphertext and missing
  referenced versions produce a fail-closed result without address/digest/key disclosure.
- Encryption retirement is blocked until ciphertext usage is zero; HMAC retirement is blocked until all required
  aliases/references have safe retained-version replacements and usage is zero.
- Every synchronous, asynchronous, and batch PostgreSQL/BullMQ/S3 writer and final publisher is in the exact runtime/
  source manifest, holds a renewable current-generation lease, records an effect intent, revalidates before its final
  effect, and has an expired-lease reconciler.
- If the writer obtains its lease first, close blocks new work, waits for or reconciles that effect, and reaches clean
  only after the effect is accounted for. If close wins first, the writer is rejected before debit, external probe,
  queue publication, database commit, object promotion, or pointer swap.
- Multipart storage accepts no byte before a durable preparse lease captures the current organization epoch and owns
  the staging resource.
- Closing a subject blocks new organization ingestion, advances organization epoch and subject generation, and does
  not unblock ingestion until every prior-epoch preparse lease has a complete subject/resource index or proven-absent
  staged resources.
- A source object containing multiple subjects records every membership. Closing one subject never deletes or hides
  another subject's data merely because they share an object.
- Batch-result publication succeeds only when captured organization epoch, manifest digest, and every subject
  generation still match. Pointer publication before, during, and after close/reopen cannot expose pre-close bytes.
- A crashed writer/parser and expired lease remain blocking until PostgreSQL, BullMQ, staged S3, and pointer effects
  are reconciled. Unknown state is not treated as absence and no clean checkpoint is fabricated.
- Close, drain, reconciliation, final scan, and reopen are idempotent for the same IDs and compare expected generation;
  overlapping close attempts cannot create two generations or reopen another caller's close.
- Normal open-gate verification preserves existing HTTP, credit, queue, CSV, result, retention, provider, and secure-
  transport behavior.
- No privacy-request endpoint/action/export/deadline, DROP behavior, migration, production rollout, or compliance claim
  is introduced.
- Focused, manifest, crypto, PostgreSQL, Redis, S3, concurrency, runtime, architecture, full, build, documentation,
  Bruno-regression, and whitespace checks pass.

## Validation

Run the manifest, domain, crypto, gate, ingestion, and adapter suites:

    corepack pnpm privacy:verification-writer-manifest-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-subject-identity verification-subject-write-gate verification-ingestion-barrier verification-write-recovery --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_verification_gate_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-subject-write-gate.integration.spec.ts verification-ingestion-barrier.integration.spec.ts --runInBand

Use fake clocks and delayed adapters to test every writer in both orderings. Crash before and after debit/probe intent,
queue publication, PostgreSQL commit, S3 staging, manifest registration, and pointer compare-and-set. Expire leases and
prove recovery accounts for the exact effect before clean. Test two organizations sharing an address and multiple
subjects sharing one source/result object.

For upload-before-parse, pause after the first bytes, begin a close, and prove later uploads are rejected while the
old lease is drained. Cover successful indexing, malformed CSV, parser crash, lease expiry with staged bytes, deletion
failure, and ambiguous object state. For result publication, stage under epoch `E`, close and reopen the target, then
prove the old `E`/generation can never publish; only a newly generated manifest at the current epoch can succeed.

Test current/previous encryption reads, re-encryption, all-version HMAC lookup, alias regeneration, duplicate material,
tampering, missing referenced versions, concurrent rotation, and prohibited/allowed retirement. Assert no logs,
errors, queue metadata, manifests, or metrics contain a raw address, ciphertext, digest, key, SMTP/provider payload, or
object contents.

Inspect `lef-api-1` ownership. Against an owned disposable Compose project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    docker run --rm --network lef_default -v "$(pwd)/bruno/smtp-dev:/collection" -e OIDC_ISSUER_URL="http://keycloak:8080/realms/lead-email-finder" -e KEYCLOAK_SERVICE_CLIENT_ID="lef-development-service" -e KEYCLOAK_SERVICE_CLIENT_SECRET="$(jq -r .clientSecret .dev/keycloak/service-client.json)" -e PLATFORM_ORGANIZATION_ID="$(jq -r .organizationId .dev/keycloak/service-credential.json)" node:22-alpine sh -c "cd /collection && npm install -g @usebruno/cli && bru run --env local --sandbox developer --env-var baseUrl=http://api:3000"

Fetch the seeded customer client's secret exactly as documented for the batch collection, then run:

    export OIDC_ISSUER_URL=$(jq -r .issuer .dev/keycloak/service-client.json)
    export CUSTOMER_SERVICE_CLIENT_ID=lef-svc-dev-fixture
    ORG_ADMIN_ID=$(jq -r .clientId .dev/keycloak/org-admin-client.json)
    ORG_ADMIN_SECRET=$(jq -r .clientSecret .dev/keycloak/org-admin-client.json)
    ADMIN_TOKEN=$(curl -s --data-urlencode grant_type=client_credentials --data-urlencode "client_id=${ORG_ADMIN_ID}" --data-urlencode "client_secret=${ORG_ADMIN_SECRET}" "${OIDC_ISSUER_URL}/protocol/openid-connect/token" | jq -r .access_token)
    INTERNAL_ID=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" "http://localhost:58080/admin/realms/lead-email-finder/clients?clientId=${CUSTOMER_SERVICE_CLIENT_ID}" | jq -r '.[0].id')
    export CUSTOMER_SERVICE_CLIENT_SECRET=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" "http://localhost:58080/admin/realms/lead-email-finder/clients/${INTERNAL_ID}/client-secret" | jq -r .value)
    cd bruno/batch-verification
    npx @usebruno/cli run --env local --sandbox developer

Require normal open-gate sync/async/batch behavior, credit effects, secure SMTP, upload, progress, durable result,
ownership, and retention to work. Return to the repository root before final checks. No new Bruno collection is added
because this plan adds no privacy HTTP surface.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check config/privacy/verification-writer-manifest.yaml src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/08-fulfill-verification-privacy-requests.md
    git diff --check

Bruno: do not add a collection; require the existing SMTP and batch-verification collections to pass because all
verification writers and multipart/result storage paths gain gate wiring.

## Idempotence and Recovery

Identity resolution, alias generation, lease acquisition/release, close, preparse registration, manifest registration,
and recovery use unique identities and compare-and-set transitions. Repeating an exact operation returns the existing
state. A stale generation, epoch, lease, manifest digest, or close owner cannot be updated to current implicitly.

Writer and preparse expiry never means success. Resume reconciliation from the durable effect intent and writer ID.
Delete only an organization-owned, unreferenced staged revision; never delete a broad prefix. A failed close remains
closed and retryable. Organization ingestion remains blocked only while unresolved preparse state exists; after that
state is indexed or absent it reopens at the advanced epoch, while the subject remains closed for the caller.

Rotation adds before it removes: add a key, backfill/re-encrypt in bounded pages, verify reference counts, make it
current where applicable, then request retirement. A missing referenced key prevents the application from starting and
produces a fail-closed recovery result.
Never recover by copying a digest to another version, treating unreadable state as a new subject, bypassing a writer,
editing an epoch, flushing shared Redis, deleting broad S3 data, or resetting an environment another checkout owns.

For incompatible synchronized development state, inspect Compose ownership and use the repository's explicit owned
reset/reseed workflow. Preserve unrelated edits and record any writer discovered outside the manifest before adding it;
do not silently let it write.

## Artifacts and Notes

Record manifest/key schema versions, stable writer IDs, synthetic organization/subject/lease/ingestion IDs, generation
transitions, epoch transitions, sanitized outstanding-effect counts, rotation usage counts, reconciliation checkpoints, focused
and integration totals, and Bruno totals. Never record raw addresses beyond existing local fixtures, ciphertext,
digests, key material, SMTP/provider payloads, queue payloads, CSV contents, object contents, credentials, or private
legal evidence.

## Plan readiness

Ready to implement
