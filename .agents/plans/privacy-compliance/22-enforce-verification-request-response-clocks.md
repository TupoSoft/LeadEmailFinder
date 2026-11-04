# Enforce Contract Response Clocks and Support Workflows

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make every organization-submitted verification privacy request carry the exact response rule promised by the
applicable customer contract. After this change, the request state shared by plans 20, 21, and 31 records a versioned
`dueAt`, permitted extension and notice, warning/overdue/manual/escalation state, and typed dispute, appeal, and
escalation events. Customers and authorized privacy operators can see and act on those states without creating a
second request or repeating an already completed deletion, correction, or export.

No GDPR, CCPA, or other statutory period becomes a universal runtime default. The approved customer terms from plan 10
supply the rule ID, trigger, duration/calendar semantics, extensions, notice channel/timing, support path, and owners.
Missing, ambiguous, or unsupported contract rules reject intake or fail application start rather than substituting a plausible
number.

This is the first plan allowed to activate the previously concealed verification privacy HTTP surface, and only in a
configuration whose complete admission manifest passes. It supplies `verification.response-admission.v1`, captures the
entire immutable rule/deadline snapshot in a prepared intake, appends and verifies the matching plan-33 admission event,
and only then accepts the request and permits job/controller behavior. The committed default remains off.

## Progress

- [ ] (2026-08-30) Add a strict executable response-rule projection from plan 10 and exact startup/intake validation.
- [ ] (2026-08-30) Append and verify admission plus response/clock/support lifecycle events through plan 33 before
      accepted or terminal local state.
- [ ] (2026-08-30) Add `verification.response-admission.v1` and permit first disposable activation only after complete
      action/rule/adapter validation.
- [ ] (2026-08-30) Extend the shared verification request aggregate with immutable `dueAt`, extension/notice,
      warning, overdue, manual-action, and escalation state.
- [ ] (2026-08-30) Add customer dispute/appeal/escalation events and human privacy-operator operations on the same
      request.
- [ ] (2026-08-30) Add the least-privilege operator status endpoint with exact human-session platform-admin and
      `privacy:admin` authorization.
- [ ] (2026-08-30) Add the deadline scheduler, contract-selected notice adapters, alerts, and retry/idempotency.
- [ ] (2026-08-30) Extend status/Bruno documentation and prove different contract rules without a universal fallback.
- [ ] (2026-08-30) Complete focused, policy, authorization, scheduler, notice, concurrency, runtime, full, build, and
      documentation validation.

## Plan dependencies

