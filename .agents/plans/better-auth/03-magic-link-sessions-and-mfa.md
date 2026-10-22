# Replace Browser Login with Magic Links and Enforced Privileged MFA

This is a living document maintained according to `.agents/PLANS.md`. It describes one implementation pull request.

## Purpose / Big Picture

Planned conventional commit and pull-request subject: `feat(auth): replace browser login with magic links and MFA`.

An invited or seeded person signs in through an emailed link, confirms the sign-in explicitly, completes TOTP when required, and reaches the existing workspace. Better Auth owns the only browser session; local membership and permission records remain the business authority. The developer can exercise this complete flow through the owned Mailpit fixture, without a Keycloak password or a privileged test bypass.

## Progress

- [ ] (2026-10-19) Add native-session adapters, narrow browser authentication routes, and safe session-state contracts.
- [ ] (2026-10-19) Enforce magic-link token handling, membership admission, privileged MFA, deadlines, and truthful logout.
- [ ] (2026-10-19) Replace password-based invitation provisioning and browser screens with the approved passwordless flow.
- [ ] (2026-10-19) Update generated contracts, Bruno, runtime browser fixtures, CI selection, and module documentation.
- [ ] (2026-10-19) Run focused backend, browser, privacy, live-provider, architecture, type, and prose checks; record outcomes.

## Plan dependencies

- `better-auth/01`
- `better-auth/02`

## Surprises & Discoveries

None yet.

## Decision Log

- (2026-10-19, user) Browser authentication uses email magic links. Keep invitation-based membership and require TOTP for `admin`, `owner`, and `platform_admin`; do not introduce a password fallback or weaken privileged fixtures.
- (2026-10-19, user and planning agent) Better Auth owns native sessions; preserve the existing current-account projection, local authorization, business CSRF protection, and browser cache/session boundaries. API and MCP use the machine API keys supplied by `better-auth/02`.
- (2026-10-19, planning agent) Expose only narrow Nest BFF routes calling the native server API through infrastructure adapters. Do not mount a native catch-all handler or return native user/session/token objects.
- (2026-10-19, planning agent) `twoFactor({ allowPasswordless: true })` permits enrollment but does not gate magic-link logins. Enforce a server-owned per-session MFA completion marker and role policy at the business-principal boundary.
- (2026-10-19, user) Public self-registration, workspace naming, and the one-time 100-credit grant are delivered by `better-auth/04`. This plan uses `magicLink.disableSignUp: true` and prepares a verified identity with no membership for that later workflow.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The verified base is `352553caa799acee39311007821d50a7a98c4cd7`. Prerequisites add `BetterAuthRuntimeModule` in `src/libs/better-auth/src/` and machine API-key authentication. Import business modules only through their bare barrels and read their module documentation before edits.

`src/libs/modules/bff-session` currently implements Keycloak Authorization Code with PKCE, encrypted Redis session records, provider refresh, account projection, and Origin/CSRF guards. `src/lead-email-finder-api/src/authentication/authentication-composition.module.ts` composes human and machine authenticators and installs authentication before mutation checks. `auth` has no dependency on `bff-session`; preserve that acyclic direction.

`identity` identifies humans by issuer and subject and owns all memberships. Use its exported `AUTH_IDENTITY_ISSUER = 'urn:lead-email-finder:auth'` with native user ID as the human subject. `bff-session` rereads active membership on every business request. Existing current-account output contains only email, membership, organization, presentation capabilities, and grantable machine permissions.

`organization-onboarding` presently creates Keycloak users with a supplied password and assigns provider realm roles on acceptance/promotion. `apps/web/src/features/auth` owns cache clearing, abort/generation fencing, cross-tab boundaries, restored-page handling, and uncertain sign-out. `apps/web/src/features/invitations/invitation-bootstrap.ts` strips invitation authority before router initialization; reuse its security approach without placing another secret in shared query state.

