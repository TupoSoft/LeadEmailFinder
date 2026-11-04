# Enforce Stored Domain Prohibitions Before Verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make both single-verification routes honor the operator's stored domain prohibition before creating new work.
Recheck the prohibition before any shared execution runner starts a mailbox attempt, including batch work.
A prohibited attempt must not contact SMTP or account-discovery providers or capture a credit; a financial
decision already persisted remains authoritative. The browser presents a domain rejection as a correctable
verification error without treating it as loss of the customer's permissions.

## Progress

- [ ] (2026-09-15) Enforce the stored policy during admission and before each execution attempt.
- [ ] (2026-09-15) Make prohibited queued work terminate through recoverable cancellation.
- [ ] (2026-09-15) Validate HTTP rejection, replay, cancellation, and permitted verification; update contracts.
- [ ] (2026-09-18) Share canonical domain lookup and preserve browser recovery for a domain-policy rejection.

## Plan dependencies

- `verification-billing/04`
- `verification-billing-hardening/08`
- `frontend/11`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Reject a new prohibited submission with `403` and `domain_verification_forbidden` before credit
  reservation. Existing keyed operations remain replayable. Rationale: restore the stored policy without
  invalidating recovery handles. Date/Author: 2026-09-15, Codex planning.
- Decision: Reuse the existing canceled execution and failed polling response for work prohibited after admission.
  Rationale: no new persistent state or result is necessary, and existing cancellation recovery can release
  its reservation. Date/Author: 2026-09-15, Codex planning.
- Decision: A persisted settlement intention wins over a later policy change. Rationale: a capture or release
  decision must remain repeatable. Date/Author: 2026-09-15, Codex planning.
- Decision: Match global recipient-domain rules exactly after lowercase IDNA normalization. Subdomains, MX
  hosts, and synonyms are separate names. Rationale: preserve the existing exact-name policy while preventing
  alternate hostname spelling from bypassing it. Date/Author: 2026-09-18, Codex planning.
- Decision: Include the customer browser's domain-rejection handling in this enforcement PR. Rationale: the
  current generic `403` handler otherwise redirects a permitted customer away from verification, making an
  independently merged backend restriction misleading. Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The refreshed planning basis is commit `e8b7d77688302ea8de9c15bc97f1af8cbb638326`, inspected on 2026-09-18.
Single and batch verification now share durable execution. All application paths below start at
`src/libs/modules/email-verification/src/`.
`application/email-verification.service.ts` still calls `DomainPolicyService.isVerificationAllowed()` before
probing, but the new single-verification paths bypass that orchestrator. The policy reads the `domains` row's
`isVerificationForbidden`; absent rows allow verification. The HTTP DTO blocks three fixed hostnames only.
`DomainVerificationForbiddenError` is a plain error with no dedicated HTTP mapping in the inspected snapshot.
The new rejection status is therefore an explicit contract, not a claim that the old route already returned it.
`application/delivery/batch/batch-admission.service.ts` independently resolves batch cache and funding; it no
longer calls the older orchestrator. Its admission behavior is owned by `domain-verification-policy/01`.

`application/operations/verification-admission.service.ts` resolves keyed replay before cache lookup and funding.
`verification-execution-runner.ts` leases an execution and calls `MailboxVerificationService` directly.
`verification-reconciler.ts` already cleans up canceled rows with pending requests after interrupted credit release.
`infrastructure/persistence/typeorm-verification-execution.store.ts` locks execution rows and preserves existing
settlement intentions during cancellation. These mechanisms provide the policy enforcement and recovery seams.
The browser's `apps/web/src/api/api-error.ts` categorizes ordinary `403` responses as access denied, and
`apps/web/src/features/auth/auth-session.ts` propagates that state globally. Domain rejection needs a narrowly
injected feature classifier, preserving the frontend architecture's ban on feature policy inside shared auth.

## Scope and Non-Goals

Deliver one PR, titled `fix(verification): enforce stored domain prohibitions`, for single admission, shared
execution enforcement, and the existing customer's rejection workflow. Include its HTTP contract and focused
runtime fixtures. Batch attempts gain the same runner guard, but batch admission, counts, and CSV classification
belong to `domain-verification-policy/01`. Operator API and browser controls belong to that feature's plans 02
and 03. Add no schema changes, new public job states, restrictions on reading already-owned results, or candidate
generation changes. This plan unlocks complete batch admission enforcement and operator management.

## Plan of Work

Read the module architecture contract, module README, and relevant repository skills before editing. Add a pure
`normalizeVerificationPolicyDomain(input: string): string` in `domain/verification-policy-domain.ts` and a fixed
`DomainPolicyInputError` without raw input in its message. Trim outer whitespace, remove at most one final root
dot, reject controls, URL syntax, escapes, IP literals, wildcards, empty labels, and non-hostname punctuation;
then apply Node's `domainToASCII` and lowercase conversion. Require at least two labels containing 1–63 ASCII
characters apiece, with no leading or trailing hyphen, a final label that is not entirely numeric, and at most 253 characters overall.
The current finding-input normalization demonstrates these syntax rules, but do not couple policy lookup to the
finding use case or change candidate generation. `DomainPolicyService` applies this helper before its exact
store lookup. Keep unknown valid names allowed and read failures as failures. Preserve full-address execution
and idempotency identities; canonicalization changes only the policy lookup key. Existing DTO hostname bans
remain independent and cannot be lifted by a stored allow rule.

