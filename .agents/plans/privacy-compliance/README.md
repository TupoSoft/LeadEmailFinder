# LeadEmailFinder Privacy Compliance Road Map

This road map turns LeadEmailFinder's customer-verification processor/service-provider boundaries and its separate
controller responsibilities for account, authentication, organization, billing, fraud, security, and compliance data
into reviewable legal, product, security, and engineering controls. It does not treat a technical control or merged
document as a legal certification. Every linked ExecPlan follows `.agents/PLANS.md` and maps to one pull request.

Numeric prefixes are stable identities, not execution order. Dependency edges below take precedence when branches
converge.

## Order and Dependencies

1. [Define the Email-Verification Processing and Lifecycle Contract](01-define-processing-and-lifecycle-contract.md) —
   inventories processor/controller boundaries, purposes, data flows, lifecycle defaults, and follow-up owners; depends
   on `module-boundaries/08` and `module-architecture/01`.
2. [Default-Deny External Account-Discovery Providers](02-default-deny-account-discovery-providers.md) — removes
   LinkedIn session material and requires an exact, active, unexpired approval-manifest match; depends on
   `privacy-compliance/01`.
3. [Prevent Email Addresses from Entering Logs](03-prevent-email-addresses-in-logs.md) — permits only safe log fields
   after the LinkedIn adapter is gone; depends on `privacy-compliance/01` and `privacy-compliance/02`.
4. [Own Persisted Verification State by Organization](04-own-verification-state-by-organization.md) — prevents cross-
   tenant address, result, cache, job, and object reuse; depends on `privacy-compliance/01` and `auth/05`.
5. [Require STARTTLS Before SMTP Mailbox Probing](05-require-starttls-for-smtp-probes.md) — requires authenticated
   encryption before SMTP address disclosure; depends on `privacy-compliance/03` and `proxy-fleet/14`.
6. [Require Secure Storage Transport and Encrypted Customer Objects](06-require-secure-storage-transport.md) — rejects
   insecure production PostgreSQL/Redis/S3 transport and publishes the shared customer-object write-security
   token; depends on `privacy-compliance/01`.
7. [Enforce Verification-Data Retention Across PostgreSQL, Redis, and S3](07-enforce-verification-data-retention.md) —
   applies current-store expiry and registers `verification.age-retention.v1` with restore quarantine; depends on
   `privacy-compliance/04`, `privacy-compliance/06`, `privacy-compliance/15`, and `module-architecture/16`.
8. [Establish Durable Verification-Subject Write Gates](08-fulfill-verification-privacy-requests.md) — adds stable
   subject identities, key rotation, renewable writer/preparse leases, organization ingestion epochs, and crash-safe
   publication barriers; depends on `privacy-compliance/03`, `privacy-compliance/04`, and `privacy-compliance/07`.
9. [Process California DROP Deletion Requests When Legally Required](09-process-california-drop-requests.md) —
   conditionally connects the approved DROP request exchange to the internal verification-disposition command; depends
   on `privacy-compliance/20` and `privacy-compliance/24`.
10. [Establish Customer Data-Processing Terms and Subprocessor Governance](10-establish-customer-data-processing-terms.md) —
    obtains terms, assent, vendor/transfer approvals, and populates the executable plan-02 approval manifest; depends on
    `privacy-compliance/01` and `privacy-compliance/02`.
11. [Enforce Managed Processor-Copy Log and Backup Controls](11-enforce-managed-log-and-backup-controls.md) — validates
    provider policy boundaries, a maximum 30-day lifecycle, access, and evidence only for managed processor-side
    customer-verification copies; depends on `privacy-compliance/03` and `privacy-compliance/10`.
12. [Define the Controller-Data Purpose, Notice, Retention, and Rights Contract](12-define-controller-data-contract.md) —
    obtains exact controller purposes, notices, lifecycle/rights decisions, and recovery-receipt contract; depends on
    `privacy-compliance/01`.
13. [Build the Controller-Privacy Request Core](13-fulfill-controller-data-rights.md) — adds default-disabled
    orchestration, crypto, an exact adapter/capability registry, deadlines/appeals, one-time exports, and fake-only
    legal-hold query/guard ports; depends on `privacy-compliance/06`, `privacy-compliance/12`,
    `privacy-compliance/15`, and `module-architecture/09`.
