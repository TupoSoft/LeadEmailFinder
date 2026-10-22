# Accept Only Configured SMTP Recipients

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.

## Purpose / Big Picture

A developer can configure two fixture addresses as accepted while other addresses receive an exact
missing-recipient response. The same unchanged configuration supports positive and negative verification
results through the real DNS, proxy, and trusted SMTP path. Selecting the existing default scenario restores
the ordinary acceptance behavior.

The intended commit and PR title is `feat(smtp-dev): support explicit recipient allowlists`.

## Progress

- [ ] 2026-09-18: Implement atomic allowlist configuration and recipient decisions with focused transport tests.
- [ ] 2026-09-18: Extend the existing Bruno collection and its launcher validation and cleanup.
- [ ] 2026-09-18: Document usage and recovery, run focused validation, and record the results.

## Plan dependencies

None.

## Surprises & Discoveries

None yet.

## Decision Log

- 2026-09-18, Codex: Extend `smtp-evidence`, which already serves the trusted fixture. The selected approach
  implements the user's request without replacing the SMTP server or changing application classification.
- 2026-09-18, Codex: Add one explicit scenario to the existing private control endpoint. Preserve the default
  acceptance behavior. Configuration at startup, persistence, and a second control endpoint are unnecessary.
- 2026-09-18, Codex: Match complete lowercase addresses, following the application's address normalization.
  Membership is literal; dots, plus tags, domains, and aliases remain distinct.
- 2026-09-18, Codex: Keep permanent temporary-rejection memory ahead of allowlist decisions. An older queued
  retry must not become accepted merely because a later test changes the global scenario.
- 2026-09-18, Codex: Deliver fixture behavior and Bruno coverage together. This avoids separating a new HTTP
  configuration contract from the tests required by root `AGENTS.md`.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The planning checkout is `3101967b1939fce191a88576e55ff751da76dd33`. The product profile in
`docs/product/ideal-customer-profile.md` is a working hypothesis. This development fixture supports testing
address verification; it makes no claim about actual mailbox delivery or customer demand.

`docker/compose.smtp-dev.yaml` runs the Node service `smtp-evidence` at `smtp.lef.test:2525` with a private
HTTP control endpoint on port `8025`. The certificate and trust configuration already support STARTTLS.
`docker/smtp-dev/coredns/lef.test.zone` routes both `lef.test` and `evidence.lef.test` to this server.
The separate `plaintext-mailpit` service exercises rejection of insecure SMTP and is unaffected.

`docker/smtp-dev/evidence-server.mjs` exports `createEvidenceFixture`, `EVIDENCE_SCENARIOS`, and the reserved
`EVIDENCE_CONTROL_LOCAL_PART`. Its `PUT /scenario` accepts a closed scenario name; `POST /reset` restores
`default` and clears counters. In `default`, fresh recipients and the control are accepted. Other scenarios
reject the control with `550 5.1.1 No such user` and choose one response for ordinary recipients.
The process retains a set of greylisted recipients across scenario changes and resets. Only a process restart
clears that set. Configuration is global and is consulted for each SMTP command.

`docker/smtp-dev/evidence-server.test.mjs` already drives real local SMTP sockets through STARTTLS.
`bruno/smtp-dev` has 47 numbered requests. Requests 31 through 47 test evidence and restore the baseline.
`scripts/bruno/run-collection.mjs` checks ownership, runs Bruno inside the API container, and requires the
registered request count. Its tests compare this count with the collection and require consecutive sequences.
The SMTP branch currently has no `finally` block to reset the fixture.

The verification contract in `src/libs/modules/email-verification/README.md` requires an accepted target and
a conclusively missing control for positive evidence. Exact `5.1.1` on the target provides negative evidence.
Application results and SMTP evidence can be reused for up to 24 hours. The existing collection also leaves a
temporary rejection pending, with a reserved credit. A fixture reset changes neither persisted evidence nor
credit reservations. The full collection therefore already requires fresh disposable verification data.

