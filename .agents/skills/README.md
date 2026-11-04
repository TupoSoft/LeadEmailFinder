# Repository Skills

These skills are stored in this repository so a coding agent can use the same project guidance after cloning it.
Read the relevant `SKILL.md` and only the supporting references needed for the current task. Root `AGENTS.md`
requires the project adaptations when the same skill is also installed globally. The copies are independent of
the global plugin cache; updates are reviewed changes, not automatic synchronization.

## Skill Catalog

| Skill | When It Applies | Repository Boundary |
| --- | --- | --- |
| [Frontend design](frontend-design/SKILL.md) | Visual design and interface changes | Preserve the approved palette, typography, and layout rules in root `DESIGN.md`. |
| [Frontend design premium](frontend-design-premium/SKILL.md) | Shared design contracts and resilient application behavior | Use with frontend design; keep root `UX-CONTRACT.md` and existing UI audit authoritative. |
| [React best practices](react-best-practices/SKILL.md) | React components, data fetching, rendering, and performance | Apply React and Vite guidance; framework examples do not introduce server rendering or replace planned TanStack Query. |
| [Frontend testing and debugging](frontend-testing-debugging/SKILL.md) | Rendered behavior, responsive checks, accessibility, and visual verification | Use available browser tools and the repository's Playwright workflows. |
| [Frontend app builder](frontend-app-builder/SKILL.md) | New visual concepts or an explicitly requested redesign | Routine changes reuse the approved system and do not restart design approval. |
| [Image generation](imagegen/SKILL.md) | Requested raster assets and new design concepts | Keep vector assets editable; image tools and authorized CLI access remain host capabilities. |
| [PostgreSQL best practices](supabase-postgres-best-practices/SKILL.md) | SQL, indexes, transactions, and database performance | Apply through TypeORM and existing module boundaries; Supabase services and database migrations are outside this guidance. |
| [Paddle catalog setup](paddle-catalog-setup/SKILL.md) | Maintaining the sandbox catalog for credit packs | Reuse the existing development fixture and one-time prices. |
| [Paddle checkout](paddle-checkout-web/SKILL.md) | Hosted checkout and the development checkout fixture | Browser product screens use the server's redirect URL; embedded checkout examples apply only to the development fixture. |
| [Paddle webhooks](paddle-webhooks/SKILL.md) | Payment signatures, event mapping, retries, and adjustments | Preserve the NestJS payment port, provider adapter, error contract, and durable credit accounting. |
| [Paddle sandbox testing](paddle-sandbox-testing/SKILL.md) | Verifying the existing sandbox integration | Reuse the payment fixture and Bruno collection; distinguish stub tests from live sandbox evidence. |
| [Conventional commit](conventional-commit/SKILL.md) | Preparing conventional commit messages | Existing repository skill, retained without changes. |

## Selection Boundaries

The current frontend uses React, Vite, CSS Modules, and project-owned CSS custom properties. The backend uses
NestJS, TypeORM, PostgreSQL, Keycloak, and Paddle for credit purchases. The copied skills support this stack and
its maintained frontend road map.

The installed skills for `shadcn`, Stripe, subscription billing, customer portals, direct provider billing history,
and browser price previews are omitted because those workflows are absent from or conflict with the maintained
plans. Hosted sites, desktop control, general research, account connectors, and skill or plugin administration are
host capabilities rather than application-specific workflows. The PostgreSQL skill is useful without adopting
Supabase services. The image generation skill is included as the companion for new visual concepts.

## How Agents Use the Copies

Codex discovers repository skills under `.agents/skills/`. The skill metadata identifies when to load the detailed
instructions. An agent can also read a listed file directly. Local and global copies can both appear in discovery;
the root agent instructions select the repository adaptation for project work. Other agents need support for this
skill format or an instruction to read the corresponding files.

For frontend changes, begin with root `DESIGN.md` and `UX-CONTRACT.md`. Change a shared contract only when the
requested work changes the corresponding system decision. Keep runtime styles and `premium-ui.json` consistent.
The existing commands `corepack pnpm design:lint` and `corepack pnpm ui:audit` remain the project validation gates;
the copied premium helper is an upstream reference and does not replace those commands.

User instructions, the current ExecPlan, and repository contracts govern scope. Upstream examples for other
frameworks or products apply only when the requested task and repository architecture support them. Upstream
contributor instructions describe maintenance of their source packages, not commands to run in this application.
Copying skills supplies no credentials, authenticated connectors, image service, or browser runtime.

## Sources and Maintenance

The [source record](sources.json) records package versions, source fingerprints, and local adaptations. Each copied
skill retains its supporting references, helpers, assets, and available license notices. Source files for generated
reference guides remain available beside the compiled guides. No original global installation is modified.

To update a skill, compare the recorded source snapshot with the new upstream version, retain the repository
scope guidance, and review resource changes together. Verify its name and description, relative references,
companion skills, and helper behavior. Do not replace project-owned audits, tokens, providers, or framework choices
with generic source examples. Record the new source version and adaptations, then proofread changed Markdown
for grammar, spelling, and clarity.

Run the helpers only for their documented purpose. Image generation dry runs make no provider request. Keep
optional Python packages and transient output outside committed source, and report missing host capabilities
separately from checks of the copied files.
