# Add Managed External-Provider Privacy Assistance

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect controller privacy to only the real external providers approved by plan 10, with authoritative retry and
truthful pending/manual outcomes. After this change, local financial/provider handoffs and managed controller-data
stores can request access, correction, restriction, deletion, or lifecycle assistance without declaring success when a
provider does not respond or rewriting immutable backup media. The complete workflow remains disabled until plan 18.

## Progress

- [ ] (2026-08-30) Freeze the exact approved provider capabilities, identifiers, idempotency, evidence, and handoff
      contracts from plans 10, 11, 12, 17, and 29.
- [ ] (2026-08-30) Run the binding provider-family and PR-size classifier; replace this plan with one ExecPlan per
      independent family before coding when more than one family or an XL projection exists.
- [ ] (2026-08-30) Add the provider-neutral owner facet and only concrete approved provider adapters.
- [ ] (2026-08-30) Implement durable encrypted resumption, authoritative outcome checks, and manual escalation.
- [ ] (2026-08-30) Add bounded provider lifecycle/retention enumeration/application for plan 18.
- [ ] (2026-08-30) Validate no-response/unknown/retry behavior, hold handoff, immutable-store boundaries, and disabled
      registry.

## Plan dependencies

- `privacy-compliance/10`
- `privacy-compliance/11`
- `privacy-compliance/13`
- `privacy-compliance/17`
- `privacy-compliance/29`
- `privacy-compliance/32`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use one registry descriptor, `managed-provider.controller-data.v1`, with provider-specific adapters behind a
  provider-neutral owner facet. Register no provider absent an exact active plan-10 capability record.
  Rationale: The controller registry needs one auditable owner while SDKs and wire semantics remain isolated and
  default-deny.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Depend on plan 17 for the local payment-reference handoff and on plan 29 only for an approved external
  audit/security-store handoff. Consume plan 32 directly for current hold decisions and never rediscover any value
  through broad provider search.
  Rationale: These are necessary ownership handoffs, not permission to read financial, audit, or hold repositories.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Each of these states remains `pending_provider` or `manual_action_required` and blocks terminal completion:
  no provider response, a result that cannot be queried, a credential outage, or a contradictory read.
  Rationale: Absence of a response is not proof of deletion, and unsafe replay of a non-idempotent mutation can cause
  duplicate or wrong-subject effects.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Adapters for managed logs and backups may report approved access/assistance/expiry evidence but never read
  or rewrite immutable backup payloads. The plan-11 30-day cap applies only to processor verification copies;
  controller lifecycle comes from plans 12 and 26.
  Rationale: Provider assistance must respect role-specific policy and immutable-media boundaries.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Add provider `findRetentionDue`/`applyRetention` operations here and leave central scheduling, markers,
  restore replay, and activation to plan 18.
  Rationale: Provider-specific semantics and outcome verification belong in the owning SDK/API adapter.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Before code, partition the approved actual inventory from plan 10 into independent provider capability
  families.
  A family is one provider plus one credential/SDK, subject-reference scheme, idempotency/status protocol, sandbox, and
  lifecycle boundary. If the inventory contains multiple families, replace this plan with exactly one ExecPlan per
  family. If the projected eligible diff is `size/xl`, create those family plans and further decompose an XL family by
  one independently authoritative capability slice before coding.
  Rationale: “Managed providers” is not a reviewable implementation boundary when wire/retry/ownership semantics are
  independent.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: The binding size classifier is non-Markdown additions plus deletions, ignoring only `pnpm-lock.yaml`; new
  files use their full projected length and uncertain moves count as delete plus add. A total of 1,000 or more is
  `size/xl`. Record the per-path/family projection before production edits and verify it with the exact command in
  Validation.
  Rationale: Provider uncertainty cannot defer the one-PR size decision until after implementation.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Every provider mutation and retention operation acquires sorted plan-32 hold guards before local handoff/
  checkpoint locks. It transactionally rechecks the fence/effective decision before committing local checkpoint state,
  renews the guard across bounded remote work, and checks it again before authoritative completion. Lost/unknown holds
  or ambiguous remote state stay pending/manual.
  Rationale: A missing provider response does not prove success, and a newly effective hold must not race remote deletion.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: This adapter-only PR keeps all compositions disabled and adds no Bruno request. Plan 18 owns target-real/
  rest-fake, complete-real, and end-to-end HTTP/Bruno coverage.
  Rationale: The complete registry/lifecycle capability is intentionally absent here.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Keep `CONTROLLER_PRIVACY_ENABLED=false` in committed and disposable real compositions.
  Rationale: Plan 18 is the first PR permitted to enable the complete registry.
  Date/Author: 2026-08-30, privacy plan review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 10 supplies approved controller-provider capabilities, contract/transfer limits, assistance duties, owners, and
