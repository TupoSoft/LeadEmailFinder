# Settle Requests That Join a Finishing Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Every accepted request that shares a verification must eventually receive its settled result or safe failure.
An execution finishing during admission must not leave its new request handle permanently reporting `running`.
This plan delivers one PR, `fix(email-verification): serialize attachment with settlement`.

## Progress

- [ ] (2026-09-15) Implement terminal-aware request attachment under the execution lock.
- [ ] (2026-09-15) Align settlement and cancellation lock order with admission finalization.
- [ ] (2026-09-15) Cover both race orders, cancellation, replay, and organization boundaries.
- [ ] (2026-09-15) Complete focused PostgreSQL, HTTP, Bruno, and documentation validation.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Serialize attachment and terminal settlement on the execution row, then lock the request rows.
  Rationale: One database boundary decides whether attachment is pending or already settled.
  Date/Author: 2026-09-15, Codex planning.
- Decision: A follower that attaches after completion inherits the confirmed result with zero charge; after
  cancellation it receives the existing safe failure with zero charge. Rationale: Admission already selected the
  shared work, so no fresh reservation or probe is needed. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep the key claim from plan 01 independent from the execution lock; strengthen its finalization operation here.
  Rationale: A durable key does not itself serialize attachment. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Evidence was collected from PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`, whose base is
`2ac6ea303e40e78efca92da8baf82d838a337a6d`. PR #629 merged as
`d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`, the base of this documentation PR.
Paths below are repository-relative. Completed prerequisite `verification-billing/04` supplies the reviewed HTTP
flow; hardening plan 01 supplies durable request ownership and conditional admission finalization.

Inside `src/libs/modules/email-verification/src/`, `application/operations/verification-admission.service.ts`
claims or joins an execution through `infrastructure/persistence/typeorm-verification-execution.store.ts`.
The request is attached later through `typeorm-verification-request.store.ts`. Meanwhile,
`typeorm-verification-settlement.store.ts` confirms an intention, completes the execution, and settles only the
requests its transaction can currently find. A confirmed intention and completed execution leave recovery queues.
`application/operations/verification-operations-reader.ts` trusts the request's billing state; the async mapper
therefore reports a pending request against a completed execution as `running`.

In a real PostgreSQL reproduction, pause follower B immediately before its request insertion, execute and settle
payer A, and then allow B to insert. B is accepted but remains pending after reconciliation and explicit settlement
replay, with no pending intention. Plan 01 creates the follower receipt earlier but intentionally leaves its execution
association separate; this same schedule must remain a failing regression until the current plan is implemented.

## Scope and Non-Goals

Change attachment, terminal-state inheritance, and the lock ordering needed for those transitions. Cover requests with and without
keys, fresh payers, followers, completion, and cancellation. Preserve pricing, public state vocabulary,
settlement visibility, organization concealment, cache eligibility, and seven-day request visibility.
Do not change provider policies, reservation amounts, execution permits, queue dispatch, schema, or batch billing.
No browser changes or historical repair job belongs in this PR. It unlocks reliable shared operation handles.

## Plan of Work

Strengthen `finalizeAdmission` in `application/ports/verification-request-store.ts`, introduced by plan 01, to
atomically attach to an execution and return the authoritative request record. The TypeORM implementation must
lock the selected execution with its organization predicate before locking the preparing request. Reread the
execution after acquiring the lock; do not trust the state returned by the earlier `claimOrJoin` transaction.
Verify request organization and immutable identity. An already-ready request returns its stored decision without
rebinding to a later execution. Cached finalization remains a separate no-execution branch of this same port.

When the locked execution is funding-pending, queued, running, awaiting retry, or settling, attach the request as
pending before releasing that lock. In `settling`, the result is not yet public: attach without exposing it and
let confirmation include this request. A new follower retains source `shared`, zero reserved count, and zero charge.
Preserve the existing payer identity and its recorded reserve count; never promote another request to payer.

When the execution is completed, read its confirmed settlement intention while still holding the execution lock.
Copy the result ID and set billing state to settled in the attachment transaction. A follower gets final reason
`shared` and zero charge; the actual payer, if replayed, retains the intention's capture/release outcome and its
original counts. Use the intention's confirmation timestamp as `settledAt` so attachment or replay cannot extend
the seven-day terminal visibility window. A completed execution without its confirmed intention is an invariant
failure: abort and retain preparing recovery state instead of inventing an empty success.

When the execution is canceled, attach and settle a new follower as a safe failed request with no result and no
charge. Reuse the execution's terminal update time for the visibility origin. Payer cancellation remains owned by
the existing close/release cleanup path; do not claim the payer's billing is settled while its reservation remains
open. After attachment commits, invoke that idempotent cleanup when needed, leaving a pending payer visible to the
existing query for incomplete cancellations if credit release fails. No canceled execution may be probed again by attachment.

Align all competing mutation paths: `confirmSettlement` must acquire execution, settlement intention, and request
locks in that order; lock multiple request rows in request-ID order. `settleCanceled` must acquire and validate the
canceled execution before updating requests in the same order. `persistResultAndIntention` already starts from the
execution; preserve that order. Never lock an existing attached request and then acquire its execution. Keep cache
publication, when supplied by hardening plan 05, after these locks. No credit, SMTP, queue, or other external call
runs inside these transactions. Record the ordering contract on the affected store ports and helpers.

Update admission callers to interpret the returned stored request, not a stale claim snapshot. An attachment that
settled immediately returns a usable handle/result; it does not dispatch another execution or reserve another credit.
Preserve finalization's conditional transition from plan 01, including equivalent replay and losing-candidate cleanup.
Update request/settlement store fixtures, admission service tests, and the module README. Keep the request reader's
pending-state mapping defensive; do not hide the race by labeling every completed execution's pending request done.

When modifying the async collection, update its registered counts in `scripts/bruno/run-collection.mjs`
and its fake workflow in `scripts/bruno/async-verification-runner.test.mjs` in the same PR. Preserve
the existing unsafe-response rejection and independent fixture reset, then run the focused Node test.

## Interfaces and Dependencies

Strengthen the existing finalization contract without adding public DTOs, queue payloads, environment variables, or
external dependency. The TypeORM request store may coordinate same-module request/execution/intention entities;
application code remains framework-independent. Settlement and cancellation continue through their existing ports.
`VerificationRequestRecord` remains the authoritative source of per-request billing metadata.

## Acceptance Criteria

- If B attaches before A confirms, both requests settle; if A confirms first, B is immediately settled when its
  attachment commits. Both orders yield the same result, one payer charge, and zero follower charge.
- A stale execution selected as nonterminal but locked after conclusive or inconclusive completion never leaves a
  pending follower. Reconciliation and repeated status reads cannot turn its result back into `running`.
- Joining `settling` hides the result until confirmation. Joining cancellation yields safe zero-charge failure;
  a failed payer release remains recoverable and never appears as confirmed billing prematurely.
- Concurrent finalization, confirmation, cancellation, and replay do not deadlock, reassign a payer, extend terminal
  visibility, create another reservation, or expose a foreign organization's result.
- Focused PostgreSQL/HTTP checks, type checking, architecture validation, and changed-document lint pass.

## Validation

Run these commands from the implementation checkout; no implementation validation is claimed by this document:

```sh
corepack pnpm exec jest --runInBand typeorm-verification-request.store.spec.ts typeorm-verification-execution.store.spec.ts typeorm-verification-settlement.store.spec.ts verification-admission.service.spec.ts verification-operations-reader.spec.ts verification-reconciler.spec.ts
corepack pnpm exec jest --runInBand async-email-verification-http.integration.spec.ts synchronous-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/03-serialize-request-attachment-with-settlement.md src/libs/modules/email-verification/README.md bruno/async-verification/README.md
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:async-verification
```

Add deterministic barriers in `verification-billing.integration.spec.ts`: admit a payer; start a follower and pause after selecting
the execution; settle the payer; release the follower. Repeat with the pause after B acquires the execution lock so settlement must wait.
Use real TypeORM and credit adapters, a deterministic mailbox stub, and assertions on both public handles, request
rows, counts, and balance. Include inconclusive completion, cancellation with one failed release, and concurrent
replay. Use a finite test timeout so a lock-order regression fails instead of hanging the suite.
Bruno: extend `bruno/async-verification` with two same-address submissions and poll both handles to terminal states,
asserting equal results where completed and zero follower charge. Run `bru run --env local` in the collection after
its launcher prepares dependencies. Database barriers provide the race proof; Bruno supplies public workflow coverage.

## Idempotence and Recovery

Repeated attachment returns the existing request decision, and repeated confirmation/cancellation remains idempotent.
A rolled-back attachment stays preparing and is recovered by plan 01; a committed attachment is included in settlement
or already contains its confirmed terminal outcome. No schema change, migration, backfill, or production recovery is
required. Rerun `corepack pnpm test:verification-billing-postgres` to recreate and seed the disposable test schema.
If local application fixtures need rebuilding, use `corepack pnpm dev:reset` only for the intended disposable `LEF`
stack; its confirmation and reseeding restore Keycloak, customer credentials, and credits. Do not reset during planning.

## Artifacts and Notes

Read root/module instructions and the local PostgreSQL locking guidance before implementation. Preserve the key-claim transaction boundary from plan 01: this PR alone owns serialization of execution attachment with settlement. Plan 05
may independently add atomic Email publication after request updates while respecting this lock order.

## Plan readiness

Ready to implement
