# Add the Service-Client Privacy Adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Connect controller privacy to locally persisted and Keycloak-backed service-client lifecycle through one M2M owner
seam. After this change, approved attributable service-client fields can be accessed, restricted, disabled, deleted,
and age-retained without exposing credentials or confusing a human rights request with service-client authority. The
complete workflow remains disabled until plan 18.

## Progress

- [ ] (2026-08-30) Add the service-client privacy facet and `service-client.controller-data.v1` bridge.
- [ ] (2026-08-30) Preserve Keycloak/local lifecycle, ownership, permission, secret, and idempotency invariants.
- [ ] (2026-08-30) Add bounded service-client retention enumeration/application for plan 18.
- [ ] (2026-08-30) Validate partial failure, retry, foreign scope, secret exclusion, and disabled registry behavior.

## Plan dependencies

- `privacy-compliance/13`
- `privacy-compliance/16`
- `privacy-compliance/32`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Use one owner descriptor, `service-client.controller-data.v1`, backed by a narrow public facet from
  service-client management.
  Rationale: The owner already coordinates local credential state and Keycloak M2M clients; controller privacy should
  not duplicate that lifecycle.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Treat human privacy authorization and service-client data attribution as separate concepts. A service
  credential can never invoke human controller-privacy endpoints, and an attributable service-client result never
  includes its secret or token.
  Rationale: M2M credentials are organization resources, not substitute human identity proof.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Add service-client `findRetentionDue`/`applyRetention` here; plan 18 owns central coordination only.
  Rationale: Disable/delete and expiry must reuse the owner's Keycloak/local compensation and permission invariants.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Every correction, restriction, disablement, deletion, and retention operation acquires sorted plan-32 hold
  guards before canonical organization/client rows. It transactionally rechecks the fence/effective decision after
  those rows are locked and immediately before local commit, then rechecks before authoritative Keycloak completion. A
  lost guard or ambiguous external outcome stays pending/manual.
  Rationale: The two-system lifecycle needs the same hold race boundary as every other mutating owner.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: This adapter-only PR changes no controller HTTP contract and adds no Bruno request. Plan 18 owns target-
  real/rest-fake, complete-real, and end-to-end HTTP/Bruno coverage.
  Rationale: The subset registry intentionally cannot be enabled.
  Date/Author: 2026-08-30, privacy plan review.
- Decision: Keep all real composition disabled.
  Rationale: Plans 17, 18, 27, 29, and 30 remain mandatory.
  Date/Author: 2026-08-30, privacy plan review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Service-client management creates, rotates, disables, deletes, and lists organization-scoped M2M clients across local
identity persistence and Keycloak. It already rejects human-only permissions and protects secrets after creation.
Plan 16 supplies the verified local human attribution used to establish the request's approved organization scope but
does not touch M2M lifecycle. Plan 32 supplies the durable hold query/guard provider.

## Scope and Non-Goals

Add the owner privacy facet, bridge adapter, retention operations, disabled composition registration, focused/live
Keycloak tests, and owner/controller README updates for assigned plan-12 service-client items.

Do not add human Keycloak/membership mutation, financial, audit/security, managed-provider assistance, central
retention scheduling, restore reconciliation, new permissions, migration, activation, or production rollout.

## Plan of Work

Define `ServiceClientControllerPrivacyOperations` in service-client management. Accept only a verified opaque
subject/organization binding and exact plan-12 item/action. Return safe disposition, reason, retry/manual state, and
count. Export only the facet/token; Keycloak admin clients, TypeORM repositories/entities, raw credentials, client
secrets, and provider payloads remain private.

Return only approved attribution, description, status, permission-category, and timestamp fields for access. Never return
secret hashes, raw secrets, tokens, Keycloak credentials, unrelated clients, or private administrative metadata.
Correction changes only approved mutable labels/annotations. Restriction, disablement, and deletion reuse the
existing organization checks and two-system lifecycle.

