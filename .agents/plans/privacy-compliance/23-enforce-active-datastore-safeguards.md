# Enforce Active Production Data Store Safeguards

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make safeguards for the actual production PostgreSQL, Redis, and S3-compatible active data stores observable, current,
and release-blocking. After this change, every deployed live store has one provider-neutral inventory record that
classifies its operator as internal or external. An internal store has accountable internal owner/operator evidence
without a fabricated plan-10 recipient, while an external store maps to one exact approved plan-10 recipient/vendor.
Every store also has at-rest encryption or an equivalent risk control approved by Security and privacy counsel. It has
least-privilege application and human access, an enforced network boundary, explicit key ownership/rotation, auditable
administration/data access where available, and fresh independent review evidence. Unknown, stale, overbroad, misclassified, or
unapproved production stores block deployment.

This plan does not infer a production environment or provider from Docker development fixtures. Operations and
Security must supply the actual deployment/store inventory, provider-native read-only evidence mechanisms, key/access/
network choices, and release identity before implementation. The current `deploy.yml` stack name alone is not proof of
where PostgreSQL, Redis, or S3 runs or which controls exist.

## Progress

- [ ] (2026-08-30) Obtain the actual deployment plus PostgreSQL/Redis/S3 provider/service/region/owner inventory,
      internal owner/operator evidence, and external plan-10 register mappings.
- [ ] (2026-08-30) Obtain Security/privacy-counsel decisions for at-rest or equivalent controls, key ownership/
      rotation, service/admin access, network boundary, audit coverage, evidence sources, and review cadence.
- [ ] (2026-08-30) Add the provider-neutral active-store manifest, strict validator/tests, package command, validation
      CI, and deployment prerequisite.
- [ ] (2026-08-30) Apply and independently verify each actual provider-native control through its approved workflow.
- [ ] (2026-08-30) Publish operating/review/change procedures and reconcile plans 06, 10, and 11 boundaries.
- [ ] (2026-08-30) Complete live read-only evidence, fail-closed release, security/legal/operations, prose, formatting,
      and whitespace validation.

## Plan dependencies

- `privacy-compliance/06`
- `privacy-compliance/10`
- `privacy-compliance/11`

## Surprises & Discoveries

- `.github/workflows/deploy.yml` invokes a shared Docker Swarm deployment for stack `email`, but it does not identify
  the active data store providers, services, regions, accounts/projects, network policies, keys, or access groups.

## Decision Log

- Decision: Keep the manifest and validator provider-neutral until Operations supplies the actual services and stable
  deployment/store IDs. Do not infer production from local PostgreSQL, Redis, Garage, Docker volumes, or workflow name.
  Rationale: Invented providers or environments create false assurance and unusable policy commands.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require an explicit safeguard record for each active PostgreSQL, Redis, and S3 store used by each release
  target. A production target cannot use `none`, `unknown`, or omitted records.
  Rationale: Silent omission is indistinguishable from an unprotected live store.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Prefer provider-enforced at-rest encryption. Permit an equivalent risk control only when Security and
  privacy counsel approve its exact threat model, compensating controls, owner, expiry, and remediation/exit condition.
  Rationale: “Encrypted” cannot be claimed when the actual provider lacks the control, while an approved equivalent
  must be explicit and temporary/reviewable rather than a vague exception.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Validate encryption for each data store independently from plan 06. Plan 06 owns authenticated client
  transport and explicit per-write S3 SSE-KMS/`no-store`; this plan owns the live service, volume/persistence/bucket,
  key-policy, access, network, and audit configuration.
  Rationale: TLS and one object's SSE request do not prove PostgreSQL/Redis persistence or the entire active S3 service
  is protected at rest.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep managed processor-copy log sinks and backup sets in plan 11. This plan covers active serving
  data stores and references plan-11 IDs only for an independently scoped customer-verification audit-log destination
  or backup boundary; controller/security/legal evidence follows plans 12 and 26 instead.
  Rationale: Live data access/network/key controls, retention of logs and backups, and restore evidence are distinct
  provider responsibilities and release checks.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Require separate least-privilege identities for the application service and human administration, deny
  broad/default/public access, and record current access-review evidence for both.
  Rationale: Storage encryption does not prevent misuse by an excessively privileged principal or public network path.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Record key owner, key class, rotation/enforced-rotation mechanism, rotation/review time, usage policy, and
  break-glass boundary. Provider-managed keys are acceptable only when Security explicitly approves that actual store.
  Rationale: A KMS identifier alone does not establish who controls use, rotation, or administrative access.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Run offline schema/freshness checks in `validate.yml` and a target-specific live-evidence prerequisite in
  `deploy.yml` before the shared deployment job. A stale/failed/unknown check prevents deployment.
  Rationale: Review evidence that cannot block the release path is advisory rather than an enforced control.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store only stable provider resource/policy/evidence references and sanitized observed values in Git or CI
  artifacts. Credentials, connection strings, key IDs where sensitive, policy bodies, and access membership remain in
  approved systems.
  Rationale: The evidence mechanism must not create another secret or personal-data exposure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Model each store's operator as exactly `internal` or `external`. An internal store requires an accountable
  internal owner role and evidence that the named internal operator owns the control plane, and it must not carry a
  plan-10 recipient/subprocessor ID. An external store requires the exact current approved plan-10 recipient/vendor ID.
  Rationale: Treating an internally operated store as its own vendor invents a recipient, while omitting the vendor for
  an externally operated store breaks the contract, transfer, and subprocessor lineage.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 06 makes application clients fail closed in production for insecure PostgreSQL, Redis, and S3 transport and makes
