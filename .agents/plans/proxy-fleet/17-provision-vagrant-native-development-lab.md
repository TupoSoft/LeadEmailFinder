# Provision a Vagrant-Native Development Lab

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Provide one disposable four-machine Ubuntu 24.04 development lab that a developer operates with ordinary Vagrant
commands. This plan validates the manager, two proxy nodes, verifier, isolated underlay, and three nonpublic test
egress identities on Windows 11 WSL2 with VirtualBox. Native AMD64 Linux with libvirt/KVM has its own acceptance
matrix in [plan 18](18-validate-vagrant-libvirt-lab.md). Both providers retain the shared lab definition and inventory.

Vagrant is the lifecycle interface. A developer validates, creates, inspects, connects to, reprovisions, halts, resumes,
and destroys the lab with `vagrant validate`, `up`, `status`, `ssh-config`, `ssh`, `provision`, `halt`, and `destroy`.
The lab runtime consists of the Vagrant definition, a guest network provisioner, a tracked nonsecret Ansible inventory,
and documentation. It does not add a Node or TypeScript application around Vagrant.

## Progress

- [x] (2026-09-05) Add one `Vagrantfile` backed by the tracked lab inventory.
- [x] (2026-09-05) Add the guest-only network provisioner and pass its static validation and rejection probes.
- [x] (2026-09-05) Document the direct Vagrant and Ansible workflow, prerequisites, reduced guarantees, and recovery.
- [x] (2026-09-06) Fix repeated verifier route replacement and preserve unrelated subnet routes, with focused regression tests.
- [x] (2026-09-06) Verify idempotent provisioning and owned network state with direct VirtualBox guest probes.
- [x] (2026-09-06) Persist one CPU per VirtualBox guest, retain two CPUs for libvirt, and add configuration tests to CI.
- [x] (2026-09-06) Preserve verifier routes through Vagrant's networkd reconfiguration and verify the additional owned file.
- [x] (2026-09-06) Validate the complete create-to-destroy workflow on VirtualBox, including halt/resume and clean recreation.

## Plan dependencies

- `proxy-fleet/12`
- `proxy-fleet/13`

## Surprises & Discoveries

- On 2026-09-05, this implementation host had WSL-native Node 24.19.0 but did not have Vagrant, Ruby, Ansible, or
  ShellCheck on `PATH`. Available validation covered shell syntax, rejection probes, inventory structure, repository
  checks, and documentation. Both provider matrices, direct guest probes, Ruby syntax, Vagrant validation, Ansible
  CLI checks, and ShellCheck were still unverified.
- The current Vagrant Cloud metadata for `bento/ubuntu-24.04` confirms that the pinned `202508.03.0` release remains
  active and has both VirtualBox AMD64 and libvirt AMD64 artifacts. Newer releases do not necessarily carry both
  providers, so the shared pin is intentional.
- PR #518 merged the initial implementation before provider lifecycle validation was complete. Follow-up PR #549
  fixes route reconciliation and persistence, adopts one CPU per VirtualBox guest, and records the completed
  VirtualBox matrix. Native Linux/libvirt validation remains in plan 18.
- Ubuntu 24.04 route output includes trailing whitespace. Comparing it literally caused every correct verifier route
  to be replaced during repeated provisioning. Normalize whitespace before comparison. Stale cleanup also matched
  subnet routes that this provisioner cannot create; restrict it to host routes.
- The documented baseline filter treated dots as wildcards and matched `arp_filter` as well as `rp_filter`, producing a
  false mismatch after adding the dummy interface. Match the exact dotted setting name instead. Exclude the changing
  timestamp comments from `iptables-save` output so repeated snapshots compare only network facts.
- Windows Hypervisor Platform and WSL mirrored networking were needed on this host. After enabling both, WSL reached
  the forwarded SSH ports and all four guests booted. One proxy exceeded the initial 300-second boot timeout and
  succeeded after a scoped Vagrant halt and retry. Both proxies later exceeded that timeout during halt/resume
  validation, so the two-CPU configuration failed halt/resume validation.
