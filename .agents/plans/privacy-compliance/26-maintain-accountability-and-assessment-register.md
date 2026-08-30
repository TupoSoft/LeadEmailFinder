# Maintain Processing Records and Assessment Applicability

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give LeadEmailFinder one versioned, machine-checked accountability register for GDPR Article 30 controller/processor
records, correctly owned GDPR DPIA and legitimate-interests decisions, and the effective 2026 California risk-assessment
and cybersecurity-audit applicability rules. After this change, LeadEmailFinder's own controller activities map to its
own DPIA/LIA decisions, while processor activities record every named customer-controller, the categories performed for
that controller, supplied controller instruction/DPIA/LIA references, and LeadEmailFinder's assistance duties/evidence.
The register maps each actual activity to the correct role, owner, timing, evidence, and review status without asserting
that every obligation applies universally or that LeadEmailFinder decides a customer-controller's legal basis or DPIA.

## Progress

- [ ] (2026-08-30) Reconcile plan-01 processor and plan-12 controller activities into Article 30 record fields, one
      processor row per named customer-controller, and obtain the small-organization exception decision where relevant.
- [ ] (2026-08-30) Obtain customer-controller instruction and supplied DPIA/LIA reference mechanisms plus
      LeadEmailFinder processor-assistance duties/owners/evidence.
- [ ] (2026-08-30) Obtain counsel decisions for LeadEmailFinder's own controller DPIA/LIA and California risk-assessment/
      cybersecurity-audit applicability, thresholds, phase-in dates, timing, scope, and owners.
- [ ] (2026-08-30) Add the accountability manifest, strict checker, evidence lineage, and deadline/review validation.
- [ ] (2026-08-30) Publish the sanitized `ROPA` and assessment register and restricted-evidence operating procedure.
- [ ] (2026-08-30) Exercise controller/processor, applicable/not-applicable/pending, change-trigger, stale-evidence, and
      deadline scenarios.
