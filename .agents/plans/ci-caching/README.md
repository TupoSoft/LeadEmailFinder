# Shared CI Caches

1. [Reuse dependency and image caches across validation jobs](01-share-validation-caches.md).
   This task has no prerequisite plans and corresponds to one pull request. It works with GitHub-hosted runners
   and the isolated Swarm runners without changing runner selection or deploying infrastructure.

Keep validation commands, required checks, and private job workspaces intact. Measure the effect in GitHub Actions
after publication; local configuration checks do not establish cache hits or reduced build times.
