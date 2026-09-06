# Layer Email Domain Discovery Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move DNS MX resolution, remote domain-synonym discovery, and deterministic synonym parsing behind the ports created
by `module-architecture/10`. Replace the compatibility adapters introduced by `module-architecture/18` without
changing verification behavior. A developer can observe the separation through port contract tests, deterministic
DNS and HTTP fixtures, and the existing SMTP development workflow. Account-discovery policy and provider ownership
are delivered separately by `account-discovery/01` and `account-discovery/02` and remain unchanged here.

## Progress

- [ ] (2026-08-30) Characterize MX resolution, synonym retrieval, parsing, and failure behavior.
- [ ] (2026-08-30) Move DNS and HTTP synonym retrieval into purpose-specific infrastructure adapters.
- [ ] (2026-09-06) Reuse the completed internal account-discovery boundary without changing its policy or providers.
- [ ] (2026-08-30) Shrink domain-discovery baseline keys and complete focused, runtime, architecture, and full checks.

## Plan dependencies

- `module-architecture/10`
- `module-architecture/18`
- `account-discovery/02`
- `privacy-compliance/02`
- `privacy-compliance/03`

## Surprises & Discoveries

- The original plan combined domain discovery with provider relocation and described `AccountDiscovery` as an
  existing formal port. Inspection on 2026-09-06 found the shared `ICatchAllVerifier[]` mechanism instead.
- The active cutover PR #540 already relocates the legacy domain-synonym helper under infrastructure. Follow its
  merged files when implementing this plan; do not recreate the old `domain/domain-synonym-finder.ts` path.
- The separate account-discovery plans now introduce the formal port and internalize providers after the cutover.
  This plan retains its stable `module-architecture/13` identity and owns DNS and domain synonyms only.

## Decision Log

- Decision: Put MX resolution and remote synonym retrieval under `src/infrastructure/discovery/{dns,http}/`.
  Keep deterministic parsing in domain only when it accepts supplied text and URLs and imports no HTTP or framework facility.
  Rationale: Parsing is a pure transformation; DNS and page retrieval are external side effects.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Assign the internal account-discovery port and provider relocation to `account-discovery/01` and
  `account-discovery/02`; remove those implementation responsibilities from this plan.
  Rationale: Domain discovery and external account evidence are separate adapters with independently testable outcomes.
  One owner for each change avoids competing selectors and conflicting provider locations.
  Date/Author: 2026-09-06, Codex planning, following the user's accepted ownership direction.
- Decision: Preserve existing request, parsing, cache, retry, timeout, result, and logging behavior while replacing
  the compatibility bindings.
  Rationale: This pull request changes dependency direction and source ownership, not verification policy.
  Date/Author: 2026-09-06, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The owning business module is `src/libs/modules/email-verification/`. Read its README, the canonical
`src/libs/modules/README.md`, and `src/libs/modules/AGENTS.md` before editing.

Plan 10 supplies the framework-free `MxResolver` and `DomainSynonymDiscovery` ports under `src/application/ports/`.
Plan 18 supplies their temporary bindings in `src/infrastructure/compatibility-mx-resolver.ts` and
`src/infrastructure/compatibility-domain-synonym-discovery.ts`. The cutover also places the legacy retrieval/parsing
helper at `src/infrastructure/domain-synonym-discovery.util.ts`. MX lookup ultimately uses `src/libs/dns/`.
At the inspected cutover head, `src/sync-email-verification/email-verification.module.ts` registers these bindings.
Recheck the merged prerequisite and preserve its final composition location unless moving that location is explicitly
owned by another plan.

`account-discovery/01` introduces the internal `AccountDiscovery` port and its application service;
`account-discovery/02` puts HTTP provider adapters and private Nest composition under
`src/infrastructure/account-discovery/` and retires `src/libs/catch-all/`. This plan consumes that completed boundary.
It must not recreate `src/infrastructure/discovery/account/`, a provider library, or a second account selector.
The existing default-deny behavior remains a regression constraint, not an implementation task here.

## Scope and Non-Goals

Relocate and adapt MX lookup, HTTP domain-synonym retrieval, deterministic parsing, response mapping, and their
configuration bindings. Replace the two compatibility implementations, move their focused tests, update the module
README, and remove only resolved domain-discovery baseline entries.

Do not change account-discovery policy, clients, approval data, manifest loading, fixed purpose, selected region,
provider request behavior, or its private module. Do not change mailbox SMTP/proxy probing; plan 14 owns it.
Preserve core heuristics, organization ownership, logging, HTTP routes, queues, storage, configuration, and public
exports. Do not add a provider, approval, endpoint, migration, backfill, or production rollout.

## Plan of Work

Capture contract fixtures for MX success, no record, and failure; HTTP retrieval success, transport failure, status
failure, and malformed content; and deterministic synonym parsing. Record the current ordering, deduplication,
normalization, cache use, request count, timeout, and retry behavior before moving implementations. Preserve existing
behavior; do not introduce new deadline or retry policies under an architecture refactor.

