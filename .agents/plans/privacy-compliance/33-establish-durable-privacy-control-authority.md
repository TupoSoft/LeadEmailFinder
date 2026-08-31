# Establish the Durable Privacy-Control Authority

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prevent an older PostgreSQL restore from erasing evidence of a privacy request, disposition, correction, export
lifecycle, controller action, or legal-hold transition that happened after the backup was captured. After this change,
LeadEmailFinder has one real, provider-backed, append-only privacy-control authority outside every application database,
cache, object store, session boundary, and application backup set. A local workflow cannot report a terminal outcome
until the authority has durably accepted and read-after-write verified its minimal event.

The authority assigns a monotonic sequence and fencing epoch, records the highest contiguous sequence incorporated into
each eligible application backup, and atomically freezes a restore target watermark while fencing old writers. Restore
reconcilers enumerate the bounded interval after the backup watermark through that target. Plan 15 keeps the restored
generation quarantined unless the stream is complete, the fence is current, and every required consumer checkpoint has
reached the exact target.

A developer can observe a synthetic backup taken before a disposition, correction, export claim, controller action, or
legal-hold change restore into quarantine; replay the later authority events in bounded pages; and release only after
all registered consumers converge. Authority outage, an ambiguous append, a missing capture watermark, an event gap, an
unknown key version, or a stale fence keeps both the originating operation and restore release closed.

## Progress

- [ ] (2026-08-30) Obtain the exact Security and Operations provider, identity, credential, key, durability, retention,
      region, transfer, audit, ordering, read-after-write, and conditional-write decisions.
- [ ] (2026-08-30) Record the binding implementation-size projection and either approve this single-PR boundary or
      replace it with smaller numbered ExecPlans before product-code edits begin.
- [ ] (2026-08-30) Add the layered privacy-control-authority module, strict configuration, real selected-provider
      adapter, and deterministic local test adapter.
- [ ] (2026-08-30) Implement idempotent append-before-terminal events, minimal pseudonymous schemas, external key
      versions, bounded ordered reads, and consumer registration.
- [ ] (2026-08-30) Implement backup capture tickets, included high-water marks, restore target fencing, consumer
      checkpoints, and fail-closed plan-15 release integration.
- [ ] (2026-08-30) Integrate exact consumer contracts for plans 18, 20, 21, 22, 31, and 32 without implementing those
      plans' data-owner mutations.
- [ ] (2026-08-30) Complete provider-contract, failure, idempotency, concurrency, backup-race, restore, architecture,
      full, build, and documentation validation.

## Plan dependencies

