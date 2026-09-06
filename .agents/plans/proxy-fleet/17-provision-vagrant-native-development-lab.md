# Provision a Vagrant-Native Development Lab

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Provide one disposable four-machine Ubuntu 24.04 development lab that a developer operates with ordinary Vagrant
commands. The same manager, two proxy nodes, verifier, isolated underlay, and three nonpublic test egress identities
must work on Windows 11 WSL2 with VirtualBox and on native AMD64 Linux with libvirt/KVM.

Vagrant is the lifecycle interface. A developer validates, creates, inspects, connects to, reprovisions, halts, resumes,
and destroys the lab with `vagrant validate`, `up`, `status`, `ssh-config`, `ssh`, `provision`, `halt`, and `destroy`.
The repository adds only the Vagrant definition, a guest network provisioner, a tracked nonsecret Ansible inventory,
and documentation. It does not add a Node or TypeScript application around Vagrant.

## Progress

- [x] (2026-09-05) Add one `Vagrantfile` backed by the tracked lab inventory.
- [x] (2026-09-05) Add the guest-only network provisioner and pass its static validation and rejection probes.
- [x] (2026-09-05) Document the direct Vagrant and Ansible workflow, prerequisites, reduced guarantees, and recovery.
- [ ] (2026-09-05) Verify idempotent provisioning and owned network state with direct guest probes.
- [ ] (2026-09-05) Validate the complete create-to-destroy workflow on VirtualBox and libvirt.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`

## Surprises & Discoveries

- This implementation host has WSL-native Node 24.19.0 but does not currently have Vagrant, Ruby, Ansible, or
  ShellCheck on `PATH`. Shell syntax, rejection probes, inventory structure, repository checks, and documentation can
  be validated here; both provider matrices, direct guest probes, Ruby syntax, Vagrant validation, Ansible CLI checks,
  and ShellCheck remain unverified until those tools and providers are available.
- The current Vagrant Cloud metadata for `bento/ubuntu-24.04` confirms that the pinned `202508.03.0` release remains
  active and has both VirtualBox AMD64 and libvirt AMD64 artifacts. Newer releases do not necessarily carry both
  providers, so the shared pin is intentional.

## Decision Log

- Decision: Make the Vagrant CLI the only lab lifecycle interface.
  Rationale: Vagrant already implements machine creation, status, SSH discovery, provisioning, halt, resume, and
  destruction. A repository-specific lifecycle API duplicates those responsibilities for a disposable development
  environment.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Remove the Node, TypeScript, pnpm, provider-inspector, ownership-transaction, process-supervisor, and
  provider-completion layers from the lab.
  Rationale: They form a second infrastructure controller and require the application development toolchain merely to
  operate four development VMs.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Use `deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml` as the one tracked lab topology input to both
  Ansible and the `Vagrantfile`.
  Rationale: A four-host nonsecret inventory can carry the stable names, roles, addresses, and Vagrant defaults without
  a second topology manifest or an inventory generator. The `Vagrantfile` needs only Ruby's standard YAML library,
  which runs inside Vagrant's own Ruby runtime.
  Date/Author: 2026-09-05, Codex planning.
- Decision: Let Vagrant select and record provider-specific SSH hostnames, ports, users, and identity files.
  Rationale: `vagrant ssh-config` is the supported connection handoff and already handles provider differences and
  port collisions. The lab must not reserve fixed host SSH ports or parse and republish the same data.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Keep one auxiliary executable: a POSIX shell provisioner that runs only inside the proxy and verifier
  guests and owns only the declared test interface and routes.
  Rationale: The RFC 2544 identities and verifier return routes are guest configuration that Vagrant can invoke but
  cannot express directly. The script does not wrap or choose a lifecycle command.
  Date/Author: 2026-09-05, project owner and Codex planning.
- Decision: Accept Vagrant's local state and direct-command recovery as the safety boundary.
  Rationale: The lab is development-only. One operator runs one Vagrant lifecycle command at a time, and failed or
  interrupted operations are inspected and retried with Vagrant rather than reconstructed through provider-wide
  discovery.
  Date/Author: 2026-09-05, project owner and Codex planning.

## Outcomes & Retrospective

The working implementation now consists only of a Vagrant definition, one tracked nonsecret inventory, one POSIX
guest provisioner, ignored local state, and operator documentation. Static checks completed on this host are recorded
in `Artifacts and Notes`; completion still requires the direct guest and full lifecycle matrices on both providers.

## Context and Orientation

Plans `proxy-fleet/12` and `proxy-fleet/13` provide the Ansible host roles and Swarm deployment that need disposable
machines. Plan `proxy-fleet/16` performs the eventual end-to-end fleet validation. This plan supplies the local VMs,
isolated lab networking, and a plan-12-compatible inventory; it does not deploy the fleet application.

The lab root is `deploy/proxy-fleet/vagrant/`. Its final implementation contains:

- `Vagrantfile`, the only VM and provider lifecycle definition;
- `provision/guest-network.sh`, uploaded and run by Vagrant inside the two proxy guests and the verifier;
- `.gitignore`, covering Vagrant-owned state and the captured SSH configuration; and
- `README.md`, documenting prerequisites and direct commands.

The shared nonsecret topology lives at `deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml`. Require Vagrant 2.4.9
or later and pin `bento/ubuntu-24.04` version `202508.03.0` for AMD64. Each VM receives two CPUs and 2,048 megabytes of
memory. The isolated underlay is `192.168.250.0/24`, named `proxy-fleet-lab`; VirtualBox keeps its ordinary management
NAT, while libvirt uses the `vagrant-libvirt` management network at `192.168.121.0/24`. The inventory declares these
fixed host facts:

| Machine           | Ansible role           | Underlay address | Guest test identity / listener                                                   |
| ----------------- | ---------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `proxy-manager-1` | `swarm_managers`       | `192.168.250.11` | None                                                                             |
| `proxy-node-a`    | `proxy_nodes`          | `192.168.250.12` | `198.18.0.21/32` on `172.29.10.2:13001`; `198.18.0.22/32` on `172.29.10.2:13002` |
| `proxy-node-b`    | `proxy_nodes`          | `192.168.250.13` | `198.18.0.23/32` on `172.29.10.3:13001`                                          |
| `verifier-1`      | `verification_workers` | `192.168.250.14` | Return routes to `198.18.0.21`–`.23`                                             |

The inventory defines host data once under `all.hosts`; child groups contain membership only. It uses the same names as
Vagrant's SSH aliases. `ansible_host` remains that alias so the SSH client can resolve the real endpoint through a
captured Vagrant SSH configuration. A separate `wireguard_endpoint` stores each fixed underlay address for
guest-to-guest WireGuard traffic. WireGuard addresses are `.1/28` through `.4/28` in the existing `172.29.10.0/28` lab
overlay. Proxy listeners retain the plan-12 fields and RFC 2544 egress identities. Vagrant-only box, version,
architecture, CPU, memory, and network data are namespaced below `all.vars.vagrant_lab` so the Ansible roles ignore
them.

After `vagrant up`, the developer captures Vagrant's provider-specific connection facts to the ignored
`deploy/proxy-fleet/vagrant/.vagrant/proxy-fleet/ssh-config`. Ansible consumes the tracked inventory while the SSH client
consumes that ignored configuration. Private WireGuard keys, proxy credentials, and Vault passwords stay in the
existing plan-12 Vault workflow; this plan neither generates nor tracks them in the lab inventory.

`guest-network.sh` may modify only `lef-egress0`, the declared RFC 2544 `/32` addresses, the verifier's three exact
return routes, and one dedicated persistence unit. It must not modify a default route, DNS, NAT, IP forwarding,
reverse-path filtering, or unrelated guest interfaces.

## Scope and Non-Goals

This pull request adds the first plan-17 lab implementation to the current base branch. Add only the `Vagrantfile`, the
tracked lab inventory, the guest network provisioner, ignored state rules, and operator documentation. Do not add
`lab.sh`, `topology.json`, a `proxy-fleet:lab` package script, `scripts/proxy-fleet-lab/`, or package dependencies. There
is no host-side Ruby program, generated Ansible inventory, Make target, shell lifecycle wrapper, package script, HTTP
service, or application-runtime dependency.

The `Vagrantfile` loads `vagrant-lab.yml` with Ruby standard-library YAML support and reads only the values it consumes:
`all.vars.vagrant_lab`, four aliases under `all.hosts`, resources, provider-network settings, underlay addresses, and
guest-network arguments. Required-value lookups make `vagrant validate` fail naturally when those values are absent;
there is no second schema-validation framework. Ansible remains responsible for group and listener validation. The
`Vagrantfile` disables the default shared folder, configures the isolated underlay for each provider, and invokes the
guest shell provisioner only for proxy and verifier group members. It derives fixed argument arrays from the selected
host and proxy-listener entries. It does not run shell commands, Node, pnpm, Ansible, or provider inspection while
evaluating the definition. It does not declare fixed SSH forwarded ports.

The following guarantees are deliberately out of scope:

- No side-effect-free provider-wide preflight discovers every dormant or foreign VirtualBox/libvirt resource before
  `vagrant up`.
- No independent ownership manifest supplements Vagrant's local machine state.
- No compare-and-swap transition, operation journal, lifecycle lock, or concurrent-command safety is provided.
- No descendant-process supervision or independent provider-completion proof is provided.
- The ignored SSH configuration is a replaceable connection aid, not immutable or provenance-bound evidence.
- The repository does not adopt, repair, stop, or delete a provider resource that Vagrant does not identify as part of
  the current environment.
- This plan does not allocate public addresses, prove Internet or SMTP reputation, deploy Swarm services, reconcile the
  proxy registry, change an HTTP API, change a database schema, or modify production infrastructure.

These reductions are intentional. A foreign name, network, port, provider plugin, or stale Vagrant state may make a
direct command fail after ordinary Vagrant setup has begun. Recovery uses the reported Vagrant state and direct
commands; the repository does not claim transactional rollback across Vagrant and provider boundaries.

## Plan of Work

First, add `deploy/proxy-fleet/vagrant/Vagrantfile` as a small Vagrant-native definition. Load only
`../ansible/inventory/vagrant-lab.yml`, fetch the narrow `vagrant_lab` settings and `all.hosts` mapping directly, and
define the four named machines from those fixed values. Do not implement a general schema validator, Ansible
inheritance, or listener validation in Ruby. Keep provider-specific configuration in two short `virtualbox` and
`libvirt` blocks. Let Vagrant manage SSH forwarding and record the selected provider in `.vagrant`.

Add the tracked inventory with plan-12 groups, host variables, listener declarations, explicit `lab_reset` membership,
and lab-only reset opt-in. Set `proxy_fleet_allow_reset: true` on each `lab_reset` host under `all.hosts`; do not put it
under `all.vars`, where the existing `inventory/group_vars/all.yml` default would override it. Keep the example
inventory unchanged as documentation. Include a `wireguard_endpoint` underlay fact for the later end-to-end plan
without changing the merged plan-12 role in this PR. Do not put private keys, credentials, passwords, provider IDs,
host paths, or SSH connection details in the tracked lab inventory.

Implement `deploy/proxy-fleet/vagrant/provision/guest-network.sh` as an idempotent guest operation. Validate its fixed
arguments, discover the unique interface holding the declared underlay address, and reconcile only `lef-egress0` plus
the verifier's exact routes. Manage one root-owned helper and
`proxy-fleet-lab-network.service`, a dedicated systemd `oneshot` unit that restores owned state after reboot. Replace
the two explicitly lab-owned files when their content changes, and replace only the declared interface addresses and
routes. A repeated `vagrant provision` must leave an already correct guest unchanged. Do not inspect or change unrelated
guest or host networking.

Document the direct workflow in `deploy/proxy-fleet/vagrant/README.md`:

    cd deploy/proxy-fleet/vagrant
    vagrant validate
    vagrant up --no-install-provider --provider=virtualbox
    vagrant status
    install -d -m 0700 .vagrant/proxy-fleet
    (umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
    vagrant ssh proxy-manager-1 -c 'hostname'
    vagrant provision
    vagrant halt
    vagrant up
    vagrant destroy -f

Only the first `up` needs `--provider`; Vagrant records the provider for later commands. Use `--provider=libvirt` for
the native-Linux matrix. Run Ansible from `deploy/proxy-fleet/ansible/` with the tracked inventory and captured SSH
configuration:

    ansible-inventory -i inventory/vagrant-lab.yml --list

For the WSL2/VirtualBox path, document Vagrant's WSL Windows-access setting, matching Windows and WSL Vagrant versions,
and the Windows VirtualBox executable path. For native Linux, document the `vagrant-libvirt` extension and KVM access.
Do not turn those prerequisite checks into another application. Pass `--no-install-provider` to the first `up` so a
missing provider fails as a prerequisite instead of changing the host implicitly.

Finally, run the full lifecycle twice: once on Windows 11 WSL2 with VirtualBox and once on native AMD64 Linux with
libvirt/KVM. In each environment, first create with `--no-provision`, capture the unrelated guest-network baseline,
provision, and prove that baseline is unchanged. Then perform status and SSH inspection, reprovision, halt, resume,
destroy, and clean recreation through direct Vagrant commands. Record sanitized versions, fixed lab facts, and
pass/fail results; never record provider IDs or SSH private-key paths.

## Interfaces and Dependencies

The public operator interface is Vagrant itself:

- `vagrant validate`
- `vagrant up --no-install-provider --provider=<virtualbox|libvirt>`
- `vagrant status [--machine-readable]`
- `vagrant ssh-config [machine]`
- `vagrant ssh <machine> [-c <command>]`
- `vagrant provision [machine]`
- `vagrant halt [machine]`
- `vagrant destroy -f [machine]`

Configuration consists of `Vagrantfile` plus the tracked `vagrant-lab.yml`. The only generated handoff is the ignored
SSH configuration. Runtime dependencies are Vagrant and the selected provider; POSIX shell runs inside the guests,
and Ansible is required only when consuming the lab for plans 12, 13, or 16. Node, TypeScript, pnpm, a standalone host
Ruby executable, an HTTP API, a service, and a database are not lab runtime dependencies.

The lab supports one operator issuing one lifecycle command at a time from the exact lab directory. Raw VirtualBox,
`virsh`, and provider-wide Vagrant commands are diagnostic-only in documented manual recovery and are never part of
normal creation or cleanup.

## Acceptance Criteria

- The pull request contains no `lab.sh`, `proxy-fleet:lab` package script, `topology.json`, generated inventory, or
  Node/TypeScript lab application, provider inspector, ownership transaction, process supervisor, or completion gate.
- `vagrant validate` accepts the checked-in inventory without creating a VM.
- `vagrant up --no-install-provider --provider=virtualbox` on supported WSL2 and
  `vagrant up --no-install-provider --provider=libvirt` on supported native Linux each create exactly the four declared
  machines with matching names, roles, resources, and underlay addresses.
- Vagrant chooses provider-specific SSH endpoints without fixed host ports. `vagrant status`, `ssh-config`, and `ssh`
  show all four machines running and reachable after successful creation.
- The proxy guests contain exactly their declared RFC 2544 `/32` identities on `lef-egress0`; the verifier contains
  exactly the three declared return routes; the manager contains neither; and unrelated guest networking is unchanged.
- A second `vagrant provision` makes no effective guest-network change. After `vagrant halt`, direct `vagrant up`
  restores the same owned state.
- The tracked inventory passes the plan-12 inventory validator, contains the four Vagrant aliases and correct groups,
  sets the reset opt-in at host precedence for every `lab_reset` member, and contains no secret or generated connection
  value. With the captured SSH configuration, an Ansible ping reaches every guest. Full plan-12 WireGuard application
  waits for plan 16 to consume `wireguard_endpoint` and add the proxy egress identities to peer `AllowedIPs`.
- `vagrant destroy -f` removes the four current-environment machines, and a clean provider-selected `up` succeeds
  again.
- Interrupted commands are recoverable through `vagrant status` and a direct retry or documented manual diagnosis; no
  acceptance criterion claims atomic rollback, concurrent command safety, or automatic foreign-resource cleanup.
- Vagrant validation, shell syntax checks, direct guest probes, Ansible inventory validation, documentation lint,
  secret scanning, repository tests, and diff checks pass. No externally observable application or HTTP behavior
  changes.

## Validation

Run static and repository checks:

    ruby -c deploy/proxy-fleet/vagrant/Vagrantfile
    sh -n deploy/proxy-fleet/vagrant/provision/guest-network.sh
    shellcheck deploy/proxy-fleet/vagrant/provision/guest-network.sh
    cd deploy/proxy-fleet/vagrant
    vagrant validate
    cd ../ansible
    ansible-inventory -i inventory/vagrant-lab.yml --list
    ansible-playbook -i inventory/vagrant-lab.yml playbooks/validate-inventory.yml
    sh scripts/check-no-plaintext-secrets.sh
    cd ../../..
    corepack pnpm lint
    corepack pnpm typecheck
    corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- .agents/plans/proxy-fleet/README.md .agents/plans/proxy-fleet/16-validate-disposable-multi-node-fleet.md .agents/plans/proxy-fleet/17-provision-vagrant-native-development-lab.md deploy/proxy-fleet/vagrant/README.md
    PLANS_DRY_RUN=true corepack pnpm plans:sync
    git diff --check

The `ruby -c` command is an optional development syntax check; normal lab operation invokes Ruby only through Vagrant.
The repository checks may use the development toolchain, but the delivered lab must remain operable without Node,
TypeScript, pnpm, or installed npm dependencies. Inspect the plan-sync dry run and require `proxy-fleet/17` to update
issue #429 without creating a new issue.

On each provider, create the machines without running the guest provisioner, then capture the connection handoff:

    cd deploy/proxy-fleet/vagrant
    provider=virtualbox # Use libvirt on the native-Linux matrix.
    vagrant up --no-install-provider --no-provision --provider="$provider"
    install -d -m 0700 .vagrant/proxy-fleet
    (umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
    cd ../ansible
    ANSIBLE_SSH_COMMON_ARGS="-F $(realpath ../vagrant/.vagrant/proxy-fleet/ssh-config)" \
      ansible all -i inventory/vagrant-lab.yml -m ping

Before the first provision, return to `deploy/proxy-fleet/vagrant/` and capture the unrelated network facts for every
guest. Then provision, capture the same facts, and require byte-for-byte equality:

    cd ../vagrant
    (
      set -eu
      baseline_dir="$(mktemp -d /tmp/lef-vagrant-network.XXXXXX)"
      network_snapshot='ip -o link show | grep -v " lef-egress0:"; ip -o -4 address show | grep -v " lef-egress0 " | sed -E "s/ valid_lft .*//"; ip -4 route show | grep -Ev "^198\.18\.0\.(21|22|23)(/32)? "; cat /etc/resolv.conf; sysctl -n net.ipv4.ip_forward; sysctl -a 2>/dev/null | grep "^net.ipv4.conf.*.rp_filter" | grep -v "^net.ipv4.conf.lef-egress0.rp_filter"; sudo iptables-save -t nat'
      for machine in proxy-manager-1 proxy-node-a proxy-node-b verifier-1; do
        vagrant ssh "$machine" -c "$network_snapshot" > "$baseline_dir/$machine.before"
      done
      vagrant provision
      for machine in proxy-manager-1 proxy-node-a proxy-node-b verifier-1; do
        vagrant ssh "$machine" -c "$network_snapshot" > "$baseline_dir/$machine.after"
        if ! diff -u "$baseline_dir/$machine.before" "$baseline_dir/$machine.after"; then
          echo "Network baseline mismatch; evidence preserved in $baseline_dir" >&2
          exit 1
        fi
        rm -- "$baseline_dir/$machine.before" "$baseline_dir/$machine.after"
      done
      rmdir -- "$baseline_dir"
    )

A failed comparison stops the matrix and preserves the exact `mktemp`-created directory for diagnosis. A successful
comparison removes each captured file and then the empty directory.

From `deploy/proxy-fleet/vagrant/`, run these fixed functional probes:

    vagrant ssh proxy-manager-1 -c '! ip link show lef-egress0 >/dev/null 2>&1'
    vagrant ssh proxy-node-a -c 'test "$(ip -o -4 address show dev lef-egress0 | wc -l)" -eq 2 && ip -o -4 address show dev lef-egress0 | grep -F "198.18.0.21/32" && ip -o -4 address show dev lef-egress0 | grep -F "198.18.0.22/32"'
    vagrant ssh proxy-node-b -c 'test "$(ip -o -4 address show dev lef-egress0 | wc -l)" -eq 1 && ip -o -4 address show dev lef-egress0 | grep -F "198.18.0.23/32"'
    vagrant ssh verifier-1 -c 'test "$(ip -4 route show | grep -Ec "^198\.18\.0\.(21|22|23)(/32)? via ")" -eq 3 && ip -4 route get 198.18.0.21 | grep -F "via 192.168.250.12" && ip -4 route get 198.18.0.22 | grep -F "via 192.168.250.12" && ip -4 route get 198.18.0.23 | grep -F "via 192.168.250.13"'
    vagrant ssh verifier-1 -c 'ping -c 1 -W 2 198.18.0.21 && ping -c 1 -W 2 198.18.0.22 && ping -c 1 -W 2 198.18.0.23'
    vagrant ssh proxy-node-a -c 'systemctl is-active --quiet proxy-fleet-lab-network.service'

Run the probes after the first provision. Run `vagrant provision` again and repeat them, then repeat them after
halt/resume. Select the matrix provider explicitly for clean recreation:

    provider=virtualbox # Use libvirt on the native-Linux matrix.
    vagrant destroy -f
    vagrant status --machine-readable
    vagrant up --no-install-provider --provider="$provider"
    vagrant status --machine-readable
    vagrant destroy -f
    vagrant status --machine-readable

Repeat the complete sequence on both supported provider matrices.

## Idempotence and Recovery

`vagrant validate`, `status`, `ssh-config`, and the documented SSH probes do not intentionally mutate guest
configuration. Repeating `vagrant up` converges the environment Vagrant records. Repeating `vagrant provision`
reconciles the same guest-owned network facts. The tracked inventory does not need generation. Recapturing
`ssh-config` replaces only the ignored connection file. `vagrant halt` and `vagrant destroy -f` may be repeated after
checking status.

After an interrupted lifecycle command, stop issuing new commands, wait for the original Vagrant process to exit, and
run `vagrant status` from the lab directory. Retry the interrupted direct command. If Vagrant reports a machine but
cannot operate it, preserve `.vagrant` and provider state for diagnosis; do not delete raw provider resources, edit
machine IDs, or adopt a name collision. Follow provider-specific Vagrant troubleshooting and record the manual step.

If `.vagrant` is lost while provider resources remain, automatic ownership recovery is not promised. Diagnose before
any cleanup, protect unrelated resources, and recreate only after the conflict is resolved. The normal cleanup command
remains `vagrant destroy -f` from the intact environment.

## Artifacts and Notes

Record the Vagrant, provider, host OS, box, and plugin versions; the selected matrix; sanitized `status` results; guest
network assertions; Ansible inventory and ping recaps; repeated-provision and halt/resume observations; clean
recreation; and final destroyed status. Do not record provider machine IDs, SSH private-key paths, raw SSH
configuration, Vault data, private keys, proxy credentials, or host-specific absolute paths.

Current host evidence on 2026-09-05:

- WSL-native Node 24.19.0 ran the repository validation; no Windows `node.exe` was used.
- `sh -n`, `dash -n`, and `bash -n` accepted `guest-network.sh`. Safe rejection probes covered missing intent,
  duplicate addresses and routes, mixed address/route modes, invalid CIDRs, an invalid interface, a route gateway
  outside the underlay, and non-root execution.
- Both Ruby/Vagrant and Ansible CLI validation are unavailable because their executables are not installed on this
  host. ShellCheck is also unavailable.
- The tracked inventory contract, plaintext-secret scan, Markdown formatting, Harper documentation lint, plan parser
  suites, lint, type checking, all repository tests, and the production build pass. Lint reports one preexisting test
  warning outside this diff.
- The plan-sync dry run finds no new issue and exactly two expected description updates: `proxy-fleet/16` issue #424
  remains in Backlog, and this plan's issue #429 remains In Progress.
- Provider creation, guest probes, reprovision, halt/resume, destruction, and clean recreation remain to be run on
  both supported matrices. The pull request remains a draft until that evidence exists.

## Plan readiness

Ready to implement.
