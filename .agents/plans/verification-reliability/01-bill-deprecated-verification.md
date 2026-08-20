# Apply run permission and credits to deprecated verification

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The deprecated `GET /verify` compatibility route must consume the same authorization and credit as `POST /verify`.
After this change, a read-only credential cannot start verification, an organization without a credit receives
`402`, and a successful legacy request debits exactly one credit before running the existing verifier.

## Progress

- [ ] (2026-08-20) Align the deprecated controller's permission and credit guard with synchronous verification.
- [ ] (2026-08-20) Add metadata, HTTP-boundary, debit, and no-credit regression coverage.
- [ ] (2026-08-20) Extend the SMTP-development Bruno workflow and run validation.

## Plan dependencies

- `auth/05`

## Surprises & Discoveries

- `OldSyncEmailVerificationController` calls the same `IEmailVerificationService.verify()` implementation as the
  current POST route but declares only `verification:read` and has no `CreditGuard`.
- The current POST route already provides the exact policy and guard wiring to reuse.

## Decision Log

- Decision: Preserve the deprecated GET route for compatibility but apply `verification:run` and `CreditGuard`.
  Rationale: Removal is a separate compatibility decision; free execution through the compatibility path is a
  correctness and authorization defect that can be fixed independently.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Debit one credit before verification exactly as `POST /verify` does, including cached results.
  Rationale: Both routes expose the same business operation and must not diverge in billing semantics.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Not started.

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

Record redacted request statuses and starting/final balances. Never record bearer tokens or API secrets.

## Plan readiness

Ready to implement.
