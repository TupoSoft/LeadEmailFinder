# Apply run permission and credits to deprecated verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The deprecated `GET /verify` compatibility route must consume the same authorization and credit as `POST /verify`.
After this change, a read-only credential cannot start verification, an organization without a credit receives
`402`, and a successful legacy request debits exactly one credit before running the existing verifier.

## Progress

- [x] (2026-08-21) Align the deprecated controller's permission and credit guard with synchronous verification.
- [x] (2026-08-21) Add metadata, HTTP-boundary, debit, and no-credit regression coverage.
- [x] (2026-08-21) Extend the SMTP-development Bruno workflow and run validation.

## Plan dependencies

- `auth/05`

## Surprises & Discoveries

- `OldSyncEmailVerificationController` calls the same `IEmailVerificationService.verify()` implementation as the
  current POST route but declares only `verification:read` and has no `CreditGuard`.
- The current POST route already provides the exact policy and guard wiring to reuse.
- The seeded platform-ops Bruno client (`lef-development-service`) is granted every `AuthPermission`, including
  both `verification:run` and `verification:read` together (see `ALL_PERMISSIONS` in
  `scripts/keycloak/bootstrap-service-credential.ts`). It can never exercise the new 403 (read-only) path, so that
  path is covered only by the new Jest HTTP-boundary spec, which constructs a `service_client` principal with a
  restricted `permissions: ['verification:read']` array directly (the only way to get a permission set narrower
  than a role's, since `RolePermissionPolicy` derives role-based principals' permissions from a fixed table where
  `member` already grants both).
