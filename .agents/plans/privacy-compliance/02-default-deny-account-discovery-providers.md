# Default-Deny External Account-Discovery Providers

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Prevent an email address from reaching a third-party account-discovery endpoint unless one exact provider activation
has both technical configuration and current repository-owned approval evidence. After this change, LinkedIn session
material and its adapter are absent, and the committed approval manifest is empty by default. A proxy or provider
environment variable cannot authorize disclosure. Before any disclosure attempt, the application requires an active, effective, unexpired
approval whose provider, fixed purpose, and region match the request.

A developer can observe the boundary through startup and per-request rejection tests, the CI manifest validator, a
targeted redacted source/history scanner, zero-or-one provider selection, and the SMTP development workflow making no
account-discovery request. This safety pull request can merge with an empty manifest before
`privacy-compliance/10`; test fixtures exercise approved branches without placing a real approval in source control.

## Progress

- [ ] (2026-08-30) Remove the LinkedIn adapter, registration, exports, tests, and committed session material.
- [ ] (2026-08-30) Add the repository-owned redacted LinkedIn-session scanner and route validity, revocation, and
      reachable-history decisions to Security.
- [ ] (2026-08-30) Add the empty account-discovery approval manifest, strict schema, CI command, and runtime loader.
- [ ] (2026-08-30) Require one matching approval ID, provider, purpose, region, and validity interval at startup and
      immediately before every provider disclosure.
- [ ] (2026-08-30) Select zero or one provider, choose one Mimecast region, and make mutable provider bodies
      concurrency-safe.
- [ ] (2026-08-30) Add focused, packaging, HTTP-regression, architecture, full-suite, and documentation validation.

## Plan dependencies

- `privacy-compliance/01`

## Surprises & Discoveries

- `src/libs/catch-all/src/linkedin-login/linkedin-login.service.ts` contains hard-coded LinkedIn session-cookie,
  CSRF, and request-header material. Deleting the current file does not determine validity, revoke the remote session,
  or remove reachable Git history.

## Decision Log

- Decision: Delete the LinkedIn adapter folder, registration, public export, and tests. Retain the historical
  `linkedin` result literal only at a read-side compatibility boundary if a focused persisted-row test proves it is
  needed; it can never remain an active provider value.
  Rationale: Dormancy is not a control for committed session material, while deletion must not make a legitimately
  persisted historical result unreadable.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Add `scripts/security/scan-linkedin-session-material.ts` and the package command
  `security:scan-linkedin-session-material`. The CLI accepts exactly
  `--scope=working-tree` or `--scope=reachable-history`, reports only scope, rule ID, path, object ID where applicable,
  and count, and never emits a matching line, value, excerpt, or reconstructed credential.
  Rationale: The repository needs a repeatable targeted check without copying the exposed material into another tool,
  plan, log, or fixture.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Security, outside this pull request, decides whether the material was valid, performs any remote
  revocation, and decides whether coordinated history remediation is required. This plan performs no history rewrite,
  force-push, cache purge, or remote-artifact deletion.
  Rationale: Those actions affect external systems and every clone and require incident ownership and coordination.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Create `config/privacy/account-discovery-approvals.yaml` with
  `schemaVersion: 1`, `revision: initial-empty`, and `approvals: []`. The runtime path is fixed and copied into the
  production image; an environment variable cannot point the application at an alternate manifest.
  Rationale: The safety plan must merge before any vendor is approved, and operator-controlled provider configuration
  must not be able to manufacture approval.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Keep the technical provider values `microsoft_get_credential_type`, `microsoft_login`, `mimecast`, and
  `office_apps`. Require `CATCH_ALL_PROVIDER_APPROVAL_ID` and `CATCH_ALL_PROVIDER_REGION` whenever
  `CATCH_ALL_PROVIDER` is set. The processing purpose is the non-configurable constant
  `email_verification.account_discovery`.
  Rationale: A scalar provider and immutable purpose prevent fan-out and purpose substitution; the manifest supplies
  the legal/vendor evidence rather than the environment.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Validate approval at startup and again immediately before each outbound provider request with an injected
  clock. An approval must be `active`, effective, not expired, and match ID, provider, fixed purpose, and region.
  Rationale: A process that remains alive past an approval's expiry must stop disclosing without waiting for restart.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: An absent provider selects no account-discovery adapter even when a proxy is configured. A selected
  provider requires the proxy, approval ID, region, and matching approval. Mimecast additionally accepts only `us` or
  `uk` and sends one regional request.
  Rationale: Proxy transport is not approval, and a single explicit destination minimizes disclosure.
  Date/Author: 2026-08-30, privacy road map review.
