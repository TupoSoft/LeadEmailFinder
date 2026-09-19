# MCP Connector Hardening Road Map

These six ExecPlans cover findings from [PR #652](https://github.com/TupoSoft/LeadEmailFinder/pull/652)
and [PR #705](https://github.com/TupoSoft/LeadEmailFinder/pull/705).
Each plan follows `.agents/PLANS.md` and delivers exactly one implementation PR.
Plan 01 is reused for the confirmed cache bypass in PR #705; plans 05 and 06 cover its two additional findings.

## Order and Dependencies

| Key | Implementation task | Review finding | Dependencies |
| --- | --- | --- | --- |
| `mcp-connector-hardening/04` | [Require capabilities before final validation](04-gate-validation-on-required-tools.md) | Final validation can start without its tools | None |
| `mcp-connector-hardening/01` | [Bind cached tokens to credentials](01-bind-token-cache-to-credentials.md) | A cached token bypasses an incorrect or empty secret | `mcp-connector/02`, `mcp-connector-hardening/04` |
| `mcp-connector-hardening/05` | [Restore authenticated origin checks](05-update-authenticated-origin-checks.md) | Existing Bruno success requests return HTTP 401 | `mcp-connector/02`, `mcp-transport-hardening/02` |
| `mcp-connector-hardening/06` | [Document authenticated local startup](06-document-authenticated-local-startup.md) | README startup commands omit the required realm URL | `mcp-connector/02`, `mcp-connector-hardening/05` |
| `mcp-connector-hardening/02` | [Preserve validation and permission errors](02-map-validation-and-permission-errors.md) | Expected API rejections become upstream errors | `mcp-connector/03`, `mcp-connector-hardening/04` |
| `mcp-connector-hardening/03` | [Connect Claude Desktop through a local bridge](03-connect-claude-desktop-through-local-bridge.md) | Direct remote setup cannot reach the local service | `mcp-connector/06`, `mcp-connector-hardening/01`, `mcp-connector-hardening/02` |

Plan 04 has completed its dependency correction at the current planning base.
The original scaffold exists, and the authentication bridge is still in open PR #705 at the recorded review head.
Implement plan 01 before adding any real business tool; the original plan 03 already enforces that dependency.
Plan 05 can proceed independently of the cache fix after its authentication and origin prerequisites land.
Plan 06 follows plan 05 because both edit the origin collection guide.
Neither plan 05 nor plan 06 needs the API client, business tools, or container deployment.

Implement the original API client, then hardening plan 02 before either verification tool plan.
Deployment can follow the shared client independently of the single and batch tools.
Hardening plan 03 follows deployment and both runtime corrections.
Final validation follows both verification tool plans, deployment, and the desktop bridge.
Readiness describes decision completeness; dependencies determine when work can begin.

## Shared Constraints

- The original review used PR #652 head `471b33cd83e61d08a479ff356e851dddf8020c30` and merge `e4c10620d377185c9f24e0087e2161cf8e8f6a25`.
  The 2026-09-18 update uses PR #705 head `dffe34cc66085c042343cc5c7aaa75547aeb925f`.
  These documents were edited on master commit `e8b7d77688302ea8de9c15bc97f1af8cbb638326`.
  Recheck the implementation baseline when each prerequisite lands; do not treat an open PR as merged work.
- Plan 01 owns credential binding, pending grants, the dedicated authentication collection, and the conflicting original cache guidance.
  Plan 05 owns the existing origin collection and its focused credential notes.
  Plan 06 owns the complete startup instructions across the package and collection guides.
  Keep these as separate implementation PRs and preserve the stable key and synced issue for plan 01.
- Corrective plans govern their reviewed contracts when they differ from original guidance.
  Implementation PRs must update affected original sections so contradictory instructions do not remain.
- Never reuse a token based on client ID alone. Bind cache entries to the complete credential without retaining the raw secret in the cache.
  Keep secrets, Basic headers, bearer tokens, and upstream bodies out of logs, errors, and tool output.
- Preserve the API as the authority on permissions, organization ownership, validation, and credit accounting.
  The connector owns protocol adaptation and must not import business module internals.
- Keep the local Compose scope. Add no public ingress, hosted onboarding, identity provider, or OAuth authorization server.
  Desktop support uses a local process that can reach the published MCP port.
- Preserve API endpoints, billing semantics, and rate limits.
  Add no retries that can repeat billed operations or hide HTTP 429 and 503 responses.
- Add no migrations, backfills, production rollout, or production recovery work.
  Reuse fixtures owned by the current checkout and never commit their credentials.
- Apply root `AGENTS.md` to Bruno coverage for HTTP behavior, including this standalone connector.
  The original blanket exemption does not override the root policy; plan 01 removes that conflicting guidance.
- Follow root instructions for synced issue assignment, project status, conventional commits, and PR linkage when implementation starts.
  Authoring plans does not complete implementation, assign issues, change project states, commit files, or publish a PR.
- Report plan checks, local HTTP tests, live Keycloak evidence, and CI separately.
  Passing package tests did not detect the cache bypass or the failing origin collection at the reviewed head.

## Related Plans

- [Original MCP connector road map](../mcp-connector/README.md)
- [Original authentication bridge](../mcp-connector/02-bridge-oidc-client-credentials.md)
- [Origin validation](../mcp-transport-hardening/02-validate-request-origins.md)
- [Original shared API client](../mcp-connector/03-api-client-error-mapping-credit-balance.md)
- [Original deployment](../mcp-connector/06-deploy-mcp-server.md)
- [Original live validation and documentation](../mcp-connector/07-live-validation-and-docs.md)
