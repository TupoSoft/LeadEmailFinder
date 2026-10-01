# Recover Batch Funding Without Canceling Active Admission

This is a living document maintained according to `.agents/PLANS.md`.
One implementation pull request delivers this plan: `fix(verification): coordinate batch funding recovery`.

## Purpose / Big Picture

A periodic reconciliation tick must not cancel a valid batch while it is still resolving its addresses.
After this change, one durable group owner coordinates admission, an interrupted owner can be replaced safely,
and the full group reserves credits once before its executions become runnable.
A developer can pause admission across several reconciliation ticks and still observe every funded address complete.

## Progress

- [x] (2026-09-27) Add durable group phases and deterministic active-owner and recovery regressions.
- [x] (2026-09-27) Implement fenced ownership, replayable funding, and bounded group reconciliation.
- [x] (2026-09-27) Wire acyclic providers and validate PostgreSQL and batch HTTP behavior.
- [x] (2026-09-27) Record actual checks, recovery evidence, and architectural trade-offs.

## Plan dependencies

- `verification-billing/05`
- `batch-verification-hardening/01`
- `batch-verification-hardening/02`

## Surprises & Discoveries

- Implementation started from master `686b5f1`, which already contains plans 01, 02, and 06 and the batch
  admission classes this plan names. Its paths matched the plan, so no redesign was needed.
- `corepack pnpm typecheck` fails in this checkout with only `TS5033` because the root-owned `dist/` directory
  rejects `tsconfig.tsbuildinfo`; the same error occurs on unmodified master. Both projects type-check cleanly with
  `--tsBuildInfoFile` redirected to a scratch path.
- Recovery and `pageNonterminal()` sweep every organization. Because the PostgreSQL suite shares one schema across
  tests, the fairness scenario first retires earlier scenarios' groups and nonterminal executions.
- The live Bruno launcher needs the SMTP development overlay (`docker/compose.smtp-dev.yaml`) after
  `dev:reset`; without it, the evidence-control reset fails at `fixture_bootstrap`.
- Many touched files were not Prettier-formatted on master. Only new files and files that were formatted before
  this change were formatted, to keep the diff reviewable.

## Decision Log

- Decision: Persist an admission lease and funding decision on the batch group, and recover groups separately.
  Rationale: A missing reservation is normal during batch resolution and cannot identify an abandoned single execution.
  Date/author: 2026-09-15, Codex.
- Decision: Freeze the complete owned-operation list before calling the existing atomic `reserveMany()` operation.
  Rationale: Every replay must refer to the same financial operations; email verification does not own ledger transactions.
  Date/author: 2026-09-15, Codex.
- Decision: Fence database transitions with a generation and inspect reservation states after credit calls.
  Rationale: An expired worker can return late, and an idempotent reservation replay can return a released tombstone.
  Date/author: 2026-09-15, Codex.
- Decision: Keep group recovery independent of BullMQ batch-job availability and preserve terminal cleanup for plan 05.
  Rationale: Database recovery must finish interrupted funding without introducing a dependency cycle or queue-driven locks.
  Date/author: 2026-09-15, Codex.
- Decision: Add `claimOrJoinForBatchGroup()` instead of a guard parameter on `claimOrJoin()`, and remove the
  unguarded `BatchAdmissionStore.updateState()`.
  Rationale: The single-verification outcome union stays unchanged, and no unguarded group transition remains.
  Date/author: 2026-09-27, Claude.
- Decision: Put guarded queue and cancellation transitions on `VerificationExecutionStore`, sharing one
  `lockFencedAdmission()` helper with the admission store.
  Rationale: The execution store owns execution transitions; the helper keeps the group-row-then-execution-row
  lock order in one place.
  Date/author: 2026-09-27, Claude.
- Decision: Map lost ownership (a stale guarded write or failed renewal) to `busy`, continue a budget-exhausted
  call after 1 second, and fail an incomplete freeze, finalization, or phase-completion check as a retryable
  invariant error.
  Rationale: Lost ownership is normal after takeover; an incomplete persisted precondition after a completed phase
  indicates a defect that must not be skipped silently.
  Date/author: 2026-09-27, Claude.
- Decision: Extend Bruno only with the insufficient-credit group. Requests 01–03 already prove the funded success
  path, and a successful reset to zero proves no hold remains because the credits API rejects a balance below
  held credits.
  Rationale: Covers the changed public behavior without duplicating existing success coverage.
  Date/author: 2026-09-27, Claude.
