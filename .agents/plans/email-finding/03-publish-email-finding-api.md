# Publish the Email Finding API

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an authenticated caller submit a first name, last name, company domain, and explicit credit limit, then read
the finding result through an organization-owned identifier. A developer can use Bruno against the selective
local SMTP fixture to observe a unique candidate, several accepted candidates, no accepted candidate, or
inconclusive evidence, together with the exact settled charge. The same contract is generated for the browser.

## Progress

- [ ] (2026-09-08) Add authenticated create/status DTOs and thin controllers over the finding application service.
- [ ] (2026-09-08) Add HTTP validation, request replay, organization concealment, and safe response serialization.
- [ ] (2026-09-08) Update the browser OpenAPI allowlist, generated client contract, gateway, and logging route map.
- [ ] (2026-09-08) Add selective finding fixture cases and a repeatable Bruno collection with a guarded runner.
- [ ] (2026-09-08) Run focused HTTP, contract, gateway, runtime, and documentation checks and record actual results.

## Plan dependencies

- `email-finding/02`

## Surprises & Discoveries

- The current `POST /verify` and `POST /verifyAsync` accept complete email addresses. Calling either once for every
  candidate would bypass the durable parent budget and recovery contract provided by the prerequisite.
- The browser OpenAPI surface is explicitly allowlisted in
  `src/lead-email-finder-api/src/openapi/browser-document.ts`. A new controller alone does not update that surface.
- `docker/web/default.conf` forwards a fixed list of API route roots. Without an explicit gateway update, a new
  finding route could receive the web application's HTML fallback.
- The original SMTP development service accepts every recipient. The selective evidence fixture from
  `verification-billing/01` is necessary to prove a unique match and a conclusive negative result.

## Decision Log

- Decision: Add asynchronous `POST /emailFinds` and `GET /emailFinds/:id`, with a required UUIDv7 `Idempotency-Key`.
  Rationale: Checking up to 16 candidates and settling credits can exceed a request lifetime. A durable identifier
  supports recovery after response loss without starting or charging another search.
  Date/Author: 2026-09-08, Codex planning for the requested finder.
- Decision: Reuse server permissions `verification:run` and `verification:read` and the existing browser
  capabilities `verification.run` and `verification.read`.
  Rationale: Finding is another entry into the same organization's verification capability, not a new role system.
  Date/Author: 2026-09-08, Codex.
- Decision: Valid admission returns `202` even with zero available credits. Actual candidate admission decides
  whether a cache hit or funded execution is possible, and the parent reports a funding stop without exceeding
  its limit. Rationale: A balance check would reject useful free cache and shared results.
  Date/Author: 2026-09-08, Codex.
- Decision: Preserve the existing verification pricing and require `maxCredits` explicitly. No HTTP guard deducts
  a search fee. Rationale: The prerequisite application workflow owns the candidate budget and final accounting.
  Date/Author: 2026-09-08, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Read the module instructions, canonical architecture contract, and email-verification README before implementation.
The prerequisite provides private candidate generation, a durable parent record, sequential candidate operations,
bounded work, replay, recovery, and organization-owned reads. Verification billing owns each child operation's
evidence classification, reserve/capture/release transitions, and reusable results. Controllers must not implement
any of those rules or call SMTP, TypeORM, Redis, or a credits repository directly.

The root `src/libs/modules/email-verification/src/email-verification.module.ts` currently registers the single,
batch, stored-email, and verification-result controllers. The same module hosts the new HTTP adapters. Existing
authentication composes bearer service credentials and BFF sessions, including cookie-origin and CSRF checks.
`src/lead-email-finder-api/src/configure-api-serialization.ts` and the shared validation pipeline own transport
behavior. Finding must use those mechanisms rather than accepting organization IDs or roles from request bodies.

## Scope and Non-Goals

