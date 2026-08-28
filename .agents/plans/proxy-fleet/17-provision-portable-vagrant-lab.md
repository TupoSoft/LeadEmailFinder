# Provision a Portable Vagrant Proxy-Fleet Lab

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Give developers one disposable four-VM Ubuntu 24.04 lab that behaves the same from WSL2 and native Linux. From
either environment, a developer can run a Bash entry point, create one manager, two proxy nodes, and one verifier,
and receive an ignored plan-12-compatible Ansible inventory. The developer can observe three distinct lab-routed
egress identities, destroy only the Vagrant-owned resources, recreate the clean lab, and then use it to complete
plan `proxy-fleet/16` without acquiring cloud hosts or public IP addresses.

## Progress

- [ ] (2026-08-28) Add fail-closed provider, host, address, and ownership preflight checks.
- [ ] (2026-08-28) Implement the shared four-VM topology and thin VirtualBox and libvirt provider adapters.
- [ ] (2026-08-28) Generate reusable ignored SSH, Ansible, Vault, and ownership artifacts without exposing secrets.
- [ ] (2026-08-28) Prove idempotent lab-routed egress, halt, destroy, and clean recreation on both supported providers.
- [ ] (2026-08-28) Complete focused tests, documentation, secret scans, plan synchronization, and recovery validation.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`

## Surprises & Discoveries

- The live scenario in plan 13 requires two proxy nodes and at least two listeners on one node. Both the Ansible inventory
  validator and the TypeScript inventory parser reject duplicate `egressIp` values, so the lab needs three distinct
  egress identities rather than the two currently named by plan 16.
- `deploy/proxy-fleet/ansible/inventory/example.yml` assigns `verifier-1` the address `172.29.10.20/28`, which is
  outside the declared `172.29.10.0/28` overlay. The portable lab must use `172.29.10.4/28` and restrict listener
  access to the worker `/32`.
- The WireGuard template currently uses each peer's `ansible_host` value as its UDP endpoint. Vagrant SSH commonly reaches
  guests through distinct localhost forwarded ports, while WireGuard peers need mutually reachable underlay
  addresses. Portable inventory therefore needs a separate, optional endpoint field.
- A WSL checkout under the Linux filesystem cannot be assumed to work as a Windows VirtualBox shared folder. The
  lab must disable the default Vagrant `/vagrant` mount and upload its small provisioners through the SSH communicator.
- Canonical does not publish Ubuntu 24.04 Vagrant boxes. The current common AMD64 release of
  `bento/ubuntu-24.04` that provides both VirtualBox and libvirt artifacts is `202508.03.0`; the registry does not
  publish artifact checksums for that release.
- The current WSL development environment has no Vagrant installation and no `/dev/kvm`. Those observations are
  host prerequisites, not evidence against the design: WSL uses Windows VirtualBox, while native Linux uses KVM.

## Decision Log

- Decision: Use one `Vagrantfile` with shared machine definitions and thin `virtualbox` and `libvirt` provider blocks.
  Rationale: Role names, guest provisioning, addresses, and generated inventory must not fork by host operating
  system; only provider-specific box, resource, and private-network settings should differ.
  Date/Author: 2026-08-28, project owner and Codex planning.
- Decision: Support Windows 11 WSL2 with Windows VirtualBox through Vagrant's WSL interop, and native AMD64 Linux
  with the `vagrant-libvirt` plugin against system libvirt and KVM.
  Rationale: These are the two requested development environments. Hyper-V ignores the deterministic networking
  declarations this lab requires, and WSL itself does not expose the KVM device needed by libvirt.
  Date/Author: 2026-08-28, project owner and Codex planning.
- Decision: Pin `bento/ubuntu-24.04` version `202508.03.0`, set `config.vm.box_architecture = "amd64"`, and assert
  the selected artifact architecture and Ubuntu 24.04 from guest state.
  Rationale: A single tested box release minimizes provider drift. The missing upstream checksums are accepted only
  for this disposable, non-production lab; the version must not float, and no production or customer secret may
  enter these guests.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Give each VM two virtual CPUs and 2 gigabytes of memory by default, with documented positive integer overrides.
  Rationale: Eight gigabytes and eight virtual CPUs fit the known development host while leaving enough room for Docker,
  WireGuard, Swarm, 3proxy, and the verification fixture. Provider defaults must remain identical.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Separate provider NAT, a guest-only static underlay, the WireGuard overlay, and lab-routed egress
  identities. Use underlay addresses `192.168.250.11` through `.14`, WireGuard addresses `172.29.10.1` through
  `.4` inside one `/28`, and nonpublic RFC 2544 egress identities `198.18.0.21/32`, `.22/32`, and `.23/32`.
  Rationale: NAT keeps package downloads and Vagrant SSH independent of the test path. The underlay gives guests
  stable WireGuard endpoints. Routed `/32` identities prove exact source binding without pretending to be public
  provider addresses.
  Date/Author: 2026-08-28, project owner and Codex planning.
- Decision: Allow `PROXY_FLEET_LAB_UNDERLAY_CIDR` to replace the default `192.168.250.0/24` only with a private IPv4
  `/24`. Derive the four role addresses at offsets 11 through 14 from its network address and reject any change while
  an owned Vagrant environment exists.
  Rationale: A deterministic override resolves a genuine host-network collision without allowing topology,
  inventory, routes, and evidence to choose different addresses or prefix sizes.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Put two `proxy-node-a` identities and one `proxy-node-b` identity on `lef-egress0`, a provider-neutral
  dummy interface. Add matching return routes on the verifier through the isolated underlay.
  Rationale: VirtualBox and libvirt assign different physical interface names. This lab-owned interface satisfies
  the literal `egress_interface` validation in plan 12 and makes repeatable source-address routing independent of provider
  NIC naming.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Accept the verifier observation of all three nonpublic source addresses as the egress proof for plans
  16 and 17.
  Rationale: The requested lab needs to prove listener-to-egress binding, routing, and reconciliation. Public-IP
  ownership, Internet routing, reputation, and cloud lifecycle are different production concerns and remain outside
  this road map.
  Date/Author: 2026-08-28, project owner.
- Decision: Extend the plan-12 inventory with optional `wireguard_endpoint`, defaulting to `ansible_host` for existing
  inventories. Generated Vagrant inventory takes controller SSH host, port, user, and key from
  `vagrant ssh-config`, while `wireguard_endpoint` carries the guest-reachable underlay address.
  Rationale: This preserves existing inventory behavior and avoids assuming WSL can route directly to a Windows
  VirtualBox private subnet.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Expose a POSIX entry point at `deploy/proxy-fleet/vagrant/lab.sh` with
  `preflight`, `up`, `verify`, `inventory`, `connect`, `disconnect`, `status`, and `destroy` commands and an
  explicit `--provider virtualbox|libvirt` option. Do not require PowerShell or a synced project folder.
  Rationale: The same command surface must work from WSL and native Linux, and provider selection must be visible in
  validation evidence rather than guessed after mutation begins.
  Date/Author: 2026-08-28, project owner and Codex planning.
- Decision: Implement `connect` as a PID-tracked, narrowly scoped sshuttle route through the manager for only the lab
  underlay and WireGuard CIDRs; implement `disconnect` as its ownership-checked inverse.
  Rationale: Reconciliation and controller-side verification need transparent TCP access to the registered
  WireGuard listener addresses. This works even when WSL cannot route directly to a Windows VirtualBox internal
  network and does not expose or replace the default controller route.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Keep `.vagrant/`, generated inventory, SSH configuration, Vault data, passwords, private keys, and machine
  metadata under narrowly ignored lab paths. Generate secrets once per owned lab and never rotate or overwrite them
  during an unchanged rerun.
  Rationale: Repeat runs must be stable, and safe cleanup needs retained identifiers. Machine-specific state and
  credentials do not belong in Git or ordinary command output.
  Date/Author: 2026-08-28, Codex planning.
- Decision: Require separate successful WSL2/VirtualBox and native Linux/libvirt lifecycle runs before calling the
  implementation portable; plan 16 may then run its expensive fleet workflow on either supported provider.
  Rationale: Static provider blocks and one successful provider do not establish cross-provider behavior. Plan 17
  proves parity once; plan 16 consumes that proven lab contract.
  Date/Author: 2026-08-28, Codex planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plan 12 introduced `deploy/proxy-fleet/ansible/`. Its inventory drives Ubuntu provisioning, WireGuard, firewall
policy, Swarm membership, proxy-node labels, listener manifests, and root-only credentials. Its
`roles/proxy_topology` role verifies every listener's `egressIp` is present on the declared `egress_interface`.
Its WireGuard template currently renders peer endpoints from `ansible_host`.

Plan 13 introduced `deploy/proxy-fleet/swarm/` and `scripts/proxy-fleet-swarm/`. It renders one constrained service
per proxy node, deploys 3proxy with host networking, validates authenticated CONNECT against an SMTP peer that reports
the observed source address, and reconciles healthy listeners into the application registry. Its full live workflow
was not run because no disposable multi-node environment existed.

Plan 16 owns that fleet-level provisioning and deployment proof. This plan owns only the reusable virtual lab beneath
it. The four roles and normalized addresses are:

| Vagrant machine | Ansible role | Underlay endpoint | WireGuard address | Lab egress identities |
| --- | --- | --- | --- | --- |
| `proxy-manager-1` | `swarm_managers` | `192.168.250.11` | `172.29.10.1/28` | None |
| `proxy-node-a` | `proxy_nodes` | `192.168.250.12` | `172.29.10.2/28` | `198.18.0.21/32`, `198.18.0.22/32` |
| `proxy-node-b` | `proxy_nodes` | `192.168.250.13` | `172.29.10.3/28` | `198.18.0.23/32` |
| `verifier-1` | `verification_workers` | `192.168.250.14` | `172.29.10.4/28` | Return routes for all three egress identities |

## Scope and Non-Goals

Add `deploy/proxy-fleet/vagrant/` with `Vagrantfile`, `README.md`, `.gitignore`, the thin `lab.sh` entry point, and
provider-neutral provisioners under `provision/`. Put generated state only under `.vagrant/` and `generated/`. Put
nontrivial inventory parsing, preflight, or ownership logic under a focused `scripts/proxy-fleet-lab/` module with
tests instead of growing an untestable shell script.

Extend `deploy/proxy-fleet/ansible/roles/wireguard/templates/wg0.conf.j2` to prefer
`wireguard_endpoint | default(ansible_host)`. Correct the example verifier address, document the optional field and
portable-lab handoff in the Ansible README, and update only the package commands and ignore rules needed for the lab.

Do not apply the plan-12 provisioning playbook, deploy the plan-13 stack, reconcile application records, start the
application stack, publish an OCI image, or claim plan-16 acceptance in this pull request. Do not allocate public
addresses, create cloud resources, change application APIs or schemas, or add database migrations. Do not support
Hyper-V, VMware, macOS, ARM hosts, production rollout, Internet egress reputation, or automatic host-wide
Vagrant/VirtualBox/libvirt installation.

## Plan of Work

First add a side-effect-free preflight. It validates AMD64, the selected provider, the pinned common AMD64 box artifacts,
host virtualization support, required Vagrant integration, available resources, forwarded SSH ports, the configured
underlay CIDR, and the absence of an unowned state directory. WSL preflight requires Linux Vagrant, Windows VirtualBox
through `VAGRANT_WSL_ENABLE_WINDOWS_ACCESS=1`, Windows executable access, and matching Windows and WSL Vagrant
versions when both are installed. Linux preflight requires `vagrant-libvirt`, `qemu:///system`, and usable KVM.
Neither path installs host software. Reject Hyper-V and every unsupported provider before Vagrant creates a machine.

