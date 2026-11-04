# Enforce Durable Controller Legal Holds

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Implement the real provider behind the controller hold query and mutation-guard ports from plan 13 before any data owner can
perform a destructive, restrictive, corrective, or retention mutation. After this change, an authorized platform
administrator can create, renew, release, inspect, and expire a scoped legal hold; every decision is durable,
idempotent, audited, race-safe, and recoverable without exposing a legal narrative to controller jobs or receipts.

A developer can use an authenticated browser session to create a synthetic hold, observe an owner-style mutation
guard return `held`, release the hold with an expected version, and then observe the same guard permit work. Competing
hold and mutation operations serialize under one documented lock order. This PR does not register any real data-owner
adapter or enable controller privacy.

## Progress

- [ ] (2026-08-30) Freeze approved hold reason, scope, review, expiry, evidence, and audit policy from plans 12 and 26.
- [ ] (2026-08-30) Implement durable hold, scope-lock, mutation-guard lease, version, and idempotency state.
- [ ] (2026-08-30) Implement exact human-platform-admin HTTP and bounded expiry/recovery command contracts.
- [ ] (2026-08-30) Implement the plan-13 query/guard provider, global lock order, renewals, expiry, and failure recovery.
- [ ] (2026-08-30) Append and verify every hold transition through plan 33 before local terminal state, and register
      `controller.legal-hold-events.v1` for restore-first hold-set reconstruction.
- [ ] (2026-08-30) Validate authorization, CSRF/Origin, idempotency, overlapping holds, races, crash recovery, auditing,
      architecture, HTTP behavior, and documentation.

## Plan dependencies

- `privacy-compliance/12`
- `privacy-compliance/13`
- `privacy-compliance/26`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Implement the plan-13 `ControllerHoldQuery` and `ControllerHoldMutationGuard` in a dedicated
  `controller-legal-holds` business module; do not place hold persistence in audit/security or an individual owner.
  Rationale: One durable provider must govern every owner consistently and remain independently reviewable.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: A hold scope is exactly one approved organization plus either the organization as a whole or one durable
  plan-13 subject-alias ID, and a nonempty sorted set of plan-12 controller item IDs. Store only keyed/opaque scope
  values, approved reason/evidence reference IDs, timestamps, status, and versions; never store legal narrative in a
  job, receipt, URL, or audit payload.
  Rationale: Owner adapters need deterministic matching without creating a second plaintext identity or legal file.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Apply the global lock order fixed by plan 13: canonicalize and sort all hold-scope keys, acquire their
  durable guards, and only then let an adapter acquire owner locks in canonical row-key order. Hold create, renew,
  release, expiry, and owner mutation guards all contend on the same scope rows; acquiring a guard while holding an
  owner lock is a contract violation.
  Rationale: A single order prevents deadlocks and closes the hold-created-during-deletion race.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Use renewable, fenced mutation-guard leases. The provider returns an opaque lease ID, monotonically
  increasing fence, hold-set version, expiry, and decision. The caller must renew bounded long work, call
  transaction-bound `assertCurrentForCommit` after owner locks and immediately before a local commit, recheck before
  authoritative remote confirmation, and release idempotently. Lost, stale, expired, or unavailable leases return
  pending/manual and never terminal success.
  Rationale: Owner work may span Redis or external systems and cannot share one PostgreSQL transaction.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Hold administration requires an exact active `human_session`, `platform_admin`, and `privacy:admin`.
  Every mutating browser request requires an allowed `Origin`, the existing double-submit CSRF header/cookie, and an
  `Idempotency-Key`; service credentials and bearer-only automation are rejected.
  Rationale: A legal hold changes every privacy and retention outcome and needs explicit human authority plus browser
  request-forgery protection.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Append every create, renew, release, and expire transition to the non-restored plan-33 authority before its
  local terminal response/state. A prepared create is conservatively effective for guards; a prepared renew keeps the
  stronger existing terms; and a prepared release/expiry leaves the hold effective. The local terminal transaction
  records the authority acknowledgment and accepted audit event atomically.
  Rationale: An older database restore can lose a later hold or revive a released hold. Conservative prepared semantics
  close the cross-store append window without letting authority failure weaken protection.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Register `controller.legal-hold-events.v1` and require its current-hold-set projection to reach the plan-33
  restore target before any controller data-owner or lifecycle mutation can run.
  Rationale: Replaying a controller deletion before reconstructing holds would recreate the hold-versus-mutation race
  inside quarantine.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Use TypeORM synchronization only in disposable development data; add no migration, backfill, production
  rollout, or high-availability claim.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy plan review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 12 defines controller item IDs, approved retained/restricted reason codes, and response semantics. Plan 13 defines
