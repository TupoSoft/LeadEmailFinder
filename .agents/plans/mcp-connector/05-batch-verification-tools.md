# Batch Verification Tools

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, an AI agent can submit a list of email addresses for batch verification, check the batch's
progress, and retrieve its results — without ever needing local filesystem access to a CSV file, since the
connector builds and parses the CSV internally. A developer observes success by submitting a small list of
addresses via `submit_batch_verification`, polling `check_batch_verification` to a terminal state, and retrieving
rows via `download_batch_results`, matching what uploading `bruno/batch-verification/fixtures/sample.csv` directly
and downloading its results would show.

## Progress

- [x] (2026-09-21) Added `uploadBatchCsv`, `getBatchStatus`, and `getBatchResultsCsv` to
  `apps/mcp-server/src/lef-api/client.ts`, typed to `GetBatchStatusResponseDto`'s exact field set; extracted a
  shared `throwMappedError` helper so `getBatchResultsCsv`'s raw-text success path and `parseOrThrow`'s JSON path
  share the same error mapping instead of duplicating it.
- [x] (2026-09-21) Added `csv-parse`/`csv-stringify` to `apps/mcp-server/package.json`, reusing the same versions
  already used by the `email-verification` module.
- [x] (2026-09-21) Created `submit_batch_verification`, `check_batch_verification`, and `download_batch_results`
  tool modules with specs, and registered all three in `create-server.ts`.
- [x] (2026-09-21) Unit-covered all three tools plus the three new `LefApiClient` methods; full suite green (3553
  passed), typecheck and lint clean.
- [x] (2026-09-21) Live-validated against a real dev-stack customer credential via `@modelcontextprotocol/inspector
  --cli`: `submit_batch_verification` with two real addresses, `check_batch_verification` observing the batch
  reach `completed`, `download_batch_results` in two paginated windows (default page and an `offset=1&limit=1`
  window) matching the real result CSV's content and columns exactly, a nonexistent batch id mapping to a clean
  `not_found`, and an empty address list rejected at the protocol level with zero upstream calls.

## Plan dependencies

- `mcp-connector/03`
- `mcp-connector-hardening/02`

## Surprises & Discoveries

- `download_batch_results`'s "not yet available" branch is decided by calling `getBatchStatus` first and checking
  `resultsAvailable`, not by inspecting the download endpoint's own response: `getBatchResults` in
  `batch-email-verification.service.ts` throws the same `BatchEmailVerificationJobNotFoundException` (mapped to a
  plain `404`) both for a batch that genuinely does not exist and for one that exists but is not yet complete —
  the two cases are indistinguishable from that endpoint's response alone. Checking status first, as the plan's
  Plan of Work anticipated as one option, gives a materially clearer message than a generic `not_found`.
  Confirmed this exact status-shares-both-cases behavior by reading `batch-email-verification.service.ts` directly
  rather than assuming from the DTO alone.
  Reusing this session's established fetch-mocking convention, `download-batch-results.spec.ts` discriminates the
  two upstream calls (`/verifyBatch/:id` vs `/verifyBatch/:id/results`) by URL suffix within one `fetchMock`.
- `mcp-connector-hardening/04`'s repository-fixture regression test (`scripts/plans/execplan-repository-fixture.spec.ts`)
  asserted `mcp-connector/07` stays `Backlog` while cloning the *real, currently checked-in* progress of
  `mcp-connector/04` and `mcp-connector/05` themselves (only forcing every other prerequisite complete in memory).
  That assumption silently broke the moment `mcp-connector/04`'s real Markdown progress actually became complete
  (in the immediately preceding PR): the "only mcp-connector/04 is incomplete" scenario stopped forcing 04
  incomplete and instead inherited its real, now-complete state, so the test would have started asserting `Todo`
  wrongly resolved to `Backlog` for the wrong reason (or vice versa) rather than genuinely exercising the missing-
  dependency path. Fixed by adding a `forceIncompleteKeys` parameter to the test's `withCompleted` helper so each
  "only X incomplete" scenario (including the one reproducing the original pre-fix failure, which excludes both
  `mcp-connector/04` and `mcp-connector/05`) explicitly resets that plan to incomplete in memory regardless of its
  real state — making the fixture robust to this plan's own completion, exactly as this PR performs, and to
  `mcp-connector/05`'s completion by this very PR.
