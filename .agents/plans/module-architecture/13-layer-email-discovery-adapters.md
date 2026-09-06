# Layer Email Domain and Account Discovery Adapters

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Move DNS MX resolution, remote domain-synonym discovery, deterministic synonym parsing, and approved external
account-discovery providers behind the ports created by plan 10. After this pull request, the verification core has
no dependency on the technical DNS or catch-all libraries, Nest HTTP, provider request shapes, or mutable provider
clients. A developer can observe the separation through port contract tests, deterministic HTTP/DNS fixtures, the
default-deny provider matrix, and the existing SMTP-development flow making zero account-discovery requests unless
one exact approved provider is selected.

## Progress

- [x] (2026-09-06) Characterize MX, synonym, parser, provider-selection, approval, retry, and failure behavior.
- [x] (2026-09-06) Move DNS and HTTP synonym retrieval into purpose-specific infrastructure adapters.
- [x] (2026-09-06) Move approved account-discovery implementations behind one default-deny adapter boundary.
- [x] (2026-09-06) Preserve the approval manifest, PII-safe logging, concurrency, and compatibility result mapping.
- [x] (2026-09-06) Shrink discovery-owned baseline keys and complete focused, runtime, architecture, and full checks.

## Plan dependencies

- `module-architecture/10`
- `module-architecture/18`
- `privacy-compliance/02`
- `privacy-compliance/03`

## Surprises & Discoveries

- Plan 18 has already moved synonym retrieval and parsing to the compatibility adapter and utility under
  `infrastructure/`. MX and synonym ports are registered but the current SMTP engine still owns its existing DNS
  path; plan 14 performs the mailbox cutover.
- The core still consumes `ICatchAllVerifier[]`; there is no dedicated `AccountDiscovery` port despite the original
  plan description. Configuration already selects zero or one provider, so this change makes that constraint
  explicit in the application contract.
- Synonym HTTP retrieval has no adapter-specific timeout, retry, or response-size setting. Preserve the injected
  HTTP client's configuration and its default behavior; deterministic fixtures can supply a deadline without
  introducing a new runtime policy.
- The technical HTTP options factory constructs its proxy URL before the discovery module factory runs.
  Invalid URL errors can retain the submitted URL, so sanitization must occur in the options constructor itself.
- The first full-suite run encountered an unrelated intermittent session-encryption test: it overwrites the first
  random ciphertext character with `x`, which sometimes leaves the ciphertext unchanged. The unchanged test passed
  on a focused retry; its source is outside this plan.
- Host `build` and `openapi:check` commands write the same `dist/` mounted by the development API watcher. Running
  them together stopped the API and caused connection failures in Bruno. Finish those checks before restarting
  the API and running the collection.
- The technical `src/libs/catch-all/` library owns concrete provider clients and HTTP configuration, while the
  business module decides how provider evidence participates in a verification result.
- Privacy plan 02 removes the LinkedIn adapter and makes the committed approval manifest empty by default; a network
  refactor must not recreate it through a compatibility export or default provider array.

## Decision Log

- Decision: Put MX resolution and remote synonym retrieval under
  `src/infrastructure/discovery/{dns,http}/`, with deterministic parsing in domain only when it accepts supplied text
  and URLs and imports no HTTP or framework facility.
  Rationale: Parsing is a pure transformation; DNS and page retrieval are external side effects.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Put provider-specific account discovery under `src/infrastructure/discovery/account/` and expose only
  the plan-10 `AccountDiscovery` port to application.
  Rationale: Provider payloads, endpoints, proxies, and response mapping must remain replaceable infrastructure.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Consume the fixed `config/privacy/account-discovery-approvals.yaml` from privacy plan 02 and its exact configuration
  keys `CATCH_ALL_PROVIDER`, `CATCH_ALL_PROVIDER_APPROVAL_ID`, `CATCH_ALL_PROVIDER_REGION`, and
  `CATCH_ALL_HTTP_PROXY_URL`. Validate the approval at startup and immediately before disclosure.
  Rationale: Relocation cannot let environment configuration substitute for repository-owned approval evidence.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve zero-or-one provider activation, the fixed purpose
  `email_verification.account_discovery`, regional matching, approval validity, and default zero dispatch. Never add
  the removed LinkedIn implementation; retain a historical result literal only at a read mapper if required.
  Rationale: Adapter composition must preserve the privacy safety boundary, not merely provider response semantics.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Provider request bodies are immutable per request or cloned within the adapter, and concurrent requests
  cannot share address-bearing mutable state.
  Rationale: A singleton Nest provider must not leak one organization's input into another request.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Preserve the stable-operation-code logging from privacy plan 03 and never log addresses, full URLs with query
  values, provider bodies, responses, credentials, or external message text.
  Rationale: Moving adapters must not create a second sensitive log path.
  Date/Author: 2026-08-30, Codex planning.
