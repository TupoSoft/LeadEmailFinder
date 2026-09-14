# Commit Email Cache Publication with Settlement

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A completed verification must publish its Email cache link and existence value even when a database write fails
once. Credit settlement and cache publication must recover without another charge or another SMTP probe.
This plan delivers one PR, `fix(email-verification): publish email cache with settlement`.

## Progress

- [ ] (2026-09-15) Move Email cache publication into the settlement confirmation transaction.
- [ ] (2026-09-15) Preserve settlement recovery without reopening a probe after publication failure.
- [ ] (2026-09-15) Add transactional failure, replay, and visible cache regression coverage.
- [ ] (2026-09-15) Complete focused PostgreSQL, HTTP, Bruno, and prose validation.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Publish the Email row in the same email-verification transaction that confirms settlement.
  Rationale: These entities share a database and module, so another recovery flag or outbox is unnecessary.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Keep the credit capture/release outside that transaction and reuse its stable execution UUID.
  Rationale: Existing credit receipts already make replay safe across the module boundary.
  Date/Author: 2026-09-15, Codex planning.
- Decision: Fence retry takeover once a result intention exists, including after cache publication fails.
  Rationale: Recovery must finish the recorded decision without probing again. Date/Author: 2026-09-15, Codex planning.
- Decision: Use execution, intention, request, then Email lock order, matching hardening plan 03.
  Rationale: The plans can merge independently without introducing opposing lock orders.
  Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The inspected behavior comes from PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`, based on
`2ac6ea303e40e78efca92da8baf82d838a337a6d`. PR #629 merged as
`d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`, completing `verification-billing/04` and providing the base of this
documentation PR. All paths below are repository-relative.

Under `src/libs/modules/email-verification/src/`,
`application/operations/verification-settlement.service.ts` calls credits, commits
`infrastructure/persistence/typeorm-verification-settlement.store.ts::confirmSettlement`, and then calls
`EmailAdministrationService.upsertEmail`. Confirmation makes the intention confirmed, the execution completed,
and linked requests settled. The later upsert sets `Email.exists` and `Email.lastVerificationId`.
A failure there is invisible to reconciliation: confirmed intentions are excluded and repeated `settle` returns early.

A deterministic service reproduction made that upsert throw once after successful confirmation. Removing the fault
and invoking settlement again did not retry the upsert: one total publication attempt, completed execution, and zero
pending intentions. Separately, the runner catches settlement failures and invokes `takeoverForRetry`; its current
store predicate admits `settling`, which can reopen probing while an immutable result decision already exists.

## Scope and Non-Goals

Make confirmation and Email publication atomic, and retain the persisted settlement decision across failures.
Preserve credit pricing, cache eligibility, legacy/batch result visibility, organization ownership, and existing
Email administration fields. No schema change, new queue, recovery flag, external service, or customer-facing field
is needed. Do not redesign admission, change attachment semantics, broaden batch billing, or fix general cache
freshness policy. This PR enables reliable visible cache state independently of hardening plans 01 and 03.

## Plan of Work

Change `TypeOrmVerificationSettlementStore.confirmSettlement` to acquire the organization-owned execution lock,
then its intention lock, and then linked requests in request-ID order. Verify the recorded result belongs to the
same organization. An already-confirmed intention returns its current result identity without another cache write.
For pending intentions, update the Email cache through the same transaction's `EntityManager`, before commit.
The resulting transaction must include Email publication, request billing updates, execution completion, and
intention confirmation; any error rolls all of those changes back.

Implement a narrow internal helper in the persistence adapter for the Email write. Reuse the shape of
`typeorm-email.store.ts`: normalized address supplies the Email ID, username, and domain; the result supplies
`exists`; the immutable intention supplies `lastVerificationId`. Insert a missing Email row with
`ON CONFLICT DO NOTHING`, then lock the organization/address row and apply only those two cache fields.
Preserve format and unrelated administration metadata. Update timestamps through the existing TypeORM mechanisms.
This method may use `EmailEntity` directly because both entities belong to the same module's persistence layer;
it must not call a repository backed by the global manager outside the confirmation transaction.

Simplify `VerificationSettlementService` so it calls credit capture/release and then confirmation. Remove its
`EmailAdministrationService` constructor dependency and the post-confirm upsert. Update the factory in
`infrastructure/email-verification-core.module.ts`, the settlement-store return type in
`application/ports/verification-settlement-store.ts`, and affected service/composition fixtures. Return only the
result identity needed by callers; do not expose cache implementation fields through the application port.
Keep credit calls outside the transaction. A credit call that succeeds before confirmation fails is retried by
execution UUID and must replay its receipt rather than charge again.

Strengthen `TypeOrmVerificationExecutionStore.takeoverForRetry`: while holding the execution lock, reject a
`settling`, completed, or canceled execution, and reject any execution with a persisted settlement intention.
This preserves the same generation and recorded result after a publication failure. Its port contract must state
that result settlement cannot be reopened as SMTP retry. The runner's existing retry helper then returns its
non-runnable/lease-lost path when takeover is refused; the synchronous route returns its accepted handle and the
worker finishes without scheduling another probe. The reconciler's pending-intention page owns the next attempt.
Do not introduce a new public status or claim the result is completed before confirmation succeeds.

Test a post-capture Email-write failure inside the real confirmation transaction. The expected intermediate state
is a replayable captured credit receipt, a pending intention, a settling execution, pending requests, and the old or
absent Email cache row. A second reconciliation sweep confirms all state and publishes the link. The same holds for
a release intention except no debit exists. Also inject failure after the Email write but before confirmation commit
to prove the Email update rolls back with the other state. Verify that a previously confirmed replay never rewrites
an Email row later changed through another permitted workflow.

Update `application/operations/verification-settlement.service.spec.ts`,
`infrastructure/persistence/typeorm-verification-settlement.store.spec.ts`, execution store/runner tests, and
`verification-billing.integration.spec.ts`. Adjust the module README to identify atomic publication as the visibility
boundary. Keep existing Email administration routes and store interfaces unchanged outside the removed dependency.

## Interfaces and Dependencies

`VerificationSettlementStore.confirmSettlement` owns the entire local confirmation transaction and returns the result
UUID. `VerificationSettlementService` depends only on settlement and credits ports. Retry takeover explicitly excludes
persisted intentions. No new business-module dependency, environment variable, table, HTTP contract, or library is added.
If plan 03 has merged, retain its terminal-aware attachment and lock order unchanged while adding Email last.

## Acceptance Criteria

- After a successful fresh settlement, the organization's Email row points to the confirmed result and matches its
  existence value; unrelated Email fields and foreign organizations' rows are preserved.
- Failure before or after the Email write rolls back every confirmation change, leaving the intention recoverable
  and the new result hidden. A later sweep publishes the cache and terminal request state together.
- Capture and release recovery each use one immutable result; a capture charges once, a release charges zero,
  and neither path issues an additional SMTP probe after its intention has been persisted.
- Concurrent settlement calls and confirmed replays do not double-charge, duplicate Email rows, rewrite later cache
  changes, change result identity, or produce a deadlock.
- Architecture, type checking, focused PostgreSQL/HTTP tests, and changed-document prose checks pass.

## Validation

Run these commands from the implementation checkout; no implementation test result is claimed here:

```sh
corepack pnpm exec jest --runInBand verification-settlement.service.spec.ts typeorm-verification-settlement.store.spec.ts typeorm-verification-execution.store.spec.ts verification-execution-runner.spec.ts verification-reconciler.spec.ts
corepack pnpm exec jest --runInBand verification-result-http.integration.spec.ts async-email-verification-http.integration.spec.ts synchronous-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/05-recover-settled-email-cache-updates.md src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md
corepack pnpm bruno:smtp-dev
```

Extend the real PostgreSQL suite with a deterministic failure at the transaction-owned Email save and a failure
immediately before confirmation commit. Use a test-only adapter/query barrier rather than a production failure switch.
Read the credit account, receipt, intention, execution, request, and Email rows after failure and recovery. Count
mailbox calls through the real runner; one existing probe must remain one after any number of settlement retries.
Bruno: update `bruno/smtp-dev` so its owned admin-cache read checks the completed result UUID and existence value,
then confirms a repeated status read preserves that link and balance. Keep foreign-cache concealment assertions.
Run `bru run --env local` in the collection after its launcher prepares local dependencies. Report unavailable
SMTP/runtime execution separately; static collection checks do not demonstrate transaction rollback.

## Idempotence and Recovery

Retry the pending intention through normal reconciliation; never manually set it confirmed to bypass a cache error.
Credit capture/release is already keyed by execution UUID, and local transaction rollback leaves exactly the state
needed for another confirmation attempt. A process crash after commit needs no repair: all publication state is durable.
No migrations, backfills, or schema reset are required by the implementation. The PostgreSQL test runner recreates
and reseeds its own disposable `verification_billing_test` schema on each run. If unrelated local fixture damage
requires a full reset, use `corepack pnpm dev:reset`, confirm only the intended disposable `LEF` stack, and let its
provisioning steps reseed Keycloak, the customer, credentials, and credits. Do not run that reset while authoring plans.

## Artifacts and Notes

Read root/module instructions and the local PostgreSQL transaction guidance before implementation. The reviewed
service reproduction establishes the existing failure; the planned real PostgreSQL rollback tests establish the fix.
Keep the execution-first lock order aligned with plan 03 without adding a dependency that is unnecessary for this PR.

## Plan readiness

Ready to implement
