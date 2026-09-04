# Define the Pure Email-Verification Domain and Application Core

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the email-verification rules and central orchestration runnable without Nest, TypeORM, DNS, HTTP, SMTP,
proxy, catch-all, BullMQ, S3, or transport DTOs. After this change, the verification, email-record, and
domain-policy business rules exist as plain TypeScript, independently testable with fakes, and every persistence
or network capability they need is expressed as a narrow port interface. This plan does not yet wire that core
into the running application: the existing flat implementation keeps serving every route unchanged, side by side
with the new pure code, until `module-architecture/17` and `module-architecture/18` implement the ports and cut
the running module over.

## Progress

- [ ] Confirm this narrowed scope's own size projection stays under 1,000 non-documentation additions plus
  deletions.
- [ ] Characterize verification, email, and domain-policy business rules from the current flat implementation.
- [ ] Define pure domain records, policies, and typed errors.
- [ ] Define application commands, results, and the seven purpose-specific persistence/network ports.
- [ ] Move the central verification sequence and email/domain administration use cases onto the new ports.
- [ ] Complete focused, architecture, and full validation for the new code (additive only; nothing is wired in yet).

## Plan dependencies

- `module-architecture/08`
- `privacy-compliance/03`
- `privacy-compliance/04`

## Surprises & Discoveries

- The original, unsplit version of this plan delivered the pure core, all four TypeORM stores, the
  email-administration API move, all network compatibility adapters, final module composition, and the delivery
  cutover in one pull request. It was evaluated against its own binding size gate before any production edit. A
  real implementation attempt in an isolated worktree (six ports, three application services, domain errors, and
  two of four entity moves — 373 lines, purely additive) calibrated a grounded projection for the full original
  scope at roughly 5,000+ non-documentation lines, far past `size/xl`. The plan's own prescribed remedy (a
  two-way split into "pure core + TypeORM stores" versus "everything else") was itself re-projected at roughly
  2,000 lines for just the narrowed half, still `size/xl`. This plan is the result of narrowing a second time,
  into three plans. This one covers pure domain/application core only: no persistence, no network, no wiring.
  Plan 17 covers the four TypeORM stores. Plan 18 covers the email-administration API, network compatibility
  adapters, final composition, and the delivery cutover. Each carries its own size-gate obligation; do not treat
  this plan's projection as covering plan 17 or plan 18.
- The current `src/domain/` directory (inside `email-verification`) is a cached-Internet-domain feature slice
  containing TypeORM, Nest, Automapper, HTTP retrieval, DTO, and pure parsing concerns; it is not an
  architectural domain layer. The new `src/domain/` this plan creates is a different, pure directory; the old
  feature folder's framework-coupled parts stay in place (renamed later by 17/18) until the cutover.
- `EmailVerificationService` is stored in the synchronous delivery folder even though sync, deprecated-sync,
  async, and batch callers all use it. This plan moves its business logic into a new, framework-free
  `application/` class; the old class and its callers are untouched until the cutover in plan 18.

## Decision Log

- Decision: Put plain email, cached-domain, verification-result, and mailbox-probe records, policies, value
  objects, and errors under `src/domain/`; put central verification and email/domain administration use cases
  and ports under `src/application/`.
  Rationale: Business rules and orchestration must be independently testable and must point outward only through
  purpose-specific interfaces.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Define all seven ports this family of plans needs — `EmailStore`, `VerificationStore`,
  `SmtpVerificationStore`, `DomainStore`, `MxResolver`, `DomainSynonymDiscovery`, and `MailboxProbe` (the eighth,
  `AccountDiscovery`, already exists from a prior privacy-compliance plan and is reused unchanged) — in this
  plan, even though their concrete adapters do not exist until 17 and 18.
  Rationale: The application core can point inward at stable interfaces immediately; deferring only the
  interfaces to a later plan would force this plan's use cases to be rewritten twice.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: This plan is purely additive. It does not delete, rename, or import from the old flat
  implementation, does not touch `email-verification.module.ts` or any delivery folder, and does not change any
  HTTP route, DTO, or response. The new code is inert (constructed only by its own focused tests) until plan 18
  wires it in.
  Rationale: An additive-only plan is the safest possible unit of review — a defect here cannot regress a live
  route, and it lets 17 and 18 each start from a stable, already-reviewed core.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: Do not hash email addresses for logging; do not add logging to domain/application code at all in
  this plan.
  Rationale: Email spaces are enumerable, so a stable hash remains linkable and vulnerable to dictionary
  recovery; the PII-safe logging contract belongs at the infrastructure adapters plan 18 creates, not in pure
  business rules.
  Date/Author: 2026-08-30, Codex planning (retained from the original plan).