- A batch of `@lef.test`-domain addresses (the checked-in Bruno fixture's own domain) verifies inconclusively and
  settles with `creditsCharged: 0` almost immediately, as the module README documents — useful for cheap manual
  verification but not for observing a nonzero charge. `evidence1@lef.test`/`evidence2@lef.test` were used for
  live validation here for exactly that reason (matching the plan's own Artifacts and Notes guidance), and the
  live batch reached `completed`/`resultsAvailable: true` within the polling window on the first check, with no
  intermediate `queued`/`running` state actually observed given how fast this fixture resolves.

## Decision Log

## Decision Log

- Decision: `submit_batch_verification`'s input is `{emails: string[]}`, not a raw CSV string or a file reference.
  Rationale: an agent naturally has a list of address strings in its context, not a local file a remote,
  self-hosted connector could read anyway (there is no customer filesystem for a remote server to access);
  building the single-column CSV internally is a small, mechanical translation the connector should own.
  Date/Author: 2026-09-16, Codex planning.
- Decision: Cap `submit_batch_verification` at 5,000 addresses per call, rejecting anything larger with a clear
  message asking the caller to split the work, rather than relying solely on the underlying API's own 100MB CSV
  size limit. Rationale: 5,000 short email addresses is comfortably under any real size concern but large enough
  for genuine batch use; catching an oversized request at the tool boundary with a clear, specific message is
  better for an agent than a generic upstream rejection deep inside a 100MB multipart upload. This is a client-side
  guard in addition to, not a replacement for, whatever limit the API enforces server-side.
  Date/Author: 2026-09-16, Codex planning.
- Decision: `download_batch_results` parses the CSV server-side and returns capped, paginated JSON rows (default
  page size 200, hard cap 1000 rows per call) with `{totalRows, truncated, nextOffset}` metadata, rather than
  returning the raw CSV text inline. Rationale: a batch can produce a CSV far too large to usefully fit in an
  LLM's context window; returning it as opaque CSV text is also less useful to an agent than structured rows it
  can reason over directly. `check_batch_verification`'s own aggregate `counts` already answers most "how did it
  go overall" questions without needing any row-level data at all — this tool's docstring should point agents
  there first. Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

All three planned tools (`submit_batch_verification`, `check_batch_verification`, `download_batch_results`)
shipped exactly as scoped, backed by three new `LefApiClient` methods reusing plan 03's shared
request/error-mapping infrastructure and a newly extracted `throwMappedError` helper. The three Decision Log
choices (list-of-strings input, the 5,000-address client-side cap, and capped/paginated JSON rows instead of raw
CSV) all worked as designed, verified live: an oversized or empty list is rejected before any upstream call, and
row-level pagination matches the real result CSV exactly for two different offset/limit windows. All acceptance
criteria were met, including a dedicated unit test for comma/quote CSV escaping. The one unplanned finding was
not in the connector itself but in a sibling repository-fixture regression test, whose scenario design implicitly
depended on this plan (and plan 04) staying perpetually unimplemented; fixed in place as a small, self-contained
change so the fixture now stays correct through this plan's own completion and any later one.

## Context and Orientation

All paths below are repository-relative. Read `src/libs/modules/email-verification/README.md` directly for the
exact current batch DTO shapes before implementing.

`POST /verifyBatch/csv` (permission `verification:run`) takes a `multipart/form-data` body with a `file` field
(CSV, up to 100MB, one `email` column) and returns `202` with `{id: string}`. `GET /verifyBatch/:id` (permission
`verification:read`) returns status, progress, per-address `counts`, and `billing` state — see
`GetBatchStatusResponseDto` for the exact current field set (`resultsAvailable`, `counts.*`, `billing.*`, plus the
job status vocabulary already used by single verification). `GET /verifyBatch/:id/results` (permission
`verification:read`) streams the result CSV once `resultsAvailable` is true; its columns are documented in
`S3BatchResultWriter` and the module README (`id`, `email`, `normalizedEmail`, `sourceRow`, `duplicateOfRow`,
`domain`, `localPart`, `format`, `targetExchange`, `mxDomain`, `exists`, `catchAll`, `reason`, `sources`,
`createdAt`, `verificationQuality`, `evidenceObservedAt`, `evidencePolicyVersion`, `verificationStatus`,
`creditsCharged`, `billingReason`).

This plan now also depends on `mcp-connector-hardening/02`, which extends the shared `mapUpstreamError` from plan
03 with `400 -> validation_failed` and `403 -> permission_denied` mappings the original road map omitted. Confirm
that correction has landed in `apps/mcp-server/src/lef-api/errors.ts` before relying on those two codes here.

`bruno/batch-verification/fixtures/sample.csv` is a small, real, checked-in fixture (`person@lef.test`,
`other@lef.test`) already used by this repository's own batch tests — a convenient known-good manual verification
input for this plan too, understanding that this domain's addresses always verify inconclusively (see the module
README's own note on the plain `@lef.test` catch-all domain) and so always settle with `creditsCharged: 0`; use
`evidence.lef.test`-style addresses instead if a conclusive, charged result is specifically what needs
demonstrating during manual verification.

## Scope and Non-Goals

This plan adds exactly three tools. It does not change `submit_batch_verification`'s upload semantics beyond
building the CSV from a list of strings, does not add a streaming/chunked download mechanism beyond simple
offset/limit pagination, and does not attempt to summarize or aggregate row data beyond what `counts` already
provides on the status tool — an agent that wants aggregates should use `check_batch_verification`.

## Plan of Work

Add `csv-stringify` and `csv-parse` (or whichever minimal, already-idiomatic CSV libraries this repository already
depends on elsewhere — check `src/libs/modules/email-verification`'s own dependencies first and reuse the same
ones rather than introducing a second CSV library) to `apps/mcp-server/package.json`.

Extend `apps/mcp-server/src/lef-api/client.ts` with `uploadBatchCsv(csvContent: string): Promise<{id: string}>`
(posting a `multipart/form-data` body with the given CSV content as the `file` field — use Node's built-in `Blob`/
`FormData`, already global in the Node versions this repo targets, no new dependency needed for the multipart
construction itself), `getBatchStatus(id: string)`, and `getBatchResultsCsv(id: string): Promise<string>` (fetching
the raw CSV text; parsing happens in the tool, not the client, keeping the client's responsibility limited to HTTP
transport).

Create `apps/mcp-server/src/tools/submit-batch-verification.ts` (+ spec): input `{emails: string[]}`; reject with a
clear client-side message (not an upstream call) if the array is empty or exceeds 5,000 entries; otherwise build a
single-column CSV (`email` header + one address per line, using `csv-stringify` for correct quoting/escaping) and
call `uploadBatchCsv`, returning `{id}` as JSON text content on success or the standard `isError` shape (including
the `422 validation_failed` case for malformed addresses) on failure.

Create `apps/mcp-server/src/tools/check-batch-verification.ts` (+ spec): input `{id: string}`; calls
`getBatchStatus` and returns the full status object (`status`, `progress`, `counts`, `billing`,
`resultsAvailable`) as JSON text content.

Create `apps/mcp-server/src/tools/download-batch-results.ts` (+ spec): input `{id: string, offset?: number, limit?:
number}` (default `offset: 0`, default `limit: 200`, hard cap `limit` at 1000 regardless of what is requested);
calls `getBatchResultsCsv`, parses it with `csv-parse`, slices `[offset, offset + limit)`, and returns
`{rows: <sliced rows as objects keyed by column name>, totalRows: <parsed row count>, truncated: <boolean>,
nextOffset: <number or null>}` as JSON text content. If `resultsAvailable` is not yet true (confirm via
`getBatchStatus` first, or handle the underlying download endpoint's own not-yet-available response, whichever
the API actually does — verify against the real API during implementation), return a clear message telling the
agent to check `check_batch_verification` first rather than a confusing parse error on an empty/absent body.

Edit `apps/mcp-server/src/create-server.ts` to register all three new tools.

## Interfaces and Dependencies

Three new methods on `LefApiClient`; three new tool modules and their specs; two new small dependencies
(`csv-stringify`, `csv-parse`, or whichever this repository already uses elsewhere for the same purpose).
Depends on `mcp-connector/03`'s shared client/error infrastructure. Independent of `mcp-connector/04`; either may
be implemented first once `03` is available.

## Acceptance Criteria

- `submit_batch_verification` with a small real address list reaches a terminal `check_batch_verification` state
  (matching what uploading the equivalent CSV directly and polling would show), and its `counts`/`billing` fields
  are internally consistent with what the direct API reports for the same batch.
- `submit_batch_verification` with zero addresses or more than 5,000 is rejected client-side with a specific
  message, making zero calls to the upload endpoint.
- `download_batch_results` against a completed batch returns correctly parsed rows matching the real CSV's
  content for the requested offset/limit window, with correct `totalRows`/`truncated`/`nextOffset` values;
  requesting a `limit` above 1000 is silently capped at 1000, not rejected.
- `download_batch_results` against a batch whose results are not yet available returns a clear, specific message,
  not a parse error or an empty/malformed result.
- CSV construction correctly escapes an address containing a comma or quote character (an edge case worth a
  dedicated unit test given `csv-stringify`'s own correctness is being relied on here).

## Validation

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/tools/submit-batch-verification.spec.ts apps/mcp-server/src/tools/check-batch-verification.spec.ts apps/mcp-server/src/tools/download-batch-results.spec.ts apps/mcp-server/src/lef-api/client.spec.ts
corepack pnpm typecheck
corepack pnpm lint
```

Manual/live: against a real `dev:reset` stack, submit a small batch (reuse `bruno/batch-verification/fixtures/sample.csv`'s
two addresses, or `evidence.lef.test`-style addresses for a conclusive/charged result), poll to completion, and
download results in at least two paginated windows to confirm offset/limit behavior, via
`@modelcontextprotocol/inspector --cli`.

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector/05-batch-verification-tools.md
```

## Idempotence and Recovery

No persisted state in the connector itself. A submitted batch is a real, billed operation against the dev stack;
repeated manual verification consumes real dev-stack credits and creates real batch records, exactly as any other
client would. `corepack pnpm dev:reset` restores a clean disposable stack if needed.

## Artifacts and Notes

Read `src/libs/modules/email-verification/README.md`'s batch section and `S3BatchResultWriter`'s column list
directly before implementing, to confirm the exact current CSV column names rather than relying on this plan's
summary.

## Plan readiness

Ready to implement
