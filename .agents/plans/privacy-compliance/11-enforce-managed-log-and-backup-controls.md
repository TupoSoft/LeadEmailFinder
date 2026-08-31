# Enforce Managed Processor-Copy Log and Backup Controls

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the 30-day engineering maximum and access boundary observable for externally managed copies of customer-supplied
verification data held under LeadEmailFinder's processor/service-provider posture. After this change, each such log
sink or backup policy boundary has a current machine-readable record. That record includes an approved
provider/register reference, native retention or immutable expiry of no more than 30 days, least-privilege access
evidence, region/owner, and review expiry. Unknown, stale, overlong, unapproved, or falsely classified active processor
copies fail CI; an unresolved mixed boundary is representable only while that processor data flow is disabled.

The 30-day maximum in this plan does not govern controller account, authentication, billing, fraud, security,
incident, legal-hold, audit, or statutory evidence. A physical service containing both roles is active under this
control only when the processor copy has an independently enforceable policy boundary. Otherwise, it remains blocked
until plans 12 and 26 provide counsel-approved lifecycle and assessment decisions for the co-resident categories.

The outcome is a provider-neutral register, strict repository validator, provider-policy evidence, and operating
documentation. Restore runtime state, TypeORM persistence, readiness gating, workers, reconciliation, and release are
deliberately isolated in plan 15. Each registered backup boundary also identifies the immutable provider-metadata
mechanism that plan 33 can use to bind a finalized external capture ticket and highest contiguous included privacy-
control sequence to one exact backup generation.

## Progress

- [ ] (2026-08-30) Inventory actual managed processor-side verification log sinks and backup policy boundaries,
      including owners, regions, data classes, segregation, and approved vendor-register IDs.
- [ ] (2026-08-30) Add the machine-readable register, strict schema/validator, focused tests, package command, and CI
      gate.
- [ ] (2026-08-30) Configure and independently verify native retention and immutable expiry of each in-scope
      processor copy at no more than 30 days without applying that maximum to controller evidence excluded from this
      plan.
- [ ] (2026-08-30) Verify least-privilege groups, ordinary-application denial, break-glass ownership, and current access
      reviews.
- [ ] (2026-08-30) Complete provider evidence, documentation, formatting, and sanitized review.

## Plan dependencies

- `privacy-compliance/03`
- `privacy-compliance/10`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep the register provider-neutral until Operations supplies the actual services and evidence mechanisms.
  Rationale: Inventing a provider, region, policy ID, or API would create false assurance.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Enforce a maximum of 30 days only for managed copies containing customer-verification data under the
  processor/service-provider purpose, while permitting a shorter approved duration.
  Rationale: This is the fixed plan-01 engineering maximum for processor-side verification copies. Application
  PostgreSQL/Redis/S3 lifecycles belong to plan 07, and controller/security/legal evidence uses plan 12 and plan 26
  decisions rather than inheriting this number.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require an independently enforceable provider policy boundary for an in-scope copy. A mixed physical
  service is blocked if applying 30 days would also delete a controller/security/legal category whose lifecycle is not
  yet approved.
  Rationale: A store-level setting cannot truthfully represent two incompatible purposes or override retention and
  evidence-preservation decisions that counsel and Security have not made.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Treat retention/expiry and access as independent required controls.
  Rationale: Short-lived data can still be exposed to an overbroad group, and tightly restricted data can still be
  retained too long.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: A development `none` record is valid only for a named environment with current Operations evidence that no
  customer-verification data reaches a managed sink or backup. It is never a statement that no controller or security
  store exists and never a template for a production environment.
  Rationale: Silent omission of an in-scope processor copy must fail without expanding this PR into a universal
  managed-store lifecycle.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep runtime restore quarantine entirely out of this pull request.
  Rationale: Provider inventory/policy evidence is one bounded responsibility; plan 15 owns application state,
  authorization, reconcilers, and release.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require every active backup boundary to prove that its immutable generation metadata can preserve and return
  a plan-33-compatible external capture-ticket ID, authority stream and epoch, highest contiguous included sequence,
  schema/consumer-set digest, and evidence version. Missing, mutable, or mismatched binding makes that generation
  ineligible for restore release; it never means that no post-capture event exists.
  Rationale: An older application snapshot cannot authoritatively describe later privacy-control events. Provider
  generation metadata must bind the snapshot to the independently durable authority without making this policy plan own
  runtime capture or replay.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 03 prevents raw addresses and provider/SMTP payloads from entering application logs. It does not configure an
