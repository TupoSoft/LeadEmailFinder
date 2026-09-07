# Legacy Feature Retirement Road Map

These plans remove identified obsolete interfaces and tooling. Each implementation plan follows
`.agents/PLANS.md` and delivers exactly one pull request. The
[inventory](../../../docs/maintenance/legacy-feature-inventory.md) records evidence, retained behavior, and removal
work already owned by other plans.

## Order and Dependencies

1. [Retire Deprecated GET Verification](01-retire-deprecated-verification.md) removes `GET /verify` and its
   exclusive dependencies after `module-architecture/11` completes the existing synchronous refactor.
2. [Require the Canonical Payment Checkout URL Setting](02-remove-checkout-url-alias.md) removes the deprecated configuration
   alias. Its prerequisite, `payments/07`, is complete; it can proceed independently of plan 01.
3. [Retire Obsolete Application Deployment Tooling](03-retire-obsolete-deployment-tooling.md) removes the old application
   deployment workflow, descriptor, logging dependency, and remote request presets. It can proceed independently.
4. [Remove Resolution Aliases for the Deleted API-Key Library](04-remove-api-key-resolution-aliases.md) removes configuration pointing
   to the deleted key library. Its prerequisite, `auth/09`, is complete; it can proceed independently of plans 01 through 03.

The synchronous refactor merged in [PR #553](https://github.com/TupoSoft/LeadEmailFinder/pull/553). Preserve that
implementation and its recorded validation. Its prerequisite is complete; plan 01 removes the deprecated adapter from its resulting layered paths.

The list is a suggested review order, not an automatic assignment of Project priority or Iteration. Existing
`account-discovery/02`, `module-architecture/12`, and `plan-sync/05` retain their own prerequisites and removal scope.

## Shared Constraints

- This is a planning change. Implementation checkboxes remain open, and no implementation issue is claimed here.
- Remove behavior only where a plan explicitly names its retirement. Keep current verification, billing,
  OIDC authentication, proxy allocation, and development fixtures operational.
- Delete dependencies only after checking every remaining consumer. Retain security scans, historical result reading,
  completed plans, and architecture enforcement unless a separate plan owns their replacement.
- Update current documentation and incomplete plans together; completed plans remain historical evidence.
- Use no database migrations, remote resource deletion, secret deletion, or production deployment. These four changes
  need no data reset. Broader dependency upgrades are separate work.
- State acceptance as observable behavior and record actual checks separately. Readiness does not claim runtime proof.
