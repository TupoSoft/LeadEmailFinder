# Business Module Architecture Road Map

This road map turns `src/libs/modules/README.md` into agent guidance backed by an executable architecture contract,
removes the current violations in bounded pull requests, and finishes with a strict zero-violation gate. Each plan
follows `.agents/PLANS.md` and represents exactly one pull request.

## Order and Dependencies

1. [Ratchet Business-Module Architecture](01-ratchet-business-module-architecture.md) — publishes the root/scoped
   agent workflow and ratcheted checker; depends on `module-boundaries/08` and `module-readmes/01`.
2. [Introduce Purpose-Specific Identity Persistence Ports](02-introduce-identity-persistence-ports.md) — depends on
   `module-architecture/01`.
3. [Make Auth and BFF Session Acyclic and Layered](03-make-auth-and-bff-session-acyclic-and-layered.md) — depends
   on `module-architecture/02`.
4. [Layer Credits Behind Persistence Ports](04-layer-credits-behind-persistence-ports.md) — depends on
   `module-architecture/02`, `module-architecture/03`, and `payments/06`.
5. [Layer Proxy and Publish Its Owned Contracts](05-layer-proxy-and-publish-owned-contracts.md) — depends on
   `module-architecture/03`.
6. [Layer Organization Onboarding](06-layer-organization-onboarding.md) — depends on `module-architecture/02`,
   `module-architecture/03`, and `module-boundaries/09`.
7. [Layer Service-Client Management](07-layer-service-client-management.md) — depends on `module-architecture/02`,
   `module-architecture/03`, and `module-boundaries/09`.
8. [Seal Identity Persistence Behind Module Ports](08-seal-identity-persistence.md) — depends on `module-architecture/03`,
   `module-architecture/04`, `module-architecture/06`, and `module-architecture/07`.
9. [Layer Payments Without Changing Financial Semantics](09-layer-payments.md) — depends on `module-architecture/03`, `module-architecture/04`,
   `module-architecture/08`, and `payments/06`.
10. [Define the Pure Email-Verification Domain and Application Core](10-separate-email-verification-core-from-adapters.md) —
    delivers only the pure domain/application core and its ports, additive and unwired; depends on
    `module-architecture/08`, `privacy-compliance/03`, and `privacy-compliance/04`.
11. [Implement the Email-Verification TypeORM Persistence Stores](17-layer-email-verification-persistence.md) —
    delivers the four persistence-port adapters, additive and unwired; depends on `module-architecture/10` and
    `privacy-compliance/04`.
12. [Move Email Administration, Add Network Compatibility Adapters, and Cut Email Verification Over](18-cutover-email-verification-adapters.md) —
    moves the email-administration API, adds temporary network compatibility adapters, composes the final module,
    and performs the delivery cutover; depends on `module-architecture/10`, `module-architecture/17`, and
    `privacy-compliance/03`.
13. [Layer Email Domain and Account Discovery Adapters](13-layer-email-discovery-adapters.md) — replaces the DNS
    and HTTP synonym compatibility adapters from plan 18 (the account-discovery adapter already exists from a
    prior privacy-compliance plan); depends on `module-architecture/10`, `module-architecture/18`,
    `privacy-compliance/02`, and `privacy-compliance/03`.
14. [Layer the SMTP and Proxy Mailbox Adapter](14-layer-smtp-mailbox-adapter.md) — replaces the mailbox
    compatibility adapter from plan 18 and recomposes core/network wiring; depends on `module-architecture/05`,
    `module-architecture/10`, `module-architecture/13`, `module-architecture/17`, `module-architecture/18`,
    `privacy-compliance/03`, and `privacy-compliance/05`.
