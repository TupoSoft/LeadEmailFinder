# MCP Transport Hardening Road Map

These two ExecPlans address the request handling findings from [PR #671](https://github.com/TupoSoft/LeadEmailFinder/pull/671).
Each plan delivers one future implementation PR and follows `.agents/PLANS.md`.

## Order and Dependencies

| Key | Implementation task | Observable outcome | Dependencies |
| --- | --- | --- | --- |
| `mcp-transport-hardening/01` | [Reject malformed request targets](01-reject-malformed-request-targets.md) | A malformed target returns HTTP 400 and the process remains available | `mcp-connector/01` |
| `mcp-transport-hardening/02` | [Validate MCP request origins](02-validate-request-origins.md) | An untrusted origin receives HTTP 403 before MCP dispatch | `mcp-connector/01` |

Implement plan 01 first because it fixes a reproduced process crash.
Both plans depend only on the scaffold and can otherwise proceed independently.
Neither plan requires authentication, business tools, or container deployment.
Readiness describes whether a plan contains enough decisions; dependencies determine when implementation can begin.

## Shared Constraints

- Review evidence comes from PR #671 at `59d3bf3f85d69c12f7825bb998c7392ee54a97d9`.
  The PR remains open as of 2026-09-17.
  These documents use master commit `2e9701e1c3e76e7e0fefc214175fc643d22418ca` as their planning base.
  The runtime files exist in the reviewed PR snapshot, not in that base.
- Each plan owns one transport correction, its automated regression checks, and its HTTP coverage.
  Do not mark implementation progress complete merely because these documents exist.
- Preserve the separation between HTTP routing in `apps/mcp-server/src/main.ts` and tool registration in `create-server.ts`.
  Preserve stateless request isolation, cleanup, the existing tool result, and any authentication added before implementation.
- Apply the root Bruno policy to HTTP behavior, including this standalone process.
  The original connector road map has a blanket exemption that does not override that policy.
  Each implementation must document its collection and actual execution result.
- Keep the crash probe in an isolated child process with bounded waits and explicit cleanup.
  Use no production credentials or data, billed operation, or public deployment to validate these transport corrections.
  Existing disposable authentication fixtures remain appropriate if the authentication bridge lands first.
- Follow root `AGENTS.md` for issue assignment, project status, conventional commits, and PR linkage when implementation starts.
  Creating these plans does not start implementation, close implementation issues, or change external project state.

## Related Plans

- [Original connector road map](../mcp-connector/README.md)
- [Scaffold prerequisite](../mcp-connector/01-scaffold-mcp-server-workspace.md)
- [Earlier connector corrections](../mcp-connector-hardening/README.md)
