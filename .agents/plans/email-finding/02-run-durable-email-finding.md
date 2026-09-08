# Run Durable Email Finding Within a Bounded Credit Budget

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Run an organization-owned search over the candidate addresses generated from a person's name and company domain.
The application checks candidates sequentially, reuses settled verification evidence, and reports whether the
bounded candidate set contains one matching mailbox, several, none, or insufficient evidence. Developers can
exercise the internal operation and worker through focused integration tests. Plan 03 adds the HTTP surface.

The search reuses the verification-billing policy: a new conclusive candidate result costs one credit, including
a conclusive negative. Cached and shared results cost zero; the parent search has no additional fee. The required
`maxCredits` input limits the total it may own. Mailbox evidence does not establish the named person's identity.

## Progress

- [ ] (2026-09-08) Add durable parent and candidate records with scoped admission and cursor fencing.
- [ ] (2026-09-08) Compose sequential verification, explicit budgets, and bounded candidate-set conclusions.
- [ ] (2026-09-08) Enforce SMTP-only owned execution and shared-operation compatibility.
- [ ] (2026-09-08) Add queue recovery, deadlines, confirmed settlement, and expiry behavior.
- [ ] (2026-09-08) Complete focused concurrency, PostgreSQL, composition, and documentation validation.

## Plan dependencies

- `email-finding/01`
- `verification-billing/04`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Keep finding inside `email-verification`, using internal application ports. Rationale: Its current
  public barrel exports only the composition module; a sibling module would require an unnecessary public API.
  Date/Author: 2026-09-08, Codex planning.
- Decision: Charge per new conclusive candidate, require `maxCredits` from 0 through 16, and add no parent fee.
  Rationale: This follows `verification-billing` without silently introducing a different pricing model.
  Date/Author: 2026-09-08, Codex planning.
- Decision: Check the complete deduplicated candidate set before declaring a unique match; two conclusive positives
  permit early ambiguity. Rationale: Candidate order alone cannot establish that the first accepting address is
  the person's unique address. Date/Author: 2026-09-08, Codex planning.
- Decision: Fresh finder-owned executions use SMTP only; following existing standard work does not change its
  policy. Rationale: Generating candidate addresses must not enable additional account-discovery disclosures.
  Date/Author: 2026-09-08, Codex planning.
- Decision: A work deadline stops new evidence collection, while unresolved financial recovery remains running.
  Rationale: A timeout cannot prove that a reservation was released or that a capture failed.
  Date/Author: 2026-09-08, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The owning module is `src/libs/modules/email-verification/`. Its `src/application/email-verification.service.ts`
currently verifies a supplied address. `src/application/mailbox-verification.service.ts` combines SMTP and optional
account-discovery evidence. The public `src/index.ts` exports only `EmailVerificationModule`.

`verification-billing/01` plans an internal `VerificationQuality` and trusted SMTP evidence. Plan 02 of that road
map plans credit reservations. Its Plan 03 plans `application/operations/` admission, execution, settlement,
fresh complete-result cache, and shared execution per organization/address. Its Plan 04 plans route activation,
submission limits, execution permits, and cooldowns. These are prerequisites, not capabilities already delivered
when this document was authored. Read their final implementation before connecting this plan.

Existing queue composition is under `src/infrastructure/queues/async-verification/` and
`src/infrastructure/queues/batch-verification/`. `src/infrastructure/email-verification-core.module.ts` wires
private stores and services; `src/email-verification.module.ts` is the business composition root. Identity owns
ledger persistence, credits owns reservation transitions, and finding must access neither ledger repositories
nor public verification endpoints. Plan 01 of this road map supplies normalized, versioned, deduplicated candidates.

## Scope and Non-Goals

Deliver one PR containing the internal finding operation, persistence, queue worker, recovery, and the narrow
verification-operation extensions it requires. Wire the capability without mounting a finder endpoint. There is
no new route or public activation switch in this PR; Plan 03 mounts the routes after this capability is verified.

