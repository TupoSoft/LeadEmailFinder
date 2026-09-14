# Claim Verification Keys Before Funding Work

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A conflicting verification request must return `409` without reserving credit, probing an address, or creating
runnable work. Concurrent equivalent requests must recover one public request handle and at most one charge.
This plan delivers one PR, `fix(email-verification): claim request keys before funding`.

## Progress

- [ ] (2026-09-15) Add a durable request identity and its admission recovery state.
- [ ] (2026-09-15) Fence funding behind the committed admission decision and integrate replay/recovery.
- [ ] (2026-09-15) Add concurrent-key, crash-recovery, HTTP, and Bruno coverage.
- [ ] (2026-09-15) Complete focused validation and update the module documentation.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reuse the request row and its organization/key unique index rather than add a separate receipt table.
  Rationale: The row is also the public recovery handle. Date/Author: 2026-09-15, Codex planning.
- Decision: Persist an admission decision before funding; concurrent recovery converges through a conditional
  update and stable execution UUID. Rationale: No process lease or database lock must span credit calls or SMTP.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Leave serialization between request attachment and execution settlement to hardening plan 03.
  Rationale: Key ownership and completion races have separate acceptance criteria. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The inspected implementation is PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`, based on
`2ac6ea303e40e78efca92da8baf82d838a337a6d`. PR #629 merged as
`d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`, which supplies the reviewed routes and completes
`verification-billing/04`. This documentation PR uses that merge as its base. Paths below are repository-relative.

`src/libs/modules/email-verification/src/application/operations/verification-admission.service.ts` first looks up
an optional client key, then claims an address, reserves credit, queues execution, and finally inserts the request.
`infrastructure/persistence/typeorm-verification-request.store.ts`, under the same module `src/` directory,
detects a conflicting key too late to undo those effects. The async service returns the conflict while
`verification-reconciler.ts` can subsequently execute the orphan. Credits use the execution UUID as their stable
operation identifier through the public `CreditReservationService` interface.

A real PostgreSQL reproduction paused request B after its missing-key lookup, completed admission A with the
same organization/key and another address, then resumed the paused request. A was accepted and B conflicted; two credits were
reserved. Reconciliation completed both executions and reduced balance from 10 to 8, despite only one request row.

## Scope and Non-Goals

Change keyed admission, equivalent replay, and recovery needed to prevent orphan funding. Preserve optional keys,
organization isolation, fingerprint rules, cache pricing, the existing rate limit, and credit-provider boundaries.
Do not redesign settlement, fix terminal attachment races, change SMTP policy, add client retries, or alter batch
billing. Plan 03 will use the request ownership contract introduced here for every attachment path.

## Plan of Work

Extend `infrastructure/persistence/typeorm/verification-request.entity.ts` and
`application/ports/verification-request-store.ts` with `admissionState: 'preparing' | 'ready'` and an immutable
`candidateExecutionId` UUID, plus `fundingDenied: boolean` defaulting to false. A new request begins with its normalized address, delivery mode, organization,
optional key, public request UUID, candidate UUID, source `fresh`, pending billing, and zero reserved/charged counts.
A preparing row is a receipt, not permission to fund or run an execution. Existing completed fixture rows must
explicitly initialize the new state; incompatible local databases are reset as described below.

Implement `claimAdmission(input)` in the request store. Insert using PostgreSQL `ON CONFLICT DO NOTHING` against
the existing partial organization/key unique index; after a conflict, read the committed winner. Compare normalized
address and delivery mode before returning `owned`, `replayed`, or `key-conflict`. Equivalent input retains the
stored IDs. Different organizations may reuse a key. No credits, address execution, or dispatch precedes this claim.
Input without a key receives a fresh row and IDs through the same method. A transaction rollback leaves no visible claim. Reject a new address cooldown before claiming, after checking
existing-key replay. A cooldown appearing after the receipt exists defers recovery until it elapses; it must not
reject an accepted receipt and later execute it silently.

Refactor the admission service into claim and `resumeAdmission(requestId, organizationId)` stages. The owner uses
the stored candidate UUID, first checking whether that execution already exists before calling `claimOrJoin`.
An existing candidate belonging to this payer remains its candidate even when another recovery attempt sees it;
it must not become a zero-charge follower of itself. Cache, shared-execution, and fresh-execution choices are
committed through `finalizeAdmission`, a conditional `preparing` to `ready` update that returns the authoritative
stored decision to every caller. This update deliberately does not claim the execution settlement lock; plan 03
will close that remaining attachment race. Never overwrite an already-ready decision with a later cache lookup.

Only a ready request whose source is `fresh`, whose execution matches its candidate, and whose ID matches the
execution payer may call `reserve` while `fundingDenied` is false. Use its stable execution UUID on every retry. Record `reservedCount: 1` only
after a reserved receipt is confirmed, then transition to queued; a released receipt must never become runnable.
On insufficient funds, conditionally set `fundingDenied` under the execution lock while still funding-pending.
Queued publication checks that flag under the same lock; if queuing already won, use its funded outcome instead.
Fence a denied candidate through `closeAdmissionMany`, then cancel and settle its request at zero. Recovery completes this closure before doing anything else for a denied request;
equivalent retries retain `402` and replenishment cannot resurrect its reservation.
A competing admission decision can select another execution or a cache result. Close and cancel the unused
candidate without touching the selected execution. A stale worker may create an unused candidate after
losing finalization; the same recovery rule must find and close it before any funding. No follower reserves credit.

Add bounded `pagePreparingAdmissions(limit)` recovery to `verification-reconciler.ts`, using the same resume
method and a deadline of request creation plus the existing execution deadline. Concurrent sweeps require no lease:
conditional finalization selects one decision, candidate IDs are stable, and credit admission is idempotent. A
funding-pending execution is eligible for funding only through its ready matching payer; a preparing payer is
resumed first. An unused candidate is closed through `closeAdmissionMany` before terminal cancellation. On deadline
expiry, conditionally finalize failure only while preparing, fence its candidate, and settle the request at zero.
If finalization already chose funded work, follow that execution's existing cancellation/settlement contract.

Add a `replayed` admission outcome carrying the request ID. Both delivery services return or poll that handle
without starting another admission. A preparing request reads as queued and async replay returns `202`, including
before execution attachment; synchronous replay may poll within its existing response budget. Terminal equivalent
replay uses the existing result/failure. Retain seven-day visibility from settlement and return the existing expired
key outcome afterward; timestamp checks apply only when the key has no stored request. Preserve current `409` and
`402` meanings. Update core provider factories, focused fixtures, and the module README for the new recovery state.

When modifying the async collection, update its registered counts in `scripts/bruno/run-collection.mjs`
and its fake workflow in `scripts/bruno/async-verification-runner.test.mjs` in the same PR. Preserve
the existing unsafe-response rejection and independent fixture reset, then run the focused Node test.

## Interfaces and Dependencies

The request-store port gains claim, conditional finalization, and bounded preparing-page operations; request records
carry the new admission fields. The admission service gains an internal resume entry point and replay outcome.
Reuse the execution, settlement, clock, and credits ports; do not import identity persistence into verification.
No route, authentication permission, configuration setting, external library, or public billing field changes.

## Acceptance Criteria

- Concurrent different addresses using one organization/key yield one accepted handle and one `409`; only the
  accepted address is probed, one reservation exists, and conclusive recovery reduces a balance of 10 to 9.
- Concurrent equivalent calls, including a replay before attachment, return the same usable handle; recovery
  produces one payer execution, one conclusive charge, and truthful reserved/charged metadata.
- Crashes after the claim, candidate creation, decision commit, reservation, and queued transition recover from
  durable state. Losing or expired admissions cannot acquire a delayed reservation after account replenishment.
- Cached, shared, insufficient-funds, expired-key, cross-organization, and behavior without keys remains compatible.
- Type checking, the architecture gate, focused PostgreSQL/HTTP tests, and changed-document prose checks pass.

## Validation

Run these commands from the implementation checkout; the commands below have not run for an implementation:

```sh
corepack pnpm exec jest --runInBand verification-admission.service.spec.ts typeorm-verification-request.store.spec.ts verification-reconciler.spec.ts async-email-verification.service.spec.ts run-synchronous-verification.spec.ts
corepack pnpm exec jest --runInBand async-email-verification-http.integration.spec.ts synchronous-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/01-claim-idempotency-keys-before-funding.md src/libs/modules/email-verification/README.md bruno/async-verification/README.md
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:async-verification
```

Extend `verification-billing.integration.spec.ts` with barriers after the missing-key lookup and before the competing decision,
then run real reconciliation with a deterministic conclusive mailbox stub and real credit adapters. Assert addresses
probed, request/execution counts, balance/reserved counts, and delayed reserve fencing. Repeat with equivalent keys
and inject failures at each durable boundary. These assertions require real PostgreSQL, not mocked unique indexes.
Bruno: update `bruno/async-verification` to verify equivalent/conflicting replay, stable handles, and unchanged balance
after rejection; preserve organization concealment coverage. Use `bru run --env local` in that collection after its
launcher prepares local dependencies. Report unavailable runtime separately from static collection validation.

## Idempotence and Recovery

All retries reuse the stored request and candidate UUIDs. Never manually mark an incomplete admission funded or
remove its receipt to retry. Tests use the runner-owned `verification_billing_test` database; rerunning
`corepack pnpm test:verification-billing-postgres` synchronizes and reseeds that disposable schema. No migrations or
backfills are allowed. If the disposable application schema is incompatible, use `corepack pnpm dev:reset`, confirm
only the intended `LEF` stack, and let the script reprovision Keycloak and reseed its customer, credentials, and
credits. Keep generated secrets in ignored files. This plan authorizes no reset during documentation work.

## Artifacts and Notes

Read root/module `AGENTS.md`, the canonical module README, and the local PostgreSQL skill before implementation.
Keep database transactions short and request fingerprints immutable. This PR makes key ownership durable; terminal
attachment remains a separate invariant verified and completed by `verification-billing-hardening/03`.

## Plan readiness

Ready to implement
