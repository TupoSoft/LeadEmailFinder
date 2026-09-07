# Layer Synchronous Email-Verification Delivery

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move the current and deprecated synchronous verification routes into one layered delivery slice over the completed
verification core. `POST /verify` and deprecated `GET /verify` continue to use the same application command, one-credit
policy, permission, organization context, result, and failure mapping. A developer can observe the boundary through
framework-free command tests plus controller and real-Nest integration tests for both routes, identical billing behavior,
and the existing SMTP Bruno workflow.

## Progress

- [x] (2026-09-07) Characterize both synchronous routes, authorization, billing, mapping, and failures.
- [x] (2026-09-07) Move sync and deprecated-sync transport code into one HTTP API slice.
- [x] (2026-09-07) Add one transport-neutral synchronous delivery command over the plan-14 mailbox composition.
- [x] (2026-09-07) Remove only sync/deprecated-sync baseline keys and update documentation.
- [x] (2026-09-07) Complete focused, HTTP, billing, SMTP Bruno, architecture, and full validation.

## Plan dependencies

- `module-architecture/03`
- `module-architecture/04`
- `module-architecture/14`

## Surprises & Discoveries

- The deprecated `GET /verify` already calls the same central service as `POST /verify`, but its controller and
  Automapper profile form a separate Nest module and legacy response shape.
- Credit enforcement is an inbound-route concern supplied by the credits module; it must not be copied into the
  verification core or performed again by a delivery command.
- Nest guards debit before validation pipes run: an authorized malformed input still consumes one credit, while
  missing authentication and missing permission fail before any debit. Domain-policy rejection and unexpected
  adapter errors currently produce a generic `500`. These behaviors remain unchanged in this relocation.
- The old synchronous composition also supplied the core to async and batch delivery and registered email administration.
  Removing that directory requires updating those imports and moving email-administration registration to the root.

## Decision Log

- Decision: Move controllers, request/response DTOs, decorators, guards, serialization, Automapper compatibility,
  and HTTP error translation to `src/api/http/synchronous-verification/`, with current and deprecated subfolders
  where their transport shapes differ.
  Rationale: Both routes are inbound adapters for one use case, while the deprecated response remains an API concern.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Add one `RunSynchronousVerification` application command that receives organization and normalized input
  and invokes the plan-10 core; both controllers map to and from that command.
  Rationale: One application path prevents permission, billing, and verification behavior from drifting.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Retain `CreditGuard` and the same permissions on both HTTP routes, preserving one debit per accepted call
  and the same zero-balance rejection.
  Rationale: Architecture movement must not double-charge, bypass credits, or alter authorization.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve the plan-14 final mailbox adapter composition unchanged and remove only legacy synchronous
  delivery paths and their exact architecture-baseline entries.
  Rationale: Network behavior is already layered and does not belong in this delivery PR.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Add no migration, queue change, provider change, or configuration change.
  Rationale: This is a behavior-preserving HTTP/application relocation.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Move the existing core factory composition to `infrastructure/email-verification-core.module.ts` and
  register synchronous controllers, the legacy profile, the command, and email administration at the root module.
  Rationale: The canonical layer matrix permits infrastructure to wire application ports but forbids infrastructure
  imports of API controllers. A separate HTTP Nest module would need a forbidden API-to-infrastructure import.
  The root can compose both, and async/batch can retain the same core through import-only changes.
  Date/Author: 2026-09-07, Codex implementation.
- Decision: Move the shared validation decorator implementation into the synchronous API slice and retain its old
  root path as a compatibility export for async and batch DTOs.
  Rationale: Layered API files cannot import module-root files. This keeps one validator implementation while
  preserving out-of-scope callers and their existing baseline entries for plans 15 and 16.
  Date/Author: 2026-09-07, Codex implementation.

## Outcomes & Retrospective

Implemented both synchronous routes as one API slice over the private `RunSynchronousVerification` command.
The core composition moved into infrastructure without changing its application, persistence, discovery, or mailbox
providers. Both routes preserve permissions, organization context, one-credit charging, validation order, status
codes, trace modes, and response mapping. Async and batch retain their existing behavior through updated imports.

The real-Nest HTTP matrix passes all 33 cases; seven framework-free command tests pass. Full validation passes with
1,924 Jest tests and 31 runner tests. Eleven environment-gated suites containing 65 tests remain skipped in the
default full-suite invocation. The owned SMTP fixture separately passes all 22 Bruno requests and 44 assertions,
including secure transport, downgrade rejection, proxy recovery, deprecated billing, and async result compatibility.
Type checking, lint, build, OpenAPI, architecture, Harper, and diff checks pass. Lint reports one existing warning
in `src/libs/config/src/load-secrets.spec.ts`.