- `privacy-compliance/11`
- `privacy-compliance/12`
- `privacy-compliance/15`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use one real, append-only authority whose data plane, credentials, pseudonymization keys, encryption keys,
  retention controls, and recovery path are outside PostgreSQL, Redis, S3, application sessions, and every application
  backup or restore boundary covered by plans 11 and 15. A fake or in-memory adapter is permitted only in local tests;
  non-local startup and restore release fail if the selected real adapter is absent or mismatched.
  Rationale: A marker restored from the same older application backup cannot prove that a later privacy-control event
  occurred. An interface without a real independently durable provider leaves the same failure intact.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Assign every accepted event one monotonically increasing sequence within the configured authority stream and
  one authority epoch. Deduplicate by event identity and an immutable input digest; identical retries return the original
  acknowledgment, while conflicting reuse is rejected.
  Rationale: Restore needs an ordered, bounded, gap-detectable history, and an ambiguous network result must be safely
  resolvable without duplicating or reinterpreting an effect.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: No privacy workflow may expose a terminal response, receipt, disposition, correction, export state,
  controller action, or legal-hold transition until its authority event is durably appended. The event sequence, digest,
  and fence must be read-after-write verified, and local state records that acknowledgment in its terminal compare-and-set.
  Rationale: Appending after terminal state leaves a crash window in which the result is visible but absent from a later
  restore. Append-before-terminal plus idempotent retry closes that window.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat an authority acknowledgment followed by a failed local terminal compare-and-set as recoverable, not
  rollback. A retry reads the same event and converges the local projection; local nonterminal state remains conservative
  until then.
  Rationale: There is no distributed transaction across the application database and external authority. Immutable,
  idempotent authority-first completion gives the safe failure ordering.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store only pseudonymous and purpose-minimal records. These records include stable organization and subject
  alias IDs, versioned keyed identifiers, safe event/item/action/policy/outcome/reason codes, local generation and fence,
  source/recovery-copy evidence IDs, timestamps, and a retention floor. Include an encrypted minimum reconciliation selector
  only when stable aliases cannot locate restored state. Never store raw addresses, names, account data, export contents
  or URLs, legal narrative, provider payloads, credentials, or private evidence.
  Rationale: Restore durability must not become an unrestricted identity, export, or legal-case store.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep pseudonymization and selector-envelope key versions outside restored stores and retain each version
  until every backup capable of resurrecting an event it protects has irreversibly expired or been destroyed. Unknown
  key or backup coverage blocks compaction and restore release.
  Rationale: An external event that can no longer address the restored subject or scope cannot prevent resurrection.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Define a backup's privacy-control included high-water mark as the highest contiguous authority sequence whose
  local effects and projections are incorporated into the capture. Bind it through an external capture ticket to the
  immutable provider backup-generation metadata. The watermark may lag the authority head but may never skip a gap.
  Rationale: A lagging contiguous watermark is safe because restore can replay later events; an optimistic or unbound
  watermark can silently omit required work.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: At restore declaration, the external authority atomically advances the epoch, rejects old-epoch appends, and
  fixes the restore target watermark at the final head of the fenced epoch. Release requires exact backup-capture
  evidence and every required consumer at that fixed target.
  Rationale: Without a stable target and writer fence, events can race past reconciliation forever or terminal on the
  old application generation after the release proof was calculated.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require a binding size gate before implementation. Security, Operations, and the repository maintainer must
  approve one exact provider-backed file projection and count its expected non-Markdown additions plus deletions. If the
  projection is at most 999 lines, record the `one_pr` decision and implement this plan as one pull request. If it is
  1,000 lines or more, stop before product-code edits, replace this plan in the road map with smaller numbered ExecPlans
  that separate authority/provider append from backup/restore integration, and point every consumer at the final
  activation plan.
  Rationale: Provider-backed durability and restore fencing are one outcome only while the repository can review them
  within its non-XL delivery policy. The gate is binding rather than an invitation to weaken size enforcement later.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add no migration, backfill, production provisioning, real backup/restore, high-availability rollout, or
  recovery/compliance claim.
  Rationale: The repository has no production environment; this pull request proves the selected provider contract and
  disposable integration only.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plans 20, 31, and 18 currently require durable local markers before terminal outcomes. Plan 21 stores export lifecycle
in application state, plan 22 stores accepted request clocks and support events there, and plan 32 stores legal holds in
TypeORM. Those controls are useful current-state projections, but an older PostgreSQL restore can predate all of them.
The restored database therefore cannot be the authority that enumerates events after its own capture.

Plan 11 inventories managed application backup boundaries and immutable provider generation metadata. Plan 15 supplies
restore declaration, quarantine, bounded reconcilers, external operator assertions, checkpoints, and compare-and-set
release. Neither plan stores a non-restored history of post-capture privacy-control events. This plan supplies that
missing authority and extends their contracts without taking over provider backup policy or data-owner reconciliation.

An authority event is an immutable control fact, not a copy of the underlying personal data. A local projection is a
query and workflow cache that can be rebuilt from authority events plus approved application state. A terminal state is
one exposed as completed, rejected, withdrawn, available, claimed, purged, released, expired, or otherwise final to an
API caller, worker, receipt, or data-owner workflow. Nonterminal prepared or manual states remain conservative.

The required event families and restore consumers are:

- `verification.request-control.v1` for admission, immutable contract deadline, terminal request, extension/notice,
  support, and appeal events owned by plan 22;
- `verification.subject-dispositions.v1` for disposition and withdrawal events owned by plan 20;
- `verification.access-exports.v1` for available, claimed, purge-required, and purged export events owned by plan 21;
- `verification.subject-corrections.v1` for correction and disposition-resolution events owned by plan 31;
- `controller.data-lifecycle.v1` for controller request/action terminal and retention-disposition events owned by plan
  18; and
- `controller.legal-hold-events.v1` for hold create, renew, release, expire, and current-set projection events owned by
  plan 32.