Do not add batch finding, external lead providers, account-discovery calls, domain guessing, address scraping,
identity claims, a confidence score, new pricing, public verification options, or browser screens. Preserve existing
verification contracts, single-active-execution identity, authorization, provider approvals, and secure transport.
Do not introduce migrations, production rollout, or the privacy road map's complete retention implementation.

## Plan of Work

Create framework-independent `application/finding/email-finding.service.ts`, `finding-result-classifier.ts`, and
`finding-recovery.service.ts`. Add narrow `application/ports/finding-request-store.ts`,
`finding-candidate-store.ts`, `finding-jobs.ts`, and `finding-candidate-verification.ts` contracts. The first two
own parent transitions and candidate admission/cursor transitions respectively; the verification port adapts the
existing internal operation service. Reuse its injected clock, quality policy, cache, settlement, and execution
permits. Do not create another verifier or credit service.

Persist `email_finding_requests` and `email_finding_candidates` through new entities under
`infrastructure/persistence/typeorm/` and purpose-specific adapters beside existing persistence adapters. The root
stores its UUID, organization, required client key, canonical-input digest, generator version, budget, timestamps,
work deadline, state, attempt generation, lease, cursor, terminal outcome, and settlement-confirmed totals. Generate
the immutable candidate list first and retain no raw or normalized first/last name afterward. Persist the ordered
addresses, pattern metadata, and list version; replay never regenerates the list using a newer implementation.

Compute a deterministic digest of the canonical normalized input, generator version, and `maxCredits` before
discarding names. Treat that digest and candidate rows as customer data. Never log names, addresses, submitted
domain, input digests, request bodies, or provider payloads. Queued messages carry only opaque root IDs and attempt
generations. Use existing safe operation/error-code logging and do not add address-bearing financial references.

A candidate row stores organization/root/index, address, all generating patterns, its stable child request UUID,
an admission permit/version, verification request/execution/result links, source, quality, evidence timestamp,
settlement facts, and a safe skip or failure reason. Give `(organizationId, clientKey)` and
`(organizationId, rootId, candidateIndex)` unique constraints. Enforce at most one unresolved
candidate per root with a partial unique index covering admission-pending and active phases. Index organization
lookups, candidate foreign keys, and nonterminal recovery by next-action time. Use short transactions and fixed
root-before-candidate locking; no transaction spans Redis, SMTP, queues, credits, or provider HTTP calls.

Admission validates Plan 01 input, the required safe-integer budget from 0 through 16, and the client's required
idempotency key. Follow the organization-scoped UUIDv7 rules from `verification-billing/03`: existing-key lookup
precedes age checks; first admission allows keys at most 24 hours old or five minutes ahead; conflicting normalized
input, version, or budget returns conflict. Retain equivalent-key replay for seven days from confirmed terminal
settlement. Expired known operations stay expired, and old pruned keys cannot create new searches. Store scoped
receipts for that replay horizon; expose no cross-organization existence distinction.

For an existing key, canonicalize replay with its persisted generator version, then compare its digest; retain that
normalization implementation throughout the replay horizon. A generator deployment must not invalidate valid replay.

The root consumes one organization submission token through the limiter delivered by `verification-billing/04`.
Children consume no additional public-submission tokens. Root admission checks neither current balance nor future
candidate funding: it persists a queued root and dispatch intention once validation and the limiter succeed.
Consequently, Plan 03 can return an accepted handle at zero balance. A dispatch outage leaves durable work for
recovery; an uncertain database commit requires replay with the same client key instead of a new admission.

Claim a 60-second root lease and renew every 20 seconds. Under a short conditional transaction, check the lease
generation, cursor, deadline, and absence of an unresolved child, then persist the next child's identity and an
admission permit before invoking verification. The child identity is an internal opaque request UUID keyed by
organization/root/candidate index, not a newly generated public UUIDv7 header on each retry. Repeated invocation
returns the same child request even if its admission response was lost. Queue redelivery cannot create another.

