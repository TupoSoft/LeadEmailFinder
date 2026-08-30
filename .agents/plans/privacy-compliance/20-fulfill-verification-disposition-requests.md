# Fulfill Organization-Submitted Verification Dispositions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give a customer organization one authenticated, durable processor workflow for destructive and restrictive
instructions over its customer-supplied verification data. After this change, an authorized organization principal can
request `erase`, `erase_and_suppress`, `restrict`, `object`, or `opt_out`; retry the same request; inspect truthful
per-store disposition state; and withdraw a persistent restriction or suppression when the approved contract permits.

The workflow consumes the plan-08 subject write gate. It closes the subject, then drains or reconciles old writers and
unparsed ingestion. It deletes or rewrites organization-owned PostgreSQL/BullMQ/S3 resources without harming other rows
in a shared batch artifact and performs a final clean scan. It then either reopens a new generation for plain erasure or
leaves a persistent restricted/suppressed disposition. Plan 15 remains quarantined after restore until this plan's
reconciler has replayed every applicable disposition/withdrawal event from the non-restored plan-33 authority through
the fixed restore target.

This is one cohesive disposition pull request. It does not collect an access export, correct an address, calculate a
contract response deadline, grant an extension, or implement disputes/appeals. Plans 21 and 22 extend the same request
state for access and response-clock outcomes; plan 31 separately adds dual-subject correction. The complete HTTP
surface remains concealed and committed off in this plan. Plan 22 is the first plan allowed to activate it after
capturing an exact versioned contract response rule and deadline snapshot at intake.

## Progress

- [ ] (2026-08-30) Add `verification-privacy:manage`, exact human/service-client grant rules, organization-bound
      intake, exact action policy, request persistence, and atomic idempotency.
- [ ] (2026-08-30) Add durable erase, erase-and-suppress, restriction, objection/opt-out, retry, and withdrawal state
      machines over the plan-08 gate.
- [ ] (2026-08-30) Implement organization-owned PostgreSQL/BullMQ/S3 deletion or staged rewrite and truthful final
      scans.
- [ ] (2026-08-30) Persist narrowly limited dispositions/suppressions and classify request evidence under the plan-12
      controller contract.
- [ ] (2026-08-30) Register `verification.subject-dispositions.v1` with the plan-15 restore gate.
- [ ] (2026-08-30) Add policy, authorization, idempotency, concurrency, store, restore, Bruno, architecture, and full
      validation.

## Plan dependencies

