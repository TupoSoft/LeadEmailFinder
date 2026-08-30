# Add the Atomic Human-Organization Privacy Adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect controller privacy to the cohesive human Keycloak, organization, membership, and invitation lifecycle through
one owner-controlled atomic/compensating seam. After this change, approved access, correction, restriction, deletion,
and retention actions preserve shared identities, organization locks, final-owner safety, and Keycloak/local
consistency. The complete controller workflow remains disabled until plan 18.

## Progress

- [ ] (2026-08-30) Run the binding pre-implementation size/decomposition gate for the human/organization seam.
- [ ] (2026-08-30) Add the narrow owner facet and `human-organization.controller-data.v1` bridge adapter.
- [ ] (2026-08-30) Implement atomic or explicitly compensating Keycloak/local rights actions behind organization locks.
- [ ] (2026-08-30) Add bounded owner retention enumeration/application for human, membership, and invitation rows.
- [ ] (2026-08-30) Validate shared identities, final-owner races, failure in both mutation orders, retention, and disabled
      registry behavior.

## Plan dependencies

- `privacy-compliance/13`
- `privacy-compliance/16`
- `privacy-compliance/32`
- `auth/13`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Expose one `HumanOrganizationControllerPrivacyOperations` facet from organization onboarding and one
  descriptor, `human-organization.controller-data.v1`, while the owner internally composes identity and Keycloak
  infrastructure.
  Rationale: Profile, membership, invitation, and global IdP mutations share active-relationship and final-owner
  invariants; a controller bridge must not orchestrate those repositories/SDKs itself.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Run a binding size projection before implementation. If the planned cohesive diff is classified `size/xl`
  by the repository PR-size policy, stop and replace this plan with smaller Keycloak-profile and organization-
  relationship ExecPlans with an explicit handoff contract before editing production code.
  Rationale: Cohesion does not override the repository's one-reviewable-PR delivery limit, and `fail_if_xl` must not be
  weakened.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: The classifier is non-Markdown additions plus deletions, ignores only `pnpm-lock.yaml`, counts each new
  file at its full estimated length and uncertain moves as delete plus add, and marks 1,000 or more modifications as
  `size/xl`. Record the per-path projection and split decision before production edits; verify the delivered diff with
  the exact command in Validation.
  Rationale: The implementation gate must be reproducible and cannot depend on a later labeler interpretation.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: A final active owner, unresolved shared identity, active legal/security hold, or ambiguous Keycloak/local
  state yields the exact approved retained/manual/pending result and never a fabricated deletion.
  Rationale: Rights processing cannot strand an organization, destroy another relationship, or infer external success.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add owner-specific `findRetentionDue`/`applyRetention` operations here and leave central scheduling,
  markers, restored replay, and activation to plan 18.
  Rationale: Retention mutations must use the same organization locks and compensation rules as interactive rights.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Every correction, relationship mutation, IdP deletion, and retention apply acquires sorted plan-32 hold
  guards before the organization lock and canonical owner rows. Transactionally recheck the fence/effective decision
  after those rows are locked and immediately before local commit, then recheck before accepting authoritative
  Keycloak completion; unknown guard or external state stays pending/manual.
  Rationale: Final-owner serialization does not by itself prevent a legal hold from becoming effective mid-operation.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: This adapter-only PR keeps every composition disabled and adds no Bruno request. Plan 18 owns target-real/
  rest-fake, complete-real, and end-to-end HTTP/Bruno coverage.
  Rationale: A subset registry cannot start by design, so an enabled route fixture here would be false validation.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep `CONTROLLER_PRIVACY_ENABLED=false` in every committed composition.
  Rationale: Plans 17, 18, and 28–30 remain mandatory.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 16 resolves local external-identity attribution and BFF state but deliberately does not mutate relationships.
Organization onboarding owns human Keycloak administration, membership/invitation workflows, and the organization lock
used by `auth/13` to serialize final-owner changes. Identity persists memberships/invitations and may link one external
identity to multiple organizations.

A “global human deletion” means removing the Keycloak identity/local attribution only after every active organization
relationship and retained dependency permits it. Removing one membership is not proof that global deletion is safe.
Plan 32 supplies the durable hold query/guard provider used before every owner or Keycloak mutation.

## Scope and Non-Goals

Add the human-organization owner facet, bridge adapter, disabled composition registration, owner retention operations,
focused PostgreSQL/Keycloak/concurrency tests, and owner/controller README updates.

Do not handle BFF session keys, service clients, credits/payments, audit/security evidence, managed providers, central
retention scheduling, restore reconciliation, migrations, real activation, or production rollout. Plans 16–18 and
28–30 own those responsibilities.

## Plan of Work

Before production edits, enumerate proposed files and projected additions/deletions for organization onboarding,
identity seams, Keycloak infrastructure, controller bridges, tests, and docs. Sum additions plus deletions for every
path except `*.md` and `pnpm-lock.yaml`; count each new file at its full estimated length and uncertain moves as deletion plus
addition. Record the per-path table, total, and decision here. Fewer than 1,000 modifications retains this plan; 1,000
or more is `size/xl`, stops this plan, and replaces it with the smaller Keycloak-profile and organization-relationship
ExecPlans before any production edit.

Define `HumanOrganizationControllerPrivacyOperations` in the owning module. It accepts a verified opaque subject/
organization binding and exact plan-12 item/action, and returns safe disposition, reason, retry/manual state, and count.
Expose no TypeORM repository, Keycloak client, token, entity, or controller-privacy type through the public barrel.

Implement approved access with subject/organization predicates and no unrelated member/invitation fields. Coordinate
profile/email correction through the local attribution seam from plan 16 and Keycloak using an expected version. If either
side fails, persist only the existing sanitized compensation state and retry deterministically; never report terminal
correction until authoritative reads agree.