- Decision: Share one contract-faithful in-memory admission fake under `application/delivery/batch/__tests__/`.
  Rationale: Unit tests exercise the same lease, phase, and freeze rules as the adapter instead of scripted mocks.
  Date/author: 2026-09-27, Claude.
- Decision: Remove the batch queue module's now-unused `CreditsModule` import.
  Rationale: Credits are consumed only through the new internal `BatchAdmissionModule`.
  Date/author: 2026-09-27, Claude.

## Outcomes & Retrospective

Delivered as planned. A batch group now has one fenced admission owner: a 60-second lease renewed every 5 seconds,
an incremented generation per acquisition, and guarded adapter writes for outcomes, claims, freezing, decisions,
queuing, cancellation, state transitions, and finalization. `BatchAdmissionService.admit()` performs one bounded
advancement of at most 100 address steps plus one whole-manifest credit call and returns `complete`, `busy`, or
`continuation`; the workflow parks `Admit` through `BatchAwaitingSettlementSignal` until admission completes. The
generic reconciler no longer touches batch-owned `funding_pending` rows. After single-execution work, it calls the new
`BatchAdmissionRecovery` port, which advances at most 100 groups per sweep in `updatedAt, batchId` order.

Validation evidence, all run on 2026-09-27 against the implementation working tree:

- Focused Jest (admission, recovery, workflow, reconciler, both TypeORM store specs, module composition): all pass.
  The complete `src/libs/modules` Jest run: 206 suites and 2,380 tests pass; 16 environment-gated suites skip.
- `corepack pnpm test:verification-billing-postgres`: 32 tests passed, zero skipped. The new scenarios cover every
  interruption boundary in the acceptance criteria, including both reserve-versus-close orders on real credits.
- The real-Redis batch queue suites (`TEST_REDIS_URL` against a disposable `redis:7-alpine` container): 7 suites,
  50 tests pass.
- `node --test scripts/bruno/batch-verification-runner.test.mjs`: 4 tests pass, including rejection of a denied group
  that reports a held credit or debits the balance.
- `corepack pnpm bruno:batch-verification` after `corepack pnpm dev:reset --confirm-project=LEF` and the SMTP overlay:
  `Bruno 4.1.0: 20 requests and 30 tests passed; no skipped requests`.
- `corepack pnpm architecture:check`: 9 modules, 0 violations. ESLint on every changed TypeScript file: clean.
  Type checking: clean (see the `TS5033` note above).

Remaining work belongs to later plans: plan 04 adopts the shared admission-state contract for late attachment, and
plan 05 adds terminal failure phases and uses the `closed` decision this plan reserves.

## Context and Orientation

