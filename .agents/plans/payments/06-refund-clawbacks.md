# Claw Back Refunded Credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Stop refunds and chargebacks from becoming free credits without double-moving the balance when Paddle later reverses
an adjustment. After this change, an approved debit-causing adjustment removes no more than the credits attributable
to that purchase, an inverse adjustment restores only the credits previously removed, and every applied amount or
shortfall is durably recoverable. A developer can observe it through the repeatable stub-provider Bruno workflow, the
real-PostgreSQL recovery suite, and a Paddle sandbox refund when sandbox credentials are available.

## Progress

- [x] (2026-08-29) Settle the insufficient-balance policy: clamp the debit to the available balance, record the
  shortfall, and never make the credit balance negative.
- [x] (2026-08-29) Normalize Paddle debit, restore, and ignored adjustment actions into explicit provider-event
  variants, using the signed adjustment subtotal as the comparable pretax amount.
- [x] (2026-08-29) Add a durable adjustment state machine that serializes purchase accounting and converges after
  partial failure.
- [x] (2026-08-29) Add full, partial, inverse, insufficient-balance, replay, concurrency, ordering, and injected-failure
  coverage, including 20 passing scenarios against a freshly synchronized PostgreSQL schema.
- [x] (2026-08-29) Complete the full typecheck, lint, Jest, build, Harper, diff, and plan-sync validation pass.
- [x] (2026-08-29) Run the 19-request Bruno workflow against a freshly built local stub-provider stack; all 19
  requests and tests passed with Bruno CLI 4.0.0.
- [ ] (2026-08-29) Run a Paddle sandbox purchase, approved refund, replay, and provider-generated inverse adjustment
  when sandbox credentials and an inverse-producing scenario are available.

## Plan dependencies

- `payments/04`
- `payments/05`
- `payments/07`
- `payments/08`

## Surprises & Discoveries

- Paddle distinguishes debit-causing `refund`, `credit`, and `chargeback` actions from `chargeback_warning` and
  inverse actions such as `chargeback_reverse`, `chargeback_warning_reverse`, and `credit_reverse`. Treating every
  action whose name contains "reverse" as a debit would move the customer's balance in the wrong direction.
- `PaymentEventHandler`, `PaymentPurchaseStore`, and `CreditsService` currently perform purchase-state and credit
  changes through separate transactions. An idempotent credit-ledger reference prevents duplicate application of one
  event, but it does not serialize two distinct partial adjustments or make purchase adjustment state converge after
  a failure between those transactions.
- Plan `payments/08` changed paid and failed event correlation to `PurchaseCorrelation` and added the
  purchase-ID/reference conflict contract. This plan must extend the current contract rather than restoring the
  provider-reference-only lookup from plan 04.
- Paddle adjustment `totals.total` includes tax, while the stored catalog price is the pack's pretax base amount.
  `totals.subtotal` is therefore the comparable amount for proportional credit accounting.
- Paddle does not attach an original-adjustment ID to an inverse adjustment. It instead marks the original adjustment
  `reversed` while delivering a separate `chargeback_reverse` or `credit_reverse` entity. The separate approved inverse
  entity is the sole restore authority; the original `reversed` update must remain ignored.
- Marking a purchase paid and granting its credits are separate transactions. Without another durable marker, an
  adjustment can observe `paid` before the credit grant exists and incorrectly clamp to zero. `creditsGrantedAt` closes
  this race by keeping the adjustment retryable until the original ledger grant commits.
- Rounding each partial event independently loses many sub-credit adjustments. Calculating the target from cumulative
  net minor units applies the rounding once, preserves customer-favorable flooring, and converges for inverse-before-
  debit and debit-to-restore-to-debit orderings.
- Jest skips environment-gated integration suites during the ordinary full suite. The validation workflow needed a
  dedicated serial `TEST_PAYMENT_WEBHOOK_POSTGRES_URL` step so the adjustment lock and recovery contract is a CI gate.
- Bruno CLI 4 runs collection scripts in a sandbox without global `fetch` or `URL`. The collection-level client-
  credentials bootstrap must use `bru.sendRequest`, and the stub checkout reference is extracted with a regular
  expression so the same collection works in the desktop app and current CLI.