external sink's retention or access. Plan 10 supplies approved vendor, contract, transfer, and customer authorization
evidence. Plan 07 manages current application PostgreSQL, BullMQ/Redis, and S3 data. The local Docker PostgreSQL/Redis
volumes and ephemeral Garage data are fixtures, not managed backup-set evidence.

The repository currently has no source-backed list of real managed processor copies and no CI rule comparing those
stores with the plan-10 register. This plan creates that evidence boundary. Plan 15 later consumes approved backup-
store IDs, immutable generation-metadata contract IDs, and restore-procedure evidence from this register but does not
change this plan's provider policy. Plan 33 later uses the registered provider metadata capability to bind an external
capture ticket and included high-water mark to the immutable generation. Plans 12 and 26 separately decide controller
lifecycles, legal holds, DPIA/LIA, risk-assessment, and cybersecurity-audit evidence; their categories are not silently
brought under this plan's cap.

## Scope and Non-Goals

Create `config/privacy/managed-data-stores.yaml`, Zod parsing/validation under `scripts/privacy/`, focused tests,
`privacy:managed-data-check`, a validation-CI step, and
`docs/privacy/managed-log-and-backup-controls.md`. Apply and verify provider-native retention, immutable backup expiry,
and access policies for each processor-copy policy boundary supplied by Operations. Record only non-secret evidence
references.

Do not add TypeORM entities, a business module, restore generations, a reconciler interface, readiness gates, or worker
gates. Also exclude admin endpoints, a restore-release CLI, real backup/restore operations, application-record
deletion, privacy-request replay, migrations, production rollout, and recovery claims. Do not impose 30 days on
controller, security, incident, audit, legal-hold, tax, accounting, or assessment evidence; those decisions belong to
plans 12 and 26. Runtime restore behaviors belong to plan 15 and data-owner plans.

## Plan of Work

Inventory every environment where customer-supplied addresses, verification inferences, verification job metadata, or
verification artifacts reach a managed log sink or backup. Trace the exact provider policy boundary and reconcile the
provider with the approved plan-10 register. Require an owner attestation that the processor-copy inventory is
complete; an unknown in-scope service remains an explicit blocking record rather than being omitted. Record a mixed
service as `blocked_mixed_scope` unless Operations proves independent policy enforcement for the processor copy or
supplies the counsel-approved plan-12/plan-26 decision IDs covering every co-resident category.

Define `config/privacy/managed-data-stores.yaml` with `schemaVersion`, immutable `revision`, and `environments`. Each
environment is either a reviewed processor-copy `none` record or lists concrete `log_sink` and `backup_set` policy
boundaries. The schema requires identity and classification fields: stable store ID, environment, provider/service,
region, owner, plan-10 register ID, `dataRole=processor_customer_verification`, exact plan-01 data-category IDs,
provider policy-boundary ID, segregation-evidence ID, and status. It separately requires retention/expiry days,
configuration evidence, access-policy evidence, access-review time/expiry, and evidence review time/expiry. Backup-set
records additionally require automatic immutable expiry,
ordinary-application access denial, break-glass role/review evidence, a non-secret restore-procedure evidence ID, and
an approved immutable generation-metadata adapter ID for plan 15. They also require a provider capability/evidence ID
showing that immutable generation metadata can preserve and return the plan-33 capture-ticket and included-high-water-
mark tuple without reading restored application state. A blocked mixed record lists only stable excluded category IDs
and plan-12/plan-26 decision references, never contents or legal advice.

