# Encapsulate Account Discovery Behind an Internal Application Port

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

The session-material scanner and its package command were retired at the user's request on 2026-09-14 through
`local-ci-hooks/01`. Scanner commands and results below are historical evidence from this completed plan.

## Purpose / Big Picture

Give email verification one internal interface for requesting account-discovery evidence. The active
`MailboxVerificationService` will request evidence without selecting providers or collecting provider promises. Email verification continues to decide when discovery is useful and what the evidence means for its result.
A developer can prove the boundary with isolated application tests and a Nest composition test that makes no external
requests. This plan delivers one pull request; provider relocation belongs to `account-discovery/02`.

## Progress

- [x] (2026-09-06) Characterize discovery eligibility, evidence mapping, initialization rejection, and per-call failure behavior.
- [x] (2026-09-06) Introduce the private application port, evidence type, token, and discovery service.
- [x] (2026-09-06) Wire the active mailbox service and its Nest factory to use that port.
- [x] (2026-09-06) Verify policy, caller compatibility, and real Nest composition with fake outbound providers.
- [x] (2026-09-06) Update module documentation and record focused, architecture, and runtime validation.

## Plan dependencies

- `module-architecture/18`
- `privacy-compliance/02`
- `privacy-compliance/03`

## Surprises & Discoveries