## Decision Log

- Decision: A debit-causing adjustment uses the adjustment-only `CreditsService.debitUpTo` operation, not a purchase
  status change or the strict spending debit.
  Rationale: The operation locks the account, records even a zero result under a unique ledger reference, and reports
  the amount applied so payments can persist exact shortfall. `CreditsService.debit` remains strict, preserving the
  existing insufficient-credit exception and HTTP `402` behavior for verification work.
  Date/Author: 2026-08-17, project planning.
- Decision: The debit reference is derived from the provider adjustment id, not the purchase id.
  Rationale: One purchase can be refunded in several partial adjustments, so keying on the purchase id would silently
  drop every debit-causing adjustment after the first. The adjustment id makes each adjustment distinct and each
  redelivery idempotent.
  Date/Author: 2026-08-17, project planning.
- Decision: Only approved debit-causing or inverse adjustments move the balance.
  Rationale: Paddle creates most refunds in live accounts as `pending_approval` and can later reject them. Clawing back on creation would remove credits for refunds that never happen, so the handler acts on the approved state and ignores pending and rejected ones.
  Date/Author: 2026-08-17, project planning.
- Decision: Approved `refund`, `credit`, and `chargeback` actions request a debit; `chargeback_warning` and the related reverse action
  do not move credits; `chargeback_reverse` and `credit_reverse` request restoration of the corresponding amount.
  Rationale: Paddle uses inverse actions when money previously removed is returned. Mapping an inverse action to the
  debit path would claw back twice, while moving credits for a warning would act before a financial loss exists.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Persist one purchase-adjustment record per provider adjustment before changing the credit account.
  Rationale: The record is the durable state machine for requested, applied, restored, and shortfall credits. Its
  unique provider adjustment ID makes replay convergent even when a process fails between purchase and credit work.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Serialize adjustment claims on the `CreditPurchase` row and calculate the permitted movement from stored
  purchase and adjustment records under that lock.
  Rationale: The credit-account lock serializes account balance changes but cannot stop two distinct partial events
  from calculating against stale purchase totals. The purchase lock ensures cumulative debits never exceed the
  granted credits and cumulative restores never exceed credits actually removed.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: An inverse adjustment clears recorded shortfall before restoring credits that were actually debited.
  Rationale: Credits that could not be removed never left the account. Restoring them would create value rather than
  undoing the earlier adjustment.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: When an approved debit-causing adjustment exceeds the available credit balance, debit only the available
  credits, leave the balance at zero, and persist the unapplied amount as a shortfall. Never make a credit balance
  negative.
  Rationale: Spendable credits and an adjustment shortfall are different domain concepts. Keeping them separate
  preserves the existing invariant that balances cannot be negative, records the full financial effect for later
  collections or suspension policy, and lets an inverse adjustment clear the recorded shortfall before restoring
  only credits that were actually debited.
  Date/Author: 2026-08-29, project owner.
- Decision: Calculate each new movement as the difference between cumulative proportional credit targets, using the
  net debit-minus-restore subtotal capped to the purchase amount.
  Rationale: One cumulative floor is customer-favorable without allowing repeated tiny adjustments to evade clawback,
  and it permits a legitimate later debit after a completed debit and inverse cycle.
  Date/Author: 2026-08-29, Codex implementation.
- Decision: Treat approved inverse-action entities as the only restore events and ignore an original adjustment whose
  status later becomes `reversed`.
  Rationale: Paddle emits both records for one financial reversal. Applying both would restore the same credits twice,
  while the inverse entity has its own provider adjustment ID for durable idempotency.
  Date/Author: 2026-08-29, Codex implementation.
- Decision: Record both `originalShortfallCredits` and mutable `shortfallCredits` on a debit adjustment.
  Rationale: Inverse claims reserve and clear outstanding shortfall before restoring applied debits, while the original
  field retains the audit record of what could not be collected.
  Date/Author: 2026-08-29, Codex implementation.
