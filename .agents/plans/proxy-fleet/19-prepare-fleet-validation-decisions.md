# Prepare the Fleet Validation Decisions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the owner a reviewable design for a self-contained Kubernetes integration lab. One documentation pull request
maintains `deploy/proxy-fleet/validation-decisions.md`, with repository evidence, selected topology, networking
requirements, lifecycle procedures, and explicit limits. The selected lab uses k3d with one server and three agents:
two proxy workers and one application and fixture worker. The application, its dependencies, the reconciler,
Mailpit, and the peer probe run inside the cluster.

This replaces the previously selected Vagrant, Swarm, and controller-tunnel path for the integration lab. It does
not implement Kubernetes packaging or validate the existing Swarm deployment. Plan 16 and issue #424 still describe
Vagrant, WireGuard, and Swarm validation; implementation requires a revision of that plan or a separate Kubernetes
ExecPlan with its own pull request. This preparation remains documentation only.

## Progress

- [x] (2026-09-15) Trace the listener, registry, application, and SMTP fixture paths against the current repository.
- [x] (2026-09-15) Write and statically validate the original tunnel and fixture proposal.
- [x] (2026-09-15) Record the owner's Mailpit selection and validate that documentation revision.
- [x] (2026-09-18) Record and statically validate the earlier Swarm fixture model on the Vagrant VMs.
- [x] (2026-09-18) Replace the selected integration-lab architecture with self-contained Kubernetes on k3d, preserving
  proxy identities and source checks while identifying new deployment and network work.
