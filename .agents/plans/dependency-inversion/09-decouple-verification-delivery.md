# Substitute Verification Delivery Through Application Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.
It delivers one pull request, proposed as `refactor(verification): inject delivery capability contracts`.

## Purpose / Big Picture

Allow HTTP controllers, delivery services, and the batch processor to consume explicit application contracts.
Tests can supply a typed implementation without importing an application class or casting a partial fake to
that class. The same verification requests, operation states, CSV results, and billing decisions remain visible.

## Progress

- [ ] (2026-09-17) Declare admission, status, delivery, and administration contracts with standalone types.
- [ ] (2026-09-17) Migrate HTTP and batch consumers together with their runtime provider wiring.
- [ ] (2026-09-17) Verify typed substitution and existing success, rejection, and worker behavior.
- [ ] (2026-09-17) Record validation and update documentation for the single pull request.

## Plan dependencies

- `dependency-inversion/08`

## Surprises & Discoveries

The async, synchronous, and batch controllers already use explicit runtime tokens, but their TypeScript
dependencies are `Pick` projections of concrete implementation classes. Changing only the token does not make
the contract independent. `AsyncEmailVerificationService`, `RunSynchronousVerification`, and
`BatchEmailVerificationWorkflow` tests still cast admission and status fakes to concrete services.

`VerificationResultReader` and `VerificationExecutionDispatcher` already demonstrate the desired interface/token
pattern. Preserve them instead of introducing competing result or queue contracts.

## Decision Log

- Decision: preserve existing runtime token values for the three HTTP delivery services and move their
  declarations into contract files. Rationale: token identity and import ownership are separate concerns.
  Date: 2026-09-17. Author: Codex.
- Decision: keep related read/write operations together at the current controller boundary, while separating
  internal email publication into the narrower writer from plan 08. Rationale: avoid both oversized service
  contracts and arbitrary one-method interfaces for every HTTP action. Date: 2026-09-17. Author: Codex.
- Decision: perform this after the execution contracts. Rationale: synchronous delivery and batch composition
  can reuse the settled execution and credits boundaries. Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Paths below are relative to `src/libs/modules/email-verification/`. Read its README and the canonical module
instructions before implementation. `src/email-verification.module.ts` wires synchronous and async delivery.
`src/infrastructure/queues/batch-verification/batch-email-verification.module.ts` wires batch admission,
workflow, API service, storage, and its processor. Core admission is built in
`src/infrastructure/email-verification-core.module.ts`.

The controller directories are `src/api/http/asynchronous-verification/`,
`src/api/http/synchronous-verification/current/`, `src/api/http/batch-verification/`, and
`src/api/http/email-administration/`. Their services live under `src/application/delivery/` and
`src/application/email-administration.service.ts`. Admission and status implementations live in
`src/application/operations/`. `src/api/verification-results.controller.ts` already uses a proper result-reader
contract and needs no replacement.

## Scope and Non-Goals

Change consumer contracts, their supporting type ownership, and Nest provider wiring. Keep the public module
barrel unchanged. Preserve routes, DTOs, validation, permissions, rate limiting, replay keys, server-authoritative
charges, delays, retry budgets, CSV row order, result availability, and error identities. Add no migrations,
libraries, configuration, frontend edits, production rollout, or alternate verification engine.

Do not implement existing billing/batch hardening findings in this PR. Do not remove the retained orchestrator.
Domain and mailbox policies, stores, queue handles, pure classifiers, and status mapping functions remain owned
by their existing layers.

## Plan of Work

Add the contracts specified below. Move existing command and result declarations out of implementation files
into these contract files or adjacent `*-types.ts` files. Preserve each union, optional field, `readonly` modifier,
and error contract. Pure mapping functions such as `async-verification-status.ts` must import outcome vocabulary
from the contract rather than from an implementation file. Do not define contracts through `Pick`, `Parameters`,
or `ReturnType` applied to service classes.

Make the existing classes implement these contracts. Migrate async and synchronous delivery to admission and
operation-reader ports. Migrate batch workflow to batch admission, its processor to the workflow contract, and
all four controller families to their explicit interfaces. Keep existing delivery-token values: the async and
batch tokens remain their existing strings, and `RUN_SYNCHRONOUS_VERIFICATION` remains one shared symbol.
Move imports together so no second symbol declaration prevents provider resolution.

Alias existing application factories with `useExisting` where they are class-registered; retain existing
token-based factories where already present. Update consumer factory `inject` arrays and parameter types,
including root/core/batch module imports and exports. Application classes remain framework-free. Bind
`EmailAdministration` and the plan 08 `EmailRecordWriter` to the same service instance.

Replace class-derived controller fakes and double casts with typed contract fakes. Add focused composition
tests at `src/email-verification.module.spec.ts` and extend the plan 02 suite at
`src/infrastructure/queues/batch-verification/batch-email-verification.module.spec.ts`, using actual
provider definitions with stores, configuration, and queues replaced. Resolve the controllers/processors and
prove that overriding admission, status, and workflow tokens changes the called collaborator. Keep representative
HTTP integration tests using real delivery services so contract wiring does not silently hide service behavior.
Update the module README and any affected fixture imports without changing generated HTTP shapes.

## Interfaces and Dependencies

Create these framework-independent contracts under `src/application/ports/`, moving current input/output types
alongside them. A single source of each token must be imported by every consumer and composition module.

