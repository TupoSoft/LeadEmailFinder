# Business Module Architecture Road Map

This road map turns `src/libs/modules/README.md` into agent guidance backed by an executable architecture contract,
removes the current violations in bounded pull requests, and finishes with a strict zero-violation gate. Each plan
follows `.agents/PLANS.md` and represents exactly one pull request.

## Order and Dependencies

1. [Ratchet business-module architecture](01-ratchet-business-module-architecture.md) — publishes the root/scoped
   agent workflow and ratcheted checker; depends on `module-boundaries/08` and `module-readmes/01`.
2. [Introduce identity persistence ports](02-introduce-identity-persistence-ports.md) — depends on
   `module-architecture/01`.
3. [Make auth and BFF session acyclic and layered](03-make-auth-and-bff-session-acyclic-and-layered.md) — depends
   on `module-architecture/02`.
4. [Layer credits behind persistence ports](04-layer-credits-behind-persistence-ports.md) — depends on
   `module-architecture/02`, `module-architecture/03`, and `payments/06`.
5. [Layer proxy and publish owned contracts](05-layer-proxy-and-publish-owned-contracts.md) — depends on
   `module-architecture/03`.
6. [Layer organization onboarding](06-layer-organization-onboarding.md) — depends on `module-architecture/02`,
   `module-architecture/03`, and `module-boundaries/09`.
7. [Layer service-client management](07-layer-service-client-management.md) — depends on `module-architecture/02`,
   `module-architecture/03`, and `module-boundaries/09`.
8. [Seal identity persistence](08-seal-identity-persistence.md) — depends on `module-architecture/03`,
   `module-architecture/04`, `module-architecture/06`, and `module-architecture/07`.
9. [Layer payments](09-layer-payments.md) — depends on `module-architecture/03`, `module-architecture/04`,
   `module-architecture/08`, and `payments/06`.
10. [Separate email-verification core from adapters](10-separate-email-verification-core-from-adapters.md) —
    depends on `module-architecture/05` and `module-architecture/08`.
11. [Layer email-verification delivery workflows](11-layer-email-verification-delivery-workflows.md) — depends on
    `module-architecture/03`, `module-architecture/04`, and `module-architecture/10`.
12. [Retire the module-architecture baseline](12-retire-module-architecture-baseline.md) — removes transitional
    baseline-maintenance wording from agent guidance and deletes the debt baseline while retaining the strict
    workflow; depends on `module-architecture/05`, `module-architecture/08`, `module-architecture/09`, and
    `module-architecture/11`.

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
- No plan introduces a TypeORM migration while the project has no production environment. Incompatible development
  schema changes use disposable synchronized data with documented reset and reseed steps.
- The repository is currently private on a GitHub plan that returns HTTP 403 responses for branch-protection and
  rule set APIs. After Plan 01 lands, the validation workflow and pre-commit hook can detect violations, but GitHub
  cannot be claimed to block a red merge or direct push until repository capabilities change.
