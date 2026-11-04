# Classify Conclusive Verification Evidence

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the email-verification module distinguish a conclusive answer about the submitted mailbox from an unsuccessful
attempt to obtain that answer. Later billing work can charge for new conclusive results without treating a sender
rejection, unavailable DNS service, catch-all domain, or provider account signal as a confirmed mailbox result.

A developer can observe a trusted local SMTP fixture accept or explicitly reject the target recipient, while
sender rejection, ambiguous recipient rejection, and transport failure remain inconclusive. The internal result
records evidence quality, observation time, and policy version. This pull request establishes that evidence
contract; existing deduction timing remains in place until the later billing cutover.

## Progress

- [x] (2026-09-09) Add server-owned evidence contracts and a pure quality classifier.
- [x] (2026-09-09) Preserve SMTP command stage, response codes, verified transport, and observation time.
- [x] (2026-09-09) Correct uncertain SMTP and DNS outcomes and bound reuse of stored evidence.
- [x] (2026-09-09) Persist quality metadata and keep public result serialization compatible.
- [x] (2026-09-09) Add deterministic fixture cases and focused unit, HTTP, persistence, and Bruno coverage.
- [x] (2026-09-09) Run required checks and record implementation and runtime evidence separately.

## Plan dependencies

None.

## Surprises & Discoveries

- `accepted_email` can describe the random catch-all control while the target still has `exists: null`,
  `catchAll: true`, and no sources. See `application/mailbox-verification.service.ts` in the email-verification module.
- The SMTP adapter maps both `550` and `554` to false without checking the command or enhanced status. Its shared
  exception handler covers `MAIL FROM`, `RCPT TO`, and `QUIT`.
- `src/libs/dns/src/util.ts` converts every MX lookup exception into an empty array. The mailbox adapter currently
  turns that array into false and `no_mx_records`; this does not establish an authoritative DNS negative.
- Stored SMTP results contain timestamps and a transport flag, but the probe returns neither the original
  observation time nor a cache indicator. Reuse currently has no age check.
- `privacy-compliance/07` specifies a 24-hour SMTP cache maximum. This plan uses the same freshness ceiling without
  taking ownership of physical deletion or waiting for that broader retention work.
- Implementation confirmed the planning-time reading of `smtpErrorHandlingStrategies`: `MailboxBusy` (`550`) and
  `InvalidTransaction` (`554`) shared one case returning `exists: false` regardless of command or enhanced status.
  Folding both into the existing `default` branch (`exists: null`, `unexpected_error`) was sufficient; no new
  branch was needed once the exact `rcpt_to`-stage `5.1.1` check runs first and rethrows any less specific error.
- The connectivity probe in `docker/smtp-dev/bootstrap-proxy.sh` (`curl --request NOOP ... smtp://smtp.lef.test:2525`)
  talks to the fixture in plaintext with no STARTTLS, and its `until` loop retries forever on a bad reply. The new
  `docker/smtp-dev/evidence-server.mjs` fixture had no `NOOP` handler, so it fell through to the generic `500`
  response and the bootstrap container hung indefinitely (`docker inspect` showed `status: running` well past
  when it should have exited). Adding an explicit `NOOP` → `250 OK` handler (never scenario-dependent, matching
  plain RFC 5321 semantics) fixed it; a focused test now exercises this exact plaintext exchange.
- The first live Bruno run against the rebuilt SMTP overlay failed with request 2 returning
  `"reason":"unknown"` because the overlay's one-shot `smtp-dev-proxy-bootstrap` service raced the API
  container's readiness (a preexisting flake also seen and documented during validation for
  `module-architecture/12`). Rerunning that one-shot service after the API was confirmed healthy registered the fixture proxy
  and resolved it; this is unrelated to the evidence-classification change itself.