- Planning inspection on 2026-09-06 found no formal `AccountDiscovery` interface in the checkout. The active
  cutover [PR #540](https://github.com/TupoSoft/LeadEmailFinder/pull/540), inspected at
  `a3552833e08466b34b9b2a96ce7470d42fe73a12`, retains the shared `ICatchAllVerifier[]` input while making
  `MailboxVerificationService` serve all delivery modes. It deletes the old `EmailVerifier` class and its test.
- This plan follows that cutover instead of adding a prerequisite to work already under review. Recheck the merged
  prerequisite before implementation; do not recreate the deleted legacy verifier to satisfy an older source map.
- `email-verifier/email-verifier.module.spec.ts` tests a factory directly. It does not prove Nest can resolve the
  active mailbox service after its injected dependency changes.
- Mailbox tests inject two fake providers even though configuration activates zero or one. Those tests describe
  evidence aggregation, not authorization to dispatch to several providers.
- Implementation confirmed that PR #540 merged at `67b806464463b6d8de670aaa2af27e952752760f`, and all three
  prerequisite plans are complete in this checkout. The initial caller and approval regression run passed 37 tests.
- The old blacklisted caller test also set `catchAll` to true, so it did not independently prove eligibility by
  reason. The port tests now cover an inconclusive blacklisted synthetic probe and a blacklisted real probe.

## Decision Log

- Decision: Keep account discovery inside the email-verification business module and define a private application port.
  Rationale: The current capability serves the fixed purpose `email_verification.account_discovery`. An independent
  business module and public contract add no required behavior to this refactor.
  Date/Author: 2026-09-06, Codex planning, following the user's accepted direction.
- Decision: Return positive evidence through `discover(email)`; return an empty list for no selected provider, a
  negative provider response, or a failed request. Preserve startup configuration rejection as an error.
  Rationale: Current callers ignore rejected and false provider results through `Promise.allSettled`. An empty list
  does not establish that an account is absent and must not become a negative deliverability claim.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Retain the existing shared `ICatchAllVerifier` contract during this pull request.
  Rationale: The clients still live in `src/libs/catch-all/` and cannot import a private business-module file. Plan 02
  internalizes those clients and their provider contract together.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Keep verification eligibility and source interpretation in `MailboxVerificationService`.
  Rationale: Discovery returns provider evidence; verification owns SMTP catch-all detection and final result policy.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Reuse the existing SMTP Bruno assertions without adding a duplicate request.
  Rationale: This change alters internal Nest wiring without changing an HTTP path. The collection already covers
  successful verification, the default empty discovery sources, authentication, validation, and credit rejection.
  Provider dispatch counts and approval expiry are verified below HTTP with fake outbound dependencies.
  Date/Author: 2026-09-06, Codex implementation.

## Outcomes & Retrospective

The active mailbox service now consumes one private evidence port. Discovery owns one-provider dispatch and
normalizes per-call failures to empty evidence; email verification retains eligibility and source interpretation.
Approval selection still rejects invalid initialization, and expired approval blocks dispatch without changing the
pre-discovery verification result. All focused checks and the live SMTP collection passed. The architecture
baseline and public barrel are unchanged. Provider relocation and the shared provider contract remain scoped to
`account-discovery/02`; no real provider approval or live vendor validation was needed.

## Context and Orientation

All relative source paths in this plan are below `src/libs/modules/email-verification/src/` unless otherwise stated.
Read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and the email-verification module README before editing.

After the prerequisite, Nest `email-verifier/email-verifier.module.ts` still imports the technical `CatchAllModule`,
reads the fixed approval manifest through the configuration library, and combines environment configuration with concrete clients through
`infrastructure/account-discovery/account-discovery-composition.ts`. The application selector in
`application/account-discovery/select-account-discovery-verifier.ts` returns zero or one verifier wrapped by
`ApprovedAccountDiscoveryVerifier`. The wrapper checks provider, purpose, region, status, and validity immediately
before calling its provider. The manifest is a startup snapshot; this plan does not introduce live manifest reload.

After `module-architecture/18`, `application/mailbox-verification.service.ts` probes a synthetic mailbox through
`MailboxProbe` and consults discovery only for a catch-all result or the existing `Blacklisted` reason. It collects
positive source names, filters them through its current source guard, and updates `exists`, `reason`, and `sources`.
`sync-email-verification/email-verification.module.ts` constructs that service through a factory that injects
`MAILBOX_PROBE` and `CATCH_ALL_VERIFIERS_TOKEN`. Its `EmailVerificationOrchestrator` serves every delivery mode.
`EmailVerifierModule` supplies the provider array and reexports `SmtpModule`; its SMTP role must survive this change.

## Scope and Non-Goals

Introduce the private discovery port and service, update the mailbox caller and its tests, change the active Nest
binding, and document the new ownership. This is an internal refactor with an active integration-wiring change.
The public barrel remains `EmailVerificationModule` only.

Keep provider files, their aliases, and the shared verifier contract in place until plan 02. Preserve the exact
provider allowlist, approval rules and manifest path, configuration names, response source literals, HTTP request
shapes and counts, error handling, and logging restrictions. No new timeouts or retries are introduced. No routes,
authorization, billing, persistence, queues, SMTP probing, schemas, production rollout, or migrations change.
Do not redo the prerequisite cutover or modify the delivery workflow architecture.

## Plan of Work

First capture the observable behavior in focused tests. Cover the existing catch-all and `Blacklisted` eligibility
cases, ineligible results, positive evidence, unknown source names, empty evidence, initialization rejection, and expiry
between startup and dispatch. Use synthetic addresses, fake clocks, and fake providers. No test requires vendor
credentials or an approved manifest entry committed to the repository.

Create `application/ports/account-discovery.ts` with the following private, framework-independent contract:

    export interface AccountDiscoveryEvidence {
        readonly sourceName: string
    }

    export interface AccountDiscovery {
        discover(email: string): Promise<readonly AccountDiscoveryEvidence[]>
    }

    export const ACCOUNT_DISCOVERY_TOKEN = Symbol('AccountDiscovery')

Create `application/account-discovery/account-discovery.service.ts`. Its `AccountDiscoveryService` implements the
port and receives one optional, already approved `ICatchAllVerifier` through its constructor. If none is supplied,
return an empty list. Otherwise, call `verify(email)` exactly once per discovery invocation and return one fresh
evidence object only when it returns true. Catch synchronous and asynchronous provider or approval-wrapper failures
and return an empty list without logging the address or external error. Do not catch startup selection errors here.

Keep selection and approval checks in their existing application files. Update the infrastructure composition helper
to create the service from the selector's zero-or-one result. Reject an unexpected result containing more than one
verifier with the existing stable unavailable error; never silently dispatch a list or take its first item. Keep
manifest loading and concrete adapter injection in infrastructure/composition code. The factory in
`email-verifier/email-verifier.module.ts` supplies and exports `ACCOUNT_DISCOVERY_TOKEN` instead of
`CATCH_ALL_VERIFIERS_TOKEN`. Preserve the existing import and reexport of `SmtpModule`.

Change `MailboxVerificationService` to receive `AccountDiscovery` directly and replace its provider-promise
aggregation with `discover(email)`. Update the factory in `sync-email-verification/email-verification.module.ts`
to inject `ACCOUNT_DISCOVERY_TOKEN` and type its second parameter as `AccountDiscovery`. Retain existing source
guards, eligibility checks, result ordering, and result mapping in the mailbox service. The discovery service owns
provider failure normalization; do not introduce a second fallback policy. Remove the unused old injection token
after confirming all production and test consumers have moved.

Replace provider arrays in caller tests with port mocks, including an evidence list with multiple source names where
needed to preserve caller mapping coverage. This does not expand production provider activation. Add
`infrastructure/account-discovery/account-discovery-wiring.spec.ts`. Compile the real `SyncEmailVerificationModule`,
including the imported `EmailVerifierModule`, with fake HTTP transports,
fake SMTP, fake repositories and other required technical dependencies, a controlled manifest loader, and a fake
clock. Resolve the real `MailboxVerificationService` through Nest and exercise discovery to prove its factory
receives the new token. Do not replace either the discovery token binding or the mailbox factory under test.
Exclude all real outbound access.

Update `src/libs/modules/email-verification/README.md` to describe the active discovery port and its role in the
verification core. Document the temporary shared provider contract and the follow-up relocation.
Review the diff against SOLID and the canonical module guide. Keep baseline entries unchanged unless deletion of an
obsolete file demonstrably resolves its existing source-placement entry; never add or rename debt.

## Interfaces and Dependencies

The private `AccountDiscovery` interface returns only source evidence. Provider booleans, clients, configuration,
approval views, and the provider array are absent from its consumer contract. The service may still use the small
shared `ICatchAllVerifier` interface until plan 02; application code imports no technical catch-all alias.

The fixed purpose is `email_verification.account_discovery`. Preserve `CATCH_ALL_PROVIDER`,
`CATCH_ALL_PROVIDER_APPROVAL_ID`, `CATCH_ALL_PROVIDER_REGION`, and `CATCH_ALL_HTTP_PROXY_URL`, plus the fixed
`config/privacy/account-discovery-approvals.yaml` manifest. Partial configuration, unknown provider, unsupported
Mimecast region, invalid approval, or an empty approval manifest with a selected provider still rejects application initialization.
Absent provider selection performs zero provider dispatch. Per-call invalidation produces no evidence and performs
zero dispatch. No public TypeScript, HTTP, queue, database, or storage contract changes.

Plan 02 depends on this interface. The later DNS and SMTP adapter refactors reuse it without creating another discovery selector.

## Acceptance Criteria

- The active mailbox service depends on `AccountDiscovery`; it receives no provider array and aggregates no provider promises.
- Disabled discovery calls no provider. Valid positive discovery returns one source; false results and provider
  failures return no evidence without claiming account absence.
- Invalid startup selection still rejects configuration. An approval that expires before dispatch causes zero
  provider calls and leaves the caller's verification outcome unchanged from its pre-discovery value.
- Existing eligibility, known-source filtering, source ordering, result reasons, and response fields remain identical.
- The real Nest mailbox service resolves the new token and passes positive, disabled, and expired-approval
  scenarios with fake outbound dependencies. No tested scenario contacts a live provider.
- Concurrent invocations receive separate evidence arrays and preserve the corresponding input and result.
- Application code imports no technical client, the public barrel remains module-only, and the architecture gate
  reports no new debt. Technical clients do not import private business-module files.
- Focused tests, type checking, lint, build, architecture checks, and documentation validation pass. The owned SMTP
  development collection confirms unchanged HTTP behavior when runtime dependencies are available.

## Validation

Run application, caller, composition, and provider regression coverage:

    corepack pnpm test -- src/libs/modules/email-verification/src/application/account-discovery src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts src/libs/modules/email-verification/src/email-verifier/email-verifier.module.spec.ts src/libs/modules/email-verification/src/infrastructure/account-discovery src/libs/catch-all/src --runInBand
    corepack pnpm test -- scripts/privacy/account-discovery-approvals.spec.ts src/lead-email-finder-api/src/environment-variables.dto.spec.ts --runInBand
    corepack pnpm privacy:account-discovery-approvals-check
    corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree
    corepack pnpm architecture:check
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/account-discovery/01-encapsulate-account-discovery.md
    git diff --check

Inspect any stale baseline entries before running `corepack pnpm architecture:baseline`; rerun the architecture gate
after a justified shrink. Use fake-provider counters to prove zero or one dispatch, including invalid per-call
approval. A response lacking an external source alone is not proof that no request was attempted.

The change affects Nest integration wiring represented by `bruno/smtp-dev`. Extend that existing collection only if
a materially changed HTTP path needs coverage; keep internal provider policy checks below the HTTP boundary. After
following `bruno/smtp-dev/README.md` for an owned disposable fixture stack, run:

    corepack pnpm bruno:smtp-dev

The launcher executes `bru run --env local --sandbox developer` in the API container. Require the existing success,
authentication, validation, credit rejection, and default no-external-source assertions to pass. If Docker, ownership,
or fixture prerequisites are unavailable, record those limits and report runtime Bruno execution as unverified.

## Idempotence and Recovery

This plan changes code and wiring without creating durable state. Keep one discovery token registration throughout
the final composition. If work stops mid-change, inspect the diff and finish the matching constructor, factory, and
test updates before running the service. Recover by reverting only this pull request's changes; preserve unrelated
work. Do not repair a wiring failure by enabling a provider, weakening an approval check, or widening the baseline.
No database reset, migration, or reseed is required by this refactor.

## Artifacts and Notes

- `MailboxVerificationService` now consumes `application/ports/account-discovery.ts`. The real Nest factory in
  `sync-email-verification/email-verification.module.ts` receives `ACCOUNT_DISCOVERY_TOKEN` from
  `email-verifier/email-verifier.module.ts`, which retains its SMTP reexport. The obsolete provider-array token is
  removed. Composition and service files remain in the layers specified above; the public barrel is unchanged.
- The first focused command under Validation passed 12 suites and 82 tests. This includes five real Nest composition
  cases with fake outbound dependencies: positive evidence, no configuration, proxy-only configuration, expiry after
  initialization, and rejected initialization without approval. Counters prove exactly one dispatch for the approved
  positive case and zero provider or HTTP dispatches for disabled and expired selections.
- The second focused command passed two suites and 106 tests. The manifest check passed with zero approvals; the
  working-tree session-material scan returned no findings.
- Architecture validation passed with the existing 69 baseline entries unchanged. Type checking and the Nest build
  passed. Repository ESLint passed with one existing return-type warning in `src/libs/config/src/load-secrets.spec.ts`.
- `corepack pnpm bruno:smtp-dev` passed against the owned disposable Docker fixture stack: 22 requests and 44 tests,
  with no skipped requests. The base stack also passed Keycloak and authenticated API smoke tests. The first proxy
  bootstrap encountered a transient API connection refusal; retrying that idempotent fixture service after API
  health returned `200` succeeded. No real account-discovery provider was configured.
- The exact documentation command under Validation passed both Markdown files. `git diff --check` passed.

## Plan readiness

Ready to implement
