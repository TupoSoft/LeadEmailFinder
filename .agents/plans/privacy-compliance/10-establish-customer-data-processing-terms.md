# Establish Customer Data-Processing Terms and Subprocessor Governance

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Put the processor/service-provider posture for customer-supplied verification data into counsel-approved customer
terms and an operating process that can be evidenced. After this change, an operator can identify the exact
data-processing addendum accepted by a customer and the documented instructions it authorizes. The operator can also
identify every approved subprocessor and transfer safeguard, how customers receive change notice, and how the service
handles audit findings, termination return, and deletion.

The observable outcome is a versioned contract package, an approved subprocessor and transfer register, and an
authorization/change-control runbook. It also includes a versioned account-discovery approval manifest populated only
from those approved records and sanitized evidence that the selected customer-assent mechanism incorporates the
approved terms.
Merging repository Markdown does not execute a contract or make the terms binding by itself.

## Progress

- [ ] (2026-09-11) Review the plan-35 decision inputs and obtain counsel-approved processor, GDPR Article 28, and CCPA service-provider terms plus the selected assent mechanism.
- [ ] (2026-09-11) Enrich the plan-35 recipient inventory with actual external evidence and approve subprocessors, regions, onward terms, transfer safeguards, and customer-notice owners.
- [ ] (2026-08-30) Publish the versioned addendum, register, change-control, audit/remediation, and end-of-service procedures.
- [ ] (2026-08-30) Populate and version the plan-02 account-discovery approval manifest only for fully approved entries.
- [ ] (2026-08-30) Exercise assent evidence, subprocessor change notice, audit remediation, and return/delete scenarios with synthetic records.
- [ ] (2026-08-30) Complete legal, security, vendor, plan, prose, formatting, and whitespace validation.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/02`
- `privacy-compliance/35`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Consume the plan-35 engineering packet before obtaining the existing customer and provider approvals.
  Rationale: Repository inventory and explicit questions can finish separately; the packet cannot approve recipients,
  select assent, or satisfy this plan's readiness conditions by itself.
  Date/Author: 2026-09-11, backlog preparation planning.
- Decision: Treat source-controlled contract language as an approved template and revision record, not as proof that a
  customer agreed to it.
  Rationale: Contract formation requires the assent mechanism selected by counsel; a Git commit cannot establish that
  assent.
  Date/Author: 2026-08-30, project planning.
- Decision: Require each customer-processing instruction and each subprocessor to map to the plan-01 data inventory,
  approved purpose, data category, region, and accountable owner.
  Rationale: A generic vendor list or open-ended instruction would not provide an auditable purpose limitation or
  reliable flow-down boundary.
  Date/Author: 2026-08-30, project planning.
- Decision: Make a new or materially changed subprocessor default-deny until vendor/security review, Article 28
  flow-down, transfer review where applicable, and the approved customer authorization or notice period are complete.
  Rationale: Deploying first and documenting later would defeat the contractual control.
  Date/Author: 2026-08-30, project planning.
- Decision: Treat `config/privacy/account-discovery-approvals.yaml` as the executable projection of approved
  account-discovery rows, not a second approval system. An entry ID is immutable after activation; a material
  provider, purpose, region, contract, transfer, security, customer-authorization, or validity change creates a new
  ID and manifest revision, while suspension/revocation updates status immediately.
  Rationale: The plan-02 runtime gate needs exact machine evidence without allowing YAML to replace counsel, vendor,
  Security, or customer governance.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Do not assume Standard Contractual Clauses are required or sufficient for every transfer.
  Rationale: Counsel must identify the exporter, importer, destination, and any supplementary measures from an actual
  vendor and data flow before choosing the applicable transfer mechanism.
  Date/Author: 2026-08-30, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Privacy plan 02 creates an empty, strictly validated `config/privacy/account-discovery-approvals.yaml`; environment
variables cannot activate a provider without an exact manifest match. This plan may populate that manifest only after
the corresponding recipient/vendor row and all required approvals are effective.

Privacy plan 01 creates `docs/privacy/email-verification-processing-contract.md` and identifies remote SMTP servers,
proxy infrastructure, optional account-discovery providers, database/Redis/object-storage operators, managed logging,
and backup operators. That engineering contract deliberately does not sign a customer agreement, approve a vendor,
or establish an international-transfer mechanism.

For this plan, a “customer instruction” is a bounded, authenticated use of the verification service under the agreed
purpose; it is not permission for LeadEmailFinder to reuse the address independently. A “subprocessor” is a party
engaged to process customer verification data on LeadEmailFinder's behalf. The approved register must distinguish such
parties from independent recipients such as a target domain's remote mail server, while still recording the disclosure
and legal owner identified by plan 01.

The contract package must cover the processor obligations selected by counsel, including documented instructions,
confidentiality, security, assistance with rights requests, compliance assessments, and incident cooperation. It must
also cover deletion at end of service, return at end of service, audit information, subprocessor authorization, and
equivalent flow-down. The package must separately
record the California service-provider/contractor restrictions counsel determines apply, including limits on sale,
sharing, retention, use, disclosure, and combining data. These are legal drafting decisions, not conclusions this plan
can infer from source code.

## Scope and Non-Goals

Create or update `docs/privacy/customer-data-processing-addendum.md`,
`docs/privacy/subprocessor-register.md`, and `docs/privacy/subprocessor-governance.md`. Version and populate
`config/privacy/account-discovery-approvals.yaml` from approved register rows. Update the plan-01 processing
contract and the root privacy link to identify the approved versions and owners. Record the selected assent mechanism,
version identifier, effective date, evidence location, and withdrawal/replacement procedure without committing customer
names, signatures, commercial terms, or private contract copies.

The addendum and governance must cover documented instructions, confidentiality commitments, security commitments, and
data-subject, regulator, audit, and impact-assessment assistance. They must cover incident cooperation, subprocessor
authorization and change notice, Article 28 flow-down and remediation, and transfer assessment and safeguards where
applicable. They must also cover end-of-service return or deletion, deletion exceptions, evidence retention, and
suspension when a vendor cannot meet the terms.

This pull request does not decide unresolved legal language, execute a customer agreement, accept terms on a customer's
behalf, invent a vendor, configure infrastructure, add an outreach feature, or claim GDPR/CCPA/CAN-SPAM compliance.
CAN-SPAM remains outside this repository unless it begins sending commercial messages; verification alone does not
create sender consent or permission.

## Plan of Work

Start by reviewing `docs/privacy/customer-processing-decision-inputs.md` from plan 35 against the current plan-01
recipient and transfer inventory. Reuse its source citations and focused questions, reconcile any source changes, and
enrich the packet with actual external evidence. For each actual recipient, confirm the role, service, processing
purpose, data categories, region, access mode, deletion commitment, incident commitment, contract owner,
security-review owner, and current approval evidence. Unknown facts remain `pending` and block activation; do not fill
them with a plausible provider or region. The preparation packet is not an approved register or customer agreement.

Privacy counsel then supplies or approves the customer addendum and selects how customers assent: an executed bilateral
addendum, incorporation into a signed master agreement, or an approved versioned online acceptance flow. Document and
test only that selected mechanism. Store a nonsecret evidence reference containing customer record ID, terms version,
accepted-at time, and evidence system owner; do not commit a signature, customer identity, or full executed contract.
If the selected mechanism requires application changes, keep them within this pull request and add focused and HTTP
coverage for version presentation, affirmative assent, immutable evidence, and rejection of processing before assent.

Build the subprocessor register from approved actual vendors. Each entry includes a stable ID, service, purpose, data
categories, processing locations, first-use date, contract/Article 28 flow-down status, and transfer assessment and
mechanism status. It also includes the security review, retention/deletion commitment, incident contact, customer notice
date, objection path, approval owner, and evidence references. Independent recipients are listed in a separate section and are never
misrepresented as subprocessors.

For each account-discovery row that has effective terms and approvals, add exactly one plan-02 manifest entry. Its ID,
provider, fixed `email_verification.account_discovery` purpose, region, effective/expiry instants, processing-contract
version, and recipient-register ID must match the approved source records. Its vendor/security/transfer evidence,
customer notice-or-authorization evidence, owner, and review time must also match. Increment the manifest revision. Leave incomplete providers
absent; `pending` Markdown is not executable approval. Run the shared checker before any test deployment. Suspension or
revocation changes status and is deployed immediately; approval after a material change uses a new immutable entry ID.

Write the governance runbook so a proposed subprocessor or material change enters `pending`, cannot be enabled while
required fields or approvals are missing, receives the counsel-approved customer notice/authorization treatment, and
records objections and the resulting remediation, replacement, or suspension. Define periodic contract and security
review, audit-request handling, finding severity, remediation owner/date, overdue escalation, and the evidence needed to
resolve the issue.

Define end-of-service handling from an authenticated termination instruction through return/export where agreed,
application deletion, plan-11 processor-copy backup/log expiry, subprocessor deletion confirmation, approved legal
exceptions, and a sanitized completion receipt. Exercise the process with fictional customers and vendors, update the
processing contract's implementation mapping, and record actual legal/security/vendor approvals.

## Interfaces and Dependencies

The customer addendum and register implement the processor/service-provider constraints documented by plan 01. They
must use counsel-approved language and remain consistent with [GDPR Article 28](https://eur-lex.europa.eu/eli/reg/2016/679/art_28/oj),
the [European Commission Standard Contractual Clauses decision](https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj)
where counsel selects those clauses, and the applicable
[California Consumer Privacy Act regulations](https://cppa.ca.gov/regulations/consumer_privacy_act.html).

The selected assent mechanism is an explicit dependency supplied by counsel and the commercial owner. The register
references evidence held by the approved contract, vendor-management, security, and infrastructure systems; it never
stores secrets or private agreements in Git. Plan 02 supplies the manifest schema, runtime loader, and CI checker; this plan owns real entry population and version
governance. Plan `privacy-compliance/11` consumes the approved managed-log and backup entries. Plans `privacy-compliance/13` and `privacy-compliance/14` consume the assistance, deletion, contact, and
incident obligations.

No package is required for a document/operational mechanism. If counsel selects an in-product acceptance mechanism,
the plan must be updated before implementation with exact endpoints, persistence, authorization, and Bruno scenarios;
it is not ready while those decisions are unknown.

## Acceptance Criteria

- Counsel-approved terms state documented instructions and prohibit independent reuse of customer verification data.
- The terms cover required processor/service-provider restrictions, confidentiality/security, rights assistance, assessment
  assistance, incident cooperation, audit information, end-of-service return/delete, and approved exceptions.
- Every actual subprocessor has an approved register entry with purpose, categories, region, flow-down, security,
  deletion, incident, transfer, authorization/notice, owner, and current evidence; an incomplete entry cannot be active.
- Every executable account-discovery approval maps one-to-one to an effective register row and matches exact provider,
  fixed purpose, region, validity interval, evidence IDs, and owner; incomplete or expired rows are absent or inactive.
- Manifest revisions and immutable approval IDs change under the documented rule, and the plan-02 CLI/CI validator
  rejects drift between executable entries and their approved sources.
- A test subprocessor change cannot become approved before the selected notice/authorization period and required
  reviews complete; an objection produces a recorded remediation, replacement, or suspension decision.
- Transfers are marked not applicable, approved with a named mechanism and assessment, or blocked; no unknown transfer
  is represented as lawful or active.
- An audit finding has a severity, owner, due date, evidence, and escalation path, and cannot close without remediation
  evidence or an explicitly approved risk decision.
- A fictional termination exercise produces return/delete tasks, subprocessor confirmations, plan-11 processor-copy
  expiry tracking, legal-exception records, and a sanitized completion receipt.
- Sanitized evidence proves the selected customer-assent mechanism incorporated the exact terms version; the repository
  documents explicitly say that Markdown or a merge is not customer assent.
- No customer identity, signature, executed agreement, secret, vendor credential, or real processing payload is
  committed, and no compliance claim is published.
- Plan parsing, dependency, prose, formatting, and whitespace checks pass; any in-product assent behavior also passes
  focused, authorization, integration, and Bruno tests defined in the updated plan.

## Validation

Validate the plan graph and source-controlled contract package:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm privacy:account-discovery-approvals-check
    corepack pnpm exec prettier --check config/privacy/account-discovery-approvals.yaml docs/privacy/customer-data-processing-addendum.md docs/privacy/subprocessor-register.md docs/privacy/subprocessor-governance.md docs/privacy/email-verification-processing-contract.md README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/10-establish-customer-data-processing-terms.md
    git diff --check

Have privacy counsel, security, vendor management, and the commercial owner sign the repository approval table using
their normal nonsecret review evidence. In a test contract workspace, prove the selected assent mechanism retains the
exact version and timestamp, then exercise one approved change, one blocked incomplete vendor, one customer objection,
one overdue audit finding, and one end-of-service deletion. Record only fictional identifiers and evidence references.

If application behavior is added for assent, run the focused tests, architecture gate, typecheck, lint, full tests,
build, and the nearest affected Bruno collection recorded in the updated plan. Otherwise, Bruno is not applicable
because this plan changes approved contract and operational documentation, not HTTP behavior.

## Idempotence and Recovery

Versions are immutable after customer use. Correct an unaccepted draft in place; replace an accepted version with a
new version, effective date, notice, and assent path. Rerunning a review or change workflow updates the same stable vendor entry and cannot create a second active approval
for the same service/change. An activated account-discovery approval ID is immutable; suspension/revocation updates its
status, while approval after a material change creates a new ID and manifest revision.

If a vendor or transfer review fails, leave it blocked, disable any test-only activation, and retain sanitized
remediation evidence. If assent evidence cannot be produced, do not process under the new terms or claim the contract
is active. Reverting the repository PR removes templates and links but cannot revoke an externally executed agreement;
the contract owner must follow the approved replacement/termination process.

## Artifacts and Notes

Record approved document versions, approver roles, register row counts, blocked-item counts, notice dates, fictional
exercise IDs, and nonsecret evidence references. Never record customer identities, signatures, executed agreements,
private legal advice, credentials, raw addresses, or vendor secrets.

## Plan readiness

Ready after privacy counsel approves the customer terms and transfer decisions, selects the assent mechanism, and vendor management supplies the actual subprocessor register.
