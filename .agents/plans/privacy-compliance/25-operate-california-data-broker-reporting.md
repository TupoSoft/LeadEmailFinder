# Operate Recurring California Data-Broker Reporting and Audit Evidence

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Conditionally turn California data-broker annual registration and fee evidence, registration disclosures, DROP
compliance evidence, audit obligations, and authorized certifications into a recurring, deadline-driven operating
control for a covered entity. After this change, an operator can open the correct reporting cycle, assign the human fee
owner, approver, and payment operator, and reconcile payment and other source evidence. The operator can also identify
gaps, route corrections, obtain independent or authorized review where required, and record external receipt IDs without
claiming that a Git check is an Agency payment, filing, or certification.

No cycle is active unless plan 24 has a current covered-entity determination and counsel maps the exact current duties,
cadences, forms, deadlines, correction rules, reviewer independence, and signatory authority.

## Progress

- [ ] (2026-08-30) Obtain counsel's exact entity-specific annual-registration fee, periodic disclosure, audit,
      certification, correction, and filing calendar from the current official rules and Agency procedures.
- [ ] (2026-08-30) Obtain Legal/Operations/Finance annual-fee owner, approval, human payment, status/receipt, correction,
      and overdue/failure procedures.
- [ ] (2026-08-30) Define the reporting-cycle manifest, strict checker, evidence lineage, and deadline/escalation model.
- [ ] (2026-08-30) Publish the reconciliation, reviewer/signatory, external submission, receipt, correction, and late-
      cycle runbooks.
- [ ] (2026-08-30) Exercise a complete synthetic annual cycle plus missing evidence, discrepancy, correction, and
      missed-deadline scenarios.
- [ ] (2026-08-30) Complete counsel, Operations, independent-review, Security, prose, formatting, and plan validation.

## Plan dependencies

- `privacy-compliance/09`
- `privacy-compliance/24`
- `privacy-compliance/26`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Treat this as one recurring annual governance cycle while preserving the exact counsel-mapped cadence for
  each constituent obligation; do not label an audit with a different cadence as annual or invent a universal deadline.
  Rationale: A single operating calendar can coordinate registration/disclosure/certification and schedule periodic
  audit work without misrepresenting the final regulations.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Reconcile disclosures and certifications from authoritative plan-09 request evidence, plan-24 entity/
  account governance, and plan-26 accountability/assessment records. Missing, contradictory, stale, or unverifiable
  evidence blocks sign-off.
  Rationale: A certification cannot be truthful if its underlying population or controls are incomplete.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep the actual Agency submission, attestation, and correction outside repository automation and require an
  authorized operator/signatory to record only the resulting non-secret receipt/reference.
  Rationale: External legal representations require current human authority and must not be triggered by CI.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Model correction and missed-deadline handling explicitly; never overwrite a prior cycle, backdate evidence,
  or mark it complete because a checker passed after the legal deadline.
  Rationale: A reliable audit trail requires immutable history and truthful lateness/correction state.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Carry section-7600 annual-registration fee governance into every applicable recurring cycle. Plan 24 owns
  onboarding and section-7611 first-access readiness; this plan requires the exact current annual trigger/due rule,
  named Legal/Operations owner, Finance approver, authorized human payment operator, fresh payment status, and real
  receipt evidence. Repository automation does not pay, invent an amount, or turn approval into proof of payment.
  Rationale: Annual registration is incomplete when a required fee is missing, late, failed, or unsupported by receipt
  evidence, and onboarding evidence cannot stand in for the next calendar year's obligation.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 09 creates request/session/reporting evidence for covered DROP processing. Plan 24 identifies the covered legal
entity, authorized account/registration owners, onboarding/first-access fee readiness, current account procedures, and
cessation state. Plan 26 supplies `ROPA`, assessment, cybersecurity-audit applicability, and evidence references. None of
those plans schedules each later section-7600 annual-registration fee and entity-level disclosure/certification cycle or
proves that an external payment or submission occurred.

