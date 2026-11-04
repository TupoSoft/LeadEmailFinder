# Prepare Customer-Processing Decision Inputs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the engineering preparation for plan 10 a separate task that can finish now. One documentation pull request creates
`docs/privacy/customer-processing-decision-inputs.md`, containing a repository recipient inventory, evidence gaps,
and focused questions for the customer terms, assent, and provider decisions already required by plan 10.

A reviewer can trace each recipient category to current source and see exactly which external facts and decisions
remain missing. Completing this preparation does not approve terms or recipients, activate a provider, or make plan 10
ready. Questions may remain unanswered when this plan finishes.

## Progress

- [ ] (2026-09-11) Reconcile the existing processing contract's recipient categories with current source.
- [ ] (2026-09-11) Write the recipient inventory and distinguish source evidence, proposals, and unknown external facts.
- [ ] (2026-09-11) Prepare the terms, assent, provider, and transfer questions with owner roles and evidence requirements.
- [ ] (2026-09-11) Review coverage and decision boundaries; run the exact plan, prose, formatting, and whitespace checks.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/02`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Deliver an internal preparation document separately from the approved contract package in plan 10.
  Rationale: Source inspection and explicit questions can finish before counsel or vendor information is available.
  Date/Author: 2026-09-11, backlog preparation planning.
- Decision: Missing vendor identities, regions, agreements, and approvals remain unanswered questions.
  Rationale: Development fixtures and optional adapters do not establish actual operating arrangements or approval.
  Date/Author: 2026-09-11, backlog preparation planning.
- Decision: Reuse the existing owner roles in plan 10 and approval requirements without appointing people or adding gates.
  Rationale: This preparation makes existing decisions actionable; the downstream plan retains decision authority.
  Date/Author: 2026-09-11, backlog preparation planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`docs/privacy/email-verification-processing-contract.md` already contains a field inventory, recipient matrix, and
role boundary. Its `Recipients and Transfers` section distinguishes remote target mail servers, DNS services, SMTP
proxies, account-discovery endpoints, storage operators, logs, and backups. It separates Keycloak and payment data
from customer verification data and explicitly leaves actual external operators and regions pending.

`config/privacy/account-discovery-approvals.yaml` currently has an empty approval list. The composition in
`src/libs/modules/email-verification/src/infrastructure/account-discovery/account-discovery-composition.ts` selects
at most one provider through the existing approval gate. The schema lives in
`src/libs/config/src/account-discovery-approvals.ts`. Neither an adapter nor a configuration field proves activation.

`privacy-compliance/10` owns approved customer terms, the assent mechanism, the actual approved recipient register,
and any later manifest population. That plan currently needs information from outside Git. This plan packages what
an engineer can establish now and identifies precisely what the existing responsible functions must supply later.

## Scope and Non-Goals

Create only `docs/privacy/customer-processing-decision-inputs.md` and update the progress and evidence in this plan.
This internal engineering preparation must display the `Draft decision inputs; no approvals` status.

Do not create the approved addendum or subprocessor register, alter existing contracts or runtime controls, populate
approval manifests, choose a legal basis or transfer mechanism, publish customer copy, contact anyone, buy services,
assign people, or require a production environment. Do not collect private contracts, credentials, or customer data.
No implementation, infrastructure change, migration, external review, or signed approval is required for completion.

## Plan of Work

Read the existing processing contract and plan 10. Recheck its recipient categories against the verification module,
`src/libs/dns/src/dns.service.ts`, `src/libs/modules/proxy/src/`, `docker/compose.yaml`, `docker/infra.yaml`, and
`swarm.yml`. Inspect declarations and source, not secret files or live payloads. Distinguish repository development
fixtures, optional integrations, observable disclosures, and external arrangements that source cannot establish.

Write a recipient table with stable row IDs, category, source path and symbol or section, disclosed data categories,
observed flow, current engineering state, role classification inherited from the processing contract, and unresolved
facts. Include internal/customer recipients and independent target mail servers so a generic vendor list cannot
silently omit them or relabel every recipient as a subprocessor. Link controller-only providers to the separate
plan-36 preparation. Record an unknown actual provider or region as unknown rather than infer it from a hostname.

Add a decision-question table keyed to recipient rows or plan-10 obligations. Cover the terms package, selected
customer-assent mechanism and evidence, actual operators and locations, onward terms, transfer review, security
review, customer notice/authorization, deletion, and incident commitments. Each question records the fact or decision
needed, why plan 10 needs it, the existing responsible role, expected nonsecret evidence, and `open` status unless
an existing decision is cited. If an individual owner or evidence system is unknown, record that explicitly.

Include an engineering recommendation for how to organize the evidence and compare the assent choices already named
in plan 10. State which application surfaces would need a separate concrete design if an online mechanism is later
selected. Do not select legal language, customer assent, a vendor, or a transfer safeguard on another role's behalf.
Recommendations stay visibly separate from observed facts and accepted decisions.

Finish with a coverage reconciliation against every category in the existing recipient matrix and every readiness
input in plan 10. Explain exclusions and contradictions with source references. Use existing category IDs where
available; missing information becomes a question with an owner role and evidence requirements. Hand the packet to plan
10 through its dependency and document reference; external responses are later work, not completion criteria here.

## Interfaces and Dependencies

The only new interface is the internal Markdown packet: recipient rows, linked questions, draft recommendations,
source revision, and coverage reconciliation. It consumes completed plans 01 and 02 and supplies plan 10.
Plan 10 retains its legal, vendor, security, commercial, assent, and runtime approval requirements unchanged.
There is no new endpoint, service, package, persistence type, configuration value, or external integration.

## Acceptance Criteria

- The packet exists, identifies the inspected commit and date, and visibly states that it grants no approvals.
- Every existing recipient category maps to a source-supported inventory row or an explicit unknown/exclusion.
- Each external unknown has a focused question, existing owner role, evidence requirements, and unresolved status.
- Draft recommendations and source facts are distinguishable; no invented vendor, location, approval, or assent exists.
- Controller-only providers and independent recipients remain separate from customer-data subprocessors.
- All plan-10 readiness inputs are represented; unanswered external questions do not prevent preparation completion.
- The diff contains only the packet and this plan, and all focused validation commands pass.

## Validation

From the repository root, run these commands after creating the packet:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm exec prettier --check docs/privacy/customer-processing-decision-inputs.md .agents/plans/privacy-compliance/35-prepare-customer-processing-decisions.md
    git diff --check
    git diff --name-only

Manually reconcile the packet against `Recipients and Transfers` in the existing processing contract and the exact
readiness sentence in plan 10. Check each row's citation and each question's owner role and evidence format. Confirm
that unknown actual operators and missing regions stay open without blocking this plan or becoming approvals.
Record the changed-file review, coverage result, and command outcomes in this plan. No runtime or external approval
exercise is required. Bruno: not applicable — only internal documentation changes; HTTP behavior is unchanged.

## Idempotence and Recovery

Update the same stable rows and question IDs when repeating the inventory. Keep answered questions linked to their
source evidence and reopen them when evidence conflicts. Retry failed documentation checks after focused edits.
A partial packet may remain a draft. Revert this documentation pull request to remove the packet; no external state,
provider approval, deployment, or development database needs recovery.

## Artifacts and Notes

Record the packet path, inspected commit, category/question counts, unresolved owner assignments, and validation
results. Use role names and sanitized evidence descriptions only. Do not manufacture private-system reference IDs.
The artifact is a future output of this plan, not evidence that preparation has already been completed.

## Plan readiness

Ready to implement
