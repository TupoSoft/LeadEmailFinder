# Correct Verification Subjects Without Stale Effects

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Add one organization-submitted correction workflow that safely replaces a customer-supplied address across current
verification state without performing a new verification or changing credit. The workflow locks source and replacement
subjects in deterministic order and fences organization ingestion and both subject generations. It applies the exact
captured policy to dispositions on both subjects, rewrites only customer-provided fields, removes stale derived results,
and records a backup-bound correction marker for restored replay.

After this change, application-level tests can observe reversed concurrent corrections converging without deadlock or
lost disposition, shared-object rewrites preserving unrelated rows, and plan-15 quarantine replaying a correction that
occurred after backup capture. The verification privacy HTTP feature remains concealed/default-off. Plan 22 is the
first plan allowed to activate it after every intake captures its immutable contract response rule and deadline.

## Progress

- [ ] (2026-08-30) Add exact correction/disposition-pair policy and extend the shared request aggregate with `correct`.
- [ ] (2026-08-30) Add deterministic dual-subject locking, organization barrier, generation fencing, and retry state.
- [ ] (2026-08-30) Rewrite approved customer fields and delete stale derived PostgreSQL/BullMQ/S3 effects.
- [ ] (2026-08-30) Persist correction markers bound to authoritative backup generations with `requiredUntil` evidence.
- [ ] (2026-08-30) Append and verify the minimal plan-33 correction event before the local terminal receipt and gate/
      generation transition.
- [ ] (2026-08-30) Register `verification.subject-corrections.v1` with plan 15 and prove restored replay.
- [ ] (2026-08-30) Add policy, authorization, concurrency, store, restore, architecture, and default-off Bruno
      validation.

## Plan dependencies

- `privacy-compliance/08`
- `privacy-compliance/10`
- `privacy-compliance/12`
- `privacy-compliance/15`
- `privacy-compliance/20`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Add `correct` to the plan-20 organization-owned request aggregate and reuse its
  `verification-privacy:manage` permission, organization binding, idempotency, retry, and receipt rules.
  Rationale: Correction is a processor instruction from the same customer authority, but its dual-subject mutation and
  restored replay are independent enough for one dedicated pull request.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Keep `VERIFICATION_PRIVACY_ENABLED=false`, do not register controllers, and fail startup if true without
  the `verification.response-admission.v1` capability from plan 22.
  Rationale: Correction must not be accepted before a versioned contract response rule/deadline snapshot can be stored
  atomically at intake.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Resolve stable subject IDs first, take one organization ingestion barrier, and lock the two subject rows in
  lexical UUID order in one transaction, regardless of source/replacement request order.
  Rationale: Deterministic ordering prevents deadlock and one barrier prevents an unparsed batch from entering between
  the two subject fences.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Capture an exact plan-10 correction policy row for the pair of source/replacement disposition states and
  versions. The row must choose `preserve`, `transfer`, or `reject`; an absent, ambiguous, stale, or unsupported pair
  policy is rejected.
  Rationale: Correction cannot silently withdraw a suppression/restriction, overwrite an existing replacement
  disposition, or guess whether an instruction follows the person or the literal address.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: `preserve` always keeps every existing disposition on its current subject; `transfer` keeps the source
  disposition and atomically applies the policy-specified equal-or-more-restrictive disposition to the replacement;
  `reject` performs no resource mutation. A replacement disposition is never removed or weakened. If both subjects
  have dispositions, the captured row must name their deterministic merged replacement outcome or reject.
  Rationale: These semantics make preservation and transfer monotonic and prevent correction from becoming an implicit
  withdrawal or bypass.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Change only approved customer-provided address fields/references. Delete source-derived SMTP/provider/DNS
  results rather than relabel them, and perform no probe, debit, refund, or credit transfer.
  Rationale: Deliverability evidence for one address is not valid for another, and correction is not paid verification.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Record correction and disposition-resolution state in one minimal plan-12-approved local projection marker whose
  `requiredUntil` is bound to authoritative backup generations. Retain it until every generation captured before the
  correction and capable of resurrecting source data irreversibly expires or is destroyed; unknown evidence means
  indefinite retention and fail-closed restore release.
  Rationale: A fixed marker TTL can end before an older backup and let a later restore revive the source value or undo
  the captured disposition ordering.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Register a separate `verification.subject-corrections.v1` restore reconciler. Plan 20 continues to own
  disposition replay and plan 21 owns access-export invalidation only.
  Rationale: Dual-subject resource rewriting, generation ordering, and marker evidence should not be hidden inside an
  unrelated reconciler version.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Treat the plan-33 append-only correction event as the restore authority and the local correction marker as a
  conservative projection. After final clean scans, keep both subject gates closed, prepare the intended generation and
  disposition outcomes, append and verify the event, and only then atomically terminal the receipt and gates with the
  acknowledgment.
  Rationale: A local marker can disappear in the older backup it must repair. Closed dual-subject gates make authority-
  first finalization safe, and same-event retry converges after a crash without exposing a false terminal correction.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Use TypeORM synchronization against disposable development data and add no migration, backfill,
  production activation, or production recovery procedure.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy plan review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 08 provides stable organization/subject identities, versioned HMAC lookup, subject-generation write gates,
