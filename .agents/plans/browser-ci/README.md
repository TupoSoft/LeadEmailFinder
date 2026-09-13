# Browser CI Runtime Road Map

Each implementation plan delivers exactly one pull request. These plans address the browser job timeout seen
in [run 34754038140](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34754038140/job/103715423385).
Creating the plans does not implement workflow changes or deploy runner infrastructure.

## Order and Dependencies

| Order | Plan | Repository | Dependency |
| --- | --- | --- | --- |
| 1 | [Measure the complete browser job](01-measure-complete-browser-job.md) | LeadEmailFinder | None |
| 2 | [Reuse one web build](02-reuse-web-build.md) | LeadEmailFinder | `browser-ci/01` |
| 3 | [Separate browser validation](03-separate-browser-validation.md) | LeadEmailFinder | `browser-ci/01`, `browser-ci/02` |
| Parallel | [Prepare Chromium in the runner image](https://github.com/TupoSoft/Swarm/pull/76) | Swarm | None |

The Swarm link points to the companion documentation PR. Its plan lives at
`docs/plans/browser-ci/01-preinstall-chromium.md` in `TupoSoft/Swarm` and produces a separate infrastructure PR.
The LeadEmailFinder synchronizer owns only the three local plan keys; the external plan is not a synthetic
dependency in that graph. The image change retains the existing browser installation command and can be
prepared independently. Record its deployed image digest when comparing runtimes.

The split runs artifact guards first, followed by independent UI and live-stack workers. The `browser` aggregate
requires all three groups to succeed, and the outer `Validate / validate` identity remains stable.

## Shared Constraints

- Start implementation from current PR #595 or its merged successor. The planning checkout is older and contains
  unrelated changes; preserve current proxy coverage and existing user work.
- [PR #597](https://github.com/TupoSoft/LeadEmailFinder/pull/597) already owns shared pnpm and Docker caches.
  Reuse any merged integration and keep new cache work outside these plans.
- Preserve artifact suppression, test coverage, frozen installs, runner labels, private Docker daemons, and
  explicit successful no-op jobs. Failed, canceled, missing, and skipped validation cannot count as a pass.
- Keep live reset, bootstrap, serial stateful checks, and cleanup on the same isolated worker. Use disposable
  data and retain the existing Bruno collections; no API, schema, or UI behavior changes are planned.
- Ninety minutes is the temporary serial-job ceiling. The split derives final worker budgets from measurements;
  no plan assumes a 35-minute completion time or attributes the slowdown to an unmeasured hardware cause.
- Preserve the two current runner slots. Extra jobs may queue or increase total setup work; report job execution,
  queue delay, and total workflow duration separately.
- Report local contract checks separately from real browser, container, deployment, and Actions evidence.