14. [Operationalize Privacy and Security Incident Response](14-operationalize-privacy-security-incidents.md) — builds
    the approved role/data map, contacts, evidence process, notice paths, and role/jurisdiction clocks; depends on
    `privacy-compliance/01`, `privacy-compliance/10`, `privacy-compliance/11`, `privacy-compliance/12`, and
    `privacy-compliance/15`.
15. [Quarantine and Reconcile Restored Application Data](15-quarantine-and-reconcile-restored-data.md) — adds explicit
    restore declaration, fail-closed traffic/readiness/workers, out-of-band operator authority, checkpoints, and CAS
    release; depends on `privacy-compliance/11`, `auth/10`, and `module-architecture/08`.
16. [Add Identity-Attribution and Browser-Session Privacy Adapters](16-add-identity-and-access-privacy-adapters.md) —
    connects only local external-identity attribution plus BFF session/pending-login state and owner retention
    operations behind the durable hold guard; depends on `privacy-compliance/13` and `privacy-compliance/32`.
17. [Add Local Credits and Payments Privacy Adapters](17-add-financial-and-provider-privacy-adapters.md) — connects
    only local credits/payment records and owner retention behind the durable hold guard while preserving accounting
    truth; depends on `privacy-compliance/13` and `privacy-compliance/32`.
18. [Enforce Controller-Data Retention and Restore Reconciliation](18-enforce-controller-data-retention.md) — compiles
    every owner retention capability, schedules bounded work, registers `controller.data-lifecycle.v1`, and is the
    first plan allowed to enable a complete disposable real registry; depends on `privacy-compliance/12`,
    `privacy-compliance/15`, `privacy-compliance/16`, `privacy-compliance/17`, `privacy-compliance/27`,
    `privacy-compliance/28`, `privacy-compliance/29`, `privacy-compliance/30`, `privacy-compliance/32`, and
    `privacy-compliance/33`.
19. [Publish Approved Controller Privacy Notices](19-publish-controller-privacy-notices.md) — implements only the exact
    approved plan-12 Keycloak/account/onboarding/checkout/API placements and version evidence; depends on
    `privacy-compliance/10` and `privacy-compliance/12`.
20. [Fulfill Organization-Submitted Verification Dispositions](20-fulfill-verification-disposition-requests.md) —
    implements erase, erase-and-suppress, restrict, object/opt-out, withdrawal, cross-store rewrite, controller
    evidence, and restore replay; depends on `privacy-compliance/08`, `privacy-compliance/10`,
    `privacy-compliance/12`, `privacy-compliance/15`, and `privacy-compliance/33`.
21. [Fulfill Verification Access with Secure One-Time Exports](21-fulfill-verification-access-and-correction.md) —
    adds consistent access collection, fenced one-time secure exports, physical purge, and restore invalidation only;
    depends on `privacy-compliance/06`, `privacy-compliance/15`, `privacy-compliance/20`, and
    `privacy-compliance/33`.
22. [Enforce Contract Response Clocks and Support Workflows](22-enforce-verification-request-response-clocks.md) —
    applies versioned contract `dueAt`, extension notices, warning/overdue/manual/escalation, and dispute/appeal support
    to the same request state and owns the first permitted disposable HTTP activation; depends on
    `privacy-compliance/10`, `privacy-compliance/20`, `privacy-compliance/21`, `privacy-compliance/31`, and
    `privacy-compliance/33`.
23. [Enforce Active Production Data Store Safeguards](23-enforce-active-datastore-safeguards.md) — validates actual
    PostgreSQL/Redis/S3 at-rest or approved-equivalent, key, access, network, audit, and release evidence, with separate
    internal-operator and approved external-recipient models; depends on `privacy-compliance/06`,
    `privacy-compliance/10`, and `privacy-compliance/11`.
24. [Govern the California Data-Broker Registration and DROP Account Lifecycle](24-govern-california-data-broker-account-lifecycle.md) —
    conditionally governs covered-entity registration, human-owned onboarding/first-access fee evidence, secure
    account/list selection, incident escalation, purpose limits, and cessation; depends on `privacy-compliance/10`,
    `privacy-compliance/14`, and `privacy-compliance/23`.