- `privacy-compliance/08`
- `privacy-compliance/10`
- `privacy-compliance/12`
- `privacy-compliance/15`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Accept verification-data instructions only from an authenticated active principal whose organization is
  derived from `AuthPrincipal` and whose effective permissions include `verification-privacy:manage`. Grant that
  permission to `owner` and `platform_admin` human roles only; `member` and `admin` do not receive it. A service client
  may receive it only as an explicit stored permission granted by an active same-organization `owner` or
  `platform_admin` human session under the existing subset-of-grantor rule.
  Rationale: The customer is the controller for customer-supplied verification data and must authenticate the
  requester and entitlement. A dedicated resource/action permission avoids collision with human-only controller
  privacy authority while allowing deliberate M2M processor instructions; a body-supplied organization, implicit
  service-client role, or anonymous subject lookup would permit enumeration or cross-tenant mutation.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep `VERIFICATION_PRIVACY_ENABLED=false` as the committed default and do not register the verification
  privacy controllers while it is false. A true value fails initialization until plan 22 registers its complete response-rule
  admission capability; plans 20, 21, and 31 may test application use cases directly but cannot activate HTTP.
  Rationale: A request accepted before its exact contract rule and deadline snapshot exist would have no truthful
  response commitment. Concealed default-off routing prevents a partial workflow from appearing available.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Implement exactly `erase`, `erase_and_suppress`, `restrict`, `object`, and `opt_out` in this pull request.
  Preserve the submitted action while mapping `object` and `opt_out` to one persistent no-processing disposition only
  when the approved contract policy says they are equivalent.
  Rationale: The receipt must reflect the customer's instruction, while one durable technical disposition avoids
  divergent enforcement for contract-equivalent actions.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Resolve allowed actions, exceptions, retained categories, withdrawal rules, and receipt reason codes from
  the exact versioned customer terms delivered by plan 10. Missing or pending policy rows block processing.
  Rationale: Runtime code cannot invent processor authority or a legal exception.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep request, disposition, suppression, and sanitized receipt evidence only as the separate controller
  compliance records expressly classified by plan 12, with its approved fields, purpose, access, rights mapping, and
  retention rule.
  Rationale: Long-lived evidence or a suppression fingerprint is not ordinary 30-day verification payload and cannot
  silently inherit either role or retention.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Plain `erase` closes, drains, and removes or rewrites all current subject resources, proves a final clean scan,
  and reopens at a new subject generation. It creates no continuing suppression.
  Rationale: A later independent customer instruction may process the address after plain erasure, but no pre-erasure
  writer or artifact may reappear.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: `erase_and_suppress`, `object`, and `opt_out` leave a persistent no-processing disposition after required
  deletion/rewrite. `restrict` leaves the gate closed to ordinary processing and preserves only contract-approved
  restricted records outside normal verification/result access.
  Rationale: A destructive request and a continuing objection/restriction have different durable outcomes.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Withdrawal is an authenticated transition on the originating active disposition, allowed only by its
  captured contract policy. It opens a new generation and never restores deleted data, old queue work, or old object
  revisions.
  Rationale: Ending a forward-looking block is not permission to recreate past data.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Rewrite a shared source or result object through a staged immutable revision and pointer compare-and-set;
  never delete another subject's rows or edit an object in place.
  Rationale: One batch artifact can contain many subjects, so key-level deletion alone is overbroad and in-place edits
  have unsafe crash semantics.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Register one `verification.subject-dispositions.v1` restore reconciler that replays active deletion,
  suppression, restriction, objection/opt-out, and withdrawal generations before plan 15 can release a restore.
  Rationale: A restored snapshot can predate the disposition and otherwise recreate prohibited current state.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat the plan-33 append-only event as the restore authority for every completed disposition or withdrawal.
  Keep the subject gate and local marker as conservative current-state projections. Do not expose terminal receipt,
  reopen a plain-erasure generation, or complete a withdrawal until the event acknowledgment is read-after-write verified
  and recorded by the local terminal compare-and-set.
  Rationale: A local marker in PostgreSQL can disappear with the older snapshot it is expected to reconcile. Authority-
  first terminal ordering preserves the transition across that restore while letting idempotent retry repair local state.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Retain each local disposition/withdrawal projection marker until authoritative generation evidence proves that every
  backup generation captured before the transition and capable of resurrecting the subject has irreversibly expired
  or been destroyed. Persist a backup-bound `requiredUntil`; unknown, incomplete, stale, or contradictory source,
  generation, capture, expiry, or destruction evidence means unresolved coverage, indefinite marker retention, and
  fail-closed restore release.
  Rationale: A fixed marker TTL can end before an older backup and allow a later restore to reverse an erasure,
  restriction, suppression, or withdrawal ordering.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use TypeORM synchronization against disposable development data and add no migration, backfill, production
  activation, or production recovery procedure.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 08 supplies stable organization/subject IDs, versioned lookup, a subject-generation write gate, organization
ingestion epochs, renewable leases, exact writer/resource manifests, and crash reconciliation. Its close operation
prevents an older PostgreSQL, BullMQ, S3, or unparsed-upload effect from publishing after close or reopen. Plan 07
supplies age retention and batch-artifact lifecycle. Plan 15 supplies restore quarantine and the public
`RestoreReconciler` contract. Plan 33 supplies the independently durable ordered event authority, backup included high-
water mark, restore epoch fence, and fixed target range.