customer-object writes state exact S3 SSE-KMS/`no-store` intent through `CustomerObjectWriteSecurity`. It does not
configure or attest the server's disk, database volume, Redis persistence, bucket default, key policy, `IAM`, firewall,
private endpoint, administrative audit, or access review.

Plan 11 inventories externally managed policy boundaries containing processor-side customer-verification copies,
enforces their maximum lifecycle/access rules, and supplies their backup IDs to restore quarantine. It deliberately
does not cover controller/security/legal evidence or current online PostgreSQL/Redis/S3 services. Plans 12 and 26 own
controller-category lifecycle and assessment decisions. Plan 10 supplies approved subprocessors/recipients, regions,
transfers, and vendor evidence to which every externally operated active store must map. Internally operated stores
instead use accountable internal owner/operator evidence and are forbidden from inventing a self-recipient row.

The repository's local Compose stack uses disposable PostgreSQL, Redis, and Garage fixtures. The production build and
scheduled shared Swarm deploy workflow do not reveal the actual data store topology or provider control plane. Therefore,
the implementation cannot name an AWS, Azure, `GCP`, self-hosted, or other mechanism until Operations supplies the actual
inventory and Security supplies approved evidence commands.

“Active data store” means a service the running application reads or writes in normal operation, not an external log
sink or backup generation. “Equivalent risk control” means a documented store-specific control set approved against a
named risk because native at-rest encryption is unavailable; it is not an `encryption=false` waiver. “Fresh evidence”
means provider-observed configuration and access review before their explicit expiry, not a copied screenshot or
evergreen attestation.

## Scope and Non-Goals

Create `config/privacy/active-data-stores.yaml`, strict schema/parser/checker and focused tests under `scripts/privacy/`,
`privacy:active-data-store-check`, validation-CI integration, a fail-closed prerequisite in `.github/workflows/deploy.yml`,
and `docs/privacy/active-datastore-controls.md`. Apply actual approved provider policies through their owned workflow and
record only non-secret evidence references and sanitized observations.

Inventory each release target and its active PostgreSQL, Redis, and S3 store. Cover operator kind, internal owner/operator
evidence or external provider/register mapping as applicable, region, data classes, service identity, and human/admin/
break-glass access. Also cover the network ingress/egress boundary, at-rest or equivalent control, key ownership/use/
rotation, audit coverage/destination, access review, configuration evidence, independent review, expiry, and blocked
status.

Do not invent a provider, environment, account/project, key, policy, private endpoint, audit service, evidence command,
or production fact. Do not create a cloud account or buy a service. Do not rotate/delete a real key without its approved
change, move production data, alter application schemas, implement backup/log retention, or weaken plan-06 transport/
per-write security. Do not add migrations, perform production recovery, or claim certification/compliance.

## Plan of Work

