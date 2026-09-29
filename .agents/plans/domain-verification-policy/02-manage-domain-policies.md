# Manage Global Domain Verification Policies

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let an authenticated platform operator inspect, forbid, and allow verification for a particular domain through
a bounded HTTP API. A policy applies globally to the exact canonical domain. After setting a prohibition, a
new verification request in any organization is rejected by the prerequisite enforcement work. Allowing the
domain restores ordinary admission without altering historical results or other technical domain properties.
This API supplies the browser administration page in `domain-verification-policy/03`.

## Progress

- [ ] (2026-09-18) Implement the policy management service and atomic persistence contract.
- [ ] (2026-09-18) Add permission-protected HTTP endpoints and generated API contracts.
- [ ] (2026-09-18) Validate authorization, concurrency, persistence, logging, and the operator workflow.

## Plan dependencies

- `verification-billing-hardening/02`
- `domain-verification-policy/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Manage exact canonical domains globally using the existing `domains.isVerificationForbidden` field.
  Rationale: the existing policy is shared technical state; organization ownership and suffix matching would
  introduce different policies. Date/Author: 2026-09-18, Codex planning.
- Decision: Offer forbidden-domain listing, effective-policy lookup, and an idempotent Boolean setter.
  Rationale: these operations support the requested API and browser page without generic domain CRUD.
  The first PUT materializes a row even when setting false; identical writes preserve timestamps.
  Date/Author: 2026-09-18, Codex planning.
- Decision: Preserve ordinary request-ID logging, with domain values redacted, and add no audit-history table.
  Rationale: immutable audit history is outside this feature, and identity's entity exports are for test fixtures,
  not a production persistence integration. Date/Author: 2026-09-18, Codex planning.
- Decision: Expose controls only after all admission paths and execution attempts enforce policy.
  Rationale: a saved prohibition must not leave batch verification as a bypass.
  Date/Author: 2026-09-18, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Paths below start at `src/libs/modules/email-verification/src/` unless otherwise qualified.
`application/domain-policy.service.ts` reads `DomainStore.findByName()` and treats an absent row as allowed.
`infrastructure/persistence/typeorm-domain.store.ts` maps the exact text primary key to a domain policy.
`infrastructure/persistence/typeorm/domain-policy.entity.ts` owns the shared `domains` table, including
`catchAllEnabled`, `isFree`, `isDisposable`, `mxRecords`, and timestamps. It has no organization column.
There is no policy writer, listing port, or management controller in the inspected checkout.

The prerequisites introduce durable policy enforcement and the shared
`domain/verification-policy-domain.ts` function `normalizeVerificationPolicyDomain(input: string): string`.
It trims outer whitespace, removes one trailing root dot, converts IDNA to lowercase ASCII, and rejects controls,
URL syntax, IP literals, wildcards, malformed labels, and excessive lengths. Invalid input throws a fixed
`DomainPolicyInputError` without including the input. Reuse that function rather than importing candidate-finding
normalization or changing normalized email identities. Matching ignores discovered synonyms and MX domains.

`api/http/email-administration/email-administration.controller.ts` demonstrates `PermissionsGuard` and
`RequirePermissions('platform:admin')`. Human permissions come from membership roles; service credentials need
an explicit grant. `src/libs/modules/bff-session/src/api/browser-session-mutation.guard.ts` already requires
valid Origin and CSRF data for human-session mutations while accepting authorized M2M requests without browser
CSRF. Root API composition applies these guards; reuse that wiring.

## Scope and Non-Goals

Deliver one PR titled `feat(verification): manage operator domain policies`. Include the private application
contract, TypeORM adapter, HTTP routes, generated schemas, focused tests, and operator API documentation.
The browser page belongs to plan 03. Do not add organization overrides, wildcard rules, subdomain inheritance,
MX-provider blocking, synonym expansion, bulk writes, expiry rules, audit history, or a separate CLI.
Do not modify billing, static email-validation restrictions, or historical result access. This feature makes
no new market claim beyond the working context in `docs/product/ideal-customer-profile.md`.

## Plan of Work

Read the business-module architecture instructions, module README, and repository PostgreSQL skill before coding.
Add `application/domain-policy-management.service.ts` and
`application/ports/domain-policy-management-store.ts`. The framework-independent service normalizes domain
inputs, applies list bounds, and projects the small response. The management port exposes only `findPolicy`,
`listForbidden`, and `setForbidden` over canonical domains. Leave the enforcement read port narrow. Implement the
management port in `infrastructure/persistence/typeorm-domain-policy-management.store.ts` using a TypeORM `DataSource`.

For `setForbidden`, start a short transaction, insert the canonical domain with its requested Boolean using
`ON CONFLICT DO NOTHING`, then lock the row with `SELECT ... FOR UPDATE`. Change an existing row only when its
Boolean differs from the requested value. Update that flag and `updatedAt` together, preserving `createdAt` and
every unrelated column. Return the projection observed inside the transaction after commit succeeds. Repeated
same-value writes must not call an unconditional TypeORM save that advances `updatedAt`. The primary-key conflict
and row lock serialize concurrent first writes without catching a unique violation inside an aborted transaction.
Perform no DNS, SMTP, account-discovery, or other network call inside the transaction.

Listing selects only forbidden rows and fetches at most `limit + 1` records. Order canonical domain IDs ascending
using PostgreSQL's `C` collation, with the same collation in the strict `id > after` predicate. Return at most
`limit` items. Set `nextAfter` to the final returned item only when the extra record exists. Do not add a count
query, offset pagination, or unbounded default. Pages reflect current committed state: concurrent additions before
the cursor appear after refresh, and an unblocked cursor domain remains a valid boundary. Use the existing key
for this small administrative dataset; do not claim index performance without measurement.

Add `api/http/domain-policy-administration/` with controller, request DTOs, response DTOs, and HTTP integration
tests. Register service and adapter in `infrastructure/email-verification-core.module.ts` and controller in
`email-verification.module.ts`. Keep these contracts private. Require `platform:admin` on the whole controller,
and declare the static listing route before `:domain`. No request field may choose an organization or authority.
Use route-local strict validation because root `ValidationPipe()` does not reject unknown fields. Reject unknown
body/query properties, arrays, missing values, Boolean strings, and invalid domains without coercion. Convert only
the documented integer `limit` query representation. Normalize path and cursor domains with the shared function.
Storage failures return the API's generic server error, never a successful default-allowed response.

Add `domain-verification-policies` to sensitive route values in
`src/lead-email-finder-api/src/pii-safe-logger-options.ts`. Extend tests for ordinary, encoded, and nested encoded
path values. Preserve `X-Request-ID`, safe status/duration logs, and query stripping. Do not log domain names,
request bodies, provider details, or actor identities as new events. Responses use `Cache-Control: no-store`;
storage failures do not echo exception details. Do not call these operational logs an immutable audit trail.

Document all endpoints in OpenAPI, including human-session and M2M alternatives, browser mutation CSRF, bounded
pagination, and missing-policy defaults. Add the three management operations to `BROWSER_OPERATIONS` in
`src/lead-email-finder-api/src/openapi/browser-document.ts` and extend its OpenAPI tests plus
`scripts/openapi/contracts.test.mjs`; this API PR owns their browser-contract inclusion. Regenerate
`packages/api-client/openapi/lead-email-finder.json` and
`packages/api-client/src/schema.d.ts` through existing commands. Update
`src/libs/modules/email-verification/README.md` with management responsibility, private ports, global scope,
HTTP surface, and validation references. Do not hand-edit generated contracts.

Add a distinct `bruno/domain-verification-policies` collection for this management workflow. Reuse owned-stack
discovery, credential bootstrap, and platform/customer token handling from `scripts/bruno/run-platform-credits.ts`.
Add a launcher and package command `bruno:domain-verification-policies`; verify the same Bruno version and require
a nonzero, fully executed report. Use unique run-owned `.test` domains, prove absence before creation, and track
only those keys for cleanup. Never toggle an existing operator domain. Reject foreign or unverified stack
metadata. Restore no unrelated domain or balance; leave verification collections' owned fixtures intact.

## Interfaces and Dependencies

All endpoints require `platform:admin`. Authentication failure is `401`; an authenticated principal without the
permission receives `403`. Validation failure is `400` with no submitted-domain echo.

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `GET /v1/domain-verification-policies` | Optional `limit`, default 50, integer 1 through 100; optional `after` domain | `200 { items, nextAfter }`, containing only forbidden policies |
| `GET /v1/domain-verification-policies/:domain` | Domain path value | `200 { domain, isVerificationForbidden, updatedAt }` |
| `PUT /v1/domain-verification-policies/:domain` | `{ "isVerificationForbidden": boolean }` | `200 { domain, isVerificationForbidden, updatedAt }` |

`domain` is canonical lowercase ASCII. Missing lookup returns false and `updatedAt: null`; stored records return
an ISO timestamp. Every listing item has `isVerificationForbidden: true` and a non-null timestamp. `nextAfter` is
the canonical final returned domain when another page exists, otherwise null. Empty listing returns an empty
array and null. First PUT creates the technical row, including when setting false. Unblocking retains it.

The setter assigns explicit state, with no Idempotency-Key requirement or request receipt table. Concurrent
opposite assignments serialize; the last committed assignment wins. It does not provide compare-and-set or protect
a later change from a deliberately repeated older assignment. After an unknown HTTP outcome, clients read current
policy before deciding whether to mutate again. A browser abort does not prove the transaction was canceled.
Prerequisite enforcement semantics govern work already running. No new library or identity persistence export is needed.

## Acceptance Criteria

- A permitted human operator and suitably granted M2M credential can list, read, forbid, and allow policies.
  Owners, admins, members, and service credentials lacking `platform:admin` receive `403` without writes.
- Missing lookup returns false/null. Equivalent supported IDNA/case/root-dot inputs identify one row and policy.
  Malformed domains, wildcards, invalid limits, and extra fields return `400` without effects.
- Repeated PUT requests with the same value preserve timestamps and unrelated properties. Concurrent creation produces exactly one row;
  concurrent opposite writes yield complete committed state without lost technical metadata.
- Forbidden listing obeys default and maximum limits, ordering, and cursors. A stable dataset has no duplicates
  or omissions, including when the previous cursor domain was unblocked between requests.
- API prohibitions block new sync, async, and batch work through prerequisite behavior. Allowing restores
  eligibility; retained results, static hostname validation, and billing retain their existing contracts.
- Browser PUT without valid Origin or CSRF is rejected. Authorized M2M PUT needs no browser CSRF. Generic logs
  retain request IDs and sanitized routes without raw or encoded domain values.
- Storage failure is an error rather than an allowed policy. Generated contracts match HTTP responses. Required
  focused, real-PostgreSQL, architecture, and owned-stack Bruno checks pass.

## Validation

Add concurrency cases to existing `infrastructure/persistence/verification-billing.integration.spec.ts` so the
owned disposable PostgreSQL launcher executes them instead of silently skipping a new suite. Cover insert races,
opposite assignments, no-op timestamps, preserved fields, Unicode equivalence, and actual database ordering.
Add service and adapter unit tests and HTTP tests with global auth and browser mutation guards. Extend logger
tests with encoded policy paths. Run these commands from the repository root after implementation:

```sh
corepack pnpm test -- domain-policy-management.service.spec.ts typeorm-domain-policy-management.store.spec.ts domain-policy-administration-http.integration.spec.ts --runInBand
corepack pnpm test -- pii-safe-logger-options.spec.ts bff-session-guard-wiring.integration.spec.ts --runInBand
corepack pnpm test:verification-billing-postgres
corepack pnpm test -- browser-document.openapi.spec.ts --runInBand
node --test scripts/openapi/contracts.test.mjs
corepack pnpm exec eslint src/libs/modules/email-verification/src/application/domain-policy-management.service.ts src/libs/modules/email-verification/src/application/ports/domain-policy-management-store.ts src/libs/modules/email-verification/src/infrastructure/persistence/typeorm-domain-policy-management.store.ts src/libs/modules/email-verification/src/api/http/domain-policy-administration src/lead-email-finder-api/src/openapi/browser-document.ts src/lead-email-finder-api/src/pii-safe-logger-options.ts
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm bruno:domain-verification-policies
corepack pnpm bruno:async-verification
corepack pnpm bruno:batch-verification
node --test scripts/bruno/domain-verification-policies-runner.test.mjs
corepack pnpm docs:lint -- .agents/plans/domain-verification-policy/02-manage-domain-policies.md src/libs/modules/email-verification/README.md bruno/domain-verification-policies/README.md
```

The new launcher runs `bru run --env local` with temporary environment values and report redaction. Cover the
block/read/list/repeat/unblock workflow, unauthorized/customer requests, invalid inputs, and verification policy
effects using dedicated test-owned domains. If the owned stack is unavailable, perform available static checks
and report Bruno as unverified. This document claims no implementation or runtime validation result.

## Idempotence and Recovery

The canonical primary key and locked setter make repeated assignments safe. A prohibition remains until an
authorized false assignment commits. A read failure must not return false. Reconcile uncertain mutation delivery
through policy lookup. During cleanup, delete only exact domains created by that test run after verifying ownership.
Keep credentials in ignored fixture files or process environment; never commit tokens or passwords.
No schema change, migration, backfill, or reset is required. Existing fixture bootstrap commands remain
authoritative; add no domain seeding to normal startup. Follow the root issue-assignment and project-status
workflow before implementation. Planning alone does not publish or update external records.

## Artifacts and Notes

The user selected both operator API and browser administration. This PR supplies the backend contract for plan 03
without changing frontend files. Keep response envelopes synchronized across those plans. Identity retains its
audit persistence boundaries. Safe request correlation is operational evidence, not immutable change history.
The explicit state setter and exact-domain scope are deliberate limits.

## Plan readiness

Ready to implement