- [ ] (2026-08-30) Complete counsel/DPO, Security, Operations, prose, formatting, and plan validation.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/10`
- `privacy-compliance/12`
- `privacy-compliance/14`
- `privacy-compliance/23`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Maintain distinct Article 30 controller and processor records for the actual roles/purposes; do not let one
  combined inventory erase the role boundary.
  Rationale: Customer-supplied verification processing and LeadEmailFinder's account/billing/security processing have
  different instructions, purposes, recipients, rights, and accountability owners.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Record a counsel-approved Article 30(5) small-organization exception decision, including every statutory
  condition that could defeat the exception, rather than assuming headcount alone removes the record duty.
  Rationale: The exception is conditional and does not apply merely because an organization has fewer than 250 people.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use `applicable`, `not_applicable`, or `pending` per LeadEmailFinder controller activity/revision for DPIA/
  LIA and per actual LeadEmailFinder legal role for California risk assessment and cybersecurity audit. Processor rows
  instead use `supplied`, `requested`, or `not_supplied` for the named customer-controller's decision references. Only
  the authorized decision owner or counsel/Security-approved evidence can resolve the relevant state.
  Rationale: Applicability depends on actual processing, risk, business facts, thresholds, and effective timing; code
  inspection cannot make the legal conclusion.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep assessment content, vulnerabilities, revenue/threshold inputs, private legal analysis, and audit
  findings in approved restricted systems. Git contains stable IDs, sanitized classifications, dates, owners, and
  status only.
  Rationale: Accountability evidence must not expose security weaknesses or sensitive business/legal facts.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: A passing checker proves register consistency/freshness only; it is never represented as the Article 30
  record approval, DPIA/LIA, California risk assessment, cybersecurity audit, certification, or regulator submission.
  Rationale: Automated schema validation cannot replace substantive authorized review.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat GDPR Article 35 DPIA and legal-basis/LIA decisions as controller duties. LeadEmailFinder makes and owns
  those decisions only for processing where it is controller. For customer-supplied verification where it is processor,
  each named customer-controller owns its decisions; LeadEmailFinder records the controller's instruction and DPIA/LIA
  references when supplied, and records its own contractual/statutory assistance duty and delivery evidence.
  Rationale: A processor cannot cure a missing customer-controller decision by creating or aggregating one in its own
  register, but it must be able to demonstrate its assistance and instruction lineage.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Maintain the Article 30 processor record per named customer-controller legal entity, never one aggregated
  “customer class,” with the categories of processing performed for that controller and exact restricted identity/
  contract references.
  Rationale: Article 30 processor records identify each controller on whose behalf the processor acts; a generic class
  loses the accountable party and cannot prove controller-specific instructions or assistance.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 01 inventories customer-verification processing and processor/service-provider posture. Plan 10 supplies customer
instructions, subprocessors, recipients, transfers, and contract evidence. Plan 12 inventories controller account/
authentication/organization/billing/fraud/security/legal processing and its purposes/retention/rights. Plan 14 supplies
incident roles, and plan 23 supplies active data-store safeguards. These artifacts do not yet constitute a complete
Article 30 record or decide whether an assessment/audit is required.

Primary legal sources for counsel review are official
[GDPR Article 30](https://eur-lex.europa.eu/eli/reg/2016/679/art_30/oj),
[GDPR Article 35](https://eur-lex.europa.eu/eli/reg/2016/679/art_35/oj),
[GDPR Article 28](https://eur-lex.europa.eu/eli/reg/2016/679/art_28/oj) for processor assistance,
[GDPR Article 6](https://eur-lex.europa.eu/eli/reg/2016/679/art_6/oj) for legal bases, and the
[effective California privacy regulations](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf),
including sections 7120 and 7150 for cybersecurity-audit and risk-assessment applicability. Legitimate-interests
mapping uses the official GDPR legal-basis text and counsel's approved methodology. These sources are inputs, not a
claim that a duty applies to every activity.

## Scope and Non-Goals

Create `config/privacy/accountability-obligations.yaml`, strict Zod parsing/checking and tests under
`scripts/privacy/`, a `privacy:accountability-check` package/CI command,
`docs/privacy/accountability-register.md`, and `docs/privacy/assessment-and-audit-governance.md`. Store activity, role,
purpose, category, subject, recipient, transfer, retention, and security-reference IDs. Each processor row also stores one
named customer-controller ID and per-controller processing categories, instructions, assessment references, and
assistance evidence. Store LeadEmailFinder-owned controller applicability decisions, triggers, effective, deadline, and
review dates, owners, and restricted evidence references.

Do not write private assessment, audit, or legal content into Git. Do not make a customer-controller's legal-basis, LIA,
or DPIA decision; aggregate named controllers into a class; or make any other legal or applicability decision. Do not
conduct or certify a DPIA, LIA, risk assessment, or cybersecurity audit; remediate findings; notify a regulator; change
processing; create runtime data; or claim compliance. Implementation or remediation becomes a separate ExecPlan if an
approved assessment requires it.

## Plan of Work

Reconcile every active plan-01 and plan-12 processing activity by stable ID. For the controller-side Article 30 record,
capture LeadEmailFinder controller/representative/DPO references where applicable, purposes, subject/data categories,
recipient/third-country safeguards, erasure time limits, and general security-measure references. For the processor-side
Article 30 record, create a separate row for every named customer-controller legal entity on whose behalf
LeadEmailFinder acts. Each row uses the exact restricted plan-10 customer/controller, representative, DPO, and contract
references; names the categories of processing performed for that controller; and records transfers/safeguards and
security references. Reject an aggregated controller class, wildcard, tenant population, or omitted named controller.
Never copy private contract/contact values into Git.

Have counsel evaluate Article 30(5) for the actual organization. The decision record must address organization size and
whether processing is occasional, likely to risk rights/freedoms, or includes the relevant special/criminal categories,
plus effective/review dates and evidence ID. A missing factor is `pending`, not an automatic exception.

For every LeadEmailFinder controller activity and material change, record LeadEmailFinder's approved DPIA applicability
decision under Article 35 and the trigger facts/categories at a sanitized level. An applicable record names the
LeadEmailFinder controller owner, scope, start/before-processing gate, DPO consultation, approved methodology/evidence
ID, residual-risk/consultation status, decisions, review trigger, and expiry. `pending` or a required incomplete DPIA
blocks release of that new/changed LeadEmailFinder controller processing; it does not retroactively label current code
lawful.

For every processor row, record the named customer-controller's current instruction reference and an explicit
`supplied | requested | not_supplied` state for its DPIA and LIA references. Preserve exact restricted evidence IDs when
the controller supplies them, but do not copy contents or interpret absence as `not_applicable`. Record the exact
processor-assistance duty/instruction, accountable LeadEmailFinder assistance owner, request/response evidence IDs,
delivery time, outcome, and escalation for an overdue or impossible request. The checker rejects a LeadEmailFinder-owned
GDPR DPIA/LIA applicability decision on a processor row; it checks instruction/reference/assistance lineage only.

For each LeadEmailFinder controller purpose relying on a counsel-approved legitimate-interest basis, map its own LIA
record with purpose/necessity/balancing/safeguard/objection evidence IDs, owner, effective/expiry/change triggers, and
outcome. Do not create LIA records for another legal basis merely to fill the table; an unresolved LeadEmailFinder
controller basis stays pending in plan 12. A customer-controller's LIA remains that controller's decision and appears
only as a supplied reference on its processor row.

Have counsel/Security evaluate the effective California section 7150 risk-assessment criteria for LeadEmailFinder's
actual legal role and processing, including selling/sharing, sensitive personal information, `automated decisionmaking`,
or other significant-risk categories as the current rule defines them. Record the exact rule revision, scoped trigger
inputs, LeadEmailFinder-owned decision, before-processing/periodic/change timing, submission/attestation owner if
applicable, restricted evidence ID, and deadlines. Keep these distinct from customer-controller GDPR references.

Separately evaluate section 7120 cybersecurity-audit applicability using the actual business/processing threshold facts
and phased effective dates. Keep sensitive revenue/security inputs outside Git; the manifest stores their approved
evidence IDs and resulting decision/deadlines. An applicable record names qualified/independent audit owner, scope,
period, report/certification/evidence IDs, findings/remediation handoff, and next due date. Do not assume that being a
business, processor, or data broker alone makes this audit universally applicable.

Add material-change triggers for a new named customer-controller or changed customer instruction, processing category, or
assistance duty. Also trigger on a new purpose, category, recipient, provider, region, transfer, or high-risk technology;
a security incident finding; a data-role change; a retention increase; a threshold change; or a legal revision. The
checker cross-references plan-01, plan-10, plan-12, plan-14, and plan-23 IDs. It rejects missing, duplicate, orphaned, or
pending required rows; an aggregated or unnamed controller; processor categories without exact instructions; and
processor rows carrying LeadEmailFinder-owned GDPR decisions. It also rejects missing or stale supplied references or
assistance evidence, stale evidence, impossible dates, unresolved applicable obligations, and false exception use. It
prints stable IDs and reasons only.

## Interfaces and Dependencies

The manifest is equivalent to:

    interface AccountabilityActivityBase {
        activityId: string
        role: 'controller' | 'processor'
        subjectCategoryIds: string[]
        dataCategoryIds: string[]
        recipientTransferIds: string[]
        retentionRuleIds: string[]
        securityControlIds: string[]
        article30Status: 'required' | 'exception_approved' | 'pending'
        californiaAssessmentDecisions: CaliforniaAssessmentDecision[]
        reviewedAt: string
        reviewExpiresAt: string
    }

    interface ControllerAccountabilityActivity extends AccountabilityActivityBase {
        role: 'controller'
        controllerEntityId: string
        purposeIds: string[]
        gdprAssessmentDecisions: GdprControllerAssessmentDecision[]
    }

    interface ProcessorAccountabilityActivity extends AccountabilityActivityBase {
        role: 'processor'
        processorEntityId: string
        processorContactReferenceId: string
        processorRepresentativeReferenceId?: string
        processorDpoReferenceId?: string
        customerControllerId: string
        customerControllerContactReferenceId: string
        customerControllerRepresentativeReferenceId?: string
        customerControllerDpoReferenceId?: string
        contractReferenceId: string
        processingCategoryIds: string[]
        controllerInstructionReferenceId: string
        controllerDpiaReference: ControllerSuppliedAssessmentReference
        controllerLiaReference: ControllerSuppliedAssessmentReference
        processorAssistance: ProcessorAssistanceEvidence
        gdprAssessmentDecisions?: never
    }

    type AccountabilityActivity =
        | ControllerAccountabilityActivity
        | ProcessorAccountabilityActivity

    interface ControllerSuppliedAssessmentReference {
        status: 'supplied' | 'requested' | 'not_supplied'
        referenceId?: string
        requestEvidenceId?: string
        observedAt: string
    }

    interface ProcessorAssistanceEvidence {
        dutyId: string
        ownerRoleId: string
        status: 'not_requested' | 'pending' | 'completed' | 'blocked_escalated'
        requestEvidenceId?: string
        responseEvidenceIds: string[]
        requestedAt?: string
        dueAt?: string
        completedAt?: string
        escalationRouteId: string
        observedAt: string
    }

    interface GdprControllerAssessmentDecision {
        kind: 'gdpr_dpia' | 'gdpr_lia'
        status: 'applicable' | 'not_applicable' | 'pending'
        ruleVersion: string
        evidenceId: string
        ownerRole: string
        dueAt?: string
        reviewExpiresAt: string
    }

    interface CaliforniaAssessmentDecision {
        kind: 'ccpa_risk_assessment' | 'ccpa_cybersecurity_audit'
        status: 'applicable' | 'not_applicable' | 'pending'
        ruleVersion: string
        evidenceId: string
        ownerRole: string
        dueAt?: string
        reviewExpiresAt: string
    }

Plans 01/10/12 supply processing/role/recipient facts and exact named customer-controller/instruction references, plan
14 supplies incident change triggers, and plan 23 supplies active security-control references. Customer-controllers and
restricted legal/security systems remain authoritative for customer decisions and substantive assessment contents;
LeadEmailFinder remains authoritative only for its own controller decisions and processor-assistance evidence.

## Acceptance Criteria

- Every active plan-01/plan-12 activity has a distinct controller or processor Article 30 row with every applicable
  required field, exact source IDs, owner, status, review, and no role conflation.
- Every processor Article 30 row names exactly one customer-controller legal entity through its restricted plan-10
  identity/contact references and lists the processing categories performed for that controller. Aggregated classes,
  wildcards, omitted controllers, and cross-customer instruction reuse fail validation.
- Any Article 30(5) exception has a current counsel decision covering all statutory conditions that could defeat it; headcount
  alone or missing evidence stays pending.
- Every LeadEmailFinder controller activity/revision has its LeadEmailFinder-owned DPIA decision and LIA where its own
  approved basis requires one. A processor row cannot contain a LeadEmailFinder-owned GDPR DPIA/LIA decision.
- Every processor row has an exact customer instruction, an explicit supplied/requested/not-supplied state for that
  controller's DPIA and LIA references, and the exact LeadEmailFinder assistance duty, owner, request/response evidence,
  timing, outcome, and escalation. Missing customer references are never converted to `not_applicable`.
- California risk-assessment and cybersecurity-audit applicability decisions cover LeadEmailFinder's actual role and
  processing under the current rule and remain distinct from customer-controller GDPR decisions; no obligation is
  claimed universal.
- Applicable obligations have exact scope, owner, timing/deadline, evidence, review/change triggers, and incomplete-
  work gate; `not_applicable` has current approved rationale evidence, and pending blocks the affected release.
- California threshold/phase-in calculations use the exact effective rule revision and approved restricted business/
  processing inputs without exposing them in Git.
- Material plan-01/10/12/14/23 changes make stale/missing accountability rows fail the checker.
- Checker success is described only as consistency/freshness evidence, never completion of a legal/security assessment,
  audit, certification, submission, or compliance.
- No private analysis, revenue, vulnerability/finding, personal data, credentials, runtime change, or broad compliance
  claim is committed.
- Focused checker, cross-reference, date/trigger, docs, formatting, and whitespace validation pass.

## Validation

Run the exact repository checks:

    corepack pnpm privacy:accountability-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/accountability-obligations.spec.ts scripts/privacy/accountability-cross-reference.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/accountability-deadlines.spec.ts --runInBand
    corepack pnpm docs:lint -- docs/privacy/accountability-register.md docs/privacy/assessment-and-audit-governance.md .agents/plans/privacy-compliance/26-maintain-accountability-and-assessment-register.md
    corepack pnpm exec prettier --check config/privacy/accountability-obligations.yaml docs/privacy/accountability-register.md docs/privacy/assessment-and-audit-governance.md .agents/plans/privacy-compliance/26-maintain-accountability-and-assessment-register.md
    git diff --check

Exercise LeadEmailFinder controller and processor activities and two named customer-controllers with different processing
categories and instructions. Reject aggregated, wildcard, and unnamed controller rows. Cover supplied, requested, and
not-supplied customer DPIA and LIA references; missing or stale instruction and assistance evidence; and a rejected
LeadEmailFinder-owned GDPR decision on a processor row. Exercise applicable, not-applicable, and pending LeadEmailFinder
controller DPIA and LIA decisions, plus approved, pending, and invalid Article 30 exceptions. Cover California thresholds
on both sides, a phased date boundary, stale evidence, material customer, instruction, processing, provider, and incident
changes, an unresolved-finding handoff, an orphan ID, and safe-output fixtures. Conduct role reviews with counsel and the
DPO, Security, every named internal owner, and the customer-controller evidence process using restricted systems.

Bruno is not applicable because this PR creates accountability documentation and offline validation only; it changes
no HTTP/runtime behavior.

## Idempotence and Recovery

The checker is deterministic and stable activity/controller/instruction/decision/assistance IDs make evidence renewal
repeatable. Supersede a LeadEmailFinder decision or customer-supplied reference with a new immutable revision/effective
date; never overwrite history, manufacture an exception or customer decision, aggregate controllers, or change a
threshold outcome merely to pass CI.

If an assessment/audit identifies remediation, keep the applicable record incomplete and create a separate scoped
ExecPlan. Reverting this PR removes repository artifacts only and does not retract external records/assessments.

## Artifacts and Notes

Record activity/role/purpose/category/recipient/retention/security/decision/evidence IDs, named customer-controller and
instruction/assessment-reference/assistance IDs, sanitized statuses, review/due dates, checker totals, and accountable
roles. Never record customer contacts, subjects, customer data, contracts, revenue/threshold inputs, assessment/audit
contents, vulnerabilities/findings, private legal advice, credentials, or signatures.

## Plan readiness

Ready after privacy counsel, the DPO, and Security provide the actual entity and role, Article 30 exception,
LeadEmailFinder-controller legal-basis, LIA, and DPIA decisions, and California risk-assessment and cybersecurity-audit
applicability, threshold, and phase-in decisions. They must also provide the restricted evidence systems, owners,
deadlines, and review triggers. Operations and Legal must supply every named customer-controller identity, contract,
instruction, and per-controller processing category, plus the customer-supplied DPIA and LIA reference mechanism and
LeadEmailFinder assistance duties, owners, and evidence.