## Scope and Non-Goals

Change the fixture server and its tests, append requests to `bruno/smtp-dev`, update its environment and
launcher tests as needed, and update the fixture instructions in `README.md`, `docker/README.md`, and
`bruno/smtp-dev/README.md`. Correct references that still describe the trusted service as Mailpit.

Do not change application modules, public endpoints, evidence policy, credit settlement, authorization,
frontend behavior, DNS records, Compose services, Mailpit settings, or fixture certificates. Do not add a
database migration, persistent configuration, regex filtering, per-session configuration, a new collection,
or a general SMTP server framework. Repairing the full collection's historical-data and pending-retry
limitations is separate work. No live stack needs to change while authoring this plan.

## Plan of Work

First extend `EVIDENCE_SCENARIOS` with `recipient_allowlist`. Keep parsing and validation in small pure
helpers within `docker/smtp-dev/evidence-server.mjs`; keep socket and HTTP handling in the existing adapters.
Represent the scenario and normalized address set as one active configuration. Build a replacement locally
and assign it only after complete validation, so a request cannot expose a partially updated list.
Preserve the existing factory, accessors, counters, and legacy scenario request shapes.

Implement the control contract below. When leaving allowlist mode, discard its list. Apply the existing
missing-sender and sticky-greylist decisions before the new mode. In allowlist mode, always reject the
reserved control and return `250 OK` only for listed addresses; otherwise return `550 5.1.1 No such user`.
Normalize greylist insertion, greylist lookup, and reserved-control identification to lowercase as well.
An uppercase spelling must not bypass an earlier temporary rejection or the reserved-control rule.
Do not introduce a new logger or include submitted addresses in errors or counters.

Extend `docker/smtp-dev/evidence-server.test.mjs` with multiple recipients in one connection, parallel
connections under unchanged configuration, case handling, exact membership, empty lists, replacement lists,
malformed configuration, size boundaries, reset, and sticky-greylist regressions. Assert exact SMTP replies
after STARTTLS. Test that invalid requests preserve both the active scenario and membership.

Next append nine allowlist requests after the current request 47, preserving earlier requests and assertions.
Use sequences 48 through 56 in this order:

1. Read the current platform balance.
2. Increase it by two.
3. Select an allowlist.
4. Submit an invalid replacement and expect `400`.
5. Submit an oversized replacement and expect `413`.
6. Verify one listed address.
7. Verify one unlisted address.
8. Confirm the balance has returned to the value read at 48.
9. Restore the default scenario.

Generate a UUID once with `require('node:crypto').randomUUID()` in the new section and store it with
`bru.setVar`. Derive `allow-<UUID>@evidence.lef.test` and `deny-<UUID>@evidence.lef.test`; both local parts
are shorter than 64 bytes. Use these same variables in configuration, requests, and assertions.
Reuse the existing environment URLs and token script; add no committed credentials.

The invalid replacement uses the new scenario with a non-array `allowedRecipients`. The oversized request
contains a JSON string longer than 32,768 bytes. Successful verification after both rejections demonstrates
that neither corrupted the previous configuration. Both verification
requests must execute against fresh target addresses and return `201`. Assert the existing public fields:
listed means `exists: true`, `catchAll: false`, and `reason: accepted_email`; unlisted means `exists: false`
and `reason: rejected_email`. Both responses must report `operation.source: fresh` and
`operation.billing: {state: settled, reserved: 1, charged: 1, reason: conclusive}`. Use the separate balance
read to prove exactly two credits were captured. The control for `evidence.lef.test` is already
conclusively missing in the earlier evidence section and remains missing throughout allowlist mode.
Do not request or expose internal evidence fields that the HTTP contract does not publish.

