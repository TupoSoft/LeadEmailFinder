# Layer the SMTP and Proxy Mailbox Adapter

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move SMTP socket/protocol handling, proxy leasing, mailbox-result caching, and mailbox-probe orchestration behind the
plan-10 port, then recompose the email-verification module to swap this plan's real mailbox adapter in for the
temporary compatibility one from plan 18. No recipient or generated sender may be
sent before verified STARTTLS, and every lease and socket must reach a bounded terminal cleanup path. A developer can
observe the result through pure mailbox-policy tests, SMTP/proxy adapter contracts, deterministic TLS-capable and
plaintext fixtures, a narrowed module tree, and removal of the remaining core/network architecture-baseline keys.

## Progress

- [x] (2026-08-30) Characterize mailbox decisions, SMTP protocol, cache provenance, proxy leases, deadlines, and cleanup.
- [x] (2026-09-06) Move SMTP client/factory/parser and proxy-backed probing under infrastructure.
- [x] (2026-09-06) Bind the organization-aware SMTP store and final `MailboxProbe` implementation.
- [x] (2026-09-06) Recompose the core/discovery/mailbox module and remove its remaining baseline keys.
- [x] (2026-09-06) Complete focused, fixture, SMTP Bruno, architecture, full, and documentation validation.

## Plan dependencies

- `module-architecture/05`
- `module-architecture/10`
- `module-architecture/13`
- `module-architecture/17`
- `module-architecture/18`
- `privacy-compliance/03`
- `privacy-compliance/05`

## Surprises & Discoveries

- `email-verifier/smtp/` currently combines the protocol client, client factory, proxy allocation, verifier,
  TypeORM entity/repository access, Nest module, and result mapping.
- Privacy plan 05 makes cache provenance part of correctness: only a result recorded with `secureTransport: true` may
  bypass a new probe.
