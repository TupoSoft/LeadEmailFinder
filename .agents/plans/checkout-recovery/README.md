# Recoverable Credit Checkout Road Map

Make credit purchase attempts durable across development process restarts. Recover the original hosted payment
page while preserving uncertain Paddle outcomes without issuing another creation request. These plans extend
`payments/03`, `payments/05`, and `payments/08`; they do not replace their completed history. Each numbered file
follows `.agents/PLANS.md` and corresponds to exactly one pull request.

## Task Order and Dependencies

| Key | Pull request | Dependencies |
| --- | --- | --- |
| `checkout-recovery/01` | [Preserve paid purchases during checkout races](01-preserve-paid-purchases.md) | `payments/08` |
| `checkout-recovery/02` | [Observe existing provider checkouts](02-observe-provider-checkouts.md) | `payments/05` |
| `checkout-recovery/03` | [Create and resume durable checkout attempts](03-run-durable-checkouts.md) | `checkout-recovery/01`, `checkout-recovery/02` |
| `checkout-recovery/04` | [Resume durable credit checkouts in the browser](04-resume-browser-checkouts.md) | `checkout-recovery/03`, `frontend/10` |
| `checkout-recovery/05` | [Require durable checkout admission](05-require-durable-admission.md) | `checkout-recovery/04` |
| `checkout-recovery/06` | [Exercise checkout crashes in a disposable fixture](06-exercise-checkout-crashes.md) | `checkout-recovery/05`, `payments/07` |

Plans 01 and 02 can proceed independently. The remaining plans follow the listed sequence. Readiness means a plan
is decision-complete; unfinished dependencies still prevent its implementation from starting.

## Shared Constraints

- The authorized scope is the existing one-time credit-pack flow. Preserve Paddle sandbox, the local stub, catalog
  authority, organization authorization, exact checkout-origin validation, webhook signatures, and credit-ledger
  ownership. No subscriptions, new provider, broker, production deployment, or database migrations are included.
- Plan 03 adds a PostgreSQL job table owned by payments. The purchase and its job commit together. A small payments
  worker polls this table directly; no Redis queue is required for correctness or introduced for this feature.
- A canonical lowercase UUID version 4 `Idempotency-Key` identifies one logical checkout within an organization. Equivalent
  retries return the existing purchase before reading the current catalog. A different pack with the same key
  returns `409`. Keys remain reserved for the lifetime of disposable purchase data and are never recycled by a TTL.
- Plan 03 temporarily selects durable admission when that header is present. Requests without it retain the
  existing synchronous contract until plan 04 updates the browser and plan 05 removes the old path. There is no
  permanent compatibility flag or second checkout endpoint.
- The proposed POST waits up to a configurable budget (1,500 milliseconds by default) for a committed result.
  It returns `201` for a newly admitted ready checkout, `202` for unfinished work, and `200` for a ready replay or completed/failed/unavailable result. A new
  `GET /v1/credit-purchases/:id/checkout` returns the current result. Both require `billing:manage` and the
  authenticated organization. History remains the unchanged `billing:read` projection.
- Responses distinguish purchase `status` from `checkoutStatus`. Only `ready` includes a validated `redirectUrl`;
  `creating`, `reconciling`, `completed`, `failed`, and `unavailable` never include one. A known paid purchase never
  invites another payment. Complete response fields and transitions are defined in plan 03.
- Commit a dispatch marker before the external create. A lost response or an expired lease after that marker
  allows provider reads only. An empty scan, timeout, missing webhook, or local lease expiry never proves that
  Paddle did not create the transaction. No automatic Paddle create is allowed after dispatch uncertainty.
- Reconciliation checks authenticated provider evidence and reuses the existing settlement sequence. It never
  changes credit accounts directly or fabricates a webhook event ID. Multiple matches and invalid evidence require
  review. A scan is a recovery aid, not a provider uniqueness guarantee.
- Browser recovery persists only a scoped request key, pack identifier, timestamps, and optional purchase ID before
  dispatch. It retains the key across a lost response and reload, clears it at authentication boundaries, and never
  treats history refresh as permission to start a replacement purchase. No automatic POST replay is introduced.
- All schema changes use TypeORM synchronization with disposable data. Do not create jobs for old pending purchases. Each plan documents its exact development reset and validation boundaries. Account-bound Paddle
  sandbox evidence remains distinct from the deterministic local provider tests.