- A later serial-console investigation reproduced an early kernel stall inside `raid6_choose_gen`, waiting for timer
  ticks. One debugger register read on the second virtual CPU immediately released overdue timer work, reporting a
  283-second interval between clock watchdog checks, before initialization stalled again. Debugger inspection can
  change the observed boot behavior. This establishes the guest failure point; the exact defect in the
  VirtualBox/Hyper-V interaction remains unconfirmed.

## Decision Log

- Decision: Declare the verifier's exact protocol-98 routes in one networkd configuration fragment for its Vagrant
  underlay, while retaining immediate route reconciliation in the guest provisioner.
  Rationale: Vagrant reapplies Netplan after the boot service completes. The networkd daemon then removes routes absent from its
  configuration. The additional root-owned file contains only the three declared routes; it does not change global
  network policy or replace the provider's network definition. Installation does not reload networkd, which could
  disturb unrelated routes. Boot and Vagrant's later Netplan application load the fragment naturally.
  Date/Author: 2026-09-06, Codex implementation.

- Decision: Persist one CPU per VirtualBox guest and retain two CPUs for libvirt.
  Rationale: The operator requested adoption after a two-CPU timer stall was reproduced and three controlled
  one-CPU boot cycles passed. Declare the override in the tracked inventory and validate the full VirtualBox matrix
  with that configuration. This reduces each VirtualBox guest's parallel capacity; it does not establish that the
  underlying hypervisor defect or the separate Guest Additions RCU warning is fixed.
  Date/Author: 2026-09-06, project owner and Codex implementation.
- Decision: Move native Linux/libvirt validation into plan 18 and retain VirtualBox validation in this plan.
  Rationale: No native Linux host is available to the operator. The separate plan preserves the full libvirt matrix
  without making it a completion requirement for this plan. Existing libvirt configuration remains shared; this
  split does not establish provider parity or resolve the recorded VirtualBox boot failures.
  Date/Author: 2026-09-06, project owner and Codex planning.
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
- Decision: Keep one auxiliary lab runtime executable: a POSIX shell provisioner that runs only inside the proxy and verifier
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

The complete Windows WSL2/VirtualBox matrix passes with one CPU and 2,048 megabytes per guest. It covers fresh
creation, Vagrant SSH and Ansible access, preservation of unrelated networking, exact owned state, and repeated
provisioning. Halt and boot with provisioning disabled, destruction, clean recreation, and final cleanup also pass. All four guests are absent
after the final Vagrant destruction. Every progress item in this plan is complete; PR #549 contains the follow-up
implementation and validation record.

The CPU setting is a validated workaround for this development configuration. The underlying VirtualBox/Hyper-V
timer defect remains unconfirmed, and the separate Guest Additions RCU warning remains recorded. Native Linux/libvirt
validation has not started in plan 18; its guests retain two CPUs each. Plan 16 can consume the validated VirtualBox lab.

The verifier now declares its exact routes in one additional owned networkd fragment, which preserves them when
Vagrant reapplies Netplan after startup. This relies on the pinned guest's Netplan/networkd naming contract and adds
no global network policy change or lifecycle controller. Focused shell tests protect route reconciliation and safe,
idempotent file installation; Ruby tests protect provider CPU settings and shared memory allocation. Neither adds a
lab runtime dependency.

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
or later and pin `bento/ubuntu-24.04` version `202508.03.0` for AMD64. Each VirtualBox VM receives one CPU from
`all.vars.vagrant_lab.virtualbox.cpus`; libvirt retains two CPUs from `all.vars.vagrant_lab.resources.cpus`.
Both providers allocate 2,048 megabytes per guest. The isolated underlay is `192.168.250.0/24`, named `proxy-fleet-lab`;
VirtualBox keeps its ordinary management
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
return routes, the installed helper, one dedicated persistence unit, and the verifier's exact networkd route fragment. It must not modify a default route, DNS, NAT, IP forwarding,
reverse-path filtering, or unrelated guest interfaces.