- `privacy-compliance/10`
- `privacy-compliance/20`
- `privacy-compliance/21`
- `privacy-compliance/31`
- `privacy-compliance/33`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Compute and persist `dueAt` from the exact response-rule version effective when the request is accepted.
  Never apply a global GDPR, California, calendar-month, or business-day default.
  Rationale: LeadEmailFinder's processor assistance obligation comes from the applicable customer terms and action
  routing; law, role, jurisdiction, contract, action, exception, and customer obligations can differ.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep technical processing state, response-clock state, and support/review state as separate projections on
  one request ID.
  Rationale: An overdue request can still be technically running, and a completed technical effect can still be under
  appeal; neither state should overwrite or falsify the other.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Capture the contract/policy/rule version, trigger time, calendar semantics, original due time, warning
  offsets, extension rules, notice requirements, support rules, and escalation owners at intake.
  Rationale: A later contract revision must not silently shorten, extend, or reinterpret an accepted request.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Register `verification.response-admission.v1` and make its successful snapshot write a mandatory part of
  intake. `VERIFICATION_PRIVACY_ENABLED=true` is valid only when startup proves exact coverage for every plan-20/21/31
  action plus all selected calendar, notice, support, and owner adapters; otherwise startup fails before controllers
  register. Keep the committed default false.
  Rationale: Plans 20, 21, and 31 deliberately cannot expose an accepted request without a response commitment. One
  atomic admission boundary prevents a request/job from existing without its exact deadline contract.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Create the local request-admission preparation state, append and strongly verify one minimal
  `verification.request-control.v1` admission event through plan 33, and then compare-and-set the request to accepted
  before job publication or an accepted response. Apply the same authority-first ordering to terminal response, clock,
  extension/notice, manual, dispute, appeal, escalation, and resolution transitions.
  Rationale: An accepted request and its captured deadline/support state can disappear in an older PostgreSQL restore.
  The nonterminal preparation state plus deterministic same-event retry preserves the request without reporting success during authority
  failure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Register `verification.request-control.v1` as a plan-15/plan-33 restore consumer. Rebuild a missing post-
  capture request from pseudonymous aliases and the immutable rule/deadline event. If the restored snapshot lacks
  required resumable values and no later technical outcome resolves the request, preserve it as manual and alert the
  captured owner instead of dropping or fabricating fulfillment.
  Rationale: Recovery must preserve an accepted request and clock even when data minimization prevents the external
  authority from retaining the original plaintext payload.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Return `503` for a required plan-33 append/acknowledgment that is unavailable, ambiguous, or stale-fenced.
  Do not expose the prepared transition as accepted or terminal; identical idempotency retry resumes it.
  Rationale: This plan owns first activation of the verification privacy HTTP surface, and infrastructure uncertainty is
  neither a policy rejection (`422`) nor a conflict over idempotency or state (`409`).
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Grant an extension only when the captured rule allows the typed reason and duration, and require the
  approved notice to be delivered or placed by its own captured deadline. An extension never changes the original
  due time in history.
  Rationale: An editable deadline field cannot prove whether an extension and notice were timely and authorized.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Mark warning, overdue, notice failure, exhausted retry, and ambiguous adapter work as typed events. Overdue
  or manual state alerts the captured owner and never converts technical processing to complete.
  Rationale: Operational urgency must be visible without fabricating fulfillment.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Let an owned customer principal with `verification-privacy:manage` submit only typed `dispute`, `appeal`, or
  `escalation` events with allowlisted reason codes and non-secret evidence references. Do not accept free-form legal
  narratives or a new subject-search field.
  Rationale: Support belongs to the existing request while sensitive correspondence remains in the approved support
  system.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Reserve `privacy:operate` operations for an authenticated active `human_session` platform administrator.
  Service clients cannot grant extensions, record notices, resume manual work, or resolve an appeal.
  Rationale: Cross-customer deadline and review operations require an interactive accountable human boundary.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add a separate human-only `privacy:admin` permission for the cross-organization operator read endpoint.
  Require the conjunction `credentialKind=human_session`, `membershipRole=platform_admin`, and effective
  `privacy:admin`; reject service-client assignment at credential creation/update. Other human roles do not receive it.
  Rationale: Customer `verification-privacy:manage` authority is organization-bound and must not imply platform-wide
  visibility. Read-only operations need a narrower permission than mutation while remaining accountable to one
  interactive platform administrator.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Deliver an extension/support notice only through the exact channel/adapter selected by plan 10. A missing
  registration or ambiguous acknowledgment causes a fail-closed result; repository code does not invent an email provider or treat
  a log entry as delivery.
  Rationale: Contract-required notice needs channel-specific evidence and ownership.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use one singleton BullMQ evaluator with an injected clock, deterministic event IDs, bounded pages, and
  request IDs only in jobs.
  Rationale: The repository already uses BullMQ, and deterministic events make scheduler replay safe without exposing
  subject data.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Use TypeORM synchronization against disposable development data and add no migration, backfill, production
  activation, or production support-system rollout.
  Rationale: The repository has no production environment.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 20 creates the authenticated organization-owned request aggregate for destructive/restrictive actions; plan 21
adds access/export lifecycle; and plan 31 adds dual-subject correction. The aggregate already has immutable
request/action/policy IDs,
organization/subject ownership, technical states/checkpoints, receipts, idempotency, retry, and plan-12-approved
controller evidence. This plan adds clock and support fields to that same aggregate and routes all actions through one
deadline policy at intake. Plan 33 supplies the independently durable ordered event authority, backup included
watermark, restore target/fence, alias-key versions, and sealed minimum selector used to recover a missing request
projection without storing a raw address.

Plan 10 owns the customer data-processing terms and assent evidence. Its approved contract rule—not product branding or
the caller's submitted country—must define how processor-assistance response time is measured. A “response clock” is an
operational contractual commitment. It is not a legal conclusion that a particular statute applies, and reaching a
deadline does not prove the underlying data action complete.