Publish one create/status API workflow, generated browser contracts, gateway routing, safe log routing, fixture
cases, and Bruno coverage. This unlocks the browser plan. Keep supplied-address verification and its existing
routes compatible. Add no synchronous finder endpoint, list/history endpoint, person database, CSV finder, result
export, cancellation endpoint, pricing product, new permission, provider integration, or production deployment.

## Plan of Work

Add `src/libs/modules/email-verification/src/api/http/email-finding/email-finding.controller.ts` and
`email-finding.dto.ts`. The controller obtains organization and credential identities from the authenticated
principal and invokes a private injected application token. Validate strings and limits at the HTTP boundary,
then reuse the pure normalization contract; do not duplicate template expansion in decorators or the controller.
Reuse the module's existing domain policy during application admission, before persisting a parent or dispatching
work. Map a denied domain to a field error for this new route without changing existing verification responses.

Create requires exactly `firstName`, `lastName`, `domain`, and `maxCredits` in a JSON object. The names have the
100-code-point input limit and supported-character rules defined by the generator; domain normalization preserves
the exact canonical hostname, and the credit limit is an integer from zero through 16 without string coercion.
Reject unknown fields, especially organization, provider, template, evidence, and charge overrides. Require one
canonical lowercase UUIDv7 `Idempotency-Key`. Duplicate, malformed, or missing keys are invalid input.

For a new key apply the existing 24-hour age and five-minute future-skew bounds. An existing organization/key is
looked up before new-key age validation: equivalent normalized input and limit return the same parent during the
seven-day replay window; a changed input or limit returns `409`. Compare using the stored generation version so
a later generator release cannot mutate a replay. An expired or too-old first-admission key returns `410` with
`idempotency_key_expired` and cannot create replacement work. Malformed keys return `400`.
First-admission keys exceeding the future-skew bound also return `400`, matching verification billing.

Count each authenticated POST once against the shared organization submission limiter, including keyed replays;
internal candidate admissions use the execution permits and address cooldown without spending additional public
submission tokens. Invalid or forbidden input never reserves credits. Rate rejection returns `429` and integer
`Retry-After`; limiter failure returns safe `503`. Do not add the existing upfront `CreditGuard` to this endpoint.

Return `202 { id }` with `Location: /emailFinds/<id>` once durable admission is confirmed. A lost queue dispatch
still returns the stored parent because reconciliation can recover it. If durable admission cannot be confirmed,
return safe `503`; a retry must use the same key because a failed response does not prove that the write failed.
Never return a guessed parent ID or automatically create another operation after a timeout.

Status requires `verification:read` and reads by both organization and UUID. Missing, expired, and foreign handles
all return the same `404`; malformed handle syntax returns `400`. Completed cached, shared, and paid results use
the same schema. Apply `Cache-Control: no-store` to success and error responses. Do not echo raw names, request
keys, provider replies, stack traces, or internal execution IDs. Unexpected storage errors return a safe `503`
rather than an invented `failed` or `no_match` result. Return a terminal result only after confirmed settlement.

Extend both OpenAPI documents and their focused tests, then regenerate the browser snapshot and types. Declare
the required request header, constraints, four status variants, nullable evidence, charge bounds, and rejection
schemas. Update `docker/web/default.conf` to reserve the exact `/emailFinds` route root and descendants, and
`docker/web/nginx.conf` to log a fixed route category without identifiers or query values. Extend
`scripts/frontend/gateway.test.mjs` with POST forwarding, deep status URLs, near-miss UI paths, and sensitive-path
logging. Preserve existing route matching and unrelated SPA paths.

Extend `docker/smtp-dev/evidence-server.mjs` from the billing prerequisite with deterministic, fixture-only
recipient cases on separately named finding domains. Add their MX records to
`docker/smtp-dev/coredns/lef.test.zone`, reusing the trusted `smtp.lef.test` hostname and existing TLS setup.
Cases accept only `jane.doe`, accept both `jane.doe` and `jdoe`, reject every target with recipient `5.1.1`, accept
the catch-all control, or simulate a TLS failure. Keep the fixed random control distinct from every real candidate.
Use separate domains or fresh synthetic name tokens for scenarios so one scenario's cache cannot satisfy another.
Retain existing SMTP scenarios and make no provider calls or public MX connections.

