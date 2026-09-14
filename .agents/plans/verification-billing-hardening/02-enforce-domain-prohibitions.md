# Enforce Stored Domain Prohibitions for Single Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make both single-verification routes honor the operator's stored domain prohibition before creating new work.
Recheck the prohibition before queued work probes a mailbox. A prohibited attempt must not contact SMTP or
capture a credit; a financial decision already persisted remains authoritative.

## Progress

- [ ] (2026-09-15) Enforce the stored policy during admission and before each execution attempt.
- [ ] (2026-09-15) Make prohibited queued work terminate through recoverable cancellation.
- [ ] (2026-09-15) Validate HTTP rejection, replay, cancellation, and permitted verification; update contracts.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reject a new prohibited submission with `403` and `domain_verification_forbidden` before credit
  reservation. Existing keyed operations remain replayable. Rationale: restore the stored policy without
  invalidating recovery handles. Date/Author: 2026-09-15, Codex planning.
- Decision: Reuse the existing canceled execution and failed polling response for work prohibited after admission.
  Rationale: no new persistent state or result is necessary, and existing cancellation recovery can release
  its reservation. Date/Author: 2026-09-15, Codex planning.
- Decision: A persisted settlement intention wins over a later policy change. Rationale: a capture or release
  decision must remain repeatable. Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

PR #629 at `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c` routes single verification through durable admission and
execution. All application paths below start at `src/libs/modules/email-verification/src/`.
`application/email-verification.service.ts` still calls `DomainPolicyService.isVerificationAllowed()` before
probing, but the new single-verification paths bypass that orchestrator. The policy reads the `domains` row's
`isVerificationForbidden`; absent rows allow verification. The HTTP DTO blocks three fixed hostnames only.
`DomainVerificationForbiddenError` is a plain error with no dedicated HTTP mapping in the inspected snapshot.
The new rejection status is therefore an explicit contract, not a claim that the old route already returned it.

`application/operations/verification-admission.service.ts` resolves keyed replay before cache lookup and funding.
`verification-execution-runner.ts` leases an execution and calls `MailboxVerificationService` directly.
`verification-reconciler.ts` already cleans up canceled rows with pending requests after interrupted credit release.
`infrastructure/persistence/typeorm-verification-execution.store.ts` locks execution rows and preserves existing
settlement intentions during cancellation. These mechanisms provide the policy enforcement and recovery seams.

## Scope and Non-Goals

Deliver one PR, titled `fix(verification): enforce stored domain prohibitions`, for single-verification policy
enforcement. Include its HTTP contract and focused runtime fixtures. Batch continues using its existing
orchestrator. Do not add domain-management endpoints, policy configuration, schema changes, new failure states,
or restrictions on reading already-owned results. This plan unlocks safe use of the durable single routes.

## Plan of Work

Read the module architecture contract, module README, and relevant repository skills before editing. Inject the
existing `DomainPolicyService` into `VerificationAdmissionService`. After resolving a stored idempotency key,
but before cache lookup, cooldown, request insertion, or funding, check the normalized address's domain. Add a
`domain-forbidden` admission outcome and propagate it through both delivery services and controllers. Serialize
`403 { statusCode: 403, message: "domain_verification_forbidden" }` without the submitted domain. Authentication,
permissions, malformed input, and static hostname validation retain their existing precedence and responses.

Inject the same policy service into the execution runner and recheck it after acquiring the execution lease,
before `mailboxVerification.verify()`. A policy-read error follows the existing transient retry path without
probing. A forbidden result takes a terminal cancellation path, never the runner's generic probe retry path.
The check protects each newly started attempt; changing policy does not retroactively abort a probe already begun.

Add `application/operations/verification-cancellation.service.ts` to own cancellation and recovery using
the existing execution store, request store, and credit reservation service. Give cancellation an expected
generation, extending `cancelIfNoCaptureIntention()` with an optional `expectedGeneration` argument so existing
deadline callers retain their contract. While holding the execution lock, a stale generation returns unchanged; a persisted
intention returns unchanged; otherwise cancellation fences the running generation and clears its lease.
Only a confirmed canceled outcome permits credit release followed by `requests.settleCanceled()`.
Reuse this helper's cleanup method from the reconciler so a failure after cancellation remains discoverable
through `pageCanceledPendingCleanup()`. Keep that extraction limited to the existing cancellation operations.

