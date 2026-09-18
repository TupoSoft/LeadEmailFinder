# Reject Forbidden Domains Within Verification Batches

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A CSV batch containing an operator-prohibited domain must finish with an explicit, free failure for each affected
row while permitted addresses continue normally. Its download preserves input order and duplicates without
claiming that a prohibited mailbox does not exist. This plan delivers one implementation PR,
`feat(verification): reject forbidden batch addresses`, and completes enforcement before policy administration
becomes available through the API and browser.

## Progress

- [ ] (2026-09-18) Add the forbidden admission outcome and replay-safe, zero-charge batch receipt.
- [ ] (2026-09-18) Preserve failed rows and truthful counts in status responses and CSV downloads.
- [ ] (2026-09-18) Prove policy ordering, recovery, billing, and mixed-batch behavior with focused checks.
- [ ] (2026-09-18) Extend owned Bruno fixtures, update contracts, and document the disposable schema reset.

## Plan dependencies

- `verification-billing/05`
- `verification-billing-hardening/02`
- `batch-verification-hardening/01`

## Surprises & Discoveries

- Current batch verification bypasses the retired `EmailVerificationOrchestrator`, just as the single routes do.
  `BatchAdmissionService` resolves cache, cooldown, shared execution, and new execution directly; all probes use
  `VerificationExecutionRunner`. Checking the runner alone would still allow forbidden cache reuse and holds.
- The manifest admission kind is a PostgreSQL enum. Adding a forbidden kind changes the synchronized development
  schema even though no new column is needed. The existing failed-address query counts only created executions.

## Decision Log

- Decision: Match the exact canonical recipient domain globally; list subdomains separately. Reuse the policy
  normalization from hardening plan 02: lowercase ASCII IDNA, with one terminal dot removed. Never match parent
  suffixes, MX exchanges, or discovered synonyms. Rationale: preserve the chosen operator policy boundary.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Fail individual forbidden addresses without rejecting the whole valid CSV. Retain the existing
  public job states and billing reasons. Rationale: permitted rows remain useful and accounting stays compatible.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Policy is read while resolving each previously unresolved address. A recorded outcome is immutable;
  the shared runner rechecks policy before each new attempt. Already-started attempts and persisted financial
  intentions retain the behavior defined in hardening plan 02. Date/Author: 2026-09-18, Codex planning.
- Decision: Depend on batch hardening plan 01 for stable receipt identity, not its entire road map. New forbidden
  rows own no execution and need no new settlement-locking mechanism. Existing execution recovery stays with its
  current owners. Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All shortened `application/` and `infrastructure/` paths below start at
`src/libs/modules/email-verification/src/`. The working customer hypothesis in
`docs/product/ideal-customer-profile.md` includes teams checking supplied lists; it is context, not market evidence.

`application/delivery/batch/batch-email-verification-workflow.ts` validates CSV rows, lowercases addresses, creates
the durable manifest, admits unique addresses, dispatches created executions, waits for settled requests, and
publishes the result file. `batch-admission.service.ts` currently resolves each address before reserving the group's
new executions. `batch-admission-store.ts` defines its immutable per-address outcome and status counts.

`infrastructure/persistence/typeorm/batch-unique-address.entity.ts` stores that outcome and receipt identity.
`typeorm-batch-admission.store.ts` derives counts from requests; the CSV writer at
`infrastructure/storage/batch-verification/s3-batch-result-writer.ts` joins those requests to every original row.
Batch hardening plan 01 supplies `ensurePayerRequestId` and compatible receipt replay; use that committed identity
instead of inferring receipt existence from a non-null manifest UUID.

Hardening plan 02 supplies the canonical `DomainPolicyService` check and shared execution cancellation. It prevents
new attempts after policy changes, recovers interrupted credit releases, and preserves existing settlement intentions.
This plan adds the missing batch admission behavior; it does not implement another policy reader or cancellation path.

## Scope and Non-Goals

Change batch admission, request materialization, counts, CSV policy-failure cells, composition, and focused tests.
Keep upload `202`, polling `200`, existing authorization, five public job states, and CSV columns. Add no policy
management endpoint, browser screen, suffix rule, new email-result reason enum, upload idempotency feature, or
candidate-generation restriction. Those functions either belong to another plan or perform no verification.
Do not repair unrelated batch funding, attachment, download, or browser-fixture defects in this PR. Rebase onto
completed prerequisite contracts and record an unrelated validation failure honestly.