evidence references. Plan 11 supplies processor-copy managed-store IDs and flags mixed boundaries without imposing its
duration on controller evidence. Plan 17 provides an opaque local payment/provider handoff, plan 29 may provide an
approved external audit/security-store handoff, and plan 32 provides the opaque hold decision/guard. Provider SDKs
currently live in owning infrastructure such as payments; this adapter must use narrow owner/provider ports rather
than import repositories or broad clients into controller privacy.

## Scope and Non-Goals

Add the provider-neutral facet for one classified family only, its exact approved concrete provider implementation,
disabled bridge registration, encrypted resumption/evidence state, provider lifecycle operations, focused/sandbox
contract tests, and owner/controller README updates.

Do not add or approve a provider, scrape/search by email, bypass a hold, or process customer-verification data under a
controller purpose. Do not rewrite immutable backup payloads, implement other owner data, schedule central retention,
reconcile restores, add migrations, activate the feature, or claim compliance.

## Plan of Work

Start from the approved actual provider inventory in plan 10 and the item mapping in plan 12. Every row must provide the
provider and capability-family ID/version, independent SDK/credential boundary, exact data-item/action support, opaque
subject/reference handoff source, and idempotency semantics. It must also provide the authoritative status/read-after-
write method, retention/expiry behavior, rate/failure handling, executable sandbox/fixture, contract/evidence IDs, and
owner/escalation. A capability that is pending, generic, or incomplete cannot generate a runtime adapter.

Before production edits, partition the rows by the exact family definition in the Decision Log and record the result.
For the proposed files in each family, sum additions plus deletions except `*.md` and `pnpm-lock.yaml`; count new files
at their full projected length and uncertain moves as deletion plus addition. Record per-path/family totals. Multiple families
or any total of 1,000 or more stops this plan and creates one replacement ExecPlan per independent family, with an XL
family split further into independently authoritative capability slices. Only one family below 1,000 may remain here.

Define `ManagedProviderControllerPrivacyOperations` and one family-specific strategy outside the controller-privacy
domain. Inputs contain only a verified opaque plan-17/plan-29 handoff, stable item/action, plan-32 guard reference, and
request/checkpoint ID. Encrypt provider resumption references with the keyring from plan 13; jobs/logs contain request ID
safe provider/family/reason codes only.

Before any remote mutation, sort/acquire plan-32 hold scopes, then acquire local handoff/checkpoint locks in canonical
order; never acquire a hold guard while retaining a local owner lock. Transactionally recheck the guard fence/effective
decision after local checkpoint locking and immediately before committing the outbound attempt. Use provider-native
idempotency when authoritative. Otherwise, perform exact subject/reference-bound read-before, mutation, and read-after
checks. Renew the guard across bounded remote work and revalidate it before accepting authoritative completion. If a mutation may have
occurred but the guard or provider result cannot be queried, stop automatic retry and create a deterministic manual
escalation. “Already absent” succeeds only when the approved lookup proves the exact subject/scope, not from a broad
search or `404` with ambiguous authorization.

For services that manage logs or backups, implement only provider-supported assistance and lifecycle evidence approved by plans
12/26. Never download or scan immutable media through the application. If deletion occurs only by immutable expiry,
return retained/pending with generation/policy evidence and let the marker/reconciler from plan 18 enforce non-resurrection.

Add bounded `findRetentionDue` and `applyRetention` for the one assigned family. Apply uses the same hold-first/local-
second order and rechecks capability version, plan-32 guard fence, opaque provider handoff, contract status, and
current remote state. Unknown/manual work blocks the future plan-18 checkpoint. Register only
`managed-provider.controller-data.v1` for the classified family and prove the exact subset while plan 18 still blocks
activation.

## Interfaces and Dependencies

The owner facet is equivalent to:

    interface ManagedProviderControllerPrivacyOperations {
        execute(input: ManagedProviderPrivacyInput): Promise<ControllerPrivacyOwnerResult>
        resume(input: ManagedProviderResumeInput): Promise<ControllerPrivacyOwnerResult>
        findRetentionDue(input: RetentionQuery): Promise<DuePage>
        applyRetention(input: RetentionItem): Promise<ControllerPrivacyOwnerResult>
    }

