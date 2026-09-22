# Shared CI Runners

1. [Route workflows to the shared runner pool](01-route-workflows.md) updates LeadEmailFinder jobs to use
   `tuposoft-ci`. Its build workflow depends on an optional `runner` input in the shared
   `TupoSoft/GitHubActions` workflow. [The upstream change](https://github.com/TupoSoft/GitHubActions/pull/18) is merged.

Keep runner capacity and cluster configuration in `TupoSoft/Kubernetes`. This feature changes job routing and
the development API startup grace period needed to validate jobs on the shared pool.