- Decision: Namespace credit-ledger references as `payment-adjustment:<providerAdjustmentId>:<direction>` and retry an
  opposite-direction event while a claim is incomplete.
  Rationale: The namespace prevents collision with purchase grants, and delaying the opposite direction avoids
  calculating a restore from an applied debit whose completion record is not yet durable.
  Date/Author: 2026-08-29, Codex implementation.
- Decision: Persist `creditsGrantedAt` only after the original credit ledger grant succeeds.
  Rationale: Paid status alone is not proof that the balance contains the purchased credits. The marker fences
  adjustment claims from that transaction gap without coupling the payments repository to credit tables.
  Date/Author: 2026-08-29, Codex implementation.

## Outcomes & Retrospective

The provider, application, persistence, and credit-ledger changes are implemented. Focused unit tests and 20 payment
adjustment plus eight credit-ledger scenarios pass against real PostgreSQL, including forced lock overlap, both inverse
orderings, exact shortfall recovery, grant fencing, and failures before and after ledger application. The full
repository validation and 19-request stub-provider Bruno workflow pass. No material SOLID violation was found: the
provider adapter normalizes Paddle, the application handler orchestrates, the pure accounting function owns the
calculation, the store owns locking and adjustment persistence, and credits owns ledger mutation.

The Paddle sandbox purchase/refund pass was not run because this worktree had no Paddle secret files. A seller also
cannot manufacture Paddle's provider-generated chargeback or credit inverse actions, so a live inverse proof requires
an external scenario that produces one. The fixture now documents the approved-refund, replay, and optional inverse
procedure without representing that manual path as green. No migration was added; disposable development schemas use
TypeORM synchronization as required.

## Context and Orientation

Plan 04 introduced credit grants on `purchase_paid`, and plan 05 introduced the signed Paddle adapter. Plan 07 provides
the reusable sandbox checkout, managed webhook destination, secret mounts, and recorded purchase flow. Plan 08 made
event correlation safe when completion arrives before checkout creation stores the provider reference. This plan
extends all four contracts with normalized adjustment events and a payments-owned adjustment state machine.

Paddle delivers refunds, credits, and chargebacks as `adjustment.created` with an `action` of `refund`, `credit`, `chargeback`, or one of the reversal variants, and a `status` of `pending_approval`, `approved`, `rejected`, or `reversed`. An adjustment references its transaction, and amounts may be partial. `adjustment.updated` carries later status changes, so an approval that follows a `pending_approval` creation arrives on that event.

`OrganizationCreditAccount` carries the check constraint `balance >= 0`, so a debit larger than the balance throws at
the database level. `CreditsService.debit` already raises `InsufficientCreditsException` before reaching that point
when the balance is too small. `CreditGuard` maps that exception to `402` for verification requests. The current debit
method returns no applied amount, and a duplicate reference returns without telling the caller what an earlier attempt
recorded, so the durable adjustment workflow needs a narrow idempotent credit-operation result.

## Scope and Non-Goals

Handle provider adjustments for a completed credit purchase, including debit-causing and inverse actions. Do not issue
refunds from this application, add a refund request endpoint, act on chargeback warnings, suspend organizations,
pursue collections, or send customer notifications. Do not change initial successful-purchase grants or accept
unverified adjustment input.

## Plan of Work

Apply the settled clamp-and-record policy throughout the credit operation, adjustment state, tests, and runtime
validation.

Extend `PaymentEvent` with explicit debit and restore adjustment variants. Each carries `providerEventId`,
`providerReference`, provider adjustment ID, amount in minor units, and currency. In the Paddle adapter, map only
approved debit-causing actions to the debit variant, inverse actions to the restore variant, and warnings plus pending
or rejected adjustments to `ignored`. Treat an original adjustment whose status later becomes `reversed` consistently
with its separately delivered inverse adjustment so the same financial reversal cannot restore twice. Extend the stub
adapter and shared provider contract with the same semantics.

Add a payments-owned `CreditPurchaseAdjustment` entity and a narrow store port. Claiming an adjustment locks the
purchase, validates provider reference and currency, calculates credits from the stored purchase amount, and inserts
or returns the provider-adjustment record. Store requested credits, applied debit, restored credits, shortfall, and a
small processing state. Debit calculations round in the customer's favor and cap cumulative debit at granted credits;
restore calculations first reduce shortfall and then cap re-crediting at credits previously debited.