The inspected baseline is PR 633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1` in `/tmp/lef-pr633-review`.
The requesting checkout at `451798dadf82e316ba68b4333ddba32bf0f99a97` lacks the new batch admission classes;
implementation starts after the declared prerequisites. All paths below are repository-relative.

`src/libs/modules/email-verification/src/application/delivery/batch/batch-admission.service.ts` creates every
execution before reserving the group's credits. Its store persists `validating`, `admitting`, `admitted`,
`insufficient_credits`, or `invalid` in `infrastructure/persistence/typeorm/batch-admission.entity.ts` within that module.
Owned executions carry `fundingOwnerType: 'batch_group'` and the batch UUID as `fundingOwnerId`.
The execution store exposes each new claim as `funding_pending` immediately.

`application/operations/verification-reconciler.ts` currently treats every unfunded pending execution as abandoned.
The scheduled queue runs every 30 seconds. A real PostgreSQL reproduction paused a batch after its claim committed,
ran reconciliation, and then resumed: the batch reserved credit and became admitted, but its canceled execution never ran.

`CreditReservationService.reserveMany()` delegates account locking and atomic holds to identity through a public port.
It returns each reservation's `reserved`, `captured`, or `released` state; a repeated call can return released rows.
`closeAdmissionMany()` creates released tombstones even for operation IDs that never obtained a reservation.
Do not assume that a resolved reserve promise means every requested operation is funded.

Plan 01 supplies one immutable manifest payer UUID and request insertion replay. Plan 02 preserves `created` ownership
when a retry rejoins that batch's execution. This plan supplies group recovery; plan 04 handles attachment to already
settled executions, and plan 05 handles durable terminal worker failure and final cleanup.

## Scope and Non-Goals

Own active admission coordination, abandoned-owner recovery, frozen group funding, insufficient-credit fencing,
and durable completion of request materialization after funding. Keep the current HTTP shapes and credit prices.
Do not add per-address financial transactions, cross-module transactions, new providers, migrations, production
backfills, UI changes, terminal BullMQ failure cleanup, or policy changes to SMTP and completed-result attachment.

## Plan of Work

Read module architecture instructions, the email-verification and credits README files, and the relevant local skills.
Extend `application/delivery/batch/batch-admission-store.ts` and its TypeORM adapter with the group fields and
conditional operations specified below. Register the updated entity wherever current schema fixtures include it.
The initial row is `validating`, decision `pending`, finalization `preparing`, with no lease and generation zero.

Refactor `BatchAdmissionService.admit()` into one bounded advancement per call, wrapped in lease acquisition.
Each call handles at most 100 address steps across resolution, queuing, cancellation, and receipt materialization,
plus at most one indivisible whole-manifest credit operation required by its saved funding phase. Do not impose a
new upload-size limit. Use a fresh UUID owner, a 60-second lease, and renewal
at the existing 5-second liveness cadence. Reuse the execution runner's timer pattern with the injected clock,
serial renewal calls, and timer cleanup in `finally`.
Another valid owner receives a busy outcome with a retry time. The workflow reuses the existing
`BatchAwaitingSettlementSignal` delayed-job handling for both busy and budget-exhausted continuation results.
It advances to dispatch only when admission and receipt finalization are complete. Reuse this bounded entry point
during recovery; never loop through every remaining address inside one group-recovery call.
A worker that loses renewal stops before its next write or network-independent credit call; returned late calls
still require a generation check before any database transition. On budget exhaustion, persist progress and touch
the group timestamp under the lease guard, then clear the owner and expiry conditionally and stop the renewal timer.
A concurrent late renewal cannot restore a released lease. Each later acquisition increments the generation; writes
from the old owner fail even before another worker resumes. Release on other exits conditionally in `finally`.

During `admitting`, resolve addresses with the stable UUID from plan 01 and ownership rules from plan 02.
Make batch claim transactions validate the current lease before creating or joining an execution. All manifest
outcome writes require the same guard. Under a short group-row lock, verify the recorded unique-address count,
that every outcome is resolved, and that all owned executions match their manifest IDs; then enter `funding`.
Once frozen, the address outcomes and owned-operation list cannot change, including after lease takeover.
Page remaining work in `firstSeenRow` order with an exclusive row cursor. Existing non-null outcomes, execution states,
and actual matching receipt state are the durable continuation record; do not add an offset or a second authoritative
cursor column. A returned phase/last-row continuation is only a hint. After restart, select the first incomplete row
from persisted state so a crash before the latest commit cannot skip it. Charge every address transition to the budget.
A database existence query determines phase completion without rereading every address through application loops.

In `funding` with decision `pending`, call `reserveMany()` once for the entire frozen `created` list outside any
verification transaction. An empty list needs no credit call and can be approved directly. Approve only when every
returned row is `reserved`; a released row means the admission is fenced and must take the denied path. A captured
row while the decision remains pending is an invariant error, since execution cannot start before approval.
Persist `approved` only if the lease generation still owns the group. A stale response cannot queue an execution.

On `InsufficientCreditsException`, persist `denied` before cancellation or closure, conditional on the current
lease. Then cancel the group's funding-pending executions and call `closeAdmissionMany()` for its entire frozen
owned list after budgeted cancellation has fenced every remaining funding-pending execution. A reserve attempt and
a close attempt each consume the call's one indivisible credit-operation slot; save denial and continue on another
advancement when that slot is already used. Skip closure for an empty list. Finish as `insufficient_credits`; retries of `denied` repeat closure,
never reservation, even after an account top-up. A late old reservation call is fenced by released tombstones.
Unexpected credit errors remain retryable through the saved phase; do not reinterpret them as insufficient funds.

After approval, queue the owned executions through a group-aware guarded store operation and mark the group
`admitted`. Before setting each execution to queued, lock and verify the group generation and approved decision.
Use persisted requests from plan 01 to finish missing receipts. Set finalization to `ready` only once every manifest
UUID has its matching ready request; a receipt with `admissionState: preparing` cannot satisfy this predicate.
This means receipt attachment is complete, not that billing has settled. Until the shared admission-state contract
lands, a fully inserted receipt is ready; plan 04 adopts that contract and preserves this meaning.
An approved replay never reserves again, even if its execution has since captured or released its credit.

Add `BatchAdmissionRecoveryService` to process at most 100 eligible groups per sweep, with at most 100 address steps
and one indivisible whole-manifest credit operation per group. Run normal execution, settlement, and cancellation
reconciliation before this group stage so already admitted single work progresses even when batches are large.
Select groups by `updatedAt ASC, batchId ASC`; update progress for each group handled, including one with a retryable failure,
so successive sweeps fairly rotate through more than 100 groups. Do not select the same group twice in one sweep.
Ignore live leases and acquire a new generation for expired or absent owners. Return after each group's bounded
advancement, preserving its saved phase and incomplete rows for a later sweep. One group's ordinary retryable error
must not prevent other groups from being reconciled; retain fixed safe error codes and retry eligibility.
The required atomic reservation still reads the complete frozen operation list and can be proportional to upload size;
this is an explicit exception to the address-step budget, not a new batch cap or a constant-time guarantee.
Do not log customer addresses or credit details.

Exclude batch-owned `funding_pending` rows from the generic `pageNonterminal()` query and defend the corresponding
reconciler branch before its deadline check. Group recovery owns these rows, so a busy group cannot fill the entire
single-execution page or be canceled by its generic deadline path. Once approved and queued, existing execution
leases, deadlines, capture/release settlement, and cancellation recovery apply normally.

Move admission-store and admission-service factories into a new internal
`src/libs/modules/email-verification/src/infrastructure/batch-admission.module.ts`, importing core and credits.
Register `BatchAdmissionEntity` and `BatchUniqueAddressEntity` with `TypeOrmModule.forFeature` in this module,
so reconciliation can resolve its persistence providers without importing the batch queue module. Keep
`BatchRowEntity` registration with its existing row/storage owner; the group-recovery path does not consume it.
Both batch and reconciliation queue modules import it. Move the `VerificationReconciler` factory from
`email-verification-core.module.ts` into the reconciliation module, which imports core and the new admission module.
Inject a small `BatchAdmissionRecovery` application port into the reconciler; never import the batch queue module
into core or expose internal providers from the business module's public TypeScript barrel.

Add `infrastructure/batch-admission.module.spec.ts` to prove the actual providers compose without a cycle.
Extend admission, persistence, reconciler, and real PostgreSQL tests with controlled barriers around
claiming, freezing, reservation, decision commit, and queuing. Extend `bruno/batch-verification/` with a successful
funded batch and an insufficient-credit group proving zero partial billing. Update the collection registration
and required request/test totals in `scripts/bruno/run-collection.mjs`, and update the fake workflow, synthetic
responses, and expected totals in `scripts/bruno/batch-verification-runner.test.mjs` together with the collection.
Preserve authentication and foreign-organization rejection coverage; the launcher must still reject missing tests.
Update the module README with the group owner, decision states, lease timing, and recovery responsibilities.

## Interfaces and Dependencies

Add `funding` to `BatchAdmissionState`; retain its existing values and public status mapping. Add to the group record:
`fundingDecision: 'pending' | 'approved' | 'denied' | 'closed'`,
`finalizationState: 'preparing' | 'ready'`, nullable `admissionLeaseOwnerId` and `admissionLeaseExpiresAt`, and
integer `admissionGeneration`. `closed` is a terminal gate reserved for plan 05; this plan must never reopen it.

Extend `BatchAdmissionStore` with organization-scoped `claimAdmissionLease`, `renewAdmissionLease`,
`releaseAdmissionLease`, `pageRecoverableGroups`, `pageIncompleteAddresses`, `freezeFundingManifest`, `recordFundingDecision`, and
`markFinalizationReady`. Mutations take `{ ownerId, generation }` and require an unexpired lease in the database.
Return typed applied/busy/stale outcomes; every caller must handle stale ownership without advancing state.
The bounded service returns complete, busy, or continuation with a retry time and phase/row hint; the workflow
and recovery caller never treat continuation as completed admission. `pageIncompleteAddresses` takes the group,
organization, phase, `afterFirstSeenRow`, and remaining budget, and filters persisted completion state in SQL.
`pageRecoverableGroups(now, limit)` includes validating/admitting/funding groups, denied decisions awaiting closure,
and admitted/insufficient-credit groups still preparing; exclude ready terminal groups and unexpired leases.

Extend batch execution claiming and queue transitions with the same guard. Acquire locks consistently:
organization admission advisory lock, then batch row, then execution row. Other group transitions take the batch row
before execution rows. Keep transactions short; no credits call, SMTP call, Redis operation, or wait runs inside them.
`BatchAdmissionRecovery.reconcile(limit)` returns counts for the existing reconciliation report without new HTTP fields.
Preserve credits and identity public APIs and use no deep cross-module imports or additional package dependencies.

## Acceptance Criteria

1. A batch paused before reservation survives multiple reconciliation ticks without cancellation or partial execution.
2. Worker loss during resolution is recovered after lease expiry with the same execution and payer IDs, once-only holds,
   and no duplicate request; a live owner's group is not taken over.
3. Loss after atomic reservation but before decision commit resumes the exact manifest without a second hold.
4. An expired owner cannot freeze, overwrite a decision, or queue after a newer generation has denied or closed admission.
5. Insufficient funds produce no partial hold; interruption during closure and later top-up never reopen the denied group.
6. A returned released reservation never permits queuing; approved replay preserves already captured or released outcomes.
7. A group exceeding 100 address steps yields, clears its lease, and resumes from its first incomplete persisted row;
   a stale writer cannot mutate after release. A sweep processes at most 100 distinct groups with fair timestamp order.
8. With 101 eligible groups and a queued single request, single execution is attempted before group work, no group
   exceeds its budget, and the remaining group is selected on the next sweep. Missing receipts remain recoverable.
9. All focused tests, real PostgreSQL scenarios, architecture, type, and changed-document checks pass; Bruno proves ordinary
   success, group denial, and unchanged authorization against an available disposable stack.

## Validation

Run from the implementation checkout root:

```bash
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/application/delivery/batch/batch-admission.service.spec.ts src/libs/modules/email-verification/src/application/delivery/batch/batch-admission-recovery.service.spec.ts src/libs/modules/email-verification/src/application/operations/verification-reconciler.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-batch-admission.store.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/infrastructure/batch-admission.module.spec.ts
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/03-coordinate-batch-funding-recovery.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