Change the SMTP registry count to 56 and extend `scripts/bruno/run-collection.test.mjs` for the added
request sequence, parsed YAML, variable reuse, and executed-report expectations. Reset before the SMTP
collection starts so a previous manual selection cannot break its baseline requests. After ownership has
been established, send `POST /reset` from the owned API container to `http://smtp-evidence:8025/reset`.
Wrap the SMTP collection execution with another reset in `finally`, even when the collection fails.
Bound each reset fetch to five seconds and its Docker child process to ten seconds. Check each reset's
`204` response. Reset failure
must make the launcher fail, retaining a sanitized indication of any earlier failure. Follow the existing
failure-diagnostic helpers; never print raw child output, credentials, or addresses. Test success, collection
failure, initial reset failure, final reset failure, timeout, and ownership failure without mutating a real stack.
The normal final Bruno reset
remains useful for direct collection execution; the launcher reset provides failure cleanup.

Finally document configuration, literal membership, temporary state, global scope, reserved control,
greylist precedence, and cache limitations. Include the command below and an example of `POST /reset`.
Explain that the command targets the checkout-owned overlay and must not run concurrently with
other tests using the same fixture. Keep startup and teardown instructions consistent with current networking.

## Interfaces and Dependencies

The new valid request is:

```http
PUT /scenario
Content-Type: application/json

{"scenario":"recipient_allowlist","allowedRecipients":["alice@evidence.lef.test","bob@evidence.lef.test"]}
```

Return `204` with no body on success. `allowedRecipients` is required in this mode and must contain at most
100 submitted entries. Each entry is a plain ASCII address of at most 254 characters, with a local part of
1 to 64 characters from letters, digits, dot, underscore, plus, and hyphen. Dots cannot lead, trail, or repeat.
The domain has at least two nonempty labels of at most 63 ASCII letters, digits, or hyphens each; a label
must begin and end with a letter or digit. Reject whitespace rather than trimming it. Reject display names,
angle brackets, wildcards, quoted local parts, Unicode, and the reserved control local part regardless of case.
This intentionally small fixture syntax is not a replacement for the application's email parser.

Normalize valid addresses with lowercase conversion and deduplicate them. The 100-entry limit applies before
deduplication. An empty array is valid and rejects every recipient. Extra fields retain the existing endpoint's
ignored-field behavior; legacy scenarios retain their existing request contract and ignore `allowedRecipients`.
Switching back to allowlist mode requires a fresh valid list. Repeated identical updates are idempotent.

Malformed JSON, unknown scenarios, or invalid allowlist values return `400` without changing active state.
Limit `/scenario` bodies to 32,768 bytes; larger bodies return `413` without changing state.
Stop retaining body chunks once the limit is exceeded and handle remaining data without an unhandled error.
Responses contain no submitted values. `POST /reset` still returns `204`, clears counters, and selects
`default`, while preserving previously greylisted recipients.

There are no new libraries, environment variables, public application contracts, or infrastructure services.
The global configuration is replaced atomically between event-loop callbacks, and each recipient decision
reads one configuration. Configuration updates can affect later commands in an open connection, as existing
scenario changes do; tests and operators must serialize mutations. Unchanged configuration supports concurrent
SMTP connections. The public API's authorization and credit prerequisites remain unchanged.

Example for the existing overlay, after the implementation is available:

```bash
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml exec -T smtp-evidence \
  node -e 'fetch("http://127.0.0.1:8025/scenario", {method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({scenario:"recipient_allowlist", allowedRecipients:["alice@evidence.lef.test","bob@evidence.lef.test"]})}).then(r=>{if(r.status!==204)process.exit(1)}).catch(()=>process.exit(1))'
```

## Acceptance Criteria

- One unchanged list accepts two configured addresses and rejects an unlisted address and the control with
  exact `550 5.1.1` replies. Multiple recipients and parallel sessions behave consistently.
- Matching ignores ASCII case but preserves dots, plus tags, and the complete domain. Duplicates are harmless;
  an empty list rejects all fresh recipients; replacement removes prior membership.
