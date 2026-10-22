# Process California DROP Deletion Requests When Legally Required

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Conditionally connect a covered LeadEmailFinder data-broker operation to California's Delete Request and Opt-Out
Platform (DROP) without inventing an Agency protocol. After this change, an operator can observe access sessions
completed within the 45-calendar-day limit, Agency-required normalization and hashing, and durable deletion or
prospective no-match handling. The following session reports every request from the prior session by using only the
four response codes prescribed by `11 CCR` section 7614.

The integration uses the internal erase-and-suppress workflow from plan 20 for deletion that is actually within the
covered scope of LeadEmailFinder. It also maintains the regulated minimum information needed for ongoing compliance,
including prospective comparison of newly collected records against requests that initially did not match. No
implementation begins unless privacy counsel confirms that the business is a covered California data broker,
identifies the applicable legal entity, records, exemptions, service providers, and contractors, and approves the
Agency's authoritative technical contract.

## Progress

- [ ] (2026-08-30) Record counsel's written coverage and scope determination and the versioned Agency contract.
- [ ] (2026-08-30) Model access sessions, exact response codes, normalization, hashing, and prospective matching.
- [ ] (2026-08-30) Implement deadline scheduling, automated exchange when supported, and the mandatory manual
      fallback.
- [ ] (2026-08-30) Reuse internal erasure, add regulated suppression/list retention, and report every prior-session
      transaction truthfully, including the official cancellation/amendment treatment.
- [ ] (2026-08-30) Complete contract, deadline, failure, runtime, Bruno-regression, documentation, and full
      validation.

## Plan dependencies

- `privacy-compliance/20`
- `privacy-compliance/24`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Treat this plan as conditional and do not infer data-broker status from the product's name or
  email-finder functionality.
  Rationale: Coverage depends on the business's actual collection, direct relationship, sale, sharing, and
  exemption facts. Engineering cannot make that legal determination from repository code.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Treat the approved final text of `11 CCR` sections 7612 through 7614 as the semantic contract. Require the
  Agency's current technical instructions for authentication, file exchange, API exchange, wire fields, hashing metadata,
  receipts, and error handling before implementing a transport adapter.
  Rationale: The regulation fixes behavior and response meanings but does not define an endpoint or complete machine
  schema. Announcement summaries are not an implementation contract.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Run a local scheduler check every 24 hours, target a remote or manual DROP access session 30 calendar
  days after the preceding successful session, and treat 45 calendar days as a non-configurable legal maximum.
  Rationale: Section 7612(a) requires access at least once every 45 calendar days. A 30-day target leaves recovery
  time without turning every scheduler tick into an access session and thereby shortening the period available to
  process the previous session's requests.
  Date/Author: 2026-08-30, Codex planning.
- Decision: At every access after the first, account for every deletion request received in the previous access
  session. Use only `Record deleted`, `Record opted out of sale`, `Record exempted`, or `Record not found`.
  Rationale: Section 7614 requires prior-session reporting and defines those four response codes. It does not define
  denied, partial, pending, retryable, or terminal wire statuses.
  Date/Author: 2026-08-30, Codex planning.
