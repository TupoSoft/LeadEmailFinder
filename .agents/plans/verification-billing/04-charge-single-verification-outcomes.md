# Charge Single Verification by Its Final Outcome

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Activate the agreed policy on synchronous and asynchronous single-email verification. A fresh conclusive result
costs one credit; cached, shared, inconclusive, invalid, or failed work costs zero. A user with zero credits can
still retrieve a reusable cached result. Both routes use the same durable operation and expose its actual charge.

## Progress

- [ ] (2026-09-08) Replace HTTP guard debits with validated operation admission on both single routes.
- [ ] (2026-09-08) Connect durable operations to async execution, status lookup, and synchronous completion.
- [ ] (2026-09-08) Add support for request replay, rate limits, and outcome metadata.
- [ ] (2026-09-08) Update generated contracts, focused tests, and the SMTP Bruno workflow.
- [ ] (2026-09-08) Complete local runtime, architecture, type, and documentation checks.

## Plan dependencies

- `verification-billing/03`

## Surprises & Discoveries

`CreditGuard` currently debits before DTO validation, so malformed email bodies and enqueue failures can consume
a credit. The async worker currently verifies and persists again on a retry. Its queue state also decides whether
the HTTP result is visible. All three behaviors must move to the durable operation contract together.

## Decision Log

- Decision: Validate authentication, permissions, headers, and normalized input before reserving credits.
  Rationale: A rejected request cannot create a financial effect. Date/Author: 2026-09-08, policy planning.
- Decision: Keep optional `Idempotency-Key` support backward compatible and scope keys to organization and request
  identity. Rationale: Existing callers work, while deliberate retries can recover a known operation without another
  charge. Date/Author: 2026-09-08, policy planning.
- Decision: Preserve synchronous `201` for completed results and add `202 { id }` when an admitted operation cannot
  finish within 30 seconds. Rationale: A durable handle is safer than reporting a lost or failed verification while
  its financial settlement remains pending. Date/Author: 2026-09-08, policy planning.
- Decision: Use a 60-request token bucket with one token refilled per second per organization, five concurrent
  outbound executions, and a 60-second terminal-inconclusive address cooldown. Rationale: Free outcomes must not
  create unlimited probe attempts. These are configurable engineering defaults, separate from credit pricing.
  Date/Author: 2026-09-08, policy planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Within `src/libs/modules/email-verification/`, the current controllers are
`src/api/http/synchronous-verification/current/sync-email-verification.controller.ts` and
`src/api/http/asynchronous-verification/async-email-verification.controller.ts`. They both use `CreditGuard`.
The synchronous application command is `src/application/delivery/synchronous/run-synchronous-verification.ts`;
async admission is `src/application/delivery/async/async-email-verification.service.ts` and its worker is
`src/infrastructure/queues/async-verification/async-email-verification.processor.ts`.

Plan 03 supplies durable request/execution identities, funded admission, evidence-aware complete-result caching,
concurrent execution sharing, and recoverable settlement. Plan 02 preserves total balance and adds reserved and
available counts. This plan connects those capabilities to HTTP. Batch still uses its existing adapter until Plan 05.

## Scope and Non-Goals

Change single-route billing, request recovery, safe response metadata, and execution admission. Preserve current
permission names, organization concealment, secure SMTP checks, source selection, and existing result fields.
Do not implement batch deduplication, browser screens, forced refresh, customer cancellation, new payment flows,
or a new history endpoint. No automatic client retry is introduced.

## Plan of Work

Remove `CreditGuard` from these two POST methods. Keep global authentication, browser mutation protection,
`PermissionsGuard`, and DTO validation. Normalize before validating, with the same trim/lowercase function used by
cache identity. Reject missing or invalid addresses without reserving. Parse an optional single canonical lowercase
UUIDv7 `Idempotency-Key`; reject malformed, repeated, or combined headers with `400`. Apply the key timestamp
and replay-window rules from Plan 03, returning `410` for an expired key and `400` for a key too far in the future. Do not import the credits
controller's private parser. Implement a transport-local parser or an intentional small shared contract.

Call Plan 03 admission with the principal's organization and credential, delivery mode, normalized address, and
optional key. Cached results and already-funded execution followers bypass balance admission. A new uncached
execution requires one available credit and returns `402` with safe `insufficient_credits` on failure. A conflicting
key returns `409`; a known expired operation/key returns `410`. Missing/foreign status or result identifiers remain
indistinguishable `404` responses. Require the existing permissions on every replay and lookup.

Use the durable request UUID as the returned async job handle. Queue payloads refer to the durable execution and
attempt generation rather than relying on queue data to decide charging. A lost dispatch is recovered by Plan 03;
return `202 { id }` once durable admission succeeds even if dispatch must be retried. Return `503` only when durable
admission cannot be confirmed, without guessing that work is absent. A retry with the same supplied key resolves it.
Async cache hits also return `202 { id }`, whose first status read may already be completed.

A synchronous call executes or joins the same operation, waiting at most 30 seconds. Return the existing flat result
with additive operation metadata and `201` only after settlement. Otherwise, return `202 { id }` plus
`Location: /verifyAsync/<id>`; this route can read operations admitted through either single entry point.
Do not debit when the HTTP connection closes. Recovery continues the same durable operation and decision.

