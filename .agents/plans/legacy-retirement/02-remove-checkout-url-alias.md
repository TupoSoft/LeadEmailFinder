# Require the Canonical Payment Checkout URL Setting

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Payment checkout configuration should have one supported name. After this change, developers configure
`PAYMENTS_CHECKOUT_URL`, and any defined `PAYMENTS_CHECKOUT_RETURN_URL` causes initialization to fail with a message
that names the removed setting and its replacement without disclosing a value. Existing checkout creation continues
to pass the canonical URL to the selected payment provider.

## Progress

- [x] (2026-09-11) Reject the removed setting during environment normalization and remove its compatibility surface.
- [x] (2026-09-11) Update focused configuration coverage and the payments configuration documentation.
- [x] (2026-09-11) Run focused validation and record the unavailable Bruno regression prerequisites.

## Plan dependencies

- `payments/07`

## Surprises & Discoveries

- The updated rejection matrix failed all 15 cases against the previous implementation, while 79 existing and
  canonical-configuration cases passed. The matrix crosses five alias values with an absent, valid, or invalid
  canonical URL, including matching and conflicting URLs.
- No local Compose projects were running when checked with `docker compose ls --format json`. The existing Bruno
  regression requires a provisioned, owned disposable stack; it remains unverified.

## Decision Log

- Decision: Reject every defined alias, including an empty string, a matching canonical URL, and an invalid value.
  Test definition with `config['PAYMENTS_CHECKOUT_RETURN_URL'] !== undefined`.
  Rationale: Silently ignoring the old setting would leave developers uncertain whether it still works.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Use the exact message `PAYMENTS_CHECKOUT_RETURN_URL: removed; use PAYMENTS_CHECKOUT_URL`.
  Rationale: Setting names and a stable reason explain recovery without exposing either configured URL.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Preserve the environment normalization entry point and all optional secret-file checks.
  Rationale: These checks enforce configuration contracts unrelated to the removed alias.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Use the existing checkout Bruno collection only as regression coverage; add no alias-specific HTTP test.
  Rationale: The changed behavior occurs before application startup. The HTTP contract is unchanged.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Keep the dated maintenance inventory and completed payment plans as historical evidence.
  Rationale: They explicitly describe the earlier audit and implementation; the current payments README documents
  the supported configuration and recovery procedure.
  Date/Author: 2026-09-11, Codex implementation.

## Outcomes & Retrospective

Implemented the configuration retirement. Environment normalization rejects every defined alias with the exact
replacement message and returns canonical-only input unchanged. The compatibility helper and alias fields are
removed; optional secret-file conflict checks and payment composition retain their existing behavior.

All 105 focused tests passed, including 15 alias rejection cases. Architecture validation, type checking, build,
focused ESLint, TypeScript formatting, and Harper passed. Independent diff review found no material SOLID or
module-boundary concerns. No running local Compose stack was available, so the existing Bruno regression remains
unverified. No new HTTP coverage is applicable because this change concerns configuration before initialization.

## Context and Orientation

Before this change, `src/lead-email-finder-api/src/lead-email-finder-api.module.ts` ran `normalizeEnvironmentConfiguration` before
validating `EnvironmentVariablesDto`. This normalization function is defined in
`src/lead-email-finder-api/src/environment-variables.dto.ts` and previously delegated to
`normalizePaymentCheckoutUrlConfiguration`. That helper copied `PAYMENTS_CHECKOUT_RETURN_URL` into
`PAYMENTS_CHECKOUT_URL` when only the former was present, accepted matching values, and rejected conflicting values.
The host still normalizes before DTO validation. Normalization now rejects the removed setting directly and retains
the existing rejection of duplicate inline and file sources for optional secrets.

`EnvironmentVariablesDto` previously declared the alias as an optional URL. The exported `PaymentConfiguration`
interface in `src/libs/modules/payments/src/domain/payment-configuration.ts` repeated that field; both declarations
are now removed. Payment composition in
`src/libs/modules/payments/src/payments.module.ts` already reads only `PAYMENTS_CHECKOUT_URL` when constructing
`CreditPurchaseService`. The base Docker configuration, Paddle fixture, and OpenAPI preview environment already use
the canonical name. The completed `payments/07` plan introduced the alias and its replacement.

`src/lead-email-finder-api/src/environment-variables.dto.spec.ts` now contains the alias rejection matrix.
`src/libs/modules/payments/README.md` documents its removal. The existing `bruno/credit-purchases` collection exercises
purchase creation and signed webhook processing with the local stub provider.

## Scope and Non-Goals

This pull request removes the alias from supported startup configuration and payment types, rejects its presence,
and documents its replacement. It changes no endpoint, request, response, authorization, billing, provider selection,
payment adjustment, persistence, or checkout-return behavior. It adds no package, migration, tunnel, Paddle resource,
or secret. Other retirements belong to separate plans.

## Plan of Work

Before implementation, read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and
`src/libs/modules/payments/README.md`. Assign this plan's synced issue, found by its `legacy-retirement/02` marker,
and move its Project 9 status to `In Progress` using the root `AGENTS.md` workflow. Report an unavailable
project-scope status write separately while continuing authorized repository work.

At the start of `normalizeEnvironmentConfiguration` in `environment-variables.dto.ts`, reject a defined
`PAYMENTS_CHECKOUT_RETURN_URL` with the exact message in the Decision Log. Remove
`normalizePaymentCheckoutUrlConfiguration` and its call. Run the existing optional secret-file validation directly
against the supplied configuration and return that configuration. Remove the alias property and decorators from
`EnvironmentVariablesDto`; keep `PAYMENTS_CHECKOUT_URL` validation unchanged. Remove the alias field from the
payments module's `PaymentConfiguration` interface.

