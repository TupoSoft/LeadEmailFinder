# MCP Connector Hardening Road Map

These four ExecPlans address the four findings from the review of [PR #652](https://github.com/TupoSoft/LeadEmailFinder/pull/652).
Each plan follows `.agents/PLANS.md` and delivers exactly one future implementation PR.
The original connector remains unimplemented at the review base; these documents do not claim that any runtime fix has shipped.

## Order and Dependencies

| Key | Implementation task | Review finding | Dependencies |
| --- | --- | --- | --- |
| `mcp-connector-hardening/04` | [Require capabilities before final validation](04-gate-validation-on-required-tools.md) | Final validation can start without its tools | None |
| `mcp-connector-hardening/01` | [Bind cached tokens to credentials](01-bind-token-cache-to-credentials.md) | A cached token bypasses the supplied secret | `mcp-connector/02`, `mcp-connector-hardening/04` |
| `mcp-connector-hardening/02` | [Preserve validation and permission errors](02-map-validation-and-permission-errors.md) | Expected API rejections become upstream errors | `mcp-connector/03`, `mcp-connector-hardening/04` |
| `mcp-connector-hardening/03` | [Connect Claude Desktop through a local bridge](03-connect-claude-desktop-through-local-bridge.md) | Direct remote setup cannot reach the local service | `mcp-connector/06`, `mcp-connector-hardening/01`, `mcp-connector-hardening/02` |

Implement plan 04 first. It records the required edges in the original road map and adds regression coverage for scheduling.
Then build the original scaffold and authentication gate, followed by hardening plan 01 before adding the credit tool.
Implement the original shared API client, then hardening plan 02 before either verification tool plan.
Deployment can follow the original shared client independently of the single and batch tools.
Hardening plan 03 follows deployment and both runtime corrections.
Final validation follows both verification tool plans, deployment, and the desktop bridge.

Readiness describes whether a plan contains enough decisions to implement.
Dependencies determine when that work can begin.
The original dependency sections remain unchanged until plan 04 is implemented; this documentation task does not claim they are already enforced.

## Shared Constraints

- The review head is `471b33cd83e61d08a479ff356e851dddf8020c30`.
  PR #652 merged as `e4c10620d377185c9f24e0087e2161cf8e8f6a25`, the base inspected for these plans.
  Paths under `apps/mcp-server` are proposed by the original plans and do not exist at this base.
- Corrective plans govern their specific reviewed contracts when they differ from the original guidance.
  Their implementation PRs must update the affected original sections so contradictory instructions do not remain.
  Keep each correction in its own PR.
- Never reuse a token based on client ID alone. Bind cache entries to the complete credential without retaining a raw secret in the cache.
  No secret, Basic header, bearer token, or unfiltered upstream body may appear in logs, errors, or tool output.
- Preserve the existing API as the authority on permissions, organization ownership, validation, and credit accounting.
  The connector owns protocol adaptation only; it must not import business module internals or duplicate their policies.
- Keep the local Compose scope. Do not add public ingress, hosted customer onboarding, a new identity provider, or an OAuth authorization server.
  Desktop support uses a local process that can reach the published MCP port.
- Keep the existing API endpoints, billing semantics, and rate limits intact.
  Do not add retries that can repeat billed operations or hide `429` and `503` responses.
- Add no migrations, backfills, production rollout, or production recovery work.
  Use existing disposable fixtures for future runtime validation and keep their credentials out of committed files.
- Apply root `AGENTS.md` to Bruno coverage based on the behavior being changed.
  The original road map contains a blanket exemption for the connector; it does not override the root HTTP test policy.
  Creating these documents needs no Bruno change. Individual implementation plans state their own coverage requirements.
- Follow root `AGENTS.md` for synced issue assignment, project status, conventional commits, and PR linkage when implementation starts.
  Authoring these plans does not assign issues, change project states, commit files, or publish a PR.
- Report plan checks, runtime tests, and CI evidence separately.
  A passing dependency parser does not prove that the connector exists or that a desktop client can connect.

## Related Plans

- [Original MCP connector road map](../mcp-connector/README.md)
- [Original authentication bridge](../mcp-connector/02-bridge-oidc-client-credentials.md)
- [Original shared API client](../mcp-connector/03-api-client-error-mapping-credit-balance.md)
- [Original deployment](../mcp-connector/06-deploy-mcp-server.md)
- [Original live validation and documentation](../mcp-connector/07-live-validation-and-docs.md)
