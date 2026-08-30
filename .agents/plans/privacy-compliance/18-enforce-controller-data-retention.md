# Enforce Controller-Data Retention and Restore Reconciliation

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Apply the plan-12 controller-data retention triggers automatically and prevent restored data from resurrecting expired or
previously disposed controller records. After this change, a bounded singleton BullMQ sweep invokes owner adapters with
an injected clock. The plan-15 quarantine first requires plan 32 to reconstruct the exact legal-hold set. It cannot
release until `controller.data-lifecycle.v1` then replays current retention plus durable rights/retention events from
the non-restored plan-33 authority against the restored generation. This is the first PR permitted to enable a complete
real controller-privacy registry in a disposable environment.

## Progress

- [ ] (2026-08-30) Add scheduled, bounded controller-retention policy/checkpoint orchestration.
- [ ] (2026-08-30) Compile and validate every owner-provided due-item/apply-retention capability from plans 16, 17, and
      27–30 without editing those owners.
- [ ] (2026-08-30) Compose the exact target-real/rest-fake matrix and one complete-real disposable registry, then own
      all enabled HTTP/Bruno validation deferred by the adapter PRs.
- [ ] (2026-08-30) Add durable keyed disposition markers and `controller.data-lifecycle.v1` restore reconciliation.
- [ ] (2026-08-30) Append and verify controller request admission/action and retention-disposition events through plan
      33 before accepted or terminal local state.
- [ ] (2026-08-30) Register the reconciler in the plan-15 machine rule and prove quarantine/retry/CAS release behavior.
- [ ] (2026-08-30) Add cutoff, hold, provider, concurrency, PostgreSQL/Redis, restore, architecture, full, and
      documentation validation.

## Plan dependencies

- `privacy-compliance/12`
- `privacy-compliance/15`
- `privacy-compliance/16`
- `privacy-compliance/17`
- `privacy-compliance/27`
- `privacy-compliance/28`
- `privacy-compliance/29`
- `privacy-compliance/30`
- `privacy-compliance/32`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use one repeatable BullMQ queue, `controller-data-retention`, with deterministic scheduler ID
  `controller-data-retention.v1` and bounded owner pages.
  Rationale: Existing queue infrastructure provides retry/locking without introducing another scheduler.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use the plan-12 event triggers and actions exactly; no generic row-age cascade or runtime fallback duration.
  Rationale: Sessions, invitations, identities, financial records, security evidence, and provider records have
  different lifecycles and invariants.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Register one plan-15 descriptor, `controller.data-lifecycle.v1`, that applies current age/event retention
  and replays all ordered plan-33 controller request/action and retention events after the backup included watermark.
  Rationale: One owner-agnostic coordinator can preserve quarantine while delegating each item to its existing adapter.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Local disposition projection markers contain policy/version, keyed subject fingerprint, organization scope, item/action,
  effective time, backup-coverage evidence, and computed `requiredUntil`, never plaintext identifiers or legal detail.
  Rationale: Restored reconciliation needs durable matching without creating another identity store.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat plan-33 controller request admission/action/retention events as the restore authority and local
  request rows, markers, and checkpoints as projections. Append and verify a minimal admission event before accepting a
  controller request. Keep each owner mutation in a conservative prepared state, append and verify the action event
  after the owner effect is authoritative, and only then terminal the receipt or scheduled disposition checkpoint with
  the acknowledgment.
  Rationale: PostgreSQL request rows and markers restored from an older snapshot cannot enumerate later controller
  work. Authority-first accepted/terminal ordering closes the evidence gap while allowing same-event retry to repair
  local projections.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Retain a local disposition marker until every backup generation captured before its effective disposition and
  capable of resurrecting the affected item has authoritative evidence of irreversible expiry/destruction. The marker
  lifetime is never shorter than the latest such generation; unknown/missing generation or expiry evidence blocks both
  marker deletion and restored-generation release.
  Rationale: A fixed marker TTL can expire before an older backup and allow a later restore to resurrect disposed data.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Owner adapters from plans 16, 17, and 27–30 already implement `findRetentionDue`/`applyRetention`; this PR
  adds no cross-owner mutation and owns only policy compilation, scheduling/checkpoints, atomic markers, restored replay,
  and final composition activation.
  Rationale: Central orchestration should depend on narrow owner ports rather than reopen every business module.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Plan 18 is the first and only road map point that may set `CONTROLLER_PRIVACY_ENABLED=true` in a disposable
  real-adapter composition, after exact registry/lifecycle completeness and backup evidence pass.
  Rationale: Earlier adapter subsets cannot safely fulfill or reconcile every required controller-data action.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: This PR owns two explicit disposable test compositions: for each required descriptor, one
  `target-real/rest-fake` profile with that real adapter plus contract fakes for every other owner, and one
  `complete-real` profile with every adapter, plan-32 hold provider, and lifecycle capability real. Both pass the exact
  registry gate and run the same HTTP/Bruno contract; committed application configuration remains disabled.
  Rationale: Adapter PRs cannot truthfully start an incomplete registry, while this final composition must prove each
  target's route effects and cross-owner behavior before claiming the whole registry works.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add no migrations or production rollout and never rewrite immutable backup media.
  Rationale: The repository has no production environment; reconciliation acts only on the quarantined restored
  application generation.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 13 delivers the controller request engine. Plans 16, 17, and 27–30 deliver every owner adapter plus bounded