Operations first supplies a signed/approved inventory of actual release target IDs and every active PostgreSQL, Redis,
and S3 provider resource. For each store, record `operatorKind: internal | external`. Reconcile an internal store to its
accountable internal owner role and current operator/control-plane evidence, with no plan-10 recipient ID. Reconcile an
external store to the exact approved plan-10 recipient/vendor/register ID, region, and transfer record. For both kinds,
reconcile owning team, data categories, application connection identity, administrative identities/groups, break-glass
role, network paths, persistence mode, encryption/key configuration, audit facilities, backup/log links, and provider-
native read-only inspection commands or APIs. Record unknown facts as blocking; do not omit them.

Security and privacy counsel decide one at-rest control mode per store:

- `provider_enforced_encryption`, with provider control/policy, scope, key class/owner, denial of unencrypted resources
  where applicable, and current verification; or
- `approved_equivalent`, with named risk/threat model, compensating controls, approval evidence, owner, review expiry,
  and remediation/exit condition.

An equivalent control cannot be selected by an engineer merely because provider evidence is hard to obtain. S3 must
also prove that bucket/service policy does not permit writes that bypass the plan-06 per-write SSE-KMS contract.
PostgreSQL and Redis must cover the actual persistence/volume/snapshot behavior used by the active service, not only an
application-level field.

Create `config/privacy/active-data-stores.yaml` with schema/revision, deployment targets, and exact store records. Each
record contains a stable deployment/store ID, data store kind, operator kind, provider/service/resource reference,
environment classification, region, control owner, operator-kind-specific evidence, data categories, and at-rest mode/
control evidence. It also contains equivalent-risk approval when applicable, key class/owner/rotation mechanism/review,
application principal/policy evidence, administrative-access policy evidence, break-glass policy evidence, network boundary evidence, and audit
coverage/destination. The final fields are the last observed time, independent reviewer, evidence expiry, and status
`active | blocked | decommissioned`. An internal
variant contains an internal owner-role ID and internal operator evidence ID and forbids a recipient-register ID. An
external variant contains the exact plan-10 recipient-register ID. These fields contain stable references, not secrets or raw
policy bodies.

Add a Zod parser plus `privacy:active-data-store-check`. Offline validation rejects unknown keys, duplicates,
placeholders, secrets, missing data store/operator kinds, and production `none`. It rejects an internal store without
accountable internal owner/operator evidence or with a recipient ID. It rejects an external store without an exact
current plan-10 recipient/vendor ID, with an unapproved external recipient ID, or with a region mismatch. It also rejects
unencrypted state without current equivalent approval, missing key ownership/rotation, application admin rights, and
broad/default/public network access. Finally, it rejects missing admin/break-glass review, missing audit coverage without
an approved exception, stale configuration/access/key/evidence review, and an active release target containing a blocked
store. It prints stable target/store/reason IDs only.

Implement provider evidence adapters only for the actual providers supplied by Operations. Each adapter runs the exact
approved read-only command/API, maps observed values to the provider-neutral record, and redacts secrets/resource
details according to Security review. Compare observed encryption, key policy/rotation, service/admin access, network,
audit, and region with the manifest. An unavailable/unauthorized/ambiguous API is failure, not evidence of safety.
Tests use captured sanitized provider fixtures approved for source control; no live credential enters a test fixture.

Add the offline schema/freshness command to `.github/workflows/validate.yml`. Refactor
`.github/workflows/deploy.yml` to add a prerequisite job before its current reusable `swarm-deploy.yml` job. The
prerequisite resolves the actual target ID supplied by Operations, obtains short-lived read-only evidence through the
approved secret/identity mechanism, and runs:

    corepack pnpm privacy:active-data-store-check -- --target=<approved-target-id> --live

The reusable deploy job declares `needs` on that prerequisite and cannot run after failure, unknown target, stale
evidence, or blocked store. The actual target ID, identity method, and provider commands must be recorded in this plan
before implementation; no placeholder may merge.

For every active store, apply any needed provider configuration only through the owning infrastructure workflow and
approved change. Independently rerun the read-only evidence adapter. Verify service identity cannot administer, list
unneeded resources, bypass key policy, or cross the approved network boundary; verify ordinary admins and break-glass
roles are distinct and reviewed. Verify customer-verification audit records reach the plan-11-approved processor-copy
sink when applicable without copying their contents into artifacts; do not route controller/security/legal evidence by
borrowing that store's 30-day rule.