An “extension notice” is a durable typed event plus the acknowledgment required by the selected contract channel. An
“overdue” event records that effective due time passed while the required response remained incomplete. A “manual
action” event records that bounded automation exhausted or found ambiguity. A “dispute” or “appeal” opens support review
on the existing receipt; it does not create another data mutation.

## Scope and Non-Goals

Add versioned response-rule configuration, strict validation, mandatory atomic admission snapshots, and
`verification.response-admission.v1`. Also add the first validated disposable activation, persisted clock and support
projections and events, human-only `privacy:admin` and `privacy:operate`, customer support-event intake, and
least-privilege operator status. Add operator operations, a singleton deadline evaluator, contract-selected notice and
alert ports, plan-33 request-control events, `verification.request-control.v1` restore replay, and Bruno coverage. Extend
the processing contract and module documentation with the exact separation between technical completion and response/
support state.

Cover plan-20, plan-21, and plan-31 actions uniformly. Preserve original/effective due times, extension/notice evidence,
warning/overdue/manual/escalation events, customer dispute/appeal/escalation, operator resume/extension/notice/review
transitions, and retry-safe owner alerts.

Do not change deletion/restriction/suppression/access/correction semantics, export security, subject gates, DROP
protocol, controller-account rights, plan-10 contract language, plan-12 evidence classification, or plan-15 restore
quarantine mechanics. Do not send through an unapproved channel, decide which statute applies, add a universal fallback, accept
free-form private legal material, migrate production data, deploy a production support system, or claim compliance.

## Plan of Work

Create `config/privacy/verification-response-rules.yaml` as an executable projection of the accepted customer terms from
plan 10. Each immutable rule version contains the customer-contract version, covered actions, start trigger, duration,
calendar, time-zone semantics, warning offsets, and permitted extension reasons, count, and duration. It also contains
the extension-notice deadline, selected notice channel and adapter ID, overdue, manual, and escalation rules, customer
support-event rules, operator roles, and stable owner and evidence references. It contains no customer identity, secret,
private advice, or arbitrary narrative.

Add a strict parser and checker. Reject duplicate IDs; unknown actions, events, or channels; ambiguous duration or
calendar rules; a missing time zone where needed; and negative or unordered offsets. Also reject an extension that the
contract does not authorize, missing notice acknowledgment semantics, a missing owner, pending plan-10 evidence, an
expired review, secret-looking values, and any `default`, `GDPR=30 days`, `CCPA=45 days`, or other role-agnostic or
jurisdiction-agnostic fallback. Runtime and CLI consume the same parser.

Add a strict admission-manifest compiler that enumerates every action delivered by plans 20, 21, and 31. Require
exactly one effective response rule for each enabled contract/action/time partition. Also require every selected
calendar, notice, support, alert, owner adapter, plan-33 authority, and `verification.request-control.v1` consumer
descriptor/version. Export one application capability descriptor, `verification.response-admission.v1`. With
`VERIFICATION_PRIVACY_ENABLED=false`, controllers remain unregistered and all probes keep the ordinary `404`. With
true, validate the complete manifest before module/controller registration; missing, pending, overlapping, ambiguous,
fake/non-real authority, or adapter-mismatched coverage aborts application start. This plan is the first that may set
true in an owned disposable environment; the repository default remains false.

Add `privacy:admin` and `privacy:operate` to the authentication vocabulary and to an explicit human-only permission
set. Grant both only through the fixed `platform_admin` human role; `owner`, `admin`, and `member` receive neither.
Service-client create/update validation rejects both even when the human grantor has them, and existing credentials
receive no retroactive permission changes. The operator-status use case checks the conjunction of credential kind, exact
role, and `privacy:admin` at the service boundary rather than relying on the existing any-of decorator alone. Mutating operator operations likewise
require human session, exact platform-admin role, and `privacy:operate`.

At request intake, lock the idempotency identity and resolve exactly one effective rule for organization contract,
action, and received time before any accepted request or job publication. In one database transaction, persist a hidden
`admission_prepared` request plus an immutable snapshot containing the contract version, action-policy version, response
rule ID/version, `receivedAt`, trigger, calendar, time-zone semantics, and original/effective `dueAt`. The snapshot also
contains the warning schedule, extension allowance, notice channel/acknowledgment rule, support rules, escalation owners,
every selected adapter descriptor/version, deterministic authority event ID, and versioned pseudonymous subject aliases.

