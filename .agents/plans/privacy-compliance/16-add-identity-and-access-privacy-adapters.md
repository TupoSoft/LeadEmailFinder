# Add Identity-Attribution and Browser-Session Privacy Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect the controller-privacy core only to local external-identity attribution and BFF browser session/pending-login
state through narrow owner-approved contracts. After this change, fake-free tests can bind the approved controller
subject, access approved local attribution, revoke subject-bound sessions/login state, and apply each owner's bounded
retention action without Redis-wide scans or cross-organization leakage. Human Keycloak, organization, service-client,
financial, audit/security, provider, and lifecycle capabilities remain separate and disabled.

## Progress

- [ ] (2026-08-30) Add narrow public privacy facets to identity attribution and BFF session only.
- [ ] (2026-08-30) Implement and register the two bridge adapters for their exact plan-12 item/action IDs.
- [ ] (2026-08-30) Add bounded `findRetentionDue`/`applyRetention` operations to both owners for plan 18.
- [ ] (2026-08-30) Preserve issuer/subject uniqueness, active-relationship checks, session security, pending-login
      anti-replay, and Redis index invariants.
- [ ] (2026-08-30) Add contract, PostgreSQL, Redis, authorization, concurrency, architecture, and docs validation.

## Plan dependencies

- `privacy-compliance/13`
- `privacy-compliance/32`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Data-owning modules expose purpose-specific privacy facets through their bare public barrels; controller-
  privacy infrastructure implements its plan-13 adapter SPI by consuming those facets.
  Rationale: Owners retain invariants and infrastructure, while the orchestrator avoids entities, repositories, deep
  imports, and reverse dependencies.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use one adapter per owner boundary:
  `identity-attribution.controller-data.v1` and `bff-session.controller-data.v1`.
  Rationale: Stable, narrow descriptors make coverage and initialization completeness auditable.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep human IdP/organization/membership/invitation work in plan 27 and service-client work in plan 28. This
  plan may read active-relationship existence to protect an attribution row, but it cannot mutate either owner.
  Rationale: Local identity binding and Redis session revocation are independently testable; combining Keycloak,
  organization locks, invitations, and M2M compensation would create a multi-PR plan.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep `CONTROLLER_PRIVACY_ENABLED=false` in committed configuration after this PR.
  Rationale: Plans 17, 18, and 27–30 still own required adapters and lifecycle capability, so the plan-13 complete-
  registry gate must continue to fail if enabled.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add each owner's bounded `findRetentionDue` and `applyRetention` operations in this adapter PR, while plan
  18 only compiles policy, schedules/checkpoints work, stores markers, coordinates restore replay, and activates.
  Rationale: Retention mutation belongs beside the owner invariants and tests rather than turning plan 18 into a cross-
  module change.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Every correction, detach, revoke, delete, restrict, and retention apply uses the plan-32 durable mutation
  guard. Sort and acquire hold scopes first, then owner rows/Redis keys in canonical order; never request a hold guard
  while an owner lock is retained. Revalidate the guard before authoritative completion, and leave external or guard
  ambiguity pending/manual.
  Rationale: Owner-local checks alone cannot serialize a newly effective legal hold with a mutation.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: This adapter-only PR changes no controller HTTP contract and adds no Bruno request. Plan 18 owns target-
  real/rest-fake and complete-real compositions plus end-to-end HTTP/Bruno coverage.
  Rationale: Until the lifecycle capability and all descriptors exist, an enabled subset route is intentionally
  impossible and would contradict the core initialization gate.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add no migration or production rollout; use synchronization and explicit disposable reset/reseed.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Identity owns the local `external_identities` attribution row, alongside other records deliberately left to later
owners. BFF session owns encrypted Redis sessions and one-time pending login state. An external identity may belong to
more than one organization, so this plan can remove or detach a local attribution only after an owner-provided active-
relationship check proves that no plan-27 relationship still requires it.

Plan 13 defines request orchestration and the adapter SPI but has only fakes. Plan 12 supplies exact item/action and
retention rules. Plan 32 supplies the durable hold query/guard provider. Plan 27 later consumes the active-relationship
seam and owns organization locking/final-owner mutation.

## Scope and Non-Goals

Add public privacy facets and implementations only in identity and BFF session; two controller-privacy bridge adapters
and registration; owner retention operations; contract/live-fixture tests; and README dependency/API updates. Cover
only plan-12 local external-identity attribution, browser-session, and pending-login item/action IDs.

Do not implement human Keycloak, organization/membership/invitation, service-client, credit, purchase/payment,
audit/security-log, or managed-provider adapters; the central scheduled retention/checkpoint/restore workflow; new
legal rules; anonymous recovery; migrations; or feature activation. Plans 17, 18, and 27–30 own those outcomes.

## Plan of Work

In each of the two owner modules, define the smallest application contract needed for approved items. Operations accept
a verified subject/organization scope and stable item/action IDs and return sanitized counts/dispositions. They never
expose TypeORM repositories, Redis clients, tokens, or owner entities. Implement technical access in the owning
infrastructure and export only the facet/token from its bare barrel.

The identity-attribution facet resolves exactly one local external identity by the verified issuer/subject binding and
returns only plan-12-approved local fields. It applies an approved correction, detachment, or deletion only when policy
permits it and an active-relationship reader proves no organization, human IdP, or other owner still requires the row.
Ambiguous or active relationships return a stable retained/manual disposition for plan 27; this PR never mutates
memberships, invitations, service credentials, audit rows, or Keycloak. Preserve issuer/subject uniqueness and prevent
one organization's request from changing a shared attribution.