Extend verification-operation admission with a private finder context. Creation of a new child request/execution
must atomically validate and consume its persisted permit against the active root generation and cursor before
funding. Keep this within a short email-verification persistence transaction; pass no TypeORM transaction manager
through application interfaces. Cancellation invalidates unused permits while holding the same root lock. Recovery
may reissue an unconsumed permit for the same child identity under a new generation, never a different child key.
An already admitted child is read by identity before considering a new permit. Delayed calls with stale permits
cannot claim new funding; ambiguous funding uses the existing admission-closure receipts before finalization.

For each child, lookup equivalent admission, reusable cache, then an active execution before new funding. A cache
hit or follower is allowed even when `maxCredits` or current available balance is zero. Only a new owned execution
consumes budget: require `confirmedCharges + ownedReserved + 1 <= maxCredits` before reserving through the shared
operation. Persist this funding ceiling in the permit; one unresolved child and the cursor fence prevent parallel
workers from overspending it. Credits still checks actual available funds atomically. Finder adds no root hold,
debit, compensating grant, or separate financial intention.

If the next candidate needs funding beyond the budget, or new funding is denied for insufficient available credits,
stop traversal before outbound work for that candidate. Confirm any required admission closure, retain settled
earlier charges, and mark this and later candidates untested with `credit_limit_reached` or `insufficient_credits`.
Do not promise to inspect later cache entries after traversal stops. A cooldown candidate has no new execution or
charge: mark it untested with reason `cooldown` and advance, rather than waiting or bypassing the shared cooldown.
It contributes unresolved evidence to classification and incomplete coverage, not a checked candidate. Record
other terminal inconclusive candidate results and continue while the budget and work deadline permit.

Persist `evidenceMode: 'smtp_only' | 'standard'` on verification executions before enqueue, defaulting existing
verification entry points to `standard`; only the internal finding adapter can request `smtp_only`. Propagate it
through retries and mailbox assembly so a fresh finder-owned execution never invokes `AccountDiscovery.discover`.
Do not accept this option from current public verification DTOs. Reuse existing domain policy and SMTP behavior;
the option must not relax TLS, proxy requirements, or any provider approval. Test zero provider invocations even
when a provider is approved, SMTP is inconclusive, and a child is retried or recovered.

Keep one active execution per organization/address, irrespective of evidence mode. A finder can follow an existing
standard execution read-only; it neither triggers another execution nor widens that execution's provider policy.
It accepts only settled SMTP `VerificationQuality` evidence with the policy metadata from `verification-billing/01`.
Account-discovery evidence alone remains inconclusive. Conversely, normal verification may follow an active
finder-owned execution and receive its unchanged evidence; joining cannot upgrade `smtp_only` to `standard`.
Cache reuse follows the same conclusive SMTP policy, organization boundary, and original evidence expiry.

After child settlement, copy immutable observation and per-request charging facts and advance the cursor in one
generation-conditional transaction. Lost acknowledgments reread and apply that same settled child exactly once.
Do not derive truth from `exists`, a reason string, queue completion, or result creation time. Search billing sums
only its child payer requests; shared child requests always contribute zero. Recorded replay reports the original
charge without another debit. Keep actual evidence timestamps rather than assigning the parent completion time.
Root reads join admitted child billing records through a scoped application read port, so a capture awaiting cursor
advance cannot appear free. Read totals from one consistent persistence snapshot, never a queue-state estimate.

Classify deduplicated candidate coverage using settled `VerificationQuality`. Two or more conclusive positives
produce `ambiguous` and may stop traversal early with partial coverage. Exactly one positive and all remaining
candidates conclusively negative produces `matched`. All candidates conclusively negative produces `no_match`.
Every other evidence combination, including one positive plus an unresolved or untested candidate, is
`inconclusive`. `no_match` means no match within the generated patterns. Neither outcome establishes identity or
claims exhaustive domain coverage. A candidate failure contributes incomplete evidence; it does not erase useful
settled candidates or automatically make the whole root fail.

