# Define the Email-Verification Processing and Lifecycle Contract

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give engineers, operators, reviewers, and legal approvers one repository-owned contract that explains
email-verification data processing. After this change, a reader can follow customer-supplied addresses and derived
verification inferences through PostgreSQL, BullMQ/Redis, S3, application and managed logs, SMTP and HTTP recipients,
and externally owned backups. The reader can identify whether the business acts as processor/service provider or
controller for each purpose. The same contract shows fixed engineering retention defaults and rights routing and
distinguishes implemented controls from pending legal/DPO, contract, vendor, transfer, infrastructure, controller-data,
and incident work.

The observable outcome is `docs/privacy/email-verification-processing-contract.md`, linked from the repository and
email-verification README files, whose inventory, approval table, and implementation map can be checked against current
source and used by plans `privacy-compliance/02` through `privacy-compliance/33`. Publishing this engineering contract
does not execute a customer agreement, publish a privacy notice, approve a transfer, or authorize a compliance claim.

## Progress

- [ ] (2026-08-30) Inventory every customer address, verification inference, job, artifact, log, recipient, and transfer flow in the current repository.
- [ ] (2026-08-30) Write the processing contract with fixed roles, purposes, retention defaults, rights routing, ownership, approval status, and follow-up mapping.
- [ ] (2026-08-30) Link and summarize the contract from the repository and email-verification README files without claiming legal approval or contract assent.
- [ ] (2026-08-30) Run plan, architecture, prose, formatting, and whitespace validation and record sanitized evidence.

## Plan dependencies

- `module-boundaries/08`
- `module-architecture/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Treat customer-supplied addresses and their verification inferences under a strict processor/service-
  provider posture, limited to documented instructions and the benefit of the supplying customer.
  Rationale: Cross-customer reuse, sale, sharing, or independent enrichment would contradict the intended service role
  and require a different legal, contractual, and product decision.
  Date/Author: 2026-08-30, project planning.
- Decision: Treat LeadEmailFinder as controller for its own account identity, authentication, billing, fraud-
  prevention, security, and legal-compliance records, with those purposes separated from customer verification data.
  Rationale: The business determines why and how those operational records are processed even when a customer directs
  the verification workload.
  Date/Author: 2026-08-30, project planning.
- Decision: Publish fixed initial engineering retention defaults. Retain email and verification records for 30 days,
  SMTP probe cache records for 24 hours, and terminal jobs and downloadable results for 7 days. Delete successful or
  invalid source uploads immediately and orphan uploads within 24 hours. Retain externally managed processor-side
  copies of customer-verification logs/backups for no more than 30 days. Do not apply that managed-copy maximum to controller account,
  authentication, billing, fraud, security, incident, audit, legal-hold, or statutory evidence.
  Rationale: Downstream enforcement plans require exact testable clocks. A later counsel-approved policy revision must
  update this contract and code explicitly rather than leave placeholders or silent divergence.
  Date/Author: 2026-08-30, project planning.
- Decision: Define verification only as a deliverability signal and assign no commercial-message sender responsibility
  to this repository.
  Rationale: Verification does not establish consent, lawful basis, marketing eligibility, or permission, and the
  repository does not compose or dispatch commercial email or own final suppression.
  Date/Author: 2026-08-30, project planning.
- Decision: Record legal and DPO approval as pending while this engineering inventory proceeds.
  Rationale: The inventory and technical contract are independently implementable; approval remains a release gate
  before public claims and does not make repository documentation a signed contract or live notice.
  Date/Author: 2026-08-30, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/email-verification/README.md` describes synchronous, asynchronous, and CSV batch APIs, the
`email_verifications`, `emails`, `domains`, and `smtp_verifications` tables, BullMQ workflows, and S3 upload/result key
conventions. It does not define data-protection roles, permitted purposes, recipient/transfer ownership, fixed expiry,
rights handling, customer contract terms, managed-store controls, or approval requirements. The repository currently
has no central privacy-processing contract.

The inventory must trace source behavior rather than infer it from README prose. Address-level database fields live
under `src/libs/modules/email-verification/src/{email,sync-email-verification,email-verifier/smtp}/`. Async and batch job
data carries addresses, organization identifiers, credential identifiers, batch IDs, states, and results through BullMQ/Redis.
Multipart CSV uploads and generated result CSVs use S3-compatible storage below
`organizations/<organizationId>/`. SMTP verification discloses target addresses to remote mail servers and leased
proxy infrastructure. Optional account-discovery adapters can disclose them to external HTTP providers. Errors can
reach application/managed logs, while database, Redis, object-storage, identity/payment, logging, and backup operators
may be recipients or subprocessors requiring a verified owner and contract status.

