# Operationalize Privacy and Security Incident Response

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give responders one exercised, role-aware process for containing and assessing an incident involving customer
verification data or LeadEmailFinder controller data. After this change, an on-call responder can identify affected
data, stores, customers, and vendors and preserve evidence. The responder can notify customer controllers under the
approved processor contract, start the correct counsel-approved assessment clocks, and escalate missed decisions
without assuming one universal 72-hour deadline.

The observable outcome includes a current data map, contact tree, and approved incident/notification decision records.
It also includes provider and customer notification procedures, an evidence-preservation runbook, a fail-closed
readiness check, and a completed tabletop with timestamped synthetic injects and remediation owners.

## Progress

- [ ] (2026-08-30) Reconcile the plan-01 processor inventory, plan-12 controller categories, plan-10 contracts/vendors,
      plan-11 managed processor-copy stores, and plan-15 restore gate into an incident data map.
- [ ] (2026-08-30) Obtain counsel-approved role/jurisdiction clocks, notification decision rules, templates, and escalation owners.
- [ ] (2026-08-30) Publish the contact tree, containment, evidence-preservation, assessment, notification, recovery, and post-incident runbooks.
- [ ] (2026-08-30) Add and validate the provider-neutral incident-readiness manifest and fail-closed review command.
- [ ] (2026-08-30) Run processor-data and controller-data tabletop scenarios and close or assign all findings.
- [ ] (2026-08-30) Complete security, legal/DPO, customer-operations, vendor, prose, formatting, and whitespace review.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/10`
- `privacy-compliance/11`
- `privacy-compliance/12`
- `privacy-compliance/15`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Determine clocks from the actual role, data, jurisdiction, contract, awareness trigger, and counsel-approved
  rule; provide no blanket “all incidents are reportable within 72 hours” rule.
  Rationale: LeadEmailFinder may be a processor for customer verification data and a controller for account/billing
  data, while regulator and data-subject duties vary by applicable law and incident facts.
  Date/Author: 2026-08-30, project planning.
- Decision: For customer verification data, prioritize prompt contract-driven notice to the affected customer
  controller and preserve its authority over downstream assessment unless counsel identifies a direct duty.
  Rationale: Processor-to-controller cooperation is distinct from making an unauthorized notification or legal
  conclusion on the customer's behalf.
  Date/Author: 2026-08-30, project planning.
- Decision: Preserve evidence through scoped, access-controlled holds with chain-of-custody records, without copying
  incident payloads into Git, tickets, chat, or broad logs.
  Rationale: Investigation evidence can itself contain personal data, secrets, or attacker material and must not create
  a second disclosure.
  Date/Author: 2026-08-30, project planning.
- Decision: Keep containment and evidence preservation compatible: responders record and approve destructive steps
  when feasible, but evidence procedure never delays an urgent action needed to stop active harm.
  Rationale: A runbook must support safe judgment during a live compromise rather than require preservation at the
  expense of ongoing exposure.
  Date/Author: 2026-08-30, project planning.
- Decision: Validate contact/evidence references and exercise freshness in CI without storing personal phone numbers,
  private channels, customer contacts, or secrets in the repository.
  Rationale: Role aliases and system record IDs are auditable; sensitive contact details belong in the approved
  incident-management system.
  Date/Author: 2026-08-30, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 01 inventories customer-supplied addresses, verification inferences, PostgreSQL, BullMQ/Redis, S3, SMTP/proxy and
optional provider disclosures, logs, and backups. Plan 12 inventories controller account/auth/organization/billing/
fraud/security/compliance categories and approves their distinct purpose, retention, rights, hold, and exception rules.
Plan 10 identifies contract roles, approved subprocessors, incident commitments, customer contacts/notice rules, and
transfer owners. Plan 11 identifies only managed policy boundaries containing processor-side customer-verification
copies, with their access and evidence references; its 30-day maximum does not govern controller, security, incident,
audit, legal-hold, or statutory evidence. Plan 15 owns restore declaration, quarantine, reconciler checkpoints, and
release. Plan 26 later consumes the incident map/change triggers for accountability and assessment records; it does not
retroactively make a pending plan-12 lifecycle or incident decision approved.

Those artifacts describe the systems and obligations, but they do not yet identify whom an on-call responder should
page or when legal “awareness” begins. They also do not explain how to distinguish a security event from a personal-data
breach, notify a customer controller, preserve evidence, or record decisions. Source control is not an incident system of record;
live case details, affected customers, forensic artifacts, and notification copies must stay in the approved restricted
system selected by Security.

In this plan, an “assessment clock” begins at the exact event counsel defines for one role/jurisdiction/obligation. A
clock can require assessment, customer notice, regulator decision/notice, data-subject decision/notice, contractual
escalation, or internal review. A timer is not proof that notification is legally required; the decision record captures
facts, risk, counsel decision, timing, and rationale.

## Scope and Non-Goals

Create `docs/privacy/security-incident-response.md`, `docs/privacy/incident-data-map.md`,
`docs/privacy/incident-contact-tree.md`, and `docs/privacy/incident-evidence-and-tabletop.md`. Add a non-secret
`config/privacy/incident-response.yaml`, a strict validator/test under `scripts/privacy/`, a
`privacy:incident-readiness-check` package command, and the check in validation CI. Update the processing/controller
contracts and subprocessor register with exact runbook/contact references.

Cover detection/intake, severity, incident command, containment, and data/role/jurisdiction scoping. Also cover
processor-to-customer notice, controller regulator/data-subject assessment, subprocessor coordination,
transfer/authority contacts, evidence preservation, legal holds, and secure communications. Finish with recovery
through plan 15, notification evidence, post-incident review, control remediation, and exercise cadence.

This plan does not build a SIEM, buy or invent an incident provider, or create production on-call infrastructure. It
does not include real incident/customer/forensic data, decide that a hypothetical event is legally reportable,
hardcode one 72-hour rule, send a notification, perform production recovery, alter privacy-rights data, or claim
certification/compliance. It adds
no CAN-SPAM incident rule; CAN-SPAM becomes relevant only if an actual commercial-message sending feature and incident
fall within its scope.

## Plan of Work

Reconcile the prerequisite inventories into a data map keyed by stable system/data/recipient IDs. For each node,
record controller/processor role, customer owner where applicable, data categories, environment, owning/on-call team,
subprocessor/independent recipient, region/transfer owner, containment switch, evidence source, restoration gate, and
notification-contract reference. A processor-side managed-copy node references the exact plan-11 store/policy boundary.
A controller/security/legal evidence node instead references its exact plan-12 category, lifecycle, hold, and exception
decision plus its approved Operations evidence source; it never inherits the plan-11 30-day maximum. Preserve stable
incident/change-trigger IDs for the later plan-26 accountability and assessment register. Unknown or stale mappings fail
readiness.

Have Security select the restricted incident system of record, paging mechanism, evidence store, and role aliases. Have
privacy counsel supply the decision table: role, jurisdiction, affected data/subjects, obligation type, awareness
trigger, assessment/notification duration or textual rule, authority/contact reference, required content, approver,
extension/exception behavior, and legal source. Include applicable distinctions reflected in
[GDPR Articles 33 and 34](https://eur-lex.europa.eu/eli/reg/2016/679/art_33/oj) and official
[California data-breach reporting guidance](https://oag.ca.gov/privacy/databreach/reporting), but record only counsel's
approved operational interpretation for LeadEmailFinder.

Build `config/privacy/incident-response.yaml` from those actual choices. It stores role aliases, system IDs, non-secret
contact/evidence record references, processor-store or controller-category source IDs, clock rule IDs, stable plan-26
change-trigger IDs, last verification/exercise dates, review expiry, and dependency IDs from plans 01, 10, 11, 12, and 15. The validator rejects placeholders, unknown systems/vendors, expired contacts or exercises, and secret-looking
values. It also rejects a plan-11 store used as controller lifecycle policy or an unapproved/missing plan-12 controller
category decision. Clock failures include a missing role/jurisdiction/trigger/source/owner, a universal fallback
deadline, missing customer-controller notice handling for processor data, or missing restore/evidence paths.

Write the initial-response runbook as a timeline of observable decisions. Open a restricted case, record detection and
possible awareness times separately, page incident command/Security/privacy counsel, and classify affected systems and
roles. Then stop active exposure, preserve volatile evidence where safe, rotate/revoke credentials, and quarantine
restores. Finally, identify customers/vendors, instantiate only matching approved clocks, and assign every decision
before handoff. Logs and public status updates use sanitized IDs only.

Write the processor notice path so the incident owner uses plan-10 contract contacts and content, notifies each affected
customer controller under its approved rule, sends material updates, supports the customer's assessment, and records
delivery/acknowledgment/escalation. It must not notify that customer's subjects or regulator on its behalf unless
privacy counsel records a direct obligation or explicit authority.

Write the controller assessment path for account/auth/organization/billing/fraud/security/compliance data. The decision
record captures scope, categories/counts, encryption/access controls, likely consequences/risk, containment, counsel
decision, regulator/data-subject content and timing where applicable, delayed/omitted-notice rationale, delivery
evidence, and follow-up. Templates use synthetic placeholders and never imply that all security events are breaches or
all breaches require the same recipient.

Define evidence preservation: source, collector, collection time/method, hash, encrypted storage reference, custodian,
access log, hold scope/review/expiry, transfer of custody, and disposal approval. Forensic exports stay out of Git and
ordinary tickets. The runbook names safe emergency exceptions, protects credentials and third-party data, and requires
a post-containment review of any destructive action.

Run two timed tabletops in the approved incident workspace. The first scenario is a subprocessor disclosure of customer
verification data requiring customer-controller cooperation. The second scenario is compromised account/billing/security data
with a restored backup and conflicting jurisdiction inject. Include after-hours contact failure, uncertain awareness,
unknown affected count, vendor delay, evidence-access denial, and a clock approaching escalation. Record response times,
decision quality, notification drafts, restore-gate behavior, findings, owners, due dates, and retest requirements with
fictional data only.

## Interfaces and Dependencies

The readiness manifest contains interfaces equivalent to:

    interface IncidentClockRule {
        id: string
        role: 'processor' | 'controller'
        jurisdiction: string
        obligation: string
        awarenessTrigger: string
        deadlineRule: string
        authorityOrCustomerContactRef: string
        legalSourceRef: string
        counselOwner: string
    }

    interface IncidentReadinessManifest {
        systemMapVersion: string
        roleContactRefs: Record<string, string>
        evidenceStoreRef: string
        clockRules: IncidentClockRule[]
        lastVerifiedAt: string
        lastTabletopAt: string
        nextReviewAt: string
    }

The manifest references actual systems selected by Security and Operations, contract/register IDs from plan 10,
processor-copy policy-boundary IDs from plan 11, controller category/lifecycle/hold IDs from plan 12, and restore-
generation/reconciler contracts from plan 15. It publishes stable incident and change-trigger IDs for plan 26. It
stores no endpoint token, personal contact details, customer identity, or private legal analysis. The validator uses
existing YAML/Zod/testing dependencies and follows the scripts/CI conventions established by plan 11.

Plan 01 and plan 12 supply the two role/data inventories. Plan 10 supplies customer/subprocessor incident commitments,
contact ownership, and cooperation terms. Plan 11 supplies only managed processor-copy evidence sources, access
controls, and backup expiry. Plan 12 supplies controller/security/legal category lifecycle and hold decisions; actual
controller evidence sources come from Security and Operations and are not forced into the plan-11 register. Plan 15
supplies restore quarantine, reconciler, and release contracts. Plan 26 later consumes this plan's stable incident/
change-trigger references. Security and privacy counsel supply the incident systems, contacts, clocks, and decisions
that source inspection cannot determine.

## Acceptance Criteria

- Every inventoried customer-verification and controller-data system/recipient maps to a current role, owner, on-call
  reference, containment/evidence source, contract/vendor reference, region/transfer owner, and restore path. Managed
  processor copies reference plan 11; controller/security/legal evidence references exact plan-12 category/lifecycle/
  hold decisions and does not inherit the processor-copy 30-day maximum.
- The readiness command fails for placeholders, missing/expired contacts, stale exercise/review, unknown systems or
  vendors, secret-like values, missing processor-to-customer handling, or incomplete clock rules.
- No clock is a role-agnostic universal fallback; every instantiated clock records role, jurisdiction, awareness
  trigger, obligation, approved rule/source, owner, start time, decision/delivery status, and escalation.
- A processor-data scenario promptly reaches the affected fictional customer controller, records updates and
  acknowledgment/escalation, and does not assume authority to notify that customer's regulator or subjects.
- A controller-data scenario records a counsel-approved regulator/data-subject assessment and its rationale, timing,
  content, delivery evidence, and any approved delay/exception without treating all incidents identically.
- Evidence has source, timestamp, hash, encrypted store reference, custodian, access/custody log, scoped hold, and
  disposal review; no forensic payload or secret enters Git, general chat, or broad logs.
- Containment, credential revocation, subprocessor coordination, plan-15 restore quarantine, recovery, post-incident
  review, finding ownership, due-date escalation, and retest are exercised with fictional data.
- Security, privacy counsel/DPO, customer operations, vendor management, and engineering approve the runbooks and
  current role/contact references.
- No provider is invented, no real notification is sent, no production recovery or compliance claim is made, and plan,
  checker, prose, formatting, and whitespace validation passes.

## Validation

Run the readiness parser and documentation checks:

    corepack pnpm privacy:incident-readiness-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/incident-readiness --runInBand
    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm exec prettier --check docs/privacy/security-incident-response.md docs/privacy/incident-data-map.md docs/privacy/incident-contact-tree.md docs/privacy/incident-evidence-and-tabletop.md config/privacy/incident-response.yaml docs/privacy/email-verification-processing-contract.md docs/privacy/controller-data-contract.md docs/privacy/subprocessor-register.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/14-operationalize-privacy-security-incidents.md
    git diff --check

Have an independent security observer time both tabletops from intake through containment, role/scoping, clock
instantiation, customer/counsel escalation, evidence custody, restore quarantine, decision record, and handoff. Fail the
exercise for an unreachable required role without documented escalation, an unowned/late decision, customer notice
sent to the wrong role, evidence in an unapproved system, restore release before reconciliation, or an unassigned
finding. Retest critical/high findings before completion.

Bruno is not applicable because this plan adds operational documentation, manifests, and offline readiness checks; it
does not change an HTTP API. If implementation adds an incident API or webhook, update this plan with authentication,
signature, idempotency, failure, and Bruno coverage before coding it.

## Idempotence and Recovery

Readiness validation and tabletop replay are safe to repeat. Stable system, contact-role, clock-rule, exercise, and
finding IDs prevent duplicate active records. Update a contact/evidence reference through its reviewed version; never
erase an old incident decision or notification record to make a timeline look compliant.

If a required contact, contract, evidence source, or clock is missing/stale, leave readiness failed and escalate to its
owner. During a live event, containment continues under the emergency chain while the incident commander records the
gap. Reverting this PR removes repository runbooks/checks but cannot delete an external case or notification; the
incident owner follows the approved retention/disposal process in the restricted system.

## Artifacts and Notes

Record manifest version, stable map/clock/contact role IDs, verification dates, fictional exercise/case IDs, response
timings, finding severity/owner/due date, retest status, and sanitized validation results. Never record real incident
facts, customer identities, personal contacts, notification copies, forensic payloads, credentials, private legal
advice, or attacker material.

## Plan readiness

Ready after Security and privacy counsel supply the approved incident system, role contacts, role-and-jurisdiction clock rules, evidence store, and notification decision templates.