the pure hold query/guard ports and human-only `privacy:admin` permission but supplies only fakes. Plan 26 records the
approved lawful-basis, assessment, evidence-retention, review, and accountability decisions that determine which hold
reason/evidence codes are valid. Plans 16, 17, and 27–30 will depend on this PR before implementing real mutations.
Plan 33 supplies the independently durable ordered authority, backup included watermark, restore target/fence, alias-key
versions, and sealed minimum scope selector needed when an older database restore predates a hold transition.

A hold is an exception decision, not an instruction to expose or preserve every field. Multiple holds may overlap one
scope, and releasing one does not permit mutation while another effective hold still covers the item. Expiry means an
approved time-based state transition; it does not delete the audit history or evidence reference.

## Scope and Non-Goals

Create `src/libs/modules/controller-legal-holds/` with canonical layers and README; private TypeORM repositories;
query/guard provider; HTTP administration; bounded expiry/recovery commands; approved configuration/policy parsing;
plan-33 event production; `controller.legal-hold-events.v1`; audit emission; API composition; and focused/PostgreSQL/
HTTP/Bruno tests.

Do not implement a data-owner adapter, controller request fulfillment, central retention, provider mutation, incident
case management, legal-basis selection, migration, real production activation, or compliance claim. Do not accept
free-form legal narrative or plaintext subject identifiers.

## Plan of Work

Generate `config/privacy/controller-hold-policy.yaml` from the approved plan-12/plan-26 register. Require immutable
policy version; approved reason/evidence code; allowed item IDs; maximum effective/review/expiry intervals; whether
organization or subject scope is allowed; and the accountable owner role. Unknown, removed, expired, duplicate, or
pending policy rows fail startup and block writes.

Model `ControllerLegalHold`, `ControllerHoldScope`, `ControllerHoldScopeLock`, `ControllerHoldGuardLease`, and
`ControllerHoldCommand`. Persist hold UUID, keyed organization scope, optional plan-13 subject-alias UUID, sorted item
IDs, reason/evidence reference codes, effective/review/expiry times, status, integer version, timestamps, and actor's
pseudonymous audit ID. Persist a unique HMAC of idempotency key plus route/actor and a request fingerprint. Encrypt any
resumable sensitive value with the keyring from plan 13. Never persist a raw idempotency key, email, issuer subject, free-form
legal text, or credential.

Add nonterminal command states for `create_prepared`, `renew_prepared`, `release_prepared`, and `expire_prepared`, each
with the intended version and deterministic plan-33 event identity. Guards treat `create_prepared` as covering its
scope, retain the stricter effective values during `renew_prepared`, and keep holds under `release_prepared` or
`expire_prepared` active. None of these command states appears as a successful administration response.

Implement exact administration contracts:

- `POST /v1/privacy/controller-holds` requires `Idempotency-Key`, allowed `Origin`, `X-CSRF-Token`, exact active
  `human_session` plus `platform_admin` plus `privacy:admin`, and body
  `{ scope: { kind: "organization", organizationId, itemIds } | { kind: "subject", organizationId, subjectAliasId, itemIds }, reasonCode, evidenceReferenceId, effectiveAt, reviewAt, expiresAt }`.
- `PATCH /v1/privacy/controller-holds/:holdId` renews/reviews a hold and requires the same authority/headers plus an
  `If-Match` header whose value is the exact quoted integer version, and body
  `{ evidenceReferenceId, reviewAt, expiresAt }`.
- `POST /v1/privacy/controller-holds/:holdId/release` requires the same headers and `If-Match`, with exact body
  `{ releaseReasonCode, evidenceReferenceId }`.
- `GET /v1/privacy/controller-holds/:holdId` requires the same human authority and allowed Origin but no CSRF or
  idempotency header; it returns only scope kind, safe item IDs/codes/times/status/version and conceals missing IDs.

Reject unknown body fields. Use `401` for no valid session, `403` for wrong credential/role/permission or Origin/CSRF,
concealed `404` for missing hold, `409` for idempotency fingerprint conflict, stale `If-Match`, active guard conflict,
or illegal transition, and `422` for a syntactically valid but policy-disallowed scope/time/code. Identical idempotent
replay returns the original status/body. Audit accepted and rejected commands with safe route/result/reason codes; an
accepted hold transition and its audit record commit atomically.

