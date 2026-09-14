# Browser Stack Readiness

Each ExecPlan follows `.agents/PLANS.md` and delivers one pull request.

## Order and Dependencies

| Order | Plan | Dependency |
| --- | --- | --- |
| 1 | [Capture safe startup diagnostics](01-capture-startup-diagnostics.md) | None |
| 2 | [Bound Keycloak readiness waits](02-bound-keycloak-readiness.md) | None |

Implement diagnostics first when practical so subsequent failures retain useful evidence. Both changes
are independently reviewable; this order is a recommendation rather than a plan dependency. Regression
tests and CI verification belong to each implementation rather than separate implementation PRs.

## Shared Constraints

- Preserve authentication, HTTP behavior, fixture provisioning, ownership checks, privacy controls,
  and cleanup of the current runner's resources.
- Start implementation from current history in an isolated checkout. Before publishing changes that
  run Actions, use a base with `[self-hosted, swarm, ubuntu-22, docker-isolated]`. While PR #595 is unmerged,
  its current branch is an appropriate base. Its successful execution is not a prerequisite for corrective
  work. Do not duplicate the runner migration in these PRs.
- Preserve the browser suite inventory and required failure results. If `browser-ci/03` has split the job,
  apply these changes only to the worker that owns the disposable stack.
- Run reset and live checks only on a disposable Docker daemon isolated to the implementation checkout.
  Fixed `LEF` names and ports must never target the normal developer stack or another job's resources.
- Record the implementation head, tested merge commit, runner, job links, and terminal results. An old-commit
  rerun or local fixture pass does not establish CI recovery. After both changes are available, verify the
  complete selected browser run and required aggregate. Report skipped live and Bruno checks separately.
- The billing browser assertion that passed on retry remains a separate investigation. Existing
  `web-test-stability` plans address Vitest, and `browser-ci` owns browser scheduling and total runtime.
  These plans do not assume a runner resource shortage without measurements.
- Follow root `AGENTS.md` for synced issue assignment, Project 9 status, and PR linkage when implementation
  starts. Authoring these documents does not start implementation or change external project state.