- The evidence-classification Bruno scenarios (requests 31–47) all address `evidence.lef.test`, sharing one fixed
  catch-all control address for every scenario in the run. An earlier scenario conclusively proves that control
  missing, and this proof stays cached for 24 hours. So the `sender_rejected` scenario's own control probe is
  satisfied from that valid cache rather than reprobed live; only the target's own `MAIL FROM` is actually
  rejected live. The request's assertion was corrected to expect `catchAll: false` (from the cached control)
  rather than `null`, with the response `exists: null` / `reason: unexpected_error` still proving that a
  target-side `MAIL FROM` rejection never produces a false conclusion. This is a caching interaction worth knowing
  before adding further fixture-address scenarios to this collection.

## Decision Log

- Decision: Email verification owns evidence quality; credits owns amounts and financial transitions.
  Rationale: The quality classifier must not know ledger balances, reservations, or route pricing.
  Date/Author: 2026-09-08, agreed verification-billing planning.
- Decision: Policy version 1 recognizes only verified SMTP recipient evidence. A positive answer requires target
  `250` after verified TLS and an accepted sender, together with a conclusive negative catch-all control. A negative
  answer requires a target `RCPT TO` response in the `500`–`599` range with exact enhanced status `5.1.1`, also after
  verified TLS and an accepted sender. The control is conclusively negative only under that same recipient rule.
  Rationale: These are explicit evidence requirements, not a confidence score or an inference from a reason string.
  Date/Author: 2026-09-08, agreed verification-billing planning.
- Decision: `webmail`, `no_mx_records`, and other non-SMTP evidence remain ineligible under version 1 even if an
  existing public field is Boolean. Do not expand providers or implement authoritative DNS-negative billing here.
  Rationale: Account existence is not the selected deliverability evidence, and DNS currently loses failure detail.
  Date/Author: 2026-09-08, agreed verification-billing planning.
- Decision: Preserve decisive recipient evidence when only later `QUIT` or connection cleanup fails.
  Rationale: An error during cleanup must not turn an observed recipient answer into a different mailbox claim.
  Date/Author: 2026-09-08, agreed verification-billing planning.
- Decision: Reuse stored SMTP answers only with current policy metadata, verified transport, and original evidence
  age strictly below 24 hours. Never infer missing proof from a legacy reason, creation time, or last access time.
  Rationale: Later caching needs trustworthy evidence age; reads cannot extend freshness.
  Date/Author: 2026-09-08, agreed verification-billing planning.

## Outcomes & Retrospective

Added `domain/verification-evidence.ts` (`VerificationQuality`, `MailboxEvidence` discriminated union, the pure
`deriveMailboxEvidence` for policy version 1) and `application/classify-verification-quality.ts` (the pure
`classifyVerificationQuality` and `deriveEvidenceObservedAt`); neither imports credits, a clock, or
infrastructure. Added `application/ports/verification-clock.ts`, bound to a real system clock in
`infrastructure/email-verification-core.module.ts` and injected into `SmtpMailboxProbe`.

