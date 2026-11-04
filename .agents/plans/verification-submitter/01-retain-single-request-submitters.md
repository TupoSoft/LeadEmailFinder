# Retain the Submitter of Single-Email Requests

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A durable single-email verification request records which authenticated human or service client submitted it.
An internal request-store read recovers that reference after a restart; retries and settlement preserve it.
This plan delivers one PR, `feat(email-verification): retain single-request submitters`.

## Progress

- [ ] (2026-09-18) Add the private submitter contract and constrained request persistence.
- [ ] (2026-09-18) Carry trusted principals through both routes into the durable admission claim.
- [ ] (2026-09-18) Prove original ownership across replay, shared work, recovery, and settlement.
- [ ] (2026-09-18) Complete validation and update persistence and lifecycle documentation.

## Plan dependencies

- `verification-billing-hardening/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Store an opaque kind/ID reference per request. Rationale: Several requests can share an execution or
  result, while identity display data has separate ownership. Date/Author: 2026-09-18, Codex planning.
- Decision: Extend the prerequisite's atomic receipt claim. Rationale: Concurrent requests must select one
  original submitter without duplicating the admission redesign. Date/Author: 2026-09-18, Codex planning.
- Decision: Keep organization-scoped replay across actors. Rationale: Attribution describes the original
  submission without changing retry or access semantics. Date/Author: 2026-09-18, Codex planning.
- Decision: Allow null in storage but require a reference for new direct submissions. Rationale: Historical rows
  and batch callers preceding plan 02 have no trustworthy actor. Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The source basis is `0664db3cdeb0704932f4ad5bc877541c796e8663`, inspected on 2026-09-18. Paths below are
repository-relative. The prerequisite changes late request insertion into an atomic receipt claim and resumable
admission. Implement against its merged contract rather than restoring the older insertion flow.

`src/libs/modules/identity/src/domain/auth-principal.ts` defines `AuthPrincipal` and `AuthCredentialKind`, exported
through identity's public barrel. Under `src/libs/modules/`, the authenticator in
`bff-session/src/application/bff-session-credential-authenticator.ts` sets a human's `credentialId` to their
external-identity ID. `auth/src/application/oidc-credential-authenticator.ts` uses the local service-credential ID.

Under `src/libs/modules/email-verification/src/`, the controllers in
`api/http/synchronous-verification/current/sync-email-verification.controller.ts` and
`api/http/asynchronous-verification/async-email-verification.controller.ts` currently forward only email,
organization, and request key. Their callers, `application/delivery/synchronous/run-synchronous-verification.ts`
and `application/delivery/async/async-email-verification.service.ts`, both use
`application/operations/verification-admission.service.ts`.

`application/ports/verification-request-store.ts`,
`infrastructure/persistence/typeorm-verification-request.store.ts`, and
`infrastructure/persistence/typeorm/verification-request.entity.ts` own durable requests. None stores an actor.
Settlement and cancellation update these rows. Identity's audit table is not the owner of submission history.

## Scope and Non-Goals

Add internal attribution to sync and async receipts, including cache, shared, funded, and insufficient-funds
admissions. Preserve it throughout recovery, cancellation, and settlement. Update shared fixtures and current
batch insertions with explicit unknown references as needed; plan 02 activates trusted batch attribution.

This PR adds no public actor fields, endpoints, UI, name resolver, identity lookup, per-user authorization/billing,
general audit stream, or attribution for attempts rejected before a receipt exists. Request-attachment race
repairs, batch workflow changes, and retention enforcement remain with their existing plans.

## Plan of Work

Create private `domain/verification-submitter.ts` under the verification module. Define
`VerificationSubmitterReference` with `readonly` fields `kind: AuthCredentialKind` and `id: string`, using identity's
public type. Add the pure `isVerificationSubmitterReference(value: unknown)` type guard, accepting only a
recognized kind and a valid UUID string. Consumers copy only these two fields after validation; extra properties
never enter stored attribution. Cover valid kinds, malformed UUIDs, null, and partial objects in
`domain/verification-submitter.spec.ts`. Keep the contract framework-independent and out of the verification public barrel. Add
`submitter: VerificationSubmitterReference | null` to stored request records and insertion/claim data.

Add nullable `submittedByKind` text and `submittedById` UUID columns to `VerificationRequestEntity`. A database
check accepts either two null values or two present values with kind `human_session` or `service_client`.
Use explicit null checks so an unknown SQL truth value cannot admit a partial pair. Add no identity foreign key,
cascade, unneeded index, or display-data copy. The adapter maps both columns to one reference or null; a corrupt
partial pair fails instead of inventing an actor. Existing rows remain null without a backfill.

Require a non-null `submitter` on `SynchronousVerificationCommand`, `VerifyAsyncInput`, and direct `AdmitInput`.
Each controller constructs it from `principal.credentialKind` and `principal.credentialId`, then delivery passes
it unchanged into the prerequisite's `claimAdmission`. Select fields explicitly: JSON properties `submitter`,
`submittedByKind`, and `submittedById`, or matching headers, cannot override the principal. Preserve the existing
extra-body-property policy. No complete principal crosses the application boundary.

Write the reference in the first atomic claim, including preparing receipts that recovery later resumes. The
committed winner determines ownership. A matching key from actor B returns the stored reference for actor A; actor
changes are not fingerprint conflicts. A different email or delivery mode still conflicts. Finalization and
recovery read the stored actor without a current principal or worker identity. Replaying null leaves it null.
Distinct requests sharing one execution retain their own references independently of the execution's payer.

Review `typeorm-verification-settlement.store.ts`, request cancellation, and attachment methods so partial
updates and entity saves preserve attribution. Cover cache and insufficient-funds receipts as well as charged
requests. Pre-admission validation, permissions, key conflicts, and address cooldown retain their existing receipt
behavior. Update batch request inputs to specify `submitter: null` until plan 02; never infer their actor.

Update `src/libs/modules/email-verification/README.md`, the durable-record inventory in
`docs/privacy/email-verification-processing-contract.md`, and the pending field coverage in
`.agents/plans/privacy-compliance/07-enforce-verification-data-retention.md`. Include attribution in the containing
record's lifecycle without a new lifetime or audit copy. The contract's 30-day maximum after purpose completion
already covers these records; the seven-day read window is not deletion. Record that enforcement remains
incomplete. Normal identity removal leaves an unresolved reference; future approved erasure may clear both actor
fields together through its owning privacy workflow. This plan implements neither cleanup nor rights handling.

## Interfaces and Dependencies

`VerificationSubmitterReference` is the new private domain type. Internal nullable `submitter` maps to
`submittedByKind` and `submittedById`. New direct commands require a reference; legacy records, historical fixtures,
and transitional batch insertion may use null. Real-database fixtures use valid local identity UUIDs.

The prerequisite owns atomic claim, replay, and recovery. This plan adds immutable claim data without changing
states or key scope. Authentication, permissions, organization ownership, billing, DTOs, operation metadata,
logging field restrictions, and OpenAPI shapes remain unchanged. No new configuration or package is required. Plan 02
consumes the reference and persistence mapping.

## Acceptance Criteria

- Human and service-client submissions through each single-email route persist the exact authenticated kind/ID
  whenever a receipt is created, including cache, shared, funded, and insufficient-funds outcomes.
- JSON/header actor values cannot replace attribution. Missing authentication or permission creates no receipt.
  Responses continue to omit actor fields.
- Concurrent equivalent calls from two actors with one organization/key return one request ID whose actor is the
  durable claim's winner. Retries and recovery preserve it. Conflicting fingerprints change neither that actor
  nor the prerequisite's rejection/funding guarantees.
- Independent requests sharing one execution retain different actors. Settlement, cancellation, and restarts
  preserve those references and existing billing outcomes.
- Existing null references stay unknown on replay. PostgreSQL rejects partial pairs and unsupported kinds.
  Identity deletion cannot cascade into request deletion; stored references need no identity lookup to be read.
- Focused tests, architecture, type, lint, API compatibility, and changed-document prose checks pass.

## Validation

Run from the implementation checkout. These are planned commands, not implementation results:

```sh
corepack pnpm exec jest --runInBand verification-submitter.spec.ts verification-admission.service.spec.ts typeorm-verification-request.store.spec.ts verification-reconciler.spec.ts async-email-verification.service.spec.ts run-synchronous-verification.spec.ts typeorm-verification-settlement.store.spec.ts
corepack pnpm exec jest --runInBand sync-email-verification.controller.spec.ts async-email-verification.controller.spec.ts synchronous-verification-http.integration.spec.ts async-email-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm openapi:check
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:async-verification
```

Extend HTTP suites with human/service principals and spoofed actor fields. They prove transport mapping, not
persistence. Extend `verification-billing.integration.spec.ts` with real adapters, two actor UUIDs, controlled
concurrent claims, restarted admission/reconciliation, shared work, null replay, invalid pairs, and settlement.
Check stored actors alongside existing balance and request-count assertions. For identity deletion, use a fixture
that respects unrelated identity foreign keys; deleting the referenced identity must leave the request intact.

Bruno: extend existing `bruno/async-verification` submission/replay cases with spoofed actor input and exact public
field assertions. Retain success, rejection, and organization concealment. This proves unchanged HTTP contracts
for the new wiring; PostgreSQL assertions prove the private actor value. If request counts change, update
`scripts/bruno/run-collection.mjs` and `scripts/bruno/async-verification-runner.test.mjs` together. The launcher owns
fixture preparation; `corepack pnpm exec bru run --env local` is the collection-directory equivalent after its
dependencies and environment are prepared. Report unavailable runtime separately from static validation.

## Idempotence and Recovery

The winning claim writes attribution once. Recovery and retries use the stored value, including null. Do not
backfill from a current caller or overwrite an unknown reference during replay.

Use `TYPEORM_SYNCHRONIZE=true` only with disposable development data. The owned
`corepack pnpm test:verification-billing-postgres` runner recreates and seeds its `verification_billing_test`
schema. If application fixtures need rebuilding, run `corepack pnpm dev:reset` only for the intended disposable
`LEF` stack; confirmation and reseeding restore Keycloak, customer credentials, and credits. Preserve other
checkouts and ignored secrets. Add no migrations or backfills. Reverting restores prior code; reset/reseed only
an incompatible disposable schema when necessary. Planning performs no reset.

## Artifacts and Notes

Read root/module `AGENTS.md`, the canonical module README, the affected module README, and the repository
PostgreSQL skill before implementation. Verify the prerequisite's final claim method names while preserving
this contract. Follow root issue assignment, project status, and PR-linkage instructions when implementation
starts. Record actual local and CI evidence separately.

## Plan readiness

Ready to implement