Create `bruno/email-finding/` as a distinct stateful workflow. Add the new wrapper
`scripts/bruno/email-finding-fixture.mjs`, register the collection in `scripts/bruno/run-collection.mjs`, and add
`bruno:email-finding` to `package.json`. Reuse current ownership checks, dynamic OIDC fixture credentials,
development-stack metadata, fixture trust, and proxy bootstrap. The wrapper must verify working fixture DNS, the
trusted SMTP service, an available proxy, and provisioned disposable credits before interpreting test results.
Run a stable API process, using the existing `API_START_COMMAND` mechanism with `pnpm exec nest start`, so Swagger
generation and watch restarts cannot race a stateful test. Pin expected executed requests and assertions in the
registry and reject empty, skipped, or partially successful reports.

Cover create/read, equivalent replay, conflicting input, lost-response recovery, invalid input/key, missing handles,
foreign handles, permission failures, and rate rejection. Exercise all four outcomes, a zero-credit cache hit,
a fresh result under an insufficient budget, and an organization without available credits. Verify initial and final balances
against returned billing totals. The full 16-candidate Jane Doe unique-match and negative scenarios each cost
16 fresh conclusive checks under this policy; a zero-budget repeated search costs zero. With early exit on the
second positive, the two-positive fixture costs four fresh checks and reports incomplete coverage. Never infer
charges from queue counts. Restore fixture scenarios and only fixture-owned credit data when practical; preserve
the original failure if cleanup also fails. Document exact setup and cleanup in the collection and module README files.

## Interfaces and Dependencies

```typescript
type CreateEmailFind = {
    firstName: string
    lastName: string
    domain: string
    maxCredits: number // Required integer, 0..16.
}
type FindingCandidateResult = {
    index: number
    email: string
    patterns: EmailPatternEnum[]
    status: 'not_checked' | 'checking' | 'positive' | 'negative' | 'inconclusive'
    verificationId?: string
    observedAt?: string | null
    source?: 'fresh' | 'cache' | 'shared'
    reason?: EmailVerificationReason | 'cooldown' | 'deadline' | 'verification_failed'
    charged: 0 | 1
}
type FindingStopReason =
    | 'exhausted_candidates' | 'multiple_matches' | 'credit_limit'
    | 'insufficient_credits' | 'deadline' | 'verification_failed'
type FindingSnapshot = {
    id: string
    generationVersion: 1
    domain: string
    maxCredits: number
    progress: { total: number; checked: number }
    billing: { state: 'pending' | 'settled'; reserved: 0 | 1; charged: number }
    candidates: FindingCandidateResult[]
    omittedPatterns: { pattern: EmailPatternEnum; reason: 'address_too_long' }[]
}
type FindingStatus = FindingSnapshot & (
    | { state: 'queued' | 'running' }
    | { state: 'completed'; result: {
        outcome: 'matched' | 'ambiguous' | 'no_match' | 'inconclusive'
        matches: string[]
        coverage: 'complete' | 'partial'
        stopReason: FindingStopReason
    } }
    | { state: 'failed'; failureCode: 'finding_failed' }
)
```

`matches` contains only conclusive positive candidate addresses in generation order. It can be nonempty with an
inconclusive outcome. `checked` counts candidates with a settled verification record, including cached, shared,
and inconclusive records; it excludes pending, cooldown, and other skipped rows. A failure or follower detachment
without a verification record remains `not_checked` with its safe reason and contributes no checked count.
`coverage` is complete only when all generated candidates have a settled verification record,
not merely because no more work will run. Patterns omitted for excessive length remain separate from this denominator.
Terminal billing always has state `settled` and zero reserved credits; total charged never exceeds `maxCredits`.
Serialize one consistent stored snapshot, not separately timed totals and rows. Evidence and `verificationId`
are visible only after that child's settlement; failed checks need not invent a verification record.

