# Provision disposable proxy nodes with Ansible

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make proxy-node setup reproducible from versioned, non-secret inventory. A developer can apply one playbook to disposable Ubuntu hosts and observe Docker, WireGuard, firewall policy, Swarm membership and labels, validated egress addresses, and node-specific 3proxy topology ready for the Swarm deployment.

## Progress

- [x] 2026-08-20 — Define the non-secret inventory and secret-variable contracts.
- [x] 2026-08-20 — Implement idempotent host, WireGuard, firewall, and Swarm roles.
- [x] 2026-08-20 — Validate what this environment allows (lint/syntax-check/inventory checks, plus a live Swarm conflict-path test); check mode/repeat-apply/safe lab reset against a real host are **not verified in this environment** — see Outcomes & Retrospective.

## Plan dependencies

- `proxy-fleet/11`

## Surprises & Discoveries

- Public-IP allocation and persistent secondary-IP binding are cloud-provider-specific. No provider has been selected, so generic automation cannot safely create those resources.
- Swarm node labels must be applied from a manager, while listener topology and address validation are node-local responsibilities.
- No cloud VMs were available to implement against. Negotiated with the user up front: implement every role/playbook per spec; validate everything that doesn't need a live host for real (`ansible-lint`, `ansible-inventory`, `--syntax-check`, a static secrets-in-git check); and, since the development machine's own Docker daemon is already an active Swarm manager for an unrelated real cluster, use it **only** to prove the Decision Log's "fail closed on conflicting Swarm membership, touch nothing" path live — never to actually join/init/label/leave that real swarm. See Outcomes & Retrospective for exactly what that live test covered.
- `docker node update --label-add`/`--label-rm` always exit 0 regardless of whether the label actually changed — using them directly under `changed_when: true` would report `changed=true` on every idempotent re-run. Fixed by reading the node's current `Spec.Labels` first (`docker node inspect --format '{{json .Spec.Labels}}'`) and only issuing the update when the value actually differs.
- Docker has no built-in way to answer "does this host belong to the Swarm *this playbook* created," only "is it active in *some* Swarm." Resolved with a locally-recorded ClusterID fact file (`<state-dir>/swarm-cluster-id`), written after a successful init/join and compared against the live `docker info` ClusterID on every subsequent run; an explicit `proxy_fleet_trusted_cluster_id` inventory var is the only sanctioned way to adopt a pre-existing Swarm deliberately.
- Docker's official apt-repository setup instructions (`get_url` + `apt_repository` with `signed-by=<path>`) map onto Ansible's now-deprecated `ansible.builtin.apt_repository` module. `ansible.builtin.deb822_repository` (its replacement) accepts a GPG key **URL** directly via its own `signed_by` parameter, so the separate key-download task was unnecessary.
- Ansible's Jinja templating processes `ansible.builtin.command`'s `cmd:` field, so a literal Docker Go-template string like `{{json .Swarm}}` needs `{% raw %}...{% endraw %}` around it or Jinja tries (and fails) to evaluate it as its own expression.
- `ansible-lint`'s `production` profile enforces per-role variable prefixes (`var-naming[no-role-prefix]`), which would force `roles/swarm`, `roles/proxy_topology`, and `roles/proxy_fleet_reset` to each maintain their own independently-driftable copy of the shared state-directory/manifest/credential path constants instead of one shared source of truth. Disabled that specific rule in `.ansible-lint` with a documented rationale, since these roles are only ever composed together by this repo's own playbooks, not published for independent reuse.
- `ansible-galaxy collection install` (and, transitively, a plain `ansible-lint .` run) can populate a project-local `.ansible/collections/` cache containing the full downloaded collection source (including its own `.js` test fixtures) — large, and enough to make `eslint .` choke on files it was never meant to see. Gitignored `.ansible/` and excluded `deploy/**` from `eslint.config.mjs`, matching the existing `docker/scripts/**` exclusion for the same reason.

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
- Decision: Secrets live in Ansible Vault (`inventory/host_vars/<hostname>/vault.yml`), not an external gitignored file.
  Rationale: versions secrets alongside the topology that describes them — real infrastructure-as-code — and matches Ansible's own idiom directly (auto-loaded, no extra config). Doesn't conflict with `docker/secrets/*.txt`, which solves a different problem (runtime container-secret injection, not provisioning-time secret versioning).
  Date/Author: 2026-08-20, implementation.
- Decision: The Swarm role uses raw `ansible.builtin.command` against the `docker` CLI, not the `community.docker` collection.
  Rationale: that collection's own idempotency model still can't answer "is this the Swarm I created" — the ClusterID fact-file bookkeeping is needed either way — and it would require installing the Docker Python SDK on every managed host purely to run what are one-line CLI calls.
  Date/Author: 2026-08-20, implementation.