Plan 10 supplies counsel-approved customer processor/service-provider terms, documented instructions, assistance,
exceptions, and end-of-service behavior. Plan 12 separately classifies the minimum request/disposition evidence that
LeadEmailFinder determines it must keep for compliance or suppression. Neither contract is replaced by code in this
plan.

The existing permission vocabulary uses `resource:action` strings. Human permissions derive only from fixed role
maps, while service-client permissions come from an organization-owned credential record and may not exceed the
creating human's effective permissions. This plan uses that existing model with a new dedicated
`verification-privacy:manage` permission; it does not reuse the controller-rights or operator permissions introduced
elsewhere.

The current verification APIs accept individual addresses and CSV batches. Current database rows, queue jobs/results,
source objects, result revisions, and result pointers can all contain or expose a subject. A multi-subject object must be
rewritten to remove or isolate one subject while preserving every other organization's and subject's data. “Complete”
means every indexed and discovered current effect has the policy-required disposition and the plan-08 gate has no
active, expired-unreconciled, staged, or ambiguous older effect.

## Scope and Non-Goals

Add a privacy action policy projection and `verification-privacy:manage`. Add the HTTP intake/status/retry/withdrawal
surface, bind it to the authenticated organization, and keep it concealed and disabled by default. Add the request,
disposition, and suppression persistence layer, BullMQ
orchestration carrying only request IDs, store-specific deletion and rewrite adapters, a backup-bound marker lifecycle,
plan-33 disposition/withdrawal event production, sanitized receipts, and the plan-15 subject-disposition restore
reconciler. Extend the email-verification module through its canonical layers and narrow public application contracts.

Cover current and staged `emails`, `email_verifications`, `smtp_verifications`, async/batch jobs and results, plan-07
artifact metadata, source/result S3 revisions, and canonical result pointers. Apply exceptions and retained/restricted
categories only from the captured policy version. Reject ordinary verification before debit, provider/SMTP probe,
queue publication, or object write while an active disposition blocks processing.

Do not activate the HTTP feature, implement `access` or `correct`, build/download an export, calculate `dueAt`, grant
an extension, send a deadline
notice, or accept a dispute/appeal/escalation event. Do not handle LeadEmailFinder account/auth/billing/fraud/security
rights, California DROP transport, customer identity proofing, or an anonymous consumer portal. Do not select legal
bases, exceptions, retention, or contract language. Do not add migrations, production rollout, broad prefix deletion,
or public compliance claims.

## Plan of Work

Create a strict executable projection of the applicable plan-10 action contract under
`config/privacy/verification-disposition-policy.yaml`. Each immutable version identifies supported actions, technical
disposition mapping, fields/categories to delete or retain under restriction/exception, withdrawal eligibility,
customer instruction evidence, sanitized receipt reason codes, and corresponding plan-12 controller-evidence item IDs.
Reject placeholders, pending approvals, unknown categories/reasons, a missing plan-12 mapping, and policy content that
changes without a version change. Do not put a response duration or universal statutory default in this policy.

Add `verification-privacy:manage` to `AUTH_PERMISSIONS` and the explicit role map. Grant it to human-session `owner`
and `platform_admin` only; do not grant it to `member` or `admin`. Service clients never inherit the membership role:
their active organization-owned credential must list the permission explicitly. Only an active same-organization
human `owner` or `platform_admin` whose own effective permissions include it may grant it, through the existing
human-session-only service-client administration and subset-of-grantor check. Reject disabled/deleted credentials,
cross-organization grant or use, wildcards, default grants, backfills, and an attempt by any service client to manage
credentials. Reuse existing authentication and permission guards, then recheck credential status and organization in
the use case. Resolve organization only from the active principal and resolve the normalized address immediately
through plan 08. The request row stores stable organization, subject, action, policy version, idempotency digest,
technical state, adapter checkpoints, and sanitized evidence references; it does not store the raw address in request,
queue, log, or receipt fields.