Extend the existing billing integration suite so its pinned PostgreSQL runner executes the new cases without skips.
Use two actual database connections, explicit barriers, and an injected clock for lease expiry, not timing sleeps.
Test both reserve-versus-close lock orders and verify account balance, held credits, every execution, and every receipt.
Add deterministic budget tests with 101 groups and a group containing 101 unfinished addresses, including interruption
just before its last budgeted write and a late renewal after release. Assert the single-execution ordering and exact
per-sweep budgets from recorded calls; no elapsed-time performance threshold substitutes for those invariants.
The Bruno launcher runs `bru run --env local --sandbox developer`; absent infrastructure requires honest static-only
collection results and an explicit unverified runtime note. No implementation checks have run while authoring this plan.

## Idempotence and Recovery

Recovery reuses the frozen operation IDs and immutable payer UUIDs. Approval and denial are durable decisions;
lease takeover changes only the owner and generation. A stale credit call cannot commit a group transition, and
released reservation tombstones prevent financial resurrection after closure.
This changes disposable development schema only. Stop the implementation checkout's local workers, run
`corepack pnpm dev:reset` to reset and reseed its disposable stack with `TYPEORM_SYNCHRONIZE=true`, then restart
that checkout's fixtures. The PostgreSQL test runner separately recreates and seeds its isolated test schema.
Do not add migrations or reset another checkout. If reverting this PR's schema, reset the same disposable data again.

## Artifacts and Notes

Record compact test evidence for each interruption boundary and both credit-lock orders; omit connection strings and
customer data. Plan 05 extends the same group record with terminal failure phases, invalidates the same generation,
and closes only the frozen subset of executions that have not started when other owned executions are already
running or captured.
Follow repository issue assignment and project-status instructions on implementation start; one assigned PR closes
this plan's synced issue and uses the conventional commit subject. Dependencies govern implementation order.

## Plan readiness

Ready to implement