“Processor/service-provider posture” is the engineering restriction applied to customer-supplied verification data;
it is not a unilateral legal classification or substitute for plan-10 terms. “Controller role” describes business-
selected purposes for account/auth/billing/fraud/security/compliance records; plan 12 separately approves those fields,
purposes, notices, retention, and rights. “Approval status” separates engineering, security/vendor, commercial,
Operations, legal, and DPO review without representing an unchecked item as complete.

## Scope and Non-Goals

Create `docs/privacy/email-verification-processing-contract.md`. Update `README.md` with a concise privacy status and
link, and update `src/libs/modules/email-verification/README.md` with the module role/lifecycle summary and canonical
link. Keep detailed policy in the contract instead of duplicating it across README files.

The contract documents the repository-visible data inventory, role-by-purpose boundary, permitted and prohibited
purposes, sources, storage, recipient categories, transfer ownership, fixed retention defaults, and rights routing. It
also documents security, incident, vendor, engineering, operations, legal, DPO, and commercial ownership; the
marketing/suppression boundary; approval state; and a follow-up-plan owner for every documentary control.

This pull request does not change application code, configuration, HTTP/queue contracts, providers, schema, S3, logs,
SMTP, authentication, authorization, billing, retention enforcement, rights execution, managed infrastructure, or
incident systems. It does not add a migration, backfill, production rollout, deletion, customer agreement/assent,
subprocessor approval, transfer mechanism, privacy notice, controller legal basis, legal conclusion, or public
compliance claim.

Plans 02–08 own customer-verification runtime safeguards through the stable subject/write barrier. Plans 09, 24, and 25
form the conditional California data-broker/DROP branch after the disposition workflow from plan 20. Plan 10 owns binding
customer terms, assent evidence, and subprocessor/transfer governance. Plan 11 owns expiry and access evidence only for
managed processor-side customer-verification copies; plan 15 owns restore quarantine and release orchestration, subject
to the plan-33 reconciliation fence. Plan 12 owns approved controller purposes, legal bases, notices, retention, and
rights; plans 13, 16–18, and 27–30 own their runtime enforcement, owner adapters, and lifecycle, while plan 19 owns
notice publication. Plan 14 owns incident contacts,
evidence, assessments, notices, clocks, and exercises. Plan 20 owns organization-submitted verification dispositions,
plan 21 owns access, plan 22 owns contract response/support clocks and activation, and plan 31 owns correction. Plan 23
owns actual active PostgreSQL/Redis/S3 at-rest, key, access, network, audit, and release evidence. Plan 26 owns Article
30 records and assessment/audit applicability. Plan 32 owns controller legal holds. Plan 33 owns the non-restored
privacy-control authority/journal, backup-captured high-water marks, and restore reconciliation fence.

## Plan of Work

Inventory current flows from HTTP DTOs and multipart upload through orchestration, persistence, queue payloads/results,
CSV processing, S3 keys/content, SMTP and optional account-discovery recipients, error handling, and documented
container services. For each item, record data elements, source, customer organization scope, purpose, store/recipient,
current lifecycle, responsible owner, approval/evidence status, and enforcement follow-up. Include deliverability
inferences, reason/source, MX/target exchange, timestamps, batch relationships, and job state, not only raw addresses.

Create `docs/privacy/email-verification-processing-contract.md` with sections for status/approval, scope/terminology,
role-by-purpose matrix, inventory, end-to-end flows, recipients/transfers, purpose limitation/prohibited reuse,
retention, rights routing, security/incident responsibilities, vendor/transfer governance, marketing/suppression,
implementation-plan mapping, and revision history. Distinguish infrastructure working on behalf of LeadEmailFinder,
remote mail servers, optional providers, and customer-directed recipients. Unknown vendors, contracts, regions,
safeguards, or approvals stay visibly pending.

Record these fixed defaults in one normative retention table:

