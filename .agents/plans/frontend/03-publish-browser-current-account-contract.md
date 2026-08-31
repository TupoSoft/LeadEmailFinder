# Publish the Browser Current-Account Contract

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the future web application one truthful account document for an authenticated person. A signed-in person can
read their membership, organization, nullable email, browser capabilities, and the exact permissions they may grant
to a service client without receiving OAuth, credential, or principal internals. Missing authentication, machine
credentials, and unusable human memberships have distinct stable responses that the application shell can recover
from safely. A membership that becomes unusable invalidates authentication at the existing guard and therefore uses
the same stable `401` boundary as an expired session.

## Progress

- [ ] (2026-08-31) Add the identity-owned current-account reader port and TypeORM adapter.
- [ ] (2026-08-31) Publish exact browser capabilities and one auth-owned service-client grant policy.
- [ ] (2026-08-31) Replace the raw session response with a human-session-only current-account DTO.
- [ ] (2026-08-31) Define stable authentication and wrong-credential-kind responses.
- [ ] (2026-08-31) Add source Swagger annotations, focused tests, Bruno coverage, and module documentation.
- [ ] (2026-08-31) Run architecture, persistence, serialization, and live-session validation and record evidence.

## Plan dependencies

- `frontend/02`
- `auth/06`
- `auth/08`
- `auth/12`

## Surprises & Discoveries

- `GET /v1/auth/session` currently serializes `AuthPrincipal`, including issuer, subject, credential ID, and a raw
  permissions array. Human principals commonly carry an empty raw array because `RolePermissionPolicy` derives their
  effective permissions separately.
- The endpoint accepts both cookie and service-client bearer authentication. A machine principal has no human
  membership, organization display name, or account email from which to build the browser DTO.
- The generic role policy grants `platform_admin` the broad permission union, but service-client creation separately
  permits only owner and administrator human sessions. Browser capabilities cannot be derived from that union alone.
- External-identity and membership email fields are nullable, so the browser contract must preserve `null`.
- Identity still exports persistence entities through a temporary compatibility surface. This plan must use only the
  public reader ports and domain records; `module-architecture/08` owns removing those legacy entity exports.

## Decision Log

- Decision: Preserve `GET /v1/auth/session` but make it a human-session-only current-account resource.
  Rationale: The existing probe remains stable for browser cookies, while a valid service-client bearer receives a
  typed `403` instead of a misleading alternate response shape.
  Date/Author: 2026-08-31, project planning.
- Decision: Preserve the global authentication boundary: return `401 authentication_required` when a human session is
  absent, invalid, expired, or no longer usable, and `403 human_session_required` for an authenticated service
  client that reaches this human-only endpoint.
  Rationale: `BffSessionCredentialAuthenticator` resolves the active membership before the controller, and the
  global guard maps membership rejection to `401`. Normalize every `CredentialRejectedError` in that guard to the
  same code-only error envelope instead of forwarding its membership- or credential-specific message; an
  endpoint-only `403` would require a material authentication redesign. Expected JWT verification rejection must
  first cross the framework-free authenticator boundary as that same domain signal rather than as Nest's
  `UnauthorizedException`; unexpected verifier faults remain server errors.
  Date/Author: 2026-08-31, project planning.
- Decision: Return UI-specific browser capabilities from a BFF-owned exhaustive policy and keep them distinct from
  colon-delimited backend permissions.
  Rationale: Capabilities guide presentation only; endpoint and application authorization remain authoritative.
  Date/Author: 2026-08-31, project planning.
- Decision: Put the permissions an owner or administrator may grant to service clients in one auth-owned
  `ServiceClientGrantPolicy` consumed by both current-account assembly and service-client creation.
  Rationale: One policy prevents the presented choices and authoritative mutation rule from drifting without making
  BFF and service-client-management depend on each other.
  Date/Author: 2026-08-31, project planning.
