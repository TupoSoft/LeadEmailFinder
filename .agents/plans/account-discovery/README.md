# Account Discovery Ownership Road Map

This road map keeps account discovery inside the email-verification business module and retires the technical
`catch-all` library. Each implementation plan follows `.agents/PLANS.md` and delivers exactly one pull request.

## Order and Dependencies

1. [Encapsulate Account Discovery Behind an Internal Application Port](01-encapsulate-account-discovery.md) — updates
   the active mailbox service and its composition; depends on `module-architecture/18`, `privacy-compliance/02`, and
   `privacy-compliance/03`.
2. [Internalize Account-Discovery Provider Adapters](02-internalize-provider-adapters.md) — moves provider clients and
   HTTP composition into email-verification infrastructure and removes the old library and aliases; depends on
   `account-discovery/01`.

These plans follow the existing
[email-verification core cutover](../module-architecture/18-cutover-email-verification-adapters.md), which already
has an open implementation pull request at authoring time. They do not add a prerequisite to that work.
[Domain discovery](../module-architecture/13-layer-email-discovery-adapters.md) follows `account-discovery/02` and
retains DNS and domain-synonym ownership, while
[mailbox probing](../module-architecture/14-layer-smtp-mailbox-adapter.md) retains SMTP and proxy ownership.

## Shared Constraints

- Create an internal application boundary within `email-verification`; do not add a sibling business module or
  export the discovery service, token, or provider implementations through the public module barrel.
- Verification owns when to request evidence and how it changes a verification result. Account-discovery application
  code owns selection and approval checks. Infrastructure owns provider requests, response mapping, and Nest wiring.
- Plan 01 retains the existing shared provider interface while the clients remain external. Plan 02 moves them and
  that contract into their owning business module together. Never make the old library import private module code.
- Preserve the fixed purpose, manifest, configuration names, zero-or-one provider activation, per-call approval
  validation, source meanings, request behavior, and logging restrictions. No vendor approvals or live calls are needed.
- Empty evidence does not prove account absence. Invalid startup configuration remains an error; runtime discovery
  failures retain the current empty-evidence behavior.
- Keep HTTP routes, billing, authorization, persistence, queues, SMTP, public exports, and schemas unchanged. No
  migrations, production rollout, new retry policy, or new timeout policy belong to these plans.
- Use focused provider and Nest composition tests for dispatch guarantees. Rerun the existing SMTP development
  collection for runtime wiring; its response-source assertions alone cannot prove zero attempted provider requests.
- Keep existing architecture restrictions and shrink only demonstrably resolved baseline entries. Preserve completed
  plans as historical evidence, and keep incomplete downstream plans consistent with this ownership split.