- Email and verification records expire 30 days after the latest verification purpose is fulfilled;
- SMTP probe cache records expire 24 hours after the probe;
- Terminal async, batch, and child jobs plus downloadable batch results expire 7 days after terminal completion;
- Successful source uploads delete immediately after durable processing no longer needs them;
- Invalid source uploads delete immediately after rejection or failed validation;
- Orphaned or abandoned source uploads delete no later than 24 hours after upload;
- Externally managed logs that contain processor-side customer-verification copies remain for no longer than 30 days.
  They require the PII-safe content control from plan 03 plus plan-11 sink evidence. Controller, security, incident,
  audit, legal-hold, and statutory evidence instead follows the exact plan-12/plan-26 decision; and
- Externally managed backups containing processor-side customer-verification copies expire no later than 30 days and
  deny ordinary application access. They stay quarantined after restore until the plan-15 gate and plan-33 restore
  reconciliation fence are satisfied and every snapshotted reconciler and authority consumer reaches its exact target.
  The required set includes plan-07 age retention and the plan-18/20/21/22/31/32 families once their corresponding
  controls are enabled. A mixed store requires an independently enforceable processor-copy boundary; this maximum does
  not shorten an approved controller/security/legal lifecycle.

Describe rights intake as routing rather than inventing one unauthenticated endpoint. Plan 08 supplies only the stable
subject/write gate. Authenticated customer-controller instructions for verification data route to plan 20 for
destructive/restrictive dispositions, plan 21 for access, plan 22 for contract response/support clocks and activation,
and plan 31 for correction; conditional DROP intake routes to plan 09. Verified individuals' requests for
LeadEmailFinder controller data route to the plan-12 contract and plan-13 workflow. The contract records
identity/organization checks, correction/access/deletion/restriction/objection mapping, legal exceptions, restored-data
handling, appeals/escalation, and truthful incomplete/retained states without merging the two roles.

Create an explicit follow-up table for plans 02–33 with control, owner, dependency, release gate, and evidence. Contract
and transfer sections point to plan 10 without claiming an agreement exists. Managed processor-copy logs/backups point
to plan 11, while controller notices/data point to plans 12, 13, 16–19, and 27–30. Incident operations point to plan 14,
restore quarantine to plan 15, and active serving stores to plan 23. Verification dispositions point to plan 20, access
to plan 21, response/support clocks and activation to plan 22, and correction to plan 31. Conditional California data-
broker/DROP governance points to plans 09, 24, and 25. Accountability/assessment applicability points to plan 26,
controller legal holds to plan 32, and the non-restored privacy-control authority/journal, backup-captured high-water
marks, and restore reconciliation fence to plan 33. Finally, link the contract from both README files and run source,
plan, prose, architecture, formatting, and dry-run metadata checks without writing project state.

## Interfaces and Dependencies

The Markdown contract is the engineering source of truth for privacy-related email-verification roles, purposes, data
categories, recipients, lifecycle defaults, control owners, approval status, and plan mapping. It introduces no runtime
API, TypeScript interface, configuration variable, dependency, persistence field, queue option, or provider request.

`module-boundaries/08` supplies the current module location and public boundary. `module-architecture/01` supplies the
executable architecture/documentation contract. Plans `privacy-compliance/02` through `privacy-compliance/33` consume
the relevant stable rows and must update the contract when implementation evidence or an approved policy changes.
Runtime code must not silently diverge.

Plan 10 is the only road map item that establishes counsel-approved customer terms/assent and subprocessor/transfer
governance. Plan 11 validates managed processor-copy sinks/backups; plan 15 owns restore quarantine and release
orchestration, while plan 33 owns the mandatory restore reconciliation fence. Plan 12 is the normative controller-data
contract, and plans 13, 16–19, and 27–30 enforce it. Plan 14 owns incident operations, while plan 20 owns verification
dispositions, plan 21 owns access, plan 22 owns response/support clocks and activation, and plan 31 owns correction.
Plan 23 validates active serving-store controls. Plans 09, 24, and 25 own the conditional California data-broker/DROP
branch, and plan 26 owns accountability/assessment applicability. Plan 32 owns controller legal holds. Plan 33 owns the
non-restored privacy-control authority/journal, backup-captured high-water marks, and restore reconciliation fence.
Legal/DPO approval remains pending here and required before an implemented-program compliance claim.

## Acceptance Criteria

- The canonical contract exists and is linked from root and email-verification README files without duplication or
  contradiction.
- The inventory covers raw addresses, CSV content, verification inferences, organization/credential IDs, PostgreSQL,
  BullMQ/Redis, S3, logs, SMTP/proxy, optional providers, infrastructure vendors, managed sinks/backups, and mixed-role
  account/billing/security references.
