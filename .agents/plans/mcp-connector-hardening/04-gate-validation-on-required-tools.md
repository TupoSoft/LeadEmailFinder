# Require Every Tool Before Final MCP Validation

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The final MCP validation task must remain blocked until its tools, deployment, and supported desktop connection exist.
This plan delivers one PR that corrects the recorded dependencies and guards them with a repository fixture test.
A developer observes success when the synchronizer keeps final validation in `Backlog` while either tool plan remains incomplete.

## Progress

- [ ] (2026-09-16) Correct the original dependency sections and road map.
- [ ] (2026-09-16) Add focused scheduling regression coverage and record validation results.

## Plan dependencies

None.

## Surprises & Discoveries

The review of PR #652 found a valid but incomplete dependency graph.
At commit `e4c10620d377185c9f24e0087e2161cf8e8f6a25`, completing original plans 01, 02, 03, and 06 makes plan 07 eligible.
Original plans 04 and 05 can remain untouched in that scenario.
The existing repository fixture proves that keys resolve and the graph has no cycles; it does not verify these missing prerequisites.

## Decision Log

- Decision: Correct scheduling before any connector implementation starts. Author: Codex, 2026-09-16.
  This change needs no MCP runtime and makes the remaining work order explicit.
- Decision: Keep deployment independent of the single and batch tool plans. Author: Codex, 2026-09-16.
  A service exposing only credit balance remains a valid intermediate deployment.
  Final validation, however, explicitly requires both tool plans.
- Decision: Schedule the security and compatibility corrections before their consumers. Author: Codex, 2026-09-16.
  The original scaffold may expose only `ping` before credential binding is corrected.
  No real customer tool may precede that correction.

## Outcomes & Retrospective

Not started. Creating this plan has not changed the original dependency sections or their effective scheduling.

## Context and Orientation

The original road map lives in `.agents/plans/mcp-connector/README.md`.
Its final plan is `.agents/plans/mcp-connector/07-live-validation-and-docs.md`.
That plan requires `verify_email` and a complete batch submit, status, and download sequence.
Those tools belong to original plans 04 and 05.
Plan 07 currently depends only on plan 06, and plan 06 depends only on plan 03.

`scripts/plans/execplan.ts` exports `discoverExecPlans` and `resolvePlanStates`.
The former reads checked-in documents; the latter maps their progress, readiness, and direct dependencies to project states.
`scripts/plans/execplan-repository-fixture.spec.ts` already loads the complete repository graph.
`scripts/plans/execplan.spec.ts` covers the generic scheduling rules.
Preserve those rules, including the decision to retain `In Progress` for work that has already started.

The sibling corrective plans add credential binding, complete error mapping, and a local desktop bridge.
Their future runtime files do not exist at the review base.
This plan changes metadata and tests only.

## Scope and Non-Goals

Proposed PR title: `fix(plans): require MCP capabilities before final validation`.

Change the dependency sections in original plans 01, 03, 04, 05, and 07.
Update their dependency explanations and the original road map to match.
Extend `scripts/plans/execplan-repository-fixture.spec.ts` with a focused regression case.
Keep the new hardening road map consistent if wording changes are needed during implementation.

Do not build the connector, alter the synchronizer, change readiness to compensate for missing edges, or mark unfinished work complete.
Do not change CI runners, credentials, application APIs, or database state.
Root `AGENTS.md` governs the normal issue assignment and status update when implementation begins.
Do not manually rewrite unrelated project items.

## Plan of Work

First, update the original documents to use the following exact direct dependencies.
Existing dependencies not listed as changing remain intact.

| Original plan | Required direct dependencies after this PR |
| --- | --- |
| `mcp-connector/01` | `mcp-connector-hardening/04` |
| `mcp-connector/03` | `mcp-connector/02`, `mcp-connector-hardening/01` |
| `mcp-connector/04` | `mcp-connector/03`, `mcp-connector-hardening/02` |
| `mcp-connector/05` | `mcp-connector/03`, `mcp-connector-hardening/02` |
| `mcp-connector/07` | `mcp-connector/04`, `mcp-connector/05`, `mcp-connector/06`, `mcp-connector-hardening/03` |

