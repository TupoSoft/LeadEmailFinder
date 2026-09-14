# Web Test Stability Road Map

Each ExecPlan follows `.agents/PLANS.md` and delivers exactly one pull request. These plans address the
asynchronous UI assertion failures in the Vitest `web` job of
[run 34754038140](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423416).

## Order and Dependencies

| Order | Plan | Dependency |
| --- | --- | --- |
| 1 | [Limit CI test concurrency](01-limit-ci-test-workers.md) | None |
| 2 | [Allow bounded DOM waits](02-allow-bounded-dom-waits.md) | None |

Apply the worker cap first when possible, then measure the wait-budget change with the same concurrency.
Both changes are independently reviewable and can be validated independently; the recommended order is
for interpreting results, not a prerequisite in the plan dependency graph.

## Shared Constraints

- Start local implementation from current master in an isolated checkout. Preserve newer tests, runner labels,
  cache integration, and unrelated working changes. The original planning checkout predates the failed CI snapshot.
- Local implementation and validation do not depend on PR #595. Before publishing a revision that runs Actions,
  require every direct job to use `self-hosted`, `swarm`, `ubuntu-22`, and `docker-isolated`. While #595 remains
  unmerged, base that implementation PR on its current branch or defer publication that would trigger CI.
- Keep the `web` job and the required `Validate / validate` result intact. The existing
  [browser CI road map](https://github.com/TupoSoft/LeadEmailFinder/blob/master/.agents/plans/browser-ci/README.md) owns Playwright job runtime, build reuse, and job separation.
- Limit these changes to Vitest scheduling, its shared DOM assertion budget, and focused regression coverage.
  Preserve application behavior, authorization assertions, secret-safe errors, test discovery, and failure propagation.
- Preserve the current overall Vitest test timeout. Do not introduce retries, fixed sleeps in assertions,
  infrastructure changes, database resets, API changes, or new dependencies.
- Record the tested commit, suite count, worker setting, runner identity, and terminal result for each comparison.
  A local pass is not proof of CI recovery, and rerunning an old commit does not validate a new implementation.
- Follow root `AGENTS.md` for issue assignment, Project 9 status, and PR linkage when implementation begins.
  Authoring these plans does not start implementation or update external project state.