Read root `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, `apps/web/AGENTS.md`, the ideal customer profile, and local frontend design, premium, React, and testing skills. Reuse the approved English visual system, `Form.module.css`, `Stack`, `SupportingText`, `ProductPanel`, and existing live-region/error owners.

## Scope and Non-Goals

Replace the human authentication/session path, password-based invitation identity provisioning, related browser entry/MFA/recovery screens, and their live fixtures. Preserve local organization ownership, role hierarchy, final-owner locking, billing, verification, API-key scope, and account projection.

Do not add public registration or welcome credits; migrate old users/passwords/TOTP secrets; introduce social login, passkeys, email-OTP as a second factor, trusted-device bypass, a second session store, organization-provider roles, or a native raw API handler. Development reset/reseed is the cutover. General Keycloak container/script retirement belongs to `better-auth/05`, but all active validation touched here must work immediately with the new browser flow.

## Plan of Work

First replace the provider-facing application ports owned by BFF with framework-free native identity/session facts. Add `VerifiedHumanSessionReader` and `VERIFIED_HUMAN_SESSION_READER` to the BFF public barrel for the later onboarding consumer. Its `read(sessionCredential: string)` method returns undefined for an unusable native session; otherwise it returns `{ nativeUserId, externalIdentityId, email, emailVerified: true, sessionId, createdAt, expiresAt, absoluteExpiresAt, mfaVerifiedAt }`, with epoch-millisecond times and zero for unproven MFA. No result contains a raw session token, HTTP headers, SDK objects, or native database records. The API boundary parses the credential and passes it to the reader; the reader validates the database-backed native session and idempotently resolves/creates the local external identity even if it has no active membership.

Keep the existing `CredentialAuthenticator` result as `AuthPrincipal`. Native renewal-cookie capture and forwarding belong in a transport-only request scope around the host's authentication guard, implemented through the technical runtime and BFF infrastructure adapter. The adapter calls native `getSession` with cookie caching disabled and emits returned cookies into that request scope; the API layer in `AuthGuard` flushes them on success and expected rejection. Do not add headers, Express responses, or SDK types to authentication/application ports. API-key authentication retains precedence and never falls back to the cookie after a supplied key fails.

Build the business principal only for exactly one active membership after applying the current local role's MFA requirement. Reread membership on each request; disabled membership rejects immediately, role promotion begins requiring MFA immediately, and zero/multiple active memberships never acquire a business principal. A verified native identity with zero memberships is a limited onboarding identity only. Its future registration capability is exposed through `VerifiedHumanSessionReader`, not a fake organization or a weakened business guard.

Replace the current login and authorization-return routes with the narrow interface table below. Use an infrastructure adapter around native `auth.api` calls, capturing status and all cookies with `asResponse: true`. Map native responses into explicit application outcomes and safe BFF DTOs. Forward each `Set-Cookie` independently on success and cleanup/error paths; never join cookie headers, return native token JSON, or log provider messages. Do not mount `auth.handler`, enable a native OpenAPI route, or reorder Nest body parsing. Preserve Paddle raw-body signature checks.

For magic-link requests, normalize email, validate the relative `/app` destination through the existing destination policy, and use a generic accepted response regardless of account existence. Native tokens expire after 300 seconds, are stored hashed, and are single-use. Add a BFF-owned `MagicLinkAttemptStore` backed by a synchronized `better_auth_magic_link_attempts` table: token hash, normalized server destination, creation time, expiry time, and an atomic conditional consume. No raw token is stored. In the native mail-delivery hook, persist the destination record before sending and replace the provider verification URL with `${APP_BASE_URL}/auth/verify#token=<token>`; do not expose the native GET verification endpoint. The token remains portable across devices; no initiating browser cookie is required.

Keep that table's technical entity and persistence helper in the shared runtime library. The BFF infrastructure adapter implements `MagicLinkAttemptStore` by delegating to that helper. The runtime's mail-delivery hook writes the same helper before email delivery, using only destination metadata validated and supplied by the server-side BFF adapter. The runtime never imports the BFF module or its application ports, and HTTP callers cannot supply arbitrary native metadata. This keeps one pending-attempt store without a reverse module dependency or mutable global callback.

`POST /v1/auth/magic-link/verify` atomically consumes the matching unexpired BFF attempt before invoking native verification. It accepts the token only; a client destination cannot override stored state. A failed exchange burns this attempt and requires a fresh link. After native verification, reread the final native session using the newly returned cookie and confirm its email/identity. If completing response construction or membership admission fails, revoke the newly created session and expire its cookies. A prior valid cookie can be replaced only while its expected native session still exists; fence replacement through the native session table so concurrent replacements permit one winner and the loser revokes its newly created session. Never resurrect a deleted session through a stale refresh/save.