Append and strongly verify the minimal plan-33 `verification_request_admitted` event. It contains request/operation ID,
organization/subject aliases, action, contract/action-policy/rule versions, captured `receivedAt`/`dueAt`, safe owner/
adapter codes, idempotency digest/key version, and an encrypted minimum selector only when recovery requires it. It
contains no raw address, correction plaintext, export content, or support narrative. Then use compare-and-set to move
the exact request from `admission_prepared` to accepted, recording event ID, sequence, digest, and authority fence. Only after this commit may the
request-ID BullMQ job publish or the API return acceptance. Date calculation is a pure domain service with an injected
clock/calendar. Missing/ambiguous rules or snapshot failure returns `422` with no request/job; conflicting idempotency
returns `409`; unavailable/ambiguous authority or a stale fence returns `503` with no accepted request/job. An identical
replay resumes the prepared state or returns the original accepted snapshot/event and never recalculates it.

Keep three explicit projections:

- Technical state from plans 20/21/31, including incomplete retry/manual checkpoints;
- Clock state `on_time | warning | extended | overdue | closed`; and
- Support state `none | disputed | appealed | escalated | under_review | resolved`.

Completion closes the clock only when the contract-required response/receipt is available, not merely when one adapter
finishes. An appeal after completion changes support state without repeating the effect or reopening the export object.
Every transition stores a deterministic event ID, request ID, rule version, typed reason, actor kind/ID where applicable,
timestamp, and non-secret acknowledgment/evidence reference. Before a transition becomes terminal or visible, reserve
its exact prior version, append and verify the corresponding `verification.request-control.v1` event through plan 33,
and record its acknowledgment in the local compare-and-set. Authority failure leaves the previous safe state plus a
nonterminal prepared/manual transition; append success followed by a local crash retries the same event.

Extend owned `GET /privacy/verification-requests/:id` with original/effective `dueAt`, rule version, warning/overdue,
extension and notice state, support state, typed events, and owner/escalation code. It never returns the subject, key
material, private support correspondence, or another organization's event.

Expose:

- `POST /v1/privacy/verification-requests/:id/support-events`, requiring the owned active principal and
  `verification-privacy:manage`, with
  `{ kind: 'dispute' | 'appeal' | 'escalation', reasonCode, evidenceReference? }`;
- `GET /v1/privacy/verification-requests/:id/operator-status`, requiring the exact conjunction active
  `human_session`, `membershipRole=platform_admin`, and effective `privacy:admin`; and
- `POST /v1/privacy/verification-requests/:id/operations`, requiring an active `human_session` platform administrator
  with `privacy:operate`, with a typed operation
  `grant_extension | record_notice | resume | escalate | resolve_support` and policy-allowed reason/evidence fields.

The operator-status response is exactly the safe operational projection. It contains the request ID, organization ID,
action, technical, clock, and support states, and received, original-due, effective-due, and updated timestamps. It also
contains the response-rule ID and version, action-policy version, safe checkpoint and status codes, extension state,
notice state, escalation owner code, and typed safe reason codes. It returns no raw address, normalized value, subject ID/fingerprint/HMAC, ciphertext, export/object key,
queue payload, provider response, private support narrative, notice body, credential, or unrestricted evidence. The
endpoint performs no mutation.

For customer routes, use `401` for missing authentication, `403` for missing permission/wrong credential state,
concealed `404` for missing/foreign resources, `409` for stale/duplicate/conflicting state, and `422` for an event or
reason not allowed by the captured rule. Use `503` when the required plan-33 append or acknowledgment is unavailable/
ambiguous, without exposing an accepted or terminal transition. For operator status, use `401` for missing/invalid authentication; `403` if
credential kind is not `human_session`, role is not `platform_admin`, or `privacy:admin` is absent; concealed `404` for
an unknown request; and `200` only with the exact safe projection. Disabled feature routes remain ordinary `404` before
auth. Customer support events cannot change organization, subject, action, policy, technical checkpoints, original due
time, or disposition.

