# Recover Verification Operations and Reuse Fresh Results

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Provide one durable application operation that can reuse a fresh result, join existing work, or fund and perform
a new check. A crash between result persistence and credit settlement must recover without a second probe or
charge. This PR delivers the application and persistence capability with integration tests; Plan 04 connects the
public single-verification routes and Plan 05 connects batch delivery.

## Progress

- [ ] (2026-09-08) Add organization-owned request, execution, and settlement-intention stores.
- [ ] (2026-09-08) Implement complete-result cache lookup, evidence freshness, and concurrent execution sharing.
- [ ] (2026-09-08) Implement funded execution, fenced persistence, and recoverable capture or release.
- [ ] (2026-09-08) Add deterministic concurrency, crash-recovery, ownership, and expiry coverage.
- [ ] (2026-09-08) Update module/lifecycle documentation and complete focused validation.

## Plan dependencies

- `verification-billing/01`
- `verification-billing/02`

## Surprises & Discoveries

The current SMTP cache returns old records without checking their timestamps or reporting cache provenance.
`EmailVerificationOrchestrator.verify()` appends a fresh verification record even when its probes use old evidence.
Consequently, the new record's creation time cannot establish evidence freshness. The account and verification
stores belong to different modules; a payment-style durable intention is needed instead of a cross-module repository.

## Decision Log

- Decision: Email verification owns request/execution orchestration and quality; credits owns the one-credit
  reservation and settlement transition. Rationale: Neither module may import the other's persistence adapter.
  Date/Author: 2026-09-08, policy planning.
- Decision: Cache only complete conclusive results, for at most 24 hours from their oldest required evidence.
  Rationale: Rereading cached evidence must not renew its age or sell old evidence as a new verification.
  Date/Author: 2026-09-08, policy planning.
- Decision: Persist a result and its immutable settlement intention in the same email-verification transaction,
  then replay the credit operation until confirmed. Rationale: This closes crash windows without holding a
  database lock across SMTP or introducing a dependency cycle. Date/Author: 2026-09-08, policy planning.
- Decision: A 60-second worker lease, renewed every 20 seconds, fences attempts. A bounded reconciler runs every
  30 seconds. A funded execution may run for at most 24 hours, including queue delays, before fenced cancellation.
  Rationale: These engineering limits prevent indefinite reservations; they do not implement privacy retention.
  Date/Author: 2026-09-08, policy planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The module is `src/libs/modules/email-verification/`. Its `src/application/email-verification.service.ts` currently
orchestrates probes and persistence. `src/application/mailbox-verification.service.ts` assembles mailbox evidence;
Plan 01 makes that evidence suitable for an explicit quality decision. Stores live below
`src/infrastructure/persistence/`; `VerificationStore.create()` currently has no operation identity or fencing.
Async delivery is under `src/application/delivery/async/`, with BullMQ adapters under `src/infrastructure/queues/`.

Plan 02 supplies durable reservations, capture, release, and available-balance snapshots through the credits public
barrel. Existing identity persistence owns account locking. The term request means one caller submission; execution
means the single shared check for an organization/address; a settlement intention records capture-one or release.

## Scope and Non-Goals

Add these application capabilities and their composition without changing existing route charges in this PR.
Do not add a provider, expose account-discovery evidence as a deliverability guarantee, redesign the queue system,
or implement the full privacy retention road map. No frontend changes or new public routes belong here.

## Plan of Work

Add purpose-specific ports under `src/application/ports/`: `VerificationRequestStore`, `VerificationExecutionStore`,
`VerificationSettlementStore`; reuse `VerificationClock` from Plan 01. Add application services under
`src/application/operations/` for admission, execution, and settlement recovery. Register TypeORM adapters and
entities in the existing email-verification composition. Infrastructure alone owns database transactions and leases.

A request stores its UUID, organization, normalized address, delivery mode, optional client idempotency key,
execution/result link, source (`fresh`, `cache`, or `shared`), and creation time. Use a unique organization/key
constraint for supplied keys. Reject the same key with different normalized input or delivery mode. The operation
UUID is the public recovery handle. An execution stores a distinct UUID, organization/address, payer request,
state, immutable funding owner (single execution or batch admission group), attempt generation, lease expiry,
result link, retry time, and settlement decision. Use a partial unique
index on organization/address for nonterminal executions and unique execution/result and execution/intention keys.