Configure the native session cookie name as `lef_session`, HttpOnly, SameSite=Lax, path `/`, and Secure for HTTPS. Respect the automatic `__Secure-` name prefix supplied by Better Auth on HTTPS: the extractor and expiry helpers use the configured actual name and reject ambiguous duplicate cookies. Cutover clears legacy cookie variants. Native sessions use an 8-hour sliding idle deadline with refresh on authenticated activity and a 24-hour absolute deadline, preserving the existing configurable `SESSION_IDLE_TIMEOUT_MS` and `SESSION_ABSOLUTE_TIMEOUT_MS`. Store the absolute deadline in the native session row as a server-owned field; renewal, enrollment, and recovery rotation must preserve that deadline. An explicit successful magic-link sign-in creates a fresh 24-hour lineage and revokes the replaced old session. Reader checks reject expired deadlines even when the native row remains. No Redis browser session, encrypted provider-token record, or cookie cache remains active.

Retain `lef_csrf_token` and `x-csrf-token`. Issue a cryptographically random double-submit token after successful native verification and on valid sign-in-state/session bootstrap when missing; preserve it on ordinary refresh so tabs do not invalidate each other. Expire it with the same scope/security attributes on confirmed sign-out or unusable session. Retain the global Origin and CSRF checks on every unsafe business request authenticated by a human cookie. Expose `BrowserSessionMutationGuard.checkSessionMutation(request)` for explicitly checking the same Origin and double-submit rules on a verified native-session route such as later workspace setup; it accepts real verified context without fabricating a business principal. Separately require exact application Origin with the existing same-origin Referer fallback on all BFF auth mutations, including public magic-link request/verify; cookie-authenticated MFA and sign-out mutations additionally require the double-submit header. Anonymous first-factor routes do not require a preexisting session or CSRF cookie.

Native server API calls bypass router-level rate limiting and shared Origin middleware. Implement an atomic Redis `AuthAttemptLimiter` adapter with separate namespaced budgets. Allow 5 magic-link requests per normalized-email hash and 20 per trusted client IP, each per 15 minutes. Allow 10 token confirmations per IP per minute. Allow 5 combined TOTP/recovery attempts per native user and session, plus 20 per IP, each per 10 minutes. Consume before verification, count invalid attempts, retain expiry, and return safe `429` with `Retry-After`; infrastructure failure returns redacted `503`, never allows the attempt. Obtain client IP through configured trusted proxy handling, not arbitrary caller-supplied headers. Add concurrent admission tests for each limiter category.

Add native session `mfaVerifiedAt` as a server-owned epoch-millisecond number, default zero, `input: false`. Leave it available to internal session reads but filter every BFF response. Every new magic-link session starts at zero, including users with an enrolled authenticator. `admin`, `owner`, and `platform_admin` cannot acquire any business principal until this session completes TOTP or a valid single-use recovery code; members may proceed after email verification. Recompute the requirement from local membership on each request. Do not trust a browser MFA field, global enrollment flag, password reset, second email, or another session's verification.

Expose only TOTP enrollment, verification, and recovery BFF endpoints. Enrollment is available to a recent first-factor native session with no verified authenticator; call `enableTwoFactor({ method: 'totp' })` with `allowPasswordless: true`, retain enrollment verification, and show QR/secret plus backup codes only in the local screen. Existing enrolled users cannot retrieve/reset the secret through first-factor authentication. Native disable/get-TOTP-URI/backup-code-regeneration/password/email-change endpoints remain inaccessible. Verification/recovery calls enforce shared attempt budgets and update the marker only after the native operation succeeds; enrollment may rotate the native session, so mark the final session read from its response cookie. Reject a marker update if that session was concurrently revoked. Do not honor `trustDevice` input. Permit recovery only for an already verified authenticator; provisional codes from an unconfirmed enrollment cannot complete MFA. Keep recovery codes single-use and show them once; do not add an email-only factor reset path.

`GET /v1/auth/sign-in-state` maps a verified native session to one safe state: `signed_out`, `organization_setup_required`, `mfa_enrollment_required`, `mfa_verification_required`, or `authenticated`. Return only `state`; it does not return native identity, membership, tokens, session IDs, TOTP secrets, or permissions. Disabled, otherwise unusable, or ambiguous membership returns the established unusable-account error rather than authority to create an organization. Only genuinely zero-membership verified identities receive setup-required state. Before plan 04, the UI explains setup is unavailable and offers sign-out; after 04 it can route that state to workspace setup.

