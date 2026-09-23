# Substitute Verification Execution Collaborators Through Contracts

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.
It delivers one pull request, proposed as `refactor(verification): inject execution capability contracts`.

## Purpose / Big Picture

Allow substitution of mailbox verification, settlement, execution, reconciliation, and email publication without
importing their implementation classes into consumers. A developer can construct the existing execution services
with typed object fakes and override the corresponding Nest tokens without changing business behavior.

## Progress

- [ ] (2026-09-17) Declare the execution contracts and move their shared result types.
- [ ] (2026-09-17) Migrate consumers, factories, and execution/reconciliation processors together.
- [ ] (2026-09-17) Verify typed substitution, real provider resolution, and existing execution behavior.
- [ ] (2026-09-17) Update documentation and record focused validation for the single pull request.

## Plan dependencies

- `dependency-inversion/02`

## Surprises & Discoveries

The current `VerificationExecutionRunner` already depends on storage and permit ports, but its mailbox and
settlement collaborators are concrete classes. `verification-settlement.service.spec.ts` casts an email writer
to `EmailAdministrationService`; execution processor tests cast a fake to `VerificationExecutionRunner`.

The module README records that `EmailVerificationOrchestrator` remains wired even though the durable delivery
stack replaced its callers. Its removal and the domain-policy defect are separate decisions. This refactor
must keep that retained path valid without making it an active route again.

## Decision Log

- Decision: use capability contracts at the existing service boundaries, preserving the implementations.
  Rationale: consumer tests already need substitution, and workers should not depend on execution internals.
  Date: 2026-09-17. Author: Codex.
- Decision: migrate credit contracts first and delivery contracts in plan 09 afterward. Rationale: this keeps
  shared factory edits ordered and gives each PR an independently working composition.
  Date: 2026-09-17. Author: Codex.
- Decision: retain the existing concrete service registrations privately and alias them with `useExisting`.
  Rationale: configuration, stores, and service instances must not be duplicated.
  Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

All paths below are within `src/libs/modules/email-verification/` unless stated otherwise. Read its `README.md`,
`src/libs/modules/AGENTS.md`, and the canonical `src/libs/modules/README.md` before implementation.

`src/application/operations/verification-execution-runner.ts` acquires a permit and a generation-fenced lease,
calls `MailboxVerificationService.verify`, persists a result and settlement intention, and invokes settlement.
`verification-settlement.service.ts` uses credits and publishes an email record through
`EmailAdministrationService.upsertEmail`. `verification-reconciler.ts` calls settlement and execution to resume
durable work. Their factories live in `src/infrastructure/email-verification-core.module.ts`.

`src/application/email-verification.service.ts` is the retained orchestrator. It consumes the same mailbox and
email services plus `DomainPolicyService.isVerificationAllowed`. Queue adapters in
`src/infrastructure/queues/verification-execution/` and `verification-reconciliation/` inject concrete runner
and reconciler classes. Synchronous delivery also consumes the runner and must migrate in this PR.

## Scope and Non-Goals

Change these collaborator types, runtime tokens, consumer imports, and related tests. Introduce no new business
service, endpoint, schema, library, configuration, timeout, retry, charge, or authorization policy. Keep all
public exports limited to the existing `EmailVerificationModule`. Core-module exports are private Nest wiring,
not public business-module exports. Do not remove the retained orchestrator.

Credit capabilities belong to plan 02. Admission, status reading, controller-facing delivery, and batch workflow
contracts belong to plan 09. Existing hardening plans retain ownership of billing and recovery defects.

## Plan of Work

First add the contracts listed below under `src/application/ports/`. Move `ExecutionOutcome` and
`VerificationReconcileReport` out of their implementation files into the respective contract files. Preserve
all union members and report fields exactly. Contracts may import domain records, existing port types, and
framework-independent common vocabulary; they must not import service implementation files or derive signatures
through `Pick`, `Parameters`, or `ReturnType` of implementation classes.

Have the current classes implement the corresponding contracts. Change the runner, reconciler, settlement
service, and retained orchestrator to accept only the capabilities they consume. The retained orchestrator
uses the same email-writer and mailbox contracts as active execution; its domain-policy dependency gets a
single-operation policy contract. Leave `DomainPolicyService.getDomain` available without adding it to that
consumer contract.

In the core composition module, retain existing construction factories and add token aliases. Change the
consumer factories' `inject` entries as well as their parameter types. Export the required execution and
reconciliation tokens to their queue modules; replace processor constructor injection with `@Inject(token)`
and the interface type. Migrate `RunSynchronousVerification` and its factory in
`src/email-verification.module.ts` to the execution token now so the active synchronous path uses this boundary.
Keep its admission and status dependencies for plan 09.

Update existing unit tests to use typed port fakes without casts to implementation classes. Extend the focused
`src/infrastructure/email-verification-core.module.spec.ts` composition suite introduced by plan 02.
Use the actual core-module provider definitions with infrastructure dependencies replaced; demonstrate
that overriding the mailbox and settlement tokens changes the collaborators called by a resolved runner.
Assert alias identity and resolve execution/reconciliation processors through their tokens. Do not open sockets,
databases, or queue workers in this composition test. Keep existing integration tests distinct from these fakes.

Update the internal architecture and validation descriptions in the module README. Preserve the public barrel.

## Interfaces and Dependencies

Each file below is under `src/application/ports/`; the named existing class implements it.