- Decision: The egress-IP-to-interface check (`roles/proxy_topology`) uses gathered `ansible_facts`, scoped to exactly the declared `egress_interface` — a deliberate, narrower divergence from plan 11's own container-side check, which scans every interface in the network namespace.
  Rationale: this ExecPlan's own Plan of Work explicitly requires interface-scoping ("assigned to `egress_interface`"), which plan 11's broader check doesn't need to satisfy (it has no interface concept at all, just the network namespace).
  Date/Author: 2026-08-20, implementation.
- Decision: `ansible.builtin.iptables` (one task per rule, comment-tagged `proxy-fleet:<rule-id>`) applied via `community.general.iptables_state`'s `async`/`poll: 0` self-rollback pattern, not UFW.
  Rationale: UFW's abstraction doesn't cleanly express "Swarm ports only from declared peers" + "listener ports only from worker CIDRs" as precisely as direct iptables rules, and Ubuntu 24.04's UFW is iptables underneath regardless. The rollback mechanism is a task **attribute** (`async`/`poll`), not a module parameter, confirmed against the installed `community.general` 13.3.0's own `ansible-doc` output.
  Date/Author: 2026-08-20, implementation.
- Decision: Credential staging path is `/var/lib/lead-email-finder/proxy-fleet/credentials.json`, distinct from both the manifest path (`/etc/...`) and plan 11's container-runtime default (`/run/secrets/proxy_credentials`).
  Rationale: signals it's material staged for plan 13's automated consumption, not operator-inspectable config; plan 12 never creates the runtime path and never starts a container. Documented as the explicit plan-13 handoff contract in `README.md`.
  Date/Author: 2026-08-20, implementation.

## Outcomes & Retrospective

Implemented and validated to the extent this environment allows (no cloud provider or disposable VMs — negotiated with the user before implementation began; see Surprises & Discoveries).

**Verified for real:**
- `ansible-lint .` — clean at the `production` profile (0 failures after fixing 37 initial findings: task/handler name casing, a stray blank line, a missing play name, and the `var-naming[no-role-prefix]` rule explicitly disabled with a documented rationale).
- `ansible-inventory -i inventory/example.yml --list` — parses cleanly, `group_vars/all.yml` auto-loads correctly.
- `ansible-playbook --syntax-check` — clean for both `playbooks/proxy-fleet.yml` and `playbooks/reset.yml`.
- `playbooks/validate-inventory.yml` — run against the example inventory (passes) and against a deliberately-duplicated-egressId copy (fails with the expected message), proving the whole-inventory duplicate/shape checks work.
- `sh scripts/check-no-plaintext-secrets.sh` — passes against the tracked example inventory (no vault content, so nothing to flag); separately confirmed it correctly flags an injected plaintext `wireguard_private_key:` in a throwaway test file.
- **The Swarm role's conflicting-membership fail-closed path, against the real local Docker daemon** (already an active single-node Swarm manager for an unrelated real cluster): ran `roles/swarm/tasks/inspect.yml` + `join_or_init.yml` directly (state-directory var scoped to `/tmp` for the test, never `/etc`) and confirmed (a) the conflict is detected and the play fails with the exact expected message, citing the real live ClusterID and recovery guidance, with **zero** `docker swarm init/join` tasks executing (confirmed via full task-by-task output — both appear as `skipping`); (b) the `proxy_fleet_trusted_cluster_id` escape hatch correctly adopts the real cluster (writes the `/tmp`-scoped fact file, `changed=2`, still no real Swarm mutation); (c) a subsequent run recognizes the adopted state and is fully idempotent (`changed=0`).
- Repo-wide: `corepack pnpm lint` (0 errors, the same 2 pre-existing unrelated warnings as plan 11's baseline), `corepack pnpm typecheck` (0 issues, via the same root-owned-`dist/`-workaround scratch tsconfig plan 11's implementation used), `corepack pnpm test:ci` (680/680 non-skipped tests), `corepack pnpm build` (431 files compiled, 0 issues), `git diff --check` (clean).

**Not verified live in this environment** (implemented per spec, no disposable host available):
- Docker Engine / WireGuard-tools installation and idempotence (`apt`/`deb822_repository` tasks, `changed=0` on a second real apply).
- WireGuard tunnel establishment and peer reachability; an undeclared source failing to reach a proxy listener port.
- Firewall rule application and its allow/deny behavior (SSH preserved, Swarm ports peer-scoped, listener ports worker-CIDR-scoped); the `community.general.iptables_state` async-rollback behavior itself under an actual connection loss.
- The Swarm role's **happy path** (`docker swarm init`/`join` actually executing, not just the fail-closed branch) and the labeling step's real idempotence against `docker node update`.
- `roles/proxy_topology`'s manifest/credential rendering and interface-scoped egress-IP check against real interface facts (`ansible_facts[egress_interface]`).
- The guarded reset playbook end-to-end (`proxy_fleet_allow_reset` + `lab_reset` gate, firewall-open restore, WireGuard teardown, label removal, conditional Swarm leave).
- `ansible-playbook --check --diff` twice against a real host with `changed=0` on the second run (the full acceptance criterion, as opposed to the individual pieces above).

