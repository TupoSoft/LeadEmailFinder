# Business Module Workflow

Applies to edits within this directory and imports from its modules. [README.md](README.md) is the architecture
contract; existing violations do not establish supported patterns.

## Before Coding

1. Read the architecture contract and affected module README.
2. Identify the behavior's owner, layer, public exports, and new dependency directions. Confirm that cross-module
   imports and capability dependencies are documented.
3. If the design cannot meet the contract, update or create the task's ExecPlan—an implementation plan recording
   design and validation—before changing the contract or code.

## While Coding

- Create only needed layers. Keep production files in the locations permitted by the contract.
- Keep application/domain code independent of frameworks. Define small ports (required capabilities) there;
  implement technical integrations as infrastructure adapters.
- Import another module only through its bare public barrel (`src/index.ts`, the module's supported exports).
  Change that barrel only for an intentional public-contract change.
- Preserve routes, DTOs (transport data shapes), authorization, storage, queues, settings, and provider behavior unless
  the task and plan explicitly change them.
- Update the module README when ownership, exclusions, exports, dependencies, runtime behavior, storage,
  configuration, or validation evidence changes. Add focused behavior and boundary tests.

## Before Finishing

```sh
corepack pnpm test -- <focused-test-files> --runInBand
corepack pnpm typecheck
```

Review the diff against the architecture contract and correct violations rather than accepting them as debt.
Report trade-offs and checks actually run, including validation limits.
