# List Recent Single Verification Requests

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An organization member with `verification:read` can discover recent single verification requests without knowing
their IDs. `GET /v1/verification-history/single` returns a bounded page of synchronous and asynchronous submissions,
newest first, with an address and current status. Each ID opens the existing single verification detail page.
This plan delivers one PR: `feat(email-verification): list recent single verifications`.

## Progress

- [ ] (2026-09-18) Add the organization-scoped history reader, bounded cursor contract, and supporting index.
- [ ] (2026-09-18) Expose the authenticated endpoint and reuse existing operation status semantics.
- [ ] (2026-09-18) Add focused persistence, HTTP, OpenAPI, and Bruno coverage.
- [ ] (2026-09-18) Run validation and update the module documentation and this plan with observed outcomes.

## Plan dependencies

- `verification-billing-hardening/01`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: List request records, including synchronous submissions, rather than cached email or result records.
  Rationale: A request identifies one caller submission; several requests can share one result or execution.
  Date/Author: 2026-09-18, Codex.
- Decision: Discover submissions created within the preceding seven days. Rationale: A bounded recent-work view
  meets this scope without promising a complete archive. This is distinct from detail access for seven days after
  settlement and from physical deletion. Date/Author: 2026-09-18, Codex.
- Decision: Use separate single and batch endpoints with one cursor format. Rationale: Their durable discovery
  sources differ, while the frontend needs the same bounded navigation behavior. Date/Author: 2026-09-18, Codex.
- Decision: Keep status reads live and return `unavailable` for a discoverable request whose detail is unavailable.
  Rationale: Pagination cannot guarantee a database snapshot across settlement, expiry, or deletion.
  Date/Author: 2026-09-18, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The email-verification module owns this behavior. Paths in this paragraph are relative to its
`src/libs/modules/email-verification/src/` directory. `infrastructure/persistence/typeorm/verification-request.entity.ts`
stores one durable request with its organization, normalized address, delivery mode, creation time, and request UUID.
Delivery modes are `sync`, `async`, `batch`, and `batch_child`. The request UUID is the recovery handle understood by
`GET /verifyAsync/:id`; it differs from the result UUID read by `GET /verifications/:id`.

`application/operations/verification-operations-reader.ts` checks organization ownership, settlement, execution,
result visibility, and the seven-day window after settlement. `application/delivery/async/async-verification-status.ts`
maps those outcomes to `queued`, `running`, `completed`, `failed`, and `unavailable`. A pending request with no execution
reads as queued; a referenced missing execution is unavailable. A settled request with no result is failed; a referenced
result that is missing or not yet visible makes the detail unavailable. Settlement confirmation is enforced by
`infrastructure/typeorm-verification-result-reader.ts`. These distinctions must survive history projection.

The prerequisite adds `admissionState: preparing|ready` and makes a preparing request readable as queued. History
must consume that resulting reader contract rather than mistake preparation for completed admission. It does not
need submitter attribution or any dependency on the separate `verification-submitter` plans.

`packages/api-client/openapi/lead-email-finder.json` and `packages/api-client/src/schema.d.ts` are generated from the
backend DTOs. `bruno/async-verification/` already exercises submission, status, idempotency, and tenant concealment.
The frontend page `/app/verifications/:id` already consumes the operation ID and needs no new detail endpoint.

## Scope and Non-Goals

Add a read-only list endpoint, an internal query port and TypeORM adapter, a supporting index, generated contracts,
focused tests, and documentation. List every organization-owned `sync` or `async` request within the discovery window,
including cache hits, shared requests, pending preparation, and persisted failed requests. An idempotent replay returns
the existing row once. Rejections that never create a request have no history row.

Exclude `batch` and `batch_child` requests. Do not add result searching, email filters, state filters, arbitrary sorting,
totals, billing columns, actor fields, downloads, history writes, retention workers, a new detail route, or a new permission.
Do not change verification, funding, settlement, or deletion policy. The UI and batch discovery are separate plans.

## Plan of Work

Read the root instructions, `src/libs/modules/AGENTS.md`, the canonical module guide, the email-verification README,
and `apps/web/AGENTS.md` before changing generated browser contracts. Apply the SOLID and repository PostgreSQL skills.

