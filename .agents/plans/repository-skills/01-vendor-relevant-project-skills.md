# Make Project Skills Available from the Checkout

This living document follows `.agents/PLANS.md` and describes one pull request.

## Purpose / Big Picture

A developer or coding agent can read the relevant project skills from `.agents/skills/` after cloning this
repository. Their references and helpers resolve without the author's global plugin cache. Root `AGENTS.md`
points to these copies and makes maintenance of the existing design contracts explicit.

## Progress

- [x] (2026-09-06) Inspected the installed skills, repository stack, frontend road map, and payment integration.
- [x] (2026-09-06) Selected eleven skills and staged their complete resources with project scope guidance.
- [x] (2026-09-06) Installed eleven skills with 177 files and recorded source versions, licenses, and adaptations.
- [x] (2026-09-06) Verified all eleven skill manifests, local references, helper behavior, and Markdown prose.

## Plan dependencies

None.

## Surprises & Discoveries

- The root agent instructions did not explicitly require reading or maintaining `DESIGN.md`.
- Several globally installed skills assume `Next.js`, Supabase authentication, or subscriptions. The application
  uses React, Vite, NestJS, TypeORM, Keycloak, and one-time credit purchases instead.
- The installed premium design package refers to maintenance files that it does not include. Its existing
  companion resolver already supports skills stored in sibling repository directories.
- The worktree initially had no dependencies. Installation succeeded using a writable package store after the
  default store refused a project-registration write.
- The initial issue search found no `repository-skills/01` identity. PR preparation created issue #542 with the
  canonical marker and rendered body, assigned it to the requesting user, and moved only its Project 9 item to
  In Progress. The broader synchronizer was not run.

## Decision Log

- Decision: Copy complete relevant skill directories instead of creating links to a global installation.
  Rationale: Another checkout must retain the instructions, references, assets, and helpers. Date: 2026-09-06.
- Decision: Include seven frontend, image, and database skills plus four Paddle skills. Preserve the existing
  conventional commit skill. Rationale: These cover the current stack and planned work without introducing
  unrelated billing or frontend frameworks. Date: 2026-09-06.
- Decision: Keep repository scope guidance close to each skill's entry point and identify local adaptations.
  Rationale: Generic source recipes must remain subordinate to the actual application contracts. Date: 2026-09-06.
- Decision: Retain the existing repository UI audit as the authoritative project check.
  Rationale: Copying the premium skill must not introduce a second audit owner. Date: 2026-09-06.

## Outcomes & Retrospective

Eleven repository skills are installed alongside the unchanged conventional commit skill. Root `AGENTS.md` now
routes relevant work to the local adaptations and requires design contract maintenance for shared changes. The
catalog and source record explain the selected workflows, excluded features, source snapshots, and host capability
limits. The copies retain their supporting resources and existing application architecture.

Validation passed for all eleven skill manifests, the companion resolver, and the image helper dry run. Harper
passed all 155 Markdown files. The design linter reported zero errors and warnings; the strict UI audit reported
zero findings. Independent review identified and corrected two malformed companion links and a quoted CSS token.
No business code or HTTP behavior changed, so Bruno is not applicable. No SOLID trade-off was introduced.

## Context and Orientation

Before this change, the checkout contained only `.agents/skills/conventional-commit/SKILL.md`. Global plugin skills supplied
frontend design and validation guidance, including the rules for reading and updating `DESIGN.md`. The target
catalog is `.agents/skills/README.md`; source metadata is `.agents/skills/sources.json`. Each imported directory
contains its own discoverable `SKILL.md` and the supporting files used by its workflow.

## Scope and Non-Goals

Include `frontend-design`, `frontend-design-premium`, `frontend-app-builder`, `frontend-testing-debugging`,
`react-best-practices`, `imagegen`, `supabase-postgres-best-practices`, `paddle-catalog-setup`,
`paddle-checkout-web`, `paddle-webhooks`, and `paddle-sandbox-testing`.

The change does not introduce `shadcn`, Stripe, Supabase hosting, subscription billing, sites hosting, desktop
control, or general account-management skills. It does not install connectors, credentials, or browser tools.
It changes no business module, application dependency, HTTP contract, database schema, or generated image.

## Plan of Work

Inspect the complete installed sources and preserve their required resources and supplied licenses. Add short
scope instructions for the current stack, retaining useful upstream examples with explicit applicability limits.
Repair references that assume the global cache or refer to files absent from the installed source. Copy the staged
files into `.agents/skills/`, then write the catalog and provenance record. Add root agent guidance for skill
selection and design contract maintenance. Validate the copied metadata and resources, exercise helpers without
external mutations, and lint the changed Markdown. Finish by reviewing the diff for scope and architecture.

## Interfaces and Dependencies

The new interface is repository-discoverable skill metadata. Optional tools remain supplied by the agent's host.
The browser workflow uses the existing Playwright commands when appropriate. Image generation retains its tool
mode and explicitly authorized CLI fallback. Paddle guidance uses the existing payment port, infrastructure
adapter, development fixture, and Bruno workflow. No new runtime dependency is required.

## Acceptance Criteria

- All eleven selected skills exist under `.agents/skills/` with valid names and descriptions.
- The existing conventional commit skill remains unchanged.
- Required local references and companion skills resolve inside the checkout; no imported file is a link to a
  global plugin cache.
- The catalog records inclusion boundaries and source versions, and supplied license notices are preserved.
- Root agent instructions direct frontend work to the design contracts and their existing validation commands.
- Focused validation reports actual outcomes, including any tool capabilities that copying files cannot supply.

## Validation

Run the Skill Creator metadata validator against each copied skill. Check local Markdown references and agent
asset paths for missing resources. Run the premium companion resolver and the image generation helper in dry-run
mode, without provider calls. Run `corepack pnpm docs:lint -- AGENTS.md .agents/plans/repository-skills .agents/skills`
and review the findings without automatically rewriting code examples or quoted external material. Run
`corepack pnpm design:lint`, `corepack pnpm ui:audit`, and `git diff --check` to verify the existing contracts and
patch formatting. Bruno is not applicable because only agent guidance and supporting resources change.

## Idempotence and Recovery

Copying must fail if a target skill already exists; do not replace user changes. Review future source updates as
ordinary diffs and retain repository adaptations. To reverse this change, remove only the eleven new skill
directories, catalog, source record, and plan, and revert the new root agent section. Keep the existing skill.
No data reset, reseed, external provider action, or runtime rollback is involved.

## Artifacts and Notes

Source packages are Build Web Apps 0.1.2, Frontend Design Premium 1.4.0, Paddle 0.1.0, and the installed image generation
system skill snapshot. Source records identify local changes and retained licensing information. The installed Build Web Apps package
declares MIT but supplies no complete license notice; that limitation is recorded without inventing a copyright
holder. The PostgreSQL and Paddle copies also include the available upstream license texts.

The full Markdown check was `corepack pnpm docs:lint -- AGENTS.md .agents/plans/repository-skills .agents/skills`.
The image helper was exercised with `python3 .agents/skills/imagegen/scripts/image_gen.py generate --prompt
'Repository skill validation' --out /tmp/lef-imagegen-validation.png --dry-run`; it made no API request. The
companion check was `python3 .agents/skills/frontend-design-premium/scripts/resolve_frontend_design.py --print-path`.
The supplied Skill Creator validator checked each name listed in `.agents/skills/sources.json`.

`git diff --check` passed for tracked edits. A separate full comparison of the imported directory reported
inherited trailing whitespace in upstream examples. Those examples retain their source formatting; the finding
does not indicate an application or skill metadata failure.

## Plan readiness

Ready to implement
