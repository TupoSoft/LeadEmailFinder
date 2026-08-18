# ExecPlan tracking roadmap

This roadmap makes the ExecPlans under `.agents/plans/` visible on the `TupoSoft/LeadEmailFinder` GitHub project (project number 9) without anyone copying work items by hand. Plan files stay authoritative; the project board is a generated mirror.

1. [Sync ExecPlans to the GitHub project](01-sync-execplans-to-github-project.md)
2. [Distinguish actionable ExecPlans from dependency backlog](02-actionable-project-backlog.md)

Shared decisions:

- The sync is one-way, from plan files to GitHub. Nothing written on the board flows back into a plan file, because `.agents/PLANS.md` requires the file to remain sufficient on its own.
- One ExecPlan maps to exactly one issue, matching the existing rule that one ExecPlan is exactly one pull request.
- Issues are matched by a hidden marker keyed to `<feature>/<NN>`, not by title or filename, so retitling or renaming a plan updates its issue instead of orphaning it.
- Generated issue bodies are overwritten on every run. Discussion belongs in issue comments.
- The board's `Priority`, `Size`, `Iteration`, and assignee fields are never written by the sync; those are human judgments.

## Setup

The workflow needs a `PROJECT_SYNC_TOKEN` repository secret. The default `GITHUB_TOKEN` cannot write organization-level Projects v2, so this must be a classic personal access token with the `project` scope, a fine-grained token with organization project write, or a GitHub App token.

Run it by hand with `pnpm plans:sync`, using the local `gh` login. `PLANS_DRY_RUN=true pnpm plans:sync` reports what would change without writing anything. `PLANS_PROJECT_OWNER`, `PLANS_PROJECT_NUMBER`, `PLANS_BRANCH`, and `PLANS_DIR` override the defaults, which target `TupoSoft` project 9 on `master`.
