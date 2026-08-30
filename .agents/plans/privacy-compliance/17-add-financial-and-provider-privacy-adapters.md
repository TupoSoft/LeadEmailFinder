# Add Local Credits and Payments Privacy Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect the controller-privacy core only to locally owned credit and payment/accounting records without corrupting
balances or immutable financial truth. After this change, fake-free tests can access approved subject-attributable
fields, create correction annotations, apply truthful retained/restricted outcomes, and execute bounded owner retention
for local rows. External provider assistance, audit/security evidence, and final activation remain separate.

## Progress

- [ ] (2026-08-30) Run the binding pre-implementation size/decomposition gate for the cohesive credits/payments pair.
- [ ] (2026-08-30) Add narrow local credit/payment privacy facets, two bridge adapters, and the opaque provider-
      reference handoff consumed by plan 30.
- [ ] (2026-08-30) Preserve purchase, adjustment, ledger, idempotency, investigation, legal-hold, and audit invariants.
- [ ] (2026-08-30) Add bounded `findRetentionDue`/`applyRetention` operations for local credit/payment rows.
- [ ] (2026-08-30) Prove the adapters register while the complete real registry remains non-eligible for activation.
- [ ] (2026-08-30) Add contract, PostgreSQL, accounting, hold-race, handoff, failure, authorization, architecture, and
      full validation.

## Plan dependencies

- `privacy-compliance/13`
- `privacy-compliance/32`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use stable descriptors `credits.controller-data.v1`, `payments.controller-data.v1`,
  and no provider/audit descriptor in this PR.
  Rationale: The local financial owners form one accounting boundary; plans 29 and 30 own the other responsibilities.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Never overwrite or delete immutable purchase, adjustment, credit-ledger, webhook-idempotency, or audit facts
  when plan 12 requires retention. Apply correction annotations or restriction and return the exact approved reason.
  Rationale: A privacy workflow cannot break balances, refund/chargeback accounting, or security evidence.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Run a binding size projection before implementation. If the planned credits/payments diff would be
  classified `size/xl` by the repository PR-size policy, stop and replace this plan with separate credits and payments
  ExecPlans before editing production code; do not weaken or bypass `fail_if_xl`.
  Rationale: The pair is cohesive because payment events drive credit effects, but one ExecPlan must still map to one
  reviewable PR within repository delivery policy.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: The binding classifier is non-Markdown additions plus deletions, ignoring only `pnpm-lock.yaml`; new files
  count at their complete projected length and uncertain moves count as delete plus add. A total of 1,000 or more is `size/xl`.
  Record the per-path projection and split decision before any production edit, then verify the implemented diff with
  the exact rename-aware command in Validation.
  Rationale: A named but undefined “size projection” is not an enforceable one-PR boundary.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep `CONTROLLER_PRIVACY_ENABLED=false`; this plan must not demonstrate a real enabled composition.
  Rationale: Plans 18 and 27–30 remain mandatory, and plan 18 is the first PR allowed to activate the complete registry.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add local financial `findRetentionDue`/`applyRetention` operations here, while plan 18 owns only central
  policy compilation, scheduling/checkpoints, markers, restore reconciliation, and final activation.
  Rationale: Purchase/ledger invariants and retention mutation must be reviewed and tested with their owner adapters.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Every correction, restriction, deletion, and retention apply acquires sorted plan-32 hold guards before
  canonical purchase/adjustment/ledger locks and transactionally rechecks the fence/effective decision after those rows
  are locked and immediately before commit. A provider/reference or hold outcome that is ambiguous stays pending/manual.
  Rationale: Financial row locking must not race an effective hold or turn absence of provider evidence into success.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Payments owns an opaque, purpose-bound `PaymentProviderReferenceHandoff` port for plan 30. It proves local
  subject/organization/payment ownership and returns a sealed handoff ID plus capability-family ID; it performs no
  provider call and exposes no raw Paddle/customer/transaction reference.
  Rationale: External assistance needs an authoritative local binding without allowing controller privacy or plan 30
  to search financial repositories or identify a provider subject broadly.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: This adapter-only PR adds no Bruno requests. Plan 18 owns target-real/rest-fake and complete-real
  compositions plus end-to-end controller HTTP/Bruno coverage.
  Rationale: The exact registry remains intentionally non-eligible for activation in this PR.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add no migration/backfill; use synchronized disposable data.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Credits owns balance rules but its ledger is persisted by identity. Payments owns purchases, adjustments, webhook