| File and contract | Runtime token | Exact operation | Implementation |
| --- | --- | --- | --- |
| `mailbox-verifier.ts`: `MailboxVerifier` | `MAILBOX_VERIFIER` | `verify(organizationId: string, email: string, format?: EmailPatternEnum, signal?: AbortSignal): Promise<NewEmailVerification>` | `MailboxVerificationService` |
| `email-record-writer.ts`: `EmailRecordWriter` | `EMAIL_RECORD_WRITER` | `upsertEmail(organizationId: string, email: string, changes: EmailUpdate): Promise<Email>` | `EmailAdministrationService` |
| `domain-verification-policy.ts`: `DomainVerificationPolicy` | `DOMAIN_VERIFICATION_POLICY` | `isVerificationAllowed(name: string): Promise<boolean>` | `DomainPolicyService` |
| `verification-settlement.ts`: `VerificationSettlement` | `VERIFICATION_SETTLEMENT` | `settle(executionId: string, organizationId: string): Promise<void>` | `VerificationSettlementService` |
| `verification-execution.ts`: `VerificationExecution` | `VERIFICATION_EXECUTION` | `execute(executionId: string, organizationId: string): Promise<ExecutionOutcome>` | `VerificationExecutionRunner` |
| `verification-reconciliation.ts`: `VerificationReconciliation` | `VERIFICATION_RECONCILIATION` | `reconcile(limit: number): Promise<VerificationReconcileReport>` | `VerificationReconciler` |

Use `Symbol` tokens and existing singleton aliases. Plan 02 supplies the credits contract used by admission,
settlement, and reconciliation; do not replace it with a verification-owned copy. The result-reader, store,
dispatcher, clock, and permit ports already exist and remain the authority for their respective operations.

## Acceptance Criteria

- Typed object fakes satisfying the six contracts can construct their consumers without casts to implementation
  classes. Consumer signatures and contract files do not import those concrete classes.
- A resolved runner calls the overridden mailbox and settlement tokens; token and implementation registrations
  resolve to the same instance when not overridden. Processors resolve using the advertised contracts.
- Existing execution outcomes, cancellation signals, generation checks, credit intention ordering, retry times,
  permit handling, reconciliation limits, and error propagation remain unchanged.
- Synchronous delivery still falls back to an accepted operation when its execution budget expires. Existing
  organization ownership and conclusive-result accounting assertions pass unchanged.
- The retained orchestrator can still be constructed and passes its existing policy/ownership tests. No dormant
  verification path is newly exposed.
- Architecture and type checks pass, focused regression suites pass, and the public module barrel is unchanged.

## Validation

Run from the repository root; these are implementation checks, not results from plan authoring:

```sh
corepack pnpm test -- src/libs/modules/email-verification/src/application/operations src/libs/modules/email-verification/src/application/email-verification.service.spec.ts src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts src/libs/modules/email-verification/src/application/domain-policy.service.spec.ts src/libs/modules/email-verification/src/application/delivery/synchronous/run-synchronous-verification.spec.ts src/libs/modules/email-verification/src/infrastructure/email-verification-core.module.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/verification-execution/verification-execution.processor.spec.ts src/libs/modules/email-verification/src/verification-organization-ownership.integration.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm test:verification-billing-postgres
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/dependency-inversion/08-decouple-verification-execution.md
git diff --check
```

The PostgreSQL command provisions disposable test data using the existing runner. It proves persistent billing
invariants and is separate from mock-based composition checks. Preserve known failing regressions; do not alter
expected accounting outcomes to make this refactor pass. Record unavailable prerequisites or existing failures.

Because worker and HTTP integration wiring changes, update the existing `bruno/async-verification` and
`bruno/smtp-dev` assertions. Assert that a completed operation's result ID matches the owned result lookup and
that a rejected SMTP scenario preserves the expected inconclusive outcome and charge. Extend the existing
success/rejection requests without changing the fixture scenario or billing expectation.
Run `corepack pnpm bruno:async-verification` and `corepack pnpm bruno:smtp-dev` with a disposable stack
owned by this checkout when available; the wrappers supply the local environment. Report actual results or
unverified runtime coverage explicitly. No new collection is needed.

## Idempotence and Recovery

This refactor changes source wiring only. Repeating tests requires no data conversion. Use the existing
disposable PostgreSQL runner rather than resetting a shared checkout. Revert this one PR to restore class-based
consumer wiring; no database migration, production deployment, or data rollback is involved.

## Artifacts and Notes

Source audit: 2026-09-17, repository commit `49c42b0c9ec3ce641d86aab6ce3899472bdbd356`.
Completed `module-architecture/18` and `verification-billing/03` supplied the existing structure and workflow.
This plan changes their consumer contracts without repeating their layering or billing implementation.

Coordinate with incomplete `verification-billing-hardening/02`, `/05`, and `/06`, which change domain-policy
enforcement, email publication, and permit cleanup. They have no semantic dependency on this refactor. Rebase
against whichever work lands first, preserve its regressions, and never restore a removed email-publication
call or retained orchestration path merely to satisfy this inventory. Update this plan's contract inventory if
a consumer disappears before implementation. No hardening defect is claimed fixed by replacing a dependency.

Before implementing, follow root `AGENTS.md` for issue assignment and project status. Record the final
conventional commit title, linked issue, focused results, and any remaining limits in this living document.

## Plan readiness

Ready to implement.