- Every specified invalid value returns `400`, and a body above 32,768 bytes returns `413`. Boundary tests cover
  100 versus 101 entries, local lengths, label lengths, and bodies at and above the byte limit. Rejection preserves
  the active configuration. The reserved control cannot be added even with uppercase spelling.
- Every existing scenario, sender rejection, STARTTLS behavior, and connection-close behavior retains its
  existing response. A previously greylisted address remains temporarily rejected even if listed, reset,
  or submitted with different capitalization.
- Reset restores acceptance for fresh recipients and clears counters and the list. Fixture ports stay private,
  and no address or raw envelope data is added to logs, errors, counters, or launcher diagnostics.
- All 56 Bruno requests execute on the documented disposable stack. The new listed and missing targets return
  the expected public results, consume exactly two credits, and preserve the previous invalid-update contract.
- The launcher resets the fixture before execution and after success or failure, fails on an unsuccessful
  or stalled reset within the specified timeout, and performs no
  control mutation if ownership validation fails. Existing full-suite data prerequisites remain documented.
- Focused tests, architecture validation, and plan validation pass. Missing runtime
  prerequisites are reported as unverified runtime coverage, never as a passing Bruno run.

## Validation

Run these focused checks from the repository root after implementation:

```bash
node --test docker/smtp-dev/evidence-server.test.mjs docker/smtp-dev/compose-network.test.mjs
node --test scripts/bruno/run-collection.test.mjs scripts/bruno/failure-diagnostic.test.mjs
corepack pnpm exec eslint docker/smtp-dev/evidence-server.mjs docker/smtp-dev/evidence-server.test.mjs scripts/bruno/run-collection.mjs scripts/bruno/run-collection.test.mjs
corepack pnpm architecture:check
corepack pnpm exec jest --runInBand scripts/plans/execplan.spec.ts scripts/plans/execplan-repository-fixture.spec.ts
git diff --check
```

Run `corepack pnpm bruno:smtp-dev` only against a provisioned, checkout-owned disposable stack with the SMTP
overlay and fresh verification data, following `bruno/smtp-dev/README.md`. It executes the pinned
`bru run --env local --sandbox developer` inside the API container and must report 56 executed requests
with passing assertions and no skips. Record this result separately from socket tests and static YAML checks.
Exercise a simulated runner failure in automated tests to prove cleanup. Manually stopping unrelated
containers or resetting the user's development database is not a validation step.

## Idempotence and Recovery

Repeating a valid configuration request replaces the same temporary state. Switching scenarios discards the
list. `POST /reset` restores the baseline without deleting application data; restarting the owned fixture
also clears its in-memory greylist. Restart only when pending temporary-rejection work cannot be accidentally
accepted afterward. Do not restart the fixture merely to make a queued retry pass.

The new Bruno addresses vary per execution. This avoids reusing their settled target results, but does not
make the earlier collection repeatable against retained history. Its fixed addresses, control evidence, and
pending reservation still require the existing disposable-data procedure. Do not clear shared Redis keys,
change evidence timestamps, overwrite credit reservations, or reset a live database to bypass those constraints.
For an interrupted test, stop other fixture users, restore the default scenario, inspect outstanding work,
and repeat against the documented disposable environment. The launcher reports failed resets explicitly.

To undo the implementation, restore the previous fixture source and collection together on an isolated stack.
There is no schema or persisted fixture configuration to reverse. Historical verification evidence does not
change when code or configuration changes; use fresh disposable verification data for comparison.

## Artifacts and Notes

Planning inspected the fixture, Compose topology, DNS zone, existing transport tests, Bruno requests, launcher,
and verification evidence contract. No live service or application behavior was changed during planning.
Record implementation commits, exact test results, Bruno execution counts, and any unavailable runtime checks
here when work begins. Follow root `AGENTS.md` to find the synced issue by `smtp-recipient-allowlist/01`, assign
it, and update project status before implementation; include its closing link when opening the implementation PR.

## Plan readiness

Ready to implement