Under `application/history/`, add a narrow `SingleVerificationHistoryReader` port and `ListSingleVerificationHistory`
use case. The reader returns bounded organization-owned candidates containing request ID, normalized address, creation
time for display, and the exact database timestamp needed for pagination. Implement it in
`infrastructure/persistence/typeorm-single-verification-history-reader.ts`. Do not extend admission mutation ports
with listing concerns or expose a new business-module barrel export.

Query only `sync` and `async` requests for the authenticated organization. Require `createdAt >= now - 7 days` and
`createdAt <= asOf`; first-page `asOf` comes from the injected `VerificationClock`. Order by `(createdAt, requestId)`
descending and apply the strict tuple predicate before the last returned candidate on subsequent pages. Fetch at
most `limit + 1` rows, return at most `limit`, and derive the next cursor from the last returned row only when the extra
row exists. Avoid `OFFSET`, a total-count query, unbounded result loading, and per-address cache enumeration.

Add a partial TypeORM index over `(organizationId, createdAt, requestId)` restricted to the two included delivery
modes. Preserve the existing address and idempotency indexes. PostgreSQL can scan the ordering backward; do not add a
second index solely for descending order. Preserve the database timestamp's fractional precision in the cursor, using
a raw timestamp representation from the adapter instead of round-tripping the ordering key through JavaScript `Date`.
The public display timestamp can use normal ISO serialization. Test rows within the same millisecond as well as exact ties.

Use the existing `VerificationOperationsReader` for each returned candidate and reuse its established async status
mapping. Hydrate only the selected page, with concurrency capped at ten, and do not hydrate the lookahead row.
`not-found` or `expired` becomes `unavailable` with `email: null`; an explicit unavailable mapping does the same.
Other states expose the candidate's normalized address. Infrastructure failures fail the request using the existing
generic error mapping; do not turn a database outage into a successful empty page or unavailable rows. Keep result
contents, operation billing metadata, internal execution IDs, and failure internals out of the list DTO.

Add a shared framework-independent cursor codec under `application/history/` and transport validation under
`api/http/verification-history/`. Use an opaque base64url encoding of version, organization ID, list kind, `asOf`, page
limit, and optional before tuple. The cursor contains no address, credential, token, or secret. Reject strings longer
than 1,024 characters before decoding and reject malformed encoding, unsupported versions, unexpected fields, invalid
UUIDs or timestamps, invalid tuple order, wrong organization or list kind, and a limit differing from the encoded limit.
Validate the complete timestamp string before passing it as a parameter to SQL. Never interpolate cursor text into SQL.

At each request, require `now - 7 days <= asOf <= now`; invalid or expired cursors return
`400 { code: 'invalid_history_cursor' }`. The database also enforces the current seven-day lower bound independently
of cursor contents. The fixed upper bound excludes newer submissions during forward paging, while expiry, settlement,
or deletion may change later pages. The unsigned cursor is navigation data, never authorization or a snapshot promise.
Plan 02 reuses this codec with list kind `batches`; this plan uses `single`.

Add `verification-history.controller.ts`, DTOs, and focused controller/HTTP/OpenAPI specs under
`api/http/verification-history/`. Register their providers in the module composition root. Require
`verification:read` through the existing guard and derive organization exclusively from `AuthPrincipal`.
Reject duplicate, unknown, or malformed query parameters with `400`; never accept an organization override.
Set `Cache-Control: no-store`. Advertise the route for browser-session and existing service-client authentication.
GET needs no mutation CSRF token and must cause no admission, probe, credit, or queue work.

Regenerate both API artifacts with the existing export and generation commands. Extend the nearest existing Bruno
collection with authenticated history discovery after its synthetic submission, repeat reads, malformed cursor/limit,
unauthenticated access, and tenant isolation. The foreign organization must never receive the synthetic address or ID;
its empty list is a successful `200`, not a missing-resource error. Cover a valid credential without read permission in
deterministic HTTP tests. Update registered collection totals in `scripts/bruno/run-collection.mjs` and its async runner
test when assertions or requests change. Update the module README, Bruno README, and privacy inventory to distinguish
discovery from detail visibility and deletion; do not claim physical retention is implemented.

## Interfaces and Dependencies

The application route is `GET /verification-history/single`, exposed under the existing `/v1` API prefix.
Accepted query parameters are `limit` and `cursor`. Limit defaults to 20 on the first page and must be an integer
from 1 through 100. With a cursor, an omitted limit uses the encoded limit; an explicit different limit is invalid.
Ordinary query validation failures return `400`; cursor failures use the exact code above. Authentication and
permission failures retain the existing `401` and `403` contracts. A successful empty list returns `200`.

