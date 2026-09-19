# MCP Connector Road Map

These seven ExecPlans build a remote, self-hosted server implementing Anthropic's Model Context Protocol (MCP) so
AI agents (Claude Desktop, Claude Code, and other MCP clients) can call this product's customer-facing
verification and billing capabilities as tools, authenticated with a customer's own OAuth2 client-credentials
pair. Each numbered plan follows `.agents/PLANS.md` and delivers exactly one implementation PR. Creating these
documents implements nothing by itself.

## Order and Dependencies

A companion review road map, [`mcp-connector-hardening`](../mcp-connector-hardening/README.md), corrects four
findings from the review of the PR that added this road map (PR #652) — including two real gaps in the table
below (a token-cache secret-bypass and an incomplete dependency graph) and two real omissions (missing `400`/`403`
error mapping and an unsupported Claude Desktop connection path). The dependencies below already reflect those
corrections; implement `mcp-connector-hardening/04` first, since it is what makes this table's own dependencies
enforceable.

| Key | Implementation Task | Outcome | Dependencies |
| --- | --- | --- | --- |
| `mcp-connector/01` | [Scaffold the connector workspace](01-scaffold-mcp-server-workspace.md) | A runnable, lint/typecheck/test-covered `apps/mcp-server` with one unauthenticated smoke tool | `mcp-connector-hardening/04` |
| `mcp-connector/02` | [Bridge OIDC client-credentials auth](02-bridge-oidc-client-credentials.md) | Every MCP request requires and exchanges a customer's own Basic credential for a cached bearer token | `mcp-connector/01` |
| `mcp-connector/03` | [Internal API client, error mapping, and credit balance](03-api-client-error-mapping-credit-balance.md) | The shared upstream client/error vocabulary, proved end-to-end by `check_credit_balance` | `mcp-connector/02`, `mcp-connector-hardening/01` |
| `mcp-connector/04` | [Single-email verification tools](04-single-email-verification-tools.md) | `verify_email`, `submit_async_verification`, `check_async_verification`, `get_verification_result` | `mcp-connector/03`, `mcp-connector-hardening/02` |
| `mcp-connector/05` | [Batch verification tools](05-batch-verification-tools.md) | `submit_batch_verification`, `check_batch_verification`, `download_batch_results` | `mcp-connector/03`, `mcp-connector-hardening/02` |
| `mcp-connector/06` | [Deploy the connector](06-deploy-mcp-server.md) | `docker/mcp-server.Dockerfile`, a Compose service, and `images` CI coverage | `mcp-connector/03` |
| `mcp-connector/07` | [Live validation and customer documentation](07-live-validation-and-docs.md) | An Inspector-driven live CI check and the customer setup guide | `mcp-connector/04`, `mcp-connector/05`, `mcp-connector/06`, `mcp-connector-hardening/03` |

Implement `mcp-connector-hardening/04` before plan 01; nothing in this road map can start until its own dependency
graph is the enforceable one above. Implement 01 and 02 next; nothing else can authenticate without them. Plan 03
now also requires `mcp-connector-hardening/01`'s credential-bound token cache before it exists as a shared
dependency. Plans 04 and 05 each now also require `mcp-connector-hardening/02`'s complete error mapping; they
remain independent of each other and may proceed in either order, or in parallel, once their prerequisites land.
Plan 06 only requires plan 03 to have something meaningful to deploy, but implementing it after 04 and 05 avoids
retouching the Compose/CI wiring twice; treat that ordering as a strong recommendation rather than a hard
dependency. Plan 07 requires both tool plans, the deployed service, and `mcp-connector-hardening/03`'s supported
Claude Desktop bridge — plan 06 does not transitively supply the tool plans, so each is a genuinely separate
prerequisite.

Readiness means a plan contains enough decisions to implement. Dependencies determine when it can start; a ready
plan does not assert that its prerequisite is complete.

## Shared Constraints

- The connector holds no long-lived secret of its own. A customer's client secret exists only for the duration of
  a token-mint call; the in-memory cache stores only `{token, expiresAtMs}` entries, never the secret itself, and
  is identified by an HMAC-SHA-256 digest over the complete `(clientId, clientSecret)` pair — never by `clientId`
  alone, which would let an incorrect or empty secret reuse another request's cached token for the same `clientId`
  (`mcp-connector-hardening/01`). No log line, error message, or tool result may ever contain a secret, bearer
  token, or unfiltered upstream response body.
- `/emails*` and `/credits/:organizationId` remain platform-admin-only and must never be exposed as tools, now or
  in any later plan. Every tool maps to exactly one already-customer-facing, permission-gated endpoint.
- Preserve the existing `VerificationRateLimitGuard` behavior as observed by the connector: surface `429` (with
  `Retry-After`) and `503 rate_limit_unavailable` cleanly to the calling agent rather than retrying silently,
  looping, or swallowing them.
- Add no TypeORM migration, Keycloak data migration, backfill, production rollout, or production recovery job.
  This road map delivers a locally and CI-validated Compose service, not a publicly reachable production
  endpoint — provisioning real internet-facing ingress/TLS for customers is explicitly out of scope for every
  plan here, matching how neither `api` nor `web` has one today either.
- Follow this repository's existing standalone-workspace-package convention (`packages/api-client`) for
  `apps/mcp-server`'s own `package.json`/`tsconfig.json` rather than extending the root Nest-oriented
  configuration. It is a plain Node/TypeScript package, not a NestJS module — it does not participate in the
  `src/libs/modules/` business-module architecture gate and must not be added under that directory.
  `architecture:check` is scoped to `src/libs/modules` and needs no change.
- Extend, never fork, the existing dev-stack customer fixture (`scripts/keycloak/customer-fixture.ts`) for live
  validation. Widen its granted permissions only additively; existing browser-live suites that depend on it must
  keep passing unmodified.
- Root Jest (`testRegex: '.*\.spec\.ts$'`, only `apps/web/` ignored) and root ESLint (`eslint.config.mjs`'s
  `ignores` list does not exclude new paths) already auto-discover any new `apps/mcp-server/**/*.spec.ts` and
  `.ts` file — do not add a redundant Jest or ESLint configuration block for the new package. Root `tsconfig.json`'s
  `include` does **not** cover `apps/**`, and the CI `backend`/`repository-policy`/`contract` jobs install
  dependencies via a pnpm filter scoped to `@tuposoft/lead-email-finder` and `@tuposoft/lead-email-finder-api-client`
  only (`.github/workflows/validate.yml`) — a new sibling workspace package with no dependency edge to either
  will not get its `node_modules` installed under that filter and will not be typechecked by the root `typecheck`
  script. Plan 01 fixes both explicitly; later plans must not silently reintroduce either gap.
- Follow root `AGENTS.md` for the synced issue assignment, project status, living progress updates, conventional
  commits, and PR linkage once implementation starts. Creating this road map does not create or modify external
  issues or PRs. **Correction (2026-09-18):** root `AGENTS.md`'s Bruno Test Policy does apply to this feature —
  the connector speaks real HTTP, and its externally observable routing, origin, and authentication behavior is
  exactly what that policy covers. The original blanket exemption above was wrong; `bruno/mcp-request-routing/`,
  `bruno/mcp-request-origins/`, and `bruno/mcp-authentication/` already exist and are the required coverage for
  the behavior each corresponding plan added. Add a scoped collection for any later plan that changes this
  connector's HTTP behavior, the same as for any other HTTP-facing part of this repository.

## Related Plans

- [MCP connector hardening](../mcp-connector-hardening/README.md) — the four corrective plans this road map's
  dependencies above already incorporate.
- [Service Client Management](../../../src/libs/modules/service-client-management/README.md) — the self-service
  credential a customer configures into their MCP client.
- [Identity](../../../src/libs/modules/identity/README.md) — the permission vocabulary every tool's required
  permission is drawn from.
- [Email Verification](../../../src/libs/modules/email-verification/README.md) and
  [Credits](../../../src/libs/modules/credits/README.md) — the modules owning every endpoint this connector
  calls.