- [x] (2026-09-18) Validate the Kubernetes documentation revision and update its evidence and handoff record.
- [x] (2026-09-18) Clarify preparation with an input table, four labeled steps, and readable validation errors.
- [x] (2026-09-19) Simplify validation notes and remove environment-specific command prefixes.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`
- `proxy-fleet/17`

## Surprises & Discoveries

- A k3d node is a Docker container. Multiple Kubernetes nodes do not automatically supply the three egress
  addresses required by this lab. Explicit address assignment and return routes inside the node network namespaces
  remain necessary, followed by observed source-address checks.
- The existing proxy renderer rejects any listener or egress address absent from its network namespace.
  `hostNetwork: true` allows the proposed proxy pods to use addresses assigned to their k3d node containers.
  Aliases and routes must be restored and checked when nodes restart or are recreated.
- A source allow list of `172.29.10.4/32` requires the real application and reconciler to originate proxy connections
  from that address. Merely scheduling them on the same Kubernetes node is insufficient; source selection and
  return routing need explicit configuration and live proof.
- The current reconciler command shells out to `ansible-inventory`. Its reconciliation logic and HTTP adapters can
  be reused, but a Kubernetes lab configuration adapter and a container entry point are still required.
- Mailpit `v1.30.7` is pinned in `docker/compose.smtp-dev.yaml`. Mailpit has no `/last-peer` contract or deterministic
  hold/release control, so the existing peer probe retains sequential source checks and capacity proof needs
  separate synchronization and Redis assertions.
- The real verifier stops after RCPT and QUIT without DATA, so the Mailpit inbox remains empty. Default acceptance
  produces a catch-all result rather than conclusive target evidence. Fresh control evidence and reverse-DNS
  records are prerequisites for exercising the actual SMTP path.
- The existing plan 16 contains VM, WireGuard, Ansible, and Swarm acceptance criteria. A passing Kubernetes scenario
  cannot satisfy those deployment-specific criteria, and this documentation revision does not change their status.

## Decision Log

- Decision: Select a self-contained Kubernetes integration lab using k3d.
  Rationale: The owner selected this architecture on 2026-09-18. Use one server and three agents with explicit
  placement: proxy A, proxy B, and the application and fixture worker. Run the application and reconciler inside the
  cluster so integration traffic needs no WSL-to-verifier tunnel. Reuse the proxy image, reconciliation logic,
  registry API, Mailpit, and peer probe. Add Kubernetes packaging, configuration input, and scoped network bootstrap
  in later implementation work. Preserve three distinct egress identities and prove the real source addresses.
  This supersedes the selected Vagrant, Swarm, standalone fixture, and tunnel execution paths for this lab.
  Date/Author: 2026-09-18, project owner and Codex documentation.
- Decision: Keep deployment migration separate from evidence for the existing Swarm fleet.
  Rationale: Plan 16 and issue #424 remain unchanged and require a deliberate revision or a separate Kubernetes
  ExecPlan before implementation. This document can describe the selected design without claiming that Kubernetes
  validates the old Vagrant, WireGuard, firewall, Swarm placement, or reset behavior.
  Date/Author: 2026-09-18, project owner and Codex documentation.
- Decision: Retain separate peer-probe and Mailpit phases.
  Rationale: The probe records connection origin; Mailpit supports ordinary SMTP and STARTTLS. Run one fixture at a
  time on port `2525`, observe complete termination before changing phase, and serialize source checks. Capacity
  validation remains separate because Mailpit does not provide deterministic synchronization.
  Date/Author: 2026-09-18, project owner and Codex documentation.
- Historical decision: Use Swarm services on the Vagrant VMs, with `verifier-1` as a non-proxy worker.
  Rationale: This was the earlier 2026-09-18 choice. A separate fixture stack, host bindings, and a tunnel from WSL
  were documented and statically checked. The later Kubernetes decision supersedes this execution model.
  Date/Author: 2026-09-18, project owner and Codex documentation.
- Historical decision: Select a temporary subnet tunnel through `verifier-1` and later a standalone Mailpit binary.
  Rationale: These 2026-09-15 choices retained an application outside the VMs. The peer probe supplied origin
  evidence, while Mailpit supplied SMTP conversations. Neither choice was run against the lab; later decisions
  superseded their runtime and transport procedures.
  Date/Author: 2026-09-15, project owner and Codex documentation.
- Decision: Keep the proposal beside the existing deployment documentation.
  Rationale: `deploy/proxy-fleet/` contains the reusable image, Ansible, Swarm, and Vagrant contracts. Plans 12, 13,
  and 17 remain dependencies as evidence for this preparation, rather than prerequisites to create a future k3d
  cluster. The separate libvirt provider work in plan 18 is not part of this proposal.
  Date/Author: 2026-09-11, Codex planning; clarified 2026-09-18, Codex documentation.

## Outcomes & Retrospective

The current handoff selects Kubernetes on k3d for the self-contained integration lab. It records explicit workload
placement, retained listener and egress identities, node-local address and route requirements, reuse boundaries,
separate fixture phases, and scoped cleanup. It removes the tunnel and Swarm lifecycle from the selected path.
The Kubernetes revision passed Harper, the repository-plan test, shell syntax checks, and validation of the
embedded configuration against the k3d version 5.9.0 schema. Earlier documentation checks below are historical.
These static checks do not validate runtime behavior.

No cluster, container workload, network alias, route, registry, or application scenario has been created or changed
by this preparation. Kubernetes implementation and live source, privacy, capacity, restart, and cleanup proof remain
future work. Plan 16 and issue #424 are not satisfied by this revision.

## Context and Orientation

The existing Vagrant inventory declares three proxy listeners: `172.29.10.2:13001`,
`172.29.10.2:13002`, and `172.29.10.3:13001`. Their egress identities are `198.18.0.21`, `.22`, and `.23`.
The proposed Kubernetes topology retains those application-facing addresses and uses `172.29.10.4` for the
application and fixture worker. These are lab identities assigned inside the k3d node containers; they do not become
Kubernetes node addresses simply by creating several agents.

`docker/proxy-fleet/render-config.sh` validates local address assignment, applies worker source restrictions,
and renders explicit listener and egress bindings for 3proxy. Two node-pinned proxy workloads with host networking
can reuse this image and its listener manifests. Kubernetes configuration and secret mounts replace Swarm-specific
packaging. The normal pod network may serve application dependencies, while source-sensitive verification,
reconciliation, and fixture traffic use the application and fixture node's host network and explicit routes.

`scripts/proxy-fleet-swarm/reconcile.ts` computes registry changes and uses a listener health check before
activation. The CLI in `reconcile-cli.ts` currently loads Ansible inventory and credential files. A Kubernetes
configuration adapter must supply the same desired listeners without pretending that the current CLI already reads
Kubernetes resources. The application still dials the addresses published to its existing registry.

`scripts/proxy-fleet-swarm/smtp-peer-probe.ts` records the last connection address and exposes `/last-peer`.
Place the probe and reconciliation Job on the application and fixture worker with host networking, and keep probe
status bound to the loopback address. Checks must run sequentially without competing SMTP clients. Mailpit runs in a
separate phase on `172.29.10.4:2525`, with its UI/API bound to the loopback address and STARTTLS using the existing
`smtp.lef.test` certificate. The application requires the existing SMTP test DNS, CA, and control-cache prerequisites.

Node-container aliases, routes with the intended source address, and narrowly owned firewall rules require
privileged bootstrap inside the disposable nodes. Host networking does not provide pod-level network isolation
for these workloads; privacy and source restrictions require explicit node rules and live rejection checks.
Bootstrap must be reapplied and validated after node restart or recreation. No instruction should alter the
controller's routes or unrelated Docker networks.

## Scope and Non-Goals

Maintain `deploy/proxy-fleet/validation-decisions.md`, this implementation record, and legitimate terms in the
documentation spelling dictionary in the existing pull request. Replace stale selected execution procedures with the Kubernetes decision and document
what can be reused, what must be implemented, and which evidence remains missing.

Do not create a cluster, change deployment code, add Kubernetes manifests, build images, install tools, bootstrap
networking, contact a proxy registry, or run live scenarios. Do not edit plan 16, close issue #424, or imply that
Kubernetes validates the existing Swarm deployment. No schema or HTTP API behavior changes are included.

## Plan of Work

Inspect the existing listener image, proxy registry, reconciler, peer probe, Mailpit configuration, application test
stack, and Vagrant routing setup. Separate reusable application contracts from Ansible, WireGuard, and Swarm-specific
implementation. Check k3d and Kubernetes behavior against primary documentation where repository evidence is
insufficient.

Describe the selected one-server, three-agent cluster and exact workload responsibilities. Keep two listeners on
the first proxy worker and one on the second, with three distinct egress identities. Place the application, reconciliation Job, and
fixtures on the third agent, and specify which workloads need host networking. Explain why application placement,
source-address selection, and narrow access rules jointly replace the previous controller tunnel.

Document node-local address assignment, return routes, conflict detection, and required bootstrap privileges.
Require the peer probe to observe every declared egress address before proceeding to application validation.
Treat network source preservation as an experiment that must pass, not an automatic property of k3d. Include
restart and recreation checks because Kubernetes scheduling alone does not restore external network bootstrap.

Describe configuration and secret packaging, immutable image inputs, private status access, sequential source
checks, and the stop-then-start transition between peer probe and Mailpit. Separate normal SMTP conversations from
the deterministic synchronization required for capacity proof. Describe removal of only owned cluster resources and
lab nodes, with registry draining and workload termination before connectivity disappears.

Mark proposed commands and future implementation dependencies explicitly. Use an isolated kubeconfig and an
explicit cluster identity, and prevent commands from falling back to unrelated Kubernetes or Docker resources.
Explain which checks run statically during this documentation task and which require the future live lab.

Finish with a clear handoff: the owner selected Kubernetes, while deployment implementation needs a new or
revised ExecPlan. Existing Swarm and Vagrant acceptance criteria remain outstanding. Update the documentation
evidence and run the focused checks without creating infrastructure.

## Interfaces and Dependencies

The interface delivered here is a design document. Existing proxy registry APIs, listener authentication, desired
listener identities, source checks, and application verification behavior remain unchanged. Plans 12, 13, and 17
supply source evidence for reusable contracts and the earlier topology.

Future implementation needs Kubernetes workload and dependency packaging, a reconciler configuration adapter,
node placement and privileged network bootstrap, private configuration and secret handling, fixture phase control,
and deterministic validation. It must define image pins, ownership of the namespace and cluster, source selection, scoped
firewall recovery, and restart behavior. This preparation adds no runtime or package dependencies.

## Acceptance Criteria

- The document selects k3d with one server and three agents and identifies all workload placements, including the
  application, dependencies, reconciler, two proxy workers, Mailpit, and peer probe.
- The document preserves all three listener endpoints and egress identities and identifies their repository
  contracts. It distinguishes lab aliases from k3d node addresses and public Internet egress.
- The document specifies node-local aliases, source selection, return routes, required privileges, placement,
  privacy, and restart requirements. It requires observed source checks rather than assuming source preservation.
- Proposed lifecycle procedures cover preparation, readiness, fixture phases, normal cleanup, interruption, and
  repeat runs. Future code dependencies and commands that have not run are explicitly labeled.
- Peer-origin checks remain sequential. Fixture transitions require the previous workload and listener to stop
  before the next fixture takes port `2525`. Actual SMTP conversations and capacity evidence remain distinct.
- The selected path requires no WSL-to-verifier tunnel or Vagrant/Swarm lifecycle. Historical alternatives are
  clearly marked as superseded rather than presented as current requirements.
- The document identifies reusable components and missing Kubernetes implementation. It explicitly states that plan
  16 and issue #424 need a revision or a separate Kubernetes ExecPlan and retain their unverified Swarm criteria.
- Documentation and plan checks pass without creating a cluster or changing runtime state. Passing static checks
  does not claim deployment, application, source-address, capacity, or cleanup validation.

## Validation

Run these commands from the repository root after writing the document and updating this plan:

```sh
corepack pnpm docs:lint -- deploy/proxy-fleet/validation-decisions.md .agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md
corepack pnpm test --runInBand --runTestsByPath scripts/plans/execplan-repository-fixture.spec.ts
git diff --check
```

Manually compare cited paths, endpoint identities, environment variables, and repository commands with source.
Check proposed command syntax without executing cluster or network mutations. Review the new design against the
reusable application contracts and clearly identify which old plan-16 deployment criteria it does not test.
Record exact static results separately from later live evidence. Bruno: not applicable — documentation changes
no HTTP behavior.

## Idempotence and Recovery

Preparation edits the proposal document, this plan, and legitimate terms in the documentation spelling dictionary.
Reread their current contents before updating them;
preserve unrelated work and retain the distinction between evidence, assumptions, and decisions on every revision.
After interruption, resume from the unchecked progress item. Recovery requires correcting or reverting only this
pull request's documentation; no guest, cluster, service, registry, credential, or controller state is changed.

## Artifacts and Notes

The handoff is `deploy/proxy-fleet/validation-decisions.md`. Record inspected revisions and sanitized source
references. Do not commit kubeconfigs, captured SSH files, credentials, private keys, machine identities, or absolute
controller paths. Completion records the selected Kubernetes design without starting its implementation.

The earlier revisions inspected `e3ae79e4e8eb5442930b29da1158b38efbb228e2` and
`d13134d243e38b192991c204210527c26743b9ed`. The Kubernetes revision started from
`dfbb2897c0a44b9428ea450eb1629f2b9282f210`.

Historical static validation of the standalone fixture revision on 2026-09-15:

- Harper passed both Markdown files; the repository-plan test passed one suite and one test.
- All 23 Bash blocks in that proposal and this plan's shell block passed `bash -n`; links and
  `git diff --check` passed.
- The two existing peer-probe files compiled to a temporary directory and passed `node --check`.
- The Mailpit archive and digest were checked against the release API; no fixture binary or guest process ran.

Historical static validation of the Swarm documentation revision on 2026-09-18:

- Harper passed both Markdown files; the repository-plan test passed one suite and one test.
- All 19 Bash blocks in that proposal and this plan's shell block passed `bash -n`; links and
  `git diff --check` passed.
- Both peer-probe files compiled and passed `node --check`.
- The embedded fixture YAML passed `docker stack config --compose-file` with synthetic image digests.
  No images were pulled and no Docker daemon state changed.
- Review corrected ownership queries that could otherwise treat a failed Docker query as an empty result.

Static validation of the Kubernetes documentation revision on 2026-09-18:

- Harper passed both Markdown files.
- The ExecPlan repository fixture passed one suite and one test.
- All six Bash blocks in the proposal and the shell block in this plan passed `bash -n` without execution.
  Relative Markdown links were checked and `git diff --check` passed.
- The embedded configuration parsed with PyYAML and passed Python `jsonschema` validation against
  `pkg/config/v1alpha5/schema.json` from the upstream k3d `v5.9.0` tag. Substitution used synthetic run, network,
  port, and image-digest values. No Docker daemon or Kubernetes API was contacted for this check.
- Local k3d `v5.9.0` help confirmed the documented CLI options. Review corrected missing exports for template
  variables and specified how planned node replacements update the owned-resource record before cleanup.
- A readability revision grouped preparation into four steps and explained each input and check. Directory
  creation now runs before its separate export so a failed `mktemp` command stops the procedure.

No Kubernetes manifest, cluster, image, bootstrap procedure, or application scenario has been implemented or run.
The material operational trade-offs are privileged setup inside disposable node containers, host-network isolation
limits, and the need to restore aliases and routes after node lifecycle events.

Bruno: not applicable — this preparation changes documentation only.

## Plan readiness

Ready to implement