idempotency, local provider references, and Paddle/stub integrations. This plan handles only the application-owned
financial rows and approved correction/restriction annotations. Plan 30 owns any external provider assistance and
unknown remote state; plan 29 owns audit/security/holds. Plan 13 provides the request core.

Financial and audit rows can concern a person while also being organization accounting or security evidence. Plan 12
decides which fields are attributable/access-visible and which disposition/reason applies.
Plan 32 supplies the durable hold guard used before every financial mutation.

## Scope and Non-Goals

Add narrow credit/payment privacy facets, two bridge adapters, their retention operations, subset-registry
composition, and local financial rights tests. Cover approved access, correction annotation, and
deletion/restriction/objection disposition for only the assigned local plan-12 items.

Do not call Paddle or another external provider, handle audit/security/holds, schedule central retention, implement
restore reconciliation, rewrite immutable managed backups, add new legal rules, alter payment amounts/balances, add
migrations, enable any composition, or claim compliance. Plans 18, 29, and 30 own those outcomes.

## Plan of Work

Before production edits, enumerate proposed files and projected additions/deletions for credits, payments, identity-
owned ledger seams, controller bridges, tests, and docs. Sum additions plus deletions for every path except `*.md` and
`pnpm-lock.yaml`; count a new file at its complete projected length and an uncertain move as deletion plus addition. Record the
per-path table, total, and classification in this living plan. A total of 1,000 or more is `size/xl`: stop, replace
this plan with separate credits and payments ExecPlans/issue markers, update dependencies, and implement neither under
this plan. A projection below 1,000 records the decision to retain this one-PR plan.

Expose credit operations that return only plan-12 attributable balance/ledger categories and apply approved restriction
without mutating ledger arithmetic. A subject request must not expose another member's activity or organization-wide
detail beyond the approved mapping.

Expose payment operations through the payments bare barrel. Access maps approved purchase/adjustment fields and omits
payment instruments, signatures, fraud rules, and unrelated actors. Correction creates an approved annotation/link;
deletion returns restricted/retained for immutable accounting facts. Existing purchase-row locks, webhook idempotency,
refund/chargeback caps, credit grants/reversals, and provider-event replay behavior remain unchanged.

Add bounded `findRetentionDue` and `applyRetention` operations to both owner facets for their exact plan-12 rows. Stable
cursors enumerate local rows only. Each mutation sorts/acquires plan-32 hold scopes first, then canonical purchase,
adjustment, idempotency, and ledger rows; code must never acquire a hold guard while retaining a locked financial row.
Inside that owner transaction, recheck the guard fence/effective decision, settlement/account relationship, linked
adjustments, purchase locks, and ledger dependencies immediately before commit. A due item that cannot preserve
accounting truth, or whose guard/provider evidence is unknown,
returns the approved retained/restricted/manual disposition and prevents a future plan-18 checkpoint from advancing.

Expose a `PaymentProviderReferenceHandoff` token from the payments bare barrel. Given only a controller request ID,
verified organization/subject alias, stable payment item ID, and fixed `controller_privacy` purpose, the owner verifies
the local purchase/adjustment binding while its database row is locked and creates one encrypted, expiring, single-purpose handoff.
Return only `{ handoffId, capabilityFamilyId, expiresAt, bindingVersion }`. Same request/scope is idempotent; conflict,
expiry, stale local binding, or unknown provider reference returns pending/manual. Do not invoke Paddle or any provider.

Implement and register only the two plan-13 adapters. Run the policy-to-registry comparison and assert these
descriptors satisfy their subset while exact plans 18 and 27–30 gaps block `CONTROLLER_PRIVACY_ENABLED=true`
initialization. Do not add an enabled disposable configuration in this PR.

## Interfaces and Dependencies

Owner facets are narrow contracts equivalent to `CreditControllerPrivacyOperations`
and `PaymentControllerPrivacyOperations`. They accept verified scope/item/action and return disposition, approved
reason, retry/manual state, and sanitized count. Each also exposes bounded `findRetentionDue` and
invariant-preserving `applyRetention` operations for the plan-18 coordinator.

The plan-30 handoff is equivalent to:

    interface PaymentProviderReferenceHandoff {
        issue(input: {
            requestId: string
            organizationScopeId: string
            subjectAliasId: string
            itemId: string
            purpose: 'controller_privacy'
        }): Promise<OpaqueProviderReferenceHandoff>
    }