The architectural review found no new dependency violations. The shared validation decorator retains a root
compatibility export for async and batch callers; removing that existing debt belongs to their delivery plans.

## Context and Orientation

`sync-email-verification/` exposes `POST /verify`, contains the historically shared verification service, entity,
DTOs, controller, and module. Plan 10 moves the core and persistence out, and plan 14 completes network adapters and
composition. `old-sync-email-verification/` exposes deprecated `GET /verify` with query DTOs, a legacy response,
Automapper profile, controller, and module. The top-level module composes both.

Plan 03 supplies public authentication/permission composition and the principal contract. Plan 04 supplies the
credits boundary. Both routes require `verification:run` and one credit; the deprecated route must remain exactly
billing-equivalent, including `402` at zero balance. Organization identity is translated at the controller boundary
and passed to the core as a scalar, never as a framework authentication object.

## Scope and Non-Goals

Layer only the current and deprecated synchronous HTTP/application delivery. Move their tests and internal module
wiring, share one command, keep legacy response mapping at API, update source references in the module and SMTP Bruno
documentation, and shrink their baseline entries.

Do not touch async or batch delivery; plans 15 and 16 own them. Do not change the plan-10 core, plan-13 discovery, or
plan-14 SMTP/proxy adapters. Preserve methods, paths, query/body validation, statuses, response fields, permissions,
one-credit charging, organization isolation, Swagger/deprecation metadata, error mapping, provider behavior, and
configuration. Do not add a migration, backfill, endpoint, queue protocol, or production rollout.

## Plan of Work

Record a contract table for `POST /verify` and deprecated `GET /verify`: input location, validation, permission,
credit effect, organization source, success schema, every material error, and deprecation metadata. Extend
characterization tests so the two routes prove equal verification and debit outcomes without requiring identical
transport schemas.

Create `RunSynchronousVerification` under `src/application/delivery/synchronous/` or the repository-consistent
equivalent. It accepts a transport-neutral command and returns the core result. It imports no Nest, controller DTO,
Automapper, guard, or credit implementation. Application tests prove successful, prohibited-domain, indeterminate,
adapter-failure, and organization-isolation paths.

Move current and deprecated controllers/DTOs into `src/api/http/synchronous-verification/`. Keep class validation,
API mapping, guards, `CurrentPrincipal`, and HTTP exceptions there. Use the same command token from both controllers.
Keep the legacy Automapper profile in API or replace it with an explicit pure API mapper; do not introduce a second
verification use case.

Recompose the internal synchronous HTTP module over the plan-14 application/network composition. Delete obsolete
legacy barrels only after all imports use the layered paths. Update documentation, run the shrink-only baseline
update, and reject any key outside sync/deprecated-sync ownership.

## Interfaces and Dependencies

External contracts remain `POST /verify` and deprecated `GET /verify`, each protected by `verification:run` and one
credit. Existing request/query validation, response DTOs, HTTP statuses, deprecation metadata, and stable errors stay
unchanged. The new internal command contains `organizationId` and normalized verification input and returns the
plan-10 application result.

The HTTP adapter imports only public auth and credits contracts delivered by plans 03 and 04. The command consumes
the final verification composition from plan 14. The public email-verification barrel remains module-only. Plans 11
and 15 may execute in parallel after plan 14 because they own disjoint inbound adapters.

## Acceptance Criteria

- Current and deprecated synchronous transport code lives under API and contains no business orchestration.
- `RunSynchronousVerification` is framework-independent and both controllers invoke the same command.
- Both routes retain `verification:run`, one debit, zero-balance `402`, organization context, validation, mapping,
  status, and error behavior.
- Unauthenticated, unauthorized, zero-balance, invalid, prohibited-domain, successful, and adapter-failure cases are
  covered for the material route differences.
- No application/domain file imports Nest, HTTP DTOs, Automapper, auth guards, or credits infrastructure.
- Async and batch paths, queue protocols, core/persistence, discovery, SMTP/proxy, provider, and configuration
  behavior are unchanged.
- The top-level public barrel remains module-only and only sync/deprecated-sync baseline entries disappear.
- Focused, HTTP integration, billing, SMTP Bruno, architecture, full-suite, build, docs, and diff checks pass.