organization ingestion epochs/barriers, writer leases, resource manifests, and staged-object pointer fencing. Plan 20
provides the shared request aggregate, dedicated human/M2M permission, exact organization ownership, disposition state,
idempotency, retry, and `verification.subject-dispositions.v1`. Plan 15 provides authoritative backup-generation
metadata, restore quarantine, and the public reconciler SPI. Plan 12 classifies minimum correction evidence. Plan 33
provides the independently durable ordered event authority, backup included watermark, restore target/fence, external
alias-key versions, and sealed minimum reconciliation selectors.

Customer-provided address fields can occur in PostgreSQL rows, BullMQ payloads, source CSV rows, result CSV rows, and
resource manifests. Provider/SMTP/DNS outcomes and derived CSV fields belong to the old address and must not move. A
replacement subject may already have customer data or a plan-20 disposition. A shared object can contain both subjects
plus unrelated rows, so correction must use staged immutable revisions and guarded pointer swaps rather than key-level
deletion or in-place editing.

A “correction marker” is a keyed, non-plaintext local projection containing both stable subject identities, captured
policy/disposition versions, completed generation pair, effective time, safe per-store outcomes, and backup-coverage
evidence. The plan-33 event is the restore authority. Neither record is an ordinary verification result or may be used
for enrichment or cross-organization matching.

## Scope and Non-Goals

Add strict correction/disposition-pair policy, the `correct` action, encrypted resumable replacement input,
deterministic dual-subject locking and fencing, bounded store adapters, safe shared-object rewrites, stale-result
deletion, minimal backup-bound markers, `verification.subject-corrections.v1`, documentation, and focused/runtime
tests. Add plan-33 correction event production and bounded authority replay. Keep the HTTP surface concealed/default-off
and add default-off Bruno coverage only.

Do not collect an access export, activate HTTP, calculate response clocks, withdraw a disposition implicitly, or verify
the replacement. Do not contact SMTP/account-discovery/DNS providers, debit/refund/transfer credit, change another
organization, or rewrite immutable backup media. Do not implement DROP/controller rights, choose policy semantics at
runtime, add a migration/backfill, or claim compliance.

## Plan of Work

Create `config/privacy/verification-correction-policy.yaml` as an executable projection of plan 10. Each immutable row
identifies source disposition kind/version, replacement disposition kind/version, allowed customer fields,
`preserve|transfer|reject`, exact replacement outcome for transfer/merge, retained/restricted categories, receipt
reason, plan-12 evidence item, and review evidence. Reject wildcard/default pairs, missing disposition states, a transfer
that removes/weakens either block, controller-only/private fields, pending approvals, placeholders, and changed content
without a version change. Runtime and CLI consume one parser.

Extend internal intake with:

    { email, action: 'correct', correction: { email: string } }