Preserve the successful current-account document at `GET /v1/auth/session` and exact unauthenticated `401 { code: 'authentication_required' }`; a machine principal still receives `403 { code: 'human_session_required' }`. The state endpoint handles MFA and organization-creation routing, so do not put native session details into current-account output. Preserve `POST /v1/auth/logout` as `204` only after authoritative revocation. Native `signOut` catches deletion errors, so call native `revokeSession` for the validated current token first, then `signOut` for cookie cleanup. Map unconfirmed revocation to redacted `503` and keep the client in its existing logout-uncertain state; retry remains available for limited/native sessions and disabled memberships as well as full business principals.

Replace `KeycloakOrganizationAdmin` with a provider-neutral invited-identity provisioning port in `organization-onboarding`; its native adapter uses `NativeHumanUserProvisioner.ensureUnverifiedByEmail` from the singleton technical runtime and local identity ports. It never calls native magic-link verification or a disabled registration API to create an invited user. `POST /v1/organizations/invitations/:token/accept` accepts no request body, rejects supplied password fields, and preserves token authority, expiry, duplicate/replay output, failure audit, final-owner transactions, and cross-organization membership prohibition. Acceptance creates/reuses an unverified native email identity and membership but never signs it in or claims email verification; the separate magic link proves mailbox control. A previously verified matching native identity may be reused by its stable ID. Remove provider role assignment from acceptance and role changes; local roles and the BFF MFA policy now provide the authority. Preserve locked membership mutation and all role-hierarchy/final-owner checks. Do not grant welcome credits for invitation acceptance.

Add React routes `/auth/sign-in`, `/auth/check-email`, `/auth/verify`, and `/auth/mfa` through the existing route/content owners. Move magic-link secret parsing into a bootstrap imported before `App`/router initialization. Capture the fragment once in mutable memory, immediately replace history with `/auth/verify`, clear secret-bearing history state/query/fragment, and render a confirmation page with an explicit Continue button. Opening the link, mounting, `StrictMode` remounting, route loading in advance, or email scanner GET must never verify it automatically. Clear the token on dispatch, page hide, restoration, unmount, and session boundary; do not put it in React Query, local/session storage, analytics, or page titles. A failed or refreshed confirmation asks for a fresh link. Support a different browser/device from the one requesting it.

Use generated-client feature API functions and the existing `AuthSession` owner for account installation, state routing, abort/generation fencing, cross-tab sign-out, and uncertain mutations. Refetch safe state/account after final verification; only install business account data after both native and local gates succeed. Update invitation UI to remove password entry and offer the email-link sign-in flow after acceptance. Maintain app-owned validation, accessible first-error focus, paste/autocomplete for TOTP, stable pending layouts, recovery states, and desktop/mobile behavior. Preserve approved design tokens; update `UX-CONTRACT.md` and `premium-ui.json` evidence for the new shared auth behavior without starting a redesign.

Add `apps/web/playwright.auth.config.ts` for the native authentication browser suite, with traces, screenshots, video, and secret-bearing attachments disabled. Plan 04 extends this configuration for public registration. Extend `auth:seed` from plan 01 to create native fixture memberships, business roles, and the existing deterministic credit fixtures without resetting enrolled factors on rerun. Preserve `.dev/auth/native-users.json`, `.dev/auth/platform-api-key.json`, and `.dev/auth/customer-api-key.json` metadata contracts from prerequisites. Carry the trusted returned destination in the in-memory auth flow through MFA; a refreshed auth page without that context returns to `/app`. Replace active BFF/browser live tests, `scripts/testing/bff-live*.mjs`, `web-live.mjs`, browser fixture/bootstrap/support code, relevant `scripts/bruno/` helpers, and `.github/workflows/validate.yml` inputs with Mailpit magic-link retrieval and real TOTP enrollment/verification. Owner/admin/operator fixtures must complete genuine MFA; do not keep a development-only MFA exemption. Mailpit access must use checkout ownership checks. Required reports fail on skipped/zero cases. General unused Keycloak file deletion remains plan 05.