For every command, sort canonical scope keys, acquire a renewable durable scope-command reservation, reread all
overlapping holds, validate the policy and required version, and persist the prepared transition plus idempotency
identity. Create or renew cannot silently shorten an approved minimum/evidence period. Release never deletes history.
Append and strongly verify the minimal `controller.legal-hold-events.v1` event through plan 33 while the reservation is
current. It contains only opaque organization/subject aliases, item IDs, transition/version, safe reason/evidence codes,
times, hold-set fence, and an encrypted minimum scope selector when needed. It contains no legal narrative.

After the acknowledgment, reacquire the canonical scope rows and compare-and-set the exact command-state version and
reservation fence. Atomically apply the local terminal transition, record event ID/sequence/digest/authority fence, and
commit the accepted audit event. An append timeout/ambiguity or lost reservation remains conservative and nonterminal;
same-input recovery looks up/reuses the event before finalization. The query port returns the union of all effective
overlapping holds and conservatively active command preparations plus the current hold-set version. The mutation guard acquires the same
scope rows, records a fenced renewable lease, and denies work if any effective hold or command preparation applies. A hold command
cannot pass an active lease; it returns retryable `409` rather than changing state concurrently.

Provide a transaction-aware commit verifier behind the same narrow guard token. Local TypeORM owners call
`assertCurrentForCommit` from inside their already-open owner transaction after the canonical owner rows are locked; the infrastructure
bridge checks the durable lease/fence/hold-set version without exporting a repository or `QueryRunner`. Redis and
provider owners keep the lease renewed across one bounded atomic/remote attempt and recheck afterward. Any inability to
make the required local transactional check or authoritative external recheck is pending/manual, never success.

Run expiry through exactly
`corepack pnpm privacy:controller-holds:expire -- --at <ISO-8601> --limit <1..500> [--cursor <opaque>]` and recovery
through exactly
`corepack pnpm privacy:controller-holds:recover -- --at <ISO-8601> --limit <1..500> [--cursor <opaque>]`.
Expiry transitions due active holds under the same scope lock and appends audit. Recovery reclaims only guard leases
whose expiry and heartbeat evidence are both stale. It resumes incomplete idempotent authority/audit transitions and
reports safe counts/cursor. It never releases a legal hold without the acknowledged expiry event and matching local
terminal compare-and-set. Invalid/missing options fail without mutation. Repeating either command converges.

Implement `ControllerLegalHoldRestoreReconciler` as `controller.legal-hold-events.v1`. Starting from the hold projection
in the restored snapshot, consume every plan-33 event in
`(backupIncludedHighWatermark, restoreTargetWatermark]` in exact order and rebuild the current effective hold set. A
missing event/schema/key/scope, sequence gap, stale authority fence, version conflict, or incomplete page keeps
quarantine. The restore registry makes this consumer a prerequisite of `controller.data-lifecycle.v1` and every
controller data-owner mutation. Only after its checkpoint equals the target may those reconcilers acquire hold guards.

## Interfaces and Dependencies

Implement the contracts from plan 13 without widening them:

    interface ControllerHoldQuery {
        query(input: ControllerHoldScope): Promise<ControllerHoldDecision>
    }

    interface ControllerHoldMutationGuard {
        acquire(input: ControllerHoldGuardInput): Promise<ControllerHoldGuardLease>
    }

The lease exposes `leaseId`, `fence`, `holdSetVersion`, `expiresAt`, safe decision/reason IDs, and `renew`,
transaction-bound `assertCurrentForCommit`, external `assertCurrent`, and `release`. Exact configuration is
`CONTROLLER_HOLDS_ENABLED=false`,
`CONTROLLER_HOLD_POLICY_FILE=config/privacy/controller-hold-policy.yaml`, positive
`CONTROLLER_HOLD_GUARD_TTL_SECONDS`, and `CONTROLLER_HOLD_GUARD_RENEW_SECONDS` strictly less than half the TTL.
The runtime capability descriptor is exactly `controller.legal-holds.v1`. Committed configuration remains disabled;
owner adapters may inject the provider only after plan 32 is complete.

This module also implements plan-33 producer/consumer contracts for `controller.legal-hold-events.v1`. It depends only
on the narrow append-once, range, and acknowledgment interfaces; the selected authority provider remains private to
plan 33. Plan 15 supplies the range/checkpoint and restore-ordering context. The consumer must reach the exact target
before the hold provider can authorize any restored-generation owner mutation.

## Acceptance Criteria