HTTP rejects body/key syntax or unsupported input with `400`, authentication with `401`, and permission or
existing session/CSRF failures with `403`. Unavailable owned status returns `404`; replay conflict returns `409`;
expired keys return `410`; submission rate limits return `429`. Unconfirmed admission or unavailable storage returns safe `503`.
Domain-policy refusal is `400` with field `domain` and code `domain_not_allowed`. Candidate funding shortage is a
completed partial result, not an HTTP `402`. Reuse the existing safe error envelope and path-aware field errors;
add no alternate error framework.

## Acceptance Criteria

- A valid authorized request returns a durable `202` handle and a status URL supported by the same-origin gateway. Name/domain
  inputs, credentials, and request keys appear in no URL, logs, analytics, or error details.
- All four fixture outcomes match the evidence rules; catch-all or transport failure never becomes a unique
  match. Incomplete results retain completed evidence and accurately state tested coverage and charges.
- Equivalent key replay returns the same ID and no additional debit. A changed normalized input or budget
  returns `409`. Lost responses and lost queue dispatch recover using the original request identity.
- No invalid, unauthorized, rate-rejected, or conflicting request adds a reservation or launches verification.
  Missing and foreign status handles are indistinguishable, and browser cookie requests retain CSRF protection.
- Credit limits, cached/shared free results, partial funding stops, and settled totals agree with persisted ledger
  effects. Zero available balance does not block a cache-only search.
- OpenAPI generation and gateway checks pass; the browser receives JSON rather than SPA fallback for these routes.
  The real local Bruno run executes every registered assertion against the selective SMTP fixture.

## Validation

Finder-specific tests and `bruno:email-finding` below are new deliverables of this plan:

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/api/http/email-finding/email-finding.controller.spec.ts src/libs/modules/email-verification/src/api/http/email-finding/email-finding-http.integration.spec.ts src/lead-email-finder-api/src/openapi/browser-document.openapi.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts --runInBand
corepack pnpm test:email-finding-postgres
node --test scripts/bruno/email-finding-fixture.test.mjs scripts/bruno/run-collection.test.mjs
corepack pnpm bruno:email-finding
corepack pnpm bruno:smtp-dev
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm test:gateway
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/email-finding/README.md .agents/plans/email-finding/03-publish-email-finding-api.md
```

The guarded wrapper runs the new collection using `bru run --env local` in its selected fixture context. It must
fail if dependencies or scenario assertions are unavailable; unit stubs are not live SMTP proof. Run existing
SMTP coverage to protect unchanged verification behavior and trust enforcement. Include other changed Markdown
files in Harper. Report static and local-runtime results separately, and state explicitly if Bruno could not run.

## Idempotence and Recovery

POST recovery reuses the original key and frozen normalized request; GET is always read-only. The seven-day key
window and parent expiry come from the durable workflow. Never restore a lost response by generating a new key
automatically. A deliberate new request with a new key may create new work subject to cache, budget, and limits.
Fixture cleanup targets only resources identified by the checked-out fixture metadata. This API plan adds no
schema beyond its prerequisite; use that plan's guarded disposable reset procedure if a prerequisite schema
needs rebuilding. No migrations or historical charge adjustments belong here.

## Artifacts and Notes

The current checkout does not yet contain the billing prerequisites, selective evidence server, or finding API.
Paths and commands for those additions describe implementation targets, not completed evidence. Update the module
README and root API summary so the product's finding claim is backed by this tested contract when implemented.
Readiness and dependency state are separate; this is one API implementation PR after the durable workflow exists.

## Plan readiness

Ready to implement