retention enumeration/application; they deliberately remain disabled. Plan 15 owns restore generations, checkpoints,
gates, and release. Plan 12 supplies retention triggers/actions, holds/exceptions, and response semantics.

The required owner descriptors are exact: plan 16 supplies `identity-attribution.controller-data.v1` and
`bff-session.controller-data.v1`; plan 17 supplies `credits.controller-data.v1` and
`payments.controller-data.v1`; plan 27 supplies `human-organization.controller-data.v1`; plan 28 supplies
`service-client.controller-data.v1`; plan 29 supplies `audit-security.controller-data.v1`; and plan 30 supplies
`managed-provider.controller-data.v1`. This plan compiles those descriptors with the exact plan-32
`controller.legal-holds.v1` and its own `controller.data-lifecycle.v1` capabilities; it cannot replace a missing owner
with a generic adapter.

Plan 32 supplies the real hold query/guard provider required by every mutating owner. The enabled disposable matrix
must never replace it with an allow-all fake; target-real/rest-fake refers only to data-owner descriptors.
Plan 33 supplies the independently durable ordered authority, backup included watermark, restore target/fence,
pseudonymous aliases, and sealed minimum selectors used by this plan's producer and restore consumer.

A current-store sweep and a restored-generation reconciler use the same owner actions but different enumeration:
current sweeps enumerate items due now, while restore reconciliation also reads ordered post-capture plan-33 events and
repairs their local marker projections.

## Scope and Non-Goals

Add the controller retention policy/checkpoints, BullMQ scheduling/worker, durable disposition markers, and
recovery-copy coverage evidence. Add plan-33 controller action/retention event production, the
`controller.data-lifecycle.v1` adapter, plan-15 configuration/registration, final real-registry composition, target-real/
rest-fake and complete-real fixture harnesses, the controller HTTP/Bruno collection, and focused/runtime tests. Consume
owner ports without editing their business modules.

Do not change rights APIs, notice placement, invent retention rules, remove active holds, mutate immutable backups,
rewrite financial/audit truth, add migrations, perform a real restore, or deploy production scheduling.

## Plan of Work

Compile the exact plan-12 event/retention rows into the existing controller policy projection. Require owner, item,
trigger, action, duration/decision rule, hold behavior, cursor sort key, and adapter descriptor. Initialization fails for
missing, pending, or duplicate mappings.