- Decision: A request whose internal erasure is incomplete remains in an internal
  `operator_action_required` state but is never omitted from the prior-session coverage check and is never mapped
  to a fabricated external status. The unattended exchange stops before a new download, alerts counsel and the DROP
  account owner, and invokes the manual runbook so the request is completed or otherwise truthfully classified and
  the statutory session occurs before the 45-day deadline.
  Rationale: None of the four prescribed codes truthfully describes a matched record whose required deletion is
  still incomplete. Internal failure cannot excuse omission or false reporting at the next session.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Implement the standardization and matching steps in section 7613 exactly, then use the hashing algorithm and
  combination procedure supplied with the Agency deletion list. Do not substitute the application's existing HMAC
  fingerprint for the Agency comparison.
  Rationale: Internal fingerprints protect application indexes; they are not evidence of a DROP match and may not
  use the Agency-provided algorithm or input construction.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Translate an unambiguous match that requires deletion into the internal command from plan 20,
  `erase_and_suppress` command, extend that workflow to covered service providers and contractors, and retain only
  the minimum compliance information allowed by section 7613(b)(1)(B).
  Rationale: One deletion engine should coordinate PostgreSQL, Redis, S3, subprocessors, retries, and audit evidence,
  while regulated ongoing-compliance state must not be used for another purpose.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve an encrypted, access-controlled no-match list for prospective comparison as required by
  section 7613(c), and report a later match's changed status in the next access session.
  Rationale: `Record not found` is not a terminal permission to ignore the request when matching information is
  acquired later.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Treat an official amendment or cancellation as a versioned transition on the existing Agency transaction,
  using only the identity, ordering, wire, and reporting semantics supplied by the authoritative technical contract.
  A cancellation removes prospective-match/minimum-compliance state when that contract requires, withdraws only the
  DROP-originated continuing suppression when legally required, and never restores deleted data or removes an
  independently justified disposition.
  Rationale: The final regulation recognizes later cancellation, but sections 7612 through 7614 do not provide a
  complete cancellation wire/state machine or a fifth response code. Engineering must serialize cancellation with
  matching/erasure without inventing external semantics.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use the Agency transaction identifier and other immutable identity fields defined by the official
  contract as the durable idempotency boundary. Keep raw identifiers encrypted and use an internal keyed
  correlation value in logs and queues.
  Rationale: Re-downloaded or retried artifacts must converge without exposing consumer information or duplicating
  deletion effects, but engineering must not guess whether identifiers are globally unique.
  Date/Author: 2026-08-30, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The California Privacy Protection Agency's