## Scope and Non-Goals

This plan owns the shared lab implementation and its Windows WSL2/VirtualBox acceptance. Plan 18 owns native
Linux/libvirt runtime validation in a separate pull request. Completing plan 18 is not required to complete this
plan.

PR #518 introduced the lab runtime. This follow-up fixes guest route reconciliation, records one CPU per VirtualBox
guest in the inventory, adds focused configuration regressions, and validates the VirtualBox lifecycle. The Ruby test
under `scripts/testing/` runs only during development; normal lab operation uses Vagrant directly. Do not add `lab.sh`,
`topology.json`, a `proxy-fleet:lab` package script, `scripts/proxy-fleet-lab/`, or package dependencies. There is no
generated Ansible inventory, Make target, shell lifecycle wrapper, package script, HTTP service, or application-runtime
dependency.

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
`proxy-fleet-lab-network.service`, a dedicated systemd `oneshot` unit that restores owned state after reboot. On the
verifier, also manage `/etc/systemd/network/10-netplan-<underlay-interface>.network.d/50-proxy-fleet-lab-routes.conf`.
Require networkd to report the matching Vagrant-generated Netplan network file before installation. The root-owned
fragment has mode `0644` and contains only the declared destinations, gateways, and protocol `98`. Do not reload or
reconfigure networkd while provisioning. Replace these explicitly owned files only when their content or required
metadata changes, and replace only the declared interface addresses and routes. A repeated `vagrant provision` must leave an already correct guest unchanged. Do not inspect or change unrelated
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

Only the first `up` needs `--provider`; Vagrant records the provider for later commands. Plan 18 supplies the separate
native Linux/libvirt validation sequence. Run Ansible from `deploy/proxy-fleet/ansible/` with the tracked inventory and
captured SSH configuration:

    ansible-inventory -i inventory/vagrant-lab.yml --list

For the WSL2/VirtualBox path, document Vagrant's WSL Windows-access setting, matching Windows and WSL Vagrant versions,
and the Windows VirtualBox executable path. For native Linux, document the `vagrant-libvirt` extension and KVM access.
Do not turn those prerequisite checks into another application. Pass `--no-install-provider` to the first `up` so a
missing provider fails as a prerequisite instead of changing the host implicitly.

Finally, run the full lifecycle on Windows 11 WSL2 with VirtualBox. First create with `--no-provision`, capture the
unrelated guest-network baseline, provision, and prove that baseline is unchanged. Then perform status and SSH
inspection, reprovision, halt, resume,
destroy, and clean recreation through direct Vagrant commands. Record sanitized versions, fixed lab facts, and
pass/fail results; never record provider IDs or SSH private-key paths.

## Interfaces and Dependencies

The public operator interface is Vagrant itself:

- `vagrant validate`
- `vagrant up --no-install-provider --provider=virtualbox`
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
- `vagrant up --no-install-provider --provider=virtualbox` on supported WSL2 creates exactly the four declared
  machines with matching names, roles, one CPU and 2,048 megabytes per guest, and declared underlay addresses.
- Vagrant chooses provider-specific SSH endpoints without fixed host ports. `vagrant status`, `ssh-config`, and `ssh`
  show all four machines running and reachable after successful creation.
- The verifier's networkd fragment declares exactly its three protocol-98 routes with root ownership and mode `0644`;
  it is absent from the other guests. The proxy guests contain exactly their declared RFC 2544 `/32` identities on `lef-egress0`; the verifier contains
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

The known Guest Additions RCU warning is recorded as a remaining provider limitation. Completion proves the stated
development lifecycle and owned network behavior on the declared configuration; it does not certify general kernel
stability, production workloads, or native Linux/libvirt parity.

## Validation

Run static and repository checks:

    ruby -c deploy/proxy-fleet/vagrant/Vagrantfile
    ruby scripts/testing/proxy-fleet-vagrant-config.test.rb
    sh -n deploy/proxy-fleet/vagrant/provision/guest-network.sh
    shellcheck deploy/proxy-fleet/vagrant/provision/guest-network.sh
    corepack pnpm test -- scripts/testing/proxy-fleet-guest-network.spec.ts --runInBand
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