`OpaqueProviderReferenceHandoff` exposes only `handoffId`, `capabilityFamilyId`, `expiresAt`, and `bindingVersion`.
Payments owns creation, validation, expiry, and single-purpose consumption; controller privacy and plan 30 never see a
raw provider/customer/transaction reference, and this PR makes no provider call.

Controller-privacy imports only bare owner barrels through infrastructure bridges. TypeORM and accounting
infrastructure stay in owner modules. This PR does not import or invoke a provider SDK. Plan 13 supplies
registry/crypto/orchestration; plans 18 and 27–30 supply remaining mandatory capabilities.

## Acceptance Criteria

- Every assigned local credit/payment plan-12 item/action/retention rule is owned exactly once by the two descriptors.
- The pre-implementation size projection is recorded; `size/xl` stops work and causes a road map split before
  production edits, with no weakening of the repository size policy. The exact total excludes `*.md` and
  `pnpm-lock.yaml`, counts additions plus deletions, and classifies 1,000 or more as XL.
- Credits/payments access is subject-scoped and excludes unrelated members, payment security material, signatures,
  private risk logic, and unapproved organization detail.
- Corrections never overwrite immutable purchase/adjustment/ledger/audit facts; approved annotations preserve truth.
- Delete/restrict/object operations preserve balances, grant/reversal totals, refund/chargeback caps, purchase locks,
  webhook idempotency, investigations, holds, and required evidence.
- Bounded local retention enumeration/application rechecks settlement, relationships, holds, locks, adjustments, and
  ledger dependencies; unsafe/ambiguous work remains pending without advancing a future plan-18 checkpoint.
- The opaque handoff proves local ownership and fixed purpose, is expiring/versioned/idempotent, exposes no raw
  provider reference, and performs no provider operation; unknown or conflicting binding remains pending/manual.
- Every financial mutation acquires sorted plan-32 guards before owner locks and revalidates the guard fence before
  completion; active, lost, or unknown holds block completion.
- The subset registry reports exact plans 18 and 27–30 gaps and remains disabled; no external-provider call, audit/
  security work, central retention scheduler, restore reconciler, migration, production rollout, or compliance claim
  is included.
- Contract, PostgreSQL, accounting, hold-race, handoff, authorization, architecture, full, build, and docs checks pass.
  Bruno is not applicable below HTTP; plan 18 owns enabled hybrid/complete HTTP coverage.

## Validation

Run architecture, subset-registry, and local financial suites:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy credits-controller-privacy payments-controller-privacy --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy-financial.integration.spec.ts --runInBand

Before production edits, record the per-path projected additions/deletions and formula result. After implementation,
verify the binding classifier with this exact command; 1,000 or more means `size/xl` and the PR must not proceed:

    git diff --numstat -M origin/master...HEAD | awk '$3 !~ /\.md$/ && $3 != "pnpm-lock.yaml" { additions += $1; deletions += $2 } END { print additions + deletions }'

Cover settled, open, refunded, and charged-back purchases; partial adjustments; insufficient balances; and immutable
ledger/audit references. Also cover active/unknown/lost hold guards, reversed lock order, another member, transfer
ownership/purpose/expiry conflicts, due-page boundaries, trigger rechecks, concurrent retention application, and exact
incomplete-registry initialization.
Assert no Paddle/provider client is called. Bruno is not applicable to this below-HTTP adapter PR; plan 18 runs the
target-real/rest-fake and complete-real controller HTTP collection.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/credits/README.md src/libs/modules/payments/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/17-add-financial-and-provider-privacy-adapters.md
    corepack pnpm exec prettier --check src/libs/modules/credits/README.md src/libs/modules/payments/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/17-add-financial-and-provider-privacy-adapters.md
    git diff --check

## Idempotence and Recovery

Owner operations reuse existing locks/idempotency and stable retention cursors. Already-missing local state is success
only after authoritative subject/scope verification. Ambiguity stays retryable.

Reset only owned disposable data. Never compensate by changing a balance directly, calling/replaying a provider
mutation, deleting accounting/audit ranges, removing a hold, weakening registry completeness, or bypassing the size
gate.

## Artifacts and Notes

Record adapter/item versions, size projection/classification, synthetic purchase/transfer IDs, safe dispositions/reasons/
counts, retention cursors, hold fences, and test totals. Never record real subjects, payment references, provider
payloads, tokens, risk rules, legal details, or credentials.

## Plan readiness

Ready after the binding per-path size projection and decomposition decision are recorded: fewer than 1,000 eligible
additions plus deletions retains this plan, while 1,000 or more replaces it with separate credits and payments
ExecPlans before any production edit.