- Decision: Build each provider request body from immutable templates inside `verify()`.
  Rationale: Overlapping requests must not overwrite or exchange target addresses through shared mutable objects.
  Date/Author: 2026-08-30, privacy road map review.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/email-verification/src/email-verifier/email-verifier.module.ts` currently activates multiple
account-discovery adapters from proxy presence, and `email-verifier.service.ts` can call all injected verifiers.
`src/libs/catch-all/src/catch-all.module.ts` registers Microsoft, Mimecast, Office Apps, and LinkedIn implementations.
The LinkedIn implementation contains the exposed material. Microsoft adapters mutate static bodies, and Mimecast tries
two regional endpoints.

Top-level configuration is validated by
`src/lead-email-finder-api/src/environment-variables.dto.ts` and composed in
`src/lead-email-finder-api/src/lead-email-finder-api.module.ts`. The repository currently has no approval manifest or
runtime evidence gate. Plan 10 later obtains the actual contract, vendor, transfer, security, customer-notice or
authorization, and expiry evidence and is the only plan allowed to populate the manifest.

An account-discovery provider is an external login or identity endpoint queried with an address to infer whether an
account exists. SMTP mailbox probing is separate and is never authorized by an account-discovery approval.

## Scope and Non-Goals

This pull request deletes LinkedIn executable/request material and adds the redacted targeted scanner. It introduces an
empty, machine-readable approval manifest and validator, packages the fixed manifest path, validates provider
configuration, and gates disclosure when the application starts and at call time. It selects zero or one adapter,
limits Mimecast to one region, fixes mutable request bodies, removes provider-enabling development defaults, and adds
tests and documentation.

It does not approve or activate a real provider, populate the manifest, select a vendor or transfer mechanism, decide
whether the exposed LinkedIn material was valid, or perform revocation or history remediation. It does not add
tenant-specific provider policy, redesign provider response semantics, implement STARTTLS, or claim legal compliance.
Plan 10 owns approval records and governance. Plan 03 owns PII-safe provider logging.

## Plan of Work

Notify Security through the approved private channel before handling the LinkedIn file. Delete
`src/libs/catch-all/src/linkedin-login/` and remove its module/barrel references. Trace the historical `linkedin` source
through persistence and response decoding. Keep it only if a compatibility test proves an old synchronized-development
row remains readable; remove it from every active provider union and selector in all cases.

Add `scripts/security/scan-linkedin-session-material.ts` and
`scripts/security/scan-linkedin-session-material.spec.ts`. The scanner examines tracked and non-ignored untracked
working-tree files for `--scope=working-tree` and uses `git rev-list --objects --all` plus batch object reads for
`--scope=reachable-history`. Match value-bearing LinkedIn session patterns, including a long `li_at` cookie assignment,
LinkedIn `JSESSIONID` assignment, and a LinkedIn CSRF-header value, while constructing matcher literals from fragments
so the scanner and tests do not flag or preserve a credential. Skip binary output but do not skip text solely by path.
Exit nonzero when the scanner finds a match. Emit stable JSON summary fields only; no matched bytes enter standard
output, standard error, Jest messages, or snapshots. Add:

    corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree
    corepack pnpm security:scan-linkedin-session-material -- --scope=reachable-history

CI runs the working-tree command. The reachable-history result is reviewed privately by Security and can remain a
recorded external remediation decision; it is not made falsely green by excluding old objects.

Add `config/privacy/account-discovery-approvals.yaml`, Zod schema/loader under
`scripts/privacy/account-discovery-approvals.ts`, focused tests, and
`privacy:account-discovery-approvals-check`. Add the checker and working-tree scanner to
`.github/workflows/validate.yml`. Update the production Docker image to copy the fixed manifest to
`/app/config/privacy/account-discovery-approvals.yaml`. Runtime and CLI use the same parser. Tests inject in-memory
fixtures; there is no runtime manifest-path override.

Each approval row contains immutable ID, status, provider, purpose, region, effective/expiry instants, processing-
contract version, subprocessor or independent-recipient register ID, vendor/security/transfer evidence IDs, customer
notice-or-authorization evidence ID, approval owner, and reviewed-at time. Reject duplicate IDs, unknown keys/providers,
non-UTC instants, invalid intervals, active rows with missing evidence, expired active rows in CI, secret-looking
values, and a revision that is not changed when approval content changes. The initial empty manifest passes.

Extend `EnvironmentVariablesDto` with `CATCH_ALL_PROVIDER`, `CATCH_ALL_PROVIDER_APPROVAL_ID`, and
`CATCH_ALL_PROVIDER_REGION`. Keep `CATCH_ALL_HTTP_PROXY_URL`. The cross-field validator rejects partial selection,
unknown providers, LinkedIn, selected provider without proxy, missing approval fields, and a Mimecast region other than
`us` or `uk`. A proxy alone is valid but inactive.

Replace proxy-presence selection with a pure zero-or-one selector and an `ApprovedAccountDiscoveryVerifier` wrapper.
At construction it receives the parsed approval, immutable fixed purpose, region, and `Clock`. Before every call it
rechecks status/effective/expiry and fails with a stable internal unavailable reason without contacting the vendor.
Use an injected manifest fixture in provider branch tests; never add a real approval to committed configuration.

Make Mimecast choose one URL from the validated region. Construct fresh nested bodies per call in both Microsoft
adapters and add overlapping deferred-request tests. Preserve Office Apps immutability and existing result
interpretation. Update the module README, Docker development defaults, and SMTP Bruno assertion so the default result
contains no external account-discovery source.

## Interfaces and Dependencies

Runtime configuration is exactly:

    CATCH_ALL_PROVIDER?: 'microsoft_get_credential_type' | 'microsoft_login' | 'mimecast' | 'office_apps'
    CATCH_ALL_PROVIDER_APPROVAL_ID?: string
    CATCH_ALL_PROVIDER_REGION?: string
    CATCH_ALL_HTTP_PROXY_URL?: string

The fixed purpose is `email_verification.account_discovery`. The machine contract is equivalent to:

    interface AccountDiscoveryApproval {
        id: string
        status: 'active' | 'suspended' | 'revoked' | 'expired'
        provider: AccountDiscoveryProvider
        purpose: 'email_verification.account_discovery'
        region: string
        effectiveAt: string
        expiresAt: string
        processingContractVersion: string
        recipientRegisterId: string
        vendorReviewEvidenceId: string
        securityReviewEvidenceId: string
        transferReviewEvidenceId: string
        customerAuthorizationEvidenceId: string
        approvalOwner: string
        reviewedAt: string
    }

`selectAccountDiscoveryVerifier` returns none or one adapter. The approval wrapper implements
`ICatchAllVerifier` without exposing manifest parsing to the use case. Plan 01 supplies the processing boundary.
Plan 10 later versions and populates the manifest; it is deliberately not a dependency of this default-deny plan.

## Acceptance Criteria

- LinkedIn implementation, registration, exports, tests, endpoint/request material, and active provider value are
  absent; a retained historical source literal is read-side only and justified by a compatibility test.
- The working-tree scanner reports no value-bearing LinkedIn session material and never prints matched values.
- The reachable-history scanner covers all reachable objects, emits only redacted identifiers/counts, and its result,
  validity assessment, revocation decision, and history-remediation decision are owned by Security outside the PR.
- The committed approval manifest is exactly an empty valid manifest and passes the shared CLI/runtime schema.
- CI rejects malformed, stale, secret-bearing, or unjustifiably changed approval data.
- No provider selection succeeds from environment variables alone. A selected provider prevents the application from
  starting unless its approval ID resolves to an active, effective, unexpired exact provider/purpose/region match.
- An approval that expires after startup prevents the next provider call without sending the address.
- No provider is selected by proxy presence. An approved test fixture selects one provider and makes one call.
- Mimecast sends to one approved regional endpoint; overlapping provider calls do not share or swap bodies.
- The production image contains the fixed manifest at the runtime path; no environment can redirect that path.
- Default development and SMTP workflows invoke no account-discovery adapter.
- Focused tests, manifest/scanner checks, packaging test, architecture, typecheck, lint, full suite, build, Bruno,
  documentation, formatting, and whitespace validation pass.

## Validation

Run the manifest, scanner, selection, and provider suites:

    corepack pnpm privacy:account-discovery-approvals-check
    corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree
    corepack pnpm security:scan-linkedin-session-material -- --scope=reachable-history
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- scripts/privacy/account-discovery-approvals.spec.ts scripts/security/scan-linkedin-session-material.spec.ts src/lead-email-finder-api/src/environment-variables.dto.spec.ts src/libs/modules/email-verification/src/email-verifier/email-verifier.module.spec.ts src/libs/catch-all/src/microsoft-get-credential-type src/libs/catch-all/src/microsoft-login src/libs/catch-all/src/mimecast-login src/libs/catch-all/src/office-apps --runInBand

The scanner test constructs synthetic values from fragments at runtime and asserts only redacted rule/path/object
metadata is emitted. Test approval timing before, at, and after both validity boundaries with a fake clock. Build the
production image and assert the fixed empty manifest is present and parses inside it.

Then run:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/02-default-deny-account-discovery-providers.md
    corepack pnpm exec prettier --check config/privacy/account-discovery-approvals.yaml src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/02-default-deny-account-discovery-providers.md
    git diff --check

Run `bruno/smtp-dev` in the required container network and assert the synthetic local result has no external
account-discovery source. No live vendor request is permitted.

## Idempotence and Recovery

Manifest/scanner checks and selectors are read-only. Reapplying the empty manifest is safe. Provider calls remain
disabled after any missing, malformed, inactive, not-yet-effective, expired, or mismatched approval. A Security finding
does not authorize copying its value; preserve only the private incident reference and leave external remediation to
the owner.

If packaging or startup validation fails, keep provider selection absent. Revert provider wiring and manifest changes
together; never recover by bypassing validation, setting a hidden manifest path, weakening expiry checks, rewriting
history ad hoc, or restoring LinkedIn code.

## Artifacts and Notes

Record manifest revision, sanitized approval fixture IDs, scanner version/scope/count/rule IDs, private Security case
reference, test totals, image-path evidence, and Bruno totals. Never record matched values, cookie/header excerpts,
addresses, credentials, provider payloads, customer identities, or private legal/vendor evidence.

## Plan readiness

Ready to implement