Admission validates and normalizes first. Check an equivalent request, then a usable complete result, then an active
execution, before attempting new funding. A cached request or follower requires no credits. A new execution starts
as `funding_pending` with a durable payer identity, reserves one credit by execution UUID, and becomes `queued`
only after confirmation of an active reserved state. A funding failure first fences admission, then calls
`closeAdmissionMany()` from Plan 02 with the immutable execution/amount list. Only after closure is confirmed may it finalize
the request without a debit and free its active-address slot. Closure writes a terminal receipt even if reserve
never succeeded, preventing a delayed duplicate from reserving after a top-up. A closure outage stays pending.
Never let followers start a second execution while the winner is still funding. Recheck cache freshness while
claiming the address so concurrent cache publication cannot cause a redundant charge.

Cache lookup requires matching organization, normalized address, evidence-policy version, settled conclusive
quality, and `now < evidenceObservedAt + cacheTtl`. The observed time is the oldest evidence required by the
conclusion. Add `VERIFICATION_RESULT_CACHE_TTL_SECONDS`, default 86400, accepting integers from 1 through 86400.
Cached supporting probes must carry their own timestamps and satisfy that bound. When no complete result exists,
old target-address SMTP cache must not silently substitute for new target evidence; expire or bypass it. A cached
catch-all control can support a new target probe but does not make that target result free. Unknown timestamp or
policy metadata makes an old record ineligible for reuse or billing. Recheck every required observation against
the configured TTL immediately before persisting a conclusive result and capture intention. If a supporting
control expired during the target probe, refresh that control within the execution deadline or finalize as
inconclusive and release. The default maximum and any configured shorter TTL apply at this decision boundary.

Acquire an execution lease through a short conditional update. SMTP and other external work run after commit.
Renewal, attempt takeover, and terminal cancellation increment or check a monotonically increasing generation.
Persist the result and capture-one/release intention only if the execution is still active and the generation
matches. Propagate an abort signal into SMTP and provider adapters. Failed renewal or observed cancellation closes
owned sockets and aborts outbound requests; it also stops all further commands. Reuse the existing absolute SMTP
deadline and add a five-second maximum between lease checks while a connection is open. Permit takeover must wait
until the prior lease plus that shutdown bound has passed. Financial fencing remains authoritative even if an
unresponsive process misses abort. Test both the financial fence and actual local-fixture connection shutdown.
Save at most one result per execution. Temporary blocking uses the existing five-attempt queue policy;
intermediate attempts do not finalize a result or debit. Terminal inconclusive results release the reservation.

Settlement calls Plan 02 with the same opaque execution reference on every attempt. On confirmation, mark the
execution and its requests terminal, expose the result, and publish eligible cache state. Followers receive the
same evidence with zero charge; replay of the payer request reports its original charge without another deduction.
If a process dies after credit capture but before this final marker, replay observes the existing capture and
finishes. If it dies before result persistence, the lease/retry path may probe again but can still charge only once.

Add a bounded BullMQ-backed reconciler that scans indexed nonterminal/intention rows in pages of 100. It recovers
funding confirmation, lost dispatch, expired worker leases, and unconfirmed settlement. Inspect immutable funding
ownership: an execution belonging to a batch group can be funded or closed only by replaying that whole group
manifest, never through individual reservation. The single-operation path rejects group-owned funding work.
At the 24-hour operation
deadline, atomically fence work before recording release. An existing durable capture intention wins over deadline
cancellation and must be settled, not changed to release. A credit-store outage retains pending recovery state;
it never invents a successful release or clears the reservation directly. Canceling unresolved funding uses the
same admission-closure receipt before reporting termination. No reconciler retains database locks
while calling queues or credits. Delete no active operation solely because its lease elapsed.

Add terminal request visibility expiry of seven days from confirmed terminal settlement, matching the planned job
availability. Guarantee keyed replay throughout that window. Optional verification request keys use canonical
lowercase UUIDv7 values: first admission accepts creation times no more than 24 hours old or five minutes ahead
of server time. Lookup an existing organization/key before applying that first-admission age check. An expired
known operation returns an expired-operation error; after its mapping is physically pruned, the timestamp in the
old key still prevents fresh admission. Keep opaque organization/key/request/terminal-time receipts until the
seven-day replay deadline; erase address-bearing request mappings only through the owner retention workflow.
There is no indefinite tombstone requirement. A new operation requires a new key. Cache expiry remains independent
of request visibility. Define these bounds with an injected clock and test both sides of every boundary.
Document the new address-bearing tables and fenced cancellation port in the processing contract and module README.