Extended the private `MailboxProbeResult` (`application/ports/mailbox-probe.ts`) with a required `evidence` field
rather than leaving it a bare alias of the shared `ISmtpVerificationResponse`. Added the shared
`infrastructure/mailbox/smtp/smtp-command-kind.ts` type; `SmtpException` now carries `commandKind`, and
`SmtpClient.rcptTo()` resolves with the actual `SmtpResponse` (code and enhanced status) instead of `void`.
`SmtpClient.mailFrom()`/`quit()` are unaffected. Rewrote `SmtpMailboxProbe.tryVerify()` to isolate the recipient
answer from cleanup: a `rcpt_to`-stage response is classified into `MailboxEvidence` immediately, then `QUIT` is
attempted and any failure (rejection or peer close) is swallowed without altering the result already decided.
`smtpErrorHandlingStrategies`' `MailboxBusy`/`InvalidTransaction` case was removed (folded into the existing
`default` branch), so a generic recipient rejection without the exact `5.1.1` proof is `unexpected_error`, never a
conclusive negative — including the identical code and enhanced status arriving at `MAIL FROM` instead of
`RCPT TO`, which the command-stage check alone distinguishes. The empty-MX branch now returns `exists: null`
(`no_mx_records` stays the reason) instead of `false`. Stored-evidence reuse now requires matching policy version,
verified transport, an observation no later than now, and age strictly below 24 hours, computed from two new
nullable `SmtpVerificationEntity` columns (`evidenceObservedAt`, `evidencePolicyVersion`); a legacy row missing
either is ineligible. `MailboxVerificationService` gates the target probe on the control's evidence kind
(`smtp_recipient_missing`), not a bare Boolean, and attaches the resulting `verificationQuality`/
`evidenceObservedAt`/`evidencePolicyVersion` (three new columns on `EmailVerificationEntity`, the last a
non-nullable constant) to every returned record; `EmailVerificationOrchestrator` persists them unchanged. Neither
field is `@Expose()`d on `EmailVerificationResponseDto`, so existing exact-equality HTTP response assertions
(unchanged in this PR) continue to prove they do not leak.

Added `docker/smtp-dev/evidence-server.mjs`: a deterministic STARTTLS fixture with paired SMTP and fixture-only
HTTP control servers, factored as a testable `createEvidenceFixture()` with a gated auto-start block. It replaces
the former accepts-all `mailpit` service in `docker/compose.smtp-dev.yaml` at the same trusted `smtp.lef.test`
address, reusing the existing fixture certificate and key. It recognizes the one fixed catch-all control local
part and otherwise serves one of eight closed scenarios (`default` plus seven rejection/closure variants)
selected through its control endpoint, never sends mail, and never logs an address, command, or raw reply. Added
`evidence.lef.test` to `docker/smtp-dev/coredns/lef.test.zone`; it shares the existing MX host used by
`lef.test`. Updated the `mailpit` → `smtp-evidence` rename across `depends_on` blocks in
`docker/compose.smtp-dev.yaml` and the two Bruno-launcher ownership-check lists
(`scripts/bruno/run-collection.mjs`, `scripts/bruno/async-verification-fixture.mjs`).

Extended `bruno/smtp-dev` with 17 new requests (31–47). After setting the organization's balance to exactly
seven credits, seven scenario pairs (select, then verify a unique `evidence.lef.test` address) prove target
acceptance, the target's own exact `5.1.1` rejection, and the identical rejection at `MAIL FROM` instead staying
ineligible. Further pairs cover a bare rejection, an ambiguous `5.7.1` rejection, a temporary rejection, and an
accepted answer surviving the fixture closing the connection before it answers `QUIT`; a final balance read and a
scenario reset close the sequence. Updated the registered request count (30 → 47) in
`scripts/bruno/run-collection.mjs`; its own
file-driven static test needed no other change. Added `docker/smtp-dev/evidence-server.test.mjs` (13 focused
Node test cases covering every scenario, the pre/post-TLS EHLO shape, `NOOP`, and the control endpoint) and wired
it into `test:oidc-runners`/`test:ci` via `package.json`.

Final validation, run against the actual final diff:

- `corepack pnpm test -- classify-verification-quality.spec.ts verification-evidence.spec.ts
mailbox-verification.service.spec.ts email-verification.service.spec.ts --runInBand` — 40/40 passed.
- `corepack pnpm test -- smtp-client.spec.ts smtp-mailbox-probe.spec.ts --runInBand` — 34/34 passed, including new
  cases for command-stage-tagged exceptions, `QUIT`-failure evidence preservation, and stored-evidence freshness
  boundaries (stale, future, and wrong-policy-version rows all correctly ignored).
- `corepack pnpm test -- src/libs/modules/email-verification --runInBand` — 67/67 non-skipped suites passed
  (620 tests), including the real-Postgres `typeorm-stores-organization-isolation.integration.spec.ts` and
  `verification-organization-ownership.integration.spec.ts` against the disposable `lef_identity_test` database.