Add `EMAIL_FINDING_WORK_TIMEOUT_SECONDS` to `src/lead-email-finder-api/src/environment-variables.dto.ts`, default
900, accepting integers from 30 through 7200. Inject a plain value into the finding composition. Root admission
fixes an absolute work deadline; retries, lease renewal, and queue delay never extend it. Each newly owned child
execution receives a deadline no later than its root's, using the fenced cancellation and bounded real adapter
abort delivered by `verification-billing/03`. Parent expiration stops candidate admission and cancels owned work
through that operation's ownership-aware port; it never writes reservations itself. A durable capture intention
wins over cancellation and must settle, even after the work deadline.

A root following another payer's execution can detach at its deadline with a durable zero-charge incomplete
candidate receipt, without canceling, altering, or waiting for the other payer's execution. Close only that finder
request's association so late shared completion cannot overwrite the detached candidate. Owned children require
confirmed terminal capture/release or admission closure before the root becomes terminal. Parent status remains
`running` during financial uncertainty and may exceed its work deadline; no deadline fabricates a settled charge.

Internal child reads and reconciliation use durable identities and remain available while referenced by a
nonterminal finder parent. They do not use public handle visibility to decide whether a child exists. A crash
before cursor advancement must remain recoverable after a child's seven-day public visibility window expires.
Record this active-parent reference in the lifecycle contract; it is a recovery invariant, not indefinite
retention of terminal customer records. Parent public visibility and keyed replay expire seven days after its own
confirmed terminal settlement. Physical cleanup remains owned by the privacy lifecycle work.

Add `infrastructure/queues/email-finding/` with `email-finding.module.ts`, `email-finding.processor.ts`,
`email-finding-queue.config.ts`, and `bull-finding-jobs.ts`. Wire it from the existing business composition root;
reuse the host's configured BullMQ/Redis connection and existing TypeORM connection. Keep queue payloads versioned
and retries idempotent. A reconciler runs every 30 seconds, claims indexed work in pages of 100, recovers missing
dispatch and expired root leases, and rereads child settlement without probing again. Avoid a dedicated deployment,
new Redis service, or always-polling worker per candidate. Queue completion is never the durable status authority.

Use root states `queued`, `running`, `completed`, and `failed`. A confirmed bounded evidence outcome is completed,
including incomplete searches caused by budget or deadline. Failed denotes a terminal orchestration failure;
preserve settled candidate evidence and charges, and confirm all owned financial effects before exposing it.
Add the new tables, digest treatment, ownership, and cancellation surface to the module README and
`docs/privacy/email-verification-processing-contract.md`. Record `privacy-compliance/07` as the owner of physical
retention/erasure integration; visibility expiry is not a deletion promise. Preserve all existing public exports.

## Interfaces and Dependencies

The internal finding service provides `admit`, `read`, and `run`; recovery provides `reconcile(limit)`. Admission
accepts validated organization/principal context, Plan 01 input, `maxCredits`, and a required client key.
It returns the stable parent UUID or typed validation, rate, replay-conflict, expiry, or uncertain-admission errors.
Read is organization-scoped. It supplies state, terminal outcome, safe stop/failure reason, total/tested/untested
candidate counts, candidate evidence summaries, and authoritative pending/settled reserved/charged totals.

The candidate-verification port provides repeatable admission/read, owned cancellation, and follower detachment.
Its private context includes the persisted root/candidate identity, admission permit, funding ceiling, absolute
deadline, and `smtp_only` mode. Result reads expose trusted quality and evidence metadata internally. Child request
handles and admission permits are not capabilities: possessing one cannot create work or read another organization.
Plan 03 exposes only approved parent/candidate summaries, not private child keys or arbitrary child-create routes.

## Acceptance Criteria

- Fifty concurrent deliveries for one root produce one child per index, at most one unresolved child, and charges
  never exceeding its budget; stale root generations and delayed admission permits cannot start new funding.
- Root admission succeeds at zero balance; current cache/shared candidates can progress with `maxCredits: 0`.
  The first required unaffordable reservation stops traversal without a debit for that candidate.
- Every new conclusive negative or positive payer child costs one credit; cached/shared/inconclusive children cost
  zero. Parent totals equal immutable owned child debits, including after duplicate delivery and restart.