Require `correction` only for `correct`, reject equal normalized source/replacement with `422`, derive organization from
the active principal, and require the exact plan-20 `verification-privacy:manage` rules. Resolve/create both stable
subjects before clearing DTO fields. Persist replacement plaintext only as authenticated ciphertext required for
resumable processing; bind AAD to organization, request, source/replacement IDs, policy, and key version. Jobs/logs carry
request ID and safe codes only. Identical replay returns one request; conflicting source/replacement reuse returns
`409` when HTTP is activated by plan 22.

Implement the future intake/status/retry controllers behind the shared gate but do not register them. With
`VERIFICATION_PRIVACY_ENABLED=false`, all authenticated and unauthenticated probes receive ordinary `404`. A true value
prevents the application from starting until plan 22 registers `verification.response-admission.v1`. Focused/integration tests invoke the
application workflow directly; Bruno proves concealment only.

Begin execution by acquiring one durable organization correction operation, incrementing the organization ingestion
epoch, and waiting for every prior-epoch preparse lease to drain or reconcile. In one PostgreSQL transaction, sort the
two stable subject UUIDs into lexical order and lock them in that order. Read both current gate generations and plan-20
disposition versions, resolve exactly one captured policy row, and compare-and-set both gates to the request-owned
closing state.
If either version changed, release/retry from a fresh policy resolution; never reuse the stale decision. A reversed
concurrent correction takes the same lock order and can only wait then observe a stale version, not deadlock.

Apply the captured disposition decision before resource work. `reject` records the safe terminal rejection and reopens
nothing because no gate transition commits. `preserve` carries each current disposition unchanged. `transfer` keeps the
source disposition and stages the exact equal-or-more-restrictive replacement disposition; an existing replacement
block remains and the policy's deterministic merge must not weaken it. Persist the expected disposition versions in
every checkpoint. A concurrent withdrawal/new disposition causes CAS failure and retry/manual state, never overwrite.

Drain both subjects' older writers and expired leases through plan 08. Process indexed resources in bounded pages.
Change only approved customer-supplied address fields and references. Delete source email/SMTP/verification inferences,
async child results, and derived CSV columns. If the replacement already has customer data, preserve it and merge only
policy-approved non-derived references; never overwrite its current result with the source result. For a shared source/
result object, stage a new encrypted immutable revision, validate membership for source/replacement/unrelated subjects,
and compare-and-set the pointer against organization epoch, both subject generations, and resource revision. A stale
CAS deletes the staged revision and retries; it cannot publish.

Perform two equivalent clean scans around final preparation. The source must have no covered customer payload or derived
effect; replacement/unrelated data and captured dispositions must match policy. In one transaction, prepare the exact
transferred/merged replacement disposition, both next generations, the planned outcome for each gate, organization epoch, and
local correction marker while both current gates remain closed and the request remains nonterminal. Append and strongly
verify one pseudonymous `verification.subject-corrections.v1` event through plan 33. Then atomically compare-and-set the
prepared versions, record event ID/sequence/digest/fence, finalize dispositions and both generations, set each gate open
or closed exactly as its resulting disposition requires, advance/reopen the organization epoch, and terminal the
receipt. An open source can later receive independent data, but no pre-correction writer can publish. Authority outage,
ambiguity, or a stale fence leaves both gates closed and the request retryable/manual.

The local marker stores organization ID, source/replacement keyed subject IDs and HMAC versions, policy/disposition
versions, generation pair, effective time, safe outcomes, evidence IDs for backup sources/generations, coverage status,
and `requiredUntil`; it stores no plaintext address. The plan-33 event stores only approved aliases, safe outcomes, key
versions, and any encrypted minimum selector needed to locate both restored subjects. Through the authoritative readers
from plan 15 and the complete source inventory from plan 11, enumerate every generation captured before correction that
can contain either affected verification subject/resource. Set `requiredUntil` no earlier than the latest immutable
expiry/destruction. Unknown source coverage, generation, capture time, expiry/destruction, evidence freshness, or
contradictory inventory means unresolved coverage and indefinite local-marker retention. A bounded marker lifecycle re-
enumerates immediately before deletion and removes the local marker only after every qualifying generation is
authoritatively irreversible. Plan 33 retains the event and alias/selector key versions through the same protection
floor; deleting the projection never deletes the authority event. Clear request ciphertext independently under its
shorter policy.