Add one multi-machine `Vagrantfile`. Define the four role names, pinned box and `amd64` box architecture, default
resources, disabled `/vagrant` synced folder, NAT management path, and shared static underlay once. Use an explicitly named VirtualBox internal
network and an explicitly named libvirt isolated network with no forwarding. Keep provider blocks limited to the
settings that cannot be shared. Upload and run POSIX guest provisioners through the Vagrant communicator.

Make the guest network provisioner idempotently create `lef-egress0`, assign the declared RFC 2544 `/32` addresses to each
proxy node, and install the three verifier return routes through the corresponding proxy underlay address. Configure
only the narrow reverse-path behavior needed for this asymmetric lab route. Record every owned file and setting so a
second provision is a no-op and Vagrant destruction remains the primary cleanup boundary. Provide an ephemeral
verifier fixture matching the banner and `/last-peer` response contract of the existing SMTP probe so `lab.sh verify` can
send one source-bound connection per `/32` and assert the exact observed address without public routing.

After all machines are reachable, derive controller SSH data from `vagrant ssh-config`. Generate an ignored Ansible
tree containing `inventory.yml`, per-host `vars.yml`, encrypted per-host `vault.yml`, one mode-0600 Vault password
file, one dedicated known-hosts file, sanitized topology metadata, and an ownership manifest. Generate WireGuard keys
and three listener credential pairs locally, encrypt private values immediately, and never print them. The inventory
uses three unique listener IDs and ports, `lef-egress0`, worker CIDR `172.29.10.4/32`, all four hosts in `lab_reset`,
and the explicit lab-only reset gate. Refuse to overwrite a generated tree unless its ownership manifest matches the
current Vagrant environment.