This plan also registers `privacy.control-authority.v1`, which validates the authority epoch, capture ticket, stream
continuity, target watermark, and exact consumer registry. Each data-owner consumer remains responsible for applying its
own event family and advancing its checkpoint across every sequence through the common target, including safe skips for
unowned event kinds.

## Scope and Non-Goals

Create `src/libs/modules/privacy-control-authority/` with canonical API, application, domain, and infrastructure layers
and a narrow public barrel. Add strict source-controlled non-secret configuration under
`config/privacy/privacy-control-authority.yaml` and the exact provider adapter and dependency selected by Security and
Operations. Add external pseudonymization and selector-envelope key integration; append, read, capture, fence, and
target ports; consumer registration; plan-11 generation-metadata binding; and plan-15 restore context/release
integration. Add module documentation and focused provider-contract/integration tests.

Define the event envelopes and consumer descriptors needed by plans 18, 20, 21, 22, 31, and 32, but do not implement
their HTTP workflows, data mutations, export objects, correction algorithm, controller adapters, or hold administration.
Do not store raw personal data, replace audit or legal evidence systems, mutate immutable backup media, or take or
restore a real backup. Do not select a provider in code before approval, add migrations/backfills, deploy production
infrastructure, or claim production recovery, legal compliance, or high availability.

## Plan of Work

First obtain and record the exact selected provider and adapter contract. The decision must identify the endpoint or
service and its account/project. It must identify the region and recipient and record the transfer approval. It must
also identify the workload identity and any read-only mounted credential path. It must name the network boundary,
encryption/key owners, and write/read/audit
roles. Document these facts separately: the durability/availability commitment; retention/deletion controls; provider
recovery independence; and incident owner. The decision must prove strongly consistent
read-after-write for one event, conditional create or equivalent idempotency, monotonic ordering for the configured
stream, stable bounded pagination, and an atomic epoch-fence/target operation. Reject a provider that cannot satisfy any
required capability; do not emulate durability with restored PostgreSQL, Redis, S3, logs, or an in-memory adapter.

Before product-code changes, list every projected non-Markdown file and record expected additions plus deletions in this
plan's Artifacts section. Apply the Decision Log threshold exactly. If the projection is too large, update the road map
and downstream dependency keys before starting implementation; do not merge an interface-only placeholder under this
plan.

Build the module around immutable `PrivacyControlEvent`, `PrivacyControlAcknowledgement`, `AuthorityEpoch`,
`AuthoritySequence`, `BackupCaptureTicket`, `RestoreTarget`, and consumer-checkpoint values. Domain/application code
depends on purpose-specific authority ports; the selected provider SDK, credentials, serialization, and retry policy stay
in infrastructure. The API composition root binds exactly one real adapter outside local test and rejects initialization for a
fake, absent, duplicate, capability-mismatched, or restored-store adapter.

Validate `config/privacy/privacy-control-authority.yaml` with one versioned stream ID; event-schema and consumer
descriptor versions; provider adapter/capability ID; maximum page size; exact pseudonymization and envelope-key version
references; retention-floor policy; and the plan-11 backup-store IDs that must carry capture evidence. Reject unknown
fields, placeholders, secrets, duplicate event or consumer IDs, an incomplete required consumer set, and configuration
changes without a revision. Non-local credentials and keys come only from the approved external identity or read-only
mount and never from YAML or restored application stores.

Implement `appendOnce` so `(operationId, eventKind)` and an immutable canonical digest identify one event. A first
accepted append receives the authority's next sequence and current epoch. A same-input retry returns the same event and
acknowledgment; a different digest for the same identity returns conflict. Verify the event by a strongly consistent
read before returning the acknowledgment. A timeout or unknown write result triggers a lookup by identity; if neither
accepted nor conclusively absent, return ambiguous and keep local state nonterminal.

Use a versioned minimal envelope. It contains event, operation, schema, organization-alias, optional subject-alias,
item, action, policy, outcome, safe reason, local generation/fence, event time, authority sequence/epoch, retention floor,
and source-evidence IDs. Include a sealed minimum selector only when an approved consumer cannot locate restored state by
stable alias. Build aliases with externally mounted versioned keys and bind ciphertext to event/schema/organization as
authenticated data. Logs, metrics, errors, cursors, and receipts contain safe IDs and counts only.

