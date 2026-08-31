# Add the Audit and Security Facts Privacy Adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect controller privacy to local audit/security facts without rewriting immutable evidence or leaking private risk
logic. After this change, requests and retention operations receive truthful access, annotation, restriction, retained,
and plan-32 hold effects from one facts owner adapter. Hold administration remains entirely in plan 32, managed
external payload mutation remains in plan 30, and the complete workflow remains disabled until plan 18.

## Progress

- [ ] (2026-08-30) Add the audit/security facts owner facet and bridge adapter.
- [ ] (2026-08-30) Implement subject-attributable access, correction annotation, restriction, and plan-32 hold effects.
- [ ] (2026-08-30) Add bounded local audit/security retention operations with explicit exception rechecks.
- [ ] (2026-08-30) Validate immutability, private-field exclusion, hold concurrency, and disabled registry behavior.

## Plan dependencies

- `privacy-compliance/11`
- `privacy-compliance/13`
- `privacy-compliance/16`
- `privacy-compliance/26`
- `privacy-compliance/32`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use one stable descriptor, `audit-security.controller-data.v1`, backed by an owner facet that returns
  policy-approved dispositions but never exposes unrestricted log search or owns a legal hold.
  Rationale: Audit/security facts form one local data boundary; plan 32 separately supplies the shared hold boundary to
  every mutating adapter.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Correct immutable audit/security facts only with a linked annotation where plan 12 approves it; never
  overwrite or delete the original merely to make a receipt look complete.
  Rationale: Historical and investigation integrity must remain truthful.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Plan 11 store IDs may identify an external policy boundary, but its processor-copy 30-day maximum never
  supplies controller audit/security retention. Use only plan-12/plan-26-approved rules and return pending when those
  decisions or evidence are absent.
  Rationale: Customer-verification storage limits cannot be repurposed as legal/security evidence lifecycles.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Implement local owner `findRetentionDue`/`applyRetention` operations here and consume the exact plan-32
  hold query/guard without implementing hold create, renew, release, expiry, storage, or HTTP. Plan 18 coordinates but
  does not mutate owner data.
  Rationale: Immutable evidence rules stay with their owner while the global hold lifecycle remains single-sourced.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Consume the approved assessment/accountability evidence-retention facts from plan 26 directly; absence or stale
  evidence blocks mutation rather than falling back to the processor-copy maximum in plan 11.
  Rationale: This adapter must preserve required security/accountability facts under their controller decision.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Every annotation, restriction, deletion, and retention apply acquires sorted plan-32 hold guards before
  canonical audit/security rows and transactionally rechecks the fence/effective decision after those rows are locked
  and immediately before commit. Unknown hold, investigation, or managed-provider state remains pending/manual.
  Rationale: An immutable-fact check cannot close the race with a newly effective hold by itself.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: This adapter-only PR changes no controller HTTP contract and adds no Bruno request. Plan 18 owns target-
  real/rest-fake, complete-real, and end-to-end HTTP/Bruno coverage.
  Rationale: The real registry deliberately cannot be enabled.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Keep `CONTROLLER_PRIVACY_ENABLED=false`.
  Rationale: Plans 17, 18, 27, 28, and 30 remain mandatory.
  Date/Author: 2026-08-30, privacy plan review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Identity persists immutable audit log entries with actor/target snapshots. Authentication and other modules emit
security events, and real managed sinks/backups may be external. Plan 11 inventories only processor-copy policy
boundaries and flags mixed stores; plan 12 decides controller data/rights/retention, plan 14 owns incidents, and plan 26
owns assessment/accountability evidence. Plan 32 owns durable legal holds. This plan implements only the local facts
owner and applies plan-32 decisions without treating every security event as subject-accessible or eligible for deletion.

## Scope and Non-Goals

Add the facts-owner facet, local adapter implementation, controller bridge, local retention operations, disabled
composition registration, focused/PostgreSQL/concurrency tests, and owner/controller README updates for assigned
plan-12 items.

Do not search or mutate external managed providers, expose private risk rules, alter incident evidence outside an
approved decision, implement financial/human/service-client data, schedule central retention, reconcile restores, add
migrations, activate the feature, or claim compliance.

## Plan of Work

Define `AuditSecurityControllerPrivacyOperations` in the owning module. Accept verified opaque subject/
organization scope and stable item/action IDs. Return approved disposition/reason, safe count, hold reference ID, and
retry/manual state. Keep TypeORM repositories, raw logs, risk rules, detection signatures, incident case contents, and
legal advice private.