Implement `VerificationSubjectCorrectionRestoreReconciler` as `verification.subject-corrections.v1`. Against the exact
restored source/generation and plan-33 control range, consume every ordered event after the backup included watermark
through the fixed target and lock source/replacement in the same order. Rebuild missing resource indexes, reapply the
captured disposition result, remove/rewrite restored source payload and derived effects, preserve unrelated/replacement
state, and use pointer CAS. Missing event or local coverage evidence, subject alias/selector key, event/policy/
disposition version, object version, event sequence, current fence, or adapter result keeps quarantine. Current-store
absence alone never proves restored correction complete; the consumer checkpoints the exact target before release.

Update processor/controller contracts, the email-verification README, restore manifest, and
`bruno/privacy-requests/README.md`. Document that plan 22 owns first enabled HTTP/Bruno behavior.

## Interfaces and Dependencies

Add contracts equivalent to:

    type CorrectionDispositionDecision =
        | { kind: 'preserve' }
        | { kind: 'transfer'; replacementDisposition: ApprovedDisposition }
        | { kind: 'reject'; reasonCode: string }

    interface VerificationCorrectionPolicy {
        resolve(input: {
            organizationId: string
            sourceDisposition: VersionedDisposition
            replacementDisposition: VersionedDisposition
            receivedAt: Date
        }): ApprovedCorrectionPolicy
    }

    interface VerificationSubjectCorrector {
        execute(requestId: string): Promise<VerificationCorrectionProgress>
        retry(requestId: string): Promise<VerificationCorrectionProgress>
    }

The corrector depends only on plan-08 gate/resource ports, plan-20 disposition/request ports, purpose-specific store
ports, plan-15 backup/reconciler ports, and plan-33 append/range contracts. BullMQ carries request ID only. The restore
descriptor is exactly `verification.subject-corrections.v1`; it is independent from
`verification.subject-dispositions.v1` and `verification.access-exports.v1`. The selected authority provider remains
behind plan 33 and is never imported by the correction module.

## Acceptance Criteria

- `correct` reuses plan-20 permission, organization binding, concealment, idempotency, retry, and truthful receipt
  semantics; source/replacement organization cannot come from the body.
- The committed false flag leaves every controller unregistered, and true prevents the application from starting without
  the mandatory admission capability from plan 22.
- Source/replacement IDs lock in lexical order under one organization barrier. Reversed concurrent requests cannot deadlock,
  overwrite a newer gate/disposition version, or allow prior-epoch/preparse writers to publish.
- Every disposition pair resolves one immutable captured `preserve|transfer|reject` policy. Preserve never drops a
  block; transfer keeps the source block and applies an equal-or-more-restrictive replacement outcome; replacement
  disposition is never weakened; unknown/stale pairs produce a fail-closed result.
- Correction changes only approved customer fields, preserves unrelated and replacement data, deletes stale derived
  results, rewrites shared objects through staging/CAS, and performs zero probe/debit/refund/credit-transfer calls.
- Completion atomically finalizes both generation/gate outcomes, captured dispositions, marker, and receipt only after
  clean scans and a read-after-write-verified plan-33 correction event. Its terminal CAS records event ID, sequence,
  digest, and fence. Any unknown store, authority, or CAS state remains closed and retryable/manual; append success
  followed by a local crash retries the same event and converges.
- Every marker has `requiredUntil` bound to generations of backups and remains until authoritative evidence proves all
  generations captured in pre-correction backups and capable of resurrection irreversibly expired/destroyed. Unknown
  evidence retains it indefinitely
  and blocks restore release.
- A restored pre-correction generation remains quarantined until `verification.subject-corrections.v1` safely replays
  ordered plan-33 events through the fixed target for both subjects and dispositions; plan 21 is never used for
  correction.