- `ClassSerializerInterceptor` with `strategy: 'excludeAll'` silently drops every property of a plain object literal
  returned from a mocked `@InjectMapper()` mapper — it needs a real class instance (with `@Expose()` metadata) to
  know what to keep. The HTTP-boundary spec's mapper mock must return `Object.assign(new
  OldSyncEmailVerificationResponseDto(), {...})`, not a bare object literal.
- Empirically (not assumed) confirmed via live Bruno: for the `smtp-dev` fixture's catch-all domain, `EmailVerifier`
  never runs its real per-recipient SMTP check (`EmailVerifier.verify`'s `exists === false` branch is skipped
  entirely once the bogus-recipient probe already found the domain catch-all), so `exists` stays `null` and
  `deliveryStatus` serializes as `not-processed` on every successful verification of `person@lef.test` in this
  fixture, not just the first. The existing `02-verify-local-email` request never asserts on `exists`, so this was
  never visible before. The new legacy-route Bruno assertions deliberately do not assert `deliveryStatus` for the
  same reason `02` doesn't assert `exists` -- it depends on the pre-existing, already-diagnosed dead
  `CATCH_ALL_HTTP_PROXY_URL` (see `proxy-fleet/14`'s Surprises), not on anything this plan changed.
- The same dead `CATCH_ALL_HTTP_PROXY_URL` makes every successful verification of a catch-all domain take ~135s
  (the HTTP catch-all probe in `EmailVerifier.verifyViaHttp` runs, unconditionally and uncached, on every request
  where the domain is catch-all -- not just the first, contrary to what `bruno/smtp-dev/README.md`'s existing prose
  implied). Extending the collection with a second real verification (to prove the legacy route also debits)
  pushed one full run's wall-clock time past the Keycloak client-credentials token's lifespan, which the
  collection's shared `before-request` script cached for the whole run. Fixed by minting a fresh token before every
  request instead of caching one -- a small, generally applicable robustness fix to the collection's shared script,
  not specific to this plan's new requests.
- A leftover, non-zero credit balance from earlier live-testing sessions (the dev Postgres volume is never wiped
  between `docker compose down`/`up` cycles) made the first attempt at the new `402`-at-zero-balance Bruno check
  silently pass authorization and actually debit a credit, because the assumed zero starting balance was wrong.
  Fixed by adding an explicit `PUT /credits/:organizationId` (`amount: 0`) step immediately before the `402` check,
  making the assertion deterministic regardless of leftover state from prior runs.

## Decision Log

- Decision: Preserve the deprecated GET route for compatibility but apply `verification:run` and `CreditGuard`.
  Rationale: Removal is a separate compatibility decision; free execution through the compatibility path is a
  correctness and authorization defect that can be fixed independently.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Debit one credit before verification exactly as `POST /verify` does, including cached results.
  Rationale: Both routes expose the same business operation and must not diverge in billing semantics.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Implemented and fully validated, including live. Changed `OldSyncEmailVerificationController`'s class-level
`@RequirePermissions` from `verification:read` to `verification:run` and added a method-level `@UseGuards(CreditGuard)`
on `verifyEmail`, mirroring `SyncEmailVerificationController` exactly. Imported `CreditsModule` into
`OldSyncEmailVerificationModule` so `CreditGuard`/`CreditsService` resolve. Updated the existing metadata spec and
added a new `old-sync-email-verification-http.integration.spec.ts` proving, through real `PermissionsGuard` +
`RolePermissionPolicy` + `CreditGuard` wiring (only the mapper and the two injected services are mocked): a
read-only principal gets `403` and neither the verifier nor the credit debit runs; an insufficient-balance principal
gets `402` and the verifier never runs; a fully-authorized principal debits exactly one credit and gets the legacy
response shape. Extended `bruno/smtp-dev` with four new requests after the existing drain/restore cycle, proving the
same three cases live end to end, and fixed two pre-existing issues the extension exposed (see Surprises &
Discoveries): the collection's shared token-caching `before-request` script (now mints per-request) and the new
Bruno steps' zero-balance assumption (now explicit via a `PUT` reset).

`POST /verify`, async verification, and batch verification were not touched and their existing specs continue to
pass unchanged.

## Context and Orientation

`src/lead-email-finder-api/src/email-verification-module/old-sync-email-verification/` maps legacy query/response
shapes around `EmailVerificationService`. Its controller currently uses `PermissionsGuard` with
`verification:read`. `sync-email-verification.controller.ts` protects `POST /verify` with
`verification:run` plus `CreditGuard`. `CreditGuard` reads the authenticated organization and calls
`CreditsService.debit(organizationId, 1, randomUUID())`, mapping insufficient balance to `402`.

## Scope and Non-Goals

Align authorization and billing for the deprecated route and update focused tests and Bruno coverage. Preserve the
GET query schema, legacy response shape, verifier implementation, credit ledger, current POST route, and endpoint
deprecation marker. Do not remove GET `/verify`, alter credit prices, add refunds, change caching, or add schema.

## Plan of Work

Change the legacy controller metadata from `verification:read` to `verification:run` and attach `CreditGuard` to
the GET handler using the same ordering as the POST route. Import `CreditsModule` in the legacy module if required
to resolve the guard and `CreditsService`; do not duplicate debit logic in the controller.

Update the metadata spec and add an HTTP-boundary test with real `PermissionsGuard` and `CreditGuard` behavior or
a focused wiring module that proves: read-only principals fail before verification, insufficient balance returns
`402`, and successful authorization invokes one debit and one verifier call. Preserve error mapping and legacy
serialization.

Extend `bruno/smtp-dev` after its existing one-credit POST flow with a legacy GET that observes `402` at zero
balance, then add a credit and prove one successful legacy request consumes it. Keep tokens and secrets in the
existing environment variables.

## Interfaces and Dependencies

Changed public behavior: `GET /verify` now requires `verification:run` and a positive organization credit balance;
it may return `403` or `402` where it previously ran. Success response shape remains unchanged. Reuse
`PermissionsGuard`, `CreditGuard`, `CreditsModule`, and the existing verification service token.

## Acceptance Criteria

- A principal with only `verification:read` receives `403` and the verifier is not called.
- A principal with `verification:run` but zero credits receives `402` and the verifier is not called.
- A principal with `verification:run` and one credit receives the existing legacy success response and finishes
  with a zero balance.
- Each accepted request creates one idempotent debit; a rejected request creates none.
- `POST /verify`, async verification, and batch verification retain their existing behavior.

## Validation

Run the legacy controller spec, its new HTTP wiring tests, `credits.guard.spec.ts`, and the synchronous verification
controller specs. Run `corepack pnpm typecheck`, `corepack pnpm lint`, and the full Jest suite with temporary paths
set to `/tmp`. Run `bru run --env local` for the updated `bruno/smtp-dev` collection against its documented
disposable fixture.

## Idempotence and Recovery

The guard uses the existing idempotent debit ledger for each accepted request and performs no schema change.
Rejected requests are side-effect free. Restore disposable credits and fixtures with
`pnpm dev:reset -- --confirm-project=LEF` if a runtime run is interrupted.

## Artifacts and Notes

**Focused Jest**: `old-sync-email-verification.controller.spec.ts` (2 tests) + new
`old-sync-email-verification-http.integration.spec.ts` (3 tests), all passing. Repo-wide `test:ci`: 118/126 suites
run (8 pre-existing skips), 711/734 tests passed (22 pre-existing skips, 1 pre-existing todo) -- no regressions.
`typecheck`, `lint` (2 pre-existing unrelated warnings only), and `build` (436 files) all clean. `git diff --check`
clean.

**Live Bruno** (`bruno/smtp-dev`, redacted -- no bearer tokens or secrets recorded), full 11-request run:
- `07-zero-balance-for-legacy-verify` (`PUT /credits/:organizationId`, amount 0): `200`, balance `0`.
- `08-legacy-verify-requires-credit` (`GET /verify`): `402`, as expected at zero balance.
- `09-add-credit-for-legacy-verify` (`POST /credits/:organizationId`, amount 1): `201`, balance `1`.
- `10-legacy-verify-consumes-credit` (`GET /verify`): `200`, ~135s (see Surprises -- the pre-existing dead
  catch-all HTTP probe, not a regression), correct `catchAll`/`reason`/`targetExchange`.
- `11-legacy-verify-leaves-zero-balance` (`GET /credits/:organizationId`): `200`, balance `0` -- confirms exactly
  one credit was debited for the one successful legacy request.
- All 11 requests / 11 tests passed; existing `01`-`06` requests (credit top-up, `POST /verify`, proxy
  find/drain/healthy/restore) continued to pass unchanged.

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
