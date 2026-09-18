# Operator Domain Verification Policy Road Map

These plans let a platform operator forbid email verification for selected domain names through an authenticated
API and the existing browser platform console. Each implementation task is exactly one pull request and follows
`.agents/PLANS.md`. The sequence reuses the pending enforcement plan rather than creating a competing fix.

## Order and Dependencies

| Key | Implementation task | Direct dependencies |
| --- | --- | --- |
| `verification-billing-hardening/02` | [Enforce stored prohibitions before single admission and every execution attempt](../verification-billing-hardening/02-enforce-domain-prohibitions.md) | `verification-billing/04`, `verification-billing-hardening/08`, `frontend/11` |
| `domain-verification-policy/01` | [Retain prohibited batch addresses as free failed rows](01-block-forbidden-batch-addresses.md) | `verification-billing-hardening/02`, `verification-billing/05`, `batch-verification-hardening/01` |
| `domain-verification-policy/02` | [Manage global domain policies through the operator API](02-manage-domain-policies.md) | `verification-billing-hardening/02`, `domain-verification-policy/01` |
| `domain-verification-policy/03` | [Manage domain restrictions in the browser platform console](03-manage-domain-policies-in-browser.md) | `domain-verification-policy/02`, `frontend/08`, `frontend/09` |

Implement in this order so exposed operator controls are effective across sync, async, and batch verification.
The enforcement PR includes the existing customer browser's handling of a domain-policy rejection; the later
browser PR adds only operator management and its end-to-end proof. Readiness records decision completeness;
dependency progress still determines implementation eligibility. No implementation is marked complete by planning.

## Shared Constraints

- The source basis is local checkout `e8b7d77688302ea8de9c15bc97f1af8cbb638326`, inspected on 2026-09-18.
  The user selected an operator API and browser admin page. There is already a global `domains` table with
  `isVerificationForbidden`, a read-only `DomainPolicyService`, and an existing platform console. Batch admission
  is separate from single admission, but both now use the same execution runner. The older plan's claim that
  batch still uses the old orchestrator has been corrected.
- Authorization uses the existing `platform:admin` permission. Rules apply to every organization; customer
  owners, admins, and members cannot manage them. Browser navigation follows a server-derived capability;
  server permission checks remain authoritative.
- Match the recipient domain exactly after shared lowercase IDNA hostname normalization. A rule for
  `example.com` does not cover `team.example.com`, an MX hostname, or a discovered synonym. Unicode and ASCII
  spellings of the same internationalized hostname resolve to one rule. No wildcards, regular expressions,
  suffix matching, organization overrides, or external DNS calls are introduced for policy lookup.
- A missing rule allows verification. Setting the flag false removes only this stored prohibition; it does not
  bypass syntax validation, existing fixed hostname bans, other authorization, or credit requirements. Preserve
  unrelated technical fields on the `domains` row.
- New single submissions check policy before cache reuse, shared-execution attachment, or funding. Existing
  idempotency keys replay their original operations and existing owned result/status reads remain available.
  Newly resolved batch addresses follow the same policy before cache, sharing, or funding; blocked rows remain
  downloadable as failures with zero charge, preserving original order and duplicates.
- Every execution attempt reads the current policy before mailbox verification, including retries and batch
  executions. A policy-read failure permits no outbound work. A prohibition cancels queued work through
  recoverable credit release. The successful policy read immediately before a mailbox attempt is its boundary:
  a concurrent policy update may let that already-started attempt finish. Committing a rule does not abort an
  active SMTP session or reverse an already-persisted capture or release decision.
- Admission outcomes already recorded for a batch remain stable across worker retries; existing cached results
  are not erased by a later rule. Removing a restriction never automatically resubmits failed work. Operators
  and customers explicitly start any later request under the current policy.
- Email verification owns policy matching, management, and persistence. Use small application ports and
  infrastructure adapters; keep controllers limited to transport concerns. Credits retains ownership of
  reservations and capture. Do not introduce a generic policy engine, a second verification pipeline, a raw
  database administration UI, or an identity audit-table dependency.
- Keep raw domain names and input addresses out of operational logs, telemetry, and persistent browser storage.
  Authorized operator responses and the transient management UI necessarily show the managed names. API path
  logging must redact the domain parameter, including encoded variants. Reuse request IDs for diagnostics.
- Reuse `DESIGN.md`, `UX-CONTRACT.md`, and existing platform-console components. Confirm global changes in the
  existing dialog, keep server reads authoritative, and reconcile uncertain writes before another action. Do
  not silently retry mutations or treat a timeout as proof that a policy change failed.
- Extend the existing async and batch Bruno workflows for enforcement. The operator management API is a distinct
  new workflow with its own bounded collection, fixture ownership, and cleanup. Each implementation PR owns its
  focused success, rejection, authorization, concurrency, and recovery tests. Stub, PostgreSQL, live API, and
  browser evidence remain distinct; no production failure-injection endpoint is needed.
- Add no migrations, backfills, production rollout, or production recovery work. The new batch admission enum
  uses TypeORM synchronization against disposable development data with the owning plan's explicit reset and
  reseed procedure. Preserve other checkouts and runtime stacks.
- Follow root `AGENTS.md` for issue assignment and project status when implementation starts, and for the
  conventional commit title, assigned PR, and issue closing link when publishing it. This planning request
  changes local Markdown only; it does not publish issues, create PRs, or change stored policy.

## Related Plans

- [Verification billing hardening](../verification-billing-hardening/README.md)
- [Batch verification hardening](../batch-verification-hardening/README.md)
- [Frontend platform workflows](../frontend/README.md)

The [customer profile](../../../docs/product/ideal-customer-profile.md) remains a working hypothesis. These plans
deliver an operator control over existing verification, without adding outreach, consent, or deliverability claims.
