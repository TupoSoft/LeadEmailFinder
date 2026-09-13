# Validate the Disposable Proxy Fleet End to End

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Turn the proxy-fleet implementation's recorded environment limits into live evidence before anyone trusts it on real
infrastructure. After this change, a developer can create the four-host Ubuntu 24.04 Vagrant lab from plan 17 through
Vagrant's direct lifecycle, form its WireGuard and Swarm topology, and deploy two proxy nodes with three lab-routed
egress identities. The developer can reconcile their registry entries, exercise authenticated egress and capacity
behavior, repeat the workflow without drift, reset application and guest state, and destroy the Vagrant environment.

## Progress

- [ ] (2026-09-05) Select and document the listener-reachability and verifier-fixture execution models.
- [ ] (2026-08-28) Create a plan-17 lab on one proven provider and validate its tracked inventory and captured SSH
      configuration.
- [ ] (2026-08-28) Correct the known firewall, reset, probe, and Swarm-address defects, then run every plan-12 scenario.
- [ ] (2026-08-28) Run the plan-13 deployment, placement, egress, reconciliation, draining, and capacity scenarios.
- [ ] (2026-08-28) Correct any additional in-scope defect without changing the established application contracts.
- [ ] (2026-08-28) Record sanitized evidence and complete repository, documentation, idempotency, and recovery validation.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`
- `proxy-fleet/17`
- `proxy-fleet/19`

## Surprises & Discoveries

- Plans 12 and 13 passed static, unit, syntax, renderer, and safe local-daemon checks, but their core happy paths could
  not run because no disposable hosts, routable egress addresses, or isolated multi-node Swarm were available.
- Plan 13 requires at least two listeners on one proxy node while also requiring two proxy nodes. Both checked-in
  inventory validators reject a duplicated egress address, so the complete lab needs three distinct identities, not
  the two addresses previously recorded in this plan.
- The example plan-12 inventory puts `verifier-1` at `172.29.10.20/28`, outside the declared
  `172.29.10.0/28` overlay. The tracked inventory from plan 17 uses `.4/28` and `.4/32` as the worker allow list.
- The current firewall role restores a complete filter table, and the reset role restores a complete open table.
  Those operations overwrite unrelated rules instead of preserving them as this plan requires. The verification
  worker also has no rule admitting the SMTP probe port from the three declared egress addresses.
- The reset role performs Docker Swarm inspection on every `lab_reset` host even though verification workers do not
  receive Docker. Reset also risks forcing the manager to leave before workers when Ansible runs hosts in parallel.
- Swarm initialization advertises the manager's WireGuard address, but worker joins do not explicitly select their
  WireGuard advertise and data-path addresses. Docker may otherwise choose the underlay while the firewall admits
  Swarm traffic only on `wg0`.
- The tracked inventory from plan 17 uses Vagrant aliases for controller SSH and fixed underlay addresses for guest
  WireGuard endpoints. The WireGuard role therefore needs to prefer optional `wireguard_endpoint` values while
  preserving the existing `ansible_host` fallback.
- A proxy connection to the verifier retains its RFC 2544 egress source after WireGuard decryption. The owning peer's
  egress `/32` values must therefore be in `AllowedIPs`, while `Table = off` prevents `wg-quick` from installing routes
  that compete with the verifier's explicit underlay return routes.
- The controller-side listener health check connects to each inventory `bindIp`. An ordinary SSH local forward exposes
  a different local endpoint, so it does not by itself exercise the unchanged reconciler and application path.
- The existing SMTP peer fixture is a Node/TypeScript process, while plan 17 deliberately gives the verifier no Node
  runtime or shared source folder. Its execution model must be selected before this plan can start.
- The local development machine belongs to an unrelated Swarm. Every Docker mutation in this plan must use the
  captured Vagrant SSH configuration to target the disposable manager explicitly.

## Decision Log

- Decision: Consume the four Vagrant machines and tracked inventory from plan 17: one primary manager, two proxy nodes,
  and one verification worker.
  Rationale: This is the smallest topology that proves cross-node placement, two distinct proxy services, worker-only
  listener access, and concurrent capacity behavior without combining trust boundaries. Plan 17 owns the development
  VM topology, guest egress routes, connection handoff, and direct Vagrant lifecycle.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Use three RFC 2544 addresses with `/32` prefixes. Assign two to `proxy-node-a` and one to `proxy-node-b`.
  Rationale: This meets the plan-13 topology and uniqueness rules while proving source binding and return routing. It
  does not claim public Internet egress, provider IP ownership, or SMTP reputation.
  Date/Author: 2026-08-28, project owner and Codex planning.
- Decision: Run the complete fleet workflow on VirtualBox after plan 17 passes its acceptance criteria. Native
  Linux/libvirt is an alternative only after plan 18 passes its separate provider matrix.
  Rationale: One proven provider is sufficient for the application scenarios. This plan's VirtualBox path therefore
  depends on plan 17 without waiting for plan 18; validation of both providers remains separate from fleet behavior.
  Date/Author: 2026-09-06, project owner and Codex planning.
- Decision: Use direct Vagrant commands for VM lifecycle, the tracked inventory for topology, and captured
  `vagrant ssh-config` output for Ansible and remote Docker access.
  Rationale: Vagrant and SSH already provide machine and command access. No command may fall back to the controller's
  unrelated Docker daemon, and this plan does not add a second lifecycle or ownership application around Vagrant.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Select the listener-reachability and verifier-fixture execution models before implementation begins.
  Rationale: The unchanged reconciler and application dial WireGuard `bindIp` values, and the existing fixture requires
  Node. A standard scenario-scoped subnet tunnel, guest-side validation tooling, or a narrow connection override has
  materially different dependencies and cleanup behavior, so the exact start, readiness, stop, and recovery commands
  must be recorded before live mutation.
  Date/Author: 2026-09-05, Codex planning.
- Decision: Replace whole-table restore with one `LEF_PROXY_FLEET_INPUT` chain and one owned jump from `INPUT`.
  Manage only exact proxy-fleet ports in that chain, reject unmatched traffic to those ports, and remove the jump and
  chain during guarded reset. Permit verifier SMTP ports only from egress addresses declared by the inventory; keep
  the status endpoint private through the selected validation transport.
  Rationale: Both first apply and reset must preserve SSH and unrelated firewall state. The SMTP target must accept
  the lab-routed source addresses without exposing its status API or opening the probe to arbitrary peers.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Restrict Swarm inspection and leave operations to manager and proxy groups, leave workers before the sole
  manager, and set each Swarm member's advertise and data-path addresses explicitly to its WireGuard address.
  Rationale: The verifier has no Docker, departures must occur in a deterministic order, and control and data traffic
  must match the firewall and private-overlay contract already promised by plan 12.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Prefer optional `wireguard_endpoint` values for WireGuard peer endpoints, append each peer's declared
  egress `/32` values to its `AllowedIPs`, and set `Table = off` on the interface.
  Rationale: Existing inventories retain the `ansible_host` fallback. The additional peer-specific sources pass
  WireGuard validation without letting `wg-quick` override the explicit verifier return routes from plan 17.
  Date/Author: 2026-09-05, Codex planning.
- Decision: Keep captured SSH, Vault, image, API, OIDC, reachability, and probe artifacts untracked, while committing
  the nonsecret lab inventory, reusable assertions, narrow fixes, redacted fixtures, and operator documentation.
  Rationale: The repository needs repeatable proof without retaining credentials, private keys, machine identifiers,
  join tokens, controller paths, or provider metadata.
  Date/Author: 2026-09-05, Codex planning.
- Decision: Fix implementation defects found by the prescribed scenarios only when the fix preserves the public
  contracts from plans 11 through 13 and fits within this pull request's review scope.
  Rationale: Small corrections are necessary to make the promised behavior pass. A change to application APIs,
  registry ownership, deployment architecture, or public-infrastructure lifecycle is independently useful and needs
  its own ExecPlan instead of silently expanding this validation PR.
  Date/Author: 2026-08-28, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`deploy/proxy-fleet/ansible/` provisions Ubuntu hosts, WireGuard, restricted firewall rules, Swarm membership and
labels, listener manifests, and root-only credentials. `deploy/proxy-fleet/swarm/` renders content-addressed
configurations and secrets, deploys node-constrained 3proxy services, waits for convergence, checks listener egress,
and reconciles owned `/v1/proxies` records. `scripts/proxy-fleet-swarm/` contains the TypeScript renderer, Docker
adapter, registry adapter, reconciler, and SMTP peer probe.

Plan 17 supplies `deploy/proxy-fleet/vagrant/Vagrantfile`, provider-neutral guest network provisioning, a tracked
Ansible inventory, and an ignored captured SSH configuration for four development VMs. This plan operates the machines
through direct `vagrant validate`, `up`, `status`, `ssh`, `ssh-config`, `halt`, `provision`, and `destroy` commands. It
does not rely on generated ownership facts, a controller-route lifecycle, or provider-wide resource discovery.

Plans 12 and 13 explicitly recorded which live scenarios were unavailable. Their implementation pull requests are
merged, so this plan supplies the missing fleet-level proof and narrow corrections rather than rewriting their
historical outcomes.

## Scope and Non-Goals

Validate the merged provisioning and Swarm workflows against a plan-17 Vagrant environment. Fix the known firewall,
probe, reset, WireGuard, and Swarm-address defects; add the smallest reusable validation assertions needed for
deterministic pass-or-fail results; and correct any additional narrow defect exposed by the prescribed scenarios.
Exercise safe cleanup and record sanitized evidence.

Do not add another VM orchestrator, lifecycle wrapper, provider inspector, ownership manifest, or general-purpose
remote command facility. Do not allocate public IPs, create cloud resources, or change the proxy registry API. Do not
migrate the application to Swarm, add high availability, store plaintext secrets in Git, or add database migrations,
backfills, production rollout, production recovery, Internet deliverability, or public-egress claims.

## Plan of Work

Read `deploy/proxy-fleet/validation-decisions.md` from plan 19 before selecting the execution models. It supplies
repository evidence, proposed commands, and open owner questions. Its completion does not approve a proposal or
resolve this plan's readiness condition; record the selected models and their exact procedures here before starting.

Choose either provider whose full plan-17 lifecycle has passed. From `deploy/proxy-fleet/vagrant/`, run `vagrant
validate` and a provider-selected `vagrant up`, inspect all four machines with `vagrant status`, and capture
`vagrant ssh-config` under the ignored `.vagrant/` directory. Use the tracked inventory from plan 17 with that captured SSH
configuration for Ansible and remote Docker. Inspect the remote daemon's Swarm state and stop if it is not inactive or
its later ClusterID differs from the value created during this scenario. Never issue a mutating Docker command without
the explicit remote transport.

Before live application mutation, select and document one listener-reachability execution model that lets the
unchanged reconciler and real application path connect to the inventory's WireGuard listener addresses. Also select
how the SMTP peer fixture runs on `verifier-1`. Record exact start, readiness, use, stop, and interruption cleanup
commands for both, and prove every controller-side network or process change is scenario-scoped. An SSH forward to a
different local endpoint is not sufficient evidence for the unchanged listener path.

Use the tracked inventory, per-host Vault data, and captured SSH facts instead of copying the tracked example
inventory. Prepare an immutable plan-11 image digest reachable by the lab through its management NAT, an API service,
a Redis test stack, an M2M credential file with `platform:admin`, and the selected verifier fixture. Keep the fixture's status
endpoint private. Fetch node-staged proxy credentials through Ansible into an ignored controller directory; never
print them.

Before the first full apply, make the WireGuard peer template prefer `wireguard_endpoint` when supplied and retain the
existing `ansible_host` fallback. Add each peer's distinct listener egress `/32` values to its `AllowedIPs`, and set
`Table = off` so route installation remains explicit. Add focused tests for endpoint fallback, peer-specific source
authorization, peers without listeners, duplicate prevention, and disabled WireGuard route-table management.

Replace the firewall's whole-table restore with `LEF_PROXY_FLEET_INPUT`. Insert one comment-tagged jump from `INPUT`,
preserve existing rules and default policies, and manage only the exact WireGuard, Swarm, listener, and SMTP probe ports
inside the owned chain. Add allow rules before a final rejection for unmatched traffic to each owned port. Derive the
verifier's accepted SMTP source set from the three desired egress IPs and restrict it to the configured SMTP ports.
Make guarded reset remove only owned firewall state. Gate Docker inspection and leave operations to manager and proxy
hosts, execute worker departures before the manager departure, and make a second reset a no-op. Set Swarm
`--advertise-addr` and `--data-path-addr` from each member's WireGuard address during initialization and join. Add
focused role, rendering, and negative tests for these corrected contracts before live mutation.

Run the syntax and inventory checks from plan 12, then a fresh-host `--check --diff`, first apply, and second apply.
Prove Docker and WireGuard installation, private peer reachability, exact `lef-egress0` membership, and the expected
labels. Exercise worker-to-listener access, undeclared-source denial, declared-egress-to-SMTP access,
status-endpoint denial, peer-scoped Swarm ports on `wg0`, absent-egress failure, and conflicting-Swarm failure. Verify
that SSH and the sentinel firewall rule survive and that the second normal apply reports `changed=0`. Run the guarded
reset through the explicit `lab_reset` group and prove it removes only role-owned files, rules, labels, WireGuard
state, and disposable Swarm membership. Recreate the Vagrant lab before continuing if a negative or reset scenario
changes the baseline.

Provision the clean lab again and run plan 13. Render and validate the stack locally while directing deployment
through Docker's lab-manager SSH transport. Deploy two proxy services and inspect tasks, placement constraints, host
networking, node-specific configurations and secrets, explicit WireGuard Swarm addresses, and absence of ingress
proxy ports. Authenticate through all three listeners to the verifier fixture and assert each observed source equals
its declared egress address. Reconcile twice and prove the second deployment and reconciliation create no object,
registry, credential, or state drift. Change one owned listener, remove another, and verify content-addressed
replacement, safe pruning, and draining without touching manual registry records.

Run two verification processes through the selected listener-reachability model and prove the existing per-proxy and
per-MX Redis limits. Exercise failed health validation, recovery from draining, interrupted deployment before
reconciliation, and an interrupted reconciliation rerun. Finish by draining owned records, removing only the named
stack and ownership-labeled objects through the remote manager, stopping the selected fixture and reachability
mechanism, running the guarded host reset, and invoking `vagrant destroy -f`. Confirm that the controller's unrelated
Swarm remains unchanged.

## Interfaces and Dependencies

No application endpoint, DTO, persistence schema, registry ownership rule, or provider lifecycle change is planned.
Expected corrections are in `deploy/proxy-fleet/ansible/roles/firewall/`,
`deploy/proxy-fleet/ansible/roles/proxy_fleet_reset/tasks/main.yml`,
`deploy/proxy-fleet/ansible/roles/swarm/tasks/join_or_init.yml`,
`deploy/proxy-fleet/ansible/roles/wireguard/templates/wg0.conf.j2`, and their focused tests. Remote-manager identity
checks may extend `scripts/proxy-fleet-swarm/docker-swarm-cli.ts` and `deploy-cli.ts`; purpose-specific assertions stay
under `deploy/proxy-fleet/` or `scripts/proxy-fleet-swarm/`.

Inputs are the tracked inventory and captured SSH configuration from plan 17, the Vault data from plan 12, an immutable
image digest, an API URL, an M2M credential file, a Redis-backed worker environment, and the verifier SMTP fixture.
Existing inventories remain compatible with the optional `wireguard_endpoint` field supplied by the tracked Vagrant
lab inventory.

The exact listener-reachability and verifier-fixture execution models remain intentionally unselected. Their
interfaces, dependencies, privilege requirements, readiness signals, and cleanup commands must be added here before
implementation begins. A local port mapped to a different address does not prove the unchanged `listener.bindIp` path.

This plan depends on merged plans 12 and 13 and on the Vagrant-native development-lab contract from plan 17. Public
IPs, cloud-provider APIs, provider-wide discovery, and persistent controller routing are deliberately not dependencies.

## Acceptance Criteria

- A fresh four-host Ubuntu 24.04 plan-17 lab completes check mode and two normal provisioning applies; the second
  normal apply reports `changed=0` outside explicitly documented nondeterministic facts.
- WireGuard peers reach declared private addresses, Docker advertises and transports Swarm traffic on those addresses,
  the verification worker reaches all three listeners, and an undeclared source cannot reach listener or peer-scoped
  Swarm ports.
- `wireguard_endpoint` selects the lab underlay for peer endpoints, while inventories that omit it continue to use
  `ansible_host`.
- Each WireGuard peer retains its overlay `/32` and accepts only that peer's declared listener egress `/32` values as
  additional sources. `Table = off` prevents `wg-quick` from installing competing routes, while the overlay connected
  route and plan-17 verifier return routes remain effective.
- All three egress identities are present only on the declared `lef-egress0` interfaces. The verifier admits its SMTP
  port only from those identities, denies its status port off loopback, and observes the exact declared source through
  every authenticated listener.
- Egress-interface validation, conflicting-Swarm detection, remote-Docker identity, and invalid inventory fail before
  destructive application or guest mutation.
- First apply and guarded reset preserve SSH, default policies, and an unrelated sentinel firewall rule. Reset removes
  only proxy-fleet-owned rules and state, skips Docker work on the verifier, leaves workers before the sole manager,
  and is safe to repeat.
- Swarm deploys exactly one service on each proxy node with the expected host networking, immutable image, isolated
  configuration and secret, WireGuard control/data addresses, and no routing-mesh listener publication.
- A second unchanged deployment and reconciliation creates no duplicate service, configuration, secret, or proxy
  record and performs no unnecessary registry mutation.
- Changed and removed listeners replace or prune only unreferenced owned objects, become healthy or draining as
  designed, and never modify manual registry records.
- Two verification processes cannot exceed the configured per-proxy or per-MX Redis limits.
- The selected listener-reachability model exercises the same WireGuard `bindIp` endpoints consumed by the reconciler
  and application. It has an explicit readiness check and restores every change to controller-side networking,
  processes, and files on success, failure, and interruption.
- The selected verifier-fixture procedure reports each observed RFC 2544 source address, keeps its status endpoint
  private, and leaves no fixture process or artifact after cleanup.
- Interrupted deployment or reconciliation converges on safe rerun, and final cleanup leaves no active owned registry
  member, named stack, owned Swarm object, temporary reachability mechanism, role-owned guest state, or Vagrant machine.
- The controller's unrelated Docker Swarm remains unchanged throughout the workflow.
- No live credential, join token, private key, raw proxy configuration, machine identifier, customer data, or
  controller path is committed or printed in ordinary validation output.
- The recorded result describes lab-routed egress only and makes no public-Internet, provider-address, reputation,
  production-readiness, provider-forensic, or crash-safety claim.

## Validation

Run the exact static commands from plans 12, 13, and 17 first: Vagrant and shell validation, Ansible lint, inventory
listing, syntax checks, whole-inventory validation, plaintext-secret scan, focused proxy-fleet Jest suites, stack
rendering, and `docker stack config`. Add focused tests for owned firewall insertion/removal, verifier SMTP rules,
role-gated and ordered reset, explicit Swarm addresses, WireGuard endpoint and `AllowedIPs` rendering, exact
remote-Docker selection, and the selected reachability mechanism and fixture cleanup. Then run repository lint,
typecheck, tests, build, documentation lint, plan-sync dry run, and `git diff --check`.

Before implementation, insert the exact selected listener-reachability and verifier-fixture commands here. The live
evidence must include readiness, a reconciler health check that preserves the inventory `bindIp` and port as the
advertised registry endpoint, an actual application verification through that reconciled member, normal cleanup, and
interrupted cleanup. A localhost-only probe does not satisfy this plan.

On the disposable lab, capture redacted Ansible recaps from both applies, `wg show`, private reachability, and positive
and negative firewall probes. Capture interface-address membership, Swarm address and label inspection, service
placement, and the ownership of configurations and secrets. Also capture all three authenticated egress observations,
registry transitions, Redis limit evidence, second-run no-op counts, interruption recovery, repeated reset, and direct
Vagrant destruction. Repeat the complete lab workflow from clean VMs once after any infrastructure-affecting fix.

Bruno is not applicable because no application HTTP contract changes. Use the existing authenticated registry
adapter, focused tests, and live reconciliation for its unchanged API boundary.

## Idempotence and Recovery

Every mutating Ansible command targets the tracked plan-17 inventory. Every Docker command carries the captured
remote-manager SSH transport. The selected reachability mechanism and fixture must document exact ownership and
interrupted cleanup. An interrupted provision or deployment can be rerun through convergent roles, content-addressed
Swarm objects, and compare-before-write reconciliation. Drain registry entries before removing services.

If inventory, SSH, remote ClusterID, stack ownership, or guest validation disagrees, stop rather than leave, reset,
relabel, prune, or destroy application state. Preserve the Vagrant environment, captured SSH configuration, and Vault
data, then rerun the same playbook after a partial application failure. After partial stack cleanup, inspect owned
records and objects through the remote manager before retrying. Follow the selected mechanism's cleanup procedure.
Use the guarded Ansible reset for application and guest cleanup, then use direct Vagrant status and destroy commands
for the machines.

## Artifacts and Notes

Record plan-17 provider evidence, command versions, sanitized inventory shape, recaps from both applies, negative
probe results, sentinel preservation, Swarm address and placement assertions, three egress assertions, stable object
counts, capacity results, recovery evidence, and final Vagrant status. Do not record absolute host paths, machine IDs
or provider IDs, Vault data, join tokens, M2M secrets, proxy credentials, WireGuard private material, or routable
addresses outside the fixed lab ranges.

## Plan readiness

Ready after the listener-reachability and verifier-fixture execution models are selected and documented.
