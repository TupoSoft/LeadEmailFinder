# Publish Approved Controller Privacy Notices

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Implement the exact collection-time controller notice placements approved by plan 12, with immutable content/version/
locale evidence and no confusion between notice and contractual assent. After this change, every selected Keycloak,
account, onboarding, checkout, or API surface presents or links the approved version at the approved time and records
only the evidence plan 12 requires.

## Progress

- [ ] (2026-08-30) Copy the final plan-12 placement rows into an executable notice manifest and immutable content
      artifacts.
- [ ] (2026-08-30) Implement only the selected Keycloak/account/onboarding/checkout/API placements.
- [ ] (2026-08-30) Record the approved version/locale/presentation or assent evidence without dark patterns.
- [ ] (2026-08-30) Add HTTP/UI/provider, localization, versioning, authorization, Bruno, docs, and full validation.

## Plan dependencies

- `privacy-compliance/10`
- `privacy-compliance/12`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Plan 12, not implementation convenience, selects exact surfaces, content ID/version, locales/fallback,
  timing, owner, evidence, and `notice_only` versus `affirmative_assent` behavior.
  Rationale: A notice link must not be misrepresented as agreement, and code must not guess legal/product choices.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Store approved content/version metadata in `config/privacy/controller-notices.yaml` and immutable content
  under `docs/privacy/notices/`; runtime surfaces resolve only active exact IDs.
  Rationale: One machine map prevents surface/version drift and preserves reviewable evidence.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add no migration or production rollout. If approved assent needs durable application evidence, use TypeORM
  synchronization against disposable data and update this plan with the exact schema before implementation.
  Rationale: The repository has no production environment and the assent choice is not yet supplied.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 12 inventories direct/indirect controller collection and owns the exact placement matrix. Plan 10 separately owns
customer data-processing terms and assent. Existing surfaces include Keycloak login, account/session flows,
organization onboarding, credit purchase, and authenticated API responses, but this plan must implement only rows
actually selected by plan 12.

## Scope and Non-Goals

Add the notice manifest/content, chosen runtime/provider-theme placements, version/locale evidence, and relevant tests/
Bruno coverage. Update affected module guides.

Do not choose legal text, placement, locale, timing, assent, or evidence policy; alter customer-processing terms;
implement rights/retention; send email; add marketing consent; add migrations; or claim publication before the selected
surfaces pass validation.

## Plan of Work

Before coding, replace every pending plan-12 placement with one exact row naming surface/route or Keycloak theme
location, collection event, content/version, locale/fallback, owner, active interval, evidence, and notice/assent mode.
Update this ExecPlan with those exact files/endpoints and Bruno cases; remain blocked until then.

Create a strict manifest whose rows reference immutable approved content. Reject the build or initialization for unknown content,
duplicate active placements, missing locale fallback, expired active versions, or a surface/version mismatch.

Implement each selected surface at collection time. Notice-only interactions do not add a fake checkbox or block use
unless plan 12 explicitly requires acknowledgment. Affirmative assent uses the exact plan-10/12 mechanism, unchecked
default, version binding, immutable evidence, and rejection behavior. Provider-hosted Keycloak/payment-page placement must
use the selected provider-supported theme/metadata mechanism and retain deployment evidence.

Expose an API notice/version field or endpoint only if plan 12 selects it. Record no more evidence than approved:
typically content/version, locale, surface, presented/accepted time, and stable actor/account reference. Never log notice
payloads, tokens, or unrelated controller/customer data.

## Interfaces and Dependencies

`config/privacy/controller-notices.yaml` contains stable placement ID, surface ID, mode, content ID/version, locales/
fallback, effective interval, owner, and evidence rule. Exact endpoints, DTOs, Keycloak theme files, payment-page fields,
and persistence are added to this plan from plan 12 before readiness.

Plan 10 supplies any contractual-assent semantics. Plan 12 supplies controller notice decisions. Use existing module
public boundaries and provider adapters.

## Acceptance Criteria

- Every approved plan-12 placement has one active exact manifest row and implementation; no unapproved surface is added.
- Content/version/locale/fallback and active interval match approved immutable artifacts.
- Notice-only surfaces never claim assent; affirmative assent is explicit, version-bound, evidenced, and rejected when
  absent exactly as approved.
- Direct and indirect collection timing matches plan 12, including selected Keycloak/account/onboarding/checkout/API
  surfaces.
- Missing/expired/mismatched content fails validation; evidence contains only approved fields.
- No marketing consent, commercial message, rights workflow, migration, production rollout, or compliance claim is
  introduced.
- Focused, provider/UI, HTTP, localization, full, build, docs, formatting, and required Bruno checks pass.

## Validation

Run the strict notice-manifest tests plus focused tests for every selected surface, then architecture, typecheck, lint,
full suite, build, YAML/Markdown Prettier, and `git diff --check`. Add/run the nearest Bruno collection
for every changed HTTP route/schema/status and a dedicated notice collection only if plan 12 selects a distinct API
workflow. Record the exact commands in this plan after the surfaces are selected and before implementation.

## Idempotence and Recovery

Immutable content versions are never edited after use. Repeated presentation does not duplicate assent evidence for the
same actor/version/event. Supersession adds a new version/interval and preserves prior evidence.

If a provider/theme deployment fails, keep the new version inactive and the affected collection path blocked only as
approved. Never relabel notice evidence as assent or silently fall back to stale/unapproved text.

## Artifacts and Notes

Record placement/content versions, locales, synthetic evidence IDs, provider deployment references, test/Bruno totals,
and activation state. Never record real identities, tokens, payment data, signatures, private legal advice, or customer
verification payloads.

## Plan readiness

Ready after plan 12 supplies the exact surfaces; content IDs and versions; locales and fallback; collection timing;
notice-versus-assent mode; evidence fields; owners; effective dates; and provider deployment choices.
