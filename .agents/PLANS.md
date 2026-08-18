# Codex Execution Plans

This document defines the required format for an execution plan, called an ExecPlan. An ExecPlan is a self-contained, living design document that an engineer or coding agent can follow to deliver one working pull request without relying on conversation history.

## How to use ExecPlans

Create one ExecPlan for every implementation task. Store it under `.agents/plans/<feature>/` and keep the feature `README.md` limited to task order, dependencies, shared constraints, and links.

When authoring a plan, inspect the current repository and resolve implementation decisions before declaring it ready. Name the affected modules and repository-relative paths. Explain how the current behavior works, the intended behavior, important invariants, and how success will be observed.

When implementing a plan, update it at every meaningful stopping point. Record unexpected findings in `Surprises & Discoveries`, decisions and their rationale in `Decision Log`, and the delivered result in `Outcomes & Retrospective`. The file must remain sufficient for another engineer to resume from it alone.

Each ExecPlan corresponds to exactly one pull request. Do not silently expand it to adjacent cleanup or a later roadmap task. If new work is independently useful, add a new ExecPlan and link it from the feature roadmap.

## Requirements

Every ExecPlan must:

- be self-contained and understandable to someone new to the repository;
- describe one observable outcome rather than a collection of unrelated edits;
- identify its goal, scope, non-goals, dependencies, and what it unlocks;
- name the narrowest known files, modules, contracts, and integration points;
- specify public interfaces and externally visible behavior when they change;
- cover relevant success, failure, authorization, concurrency, idempotency, and recovery behavior;
- contain observable, pass-or-fail acceptance criteria;
- state exact focused validation separately from acceptance criteria;
- preserve unrelated repository behavior and user changes;
- remain safe to repeat or provide an explicit recovery procedure;
- avoid claiming validation passed until the commands have actually completed successfully.

While this repository has no production environment, plans must not introduce TypeORM migrations, Keycloak data migrations, backfills, production rollout, high availability, or production recovery work. Incompatible development schema changes use `TYPEORM_SYNCHRONIZE=true` against disposable data and must provide an explicit reset and reseed path.

## Required structure

Every ExecPlan uses the following sections.

# <Short, behavior-focused title>

State that the file is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Explain what becomes possible after the change and how a developer can observe it working.

## Progress

Use timestamped checkboxes. This is the only section where checklists are required.

- [ ] Planned work.

## Plan dependencies

List prerequisite ExecPlans by their stable `<feature>/<NN>` keys, one bullet per dependency. Use `None.`
when the plan can start independently. This section is required for every new or edited incomplete plan;
completed legacy plans may omit it.

- `example/01`

## Surprises & Discoveries

Record unexpected facts and concise evidence. Use `None yet.` until implementation begins.

## Decision Log

Record each material decision, rationale, date, and author. Include decisions already fixed by the roadmap.

## Outcomes & Retrospective

At completion, compare the delivered behavior with the purpose and record remaining work. Use `Not started.` initially.

## Context and Orientation

Describe the relevant current flow, important files, and terminology without requiring the reader to open another plan.

## Scope and Non-Goals

State what this pull request changes and what it deliberately leaves for later plans.

## Plan of Work

Describe the ordered implementation in prose. Name repository-relative paths and existing mechanisms to reuse.

## Interfaces and Dependencies

Specify new or changed types, endpoints, configuration, libraries, services, and dependencies on earlier plans.

## Acceptance Criteria

List observable pass-or-fail outcomes. Cover successful behavior, relevant rejection behavior, compatibility, and required automated checks.

## Validation

State the exact commands and scenarios that prove the criteria. Distinguish unit, integration, container-runtime, and manual checks.

## Idempotence and Recovery

Explain how repeated execution behaves, how to retry partial work, and how to restore a clean development environment.

## Artifacts and Notes

Capture only concise evidence needed to resume or verify the work.

## Plan readiness

Before implementation begins, confirm that the plan is decision-complete, has no hidden product choice, maps to one pull request, and can be validated independently. End the plan with one of: `Ready to implement`, `Ready after <decision>`, or `Blocked by <evidence>`.

Dependency ordering belongs in `Plan dependencies`, not in this readiness sentence. `Ready to implement`
means the plan itself is decision-complete even when an incomplete prerequisite keeps it in the project backlog.