- One positive plus all negatives is matched; two positives are ambiguous; all negatives are no_match; every
  partially unknown or untested remaining set is inconclusive. Evidence mode and Boolean fields cannot bypass this.
- Fresh finder-owned executions make zero account-discovery calls. Racing finder/normal submissions share one
  execution; a standard follower cannot upgrade finder evidence mode, and finder followers cannot alter standard work.
- Crashes around child identity, funding, result persistence, settlement, and cursor advance recover without duplicate
  charges. Deadline cancellation fences owned work, closes sockets within the prerequisite's bound, and honors capture.
- Shared follower detachment cannot cancel another payer or receive late completion; settlement outages keep owned
  searches running until confirmation. Retrying after restart never renews the original work deadline.
- Equivalent keyed replay and expiry preserve the seven-day contract and organization concealment. Queues, logs,
  errors, and financial references contain no names or candidate addresses.
- Recovery can finish a nonterminal parent after a referenced child's public handle expires. Skipped rows,
  including those subject to a cooldown, remain outside the checked count and cannot produce complete coverage or a unique match.

## Validation

Add the exact focused suites below. The new `test:email-finding-postgres` command and
`scripts/testing/email-finding-postgres.ts` do not exist at authoring time; this PR must add them. Reuse the ownership
checks from `scripts/testing/credits-postgres.ts` with `docker/compose.email-finding-test.yaml`, an isolated
`email_finding_test` database, private `.dev/email-finding-postgres/stack.json` metadata, and a checkout-derived
Compose project. Reject external database substitution, skipped suites, zero tests, and unrelated containers.

```bash
corepack pnpm test -- src/libs/modules/email-verification/src/application/finding/email-finding.service.spec.ts src/libs/modules/email-verification/src/application/finding/finding-result-classifier.spec.ts src/libs/modules/email-verification/src/application/finding/finding-recovery.service.spec.ts src/libs/modules/email-verification/src/infrastructure/queues/email-finding/email-finding-composition.integration.spec.ts scripts/testing/email-finding-postgres.spec.ts --runInBand
corepack pnpm test:email-finding-postgres
corepack pnpm test:verification-billing-postgres
corepack pnpm test:credits-postgres
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md docs/privacy/email-verification-processing-contract.md .agents/plans/email-finding/02-run-durable-email-finding.md
```

Real PostgreSQL tests cover constraints, permit consumption, concurrent cursor transitions, balance races, and crash
recovery with real verification/credit adapters. Use injected clocks and fake outbound ports for deterministic
deadline, cooldown, and provider-dispatch assertions; add a local TLS-server case proving actual abort. Validate the
new Compose file with `docker compose -f docker/compose.email-finding-test.yaml config` through the runner's private
test-password environment. Bruno: not applicable — this PR exposes only an internal capability; Plan 03 supplies
the distinct HTTP workflow and runtime fixtures. Record unavailable runtime checks explicitly.

## Idempotence and Recovery

Reuse root, candidate, execution, and financial identities after every uncertain outcome. Recover from durable
records rather than an absent queue job; settle existing capture intentions without SMTP replay. Never replace an
ambiguous child admission with a new UUID, renew its deadline, or release another payer's execution.

Use TypeORM synchronization only against disposable test data; add no migrations or backfills. For incompatible
application schema reset, run `corepack pnpm dev:reset -- --confirm-project=LEF` only when its ownership checks confirm
this checkout owns the stack; the script resets and reseeds development identities/customers. Otherwise, use the
isolated runner. Test-stack cleanup must use the project recorded in its private metadata and only its Compose file.

## Artifacts and Notes

Pricing follows the existing verification-billing road map, including charges for negative candidates; this is the
concrete policy to implement. The user can revise that policy before implementation by updating the affected plans.
This plan does not activate HTTP routes, claim provider-runtime acceptance, or complete privacy retention work.
The repository PostgreSQL skill informed short transactions, partial indexes, and indexed foreign keys.

## Plan readiness

Ready to implement