- Decision: Replace the core's provider array with `AccountDiscovery | undefined`, and move configuration and
  provider composition into `infrastructure/discovery/account/`. Keep approval validation in application.
  Rationale: The existing configuration permits at most one provider; the core contract should express that rule
  without provider payloads or configuration keys.
  Date/Author: 2026-09-06, Codex implementation.

## Outcomes & Retrospective

The DNS and synonym compatibility adapters are replaced, the parser is a pure domain transformation, and account
discovery uses a single optional application port with infrastructure-owned configuration and provider composition.
Unexpected DNS, provider, manifest, and malformed-proxy exceptions are redacted. No approval manifest entry or
provider activation is added. All focused and required local checks passed. The existing SMTP collection passed
22 requests and 44 tests, with no skipped requests or tests and zero HTTP or CONNECT requests to the counting
proxy fixture. The full Jest run passed 201 suites and 1,842 tests, with 11 opt-in suites and 65 tests skipped;
all 15 OIDC and Bruno runner tests passed.

The architecture baseline shrank from 69 to 68 keys, removing only the deleted discovery constants entry. SMTP
and delivery keys remain unchanged. Review found no material SOLID violation. The DNS and synonym ports remain
registered for plan 14, and the existing transport configuration remains authoritative: this plan adds neither
a timeout nor a retry policy. Provider success is tested with deterministic fixtures, without live vendor calls.
No schema, route, queue, public barrel, approval evidence, or external provider activation changed.

## Context and Orientation

Plan 10 places pure verification policy and the `MxResolver` and `DomainSynonymDiscovery` ports under the
email-verification application boundary. This plan adds the missing explicit `AccountDiscovery` port. Plan 18 temporarily binds legacy implementations behind thin
compatibility adapters for `MxResolver` and `DomainSynonymDiscovery` so runtime behavior continues (`AccountDiscovery`
already has approval policy from a prior privacy-compliance plan but still uses the shared verifier-array contract).
Current MX resolution comes from `src/libs/dns/`; synonym retrieval and parsing live in the compatibility
adapter and utility below `email-verification/src/infrastructure/`; concrete external account checks live in
`src/libs/catch-all/` and were previously composed through `email-verifier/`.

Privacy plan 02 establishes an empty-by-default approval manifest, removes LinkedIn session material and its adapter,
permits only named technical providers, and requires one matching active approval. Privacy plan 03 ensures requests,
errors, and provider behavior use an allowlisted logging shape. This plan changes ownership and dependency direction
only; it does not authorize a vendor or approve a manifest entry.

## Scope and Non-Goals

Relocate and adapt DNS resolution, HTTP synonym retrieval, pure parsing, account-discovery selection, provider
clients, response mapping, and their configuration bindings. Replace the `MxResolver` and
`DomainSynonymDiscovery` compatibility bindings from plan 18, move focused tests, update the module README, and
remove only discovery-related baseline keys.

Do not change mailbox SMTP/proxy probing; plan 14 owns it. Do not change core heuristics, provider allowlist, approval
schema or evidence, fixed purpose, supported regions, request count, response meaning, retries, request deadline policy,
organization ownership, logs, HTTP routes, queue behavior, storage, or public exports. Do not add a provider,
manifest approval, endpoint, migration, backfill, or production rollout.

## Plan of Work

Capture adapter contract fixtures for MX success/no-record/error, HTTP timeouts, status failures, malformed content,
and pure synonym parsing. Cover zero provider selection, partial configuration, invalid configuration, expired or
mismatched approval, results from each allowed provider, concurrent inputs, and external failure mapping. Fixtures use
synthetic domains and addresses and never real vendor credentials.

Implement `MxResolver` over the technical DNS library without exposing its service class. Split synonym behavior so
the application requests discovery through a port, the HTTP adapter retrieves content with the injected transport's existing retry
and timeout semantics, and a pure parser handles supplied content. Map failures to existing stable application
outcomes rather than leaking HTTP/DNS errors.

Implement one account-discovery selector that returns no adapter when `CATCH_ALL_PROVIDER` is absent. When selected,
require proxy configuration plus approval ID and region, load the fixed manifest, and validate ID/provider/purpose/
region/time at startup and per disclosure. Bind exactly one provider adapter. Clone request state per invocation and
sanitize all errors before they cross the adapter or logger boundary.

Remove legacy direct imports and compatibility registrations only after focused contract tests pass. Keep the
top-level barrel module-only. Update source-path documentation and run the shrink-only baseline command; discovery
keys may disappear, while SMTP and all delivery keys remain for plans 14, 11, 15, and 16.

## Interfaces and Dependencies

The plan implements the internal `MxResolver`, `DomainSynonymDiscovery`, and `AccountDiscovery` interfaces.
Inputs and outputs are domain/application values, not Node DNS results, Axios responses, or provider payloads. The
configuration and fixed approval manifest contract from privacy plan 02 remains exact. No public HTTP, queue,
database, S3, or TypeScript API changes.

The infrastructure adapters may depend on technical DNS/catch-all libraries and Nest HTTP/configuration. The core
may depend only on the ports. The logger contract from privacy plan 03 applies to every new adapter. Plan 14 consumes the
completed discovery side when composing mailbox probing.