Write the operating document with inventory ownership, provider/resource onboarding, evidence refresh, access/key/
network review, break-glass review, equivalent-control expiry/remediation, provider/region/key change, incident handoff,
blocked-release escalation, decommissioning, and drift response. Reconcile plan-01 and plan-10 data maps plus plan-11 log
and backup references without claiming those plans attest active stores.

## Interfaces and Dependencies

The provider-neutral record is equivalent to:

    interface ActiveDataStoreBase {
        id: string
        deploymentTargetId: string
        kind: 'postgresql' | 'redis' | 's3'
        operatorKind: 'internal' | 'external'
        provider: string
        service: string
        resourceReference: string
        region: string
        controlOwnerRoleId: string
        dataCategories: string[]
        atRestControl:
            | { mode: 'provider_enforced_encryption'; evidenceId: string }
            | {
                  mode: 'approved_equivalent'
                  riskApprovalId: string
                  controlsEvidenceId: string
                  expiresAt: string
                  remediationId: string
              }
        keyControl: {
            class: 'customer_managed' | 'provider_managed'
            owner: string
            rotationMechanism: string
            evidenceId: string
        }
        applicationAccessEvidenceId: string
        adminAccessEvidenceId: string
        breakGlassEvidenceId: string
        networkBoundaryEvidenceId: string
        auditEvidenceId: string
        observedAt: string
        evidenceExpiresAt: string
        status: 'active' | 'blocked' | 'decommissioned'
    }

    type ActiveDataStoreRecord = ActiveDataStoreBase &
        (
            | {
                  operatorKind: 'internal'
                  internalOwnerRoleId: string
                  internalOperatorEvidenceId: string
                  recipientRegisterId?: never
              }
            | {
                  operatorKind: 'external'
                  recipientRegisterId: string
                  internalOwnerRoleId?: never
                  internalOperatorEvidenceId?: never
              }
        )

Each actual provider adapter implements a narrow read-only evidence interface selected only after inventory. The
validator uses existing TypeScript, Zod, YAML, Jest, and CI conventions. Plan 06 remains authoritative for application
transport and per-write `CustomerObjectWriteSecurity`. Plan 10 remains authoritative for external vendor/recipient/
region/transfer approval, and the manifest's internal variant covers accountable internal operator evidence without a
recipient ID. Plan 11 owns managed processor-copy logs/backups and their evidence IDs. Plans 12/26 own controller/
security/legal category lifecycles and assessment references.

## Acceptance Criteria

- Operations supplies an approved complete release-target and active PostgreSQL/Redis/S3 inventory; no provider,
  environment, region, resource, or evidence mechanism is inferred from local fixtures or workflow naming.
- Every active store has exactly one operator kind. An internal store has a current accountable internal owner role and
  operator/control-plane evidence and no plan-10 recipient ID. An external store maps to one exact approved current
  plan-10 recipient/vendor row and region. Missing, forbidden, unknown, or mismatched operator evidence blocks validation
  and release.
- Every active store proves provider-enforced at-rest encryption or a current Security/privacy-counsel-approved
  equivalent with named risk, compensating controls, owner, expiry, and remediation/exit condition.
- S3 active-store evidence covers bucket/service enforcement and proves writes cannot bypass the exact per-write SSE-KMS
  requirement specified by plan 06; PostgreSQL/Redis evidence covers actual persistence/volumes used by the service.
- Application service identities have only required data operations and no administration/key/policy authority. Human
  admin and break-glass access is separate, least-privilege, reviewed, and current.
- Every active store has a private approved network boundary, explicit key class/owner/use/rotation review, and
  current audit coverage or a separately approved time-bounded exception.
- The checker rejects malformed, missing, duplicate, pending, secret-bearing, operator-misclassified, unapproved,
  excessively privileged, public, unencrypted/unapproved-equivalent, stale, or blocked target/store records and emits safe IDs
  only.
- Provider adapters compare live read-only observed state with the manifest. API, permission, or mapper ambiguity causes
  a closed failure and cannot refresh evidence.
- Validation CI runs offline schema/freshness checks, and the current deploy workflow cannot invoke shared Swarm
  deployment unless the exact target's live check succeeds.
