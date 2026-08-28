# Validate the Disposable Proxy Fleet End to End

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Turn the proxy-fleet implementation's recorded environment limits into live evidence before anyone trusts it on real
infrastructure. After this change, a developer can provision a disposable four-host Ubuntu 24.04 lab and form its
WireGuard and Swarm topology. The developer can then deploy two proxy nodes, reconcile their registry entries,
exercise authenticated egress and capacity behavior, repeat the workflow without drift, and reset only lab-owned
state.

## Progress

- [ ] (2026-08-28) Acquire and record authority for the disposable four-host lab and its preassigned egress addresses.
- [ ] (2026-08-28) Run the provisioning, network, firewall, idempotency, failure, and guarded-reset scenarios from plan 12.
- [ ] (2026-08-28) Run the deployment, placement, egress, reconciliation, pruning, draining, and capacity scenarios from plan 13.
- [ ] (2026-08-28) Correct only in-scope defects without changing the established inventory, API, or ownership contracts.
- [ ] (2026-08-28) Record sanitized evidence and complete repository, documentation, and recovery validation.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`

## Surprises & Discoveries

- Plans 12 and 13 passed static, unit, syntax, renderer, and safe local-daemon checks, but their core happy paths could
  not run because no disposable hosts, routable egress addresses, or isolated multi-node Swarm were available.
- The unverified plan-12 paths include package installation, WireGuard reachability, firewall enforcement, Swarm
  formation, second-apply idempotency, and guarded reset. The unverified paths from plan 13 include real stack deployment,
  placement, authenticated CONNECT egress, object pruning, repeat reconciliation, and Redis-backed capacity under two
  workers.
- The local development machine belongs to an unrelated Swarm. It is not a valid validation target and must not be
  joined, relabeled, drained, reset, or used for any mutating command in this plan.

## Decision Log

- Decision: Use four disposable Ubuntu 24.04 hosts matching the checked-in example roles: one primary manager, two
  proxy nodes, and one verification worker.
  Rationale: This is the smallest topology that proves cross-node placement, two distinct proxy services, worker-only
  listener access, and concurrent capacity behavior without combining trust boundaries.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Require preassigned, disposable egress addresses and a private network path before implementation starts.
  Rationale: Plan 12 intentionally validates provider-owned addresses rather than allocating them. Inventing cloud or
  routing automation here would expand the road map into provider lifecycle and production work.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Keep the live inventory and Vault material untracked, while committing only reusable validation scripts,
  assertions, redacted fixtures, and documentation.
  Rationale: The repository needs repeatable proof without retaining host addresses, credentials, private keys, join
  tokens, or provider identifiers.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Fix implementation defects found by the prescribed scenarios only when the fix preserves the public
  contracts from plans 11–13 and fits within this pull request's review scope.
  Rationale: Small corrections are necessary to make the promised behavior pass. A change to inventory shape,
  application APIs, ownership boundaries, or deployment architecture is independently useful and requires its own
  ExecPlan instead of silently expanding this validation PR.
  Date/Author: 2026-08-28, Codex plan audit.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`deploy/proxy-fleet/ansible/` provisions Ubuntu hosts, WireGuard, restricted firewall rules, Swarm membership and
labels, listener manifests, and root-only credentials. `deploy/proxy-fleet/swarm/` renders content-addressed configurations
and secrets, deploys node-constrained 3proxy services, waits for convergence, checks listener egress, and reconciles
owned `/v1/proxies` records. `scripts/proxy-fleet-swarm/` contains the TypeScript renderer, Docker adapter, registry
adapter, reconciler, and SMTP peer probe.

Plans 12 and 13 explicitly recorded which live scenarios were unavailable. Both implementation pull requests are
merged, so this plan provides the one missing pull request for live disposable-lab proof rather than rewriting their
historical outcomes.

## Scope and Non-Goals

Validate the merged provisioning and Swarm workflows against disposable infrastructure, add the smallest reusable
lab-validation harness needed to make pass/fail results deterministic, and correct narrow defects exposed by those
scenarios. Exercise safe cleanup and record sanitized evidence.

Do not create cloud accounts, provision production resources, allocate public IPs, or change the proxy registry API.
Do not introduce a new orchestrator, migrate the application to Swarm, add high availability, or store live inventory
or secrets in Git. Do not add database migrations, backfills, production rollout, or production recovery.

## Plan of Work

Before any mutation, record the disposable lab owner, expiry, host identities, allowed address ranges, and explicit
authority to form and destroy its WireGuard and Swarm state. Verify none of the host, ClusterID, or address values match
the local unrelated Swarm or another protected environment. Build an ignored inventory from
`deploy/proxy-fleet/ansible/inventory/example.yml`, encrypt secret variables with Ansible Vault, and validate all
preassigned egress addresses through the provider or host control plane without teaching the repository to create
them.

Run the syntax and inventory checks from plan 12, then `--check --diff`, first apply, and second apply. Prove Docker and
WireGuard installation, private peer reachability, exact egress-interface membership, worker-to-listener allow rules,
undeclared-source denial, peer-scoped Swarm ports, preserved SSH, expected labels, absent-egress failure, conflicting
Swarm failure, and `changed=0` on the second normal apply. Run the guarded reset on the explicit `lab_reset` group and
prove it removes only role-owned files, rules, labels, WireGuard state, and disposable Swarm membership.

Provision the clean lab again and run plan 13. Render and validate the stack, deploy two proxy services, and inspect
tasks, placement constraints, host networking, node-specific configurations and secrets, and absence of ingress proxy ports.
Authenticate through every listener to the disposable SMTP peer and assert the observed address equals the declared
egress address. Reconcile twice and prove the second deployment and reconciliation create no object, registry, or
state drift. Change one owned listener, remove another, and verify content-addressed replacement, safe pruning, and
draining without touching manual registry records.

Run two verification-worker processes against the deployed listeners and prove the existing per-proxy and per-MX
Redis limits. Exercise failed health validation, recovery from draining, interrupted deployment before reconciliation,
and an interrupted reconciliation rerun. Finish by draining owned records, removing only the named stack and owned
objects, running the guarded host reset, and confirming the provider can destroy the disposable hosts without retained
repository state.

## Interfaces and Dependencies

No application endpoint, DTO, persistence schema, inventory schema, or provider contract changes are planned. The PR
may add a purpose-specific validation command and scripts under `deploy/proxy-fleet/` or
`scripts/proxy-fleet-swarm/`, plus ignored-artifact rules and operator documentation. Inputs remain the plan-12
inventory, Vault material, immutable image digest, private API URL, admin-key file, and SMTP peer endpoint.

This plan depends on merged plans 12 and 13 and on external access to an isolated four-host lab with two preassigned
egress addresses. The infrastructure prerequisite is not delivered by another repository plan.

## Acceptance Criteria

- A fresh four-host Ubuntu 24.04 lab completes check mode and two normal provisioning applies; the second normal apply
  reports `changed=0` outside explicitly documented nondeterministic facts.
- WireGuard peers reach declared private addresses, the verification worker reaches listeners, and an undeclared
  source cannot reach listener or peer-scoped Swarm ports.
- Egress-interface validation, conflicting-Swarm detection, and inventory rejection fail before destructive mutation.
- The guarded reset removes only proxy-fleet-owned state and preserves SSH, unrelated firewall rules, labels, files,
  and application data.
- Swarm deploys exactly one service on each proxy node with the expected host networking, immutable image, isolated
  configuration and secret, and no routing-mesh listener publication.
- Authenticated CONNECT through every listener reaches the SMTP peer from its declared egress address.
- A second unchanged deployment and reconciliation creates no duplicate service, configuration, secret, or proxy
  record and performs no unnecessary registry mutation.
- Changed and removed listeners replace or prune only unreferenced owned objects, become healthy or draining as
  designed, and never modify manual registry records.
- Two verification workers cannot exceed the configured per-proxy or per-MX Redis limits.
- Interrupted deployment or reconciliation converges on safe rerun, and final cleanup leaves no active owned registry
  member, named stack, owned Swarm object, or role-owned host state.
- No live address, credential, join token, private key, raw proxy configuration, customer data, or provider identifier
  is committed or printed in ordinary validation output.

## Validation

Run the exact static commands from plans 12 and 13 first: Ansible lint, inventory listing, syntax checks, inventory
validation, plaintext-secret scan, focused proxy-fleet Jest suites, stack rendering and `docker stack config`, then
repository lint, typecheck, test, build, documentation lint, and `git diff --check`.

On the authorized disposable lab, capture redacted first and second Ansible recaps, `wg show`, private reachability,
and firewall positive and negative probes. Also capture interface-address membership, Swarm node and label inspection,
service placement, ownership of configurations and secrets, authenticated egress observations, registry transition
summaries, Redis limit evidence, second-run no-op counts, interruption recovery, and guarded-reset results. Repeat the
complete lab workflow from clean hosts once after any infrastructure-affecting fix. Bruno is not applicable because no
application HTTP contract changes; use the existing authenticated registry adapter and focused tests for its unchanged
API boundary.

## Idempotence and Recovery

The lab is disposable but never assumed safe by name alone. Every mutating command targets the explicit ignored
inventory and verifies its cluster identity. An interrupted provision or deployment can be rerun through the existing
convergent roles, content-addressed Swarm objects, and compare-before-write reconciliation. Drain registry entries
before removing services. Use only the guarded reset for host cleanup, then destroy hosts and provider-owned addresses
through the external control plane after evidence is recorded. If identity or ownership checks disagree, stop and
inspect rather than leave, reset, relabel, or prune any Swarm.

## Artifacts and Notes

Record redacted lab authority and expiry, command versions, sanitized inventory shape, first/second recaps, negative
probe results, placement assertions, egress assertions, stable object counts, capacity results, recovery evidence, and final
cleanup. Do not record routable addresses, hostnames, provider resource IDs, Vault data, join tokens, admin keys,
proxy credentials, or WireGuard private material.

## Plan readiness

Blocked by access to an authorized disposable four-host Ubuntu 24.04 lab with two preassigned egress addresses and
authority to form and destroy its isolated WireGuard and Swarm state.