Make `lab.sh up` run preflight, Vagrant creation, inventory generation, and basic SSH/OS checks. Make `verify` assert
machine identity, normalized topology, underlay reachability, dummy-interface ownership, all three routed source
addresses, and absence of unintended Docker Swarm or WireGuard state before plan 12 runs. Make `inventory` regenerate
only non-secret connection facts and validate the result without rotating key material. Make `connect` start one
sshuttle process through the generated manager alias for exactly the recorded underlay and WireGuard CIDRs, persist
its PID and command fingerprint under `generated/`, and reject a second or mismatched route. Make `disconnect` stop
only that matching process and confirm its owned firewall state is gone. Make `status` read-only. Before `destroy`,
require the controller route to be disconnected and compare Vagrant's machine IDs and provider with the ignored
ownership manifest; on a match, destroy only those named machines and the explicitly named lab networks. Delete
generated secrets only after Vagrant confirms every owned machine is gone. Retain the manifest and print narrow
recovery guidance after partial failure or an ownership mismatch.

Finally run the complete lifecycle independently on WSL2/VirtualBox and native Linux/libvirt. Preserve a deliberately
unrelated sentinel VM or network in each provider during cleanup validation. Record provider versions, normalized
topology, idempotency results, and sanitized ownership counts, but no host path, machine ID, address outside the fixed
lab ranges, credential, or private key.

