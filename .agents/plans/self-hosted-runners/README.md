# Self-Hosted Runner Road Map

Each implementation plan follows `.agents/PLANS.md` and delivers exactly one pull request.

## Order and Dependencies

1. Deploy the separate Swarm runner change described in that repository's `docs/plans/self-hosted-ci.md`.
   It provides an ephemeral worker with a private Docker daemon and the `docker-isolated` capability label.
2. [Use Isolated Self-Hosted Runners](01-use-isolated-runners.md) changes this repository's direct workflow jobs,
   regression tests, and CI documentation. Its local checks can run before the Swarm deployment.

## Shared Constraints

- Publish and deploy the compatible Swarm runner infrastructure before enabling the new workflow targets.
- Keep the Swarm infrastructure change and LeadEmailFinder workflow change in separate pull requests.
- Preserve workflow triggers, permissions, validation commands, and the required `Validate / validate` check.
- Do not deploy infrastructure, change application behavior, or reset development data through these plans alone.
- Record local checks separately from live GitHub Actions and container isolation evidence.