## Interfaces and Dependencies

Use `VerificationQuality` and evidence metadata from Plan 01 without accepting either from HTTP bodies. Provide
application operations equivalent to `admit(input)`, `execute(executionId)`, `read(requestId, organizationId)`, and
`reconcile(limit)`. Admission reports cached, joined, funded, insufficient-funds, conflict, or cooldown outcomes.
Keep the exact credits signatures from Plan 02; no TypeORM manager crosses either module's public interface.

Persist billing metadata per request: pending/settled state, reserved count, charged count, and final reason
(`conclusive`, `cached`, `shared`, `inconclusive`, or `failed`). The payer has at most one reserved/charged credit;
followers always have zero. Result evidence has an observed timestamp and cache expiry, independent of request time.
Add configuration validation through the existing host environment DTO and inject plain values into application code.

## Acceptance Criteria

- Fifty concurrent submissions for one organization/address produce one funded execution and at most one debit.
  A second organization gets independent work and cannot read the first organization's result or operation.
- A fresh complete result is returned without reservation at zero balance. At the exact expiry boundary it is
  unusable; an uncached request then requires available credit. Cache access does not move the expiry timestamp.
- An expired or metadata-free SMTP record cannot produce a newly dated, billable cached conclusion.
- A control that expires during target verification is refreshed or makes the final outcome free of charge, including
  when a shorter configured cache lifetime is used.
- Crash injection before/after reserve, result save, capture, and terminal marking converges to one terminal
  outcome, no duplicate debit, and no remaining reservation once the credit store is available.
- A worker that loses its generation cannot publish a result, capture credits, or resurrect canceled work.
- Lease loss closes its local-fixture socket within the shutdown bound; no replacement permit is issued early.
- A durable capture intention survives queue loss and settles without another SMTP call. A terminal failure
  releases without inserting a credit debit. A credit outage remains pending until replay succeeds.
- A delayed reservation after denied/canceled admission and replenishment sees a closed receipt and cannot hold
  funds. A group-owned execution is never funded separately by the per-execution reconciler.
- Equivalent request keys replay for seven days after settlement; conflicting input rejects. Expired UUIDv7 keys
  cannot start fresh work even after their request mappings are removed.
- Architecture checks pass with no direct cross-module persistence import or transaction spanning external calls.

## Validation

Create the focused operation suites and a dedicated runner `scripts/testing/verification-billing-postgres.ts`.
Reuse the ownership checks and disposable database approach in `scripts/testing/credits-postgres.ts`; provision a
separate checkout-owned `verification_billing_test` database, reject skipped/empty integration runs, and register
`test:verification-billing-postgres`. Never point schema synchronization at an application database.

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/application/operations/verification-operations.spec.ts src/libs/modules/email-verification/src/application/operations/verification-settlement.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution-store.spec.ts --runInBand
corepack pnpm test:verification-billing-postgres
corepack pnpm test:credits-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md docs/privacy/email-verification-processing-contract.md .agents/plans/verification-billing/03-recover-operations-and-cache-results.md
```

Use a fake clock for expiry and fencing. Real PostgreSQL tests must exercise unique indexes, concurrent admission,
result/intention atomicity, and credit recovery through real module adapters. Bruno is not applicable to this PR's
unmounted capability; Plan 04 must supply HTTP evidence before claiming the billing policy is active.

## Idempotence and Recovery

All durable effects use execution/request identities rather than queue delivery IDs. Recovery never guesses that
a missing queue job means no charge. Read the stored intention and the ledger outcome, then resume the same step.
For incompatible disposable application data, use `corepack pnpm dev:reset -- --confirm-project=LEF` only after the
script confirms this checkout owns the development stack. It recreates state and runs Keycloak/customer reseeding.
Run isolated tests instead if another checkout owns the stack. Add no migrations or production recovery tooling.

## Artifacts and Notes

Plan 04 owns HTTP activation and Plan 05 owns batch admission groups and row mappings. These prerequisites remain
independently testable through application ports. Implementation evidence has not been collected for this plan.

## Plan readiness

Ready to implement
