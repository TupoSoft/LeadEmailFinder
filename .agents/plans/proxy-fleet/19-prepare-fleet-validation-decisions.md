# Prepare the Fleet Validation Decisions

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give the owner of `proxy-fleet/16` a reviewable proposal for reaching the lab's proxy listeners and running its SMTP
fixture. One documentation pull request produces `deploy/proxy-fleet/validation-decisions.md`, with repository
evidence, proposed lifecycle commands, trade-offs, and explicit questions. A developer can prepare this proposal
without a running fleet or an installed VM provider. Choosing and proving the execution models remains in plan 16.

MVP scope decision (2026-10-22): verification workers will connect directly to mail servers. This task is deferred
to the post-MVP backlog and can resume after an explicit decision to adopt a proxy fleet.

## Progress

- [ ] (2026-09-11) Trace the listener, registry, application, and SMTP fixture paths against the current repository.
- [ ] (2026-09-11) Write the proposed execution models, lifecycle commands, evidence requirements, and owner questions.
- [ ] (2026-09-11) Complete static documentation and plan validation; record limitations and hand off the proposal.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`
- `proxy-fleet/17`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Defer this task to the post-MVP backlog until an explicit decision to adopt a proxy fleet.
  Rationale: MVP verification workers will connect directly to mail servers, so fleet validation preparation is
  outside the MVP scope. Preserve the planned work and its dependencies for reconsideration after the MVP.
  Date/Author: 2026-10-22, project owner.
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

Not started.

## Context and Orientation

`deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml` declares a manager, two proxy nodes, and `verifier-1`. The proxy
listeners advertise `172.29.10.2:13001`, `172.29.10.2:13002`, and `172.29.10.3:13001`; their egress identities are
`198.18.0.21`, `.22`, and `.23`. The verifier uses `172.29.10.4` on the WireGuard overlay. The Vagrant guide documents
direct lifecycle commands. Captured SSH aliases belong in the ignored `.vagrant/proxy-fleet/` directory.

The health check in `scripts/proxy-fleet-swarm/listener-health-check.ts` authenticates through the listener endpoint.
Reconciliation in `reconcile.ts` publishes the same `bindIp` to the registry for the application to consume. Forwarding a listener to a
different localhost address does not demonstrate that the real application can reach the advertised endpoint.

`scripts/proxy-fleet-swarm/smtp-peer-probe.ts` records the most recent connection's address and exposes it through
`/last-peer`. Its CLI uses Node and defaults both listening hosts to `0.0.0.0`. Plan 17 installs neither Node nor
Docker on the verifier and disables the shared source folder. A valid proposal must explain fixture execution and
private status access without assuming those missing facilities. The existing peer probe proves connection origin;
it does not provide a complete email verification conversation.

Plan 16 owns eventual live validation and known firewall, WireGuard, Swarm-address, and reset corrections. Existing
defects are evidence for that implementation, not permission to change runtime behavior during this preparation.

## Scope and Non-Goals

Add `deploy/proxy-fleet/validation-decisions.md` and maintain the implementation record in this plan in one future
documentation pull request. The document covers only the two execution decisions blocking plan 16 and the evidence
needed to select and later validate them.

Do not implement a tunnel, fixture, adapter, endpoint, provider, route, or VM lifecycle wrapper. Do not install
Vagrant, create guests, change host networking, contact a proxy registry, or run live scenarios. Do not select a
different provider, start plan 18, or broaden the invariants of plan 16. No schema or HTTP behavior changes are included.

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

For fixture execution, describe a proposal that accounts for the missing Node runtime, Docker, and shared source on the verifier.
Identify any proposed temporary runtime or alternative fixture as future work and explain its compatibility with
the existing peer-status contract, private status access, and source observations. Separate the source-address probe
from any SMTP conversation required for actual application verification in plan 16. Document sequential probe use,
since concurrent clients can overwrite the fixture's last observed peer.

For each viable proposal, write exact proposed lifecycle commands for preparation, start, readiness, use, normal
cleanup, and interruption. Include explicit working directories and named environment inputs. Mark commands that
have not run as proposals, identify commands that depend on future code, and describe how their results will be verified. Use
captured Vagrant SSH configuration for guest access and explicit remote-manager transport for any proposed Docker
mutation. Explain ownership, safe repetition, credential handling, and restoration of temporary processes, files, and
network state. Check external command syntax against primary documentation when repository evidence is insufficient.

Finish with a recommendation supported by the comparison and a decision table containing the question, repository
evidence, missing external fact, and responsible role. Use the project owner for environment or privilege questions
and the plan-16 implementer for execution details; do not assign a named collaborator. Each unresolved choice has a
clear effect on plan 16. A recommendation is a proposal, and completion of this document does not approve it.

## Interfaces and Dependencies

The only new interface is the documentation handoff to plan 16. Preserve listener addresses, registry ownership,
worker-only access, lab-routed source identities, private fixture status, direct Vagrant lifecycle, and explicit
remote Docker selection. Plans 12, 13, and 17 supply existing implementation and topology evidence. There is no
runtime or package dependency for this preparation beyond the repository's documentation and plan tooling.

## Acceptance Criteria

- The document maps the listener and fixture paths to current source files and identifies all three listener endpoints.
- Each viable proposal explains privileges, dependencies, endpoint preservation, private status access, and recovery.
- Proposed commands cover preparation, readiness, use, normal cleanup, and interruption. Inputs and evidence
  requirements are explicit. Commands that have not run and dependencies on future code are visibly labeled.
- The document distinguishes peer-origin evidence from actual application verification and records the probe's
  sequential-use constraint.
- Unresolved choices identify a responsible role and the missing fact. Their continued presence does not block this
  preparation, and the document does not claim approval or completed live validation.
- Plan 16 retains its conditional readiness and every runtime acceptance requirement. Documentation checks pass
  without requiring a running fleet, installed Vagrant, a chosen execution model, or owner acceptance of a proposal.

## Validation

Run these commands from the repository root after writing the document and updating this plan:

```sh
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
Completion supplies a proposal for plan 16 to consume; it neither starts that plan nor marks its decisions resolved.

## Plan readiness

Ready after a post-MVP decision to adopt a proxy fleet