The Ruby commands are development checks; the configuration test uses Minitest and verifies provider resources
against both the tracked inventory and a modified fixture. The existing CI validation job sets up Ruby 3.3 and runs
both Ruby checks. Vagrant's bundled Ruby can run them locally where a standalone Ruby is unavailable. Normal lab
operation invokes Ruby only through Vagrant.
Without a usable provider, `vagrant validate --ignore-provider` checks only the shared configuration. It does not
replace normal provider validation or the VirtualBox lifecycle matrix.
The repository checks may use the development toolchain, but the delivered lab must remain operable without Node,
TypeScript, pnpm, or installed npm dependencies. Inspect the plan-sync dry run and require `proxy-fleet/17` to update
issue #429 without creating a replacement issue for this plan. The new `proxy-fleet/18` plan should be the only new
issue proposed for this scope split; inspect any other proposed updates separately.

On VirtualBox, create the machines without running the guest provisioner, then capture the connection handoff:

    cd deploy/proxy-fleet/vagrant
    provider=virtualbox
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
      network_snapshot='set -eu
      links=$(ip -o link show)
      addresses=$(ip -o -4 address show)
      routes=$(ip -4 route show)
      settings=$(sysctl -a -r "^net\.ipv4\.conf\..*\.rp_filter$" 2>/dev/null)
      nat_snapshot=$(sudo iptables-save -t nat)
      printf "%s\n" "$links" | grep -v " lef-egress0:"
      printf "%s\n" "$addresses" | grep -v " lef-egress0 " | sed -E "s/ valid_lft .*//"
      printf "%s\n" "$routes" | grep -Ev "^198\.18\.0\.(21|22|23)(/32)? "
      cat /etc/resolv.conf
      sysctl -n net.ipv4.ip_forward
      printf "%s\n" "$settings" | grep "^net\.ipv4\.conf\..*\.rp_filter =" | grep -v "^net\.ipv4\.conf\.lef-egress0\.rp_filter ="
      printf "%s\n" "$nat_snapshot" | sed "/^#/d"'
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

Run the probes after the first provision. Before and after the second `vagrant provision`, compare IPv4 addresses,
routes from every table, unrelated network facts, and the managed files. Use `sha256sum` and
`stat -c '%n %u:%g:%a:%y'` for the helper, unit, and verifier networkd fragment; require identical content, ownership, modes, and modification times.
Repeat the functional probes.

Capture `cat /proc/sys/kernel/random/boot_id` for each guest, then exercise persistence with provisioning disabled:

    vagrant halt
    vagrant status --machine-readable
    vagrant up --no-install-provider --no-provision
    vagrant status --machine-readable

Require four powered-off machines after halt and four running machines after startup. Recapture the boot identifiers
and require each to change. Require managed-file equality, repeat the functional probes on all guests, and repeat the
Ansible ping. Do not run `vagrant provision` between this startup and these checks.

Select the matrix provider explicitly for clean recreation:

    provider=virtualbox
    vagrant destroy -f
    vagrant status --machine-readable
    vagrant up --no-install-provider --provider="$provider"
    vagrant status --machine-readable

Require four absent machines after destruction and four running replacements after creation. Recapture SSH
configuration, repeat the functional and resource checks, and repeat the Ansible inventory validation and ping.
Then finish with `vagrant destroy -f` and require four absent machines from `vagrant status --machine-readable`.

Native Linux/libvirt repetition belongs to plan 18. Record only VirtualBox results against this plan's acceptance.

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

The following entries record sequential validation attempts. Each status describes its own attempt; later entries
record subsequent findings and results.

Initial host evidence on 2026-09-05:

