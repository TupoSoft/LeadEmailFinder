# Govern the California Data-Broker Registration and DROP Account Lifecycle

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Conditionally define and validate the legal-entity, registration, human-owned fee, account-security, deletion-list
selection, and cessation controls required before a covered LeadEmailFinder data-broker operation can use California's
Delete Request and Opt-Out Platform (DROP). After this change, an authorized operator has one counsel-approved runbook
and machine-checked manifest. Together, they cover truthful registration data; required annual-registration or
first-access fee approval, payment status, and receipt evidence; restricted account access; incident escalation; correct
list use; purpose/security limits; and stop-access/delete/deactivate steps. A required, failed, or overdue fee, or a fee
without evidence, blocks account readiness
and therefore plan-09 access.

This repository does not register an entity, pay a fee, create or operate an Agency account, contact a consumer, or
infer coverage. All external action remains with the authorized Legal/Operations/Finance owners after counsel confirms
applicability.

## Progress

- [ ] (2026-08-30) Obtain counsel's written coverage/entity/exemption determination and map final regulation sections
      7600, 7601–7604, 7610–7611, and 7615–7616 to exact owners, timing, and evidence.
- [ ] (2026-08-30) Obtain Legal/Operations/Finance fee roles, current Agency payment procedure, approval route, payment-
      status source, receipt source, and overdue/failure escalation.
- [ ] (2026-08-30) Define the registration/fee/account/list-selection/cessation manifest and strict checker.
- [ ] (2026-08-30) Publish the human fee, credential, access, unauthorized-use notice, purpose/security, no-contact, and
      stop-access/delete/deactivate runbooks.
- [ ] (2026-08-30) Exercise onboarding, wrong-list, unauthorized-use, owner change, cessation, and evidence-renewal
      scenarios without touching a real Agency account.
- [ ] (2026-08-30) Complete counsel, Operations, Security, incident, prose, formatting, and plan validation.

## Plan dependencies

- `privacy-compliance/10`
- `privacy-compliance/14`
- `privacy-compliance/23`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep this plan conditional on a written counsel determination of California data-broker coverage, exact
  legal entity, records, exemptions, and effective dates; do not infer status from product naming or functionality.
  Rationale: Coverage is a legal/factual determination, not a repository characteristic.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat the official final DROP regulations, particularly 11 `CCR` sections 7600–7604, 7610–7611, and
  7615–7616, plus the Agency's current authorized registration/payment/account procedures, as the source contract. Do
  not implement from a summary or guessed portal/API shape.
  Rationale: Registration, account, deletion-list, and cessation duties require the authoritative current process.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store only stable entity/account/role/evidence/procedure IDs in Git. Credentials, recovery material,
  personal registrant details, Agency files, and notices stay in approved restricted systems.
  Rationale: A governance register must not become another credential or personal-data exposure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: No repository automation creates a DROP account, submits a registration, selects/downloads a deletion list,
  notifies the Agency, or deactivates an account in this PR.
  Rationale: Those are consequential external legal actions requiring current authorized human review.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat list data and account access as purpose-bound: reasonable security, least privilege, correct list
  selection, no unrelated use, and no contacting a consumer from DROP information.
  Rationale: Platform data cannot be repurposed as a lead, marketing, verification, enrichment, or contact source.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Make required section-7600 annual-registration fees and section-7611 first-time DROP-access fees human-owned,
  fail-closed obligations. Counsel maps applicability and the current rule. A named Legal/Operations owner sets the exact
  trigger and due time. Finance approves, and an authorized human payment operator pays through the current Agency
  method. A reviewer records non-secret status and receipt evidence. Repository code never initiates payment or invents,
  caches, or calculates a fee amount.
  Rationale: Payment is a consequential external act, and a passing schema check cannot establish that a required fee
  was timely paid.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Encode the timing events stated by the current final rules. The annual fee is due as part of registration
  during the January 1–31 registration period for a business required to register for prior-calendar-year activity. For
  a covered business beginning after that period, section 7611 governs the first-access-fee trigger unless the annual
  registration fee was already paid that calendar year. It ties the fee schedule to the month of first DROP access and
  requires first access within 45 calendar days of commencing operation. Counsel records any stricter pre-operation
  sequencing required by the official text and current Agency procedure.
  Rationale: Generic “annual” or “on access” labels cannot drive a reliable deadline or block the correct legal event.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 09 implements request exchange only if the business is covered and the Agency's machine contract is approved. It