- Decision: Preserve every organization identifier, composite key, lookup, and isolation rule from
  privacy-compliance/04 in the port method signatures (organization-scoped for `EmailStore`/`VerificationStore`/
  `SmtpVerificationStore`; shared/non-tenant for `DomainStore`), even though no adapter implements them yet.
  Rationale: Getting the port shapes right the first time avoids reshaping them under review pressure in 17.
  Date/Author: 2026-08-30, Codex planning (retained from the original plan).
- Decision: Add no migration or backfill; this plan touches no TypeORM entity or schema at all (that is a concern
  for plan 17).
  Rationale: The repository has no production environment, and this plan doesn't reach persistence.
  Date/Author: 2026-08-30, Codex planning (retained from the original plan).

## Outcomes & Retrospective

Not started.

## Context and Orientation

The module is under `src/libs/modules/email-verification/`.
`sync-email-verification/email-verification.service.ts` currently normalizes an address, consults the shared
`Domain` policy, reads or creates `Email`, invokes `email-verifier/`, stores `EmailVerification`, and links the
email to the latest result. The same service is called by all delivery modes. `email/`, the current `domain/`,
`sync-email-verification/`, and `email-verifier/smtp/` each mix entities or repositories with framework and
business code — that coupling is exactly what this plan (and 17/18 after it) separates.

Privacy-compliance/04 changes `emails`, `email_verifications`, and `smtp_verifications` to organization-owned
records while keeping `domains` a shared technical-policy table; the new port method signatures reflect this even
though this plan implements no adapter against it. Privacy-compliance/03 establishes an allowlisted log contract
excluding raw or encoded addresses, SMTP transcripts, provider payloads, and message-bearing external errors. This
plan's domain/application code never logs, so it trivially satisfies that contract. The infrastructure adapters
plan 18 creates are where the contract must actually be upheld against real inputs.

## Scope and Non-Goals

Create the pure domain records/policies/errors and the application commands, results, and seven ports listed
above. Move the central verification sequence's business logic (not its Nest/TypeORM wiring) and the email/domain
administration business logic into the new `application/` classes. Add focused unit tests using fakes for every
scenario the existing flat services cover.