- `node --test docker/smtp-dev/evidence-server.test.mjs scripts/bruno/run-collection.test.mjs` — 24/24 passed.
- `corepack pnpm test:oidc-runners` — 89/89 passed.
- `corepack pnpm architecture:check` — "Module architecture check passed (9 modules, 0 violations)."
- `corepack pnpm typecheck` — 0 errors (after clearing a root-owned, gitignored, dev-container-recreated `dist/`
  directory; a known, preexisting local-environment quirk unrelated to this plan).
- `corepack pnpm lint` — 0 errors, 1 preexisting warning in an unrelated file
  (`src/libs/config/src/load-secrets.spec.ts:14`, missing return type).
- `corepack pnpm openapi:check` — passed; the public DTO shape is unchanged.
- `corepack pnpm test:ci` — 236 Jest suites passed (15 skipped, 0 failed; 2736/2828 tests passed, 92 skipped) plus
  89/89 Node test-runner cases, 0 failed.
- Runtime/Bruno matrix against a freshly reset dev stack (`pnpm dev:reset -- --confirm-project=LEF`, then the
  documented plain-stack `down` before the SMTP overlay `up`, health confirmed `{"status":"ok"}`):
  `bruno/m2m-oidc-authentication` 3/3, `bruno/service-client-management` 6/6, `bruno/proxy-registry` 8/8,
  `bruno/bff-sessions` 15 requests/16 tests, `bruno/organization-onboarding` 23/23, `bruno/credit-purchases`
  33/33, `bruno/async-verification` 15/15, `bruno/batch-verification` 9 requests/15 tests, and
  **`bruno/smtp-dev` 47 requests/78 tests** (including all 17 new evidence-classification requests) — all
  passed. The API stayed healthy throughout.
- `corepack pnpm docs:lint -- bruno/smtp-dev/README.md src/libs/modules/email-verification/README.md` —
  Harper: 2 file(s) passed.
- `corepack pnpm exec prettier --check` on the same two files, plus every changed script or configuration file — all use
  Prettier code style.
- `git diff --check` — no output (clean).

No application HTTP route, DTO field, authorization rule, queue protocol, or provider behavior changed. Deduction
timing is unchanged: `CreditGuard` still debits before validation, and the batch workflow still debits one credit
per validated row; this plan only adds internal evidence metadata that later billing work
(`verification-billing/03`) will consume.

**Material architectural trade-off**: the `SmtpMailboxProbe` constructor grew from seven to eight collaborators
(`VerificationClock` joins the DNS service, MX resolver, proxy service/allocator, SMTP client factory, SMTP
verification store, and allocation observer). Each remains a small, single-purpose port — this is not a generic
manager — but the adapter is accumulating cross-cutting dependencies for one still-cohesive responsibility
(driving one SMTP verification attempt end to end). No violation exists today; a future plan that adds another
cross-cutting concern to this adapter should weigh splitting connection acquisition from protocol/evidence
interpretation rather than adding a ninth constructor parameter.

## Context and Orientation

`EmailVerificationOrchestrator` under `src/libs/modules/email-verification/src/application/` normalizes the address,
checks domain policy, updates the organization-owned email record, invokes `MailboxVerificationService`, and appends
an `EmailVerification`. The mailbox service first probes a fixed random control address. It probes the target only
when the control returns false and can consult the existing approved account-discovery path when appropriate.

The private `MailboxProbe` port currently aliases the common SMTP response interface. Its
`infrastructure/mailbox/smtp/smtp-mailbox-probe.ts` adapter owns SMTP cache lookup, MX lookup, proxy allocation,
connection release, and outcome persistence. `smtp-client.ts` knows which command it sends, but `smtp.exception.ts`
does not retain that stage. `tryVerify()` handles sender, recipient, and cleanup errors together.