## Interfaces and Dependencies

The stable operator interface is:

```sh
cd deploy/proxy-fleet/vagrant
./lab.sh <preflight|up|verify|inventory|connect|disconnect|status|destroy> --provider <virtualbox|libvirt>
```

WSL commands run in Bash with `VAGRANT_WSL_ENABLE_WINDOWS_ACCESS=1`; native Linux uses the same commands without that
environment variable. `lab.sh` returns nonzero on any failed precondition or assertion. Provider choice is mandatory
for mutating commands. Supported configuration includes positive CPU and memory overrides and one explicit underlay
CIDR override. The override must be a private IPv4 `/24`; role addresses remain offsets 11 through 14. Changing
topology while owned machines exist is rejected rather than reconciled implicitly. The
`connect` command requires sshuttle and a working privilege method for its local firewall integration; preflight
checks both without installing or reconfiguring them. It never routes `0.0.0.0/0`, the controller Docker networks, or
either provider's management NAT.

The generated inventory adds one backward-compatible variable:

```yaml
wireguard_endpoint: 192.168.250.12
```

When omitted, the WireGuard role continues to use `ansible_host`. The Vagrant inventory sets `ansible_host`,
`ansible_port`, `ansible_user`, and the private-key path from `vagrant ssh-config`; it never treats localhost SSH
forwarding as a WireGuard endpoint.

The implementation depends on Vagrant, Windows VirtualBox for WSL, and Vagrant's `vagrant-libvirt` plugin plus system
libvirt/KVM for native Linux. It depends on the inventory, Vault, and validation contracts from plan 12, plus the
TypeScript inventory parser and SMTP probe contract from plan 13. It does not depend on the application API.

## Acceptance Criteria

- WSL2/VirtualBox and native AMD64 Linux/libvirt each select the pinned AMD64 box artifact and create exactly four
  running Ubuntu 24.04 VMs with the role, underlay, WireGuard, resource, and routed-egress topology declared above.
- The WSL workflow uses Linux Vagrant with Windows VirtualBox interop and requires no `/dev/kvm`, PowerShell command,
  Windows-path checkout, or `/vagrant` synced folder. The Linux workflow uses system libvirt/KVM.
- Before plan 12 runs, every guest is SSH-reachable, reports Ubuntu 24.04, reaches every other underlay endpoint, and
  has no active Docker Swarm or `wg0`; only the two proxy nodes own `lef-egress0`.
- `proxy-node-a` owns exactly two distinct egress addresses, `proxy-node-b` owns exactly one, and the verifier observes each
  exact source address through the lab-routed SMTP fixture.
- The generated inventory passes `ansible-inventory`, the whole-inventory validation playbook from plan 12, an Ansible ping
  to all four guests, and the existing TypeScript proxy-fleet inventory parser.
- Existing inventories that omit `wireguard_endpoint` still render WireGuard endpoints from `ansible_host`; the
  Vagrant inventory renders the static underlay endpoints instead of localhost.
- Repeating unchanged `up`, `inventory`, and `verify` commands creates no machine, interface address, route, listener,
  key, credential, or generated-file drift. The halt/up cycle preserves identity and passes verification again.
- `connect` gives the controller transparent TCP reachability to the underlay and, after plan 12 creates it, the
  WireGuard overlay. A second connect is rejected, `disconnect` removes only the recorded process and owned route
  rules, and neither command changes the default route or controller Docker networks.