- WSL-native Node 24.19.0 ran the repository validation; no Windows `node.exe` was used.
- `sh -n`, `dash -n`, and `bash -n` accepted `guest-network.sh`. Safe rejection probes covered missing intent,
  duplicate addresses and routes, mixed address/route modes, invalid CIDRs, an invalid interface, a route gateway
  outside the underlay, and non-root execution.
- Both Ruby/Vagrant and Ansible CLI validation were unavailable because their executables were not installed on this
  host. ShellCheck was also unavailable.
- The tracked inventory contract, plaintext-secret scan, Markdown formatting, Harper documentation lint, plan parser
  suites, lint, type checking, all repository tests, and the production build pass. Lint reports one preexisting test
  warning outside this diff.
- The plan-sync dry run finds no new issue and exactly two expected description updates: `proxy-fleet/16` issue #424
  remains in Backlog, and this plan's issue #429 remains In Progress.
- Provider creation, guest probes, reprovision, halt/resume, destruction, and clean recreation were still unverified
  on both matrices before the scope split. PR #518 later merged without that evidence; issue #429 was still incomplete at that point.

Follow-up evidence on 2026-09-06:

- The checkout matches the current master revision containing PR #518. Issue #429 is assigned and In Progress.
- Vagrant 2.4.9 was extracted into a local tool cache from HashiCorp's official package. The downloaded package matches
  the published SHA-256 checksum. Its bundled Ruby accepts the `Vagrantfile`.
  `vagrant validate --ignore-provider` passes for all four machines.
  Plain `vagrant validate` reported no usable provider; at that point, this host had neither Windows VirtualBox nor
  libvirt/KVM.
- On Ubuntu 24.04 in an isolated Docker network namespace, the original provisioner unnecessarily replaced all three
  correct routes and deleted an unrelated RFC 2544 subnet route using protocol `98`. Both defects are corrected.
  Jest regression cases cover unchanged, missing, incorrect, and stale host routes, subnet preservation, and failure
  to read the existing route before mutation.
- The Ansible 2.16.3 inventory read and existing inventory validator pass: twelve tasks succeed, with no changes or
  failures. The plaintext-secret scan also passes.
- The final script passes ShellCheck 0.9.0, three shell syntax checks, and 21 network assertions in a disposable
  Ubuntu 24.04 container with its own network namespace. These cover exact addresses, route reconciliation, repeated
  apply, unrelated network preservation, and rejection cases. The container was removed after validation.
- The generated systemd unit passes `systemd-analyze verify`. The installed helper and unit have the required root
  ownership and modes. Actual service startup cannot complete because systemd is not the container's first process.
- Repository lint, type checking, and build pass. Lint has one preexisting warning outside this change.
  `corepack pnpm test:ci` passes 198 Jest suites and 1,770 tests, plus 15 Node runner tests; eleven suites and 65 tests
  are skipped by the existing integration requirements. All seven focused route tests pass, including the subsequent
  failed-read regression. The plan-sync dry run creates no issue and updates only issue #429, retaining In Progress.
- These checks alone do not establish systemd startup, Ansible SSH reachability, or either provider's complete
  lifecycle. Real guest validation was still pending before the later attempts recorded below.

Guest-access attempt later on 2026-09-06:

- Vagrant 2.4.9 and Windows VirtualBox 7.2.16 are now installed. With Windows access enabled and VirtualBox on `PATH`,
  normal `vagrant validate` passes. Initial `vagrant status` reports all four machines as not created.
- `vagrant up proxy-manager-1 --no-install-provider --no-provision --provider=virtualbox` downloads the pinned box,
  imports the manager, and starts it. It then times out after the default 300 seconds while repeatedly reporting
  connection refusal at the selected SSH endpoint, `127.0.0.1:2222`.
- A direct WSL TCP probe confirms connection refusal. A Windows TCP probe reaches the forwarded port but receives no
  SSH banner before its read timeout. The VM console remains at the early boot message about loading essential
  drivers. VirtualBox logs report the slower Hyper-V execution mode; these observations do not establish the cause
  of the incomplete guest boot.