Inject the existing `DomainPolicyService` into `VerificationAdmissionService`. After resolving a stored idempotency key,
but before cache lookup, cooldown, request insertion, or funding, check the normalized address's domain. Add a
`domain-forbidden` admission outcome and propagate it through both delivery services and controllers. Serialize
`403 { statusCode: 403, message: "domain_verification_forbidden" }` without the submitted domain. Authentication,
permissions, malformed input, and static hostname validation retain their existing precedence and responses.

Inject the same policy service into the execution runner and recheck it after acquiring the execution lease,
before `mailboxVerification.verify()`. A policy-read error follows the existing transient retry path without
probing. A forbidden result takes a terminal cancellation path, never the runner's generic probe retry path.
The check protects each newly started attempt; changing policy does not retroactively abort a probe already begun.
The attempt starts at the successful policy read immediately before `verify()`. An update racing after that
read may let that attempt finish, including its control, target, and enrichment calls. A later retry must read
policy again. Do not cache policy in a process or claim that committing a rule cancels an active SMTP session.

Add `application/operations/verification-cancellation.service.ts` to own cancellation and recovery using
the existing execution store, request store, and credit reservation service. Give cancellation an expected
generation, extending `cancelIfNoCaptureIntention()` with an optional `expectedGeneration` argument so existing
deadline callers retain their contract. While holding the execution lock, a stale generation returns unchanged; a persisted
intention returns unchanged; otherwise cancellation fences the running generation and clears its lease.
Only a confirmed canceled outcome permits credit release followed by `requests.settleCanceled()`.
Reuse this helper's cleanup method from the reconciler so a failure after cancellation remains discoverable
through `pageCanceledPendingCleanup()`. Keep that extraction limited to the existing cancellation operations.

The runner returns `{ kind: "canceled" }`; extend `ExecutionOutcome` and the queue
processor's terminal handling accordingly. The synchronous command reads the settled failed operation and returns
the existing `202` polling handle. Recovery failures must leave the canceled execution terminal and recoverable,
without scheduling another probe. An unchanged state caused by an intention or stale generation exits without
probing; normal settlement recovery owns that intention. Add narrow factories in `email-verification-core.module.ts`.
Exercise batch-owned executions through this same runner and cleanup path; do not create a second runner or
change batch funding ownership. Preserve the permit release and lease renewal behavior on every policy branch.

Read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, and the repository frontend design, premium, React,
and testing skills before changing the browser. Add a feature-owned `verification-rejection.ts` file under
`apps/web/src/features/verification/`. It classifies only the consumed verification POST operation's exact
`403` body message `domain_verification_forbidden` as a fixed semantic `DomainVerificationForbiddenError`;
never expose the raw response body or remote message as copy. Unknown or malformed responses retain ordinary
authorization behavior. The feature error extends `ApiError` with category `request-failed` and a fixed semantic
code, so it does not set global access-denied state. Add the optional classifier
`classifyOperationError?: (request: Request, response: Response) => Promise<ApiError | undefined>` to
`AuthSessionOptions`, configured
by an app-level `apps/web/src/app/application-session.ts` factory supplied to `AuthProvider` from the app route
composition. Keep the provider's generic default and injected test sessions available.
Shared auth imports no verification endpoints or business codes. Invoke classification only for ordinary
operation `403` responses; retain the global session and sign-out handling and check the authentication generation after
every awaited parse before publishing an error. Leave unrelated existing auth couplings outside this PR.

In `use-verification.ts`, `apps/web/src/routes/VerificationPage.tsx`, and the feature's `verification-copy.ts`, add a confirmed
domain-forbidden submission outcome that keeps the entered address for correction, shows a fixed inline
explanation, and performs no automatic retry or credit-purchase recovery. Preserve the coordinator's lifetime
across route changes, genuine permission failures, and session-boundary cleanup. Update `UX-CONTRACT.md` for
this behavior; reuse current visual components and tokens without a redesign.

Update the module README, both controllers' OpenAPI declarations, and generated API artifacts. Extend the owned
Bruno database fixture in `scripts/bruno/async-verification-fixture.mjs` with a dedicated prohibited test domain
and restore only that row in `finally`; seed it directly through the owned fixture connection, with no new HTTP
endpoint. Never modify a preexisting operator policy. Add requests to `bruno/async-verification` that exercise
both `POST /verify` and `POST /verifyAsync` against that domain and assert rejection with unchanged balance.
This collection owns the required fixture; the SMTP collection launcher does not use that fixture wrapper.
Update the registered counts and the fake server in `scripts/bruno/async-verification-runner.test.mjs` together.

## Interfaces and Dependencies