Fence claims with a payments-owned grant-completion timestamp set only after the original credit-ledger operation
succeeds. Calculate the proportional target from cumulative net adjustment subtotals rather than rounding each event
independently. Preserve the original shortfall for audit while reducing a separate outstanding shortfall as inverse
claims reserve it.

Make the credit-side operation idempotently return the amount applied for its adjustment reference, including on
replay. `PaymentAdjustmentHandler` claims the adjustment, applies the credit operation, then records completion. A failure
after claim or credit application remains retryable: replay returns the same claim, the credit ledger returns the same
applied amount, and completion converges without recalculation. Keep purchase persistence and credit policy behind
their existing module boundaries rather than letting a repository write another module's tables directly.

Extend the Bruno collection with debit, replay, restore, and restore-replay cases. Add a sandbox refund followed by an
available inverse adjustment when Paddle's sandbox supports producing one; when it does not, record the provider
limitation and retain signed Paddle fixture coverage plus the real-PostgreSQL proof.

## Interfaces and Dependencies

New internal payment-event variants for debit and restore adjustments. New payments-owned
`CreditPurchaseAdjustment` persistence and a purpose-specific adjustment store port. The credit module gains a narrow
idempotent operation that reports the amount applied under the clamp-and-record policy. No endpoint or
configuration changes. Development schema changes use TypeORM synchronization against disposable data; no migration
or backfill is added. Depends on plans 04, 05, 07, and 08.

## Acceptance Criteria

- An approved full debit-causing adjustment removes exactly the credits that purchase granted when the available
  balance is sufficient; otherwise it applies the settled clamp-and-shortfall policy.
- An approved partial debit-causing adjustment removes the proportional share, rounded in the customer's favor.
- Two partial debit-causing adjustments never remove more credits than the purchase granted.
- Replaying a debit-causing adjustment event leaves the balance unchanged and returns `200`.
- A `pending_approval` or `rejected` adjustment changes nothing.
- An approved chargeback debits credits on the same path as a refund.
- `chargeback_warning` and `chargeback_warning_reverse` actions change no balance or shortfall state.
- A `chargeback_reverse` or `credit_reverse` clears the attributable shortfall first, restores no more than credits
  actually debited, and is idempotent on replay.
- A later `reversed` update for the original adjustment cannot restore the same movement a second time.
- An approved debit-causing adjustment larger than the available balance debits only the available credits, leaves
  the balance at zero, and records the exact unapplied amount as a shortfall.
- An organization with an outstanding shortfall still receives a clear `402` rather than a `500` on its next
  verification request.
- A debit-causing adjustment for an unknown `providerReference` returns `200` and changes nothing.
- Two distinct partial adjustments delivered concurrently cannot cumulatively debit more than the purchase granted.
- A failure after adjustment claim, credit-ledger application, or adjustment completion converges on replay without a
  duplicate balance movement or lost shortfall.
- An inverse event delivered before its debit event converges without creating or removing credits.
- A debit, completed inverse, and later legitimate debit can each apply in sequence without stale cumulative caps.
- A zero applied debit remains zero on replay after the account is replenished.
- Reusing a provider adjustment ID with different financial details is rejected without another ledger movement.
- An adjustment delivered after paid status but before the original credit grant completes remains retryable. It does
  not debit before the grant-completion fence is set.

## Validation

Add adapter and shared-contract tests for every supported Paddle action/status combination, including warnings,
inverse actions, and an original adjustment becoming `reversed`. Add handler/store tests for full, partial,
repeated-partial, replayed, inverse, insufficient-balance, unknown-reference, currency-mismatch, and each recovery
boundary.

Against a real PostgreSQL database, deliver two distinct partial adjustments concurrently and prove their cumulative
debit is capped. Repeat debit and restore events concurrently and prove one ledger effect per adjustment. Inject
failures after claim and after credit application, prove replay converges, and prove the settled shortfall behavior
never violates the account constraint.

