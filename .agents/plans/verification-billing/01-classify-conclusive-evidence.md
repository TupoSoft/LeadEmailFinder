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

- [ ] (2026-09-08) Add server-owned evidence contracts and a pure quality classifier.
- [ ] (2026-09-08) Preserve SMTP command stage, response codes, verified transport, and observation time.
- [ ] (2026-09-08) Correct uncertain SMTP and DNS outcomes and bound reuse of stored evidence.
- [ ] (2026-09-08) Persist quality metadata and keep public result serialization compatible.
- [ ] (2026-09-08) Add deterministic fixture cases and focused unit, HTTP, persistence, and Bruno coverage.
- [ ] (2026-09-08) Run required checks and record implementation and runtime evidence separately.

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

Not started.

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
- Architecture, focused tests, type checking, documentation lint, and static collection checks pass. Record runtime
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

Run `corepack pnpm docs:lint --` with this plan, the module README, the SMTP collection README, and every other
changed English Markdown file as explicit arguments; fix findings and rerun. If PostgreSQL or the owned fixture
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

Ready to implement
