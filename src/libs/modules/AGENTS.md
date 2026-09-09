# Business Module Workflow

These instructions apply whenever a task edits a business module in this directory or imports one from elsewhere.
`src/libs/modules/README.md` is the canonical architecture contract; do not infer supported structure from an
existing violation.

## Before Coding

1. Read `src/libs/modules/README.md` and the affected module's `README.md`.
2. Identify the business module that owns the behavior, the target layer, the intended public surface, and every
   dependency direction the change introduces.
3. Confirm whether an export is an intentional public contract and whether each cross-module dependency is documented.
4. If the requested design cannot fit the canonical contract, stop and create or update the task's ExecPlan before
   changing the contract or implementation.

## While Coding

- Create only the layers the module needs, and keep every production file in a location permitted by the canonical
  guide.
- Keep application and domain code framework-independent. Define small injected ports there and implement technical
  integrations in infrastructure adapters.
- Import another business module only through its bare public barrel. Change a module barrel only when deliberately
  changing its supported public contract.
- Preserve routes, DTOs, authorization, persistence, queues, configuration, and provider behavior unless the task's
  scope and ExecPlan explicitly change them.
- Update the affected module README when ownership, non-responsibilities, public API, dependencies, runtime surfaces,
  persistence, configuration, or validation evidence changes.
- Add or update focused tests for changed behavior and boundary contracts.

## Before Finishing

Run the architecture gate, focused tests, and type checking:

    corepack pnpm architecture:check
    corepack pnpm test -- <focused-test-files> --runInBand
    corepack pnpm typecheck

`architecture:check` scans the complete repository and must exit zero: it accepts no violation. If a change cannot
satisfy the canonical contract, update or create an ExecPlan to correct the design instead of treating a violation
as acceptable debt.

Review the final diff against the canonical guide and report any material architectural trade-offs and validation
limits.