- The role matrix states the strict customer-data processor/service-provider posture, the separate controller role for
  account/auth/billing/fraud/security/compliance, and an owner for every mixed/exceptional purpose.
- The contract prohibits cross-tenant reuse, sale/sharing for an independent purpose, and treating verification as
  consent, lawful basis, marketing eligibility, or permission to contact.
- The retention table states exactly 30 days for email/verification, 24 hours for SMTP cache, and 7 days for terminal
  jobs and results. It requires immediate deletion for successful/invalid uploads and deletion within 24 hours for
  orphans. Its 30-day maximum applies only to managed processor-side customer-verification copies with plan-11
  access/expiry, plan-15 quarantine, and plan-33 reconciliation-fence controls; it does not override controller/
  security/incident/audit/legal-hold/statutory lifecycles.
- Recipient/transfer rows distinguish remote SMTP servers, proxies, optional providers, infrastructure/subprocessors,
  independent/customer-directed recipients, and unknown pending facts without invented approval.
- Rights routing distinguishes plan-08 write safety and authenticated customer instructions for dispositions/plan 20,
  access/plan 21, response/support clocks and activation/plan 22, and correction/plan 31. It separately distinguishes
  conditional DROP/plan 09 and verified individual controller-data requests/plans 12–13, including organization/
  identity checks, retries, exceptions, restored data, and appeals.
- The plan map assigns customer agreements/transfers to plan 10 and managed processor-copy logs/backups to plan 11. It
  assigns controller notices/data to plans 12, 13, 16–19, and 27–30; incident operations to plan 14; and restore
  quarantine to plan 15. It assigns verification dispositions to plan 20, access to plan 21, response/support clocks
  and activation to plan 22, correction to plan 31, evidence for active data stores to plan 23, and the conditional
  California branch to plans 09/24/25. Accountability/assessment applicability maps to plan 26, controller legal holds
  to plan 32, and the non-restored privacy-control authority/journal, backup-captured high-water marks, and restore
  reconciliation fence to plan 33. This plan claims none are complete.
- The marketing section states that verification is only a deliverability signal and this repository does not send
  commercial messages or own sender content, unsubscribe, postal-address, or final-suppression duties.
- No runtime source/configuration/dependency/lockfile/schema/provider/endpoint/queue/S3/Bruno behavior changes, and
  parsing, dependency, architecture, prose, formatting, whitespace, and dry-run checks pass with sanitized evidence.

## Validation

Run the plan parser/dependency graph and architecture gate:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm architecture:check

Run prose, formatting, whitespace, and read-only sync validation:

    corepack pnpm docs:lint -- docs/privacy/email-verification-processing-contract.md README.md src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/01-define-processing-and-lifecycle-contract.md
    corepack pnpm exec prettier --check docs/privacy/email-verification-processing-contract.md README.md src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/01-define-processing-and-lifecycle-contract.md
    git diff --check
    PLANS_DRY_RUN=true corepack pnpm plans:sync

Confirm `privacy-compliance/01` renders two dependencies, all progress items, and `Ready to implement`. Inspect the final
diff/status to prove no application, configuration, lockfile, migration, Bruno, or generated customer-data file changed.

Bruno is not applicable because this plan changes documentation only, not externally observable HTTP behavior,
authorization, validation, integration wiring, or an existing Bruno workflow.

## Idempotence and Recovery

The inventory/documentation is deterministic and safe to revise or lint repeatedly. If source inspection disproves an
entry, correct it and record the fact in `Surprises & Discoveries`; do not preserve known-false text. Stable inventory
and plan IDs make a repeated dry run converge without project writes.

If interrupted, resume from the Markdown diff and cited source paths. Reverting this pull request removes the contract
and links only; it does not cancel an external agreement/notice, delete data, change a vendor, or undo infrastructure.
Preserve unrelated work and do not reset shared containers or disposable data for this docs-only plan.

## Artifacts and Notes

Record inventory row counts, reviewed paths, changed documentation, parser/dependency/architecture results, exact
Harper command/result, formatting/whitespace results, dry-run summary, follow-up mapping, and pending/approved roles.
Never record real addresses, CSV rows, queue payloads, object keys, tokens, credentials, customer/vendor contracts,
provider responses, or private legal advice.

## Plan readiness

Ready to implement
