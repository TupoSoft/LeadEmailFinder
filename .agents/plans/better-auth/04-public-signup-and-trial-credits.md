# Enable Public Registration with 100 Trial Credits

This ExecPlan is a living document maintained according to `.agents/PLANS.md`. It describes one pull request,
with the conventional commit and PR title `feat(onboarding): enable public signup with 100 trial credits`.

## Purpose / Big Picture

A person can request a magic link without an invitation, prove ownership of their email address, choose a
workspace name, and create their first workspace with 100 credits. The person becomes its owner and must
complete the existing privileged-account MFA enrollment before accessing business features. The credits do
not expire. Refreshes, concurrent tabs, repeated sign-in attempts, and lost responses never create another workspace
or grant another trial to the same verified identity.

## Progress

- [ ] (2026-10-19) Add the verified-session onboarding endpoint and atomic registration persistence.
- [ ] (2026-10-19) Enable public magic-link registration and implement the workspace setup screen.
- [ ] (2026-10-19) Add focused persistence, HTTP, browser, Bruno, and contract coverage.
- [ ] (2026-10-19) Run the documented validation and record results and limitations.

## Plan dependencies

- `better-auth/01`
- `better-auth/03`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Enable public magic-link registration, ask for a workspace name, and grant 100 trial credits.
  Date: 2026-10-19. Author: user. These are explicit product choices.
- Decision: Keep trial credits without expiration, matching the existing credit balance model.
  Date: 2026-10-19. Author: planning agent. This default adds no separate expiry mechanism.
- Decision: One verified identity can create one workspace through this workflow. Keep a durable unique
  registration record instead of deriving trial eligibility from active membership or current balance.
  Date: 2026-10-19. Author: planning agent. Membership removal must not reset a consumed trial.
- Decision: Create the owner membership and trial together, then require MFA before any business access.
  Date: 2026-10-19. Author: planning agent. This preserves the privileged-role policy without inventing an
  organization or business principal before the workspace exists.
- Decision: Preserve existing platform organization creation and invitation workflows. A removed member
  who joined only by invitation may create their first workspace when no active membership remains.
  Date: 2026-10-19. Author: planning agent. This never restores access to the former organization.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Repository evidence was inspected at `352553caa799acee39311007821d50a7a98c4cd7`. The prerequisites introduce
Better Auth through `src/libs/better-auth/src/` and native magic-link sessions through the existing
`bff-session` boundary. This plan starts after those prerequisites, rather than retaining the current
Keycloak authorization-code flow or adding another authentication system.

`src/libs/modules/organization-onboarding/src/application/organization-creation.service.ts` currently
creates an organization with a pending owner invitation. Its identity-owned registration adapter writes
that organization, invitation, and audit rows together. It requires a resolved `AuthPrincipal`, so it
cannot represent a newly verified person who has no organization. Keep this platform workflow intact.

`identity` owns organizations, external identities, memberships, the credit ledger, and audit persistence.
`typeorm-invitation-acceptance-store.ts` locks the external identity before checking active memberships.
`typeorm-credit-ledger-store.ts` creates its own transaction for each grant and uses a unique
`(organizationId, reference)` ledger record to prevent repeated credit effects. Calling that public grant
method after organization creation would leave a partial-registration failure window.

`better-auth/03` exposes `VerifiedHumanSessionReader` and `VERIFIED_HUMAN_SESSION_READER` from the public
`bff-session` barrel. The reader returns validated `nativeUserId`, `externalIdentityId`, email, session expiry,
and MFA information, without an organization principal or Better Auth SDK objects. Its `GET /v1/auth/sign-in-state` response
uses `signed_out`, `organization_setup_required`, `mfa_enrollment_required`, `mfa_verification_required`,
and `authenticated`. Use those states instead of returning native authentication data to the browser.

## Scope and Non-Goals

This PR enables public registration, workspace setup, one atomic trial grant, and the corresponding session-state
and route transitions. It preserves the prerequisites' magic links, sessions, API keys, MFA, email transport,
and business permissions. It does not add another organization source, trial expiry, recurring grants,
multiple workspace creation, invitation grants, payment changes, production migrations, or fraud prevention products.

## Plan of Work