Add `scripts/privacy/managed-data-stores.ts`,
`scripts/privacy/check-managed-data-stores.ts`, and focused specs. The validator rejects duplicate/unknown fields,
placeholders, secrets, unapproved register IDs, and stale reviews/evidence. It also rejects an active record with a role
other than `processor_customer_verification`, active log retention over 30 days, or active backup-set immutable expiry
over 30 days. Other rejection cases include missing active automatic expiry, ordinary application access, and missing
break-glass review. The validator also rejects a missing active generation-metadata adapter, an active unsegregated
mixed store, an enabled processor flow for a blocked store, a missing or mutable privacy-control capture-binding
capability, and a production `none` record. It prints store IDs and stable reason codes only. It neither validates nor
rewrites the duration of excluded controller/security/legal categories.

Add `privacy:managed-data-check` and run it in `.github/workflows/validate.yml`. YAML is checked by the schema command
and Prettier, not Harper. Keep plan-10 register cross-checking deterministic and source-controlled.

For each in-scope policy boundary, apply the provider-native policy through its approved workflow. Independently
inspect policy metadata, send only synthetic verification data, and create only provider-approved synthetic backup
evidence. Prove that one synthetic immutable generation can carry and return a non-secret capture-ticket/high-water-mark
tuple through the approved metadata reader, without treating application-restored metadata as authoritative. Do not
wait 30 days; verify configured duration and computed expiry. If native policy cannot isolate and enforce the processor-
copy maximum, access boundary, or immutable metadata binding, mark the store blocked. Operations must then segregate,
disable, or replace that verification-data path instead of accepting a manual intention or shortening unrelated
evidence.

Write the operating document with inventory ownership, evidence renewal, access review, break-glass review, provider
change handling, blocked-store escalation, and handoff fields consumed by plans 14 and 15.

## Interfaces and Dependencies

The register record is equivalent to:

    interface ManagedDataStoreRecord {
        id: string
        kind: 'log_sink' | 'backup_set'
        environment: string
        provider: string
        service: string
        region: string
        owner: string
        recipientRegisterId: string
        dataRole: 'processor_customer_verification'
        dataCategoryIds: string[]
        policyBoundaryId: string
        segregationEvidenceId: string
        status: 'active' | 'blocked_mixed_scope'
        processorDataFlowEnabled: boolean
        retentionDays?: number
        automaticImmutableExpiry?: boolean
        configurationEvidenceId: string
        accessPolicyEvidenceId: string
        accessReviewedAt: string
        accessReviewExpiresAt: string
        restoreProcedureEvidenceId?: string
        generationMetadataAdapterId?: string
        privacyControlCaptureBindingCapabilityId?: string
        breakGlassRole?: string
        breakGlassReviewEvidenceId?: string
        evidenceReviewedAt: string
        evidenceExpiresAt: string
    }

The plan uses existing YAML, Zod, TypeScript, Jest, and CI conventions. Plan 03 supplies log-content minimization. Plan
10 supplies approved recipient/vendor/transfer IDs. Plans 12 and 26 own controller lifecycle and assessment decisions;
this schema accepts only their stable decision references for a blocked mixed store and does not enforce those
categories. Plan 14 consumes the processor-copy inventory for incident data mapping. Plan 15 consumes recovery-copy IDs,
generation-metadata adapter IDs, and restore-procedure evidence but owns all runtime restore contracts.
Plan 33 consumes the capture-binding capability and supplies the external ticket, authority epoch, included high-water
mark, schema/consumer-set digest, and restore fence; this plan neither creates those values nor implements the authority.

## Acceptance Criteria

