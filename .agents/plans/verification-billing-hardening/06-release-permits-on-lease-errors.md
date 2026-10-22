# Release Execution Permits When Lease Acquisition Fails

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Return the global execution slot immediately when acquiring a verification lease fails. A database error before
SMTP starts must not consume one of the five default slots until its 60-second expiry, and cleanup must preserve
the original execution error when cleanup itself also fails.

## Progress

- [ ] (2026-09-15) Protect every operation after successful permit acquisition with one resource-release boundary.
- [ ] (2026-09-15) Verify lease errors, unsuccessful acquisition, release errors, and timer disposal.
- [ ] (2026-09-15) Run focused application and persistence checks and update the module's validation notes.

## Plan dependencies

- `verification-billing/04`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Start `try/finally` immediately after `tryAcquire()` reports success, enclosing lease acquisition.
  Rationale: the permit is committed independently before the execution row is leased. Date/Author: 2026-09-15,
  Codex planning.
- Decision: Attempt cleanup once per acquired permit and preserve a primary error if release also rejects.
  Rationale: release failure must not replace the cause of the failed attempt. If there is no primary error,
  retain the existing behavior of propagating release failure. Date/Author: 2026-09-15, Codex planning.
- Decision: Preserve lease expiry and permit expiry as the existing crash fallback. Rationale: this is a local
  error-path correction that preserves the lease policy across workers. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c` adds global execution permits to
`src/libs/modules/email-verification/src/application/operations/verification-execution-runner.ts`.
`execute()` generates a lease-owner ID, calls `permits.tryAcquire()`, and then calls `executions.acquireLease()`.
The current `try/finally` starts only after that second call and renewal timer setup. A rejected lease acquisition therefore
skips release entirely. A null lease has its own manual release branch, duplicating ownership cleanup.

The permit adapter in `infrastructure/persistence/typeorm-verification-execution-permit.store.ts`, relative to
the same module's `src/`, inserts a permit in its own transaction. Expired permits are removed only when a later
acquisition runs. `release()` deletes by the generated lease ID and is safe to repeat, but database errors can
propagate. The runner's permit cleanup is independent of its generation-fenced execution lease and credit state.

`verification-execution-runner.spec.ts` already covers cap exhaustion, null leases, terminal outcomes, renewal,
and renewal rejection. Extend it with failed lease acquisition and combined operation and release failures.
The global cap protects both synchronous and asynchronous single executions; this change must preserve their
existing queue retry and operation recovery behavior.

## Scope and Non-Goals

Deliver one PR, titled `fix(verification): release permits after lease acquisition errors`, limited to the runner,
the focused specifications, a narrow Postgres integration regression, and module documentation. Do not change
permit counts, renewal cadence, expiry values, generation semantics, queue backoff, public error responses,
credit settlement, or batch orchestration. This plan restores available concurrency immediately after a local
lease failure and does not depend on another hardening plan.

## Plan of Work

Read the module architecture instructions and README. Keep `tryAcquire()` outside the cleanup boundary until it
reports true. A false outcome still returns `permit-unavailable`, and a thrown acquisition error still propagates;
neither case starts a timer, acquires an execution lease, or calls release when no permit was acquired.

Immediately after successful acquisition, enter one outer `try/finally`. Move `executions.acquireLease()` into
that protected block and remove the separate release call for a null lease. Return `not-runnable` for null as
before; the common `finally` now releases that slot. Create the abort controller and renewal timer only after a
lease has actually been acquired. Keep a nullable timer handle that cleanup clears only when initialized.

Preserve the existing inner probe/settlement `try/catch` and its retry decisions. The outer boundary owns permit
lifetime only; it must not turn lease-acquisition exceptions into probe retries or change credit outcomes.
Record whether a primary operation error escaped the protected block, including non-Error thrown values. In
`finally`, clear the timer before awaiting release. Attempt release once. If release fails after a primary error,
propagate the original thrown value; if release is the only failure, propagate the release error as before.
Use a boolean to distinguish no primary error from a primary throw of `undefined`.

Add focused tests with rejected lease acquisition after successful permit insertion. Assert the same lease-owner
ID is released once, the original error is preserved, no probe or settlement runs, and no timer survives.
Cover success, null lease, a stale-generation outcome, a thrown probe retry operation, and release errors without
duplicating tests that already prove unchanged behavior. With fake timers, assert that advancing time after each
completed attempt does not call either renewal port. Also cover `tryAcquire()` false and rejection separately.

Add one real-Postgres case to `infrastructure/persistence/verification-billing.integration.spec.ts`: use the real
permit adapter with cap one, inject an execution-store lease rejection, await the runner failure, and immediately
acquire another permit with a different ID. That second acquisition must succeed without advancing the clock or
waiting for expiry. Delete only the case's own rows through the existing suite cleanup.

Update `src/libs/modules/email-verification/README.md` to identify the lease-error cleanup regression coverage.
Keep the implementation within application ports; no new infrastructure import belongs in the runner.
Coordinate the shared runner file if another hardening PR has already landed, preserving its domain checks and
terminal cancellation behavior while placing them inside this same permit lifetime.

## Interfaces and Dependencies

No public interface changes. Preserve `VerificationExecutionPermits`, `VerificationExecutionStore`, the runner
constructor, and `ExecutionOutcome`. The adapter's `release(leaseId): Promise<void>` remains the cleanup operation.
No HTTP route, request, response, status code, authentication rule, environment variable, library, or database
schema changes. Existing generation fencing and immutable credit-operation identities remain authoritative.

## Acceptance Criteria

- After a successful permit acquisition followed by a rejected execution lease, release is called exactly once
  with the acquired permit's ID, and the original lease error reaches the caller.
- No renewal timer, mailbox probe, settlement call, or execution retry is created by a failed lease acquisition.
- Null leases, successful completion, and existing terminal outcomes release exactly once; completed attempts
  leave no active renewal timer.
- A rejected or denied permit acquisition invokes neither lease acquisition nor release. When execution and
  release both throw, the execution error wins; when only release throws, its error still propagates.
- With a real Postgres permit cap of one, a second acquisition succeeds immediately after the failed lease case,
  without waiting for expiration. Focused tests, type checking, and the architecture gate pass.

## Validation

Run these commands from the repository root:

```sh
corepack pnpm exec jest --runInBand verification-execution-runner.spec.ts typeorm-verification-execution-permit.store.spec.ts
corepack pnpm exec jest --runInBand verification-execution.processor.spec.ts run-synchronous-verification.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/operations/verification-execution-runner.{ts,spec.ts} src/libs/modules/email-verification/src/infrastructure/persistence/verification-billing.integration.spec.ts
corepack pnpm architecture:check
corepack pnpm typecheck
```

Use the dedicated disposable Postgres fixture already owned by `test:verification-billing-postgres`; do not reset
or reconfigure an existing development service. Report container availability separately from unit and static results.
Bruno: not applicable — this corrects permit ownership below the HTTP boundary without changing any HTTP contract;
the runner and real-Postgres tests directly prove the resource-release behavior. No test result is claimed here.

## Idempotence and Recovery

Deleting a permit by lease ID is already idempotent, while this runner now attempts normal cleanup only once.
If the database is unavailable during release, existing expiry remains the crash and outage fallback; do not
introduce a second cleanup loop in this change. No migration, reset, or reseed is required. Rerun isolated tests
after a failure and remove only their own fixture rows. Follow the root issue and PR workflow at implementation.

## Artifacts and Notes

The review's controlled application reproduction returned `acquired: 1, released: 0` when lease acquisition
rejected after permit success. It did not run a live database outage. The planned Postgres test adds direct
capacity evidence. Recheck the prerequisite's runner structure before editing, preserving other landed fixes.

## Plan readiness

Ready to implement