## Plan of Work

Read root and module instructions, module README, and the repository PostgreSQL skill before implementation.
In `batch-admission-store.ts`, extend `BatchUniqueAddressAdmissionKind` with `forbidden`; update the entity's enum
constant and its documentation. Keep `executionId` and `resultId` null for this outcome. Add no artificial result,
execution, SMTP record, or settlement intention. Reuse the stable manifest receipt identity from batch plan 01.

Inject `DomainPolicyService` through the existing factory in
`infrastructure/queues/batch-verification/batch-email-verification.module.ts`. At the beginning of `resolveAddress`,
extract and canonicalize the recipient domain using the common helper from hardening plan 02. Check policy before cache,
cooldown, `claimOrJoin`, or any reservation. A forbidden decision records the outcome and returns immediately.
The policy helper must not rewrite the existing normalized-address key or merge Unicode and ASCII address receipts.
An unreadable policy propagates the worker failure/retry path without recording an allowed outcome or continuing
to group funding on that admission attempt. Previously committed rows remain available for replay.

In request materialization, create or replay the forbidden address's receipt as `deliveryMode: batch`,
`source: fresh`, `billingState: settled`, `finalReason: failed`, with null execution/result and zero reserved/charged
counts. Here `fresh` means a newly admitted request, not a completed probe. Use the prerequisite's idempotent receipt
operation; never overwrite a settled request or assign a new payer UUID after a crash. Missing receipt materialization
must be retried even when the group is already admitted or has failed funding for other addresses.

Forbidden rows never enter `collectCreatedExecutions`, reservation lists, or dispatch. A group containing only
forbidden addresses is admitted without calling credits and proceeds to its normal downloadable result. A mixed
group funds only permitted new executions; existing insufficient-funds behavior for those executions is unchanged.
Do not reevaluate an address whose manifest already records an outcome when a worker retries, even if policy changed.
Thus, an earlier cache decision remains recoverable, whereas queued/retry execution is checked by the shared runner.

Update `getStatusCounts()` so `failedAddresses` includes forbidden admissions with a settled failed receipt as well
as failures from created executions. `completedAddresses` includes each settled forbidden unique address.
Do not count them as cache/shared/cooldown/conclusive/inconclusive or add a public counter. Duplicates still affect
only row and duplicate totals; reservation and charge aggregates come from authoritative request fields.

Select `address.admissionKind` in the CSV query. For a forbidden row, write `verificationStatus: failed`,
`reason: domain_verification_forbidden`, zero `creditsCharged`, and an empty result ID, existence, catch-all, evidence,
and result timestamp. Keep the current empty domain/local-part cells for rows without a result. The first row uses
`billingReason: failed`; later duplicates use `duplicate`, keep `duplicateOfRow`, and retain the same policy reason.
Preserve original email spelling, `normalizedEmail`, row order, column order, and spreadsheet-formula protection.
Execution canceled after an earlier permitted admission retains the shared runner's generic failed-row contract;
do not invent a policy reason when no durable forbidden admission records it.

Extend admission, workflow, persistence, CSV, HTTP, and PostgreSQL tests. Include crash/replay after recording
forbidden and after inserting its receipt; policy change between resolutions; cache and shared-work bypass attempts;
and queue retry with an already-recorded forbidden outcome. Keep policy-failure fixtures synthetic and organization scoped.

Extend `bruno/batch-verification` with upload/poll/download triplets for mixed allowed/forbidden/case-varied duplicate
rows and an all-forbidden CSV. Use the shared `scripts/bruno/async-verification-fixture.mjs` owned database connection
to insert a dedicated policy domain, restoring only fixture-owned policy rows in `finally`. Reuse its balance lock
and existing trusted SMTP scenario controls for the permitted address; restore both on failure. Do not add a runtime
failure-injection endpoint or depend on the later management API. Update exact request/test totals in
`scripts/bruno/run-collection.mjs` and the fake workflow in `scripts/bruno/batch-verification-runner.test.mjs`.

## Interfaces and Dependencies