Provide one append-before-terminal helper that consumers call after the authoritative resource effect is known but
before the local terminal compare-and-set or response. It appends and verifies the authority event, then lets the local
transaction record event ID, sequence, digest, and epoch/fence in terminal state. If local finalization loses a race or
crashes, retry obtains the same event and converges. If append is unavailable, conflicting, ambiguous, or stale-fenced,
the local operation remains prepared, pending, or manual and exposes no terminal success. Changes that reverse or amend
an earlier control append a new event; they never edit an existing event.

Track one local projection checkpoint per required consumer. The application included high-water mark is the highest
contiguous authority sequence through which every registered consumer version has applied or safely skipped its event.
Gaps, unknown schemas, missing key versions, or incomplete consumer work prevent advancement. To capture a backup,
create an external capture ticket for the intended source store and included high-water mark. Persist the ticket ID,
authority epoch, watermark, schema/consumer-set digest, and ticket digest in the application snapshot marker. Then ask
the approved plan-11 provider workflow to capture the backup. After the provider confirms its immutable generation ID
and metadata, finalize the external ticket with that generation and evidence version. Missing, not-yet-final, mismatched,
gapped, or overwritten tickets make the backup ineligible for restore release.

Extend `BackupGenerationMetadataReader` so it returns the immutable provider generation plus the externally finalized
capture ticket, authority stream/epoch, included high-water mark, and schema/consumer-set digest. The highest included
sequence may lag the authority head. A local effect after that watermark is safe because its event is replayed; an event
already reflected in the snapshot is also safe because consumer application and checkpoints are idempotent.

At quarantined restore declaration, call the external authority with source store, provider backup generation, capture
ticket, and new restore-generation ID. In one provider-authoritative conditional operation, validate the ticket, advance
the authority epoch, reject all prior-epoch writers, and fix `restoreTargetWatermark` to the final prior-epoch stream
head. The same-input retry returns the same target and fence; a conflicting restore identity is rejected. Keep ordinary
traffic, workers, and privacy-control administration closed while the target is being established or reconciled.

Snapshot `privacy.control-authority.v1` and every required consumer descriptor/version into the plan-15 generation. Each
consumer reads deterministic pages for the exact interval `(backupIncludedHighWatermark, restoreTargetWatermark]`,
verifies consecutive sequences and the target fence, applies or safely skips each event by schema, and compare-and-sets
its checkpoint. Release requires the authority to confirm the unchanged target and current restore fence, the central
stream validator to find no gap, and every snapshotted consumer checkpoint to equal the target. Authority outage,
cursor ambiguity, a missing event/schema/consumer/key, checkpoint mismatch, an old writer, or any data-owner reconciler
failure keeps quarantine without an override.

Document provider ownership, credential/key rotation, event retention, consumer/schema rollout order, capacity, and page
limits, capture-ticket operations, fail-closed alerts, and safe local fixture reset. Retain each event and required key
version through the later of its approved controller-evidence lifecycle and the irreversible expiry/destruction of every
backup it protects. Compaction requires externally proven coverage and appends an auditable compaction boundary; it
never relies on local marker deletion alone.

## Interfaces and Dependencies

The narrow public contracts are equivalent to:

    interface PrivacyControlAuthority {
        readonly descriptor: { id: 'privacy.control-authority.v1'; version: string }
        appendOnce(input: PrivacyControlAppend): Promise<PrivacyControlAcknowledgement>
        readRange(input: {
            afterSequence: string
            throughSequence: string
            cursor: string | null
            limit: number
            authorityEpoch: string
        }): Promise<PrivacyControlEventPage>
        beginBackupCapture(input: BackupCaptureInput): Promise<BackupCaptureTicket>
        finalizeBackupCapture(input: FinalizeBackupCaptureInput): Promise<FinalizedBackupCapture>
        fenceForRestore(input: RestoreFenceInput): Promise<RestoreTarget>
        confirmRestoreTarget(input: RestoreTargetIdentity): Promise<RestoreTarget>
    }

    interface PrivacyControlAcknowledgement {
        eventId: string
        operationId: string
        eventKind: string
        authoritySequence: string
        authorityEpoch: string
        canonicalDigest: string
        retainedUntil: Date
        evidenceVersion: string
    }

    interface PrivacyControlConsumer {
        readonly descriptor: { id: string; version: string; eventSchemaVersions: string[] }
        apply(input: {
            restoreGenerationId: string
            event: PrivacyControlEvent
            expectedCheckpoint: string
        }): Promise<'applied' | 'already_applied' | 'safely_skipped'>
    }