Domain records and private TypeORM entities for SMTP and final verification belong to this same module. HTTP
serialization uses `api/email-verification-response.dto.ts`. Its public fields include `exists`, `catchAll`,
`reason`, and `sources`; request bodies are not evidence. `CreditGuard` currently deducts before single-request
validation, and the batch workflow deducts row count before dispatch. This plan changes neither mechanism.
`verification-billing/03` will consume the quality contract established here.

## Scope and Non-Goals

Add internal evidence types, a pure quality classifier, interpretation of SMTP command stages, bounded evidence
reuse, persistence mapping, deterministic fixtures, and semantic HTTP regressions. Correct uncertain answers
without changing routes, authorization, organization ownership, or public DTO field names.

Do not implement reservations, result-based deduction, final-result caching, request idempotency, concurrent
operation sharing, CSV deduplication, rate limits, cooldowns, payments, or UI changes. Preserve account-discovery
providers and approval checks. Do not send mail or issue `DATA`, add migrations, or implement retention sweeps.
SMTP acceptance is the selected signal and is not a guarantee of future delivery.

## Plan of Work

Read the module instructions and README before implementation. Add private `domain/verification-evidence.ts` and
`application/classify-verification-quality.ts` files implementing the contracts below. The classifier is pure and
does not import credits. Add `application/ports/verification-clock.ts` and bind a system clock in the existing core
composition module so freshness tests do not sleep.

Extend the private `MailboxProbeResult` with server-owned evidence. Record the SMTP command kind in typed errors at
the command boundary, retaining numeric and enhanced codes without adding persisted copies of raw replies. The
`rcptTo()` success path must supply its actual response code: resolving a promise is not proof of `250`. Update the
private client interface, implementation, and fakes together. Record verified TLS and sender acceptance before
interpreting the recipient response. Preserve STARTTLS before either envelope address and release each proxy lease
exactly once.

Separate recipient interpretation from `QUIT`. Once acceptance or explicit absence is observed, preserve that
evidence after cleanup even if `QUIT` rejects or the peer closes. Earlier failures stay inconclusive. Reuse existing
safe reasons where accurate: accepted recipients use `accepted_email`, explicit missing recipients use
`rejected_email`, sender rejection uses `sender_blocked`, and temporary, transport, or known blocking outcomes retain
their matching reasons. Generic permanent failures without recipient proof use `unexpected_error` and `exists:
null`. Do not add a new public reason enum.

Change the empty-MX branch to `exists: null`, existing reason `no_mx_records`, and inconclusive evidence. That reason
means the resolver supplied no usable records, not authoritative mailbox absence. Do not rewrite the shared DNS
cache or add fallback SMTP behavior. Test both an empty response and a DNS exception passed through the existing
DNS composition; neither can become a conclusive negative.

Have the mailbox service combine control and target evidence. Only a confirmed missing control permits the normal
target probe; a catch-all acceptance stays inconclusive about the target. A conclusive positive requires both that
control negative and an accepted target. A conclusive target negative requires its own recipient proof. Preserve
existing approved provider invocation conditions and public account evidence, but classify those answers as
ineligible under this policy. A Boolean `exists`, `MX` source, or reason string cannot substitute for proof.

Extend private SMTP persistence with the typed proof, observation time, and policy version. Reuse requires matching
policy, verified transport, recipient proof, an observation no later than now, and age less than 24 hours. Otherwise, run
the existing fresh probe. Uncertain records may retain their existing connection hints but cannot supply conclusive
evidence. Treat missing or invalid timestamps as ineligible. A read or unrelated save must not advance evidence time.
Derive a final answer's observation time from the oldest decisive input, including a reused control when needed.

Persist final quality, evidence observation time, and policy version on the appended verification record. Update
`domain/email-verification.ts`, `domain/smtp-verification.ts`, affected private store ports, TypeORM entities,
record mappers, and test builders. Keep these fields internal: request DTOs cannot supply them, and existing result
serialization must not expose them accidentally. A final record's creation time cannot replace evidence time.