does not establish required fee evidence or secure the underlying registration/account. Plan 10 supplies approved
entity/vendor/contract records, plan 14 supplies unauthorized-use/breach escalation, and plan 23 supplies active data
store/access/key evidence.

The official final regulations are published in the
[California data-broker and DROP regulations](https://cppa.ca.gov/regulations/pdf/data_broker_drop_reg.pdf). This plan
uses section 7600 and the section-7601 registration-period definition for annual fee timing. Sections 7602–7604 govern
registration facts/process. Sections 7610–7611 govern authorized account and deletion-list access/use plus the
conditional first-access fee. Sections 7615–7616 govern stopping access and account/data disposition. Counsel must map the current
text and Agency procedures to the actual entity; these citations do not declare applicability.

## Scope and Non-Goals

Create `config/privacy/california-data-broker-governance.yaml`, strict Zod parser/checker and tests under
`scripts/privacy/`, a `privacy:california-data-broker-check` package command/CI gate, and
`docs/privacy/california-data-broker-account-lifecycle.md`. Include stable references for coverage, authorized
registrant, registration truth review, fee applicability/trigger/due rule, accountable owner/approver/payment operator,
and payment status/receipt. Also include account owner/recovery, access review, unauthorized-use notice, correct list
selection, purpose/security controls, no-contact prohibition, cessation, evidence freshness, and approvals.

Do not make an external filing, attest/certify, initiate or automate a payment, or invent or persist a fee amount. Do not
create/use an account, download/upload a list, process a consumer request, or contact a consumer or Agency. Do not store
credentials/list data, decide coverage, or claim compliance. Plan 09 owns request processing; plan 25 owns recurring annual fee and
disclosure/audit/certification governance after onboarding.

## Plan of Work

Have counsel record `covered`, `not_covered`, or `pending` for the exact legal entity and period, with stable decision/
evidence ID, decision owner, reviewed/effective/expiry dates, covered activity/records, and exemptions. A missing or
expired decision remains pending; repository source inspection cannot set `not_covered`.

For each covered entity, create immutable fee-obligation revisions for `annual_registration` and
`first_time_drop_access`. Counsel records `required`, `not_required`, or `pending` from the exact current section and
Agency procedure. The annual record uses the trigger derived from required prior-calendar-year registration activity and
the due window from the January 1–31 registration period. The trigger for the first-access record derives from starting
covered operation after that period. It records whether the annual fee was already paid in that calendar year and uses
the approved first-access month/rule reference. It records commencement and the 45-calendar-day first-access deadline
and captures any counsel-required pre-operation gate. `not_required` needs current counsel evidence; silence is `pending`.

Every required fee revision names the exact Legal/Operations obligation owner, Finance approver, authorized human
payment operator, and independent evidence reviewer. It records the approved payment-procedure version, trigger time,
due time or due window, approval evidence, payment status, status-observed time, escalation route, and receipt ID/paid-at after success.
The amount remains in the authoritative current rule/Agency payment flow, not source code or the manifest. The payment
operator performs the consequential action outside repository automation. `approval_pending`, `payment_pending`,
`failed`, `overdue`, missing receipt, stale status, or an impossible event sequence keeps account readiness blocked.

Define a manifest record for each covered entity/account lifecycle. Require the authorized registrant role, truth/
completeness review, registration record/receipt ID, and current fee-obligation IDs. Also require the Agency account
owner, alternate owner, approved access group, credential-vault reference, MFA/recovery evidence, access-review dates, and
incident route. Require the current Agency procedure version, deletion-list eligibility/selection rules, permitted
purpose, security control references, and derived account-readiness status. Never store registrant contact values,
account credentials, or fee amounts.

Write runbooks that require true/current registration information and authorized updates under sections 7602–7604.
For account access under sections 7610–7611, require individual authorized access, secure credentials, least privilege,
periodic review, immediate internal containment, and immediate Agency notice through the approved channel when
unauthorized account access/use or a qualifying account breach is discovered. Plan 14 owns incident facts and clocks;
this runbook supplies the Agency-specific route/owner without inventing a universal notification decision.

Require the authorized operator to select only the deletion list the final rules/Agency procedure make applicable to
the registered entity. Before any plan-09 session, independently verify entity/account/list identity, effective
procedure version, and `ready` fee state. A wrong, ambiguous, stale, unapproved, failed, or overdue status, or a status
without evidence, stops access and escalates; it is never treated as an empty list or a paid obligation.

Document and test policy checks that DROP account/list information is used only for required deletion/opt-out
compliance, protected by reasonable security and access controls, and never used to contact a consumer. Cross-reference
the data store controls in plan 23 and the encrypted minimum matching state in plan 09.

Define the covered cessation workflow for sections 7615–7616. Counsel/Operations confirm the trigger and effective time.
Then stop account/list access and downstream use. Preserve only required audit evidence and delete Agency personal
information within the exact approved rule timing. Verify provider/contractor disposition and request/verify account
deactivation through the Agency process. Any unresolved audit/registration timing or deletion evidence keeps the
workflow pending rather than fabricating closure.

The checker rejects unknown fields, placeholders, secrets, missing/expired approvals, false `not_covered`, and missing
authorized roles. It rejects missing/pending fee applicability, a required fee without exact accountable roles/timing/
approval/fresh status/receipt, and a `not_required` fee without current counsel evidence. It also rejects failed/overdue
payment, a hard-coded fee amount, stale access/security reviews, an absent immediate-notice route, ambiguous list rules,
a missing no-contact prohibition, or an incomplete cessation sequence. Output stable IDs/reason codes only.

## Interfaces and Dependencies

The manifest is equivalent to:

    interface CaliforniaDataBrokerFeeEvidence {
        feeEvidenceId: string
        kind: 'annual_registration' | 'first_time_drop_access'
        applicability: 'pending' | 'required' | 'not_required'
        ruleVersion: string
        applicabilityEvidenceId: string
        triggerAt: string
        dueAt: string
        firstAccessDeadlineAt?: string
        obligationOwnerRoleId: string
        financeApproverRoleId: string
        paymentOperatorRoleId: string
        evidenceReviewerRoleId: string
        paymentProcedureVersion: string
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
        escalationRouteId: string
    }

    interface CaliforniaDataBrokerGovernanceRecord {
        entityId: string
        coverageStatus: 'pending' | 'covered' | 'not_covered'
        coverageDecisionEvidenceId: string
        registrationRecordId?: string
        feeEvidenceIds: string[]
        authorizedRegistrantRole?: string
        accountOwnerRole?: string
        accountProcedureVersion?: string
        accessReviewEvidenceId?: string
        incidentRouteId?: string
        listSelectionRuleId?: string
        securityControlIds?: string[]
        cessationProcedureId?: string
        accountReadiness: 'blocked' | 'ready'
        reviewedAt: string
        expiresAt: string
    }

Plan 10 supplies actual entity/contract references. Plan 14 supplies incident routing. Plan 23 supplies active security
evidence. Plan 09 later consumes only a current `covered` record whose required fee evidence derives `ready`, plus the
exact approved account/list procedure; it does not consume credentials, payment authorization, or fee amounts from
this manifest.

## Acceptance Criteria

- Every entity/period has a current counsel-owned coverage status; pending/expired evidence blocks covered operation,
  and source code alone never produces `not_covered`.
- Every annual-registration and first-access fee has a current counsel-owned applicability decision. Each required fee
  has the exact official/counsel-mapped trigger and due event, named obligation owner/Finance approver/human payment
  operator/evidence reviewer, approval, fresh status, and real non-secret receipt evidence after payment.
- Annual registration uses the January 1–31 registration period. The post-period startup branch records commencement and
  whether the annual fee was already paid that calendar year. It also records the current first-access-month rule, the
  45-calendar-day first-access deadline, and any counsel-required pre-operation gate without hard-coding an amount.
- Account readiness and plan-09 access remain blocked for pending applicability, missing roles/timing/approval/receipt,
  or a required fee in `approval_pending`, `payment_pending`, `failed`, or `overdue`; CI never initiates payment.
- A covered record has truthful registration review, authorized registrant/account owners, restricted credential/
  recovery handling, current access review, and no secret or personal contact value in Git.
- The runbook requires immediate Agency notice through the approved route for unauthorized account use/access when the
  final rule applies, with plan-14 incident linkage and no invented external action.
- Correct entity/account/list selection and fee readiness are verified before plan-09 access. A wrong, ambiguous, stale,
  unpaid, failed, or overdue status, or a status without evidence, causes a closed failure.
- Purpose restriction, reasonable security, least privilege, and no consumer contact are explicit and exercised.
- Cessation stops access/use, performs the approved delete/evidence sequence, and deactivates through the authorized
  procedure; missing evidence remains pending.
- No real registration/payment/account/list/Agency action, fee amount, credential, consumer contact, coverage fiction,
  or compliance claim is committed.
- Focused checker, incident/security cross-check, docs, formatting, and whitespace validation pass.

## Validation

Run the exact repository checks:

    corepack pnpm privacy:california-data-broker-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/california-data-broker-governance.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/california-data-broker-incident-crosscheck.spec.ts --runInBand
    corepack pnpm exec prettier --check config/privacy/california-data-broker-governance.yaml docs/privacy/california-data-broker-account-lifecycle.md .agents/plans/privacy-compliance/24-govern-california-data-broker-account-lifecycle.md
    git diff --check

Exercise sanitized fixtures for pending/not-covered/covered and false/stale decisions. Cover a due annual fee at the
January 1 and January 31 boundaries, a post-period startup with and without an annual fee already paid, and first access
exactly 45 calendar days after commencement. Also cover missing fee roles/approval/status/receipt, failed/overdue payment,
a forbidden amount, unauthorized access, an absent immediate-notice route, a wrong/ambiguous list, a purpose/no-contact
violation, an access-owner change, and each incomplete/complete cessation step. Counsel, Operations, and Finance review the exact final-regulation
mapping without including legal advice, fee amounts, payment credentials, or account data in Git.

Bruno is not applicable because this PR adds governance documentation and offline validation only; it creates no HTTP
or DROP transport behavior.

## Idempotence and Recovery

The checker is read-only/deterministic and stable IDs make evidence renewal repeatable. Correct a bad manifest revision
and rerun; never “recover” by changing the coverage or fee decision, suppressing a missing control, manufacturing a receipt,
backdating payment, or performing a payment or other external Agency action from repository automation.

If an account/list action was taken incorrectly, stop access/use and follow the approved incident/legal procedure.
Source-control rollback does not reverse an Agency payment, registration, notice, list access, or deactivation.

## Artifacts and Notes

Record entity/coverage/registration/fee/account/procedure/security/evidence IDs, trigger/due/status/paid-at times, review/
expiry dates, stable reason codes, fixture totals, accountable role IDs, and non-secret receipt IDs. Never record fee
amounts, payment instruments, registrant/consumer values, credentials, Agency payloads/lists, personal data, private
legal advice, incident facts, or secrets.

## Plan readiness

Ready after privacy counsel confirms coverage, exact legal entity/records/exemptions/effective dates, annual-registration
and first-access fee applicability/timing, and final-section mapping. Legal/Operations/Finance must name the exact
obligation owner, approver, human payment operator, evidence reviewer, status/receipt sources, and failure/overdue
escalation. Operations/Security must supply the authorized Agency account, list-selection, incident-notice, evidence, and
cessation procedures.
