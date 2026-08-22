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

# Prose Validation

- After creating or materially editing English prose in Markdown documentation, run `corepack pnpm docs:lint -- <changed-files>`.
- Fix actionable grammar and spelling findings, then rerun Harper until it passes.
- Add legitimate project terminology to `.harper-dictionary.txt`; do not suppress genuine errors.
- Do not automatically rewrite code blocks, commands, identifiers, API field names, or quoted external text.
- In the final response, state the exact Harper command and result. If Harper could not run, explain why.