Add a controller-retention application service and private checkpoint store. Schedule hourly with configurable positive
`CONTROLLER_RETENTION_SWEEP_MINUTES=60` and `CONTROLLER_RETENTION_PAGE_SIZE=500`. The deterministic scheduler and
database lease prevent overlapping sweeps. Each page uses stable owner/item/primary-key order and advances only after
the adapter confirms the intended disposition, its plan-33 event is verified, and the local checkpoint records that
acknowledgment.

Compile the already exported owner retention ports from plans 16, 17, and 27–30 into an exact registry. Require one
owner for every policy row, stable descriptor/version, bounded cursor semantics, and declared hold/provider behavior.
Do not add or modify an owner operation here. Missing, duplicate, version-mismatched, or ambiguous capability fails
initialization; pending owner/provider/hold state blocks the item and records a sanitized escalation.

At the first complete-registry activation, extend plan-13 intake with an `admission_prepared` state and deterministic
plan-33 `controller_request_admitted` event. Persist the immutable request/policy/owner manifest and pseudonymous aliases,
append and verify the event, then compare-and-set the request to accepted and publish its job. Authority unavailable/
ambiguous or a stale fence leaves no accepted request/job and returns the existing plan-13 `409` required-manual-input
result; same-idempotency retry resumes the prepared state or returns the original acknowledged request. If an older restore predates
the request, `controller.data-lifecycle.v1` rebuilds its minimal projection as manual when minimized resumable input is
unavailable rather than discarding it or fabricating fulfillment.

When plan 13 or the retention scheduler obtains an authoritative delete/restrict/object result through an owner adapter,
atomically transition the controller request or sweep item to a prepared nonterminal state. Store the keyed local marker
with policy version and effective scope in the same operation. Append and strongly verify the minimal
`controller.data-lifecycle.v1` action/retention event through plan 33, using only aliases, item/action/policy/outcome
codes, evidence of the owner effect, hold-set fence, and an encrypted minimum selector when needed. Then compare-and-set
the prepared state to the terminal receipt or completed sweep checkpoint and record event ID, sequence, digest, and
authority fence. An authority outage, ambiguous
append, stale hold/authority fence, or local finalization race stays pending/manual; an accepted append followed by a
crash retries the same event and converges.

Query every plan-12/plan-26-approved backup source capable of containing that item through the authoritative plan-15
metadata readers. Record safe source/generation evidence IDs and compute `requiredUntil` as no earlier than the latest
immutable expiry/destruction of every generation captured before the disposition. If generation enumeration, captured-
at, expiry, destruction, source coverage, or evidence freshness is unknown, store an unresolved coverage state and
retain the local marker indefinitely pending evidence; never substitute a default TTL.

Add a bounded marker-lifecycle check that revalidates source coverage immediately before deletion. It may delete a
local marker only after authoritative evidence proves every pre-disposition generation capable of resurrection has
irreversibly expired or been destroyed and no newer inventory evidence reveals another qualifying generation. Plan 33
retains the authority event and required alias/selector key versions through the same protection floor; deleting the
projection never deletes the event. Clear sensitive request ciphertext independently; marker retention does not justify
retaining the original request values.

Implement `ControllerDataLifecycleRestoreReconciler` against plans 15 and 33. First require
`controller.legal-hold-events.v1` to have reconstructed its hold projection at the same fixed target. For the exact
generation/source and authority range, process current retention plus every ordered controller action/retention event in
`(backupIncludedHighWatermark, restoreTargetWatermark]` through bounded deterministic pages. Use the same owner adapters,
real reconstructed hold guard, and fake clock. Missing/ambiguous event or local state, unknown key/schema/item/adapter,
provider uncertainty, event gap/stale fence, or projection failure returns incomplete and leaves quarantine. Missing/
unknown backup-coverage evidence also returns incomplete even if owner data appears absent; release cannot proceed until
reconciliation proves the relevant authority events, local projections, and source generations and checkpoints the
exact target. Output only cursor and safe counts.