The runner returns `{ kind: "canceled" }`; extend `ExecutionOutcome` and the queue
processor's terminal handling accordingly. The synchronous command reads the settled failed operation and returns
the existing `202` polling handle. Recovery failures must leave the canceled execution terminal and recoverable,
without scheduling another probe. An unchanged state caused by an intention or stale generation exits without
probing; normal settlement recovery owns that intention. Add narrow factories in `email-verification-core.module.ts`.

Update the module README, both controllers' OpenAPI declarations, and generated API artifacts. Extend the owned
Bruno database fixture in `scripts/bruno/async-verification-fixture.mjs` with a dedicated prohibited test domain
and restore only that row in `finally`; seed it directly through the owned fixture connection, with no new HTTP
endpoint. Never modify a preexisting operator policy. Add requests to `bruno/async-verification` that exercise
both `POST /verify` and `POST /verifyAsync` against that domain and assert rejection with unchanged balance.
This collection owns the required fixture; the SMTP collection launcher does not use that fixture wrapper.
Update the registered counts and the fake server in `scripts/bruno/async-verification-runner.test.mjs` together.

## Interfaces and Dependencies

Reuse `DomainPolicyService` and the existing framework-independent credit contracts. The only new public response
is the domain-policy `403`; polling still returns `failed` with `failureCode: "verification_failed"`, settled
billing and zero charged credits for a canceled operation. The account's reserved balance is released; preserve
the request's recorded reservation count. Stored-key replay returns the
same operation and never creates a replacement execution. Owned result/status reads keep their current access rules.
The cancellation helper and generation argument are private module contracts. Add no database columns or libraries.

## Acceptance Criteria

- New prohibited submissions on either route return the specified `403`, create no operation or reservation,
  and invoke no mailbox probe, including when a reusable cached result exists.
- Allowed and unknown domains retain successful verification, cache reuse, and current billing behavior.
- A domain prohibited after funding but before execution produces no probe; its existing operation eventually
  polls as failed with zero charge and released credit. Repeating cancellation causes no additional effects.
- A release failure after cancellation is recovered by a later sweep. Stale generations cannot cancel a successor,
  and a persisted capture or release intention is neither replaced nor overridden.
- Existing keyed operations and owned reads remain recoverable; prohibited new work cannot bypass policy by
  selecting sync versus async. Focused checks and architecture validation pass.

## Validation

From the repository root, run the focused application and persistence checks:

```sh
corepack pnpm exec jest --runInBand domain-policy.service.spec.ts verification-admission.service.spec.ts verification-execution-runner.spec.ts verification-cancellation.service.spec.ts verification-reconciler.spec.ts typeorm-verification-execution.store.spec.ts
corepack pnpm exec jest --runInBand synchronous-verification-http.integration.spec.ts async-email-verification-http.integration.spec.ts verification-execution.processor.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/operations/verification-{admission.service,execution-runner,cancellation.service,reconciler}.{ts,spec.ts} src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.{ts,spec.ts}
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:async-verification
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm docs:lint -- .agents/plans/verification-billing-hardening/02-enforce-domain-prohibitions.md src/libs/modules/email-verification/README.md bruno/async-verification/README.md
```

Use controlled policy flips and injected cleanup failure to test queued cancellation and intention races.
Bruno is required because rejection and a stateful HTTP workflow change; its launchers run the local collections.
Run container checks only against an owned disposable stack. If dependencies are unavailable, record static
validation separately and report Bruno execution as unverified; do not reset another stack to make it run.

## Idempotence and Recovery

The execution ID remains the credit-operation reference. Cancellation cleanup is replay-safe and generation-fenced;
already-persisted financial decisions remain immutable. Remove only test-owned fixture rows after tests.
No schema reset, migration, or reseeding of existing services is required. Before implementation, update the
synced issue's assignee and project status using the root workflow; this planning task does not publish it.

## Artifacts and Notes

Coordinate fixture changes with `verification-billing-hardening/08`: any shared fake admission must include the
new domain outcome, without making this independently testable implementation depend on that test-focused PR.
The review reproduction compared real application classes with fake infrastructure: the old orchestrator rejected
the prohibited domain before probing; the new synchronous command made two probes and selected a one-credit
capture. That is application evidence, not a live SMTP run. PR #629 merged as
`d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`; recheck these paths against the implementation branch before coding.

## Plan readiness

Ready to implement