Add validated `VERIFICATION_PRIVACY_ENABLED=false`. While false, do not register any `/v1/privacy/verification-requests`
controller, so authenticated and unauthenticated probes receive the application's ordinary `404` without a feature-
specific body. In this PR, a true value fails initialization because the mandatory plan-22
`verification.response-admission.v1` capability is absent. Exercise disposition use cases below HTTP in focused and
integration tests; Bruno proves only concealed default-off behavior. Plan 22 owns first activation and all enabled HTTP
success/rejection coverage.

Expose:

- `POST /v1/privacy/verification-requests` with an `Idempotency-Key` UUID and body
  `{ email, action: 'erase' | 'erase_and_suppress' | 'restrict' | 'object' | 'opt_out' }`;
- `GET /v1/privacy/verification-requests/:id` for owned action, policy version, technical state, per-store sanitized
  dispositions, active disposition, timestamps, and stable reason codes;
- `POST /v1/privacy/verification-requests/:id/retry` for the same owned retryable/manual request; and
- `POST /v1/privacy/verification-requests/:id/withdrawal` for an owned active restriction/suppression when its captured
  policy permits withdrawal.

Use `401` for missing/invalid authentication, `403` for missing permission or disallowed credential state, concealed
`404` for missing/foreign resources, `409` for idempotency conflict or incompatible request/disposition state, and
`422` for an action or withdrawal not allowed by the captured contract. Identical organization/key/body replay returns
the original request under concurrency; the queue job ID is the request ID.

Implement a monotonic request state machine such as `received -> closing -> draining -> applying -> final_scan ->
completed`, with `failed_retryable` and `manual_action_required` as explicit incomplete states. Persist the subject
close epoch and every adapter checkpoint. A retry resumes the same request and close; it never starts another delete or
updates to a newer policy version silently.

For each action, call the plan-08 close primitive, let its organization barrier drain every prior-epoch preparse lease,
and reconcile expired writers. Then process bounded organization/subject resource pages. Delete subject-only database
rows and queue jobs/results using organization plus subject/resource identity. For a shared source/result object, stream
the owned current revision and omit or isolate only policy-targeted rows. Write a new encrypted staging revision,
validate the resulting membership manifest, and compare-and-set the pointer with the plan-08 epoch/generation guard.
Delete the prior revision only after pointer success and verified non-reference. A missing or ambiguous mapper/store
state remains incomplete.

For plain erasure, remove all policy-targeted current and staged payload and prove two equivalent clean scans around the
final compare-and-set. Prepare the receipt and intended new generation, append and verify the plan-33 erasure event,
then atomically mark the receipt and reopen only through the same close owner at that recorded generation. Do not leave
a suppression fingerprint. For `erase_and_suppress`, perform the same deletion and keep a prepared no-processing block
enforced while its event is appended; the terminal compare-and-set then activates the matching acknowledged
disposition. For `object`/`opt_out`, preserve the submitted action and apply the exact policy mapping; if it requires the
same deletion plus no-processing state, reuse that transition. For `restrict`, move only expressly retained data to its
prepared restricted disposition and ensure ordinary verification/status/result paths cannot process or expose it before
or after terminal completion.

Persist active dispositions by stable subject ID and captured subject/HMAC versions, not plaintext. Ordinary intake
consults the stable gate/disposition before debit, probe, enqueue, or upload; suppressed/restricted requests return the
documented `409` reason without revealing whether another organization has the same address. Controller evidence stores
only plan-12-approved fields. It is excluded from verification exports/data and never used for enrichment, matching
across organizations, marketing, provider selection, or billing.

For every completed plain erasure, continuing disposition, or withdrawal, first prepare the minimum plan-12-approved
keyed local marker and event payload. Append the pseudonymous `verification.subject-dispositions.v1` event through plan
33 after the final resource scans/effects are known and before the terminal receipt or gate transition. Record event ID,
sequence, digest, and authority fence in the terminal compare-and-set. An append outage/ambiguity or stale fence leaves
the gate conservatively closed and the request nonterminal; an acknowledged append followed by a local crash retries to
the same event and converges.