## Acceptance Criteria

- Core application/domain files contain no technical DNS/catch-all, Nest HTTP, provider client, proxy, or transport
  response import.
- MX, HTTP retrieval, parsing, and provider adapters satisfy focused success, failure, and deadline contracts.
- An absent provider performs zero account-discovery dispatch. A partial, unapproved, expired, mismatched, or multiple
  selection causes a fail-closed result.
- An approved selection makes no more than one provider request in the configured region and fixed purpose.
- The removed LinkedIn adapter, registration, credential material, and active value are not reintroduced.
- Concurrent provider calls cannot share or overwrite address-bearing request state.
- Logs and thrown errors contain no raw or encoded address, provider payload, credential, or external message.
- Verification result mapping, retry behavior, deadline behavior, organization ownership, routes, queues, and public barrel are
  unchanged.
- Only discovery-owned baseline keys disappear; SMTP and delivery debt remains stable.
- Focused, architecture, runtime, full-suite, build, documentation, and diff checks pass.

## Validation

Run discovery and privacy regression suites:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification/src/infrastructure/discovery src/libs/modules/email-verification/src/domain src/libs/modules/email-verification/src/application/account-discovery src/libs/modules/email-verification/src/application/mailbox-verification.service.spec.ts src/libs/catch-all/src src/libs/dns/src --runInBand
    corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Focused tests must include the complete provider configuration/approval matrix, an injected-clock expiry case, two
concurrent distinct inputs, zero default dispatch, and sentinel log scanning. Inspect the baseline diff and reject
any added, renamed, SMTP, or delivery key.

After confirming Docker ownership, run the exact SMTP-development collection from its README. With the committed
empty approval manifest and no selected provider, require all requests to pass and capture fixture-side evidence of
zero account-discovery dispatch.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/13-layer-email-discovery-adapters.md
    git diff --check

Bruno: update only stale wiring and fixture-configuration references and rerun the existing SMTP collection; no new HTTP behavior is
introduced.

## Idempotence and Recovery

Add the new bindings before removing compatibility registrations, then ensure only one binding remains. File moves,
manifest reads, and baseline shrink are repeatable. If interrupted, recover one adapter at a time from its contract
test; do not enable a fallback array, duplicate dispatch, deep import, or baseline exception.

This plan creates no durable schema state. Restore the owned local proxy/DNS fixtures with their documented
reconcile commands. Preserve another checkout's containers and unrelated user changes.

## Artifacts and Notes

Validation completed on 2026-09-06:

- The focused command above passed 17 suites and 153 tests. The provider contracts cover every allowed source
  and both boolean results. They reject invalid selection and approvals whose fields, status, or validity period
  do not match. Tests also cover expiry
  after startup, concurrent distinct inputs with reversed completion order, one request without fallback, transport
  failures, and sentinel scans of logs and thrown errors. DNS and local HTTP fixtures cover cache/order,
  no records, status failures, malformed content, and configured deadline failures.
- `corepack pnpm architecture:baseline` removed only
  `source-placement|src/libs/modules/email-verification/src/email-verifier/email-verifier.constants.ts|email-verifier/email-verifier.constants.ts`.
  `corepack pnpm architecture:check` passed with 9 modules and 68 baseline keys.
- `corepack pnpm privacy:account-discovery-approvals-check` reported the unchanged empty approval manifest.
  `corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree` returned an empty finding list.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck`, `lint`, `test:ci`, and `build` passed.
  The full suite totals and opt-in skips are recorded above. ESLint reported zero errors and one existing
  return-type warning in `src/libs/config/src/load-secrets.spec.ts`. `corepack pnpm openapi:check` passed.
- `corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/module-architecture/13-layer-email-discovery-adapters.md`
  passed Harper for all three files. `git diff --check` passed.
- `DOCKER_HOST=unix:///run/user/1000/docker.sock DOCKER_CONFIG=/tmp/lef458-docker COMPOSE_PROJECT_NAME=lef45854fd corepack pnpm bruno:smtp-dev`
  passed using Bruno 4.1.0: 22 requests, 44 tests, zero skipped. The launcher verified this checkout's Compose
  ownership. An isolated counting HTTP/CONNECT sink refused forwarding; a control probe confirmed one observed
  request before resetting the counter. Both counters were zero before and after the collection. Only the local
  proxy was configured; provider, approval ID, and region were absent, and approvals remained empty.
- Ignored local evidence is in `.dev/keycloak/issue-458-smtp-validation.json`. It records aggregate results, zero-dispatch
  counters, sanitized log checks, and ownership labels for all 12 project containers. No raw input, provider
  response, credential, or SMTP transcript is committed. Task-owned containers and the temporary proxy-only
  environment file are removed after validation; isolated volumes and ignored development metadata remain.

The adapter map is documented under Architecture in the module README. This change is one pull request for #458.

## Plan readiness

Ready to implement