- Exact active human-session platform-admin plus `privacy:admin` authorization is enforced; service credentials,
  bearer-only calls, missing/disallowed Origin, missing/invalid CSRF, and unknown body fields are rejected.
- Create, renew, release, get, expiry, and recovery obey the exact DTO/header/command contracts, policy codes and time
  limits, optimistic versioning, idempotent replay, and safe status semantics.
- Multiple overlapping holds compose; releasing/expiring one does not unblock a scope covered by another.
- Hold commands and owner-style guards serialize in canonical scope order. An active hold denies mutation, and a lost,
  stale, expired, or unavailable guard cannot be reported as success.
- Accepted transitions and audit events commit together. Audit/log/job/receipt data contains no plaintext subject,
  idempotency key, credential, evidence narrative, or legal advice.
- Each create, renew, release, and expire has one read-after-write-verified plan-33 event before local terminal state/
  response. The `create_prepared`, `renew_prepared`, `release_prepared`, and `expire_prepared` semantics remain
  conservatively held during authority failure; append
  success followed by a local crash retries the same event and converges.
- An older restored snapshot cannot lose or reverse a hold transition. `controller.legal-hold-events.v1` consumes every
  ordered event after the backup watermark through the fixed target and rebuilds the hold set before any controller
  owner/lifecycle mutation; missing authority evidence or an incomplete checkpoint blocks release.
- Expiry is bounded and fake-clock testable. Recovery reclaims only provably stale leases and never releases a hold or
  edits owner data.
- The real query/guard provider is available through a narrow token, but no owner adapter or complete registry is
  enabled in this PR.
- Focused, PostgreSQL, authorization, Origin/CSRF, idempotency, concurrency, recovery, architecture, HTTP, docs, and
  Bruno checks pass.

## Validation

Run the exact repository-root commands:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-legal-holds controller-hold-policy --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-legal-holds.integration.spec.ts --runInBand

Cover permitted and rejected scopes/codes/times, every auth/Origin/CSRF branch, replay/conflict, stale versions, and
multiple holds. Also cover create-versus-guard, renew/release-versus-guard, reversed input ordering, guard renewal/loss,
crash behavior around commit, expiry pages, recovery pages, atomic audit failure, and safe logs.

For every hold transition, cover authority failure before/after provider acceptance, local crash after append, lost
scope reservation, same/conflicting event replay, and proof that prepared state never weakens a guard. Restore a backup
captured before create, renew, release, and expiry; replay bounded events through the exact target; and require hold-set
reconstruction before a controller owner or lifecycle reconciler can mutate. Missing event/key, a sequence gap, stale
fence, or authority outage must keep quarantine.

Add `bruno/controller-legal-holds` for create/get/renew/release, replay/conflict, wrong session role/credential,
Origin/CSRF failure, stale version, policy rejection, and concealed missing ID. With its disposable local dependencies
running, execute from that directory:

    bru run --env local

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check config/privacy/controller-hold-policy.yaml src/libs/modules/controller-legal-holds/README.md src/libs/modules/controller-privacy/README.md bruno/controller-legal-holds/README.md .agents/plans/privacy-compliance/32-enforce-controller-legal-holds.md
    git diff --check

## Idempotence and Recovery

Unique command fingerprints, expected versions, sorted scope locks, fenced renewable leases, bounded cursors, and
deterministic plan-33 events plus atomic audit transitions make replay converge. Same-key/same-input returns the original
result; conflicting reuse, stale version, unknown scope, lost guard, or unavailable authority causes a fail-closed
result. An accepted event with incomplete local finalization is recovered by event lookup and the prepared transition;
it is never deleted or replaced.

Use the bounded recovery command for stale guard or interrupted transition evidence. Reset only an owned disposable
PostgreSQL environment when synchronized schema is incompatible. Never release/edit a hold, owner row, audit event,
or broad data range manually to force progress.

## Artifacts and Notes

Record policy/version IDs, synthetic hold/lease/command IDs, safe result codes, cursor/page counts, race outcomes,
safe authority event/sequence/fence and restore checkpoints, test totals, and Bruno totals. Never record identities, raw idempotency/CSRF values, cookies, credentials, legal
narrative/advice, or evidence contents.

## Plan readiness

Ready after the following approvals. Privacy counsel must approve the exact hold reason/release codes, rules for scope
and time, and evidence-reference policy in plans 12/26. Security and Operations must approve the guard lease TTL/renewal
values plus the expiry/recovery owner. Until then, hold writes and every dependent mutating adapter remain disabled.
