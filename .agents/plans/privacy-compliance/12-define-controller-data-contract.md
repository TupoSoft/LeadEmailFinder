# Define the Controller-Data Purpose, Notice, Retention, and Rights Contract

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Define how LeadEmailFinder uses personal data for its own account, authentication, organization administration,
billing, fraud prevention, security, and legal-compliance purposes. After this change, every controller-data field and
external system has an approved purpose, legal basis, collection notice, recipient/transfer treatment, and retention
rule. Each also has a rights mapping, exception owner, and implementation follow-up that remains visibly separate from
customer-supplied verification data processed on customer instructions.

The observable outcome is one counsel-approved `docs/privacy/controller-data-contract.md`, an exact notice-placement
matrix, and an exact account-recovery verification-receipt contract. Plans 13 and 19 consume those decisions. This
documentation pull request does not publish a notice, fulfill a request, erase a record, or establish that runtime
controls are implemented.

## Progress

- [ ] (2026-08-30) Inventory controller-data fields and flows across identity, sessions, organization administration, credits, payments, audit/security records, Keycloak, Redis, logs, and Paddle.
- [ ] (2026-08-30) Obtain counsel decisions for purpose, legal basis, notice, retention, rights, exceptions, recipients, transfers, and response clocks.
- [ ] (2026-08-30) Publish the approved controller-data contract, exact notice-placement matrix, status, owners, and implementation mapping.
- [ ] (2026-08-30) Record the selected account-recovery receipt issuer/adapter and exact signed-claim, binding, validity, replay, revocation, and evidence contract.
- [ ] (2026-08-30) Reconcile the controller contract with the separate customer-verification processor contract and prevent mixed-purpose reuse.
- [ ] (2026-08-30) Complete legal/DPO, plan, architecture, prose, formatting, and whitespace review.

## Plan dependencies