The BFF-session facet enumerates/revokes only sessions and pending login state indexed to the bound issuer/subject and
reports no token, PKCE, nonce, state, or CSRF contents. Correction is unsupported unless plan 12 maps a safe session
field. Deletion/restriction revokes and confirms absence using bounded subject indexes rather than Redis `SCAN` over a
shared namespace or `FLUSH*`.

Add `findRetentionDue` and `applyRetention` to each facet for its exact plan-12 rows. Enumeration uses stable bounded
cursors. For every mutation or apply, canonicalize and sort plan-32 hold scopes, acquire/validate those guards first,
and only then acquire identity rows or Redis subject-index/key locks in their documented canonical order. PostgreSQL
paths transactionally recheck the guard fence/effective decision after owner-row locking and immediately before
commit. Redis paths keep the fenced guard renewed across one bounded atomic script and recheck it afterward; a lost or
ambiguous guard makes the result pending/manual. Never acquire a hold guard while retaining an owner lock. Recheck due
trigger, active relationship, and scope as part of that commit. Session/pending-login expiry uses existing TTL as
defense in depth but explicitly reconciles stale indexed keys. Lost/unknown hold guards or Redis/PostgreSQL state return
blocked/pending and never advance a plan-18 checkpoint.

Implement the two plan-13 adapters in `src/libs/modules/controller-privacy/src/infrastructure/adapters/`, consuming
only bare module exports. Register exact descriptor versions and item/action/retention coverage in the API composition
root. Keep the feature off; add an initialization test showing this subset registers but the known plans 17, 18, and 27–30
descriptors/capability still block enablement.

## Interfaces and Dependencies

Owner facets are equivalent to narrow contracts named
`IdentityAttributionControllerPrivacyOperations` and `SessionControllerPrivacyOperations`. Each takes an opaque
verified binding plus plan-12 item/action and returns `ControllerPrivacyOwnerResult` with safe
disposition/count/retry state. Each also exposes bounded `findRetentionDue` and invariant-preserving `applyRetention`
methods consumed later by the plan-18 coordinator.

Controller-privacy depends on the owner modules only through bare barrels and documents each dependency. Owner modules
do not import controller-privacy; shared request/result values needed on both sides live as pure common contracts or
are mapped by bridge adapters.

## Acceptance Criteria

- Every assigned local-attribution/session/pending-login plan-12 item/action/retention rule is owned exactly once by
  the two stable adapter descriptors.
- No deep cross-module import, repository/entity/SDK exposure, application/domain framework dependency, or dependency
  cycle is introduced.
- Self-service scope cannot reach another issuer/subject/organization; local attribution changes only after a fresh
  active-relationship check permits it, and no membership/organization/Keycloak mutation occurs.
- Session/pending-login revocation contains no token, PKCE, state, nonce, or CSRF payload and does not broadly scan or
  flush shared Redis.
- Both owners enumerate retention work in bounded stable pages, recheck triggers/holds/scope on apply, and return
  pending on ambiguous state without advancing a future plan-18 checkpoint.
- Every mutation acquires sorted plan-32 hold guards before canonical owner locks and revalidates its fence before
  completion. Active, lost, expired, or unavailable guards block completion, and race tests prove the order.
- Feature enablement still fails for the exact known plans 17, 18, and 27–30 gaps; committed default remains off.
- No Keycloak/organization/service-client/financial/audit/security/provider work, central retention scheduler, restore
  reconciler, migration, or production activation is included.
- Focused, contract, PostgreSQL, Redis, hold-race, architecture, full, build, and docs checks pass. Bruno is not
  applicable because this adapter-only PR changes no HTTP contract; plan 18 owns enabled hybrid/complete HTTP coverage.

## Validation

Run architecture, adapter contracts, and owner integration suites:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy identity-attribution-controller-privacy bff-session-controller-privacy --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- controller-privacy-identity.integration.spec.ts --runInBand

Cover active, former, and multiple-relationship attribution; shared identity; foreign scope; unique-key races; and
session and pending-login revocation. Also cover expired and stale Redis indexes, page boundaries, due-trigger rechecks,
active/unknown/lost hold guards, reversed lock-order rejection, concurrent retention application, and the exact
incomplete-registry report. Bruno is not applicable to this below-HTTP adapter PR; plan 18 must exercise this target as real with all
remaining adapters fake, then the complete real composition, through the controller HTTP collection.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/identity/README.md src/libs/modules/bff-session/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/16-add-identity-and-access-privacy-adapters.md
    corepack pnpm exec prettier --check src/libs/modules/identity/README.md src/libs/modules/bff-session/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/16-add-identity-and-access-privacy-adapters.md
    git diff --check

## Idempotence and Recovery

Owner operations use uniqueness, idempotency, stable cursors, and atomic Redis index/key scripts. Already-absent state
is success only after the owner verifies exact scope; ambiguous state remains retryable.

Reset/reseed only an owned disposable development environment after synchronized schema incompatibility. Never delete
an organization/membership, Keycloak identity, broad Redis namespace, or shared attribution to force completion.

## Artifacts and Notes

Record adapter/item versions, sanitized counts/dispositions, cursor/failure scenarios, hold fences, test totals, and synthetic IDs.
Never record emails, names, issuer subjects, session/token/PKCE/state/nonce/CSRF contents, or private evidence.

## Plan readiness

Ready to implement
