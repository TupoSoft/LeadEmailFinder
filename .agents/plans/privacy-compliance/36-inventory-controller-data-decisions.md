# Inventory Controller-Data Decision Inputs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the repository inventory for plan 12 a separate task that an engineer can finish now. One documentation pull
request creates `docs/privacy/controller-data-decision-inputs.md`, with a source-backed controller-data inventory,
observed collection surfaces and lifecycle behavior, and precise questions for decisions still required by plan 12.

A reviewer can trace each data category to its owning field or store and identify missing purpose, notice, retention,
rights, and account-recovery decisions. Completion means the inputs are explicit; it does not approve the controller
contract or supply the external decisions that keep plan 12 blocked.

## Progress

- [ ] (2026-09-11) Trace controller fields, stores, collection surfaces, and existing lifecycle behavior from source.
- [ ] (2026-09-11) Write the inventory with explicit source facts, uncertain external details, and absent capabilities.
- [ ] (2026-09-11) Prepare the plan-12 decision questions and recovery-receipt gaps with owner roles and evidence needs.
- [ ] (2026-09-11) Reconcile inventory coverage and boundaries; run focused plan, prose, formatting, and whitespace checks.

## Plan dependencies

- `privacy-compliance/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Extract source inventory into an internal preparation document consumed by plan 12.
  Rationale: Repository evidence can be gathered without legal, security, provider, or production access.
  Date/Author: 2026-09-11, backlog preparation planning.
- Decision: Keep observed expiry periods, deletion behavior, and collection surfaces separate from approved retention and notices.
  Rationale: Current behavior is evidence for a decision; it cannot establish legal adequacy or approval.
  Date/Author: 2026-09-11, backlog preparation planning.
- Decision: Unanswered questions can remain open at completion if they name the existing responsible role and evidence.
  Rationale: Plan 12 owns the approved decisions and retains its readiness conditions.
  Date/Author: 2026-09-11, backlog preparation planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The existing processing contract at `docs/privacy/email-verification-processing-contract.md` separates account and
billing data from customer-supplied verification addresses and results. Plan 12 already specifies the controller
contract's required categories and its approved notice and account-recovery receipt decisions.

Identity persistence under `src/libs/modules/identity/src/infrastructure/persistence/` includes organizations,
external identities, memberships, invitations, service credentials, credit accounts, debits, grants, reservations,
and audit entries. For example, `external-identity.entity.ts` stores issuer/subject, optional email, and timestamps.
`src/libs/modules/bff-session/src/domain/session-record.ts` includes identity/organization references, CSRF material, expiry times,
and access/refresh tokens; Redis adapters persist encrypted session and pending login state.

The payments entities under `src/libs/modules/payments/src/infrastructure/persistence/typeorm/` store purchases
and adjustments. Keycloak and the payment adapter provide external account and payment boundaries. Source can show
what the application sends or stores, but cannot establish all provider copies, actual regions, contracts, or retention.
The packet must record those limits without treating missing external information as evidence of absence.

## Scope and Non-Goals

Create only `docs/privacy/controller-data-decision-inputs.md` and update the progress and evidence in this plan.
The packet must say `Draft decision inputs; no approvals` and remain distinct from the future normative contract.

Do not approve purposes, legal bases, retention periods, notices, rights exceptions, or a recovery issuer. Do not
publish notices or customer copy, add endpoints or jobs, change cookies or authentication, contact anyone, assign
people, alter schemas, create migrations, or gather real personal data. External approval and a production environment
are not prerequisites. No application code, module guides, runtime configuration, or provider state changes here.

## Plan of Work

Read plan 12, the existing processing contract, and the source areas below. Trace fields from HTTP/OIDC inputs through
local persistence, Keycloak calls, sessions, returned DTOs, and logs. Include organization and service-client flows,
credits, payment checkout and webhooks, security/audit records, and declared development storage configuration. Use source
and sanitized documentation; do not inspect secrets, live database rows, tokens, or private provider records.

Create stable inventory IDs and record subject category, field names, source path and symbol, owning module/store,
collection entry point, outbound recipient, observed use, current TTL/deletion behavior, and evidence state. Include
explicit categories for external Keycloak/payment copies and managed logs/backups whose actual arrangements are unknown.
Record searched paths for a currently absent support, fraud, or recovery capability; an absence statement is limited
to the inspected repository revision. Cite parent-plan decisions separately from implemented source behavior.

Inventory `lef_session`, `lef_csrf_token`, and `lef_login_state` using
`src/libs/modules/bff-session/src/api/bff-cookie-names.ts`, `cookie-options.ts`, and the session flow/configuration.
Record purpose, scope, security attributes, lifetime, and deletion triggers. Carry forward the existing classification in plan 12 as a planning decision without converting it into a new approval or asserting a notice is published.
Map actual login, onboarding, member/service-client, and payment collection surfaces; unknown notice content, locales,
timing, or assent treatment becomes a decision question, not an invented UI design.

For each data category, add linked questions for the plan-12 purpose, legal basis, notice, recipient/transfer,
retention, rights, exception, response-clock, and owner decisions that source cannot provide. Each question includes
the needed decision, source evidence, existing responsible role, evidence format, and open status. Mark the
individual owner as unresolved when no person is known. Separate proposed engineering groupings from approved rules.

Add an account-recovery gap table comparing existing capabilities with the required issuer/adapter, exact
claims, issuer/subject binding, validity, single consumption, replay, revocation, outage, rotation, and evidence rules
in plan 12.
Preserve those requirements as downstream decisions or contracts. Record the missing real issuer and approval evidence
as questions for the already identified roles; do not invent an issuer, weaken the contract, or build an adapter.

Conclude with a coverage map against every category and decision input in plan 12. Keep customer verification copies
under their existing processor contract even when an identifier also occurs in an account record. Recommend an
engineering review order based on shared source areas and dependencies; unresolved legal and security answers remain
with plan 12. Completing the packet must not require the later contract or any later runtime controls.

## Interfaces and Dependencies

The new internal Markdown packet contains inventory rows, collection/browser-storage rows, recovery gaps, linked
questions, source revision, and a coverage map. It consumes completed plan 01 and supplies plan 12. Inspect
`src/libs/modules/organization-onboarding/src/`, `src/libs/modules/service-client-management/src/`,
`src/libs/modules/credits/src/`, `src/libs/modules/auth/src/`, `src/libs/keycloak-admin-http/src/`,
`src/libs/modules/payments/src/infrastructure/paddle/`, `src/main.ts`, and `docker/compose.yaml` alongside the paths above.
There is no new runtime interface, provider integration, package, or persistence dependency.

## Acceptance Criteria

- The packet identifies its inspected commit/date and states that it is unapproved engineering preparation.
- Every plan-12 data category maps to fields/stores with citations or an explicit, bounded evidence gap.
- Collection and browser-storage rows distinguish current behavior from approved notice and retention decisions.
- Each unresolved decision has a linked question, existing owner role, evidence requirements, and visible open status.
- The recovery gap table covers every existing plan-12 receipt requirement without choosing an unapproved issuer.
- Customer verification and controller copies remain distinct; no external facts or legal conclusions are invented.
- Unanswered external questions permit completion of this plan while plan 12 retains its approval gates.
- The diff contains only the packet and this plan, and all focused validation commands pass.

## Validation

From the repository root, run these commands after creating the packet:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm exec prettier --check docs/privacy/controller-data-decision-inputs.md .agents/plans/privacy-compliance/36-inventory-controller-data-decisions.md
    git diff --check
    git diff --name-only

Manually reconcile every plan-12 category and receipt requirement with the packet's coverage map. Check cited entity
fields, session/cookie behavior, collection surfaces, and the distinction between external unknowns and absent source
capabilities. Verify each open question's owner role and evidence requirements; no answer from an external role is needed
to pass. Record coverage and command results. Bruno: not applicable — internal documentation only; no HTTP changes.

## Idempotence and Recovery

Refresh existing inventory and question IDs when repeating the review, and record the new source revision. Preserve
pending decisions until evidence resolves them; record contradictions instead of overwriting approved contract values.
Retry failed documentation checks after focused corrections. Reverting this documentation pull request removes the
packet without affecting accounts, sessions, provider records, notices, runtime controls, or development data.

## Artifacts and Notes

Record the packet path, inspected commit, coverage gaps, open-question counts, and validation outcomes. Use source
identifiers and role names without personal data, raw receipts, tokens, secret values, or fabricated approval IDs.
The artifact is a future output; this planning change does not claim the inventory has already been delivered.

## Plan readiness

Ready to implement
