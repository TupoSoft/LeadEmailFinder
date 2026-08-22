# Document every business module

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Every business capability should explain what it owns and how another developer can safely use, change, and verify
it without reconstructing the boundary from Nest metadata, package aliases, tests, and Bruno collections. After this
change, each final directory under `src/libs/modules` has a concise `README.md` following one repository convention,
and the modules directory README links to the complete catalog.

## Progress

- [ ] (2026-08-22) Define the module README contract in the modules directory guide.
- [ ] (2026-08-22) Add code-backed README files for all nine final business modules.
- [ ] (2026-08-22) Verify coverage, links, paths, public surfaces, and formatting.

## Plan dependencies

- `module-boundaries/08`

## Surprises & Discoveries

- Five business modules currently live under `src/libs/modules`: `auth`, `bff-session`, `credits`, `identity`, and
  `proxy`. Four more are deliberately scheduled to move there by `module-boundaries/05` through
  `module-boundaries/08`: `payments`, `organization-onboarding`, `service-client-management`, and
  `email-verification`.
- `src/libs/modules/README.md` describes dependency direction and a preferred layered layout, but it neither requires
  per-module documentation nor catalogs the modules. No current business module has its own README.
- The modules have materially different operational surfaces: some own HTTP controllers, some expose only Nest or
  application contracts, some own TypeORM state, and email verification also owns BullMQ workers and S3/SMTP flows.
  A useful template must allow explicit `None` entries instead of forcing every section to invent a concern.
- Existing Bruno README files already contain detailed fixture commands and limitations. Module READMEs should link
  to them rather than copy instructions that can drift.

## Decision Log

- Decision: Deliver the README contract and all module READMEs in one documentation-only pull request.
  Rationale: the observable outcome is complete and consistent module documentation; splitting identical
  documentation work by module would create artificial ordering and partial adoption without reducing runtime risk.
  Date/Author: 2026-08-22, Codex planning.
- Decision: Place each file at `src/libs/modules/<module>/README.md`, beside the module's `src` directory.
  Rationale: this keeps documentation visible at the ownership boundary without mixing it into the TypeScript public
  barrel or compiled source tree.
  Date/Author: 2026-08-22, Codex planning.
- Decision: Make `src/libs/modules/README.md` the contract and catalog, not a copyable template file.
  Rationale: one short normative checklist is easier to keep current, while each module README should describe real
  code rather than retain unused placeholder headings.
  Date/Author: 2026-08-22, Codex planning.