- `vagrant ssh proxy-manager-1 -c hostname -- -o ConnectTimeout=5` exits with status 255 and returns no hostname.
  Guest access was therefore unconfirmed, and the guest probe checkbox was still incomplete.
- During this attempt, WSL was in NAT mode, and the installed Vagrant provider used Windows `127.0.0.1` for SSH
  forwarding. That connection path needed resolution, but the missing Windows-side SSH banner meant networking
  alone was not a sufficient explanation for the failed test.
- The manager was stopped with `vagrant halt proxy-manager-1 --force` after the failed test. Its state and the cached
  box were preserved for diagnosis; the other three machines had not been created. No guest provisioning ran.

Successful guest validation after Windows configuration changes on 2026-09-06:

- Both Windows Hypervisor Platform and Virtual Machine Platform report enabled, and `wslinfo --networking-mode`
  reports `mirrored`. The manager's direct Vagrant boot and SSH commands succeed. SSH confirms the correct hostname,
  the declared underlay address, and a running systemd state.
- All four guests are created without provisioning and report running. The second proxy initially exceeds the
  300-second boot timeout. After inspecting `vagrant status`, a scoped `vagrant halt proxy-node-b --force` and direct
  `up` retry succeed. No CPU, box, or provider configuration changes are made for that retry.
- The captured Vagrant SSH configuration lets Ansible 2.20.8 reach all four guests: each returns `pong` with
  `changed: false`. The tracked inventory validator also passes twelve tasks without changes or failures.
- Before the first provision, none of the guests contains the persistence unit. `vagrant provision` then succeeds,
  and every guest's unrelated network snapshot matches its baseline exactly: interfaces, default routes, DNS, NAT,
  IP forwarding, and reverse-path filtering remain unchanged.
- The proxy guests have exactly the declared two and one RFC 2544 addresses. The verifier has exactly three protocol
  `98` return routes through the expected underlay gateways and successfully pings all three identities. The manager
  has neither lab routes nor the dummy interface; the verifier has no dummy interface.
- All three provisioned guests have active, enabled persistence units and the expected root ownership and file
  modes. A second `vagrant provision` passes. All functional probes pass again, and the captured network snapshots,
  installed-file hashes, modes, ownership, and modification times remain identical.
- A later `vagrant halt` succeeds, but `vagrant up --no-provision` reaches SSH only on the manager before the first
  proxy exceeds the 300-second boot timeout. Starting the remaining stopped guests also times out on the second
  proxy. The verifier therefore remains stopped. The first proxy is left in the same boot attempt for more than
  thirteen minutes; its console remains at loading essential drivers, and another direct SSH probe exits with
  status 255. Persistence and clean recreation were not verified in that attempt, so its lifecycle matrix remained incomplete.
- After the failed persistence test, `vagrant halt --force` succeeds. Final `vagrant status` reports all four guests
  powered off. Their disks and provider logs remain available for diagnosis; no destruction or clean recreation ran.
- The direct guest checkbox now records VirtualBox evidence. The native Linux/libvirt matrix remains unverified;
  this WSL host has no `/dev/kvm` device, and the operator confirms that no separate Linux host is available.
- The final plan-sync dry run creates no issue and proposes description updates for issue #429 and the unrelated
  issue #458. Issue #429 retains In Progress. At that point, no live synchronization had run, so the checked progress item was
  recorded only in the local ExecPlan.

Scope split requested later on 2026-09-06:

- Plan 18 now owns the native Linux/libvirt matrix, including direct guest probes, Ansible handoff, repeated
  provisioning, halt/resume, destruction, and clean recreation. Earlier two-provider requirements above are
  historical evidence; the current acceptance criteria in this plan cover VirtualBox only.
- No libvirt result was marked as passed. At the time of the scope split, this plan remained incomplete because the
  VirtualBox halt/resume test failed and destruction and clean recreation had not run. The provider definition, inventory, and guest provisioner are
  unchanged by this documentation split.

Investigation of boot failures later on 2026-09-06:

- The original provider logs were preserved before subsequent boots rotated them. All four recorded failures stop
  at the same disk-read count, with completed disk requests, before Guest Additions and the guest network service start. Both
  successful and failed boots use VirtualBox's slower Hyper-V execution mode; that warning alone does not diagnose
  the failure.
- Booting `proxy-node-a` alone with the original two CPUs succeeds while debugger probes run. Its kernel log records
  delayed timer checks and implausible benchmark throughput. This is not an undisturbed control: inspecting registers
  interrupts the selected virtual CPU's native execution call.
- Temporary serial output and kernel initialization logging were enabled on that proxy. With two CPUs and no debugger
  probes during startup, `vagrant up proxy-node-a --no-provision --provider=virtualbox` again exceeds 300 seconds.
  Console output stops at loading essential drivers. One register read on CPU 1 immediately releases timer work;
  the kernel reports a 283-second interval between clock watchdog checks and a stack in
  `raid6_choose_gen.constprop.0+0x8c`, waiting for a timer tick.
  One benchmark completes, then output stops again for more than a minute.
- The [Linux 6.8 initialization code](https://github.com/torvalds/linux/blob/v6.8/lib/raid6/algos.c) waits for `jiffies`
  to advance before and during these benchmarks. The verified
  [VirtualBox 7.2.16 source](https://download.virtualbox.org/virtualbox/7.2.16/VirtualBox-7.2.16.tar.bz2) assigns timer
  processing to the last virtual CPU and uses a native execution cancellation when a debugger request wakes that CPU.
  These mechanisms fit the captured stall, but the precise missed timer or wake-up defect is not established.
- A temporary, ignored Vagrant configuration gives only `proxy-node-a` one CPU while preserving its disk, box,
  memory, and network definitions. The first boot succeeds without debugger intervention. Kernel initialization
  completes normally, the network unit is active and enabled, and both declared egress addresses persist.
- After removing the temporary kernel options and disabling the serial port, three consecutive `vagrant halt` and
  `up` cycles with one CPU succeed in 92.1, 96.9, and 94.2 seconds for the `up` commands. Direct SSH checks after each
  boot confirm one CPU, an active and enabled network unit, and exactly the two declared egress addresses. No
  debugger probes run during these boots. No matching long timer-check interval or stalled-kernel report recurs.
- Each repeat still records a kernel warning at `kernel/rcu/tree_plugin.h:734` in `rcu_sched_clock_irq`. Successful
  SSH and address persistence therefore establish only a provisional boot workaround. At this experimental stage, the other three guests and
  the complete lifecycle had not been validated with one CPU. The tracked two-CPU configuration was unchanged.
  The warning occurs during Guest Additions initialization and is consistent with the separate RCU imbalance
  reported in [VirtualBox issue 359](https://github.com/VirtualBox/virtualbox/issues/359). Its impact and a fix remain
  unverified; it does not establish that the earlier timer stall recurred.
- After the experiment, the proxy was halted through Vagrant and its original two-CPU allocation was restored.
  The serial port is disabled, and the temporary guest boot configuration and diagnostic Vagrant definition have
  been removed. Final Vagrant status confirms all four machines are powered off. Detailed logs and the ignored
  one-CPU experiment definition remain local for another controlled test. No machine was destroyed.

One-CPU matrix and route-persistence discovery later on 2026-09-06:

- All four guests passed fresh creation without provisioning using the tracked one-CPU VirtualBox configuration.
  Resource inspection confirmed one CPU and 2,048 megabytes per guest. Vagrant SSH and Ansible reached all four.
- First provisioning preserved every unrelated network baseline. Exact addresses, routes, connectivity, and service
  state passed. Repeated provisioning preserved network state and managed-file content, ownership, modes, and times.
- All four guests halted and booted successfully with provisioning disabled and no debugger probes. Every boot
  identifier changed. The proxy addresses persisted, and all managed files were unchanged.
- The verifier's `oneshot` finished at 20:57:50 UTC. At 20:58:06 UTC, the same networkd process reconfigured the underlay
  after Vagrant reapplied Netplan. The three protocol-98 routes were absent afterward, although the unit remained
  active and enabled. This is a separate route-persistence failure, not a recurrence of the earlier boot timeout.
- A scoped experiment added only the three declared routes to a matching networkd fragment on the verifier. Netplan loaded the
  fragment, and the routes returned after asynchronous network reconfiguration completed. This justifies the added
  owned file; it does not replace a fresh complete lifecycle test of the final implementation.

Final VirtualBox matrix completed on 2026-09-06:

- Environment: Windows 11 with Windows Hypervisor Platform enabled, WSL2 mirrored networking, Ubuntu 26.04.1 in WSL,
  Vagrant 2.4.9, and VirtualBox `7.2.16r174877`. The unchanged AMD64 box pin is `bento/ubuntu-24.04` version
  `202508.03.0`, with guest kernel `6.8.0-64-generic` and Guest Additions 7.1.12.
- Fresh creation with `--no-provision` produced exactly four running guests. Provider and guest checks confirmed one
  CPU, 2,048 megabytes of configured memory, correct hostnames and underlay addresses, and no initial owned network
  state or managed files. Vagrant SSH and Ansible reached every guest. The inventory validator passed twelve tasks
  with no changes, unreachable hosts, or failures.
- First provisioning preserved all four untouched network baselines exactly. Proxy identities, verifier routes,
  route selection, and ICMP reachability passed. The manager received no owned state; only the verifier received the
  exact three-route networkd fragment. All managed files had the expected content, root ownership, and modes.
- Repeated provisioning passed with identical interfaces, IPv4 addresses and routes, DNS, NAT, forwarding,
  reverse-path filtering, and managed-file hashes, ownership, modes, and modification times. The helper, unit, and
  verifier fragment were included. All three persistence units were active and enabled.
- Halt produced four powered-off guests. `vagrant up --no-install-provider --no-provision` then restored four running
  guests with changed boot identifiers and unchanged managed files. All functional probes and Ansible pings passed,
  including the verifier's three protocol-98 routes after Vagrant's Netplan reconfiguration. No provisioning or manual
  service restart ran between startup and these probes.
- Vagrant destruction removed the first environment and its exact provider IDs. Ordinary provider-selected creation
  then produced four replacements with different IDs and automatic provisioning. Resource checks, all functional
  probes, inventory validation, and Ansible pings passed again. Final `vagrant destroy -f` left all four aliases
  `not_created`; IDs from both generations were absent from VirtualBox. Logs were preserved locally, and the obsolete
  diagnostic override and generated SSH handoff were removed.
- All twelve boots in this final matrix passed without a boot timeout or debugger intervention. The separate RCU
  warning remains present in guest logs. This evidence covers the documented development lifecycle and network
  ownership, not general kernel stability or native Linux/libvirt parity.
- Final local validation passes: ShellCheck 0.11, shell syntax, Ruby syntax, two Ruby tests with 34 assertions, all
  30 focused shell tests, lint, type checking, build, the module architecture gate, and secret scanning. Lint retains
  one preexisting warning in `load-secrets.spec.ts`. The final full `test:ci` run passes 201 Jest suites and 1,823 tests,
  plus 15 Node runner tests; eleven suites and 65 tests retain their existing integration skips.
- An earlier full test run exposed two preexisting intermittent failures: an order-sensitive concurrent HTTP request
  assertion in `http-domain-synonym-discovery.integration.spec.ts`, and a possible unchanged ciphertext in the
  tampering test in `session-encryptor.spec.ts`. The relevant files matched the base revision. A subsequent full run
  and the final expanded run passed. These failures are recorded separately from the successful lab validation.

- The final focused route and plan suites pass 89 tests. The synchronization dry run retains issue #429 for completed
  plan 17 and proposes only one new issue, for plan 18. It also proposes three unrelated frontend issue updates
  because master advanced during validation; those proposals were inspected separately. No live synchronization ran.

## Plan readiness

Ready to implement.