Add `docker/smtp-dev/evidence-server.mjs`, a deterministic STARTTLS responder at the existing trusted
`smtp.lef.test:2525` endpoint. Reuse existing fixture certificates and trust roots, preserve the current accepts-all
`lef.test` scenario, and retain the plaintext service. Add `evidence.lef.test` with the same MX. Replace the trusted
fixture service with `smtp-evidence` in `docker/compose.smtp-dev.yaml` and update launcher ownership checks. Its
fixture-only HTTP control endpoint selects a closed scenario enum and resets opaque counters; expose it only on the
Docker network, with no host port. Scenarios distinguish the fixed control from the target. They never send mail or
log addresses, envelope commands, or raw reply text.

Extend `bruno/smtp-dev`, using unique target addresses for independent scenarios so prior evidence cannot satisfy a
later case. Restore the baseline fixture scenario after testing. Update the launcher's required request count,
static tests, module README, and collection README. Existing credit assertions must remain accurate for this PR;
evidence tests do not establish that later billing changes are already enabled.

## Interfaces and Dependencies

`VerificationQuality` is the internal enum `conclusive_positive`, `conclusive_negative`, or `inconclusive`. The
private policy version constant is `1`. Persisted final results add `verificationQuality`,
`evidenceObservedAt: Date | null`, and `evidencePolicyVersion: number`. The first two quality values are eligible
evidence for later charging; quality alone never performs a debit.

`MailboxEvidence` is a discriminated union with kind `smtp_recipient_accepted`, `smtp_recipient_missing`, or `none`.
The first two carry `observedAt`, `policyVersion`, origin `fresh` or `stored`, stage `rcpt_to`, numeric response code,
enhanced code when present, verified transport, and successful sender acceptance. The `none` case invents no
observation time. Acceptance requires `250`; absence requires a `5xx` and exact enhanced code `5.1.1`. The final
classifier also receives control evidence when a positive answer depends on it.

These contracts stay within email verification; its public barrel is unchanged. Application code depends on clock
and probe ports. Infrastructure owns TypeORM, SMTP, DNS, and fixture integration. No new module dependency or
provider library is needed. HTTP shape stays compatible; semantics change where previous answers lacked proof or
cleanup erased an observed result. Trusted persistence and queue infrastructure may retain internal metadata;
client inputs cannot establish it.

## Acceptance Criteria

- Fresh target `250` after verified TLS and sender acceptance, with a confirmed missing control, produces true,
  `catchAll: false`, and internal `conclusive_positive` quality.
- Target recipient `5xx` with exact enhanced status `5.1.1` under the transport and sender prerequisites produces
  false and `conclusive_negative`; the same rejection at `MAIL FROM` does not.
- Generic recipient `550`/`554`, enhanced `5.7.1`, temporary rejection, timeout, unavailable proxy, failed transport,
  absent MX answers, and DNS failures remain ineligible and do not produce conclusive false answers.
- Catch-all acceptance without target proof remains inconclusive. Existing `webmail` evidence remains ineligible
  even when public `exists` is true. No provider disclosure is added.
- `QUIT` failure after decisive evidence preserves the recipient answer. Earlier failures remain inconclusive.
  Every acquired proxy lease is released exactly once.
- Stored evidence is reused only for its owning organization, current policy, valid proof, and age below 24 hours.
  Exact expiry, future observations, and legacy rows without proof trigger fresh work. Reads never refresh age.
- Quality metadata survives persistence, records the oldest decisive observation, and cannot be spoofed through
  sync, async, or batch inputs. Public fields and ownership remain compatible.
- The fixture and Bruno collection prove positive, missing-recipient, sender-rejection, ambiguous-rejection,
  catch-all, plaintext, and cleanup-failure behavior through HTTP. Existing deduction timing remains unchanged until
  the later cutover and is documented accurately.