Grant extension by locking the request, validating captured allowance/count/reason and current time, recording the
unchanged original deadline and intended new effective deadline, and reserving a deterministic required-notice event.
Append/verify the extension transition before the local effective-deadline compare-and-set. Invoke the captured plan-10-
selected notice adapter. After its contract-defined acknowledgment, append/verify the notice transition before marking
notice complete. Retry the same notice and authority identities; an unknown adapter or authority result stays
`manual_action_required`. If the notice deadline passes, append notice-overdue/escalation events without pretending the
extension disappeared or was timely.

Register one singleton `verification-privacy-deadline` BullMQ schedule. On each bounded tick it selects requests whose
next event is due, reserves deterministic warning/overdue/manual/escalation transitions, appends/verifies each plan-33
event, compare-and-sets its acknowledgment, and invokes the captured owner alert port. Queue data contains request ID
only. Two workers/ticks cannot duplicate an event or notice. Scheduler delay does not shift a deadline; a late evaluator
records the actual transition and overdue duration.

A dispute or appeal creates review state on the same request/receipt. Operator resolution records the approved outcome
and whether technical retry/resume is needed. Resume places the same request ID back on the queue and preserves completed checkpoints;
it cannot repeat a delete, debit, correction, or export claim. Customer escalation and automatic overdue/manual
escalation converge on deterministic events and the same captured owner.

Implement `VerificationRequestControlRestoreReconciler` as `verification.request-control.v1`. Consume every plan-33
event in `(backupIncludedHighWatermark, restoreTargetWatermark]` in exact order. Rebuild a request missing from the older
snapshot with its immutable request ID, action, aliases, contract/rule versions, original/effective deadline, safe owner,
and current clock/support state. If required resumable ciphertext is absent and no later technical event proves the
effect complete, preserve the request as `manual_action_required`, keep technical work closed, and alert the captured
owner; never discard it or fabricate completion. Reapply terminal response/support events without repeating data-owner
effects. Unknown event/schema/key/selector, a sequence gap, stale fence, or local version conflict keeps quarantine. The
consumer processes bounded pages and checkpoints the exact target before release.

Update `bruno/privacy-requests`, the processing contract, customer-terms implementation mapping, and module README.
Include two synthetic organizations with different rule/calendar/extension behavior so tests prove the absence of a
global duration.

## Interfaces and Dependencies

The central contracts are equivalent to:

    interface VerificationResponseAdmission {
        readonly descriptor: { id: 'verification.response-admission.v1'; version: string }
        capture(input: {
            organizationId: string
            action: VerificationPrivacyAction
            actionPolicyVersion: string
            receivedAt: Date
        }): ImmutableVerificationResponseSnapshot
    }

    interface VerificationResponseRuleResolver {
        resolve(input: {
            organizationId: string
            action: VerificationPrivacyAction
            receivedAt: Date
        }): ApprovedVerificationResponseRule
    }

    interface VerificationPrivacyNoticePort {
        readonly descriptor: { id: string; version: string }
        deliver(event: VerificationPrivacyNotice): Promise<NoticeAcknowledgement>
    }

    interface VerificationPrivacyAlertPort {
        alert(event: VerificationPrivacyAlert): Promise<AlertAcknowledgement>
    }

`ApprovedVerificationResponseRule` supplies exact contract/rule versions, start/calendar calculation, original due
time, warnings, extension/notice/support policy, and owners. It has no runtime default constructor. Notice and alert
adapters register by exact policy ID/version and are validated at startup.

Plan 10 supplies accepted terms and selected notice/support rules. Plans 20, 21, and 31 supply the shared request
aggregate, permission, all actions, technical state, evidence, and concealed controllers. This plan supplies mandatory
admission, `verification.request-control.v1`, and first activation. Plan 15 supplies restore range/checkpoint context;
plan 33 supplies append-once acknowledgments, bounded ordered events, target/fence confirmation, and external alias/
selector keys. Existing BullMQ, TypeORM, YAML/Zod, auth, and injected clock patterns are reused. No provider/package is
invented; notice/support implementation uses only the adapter named by plan 10, and authority infrastructure stays
behind plan 33.

## Acceptance Criteria

- `VERIFICATION_PRIVACY_ENABLED=false` keeps controllers unregistered. True succeeds only after the complete plan-
  20/21/31 action/rule/adapter admission manifest validates, the selected real plan-33 authority and
  `verification.request-control.v1` register, and `verification.response-admission.v1` registers; the repository default
  remains false.
