# Better Auth Replacement Road Map

These five ExecPlans follow `.agents/PLANS.md`. Each plan delivers exactly one pull request.
The planning basis is commit `352553caa799acee39311007821d50a7a98c4cd7`, inspected on 2026-10-19.
Readiness describes a complete design; prerequisites determine when implementation may begin.

## Order and Dependencies

| Key              | Pull Request                                                                                      | Dependencies                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `better-auth/01` | [Add the authentication runtime and development fixtures](01-runtime-and-development-fixtures.md) | None                                                                   |
| `better-auth/02` | [Replace OAuth service clients with API keys](02-organization-api-keys.md)                        | `better-auth/01`                                                       |
| `better-auth/03` | [Replace browser login with magic links and MFA](03-magic-link-sessions-and-mfa.md)               | `better-auth/01`, `better-auth/02`                                     |
| `better-auth/04` | [Enable public registration with 100 trial credits](04-public-signup-and-trial-credits.md)        | `better-auth/01`, `better-auth/03`                                     |
| `better-auth/05` | [Remove Keycloak and validate the replacement](05-remove-keycloak-and-validate.md)                | `better-auth/01`, `better-auth/02`, `better-auth/03`, `better-auth/04` |

## Shared Constraints

- The user chose public email-link registration, an explicit workspace-name step, 100 trial credits, API keys for
  integrations, and a reset of disposable development data. Public registration opens account creation;
  application data and operations remain authenticated and scoped to an organization.
- Keep the existing application organization, membership, permission, audit, and credit models authoritative.
  Better Auth owns human authentication and its database sessions. The application owns organization API keys.
- Keep the canonical module layers, public barrels, and acyclic dependencies. Vendor SDKs, database clients,
  HTTP headers, and SMTP details belong in infrastructure or API adapters, outside application and domain code.
- Plan 01 provides one technical runtime under `src/libs/better-auth/src/`, `BetterAuthRuntimeModule`, mapped
  `better_auth_*` tables, the `auth-mail` development service, and compiled `auth:seed` tooling.
  Session records have a server-controlled MFA completion marker. No native authentication handler is public.
- Use the application-owned issuer `urn:lead-email-finder:auth`, exposed as a framework-free identity constant.
  Human subjects are Better Auth user IDs; machine subjects are stable local service-credential IDs.
  Changing the public application URL must not change persisted identity linkage.
- Preserve privileged MFA for `owner`, `admin`, and `platform_admin`. A magic link proves email ownership;
  it does not prove completion of a second factor. Block every business operation, including API-key creation,
  until the current session satisfies its membership role's MFA requirement.
- Keep the current browser account projection, immediate membership and credential disablement, Origin/CSRF
  checks, truthful logout, account-replacement cleanup, and secret-free generated contracts.
- Plan 03 exports `VerifiedHumanSessionReader` and `VERIFIED_HUMAN_SESSION_READER` from the BFF public barrel
  for plan 04. This capability returns trusted verified identity context without fabricating an organization
  principal. It exposes no native session token or provider object.
- Sign-in state is one of `signed_out`, `organization_setup_required`, `mfa_enrollment_required`,
  `mfa_verification_required`, or `authenticated`. Keep incomplete onboarding and MFA sessions restricted.
- A user may have one active organization membership and one self-created workspace. Grant 100 non-expiring
  trial credits once on successful self-registration. Invitations, repeated login, and retries grant no credits.
  A durable registration record prevents membership removal or organization changes from resetting eligibility.
- Serialize invitation acceptance and self-registration through the same external-identity lock. A removed
  invitation-only member with no active membership may create their first workspace; former memberships
  are never automatically reactivated. A registration replay returns the original result without another grant.
- Preserve the existing React, Vite, generated API client, visual design, and shared interface behavior.
  Reuse the approved primitives. Update the UX contract when authentication behavior changes.
- Keep each intermediate PR runnable. Plan 01 retains the existing login; plan 02 replaces machine credentials
  while retaining Keycloak human login; plan 03 switches human login with registration temporarily disabled;
  plan 04 enables public registration; plan 05 removes unused provider infrastructure.
- Apply the root Bruno policy to changed HTTP behavior and the prose policy to edited Markdown.
  Each implementation PR records actual checks and gaps in its own plan.
- Add no production deployment, database migration, account import, or backfill. Synchronize disposable schemas
  and reset/reseed only resources proven to belong to the current checkout. Never use an unqualified volume reset.

## Coordination

Before implementing a plan, read its prerequisites' delivered contracts and update its evidence if the base changed.
Follow root `AGENTS.md` for its synced issue and project status when implementation starts; authoring these plans
does not start implementation or change GitHub state. Plan 05 names every prerequisite directly because its final
checks exercise all four capabilities.

Keep source changes and validation with the PR that changes behavior. Plan 05 removes unused surfaces and proves
the complete development workflow; it does not postpone required coverage from earlier plans.
