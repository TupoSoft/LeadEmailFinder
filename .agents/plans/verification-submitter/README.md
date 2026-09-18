# Verification Submitter Road Map

Store the authenticated human or service-client reference with each verification submission so its origin remains
available after the HTTP request or queue job ends. Each numbered ExecPlan delivers exactly one implementation PR
and follows `.agents/PLANS.md`.

## Order and Dependencies

| Key | Implementation task | Direct dependencies |
| --- | --- | --- |
| `verification-submitter/01` | [Retain the submitter of single-email requests](01-retain-single-request-submitters.md) | `verification-billing-hardening/01` |
| `verification-submitter/02` | [Retain batch submitters through processing](02-retain-batch-submitters.md) | `verification-submitter/01`, `verification-billing/05` |

The existing [request-key ownership plan](../verification-billing-hardening/01-claim-idempotency-keys-before-funding.md)
owns atomic admission and recovery. Plan 01 extends that durable receipt with the original submitter; it does not
create a competing concurrency fix. Plan 02 reuses the reference type for batch manifests and their generated
requests. Each plan includes its own tests and documentation. Readiness records decision completeness;
prerequisite completion determines eligibility. Planning does not mark implementation complete.

## Shared Constraints

- The source revision is `0664db3cdeb0704932f4ad5bc877541c796e8663`, inspected on 2026-09-18.
  Current single-email controllers retain only the organization when calling admission. Batch jobs retain a
  credential ID without its kind; neither request nor batch-admission tables retain a submitter.
- The private `VerificationSubmitterReference` contains `kind: AuthCredentialKind` and `id: string`. Reuse
  `human_session` and `service_client`. The human ID is `externalIdentityId`; the service ID is the local
  service-credential ID. Both come from `AuthPrincipal.credentialId`, with kind from `credentialKind`.
  An integration's reference identifies that integration, not its human operator.
- Store `submittedByKind` and `submittedById` on `verification_requests` and, in plan 02, `batch_admissions`.
  Internal records expose `submitter: VerificationSubmitterReference | null`. Existing creation timestamps
  remain authoritative. Null means unknown; never infer an actor from an organization, execution payer,
  old untyped credential ID, or the caller replaying a request.
- Controllers select the two fields from the authenticated principal. Body, header, query, and CSV fields cannot
  override them. New submission commands require a complete reference; supported legacy records or jobs may
  remain unknown. Copy no names, email addresses, issuer/subject strings, tokens, roles, or permissions.
- Attribution belongs to submissions. Shared executions and results can serve several submitters. A batch's
  generated requests copy its stored reference, so request attribution needs no billing-payer traversal.
  Duplicate CSV rows retain their existing unique-address request sharing.
- The first durable admission owns the reference. Equivalent organization-scoped retries preserve it even when
  another actor retries. Actor identity does not extend the key namespace or request fingerprint, change
  organization access, or alter billing. Recording each retrying actor is outside these plans.
- Email verification owns the snapshot. Use identity's public types without importing its persistence entities,
  adding cross-module foreign keys, or querying identity during recovery. Member removal and service-client
  disablement/deletion must not cascade into verification rows. A deleted identity may leave an unresolved
  reference until the submission's lifecycle removes it. Future approved erasure may clear both fields together.
- Retention follows the containing submission. The processing contract specifies a 30-day maximum after purpose
  completion; the seven-day operation read window is not deletion. Enforcement remains owned by
  `privacy-compliance/07`. Update its inventory when implementing these plans, including batch copies. Do not
  create a permanent audit copy or describe attribution storage as implemented retention.
- Public response fields, actor lookup endpoints, UI, per-user billing, and per-attempt audit streams are outside
  scope. Existing response serialization continues to omit attribution. Bruno regression coverage accompanies changed
  authentication-to-application wiring; database tests prove persistence.
- Add no migrations, backfills, production rollout, or production recovery work. Use TypeORM synchronization
  with disposable data and the reset/reseed procedure in each plan. Historical unknowns stay unknown.
  These documents introduce no application changes or database resets.
- Follow root `AGENTS.md` for issue assignment and project status when implementation starts, and for conventional
  commit titles, assigned PRs, and closing issue links when publishing. Preserve unrelated checkout changes.

## Related Plans and Contracts

- [Verification billing](../verification-billing/README.md)
- [Verification billing hardening](../verification-billing-hardening/README.md)
- [Verification retention](../privacy-compliance/07-enforce-verification-data-retention.md)
- [Identity privacy adapters](../privacy-compliance/16-add-identity-and-access-privacy-adapters.md)
- [Processing and lifecycle contract](../../../docs/privacy/email-verification-processing-contract.md)
- [Working customer profile](../../../docs/product/ideal-customer-profile.md)

The customer profile supports team and integration examples as a working hypothesis. These plans address an
observed attribution gap; they do not claim validated demand for an activity-history interface.
