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

- [ ] (2026-08-30) Characterize mailbox decisions, SMTP protocol, cache provenance, proxy leases, deadlines, and cleanup.
- [ ] (2026-08-30) Move SMTP client/factory/parser and proxy-backed probing under infrastructure.
- [ ] (2026-08-30) Bind the organization-aware SMTP store and final `MailboxProbe` implementation.
- [ ] (2026-08-30) Recompose the core/discovery/mailbox module and remove its remaining baseline keys.
- [ ] (2026-08-30) Complete focused, fixture, SMTP Bruno, architecture, full, and documentation validation.

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

## Outcomes & Retrospective

Not started.

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

Ready to implement