## Validation

Run the focused suites and strict ownership checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/api/http/synchronous-verification src/libs/modules/email-verification/src/application/delivery/synchronous old-sync-email-verification-http.integration.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

The focused matrix must assert one and only one debit for each accepted route, no debit on pre-guard rejection, equal
zero-balance behavior, and organization propagation. Inspect the baseline diff for sync/deprecated-sync keys only.

Before Docker use, inspect `lef-api-1` ownership. Against an owned SMTP-development stack, run the exact
container-network command in `bruno/smtp-dev/README.md` with the internal issuer and `baseUrl=http://api:3000`.
Require secure SMTP success, plaintext downgrade rejection, proxy drain/restore, and all deprecated-route credit
checks to pass.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/11-layer-email-verification-delivery-workflows.md
    git diff --check

Bruno: update only stale source and fixture-configuration references, then require the existing SMTP collection to pass
in full.

## Idempotence and Recovery

Move one route at a time while both target the shared command. Rerunning moves and baseline shrink must be a no-op.
If interrupted, retain one authoritative registration per route and recover by completing the current controller
move; never register both old and new controllers or create a second application use case.

This plan changes no schema or durable queue state. Runtime fixtures use disposable data only after Compose ownership
is confirmed and recover through `pnpm dev:reset -- --confirm-project=LEF` plus the documented proxy restore. Preserve
unrelated edits and another checkout's services.

## Artifacts and Notes

The preserved route contract is:

| Contract | `POST /verify` | Deprecated `GET /verify` |
| --- | --- | --- |
| Input | JSON body `email`, existing `IsVerifiableEmail` validator | Query `email`, same validator |
| Permission and organization | `verification:run`, authenticated principal's organization | Identical |
| Billing | One debit before validation; zero balance returns `402` | Identical |
| Authentication / authorization | `401` / `403`, no debit or verification | Identical |
| Invalid input | `400` after one debit, no verification | Identical |
| Success | `201`, current exposed DTO with verification ID and sources | `200`, legacy Automapper DTO with delivery/catch-all enums and `verifiedAt` |
| Domain prohibition / adapter failure | Generic `500` after one debit | Identical |
| Trace | Request ID with `sync` mode | Request ID with `deprecated_sync` mode |
| Swagger | Existing current route metadata | Operation remains deprecated |

Implementation uses `api/http/synchronous-verification/current/` and `deprecated/`, plus the private
`RUN_SYNCHRONOUS_VERIFICATION` command token. The public barrel still exports only `EmailVerificationModule`.
Issue #445 is assigned to the requesting user and its project-9 item is In Progress. The owned Docker fixture uses
project `lef445e9b9`; initial inspection found no containers and preserved unrelated orphan volumes.

The shrink-only architecture update removed exactly 18 entries from the old synchronous directories: five API
placement entries and thirteen source placement entries. No other key changed; 33 existing violations remain.

Validation evidence collected on 2026-09-07:

- The focused command/controller/legacy HTTP/trace/discovery run passed six suites and 25 tests; the new combined
  HTTP suite separately passed 33 tests. The final full-suite run includes all seven focused suites.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci` passed 204 Jest suites and 1,924 tests, with 11 suites and
  65 environment-gated tests skipped, followed by 31 passing OIDC/Bruno runner tests.
- `COMPOSE_PROJECT_NAME=lef445e9b9 corepack pnpm bruno:smtp-dev` passed all 22 requests and 44 tests with pinned
  Bruno 4.1.0. The runner validated fixture ownership and used container-network API and identity endpoints.
- Correlated privacy-safe fixture logs show secure SMTP using `ehlo,starttls,ehlo,mail_from,rcpt_to,quit`, while
  plaintext rejection used only `ehlo`, with zero envelope or DATA commands. Completion reason codes include
  `accepted_email` and `secure_transport_unavailable`; proxy restore and deprecated zero-balance/debit checks passed.
- `corepack pnpm architecture:baseline` and `corepack pnpm architecture:check` passed; a set comparison confirmed
  zero added baseline keys and removals confined to the two old synchronous directories.
- The exact typecheck, lint, build, and Harper commands under Validation passed. `corepack pnpm openapi:check`
  passed, confirming unchanged generated API contracts. `git diff --check` passed.

The owned fixture remains available for local review. No database schema, migration, provider, queue protocol, or
configuration behavior changed, and unrelated Docker volumes were preserved.

## Plan readiness

Ready to implement
