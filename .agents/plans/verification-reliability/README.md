# Verification reliability roadmap

This roadmap contains independently deliverable corrections discovered during the 2026-08-20 source audit. Each
plan follows `.agents/PLANS.md`, represents exactly one pull request, and preserves the existing organization-owned
verification model.

1. [Apply run permission and credits to deprecated verification](01-bill-deprecated-verification.md)
2. [Complete batch jobs only after durable result upload](02-make-batch-results-durable.md)
3. [Report bounded batch progress](03-report-bounded-batch-progress.md)

Shared decisions:

- Synchronous and deprecated verification routes enforce the same run permission and one-credit policy.
- Batch job ownership remains scoped to the authenticated organization and credential.
- Result upload success is part of batch completion, not best-effort observability.
- Progress is finite, bounded from 0 through 100, and describes child-verification completion.
- No plan adds migrations or production deployment work.