- Decision: Model current-account email as `string | null` and standardize `Email unavailable` as the browser fallback.
  Rationale: Missing identity email is valid persisted state; neither the API nor UI should manufacture an address.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/bff-session/` owns the browser cookie session and the `/v1/auth` controller. `frontend/02` makes
provider protocol routing work in Compose without changing the public issuer. The global auth guard turns either an
opaque `lef_session` cookie or a service-client bearer into `AuthPrincipal`. The CSRF guard from `auth/12` continues
to protect unsafe cookie-authenticated requests.

Identity persistence under `src/libs/modules/identity/` owns memberships, organizations, and external identities.
Its public barrel exposes application ports and domain records, but it also temporarily exports legacy TypeORM
entities until `module-architecture/08` seals that compatibility surface. The BFF must use one small reader that
resolves display fields for the single active human membership and must not consume those entity exports.

Service-client creation under `src/libs/modules/service-client-management/` already enforces human credential kind
and owner/administrator eligibility in addition to permission checks. This plan centralizes only the grant subset
rule; it does not move creation behavior into auth or BFF.

The account response is a navigation and presentation contract, not proof that a later API call will succeed. A
missing capability may hide a control, but it must not cause the browser to predict the result of direct navigation
or a concurrent authorization change.

Before editing these modules, implementation must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and the affected BFF-session, identity, auth, and service-client-management README files.

## Scope and Non-Goals

This pull request adds the current-account reader, browser capability policy, shared grant policy, human-only session
DTO, stable account error codes, source Swagger descriptions, focused tests, documentation, and the closest BFF
Bruno coverage. It changes the smallest service-client creation dependency needed to consume the shared policy and
normalizes the existing global guard's `401` body without changing which requests are unauthorized.

It does not change provider response handling, pending-login state, callback redirects, React, generated API
artifacts, post-login destinations, organization switching, registration, password reset, roles, OAuth routing,
cookies, CSRF, production identity configuration, or database schema. `frontend/04` owns authorization-response
replay and failure handling; `frontend/05` owns export and generation.

## Plan of Work

Add an identity application port, `CurrentAccountReader`, with an immutable result containing nullable external
email, membership ID and role, and organization ID and name. Implement a TypeORM adapter inside identity that selects
only those fields for exactly one active membership. Bind and export the port from `IdentityModule` and its public
barrel. The BFF depends only on the port, never an identity repository or entity. Test present and null email,
missing or disabled membership, duplicate active membership, and cross-organization inconsistency.

Add `BrowserCapabilityPolicy` in the BFF application layer with this exhaustive mapping:

| Membership role  | Browser capabilities                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| `member`         | `verification.run`, `verification.read`                                               |
| `admin`          | `verification.run`, `verification.read`, `team.manage`, `service_clients.manage`      |
| `owner`          | all `admin` capabilities plus `billing.read`, `billing.manage`                        |
| `platform_admin` | `platform.organizations.manage`, `platform.credits.manage`, `platform.proxies.manage` |

Add auth-owned `ServiceClientGrantPolicy` behind an injectable token. Combine the existing effective-permission
policy with the human owner/administrator eligibility enforced by creation. For `admin`, return the ordered list
`verification:run`, `verification:read`, `members:manage`, and `credentials:manage`; `owner` additionally receives
`billing:read` and `billing:manage`. Member and platform-administrator lists are empty. Make current-account assembly
and `ServiceClientCreationService` consume this contract. Add exhaustive role-table and forged-broader-grant tests.

Replace `SessionResponseDto` with serializer-safe `CurrentAccountContextDto`:

    {
      "email": "owner@example.test",
      "membership": { "id": "...", "role": "owner" },
      "organization": { "id": "...", "name": "Example Organization" },
      "capabilities": ["verification.run", "verification.read", "team.manage", "service_clients.manage", "billing.read", "billing.manage"],
      "grantableServiceClientPermissions": ["verification:run", "verification:read", "members:manage", "credentials:manage", "billing:read", "billing:manage"]
    }

The `email` property also accepts `null`. Require `human_session`, then combine the membership reference, identity
reader, and policies. In `AuthGuard`, map every `CredentialRejectedError` to the exact generic
`401 { "code": "authentication_required" }` envelope and discard the original error message. Apply that same body to
missing/invalid bearer credentials, missing/invalid/expired BFF cookies, and membership rejection across every
guarded endpoint; status and authorization decisions do not change. Map only the wrong authenticated credential kind
to the stable current-account `403`. Add guard-level HTTP compatibility tests for representative existing protected
routes and prove no membership status, issuer, subject, or parser message appears. Do not include membership counts
or account-state details in failures. Never serialize credential kind,
issuer, subject, credential ID, tokens, or Redis/session identifiers.

Refactor `JoseOidcTokenVerifier` and its authenticator boundary so expected JWT-shaped bearer rejection—bad
signature, issuer, audience, expiry, claim shape, or key selection—becomes the framework-free
`CredentialRejectedError` before it reaches `AuthGuard`. Do not let infrastructure adapters construct Nest HTTP
exceptions. Preserve unexpected JWKS/Redis/programming failures as redacted `5xx`. Test an opaque invalid bearer, a
JWT-shaped bad token, expired BFF cookie, unusable membership, and an injected unexpected verifier fault so the
normalization does not swallow outages.

When account assembly discovers missing, duplicate, or cross-organization-inconsistent identity/membership data
after `AuthGuard` has already authenticated the cookie, throw a typed `CurrentAccountUnavailableError` from the
application service. Map only that expected account-state error at the controller/filter boundary to the same exact
`401 { "code": "authentication_required" }` envelope; do not expose its reason. Repository outages and unexpected
assembly faults remain redacted `5xx`. Add transport-level tests for every account-state case and an injected reader
failure.

Own the endpoint's Swagger decorators and response DTOs here. Add serializer and HTTP tests for the exact success
shape and every failure category. Extend the nearest BFF Bruno workflow only with plain-HTTP missing-session and
valid-service-client-bearer boundaries. Cover the genuine human session, null email, inactive membership, and
post-guard account-state cases in `test:bff-live`, because Bruno cannot drive the Keycloak-hosted login form and this
plan precedes the browser MFA fixture. `frontend/05` will consume these annotations rather than redefining them.

## Interfaces and Dependencies

`GET /v1/auth/session` returns the nested current-account DTO for a valid human session. `email` is `string | null`.
Its stable failures are:

    401 { "code": "authentication_required" }
    403 { "code": "human_session_required" }

Browser capabilities use dots and are presentation hints. Grantable service-client permissions use the backend's
colon-delimited enum. The account and service-client creation paths consume the same auth-owned grant-policy port.

This plan introduces no external service or schema. It depends on BFF sessions, service-client creation, CSRF, safe
provider routing, and the identity persistence already delivered by its listed prerequisites.

## Acceptance Criteria

- A valid human session receives the exact account shape with nullable email, membership ID/role, organization
  ID/name, deterministic capabilities, and deterministic permissions that can be granted. Principal and credential
  internals are absent.
- Missing, invalid, or expired authentication and an inactive, missing, duplicate, or inconsistent membership return
  `401 authentication_required`; a valid service-client bearer returns `403 human_session_required`. Neither response
  includes a partial document or sensitive reason.
- The global guard emits the same code-only `401` envelope for every credential rejection on representative existing
  protected routes, including a JWT-shaped bearer rejected by JOSE; it preserves their status/authorization behavior
  and never forwards the original rejection message. Unexpected verifier faults remain redacted `5xx`.
- Role-table tests prove every capability and grant set. Platform administrators receive only platform browser
  capabilities and no service-client permissions that can be granted, without changing their backend permission union.
- Current-account and service-client creation consume the same auth-owned grant policy; a stale or forged broader
  permission selection is rejected authoritatively.
- Account and membership email schemas remain nullable, and null does not become an empty or fabricated address.
- Source Swagger annotations, focused persistence/application/controller/serialization tests, the BFF Bruno flow,
  module architecture checks, and repository validation pass in one pull request.

## Validation

Run focused current-account reader, policy, service-client grant, controller, serializer, and HTTP tests, including
the null-email case, guard-level unusable-membership `401`, and service-client `403`. Then run:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- current-account browser-capability service-client-grant bff-session.controller --runInBand
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm architecture:check
    corepack pnpm test:bff-live
    corepack pnpm bruno:bff-sessions
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/bff-session/README.md src/libs/modules/identity/README.md src/libs/modules/auth/README.md src/libs/modules/service-client-management/README.md bruno/bff-sessions/README.md .agents/plans/frontend/03-publish-browser-current-account-contract.md
    git diff --check

Record exact test counts, HTTP status/code pairs, serialized field names, skipped live gates, and Bruno results.

## Idempotence and Recovery

The reader and policies are read-only. Repeating the account request has no data effect, and every response is
assembled from authoritative account state. If persistence or serializer tests fail, repair the source contract and
rerun against disposable data; add no migration.

Live fixtures use unique identities and must be cleaned up only within the confirmed worktree stack. Do not delete
shared Keycloak, Redis, or database state from another checkout.

## Artifacts and Notes

Record a redacted current-account example, the null-email case, capability matrix, grant matrix, failure matrix,
focused test counts, and Bruno summary. Never record authorization codes, cookies, CSRF values, client secrets,
tokens, Redis values, provider payloads, or real account data.

## Plan readiness

The human-session boundary, nullable account schema, capability/grant policies, guard-aligned failure contract, module
ownership, validation, and one-pull-request scope are decision-complete.

Ready to implement.