Implement `MxResolver` over the technical DNS library without exposing its concrete service through the application
port. Place the implementation under `src/infrastructure/discovery/dns/`. Split synonym behavior so the application
requests it through `DomainSynonymDiscovery`, the HTTP adapter under `src/infrastructure/discovery/http/` retrieves
content, and a pure parser consumes supplied content. Place the parser below `src/domain/` only if it has no framework
or network dependencies. Map errors to the same application outcomes as the compatibility implementations.

Replace only the `MxResolver` and `DomainSynonymDiscovery` registrations in the current composition module. Retain
the completed private account-discovery module and its token binding without wrapping, moving, or duplicating them.
Remove the two obsolete compatibility adapters and unused retrieval helper only after their replacement contract
tests pass. Keep the mailbox compatibility adapter for plan 14. Update the module README and any current fixture
documentation that refers to moved source paths.

Run the read-only architecture gate. If it reports only stale entries caused by these moves, inspect each resolved
entry, run the shrink-only baseline updater, and rerun the gate. SMTP and delivery debt belong to later plans.
Review the final diff against SOLID and the canonical module contract.

## Interfaces and Dependencies

The adapters implement `MxResolver` and `DomainSynonymDiscovery` from `application/ports/`. Inputs and outputs remain
the existing application values; Node DNS records, Axios responses, provider payloads, and configuration clients do
not become application dependencies. Infrastructure may depend on the technical DNS library and Nest HTTP/configuration.
The application core depends only on its ports. No new public TypeScript, HTTP, queue, database, or S3 API is added.

The private account-discovery port and composition come from `account-discovery/01` and `account-discovery/02`.
Plan 14 consumes the completed DNS and synonym adapters plus that existing account-discovery boundary when composing
mailbox probing. Privacy plan 03 remains the logging contract for all infrastructure touched here.

## Acceptance Criteria

- Application and domain code import no technical DNS client, Nest HTTP client, or provider implementation.
- MX and synonym adapters preserve successful results, no-result behavior, failure mapping, ordering, request count,
  and existing timeout, retry, and cache semantics in deterministic contract fixtures.
- The two compatibility discovery adapters are no longer registered or referenced. The mailbox compatibility adapter
  remains available for plan 14, and account discovery retains exactly its existing composition and policy.
- No account-discovery implementation appears under `infrastructure/discovery/account/`, and the retired catch-all
  library is not restored. Disabled discovery still makes zero provider calls in the existing counter-based tests.
- Logs and errors preserve the existing restrictions on addresses, URLs, payloads, and remote error messages.
- Verification result mapping, organization ownership, routes, queues, storage, and the module-only public barrel
  remain unchanged. Only resolved domain-discovery baseline entries disappear.
- Focused tests, architecture checks, type checking, lint, the full suite, build, and documentation checks pass.
  The owned SMTP development collection confirms unchanged runtime behavior when dependencies are available.

## Validation

Run domain-discovery contracts and account-discovery regression coverage:

    corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/discovery src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/infrastructure/account-discovery src/libs/modules/email-verification/src/application/account-discovery src/libs/dns/src --runInBand
    corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree
    corepack pnpm architecture:check

Inspect the baseline diff and reject added or broadened entries. Run `corepack pnpm architecture:baseline` only when
the initial check reports stale entries that this plan resolved, then rerun `corepack pnpm architecture:check`.
The account-discovery regression suites own approval, dispatch-counter, concurrency, and safe-logging evidence;
this plan must not replace those tests with response-source assertions.

Follow `bruno/smtp-dev/README.md` to prepare this checkout's disposable SMTP overlay. After verifying container
ownership and rebuilding the API, run the supported collection launcher:

    corepack pnpm bruno:smtp-dev

It runs `bru run --env local --sandbox developer` inside the API container. Preserve the empty approval manifest
and require the current success and rejection scenarios to pass. If runtime prerequisites are unavailable, record
that limitation explicitly rather than claiming runtime validation from unit tests.

Finish with:

    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/13-layer-email-discovery-adapters.md
    git diff --check

Bruno: reuse the existing SMTP collection for changed integration wiring, update only materially affected assertions
or stale references, and report the actual execution result. No new collection or provider activation is required.

## Idempotence and Recovery

Add and verify each new adapter before removing its compatibility registration, then keep one binding per port.
File moves and baseline shrink are repeatable. If interrupted, recover one adapter at a time from its contract test;
do not duplicate a provider binding, widen a baseline entry, or change account-discovery policy to make checks pass.

This plan changes no schema or durable data and needs no migration or reseed. Restore only owned local proxy/DNS
fixtures through their documented commands. Preserve another checkout's containers and unrelated user changes.

## Artifacts and Notes

Record the domain adapter map, contract scenarios, removed baseline entries, retained account-discovery binding,
SMTP Bruno totals, and actual validation results. Never record credentials, raw addresses, provider payloads,
address-bearing SMTP transcripts, or external response bodies.

## Plan readiness

Ready to implement