For any correction, restriction, or deletion, canonicalize/sort plan-32 scopes and acquire those hold guards first;
then acquire the organization lock and owner rows in their existing canonical order. Never acquire a hold guard while
retaining an organization/owner lock. Recheck the guard fence, actor/target state, and final-owner count before local
commit. The guard fence/effective decision is transactionally rechecked after owner locking and immediately before that
commit. Global Keycloak deletion first proves that every active relationship and hold permits it, then uses provider-
native idempotency or authoritative read-after-write and revalidates the guard. Last-owner, lost-guard, or ambiguous
Keycloak/local state returns the exact manual/pending reason.

Add bounded stable-cursor `findRetentionDue` and `applyRetention` operations for the assigned human, membership, and
invitation rows. Apply uses the same hold-first/organization-second lock order and rechecks active relationship, guard
fence, final-owner status, invitation expiry/acceptance, shared identity, and Keycloak/local version. Ambiguity prevents
the future plan-18 checkpoint from advancing.

Implement the controller bridge using only the bare owner barrel and register exact item/action/retention coverage.
Assert that this descriptor satisfies its subset while exact missing plans 17, 18, and 28–30 keep startup disabled.

## Interfaces and Dependencies

The owner facet is equivalent to:

    interface HumanOrganizationControllerPrivacyOperations {
        execute(input: HumanOrganizationPrivacyInput): Promise<ControllerPrivacyOwnerResult>
        findRetentionDue(input: RetentionQuery): Promise<DuePage>
        applyRetention(input: RetentionItem): Promise<ControllerPrivacyOwnerResult>
    }

The bridge descriptor is exactly `human-organization.controller-data.v1`. Controller privacy imports the facet through
the organization-onboarding bare barrel; owner modules do not import controller privacy. Existing TypeORM,
organization-lock, and Keycloak adapters remain private.

## Acceptance Criteria

- The pre-implementation size projection is recorded; `size/xl` stops work and produces smaller ExecPlans before any
  production edit, without weakening the size policy. The exact total excludes `*.md` and `pnpm-lock.yaml`, counts
  additions plus deletions, and classifies 1,000 or more as XL.
- Every assigned human/organization/membership/invitation item/action/retention rule maps exactly once to
  `human-organization.controller-data.v1`.
- Access and mutation cannot reach another subject or organization, and one relationship never authorizes global
  identity deletion.
- Concurrent final-owner changes preserve at least one active owner and return the approved manual disposition.
- Keycloak-first and local-first injected failures converge through bounded retry/compensation and never produce false
  completion.
- Retention is bounded, rechecks relationship/hold/final-owner/shared-identity state, and leaves ambiguity pending.
- Every mutation acquires sorted plan-32 hold guards before organization/owner locks and revalidates the fence before
  completion; active/lost/unknown holds and ambiguous Keycloak outcomes stay pending/manual.
- The registry remains disabled for the exact outstanding descriptors/capability; no service-client, financial,
  audit/security, provider, central scheduler, restore, migration, or production activation is included.
- Focused, PostgreSQL, live-Keycloak, hold-race, concurrency, architecture, full, build, and docs checks pass. Bruno is
  not applicable below HTTP; plan 18 owns hybrid/complete route coverage.

## Validation

Run the exact focused commands:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- human-organization-controller-privacy organization-controller-retention --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- human-organization-controller-privacy.integration.spec.ts --runInBand
    RUN_LIVE_KEYCLOAK_TESTS=true TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- human-organization-controller-privacy.live-keycloak.integration.spec.ts --runInBand

Before production edits, record the projected per-path additions/deletions and formula result. After implementation,
run this exact binding classifier; a result of 1,000 or more is `size/xl` and the PR must not proceed:

    git diff --numstat -M origin/master...HEAD | awk '$3 !~ /\.md$/ && $3 != "pnpm-lock.yaml" { additions += $1; deletions += $2 } END { print additions + deletions }'

Cover multiple memberships; current, former, and invited users; last-owner races; shared identity; and active, unknown,
and lost hold guards. Also cover reversed lock-order rejection, version conflict, Keycloak and local failure in both
orders, idempotent retry, retention page boundaries, trigger recheck, and exact disabled-registry diagnostics. Bruno is not applicable to this
below-HTTP adapter PR; plan 18 runs target-real/rest-fake and complete-real controller HTTP coverage.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/organization-onboarding/README.md src/libs/modules/identity/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/27-add-human-organization-privacy-adapter.md
    corepack pnpm exec prettier --check src/libs/modules/organization-onboarding/README.md src/libs/modules/identity/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/27-add-human-organization-privacy-adapter.md
    git diff --check

## Idempotence and Recovery

Organization locks, expected versions, provider idempotency/read-after-write, retention cursors, and compensation state
make retries converge. Already-absent state succeeds only after exact subject/scope verification; unknown external state
stays pending.

Reset/reseed only an owned disposable PostgreSQL/Keycloak environment. Never delete a realm, organization, shared
identity, final owner, or broad row range to force completion, and never bypass the size gate.

## Artifacts and Notes

Record the size projection/classification, descriptor/item versions, sanitized lock/compensation states and counts,
synthetic IDs, retention cursors, hold fences, and test totals. Never record names, emails, issuer subjects, Keycloak
payloads/tokens, private holds, or credentials.

## Plan readiness

Ready after the binding per-path size projection and decomposition decision are recorded: fewer than 1,000 eligible
additions plus deletions retains this plan, while 1,000 or more replaces it with separate Keycloak-profile and
organization-relationship ExecPlans before any production edit.