- Every new plan-20/21/31 request persists a hidden request in `admission_prepared` state and immutable contract/action-policy/rule versions,
  trigger/calendar semantics, original/effective `dueAt`, warnings, extension/notice/support rules, owners, and adapter
  versions. It becomes accepted and publishes a job only after the admission event is verified and its acknowledgment
  is recorded. Authority failure leaves no accepted request/job; identical replay never recalculates the snapshot or
  creates another event.
- Any missing, pending, ambiguous, expired, or unsupported rule rejects intake or application start. No global GDPR, CCPA,
  jurisdiction, or action-duration fallback exists in configuration or runtime.
- Two synthetic organizations/actions with different rule/calendar semantics compute different exact deadlines under
  one fake clock and retain them after a policy revision.
- Technical, clock, and support states evolve independently and truthfully; warning, overdue, manual, or appeal state
  never marks data work complete or repeats a completed effect.
- An extension preserves original `dueAt`, validates captured allowance/reason/count, computes the effective deadline,
  requires its exact notice, and records only acknowledged delivery through the selected adapter.
- Missing notice delivery, an unknown delivery result, or a delivery failure leaves the request incomplete, manual, and
  escalated; no log line counts as delivery.
- The singleton scheduler emits each deterministic warning, overdue, notice, manual, and escalation event once under
  duplicate delivery/concurrent workers; a late tick never shifts the contractual deadline.
- Every accepted admission and visible/terminal response, clock, extension/notice, manual, dispute, appeal, escalation,
  and resolution transition has one read-after-write-verified plan-33 event first. An unavailable/ambiguous authority
  returns `503` or leaves scheduler work prepared/manual; append success followed by a local crash retries the same event.
- An owned principal with `verification-privacy:manage` can add only allowed typed dispute/appeal/escalation events.
  Foreign requests are concealed and arbitrary narrative/subject search is rejected.
- `GET /v1/privacy/verification-requests/:id/operator-status` returns `200` only for an active `human_session`
  `platform_admin` with `privacy:admin`, returns `401`/`403`/concealed `404` exactly as specified, and emits only the
  safe operational projection with no raw address, subject/fingerprint, ciphertext, object key, or private evidence.
- `privacy:admin` and `privacy:operate` are human-only platform-admin permissions and are rejected from every
  service-client grant/create/update path; customer `verification-privacy:manage` does not grant operator visibility.
- Only a human-session platform administrator with `privacy:operate` can grant an extension, record a notice, resume,
  escalate, or perform `resolve_support`; service clients and other humans receive `403`.
- Resume/review operates on the same request ID/checkpoints and cannot duplicate erase, suppression, correction,
  access export, credit, queue, or object effects.
- A backup predating request admission or later control events cannot lose the accepted request or captured deadline.
  `verification.request-control.v1` replays ordered events through the fixed restore target, rebuilds missing projections
  as manual when minimized resumable input is unavailable, and checkpoints the exact target before release.
- Status and Bruno responses expose exact deadline/support state and safe reason codes without subject/private evidence.
- No rights action semantics, DROP transport, controller-rights flow, migration, production support deployment,
  universal legal claim, or compliance claim is added.
- Focused, rule-parser, clock/calendar, scheduler, notice/alert, authorization, concurrency, PostgreSQL/Redis, runtime,
  full, build, documentation, Bruno, and whitespace checks pass.

## Validation

Run response-rule, clock, support, scheduler, and authorization suites:

    corepack pnpm privacy:verification-response-rules-check
    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-response-rule verification-response-admission verification-privacy-deadline verification-privacy-support verification-privacy-operator-status --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/identity/src/domain/auth-principal.spec.ts src/libs/modules/auth/src/application/role-permission-policy.service.spec.ts --runInBand
    TEST_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/lef_privacy_clock_test TEST_REDIS_URL=redis://localhost:56379 TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- verification-response-admission.integration.spec.ts verification-privacy-clock.integration.spec.ts verification-privacy-support.integration.spec.ts verification-privacy-operator-status.integration.spec.ts --runInBand

Use two policy fixtures with distinct duration, calendar, extension, and notice rules. Test before, at, and after every
warning, original due, notice due, and effective due boundary. Cover DST and time-zone behavior where selected, policy
revision after intake, and a missing or pending rule. Exercise allowed, denied, late, and duplicate extensions; notice
success, failure, unknown results, and retry; duplicate and late scheduler delivery; and retry exhaustion. Also exercise
customer disputes, appeals, and escalations; operator kind, role, and permission; and resume without repeated adapter effects.

