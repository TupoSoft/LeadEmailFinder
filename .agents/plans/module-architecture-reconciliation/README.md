# Module Architecture Baseline Reconciliation Road Map

This road map covers exceptional corrections to the initial business-module architecture baseline. Each plan follows
`.agents/PLANS.md` and represents exactly one pull request.

## Order and Dependencies

1. [Reconcile the concurrent refund merge](01-reconcile-refund-merge-baseline.md) — records refund-accounting debt
   that was already present when the architecture ratchet reached `master`; depends on `module-architecture/01` and
   `payments/06`.

## Shared Constraints

- Reconciliation is limited to debt already present at the commit that first adopts the baseline.
- The pull request may change only the baseline, its CLI and focused specification, and this plan. Every added key
  must come from an unchanged source file, so reconciliation cannot absorb architecture debt created by the pull
  request itself.
- Later pull requests remain subject to the ordinary shrink-only baseline rule.
