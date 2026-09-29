# Verification History Road Map

Add an organization-owned directory of recent single verification and CSV batch submissions. The browser can
discover a job and open its existing detail page without a saved URL. This road map is planning only; each numbered
ExecPlan describes exactly one implementation PR.

## Task Order and Dependencies

| Order | ExecPlan                                                            | Depends on                                           | Observable result                                                                          |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1     | [List recent single verifications](01-list-single-verifications.md) | `verification-billing-hardening/01`                  | An authorized caller can page through recent synchronous and asynchronous requests.        |
| 2     | [Discover recent CSV batches](02-list-batch-verifications.md)       | `verification-history/01`                            | An authorized caller can discover recorded uploads, including queued and invalid CSV jobs. |
| 3     | [Browse verification history](03-browse-verification-history.md)    | `verification-history/01`, `verification-history/02` | A history screen offers Single and CSV batch tabs with links to existing detail pages.     |

Implement in dependency order. Plan 01 owns the shared cursor and HTTP contract; plan 02 adds upload-time discovery
metadata and the batch list. Plan 03 consumes both generated API contracts. A ready plan can remain in the project
backlog until its dependencies are complete. Creating these plans does not start implementation or change issue
assignments or project status.

## Shared Scope and Constraints

- The first version discovers submissions created in the preceding seven days, newest first. This is a stated
  scope assumption, distinct from existing single-result access for seven days after settlement and from physical
  deletion. The pending retention plan remains authoritative for deletion; no new retention policy is introduced.
- Include both browser and service-client submissions owned by the current organization. Reuse `verification:read`
  and browser capability `verification.read`; do not add per-user authorization or resolve submitter identities.
- Single history contains standalone `sync` and `async` requests. Batch child requests do not become separate
  single-history rows. Batch history begins with uploads recorded after plan 02 is enabled; legacy jobs remain
  accessible through their existing URLs without a backfill.
- Expose `/v1/verification-history/single` and `/v1/verification-history/batches`. Use the existing five public
  states, bounded cursor pages, and a common response containing `items` and `nextCursor`. The UI requests 20 rows.
- Keep status authoritative. Missing jobs or details are unavailable; infrastructure failures remain errors.
  Discovery metadata alone proves neither successful dispatch nor completion. A missing row never proves that an
  uncertain submission failed, so history reads cannot clear uncertainty or authorize automatic resubmission.
- Extend the approved design with two tabs at `/app/verifications`. Keep successful submissions navigating to
  their detail pages. Read-only browsing does not charge credits, submit work, infer billing, or create downloads.
- Exclude search, arbitrary date ranges, status filters, total counts, submitter display, original filenames, bulk
  actions, cancellation, retries, new verification evidence, and long-term archives from this first slice.
- Keep persistence and queues behind narrow module-owned adapters. Add no production migrations, backfills, new
  providers, or permission system. Use TypeORM synchronization and the documented disposable reset workflow.
- Each PR owns its focused tests and documentation. The two API plans extend the nearest Bruno collections. The
  UI plan owns browser and accessibility evidence; validation recommendations are not completed checks.

## Related Plans and Contracts

- [Atomic single-request admission](../verification-billing-hardening/01-claim-idempotency-keys-before-funding.md)
- [Existing single verification UI](../frontend/11-run-single-email-verification.md)
- [Existing CSV batch UI](../frontend/12-run-batch-email-verification.md)
- [Submitter attribution, a separate feature](../verification-submitter/README.md)
- [Verification retention](../privacy-compliance/07-enforce-verification-data-retention.md)
- [Processing and lifecycle contract](../../../docs/privacy/email-verification-processing-contract.md)
- [Working customer profile](../../../docs/product/ideal-customer-profile.md)
- [Design contract](../../../DESIGN.md) and [interface behavior](../../../UX-CONTRACT.md)

The customer profile supplies a working hypothesis about teams revisiting supplied email lists. The absence of a
history route and list API is verified repository evidence; this road map does not claim measured customer demand.