- Missing or mismatched Vagrant integration, missing provider plugin, unusable KVM, unsupported architecture or
  provider, occupied SSH port, overlapping underlay, unavailable common box artifact, and unowned generated state
  fail clearly before guest or provider mutation.
- The default underlay uses `.11` through `.14` in `192.168.250.0/24`. A private `/24` override derives the same
  offsets consistently in Vagrant networking, generated inventory, WireGuard endpoints, routes, and evidence; every
  other prefix or address class is rejected before mutation.
- `destroy` refuses an ownership mismatch. With matching ownership it removes only the four recorded machines,
  explicitly named lab networks, and generated secrets; an unrelated sentinel resource survives.
- `.vagrant/`, inventory, Vault password, Vault payloads, credentials, private keys, SSH facts, ownership identifiers,
  and live metadata are neither tracked by Git nor printed by ordinary commands.
- No result claims public egress, cloud-provider parity, SMTP reputation, ARM support, production readiness, or
  completion of plan 16.

## Validation

Run `ruby -c deploy/proxy-fleet/vagrant/Vagrantfile`, `bash -n` and ShellCheck against every new shell script, and the
focused tests for any helper under `scripts/proxy-fleet-lab/`. From `deploy/proxy-fleet/ansible/`, run
`ansible-lint .`, the example inventory listing and syntax checks from plan 12, its whole-inventory validation
playbook, and `sh scripts/check-no-plaintext-secrets.sh`. Run the existing focused proxy-fleet inventory tests and
the new `wireguard_endpoint` rendering coverage.

On WSL2, set `VAGRANT_WSL_ENABLE_WINDOWS_ACCESS=1` and run
`preflight -> up -> verify -> inventory -> connect -> controller underlay probe -> disconnect -> halt/up -> verify ->
destroy`, explicitly selecting `virtualbox`. Confirm the unrelated VirtualBox sentinel survives, then repeat
`up -> verify -> destroy` from clean state. Repeat the same matrix on native Linux with `libvirt`, system
`qemu:///system`, KVM, and an unrelated libvirt sentinel. Run `vagrant validate` and `ansible all -m ping` against the
generated inventory in each environment. Do not mark the portability criterion complete unless both provider
matrices pass.

Finish with `corepack pnpm lint`, `corepack pnpm typecheck`, the focused and full Jest suites if executable,
`corepack pnpm build`, the tracked-file secret scan, `corepack pnpm docs:lint -- <changed-markdown-files>`,
`PLANS_DRY_RUN=true corepack pnpm plans:sync`, and `git diff --check`. Bruno is not applicable because this plan does
not change externally observable HTTP behavior.

## Idempotence and Recovery

Preflight and status are read-only. `up`, guest provisioning, and inventory generation compare before writing and
reuse the owned machine IDs and secret material. `connect` records its exact process before reporting success, and
`disconnect` refuses an unrelated or reused PID. An interrupted `up` is retried through the same Vagrant environment;
an interrupted inventory render keeps the previous complete tree until a replacement validates. Never rotate keys to
repair an SSH or routing error.

`destroy` treats the ignored ownership manifest as a capability, not a naming hint. If the manifest, provider, or
Vagrant machine IDs disagree, stop without calling provider-wide cleanup tools. If disconnect is interrupted, inspect
the recorded PID and command fingerprint before retrying it; do not kill by process name. If Vagrant removes only some
machines, retain the manifest, keys, and remaining state; inspect `./lab.sh status --provider <provider>`, then retry
the same destroy command. Do not use broad `VBoxManage`, `virsh`, or filesystem deletion commands as recovery. After
confirmed destruction, recreation generates a new owned environment and new disposable credentials without affecting
unrelated VMs, networks, Docker daemons, routes, or Swarms.

## Artifacts and Notes

During implementation, record the two provider/version matrices, pinned box availability, normalized topology,
both verification summaries, the halt/up result, the clean-recreation result, and before/after owned-resource
counts. Record only fixed lab addresses and redacted identifiers. Do not record absolute host paths, machine UUIDs,
SSH private keys, WireGuard private keys, Vault contents, passwords, or listener credentials.

Authoritative setup constraints:

- Vagrant WSL support: <https://developer.hashicorp.com/vagrant/docs/other/wsl>
- Multiple providers: <https://developer.hashicorp.com/vagrant/docs/providers/configuration>
- Hyper-V networking limitations: <https://developer.hashicorp.com/vagrant/docs/providers/hyperv/limitations>
- libvirt installation: <https://vagrant-libvirt.github.io/vagrant-libvirt/installation.html>
- Ubuntu Vagrant image status: <https://ubuntu.com/docs/public-images/public-images-explanation/vagrant/>

## Plan readiness

Ready to implement.
