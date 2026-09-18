# Prepare the Fleet Validation Decisions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the owner of `proxy-fleet/16` a reviewable proposal for reaching the lab's proxy listeners and running its SMTP
fixture. One documentation pull request produces `deploy/proxy-fleet/validation-decisions.md`, with repository
evidence, proposed lifecycle commands, trade-offs, and explicit questions. A developer can prepare this proposal
without a running fleet or an installed VM provider. The owner selected a tunnel through `verifier-1` and Swarm
services on the Vagrant VMs for the proxies, Mailpit, and the existing peer probe. The verifier becomes a Swarm
worker without a proxy role. Mailpit handles SMTP conversations; the peer probe handles sequential source checks.
Adapting provisioning, finalizing execution procedures, capacity instrumentation, and live proof remains in plan 16.

## Progress

- [x] (2026-09-15) Trace the listener, registry, application, and SMTP fixture paths against the current repository.
- [x] (2026-09-15) Write the proposed execution models, lifecycle commands, evidence requirements, and owner questions.
- [x] (2026-09-15) Complete static documentation and plan validation; record limitations and hand off the proposal.
- [x] (2026-09-15) Revise the fixture proposal to the owner's Mailpit choice and validate the documentation for the existing PR.
- [x] (2026-09-18) Record the selected Swarm fixture model and the required verifier membership, firewall, placement,
  and reset adaptations without changing runtime code or plan 16.
