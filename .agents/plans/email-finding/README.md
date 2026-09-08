# Email Finding Road Map

Each ExecPlan follows `.agents/PLANS.md` and delivers exactly one implementation pull request. This road map adds
first name, last name, and company domain lookup through the API and the existing web application.

## Order and Dependencies

| Key | Implementation task | Dependencies |
| --- | --- | --- |
| `email-finding/01` | [Generate a bounded set of email candidates](01-generate-email-candidates.md) | None |
| `email-finding/02` | [Run durable email finding within a credit budget](02-run-durable-email-finding.md) | `email-finding/01`, `verification-billing/04` |
| `email-finding/03` | [Publish the email finding API](03-publish-email-finding-api.md) | `email-finding/02` |
| `email-finding/04` | [Find an email in the web application](04-find-email-in-web-app.md) | `email-finding/03`, `frontend/11` |

Plan 01 can start independently while verification billing is implemented. Plan 02 depends transitively on the
conclusive evidence, credit reservation, operation recovery, cache, and admission contracts in
`verification-billing/01` through `/04`. Those contracts are planned, not implemented in the authoring checkout.
Plans 03 and 04 expose the completed workflow in sequence. Dependencies determine order; readiness means that an
individual plan has enough decisions to implement. Scheduling and assignment remain human-controlled.

## Shared Constraints

- Keep the workflow private to the `email-verification` business module. Its public barrel continues to export
  only `EmailVerificationModule`. Application services own generation, orchestration, and interpretation; small
  ports isolate persistence, queue delivery, clocks, and the existing verification operations.
- Generate at most 16 unique candidates from the existing patterns, in a fixed versioned order, using exactly the
  submitted domain. Define normalization and unsupported input explicitly. Add no scraping, domain expansion,
  purchased contact data, new account-discovery provider, CSV finding, or learned pattern database.
- Use the conclusive SMTP evidence policy from `verification-billing/01`. One positive and all other candidates
  conclusively negative produce `matched`; two or more positives produce `ambiguous`; all candidates conclusively
  negative produce `no_match`; unresolved or untested candidates otherwise produce `inconclusive`. A match is
  evidence about a generated address, not proof of the person's identity or ownership. No match refers only to
  these patterns. Return observed evidence and coverage instead of a numerical confidence score.
- Finder-owned fresh executions use SMTP only. Existing account-discovery configuration and approvals remain
  unchanged. A follower may consume conclusive SMTP evidence from an already active verification, but must not
  initiate provider discovery or take over that execution's policy.
- Retain the existing verification-billing policy: each newly conclusive candidate, including a confirmed missing
  mailbox, costs one credit; reusable complete results and followers cost zero. Add no search-level fee. Require
  an explicit `maxCredits` from 0 through 16, process one candidate at a time, and never exceed that bound. A search
  may cost several credits even when no match is found. Stopping for funding or deadline preserves
  settled candidate evidence and labels incomplete coverage honestly.
- Use durable parent and child identities, organization-owned records, UUIDv7 request replay, and confirmed
  settlement. A queue completion is not sufficient for a completed result. Search replay returns its original
  recorded charges. Normal verification and finding share execution permits and eligible cached results.
- Bound outbound work to 15 minutes by default, including queue delay, with real adapter cancellation. Recovery
  of an uncertain financial settlement may continue beyond that work deadline. A search never releases funds or
  cancels shared execution that it does not own.
- Keep names, domains, and candidate addresses out of URLs, operational logs, analytics, and persistent browser
  storage. Queue payloads contain opaque identifiers only. Document new storage and writers in the existing
  processing contract, with explicit integration ownership for pending privacy lifecycle plans.
- Reuse the approved web design, generated same-origin client, permissions, session boundary, and polling behavior.
  The form states the maximum possible charge before submission; results show authoritative actual charges.
- Use disposable development data with TypeORM synchronization and the existing guarded reset and reseed workflow.
  Add no migrations, backfills, production rollout, or new deployment topology. Each plan names focused tests;
  HTTP changes receive Bruno coverage and actual runtime evidence is reported separately.

## Related Plan Boundaries

`verification-billing/05` and `/06` continue to own batch accounting and changes to existing verification screens.
They are not prerequisites for a single-person finder. This feature does not change their pricing contract.
`privacy-compliance/07` owns physical retention and `/08` owns the broader writer and disposition contracts; finder
implementation records its new resources for those owners without claiming their unimplemented controls work.
The existing `frontend/11` workflow remains the owner of supplied-address verification.