The response is `{ items: SingleVerificationHistoryItem[], nextCursor: string | null }`. Every item has required
`id: string` (request UUID), `createdAt: string` (ISO timestamp), `status` (the existing five-state vocabulary), and
`email: string | null`. No additional fields are exposed. The reader and use case remain module-private, Nest and
TypeORM remain in their existing layers, and the existing clock is injected. No new package or configuration is needed.

## Acceptance Criteria

1. Both synchronous and asynchronous submissions appear once, newest first, for their organization; child requests,
   foreign rows, and submissions older than seven days do not appear. Persisted failed requests remain discoverable.
2. Existing status semantics hold for preparing, running, settling, completed, failed, expired, and missing-state
   scenarios. Unavailable entries reveal no address, and reads never trigger verification, billing, or dispatch.
3. Cursor navigation handles exact timestamp ties and microsecond differences without duplicate or skipped stable
   rows. New submissions after `asOf` do not enter later pages. Current expiry still removes old rows.
4. Default, minimum, and maximum limits work; malformed, excessive, cross-organization, wrong-kind, future, expired,
   or limit-mismatched cursors fail as specified. Unknown and repeated query parameters cannot override ownership.
5. Empty authorized lists return `200`; unauthenticated and unauthorized calls fail. Infrastructure errors remain
   errors, the response is not cacheable, and generated contracts expose only the documented fields.
6. Unit, real PostgreSQL, HTTP, architecture, type, and OpenAPI checks pass. Bruno passes with nonzero execution when
   the disposable stack is available; absent runtime evidence is reported separately.

## Validation

Run from the repository root. Add the named new specs alongside their implementation:

```bash
corepack pnpm test -- --runInBand history-cursor.spec.ts list-single-verification-history.spec.ts typeorm-single-verification-history-reader.spec.ts verification-history.controller.spec.ts verification-history-http.integration.spec.ts verification-history.openapi.spec.ts verification-operations-reader.spec.ts async-verification-status.spec.ts
corepack pnpm test:verification-billing-postgres
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm exec eslint src/libs/modules/email-verification/src
node --test scripts/bruno/async-verification-runner.test.mjs
corepack pnpm bruno:async-verification
corepack pnpm docs:lint -- .agents/plans/verification-history/01-list-single-verifications.md src/libs/modules/email-verification/README.md bruno/async-verification/README.md docs/privacy/email-verification-processing-contract.md
```

Extend `src/libs/modules/email-verification/src/infrastructure/persistence/verification-billing.integration.spec.ts`
with two-organization queries, tied and microsecond timestamps, replayed IDs, all delivery modes, exact cutoff
boundaries, deletion between pages, and real index metadata. Inspect `EXPLAIN (ANALYZE, BUFFERS)` on a sufficiently
sized synthetic fixture for the tenant/range/ordering query; do not assert that tiny fixtures must choose an index.
The existing launcher validates a checkout-owned disposable database and rejects skipped execution.

HTTP tests use injected dependencies and prove guards, DTO serialization, error codes, and no-store headers. They
do not prove live PostgreSQL or Redis. The Bruno launcher executes pinned `bru run --env local --sandbox developer`
against the verified checkout-owned stack, restoring its fixture balance afterward. Missing runtime dependencies
must be recorded as unverified; static checks and skipped tests are not substitutes for live execution.

## Idempotence and Recovery

Repeated list reads have no business side effects. An expired cursor is recovered by requesting the first page
without one. Concurrent settlement changes status without changing request identity or ordering. Generated artifacts
can be regenerated after fixing DTOs. No data backfill or production migration belongs in this change.

Use TypeORM synchronization only against disposable development data. The added index requires no destructive reset;
if prerequisite schema changes require one, stop affected workers and use
`corepack pnpm dev:reset -- --confirm-project=LEF` after verifying the checkout-owned targets. That existing flow resets
and reseeds the development stack; never bypass its ownership guard or reset another checkout's data.

## Artifacts and Notes

Planning evidence was inspected on 2026-09-18. Seven days from submission is the new discovery window; the existing
detail window starts at settlement, and privacy-compliance/07 continues to own physical retention. The plan adds no
customer-data store. Bounded per-item status reads deliberately reuse the authoritative detail behavior; a bulk status
projection can be considered later only if measured load justifies its additional consistency surface.

## Plan readiness

Ready to implement