Reuse `DomainPolicyService` and the existing framework-independent credit contracts. The only new public response
is the domain-policy `403`; polling still returns `failed` with `failureCode: "verification_failed"`, settled
billing and zero charged credits for a canceled operation. The account's reserved balance is released; preserve
the request's recorded reservation count. Stored-key replay returns the
same operation and never creates a replacement execution. Owned result/status reads keep their current access rules.
The cancellation helper and generation argument are private module contracts. Add no database columns or libraries.

## Acceptance Criteria

- New prohibited submissions on either route return the specified `403`, create no operation or reservation,
  and invoke no mailbox probe, including when a reusable cached result exists.
- Allowed and unknown domains retain successful verification, cache reuse, and current billing behavior.
- A domain prohibited after funding but before execution produces no probe; its existing operation eventually
  polls as failed with zero charge and released credit. Repeating cancellation causes no additional effects.
- A release failure after cancellation is recovered by a later sweep. Stale generations cannot cancel a successor,
  and a persisted capture or release intention is neither replaced nor overridden.
- Existing keyed operations and owned reads remain recoverable; prohibited new work cannot bypass policy by
  selecting sync versus async. Focused checks and architecture validation pass.
- Case, Unicode/ASCII IDNA equivalents, and a permitted root-dot spelling resolve the same policy key. Blocking
  `example.com` alone leaves `team.example.com` allowed; no MX-host or synonym rule is inferred.
- A queued batch-owned execution and a retry blocked before its next attempt perform no outbound work and
  release their holds through the same cancellation recovery as single verification.
- A permitted browser customer submitting a forbidden domain stays on the verification page, retains input,
  sees the specific rejection, and can submit an allowed address. Genuine permission `403` responses still
  trigger the existing access-denied behavior; stale parsing after logout cannot restore protected state.

## Validation

From the repository root, run the focused application and persistence checks:

```sh
corepack pnpm exec jest --runInBand domain-policy.service.spec.ts verification-admission.service.spec.ts verification-execution-runner.spec.ts verification-cancellation.service.spec.ts verification-reconciler.spec.ts typeorm-verification-execution.store.spec.ts
corepack pnpm exec jest --runInBand verification-policy-domain.spec.ts
corepack pnpm exec jest --runInBand synchronous-verification-http.integration.spec.ts async-email-verification-http.integration.spec.ts verification-execution.processor.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/operations/verification-{admission.service,execution-runner,cancellation.service,reconciler}.{ts,spec.ts} src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification-execution.store.{ts,spec.ts}
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:async-verification
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm --filter ./apps/web test:ci src/features/verification/verification-rejection.test.ts src/features/verification/VerificationPage.test.tsx src/features/auth/auth-session.test.ts src/api/browser-api-client.test.ts src/app/application-session.test.ts
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web build
corepack pnpm --filter ./apps/web exec playwright test tests/e2e/verification-ui.spec.ts
corepack pnpm design:lint
corepack pnpm ui:audit
```

Use controlled policy flips and injected cleanup failure to test queued cancellation and intention races.
Add barriers before and after the runner's policy read to prove the stated active-attempt boundary; cover both
capture and release intentions and stale cancellation generations with real PostgreSQL. Browser tests distinguish
the exact domain code, an unknown code, malformed JSON, a genuine permission failure, and a session change
during body parsing. Stub browser tests do not prove live SMTP or database recovery.
Bruno is required because rejection and a stateful HTTP workflow change; its launchers run the local collections.
Run container checks only against an owned disposable stack. If dependencies are unavailable, record static
validation separately and report Bruno execution as unverified; do not reset another stack to make it run.

## Idempotence and Recovery

The execution ID remains the credit-operation reference. Cancellation cleanup is replay-safe and generation-fenced;
already-persisted financial decisions remain immutable. Remove only test-owned fixture rows after tests.
No schema reset, migration, or reseeding of existing services is required. Before implementation, update the
synced issue's assignee and project status using the root workflow; this planning task does not publish it.
New management writes in the later plan use canonical keys. Do not rewrite any existing development policy rows
silently; if manually seeded names are not canonical, export their flags and explicitly reseed canonical
names in the owned disposable fixture. Removing a restriction does not replay a failed operation automatically.

## Artifacts and Notes

Coordinate fixture changes with `verification-billing-hardening/08`: any shared fake admission must include the
new domain outcome, without making this independently testable implementation depend on that test-focused PR.
The review reproduction compared real application classes with fake infrastructure: the old orchestrator rejected
the prohibited domain before probing; the new synchronous command made two probes and selected a one-credit
capture. That is application evidence, not a live SMTP run. PR #629 merged as
`d0e5847fd0dea1c1c68ee023c1ead1f03cc9ebd6`; recheck these paths against the implementation branch before coding.
The 2026-09-18 refresh preserves this plan's stable key and planned HTTP status while replacing its stale batch
assumption. See `.agents/plans/domain-verification-policy/README.md` for the complete operator feature sequence.
Plan authoring did not run the implementation validation listed above or change runtime behavior.

## Plan readiness

Ready to implement