A future PR (or the point at which a cloud provider is selected for plan 12/13's eventual real rollout) should re-run this ExecPlan's full Validation section against real disposable Ubuntu 24.04 hosts before this is trusted for anything beyond development.

## Context and Orientation

Plan 11 defines the image's listener-manifest and credential contracts. The application already registers proxy capacity through authenticated `/v1/proxies` CRUD and enforces capacity in Redis. The repository currently has local Compose files but no Ansible inventory, WireGuard host automation, or Swarm host lifecycle.

The inventory identity `proxy_node_id` links an Ansible host, a Swarm node label, node-specific config/secret names, and the desired registry descriptions used by plan 13. Each entry in `proxy_listeners` represents one egress IP and includes its listener port and registry capacity.

## Scope and Non-Goals

Add `deploy/proxy-fleet/ansible/` with a pinned collection requirements file, `ansible.cfg`, an example inventory, a `proxy-fleet.yml` playbook, focused roles, validation tasks, and a guarded lab reset playbook. Manage Docker Engine, WireGuard, host firewall rules, Swarm initialization/join, node labels, node-local directories, and the rendered non-secret listener manifest.

Do not create VMs, allocate or attach public IPs, configure provider routing, deploy the 3proxy Swarm services, register application proxies, store plaintext secrets in Git, add production rollout/recovery, or add migrations.

## Plan of Work

Define inventory groups for `swarm_managers`, `proxy_nodes`, and `verification_workers`. Require one primary manager address, a private WireGuard CIDR, and explicit node variables: `proxy_node_id`, `wireguard_address`, `egress_interface`, and `proxy_listeners`. Each listener contains the plan-11 fields plus `maxConcurrent`, `requestsPerMinute`, an optional weight, and `desiredState` restricted to `active` or `disabled`. Validate unique node IDs, egress IDs, listener endpoints, and egress IPs across the complete inventory before changing hosts.

Keep WireGuard private keys, peer preshared keys, Swarm join material when externally supplied, and per-listener proxy credentials in Ansible Vault or an external secret-variable file. Mark secret-bearing tasks `no_log: true` and `diff: false`; write host secrets with mode `0600`. The tracked example inventory contains only documentation placeholders and unroutable example addresses.

Install pinned/supported Docker Engine and WireGuard packages, enable their services, and configure private peer connectivity. Apply host-input firewall rules that admit WireGuard, Swarm control/data traffic only from declared private peers, and 3proxy listener ports only from verification-worker WireGuard CIDRs. Preserve SSH before activating firewall changes.

Before Swarm work, inspect current membership. Initialize the first manager only when inactive; join other declared nodes only when inactive; and fail with recovery guidance if a node belongs to another Swarm. From the primary manager, apply `proxy.egress=true` and `proxy.node-id=<proxy_node_id>` labels to proxy nodes. Do not remove unrelated labels.

Validate every declared `egressIp` is already assigned to `egress_interface`; fail before deployment artifacts are considered ready if any is missing. Render the plan-11 listener manifest to `/etc/lead-email-finder/proxy-fleet/listeners.json` and the node credential input to a root-only staging path for plan 13. Do not start 3proxy in this pull request.

Add a reset playbook restricted to the explicit lab inventory and gated by `proxy_fleet_allow_reset=true`. It removes only files, firewall rules, WireGuard configuration, labels, and inactive disposable Swarm membership created by these roles; it never deletes application data or broad host paths.

## Interfaces and Dependencies

The inventory schema under `deploy/proxy-fleet/ansible/inventory/example.yml` becomes the fleet topology source of truth. Its rendered listener manifest must conform exactly to plan 11. Plan 13 consumes the same inventory plus node-local artifacts to render Swarm services and reconcile proxy registry capacity.

This plan depends on plan 11's image contracts. It introduces Ansible as a development dependency and targets Ubuntu 24.04 LTS. Official check-mode behavior and its limitations are documented in the [Ansible check-mode guide](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html).

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

**Recorded this implementation** (no Vault data, join tokens, private keys, or proxy credentials involved):
- `ansible-inventory --list` against `inventory/example.yml`: parses cleanly, 2 `proxy_nodes` / 1 `swarm_managers` / 1 `verification_workers` / empty `lab_reset`, `group_vars/all.yml` fleet-wide defaults present on every host.
- `playbooks/validate-inventory.yml` recap (example inventory): `ok=12 changed=0 failed=0` — "2 proxy node(s), 2 listener(s), no duplicate identities or endpoints."
- Live Swarm conflict-path test recap (real local Docker daemon, `/tmp`-scoped state dir): fail-closed run `ok=8 changed=1 failed=1 skipped=10` (the one `changed` is the `/tmp` scratch state directory, not the Swarm); escape-hatch adoption run `ok=10 changed=2 failed=0 skipped=10`; idempotent re-run `ok=9 changed=0 failed=0 skipped=11`.
- `ansible-lint .`: `production` profile, 0 failures, 0 warnings, 32 files processed.

## Plan readiness

Implemented (PR pending; see Progress and Outcomes & Retrospective for exactly what is and isn't live-verified in this environment).