15. After plan 14, these disjoint delivery plans may proceed in parallel:
    - [Layer Synchronous Email-Verification Delivery](11-layer-email-verification-delivery-workflows.md) — owns the
      current and deprecated synchronous HTTP/application slice; depends on `module-architecture/03`,
      `module-architecture/04`, and `module-architecture/14`.
    - [Layer Asynchronous Email Verification](15-layer-async-email-verification.md) — owns async enqueue/status and
      the Bull worker; depends on `module-architecture/03`, `module-architecture/04`, and
      `module-architecture/14`.
16. [Layer Batch Email Verification](16-layer-batch-email-verification.md) — owns batch HTTP, workflow, Bull, CSV,
    and S3 and finishes delivery composition; depends on `module-architecture/11`, `module-architecture/14`,
    `module-architecture/15`, and `privacy-compliance/06`.
17. [Retire the Module-Architecture Baseline](12-retire-module-architecture-baseline.md) — removes transitional
    baseline-maintenance wording from agent guidance and deletes the debt baseline while retaining the strict
    workflow; depends on `module-architecture/05`, `module-architecture/08`, `module-architecture/09`, and
    `module-architecture/16`.

## Shared Constraints

- A module uses only the `api`, `application`, `domain`, and `infrastructure` layers it needs; empty directories are
  not required. Production source outside those layers is limited to `src/index.ts` and an optional root Nest
  composition module.
- Cross-module consumers use a target module's bare public barrel. Deep and relative cross-module imports are debt,
  not contracts.
- Plan 01 records every existing violation by stable identity. Later plans may only remove baseline entries; they
  must not exchange one violation for another or expand the baseline.
- Plan 01 also publishes the coding-agent workflow through a root `AGENTS.md` trigger and
  `src/libs/modules/AGENTS.md`. Both files point to the canonical module guide and executable gate. Plan 12 removes
  their transitional baseline-maintenance language when the checker becomes a strict zero-violation command.
- Refactors preserve routes, DTO validation, authorization, persistence behavior, queue contracts, provider
  compensation, and runtime configuration unless a plan explicitly states otherwise.
- Plans 10, 17, 18, 13, 14, 11, 15, and 16 form one migration sequence. Plan 10 delivers only the pure core and
  ports, additive and unwired. Plan 17 delivers the persistence stores, also additive and unwired. Plan 18 moves the
  email-administration API, adds temporary private network compatibility adapters, composes the module, and performs
  the one delivery cutover. Plan 13 replaces discovery, and plan 14 replaces SMTP/proxy and recomposes core/network
  wiring. Plans 11 and 15 independently layer sync and async delivery. Plan 16 alone performs final workflow
  composition and removes the last email-verification baseline keys.
- Those eight plans preserve the privacy contracts established by their prerequisites. They must not restore
  cross-tenant state or bypass the fixed approval manifest and exact provider/approval/region selection from privacy
  plan 02. They also must not emit raw-address logs, restore plaintext SMTP probes, weaken production storage
  transport, or replace the shared `CustomerObjectWriteSecurity` token/value from privacy plan 06 with local S3
  configuration while moving code across layers.
- Plans 10, 17, 18, and 16 have binding pre-implementation size gates. Each counts projected non-Markdown additions
  plus deletions, includes tests, ignores only `*.md` and `pnpm-lock.yaml`, and treats 1,000 or more modifications as
  `size/xl`. An XL projection requires the exact split recorded in that plan before production code is edited; an
  implementer must not weaken the threshold or defer decomposition until PR review. Plans 10, 17, and 18 already
  exist because a single unsplit plan 10 was projected `size/xl` even under its own prescribed two-way split; see
  the Surprises & Discoveries section of plan 10 for the record.
- No plan introduces a TypeORM migration while the project has no production environment. Incompatible development
  schema changes use disposable synchronized data with documented reset and reseed steps.
- The repository is currently private on a GitHub plan that returns HTTP 403 responses for branch-protection and
  rule set APIs. After Plan 01 lands, the validation workflow and pre-commit hook can detect violations, but GitHub
  cannot be claimed to block a red merge or direct push until repository capabilities change.
