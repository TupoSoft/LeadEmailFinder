# Resume a Batch's Own Execution Claim After an Interrupted Admission

This is a living document maintained according to `.agents/PLANS.md`.
One implementation pull request delivers this plan: `fix(verification): resume batch-owned admission claims`.

## Purpose / Big Picture

A batch worker can stop after creating an execution but before recording that execution in its address manifest.
After this change, another attempt recognizes that the batch owns the existing execution, reserves its credit,
and produces the same result as an uninterrupted admission. It does not misclassify that address as free shared work.
Developers can observe one execution, one payer request, and one reservation after repeatedly interrupting this boundary.

## Progress

- [ ] (2026-09-15 16:57Z) Confirm prerequisite changes and add deterministic interruption regressions.
- [ ] (2026-09-15 16:57Z) Preserve ownership and receipt identity when resuming the existing claim.
- [ ] (2026-09-15 16:57Z) Run focused tests, the PostgreSQL runner, Bruno, and documentation checks.
- [ ] (2026-09-15 16:57Z) Record evidence, architectural trade-offs, and the delivered outcome.

## Plan dependencies

- `verification-billing/05`
- `batch-verification-hardening/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: An existing execution owned by this batch remains a `created` admission outcome on retry.
  Rationale: The category identifies the funding owner, not whether the latest attempt inserted the execution.
  Date/author: 2026-09-15, Codex.
- Decision: Reuse the immutable manifest `payerRequestId` established by plan 01 and the execution ID returned by the store.
  Rationale: Retrying must preserve both the financial operation and its receipt identity.
  Date/author: 2026-09-15, Codex.
- Decision: Keep this change inside email verification and retain the existing public credits API.
  Rationale: The incorrect ownership classification happens before credit reservation.
  Date/author: 2026-09-15, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The evidence baseline is PR 633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`, inspected in
`/tmp/lef-pr633-review`. The requesting checkout was at `451798dadf82e316ba68b4333ddba32bf0f99a97`, which lacks the
new batch admission implementation. Apply this plan after its declared prerequisites, using repository-relative paths.

Inside `src/libs/modules/email-verification/src/application/delivery/batch/`, `BatchAdmissionService` resolves each
unique address, records `cache`, `cooldown`, `shared`, or `created`, and funds only `created` executions.
The address manifest is persisted through `batch-admission-store.ts`; `typeorm-batch-admission.store.ts` implements
that contract under `src/libs/modules/email-verification/src/infrastructure/persistence/`.

`TypeOrmVerificationExecutionStore.claimOrJoin()` commits an execution before the service separately records its
manifest outcome. The execution has `fundingOwnerType` and `fundingOwnerId`; `batch_group` identifies batch ownership.
Its `joined` result includes those fields, its organization and normalized address, and its original payer request UUID.
The current unconditional `joined` branch at admission-service lines 158–163 records `shared`, even for the same batch.

Plan 01 assigns `BatchUniqueAddressRecord.payerRequestId` before claiming, through the organization-scoped
`ensurePayerRequestId(batchId, organizationId, normalizedAddress, candidateUUID)` compare-and-set operation.
It also makes insertion of that exact batch request UUID replay-safe. A non-null manifest UUID does not prove that
the request exists; materialization must retain the actual request lookup and insertion behavior from plan 01.

The original regression was reproduced against disposable PostgreSQL: interrupt the outcome write after claim commit,
retry admission, and observe `shared`, no reservation, and eventual zero-charge failure instead of verification.
This is prior review evidence, not validation that this plan has been implemented.

## Scope and Non-Goals

Change only how an admission attempt interprets an existing claim and records its immutable ownership outcome.
Cover interrupted outcome writes, repeat attempts, matching identity, and sharing with a genuinely different owner.

This pull request does not coordinate the reconciliation sweep with active funding; plan 03 owns that race.
It does not attach requests after completed settlement, cancel terminally failed batches, change SMTP policy,
or add HTTP fields, upload idempotency keys, UI changes, migrations, or production data work.
It unlocks plan 03 by ensuring that its recoverable funding manifest includes every execution the group owns.

## Plan of Work

First read `src/libs/modules/AGENTS.md`, its canonical `README.md`, the email-verification module `README.md`, and
`.agents/skills/README.md`. Apply the repository's SOLID and PostgreSQL guidance to the affected paths.
Confirm that plan 01 has made payer identity immutable before claiming and request insertion safe to repeat.

Extend `application/delivery/batch/batch-admission.service.spec.ts` with an execution-store fake that actually retains
claims between attempts. Inject an error at `recordAdmissionOutcome` after a successful claim, then invoke admission
again. Assert ownership, the exact execution and payer IDs, and a single funded operation; do not mock the second
claim as a new insertion, because that would hide the failed recovery path.

In `batch-admission.service.ts`, classify a returned existing execution using its persisted owner. If
`fundingOwnerType === 'batch_group'` and `fundingOwnerId === batchId`, record `created` with
`claim.execution.executionId`. Validate that the returned organization, normalized address, and payer UUID match
this manifest address. A mismatch raises a fixed internal invariant error without recording a new outcome,
reserving a replacement execution, or exposing identifiers through the HTTP response.