Implement access only for plan-12-attributable fields and categories. Exclude other actors/subjects, unrestricted event
payloads, secrets, tokens, private risk logic, and active investigation detail. Implement approved correction as a
linked append-only annotation. For any annotation/restriction/deletion/objection, sort and acquire plan-32 scope guards
before canonical audit/security row locks; never acquire a hold guard while retaining an owner lock. Transactionally
recheck the guard fence/effective decision, investigation status, immutable-fact rules, and plan-26 evidence requirement
after owner locking and immediately before commit. Return the
approved retained/restricted reason when original evidence must remain. Do not create, renew, release, expire, persist,
or administer holds in this module.

Add bounded stable-cursor `findRetentionDue` and `applyRetention` for local audit/security/annotation records only,
using plan-12-approved triggers. Apply uses the same hold-first/owner-second lock order and rechecks the plan-32 guard,
investigation, plan-26 assessment-evidence requirement, and immutable-fact rules. External store work returns a plan-30
handoff/manual result, not success.

Register `audit-security.controller-data.v1` and its exact coverage. Prove it satisfies its subset while missing
plans 17, 18, 27, 28, and 30 keep activation in a fail-closed state.

## Interfaces and Dependencies

The owner facet is equivalent to:

    interface AuditSecurityControllerPrivacyOperations {
        execute(input: AuditSecurityPrivacyInput): Promise<ControllerPrivacyOwnerResult>
        findRetentionDue(input: RetentionQuery): Promise<DuePage>
        applyRetention(input: RetentionItem): Promise<ControllerPrivacyOwnerResult>
    }

The descriptor is exactly `audit-security.controller-data.v1`. This owner consumes the narrow hold query/guard token
from plan 13, which plan 32 implements; it exports no hold-management facet. Plan 30 consumes external-store handoffs. Existing
TypeORM/logging/incident systems remain behind owner adapters.

## Acceptance Criteria

- Every assigned local audit/security item/action/retention rule maps exactly once to the stable descriptor; no hold
  administration item is owned here.
- Access/export contains only approved attributable categories and excludes other subjects, secrets, raw payloads,
  private risk rules, and active-investigation details.
- Correction appends a linked annotation and never rewrites an immutable event.
- Delete/restrict/object outcomes preserve active holds, investigations, required accounting/security facts, and plan-
  26 evidence using exact approved reason codes; unknown state remains pending.
- Hold/action races serialize through plan 32: sorted hold guards precede owner locks, guard fences are checked again,
  and this adapter implements no hold lifecycle.
- Retention is bounded, uses only approved controller rules, and never inherits the processor 30-day maximum in plan 11.
- External managed-store work is handed to plan 30/manual state and is not falsely completed.
- Registry activation still fails for exact outstanding plans; no provider mutation, central scheduler, restore,
  migration, or production activation is included.
- Focused, PostgreSQL, hold-race, concurrency, architecture, full, build, and docs checks pass. Bruno is not applicable
  below HTTP; plan 18 owns hybrid/complete route coverage.

## Validation

Run the exact focused commands:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- audit-security-controller-privacy audit-security-controller-retention --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- audit-security-controller-privacy.integration.spec.ts --runInBand

Cover attributable and not-attributable events, private-field exclusion, annotation, plan-26 evidence present/missing/stale,
active/released/expired/unknown plan-32 holds, reversed lock-order rejection, hold/action concurrency, investigation
state, retention boundaries, external handoff, and exact incomplete-registry diagnostics. Bruno is not applicable to
this below-HTTP adapter PR; plan 18 runs target-real/rest-fake and complete-real controller HTTP coverage.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/identity/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/29-add-audit-security-holds-privacy-adapter.md
    corepack pnpm exec prettier --check src/libs/modules/identity/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/29-add-audit-security-holds-privacy-adapter.md
    git diff --check

## Idempotence and Recovery

Append-only annotations, plan-32 guard versions, stable cursors, and owner transactions make replay converge. Missing state is
success only after exact scope verification; unknown hold/investigation/provider state remains pending.

Reset only an owned disposable PostgreSQL environment. Never rewrite audit history, remove a live hold, delete an
incident range, expose a risk rule, or weaken owner checks to force completion.

## Artifacts and Notes

Record descriptor/item versions, safe category/count/reason IDs, synthetic guard references, retention cursors,
concurrency outcomes, plan-26 evidence versions, and test totals. Never record raw logs/events, identities, tokens, private risk/
incident/legal detail, provider payloads, or credentials.

## Plan readiness

Ready to implement
