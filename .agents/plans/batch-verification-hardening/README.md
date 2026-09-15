# Batch Verification Hardening Road Map

These seven ExecPlans address the seven findings from [PR #633](https://github.com/TupoSoft/LeadEmailFinder/pull/633)
at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`, reviewed on 2026-09-15. Each numbered plan follows
`.agents/PLANS.md` and delivers exactly one implementation PR. Creating these documents implements no fix.

## Order and Dependencies

| Key | Implementation Task | Review Finding | Dependencies |
| --- | --- | --- | --- |
| `batch-verification-hardening/01` | [Preserve payer request identity](01-preserve-payer-request-identity.md) | 4: Captured credits are reported as free shared results | `verification-billing/05` |
| `batch-verification-hardening/02` | [Resume owned admission claims](02-resume-owned-admission-claims.md) | 5: Retry treats its own interrupted claim as shared work | `verification-billing/05`, `batch-verification-hardening/01` |
| `batch-verification-hardening/03` | [Coordinate batch funding recovery](03-coordinate-batch-funding-recovery.md) | 2: Reconciliation cancels active admission before funding | `verification-billing/05`, `batch-verification-hardening/01`, `batch-verification-hardening/02` |
| `batch-verification-hardening/04` | [Attach requests to settled executions](04-attach-batch-requests-to-settled-executions.md) | 1: A late request leaves its batch pending indefinitely | `verification-billing/05`, `batch-verification-hardening/01`, `batch-verification-hardening/03`, `verification-billing-hardening/03` |
| `batch-verification-hardening/05` | [Fence terminal batch failures](05-fence-terminal-batch-failures.md) | 3: Queued executions run and charge after batch failure | `verification-billing/05`, `batch-verification-hardening/03`, `batch-verification-hardening/04` |
| `batch-verification-hardening/06` | [Report downloadable results](06-report-downloadable-results.md) | 6: Failed jobs advertise results that always return 404 | `verification-billing/05` |
| `batch-verification-hardening/07` | [Align browser status fixtures](07-align-browser-status-fixtures.md) | 7: Existing browser fixtures fail the required response validator | `verification-billing/05` |

Implement plan 01 before plans 02 and 03 so recovery has stable payer identity. Plan 04 adopts the shared
request-finalization boundary from the existing single-verification hardening plan 03; its dependencies already
include that feature's key-ownership foundation. It does not implement a second settlement-locking mechanism.
Plan 05 reuses group funding recovery and safe receipt attachment to finish terminal cleanup after interruption.
Plans 06 and 07 can proceed independently after the batch implementation is available.

Readiness means a plan contains enough decisions to implement. Dependencies determine when it can start; a ready
plan does not assert that its prerequisite is complete. Coordinate shared file edits in dependency order while
retaining one reviewable PR per numbered plan.

## Shared Constraints

- The planning checkout is `451798dadf82e316ba68b4333ddba32bf0f99a97`; it does not contain the batch
  implementation from PR #633. All seven plans explicitly depend on `verification-billing/05`. Recheck the implementation and
  existing hardening plans before coding; do not apply planned batch changes to the older per-row workflow.
- Preserve one credit per new conclusive execution, free followers/cache/cooldown, original input order, duplicate
  rows, organization concealment, immutable settlement decisions, and the existing public status vocabulary.
  The [customer profile](../../../docs/product/ideal-customer-profile.md) remains a working hypothesis; these fixes
  repair repository contracts and make no new market or deliverability claims.
- Email verification owns manifests, request identity, execution, and settlement coordination. Credits owns credit
  reservation and capture through its public interface. Keep database logic in adapters and application decisions
  behind narrow ports. No transaction spans SMTP, Redis, S3, or another module's financial operation.
- Reuse the existing request/settlement lock order. Group fencing must also serialize with execution acquisition:
  a stale admission owner cannot queue or start work after a terminal group decision. Financial closure must
  preserve running executions and existing capture intentions; never close a captured reservation as admission failure.
- Plans 01 through 05 use deterministic PostgreSQL barriers and injected failures for recovery claims. Mocked
  stores alone cannot prove locking or credit atomicity. Queue tests prove BullMQ transitions separately from
  database behavior. An integration suite skipped for missing infrastructure is not passing runtime evidence.
- Extend `bruno/batch-verification` for changed public behavior, preserving fixture ownership, unique addresses,
  balance isolation, and cleanup. Update registered totals and the fake runner workflow whenever requests or tests
  change. Never add production failure-injection endpoints to make races easier to exercise.
- Plan 06 fixes the availability flag using the download route's actual eligibility rules. Streaming failed-job
  results from the database remains a separate feature; this road map does not add it. Plan 07 changes test fixtures
  only and preserves runtime validation, UI behavior, styling, and browser project coverage.
- Upload idempotency keys, rate-limit wiring, domain-policy remediation, frontend billing explanations, unrelated
  SMTP fixture changes, and historical data repair remain outside these seven PRs.
- Add no migrations, backfills, production rollout, or production recovery jobs. Incompatible schema changes use
  TypeORM synchronization and explicit reset/reseed steps against disposable development data. Preserve other
  checkouts, running services, credentials, and user changes. No runtime reset is needed to author these plans.
- Follow root `AGENTS.md` for issue assignment, project status, progress updates, conventional commits, and closing
  issue links when implementation starts. Plan creation alone does not authorize GitHub writes or publishing a PR.

## Related Plans

- [Verification billing](../verification-billing/README.md), including the prerequisite batch implementation.
- [Single-verification hardening](../verification-billing-hardening/README.md), including the shared request identity
  and terminal-aware finalization contracts.
- [Request attachment and settlement locking](../verification-billing-hardening/03-serialize-request-attachment-with-settlement.md).
- [Later browser billing explanation](../verification-billing/06-explain-verification-charges.md).