The descriptor is exactly `managed-provider.controller-data.v1`. Provider strategies declare exact capability ID/
version and supported item/actions. Controller privacy sees only the owner facet; SDKs, credentials, financial rows,
holds, and managed-store APIs remain in their owner infrastructure.

## Acceptance Criteria

- The plan-10 inventory records every exact required capability-family field. Multiple families or an XL projection
  replaces this plan with one ExecPlan per independent family before code; one retained family totals fewer than 1,000
  non-Markdown, non-lockfile additions plus deletions.
- Every registered provider/item/action/retention rule has one active exact plan-10 capability and plan-12 mapping;
  an unknown, pending, expired, generic, incomplete, or duplicate capability prevents the application from starting.
- Provider inputs come only from opaque plan-17/plan-29 handoffs and cannot search another subject, customer, or
  organization.
- Native idempotency or authoritative read-before/read-after proves success; no response, conflicting state, or an
  outcome that cannot be queried remains pending/manual and blocks completion without unsafe replay.
- Resumption values are encrypted/versioned, jobs/logs contain no raw provider/subject reference, and credentials never
  enter receipts or persistence.
- Managed backup/log assistance never reads or rewrites immutable payloads and never inherits the processor-only 30-day
  cap for controller/security/legal evidence.
- Provider retention is bounded, rechecks holds/capability/remote state, and leaves uncertainty pending.
- Every provider mutation acquires sorted plan-32 guards before local locks, renews/revalidates the fence around remote
  work, and leaves lost/unknown guard or ambiguous provider state pending/manual.
- Registry activation remains blocked only by plan 18 after every owner descriptor exists; this PR does not enable it.
- No unapproved provider, customer-verification reuse, central scheduler, restore, migration, production activation, or
  compliance claim is included.
- Focused, provider-contract, sandbox, hold-race, failure/retry, architecture, full, build, and docs checks pass. Bruno
  is not applicable below HTTP; plan 18 owns hybrid/complete route coverage.

## Validation

Run the exact provider-neutral commands:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- managed-provider-controller-privacy managed-provider-controller-retention --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- managed-provider-controller-privacy.contract.spec.ts --runInBand

Before production edits, record the exact plan-10 family partition plus per-path projected additions/deletions. After
implementation, run this exact binding classifier; 1,000 or more is `size/xl` and the PR must not proceed:

    git diff --numstat -M origin/master...HEAD | awk '$3 !~ /\.md$/ && $3 != "pnpm-lock.yaml" { additions += $1; deletions += $2 } END { print additions + deletions }'

For each concrete provider approved during implementation, add its exact sandbox command to this living plan before
production code for that adapter begins; a provider without an executable authoritative sandbox/fixture remains
unregistered. Cover idempotent success, absence, timeout-before/after mutation, contradictory read, rate limit,
credential outage, active/unknown/lost plan-32 guards, reversed lock-order rejection, capability revocation, expiry-
only backup evidence, retention page boundaries, and exact disabled-registry diagnostics. Bruno is not applicable to
this below-HTTP adapter PR; plan 18 runs target-real/rest-fake and complete-real controller HTTP coverage.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/30-add-managed-provider-privacy-adapter.md
    git diff --check

## Idempotence and Recovery

Request/checkpoint IDs, provider-native keys, authoritative reads, encrypted resumption, and stable retention cursors
make safe retries converge. Unknown state remains pending/manual; never compensate by issuing an opposite provider
mutation without an approved provider protocol.

Disable or remove the registration for a revoked capability and leave affected requests blocked for the named owner. Never delete broad
provider data, download backup media, clear a hold, expose credentials, or mark an ambiguous operation complete.

## Artifacts and Notes

Record provider-family/classifier decisions, capability/adapter/item versions, safe provider reason codes, synthetic
request IDs, sanitized outcome/count/cursor evidence, guard fences, and sandbox totals. Never record subjects, emails,
payment/provider references, payloads,
tokens, credentials, contents of backups, private contracts, holds, or legal advice.

## Plan readiness

Ready after plan 10 and Operations supply the exact actual-provider inventory and all capability-family fields, and the
family partition, per-path classifier, and decomposition decision are recorded. Exactly one family below 1,000 eligible
modifications may remain here. If there are multiple families or any XL projection exists, this plan must first be replaced with
one ExecPlan per independent family and any further capability-slice split needed to keep each PR non-XL.