Replace the old alias acceptance matrix in `environment-variables.dto.spec.ts` with focused checks through
`normalizeEnvironmentConfiguration`. Cover alias-only input, an empty alias, and a non-string alias such as `null`.
Also cover aliases that match or conflict with the canonical value. All produce the same exact message without
either supplied value.
Confirm a valid canonical-only URL is preserved, an explicitly undefined alias is treated as absent, and a missing
or invalid canonical URL fails the existing DTO validation. Retain the optional secret-file conflict tests.
The payment-provider port and its fields do not need to change.

Update the Configuration section of `src/libs/modules/payments/README.md` to state that only the canonical setting
is supported and developers must rename and remove the old setting before restarting. Historical completed plans
retain their original evidence. Search current source and configuration for remaining alias support; references in
the rejection, rejection tests, and removal explanation are expected.

## Interfaces and Dependencies

The public `PaymentConfiguration` interface loses `PAYMENTS_CHECKOUT_RETURN_URL`; `PAYMENTS_CHECKOUT_URL` remains
required. The host rejects a defined removed setting before DTO validation. No HTTP interface changes. The payments
application receives its canonical checkout URL through the existing factory. The prerequisite `payments/07` is
complete in this checkout. This plan maps to one pull request and unlocks configuration examples with one supported
checkout setting.

## Acceptance Criteria

- A valid canonical-only configuration survives normalization unchanged and passes the existing URL validation.
- Every defined alias fails with exactly `PAYMENTS_CHECKOUT_RETURN_URL: removed; use PAYMENTS_CHECKOUT_URL`,
  regardless of its value or canonical setting, without including either configured value.
- An absent or explicitly undefined alias does not cause this rejection. A missing or invalid canonical URL still
  fails DTO validation.
- No normalization path copies or chooses the old value. Neither the DTO nor `PaymentConfiguration` declares it.
- Duplicate inline and optional secret-file sources still fail with their existing messages and no secret disclosure.
- Existing payment composition and purchase-service tests pass. HTTP routes, authorization, credit accounting,
  provider behavior, concurrency, and idempotency retain their existing contracts.
- The architecture gate, type checking, build, and documentation lint pass. Runtime results are recorded separately.

## Validation

Run these commands from the repository root:

```bash
TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test src/lead-email-finder-api/src/environment-variables.dto.spec.ts src/libs/modules/payments/src/payments.module.spec.ts src/libs/modules/payments/src/application/credit-purchase.service.spec.ts --runInBand --silent --verbose=false
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm build
corepack pnpm docs:lint -- .agents/plans/legacy-retirement/02-remove-checkout-url-alias.md src/libs/modules/payments/README.md
git diff --check
rg -n 'PAYMENTS_CHECKOUT_RETURN_URL|normalizePaymentCheckoutUrlConfiguration' src scripts docker bruno README.md
```

Inspect search matches: only the explicit rejection, its tests, and the documented removal explanation may refer to
the old setting. The deleted helper must have no references. Review the diff for SOLID and module-boundary
violations; this change needs no additional application service or infrastructure abstraction.

When an owned disposable local stack and documented credentials are available, follow
`bruno/credit-purchases/README.md` and run `bru run --env local` with working directory `bruno/credit-purchases`.
Verify existing purchase creation, signed webhook crediting, replay, and rejection cases. This is regression coverage
of the unchanged HTTP contract; add no new collection requests. Record unavailable prerequisites if the collection
cannot run. A live Paddle purchase is not a prerequisite for removing the alias.

## Idempotence and Recovery

The source cleanup changes no stored data. Repeating static validation creates no provider resources. A local
configuration using the alias recovers by moving its intended URL to `PAYMENTS_CHECKOUT_URL`, deleting the old
setting entirely, and restarting the same development service. Matching values still require deletion of the alias.
No database reset, reseed, or migration is required. When reverting, restore only this pull request's changes and
preserve unrelated user work.

## Artifacts and Notes

Record exact test results, the final reference search, and whether the existing Bruno collection ran. Keep values,
tokens, and checkout URLs out of diagnostic evidence. Report Bruno as not applicable to new coverage because the
changed contract concerns configuration before initialization. Separately report the collection's regression result.
Attach the synced issue to the pull request with a closing keyword and follow root assignment and title rules.

Implementation evidence recorded on 2026-09-11:

- Issue #557 was assigned to the requesting user and its Project 9 status set to `In Progress`.
- The focused Jest command above passed 3 suites and 105 tests. The initial rejection matrix failed all 15 cases
  before implementation, demonstrating that the tests detect the removed compatibility behavior.
- `corepack pnpm architecture:check` passed with 9 modules and 0 violations; `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed: the type checker found 0 issues and SWC compiled 670 files.
- The Harper command above passed both changed Markdown files. Its initial findings were corrected, including
  splitting a long existing sentence about adjustment debits without changing its meaning.
- Focused ESLint and Prettier checks passed for the three changed TypeScript files. `git diff --check` passed.
- The reference search above found only the explicit rejection, its tests, and the removal explanation. No source,
  script, Docker, or Bruno references to the deleted normalization helper remain.
- Bruno: not applicable to new coverage because initialization configuration is below the HTTP boundary. Existing
  checkout regression was not run: `docker compose ls --format json` returned no running local projects.

## Plan readiness

Ready to implement