- Plan 06 remains scoped to client transport/per-write object security and plan 11 to managed processor-copy logs/
  backups; neither is represented as active-store at-rest/access/network evidence or as controller/security/legal
  lifecycle policy.
- No production store is created, deleted, migrated, rotated, or reconfigured outside its approved infrastructure
  change; no secret/raw policy/data or false compliance claim is committed.
- Focused parser/provider-fixture, live read-only, CI/release-gate, documentation, formatting, and whitespace validation
  passes with current security/legal/operations approval.

## Validation

After Operations records the actual target/provider adapters and exact commands in this living plan, run the repository
checks:

    corepack pnpm privacy:active-data-store-check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/active-data-stores.spec.ts --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/active-data-store-providers --runInBand

Run every recorded provider-native read-only command against each actual active store and require observed at-rest,
key, service/admin/break-glass access, network, audit, region, and resource identity to match the manifest. Then run the
same target command used by the deployment prerequisite:

    corepack pnpm privacy:active-data-store-check -- --target=<approved-target-id> --live

The placeholder above must be replaced in this plan with the actual Operations-supplied target ID before
implementation; the command and credential mechanism must be exact and reproducible. Exercise sanitized internal and
external provider fixtures, including a valid internal owner/operator record, a valid external plan-10 mapping, a
forbidden internal recipient ID, missing/stale internal operator evidence, and a missing or unknown external recipient ID.
Also exercise each other failure reason and a temporary approved test policy where provider tooling supports it. Do not
mutate or probe customer data.

Verify workflow behavior with a test branch or approved dry-run. Valid current evidence permits the deploy prerequisite.
A stale review, provider API denial, changed network/key/access policy, blocked store, missing kind, or unknown target
prevents the reusable deploy job. Do not run a real production deployment solely to test the gate.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- docs/privacy/active-datastore-controls.md docs/privacy/email-verification-processing-contract.md docs/privacy/subprocessor-register.md docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/23-enforce-active-datastore-safeguards.md
    corepack pnpm exec prettier --check config/privacy/active-data-stores.yaml docs/privacy/active-datastore-controls.md docs/privacy/email-verification-processing-contract.md docs/privacy/subprocessor-register.md docs/privacy/managed-log-and-backup-controls.md .agents/plans/privacy-compliance/23-enforce-active-datastore-safeguards.md .github/workflows/validate.yml .github/workflows/deploy.yml
    git diff --check

Bruno is not applicable because this plan configures provider controls, evidence validation, and release gating without
changing HTTP behavior. Provider-native validation uses the exact approved read-only commands supplied before
implementation.

## Idempotence and Recovery

Offline checks and provider reads do not mutate data and are deterministic for one observed state. Applying an approved
provider policy through its owner converges on the declared control; rerunning the evidence adapter refreshes the same
stable store record/review instead of creating another active identity.

If evidence is unavailable, stale, mismatched, or ambiguous, leave validation/deployment blocked and escalate to the
named owner. Do not recover by selecting `none`, extending expiry without review, hiding a store, changing an observed
value, using an admin credential in CI, disabling a provider policy, or bypassing the deployment prerequisite.

If a provider change partially applies, follow its approved rollback/change procedure and keep release blocked until
independent read-only evidence matches either the approved old or new state. Reverting repository files does not revert
a provider policy; the infrastructure owner must perform that external action. Never delete a data store, key, volume,
bucket, policy, or production data as plan recovery.

## Artifacts and Notes

Record stable target/store/provider/operator-kind IDs and applicable external register IDs or internal owner/operator
evidence IDs. Record the manifest revision, sanitized observed control values, evidence/access/key/network review IDs and
expiry, and approved equivalent-risk/remediation IDs. Also record provider-adapter/checker totals and the release-gate
dry-run result. Never record connection strings, credentials, key material/sensitive key IDs, raw `IAM` or network policies, access membership,
audit contents, customer data, private contracts, or legal advice.

## Plan readiness

Ready after Operations supplies the actual release-target and PostgreSQL/Redis/S3 inventory and classifies every store's
operator. Operations must also supply internal owner/operator evidence or the exact external plan-10 recipient/vendor
mapping, plus exact read-only evidence commands and credential mechanisms. Security and privacy counsel must approve
each at-rest or equivalent, key, access, network, audit, review, and release-blocking control.
