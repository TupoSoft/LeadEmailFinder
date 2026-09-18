# Verification Billing Hardening Road Map

Each numbered ExecPlan addresses one review finding or one validation outcome in exactly one implementation PR.
The plans follow `.agents/PLANS.md` and repair the single-verification flow introduced by
[`verification-billing/04`](../verification-billing/04-charge-single-verification-outcomes.md).

## Order and Dependencies

| Key | Implementation Task | Review Finding | Dependencies |
| --- | --- | --- | --- |
| `verification-billing-hardening/08` | [Restore verification validation fixtures](08-restore-verification-validation.md) | Backend lint, OpenAPI assertions, and the stale Bruno runner fixture | `verification-billing/04` |
| `verification-billing-hardening/01` | [Claim request keys before funding](01-claim-idempotency-keys-before-funding.md) | Conflicting requests can still be charged | `verification-billing/04`, `verification-billing-hardening/08` |
| `verification-billing-hardening/02` | [Enforce stored domain prohibitions](02-enforce-domain-prohibitions.md) | Prohibited domains can be probed and charged | `verification-billing/04`, `verification-billing-hardening/08`, `frontend/11` |
| `verification-billing-hardening/03` | [Serialize request attachment with settlement](03-serialize-request-attachment-with-settlement.md) | Shared requests can remain pending permanently | `verification-billing/04`, `verification-billing-hardening/01` |
| `verification-billing-hardening/04` | [Bound async execution dispatch](04-bound-async-execution-dispatch.md) | Queue outages can hide an admitted operation handle | `verification-billing/04`, `verification-billing-hardening/08` |
| `verification-billing-hardening/05` | [Recover settled email-cache updates](05-recover-settled-email-cache-updates.md) | Confirmed settlement can lose its email-cache update | `verification-billing/04`, `verification-billing-hardening/08` |
| `verification-billing-hardening/06` | [Release permits after lease errors](06-release-permits-on-lease-errors.md) | Failed lease acquisition can occupy execution slots | `verification-billing/04` |
| `verification-billing-hardening/07` | [Preserve validation error contracts](07-preserve-validation-error-contracts.md) | Generated 400 response types reject valid message arrays | `verification-billing/04`, `verification-billing-hardening/08` |

Implement plan 08 first to restore a useful validation baseline. Plans 01 and 02 then address the two high-priority
charging and policy defects. Plan 03 follows the request ownership contract from plan 01. The remaining plans
can proceed independently once their declared prerequisites are available. Coordinate edits to shared admission,
execution, settlement, and fixture files without combining their implementation PRs.

Readiness describes whether each plan contains enough decisions to implement. Its dependencies determine when
the work is eligible. A completed review or a ready plan does not mean a fix has shipped. These documents do not
mark `verification-billing/04` or any remediation task complete.

Plan 02 was refreshed against checkout `e8b7d77688302ea8de9c15bc97f1af8cbb638326` on 2026-09-18. It now
protects the runner shared by single and batch verification and preserves the existing browser's domain-rejection
workflow. The [operator domain-policy road map](../domain-verification-policy/README.md) reuses its stable key
and adds separate batch admission, management API, and operator browser plans. This update does not mark any
implementation complete or refresh unrelated findings against that newer checkout.

## Shared Constraints

- The review basis is [PR #629](https://github.com/TupoSoft/LeadEmailFinder/pull/629), at
  `1bdf3b2a2cb92232bb7cb6bcd2a953dc91972b6c`. Recheck that implementation against the chosen branch before coding.
  PR #629 merged on 2026-09-14 as `d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`, the base of this documentation PR.
  `verification-billing/04` is complete at that base. Retain it as the implementation prerequisite; these plans change no application code.
- Preserve the existing conclusive-result price, cache freshness, organization ownership, request identity,
  and immutable financial decisions. Do not introduce provider changes, batch billing, or frontend redesigns.
- Email verification owns its requests, execution, and settlement persistence. Credits owns reservation and
  capture transitions. Keep framework and database code behind narrow module ports; no transaction spans SMTP,
  Redis, or external HTTP calls. Read the module instructions and local PostgreSQL skill for database changes.
- Use deterministic barriers and injected failures for races. Preserve real PostgreSQL coverage for key ownership
  and terminal attachment; mocked stores alone do not verify database locking. Keep SMTP stubs and live delivery
  evidence explicitly distinct.
- Retain truthful accounting: a released reservation returns account capacity, while recorded operation metadata
  follows its documented meaning. Never infer a second charge or a replacement request from a lost response.
- Add no migrations, backfills, production rollout, or production recovery work. Incompatible schema changes use
  TypeORM synchronization with disposable development data and the reset/reseed procedure in the owning plan.
  Fixture cleanup must leave other checkouts and existing services untouched.
- Extend the nearest Bruno collection when HTTP behavior changes. The owned collection launchers protect fixture
  credentials and balances. A skipped or unavailable live run is not passing runtime evidence.
- When changing the async collection, update `scripts/bruno/run-collection.mjs` counts and the fake workflow in
  `scripts/bruno/async-verification-runner.test.mjs` in that same PR. Run its focused Node test as well as the
  collection so new cases do not recreate the fixture drift repaired by plan 08.
- Use the existing architecture, type, lint, contract, and prose checks. Record CI separately from local results.
  The browser jobs that failed without running steps have no verified root cause in this review; these plans do
  not invent a workflow or runner fix for them.
- During implementation, follow root `AGENTS.md` for the synced issue assignment, project status, living progress,
  conventional commit, and PR linkage. Creating this road map does not create or modify external issues or PRs.

## Related Plans

- [Verification billing road map](../verification-billing/README.md)
- [Durable operation and settlement foundation](../verification-billing/03-recover-operations-and-cache-results.md)
- [Single-verification activation](../verification-billing/04-charge-single-verification-outcomes.md)
- [Later batch billing](../verification-billing/05-charge-unique-batch-results.md)
- [Later browser billing explanation](../verification-billing/06-explain-verification-charges.md)
- [Operator domain-policy management](../domain-verification-policy/README.md)