Inspect `lef-api-1` ownership before runtime work. Against an owned disposable project, run:

    pnpm dev:reset -- --confirm-project=LEF
    VERIFICATION_PRIVACY_ENABLED=false docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer --env-var expectedFeatureMode=disabled
    cd ../..
    VERIFICATION_PRIVACY_ENABLED=true docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health | jq -e '.status == "ok"'
    cd bruno/privacy-requests
    npx @usebruno/cli run --env local --sandbox developer --env-var expectedFeatureMode=enabled

Require application-start rejection for incomplete admission and successful disposable activation with complete
fixtures. Require atomic snapshot persistence before job publication, contract-derived `dueAt`, warning and overdue
status, permitted and rejected extensions, and notice evidence. Cover disputes, appeals, escalations, exact operator-
status authorization and projection, foreign concealment, resume behavior, idempotency, and all plan-20/21/31 action
regressions.
Also cover authority failure before/after provider acceptance, prepared admission retry, no accepted response/job before
acknowledgment, local crash after append, and same/conflicting transition replay. Restore a backup before admission,
extension, appeal, and response closure; require bounded event replay, original deadline preservation, safe manual
reconstruction when ciphertext is absent, exact target checkpoint, and fail-closed release for a missing event/key or
stale fence.
Return to the repository root and finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm exec prettier --check config/privacy/verification-response-rules.yaml docs/privacy/email-verification-processing-contract.md docs/privacy/customer-data-processing-addendum.md src/libs/modules/email-verification/README.md bruno/privacy-requests/README.md .agents/plans/privacy-compliance/22-enforce-verification-request-response-clocks.md
    git diff --check

Bruno: extend `bruno/privacy-requests` and require the exact command above to pass disabled concealment and complete-
fixture activation. Cover every disposition, access, and correction intake and status path; the contract clock;
extensions and notices; overdue, manual, and escalation states; disputes and appeals; and exact customer and operator
authorization. Also cover one-time export, restore-safe status, and correction cases with no probe or credit effect.

## Idempotence and Recovery

The prepared request snapshot fixes its contract/action-policy/rule/adapter versions and computed times with request/
idempotency creation. No request becomes accepted and no queue job publishes before its deterministic admission event is
verified and the terminal local compare-and-set commits. Each deadline/support/notice event has a deterministic identity
from request, rule, event kind, and occurrence. Authority append-once plus local compare-and-set makes scheduler/API
retries converge. A policy revision affects only later requests unless the contract supplies an explicit separately
evidenced amendment; runtime never rewrites old times implicitly.

Notice delivery retries use one idempotency identity and preserve unknown state for manual review. Alerts may retry but
cannot change request technical state. Resume republishes only the existing request job and checkpoints. Appeals and
disputes append review events without deleting the original receipt or replaying the effect.

If time/calendar calculation, adapter registration, or notice acknowledgment is ambiguous, fail intake or application start or
leave the request manual/overdue. Never recover by selecting a generic duration, editing `dueAt`, recording a log as
notice, creating a second request, clearing an appeal, or marking incomplete work complete.

For incompatible synchronized development state, preserve unrelated work, verify Compose ownership, reset/reseed only
the owned disposable project, and replay synthetic requests using the same idempotency identities.

## Artifacts and Notes

Record the admission descriptor/manifest, contract/action-policy/rule/configuration versions, synthetic request/event
IDs, original/effective due times, and typed extension/notice/support events. Record adapter descriptors, the operator
projection field audit, safe authority sequence/fence and acknowledgment references, restore checkpoints, scheduler
counts, focused/integration totals, and Bruno totals. Never record
raw addresses, subject IDs/fingerprints, customer identities, support narratives, private legal advice, notice contents,
credentials, tokens, object/export contents, or key material.

## Plan readiness

Ready after the approved customer contract supplies the exact response-rule projection for every plan-20, plan-21, and
plan-31 action, plus each selected notice, support, and alert adapter's acknowledgment semantics. The contract must also
supply operator-role assignment approval, authorized non-production fixtures, and exact validation commands.