25. [Operate Recurring California Data-Broker Reporting and Audit Evidence](25-operate-california-data-broker-reporting.md) —
    conditionally operates counsel-mapped annual-registration fee, disclosure, audit, certification, correction,
    filing, and receipt cycles under named human owners; depends on `privacy-compliance/09`,
    `privacy-compliance/24`, and `privacy-compliance/26`.
26. [Maintain Processing Records and Assessment Applicability](26-maintain-accountability-and-assessment-register.md) —
    maintains LeadEmailFinder's controller records/assessments separately from per-customer-controller processor
    records, supplied controller decisions, and processor-assistance evidence; depends on `privacy-compliance/01`,
    `privacy-compliance/10`, `privacy-compliance/12`, `privacy-compliance/14`, and `privacy-compliance/23`.
27. [Add the Atomic Human-Organization Privacy Adapter](27-add-human-organization-privacy-adapter.md) — connects human
    Keycloak, organization, membership, and invitation lifecycle behind one invariant-preserving, hold-guarded owner
    seam; depends on `privacy-compliance/13`, `privacy-compliance/16`, `privacy-compliance/32`, and `auth/13`.
28. [Add the Service-Client Privacy Adapter](28-add-service-client-privacy-adapter.md) — connects local/Keycloak M2M
    lifecycle without exposing credentials or granting human privacy authority; depends on `privacy-compliance/13`,
    `privacy-compliance/16`, and `privacy-compliance/32`.
29. [Add the Audit and Security Facts Privacy Adapter](29-add-audit-security-holds-privacy-adapter.md) — connects only
    local audit/security facts and owner retention without rewriting immutable evidence or owning legal holds; depends
    on `privacy-compliance/11`, `privacy-compliance/13`, `privacy-compliance/16`, `privacy-compliance/26`, and
    `privacy-compliance/32`.
30. [Add Managed External-Provider Privacy Assistance](30-add-managed-provider-privacy-adapter.md) — connects only
    approved providers with authoritative retry, truthful pending/manual outcomes, and owner retention operations. Its
    binding gate requires replacement by one plan per independent provider family or oversized capability slice when
    decomposition is necessary; depends on `privacy-compliance/10`, `privacy-compliance/11`, `privacy-compliance/13`,
    `privacy-compliance/17`, `privacy-compliance/29`, and `privacy-compliance/32`.
31. [Correct Verification Subjects Without Stale Effects](31-fulfill-verification-correction.md) — adds a dual-subject,
    deterministic correction that fences both subjects and organization ingestion, preserves/strengthens captured
    dispositions, removes stale derived effects, and replays through restore; depends on `privacy-compliance/08`,
    `privacy-compliance/10`, `privacy-compliance/12`, `privacy-compliance/15`, `privacy-compliance/20`, and
    `privacy-compliance/33`.
32. [Enforce Durable Controller Legal Holds](32-enforce-controller-legal-holds.md) — supplies the real, durable, scoped,
    and fenced provider for the plan-13 legal-hold query/guard ports plus human-only administration without registering
    a data-owner adapter or enabling controller privacy; depends on `privacy-compliance/12`, `privacy-compliance/13`,
    `privacy-compliance/26`, and `privacy-compliance/33`.
33. [Establish the Durable Privacy-Control Authority](33-establish-durable-privacy-control-authority.md) — adds the real,
    independently durable append-only authority, backup-captured high-water marks, restore epoch fence and target, bounded
    enumeration, and fail-closed release contract; depends on `privacy-compliance/11`, `privacy-compliance/12`, and
    `privacy-compliance/15`.
34. [Trace Verification Operations with Opaque Identifiers](34-trace-verification-operations-with-opaque-identifiers.md) —
    returns the server request UUID, links it to existing job, batch, and verification UUIDs through safe lifecycle
    events, and adds an organization-owned verification-result lookup; depends on `privacy-compliance/03` and
    `privacy-compliance/04`.

The graph is acyclic. Plan 02 can merge with an empty approval manifest before plan 10. Module-architecture plans 10,
13, 14, 11, 15, and 16 split core/persistence, discovery, SMTP/proxy, synchronous, asynchronous, and batch delivery;
privacy plan 07 depends on the final plan-16 composition before plan 08 gates every writer. Plan 11 remains limited to
managed processor-copy policy evidence, and plan 15 owns restore runtime. Plan 33 adds the non-restored privacy-control
authority after those foundations. Plans 20, 21, 31, and 22 append dispositions, access-export lifecycle, correction,
and request/clock/support events to that authority before terminal state; plan 22 still owns the first permitted
disposable verification-privacy activation.