Update module documentation for `auth`, `bff-session`, `identity`, and `organization-onboarding`; update browser/auth runtime documentation. Regenerate the committed browser OpenAPI/client through the existing host allow list and scripts; cover new safe operations and passwordless acceptance. Update the nearest `bruno/bff-sessions` and `bruno/organization-onboarding` collections for success, validation, unauthenticated, MFA-required, CSRF/Origin, replay, and authorization cases. Include a real native-provider round trip, not only stub responses.

## Interfaces and Dependencies

| Method and route                                   | Input                              | Safe successful output                                                              |
| -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `POST /v1/auth/magic-link/request`                 | `{ email, destination? }`          | `202 { status: 'accepted' }`, including unknown users                               |
| `POST /v1/auth/magic-link/verify`                  | `{ token }`                        | `200 { state, destination }`, with cookies; destination from consumed server record |
| `GET /v1/auth/sign-in-state`                       | Native cookie when present         | `200 { state }`, with bootstrap/renewal cookies                                     |
| `POST /v1/auth/mfa/enroll`                         | Empty body, native cookie and CSRF | `200 { totpUri, recoveryCodes }`, one-time sensitive presentation                   |
| `POST /v1/auth/mfa/verify`                         | `{ code }`, native cookie and CSRF | `200 { state }`, with any rotated cookie                                            |
| `POST /v1/auth/mfa/recover`                        | `{ code }`, native cookie and CSRF | `200 { state }`, with any rotated cookie                                            |
| `GET /v1/auth/session`                             | Existing authentication contracts  | Existing current-account document                                                   |
| `POST /v1/auth/logout`                             | Native cookie and CSRF             | `204`, after confirmed revocation                                                   |
| `POST /v1/organizations/invitations/:token/accept` | No body; invitation authority      | Existing first-acceptance or generic replay document                                |

`state` has exactly the five values defined above. Invalid, expired, or used magic links return `400 { code: 'magic_link_invalid' }`; invalid TOTP/recovery returns `400 { code: 'mfa_code_invalid' }`; unavailable state/enrollment conditions return `409 { code: 'auth_state_conflict' }`. Rate limiting returns `429 { code: 'auth_rate_limited' }` with `Retry-After`; native/database/mail/limiter outages return redacted `503 { code: 'authentication_unavailable' }`. Preserve current-account's established 401/403 documents. Reject unsupported DTO fields. Auth routes set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, including errors and malformed bodies, before parsing/logging.

Application ports include `VerifiedHumanSessionReader`, native identity/session fact readers, `MagicLinkAttemptStore`, and `AuthAttemptLimiter`; their results are provider-neutral. HTTP effect capture/forwarding stays in API/infrastructure adapters. Native auth schema, SDK instance, SMTP, Redis, and TypeORM remain outside application/domain code. Document the new BFF capability dependency when plan 04 consumes it. Keep raw native tokens internal to the adapter even for logout.

## Acceptance Criteria

- An invited/seeded member signs in through an owned Mailpit link in a second browser, explicitly confirms, and receives the existing account projection; link GET or loading in advance alone creates no session.
- The fragment disappears before router initialization; replay, expiry, malformed token, destination tampering, and token-hash purpose mismatch fail safely. No logs, browser reports, storage, or navigation history retain authentication authority.
- Owners/admins/operators cannot access any business API after a magic link until this session completes real TOTP or recovery. New enrollment and successful recovery work without a password; wrong/replayed codes and attempt-budget races cannot grant a principal.
- Native raw endpoints, factor disable/secret retrieval, client-supplied MFA markers, and alternate sign-in methods cannot bypass BFF policy. Enrollment rotation marks the final native session only; revocation/refresh races cannot resurrect it.
- Membership disablement and promotion take effect on the next request. Verified zero-membership identities get only setup-required state and later-plan capability, while disabled or ambiguous memberships get no setup authority.
- HTTP and HTTPS cookie names/scopes work; native renewal and cleanup cookies survive BFF mapping. Idle and absolute expiry, Origin/CSRF denial, key-before-cookie precedence, and successful/uncertain logout match the specified behavior.
- Invitation acceptance without a request body retains replay, audit, tenant conflict, role hierarchy, and final-owner guarantees. No invitation password or automatic business session remains.
- Updated live fixtures and CI execute real mail-link plus privileged MFA flows without Keycloak credentials or bypasses; focused tests, generated contracts, Bruno, architecture, types, and prose checks pass with precise evidence.

