# Access Browser Sessions and Existing Identities Through Ports

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.
Proposed commit and PR title: `refactor(bff-session): inject browser session capabilities through ports`.

## Purpose / Big Picture

The browser controller and session orchestrators will accept explicit capabilities for login, current-account
presentation, token refresh, and existing-identity access.
Tests can substitute each capability without concrete classes or their private fields. Browser authorization,
session handling, recovery redirects, and encrypted storage behavior remain unchanged.

## Progress

- [ ] (2026-09-17) Add browser capability contracts and identity's existing-identity contract.
- [ ] (2026-09-17) Bind existing instances and migrate browser/controller consumers.
- [ ] (2026-09-17) Verify contracts, login invariants, composition, architecture, types, and documentation.

## Plan dependencies

- `dependency-inversion/03`

## Surprises & Discoveries

`BffSessionFlowService` uses only `ExternalIdentityResolver.findExisting()` and `synchronizeEmail()`, although the
concrete class also exposes `resolveOrCreate()`. Membership validation deliberately runs before email writes.
`BrowserCapabilityPolicy` is presentation-only and must not become authorization authority.

## Decision Log

- Decision: Expose existing-identity lookup and deferred email synchronization as an identity-owned contract.
  Rationale: BFF should neither depend on resolver implementation details nor gain creation authority from this
  seam. Date/author: 2026-09-17, Codex.
- Decision: Keep four related browser flow operations together, and keep current-account reads separate.
  Rationale: The controller needs the complete session lifecycle but account presentation has a
  different dependency set. Date/author: 2026-09-17, Codex.
- Decision: Leave `BrowserCapabilityPolicy` and `SessionEncryptor` concrete.
  Rationale: The former is a stateless local helper; the latter is an infrastructure adapter detail behind the
  existing session-store port. Date/author: 2026-09-17, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Under `src/libs/modules/bff-session/src/`, `api/bff-session.controller.ts` injects `BffSessionFlowService` and
`CurrentAccountService`. The flow class calls OAuth, pending-state, session-store, ID-token, membership, and identity
capabilities. Its membership dependency is converted by `dependency-inversion/03`. The credential authenticator
still consumes `SessionTokenRefresher`, and current-account presentation consumes `BrowserCapabilityPolicy`.
`infrastructure/redis/redis-session-store.ts` uses `SessionEncryptor` for encrypted session records.

Identity's `src/libs/modules/identity/src/application/external-identity-resolver.service.ts` is framework-free and
already consumes `ExternalIdentityStore`. Its existing-identity methods are narrower than that persistence contract:
email synchronization skips writes when the accepted identity already has the same email. The completed
`module-architecture/02`, `/03`, and `/08` plans established these layers and persistence boundaries; this follow-up
does not repeat their implementation or reopen entity exports used by disposable integration fixtures.

## Scope and Non-Goals

Change only BFF and the narrow existing-identity contract/binding, related tests, and module documentation.
Preserve endpoint and cookie contracts, recovery redirects, PKCE, session lineage, Redis operations, encryption,
refresh deadlines, account serialization, and identity persistence. Do not add identity creation to login,
alternative authentication, new encryption algorithms, provider retries, schema changes, or browser UI work.
The Origin/CSRF guard composition remains transport code and does not need application ports.

## Plan of Work

Create `bff-session/src/application/ports/browser-session-flow.ts`, `current-account-query.ts`,
and `session-token-refresh.ts`. Move the flow input/result types and its declared
errors into the flow contract file. Move `CurrentAccountContext`, `HumanSessionRequiredError`, and
`CurrentAccountUnavailableError` into the account contract, and move `SessionRefreshFailedError` into the refresh
contract. Retain one exported class identity for each error so existing `instanceof` mappings remain reliable.
Update tests and internal imports; do not expose these private contracts from the BFF barrel.

Make existing classes implement their contracts. Change constructor parameter types and use `@Inject` in the
controller. Bind each token with `useExisting` in `bff-session.module.ts`; application factory
parameters reference interfaces. Keep membership and authenticator tokens delivered by the prerequisite.

In identity, add `application/ports/existing-external-identity-access.ts`, implement it on
`ExternalIdentityResolver`, add a `useExisting` alias in `identity.module.ts`, and expose the contract, record type,
and token through its public barrel. Retain the existing concrete resolver export for current compatibility; BFF
production imports and factories must use the new token/type. Do not widen this contract to `resolveOrCreate`.
Preserve the explicit creation method and its existing tests for legitimate creation workflows.

Exercise the actual module provider graph, substituting the interfaces where useful. Verify controller tests use
object literals and unchanged typed errors, login tests still prove lookup/membership/email order, and session
contract tests retain atomic replacement behavior. Update both module documents to
describe the new supported identity port and the private BFF capabilities.

## Interfaces and Dependencies

Contracts declare their own signatures, not types extracted from a concrete service. Reuse existing record shapes:

```ts
interface BrowserSessionFlow {
    login(destination?: unknown, existingSessionId?: string): Promise<LoginStart>
    handleCallback(input: CallbackInput): Promise<CallbackResult>
    discardSession(sessionId: string): Promise<void>
    logout(sessionId: string | undefined): Promise<void>
}
interface CurrentAccountQuery {
    get(principal: AuthPrincipal): Promise<CurrentAccountContext>
}
interface SessionTokenRefresh {
    refreshIfNeeded(record: SessionRecord): Promise<SessionRecord>
}
interface ExistingExternalIdentityAccess {
    findExisting(issuer: string, subject: string): Promise<ExternalIdentityRecord | undefined>
    synchronizeEmail(existing: ExternalIdentityRecord, email: string | null): Promise<ExternalIdentityRecord>
}
```

Tokens are `BROWSER_SESSION_FLOW`, `CURRENT_ACCOUNT_QUERY`, `SESSION_TOKEN_REFRESH`, and
`EXISTING_EXTERNAL_IDENTITY_ACCESS`. Identity owns and exports only its identity token;
BFF owns the rest. Keep the exact `LoginStart`, `CallbackInput`, `CallbackResult`, `CurrentAccountContext`, and
`BrowserCapability` fields already implemented. No new library, configuration variable, endpoint, or schema is needed.

## Acceptance Criteria

- The controller, refresher consumer, and BFF identity consumer accept
  independently typed substitutes with no implementation imports in their dependency declarations.
- Tokens resolve to the existing singleton instances. The identity capability exposes no create operation, and a
  missing identity or invalid membership causes no email update or creation during callback handling.
- Callback consumes state once and preserves state/lineage validation, exact safe recovery redirects, redacted
  unexpected failures, transient cookie clearing, and response-construction cleanup of a newly created session.
- Concurrent replacement still has one winner; stale saves do not resurrect old sessions. Refresh failure and
  disabled membership retain authentication rejection behavior. Session revocation and deletion retain their order.
- Current-account output, role capabilities, grantable permissions, ciphertext handling, and rejected ciphertext
  behavior are unchanged. Architecture, type, focused regression, and documentation checks pass.

## Validation

Run these focused commands from the repository root during implementation:

```sh
corepack pnpm test -- src/libs/modules/bff-session/src/application src/libs/modules/bff-session/src/api/bff-session.controller.spec.ts src/libs/modules/bff-session/src/api/bff-session.swagger.spec.ts src/libs/modules/bff-session/src/bff-session.module.spec.ts src/libs/modules/bff-session/src/bff-session-guard-wiring.integration.spec.ts src/libs/modules/bff-session/src/bff-session-replacement.integration.spec.ts --runInBand
corepack pnpm test -- src/libs/modules/bff-session/src/session-store.contract.spec.ts src/libs/modules/identity/src/application/external-identity-resolver.service.spec.ts src/libs/modules/identity/src/identity.module.spec.ts --runInBand
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:check
```

Redis contract execution requires `TEST_BFF_REDIS_URL`; record whether those cases actually ran. Live-Keycloak
coverage remains distinct from in-process HTTP tests and is not established by token resolution.
Update `bruno/bff-sessions/02-login-redirects-to-keycloak-with-pkce.yml` to assert that the S256 challenge is a
43-character base64url value, retaining the existing successful redirect/cookie assertions. Strengthen
`04-callback-missing-state-redirects.yml` in the same collection to assert that rejection issues no nonempty session
or CSRF cookie. Add assertions inside existing test blocks so wrapper counts remain unchanged. Run
`corepack pnpm bruno:bff-sessions` from the root when the owned local stack is available; otherwise perform static
collection validation and record runtime execution as unverified. No browser API schema change is planned.

## Idempotence and Recovery

No persisted format or schema changes. Add aliases to existing instances, never a second session flow or identity
resolver with different configuration. Partial refactoring is repaired by updating imports and tokens together.
Reverting the PR restores constructor wiring without clearing sessions, changing encryption keys, or resetting data.
Run optional integration tests only against their existing disposable fixtures and cleanup rules.

## Artifacts and Notes

At implementation start, find the synced issue by `dependency-inversion/04`, assign `@me`, and update project-9 to
In Progress using the runtime option ID as required by root `AGENTS.md`. Use the proposed conventional commit subject
as the one PR title, assign the PR to `@me`, and include `Closes #<issue-number>`. Record exact validation results and
runtime omissions. The security regression suites are required because these ports sit on authentication paths,
even though the refactor intentionally preserves behavior. `BrowserCapabilityPolicy` stays a pure presentation
helper, while `SessionEncryptor` remains an adapter detail behind `SessionStore`; neither needs another port for
this task. Nest/Redis configuration and guard composition likewise remain at their established boundaries.

## Plan readiness

Ready to implement