Use the authoritative plan-15 metadata readers and the complete plan-11 source inventory to enumerate every backup
generation captured before the transition that can contain the affected verification stores. Persist safe source/
generation evidence IDs and `requiredUntil` no earlier than the latest immutable expiry or destruction of all such
generations. Missing source coverage, unknown generation/captured-at, unknown expiry/destruction, stale evidence, or
contradictory inventory sets unresolved coverage and retains the local marker indefinitely. A bounded marker lifecycle
job re-enumerates immediately before deletion and may remove a local marker only after authoritative evidence proves
every qualifying generation irreversibly unavailable. Plan 33 retains the authority event and required alias/key
versions through the same protection floor; local marker removal never deletes or replaces that event. Clearing request
ciphertext or ordinary verification payload follows its own policy and never waits merely because the keyed marker
remains.

Withdrawal locks the active disposition and subject gate, validates the captured policy and originating reference, and
prepares the controller-evidence transition while the existing block remains effective. It appends and verifies the
plan-33 withdrawal event, then atomically records its acknowledgment, advances the subject generation, and opens
ordinary processing. It does not restore deleted/restricted payload or revive queue/object revisions. Identical
withdrawal replay returns the same event/state; a conflicting or ineligible withdrawal returns `409` or `422`.

Implement `VerificationDispositionRestoreReconciler` against plans 15 and 33. For the restored generation, page the
exact authority interval `(backupIncludedHighWatermark, restoreTargetWatermark]` in sequence order and apply or safely
skip every event through the target. Rebuild the plan-08 resource index if the restored snapshot predates it. Delete or
rewrite restored subject resources and preserve disposition/withdrawal ordering so neither a block nor its withdrawal
reappears incorrectly. Unknown keys, event/policy versions, resources, failed object deletion, event gaps, stale fence,
or missing/unknown backup-coverage evidence keep quarantine. The reconciler treats unresolved local projection state as
required and never infers completion from current-store absence. Register the exact stable descriptor and authority
consumer version in the restore-readiness manifest.

Update the processing/controller contracts, email-verification README, and `bruno/privacy-requests`. Document processor
role, request authentication, actions, receipts, controller-evidence separation, retry/manual states, withdrawal, and
restore behavior without claiming that runtime tests constitute legal approval.

## Interfaces and Dependencies

The action and request contracts are equivalent to:

    type VerificationDispositionAction =
        | 'erase'
        | 'erase_and_suppress'
        | 'restrict'
        | 'object'
        | 'opt_out'

    interface VerificationDispositionPolicy {
        resolve(input: {
            organizationId: string
            action: VerificationDispositionAction
            receivedAt: Date
        }): ApprovedVerificationDispositionPolicy
    }

    interface VerificationSubjectDispositionExecutor {
        execute(requestId: string): Promise<VerificationDispositionProgress>
        retry(requestId: string): Promise<VerificationDispositionProgress>
        withdraw(requestId: string): Promise<VerificationDispositionProgress>
    }

The plan-08 public gate/identity/resource contracts are the only cross-layer access to subject concurrency. Store
adapters are purpose-specific application ports and remain private to email-verification infrastructure. BullMQ carries
only request ID. The plan-15 public `RestoreReconciler` descriptor is
`verification.subject-dispositions.v1` at the implementation-fixed version. Plan 33 supplies the append-once
acknowledgment and bounded ordered event range; this module exposes only its narrow producer and consumer contracts and
never imports the selected provider adapter.