The full filenames for these documents appear in the original road map.
Use one dependency bullet per stable key, as required by `.agents/PLANS.md`.
Keep plan 06 dependent on plan 03; do not make deployment depend on final validation or the desktop bridge.
Replace the incorrect claim that plan 06 transitively supplies plans 04 and 05 in the interfaces section of plan 07.
Update the order table and prose in the original road map to explain the corrected sequence.
Link that road map to `.agents/plans/mcp-connector-hardening/README.md`.

Next, extend the real repository fixture test.
Load documents through `discoverExecPlans`; do not duplicate the intended dependency arrays in synthetic replacement plans.
Clone plan objects, including nested progress objects, before changing completion counts in memory.
Limit changes to that local test fixture and never write simulated progress back to Markdown.

Assert the required direct edges above and resolve the complete graph to detect cycles.
For final validation scenarios, leave plan 07 ready with no completed progress items.
Mark every other prerequisite complete in memory, then independently leave original plan 04 or 05 incomplete.
Each case must keep plan 07 in `Backlog` and identify the missing tool plan.
Repeat for the deployment and desktop bridge prerequisites.
When all prerequisites are complete, plan 07 must become `Todo`.

Also reproduce the original failure: complete only original plans 01, 02, 03, and 06 among the original seven plans.
Mark the corrective prerequisites complete so they cannot mask a missing tool dependency.
With original plans 04 and 05 incomplete, final validation must remain in `Backlog`.
Retain the existing generic tests for missing keys, dependency cycles, and started work.

## Interfaces and Dependencies

This PR changes stable dependency metadata only.
It introduces no application interfaces or external packages.
The dependency keys in the four corrective plans must already exist in the repository when this PR is prepared.
They are supplied together by the documentation task that creates this plan.

The original scaffold depends on this correction after the edit.
This correction has no implementation prerequisite, so that edge does not create a cycle.
Each other corrective plan retains the prerequisites recorded in its own dependency section.

## Acceptance Criteria

- Every direct dependency in the table is present, and the complete repository graph resolves without missing keys or cycles.
- Final validation remains in `Backlog` when either tool plan, deployment, or the desktop bridge remains incomplete.
- Final validation becomes `Todo` once all its direct prerequisites are complete and none of its progress items are complete.
- Completing only original plans 01, 02, 03, and 06 cannot make final validation eligible.
- The original credit tool requires corrected credential binding; both verification tool plans require corrected error mapping.
- Existing generic scheduling tests pass without changes to scheduler behavior.
- Simulated progress exists only in test memory. No unrelated document or project item is marked complete.
- Harper passes for every Markdown file changed by the implementation PR.

## Validation

Run from the repository root after applying the metadata correction:

```sh
corepack pnpm exec jest --runInBand scripts/plans/execplan-repository-fixture.spec.ts scripts/plans/execplan.spec.ts
corepack pnpm exec eslint scripts/plans/execplan-repository-fixture.spec.ts
corepack pnpm typecheck
corepack pnpm docs:lint -- .agents/plans/mcp-connector .agents/plans/mcp-connector-hardening
git diff --check
```

The Jest commands exercise metadata and the scheduling algorithm without writing to GitHub.
Do not run a live synchronization merely to prove this change.
The original Markdown contains existing Harper diagnostics; correct findings in documents materially edited by this PR.
If the directory-wide command reports untouched files, also run Harper on the exact changed Markdown paths and report both results.

Bruno: not applicable because this implementation changes planning metadata and regression tests, with no HTTP behavior change.
No MCP service or database is required for these checks.

## Idempotence and Recovery

The dependency edits are deterministic and safe to repeat.
Keep one copy of each dependency key; duplicate bullets fail parsing.
Rerunning the tests restores no external state because all completion changes stay in memory.
If an edge is wrong, correct that edge and rerun the fixture before syncing plans.
Do not remove a required prerequisite solely to make a project item eligible.

## Artifacts and Notes

Review basis: [PR #652](https://github.com/TupoSoft/LeadEmailFinder/pull/652), head `471b33cd83e61d08a479ff356e851dddf8020c30`.
The merged base for these corrective plans is `e4c10620d377185c9f24e0087e2161cf8e8f6a25`.
All seven original connector plans remain incomplete at that base.
Record the focused test results here when this plan is implemented; planning alone does not satisfy its acceptance criteria.

## Plan readiness

Ready to implement