- Every actual managed processor-side verification log or recovery-copy policy boundary is registered, or a named development
  environment has current approved processor-copy `none` evidence; no unknown in-scope service is silently omitted.
- `privacy:managed-data-check` rejects malformed, duplicate, pending, secret-bearing, unapproved, or stale records.
- Every active managed log boundary proves it contains the processor verification copy, is independently enforceable,
  has native retention of no more than 30 days, and has a reviewed least-privilege group.
- Every active backup boundary proves the same processor-only scope and automatic immutable expiry of no more than 30
  days. It also proves denied ordinary-application access, an approved break-glass role/review, a restore-procedure
  evidence ID, and an approved immutable generation-metadata adapter ID. Its immutable privacy-control capture-binding
  capability can return the exact external ticket/high-water-mark tuple for one provider generation.
- A mixed service without independent policy enforcement stays `blocked_mixed_scope`; the checker never places the
  30-day cap on excluded controller/security/legal evidence or treats a pending plan-12/plan-26 decision as approval.
- A blocked mixed record is accepted only while its processor data flow is disabled; attempting to enable it fails CI.
- A 31-day policy, indefinite/mutable backup set, stale review, missing provider approval, production `none` entry, or
  application-readable backup set fails CI.
- Evidence output contains only stable store, policy, review, and reason identifiers, never logs or backup contents.
- A generation whose external capture ticket, authority stream/epoch, highest contiguous included sequence, schema/
  consumer-set digest, or evidence version is missing or mismatched is ineligible for restore release. Neither the
  checker nor the operating procedure interprets missing metadata as an empty event interval.
- No TypeORM model, restore runtime, readiness/worker gate, reconciler, release path, provider fiction, production
  environment, or compliance/recovery claim is introduced.
- Focused checker, CI, documentation, formatting, and whitespace validation passes.

## Validation

Run the register checker and focused tests:

    corepack pnpm privacy:managed-data-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/managed-data-stores.spec.ts --runInBand

Use approved provider sandboxes or read-only policy APIs to verify each in-scope processor-copy policy, segregation,
expiry timestamp, immutable generation metadata, synthetic capture-binding round trip, ordinary-access denial,
break-glass group, and review freshness. Retain non-secret evidence references only.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    corepack pnpm docs:lint -- docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/11-enforce-managed-log-and-backup-controls.md
    corepack pnpm exec prettier --check config/privacy/managed-data-stores.yaml docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/11-enforce-managed-log-and-backup-controls.md
    git diff --check

Bruno is not applicable because this plan changes provider policy evidence, offline validation, and documentation only;
it adds no HTTP behavior.

## Idempotence and Recovery

The checker is read-only and deterministic. Reapplying a provider policy converges on the same duration and access set.
Evidence renewal updates one stable store entry and revision; it does not create duplicate active stores.

If a provider cannot prove scope, segregation, policy, or access, disable the processor flow and keep the record
blocked; inventory CI may pass only in that disabled state, while the deployment/readiness gate prevents re-enablement.
If the flow remains enabled, keep CI failing. Revert the repository register/checker without attempting to delete a
real provider policy. Never recover by lowering
validation, hiding a store, broadening access, imposing the processor duration on controller evidence, or treating a
manual cleanup promise as automatic expiry.

## Artifacts and Notes

Record store IDs, register revision, provider policy IDs, configured durations, computed expiry, access-review IDs,
capture-binding capability IDs, evidence expiry, checker totals, and approver roles. Never record raw logs, backup-set
contents, customer/subject data, credentials, private contracts, or break-glass secrets.

## Plan readiness

Ready after Operations supplies the actual managed processor-copy inventory plus policy-boundary and generation-
metadata evidence mechanisms, including the immutable plan-33-compatible capture-binding capability, and plan 10
approves every named provider. Any unresolved mixed service remains an accepted `blocked_mixed_scope` inventory record;
it cannot be activated until plan-12/plan-26 decisions permit a common boundary or Operations segregates it.
