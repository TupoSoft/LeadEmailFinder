# Verification Billing Road Map

Each ExecPlan follows `.agents/PLANS.md` and delivers exactly one implementation PR. These plans implement the
2026-09-08 decision to charge only for conclusive verification results, make reusable cached results free, and
charge duplicate addresses in a batch only once. Creating these plans does not activate the policy.

## Order and Dependencies

| Key | Implementation task | Dependencies |
| --- | --- | --- |
| `verification-billing/01` | [Classify conclusive verification evidence](01-classify-conclusive-evidence.md) | None |
| `verification-billing/02` | [Reserve and settle organization credits](02-reserve-and-settle-credits.md) | None |
| `verification-billing/03` | [Recover verification operations and reuse fresh results](03-recover-operations-and-cache-results.md) | `verification-billing/01`, `verification-billing/02` |
| `verification-billing/04` | [Charge single verification by its final outcome](04-charge-single-verification-outcomes.md) | `verification-billing/03` |
| `verification-billing/05` | [Charge batches once per unique conclusive result](05-charge-unique-batch-results.md) | `verification-billing/04` |
| `verification-billing/06` | [Explain actual verification charges in the browser](06-explain-verification-charges.md) | `verification-billing/05`, `frontend/11`, `frontend/12` |

Plans 01 and 02 can proceed independently. Plans 03 through 05 activate one shared operation model in stages.
Plan 06 completes the browser experience after the existing single and batch screens exist. Readiness describes
whether a plan has enough decisions to implement. Dependencies determine execution order; people own scheduling.

## Shared Constraints

- Charge one credit for a new conclusive result, including a reliable negative result. Reserve capacity before
  outbound work; a reservation is not a deduction. Capture after durable result persistence, or release after an
  inconclusive result or terminal failure. Invalid requests, authorization failures, infrastructure failures, and
  inconclusive outcomes incur no verification debit.
- The initial billable evidence is deliberately narrow: certificate-verified SMTP evidence for the requested
  recipient, with a conclusive negative catch-all control for acceptance, or a recipient-specific permanent missing
  mailbox response. Plan 01 specifies the exact predicates. Account discovery, unresolved catch-all results,
  missing MX results, and broad SMTP rejection labels are insufficient. No numerical confidence score is invented.
- Free cache reuse means a complete conclusive result for the same organization and normalized address. The default
  lifetime and maximum lifetime are 24 hours from the oldest evidence required for the conclusion. Supporting DNS
  or catch-all cache reuse alone does not make a new mailbox verification free. Cache reads do not extend freshness.
- Normalization trims surrounding whitespace and lowercases the address, matching the existing address identity.
  It does not remove dots, strip plus tags, or merge aliases. A batch preserves original input order and duplicate
  rows in its output while sharing their normalized-address execution and charge.
- Concurrent submissions for one organization and address share one active execution. The first funded operation
  owns at most one credit; followers pay zero. Explicit request replay returns the original operation and its
  recorded charge, without an additional debit. Other organizations neither share cache entries nor share charges.
- Keep `balance` as the total owned credits. Add `reserved` and `available`, where
  `available = balance - reserved`. Payment adjustments and other spending use available credits; they do not take
  funds already reserved for an admitted operation. Absolute administrative balance changes below reserved credits
  fail without modifying the account.
- Rate limits are separate from pricing. Plan 04 initially allows 60 submissions per minute per organization and
  at most five simultaneous outbound executions per organization. A terminal inconclusive attempt has a 60-second
  address cooldown. These are explicit engineering defaults with validated configuration and deterministic tests.
  Free cache reads remain possible at zero balance, within the submission limit.
- Email verification owns evidence, cache, executions, request identities, row mappings, and settlement intentions.
  Credits owns amounts and reservation transitions; identity owns their atomic persistence. Use narrow ports and
  public module barrels. No database transaction spans SMTP, Redis, S3, or provider HTTP calls.
- Result persistence and settlement are coordinated through a durable intention written with the result, followed
  by an idempotent credit operation. No public result is marked completed until settlement is confirmed. Recovery
  retries financial settlement without rechecking the address. Expired worker leases cannot publish late results.
- Cache freshness is distinct from physical retention. These plans add bounded billing-operation recovery, not the
  privacy road map's retention, subject-erasure, restoration, or vendor controls. New address-bearing tables must
  be documented for `privacy-compliance/07`; financial references contain opaque operation UUIDs only.
- Add no migrations, production deployment, or backfills. Schema tests use TypeORM synchronization on disposable
  data. Every schema plan names the existing reset and reseed workflow and protects other checkouts' fixtures.
- Preserve permissions, organization concealment, secure SMTP transport, payment-provider selection, and approved
  UI styling. Regenerate browser contracts when the HTTP schema changes. Extend the nearest Bruno collections and
  distinguish static tests, local runtime evidence, and unavailable external-provider validation.

## Existing Plan Boundaries

`verification-reliability/01` records the old upfront policy on a retired route. The new road map supersedes that
historical billing rule. `verification-reliability/02` and `/03` remain the owners of durable batch publication and
bounded progress. Plan 05 preserves both outcomes while changing row accounting.

`frontend/10` delivered billing summary and purchase screens. `frontend/11` and `/12` describe the original
verification screens and old charging warnings. Their original interface work remains separate. Plans 04 and 05
own the changed API policy; Plan 06 replaces the corresponding copy and consumes authoritative charge metadata.
When a frontend plan is implemented after the backend policy, it must preserve that policy instead of restoring
the historical guard or per-row debit. Existing frontend transport and session-isolation constraints still apply.

`privacy-compliance/07` already proposes a 24-hour SMTP lifetime. Plan 03 enforces evidence freshness independently
of that plan's physical cleanup and uses a composable execution fence. It does not resolve that plan's outstanding
privacy decisions or claim its acceptance criteria are complete.