Update `config/privacy/restore-reconciliation.yaml` so every backup containing controller data requires descriptor
`privacy.control-authority.v1`, `controller.legal-hold-events.v1`, and `controller.data-lifecycle.v1` at exact versions.
Declare hold-event reconstruction as a prerequisite of lifecycle/data-owner mutation. Compose them in the API root.
Exercise a synthetic pre-disposition backup containing expired, retained, held, provider, and already-deleted fixtures
through failure/retry and release.

Add a disposable HTTP-matrix harness with an allowlisted profile for each exact owner descriptor. A target-real/rest-
fake profile loads the named real owner adapter, contract fakes for the other owner descriptors, the real plan-32 hold
provider, and the real lifecycle capability. The complete-real profile loads every real descriptor. The harness fails
for an unknown/duplicate profile, a fake target, a missing plan-32 provider, or any registry mismatch; it never alters
the committed `CONTROLLER_PRIVACY_ENABLED=false` default.

## Interfaces and Dependencies

Consume the owner facet contract already delivered by the adapter plans:

    interface ControllerRetentionOperations {
        findRetentionDue(input: { itemId: string; now: Date; cursor: string | null; limit: number }): Promise<DuePage>
        applyRetention(input: RetentionItem): Promise<ControllerPrivacyOwnerResult>
    }

The plan-15 adapter descriptor is exactly `controller.data-lifecycle.v1`. Job data contains only sweep/checkpoint ID.
`DuePage` and restore output contain safe counts/cursors, not subject data.

Plan 12 supplies policy. Plans 16, 17, and 27–30 supply owner adapters and retention operations. Plan 15 supplies the
public reconciler SPI, authoritative backup-generation metadata readers, and release gate. Existing TypeORM/BullMQ/
provider dependencies remain behind infrastructure. Plan 32 supplies the real hold provider and hold-event consumer
used in every enabled disposable profile. Plan 33 supplies append-once acknowledgment, ordered restore range, target/
fence confirmation, and external alias/selector keys; this module never imports its selected provider adapter.

## Acceptance Criteria

- Every approved controller retention row has one exact owner/trigger/action/adapter; pending or generic fallback rules
  fail initialization.
- The coordinator consumes owner operations from plans 16, 17, and 27–30 without adding cross-owner mutation; each
  adapter preserves its own active-relationship, final-owner, accounting, provider, investigation, hold, and shared-
  identity invariants.
- Sweeps are hourly by default, bounded to 500, deterministic, singleton/idempotent, and fake-clock testable.
- Before/exactly-at/after boundaries behave as approved; active relationships, holds, final owners, accounting/audit
  truth, provider ambiguity, and shared identities remain protected.
- Durable disposition markers contain only keyed/safe fields and are created atomically before terminal rights
  outcomes. A local marker remains until authoritative evidence proves every pre-disposition backup generation capable
  of resurrection has irreversibly expired or been destroyed; unknown source/generation/expiry evidence blocks marker
  deletion.
- Every accepted controller request and every terminal controller action or scheduled retention disposition has one
  read-after-write-verified plan-33 event before its local accepted/terminal row, receipt, job, or checkpoint. Authority
  failure/ambiguity remains prepared and nonterminal; append success followed by a local crash retries the same event
  and converges.
- Every controller-data recovery-copy rule requires `privacy.control-authority.v1`,
  `controller.legal-hold-events.v1`, and `controller.data-lifecycle.v1` with hold reconstruction ordered first.
- A restored generation remains quarantined until the hold set, current retention, and every ordered authority event
  after the backup watermark through the fixed target reconcile. Missing authority or recovery-copy coverage evidence
  blocks release, failure resumes from a monotonic cursor, and absence alone never proves reconciliation.
- A complete disposable real registry can enable only after all owner descriptors and
  `controller.data-lifecycle.v1` pass exact initialization validation; earlier subset configurations still fail and committed
  defaults remain disabled.
