# Provision disposable proxy nodes with Ansible

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make proxy-node setup reproducible from versioned, non-secret inventory. A developer can apply one playbook to disposable Ubuntu hosts and observe Docker, WireGuard, firewall policy, Swarm membership and labels, validated egress addresses, and node-specific 3proxy topology ready for the Swarm deployment.

## Progress

- [ ] 2026-08-15 — Define the non-secret inventory and secret-variable contracts.
- [ ] 2026-08-15 — Implement idempotent host, WireGuard, firewall, and Swarm roles.
- [ ] 2026-08-15 — Validate check mode, repeat application, and safe lab reset.

## Surprises & Discoveries

- Public-IP allocation and persistent secondary-IP binding are cloud-provider-specific. No provider has been selected, so generic automation cannot safely create those resources.
- Swarm node labels must be applied from a manager, while listener topology and address validation are node-local responsibilities.

## Decision Log

- Decision: Target disposable Ubuntu 24.04 LTS hosts for the reference role.
  Rationale: A concrete operating-system contract is required for package, WireGuard, firewall, and service-management idempotence.
  Date/Author: 2026-08-15, project planning.
- Decision: Validate preassigned egress IPs instead of creating or persisting provider-owned public IPs.
  Rationale: VM and IP lifecycle remains outside the repository until a cloud provider is selected; silently inventing generic network configuration could break remote access.
  Date/Author: 2026-08-15, project planning.
- Decision: Initialize or join only an inactive Swarm and fail on conflicting existing membership.
  Rationale: Leaving or rejoining an existing cluster is destructive and must not happen implicitly.
  Date/Author: 2026-08-15, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 01 defines the image's listener-manifest and credential contracts. The application already registers proxy capacity through authenticated `/v1/proxies` CRUD and enforces capacity in Redis. The repository currently has local Compose files but no Ansible inventory, WireGuard host automation, or Swarm host lifecycle.

The inventory identity `proxy_node_id` links an Ansible host, a Swarm node label, node-specific config/secret names, and the desired registry descriptions used by plan 03. Each entry in `proxy_listeners` represents one egress IP and includes its listener port and registry capacity.

## Scope and Non-Goals

Add `deploy/proxy-fleet/ansible/` with a pinned collection requirements file, `ansible.cfg`, an example inventory, a `proxy-fleet.yml` playbook, focused roles, validation tasks, and a guarded lab reset playbook. Manage Docker Engine, WireGuard, host firewall rules, Swarm initialization/join, node labels, node-local directories, and the rendered non-secret listener manifest.

Do not create VMs, allocate or attach public IPs, configure provider routing, deploy the 3proxy Swarm services, register application proxies, store plaintext secrets in Git, add production rollout/recovery, or add migrations.

## Plan of Work

Define inventory groups for `swarm_managers`, `proxy_nodes`, and `verification_workers`. Require one primary manager address, a private WireGuard CIDR, and explicit node variables: `proxy_node_id`, `wireguard_address`, `egress_interface`, and `proxy_listeners`. Each listener contains the plan-01 fields plus `maxConcurrent`, `requestsPerMinute`, an optional weight, and `desiredState` restricted to `active` or `disabled`. Validate unique node IDs, egress IDs, listener endpoints, and egress IPs across the complete inventory before changing hosts.

Keep WireGuard private keys, peer preshared keys, Swarm join material when externally supplied, and per-listener proxy credentials in Ansible Vault or an external secret-variable file. Mark secret-bearing tasks `no_log: true` and `diff: false`; write host secrets with mode `0600`. The tracked example inventory contains only documentation placeholders and unroutable example addresses.

Install pinned/supported Docker Engine and WireGuard packages, enable their services, and configure private peer connectivity. Apply host-input firewall rules that admit WireGuard, Swarm control/data traffic only from declared private peers, and 3proxy listener ports only from verification-worker WireGuard CIDRs. Preserve SSH before activating firewall changes.

Before Swarm work, inspect current membership. Initialize the first manager only when inactive; join other declared nodes only when inactive; and fail with recovery guidance if a node belongs to another Swarm. From the primary manager, apply `proxy.egress=true` and `proxy.node-id=<proxy_node_id>` labels to proxy nodes. Do not remove unrelated labels.

Validate every declared `egressIp` is already assigned to `egress_interface`; fail before deployment artifacts are considered ready if any is missing. Render the plan-01 listener manifest to `/etc/lead-email-finder/proxy-fleet/listeners.json` and the node credential input to a root-only staging path for plan 03. Do not start 3proxy in this pull request.

Add a reset playbook restricted to the explicit lab inventory and gated by `proxy_fleet_allow_reset=true`. It removes only files, firewall rules, WireGuard configuration, labels, and inactive disposable Swarm membership created by these roles; it never deletes application data or broad host paths.

## Interfaces and Dependencies

The inventory schema under `deploy/proxy-fleet/ansible/inventory/example.yml` becomes the fleet topology source of truth. Its rendered listener manifest must conform exactly to plan 01. Plan 03 consumes the same inventory plus node-local artifacts to render Swarm services and reconcile proxy registry capacity.

This plan depends on plan 01's image contracts. It introduces Ansible as a development dependency and targets Ubuntu 24.04 LTS. Official check-mode behavior and its limitations are documented in the [Ansible check-mode guide](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html).

## Acceptance Criteria

- Inventory validation rejects duplicate node/egress identities, duplicate endpoints or egress IPs, missing required limits, and secrets placed in tracked inventory.
- A fresh declared Ubuntu 24.04 lab host receives Docker, WireGuard, the restricted firewall, and only its node-specific manifest and secret staging files.
- WireGuard peers can reach declared private addresses, while an undeclared source cannot reach a proxy listener port.
- Provisioning fails closed when a declared egress IP is absent from the declared host interface.
- An inactive lab forms the declared Swarm and receives the expected proxy-node labels; a node in a conflicting Swarm is not automatically removed or rejoined.
- `ansible-playbook --check --diff` reports expected changes without mutating a fresh host, and a second normal apply reports zero unintended changes.
- Secret values are absent from Git, normal play output, diffs, and rendered non-secret manifests.
- The guarded reset touches only resources created by the proxy-fleet roles.
- No 3proxy service, registry record, schema migration, or production resource is created.

## Validation

Run `ansible-lint`, `ansible-inventory --list`, and `ansible-playbook --syntax-check` against the example inventory. On disposable Ubuntu 24.04 VMs, run check mode, apply twice, and assert the second recap has `changed=0`. Verify `wg show`, private peer reachability, `ip -json address` membership for every egress IP, firewall allow/deny probes, `docker node ls`, and node labels. Exercise the absent-egress-IP and conflicting-Swarm failures. Run the guarded reset and confirm it leaves unrelated labels, firewall rules, and application data untouched. Finally run repository lint/typecheck/tests/build and `git diff --check`.

## Idempotence and Recovery

Every role converges from declared state and uses handlers only when managed files change. A failed apply can be rerun after correcting inventory, connectivity, or missing egress assignment. Conflicting Swarm membership requires an explicit operator decision; the playbook prints the node and cluster identity and stops. The guarded reset is available only for disposable lab hosts and requires the explicit boolean opt-in.

## Artifacts and Notes

Record sanitized inventory validation, the first and second play recaps, node-label output, WireGuard reachability, firewall negative probes, and the list of verified egress addresses. Do not record Vault data, join tokens, private keys, or proxy credentials.

## Plan readiness

Ready to implement after plan 01.
