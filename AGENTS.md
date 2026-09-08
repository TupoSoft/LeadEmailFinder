# Product Context

- Before making product decisions, proposing features, or writing customer-facing copy, read the [ideal customer profile](docs/product/ideal-customer-profile.md).
- Use its working customer hypothesis while distinguishing repository evidence from market assumptions that still need validation. The current task, ExecPlan, and repository contracts still govern scope.

# Architecture Rules

- Generate SOLID-oriented code, while favoring simple, testable designs over pattern-heavy abstractions.
- Each service or class owns one business responsibility.
- Controllers orchestrate requests only; application services own business rules.
- Depend on injected interfaces or tokens, never concrete infrastructure clients.
- Keep persistence, HTTP/SMTP, Redis, and provider-specific code behind small adapters.
- Prefer small, purpose-specific interfaces; do not create generic manager services.
- Repositories must not call SMTP or HTTP clients.
- Keep proxy allocation separate from email verification; model provider fallbacks as strategies or adapters.
- Add or update focused tests for every changed behavior, including contract tests for alternate implementations where appropriate.
- Before finishing, review the diff for SOLID violations and report any material architectural trade-offs.

## Business Module Workflow

- Before editing a business module under `src/libs/modules/` or importing one from elsewhere, read `src/libs/modules/AGENTS.md`, the canonical `src/libs/modules/README.md`, and the affected module's `README.md`.
- Follow the scoped workflow and validate the result with the module architecture gate before finishing.

# Repository Skills

- Use the relevant repository skills listed in `.agents/skills/README.md`. Read their `SKILL.md` instructions and only the supporting references needed for the task. Prefer these project adaptations when the same skill is also installed globally.
- User instructions, the current ExecPlan, and repository contracts take precedence over generic examples in copied skills. Skills do not authorize additional features, provider changes, external actions, or new approval requirements.
- Before frontend work, read root `DESIGN.md` and `UX-CONTRACT.md`. Use the local `frontend-design` and `frontend-design-premium` skills; add the React and frontend testing skills when applicable. Reuse the approved design for routine changes.
- When an authorized change alters shared visual decisions, update `DESIGN.md`, the runtime styles, and `premium-ui.json` together. Update `UX-CONTRACT.md` when shared interface behavior changes. Use the repository's `design:lint` and `ui:audit` commands to check the contracts.
- Apply PostgreSQL and Paddle skills within the existing module and provider boundaries. The skill catalog describes which upstream framework examples apply to this repository.

# Bruno Test Policy

- For every implementation change, determine whether it changes externally observable HTTP API behavior.
- Add or update Bruno coverage when a change affects endpoints, request bodies, query parameters, response schemas, HTTP status codes, validation, authentication, authorization, stateful API workflows, integration wiring, or behavior already represented by a collection under `bruno/`.
- Do not add Bruno tests for internal refactors, documentation-only changes, or behavior adequately covered below the HTTP boundary.
- Extend the nearest existing collection under `bruno/`. Create a new collection only for a distinct workflow.
- Cover the changed success path and any materially changed rejection, authorization, or validation path.
- Keep tests repeatable: use environment variables, never commit secrets, and clean up created resources when practical.
- Run the relevant collection with `bru run --env local` when its dependencies are available.
- If runtime execution is unavailable, perform available static validation and clearly report that Bruno execution remains unverified.
- In the final response, always state either `Bruno: added/updated and <result>` or `Bruno: not applicable — <specific reason>`.

# ExecPlans

- For complex features and significant refactors, create and maintain an ExecPlan that follows `.agents/PLANS.md`.
- Store feature plans under `.agents/plans/<feature>/`.
- Each implementation task must have its own ExecPlan and correspond to exactly one pull request.
- Keep each ExecPlan current as implementation progresses, including its progress, discoveries, decisions, and outcomes.
- Express acceptance criteria as observable pass-or-fail behavior and state exact focused validation separately.
- While the project has no production environment, do not add database migrations. Use TypeORM synchronization against disposable development data and document reset and reseed steps for incompatible schema changes.
- When starting implementation on an ExecPlan, put its synced GitHub issue in progress instead of leaving this to the user. Find the issue by its `<!-- execplan: <feature>/<NN> -->` marker (`gh issue list --label execplan --search "<feature>/<NN> in:body"`) and assign it with `gh issue edit <number> --add-assignee @me`. Then move the project-9 board item's `Status` field (project id `PVT_kwDOBrt0As4At_e6`, field id `PVTSSF_lADOBrt0As4At_e6zgkqTaY`) to `In Progress` via `gh api graphql`; the automated `plans:sync` job deliberately never writes assignees or status itself. Look up the `In Progress` option id at run time rather than assuming it, since it is not recorded anywhere in the repo. If `gh auth status` lacks the `project`/`read:project` scope the Status write needs, tell the user to run `gh auth refresh -s project` and skip only the Status update — the assignee edit needs no extra scope.
- When opening the pull request for an ExecPlan, assign it to the requesting user (`gh pr create --assignee "@me"`, or `gh pr edit <number> --add-assignee @me` after the fact). Put its synced issue in the PR's Development section by including a closing keyword (`Closes #<issue-number>`) in the PR body, so the issue auto-closes on merge. The installed `gh` CLI (`gh --version`) may be old enough that `gh pr edit --body` itself fails with a `projectCards`/Projects-classic GraphQL error; `gh pr create` does not hit that code path, so set both flags on the initial `gh pr create` call rather than editing afterward. If a body edit is still needed later, use `gh api repos/<owner>/<repo>/pulls/<number> -X PATCH -f body="<text>"` instead.
- Give the pull request the same title as the conventional-commit subject line of its commit (e.g. `fix(plans): enforce truthful ExecPlan metadata`), not a plain restatement of the ExecPlan title. Match the actual `type(scope):` prefix used in the commit message, not a generic guess.

# Prose Validation

- After creating or materially editing English prose in Markdown documentation, run `corepack pnpm docs:lint -- <changed-files>`.
- Fix actionable grammar and spelling findings, then rerun Harper until it passes.
- Add legitimate project terminology to `.harper-dictionary.txt`; do not suppress genuine errors.
- Do not automatically rewrite code blocks, commands, identifiers, API field names, or quoted external text.
- In the final response, state the exact Harper command and result. If Harper could not run, explain why.