The only added persistent vocabulary is internal `admissionKind: forbidden`. Existing request source/final-reason
enums and public DTO shapes remain unchanged. Update descriptions for `failedAddresses` and CSV reasons in the
batch DTO, module README, and collection README, then regenerate OpenAPI artifacts through existing commands.
`apps/web/src/features/verification/batch-verification-api.ts` already validates numeric counts and known job states;
add a contract fixture proving an all-forbidden completed/downloadable batch is accepted without UI redesign.
The generated `packages/api-client/src/schema.d.ts` must retain compatible status/count types. No new cross-module
dependency, policy cache, configuration key, or third-party package is needed.

## Acceptance Criteria

- A newly resolved forbidden unique address creates no execution, result, join, cache read, probe, or credit hold;
  its one durable receipt settles with zero charge, including at zero available balance.
- Mixed batches continue permitted addresses; all-forbidden batches finish with a downloadable CSV. Every input
  row survives in order, duplicates are free, and forbidden rows never claim `exists: false`.
- Reusable cached evidence and active shared work cannot bypass a new forbidden admission. Exact canonical domain
  matching handles case and IDNA while separately listed subdomains remain independent.
- Status counts and CSV billing agree with receipts and the ledger. A forbidden unique address counts once as
  completed and failed; duplicate rows do not multiply that count or any reservation.
- Retrying after either manifest or receipt persistence produces the same outcome and identity. A later policy
  change does not rewrite prior manifest decisions; the shared runner prevents newly started prohibited attempts.
- Authentication, foreign-organization concealment, invalid-CSV handling, allowed-address behavior, generated
  contracts, and browser response parsing remain compatible. Focused checks below pass without skipped runtime cases.

## Validation

Run from the repository root after implementation; these are planned checks, not completed evidence:

```sh
corepack pnpm test -- batch-admission.service.spec.ts batch-email-verification-workflow.spec.ts typeorm-batch-admission.store.spec.ts s3-batch-result-writer.spec.ts verification-entities.spec.ts --runInBand
corepack pnpm test -- batch-verification-http.integration.spec.ts batch-verification.openapi.spec.ts batch-email-verification-queue.integration.spec.ts --runInBand
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/batch-verification-runner.test.mjs scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci src/features/verification/batch-verification-api.test.ts
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/delivery/batch src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-batch-admission.store.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm/batch-unique-address.entity.ts src/libs/modules/email-verification/src/infrastructure/storage/batch-verification/s3-batch-result-writer.ts
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm docs:lint -- .agents/plans/domain-verification-policy/01-block-forbidden-batch-addresses.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

The PostgreSQL harness resets its own test schema and reseeds test organizations; add `DomainPolicyEntity` to its
entity set and deterministic policy fixtures. Supply the queue integration suite's `TEST_REDIS_URL` only from an
owned disposable Redis instance; an environment-gated skip is not proof. Bruno's launcher executes
`bru run --env local --sandbox developer` after checking checkout ownership. Verify forbidden paths with probe/cache/
credit spies and PostgreSQL records; HTTP success alone cannot prove that no disclosure happened. Record unavailable
container checks separately from passing static or unit checks, and report Bruno execution as unverified when skipped.

## Idempotence and Recovery

Use TypeORM synchronization against disposable data, never a migration. The dedicated PostgreSQL command above
already uses `dropSchema: true` and `synchronize: true`, then reseeds its fixtures. For an incompatible existing
checkout-owned development schema, the explicit reset/reseed command is `corepack pnpm dev:reset --confirm-project=LEF`.
It deletes that disposable stack's application, Keycloak, and queue data, reprovisions credentials and deterministic
fixtures, and runs an authenticated smoke test. Its ownership checks must pass; it is not an action for plan authoring
or a remedy for another checkout's stack. Alternate owned stacks require their own documented provisioning procedure.

Reverting the enum addition also requires that disposable reset before running older code. Repeated admission and
receipt writes retain their first committed decision; no cache deletion, historical repair, or automatic unblocking
is needed. Fixture cleanup restores only owned policy/scenario/balance state. Preserve existing settlement intentions
and let the cancellation cleanup from hardening plan 02 recover interrupted releases.

## Artifacts and Notes

Record observed receipt/execution counts, sanitized CSV assertions, exact Bruno totals, and validation results here
during implementation. Do not commit addresses from real customers, credentials, raw worker errors, or test secrets.
Follow root `AGENTS.md` for the synced issue assignment, project status, conventional commit, and closing PR link
when implementation starts. This document creates no application behavior or external issue/project mutation.

## Plan readiness

Ready to implement
