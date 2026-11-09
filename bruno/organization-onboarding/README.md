# Organization Onboarding Collection

This Bruno API-request collection requires a provisioned disposable stack. Configure platform/customer API keys
and an expired-invitation fixture through `environments/local.yml` before running the requests.

## Required Behavior

A platform credential creates an organization and its first owner invitation. Public preview exposes pending
organization, email, role, and expiry. Acceptance creates the owner; consumed preview returns generic `410`, and
repeat acceptance returns only `{ "status": "accepted" }`. Unknown/expired tokens, existing-owner conflicts,
organization-scoping violations, and customer administration are rejected.

Invitation responses use `Cache-Control: no-store` (do not retain responses) and `Referrer-Policy: no-referrer`
(do not forward the invitation URL). Directory pagination uses a cursor, an opaque continuation value, and page
sizes from 1 to 100. Pages must not overlap; terminal pages omit the cursor; directory reads expose metadata only.
