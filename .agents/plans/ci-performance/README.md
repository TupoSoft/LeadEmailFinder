# CI Performance Road Map

Each implementation plan corresponds to exactly one pull request. This follow-up to the completed cache and
browser-split work targets slow cache transfers and repeated image builds and tool installation observed in run 35156566067.

## Order and Dependencies

| Plan | Repository | Prerequisite |
| --- | --- | --- |
| [01: Measure cache delivery](01-measure-cache-delivery.md) | LeadEmailFinder | None |
| [02: Narrow backend image inputs](02-narrow-backend-image-inputs.md) | LeadEmailFinder | None |
| [03: Reuse the browser web image](03-reuse-browser-web-image.md) | LeadEmailFinder | None |
| [04: Adopt the measured cache policy](04-adopt-measured-cache-policy.md) | LeadEmailFinder | `ci-performance/01`; exact policy is pending measurements |
| Prepare Chromium in the ARC runner image | Kubernetes | None; companion plan below |

The companion Kubernetes plan is `docs/plans/ci-performance/01-preinstall-chromium.md` in `TupoSoft/Kubernetes`.
Its road map is `docs/plans/ci-performance/README.md`. It owns one infrastructure PR and its image publication and
opt-in rollout procedure. LeadEmailFinder's plan synchronizer owns only local keys 01 through 04; an external
repository is not a synthetic dependency in that graph.

Plans 01, 02, 03, and the runner-image plan can start independently. Apply one performance change at a time during
measurement. Refresh plan 01 samples after changes to build inputs, image reuse, or runner images before adopting
plan 04. Plan 04 intentionally remains pending until the measured policy is explicit.

## Shared Constraints

- Preserve GitHub-hosted Ubuntu 24.04 runner selection, independent Docker daemons, required check names, frozen installs, test
  coverage, browser artifact prerequisites, reset ownership checks, and cleanup. Do not add runner capacity or
  test workers as part of these plans.
- Preserve the completed `ci-caching/01`, `browser-ci/02`, and `browser-ci/03` behavior. Existing issues #615,
  #604, and #605 are closed; these plans cover different remaining work. The earlier Swarm browser image does
  not establish that ARC uses that image.
- Benchmark complete image and browser paths, including queue, setup, transfers, export, and cold runner-image
  pulls. Report observations and unavailable measurements separately; no plan promises a total CI duration.
- Cache infrastructure not already available needs a separate infrastructure plan and PR. Do not share live
  Docker storage between jobs or grant pull-request code cache-publication credentials.
- Keep these changes outside application modules and customer-facing UI. No database migration or data reset is
  needed for planning. Execute future container checks only against disposable, isolated job resources.
- Creating these plans does not implement CI changes, publish issues or pull requests, run benchmarks, publish
  runner images, or deploy infrastructure. Record those results only when they have actually occurred.