## Validation

Run these commands from the repository root after the dependencies and implementation are present:

```sh
corepack pnpm test -- src/libs/modules/auth src/libs/modules/bff-session src/libs/modules/organization-onboarding src/libs/modules/identity src/lead-email-finder-api/src/authentication src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts --runInBand
node --test scripts/testing/bff-live.test.mjs scripts/testing/web-live.test.mjs scripts/testing/development-stack.test.mjs scripts/testing/browser-fixture-artifacts.spec.mjs scripts/testing/invitation-browser-artifacts.spec.mjs
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm build
corepack pnpm test:auth-runtime
corepack pnpm test:bff-live
corepack pnpm bruno:bff-sessions
corepack pnpm bruno:organization-onboarding
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci
corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-web build
corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt
corepack pnpm --filter @tuposoft/lead-email-finder-web test:invitations
corepack pnpm --filter @tuposoft/lead-email-finder-web test:privileged
corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test --config playwright.auth.config.ts
corepack pnpm test:web-live
corepack pnpm design:lint
corepack pnpm ui:audit
corepack pnpm test:ci-paths
git diff --check
```

Use a disposable `_test` database/schema for real native session, pending-token, membership, limiter, and concurrency tests; use the checkout-owned stack for live Mailpit/browser/Bruno cases. Extend real provider tests for signing in from another device, MFA enrollment with rotated cookies, recovery single use, revoked-session replay, renewal headers, absence of exposed native APIs, and database failure during logout. Required suites must report positive executed counts and zero required skips.

Run focused auth browser accessibility and responsive checks at 1440 by 900 and 320 by 720. The Browser plugin is absent in this planning session; use the repository's Playwright workflows unless availability changes at implementation. Disable traces, videos, screenshots, DOM dumps, and response attachments while magic links, TOTP secrets, or recovery codes are present. Capture safe post-auth layout evidence separately and run artifact/log privacy probes. Recheck Paddle's existing signed-webhook/raw-body regression tests. Record exact executed commands, environment, outcomes, and any unavailable live dependencies separately from CI.

## Idempotence and Recovery

Deploy this change only by resetting disposable development auth/application data and reseeding through the updated owned-stack tooling. Use `corepack pnpm dev:reset -- --confirm-project=LEF` after ownership checks, then `corepack pnpm auth:seed`; update the reset workflow to select these new native fixtures at this cutover. Do not import Keycloak passwords or MFA secrets. Existing browser sessions and pending links are intentionally invalid; clear old cookies and restart sign-in.

Magic-link attempts and recovery codes are single-use. A timeout after submission is an uncertain outcome, not permission to retry a consumed token or create another session automatically; fetch safe sign-in state and offer a fresh link. Partial MFA enrollment can resume only through a new authorized enrollment flow; never overwrite a verified authenticator. Failed membership/marker writes revoke the newly minted session before exposing success. Repeated fixture seeding preserves enrollment and IDs, and owned metadata cleanup must not touch another checkout.

To recover from an incompatible native schema, recreate only the owned disposable schema/stack, synchronize, and reseed. To revert this pull request, revert code and reset/reseed the matching prior development fixtures rather than pointing old BFF code at native-session rows. Never treat clearing a browser cookie as proof that server revocation succeeded.

## Artifacts and Notes

This plan is based on inspected source; no implementation or validation is claimed. Primary references: [server API and headers](https://better-auth.com/docs/concepts/api), [session caching and revocation](https://better-auth.com/docs/concepts/session-management), [passwordless TOTP and magic-link limitation](https://better-auth.com/docs/plugins/2fa), and [magic links](https://better-auth.com/docs/plugins/magic-link). Tests must use the installed pinned dependency from plan 01. Direct native APIs require BFF Origin/rate-limit enforcement; raw native `signOut` alone does not prove revocation.

Before implementation, follow root `AGENTS.md` to assign the synced issue marked `<!-- execplan: better-auth/03 -->` and put it in progress. This plan corresponds to one isolated, conventional-commit pull request assigned to the user and closing that issue. Do not mark plan 04 or plan 05 complete as part of this work.

## Plan readiness

Ready to implement