- Decision: Depend on `module-boundaries/08` and document only final module paths.
  Rationale: documenting the four temporary API-host locations would immediately stale paths and links during the
  already-planned relocations.
  Date/Author: 2026-08-22, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/README.md` defines business-module ownership and inward dependency direction. TypeScript aliases in
`tsconfig.json`, mirrored by Jest resolution in `jest.config.ts`, expose modules as
`@tuposoft/lead-email-finder/modules/<module>`. Each module's `src/index.ts` is its intended compile-time public
surface; Nest `imports`, `controllers`, `providers`, and `exports` in its root `*.module.ts` show composition and
runtime exposure. The API host at `src/lead-email-finder-api/src/lead-email-finder-api.module.ts` remains the
composition root.

The final catalog and the minimum module-specific subjects are:

- `auth`: default-deny credential authentication and permission guards; public decorators, guards, principal types,
  and `AuthenticationService`; identity and BFF-session dependencies; OIDC configuration; M2M and live-Keycloak
  validation links.
- `bff-session`: browser login, callback, session, refresh, logout, CSRF, and origin protection; exported credential
  authenticator; identity, Redis, Keycloak/OIDC, cookie, timeout, and encryption-key concerns; BFF Bruno and live
  Keycloak coverage.
- `identity`: organizations, memberships, external identities, service credentials, invitations, credit accounts,
  ledger records, and audit entries; exported identity entities and resolver; TypeORM ownership and schema-focused
  tests; no HTTP controller of its own.
- `credits`: organization balance lookup, administrative grant/set operations, debit/grant application behavior,
  `CreditGuard`, and `CreditsService`; auth/identity dependencies; identity-owned ledger persistence; relevant
  credit-purchase and SMTP/verification workflow links.
- `proxy`: secured registry CRUD/blacklists, healthy allocation, leases, registry lookup, and allocation observation;
  public Nest module plus common proxy tokens/contracts; TypeORM proxy ownership and lease configuration; proxy
  registry and SMTP fixture links.
- `payments`: credit-pack checkout, purchase listing, signed webhook ingestion, provider/store ports, stub and Paddle
  adapters, purchase persistence, and idempotent credit grants; payment configuration and provider selection;
  credit-purchases Bruno coverage.
- `organization-onboarding`: organization creation, invitations, acceptance, membership listing/change/removal,
  final-owner protection, and Keycloak compensation; auth/identity dependencies and Keycloak admin configuration;
  organization-onboarding Bruno and optional live-Keycloak coverage.
- `service-client-management`: organization-owned M2M client creation, listing, secret rotation, disablement, and
  deletion; human-session authorization, local credential authority, provider compensation/recovery, and Keycloak
  configuration; service-client Bruno rejection coverage and optional live lifecycle coverage.
- `email-verification`: current and deprecated synchronous verification, async and batch workflows, email/domain
  persistence, BullMQ queues, S3 results, DNS/catch-all/SMTP behavior, credits, and proxy allocation; endpoint and job
  compatibility; focused unit/integration tests and SMTP Bruno coverage.

## Scope and Non-Goals

Update `src/libs/modules/README.md` with the documentation contract and linked module catalog. Add:

- `src/libs/modules/auth/README.md`
- `src/libs/modules/bff-session/README.md`
- `src/libs/modules/credits/README.md`
- `src/libs/modules/identity/README.md`
- `src/libs/modules/proxy/README.md`
- `src/libs/modules/payments/README.md`
- `src/libs/modules/organization-onboarding/README.md`
- `src/libs/modules/service-client-management/README.md`
- `src/libs/modules/email-verification/README.md`

Each README covers responsibility and non-responsibilities, public API, direct module dependencies, externally
observable HTTP or worker behavior when present, owned persistence, runtime configuration by key name without values,
and focused validation/related Bruno documentation. Use `None` or omit an optional subsection when the code has no
such surface. Link to the root README for whole-stack setup and to the nearest Bruno README for executable HTTP
workflows.

Do not modify TypeScript, Nest wiring, aliases, endpoint behavior, schemas, environment validation, tests, Bruno
requests, Compose files, or application architecture. Do not add READMEs to the API composition root, nested Nest
submodules, or technical libraries under `src/libs/{catch-all,common,config,dns,redis,socket}`. Do not document
secrets, local generated credentials, internal test-controller routes, or speculative future behavior.

## Plan of Work

First, revise `src/libs/modules/README.md` so its current architecture guidance remains intact while adding a concise
documentation checklist and an alphabetized catalog linking to every module README. State that the `src/index.ts`
barrel is authoritative for compile-time exports and that a README must not turn a deep implementation import into a
supported contract.

Then write the nine module READMEs from the post-`module-boundaries/08` code. For every module, compare its root Nest
module, `src/index.ts`, controllers, configuration factories/read sites, entities/repositories, queues/processors, and
focused specs. Describe dependencies by capability and public alias, not by incidental deep file import. Name routes,
queue names, persistence ownership, and configuration keys only when the module actually owns or consumes them.

Finally, link existing workflow documentation instead of reproducing it. The primary mappings are
`bruno/m2m-oidc-authentication` for auth, `bruno/bff-sessions` for BFF session, `bruno/proxy-registry` for proxy,
`bruno/credit-purchases` for payments, `bruno/organization-onboarding` for onboarding,
`bruno/service-client-management` for service clients, and `bruno/smtp-dev` plus the nearest verification collection
for email verification and credits. Make every relative link resolve from its README location.

## Interfaces and Dependencies

This plan adds no runtime interface or dependency. The documentation contract treats each module's public
`src/index.ts` and injected tokens exported through intentional public packages as authoritative. Nest providers,
HTTP routes, DTOs, entity metadata, environment variables, queues, and package aliases remain unchanged.

Implementation waits for `module-boundaries/08`, which establishes all final directories and aliases. No later plan
is required to consume these READMEs; future module additions should follow the updated directory guide.

## Acceptance Criteria

- Every immediate business-module directory under `src/libs/modules` has a sibling `README.md`, and the expected set
  is exactly the nine modules listed in this plan after `module-boundaries/08`.
- `src/libs/modules/README.md` defines the minimum documentation contract and links to all nine module READMEs.
- Each module README accurately states its responsibility, intentional public surface, direct capability
  dependencies, owned runtime surfaces, configuration key names, persistence ownership, and focused validation based
  on current code; absent concerns are explicit rather than implied.
- No README presents a deep import as public when the symbol is absent from the module's `src/index.ts` or an
  intentional shared-contract barrel.
- All repository-relative links resolve, and workflow/setup details link to their authoritative root or Bruno README
  rather than being duplicated.
- Documentation contains no secret values, generated credentials, bearer tokens, invitation tokens, Paddle secrets,
  Keycloak administrator credentials, or speculative claims.
- The pull request changes Markdown files only and does not change externally observable HTTP, worker, persistence,
  authentication, authorization, or configuration behavior.

## Validation

List module directories and assert README coverage with:

    for module in src/libs/modules/*; do test -d "$module" || continue; test -f "$module/README.md" || exit 1; done

Compare the directory names with the nine-entry catalog in this plan and inspect `git diff --name-only` to confirm
that only the modules guide and per-module Markdown files changed. Run `git diff --check` and
`corepack pnpm exec prettier --check 'src/libs/modules/**/*.md'`.

For each module, compare documented exports against `src/libs/modules/<module>/src/index.ts`; compare routes against
controller decorators, configuration keys against configuration factories/read sites, persistence claims against
TypeORM registration/entities, and queue names against BullMQ registration/constants. Check every relative Markdown
link with a repository-local link checker if one is available; otherwise resolve each target with `test -e` and
record the manual link audit.

No Jest, build, container, database, or Bruno execution is required because the implementation is Markdown-only and
does not alter HTTP behavior. If any non-documentation file changes during implementation, stop and split or expand
validation rather than relying on this exemption.

## Idempotence and Recovery

Documentation edits are safe to repeat. If implementation is interrupted, use `git status` and the module catalog to
identify missing or partial README files, preserving unrelated user changes. Restore accuracy by re-reading the
current module barrel, Nest metadata, configuration, persistence, and tests; never resolve drift by changing runtime
code inside this documentation pull request.

## Artifacts and Notes

Record the final module-to-README coverage list, changed-file list, Prettier result, `git diff --check` result, and
link-audit result. Runtime test output is not an expected artifact for this documentation-only plan.

## Plan readiness

Ready to implement.