Plan 34 is the operational follow-up to plans 03 and 04. It preserves log-content minimization while making ordinary
sync, async, and batch verification work traceable through existing opaque IDs and the organization-owned result store.
It does not depend on or extend the separate privacy-request authority, retention, restore, or managed-sink branches.

The controller branch builds the fake-tested core and hold-query/guard contracts in plan 13. Plan 32 supplies the one
durable legal-hold provider before plans 16, 17, and 27–30 add local attribution/session, financial, human/organization,
service-client, audit/security-facts, and approved managed-provider adapters. Every subset stays disabled. Plan 30 must
first be decomposed into one ExecPlan per independent provider family or oversized capability slice when its binding gate
requires it. Plan 32 journals legal-hold transitions through plan 33, and plan 18 journals controller actions and
retention dispositions there. Plan 18 consumes all six adapter lines plus plan 32, adds the mandatory lifecycle/restore
capability, and is the first plan allowed to enable a complete real registry in a disposable environment. Plan 19
independently waits for the exact plan-12 notice-placement choices.

For every eligible backup, plan 11 preserves the immutable provider-generation binding for the plan-33 capture ticket
and highest contiguous included privacy-control sequence. At restore declaration, plan 15 uses plan 33 to fence prior-
epoch writers and freeze the target watermark. Each required consumer replays the exact interval after the backup
watermark through that target. Release remains closed until the authority confirms the current fence and target, stream
continuity holds, every consumer checkpoint equals the target, and all data-owner reconciliation succeeds.

The California branch is conditional on counsel's covered-data-broker determination. Plan 24 establishes entity,
account, and list governance plus human-owned onboarding/first-access fee evidence. Plan 09 then consumes the internal plan-20
internal erase-and-suppress command. Plan 25 operates later annual-registration fee and reporting/audit cycles after
plan 26 supplies accountability and assessment evidence. Plans 23 and 26 remain blocked on actual Operations, Security,
and counsel inputs rather than invented production facts.

## Shared Constraints

- Customer-supplied addresses and verification inferences stay under a strict processor/service-provider posture:
  documented customer instructions only, organization ownership, and no cross-customer reuse, sale, sharing, or
  independent enrichment.
- LeadEmailFinder separately acts as controller for its own account, auth, organization, billing, fraud, security, and
  compliance records. Controller purposes never authorize reuse of customer verification data.
- LeadEmailFinder owns GDPR DPIA/LIA and Article 30 controller decisions only for its controller activities. For
  customer-supplied verification, each named customer-controller owns its legal-basis/DPIA/LIA decisions; plan 26
  records per-controller processor activity, supplied decision references, and LeadEmailFinder's assistance evidence
  without aggregating those decisions into a LeadEmailFinder controller conclusion.
- Verification is a deliverability signal, not consent, lawful basis, marketing eligibility, or permission to contact.
  This repository does not send commercial email or own CAN-SPAM message/header/address/unsubscribe/suppression duties.
- Account-discovery environment values and proxy presence are never approval. Runtime requires the fixed plan-02
  manifest plus an exact active, effective, unexpired ID/provider/purpose/region match. Only plan 10 may populate that
  manifest from approved source evidence.
- Source-controlled terms/notices are not customer assent or proof of publication. Plan 10 owns selected contractual
  assent; plan 12 owns exact controller notice choices; plan 19 implements those choices.
- The pure `CustomerObjectWriteSecurity` type/token is shared through common and bound in the API composition root.
  Email objects, verification access exports, and controller exports consume the same production HTTPS/SSE-KMS/
  `no-store` contract.