For every mutation, canonicalize/sort plan-32 scopes and acquire hold guards first, then canonical organization/client
rows. Never acquire a hold guard while retaining an owner lock. Use existing idempotency where available; otherwise
perform authoritative local/Keycloak reads before and after the mutation. Transactionally recheck the guard fence/
effective decision inside the locked owner transaction immediately before local commit, and recheck it before accepting
remote completion. Persist only sanitized compensation/resumption state. A lost guard, timeout,
or disagreement remains pending; never retry an ambiguous non-idempotent provider mutation or report deletion from one
side alone.

Add stable-cursor `findRetentionDue` and `applyRetention` for exact plan-12 service-client rows. Apply uses the same
hold-first/owner-second lock order and rechecks organization, status, last-use/revocation trigger, guard fence, and
Keycloak/local state. Unknown state blocks the future plan-18 checkpoint.

Implement/register the bridge using the bare owner barrel. Assert its exact subset passes while plans 17, 18, 27, 29,
and 30 still prevent enabled startup.

## Interfaces and Dependencies

The owner facet is equivalent to:

    interface ServiceClientControllerPrivacyOperations {
        execute(input: ServiceClientPrivacyInput): Promise<ControllerPrivacyOwnerResult>
        findRetentionDue(input: RetentionQuery): Promise<DuePage>
        applyRetention(input: RetentionItem): Promise<ControllerPrivacyOwnerResult>
    }

The descriptor is exactly `service-client.controller-data.v1`. Controller privacy imports only the bare owner barrel;
the owner does not import controller privacy. Existing Keycloak, TypeORM, locking, and secret-handling infrastructure
remain private.

## Acceptance Criteria

- Every assigned service-client item/action/retention rule maps exactly once to
  `service-client.controller-data.v1`.
- Only the verified organization scope is visible; another organization's client is concealed.
- Access/export contains no raw/hashed secret, token, Keycloak credential, or unrelated administrative field.
- Local-first and Keycloak-first failures remain pending and converge on retry without duplicate unsafe mutation or
  false completion.
- Retention is bounded and rechecks status, trigger, hold, and both stores before applying.
- Every mutation acquires sorted plan-32 hold guards before owner locks and checks the fence again before completion;
  active/lost/unknown holds and ambiguous Keycloak state cause a fail-closed result.
- Service credentials cannot call human controller-privacy routes or acquire human-only privacy permissions.
- The registry remains disabled for the exact outstanding plans; no adjacent owner, central scheduler, restore,
  migration, or production activation is included.
- Focused, PostgreSQL, live-Keycloak, hold-race, failure, architecture, full, build, and docs checks pass. Bruno is not
  applicable below HTTP; plan 18 owns hybrid/complete route coverage.

## Validation

Run the exact focused commands:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- service-client-controller-privacy service-client-controller-retention --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_controller_privacy_test TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- service-client-controller-privacy.integration.spec.ts --runInBand
    RUN_LIVE_KEYCLOAK_TESTS=true TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- service-client-controller-privacy.live-keycloak.integration.spec.ts --runInBand

Cover current/disabled/deleted clients, another organization, secret exclusion, permission classification, local- and
Keycloak-first failures, authoritative retry, concurrent delete/rotate, retention boundaries, active/unknown/lost hold
guards, reversed lock-order rejection, and incomplete-registry diagnostics. Bruno is not applicable to this below-
HTTP adapter PR; plan 18 runs target-real/rest-fake and complete-real controller HTTP coverage.

Finish with these exact repository-root commands:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check src/libs/modules/service-client-management/README.md src/libs/modules/controller-privacy/README.md .agents/plans/privacy-compliance/28-add-service-client-privacy-adapter.md
    git diff --check

## Idempotence and Recovery

Owner idempotency, authoritative reads, sanitized compensation state, and stable retention cursors make retry converge.
Already-absent state succeeds only after exact organization/client verification; ambiguity remains pending.

Reset/reseed only an owned disposable PostgreSQL/Keycloak environment. Never delete a realm, broad client range, or
credential secret store, and never force local state to match an unknown provider outcome.

## Artifacts and Notes

Record descriptor/item versions, safe client states/counts, compensation reason codes, retention cursors, synthetic
IDs, hold fences, and test totals. Never record client secrets/hashes, tokens, Keycloak payloads, human identity values,
private holds, or credentials.

## Plan readiness

Ready to implement
