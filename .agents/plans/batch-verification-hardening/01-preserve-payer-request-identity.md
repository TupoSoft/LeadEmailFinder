# Preserve the Payer Identity of Each Batch Address

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After one credit is deducted for a new conclusive batch result, the status response must report that debit.
The CSV attributes the same charge to the first input row for the address. Duplicate rows and followers remain free. This plan delivers one PR,
`fix(email-verification): preserve batch payer request identity`, addressing finding 4 from PR #633.

## Progress

- [ ] (2026-09-15) Persist one immutable request UUID for each unique batch address before claiming execution.
- [ ] (2026-09-15) Reuse that UUID during request materialization and make interrupted insertion replay safe.
- [ ] (2026-09-15) Prove ledger, status, and CSV agreement for charged, released, cached, and duplicate results.
- [ ] (2026-09-15) Complete focused checks and update the module and collection documentation.

## Plan dependencies

- `verification-billing/05`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Assign the existing manifest `payerRequestId` before claiming execution, and retain it for every
  admission outcome. Rationale: An address needs one durable receipt identity; another identifier column or a
  client idempotency key is unnecessary. Date/Author: 2026-09-15, Codex planning.
- Decision: Preserve actual credit capture and fix request ownership rather than calculate charges from result
  quality. Rationale: A conclusive shared or cached result must still cost zero. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep settlement locking and group recovery in their own plans. Rationale: Correct identity is a
  prerequisite for those fixes and has an independently observable accounting outcome.
  Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The evidence is PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`, reviewed on 2026-09-15. The planning
checkout is `451798dadf82e316ba68b4333ddba32bf0f99a97`; it does not yet contain that batch implementation.
Apply this plan only after its explicit prerequisite is available, and compare any newer implementation before coding.
All paths below are repository-relative. References shortened to `application/` or `infrastructure/` are below
`src/libs/modules/email-verification/src/`.

`application/delivery/batch/batch-admission.service.ts` generates one UUID in `resolveAddress()` and passes it
as the execution's payer. Later, `materializeRequest()` generates a different UUID for the actual request.
`infrastructure/persistence/typeorm-verification-settlement.store.ts` uses equality with the execution payer UUID
to assign the final reason and charged count. Therefore, the actual receipt is treated as a follower.

`BatchUniqueAddressEntity` in `infrastructure/persistence/typeorm/batch-unique-address.entity.ts` already stores
`payerRequestId`. `TypeOrmBatchAdmissionStore.getStatusCounts()` aggregates that receipt, and
`infrastructure/storage/batch-verification/s3-batch-result-writer.ts` joins it to every original input row.
A real PostgreSQL review reproduction captured a credit, reducing balance from 10 to 9, while the receipt and batch
reported zero charged and the receipt reason was `shared`. This is evidence of the defect, not a passing fix.

## Scope and Non-Goals

Change receipt identity allocation, equivalent insertion replay, and resulting accounting. Preserve pricing,
normalization, row order, duplicate-result identity, organization isolation, and the current API schemas.
Do not add upload idempotency keys, rate limits, request/settlement locking, group recovery, download fallback,
browser billing presentation, or historical repair. This PR unlocks plans 02 and 04 in this feature.

## Plan of Work

Add an organization-scoped `ensurePayerRequestId(batchId, organizationId, normalizedAddress, candidateId)` operation
to `application/delivery/batch/batch-admission-store.ts`. Its TypeORM adapter conditionally sets the existing nullable
field only when empty and returns the committed UUID. Concurrent callers receive the stored winner. Verify the
batch, organization, and address together; missing or foreign rows fail without changing another manifest.
Do not allow `recordPayerRequestId()` to overwrite an assigned identity.

Allocate this UUID before any cache, cooldown, or execution resolution for the address. Pass it unchanged to
`VerificationExecutionStore.claimOrJoin()` and every request insertion. For an execution created by this batch,
the execution payer and manifest receipt IDs must match. A shared execution retains its original payer; its new
batch receipt is a different, free follower. No second candidate payer may replace a persisted one on retry.

Update the materialization loop: a non-null manifest UUID no longer proves a request exists. Load the request with
that UUID and organization, validate immutable identity, and create it if absent. On replay, return an existing
compatible receipt without overwriting settlement fields, source, or financial counts. Preserve the admission
outcome's recorded execution/result association; a later cache lookup must not redirect this receipt.

Strengthen `VerificationRequestStore.insert()` for a batch request UUID supplied without a client key. In
`infrastructure/persistence/typeorm-verification-request.store.ts`, insert without overwriting a primary-key
conflict, then read and validate the stored winner. Equivalent retries return `replayed`; conflicting organization,
address, delivery mode, source, or execution identity fail as an internal invariant violation. Never use a generic
save to reset a settled receipt. Preserve existing keyed and single-verification behavior. If the prerequisite
single-admission hardening has replaced this method, retain the same create-or-replay identity contract in its
request-claim operation rather than reintroducing a second receipt path.

Keep settlement's payer comparison authoritative. The first original row receives the receipt's actual charge;
later duplicate rows retain `billingReason: duplicate` and zero charge. Update the manifest port documentation,
adapter fixtures, service tests, and module README to distinguish reserved identity from an inserted receipt.

Extend `bruno/batch-verification` with a case-varied duplicate input using a fresh fixture address under
`evidence.lef.test` and the existing `target_accepted` SMTP scenario. Reuse the checkout-owned fixture and balance
lock; select and restore the scenario through its existing control service. Assert one debit, one charged first row,
zero-charge duplicate rows, equal result IDs, and matching status counts. Update registered request/test totals in
`scripts/bruno/run-collection.mjs` and its fake workflow in `scripts/bruno/batch-verification-runner.test.mjs`.
Do not change the SMTP fixture's production behavior or probe real addresses.

## Interfaces and Dependencies

The batch store gains one conditional identity operation; request insertion gains equivalent UUID replay for batch
receipts. Existing tables, public DTOs, environment settings, and module dependencies stay intact. Application
services use the ports and the public credits barrel. TypeORM conflict handling stays inside persistence adapters.
Plan 02 reuses the UUID to recognize an interrupted owned claim. Plan 04 later connects these receipts through the
shared terminal-aware finalization contract from `verification-billing-hardening/03`.

## Acceptance Criteria

- A newly created conclusive result captures exactly one credit; the payer receipt, batch charged count, and first
  CSV row each report one charge and the appropriate conclusive outcome.
- Case-varied duplicate rows preserve order and original email text, share one result UUID, and charge only the
  first row. Cache, cooldown, and shared receipts remain free; an inconclusive owned execution releases its credit.
- Concurrent UUID assignment returns one identity. Interruption after assignment or request insertion creates no
  additional receipt, changes no settled fields, and retains equality with the owned execution's payer.
- Foreign organization or conflicting receipt replay cannot overwrite a manifest or read another result.
- Focused database, status, CSV, HTTP, Bruno, architecture, type, lint, and documentation checks pass.

## Validation

Run from the implementation checkout. These are required future checks; this document claims no implemented fix.

```sh
corepack pnpm exec jest --runInBand batch-admission.service.spec.ts typeorm-batch-admission.store.spec.ts typeorm-verification-request.store.spec.ts typeorm-verification-settlement.store.spec.ts s3-batch-result-writer.spec.ts batch-email-verification.service.spec.ts
corepack pnpm exec jest --runInBand batch-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/01-preserve-payer-request-identity.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md
```

Extend `infrastructure/persistence/verification-billing.integration.spec.ts` with real TypeORM and credits adapters,
and a deterministic conclusive mailbox stub. Assert execution payer UUID, actual receipt UUID, balance, reservations,
and status aggregates together. Test captured and released intentions, duplicate rows, concurrent ID assignment,
and replay after insertion. Writer tests verify CSV projection separately. Use barriers instead of timing sleeps.
Bruno covers changed public accounting; after its launcher prepares local dependencies, the equivalent collection
command is `bru run --env local` from `bruno/batch-verification`. Report unavailable runtime honestly.

## Idempotence and Recovery

Repeated allocation and insertion recover the existing receipt without changing its final state. Do not clear an
assigned payer UUID or replay credit capture to repair display metadata. No schema migration or data backfill is
needed. Recreate test data through `corepack pnpm test:verification-billing-postgres`; it synchronizes and seeds its
own disposable database. If incompatible prior development records are present, use `corepack pnpm dev:reset` for
the intended disposable stack and let it reseed credentials and credits. Do not reset another checkout or any data
during planning. Preserve existing user changes when implementing or reverting this PR.

## Artifacts and Notes

Read root/module instructions, the module README, and the repository PostgreSQL skill before implementation.
The review reproduction is summarized above so this plan does not depend on temporary review files.
Receipt identity correctness does not itself fix late attachment or active funding cancellation.

## Plan readiness

Ready to implement
