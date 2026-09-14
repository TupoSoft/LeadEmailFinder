# Local Validation Hooks

1. [Run validation before pushing](01-run-validation-before-push.md).
   This task has no prerequisite plans and corresponds to one pull request.

Reuse the existing path selection and validation commands while the self-hosted runners are being repaired.
Run destructive development fixtures inside a disposable Docker daemon. Preserve the existing commit hook,
manual container publishing, and automatic ExecPlan synchronization. Restore hosted validation triggers after
runner recovery; local validation does not supply a GitHub check result or change branch protection.