`PrivacyControlEventPage` contains an ordered bounded event list, the page's first and last sequences, next opaque
cursor, completion flag, and target digest. Sequence and epoch are opaque decimal/string values and are compared only by
the authority adapter's domain value. No consumer imports the selected provider SDK or authority infrastructure.

Plan 11 supplies exact backup-store and generation-metadata boundaries. Plan 12 supplies approved controller-evidence
classification and lifecycle references. Plan 15 supplies restore quarantine, assertion authorization, descriptor
snapshotting, checkpoints, and release CAS. Plans 18, 20, 21, 22, 31, and 32 depend on this plan and implement their own
event producers and restore consumers. The selected provider library and configuration are implementation inputs that
must be recorded in the readiness decision; no provider is inferred from current PostgreSQL, Redis, S3, or cloud use.

## Acceptance Criteria

- Non-local startup binds the exact Security/Operations-approved real provider and fails for an absent, fake, restored-
  store, capability-mismatched, duplicate, or stale configuration. Local tests may bind only the named deterministic
  fake.
- A first append returns a strongly read-after-write-verified sequence, digest, and current fence. Same-input replay
  returns exactly that event; conflicting reuse fails; timeout/unknown results never permit local terminal state.
- Every protected workflow proves the event acknowledgment is recorded before its terminal local compare-and-set and
  response. A crash after append but before local finalization retries to the same event and converges without duplicate
  effect.
- Events contain only the approved pseudonymous/minimal fields. Raw addresses, names, account values, export content or
  URL, legal narrative, provider payloads, credentials, and private evidence are rejected and absent from storage,
  logs, metrics, and errors.
- Alias and selector key versions remain available while any protected backup can be restored. Missing keys, unknown
  event schemas, stream gaps, stale epochs, and ambiguous pages block checkpoint advancement and release.
- Each eligible backup carries an externally finalized capture ticket bound to its immutable provider generation,
  authority epoch, highest contiguous included sequence, and schema/consumer-set digest. Missing or mismatched evidence
  makes the backup ineligible for release.
- Capture races before, between, and after event append and local terminal finalization preserve a conservative included
  watermark. Replay is idempotent whether the snapshot contains none, some, or all of an event's local effects.
- Restore declaration atomically fences the prior epoch and fixes one target at its final head. Old writers cannot append
  or terminal after the fence, and identical declaration retry returns the same target.
- Reads enumerate deterministic pages over exactly `(includedHighWatermark, targetWatermark]`, detect every gap or
  cursor/target mismatch, and do not require unbounded in-memory loading.
- A backup predating each disposition/withdrawal, export lifecycle, correction, request/deadline/support, controller
  action/retention disposition, and legal-hold transition remains quarantined until its exact consumer replays the event.
- Release fails unless `privacy.control-authority.v1` validates the live target/fence and every snapshotted required
  consumer checkpoint equals that target. Provider outage, missing consumer, unknown event/key, stale fence, or local
  reconciliation failure has no override.
- Provider-contract, focused, failure, idempotency, concurrency, backup-capture, restore, architecture, full, build,
  documentation, formatting, and whitespace checks pass.
- The pull request adds no migration, backfill, real backup/restore, production provisioning/rollout, public HTTP
  behavior, high-availability promise, compliance certification, or recovery claim.

## Validation

Run exact configuration, architecture, domain, provider-contract, and integration suites:

    corepack pnpm privacy:control-authority-readiness-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- privacy-control-authority privacy-control-consumer privacy-control-backup-capture privacy-control-restore-fence --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_privacy_control_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- privacy-control-authority.integration.spec.ts privacy-control-backup-restore.integration.spec.ts --runInBand
    PRIVACY_CONTROL_PROVIDER_CONTRACT_FIXTURE=<approved-test-fixture> TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- privacy-control-authority-provider.contract.spec.ts --runInBand