- Plan 07 owns application-managed verification PostgreSQL/BullMQ/S3 retention. Plan 11 owns inventory, maximum 30-day
  policy, access, and evidence only for managed processor-side customer-verification copies; controller/security/
  incident/audit/legal lifecycles come from plans 12 and 26. Plan 15 owns restore quarantine/release. Plan 33 owns the
  independently durable privacy-control authority, backup included high-water mark, restore epoch fence, and fixed target
  watermark. Plan 08 owns stable subject/write-ingestion safety; plan 20 owns disposition replay, plan 21 owns access-
  export invalidation, plan 31 owns dual-subject correction replay, plan 22 owns request-control replay, plan 32 owns
  legal-hold replay, and plan 18 owns controller lifecycle replay.
- Plan 34 owns ordinary verification correlation through server-generated request IDs and existing job, batch, and
  verification IDs. Logs retain only safe links and reason/stage codes; only an organization-owned application read
  can resolve a verification ID to an address. Plan 11 continues to own managed log-sink access and retention.
- A local privacy-control row is a projection, never the only restore authority. A workflow cannot expose a terminal
  request, receipt, disposition, correction, export lifecycle, controller action, retention disposition, or legal-hold
  transition until its minimal pseudonymous plan-33 event is durably appended and verified. Restore consumers enumerate
  `(backupIncludedHighWatermark, restoreTargetWatermark]` in bounded gap-checked pages. Missing authority, capture
  evidence, key version, consumer, event, current fence, or exact target checkpoint keeps plan-15 quarantine closed.
- Every verification writer participates in the plan-08 subject generation and organization ingestion epoch. An
  unparsed multipart upload is registered before bytes, and a pre-close batch result cannot publish after close/reopen.
- Plans 20, 21, 31, and 22 share one organization-authenticated verification request aggregate. Plan 20 owns
  destructive/restrictive dispositions and withdrawal; plan 21 owns access and one-time exports only; plan 31 owns
  dual-subject correction; and plan 22 owns contract-derived admission, response/support clocks, and the first permitted
  disposable HTTP activation. Conditional plan 09 calls the internal plan-20 command, never its HTTP API, and
  cannot start before plan 24 establishes the covered DROP account/list boundary.
- Plan 06 owns authenticated data-store transport and per-write object SSE-KMS. Plan 23 separately owns actual active
  PostgreSQL/Redis/S3 at-rest or approved-equivalent, key, least-privilege access, network, audit, and release evidence.
  An internally operated store requires accountable internal operator evidence and no fabricated plan-10 recipient; an
  externally operated store requires one exact approved plan-10 recipient. Plan 11 remains limited to managed
  processor-side verification copies in logs/backups.
- Controller rights remain disabled by default. Plan 13 defines `controller.legal-holds.v1` as mandatory and supplies
  only fake hold ports; plan 32 owns the real scoped, durable, fenced provider and human administration. Plans 16, 17,
  and 27–30 depend on that provider and preserve local ownership, final-owner, accounting, immutable-fact, credential,
  and provider invariants while registering exact subsets. Plan 18 alone owns scheduled controller retention, restore
  lifecycle replay, and complete disposable real-registry activation.
- Plan 29 owns only local audit/security facts and never legal-hold administration. Plan 30 connects no provider until
  plan 10 has approved it, and its binding gate replaces the plan with one ExecPlan per independent provider family or
  oversized authoritative capability slice before production edits when required.
- Plans 24, 09, and 25 are conditional California data-broker controls. Plan 24 makes applicable onboarding/first-
  access fees human-owned and evidence-gated; plan 25 repeats annual-registration fee governance for each applicable
  cycle. Repository code performs no payment, registration, Agency account action, production DROP exchange, filing,
  or certification. Plan 26 records role-correct applicability and evidence references without replacing counsel, a
  customer-controller decision, DPIA/LIA, risk assessment, cybersecurity audit, or filing.
- Incident clocks come from actual role, jurisdiction, contract, awareness trigger, and counsel-approved rule; there is
  no blanket 72-hour rule for every event.
- Legal/DPO approval is required before public GDPR, CCPA, or CAN-SPAM claims. Engineering evidence does not replace
  legal classification, contracts, vendor approval, notice publication, or incident decisions.
- No plan introduces TypeORM migrations, backfills, production rollout, HA, or production recovery while no production
  environment exists. Incompatible development changes use synchronization and an explicit owned reset/reseed.
- Every plan preserves the canonical module contract, uses narrow ports/adapters, covers authorization/concurrency/
  idempotency/recovery proportionately, states Bruno applicability, and records only sanitized synthetic evidence.