Status comes from durable request/execution/settlement state, not BullMQ completion alone. Preserve the existing
status vocabulary or the normalized vocabulary delivered by `frontend/11`; pending settlement must remain a
nonterminal state, never a completed result with an unknown charge. Safe terminal failure codes describe failed
work without exposing exception text. Extend `GET /verifications/:id` to expose original evidence timestamps;
this result lookup remains read-only and organization-scoped. Update `TypeOrmVerificationResultReader` so it hides
new execution results until their settlement is confirmed, including guesses of their result UUID. Apply the same
gate to last-result links and cache publication. Keep legacy settled records readable. Per-request charges belong to operation metadata,
so a free cached request does not inherit the producing request's one-credit charge.

Add an application admission policy behind `VerificationSubmissionLimiter` and `VerificationExecutionPermits`.
Implement the submission token bucket atomically in the existing Redis infrastructure. Count all POST submissions,
including free hits, within the organization bucket; exempt read-only status and result retrieval. Failed
authentication never reaches the limiter. Rate rejection returns `429` and integer `Retry-After`, before new
reservation or queue admission. A Redis admission failure returns safe `503`, not unlimited free execution.

Use short, organization-serialized PostgreSQL permit acquisition with the execution lease/generation from Plan 03
to bound concurrent outbound work across sync, async, and later batch workers. The five-execution cap queues funded
work; it does not reject a caller after reservation. Cached/shared reads need no outbound permit. A terminal
inconclusive attempt records a 60-second address cooldown; a new uncached submission during it returns `429` with
`verification_cooldown` and `Retry-After`. Replay of the original operation still returns its recorded outcome.
Infrastructure admission failures and invalid input do not start an address cooldown.

Add validated positive-integer configuration for rate capacity/refill, concurrency, and cooldown, with the defaults
recorded above. Inject plain policy values. Update the module README, route documentation, browser OpenAPI allow
list, and generated schema. Update the existing SMTP collection rather than creating a duplicate workflow.
Retain a temporary, explicit legacy worker path for existing batch child payloads; Plan 05 removes that path.
Version the new payload and test both adapters so this PR cannot accidentally stop all batch verification.

## Interfaces and Dependencies

Keep existing result fields. Add `operation` to completed synchronous responses and to async status responses:

```typescript
type VerificationOperationMetadata = {
    id: string
    source: 'fresh' | 'cache' | 'shared'
    observedAt: string | null
    cacheExpiresAt: string | null
    billing: {
        state: 'pending' | 'settled'
        reserved: 0 | 1
        charged: 0 | 1
        reason?: 'conclusive' | 'cached' | 'shared' | 'inconclusive' | 'failed'
    }
}
```

`reason` is present only when settled; pending counts are authoritative snapshots, not estimated deductions.
Timestamps describe evidence, never HTTP request time. Completed cached/shared operations have zero reserved and
charged credits. Equivalent keyed replay reports the original metadata, without implying another deduction.
Update common DTO contracts and `packages/api-client/src/schema.d.ts` through the generation commands.

## Acceptance Criteria

- Valid uncached conclusive positive and negative results each deduct exactly one credit after persistence.
  Invalid bodies, unknown outcomes, unresolved catch-all, transport failures, and exhausted retries deduct zero.
- With zero available credits, a valid complete cache hit and an already-funded follower succeed; fresh work
  rejects with `402`. A pending reservation does not reduce total balance, and completion updates it exactly once.
- Equivalent keyed retries, simultaneous requests, worker retries, and repeated polls create no additional debit.
  Same-key conflicting input returns `409` without changing the original operation.
- Lost dispatch, settlement failure, and synchronous timeout yield a recoverable handle after durable admission;
  no completed response is published before the final charge is confirmed.
- Foreign organization handles return `404`; `401`, `403`, `400`, and `429` paths never reserve new credits.
- Rate and cooldown rejection include `Retry-After`. Multiple workers never exceed the configured execution
permits. Local-fixture sockets close within the shutdown bound from Plan 03 after lease loss; delayed takeover prevents
overlap within that tested bound. An expired worker cannot finalize a charge after losing its fence.
- Existing batch jobs retain their old behavior until Plan 05. OpenAPI and generated browser types match both
  synchronous response variants and async operation metadata.

## Validation

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts src/libs/modules/email-verification/src/application/operations/verification-admission-policy.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/async-verification/async-email-verification-composition.integration.spec.ts --runInBand
corepack pnpm test:verification-billing-postgres
corepack pnpm bruno:smtp-dev
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/verification-billing/04-charge-single-verification-outcomes.md
```

Extend the real-Redis queue suite for shared work, lost dispatch, permits, token buckets, and temporary-block retries.
Use `TEST_REDIS_URL` only for a disposable instance. Bruno must execute the changed success, invalid-input, zero-credit
cached/uncached, keyed replay/conflict, inconclusive release, and polling cases. Update runner expected counts to
reject skipped or empty runs. Use local trusted SMTP/DNS fixtures; a nullable result is not a conclusive success.
If runtime dependencies are unavailable, report that explicitly instead of substituting mocked tests as live proof.

## Idempotence and Recovery

Use the same request key when recovering an uncertain submission. Poll the returned handle instead of issuing a
new request. Queue and settlement replays reuse the stored execution reference. Restarting the reconciler resumes
pending work without dropping reservations. For disposable schema reset, use the checkout-ownership checks and
`corepack pnpm dev:reset -- --confirm-project=LEF`; it resets and reseeds the local stack only. Stop the old workers
before any incompatible development reset. Do not migrate or reconcile historical charges.

## Artifacts and Notes

`frontend/11` may have completed in another branch by implementation time. Inspect and extend the merged DTO/status mapping; do not restore an older schema. Plan 06 owns browser copy and presentation of this policy.
Implementation tests and runtime evidence have not yet been run for this plan.

## Plan readiness

Ready to implement