Do not touch any existing file. Do not implement any port (no TypeORM store, no network adapter). Do not touch
`email-verification.module.ts`, any controller, any delivery folder, or any HTTP route/DTO/status code. Do not add
persistence, migrations, or a public export beyond what the module already exports (`EmailVerificationModule`
only — this plan doesn't touch the barrel at all). Do not change verification heuristics, domain synonym
behavior, provider selection, SMTP protocol order, or credit charging — that logic is characterized here as
tests, not altered.

## Plan of Work

First inventory every file in scope for this narrowed plan specifically: the three existing business-rule
services and their specs, the small exception files, and `verification-entities.spec.ts`. Then complete this
plan's own size projection, using the same conservative move-as-delete-plus-add convention as the original plan,
before writing any code. If it reaches `size/xl` on its own, narrow further before proceeding — do not proceed past this
gate on an assumption.

Capture characterization tests for normalization, domain prohibition, email upsert semantics, and prior-result
behavior. Capture two-organization isolation expectations too, as business rules the new port contracts must
support, even though no adapter exists yet to prove isolation end to end — that proof belongs to the real-Postgres
test in plan 17.

Create framework-free records and policies under `src/domain/`: an `Email` record, a `Domain` record, an
`EmailVerification` record, an `SmtpVerification` record, and typed errors replacing the scattered Nest exception
classes currently in `email/`, `domain/`, and `sync-email-verification/`. Create application commands, results,
and the seven ports under `src/application/`; avoid a generic repository or manager port — each port covers
exactly one persistence or network concern. Move the central verification sequence's decision logic — which store
to consult, when to create versus reuse, how to interpret a mailbox-probe/discovery outcome — into a new
`application/email-verification.service.ts`-equivalent class. Move the `/emails` administration business rules —
create, look up, update, conflict/not-found semantics — into new `application/email.service.ts`- and
`domain-policy.service.ts`-equivalent classes. Domain and application files must not import Nest, TypeORM,
Automapper, class validation/serialization, DNS/HTTP/SMTP clients, catch-all providers, proxy implementations,
BullMQ, Redis, multer, S3, or transport DTOs.

Update `src/libs/modules/email-verification/README.md` with the new pure-core layer description, noting plainly
that it is not yet wired into the running module.

## Interfaces and Dependencies

New internal contracts (none public — the top-level barrel is untouched): organization-aware `EmailStore`,
`VerificationStore`, and `SmtpVerificationStore`; shared-policy `DomainStore`; and the `MxResolver`,
`DomainSynonymDiscovery`, and `MailboxProbe` network ports (`AccountDiscovery` already exists and is reused,
unchanged, from its prior plan). Values crossing these interfaces are domain records and application commands,
never TypeORM entities, Nest providers, HTTP DTOs, or provider responses.

No HTTP, queue, storage, configuration, or public TypeScript contract changes — this plan is invisible to every
existing consumer. It depends on the identity boundary from `module-architecture/08` and the organization-owned
persistence shape from `privacy-compliance/04` (for port signatures only), and the PII-safe logging contract from
`privacy-compliance/03` (satisfied trivially, since this layer never logs). `module-architecture/17` implements
the four persistence ports; `module-architecture/18` implements the three network ports, wires everything
together, moves the email-administration API, and performs the delivery cutover.

## Acceptance Criteria

- This plan's own recorded projection is below 1,000 non-documentation additions plus deletions.
- Domain/application code imports no framework, ORM, Automapper, validation/serialization, network client,
  provider, proxy implementation, queue, Redis, multer, S3, or transport DTO.
- Pure tests run central verification and email/domain policy with fakes only; this plan's own tests exercise no
  real Postgres and no network input or output.
- No existing file is deleted, renamed, or behaviorally changed; no route, DTO, status code, or public export
  changes.
- The public barrel still exports only `EmailVerificationModule`, unchanged.
- Focused, architecture, full-suite, build, documentation, and diff checks pass.

## Validation

Before writing code, record the projection table and sum its additions and deletions using the same convention
as the original plan:

    git fetch origin master
    git diff --numstat -M origin/master...HEAD -- . ':!*.md' ':!pnpm-lock.yaml' | awk '{a+=$1; d+=$2} END {print a+d}'

The projection must be less than 1,000. If the actual result reaches 1,000, do not open the PR as delivered;
narrow further before requesting review.

Run focused coverage:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/application --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Inspect the baseline diff and reject any added or path-renamed debt (there should be none — this plan adds new
files only, alongside the existing ones). Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/10-separate-email-verification-core-from-adapters.md
    git diff --check

No runtime/Docker/Bruno validation is needed — this plan changes no running behavior. Bruno: not applicable —
this plan adds no route and wires nothing into the live module; `bruno/smtp-dev` is unaffected and stays unrun.

## Idempotence and Recovery

This plan only adds files; rerunning any step is safe. If interrupted, `git status` shows exactly the new files
added so far; there is nothing to revert in existing code because none was touched.

No database, queue, or Docker state is affected. No reset procedure is required.

## Artifacts and Notes

Record the per-path size projection and actual count, the final domain/application file list, and the seven port
signatures. Do not record raw addresses beyond local fixtures.

## Plan readiness

Ready after the binding size projection confirms fewer than 1,000 non-documentation additions plus deletions for
this narrowed scope. A real partial-implementation measurement projects it to fit comfortably (see Surprises &
Discoveries); confirm with the actual projection regardless, and narrow further if it does not.