First, add the self-registration contract to `identity` under
`src/application/ports/self-service-organization-registration-store.ts`, with its record and outcome types
in the existing application/domain layers. Add `SelfServiceOrganizationRegistration` in infrastructure
persistence and register it through `IdentityModule`. Its primary key is `externalIdentityId`; it records
`organizationId` and creation time. Use restrictive foreign-key deletion for both references so deletion
cannot silently remove this eligibility record. Existing membership changes must never delete or reset it.

Implement `typeorm-self-service-organization-registration-store.ts` as one TypeORM transaction. Resolve
and lock the same external-identity row used by invitation acceptance; use the unique issuer/subject key
and conflict-safe insertion when necessary, never a process-local lock. Inspect the registration record
before active membership checks. If it exists and its membership remains active, return its original
workspace as a replay. Do not rename it, reset its balance, or issue another grant. If that registration's
membership is disabled or unavailable, return a conflict without mutation. If no registration exists,
reject any active membership with a conflict and make no grant. Disabled invitation-only memberships do
not prevent first registration, and they remain disabled.

For a new eligible registration, persist the organization with the validated name, its active owner
membership, the durable registration record, one trial ledger grant, the credit account update, and audit
rows in that transaction. Fix the grant at 100 and its reference at `signup-trial:<externalIdentityId>`.
The existing grant table remains the ledger authority; do not create a second credit balance or quota.
Audit organization creation, owner-membership creation, and the trial grant using the verified human's
issuer/subject and local identity ID. Do not persist raw cookies, magic-link tokens, or session secrets.

Extract the existing grant operation into a private transaction-aware helper under identity infrastructure,
for example `apply-credit-grant.ts`, accepting the caller's `EntityManager`. Reuse it from the ledger
adapter and the self-registration adapter. Preserve account insertion/locking, unique-reference handling,
immutable recorded amounts, current-balance results, and all existing public credit contracts. Do not
import an ORM manager into application/domain ports or start a separate transaction for the registration grant.
An unexpected helper or audit failure rolls back every registration write.

Add a framework-free `SelfServiceOrganizationRegistrationService` in organization-onboarding application,
constructed by its composition module using the identity port. It receives trusted verified identity
context and a name, normalizes the name with `trim()`, and enforces the existing organization-name length
of 1 through 200 characters after normalization. The request must contain only `name`; forbid additional
fields instead of accepting client-selected role, organization ID, user ID, or credit amount.

Add `api/onboarding.controller.ts` and `api/verified-onboarding-session.guard.ts` at
`POST /v1/onboarding/organization`. Inject the public reader from `bff-session`; reject missing, expired,
revoked, or unverified sessions and all API-key callers. The route intentionally accepts a valid onboarding
session without a business `AuthPrincipal`. Use the existing `@Public()` metadata to skip the membership-based global guard, and attach
`@UseGuards(VerifiedOnboardingSessionGuard)` directly to this separate controller. The dedicated guard is
mandatory despite that metadata. Never make the handler anonymously callable or fabricate an organization
principal.

Map that trusted context into the use-case command using `issuer = AUTH_IDENTITY_ISSUER`,
`subject = context.nativeUserId`, and `externalIdentityId = context.externalIdentityId`.
Read the issuer constant through identity's bare public barrel; never accept these values from the request.

Reuse `BrowserSessionMutationGuard.checkSessionMutation(request)`, exported by the prerequisite BFF module,
to enforce Origin and CSRF for this verified session without an `AuthPrincipal`.
The dedicated onboarding guard invokes it before writes. Keep framework request types in API adapters;
the use case receives only plain validated identity context. Document the capability dependency from
organization-onboarding to `bff-session`; keep the module graph acyclic.

Enable registration in the prerequisite Better Auth magic-link runtime configuration without adding a second
link-request endpoint. A request for an unknown address returns the same generic accepted response as an
existing address. Create or admit the new identity only after successful email proof, never from the
link-request body alone. Preserve delivery throttling, token expiry, one-time use, redirect validation,
and privacy headers introduced by the prerequisites. Do not assign `platform_admin` or grant platform
permissions. Ordinary invitation acceptance and existing memberships never invoke the trial-registration
operation implicitly.

