# Layer Email Domain Discovery Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move DNS MX resolution, remote domain-synonym discovery, and deterministic synonym parsing behind the ports created
by `module-architecture/10`. Replace the compatibility adapters introduced by `module-architecture/18` without
changing verification behavior. A developer can observe the separation through port contract tests, deterministic
DNS and HTTP fixtures, and the existing SMTP development workflow. Account-discovery policy and provider ownership
are delivered separately by `account-discovery/01` and `account-discovery/02` and remain unchanged here.

## Progress

- [x] (2026-09-06) Characterize MX resolution, synonym retrieval, parsing, and failure behavior.
- [x] (2026-09-06) Move DNS and HTTP synonym retrieval into purpose-specific infrastructure adapters.
- [ ] (2026-09-06) Integrate the completed account-discovery boundary after #548; its prerequisite #547 is also open.
- [x] (2026-09-06) Verify the unchanged baseline and complete focused, runtime, architecture, and full checks for the current composition.

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

- PR #545 was implemented before the ownership change in #544 merged. Its original combined implementation is
  preserved in commit `02bf522`. On 2026-09-06, the user chose to align #545 with the new domain-only scope.
  Account-discovery code, its tests, and its baseline entry are restored to match master in the merge resolution.
- The new `account-discovery/02` prerequisite is not implemented yet. The domain adapters can be tested with the
  existing account-discovery composition, but this does not fulfill the prerequisite. Keep #545 draft and complete
  the final integration after #548 lands.
- The injected HTTP transport owns request deadlines and retry behavior. The current composition sets neither an
  adapter-specific deadline nor a retry policy, and this refactor preserves those defaults.

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

- Decision: Resolve the conflict by retaining only DNS, HTTP synonym retrieval, and parser changes in #545.
  Restore account-discovery implementation and composition to master, preserve the new plan dependencies, and
  retain the original work in Git history.
  Rationale: The user selected the narrower scope established by #544. Account discovery has separate owners
  in #547 and #548, and its planned evidence interface differs from the earlier implementation.
  Date/Author: 2026-09-06, Codex implementation, following the user's scope selection.

## Outcomes & Retrospective

The two domain-discovery compatibility adapters are replaced, and deterministic parsing now lives in domain.
The current account-discovery composition, SMTP implementation, public interfaces, and architecture baseline match
master. Validation of the narrowed diff passed: 104 focused tests, 1,793 full-suite tests, and all 15 runner tests.
The full Jest run skipped 11 opt-in suites and 65 tests. The existing SMTP collection passed 22 requests and
44 tests with zero account-discovery proxy requests. Integration with the future account-discovery boundary remains
pending #548; this plan is not marked complete.

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

The implemented adapters are `infrastructure/discovery/dns/dns-mx-resolver.ts` and
`infrastructure/discovery/http/http-domain-synonym-discovery.ts`; their pure parser is
`domain/domain-synonym-parser.ts`. The synchronous composition replaces only the two discovery registrations.
Account discovery retains `CATCH_ALL_VERIFIERS_TOKEN` and the existing `EmailVerifierModule` until its own plans land.
No baseline entry is removed by the narrowed domain-only diff.

Validation totals from the earlier combined implementation remain historical evidence in commit `02bf522`.
Fresh validation of the narrowed scope completed on 2026-09-06:

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/discovery src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/infrastructure/account-discovery src/libs/modules/email-verification/src/application/account-discovery src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts src/libs/modules/email-verification/src/email-verifier/email-verifier.module.spec.ts src/libs/catch-all/src src/libs/dns/src --runInBand`
  passed 16 suites and 104 tests.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci` passed 200 Jest suites and 1,793 tests.
  Its 11 opt-in suites and 65 skipped tests remain unverified; all 15 OIDC/Bruno runner tests passed.
- `corepack pnpm typecheck`, `corepack pnpm build`, and `corepack pnpm lint` passed.
  ESLint retained one existing return-type warning in `src/libs/config/src/load-secrets.spec.ts`.
- `corepack pnpm architecture:check` passed with 9 modules and the unchanged 69 baseline entries.
  The security scan returned no findings, and the approval check confirmed the unchanged empty manifest.
- `DOCKER_HOST=unix:///run/user/1000/docker.sock DOCKER_CONFIG=/tmp/lef458-docker COMPOSE_PROJECT_NAME=lef45854fd corepack pnpm bruno:smtp-dev`
  passed 22 requests and 44 tests with zero skips. The isolated proxy counted both HTTP and CONNECT positive
  controls, then remained at zero after reset throughout the collection. Provider selection, approval ID, and
  region remained absent. This run reused retained fixture data, including the secure SMTP cache result;
  the plaintext fixture exercised the EHLO rejection path.
- Ignored evidence at `.dev/keycloak/issue-458-smtp-narrowed-scope-validation.json` records source fingerprints,
  container ownership, counters, and sanitized log totals. Task-owned containers and the temporary environment
  file are removed after validation; unrelated containers are preserved.
- `corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/13-layer-email-discovery-adapters.md`
  passed Harper for all three files. `git diff --check` passed, and independent review found no actionable
  architectural issue.

Never record credentials, raw addresses, provider payloads, address-bearing SMTP transcripts, or external responses.

## Plan readiness

Ready to implement