- No access export, clock activation, DROP/controller rights, migration/backfill, external verification, credit effect,
  rewrite of immutable backups, production rollout, or compliance claim is added.
- Focused, policy, PostgreSQL, Redis, S3, authorization, lock/CAS concurrency, marker lifecycle, restore, architecture,
  build, documentation, default-off Bruno, and whitespace checks pass.

## Validation

Run correction policy, dual-subject, marker, and restore suites:

    corepack pnpm privacy:verification-correction-policy-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-privacy-correction verification-correction-policy verification-correction-restore --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_privacy_correction_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-correction.integration.spec.ts verification-correction-marker.integration.spec.ts verification-correction-restore.integration.spec.ts --runInBand

Test equal-address rejection, source/replacement UUID order in both request directions, and every disposition pair and
outcome. Cover disposition change/withdrawal races, whether the replacement is absent or existing, and preparse/writer
races. Cover every
PostgreSQL/BullMQ/S3 checkpoint, multi-subject staged rewrites, pointer mismatches, crash/retry, final scans, and gate
outcomes. Require no provider/probe call and zero credit mutation. Enumerate complete, missing,
stale, contradictory, and newly discovered pre-correction backup evidence around marker deletion.

Exercise synthetic restores captured before correction, after correction but before marker deletion, and after all
qualifying backups expire. Require plan-15 quarantine until the separate descriptor completes; inject missing key,
policy, disposition version, object revision, authority event/sequence/fence, evidence for backups, and pointer failure.
Crash after the event append and before local terminal finalization; require both gates to remain conservative and
same-event retry to converge. Require bounded replay from the backup watermark through the exact target before release.

Inspect `lef-api-1` ownership before runtime work. Against an owned disposable project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer

With the committed default, require ordinary `404` for unauthenticated, owner, service-client, and platform-admin
correction intake/status/retry probes. Do not enable the routes in this PR. Return to the repository root before final
checks.

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/31-fulfill-verification-correction.md
    corepack pnpm exec prettier --check config/privacy/verification-correction-policy.yaml docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/31-fulfill-verification-correction.md
    git diff --check

Bruno: extend `bruno/privacy-requests` only to prove correction routes remain concealed/default-off. Plan 22 owns
enabled correction authorization, ownership, idempotency, disposition-pair, concurrency, retry, no-probe, and no-credit
cases.

## Idempotence and Recovery

One unique organization/idempotency digest fixes source, replacement, action, and captured policy. The BullMQ job ID is
the request ID. Organization epoch, both gate generations, disposition versions, store checkpoints, staged revisions,
marker, and plan-33 event acknowledgment advance by compare-and-set. Retry resumes the same ordered lock/generations and
deterministic event identity and never silently recaptures a newer policy.

A staged object is unreferenced until pointer CAS; failure deletes only that revision. Old-revision deletion failure is
incomplete. After a worker crash, the organization barrier and both gates remain authoritative until retry. A reject
decision mutates no resource. Marker evidence is re-enumerated before deletion, and restore failure keeps quarantine.

Never recover by reversing lock order, weakening/removing a disposition, copying old derived results, probing/debiting,
reopening only one gate, editing marker `requiredUntil`, inferring backup absence, bypassing plan 15, enabling HTTP before
plan 22, or deleting broad storage prefixes. Reset/reseed only an owned disposable development project.

## Artifacts and Notes

Record policy/disposition versions, synthetic request/source/replacement IDs, lock order, organization epochs, and
generation pairs. Record safe per-store outcomes, staged/pointer revisions, the safe authority event/sequence/fence,
marker source/generation evidence IDs, `requiredUntil`, restore descriptor/checkpoints, focused/integration totals, and
Bruno default-off totals. Never record
raw addresses beyond committed fixtures, correction ciphertext, HMAC digests, keys, object contents, credentials,
customer identity, or private legal/contract evidence.

## Plan readiness

Ready after privacy counsel and Product approve the exact source/replacement disposition-pair matrix, transfer outcomes, correction-authorized customer fields, receipt reasons, and plan-12 evidence mapping.