Plans 08, 10, 12, 15, and 33 supply the technical gate, action/assistance contract, controller-evidence classification,
authoritative backup metadata, restore quarantine, and non-restored event authority. Plan 21 adds access collection/
export to this request aggregate; plan 31 adds dual-subject correction and its own restore descriptor. Plan 22 adds
contract-driven clocks, support events, the mandatory admission capability, and first activation. Plan 09 invokes the internal
`erase_and_suppress` application command with its own official DROP identity; it never calls this plan's HTTP
controller or fabricates a customer credential.

## Acceptance Criteria

- `verification-privacy:manage` is granted to human `owner` and `platform_admin` roles only. An active service client
  can use it only when the same-organization credential explicitly contains it and an eligible same-organization human
  granted that subset. Member/admin humans, implicit service-client roles, disabled credentials, cross-organization
  actors, wildcards, and service-client grant attempts are rejected.
- The committed default does not register verification privacy controllers and returns ordinary `404` for every route
  probe. Setting `VERIFICATION_PRIVACY_ENABLED=true` fails initialization until plan 22 supplies
  `verification.response-admission.v1`; this plan cannot expose a partially admitted HTTP request.
- Intake supports exactly `erase`, `erase_and_suppress`, `restrict`, `object`, and `opt_out`; each request captures an
  approved plan-10 policy version and mapped plan-12 evidence items. Missing or pending mappings block intake.
- Identical organization/idempotency/action/subject replay returns one request and one job; conflicting reuse returns
  `409` under concurrent intake.
- Writer-first and disposition-first races satisfy plan 08: no older database, queue, unparsed upload, staged object,
  result revision, or pointer can publish after close or after a later reopen.
- Plain `erase` removes or safely rewrites every policy-targeted current/staged PostgreSQL/BullMQ/S3 resource, proves a
  final clean scan, leaves no suppression, and reopens only at a new generation.
- `erase_and_suppress`, contract-equivalent `object`/`opt_out`, and `restrict` leave the exact persistent disposition;
  ordinary processing rejects before debit, external disclosure, queue publication, or object write.
- A shared batch source/result is staged and compare-and-set rewritten so the target subject is removed/restricted and
  every unrelated subject remains byte/row-equivalent according to the canonical format.
- A crash or unknown adapter state remains retryable/manual and cannot produce a completed receipt. Retry resumes the
  same close, checkpoints, and request without duplicate deletion or disposition.
- Every completed disposition or withdrawal has one read-after-write-verified plan-33 event whose ID, sequence, digest,
  and fence are recorded by the local terminal compare-and-set. Authority failure or ambiguity leaves a conservative
  nonterminal state; append success followed by a local crash retries to the same event and converges.
- Authorized withdrawal applies only to the originating active disposition and captured policy, advances generation,
  opens future processing, and never restores deleted data or stale work.
- Request/disposition/suppression evidence contains only plan-12-approved controller fields and lifecycle; it is not
  returned as customer verification payload or reused for an independent purpose.
- Each disposition/withdrawal marker has a backup-bound `requiredUntil` and remains until authoritative evidence proves
  every pre-transition backup generation capable of resurrection has irreversibly expired or been destroyed. Unknown
  or missing evidence retains it indefinitely and blocks restored-generation release.
- A restored pre-disposition snapshot remains quarantined until `verification.subject-dispositions.v1` consumes every
  ordered authority event after the backup watermark through the fixed target, reapplies every applicable active/
  withdrawn generation, verifies current resources, and checkpoints the exact target; failure or ambiguity blocks
  release.
- HTTP status, authorization, ownership, idempotency, action, retry, withdrawal, suppressed-processing, and restore
  behavior pass focused application/integration coverage; Bruno proves the committed concealed/default-off surface.
- No access export, correction, deadline/extension/support workflow, DROP transport, migration, production rollout, or
  compliance claim is added.

## Validation

Run policy, request, disposition, authorization, and adapter suites:

    corepack pnpm privacy:verification-disposition-policy-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-privacy-request verification-subject-disposition verification-disposition-restore --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/identity/src/domain/auth-principal.spec.ts src/libs/modules/auth/src/application/role-permission-policy.service.spec.ts --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_privacy_disposition_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-disposition.integration.spec.ts verification-disposition-restore.integration.spec.ts --runInBand