- Architecture, focused tests, type checking, and static collection checks pass. Record runtime
  validation separately from isolated tests.

## Validation

Run these commands from the repository root after implementation. The classifier and fixture test paths are new
files delivered by this PR; the other test paths already exist.

```shell
corepack pnpm test -- src/libs/modules/email-verification/src/application/classify-verification-quality.spec.ts src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts src/libs/modules/email-verification/src/application/email-verification.service.spec.ts --runInBand
corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/mailbox/smtp/smtp-client.spec.ts src/libs/modules/email-verification/src/infrastructure/mailbox/smtp/smtp-mailbox-probe.spec.ts src/libs/modules/email-verification/src/infrastructure/discovery/dns/dns-mx-resolver.integration.spec.ts --runInBand
corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-smtp-verification.store.spec.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-verification.store.spec.ts src/libs/modules/email-verification/src/api/http/synchronous-verification/synchronous-verification-http.integration.spec.ts src/libs/modules/email-verification/src/api/http/asynchronous-verification/async-email-verification-http.integration.spec.ts --runInBand
node --test docker/smtp-dev/evidence-server.test.mjs scripts/bruno/run-collection.test.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:check
git diff --check
```

Classifier tables cover every prerequisite, mismatched policy, future observations, reused controls, and every
existing reason. Real local TLS transcripts in the client tests prove command stage and response-code preservation
and assert safe logs. Fake-clock adapter tests cover the exact 24-hour boundary. Keep authentication, authorization,
and serialization assertions while adding spoofed evidence and corrected uncertain HTTP outcomes.

Extend the real PostgreSQL organization-isolation suite for metadata persistence and run it against the disposable
test database using its documented environment:

```shell
corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-stores-organization-isolation.integration.spec.ts --runInBand
```

For the owned SMTP stack, follow the reset and overlay instructions in `bruno/smtp-dev/README.md`, then run:

```shell
corepack pnpm bruno:smtp-dev
```

The launcher runs `bru run --env local --sandbox developer` in the API container and must require every registered
request and a nonzero passing test count. Run target acceptance, target `550 5.1.1`, sender `550 5.1.1`, bare target
`550`, target `554 5.7.1`, temporary rejection, catch-all acceptance, and connection close after decisive recipient
evidence. Retain plaintext STARTTLS rejection. Test simulated DNS failure through the existing DNS composition;
do not claim that the SMTP fixture exercised a real DNS outage.

If PostgreSQL or the owned fixture
stack is unavailable, record the exact prerequisite and leave runtime acceptance unverified instead of substituting
passing mocks.

## Idempotence and Recovery

Classification is repeatable for identical policy, clock, and evidence. Reuse preserves original observation time.
Old or incomplete metadata is ineligible and can be replaced only by fresh supported evidence. Never backfill
confidence from legacy reasons.

Use `TYPEORM_SYNCHRONIZE=true` against disposable development data; add no migration. Before an incompatible schema
reset, stop the owned development stack and run `corepack pnpm dev:reset -- --confirm-project=LEF`, then recreate the
SMTP overlay using its README commands. Reset reseeds identity, credentials, and credits; the overlay bootstrap
restores the fixture proxy and clears stale DNS cache. The fixture scenario reset restores baseline behavior after
test failure. Keep existing developer credentials ignored and never print them.

## Artifacts and Notes

This is one independently reviewable PR establishing evidence quality. It unlocks `verification-billing/03` without
advertising later free-cache or result-based charging behavior. Completed plans remain historical evidence.
Physical retention, privacy cancellation fences, and deletion remain owned by `privacy-compliance/07`; freshness
never extends those lifetimes.

This planning task writes Markdown only. No implementation or runtime validation is claimed. Implementation must
review its final diff for single-responsibility violations and record material trade-offs.

## Plan readiness

Implemented and validated; ready for review.
