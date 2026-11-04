# Preserve the Payer Identity of Each Batch Address

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After one credit is deducted for a new conclusive batch result, the status response must report that debit.
The CSV attributes the same charge to the first input row for the address. Duplicate rows and followers remain free. This plan delivers one PR,
`fix(email-verification): preserve batch payer request identity`, addressing finding 4 from PR #633.

## Progress

- [x] (2026-09-17) Persist one immutable request UUID for each unique batch address before claiming execution.
- [x] (2026-09-17) Reuse that UUID during request materialization and make interrupted insertion replay safe.
- [x] (2026-09-17) Prove ledger, status, and CSV agreement for charged, released, cached, and duplicate results.
- [x] (2026-09-17) Complete focused checks and module/collection documentation, including live Bruno validation
  against the isolated development stack and the affected queue suite against real Redis.

## Plan dependencies

- `verification-billing/05`

## Surprises & Discoveries

- The prerequisite is merged at implementation base `1f7b3c6`; the planned duplicate UUID defect is still present.
- `countUnsettledAddresses()` already uses `NOT EXISTS` for a settled receipt, so it correctly counts an assigned
  UUID whose receipt has not been inserted. A real database regression now covers this state.
- The initial PostgreSQL run caught an unquoted `requestId` in the insert return clause. The adapter now requests
  the mapped column through the TypeORM column array; mocked queries alone did not reveal this failure.

## Decision Log

- Decision: Protect UUID insertion uniformly after the existing client-key lookup, using
  `ON CONFLICT ("requestId") DO NOTHING`. Rationale: Restricting protection to incoming batch requests allowed a
  replay with another mode or a new client key to overwrite a batch receipt. Existing client-key arbitration and
  ordinary fresh single requests retain their behavior; conflicting internal UUID reuse now fails across modes.
  Date/Author: 2026-09-17, Codex implementation.
- Decision: Replace `recordPayerRequestId()` with the conditional, organization-scoped assignment operation.
  Rationale: Removing the overwrite API makes immutable identity the only supported assignment contract.
  Date/Author: 2026-09-17, Codex implementation.
- Decision: Keep identity validation strict for cached results and `cooldown` results while allowing execution settlement fields to
  advance. Rationale: Replaying admission must preserve the recorded result and an already settled receipt.
  Date/Author: 2026-09-17, Codex implementation.

- Decision: Assign the existing manifest `payerRequestId` before claiming execution, and retain it for every
  admission outcome. Rationale: An address needs one durable receipt identity; another identifier column or a
  client idempotency key is unnecessary. Date/Author: 2026-09-15, Codex planning.
- Decision: Preserve actual credit capture and fix request ownership rather than calculate charges from result
  quality. Rationale: A conclusive shared or cached result must still cost zero. Date/Author: 2026-09-15, Codex planning.
- Decision: Keep settlement locking and group recovery in their own plans. Rationale: Correct identity is a
  prerequisite for those fixes and has an independently observable accounting outcome.
  Date/Author: 2026-09-15, Codex planning.

## Outcomes & Retrospective

Stable UUID assignment and receipt replay validation now preserve actual batch charges. The real PostgreSQL
suite passes all 18 tests, including positive and negative conclusive captures, inconclusive release, free cached
results and followers, concurrent identity assignment, and interruption recovery. Real database cursor output
agrees with receipt and ledger accounting, including duplicate rows. Only the external object upload is replaced.

Live Bruno validation passed on 2026-09-17 against implementation commit `f673f67`: all 16 requests and 24 tests
executed successfully with no skipped requests. The collection verified one actual debit, matching batch status,
and one charge on the first CSV row, with free duplicates sharing the same result UUID. It restored the customer
balance and SMTP baseline. The six affected queue tests also passed against real Redis and BullMQ.

The first live attempt was blocked by another checkout's SMTP fixture. After the user removed that stack, the
remaining empty network was removed and a separate `lef-issue644` project was built and provisioned for this
checkout. The successful validation used real DNS, proxy, SMTP, API, database, queue, and object-storage services.
Request attachment, funding recovery, and historical repair remain with the later plans.

## Context and Orientation

The evidence is PR #633 at `f55a58ec11586fdcbe7adb838e80ef62ad1adcb1`, reviewed on 2026-09-15. The planning
checkout is `451798dadf82e316ba68b4333ddba32bf0f99a97`; it does not yet contain that batch implementation.
Apply this plan only after its explicit prerequisite is available, and compare any newer implementation before coding.
All paths below are repository-relative. References shortened to `application/` or `infrastructure/` are below
`src/libs/modules/email-verification/src/`.

Before this fix, `application/delivery/batch/batch-admission.service.ts` generated one UUID in `resolveAddress()`
and passed it as the execution's payer. Later, `materializeRequest()` generated a different UUID for the receipt.
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

Run from the implementation checkout. Record completed checks separately below; a skipped runtime is not passing evidence.

```sh
corepack pnpm exec jest --runInBand batch-admission.service.spec.ts typeorm-batch-admission.store.spec.ts typeorm-verification-request.store.spec.ts typeorm-verification-settlement.store.spec.ts s3-batch-result-writer.spec.ts batch-email-verification.service.spec.ts
corepack pnpm exec jest --runInBand batch-verification-http.integration.spec.ts
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm bruno:batch-verification
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
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

Validation completed on 2026-09-17:

- `corepack pnpm exec jest --runInBand src/libs/modules/email-verification/src`: 84 suites and 1,011 tests passed.
  The generic run skipped six opt-in infrastructure suites (35 tests); PostgreSQL and the affected queue suite
  ran separately below.
- `corepack pnpm test:verification-billing-postgres`: 18 tests passed, zero skipped, on the disposable database
  owned by this checkout. The CSV assertions use the actual database joins and writer projection.
- `node --test scripts/bruno/batch-verification-runner.test.mjs scripts/bruno/run-collection.test.mjs`: 16 tests
  passed. The collection now requires 16 requests and 24 assertions, including the hidden-charge regression.
- `corepack pnpm architecture:check`: nine modules, zero violations.
- `corepack pnpm typecheck`: passed for the root and MCP server TypeScript projects.
- `corepack pnpm exec eslint src/libs/modules/email-verification/src scripts/bruno/run-collection.mjs scripts/bruno/batch-verification-runner.test.mjs`: passed.
- `corepack pnpm docs:lint -- .agents/plans/batch-verification-hardening/01-preserve-payer-request-identity.md src/libs/modules/email-verification/README.md bruno/batch-verification/README.md`: Harper passed all three files.
- `COMPOSE_PROJECT_NAME=lef-issue644 corepack pnpm bruno:batch-verification`: all 16 requests and 24 tests passed
  against the isolated stack, with no skipped requests.
- `TEST_REDIS_URL=redis://127.0.0.1:56379 corepack pnpm exec jest --runInBand batch-email-verification-queue.integration.spec.ts`: all six tests passed against the isolated stack's Redis service.

The SOLID review found no new module coupling or infrastructure leaks into application code. UUID comparison is
performed both on application replay reads and at the persistence conflict boundary to protect concurrent inserts.
There is no schema change or migration. The implementation is isolated from unrelated changes in the main checkout.

Read root/module instructions, the module README, and the repository PostgreSQL skill before implementation.
The review reproduction is summarized above so this plan does not depend on temporary review files.
Receipt identity correctness does not itself fix late attachment or active funding cancellation.

## Plan readiness

Ready to implement