The official sources are the
[final California data-broker/DROP regulations](https://cppa.ca.gov/regulations/pdf/data_broker_drop_reg.pdf) and the
[effective CCPA regulations](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf). Counsel must map the
actual current section/form/cadence for each covered entity. This plan does not infer that every audit or certification
has the same annual cadence.

## Scope and Non-Goals

Create `config/privacy/california-data-broker-reporting.yaml`, strict parsing/checking under `scripts/privacy/`, a
`privacy:california-data-broker-reporting-check` command/CI gate, and
`docs/privacy/california-data-broker-reporting-runbook.md`. Track cycle and obligation IDs, authoritative inputs, owners,
annual fee applicability, trigger, due rule, and human approval and payment roles. Also track payment and receipt
evidence, due dates and time zones, review requirements, signatory requirements, discrepancies, correction windows, submission
references, status, and evidence freshness.

Do not decide coverage, implement DROP exchange, register an entity or account, initiate or automate a payment, or invent
or persist a fee amount. Do not conduct or claim an independent audit, submit or correct an Agency form, sign an
attestation, contact a consumer or the Agency, store report payloads or private advice, or claim compliance. Those
external acts remain with authorized owners.

## Plan of Work

Have counsel produce an entity-specific obligation table from current official rules and Agency instructions. Include
the annual-registration fee required by section 7600 during the January 1–31 registration period for every applicable cycle, using the
current official amount and payment method only in the restricted human payment workflow. For each fee, registration
disclosure, DROP metric or report, audit, assessment cross-reference, certification, or correction duty, record its stable
obligation ID, source section and procedure version, period, exact trigger and cadence, and due-date rule and time zone.
Also record the calculation population, required evidence, reviewer independence, signatory authority, correction rule,
and escalation owner.
Pending/unknown is never replaced by a default.

For each required annual fee, name the exact Legal/Operations obligation owner, Finance approver, authorized human
payment operator, independent evidence reviewer, payment-procedure version, trigger/due time, approval record, payment-
status source, receipt source, and failure/overdue escalation. The responsible human follows the current Agency flow and
records only stable non-secret status/receipt evidence. The checker and timers never calculate a guessed amount,
initiate payment, handle a payment instrument, or infer success from approval or registration data.

Define immutable reporting cycles. A cycle references the plan-24 entity/account/registration and fee-governance
revision, the current cycle's annual-fee obligation/status/receipt evidence, every plan-09 access session/request
disposition in the covered period, and relevant plan-26 records. Generate expected populations from stable IDs/counts,
then require an owner reconciliation against authoritative external evidence. Store no consumer identifiers, deletion
lists, fee amounts/payment instruments, account credentials, report payloads, legal analysis, or private audit material.

Implement a deterministic deadline calculator from the approved obligation table and injected clock/calendar. Create
warning/escalation events at the exact approved offsets. A timer never pays or submits externally. A required annual fee
with pending approval/payment, failed/overdue status, stale observation, or missing real receipt keeps
`evidence_incomplete` and blocks registration-cycle readiness. Missing other evidence, uncovered population, unmatched
plan-09 transaction, stale account/coverage status, unresolved audit finding, or reviewer/signatory conflict likewise
blocks the ready-for-external-action state.

Write the external handoff runbook. For a required annual fee, the named Finance approver authorizes the current
obligation, and the named human payment operator pays through the current Agency process. The evidence reviewer records
only stable payment status, receipt ID, paid-at time, procedure version, and role IDs. For an external filing or certification, an
authorized operator reviews the generated evidence index in the restricted system, performs the actual external action,
and records only stable submission/receipt ID, submitted-at, form/procedure version, and authorized role. A repository
merge or passing CI is not proof of payment, submission, or certification.

Define correction handling from the exact counsel-approved rule. Open a linked immutable correction revision, preserve
the original fee or submission receipt and discrepancy discovery time, and calculate the real correction deadline.
Obtain the required review, signature, or Finance approval before the authorized human takes the external action and
records the correction receipt. If a fee, filing, or correction deadline passes, set `late_escalated`, notify counsel/Operations/Finance through
the approved route, and preserve the fact; never backdate, replace a receipt, or silently reopen as on time.

The checker rejects unknown fields, secrets, placeholders, missing or expired coverage, and a required annual fee without
exact roles, timing, approval, fresh payment status, and a receipt. It also rejects a fee amount in the manifest, failed
or overdue payment, an incomplete population, a stale procedure, impossible dates, missing reviewer and signatory
separation where required, an unlinked correction, backdated evidence, or `complete` without the required external
receipts. Output only cycle, obligation, and evidence IDs and stable reasons.

## Interfaces and Dependencies

The cycle record is equivalent to:

    interface AnnualRegistrationFeeCycleEvidence {
        feeEvidenceId: string
        entityId: string
        ruleVersion: string
        applicability: 'pending' | 'required' | 'not_required'
        applicabilityEvidenceId: string
        triggerAt: string
        dueAt: string
        obligationOwnerRoleId: string
        financeApproverRoleId: string
        paymentOperatorRoleId: string
        evidenceReviewerRoleId: string
        approvalEvidenceId?: string
        paymentStatus:
            | 'not_due'
            | 'approval_pending'
            | 'payment_pending'
            | 'paid'
            | 'failed'
            | 'overdue'
        paymentStatusObservedAt: string
        receiptId?: string
        paidAt?: string
        correctionOfFeeEvidenceId?: string
        escalationRouteId: string
    }

    interface CaliforniaDataBrokerReportingCycle {
        cycleId: string
        entityId: string
        periodStart: string
        periodEnd: string
        obligationIds: string[]
        sourceRevisionIds: string[]
        annualFeeEvidenceIds: string[]
        status: 'planned' | 'evidence_incomplete' | 'ready_for_external_action' | 'submitted' | 'correction_required' | 'late_escalated' | 'closed'
        dueAt: string
        reviewerEvidenceId?: string
        submissionReceiptId?: string
        correctionOfCycleId?: string
        reviewedAt: string
    }

Plan 09 supplies sanitized transaction/session evidence, plan 24 supplies entity/account/coverage and fee-governance
status, and plan 26 supplies accountability/assessment/audit evidence. The manifest contains references only; the
approved restricted systems remain authoritative for payments, filings, reviews, and private evidence.

## Acceptance Criteria

- Every covered-entity obligation has an exact source/procedure version, cadence/deadline/time zone, population,
  reviewer/signatory, correction rule, owner, and approval; pending values block the cycle.
- Every applicable recurring cycle includes its section-7600 annual-registration fee and the January 1–31 registration
  period. It also includes the exact current official and counsel-mapped trigger and due time, named Legal/Operations
  owner, Finance approver, human payment operator, evidence reviewer, approval, fresh status, and real non-secret receipt
  evidence after payment.
- A required fee in pending, failed, overdue, stale, or receipt-missing state blocks cycle readiness. The checker never
  calculates or stores an amount, initiates payment, handles payment credentials, or treats approval as payment.
- A cycle includes every authoritative plan-09/24/26 input in scope, detects omissions/contradictions/staleness, and
  cannot become ready while evidence or findings remain unresolved.
- Deadline calculations are deterministic at boundary instants and never perform an external action.
- `submitted`/`closed` requires every applicable payment and submission receipt reference plus authorized-role evidence;
  Git/CI is never represented as payment, filing, audit, or certification.
- Fee and filing corrections are linked immutable revisions with the real discovery/deadline/action history; original
  receipts and lateness are preserved and escalated, never overwritten or backdated away.
- No consumer/list/account data, payment instrument/amount, credentials, private report/audit/legal material, external
  payment or filing, false annual treatment, or compliance claim is committed.
- Focused checker, deadline, lineage, correction, docs, formatting, and whitespace validation pass.

## Validation

Run the exact repository checks:

    corepack pnpm privacy:california-data-broker-reporting-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/california-data-broker-reporting.spec.ts scripts/privacy/california-data-broker-deadlines.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/california-data-broker-evidence-lineage.spec.ts --runInBand
    corepack pnpm exec prettier --check config/privacy/california-data-broker-reporting.yaml docs/privacy/california-data-broker-reporting-runbook.md .agents/plans/privacy-compliance/25-operate-california-data-broker-reporting.md
    git diff --check

Exercise a synthetic on-time cycle and the January 1 and January 31 annual-fee boundaries. Cover required, not-required,
and pending fees; missing Finance approval, payment operator, fresh status, or receipt; failed or overdue payment; a
forbidden amount; and corrected payment evidence that preserves the original receipt. Also cover the exact filing
deadline boundary, an omitted plan-09 session, stale plan-24 coverage or account evidence, missing plan-26 evidence, an
unresolved finding, conflicting reviewer and signatory roles, and submission without a receipt. Finish with a discovered
discrepancy, linked filing correction, missed correction deadline, late escalation, and the final cessation-period cycle.

Bruno is not applicable because this PR adds offline governance, deadline, and evidence validation only; it does not
change HTTP or perform DROP/Agency operations.

## Idempotence and Recovery

Stable cycle/obligation/fee IDs and immutable revisions make checker/deadline replay deterministic. Correct source
evidence or open a linked correction and rerun. Never delete/overwrite a prior cycle, manufacture or replace a receipt,
backdate an action, initiate a payment from automation, or lower completeness to recover a passing state.

Source-control rollback does not undo an external payment, filing, or certification. Any erroneous external act follows
the counsel-approved correction/incident route and remains in the evidence history.

## Artifacts and Notes

Record cycle/entity/obligation/source/fee/reviewer/submission/correction IDs, safe payment and cycle statuses, due/paid/
submitted times, stable receipt IDs, reasons, fixture totals, and accountable role IDs. Never record fee amounts, payment
instruments, consumers, lists, account data, credentials, report/audit payloads, private findings, legal advice, or
signatures.

## Plan readiness

Ready after privacy counsel maps every actual covered-entity annual-registration fee, disclosure, audit, certification,
filing, correction, and deadline requirement to the current official rules and Agency procedures. Legal, Operations, and
Finance must also name the fee owner, approver, human payment operator, evidence reviewer, payment-status and receipt
sources, and failure and overdue escalation. Operations must name the authoritative filing evidence, reviewer,
signatory, submission, receipt, and escalation mechanisms.