- `privacy-compliance/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep controller data in a separate normative contract from customer-supplied addresses and verification
  inferences.
  Rationale: LeadEmailFinder determines the purposes of account, authentication, billing, fraud, security, and
  compliance records, while customer verification data remains restricted to documented customer instructions.
  Date/Author: 2026-08-30, project planning.
- Decision: Require a field/system-level legal decision instead of assigning one blanket legal basis or retention
  period to an entire account.
  Rationale: Identity, active sessions, invitations, purchase records, credit ledgers, and security audit evidence have
  different purposes, necessity, rights effects, and expiry triggers.
  Date/Author: 2026-08-30, project planning.
- Decision: Treat purpose, legal basis, statutory/contractual retention, notice language, and rights exceptions as
  counsel decisions that block implementation when unresolved.
  Rationale: Source inspection can identify data and behavior but cannot supply jurisdiction-specific legal
  conclusions.
  Date/Author: 2026-08-30, project planning.
- Decision: Plan 12 decides each exact notice surface, content ID/version, locale/fallback, collection timing, owner,
  evidence, and whether the interaction is notice-only or an affirmative assent. Plan 19 implements only those rows.
  Rationale: Documentation cannot truthfully claim a notice is live, and implementation cannot guess whether a login,
  onboarding, checkout, or API interaction constitutes notice or agreement.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Account recovery uses a compact JWS/JWT receipt from one Security-approved issuer/adapter, bound to the
  local external-identity issuer/subject rather than an email search. Its maximum lifetime is 15 minutes; one `jti` is
  consumed once, with exact idempotent transport replay returning the original request only.
  Rationale: A short signed receipt permits privileged recovery without creating an anonymous account-enumeration or
  reusable bearer path.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Do not stretch CAN-SPAM into an account-data rule.
  Rationale: The current repository does not send commercial messages. Any later account or marketing email feature
  must separately classify each message and implement applicable sender duties.
  Date/Author: 2026-08-30, project planning.
- Decision: Classify the current `lef_session`, `lef_csrf_token`, and `lef_login_state` cookies as strictly necessary
  for a user-requested authenticated session, cross-site request forgery protection, and one-time OIDC login-state
  correlation respectively. They are not approved for analytics, advertising, profiling, or unrelated reuse.
  Rationale: The current source uses these cookies only to deliver and protect login/session functionality. This
  necessary-cookie classification and notice requirement does not imply a consent banner when no nonessential cookie
  or similar browser storage exists; any future nonessential technology requires a new inventory and counsel decision
  before activation.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The `identity` module owns `organizations`, `external_identities`, `organization_memberships`, `service_credentials`,
`organization_credit_accounts`, `credit_debits`, `credit_grants`, `organization_invitations`, and `audit_log_entries`.
These tables contain organization names, external issuer/subject IDs, human email addresses, roles/statuses, service
client descriptions/permissions/statuses, invitation email and token hashes, actor/target audit snapshots, balances,
ledger references, and timestamps.

The `bff-session` module stores encrypted browser sessions and pending login state in Redis, including identity and
organization IDs, OIDC access/refresh tokens, CSRF material, and expiry timestamps. Keycloak stores human users,
credentials, email, roles, and service clients. `organization-onboarding` and `service-client-management` administer
those records through Keycloak. Auth evaluates OIDC claims and produces security events/logs but owns no database
table.

The `payments` module owns `credit_purchases` and `credit_purchase_adjustments`, including organization, pack, amount,
currency, provider references/events, status, grant/adjustment accounting, and timestamps. The configured payment
provider receives payment-page and webhook data; Paddle handles payment instruments outside this application. The credits
module mutates identity-owned account and ledger rows. Application/access/security logs and managed backups are
inventoried under plans 03 and 11. There is no dedicated fraud-profile table today; future fraud/security collection is
not approved until added to this contract.

The browser currently receives `lef_session` (HttpOnly, application-wide authentication session), `lef_csrf_token`
(script-readable double-submit token paired with the session), and `lef_login_state` (HttpOnly, `/v1/auth`-scoped,
ten-minute OIDC state correlation). Each uses `SameSite=Lax`, is secure when `APP_BASE_URL` is HTTPS, and expires with
its bounded function. The contract must record these as necessary auth/security technologies and must not describe
them as tracking or infer that a banner exists. Source inspection found no approved nonessential cookie in this flow.

Plan 01 names LeadEmailFinder's controller role at a high level but focuses on email-verification processing. This plan
turns the controller side into a field-level approved contract. “Rights mapping” means the approved behavior for
access, correction, deletion, restriction, objection/opt-out, portability where applicable, and appeal/escalation,
including a precise retained-record explanation when an exception applies.

## Scope and Non-Goals

Create `docs/privacy/controller-data-contract.md` with a source-backed inventory and an approval table. Include a
notice-placement matrix for login/session, organization creation and invitation, member/service-client administration,
credit purchase/checkout, provider webhook data, support/security intake if it exists, and any indirect collection.
Update `README.md`, the plan-01 processing contract, and affected module guides with concise role/status links.

For every field/category and external store, document the data subjects, source, exact purpose, and prohibited secondary
use. Record the counsel-approved GDPR legal basis and California collection/business-purpose/category treatment where
applicable. Also record the required notice and timing, recipients/subprocessors, transfer treatment, retention rule,
legal hold/exception, rights mapping, response clock, escalation owner, security classification, and plan-13 adapter.

This pull request does not implement or publish notice surfaces, endpoints, queues, retention jobs, Keycloak/Paddle
mutations, legal holds, customer-contract terms, a cookie banner or consent manager, commercial email, database
changes, or production rollout. It does not apply
controller purposes to customer verification payloads, decide unresolved legal questions, publish a broad compliance
claim, or describe a record as deleted when an approved financial/security obligation requires restriction and
retention instead.

## Plan of Work

Trace controller data from HTTP/session/OIDC inputs through Keycloak, Redis, identity persistence, organization, and
service-client workflows, credit operations, checkout/payment webhooks, audit entries, application logs, managed
backups, and returned DTOs. Inventory fields from source and provider contracts rather than copying high-level module
descriptions. Mark inferred, provider-owned, currently absent, and pending facts distinctly.

Build a role boundary at the top of the contract. Customer-supplied target addresses, CSV rows, deliverability
inferences, verification jobs/results, and verification artifacts remain governed by the processor/service-provider
contract. A human user's own login/account email, organization membership, purchase relationship, security event, and
required compliance evidence use only the controller purposes approved here. If one identifier appears in both roles,
record separate copies, stores, purposes, and lifecycle rather than treating one role as permission for the other.

Add a browser-storage table for `lef_session`, `lef_csrf_token`, and `lef_login_state` with owner, purpose, value/data
category, first-party status, scope, HttpOnly/SameSite/Secure behavior, trigger, maximum lifetime, deletion event,
notice placement, and `strictly_necessary` classification. State explicitly that the present inventory requires clear
notice but does not by itself require or authorize a consent banner because it contains no nonessential technology.
Add a default-deny rule for analytics, advertising, personalization, and cross-context tracking. Any new cookie, local
storage, or SDK identifier must first receive a stable row and counsel-approved consent/opt-out treatment where
applicable. It cannot be smuggled into the necessary category.

Have privacy counsel decide each purpose/legal-basis/notice/retention/rights row. Record the actual decision and
rationale, not a menu of possible bases. Identify whether data is required to provide the account, required by law,
optional, or used for a separately approved legitimate interest; document the consequence of refusal and any balancing
or assessment evidence where counsel requires it. Map direct and indirect collection to the approved notice content ID and immutable version, exact Keycloak/account/
onboarding/checkout/API surface, collection timing, owner, supported locales and fallback, effective date, evidence
mechanism, and explicit `notice_only` or `affirmative_assent` treatment. A row is not `published` in this plan.

Define retention by event, not only by record age: active relationship, invitation expiry, logout/session expiry,
service-client deletion, account/membership closure, purchase/adjustment settlement, statutory accounting period,
security investigation closure, legal-hold release, and backup/log expiry. The contract must say which fields are
deleted, corrected, detached, pseudonymized, restricted, or retained at each trigger and why. It must not let an
organization cascade silently destroy required purchase/security evidence or retain an identity forever because one
ledger row exists.

Define the request workflow consumed by plan 13. Include authenticated self-service identity binding, organization
scope, manual recovery for a person who cannot sign in, and correction authority between Keycloak and local identity.
Specify final-owner and shared-membership constraints, financial/security exceptions, legal holds, deadlines,
extensions, appeals, regulator escalation, provider assistance, and restored-data reconciliation. Require a completion
receipt that distinguishes completed, restricted, and retained categories.

Select one real account-recovery verification issuer and one owning adapter/team. Record allowed `alg`/key-discovery
rules and exact receipt claims: `iss`, `aud=lead-email-finder-controller-privacy`, `jti`, `sub`, `iat`, `nbf`, `exp`,
`purpose=controller_privacy_recovery`, `identity_issuer`, `identity_subject`, `verification_method`, and
`verification_event_id`. Bind issuer/subject to one local `ExternalIdentity`; never resolve by caller-supplied email.
Require `exp - iat <= 900` seconds and at most 60 seconds clock skew. Define the issuer's online or signed revocation/
status check, its outage behavior (reject requests), key rotation, and evidence fields. Plan 13 stores only keyed
fingerprints of `jti`/event identifiers, claim version, issuer, verified/consumed times, adapter outcome, and request ID.
The first atomic consumption succeeds; replay with the same normalized action and idempotency key returns the original
request, while any other reuse returns `409`. No raw receipt is persisted or logged.

Review and approve the contract, placement matrix, and receipt contract with privacy counsel/DPO, Security, identity,
billing, and operations. Plan 19 publishes the selected notices later. Leave status pending and this plan not ready
until every implementation row, notice choice, and receipt field has a concrete actual decision.

## Interfaces and Dependencies

The contract is a normative Markdown interface with tables for `ControllerDataItem`, `ControllerPurpose`,
`NoticePlacement`, `BrowserStorageTechnology`, `RetentionRule`, `RightsRule`, `ExceptionRule`, `RecipientTransfer`, and
`AccountRecoveryReceiptContract`. Each stable data-item ID
must map to an owning module/store and later plan-13 adapter.

Counsel must review the applicable requirements in the official
[GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj), including purpose/legal-basis, transparency, and data-subject
rights provisions, and the official
[California Consumer Privacy Act regulations](https://cppa.ca.gov/regulations/consumer_privacy_act.html). These links
are research inputs, not preselected legal conclusions.

Plan 01 supplies the role boundary and shared inventory. Plans 03 and 11 supply log/content and managed lifecycle
controls. Plan 10 supplies controller-side subprocessor and transfer evidence where the same providers are used. Plan 13 must implement exactly the approved data-item IDs, receipt contract, rights actions, deadlines, and
exceptions; plan 19 must implement exactly the selected notice placements;
runtime defaults must not fill a missing legal decision.

No runtime API, persistence, configuration, package, or external service is added by this documentation plan.

## Acceptance Criteria

- The contract inventories every current controller-data field in identity, BFF Redis state, Keycloak, organization
  onboarding, service-client management, credits, payments/Paddle, audit/security logs, and managed backups.
- Every inventory row has one approved purpose, legal decision, notice/timing, recipient/transfer treatment, retention
  trigger/rule, rights mapping, exception owner, implementation adapter ID, and approval state; unresolved rows block
  plan readiness and cannot be described as approved.
- A prominent role matrix prevents account/auth/billing/fraud/security/compliance purposes from authorizing reuse of
  customer-supplied verification addresses or inferences.
- Notice placements cover direct and indirect collection and identify exact surface, content/version, locale/fallback,
  timing, owner, effective date, evidence, and notice-only versus assent treatment without claiming publication.
- The browser-storage table classifies `lef_session`, `lef_csrf_token`, and `lef_login_state` as strictly necessary. It
  matches their actual purpose, scope, security attributes, and lifetime and prohibits secondary tracking use. It says
  no banner is implied absent a nonessential technology; an unknown or future technology remains pending/default-deny.
- The recovery contract names one actual issuer and adapter owner; exact allowlisted signing/key rules and claims;
  issuer/subject binding; 15-minute maximum TTL; single-use/idempotent replay; revocation/status, outage, and key-
  rotation behavior; and non-secret evidence fields.
- Retention rules distinguish deletion, correction, detachment, pseudonymization, restriction, and required retention;
  they include sessions, invitations, memberships, Keycloak identities, credentials, ledgers, purchases/adjustments,
  audit/security evidence, logs, backups, holds, and restored data.
- Rights rules cover authenticated and account-recovery intake, identity/organization checks, access, correction,
  deletion, restriction, objection/opt-out, portability where approved, appeals, deadlines/extensions, provider
  assistance, and truthful retained-record receipts.
- The contract states that the current repository sends no commercial email and that future sending requires a
  separate CAN-SPAM and other applicable marketing-law plan.
- Legal/DPO, identity, billing, security, and operations approvals are recorded by role, with no customer data, private
  legal advice, secret, or false compliance claim committed.
- No application source, schema, runtime configuration, endpoint, queue, provider behavior, lockfile, or Bruno
  collection changes; plan, architecture, prose, formatting, and whitespace checks pass.

## Validation

Reconcile each contract row against the cited source field and provider contract. Run:

    TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test -- scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts --runInBand
    corepack pnpm architecture:check
    corepack pnpm docs:lint -- docs/privacy/controller-data-contract.md docs/privacy/email-verification-processing-contract.md README.md src/libs/modules/identity/README.md src/libs/modules/auth/README.md src/libs/modules/bff-session/README.md src/libs/modules/organization-onboarding/README.md src/libs/modules/service-client-management/README.md src/libs/modules/credits/README.md src/libs/modules/payments/README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/12-define-controller-data-contract.md
    corepack pnpm exec prettier --check docs/privacy/controller-data-contract.md docs/privacy/email-verification-processing-contract.md README.md src/libs/modules/identity/README.md src/libs/modules/auth/README.md src/libs/modules/bff-session/README.md src/libs/modules/organization-onboarding/README.md src/libs/modules/service-client-management/README.md src/libs/modules/credits/README.md src/libs/modules/payments/README.md .agents/plans/privacy-compliance/README.md .agents/plans/privacy-compliance/12-define-controller-data-contract.md
    git diff --check

Conduct a table review with privacy counsel/DPO and every named system owner. Sample at least one row from every store,
one mixed-role identifier, one financial retention exception, one security hold, one former member, and one person who
cannot sign in. Record only sanitized row IDs and approval evidence.

Bruno is not applicable because this plan creates approved documentation and contracts without changing HTTP behavior.
Plan 19 owns HTTP/runtime notice publication and its Bruno coverage.

## Idempotence and Recovery

Inventory generation and prose validation are safe to repeat. Each data item and notice has a stable ID; an approved
revision is superseded with a new version/effective date instead of silently rewritten. If source or counsel review
invalidates a row, mark it pending, correct it, and block downstream implementation rather than preserving a false
answer.

Reverting the PR removes repository documentation and links only; it does not retract a notice already published
outside the repository. The privacy owner must use the approved notice correction/version process. Preserve unrelated
source and do not reset Keycloak, PostgreSQL, Redis, Paddle, or customer data for this docs-only work.

## Artifacts and Notes

Record inventory counts by store, stable data-item IDs, notice versions, approver roles, review dates, pending-decision
counts, and validation results. Never record real user/customer data, tokens, provider payloads, private legal advice,
credentials, or payment information.

## Plan readiness

Ready after privacy counsel and the DPO approve every controller-data decision and exact notice-placement choice, and Security supplies the approved account-recovery receipt issuer, adapter owner, claims, binding, TTL, replay, revocation, key, and evidence contract.