- Every exact owner descriptor passes the same HTTP contract in a target-real/rest-fake profile with the real plan-32
  hold provider and lifecycle capability, and the complete-real profile passes the whole workflow. Missing, fake,
  or incomplete profiles fail before HTTP is served.
- No raw identifiers enter jobs/logs/checkpoints, no immutable recovery copy is rewritten, and no broad delete occurs.
- No migration, real restore, production scheduler rollout, or compliance/recovery claim is included.
- Focused, PostgreSQL, Redis, provider, concurrency, restore, architecture, full, build, docs, and applicable Bruno
  checks pass.

## Validation

Run policy, scheduler, owner-retention, and restore suites:

    corepack pnpm privacy:restore-readiness-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-data-retention controller-data-lifecycle-restore --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-data-retention.integration.spec.ts --runInBand

Cover each boundary, pages over 500 items, overlap, run failures, retries, hold actions, release actions, and final-owner handling.
Also cover financial/security retention, unknown provider state, and marker concurrency. Cover complete, missing, stale, and
contradictory recovery-generation enumeration; the latest immutable expiry; irreversible-destruction evidence; newly
discovered pre-disposition generations; and marker-deletion races. Also cover pre-capture and post-capture dispositions,
missing descriptors, incomplete subset activation, every target-real/rest-fake profile, complete-real disposable
activation, and restore CAS release. Crash after plan-33 append and before each receipt/checkpoint finalization; inject
authority timeout before/after provider acceptance, an event gap, missing alias key, stale fence, and incomplete hold-
event consumer. Restore a backup predating a controller action and require bounded replay plus exact target checkpoints
before owner work and release. Also restore a backup predating accepted controller request admission; preserve its
captured policy/owner state as a minimal manual projection when resumable input is unavailable.

Update `bruno/controller-privacy` to prove each target-real/rest-fake profile and the complete-real disposable registry
serve access/status only after lifecycle and plan-32 capabilities are present, retain pending/unknown owner outcomes,
apply hold effects, and remain concealed when disabled. Add
`scripts/privacy/run-controller-privacy-http-matrix.ts` and the exact package command below; it starts owned isolated
fixtures, runs the collection once per allowlisted real target and once complete-real, then cleans up only its fixtures:

    corepack pnpm privacy:controller-http-matrix -- --profiles target-real-rest-fake,complete-real --env local

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/controller-privacy/README.md src/libs/modules/privacy-operations/README.md bruno/controller-privacy/README.md .agents/plans/privacy-compliance/18-enforce-controller-data-retention.md
    corepack pnpm exec prettier --check config/privacy/controller-data-policy.yaml config/privacy/restore-reconciliation.yaml src/libs/modules/controller-privacy/README.md src/libs/modules/privacy-operations/README.md bruno/controller-privacy/README.md .agents/plans/privacy-compliance/18-enforce-controller-data-retention.md
    git diff --check

## Idempotence and Recovery

Scheduler ID, leases, owner cursors, marker uniqueness, deterministic plan-33 event identity, recovery-copy coverage
evidence versions, and restore checkpoints make replay converge. Already-missing state is success only after exact scope,
authority event, and marker coverage verification; ambiguity remains pending.

Reset only an owned disposable development environment. Never flush Redis, delete broad tables/prefixes, remove holds,
delete a marker while any pre-disposition generation may survive, rewrite recovery media, edit checkpoint state, or
bypass quarantine.

## Artifacts and Notes

Record policy/reconciler versions, safe page counts/cursors, synthetic generation/request IDs, recovery source/generation
evidence IDs, safe authority event/sequence/fence, computed marker `requiredUntil`, hold/provider reason codes, registry
completeness, test totals, and release state. Never record identities, emails, tokens, financial/provider payloads, legal
details, recovery-copy contents, or secrets.

## Plan readiness

Ready to implement