Use an injected clock and deterministic provider fixture to cover first append, identical replay, conflicting reuse,
strong-read failure, timeout before and after provider acceptance, and append success followed by a local terminal crash
or compare-and-set loss. Assert terminal state is impossible without the matching event sequence, digest, and fence.

Cover ordered pages at limit boundaries, duplicate delivery, missing sequence, cursor reuse against another target,
unknown schema, key rotation, missing old key, event retention floor, adapter outage, and concurrent epoch fencing. Race
backup capture before append, after append/before local terminal, after local terminal/before local checkpoint, and after
checkpoint. Require the finalized immutable generation metadata to match the external ticket exactly.

Restore synthetic backups captured before every event family. Require the target to remain fixed while old writers are
rejected; replay `(includedHighWatermark, targetWatermark]` through pages; inject one failure in every consumer; and
prove release stays blocked until stream continuity and all exact consumer checkpoints reach the target. Also prove an
already-applied event and a crash after consumer effect but before checkpoint converge without duplication.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm docs:lint -- src/libs/modules/privacy-control-authority/README.md src/libs/modules/privacy-operations/README.md docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/33-establish-durable-privacy-control-authority.md
    corepack pnpm exec prettier --check config/privacy/privacy-control-authority.yaml config/privacy/restore-reconciliation.yaml config/privacy/managed-data-stores.yaml src/libs/modules/privacy-control-authority/README.md src/libs/modules/privacy-operations/README.md docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/33-establish-durable-privacy-control-authority.md
    git diff --check

Bruno is not applicable because this plan adds internal authority, backup-capture, and restore-release contracts without
changing a public HTTP route. Consumer plans own their applicable HTTP and Bruno behavior.

## Idempotence and Recovery

Event identity plus canonical digest makes append retry safe. Provider lookup resolves an acknowledgment lost after
acceptance. If lookup remains ambiguous, leave local state nonterminal and retry the same identity; never create a new
operation ID to force progress. Local terminal and consumer checkpoints use compare-and-set and carry the accepted event
identity, sequence, digest, and fence.

Capture tickets and restore-fence requests are unique to source/provider generation and restore generation. Exact retry
returns the same immutable result; conflicting reuse fails. Consumer pages advance only after every sequence in the page
is applied or safely skipped, and a crash resumes from the prior checkpoint. A released generation cannot replace its
target or fence.

Reset only the module's owned deterministic local fixture and an owned disposable development database. Never truncate
or edit the real authority, skip a sequence, lower an included watermark, advance a checkpoint manually, or reuse an old
epoch. Never mark an incomplete capture eligible, substitute restored state for provider evidence, delete key material,
or bypass quarantine to recover a test.

## Artifacts and Notes

Before implementation, record the selected provider/service, adapter ID, account/project, region, and approved
recipient/transfer reference. Record the workload identity and credential mount, encryption/pseudonymization key owners
and versions, retention/deletion/audit evidence, and ordering/consistency/conditional-write capabilities. Also record
pagination, fence, and durability evidence; plan-11 recovery-copy bindings; and the owner of provider incidents and key
rotation. Record no secrets or private provider evidence.

Also record the exact projected non-Markdown file list, additions/deletions count, threshold result, and binding
`one_pr` or `decompose` approval. During implementation record schema/consumer/configuration versions, synthetic event/
capture/restore IDs, safe sequence and checkpoint ranges, failure/race results, test totals, and provider-contract
fixture identity. Never record raw subjects, HMAC values, selector plaintext/ciphertext, export contents, legal details,
credentials, tokens, or production event data.

## Plan readiness

Ready after Security and Operations select and approve the exact real provider, adapter/capability contract, endpoint,
identity/credential mount, and region/recipient/transfer posture. They must also approve the encryption and
pseudonymization keys, retention/deletion, audit, durability/availability, ordering, consistency, pagination,
conditional-write, recovery independence, and restore-fence semantics. The repository maintainer must then approve the exact file-level size projection and record the binding
`one_pr` decision below 1,000 non-Markdown changed lines, or replace this plan with smaller numbered ExecPlans before any
product-code edit. Non-local operation and restore release remain closed until the selected real adapter exists.