An existing execution with a different owner remains `shared`, including another batch and a single verification.
Keep cache and cooldown paths unchanged. Preserve the store's conditional outcome write so repeating a completed
manifest update remains a no-op. Do not replace a committed non-null outcome with the current attempt's guess.
Use the returned execution ID in both created and resumed cases; never substitute the unused candidate UUID.

Extend `infrastructure/persistence/verification-billing.integration.spec.ts` using its existing disposable-schema
fixture and real credits service. Pause immediately after the real claim commit, throw before the real outcome
write, restart with new service instances, and verify that the same execution is funded and its receipt is reused.
Repeat after a second interruption and test a concurrent single or different-batch owner separately.

Extend the nearest collection under `bruno/batch-verification/` to assert that a fresh successful batch has the
expected distinct-address result count and credit receipt totals, then downloads the expected CSV rows.
Use existing synthetic fixtures and authenticated organization setup. Do not add a public fault-injection endpoint;
PostgreSQL tests own the deterministic worker-interruption proof. Preserve the collection's foreign-organization
and unauthenticated rejection cases and update its launcher expectations if requests or assertion counts change.

Update the email-verification README and this plan with the recovery contract and actual evidence.
Review the resulting diff for a single business responsibility and no cross-module infrastructure imports.

## Interfaces and Dependencies

No public HTTP shape, queue name, configuration key, dependency, or credits API changes.
`ClaimAddressOutcome` already exposes `VerificationExecutionRecord.fundingOwnerType`, `fundingOwnerId`, and
`payerRequestId` through `application/ports/verification-execution-store.ts`; reuse that contract.
The service must pass the committed manifest payer UUID supplied by plan 01 into `claimOrJoin()`.

`recordAdmissionOutcome` remains an idempotent first-write operation. Require an organization-scoped
`(batchId, organizationId, normalizedAddress)` identity consistently across its caller, interface, and persistence
predicate; preserve the same boundary when updating the adapter's test fixtures.
The implementation may add a private pure ownership-classification helper, but no generic manager abstraction.

## Acceptance Criteria

1. After an interruption between claim commit and outcome write, retry records `created` with the original execution
   ID and payer UUID, creates exactly one reservation, and leaves exactly one payer request for that batch address.
2. Repeating that recovery twice preserves the same identifiers and available-credit change; an eventual conclusive
   result charges once and is attributed to the existing payer receipt from plan 01.
3. A claim owned by another batch or a single request remains `shared`; the recovering batch reserves no second credit.
4. An ownership or payer-identity mismatch fails before recording an outcome or funding another operation.
5. Cache and cooldown admissions remain free and do not acquire fresh execution ownership on retry.
6. Existing authentication and organization isolation still pass, and the batch collection downloads the same rows.
7. The architecture gate, focused tests, type checking, and changed-document prose checks pass.

## Validation

Run from the implementation checkout root after prerequisites are present:

```bash
corepack pnpm exec jest --runInBand --runTestsByPath src/libs/modules/email-verification/src/application/delivery/batch/batch-admission.service.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-batch-admission.store.spec.ts
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/02-resume-owned-admission-claims.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

Update the registered collection totals in `scripts/bruno/run-collection.mjs` and the fake workflow in
`scripts/bruno/batch-verification-runner.test.mjs` together whenever collection requests or assertions change.
The PostgreSQL runner must execute the new interruption scenario without skips and verify persisted reservation,
request, manifest, and execution rows. Use explicit barriers around the outcome write, not timing sleeps.
The Bruno launcher runs `bru run --env local --sandbox developer` against its verified disposable stack.
If the stack is unavailable, validate collection syntax and fixture changes and report Bruno runtime as unverified;
a unit mock or successful static check does not establish the HTTP recovery path.

## Idempotence and Recovery

Every attempt reuses the committed payer UUID and existing owned execution. Repeated manifest writes and receipt
inserts return their authoritative state and do not reset a settled receipt or reserve a new operation.
Retry interruption tests against the checkout-owned PostgreSQL test database only; the standard runner recreates
its disposable schema and seeds the test organization and balance. This plan adds no schema fields or migrations.
For a broken local application fixture, use `corepack pnpm dev:reset` only on the implementation checkout's disposable
stack; that repository command resets and reseeds the local stack. Do not reset another checkout's database.

## Artifacts and Notes

Keep compact red/green test summaries, the reviewed commit ID, and Bruno execution or static-validation evidence.
Do not commit tokens, connection strings, customer addresses, or temporary review reproduction files.
On implementation start, follow the repository issue assignment and project-status workflow for this plan's synced
issue. Its single PR must close that issue, be assigned to the requesting user, and use the conventional commit subject.
The dependency graph, rather than this readiness sentence, controls when the plan may start.

## Plan readiness

Ready to implement