Cover every action and rejection, same/conflicting idempotency, two organizations sharing an address, active/expired
writer leases, upload-before-parse, multi-subject object rewrite, deletion/pointer failures, retry/manual state, final
scan, plain-erasure reopen, persistent block, and withdrawal. Inject a crash after close, drain, each store checkpoint,
staging, pointer swap, old-object deletion, disposition finalization, and before reopen.

Exercise a synthetic plan-15 restore captured before erase, suppression, restriction, and withdrawal. Keep ordinary
API/workers/readiness blocked and replay the plan-33 range in bounded pages. Inject a missing event, key, policy, or
resource, as well as a stale fence, authority outage, and object-delete failure. Retry and release only after disposition
and plan-07 age reconcilers complete at the fixed target. Also crash after authority append and before each local
terminal transition; require same-event convergence and no terminal receipt without acknowledgment.

Inspect `lef-api-1` ownership first. Against an owned disposable Compose project, run:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer

With the committed default, cover unauthenticated, owner, service-client, and platform-admin probes and require the same
ordinary `404`; do not enable the routes in this PR. Exercise every action, same/conflicting idempotency, organization
binding, permission matrix, retry, plain-erasure reprocessing, persistent rejection without debit, multi-subject batch
preservation, and withdrawal in focused/integration tests. Never commit secrets or real addresses. Return to the
repository root before final checks.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/20-fulfill-verification-disposition-requests.md
    corepack pnpm exec prettier --check config/privacy/verification-disposition-policy.yaml docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/20-fulfill-verification-disposition-requests.md
    git diff --check

Bruno: add `bruno/privacy-requests` and require the exact command above to prove all verification privacy routes are
concealed with the committed default. Enabled disposition, authorization, ownership, idempotency, retry, rewrite,
rejection, reopen, and withdrawal cases are intentionally deferred to plan 22, the first activation plan.

## Idempotence and Recovery

The request has one unique organization/idempotency digest over subject, action, and captured policy. Its BullMQ job ID
is deterministic. State and adapter checkpoints advance by compare-and-set. Replaying intake, close, deletion/rewrite,
final scan, authority append, completion, retry, or withdrawal returns or advances the same request; it never creates
another effect. Authority event identity is deterministic from request and transition. Conflicting content is rejected
without advancing state.

Object rewrites stage a new owned revision, verify the membership manifest, and swap the pointer before deleting the old
revision. Failure during staging or pointer swap removes only an unreferenced revision. Old-revision deletion failure remains
incomplete. Already-absent resources count as success only after organization/subject scope and the current index are
verified. Unknown state remains manual, not absent.

If a worker crashes, the plan-08 close remains authoritative and blocks stale writers. Resume from durable adapter
checkpoints. If a restore reconciler fails, leave plan 15 quarantined. Never recover by reopening a subject manually,
dropping controller evidence, bypassing a contract exception, flushing Redis, deleting an S3 prefix, editing a restore
checkpoint, or treating a missing mapper result as no effect.

For incompatible synchronized development state, preserve unrelated work, verify Compose ownership, and use the
repository's explicit owned reset/reseed. Recreate only synthetic fixtures and replay the same idempotency key.

## Artifacts and Notes

Record policy/controller-contract versions, permission matrix, synthetic request/subject/close IDs, sanitized per-store
counts and checkpoints, disposition/withdrawal generation, safe authority event/sequence/fence and backup evidence IDs,
`requiredUntil`, restore descriptor/checkpoints, focused/integration totals, and Bruno totals. Never record raw addresses beyond committed
fixtures, HMAC digests, ciphertext, keys, CSV/object contents, queue payloads, credentials, customer identity, or
private legal/contract evidence.

## Plan readiness

Ready to implement