Extend sign-in-state classification to use the durable registration and current membership facts. An identity
with no active membership and no registration record receives `organization_setup_required`, including a person
whose invitation-only membership was removed. A consumed registration with a removed membership receives the
existing account-unavailable response. This replaces the prerequisite's temporary rejection of disabled-only
membership histories; it never grants access to the former organization or changes a disabled membership.

Implement the setup UI in `apps/web/src/features/onboarding/`, using the established form styles,
`ProductPanel`, `Stack`, and `SupportingText`. Add `/onboarding/workspace` to `apps/web/src/app/routes.tsx`.
Route `organization_setup_required` there; unauthenticated access returns to sign-in, an authenticated
member returns to the safe application destination, and successful registration refreshes the sign-in
state and routes the new owner to the existing MFA enrollment screen. Direct application URLs must remain
blocked until MFA completes. Preserve safe destinations through the existing authentication owner, never
through arbitrary callback URLs.

The form asks only for the workspace name and explains the 100 non-expiring credits. Keep field validation
inline, prevent duplicate clicks, and show a recoverable failure without erasing the name. Do not silently
retry a mutation after an uncertain network outcome. Offer an explicit retry: registration is idempotent
for the verified identity, so a replay returns the original workspace. On `409`, refresh the sign-in state;
if another tab accepted an invitation, follow that resulting membership instead of leaving a stale form. Use the existing authentication
request-generation boundary so a late result after sign-out cannot update another account's UI. Keep
new copy with the feature and update the public entry's registration action without a landing-page redesign.
Update `UX-CONTRACT.md` for the new onboarding state and route behavior; reuse existing visual tokens.

Extend `bruno/organization-onboarding` and its existing launcher with a fresh verified native-session
fixture. Exercise the actual registration endpoint, not an M2M rejection as a proxy for success. Adapt the
prerequisites' mail-capture/native-session fixture and count-only reporting so tokens, cookies, and MFA
material stay outside arguments and artifacts. Publish the endpoint in runtime and browser OpenAPI and regenerate
`packages/api-client` with the existing tooling. Update affected module documentation and the frontend contract.

## Interfaces and Dependencies

`POST /v1/onboarding/organization` accepts `{ "name": "Example workspace" }` through a verified native
human session with the existing Origin and CSRF protections. Return `201` on first creation and `200` on
an equivalent retry, both with `{ "organizationId": "<uuid>" }`. A retry with a different valid name
returns the stored organization without renaming it. Both responses and failures carry `Cache-Control:
no-store`. The browser refreshes `/v1/auth/sign-in-state` to determine its next screen.

Return `400` for an invalid name, malformed JSON, or additional fields; `401` for missing or unusable
verified human sessions; and `403` for API keys, invalid Origin, or failed CSRF checks. Return `409` when
the identity already belongs to another active organization or has consumed this registration but lost
its membership. Preserve a redacted `5xx` for unexpected infrastructure failure. No response includes raw
authentication data, the ledger reference, credit internals, or platform authority.

Export the new identity store contract and token through identity's bare barrel, and export its entity
only for the established schema-fixture composition pattern. Update every existing explicit identity
entity set, including credit/payment integration fixtures, so module repository wiring remains complete. Keep the organization-onboarding use case,
controller, and DTOs private. The application service depends on identity ports; the API adapter consumes
`VerifiedHumanSessionReader` from the bare `bff-session` barrel. No new runtime dependency is required.

## Acceptance Criteria

- An unknown email address receives a generic link-request response and cannot register before valid
  email proof. A verified registration reaches the workspace-name form without an invitation.
- First registration creates exactly one organization, active owner, durable registration record,
  100-credit grant, and audit entries; the account reports balance 100, reserved 0, and available 100.
- Refreshes, repeated sign-in attempts, duplicate submissions, concurrent tabs, and lost-response retries create
  no additional workspace or grant. A different retry name never changes the first committed name.
- Spending credits and replaying registration preserves the reduced balance. Trial credits have no expiry.
- Concurrent self-registration and invitation acceptance produce at most one active organization
  membership. An invitation-only member or existing active team receives no registration grant.
- A removed invitation-only member with no active membership can create their first workspace. A removed
  self-registered member cannot recreate membership, create another workspace, or repeat the grant.
