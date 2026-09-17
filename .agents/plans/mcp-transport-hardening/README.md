# MCP Transport Hardening Road Map

These ExecPlans address request handling findings from [PR #671](https://github.com/TupoSoft/LeadEmailFinder/pull/671)
and validation documentation findings from [PR #681](https://github.com/TupoSoft/LeadEmailFinder/pull/681).
Each plan maps to one implementation PR and follows `.agents/PLANS.md`.

## Order and Dependencies

| Key | Implementation task | Observable outcome | Dependencies |
| --- | --- | --- | --- |
| `mcp-transport-hardening/01` | [Reject malformed request targets](01-reject-malformed-request-targets.md) | A malformed target returns HTTP 400 and the process remains available | `mcp-connector/01` |
| `mcp-transport-hardening/02` | [Validate MCP request origins](02-validate-request-origins.md) | An untrusted origin receives HTTP 403 before MCP dispatch | `mcp-connector/01` |
| `mcp-transport-hardening/03` | [Cover malformed targets with Bruno](03-cover-malformed-targets-with-bruno.md) | Bruno verifies the malformed target response and later health, with accurate coverage documentation | `mcp-transport-hardening/01` |
| `mcp-transport-hardening/04` | [Document the Bruno server build](04-document-bruno-server-build.md) | A developer can build and start the MCP server from the collection README on a fresh checkout | `mcp-transport-hardening/01` |

Plan 01 fixes the process crash and was delivered by PR #681.
Plan 02 depends only on the scaffold.
Plans 03 and 04 depend on plan 01 and can proceed independently after it.
They share the collection README, so preserve both changes when rebasing.
Neither requires plan 02, business tools, or container deployment.
Readiness describes whether a plan contains enough decisions; dependencies determine when implementation can begin.

## Shared Constraints

- Plans 01 and 02 originated from PR #671 at `59d3bf3f85d69c12f7825bb998c7392ee54a97d9`.
  Their original planning base was master commit `2e9701e1c3e76e7e0fefc214175fc643d22418ca`.
- Plans 03 and 04 use review evidence from PR #681 at `56ca699d6ec8784bcbc793b286dae66a0576ebf4`.
  That PR merged on 2026-09-17 as `2921d88c10f1139adad4017dfe5ffbc3d315be56`.
  Begin their implementation from a current base containing that merge and its completed prerequisite plan.
- Each plan owns one independently useful correction and its focused validation.
  Plans 01 and 02 change transport behavior, plan 03 adds coverage and corrects its explanation, and plan 04 documents build setup.
  Do not mark implementation progress complete merely because these documents exist.
- Preserve the separation between HTTP routing in `apps/mcp-server/src/main.ts` and tool registration in `create-server.ts`.
  Preserve stateless request isolation, cleanup, the existing tool result, and any authentication added before implementation.
- Apply the root Bruno policy to HTTP behavior, including this standalone process.
  The original connector road map has a blanket exemption that does not override that policy.
  Reuse the existing collection for plan 03 and record actual execution results for every applicable plan.
- Keep the crash probe in an isolated child process with bounded waits and explicit cleanup.
  Use no production credentials, billed operation, or public deployment to validate these corrections.
  Existing disposable authentication fixtures remain appropriate if the authentication bridge lands first.
- Follow root `AGENTS.md` for issue assignment, project status, conventional commits, and PR linkage when implementation starts.
  Creating these plans does not start implementation, close implementation issues, or change external project state.

## Related Plans

- [Original connector road map](../mcp-connector/README.md)
- [Scaffold prerequisite](../mcp-connector/01-scaffold-mcp-server-workspace.md)
- [Earlier connector corrections](../mcp-connector-hardening/README.md)