| File and interface | Runtime token | Operations, retaining current signatures |
| --- | --- | --- |
| `verification-admission.ts`: `VerificationAdmission` | `VERIFICATION_ADMISSION` | `admit(input: AdmitInput): Promise<AdmissionOutcome>` |
| `verification-operation-reader.ts`: `VerificationOperationReader` | `VERIFICATION_OPERATION_READER` | `read(requestId: string, organizationId: string): Promise<ReadOutcome>` |
| `synchronous-verification.ts`: `SynchronousVerification` | existing `RUN_SYNCHRONOUS_VERIFICATION` | `execute(command: SynchronousVerificationCommand): Promise<SynchronousVerificationOutcome>` |
| `asynchronous-verification.ts`: `AsynchronousVerification` | existing `ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN` | `verifyAsync(input: VerifyAsyncInput): Promise<VerifyAsyncOutcome>`; `getAsyncVerificationState(requestId: string, organizationId: string): Promise<AsyncVerificationStatus>` |
| `batch-admission.ts`: `BatchAdmission` | `BATCH_ADMISSION` | `admit(batchId: string, organizationId: string): Promise<void>` |
| `batch-verification-workflow.ts`: `BatchVerificationWorkflow` | `BATCH_VERIFICATION_WORKFLOW` | `advance(job: BatchJobHandle, token: string): Promise<string>` |
| `batch-verification.ts`: `BatchVerification` | existing `BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN` | `uploadFile(input: EnqueueBatchInput, requestId?: string): Promise<EnqueueBatchResponse>`; `getBatchStatus(id: string, organizationId: string): Promise<GetBatchStatusResponse>`; `getBatchResults(id: string, organizationId: string): Promise<Readable>` |
| `email-administration.ts`: `EmailAdministration` | `EMAIL_ADMINISTRATION` | `createEmail(organizationId: string, command: CreateEmailCommand): Promise<Email>`; `getEmails(organizationId: string): Promise<Email[]>`; `getEmail(organizationId: string, email: string): Promise<Email>`; `updateEmail(organizationId: string, email: string, changes: EmailUpdate): Promise<Email>` |

Retain the existing `BatchJobHandle` and `Readable` usage without introducing BullMQ jobs or HTTP response types
into application contracts. `upsertEmail` belongs to the separate internal writer capability from plan 08.
Other supporting records continue to come from domain or existing framework-independent port files.

## Acceptance Criteria

- Controllers and service consumers in scope depend on declared interfaces rather than implementation classes
  or class-derived `Pick` types. Typed fakes compile without casts to those classes.
- Overridden admission, status, and batch-workflow tokens are actually used by resolved consumers. Each existing
  delivery token has one declaration and one intended implementation instance.
- Existing sync completion and accepted fallback, async state lookup, foreign/missing result rejection,
  admission rejection, rate-limit responses, and API serialization remain unchanged.
- Batch processing preserves delayed-job control signals, original failure propagation, organization ownership,
  duplicate-row accounting, original CSV row order, and download behavior. Contract changes grant no new credit
  or identity capability to transport code.
- All focused checks pass; public exports and generated OpenAPI/API-client contracts show no semantic change.

## Validation

Run these implementation checks from the repository root and record actual results:

```sh
corepack pnpm test -- src/libs/modules/email-verification/src/application/delivery src/libs/modules/email-verification/src/application/operations/verification-admission.service.spec.ts src/libs/modules/email-verification/src/application/operations/verification-operations-reader.spec.ts src/libs/modules/email-verification/src/api/http src/libs/modules/email-verification/src/email-verification.module.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/batch-verification --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:check
corepack pnpm test:verification-billing-postgres
node --test scripts/bruno/async-verification-runner.test.mjs scripts/bruno/batch-verification-runner.test.mjs
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/dependency-inversion/09-decouple-verification-delivery.md
git diff --check
```

Run queue integration suites with `TEST_REDIS_URL` pointing to a disposable Redis instance owned by this
checkout; skipped Redis suites are unverified runtime evidence. Use the established PostgreSQL runner for
durable accounting. Preserve any existing failing regression without changing its expected behavior.

Bruno integration-wiring coverage applies even though HTTP semantics remain unchanged. Reuse the existing
`bruno/async-verification`, `bruno/batch-verification`, and `bruno/smtp-dev` requests. Update success assertions
to tie the accepted operation or batch ID to its status and downloaded result; strengthen the existing foreign
or missing-ID rejection assertions to verify that no result or billing details are exposed. Preserve current
row and charge expectations. Run `corepack pnpm bruno:async-verification`, `corepack pnpm bruno:batch-verification`,
and `corepack pnpm bruno:smtp-dev` when the local disposable stack is available. Their launchers supply the local
environment and fixture lifecycle. Keep fixture counts aligned if assertions or requests change; report runtime
limitations rather than presenting static checks as a live pass.

## Idempotence and Recovery

Source edits and focused tests are repeatable. Preserve the existing disposable fixture ownership and cleanup.
No schema reset or migration is required. Reverting this single PR restores the prior consumer signatures
without changing persisted jobs, requests, results, or credits.

## Artifacts and Notes

Source audit: 2026-09-17, commit `49c42b0c9ec3ce641d86aab6ce3899472bdbd356`. Completed
`module-architecture/15`, `/16`, and `verification-billing/04`, `/05` established the current delivery paths.
This plan follows their implementation rather than repeating it.

Incomplete `verification-billing-hardening/04` and `batch-verification-hardening/01` through `/06` own dispatch,
funding, terminal handling, and result-availability corrections. Coordinate shared files, rebase on changes that
land first, and move their final command/result types unchanged. These fixes have no semantic dependency on
introducing interfaces. This plan does not claim to fix existing financial or recovery defects.

Before implementation, use the synced issue workflow in root `AGENTS.md`. Keep this plan current and record the
final conventional commit title, linked issue, validation results, and architectural trade-offs.

## Plan readiness

Ready to implement.