[approved final regulations text](https://cppa.ca.gov/regulations/pdf/drop_ftr.pdf), effective January 1, 2026,
controls this plan. The Agency's
[completed DROP regulations page](https://cppa.ca.gov/regulations/drop.html) confirms that the Office of
Administrative Law approved the text and links the official regulatory record. The Agency's
[data-broker information page](https://cppa.ca.gov/data_brokers/index.html) states that covered brokers begin
processing DROP requests on August 1, 2026. These are the only external legal sources used by this plan.

Section 7612 requires a covered data broker to access DROP and download its selected consumer deletion lists at
least once every 45 calendar days. Access may be manual or automated in formats supported by DROP. If an automated
process cannot download the lists on time for any reason, the broker must manually download them. If the automated
connection failure is not the broker's error, the broker must also notify the Agency in writing through its DROP
account within 45 calendar days of the last access. The first download is complete; later downloads contain new or
amended requests. A complete re-download is available only after a written request through the DROP account for the
regulation's stated reconciliation, compliance, or audit purposes.

Section 7613 requires comparison between each deletion list and applicable personal information in the broker's
records. Before comparison, the broker standardizes its records. It lowercases letters and removes extraneous or
special characters subject to the non-English-character and email-address rules. It formats a date of birth as
`YYYYMMDD`, uses the first five ZIP-code characters, and uses the last ten phone-number digits without dashes or a
country code. It also applies any other known standardization that increases match likelihood. It then uses the same hashing algorithm
provided in the consumer deletion list. For a list with multiple identifiers, each applicable identifier is hashed,
the hashes are concatenated without spaces or other characters, and that combined identifier is hashed again using
the supplied algorithm.

For an unambiguous match, section 7613 requires deletion of associated personal information, including covered
inferences, subject to the statute's exemptions and first-party rule. It also requires direction to service
providers and contractors to delete covered information. If one identifier is associated with multiple consumers
and the broker cannot verify which consumer submitted the request, the broker opts every associated consumer out of
sale or sharing rather than treating the request as an unambiguous deletion. For a request that does not match,
section 7613(c) requires the broker to save and maintain the deletion list solely to compare newly collected records
before new personal information is sold or shared, unless the consumer later cancels the request.

Section 7614 requires each access session after the first to report the status of every deletion request received in
the previous session. A later match following an earlier `Record not found` must be reported at the next session.
The only response codes are `Record deleted`, `Record opted out of sale`, `Record exempted`, and
`Record not found`. A manual session reports before downloading new lists and uploads a machine-readable CSV in
the downloaded list's format with response codes added. The exact automated exchange still depends on the Agency's
technical contract.

Privacy plan 20 adds the authenticated internal `erase_and_suppress` disposition command, request idempotency,
subject-resource deletion/rewrite, persistent suppression, withdrawal, truthful store checkpoints, and plan-15 restore
replay on top of the stable plan-08 identity/write gate. This plan adds a conditional DROP application workflow and
infrastructure adapters around that internal contract. It must not call the plan-20 HTTP controller, mint a customer
credential, or bypass the privacy-request state machine.

Privacy plan 24 is the other mandatory prerequisite. It owns the covered legal-entity determination, truthful
registration evidence, authorized DROP account/access controls, selected deletion-list scope, unauthorized-use notice
path, purpose/security limits, and cessation/deactivation procedure. This plan consumes those exact approved account
and list IDs and cannot create, repair, broaden, or deactivate the Agency account as part of request processing.

Before work starts, counsel and the designated DROP account owner must supply a written coverage determination. They
must identify the covered legal entity, record categories, sale activities, sharing activities, exemptions, first-party
boundaries, service providers, and contractors. They must also supply the account's selected deletion lists and an
approved copy of the Agency's current technical instructions. Those instructions must resolve authentication,
automated and manual exchange formats, hashing metadata, transaction identity, uniqueness, amendments, cancellations, acknowledgments, receipts,
rate limits, connection-failure notification, test facilities, and evidence retention.

## Scope and Non-Goals

If and only if coverage is confirmed, this pull request adds internal DROP domain types and ports. It adds an adapter
for the Agency-supported automated mechanism if one is supplied, a mandatory manual import/export fallback, encrypted
access-session and list state, and a daily deadline evaluator with 30-day access targets. It also adds Agency-defined
matching, translation into internal deletion and suppression, four-code status reporting, reconciliation, alerts,
tests, and operator documentation. Reuse disposition stores and erasure semantics from plan 20 rather than creating a second deletion
engine.

Do not determine legal coverage, register the company, pay fees, select legal exemptions or lists, or invent a DROP
endpoint or payload. Do not contact a consumer to verify a DROP request, build a consumer-facing DROP site, submit
requests for consumers, or implement unrelated data-broker registration, audit, or disclosure work. Do not add an
endpoint exposed publicly by LeadEmailFinder, a TypeORM migration, historical backfill, production rollout, or real
Agency credential to the repository.

## Plan of Work

Attach counsel's decision and the version of the official technical instructions to the implementation evidence.
Create sanitized fixtures only from Agency-supplied formats. The fixtures must cover the initial complete download,
a subsequent new-or-amended download, cancellation representation, amendment representation, every fixed response code, manual
CSV exchange, automated failure, and receipts without containing a real consumer identifier or credential.

Under `src/libs/modules/email-verification/src/application/privacy/drop/`, add one
`SynchronizeDropAccessSession` use case and narrow ports for an access-session repository, official list exchange,
matching inputs, plan-20 privacy dispositions, covered service-provider deletion, and operational alerts. The
application layer accepts domain records and official response-code meanings. It must not import an HTTP SDK,
BullMQ, TypeORM, the Agency's generated client, or transport DTOs.

Implement a pure standardization and comparison component from section 7613. It lowercases applicable values and
applies each category-specific rule before hashing. It preserves the special characters in an email address as
required rather than applying the generic special-character removal rule. It uses the hashing algorithm and
multiple-identifier composition metadata supplied with the list and produces a fail-closed result for an unsupported or missing
algorithm. Keep the plan-08 HMAC lookup ring separate and use it only for internal identity lookup and safe
correlation.

Under `src/libs/modules/email-verification/src/infrastructure/privacy/drop/`, implement the supplied automated
transport only after the official contract is available. In the same boundary, implement an operator-driven manual
adapter for ingesting a manually downloaded official file and producing the same-format status CSV required by
section 7614(c). Validate file origin, structure, list selection, access-session identity, transaction coverage, and
digest before accepting either path. Encrypt exact transaction and list data at rest and restrict its use to DROP
compliance.

Persist a first-class access-session state machine. The first session has no prior report and records each selected
complete list. Every later session builds a coverage set containing every transaction from the immediately prior
session and resolves one exact response code for each transaction. It stores report acknowledgment evidence where the
official mechanism supplies it and then records the new or amended lists. For manual access, the operator
must upload the prior-session status CSV before downloading the new lists. For automated access, preserve the
equivalent ordering and acknowledgment semantics from the official contract rather than guessing them.

Persist every official amendment/cancellation as a monotonically ordered revision of the same transaction using the
identity and ordering rule from the approved technical contract. Matching, prospective comparison, plan-20 submission,
suppression finalization, withdrawal, and external reporting all compare the captured transaction revision. If
cancellation wins first, stale matching or erasure dispatch cannot start. If matching or plan-20 erasure already owns
work, the cancellation transition records `cancellation_reconciling`, waits for the authoritative internal outcome,
and applies the exact Agency/counsel-approved follow-up rather than pretending deleted data can be restored.

When the official contract requires cancellation to end prospective comparison or minimum retained compliance state,
delete those exact records after their reporting/evidence boundary is satisfied. When counsel and the contract require
the continuing DROP-originated suppression to end, invoke the internal withdrawal from plan 20 with a deterministic
cancellation identity. Never withdraw an independently submitted customer disposition, legal hold, or other continuing
restriction. Preserve the transaction in prior-session coverage and report it only through the official amendment/
cancellation mechanism and four-code rules; if the approved contract cannot classify a race truthfully, stop unattended
exchange in `operator_action_required` instead of inventing a fifth status.

Register one `california-drop-deadline` BullMQ job that evaluates the account every 24 hours while the feature is
enabled. It does not access DROP every day. It opens an access session at 30 calendar days after the last confirmed
session, or at the earlier counsel-approved first-access target, and retries failed automation while sufficient time
remains. Emit warning and critical alerts based on the actual `lastConfirmedAccessAt + 45 calendar days` deadline.
The 45-day maximum is a domain constant and cannot be extended by configuration. Use a lease so concurrent job
delivery cannot open competing sessions.

If automated access cannot complete in time for any reason, create an operator task and follow the manual download path
in section 7612(b). When the automated connection failure was not caused by LeadEmailFinder or its operator, the
runbook also requires written notice through the DROP account within 45 calendar days after the last access. Store
only a redacted acknowledgment that the notice was sent. Automation must never treat an API retry loop as a
substitute for the required manual download.

For each official list record, compare only against data within the legal entity and record scope approved by
counsel. An unambiguous match invokes the internal `erase_and_suppress` command from plan 20 with a deterministic DROP
idempotency key and directs every in-scope service provider and contractor to delete. Do not resolve the transaction
to `Record deleted` until the required internal and downstream work has the evidence needed for that code. Retain
only the minimum information necessary for continuing compliance, and never use it for verification, enrichment,
sale, or sharing.

When the same identifier is associated with multiple consumers and the requesting consumer cannot be verified,
apply the required sale-or-sharing opt-out to all associated consumers and use `Record opted out of sale`. When
all information for a matched consumer is exempt and nothing is deleted, use `Record exempted`. After the complete
required comparison finds no match, use `Record not found`, retain the encrypted no-match compliance list, and
compare each newly collected in-scope record before sale or sharing. If a later comparison matches, perform the
required action and report the changed code in the next access session.

Build the status-report decision table from the regulation:

- `Record deleted`: the identifier matched and all personal information required by section 7613(b) was deleted.
- `Record opted out of sale`: multiple consumers matched the identifier, the request could not be verified to one
  consumer, and all associated consumers' information was opted out of sale or sharing.
- `Record exempted`: the identifier matched, all associated information was exempt under the cited statute, and no
  personal information was deleted.
- `Record not found`: the required standardized and hashed comparison found no match.

No other value may cross the DROP adapter. Before every subsequent session, compare the report's transaction set
with the persisted prior-session set and reject missing, duplicate, or extra records. If a matched request is still
erasing, retain its internal retry state, mark the session `operator_action_required`, and alert counsel and the
DROP owner. The runbook must drive completion or obtain authoritative Agency direction and still submit a complete,
truthful report and access the lists before the deadline; it may not invent `pending`, `partial`, `denied`,
`retryable`, or an empty response.

Add privacy-safe metrics for last confirmed access, target deadlines, hard deadlines, prior-session transaction coverage,
matching outcomes, internal erasure age, manual-fallback state, report acknowledgment, and sanitized error class.
Logs contain only an HMAC-derived correlation value, never a raw Agency transaction identifier, consumer identifier,
list contents, authentication header, or response body.

Update `src/libs/modules/email-verification/README.md` and the privacy road map with activation, account ownership,
initial access deadlines, recurring access deadlines, fixed response meanings, matching and retention boundaries, credential
rotation, manual report-before-download steps, Agency-notification steps, reconciliation, and deactivation. The
implementation remains disabled by default and is not deployed from this pull request.

## Interfaces and Dependencies

The only external response-code values are:

    type DropResponseCode =
        | 'Record deleted'
        | 'Record opted out of sale'
        | 'Record exempted'
        | 'Record not found'

The application owns transport-neutral concepts equivalent to `DropAccessSession`, `DropDeletionRequest`,
`DropTransactionRevision`, `DropPriorSessionReport`, `DropReportDecision`, `DropListArtifact`, and
`DropAccessDeadline`. The
infrastructure boundary supplies one official-exchange adapter and one manual file adapter. Their exact methods and
DTOs must be derived from the Agency contract; this plan deliberately does not name an external base URL, endpoint,
credential field, pagination shape, or acknowledgment schema.

The session repository enforces one active session per DROP account, a unique official transaction identity using
the contract's stated uniqueness scope, immutable artifact digests, exact prior-session coverage, and replay-safe
report receipts. The `SynchronizeDropAccessSession` use case calls the internal privacy-request contracts from plan 20 for
submission/status contracts directly and never calls `/privacy/verification-requests` over HTTP.

Application-owned settings are limited to:

    CALIFORNIA_DROP_ENABLED=false
    CALIFORNIA_DROP_TARGET_ACCESS_DAYS=30
    CALIFORNIA_DROP_SCHEDULER_INTERVAL_HOURS=24

The 45-calendar-day maximum is not configurable. The external URL, account identifiers, list identifiers, credential fields,
scopes, file locations, Agency-notification mechanism, and receipt fields remain blocked on the official contract
and counsel-approved operator procedure. Secrets must be file-backed where supported and validated at startup only
when the feature is enabled.

Reuse Node and Nest HTTP facilities or an official generated client only after evaluating the supplied contract,
plus existing TypeORM, BullMQ, configuration, crypto, and plan-20 privacy application dependencies. Do not select a
new package in advance. Because the repository has no production environment, use TypeORM synchronization only
against disposable development data and add no migration.

## Acceptance Criteria

- The feature cannot start without explicit enablement, complete validated Agency configuration, a recorded
  coverage decision, and the counsel-approved legal-entity, record, exemption, and subprocessor scope.
- A daily scheduler check opens no unnecessary daily access session, targets access at day 30, derives the hard
  deadline as 45 calendar days after the last confirmed access, and cannot configure a later deadline.
- The first access stores complete selected lists; later accesses store only the official new or amended lists
  unless an authorized complete re-download was requested through the DROP account.
- When automation cannot timely download for any reason, the operator can complete the same session manually. A
  non-broker-caused automated connection failure also produces the required written Agency-notification task before
  45 calendar days elapse.
- Standardization covers every applicable section 7613 rule, email-address characters are not stripped by the
  generic rule, and matching uses the exact list-supplied hashing and multi-identifier construction.
- Replaying the same Agency transaction or artifact produces one internal privacy request and one logical deletion
  or opt-out effect.
- An unambiguous covered match deletes required personal information and inferences across LeadEmailFinder and
  in-scope service providers or contractors before it maps to `Record deleted`.
- A multi-consumer ambiguous match, wholly exempt match, and complete no-match comparison map respectively to
  `Record opted out of sale`, `Record exempted`, and `Record not found` under the regulation's conditions.
- Every session after the first reports every transaction from the previous session with exactly one of the four
  allowed codes. Missing, extra, duplicate, pending, partial, denied, retryable, or blank external statuses are
  rejected.
- An internally incomplete erasure cannot disappear from the next report or become false success. It stops
  unattended exchange, escalates early enough for manual resolution, and remains subject to the same 45-day access
  deadline.
- A no-match request remains in the encrypted prospective-comparison set, blocks sale or sharing of later matching
  information until the required action completes, and reports a later status change at the following session.
- An official amendment/cancellation replays as one ordered transition on the existing transaction. It removes
  prospective-match/minimum-compliance state and withdraws only a DROP-originated continuing suppression when the
  approved contract and counsel require; it never restores deleted data or clears an independent disposition.
- Cancellation-first, match-first, erasure-first, and simultaneous races compare the official revision, converge on one
  internal effect/withdrawal, preserve prior-session coverage, and use only the Agency-approved reporting treatment.
  A race that cannot be classified remains `operator_action_required` rather than emitting a fabricated response code.
- Exact DROP identifiers are encrypted while legally needed and are absent from BullMQ payloads, terminal
  application state, normal logs, metrics labels, and committed fixtures. Retained compliance data is not reused for
  another purpose.
- A crash or PostgreSQL, Redis, S3, automated-exchange, manual-import, erasure, downstream-deletion, or
  report-acknowledgment failure preserves the last Agency-confirmed boundary, retries without duplicate effects,
  and never records a false completed access.
- Contract, normalization, hashing, fixed-code, session-coverage, deadline, manual-fallback, idempotency, privacy,
  full, architecture, build, documentation, and existing privacy Bruno regression checks pass.

## Validation

After the authoritative technical contract exists, run pure application, adapter-contract, scheduler, persistence,
failure, and privacy tests:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/application/privacy/drop src/libs/modules/email-verification/src/infrastructure/privacy/drop --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_drop_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- california-drop-sync.integration.spec.ts --runInBand

Contract fixtures must simulate an initial complete artifact, a later new-or-amended artifact, an authorized full
re-download, duplicate delivery, cancellation, amendment, and all standardization categories. They must also simulate
Agency-supplied single- and multi-identifier hashing, one unambiguous match, one multi-consumer match, one wholly exempt
match, one no-match followed by a later match, and all four exact response codes. A negative test must prove that a fifth code,
wrong capitalization, missing prior transaction, extra transaction, or incomplete internal erasure cannot be
uploaded.

Run cancellation/amendment tests from every persisted boundary: before comparison, after no-match retention, during
prospective matching, before and after plan-20 submission, during erasure, after deletion, before suppression
finalization, after suppression, during withdrawal, and before/after prior-session report acknowledgment. Prove exact
revision compare-and-set, idempotent replay, required removal of prospective/minimum state, and scoped withdrawal of
only the DROP-originated disposition. Also prove non-restoration of deleted data, preservation of independent
dispositions, complete report coverage, and fail-closed operator handling when the official contract cannot classify an
injected state.

A fake clock must prove that the daily scheduler does not access DROP daily, targets day 30, retries safely, alerts
before the hard deadline, and never treats a time after `lastConfirmedAccessAt + 45 calendar days` as compliant.
Failure tests must cover automated authentication or connection failure, a failure caused outside LeadEmailFinder, and
the written-notification task. They must also cover manual status CSV generation before manual download,
digest-verified manual import, mid-artifact interruption, report acknowledgment loss, and restart from each persisted
session state.

If the Agency contract includes a sandbox, perform one authorized non-production automated session and one complete
manual fallback session using synthetic Agency-approved identifiers. Verify the prior-session report receipt and
download receipt through the documented operator procedure. Never point an automated test at production DROP or use
a real consumer request.

Run `bruno/privacy-requests` against an owned, reset local stack to prove that the internal action reused by DROP
still passes its access, erasure, suppression, and ownership contracts:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer

Return to the repository root and finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    git diff --check

Bruno: do not encode Agency credentials or production DROP calls in Bruno. Rerun `bruno/privacy-requests` because
the DROP workflow reuses its internal erase-and-suppress operation. Prove the external protocol with official
contract fixtures, the authorized sandbox if supplied, and the documented manual workflow.

## Idempotence and Recovery

Persist and authenticate an official artifact before submitting internal work. Derive the idempotency key only from
immutable transaction fields whose uniqueness scope is defined by the Agency contract. A session state machine
records at least artifact accepted, prior report prepared, report acknowledged when applicable, download persisted,
matching dispatched, and access confirmed. Advance only at a boundary for which the official mechanism or manual
operator evidence can distinguish success from failure.

Repeating normalization, matching, internal submission, erasure polling, status-file generation, or manual import
converges on the same transaction link and effect. Replaying an acknowledged report does not create a new internal
result. If the automated contract does not make report submission idempotent, reconcile its official receipt before
retrying rather than guessing. A manual report and download use immutable file digests so the same files can be
reprocessed safely.

On an interrupted automated exchange, resume from the last Agency-confirmed contract boundary. On internal erasure
failure, continue the retry and reconciliation from plan 20 while escalating the affected prior-session transaction; do not
remove it from coverage. On a report failure, preserve the decisions and replay only as the official receipt rules
allow. On a download failure, perform the mandatory manual download in time. When the connection failure was not
the broker's error, preserve a redacted notification task and acknowledgment.

An amendment/cancellation advances one official transaction revision. Replaying the same revision is a no-op; an older
revision is stale; conflicting payload for one revision is rejected. Matching, erasure submission, suppression,
withdrawal, and reporting compare the captured revision before final effects. If deletion already completed, recovery
records that irreversible fact and applies only the contract-required prospective-state removal or scoped withdrawal;
it never attempts to reconstruct the deleted record. Unknown ordering or receipt state remains operator-controlled.

Development recovery may reset synthetic PostgreSQL, Redis, and S3 state only after confirming Compose ownership.
Real DROP artifacts, prospective no-match lists, session receipts, notification evidence, account state, and
requests are not disposable. Their deletion, cancellation, full re-download, or account deactivation follows the
official rules and counsel-approved operator procedure, never an ad hoc command.

## Artifacts and Notes

Record counsel's signed coverage and scope reference, the approved final-text and technical-contract versions, selected
list categories without consumer contents, and the sanitized fixture version. Record access-target and deadline
evidence, the manual-fallback rehearsal, prior-session coverage counts, four-code totals, and redacted report and
download receipts. Also record the Agency-notification acknowledgment where applicable, focused/integration totals,
sandbox evidence, and privacy Bruno totals. Never record credentials, authentication headers, exact transaction or consumer identifiers, deletion
list contents, or production response bodies.

## Plan readiness

Ready after privacy counsel determines that LeadEmailFinder is a covered California data broker and supplies the
Agency's current DROP technical contract and covered-record scope.