Run `corepack pnpm typecheck`, `corepack pnpm lint`, the focused payment and credit suites, the full Jest suite,
`corepack pnpm build`, and `git diff --check`. Run `bru run --env local` for `bruno/credit-purchases`. Finish with the
plan 07 sandbox purchase, approved refund, replay, and inverse-adjustment scenario available in Paddle sandbox. Record
any provider limitation without claiming that a path that did not run is green.

Completed evidence on 2026-08-29:

- `corepack pnpm typecheck` passed.
- `corepack pnpm lint` passed with no errors. It reported only the two existing explicit-return-type warnings in
  `load-secrets.spec.ts` and `parse-connection-string-options.factory.spec.ts`.
- The focused payment and credit unit command passed 15 suites and 173 tests; the environment-gated integration suite
  was skipped in that command and run explicitly below.
- `TEST_PAYMENT_WEBHOOK_POSTGRES_URL=postgresql://postgres:postgres@localhost:55435/lef_payment_test corepack pnpm test -- payment-event.handler.integration.spec.ts --runInBand`
  passed all 20 tests.
- `TEST_CREDITS_POSTGRES_URL=postgresql://postgres:postgres@localhost:55435/lef_payment_test corepack pnpm test -- credits.service.integration.spec.ts --runInBand`
  passed all eight tests.
- `corepack pnpm test:ci` passed 135 suites and 957 tests; nine environment-gated suites were skipped, with 48 skipped
  tests and one existing test marked as to-do.
- `corepack pnpm build` passed with zero type-checking issues and compiled 454 files.
- `corepack pnpm docs:lint -- .agents/plans/payments/06-refund-clawbacks.md src/libs/modules/payments/README.md src/libs/modules/credits/README.md docker/paddle-dev/README.md bruno/credit-purchases/README.md`
  passed all five files.
- `corepack pnpm dlx @usebruno/cli run --env local` passed 19 of 19 requests and tests against the rebuilt local
  stub-provider stack. The exact stack, generated credentials, and disposable volumes were removed afterward.
- `git diff --check` passed.
- `PLANS_DRY_RUN=true corepack pnpm plans:sync` passed for all 56 ExecPlans and reported only the expected issue 355
  body update.

Not run: the Paddle sandbox purchase, approved refund, replay, and optional provider-generated inverse scenario. No
Paddle credential files were available, and no inverse-producing provider event was under local control.

## Idempotence and Recovery

The unique provider adjustment record plus credit-ledger reference makes redelivery and partial-process failure
convergent. A claimed but incomplete record is safe to resume, and an applied credit operation returns its original
result on replay so completion can be recorded. A missed adjustment is recoverable by replaying the provider event.
Manual balance correction remains a last resort through `PUT /credits/:organizationId` after inspecting adjustment
and ledger state. Reset disposable development data with `pnpm dev:reset -- --confirm-project=LEF`; no migration
rollback exists.

## Artifacts and Notes

The implemented action/status mapping is:

| Status     | `refund`, `credit`, `chargeback` | `chargeback_reverse`, `credit_reverse` | Warning actions |
| ---------- | -------------------------------- | -------------------------------------- | --------------- |
| `approved` | Debit                            | Restore                                | Ignore          |
| Other      | Ignore                           | Ignore                                 | Ignore          |

An original debit adjustment updated to `reversed` is in the `Other` row and remains ignored. Its separate approved
inverse entity performs restoration. The adapter uses unsigned `totals.subtotal`; currency must be an uppercase
three-letter code.

The real-PostgreSQL evidence includes concurrent partials, identical debit and restore replays, and paid-grant fencing.
It also covers inverse-before-debit, debit-to-restore-to-debit, zero clamping, and exact 70-credit shortfall recovery.
Injected failures cover the boundaries before ledger application, after debit or restore application, and after
adjustment completion.
Sandbox adjustment ID suffixes remain pending because no Paddle secret files were present in this worktree.

Never commit raw webhook payloads, customer data, full transaction identifiers, or provider credentials. Official
Paddle references:

- <https://developer.paddle.com/webhooks/adjustments/adjustment-updated/>
- <https://developer.paddle.com/build/transactions/create-transaction-adjustments/>

## Plan readiness

Ready to implement.
