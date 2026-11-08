# Organization Onboarding Collection

Bruno runs API requests with assertions. Provision this checkout's disposable stack, then run:

```shell
corepack pnpm bruno:organization-onboarding
```

Set `COMPOSE_PROJECT_NAME` for a separately named stack. The launcher checks container ownership and loads private
platform/customer keys from `.dev/auth/`; files must have mode `0600` (owner-only read/write). Keys stay out of
arguments. All 23 requests and tests must pass; missing, skipped, or empty results fail.

## Required Behavior

A platform credential creates an organization and its first owner invitation. Public preview exposes pending
organization, email, role, and expiry. Acceptance creates the owner; consumed preview returns generic `410`, and
repeat acceptance returns only `{ "status": "accepted" }`. Unknown/expired tokens, existing-owner conflicts,
organization-scoping violations, and customer administration are rejected.

Invitation responses use `Cache-Control: no-store` (do not retain responses) and `Referrer-Policy: no-referrer`
(do not forward the invitation URL). Directory pagination uses a cursor, an opaque continuation value, and page
sizes from 1 to 100. Pages must not overlap; terminal pages omit the cursor; directory reads expose metadata only.

## Fixture and Secret Handling

The launcher generates passwords and tokens in memory. It temporarily inserts one expired invitation, stores only
its token hash in PostgreSQL, and removes that exact fixture afterward. Normal scenarios leave uniquely named
organizations and a development Keycloak user; clear them only through an ownership-checked disposable reset.

The invitation reporter records only counts, boolean failures, and test statuses. It suppresses URLs, headers,
bodies, assertion text, and raw CLI output before writing files, including on failure. Temporary reports are deleted.
Do not enable unrestricted reporters, network capture, traces, screenshots, or video.

Synthetic launcher tests verify execution and secret-safe reporting. Real identity-provider acceptance, role rules,
final-owner protection, browser sessions, and MFA (a second authentication factor) use their focused API/browser tests.