- [x] (2026-09-18) Validate the Swarm documentation revision and update its evidence and handoff record.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`
- `proxy-fleet/17`

## Surprises & Discoveries

- The lab inventory does not override `proxy_fleet_worker_cidrs`. The effective default is the whole
  `172.29.10.0/28` overlay, so the `.4/32` restriction stated in plan 16 needs a correction in both host firewall and
  rendered proxy configuration before worker-only access can be claimed.
- Mailpit `v1.30.7` is already pinned in `docker/compose.smtp-dev.yaml`. Its container supports explicit private
  bindings and STARTTLS, so the fleet's ordinary SMTP phase needs no new SMTP server entry point. The existing Node
  evidence fixture continues to own its precise classification scenarios.
- Mailpit has no `/last-peer` contract or deterministic hold/release control. The reconciler still needs the peer
  probe in a separate phase; capacity proof needs a synchronization barrier and Redis assertions in plan 16.
- The real verifier stops after RCPT and QUIT without DATA, so the Mailpit inbox remains empty. Default acceptance
  produces a catch-all result rather than conclusive target evidence. Fresh control evidence and reverse-DNS
  records are prerequisites for exercising the actual SMTP path.
- The current verification-worker play installs neither Docker nor the Swarm role. Swarm firewall membership is
  computed from managers and proxy nodes only. Plan 16 must add explicit membership for the fixture worker while
  keeping it outside `proxy_nodes`, whose validation, topology, and labels require actual proxy listeners.
- The existing proxy stack already uses host networking and node placement constraints. A separate fixture stack
  can preserve the two proxy services while constraining one active fixture to `verifier-1`. Host networking lets
  SMTP bind to `172.29.10.4:2525` and status or UI bind to the guest's loopback address without routing-mesh ports.
- Container images remove the need to install Node or a standalone Mailpit binary on the verifier. The peer's
  compiled JavaScript can be supplied through Swarm configurations; the Mailpit certificate and key can use configurations and
  secrets. Stack removal must verify task termination and remove only the fixture's owned artifacts. No proposed
  guest or Swarm procedure has run.

## Decision Log

- Decision: Run the proxies and fixtures as Swarm services on the Vagrant VMs, with `verifier-1` as a worker without
  a proxy role.
  Rationale: The owner selected this deployment model on 2026-09-18. Keep the existing proxy stack and use a separate
  fixture stack pinned to the verifier's host network. Use immutable image digests, compiled peer-probe configurations,
  and Mailpit certificate and key artifacts. Run the peer probe and Mailpit sequentially by setting their replica
  counts to zero or one; verify that the previous task and listener have stopped before changing phase. This
  supersedes the standalone Node and Mailpit staging and transient systemd-service proposals below. The selected
  tunnel, listener endpoints, private status access, and separate capacity proof remain unchanged. Plan 16 must
  adapt membership, firewall peer rules, worker placement, and ordered reset before live use.
  Date/Author: 2026-09-18, project owner and Codex implementation.
- Decision: Use a pinned standalone Mailpit binary for SMTP/STARTTLS and retain the existing peer probe for
  sequential source-IP checks.
  Rationale: The owner requested this update on 2026-09-15. Mailpit supplies the normal SMTP conversation with private
  UI/API access. The probe retains the reconciler's `/last-peer` contract; only that phase needs staged Node. Capacity
  synchronization remains separate validation work in plan 16. This superseded the proposed full Node SMTP entry
  point. The 2026-09-18 decision retains these fixture responsibilities and supersedes standalone execution.
  Date/Author: 2026-09-15, project owner and Codex implementation.
- Decision: Record the owner's explicit choice of a temporary subnet tunnel through `verifier-1`.
  Rationale: The owner selected this model on 2026-09-15 and authorized the documentation PR. The proposed `sshuttle`
  procedure retains the original listener endpoints. This selection alone did not accept a fixture proposal;
  the later Mailpit decision records that choice. Neither decision proves controller privileges, container
  reachability, or the live acceptance criteria in plan 16.
  Date/Author: 2026-09-15, project owner and Codex implementation.
- Decision: Propose a staged Node runtime and transient service for the existing peer fixture.
  Rationale: The verifier lacks Node, Docker, and shared source. A verified runtime archive and locally compiled
  fixture keep these additions temporary; status access through `127.0.0.1` uses the captured SSH configuration.
  The later Mailpit decision retained this model for the peer phase only. The 2026-09-18 Swarm decision supersedes
  its staged runtime and transient-service lifecycle.
  Date/Author: 2026-09-15, Codex implementation.
- Decision: Deliver one proposal document without selecting or validating the fleet execution models.
  Rationale: Gathering evidence and preparing commands can start now; plan 16 still requires an explicit execution
  choice before live work. A documented unresolved question does not prevent completion of this preparation.
  Date/Author: 2026-09-11, project owner and Codex planning.
- Decision: Keep the document beside the existing deployment documentation in `deploy/proxy-fleet/`.
  Rationale: The Ansible, Swarm, and Vagrant guides already live there and provide the source contracts.
  Date/Author: 2026-09-11, Codex planning.
- Decision: Consume the completed VirtualBox lab from plan 17 without adding a dependency on plan 18.
  Rationale: Native Linux/libvirt validation is separate work and does not block a repository-based proposal.
  Date/Author: 2026-09-11, Codex planning.

## Outcomes & Retrospective

The handoff now records the selected tunnel and Swarm services for the peer-probe and Mailpit phases. It identifies
the verifier's required membership and provisioning changes, a separate fixture stack, private host bindings, and
ordered phase changes and cleanup. The 2026-09-18 revision passed Harper, the repository-plan test, shell syntax
checks, fixture compilation, and static Docker stack configuration parsing. These checks do not prove service
deployment or runtime behavior. No guest, tunnel, registry, container, or application scenario ran. Runtime
implementation, exact deployment inputs, and deterministic capacity proof remain in plan 16.

## Context and Orientation

`deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml` declares a manager, two proxy nodes, and `verifier-1`. The proxy
listeners advertise `172.29.10.2:13001`, `172.29.10.2:13002`, and `172.29.10.3:13001`; their egress identities are
`198.18.0.21`, `.22`, and `.23`. The verifier uses `172.29.10.4` on the WireGuard overlay. The Vagrant guide documents
direct lifecycle commands. Captured SSH aliases belong in the ignored `.vagrant/proxy-fleet/` directory.

The health check in `scripts/proxy-fleet-swarm/listener-health-check.ts` authenticates through the listener endpoint.
Reconciliation in `reconcile.ts` publishes the same `bindIp` to the registry for the application to consume. Forwarding a listener to a
different localhost address does not demonstrate that the real application can reach the advertised endpoint.

`scripts/proxy-fleet-swarm/smtp-peer-probe.ts` records the most recent connection's address and exposes it through
`/last-peer`. Its CLI uses Node and defaults both listening hosts to `0.0.0.0`. The current Vagrant and Ansible
procedures install neither Node nor Docker on the verifier and disable the shared source folder. The selected
model requires plan 16 to install Docker and join the verifier to Swarm without adding it to `proxy_nodes`. A pinned
Node image supplies the peer runtime; locally compiled fixture files become Swarm configurations. The probe retains its
private status contract and proves connection origin, not a complete email verification conversation.

Mailpit supplies ordinary SMTP conversations as a service in the separate fixture stack. An immutable image with
host networking and verifier placement can bind SMTP to `172.29.10.4:2525` and UI/API to `127.0.0.1:8025`, using the
existing `smtp.lef.test` certificate. The peer service uses the same SMTP port and loopback status port `9000`.
Run these services sequentially, with at most one replica of one fixture, and pause reconciliation during the
Mailpit phase. Do not publish either service through the routing mesh. The existing SSH management path provides
private access to status and UI.

Plan 16 owns eventual live validation and known firewall, WireGuard, Swarm-address, and reset corrections. It must
also replace its assumption that the verifier has no Docker with the selected worker role, expand the declared
Swarm peer set, and order the verifier's departure before the manager's. The verifier must receive no proxy labels
or listener manifest. These changes are documented requirements for that implementation, not runtime changes in
this preparation.

## Scope and Non-Goals

Maintain `deploy/proxy-fleet/validation-decisions.md` and the implementation record in this plan in the same
documentation pull request. The document covers only the two execution decisions blocking plan 16 and the evidence
needed to select and later validate them.

Do not implement a tunnel, fixture, adapter, endpoint, provider, route, or VM lifecycle wrapper. Do not install
Vagrant, create guests, change host networking, contact a proxy registry, or run live scenarios. Do not select a
different provider or start plan 18. Record the selected fixture-worker adaptation for plan 16 without editing that
plan or relaxing its endpoint, source, privacy, recovery, or live-evidence requirements. No schema or HTTP behavior
changes are included.

## Plan of Work

First, inspect the tracked inventory, the Vagrant guide and provisioner, the Ansible firewall and WireGuard roles,
and the Swarm reconciliation and probe sources. Trace the application path consuming the reconciled registry host
to its connection adapter. Record repository-relative files and symbols for each network hop, endpoint, source
identity, allow-list restriction, runtime prerequisite, and existing defect relevant to the two decisions.

Write a short comparison of the execution models already identified in plan 16: a scenario-scoped subnet tunnel,
guest-side validation tooling, and a narrow connection override. Explain whether each preserves the advertised
`bindIp` and exercises the real application path, where traffic originates, which firewall rules permit it, and what
controller privileges or dependencies it would require. Mark models that conflict with the unchanged endpoint
contract as unsuitable; do not quietly relax the contract to make a model appear feasible.

For fixture execution, document the selected Swarm model while accounting for the verifier's missing Docker and
Swarm membership. Identify the required provisioning, firewall peer-set, placement-label, and reset adaptations as
plan-16 work. Explain why adding the verifier to `proxy_nodes` is unsuitable. Keep the two proxy services separate
from a fixture stack pinned to the verifier with host networking. Describe immutable Node and Mailpit images,
compiled peer-probe configurations, and scoped certificate and key artifacts without assuming a shared source folder or
guest Node installation. Preserve the peer-status contract, private status access, and source observations.

Document the zero-or-one replica phase transition and require the previous task and listener to stop before the
next starts on the shared SMTP port. Separate sequential source-address observations from Mailpit conversations
and deterministic capacity evidence. Concurrent clients can overwrite the peer probe's last observed address.

For each viable proposal, write exact proposed lifecycle commands for preparation, start, readiness, use, normal
cleanup, and interruption. Include explicit working directories and named environment inputs. Mark commands that
have not run as proposals, identify commands that depend on future code, and describe how their results will be verified. Use
captured Vagrant SSH configuration for guest access and explicit remote-manager transport for any proposed Docker
mutation. Explain ownership, safe repetition, credential handling, and restoration of temporary processes, files, and
network state. Check external command syntax against primary documentation when repository evidence is insufficient.

Finish with the owner's selected tunnel and Swarm fixture model, the retained peer-probe contract, and a decision table
containing the question, repository evidence, missing external fact, and responsible role. Use the project owner for environment or privilege questions
and the plan-16 implementer for execution details; do not assign a named collaborator. Each unresolved choice has a
clear effect on plan 16. Distinguish the owner's selected models from unverified lifecycle commands and unresolved
execution details; completion of this document does not approve remaining choices or prove live behavior.

## Interfaces and Dependencies

The only new interface is the documentation handoff to plan 16. Preserve listener addresses, registry ownership,
worker-only access, lab-routed source identities, private fixture status, direct Vagrant lifecycle, and explicit
remote Docker selection. Plans 12, 13, and 17 supply existing implementation and topology evidence. There is no
runtime or package dependency for this preparation beyond the repository's documentation and plan tooling.
The selected runtime model adds a non-proxy Swarm worker and a separate fixture stack in plan 16. That later work
must define immutable image inputs, private configuration and secret handling, placement ownership, explicit manager
identity checks, ordered service cleanup, and worker departure. Existing proxy registry and application APIs stay
unchanged.

## Acceptance Criteria

- The document maps the listener and fixture paths to current source files and identifies all three listener endpoints.
- Each viable proposal explains privileges, dependencies, endpoint preservation, private status access, and recovery.
- Proposed commands cover preparation, readiness, use, normal cleanup, and interruption. Inputs and evidence
  requirements are explicit. Commands that have not run and dependencies on future code are visibly labeled.
- The document distinguishes peer-origin evidence from actual application verification and records the probe's
  sequential-use constraint.
- The document records the selected Swarm services, separate fixture stack, verifier placement and host bindings,
  and immutable image and artifact inputs. It identifies the required non-proxy worker provisioning, firewall
  membership, and reset adaptations as unimplemented plan-16 work.
- Proposed fixture transitions allow at most one active fixture on port `2525`. Cleanup verifies task termination,
  private socket closure, and removal of only owned services, configurations, secrets, and temporary artifacts before reset.
- Unresolved choices identify a responsible role and the missing fact. Their continued presence does not block this
  preparation, and the document does not claim approval of remaining execution details or completed live validation.
- Plan 16 retains its conditional readiness and every runtime acceptance requirement. Documentation checks pass
  without requiring a running fleet or installed Vagrant. Recording the selected model does not implement its
  provisioning changes or establish live validation.

## Validation

Run these commands from the repository root after writing the document and updating this plan:

```sh
corepack pnpm docs:lint -- deploy/proxy-fleet/validation-decisions.md .agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md
corepack pnpm test --runInBand --runTestsByPath scripts/plans/execplan-repository-fixture.spec.ts
git diff --check
```

Manually compare every cited path, endpoint, environment variable, and repository command with its source. Review
each proposed lifecycle against the unchanged acceptance criteria in plan 16 and record unsupported host assumptions.
Do not execute the proposed live commands as a validation requirement. Record exact static results and distinguish
them from the later fleet evidence. Bruno: not applicable — documentation changes no HTTP behavior.

## Idempotence and Recovery

Preparation edits only the proposal document and this plan. Reread their current contents before updating them;
preserve unrelated work and retain the distinction between evidence, assumptions, and decisions on every revision.
After interruption, resume from the unchecked progress item. Recovery requires correcting or reverting only this
pull request's documentation; no guest, service, registry, credential, or controller state is changed.

## Artifacts and Notes

The handoff is `deploy/proxy-fleet/validation-decisions.md`. Record the inspected revision and sanitized source
references. Do not include captured SSH files, absolute controller paths, credentials, private keys, or machine IDs.
Completion supplies the selected models and proposed procedures for plan 16 to consume; it neither starts that plan
nor marks its remaining execution decisions resolved. The document records inspected revisions
`e3ae79e4e8eb5442930b29da1158b38efbb228e2` and `d13134d243e38b192991c204210527c26743b9ed` and the primary references checked.

Historical static validation of the standalone fixture revision on 2026-09-15, from the repository root:

- `corepack pnpm docs:lint -- deploy/proxy-fleet/validation-decisions.md .agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md`
  passed for both files after correcting the reported prose findings.
- `corepack pnpm test --runInBand --runTestsByPath scripts/plans/execplan-repository-fixture.spec.ts` passed one suite
  and one test, covering repository-wide plan discovery and dependency resolution.
- All 23 Bash blocks in the revised proposal and the shell block in this plan passed `bash -n` without execution.
  Relative Markdown links and explicit repository source paths were checked. `git diff --check` passed.
- The initial revision's proposed `corepack pnpm exec tsc` invocation compiled the two existing peer-probe files into
  a temporary local directory. Both emitted JavaScript files passed `node --check`; neither fixture was started.
- The Mailpit archive name and SHA-256 digest were checked against the release API. Command flags, version checking,
  and readiness behavior were checked against the pinned upstream source. No Mailpit binary was installed or run.
- Dependencies were installed with the frozen lockfile and a temporary writable pnpm store after the default store
  rejected a project-registration write. Validation used `TMPDIR=/tmp TMP=/tmp TEMP=/tmp`. No dependency files changed.

Static validation of the Swarm documentation revision on 2026-09-18, from the repository root:

- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm docs:lint -- deploy/proxy-fleet/validation-decisions.md .agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md`
  passed for both files.
- `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test --runInBand --runTestsByPath scripts/plans/execplan-repository-fixture.spec.ts`
  passed one suite and one test.
- All 19 Bash blocks in the proposal and the shell block in this plan passed `bash -n` without execution. Relative
  Markdown links and cited repository paths were checked. `git diff --check` passed.
- The documented `corepack pnpm exec tsc` invocation compiled both existing peer-probe files into a temporary local
  directory. Both emitted files passed `node --check`; neither fixture was started.
- The embedded YAML passed `docker stack config --compose-file` using a temporary copy and synthetic image digests.
  This checked configuration parsing only; no images were pulled and no Docker daemon state changed.
- Review checked lifecycle flags and Mailpit configuration against primary documentation and pinned source. It
  found and corrected a preflight that could treat a failed Docker query as an empty result. Ownership and cleanup
  queries now stop on query failure.

Bruno: not applicable — this preparation changes documentation only. Review found no application architecture change;
the verifier's Swarm membership, fixture services, and privileged tunnel remain explicit operational trade-offs
for plan 16. Swarm fixtures persist after SSH disconnects and require explicit cleanup. Runtime implementation and
live validation remain unverified.

## Plan readiness

Ready to implement