- The 2026-09-06 Decision Log entry references reusing "the internal account-discovery boundary delivered after
  plan 18 and before plan 13" via `infrastructure/account-discovery/account-discovery.module.ts` and an
  `ACCOUNT_DISCOVERY_TOKEN`. Neither exists: `gh pr view 545 --json files` (plan 13's merged PR) touched zero
  `account-discovery` files, and `.agents/plans/account-discovery/{01,02}...md` are planning-only documents (from
  PR #544), not yet implemented. This plan instead reuses the actual existing mechanism carried over from plan 18 —
  `CATCH_ALL_VERIFIERS_TOKEN` plus `composeAccountDiscoveryVerifiers`, relocated verbatim (with its `SYSTEM_CLOCK`
  and `ACCOUNT_DISCOVERY_CLOCK_TOKEN`) out of the deleted `EmailVerifierModule` wrapper into a standalone
  `infrastructure/account-discovery/configured-account-discovery-verifiers.ts`. No behavior changed; only the
  Decision Log's own forward reference was stale.
- Moving the SMTP files into `infrastructure/mailbox/smtp/` (and `configured-account-discovery-verifiers.ts` into
  `infrastructure/account-discovery/`) gave them a layer classification for the first time, which surfaced a new
  `layer-dependency` violation: both files imported the unclassified module-root `email-verification-configuration.ts`.
  Fixed by relocating that file to `domain/email-verification-configuration.ts` (it holds only plain
  configuration-shape interfaces, which belongs there architecturally) and updating its five consumers' import
  paths.
- The live dev stack's `lef-api-1` container was `unhealthy` after this recomposition even though `typecheck`/tests
  were clean: its baked `dist/main.js` predated the module-tree move and failed at boot with
  `Cannot find module './metadata'`. A plain `docker compose ... up -d --build api` rebuild resolved it — this was
  a stale-image artifact, not a code defect.
- After opening the PR, `origin/master` had moved and PR #550 ("encapsulate account discovery",
  `account-discovery/01`) merged concurrently. It made the earlier Surprises entry's forward reference true:
  `ACCOUNT_DISCOVERY_TOKEN`, the `AccountDiscovery` port, `AccountDiscoveryService`, and a renamed
  `composeAccountDiscovery` (singular, returning one instance instead of a verifier array) now exist for real,
  superseding this plan's own `CATCH_ALL_VERIFIERS_TOKEN`/`configuredAccountDiscoveryVerifiers` placeholder built
  before that PR landed. Rebasing required deleting that placeholder and renaming
  `configured-account-discovery-verifiers.ts`/`.spec.ts` to `configured-account-discovery.ts`/`.spec.ts` (matching
  the singular name). It also required rewiring `email-verification.module.ts`'s `MailboxVerificationService`
  factory to inject `ACCOUNT_DISCOVERY_TOKEN` instead. A real-Nest-composition test PR #550 added,
  `infrastructure/account-discovery/account-discovery-wiring.spec.ts`, was built against the *old*
  `SmtpVerifier`/`CompatibilityMailboxProbe` composition; it needed rewriting to override the `MAILBOX_PROBE` token
  directly instead of a since-deleted `SmtpVerifier` class. All 5 of its assertions still hold under the new
  composition.
- Rebasing separately surfaced that PR #546 ("serve the web app and API from one origin", already on `master`)
  added a `web` Compose service that `scripts/bruno/run-collection.mjs`'s `loadDevelopmentStack()` now requires
  for every collection, including `smtp-dev`. This dev stack had never run that service; live Bruno validation
  failed opaquely until `docker compose ... up -d --build` (the full stack, not scoped to `api`) started it —
  unrelated to this plan's own code.

## Decision Log

- Decision: Put SMTP client/factory/parser and mailbox-probe adapter under
  `src/infrastructure/mailbox/smtp/`; keep mailbox classification policy and result values in domain/application.
  Rationale: Socket and protocol mechanisms point inward through one purpose-specific port.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Consume only the proxy module's bare public lease contracts from plan 05; do not deep-import proxy
  services, repositories, health policy, or configuration.
  Rationale: Email verification needs a lease, not ownership of proxy allocation.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve the exact greeting, `EHLO`, `STARTTLS`, verified TLS handshake, second `EHLO`, from privacy plan 05,
  `MAIL FROM`, `RCPT TO`, and `QUIT` order. Missing or invalid secure transport returns the existing indeterminate
  `secure_transport_unavailable` outcome before any address-bearing command.
  Rationale: Architecture movement cannot weaken the disclosure boundary.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Use the plan-10 `SmtpVerificationStore` with organization identity and reuse cache records only when
  `secureTransport` is true.
  Rationale: Store ownership and transport provenance are independent mandatory checks.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve Node default trust plus optional SMTP-only CA composition, MX hostname SNI/verification,
  abort-aware phase deadlines, deterministic socket destruction, and exactly-once lease release.
  Rationale: These are observable safety and resource-lifecycle contracts, not implementation details to simplify.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Recompose only the core/discovery/mailbox Nest wiring here, swapping this plan's real mailbox adapter in
  for the temporary compatibility one from plan 18. Legacy sync, deprecated-sync, async, and batch modules remain registered
  until plans 11, 15, and 16 move them.
  Rationale: Network-adapter completion is independently deployable and leaves delivery changes bounded.
  Date/Author: 2026-08-30, Codex planning.

- Decision: Reuse the internal account-discovery boundary delivered after plan 18 and before plan 13.
  Rationale: Its separate plans own provider relocation and approval policy; SMTP recomposition must preserve that
  binding and remove only the obsolete SMTP wrapper it still consumes.
  Date/Author: 2026-09-06, Codex planning.
- Decision (superseded 2026-09-06, see below): no `ACCOUNT_DISCOVERY_TOKEN`/`account-discovery.module.ts` existed
  yet at implementation time (see Surprises). Reused the then-existing `CATCH_ALL_VERIFIERS_TOKEN` mechanism from
  plan 18 unchanged, relocated out of the deleted `EmailVerifierModule` into
  `infrastructure/account-discovery/configured-account-discovery-verifiers.ts`, and inlined its DI wiring directly
  into `sync-email-verification/email-verification.module.ts`.
  Rationale: `account-discovery/01`/`02` remained planning-only at the time; implementing against a nonexistent
  token would have blocked this plan on unrelated work that had not started.
  Date/Author: 2026-09-06, Codex implementation.
- Decision: `account-discovery/01` (PR #550) merged to `master` before this branch's PR was itself merged, making
  the real `ACCOUNT_DISCOVERY_TOKEN`/`AccountDiscovery` port available. Rebased onto it and switched this plan's
  factory wiring to inject the real token instead of the placeholder above, renaming
  `configured-account-discovery-verifiers.ts`/`.spec.ts` to `configured-account-discovery.ts`/`.spec.ts` to match
  the now-singular `configuredAccountDiscovery` function it wraps.
  Rationale: Two independent placeholders for the same seam should not coexist; once the real port existed, keeping
  the plan-18-era array-of-verifiers placeholder would have left dead code and a second, divergent account-discovery
  path.
  Date/Author: 2026-09-06, Codex implementation.
- Decision: Drop `DNS_SERVICE_TOKEN` and `SMTP_CLIENT_FACTORY_TOKEN` string-token indirection in favor of direct
  class injection (`DnsService`, `SmtpClientFactory`).
  Rationale: Both are single-implementation `@Injectable()` classes with no swap requirement, matching the
  no-unnecessary-indirection pattern already used for `SmtpVerifier`/`MxResolver`/`DomainSynonymDiscovery` in
  plans 13 and 18.
  Date/Author: 2026-09-06, Codex implementation.

## Outcomes & Retrospective

Implemented and validated on branch `module-architecture/14-smtp-mailbox-adapter`.

- `infrastructure/mailbox/smtp/smtp-mailbox-probe.ts` is the real `MailboxProbe` adapter, replacing both the old
  `SmtpVerifier` and plan 18's `CompatibilityMailboxProbe`. It preserves the exact protocol/cache/proxy-lease
  behavior of `SmtpVerifier`, substituting only its dependencies. MX resolution now goes through the plan-13
  `MxResolver` port instead of a raw `dnsService.resolve(domain, 'MX')` call. Persistence now goes through the
  plan-17 `SmtpVerificationStore` port instead of a raw TypeORM repository find/create/save. The unrelated reverse-DNS
  pointer lookup for the SMTP client's own hostname still uses `IDnsService` directly — no port covers that, and it
  is a legitimate infrastructure-level technical dependency, not an architecture violation.
  `infrastructure/mailbox/smtp/` also holds the relocated client/factory/parser/exception/constants files, moved
  unchanged from the deleted `email-verifier/smtp/`.
- `infrastructure/account-discovery/configured-account-discovery.ts` builds the real `AccountDiscovery` instance
  (the `ACCOUNT_DISCOVERY_TOKEN`/`AccountDiscoveryService` mechanism `account-discovery/01` delivered concurrently
  — see Surprises and Decision Log) from configuration, the approval manifest, and the provider adapters; the
  composition previously wrapped by `EmailVerifierModule` (now deleted entirely, along with the rest of
  `email-verifier/`).
- `domain/email-verification-configuration.ts` (moved from the module root) holds the plain SMTP/catch-all
  configuration shapes now consumed by two `infrastructure/` files, fixing the layer-dependency violation that move
  exposed.
- `sync-email-verification/email-verification.module.ts` was rewritten to compose everything directly through
  explicit factory providers — no wrapper module remains between Nest and the plain adapter/service classes. This
  gives plan 17's previously-unused `TypeOrmSmtpVerificationStore`/`SmtpVerificationEntity` their first real
  consumer.
- Validation, in full (rerun after rebasing onto `master`'s concurrent `account-discovery/01` and
  same-origin-`web` changes — see Surprises):
  - Focused: `src/libs/modules/email-verification` (whole module) → 43 suites / 294 tests passed, 2 suites / 5
    tests skipped as expected (real-Postgres gating).
  - `architecture:baseline` / `architecture:check`: 51 baselined violations, zero new violations (unchanged by the
    rebase, matching PR #550's own "architecture baseline unchanged" claim).
  - `typecheck`: clean (only the known, preexisting, environment-only `dist/tsconfig.tsbuildinfo` `EACCES` from a
    root-owned `dist/`, unrelated to this change).
  - `lint`: clean repository-wide (the earlier `packages/api-client/src/index.ts:10:12` preexisting error was
    fixed upstream on `master` before this rebase).
  - `test:ci`: full suite green (202 suites / 1884 tests, plus the 31 `test:oidc-runners` script tests).
  - `build`: blocked only by the preexisting root-owned `dist/` permission issue in this dev environment
    (`EACCES` on `rmdir`), not a code defect.
  - Real-Postgres: `verification-organization-ownership.integration.spec.ts` against `lef_identity_test` — 3/3
    passed, including the rewritten `SmtpMailboxProbe` construction/wiring assertions.
  - Live Bruno (full dev stack rebuilt, including the `web` service — see Surprises):
    `smtp-dev` — 22 requests / 44 tests, all passing (TLS success, plaintext downgrade rejection before any
    address-bearing command, deterministic proxy drain/restore, zero default provider dispatch, current and
    deprecated route parity). `batch-verification` — 3 requests / 8 tests, all passing.
  - `git diff --check`: clean.
- `src/libs/modules/email-verification/README.md` updated: Architecture section now names plan 14, describes the
  real `SmtpMailboxProbe` and `configured-account-discovery.ts` (reconciled against `account-discovery/01`'s real
  `AccountDiscovery` port), drops the stale compatibility-adapter and `EmailVerifierModule` references;
  Persistence table's `SmtpVerification` row corrected to `SmtpVerificationEntity`; Validation section's file
  listings updated to the new `infrastructure/mailbox/smtp/` and `infrastructure/account-discovery/` paths.
  `bruno/smtp-dev/README.md` had no stale references to update.

## Context and Orientation

Plan 10 supplies the pure verification core and the `MailboxProbe` port. Plan 17 supplies the organization-aware
`SmtpVerificationStore` implementation. Plan 13 supplies MX and synonym adapters. The prerequisite
`account-discovery/02`, inherited through plan 13, supplies the existing private account-discovery module and port.
The remaining legacy network area is `src/libs/modules/email-verification/src/email-verifier/smtp/`, which opens
the proxy-backed socket and interprets SMTP replies. Plan 18 temporarily binds that code to the mailbox port through
a compatibility adapter.

Privacy plan 05 requires strict STARTTLS, verified peer identity, no plaintext fallback, secure-transport cache
provenance, bounded deadlines, and deterministic cleanup. Privacy plan 03 forbids address-bearing commands, replies,
errors, and protocol text in logs. Plan 05 of this road map exposes proxy allocation through a public contract; this
module must not reach into proxy infrastructure.

## Scope and Non-Goals

Relocate the SMTP client, factory, reply parser, timeout/error mapping, proxy-leased verifier, cache integration, Nest
bindings, and focused tests. Replace the mailbox compatibility adapter from plan 18, recompose the internal core/network
module wiring, update module/SMTP fixture documentation, and shrink remaining baseline keys unrelated to delivery.

Do not change SMTP classification, commands, timeouts, trust model, proxy selection, lease semantics, cache TTL or
ownership, provider discovery, HTTP routes, credits, queues, S3, schemas, public exports, or configuration names.
Do not layer delivery folders, add plaintext fallback, add endpoints, migrations, backfills, production rollout, or
production recovery.

## Plan of Work

Capture contracts for cached secure result, insecure/legacy cache miss, proxy unavailable, connect/greeting/EHLO/
STARTTLS/TLS/MAIL/RCPT/QUIT success and failure, cancellation at every phase, socket error/close order, and lease
release. Include both completion orderings: socket termination before release and release-triggering failure before
socket termination.

Move protocol types and pure parsing to the narrowest inward layer that has no socket/framework dependency. Move the
socket client/factory and proxy adapter to infrastructure. The adapter receives an organization-aware probe command
and loads only secure cache entries through the plan-17 `SmtpVerificationStore`. It leases through the plan-05 public proxy token,
performs the strict privacy-plan-05 protocol, stores the result with secure provenance, and releases the lease through
one bounded path.

Bind plan-13 DNS/synonym discovery plus the mailbox adapter to the core without exporting implementation tokens.
Reuse `infrastructure/account-discovery/account-discovery.module.ts` and `ACCOUNT_DISCOVERY_TOKEN` from the completed
account-discovery plans without recreating selection or moving providers. Remove the old SMTP module, the remaining
`EmailVerifierModule` reexport wrapper, and the mailbox compatibility registration only after the recomposed Nest
module passes its real-adapter tests.
Ensure API/application/domain imports do not reference Node sockets, TLS, proxy implementations, SMTP classes, or
TypeORM entities.

Update `src/libs/modules/email-verification/README.md` and `bruno/smtp-dev/README.md` for moved source paths only. Run
the shrink-only baseline update. All core, persistence, discovery, email-admin, and mailbox keys should now be gone;
sync, deprecated-sync, async, and batch keys remain assigned to plans 11, 15, and 16.

## Interfaces and Dependencies

The adapter implements the plan-10 `MailboxProbe` port with organization ID, mailbox address value, MX target, and
bounded execution context. It consumes the plan-17 `SmtpVerificationStore`, plan-13 DNS/synonym discovery values,
and plan-05 public proxy lease interfaces. Account-discovery policy and provider composition remain owned by
`account-discovery/01` and `account-discovery/02`. No SMTP, proxy, DNS, TypeORM, or provider implementation
becomes public.

Configuration stays the privacy-plan-05 contract, including `SMTP_PORT`, optional `SMTP_TLS_CA_FILE`, and the existing
phase deadlines. No HTTP, queue, S3, database-schema, or public TypeScript interface changes. The top-level barrel
still exports only `EmailVerificationModule`.

## Acceptance Criteria

- SMTP/socket/TLS/proxy implementation lives under infrastructure and application/domain imports none of it.
- The protocol sends no `MAIL FROM` or `RCPT TO` before successful peer-verified STARTTLS and second `EHLO`.
- Missing STARTTLS, rejection, wrong-host/untrusted certificate, timeout, or post-upgrade failure yields
  `secure_transport_unavailable` without address disclosure.
- Default trust is retained when the optional SMTP CA is configured, SNI uses the MX exchange hostname, and every
  phase has a bounded abort path.
- Only caller-organization cache rows with `secureTransport: true` are reusable.
- Every success, failure, timeout, and cancellation destroys the socket and releases a lease exactly once.
- Logs contain no address, SMTP command/reply, proxy credential, certificate contents, or external error message.
- Recomposition preserves verification outcomes and leaves all delivery routes/jobs operational in legacy folders.
- Only core/network baseline keys disappear; delivery debt remains stable and the public barrel remains module-only.
- Focused, fixture, SMTP Bruno, architecture, full-suite, build, docs, and diff checks pass.

## Validation

Run focused contracts and architecture checks:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/mailbox src/libs/modules/email-verification/src/application src/libs/modules/email-verification/src/domain --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- smtp-client.spec.ts smtp-client.factory.spec.ts smtp-verifier.spec.ts email-verifier.module.spec.ts --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Focused tests must cover TLS-capable and plaintext fixtures, the full certificate/deadline matrix, every resource-release
ordering, organization-aware secure-cache reuse, and sentinel log scanning. Inspect the baseline diff and require
that delivery keys remain unchanged.

Before Docker use, inspect `lef-api-1` ownership. Start the owned SMTP overlay and run the exact container-network
Bruno command from `bruno/smtp-dev/README.md`. Require TLS success, plaintext downgrade rejection with no
address-bearing fixture command, deterministic proxy drain/restore, zero default provider dispatch, and all current
and deprecated route checks.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/14-layer-smtp-mailbox-adapter.md
    git diff --check

Bruno: update only moved-path and fixture-configuration references, then require the existing SMTP collection to pass in full.

## Idempotence and Recovery

Introduce and verify the new adapter before removing the compatibility binding. Repeated moves and baseline shrink
must be no-ops. If interrupted, keep one mailbox binding and complete the current adapter step; never enable
plaintext, reuse an insecure cache row, duplicate a lease, deep-import proxy infrastructure, or add baseline debt.

No schema changes. After confirming Compose ownership, reset only disposable development data with
`pnpm dev:reset -- --confirm-project=LEF`; restore proxy and DNS fixtures through documented reconcile commands.
Preserve unrelated changes and another checkout's services.

## Artifacts and Notes

Record the SMTP state, resource-release matrix, adapter map, composition map, secure-cache proof, removed/retained baseline keys,
focused totals, fixture transcripts with addresses excluded, SMTP Bruno totals, and full validation. Do not record
addresses, SMTP transcripts containing them, credentials, private keys, CA contents, tokens, or provider payloads.

## Plan readiness

Implemented and validated. See Outcomes & Retrospective.