- Any registration-step failure leaves no partial organization, owner, registration record, or trial grant.
  A fresh explicit retry can complete after the failure is resolved.
- Missing/unverified/revoked sessions, API keys, bad names, forged privilege fields, and failed browser
  protections produce the documented rejection without writes.
- The new owner must enroll in MFA before business access, including API-key creation. No new person
  receives platform authority, and platform/invitation operations preserve their prior contracts.
- The setup screen works on refresh, direct URLs, keyboard navigation, and narrow screens, preserves the
  name on recoverable failure, and discards late results after an authentication boundary change.

## Validation

Run from the repository root after implementation. The named new tests are part of this PR; record actual
results, skipped gates, and environment limitations rather than describing planned commands as passed.

```sh
corepack pnpm test -- self-service-organization-registration.service.spec.ts onboarding.controller.spec.ts verified-onboarding-session.guard.spec.ts typeorm-self-service-organization-registration-store.spec.ts typeorm-credit-ledger-store.spec.ts browser-session-mutation.guard.spec.ts --runInBand
corepack pnpm test:credits-postgres
corepack pnpm test -- membership-mutation-concurrency.integration.spec.ts --runInBand
corepack pnpm --filter ./apps/web test:ci -- src/features/onboarding/onboarding.test.tsx src/features/auth/auth-session.test.ts
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm --filter ./apps/web typecheck
corepack pnpm design:lint
corepack pnpm ui:audit
git diff --check
corepack pnpm bruno:organization-onboarding
corepack pnpm --filter ./apps/web build
corepack pnpm --filter ./apps/web exec playwright test --config playwright.auth.config.ts tests/e2e/public-signup.spec.ts
```

Add `self-service-organization-registration.integration.spec.ts` to the existing credits PostgreSQL launcher's
suite arguments and required-suite report check, with `TEST_CREDITS_POSTGRES_URL` and a random owned schema.
Cover real transaction rollback, ledger replay after spending, concurrent tabs, the invitation race, and
removed-member histories. Update `scripts/testing/credits-postgres.spec.ts` for the required-suite change;
include it in the focused Jest run. Existing credit and payment integration suites must still execute
without skipped tests. The final-owner suite separately needs a disposable `TEST_POSTGRES_URL` ending in
`_test`; preserve its existing gate and report if that suite cannot run.

`playwright.auth.config.ts` is the prerequisite's private native-auth browser configuration; extend its
explicit test matching for the new registration suite. Use its secret-safe artifact handling, real mail capture,
and existing MFA helper. Test the first registration through MFA to balance 100, refresh, denied direct business
URLs before MFA, double-tab registration, retry after a dropped response, and no trial for invitation-based
access. Verify desktop and 320-pixel layouts, focus, accessible validation, and loading/recovery states.
Bruno must execute the changed success, replay, validation, authorization, and CSRF paths with real cookies.
If runtime services are unavailable, run static collection validation and explicitly leave execution unverified.

## Idempotence and Recovery

Retry after an uncertain response with the same verified identity; the durable registration record selects
the original workspace and the grant reference prevents a repeated effect. Do not retry with another identity
or automatically rename the workspace. A rolled-back attempt consumes no registration or trial eligibility.

There is no production data migration. Register the new entity using `TYPEORM_SYNCHRONIZE=true` only for
disposable development data. To recover a clean stack, run `corepack pnpm dev:reset -- --confirm-project=LEF`
through the ownership-checked Better Auth reset/reseed workflow delivered by the prerequisites. This discards
all development organizations, credits, and sessions. Reverting source does not recover discarded data.
Never reset another checkout's stack or preserve deleted trial eligibility outside the intended test fixtures.

## Artifacts and Notes

The implementation PR uses the title `feat(onboarding): enable public signup with 100 trial credits`, closes
its synced ExecPlan issue, and contains only this workflow plus its required contracts and validation.
Keep the issue assignment/status and PR linkage workflow from root `AGENTS.md`. Preserve the primary checkout.
Read the module/frontend instructions, ICP, design contract, and repository skills before implementation.
This plan authoring task ran no implementation tests and made no application changes.

## Plan readiness

Ready to implement
