# Validate the Vagrant Lab on Native Linux with Libvirt

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

MVP scope decision (2026-10-24): verification workers will connect directly to mail servers. Native Linux/libvirt
validation is deferred to the post-MVP backlog. Resume after an explicit decision to adopt a proxy fleet and use
this provider.

Establish that the shared four-machine Vagrant lab works on native AMD64 Linux with libvirt and KVM. A developer
must be able to create the lab, connect through Vagrant and Ansible, provision its declared guest networking without
changing unrelated network settings, reboot without provisioning, destroy it, and create a clean replacement.

This plan owns the complete native Linux/libvirt acceptance matrix in one future pull request. Plan 17 owns the
shared implementation and Windows WSL2/VirtualBox validation. Passing this plan makes native Linux an independently
validated alternative for the later fleet scenarios; it does not establish VirtualBox success.

## Progress

- [ ] (2026-09-06) Obtain a native AMD64 Linux host and verify Vagrant, libvirt, KVM, plugin, and Ansible prerequisites.
- [ ] (2026-09-06) Create exactly four guests with provisioning disabled and verify resources, underlay addresses, SSH, and Ansible access.
- [ ] (2026-09-06) Prove unrelated network preservation, exact owned guest state, and repeated-provision idempotency.
- [ ] (2026-09-06) Prove persistence after actual halt and boot with provisioning disabled.
- [ ] (2026-09-06) Destroy, recreate, repeat functional checks, and complete final cleanup through Vagrant.
- [ ] (2026-09-06) Record sanitized evidence, validate any focused fixes, and complete the documentation checks.

## Plan dependencies

- `proxy-fleet/17`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Defer native Linux/libvirt validation beyond the MVP and close GitHub issue #551 as not planned.
  Rationale: MVP workers will connect directly to mail servers. Preserve the unfinished validation matrix and its
  dependency on plan 17; reopen the issue if we adopt a proxy fleet and need this provider.
  Date/Author: 2026-10-24, project owner and Codex.
- Decision: Separate native Linux/libvirt validation from plan 17 without changing the shared implementation.
  Rationale: The operator currently has no native Linux host. A separate plan preserves the complete provider matrix
  while allowing plan 17 to finish against its own VirtualBox criteria. The dependency points from this plan to
  plan 17; plan 17 does not wait for this plan.
  Date/Author: 2026-09-06, project owner and Codex planning.
- Decision: Retain two CPUs for libvirt, the shared box pin, 2,048 megabytes of memory, topology, and guest provisioner.
  Rationale: VirtualBox boot failures do not justify changing libvirt configuration or weakening the resource contract.
  Fix only defects demonstrated by this matrix, with focused regression coverage where applicable.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Use direct Vagrant commands and temporary evidence files throughout validation.
  Rationale: Vagrant already owns lifecycle state and SSH discovery. A second controller, provider inventory service,
  lifecycle wrapper, or application runtime would duplicate that responsibility.
  Date/Author: 2026-09-06, Codex planning.
- Decision: Require `vagrant halt` followed by `vagrant up --no-provision` for persistence evidence.
  Rationale: A normal `up` may run provisioning and conceal a broken boot-time persistence unit. A changed guest boot
  identifier and restored state without provisioning establish that a fresh boot actually exercised the unit.
  Date/Author: 2026-09-06, Codex planning.

## Outcomes & Retrospective

Deferred on 2026-10-24. GitHub issue #551 is closed as not planned. No native Linux/libvirt validation has run,
and all six progress items remain incomplete. The matrix is preserved for reconsideration after the MVP.

## Context and Orientation

`deploy/proxy-fleet/vagrant/Vagrantfile` reads the one tracked, nonsecret topology at
`deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml`. Vagrant 2.4.9 or later loads the definition using its own Ruby
runtime. The box is `bento/ubuntu-24.04`, version `202508.03.0`, architecture `amd64`. Each guest receives two CPUs and
2,048 megabytes of memory. The default shared folder is disabled, and Vagrant uploads the guest script through SSH.

The libvirt provider uses `qemu:///system`. Its management network is `vagrant-libvirt`, with NAT on
`192.168.121.0/24`; the definition deliberately retains that management network on destruction. A separate isolated
network, `proxy-fleet-lab`, uses `192.168.250.0/24`, host address `192.168.250.1`, no forwarding, and no DHCP.

| Machine           | Ansible group          | Underlay address    | Guest state owned by this lab                                             |
| ----------------- | ---------------------- | ------------------- | ------------------------------------------------------------------------- |
| `proxy-manager-1` | `swarm_managers`       | `192.168.250.11/24` | No dummy interface or test return routes                                  |
| `proxy-node-a`    | `proxy_nodes`          | `192.168.250.12/24` | `198.18.0.21/32` and `198.18.0.22/32` on `lef-egress0`                    |
| `proxy-node-b`    | `proxy_nodes`          | `192.168.250.13/24` | `198.18.0.23/32` on `lef-egress0`                                         |
| `verifier-1`      | `verification_workers` | `192.168.250.14/24` | Three host routes: `.21` and `.22` through `.12`, and `.23` through `.13` |

The verifier routes use numeric protocol `98` in the main routing table. All route destinations above are in
`198.18.0.0/24`, and all gateways are on the declared underlay. WireGuard overlay addresses `172.29.10.1/28` through
`172.29.10.4/28` and proxy listener ports remain inventory data for later Ansible application provisioning; this plan
does not create those listeners or deploy WireGuard.

`provision/guest-network.sh` runs only inside the two proxies and verifier. It installs the helper
`/usr/local/libexec/proxy-fleet-lab-network` with root ownership and mode `0755`, and the unit
`/etc/systemd/system/proxy-fleet-lab-network.service` with root ownership and mode `0644`. The verifier additionally owns
`/etc/systemd/network/10-netplan-<underlay-interface>.network.d/50-proxy-fleet-lab-routes.conf`, also root-owned with mode
`0644`. It declares exactly the three protocol-98 routes so they survive Vagrant's later Netplan reconfiguration. The enabled systemd unit
restores the owned guest networking after boot. The provisioner must preserve unrelated interfaces, routes, DNS, NAT,
IP forwarding, and reverse-path filtering. Existing route regression tests are in
`scripts/testing/proxy-fleet-guest-network.spec.ts`.

The inventory's `ansible_host` values are the four Vagrant aliases. Vagrant supplies provider-specific SSH endpoints
and identity paths through an ignored file at `.vagrant/proxy-fleet/ssh-config`. The existing
`deploy/proxy-fleet/ansible/playbooks/validate-inventory.yml` checks the inventory contract before application roles run.

## Scope and Non-Goals

This plan's implementation pull request will record the native Linux/libvirt matrix in this plan and update the existing Vagrant README with
any verified operator guidance. A demonstrated validation failure may justify a narrow fix in the existing
`Vagrantfile`, inventory, or guest provisioner, together with focused tests and renewed checks of affected shared
behavior. Record the failure and rationale before changing implementation. Broader changes require a separate plan.

Keep the provider implementation shared with plan 17. Do not add a Node or TypeScript runtime, package dependency,
generated inventory, provider inspector, lifecycle API, wrapper script, host resource adoption, or concurrency layer.
Do not change CPU counts, the memory allocation, box version, address topology, or providers merely to obtain a pass.
This plan does not validate VirtualBox, deploy Swarm or the fleet application, allocate public addresses, exercise
SMTP, change HTTP APIs, introduce database migrations, or replace the plan-12 secrets workflow.

## Plan of Work

First, obtain a native AMD64 Linux host with hardware virtualization available through KVM, a working system libvirt
daemon, Vagrant, the `vagrant-libvirt` plugin, OpenSSH, and Ansible. Use a dedicated checkout whose lab has no existing
machines. Verify that the management and underlay address ranges are suitable for that host. Record software versions
and prerequisite results. This host is an execution prerequisite, not an unresolved design choice.

Next, validate the existing definition and inventory, then create all four guests with provisioning disabled. Confirm
that Vagrant records exactly the four expected machines, each boots with the declared resources and underlay address,
and all four are reachable through the generated SSH configuration. Capture the unrelated guest network baseline
before the first provision. Run the provisioner, compare that baseline, and assert exact proxy addresses, verifier
routes and reachability, and persistence unit state. Repeat provisioning while comparing both network state and
installed file contents, ownership, permissions, and modification times.

Then halt every guest, verify that each is stopped, and boot with `--no-provision`. Require a different boot identifier
for each guest, repeat SSH and Ansible checks, and repeat all functional and installed-file checks. Do not substitute
a provisioned boot or suspend/resume for this persistence test.

Finally, destroy the lab through Vagrant, verify all four machines are absent, recreate the same topology, recapture
SSH information, and repeat the functional and Ansible checks. Destroy the replacement lab and verify final absence.
Update this plan and `deploy/proxy-fleet/vagrant/README.md` with concise, sanitized evidence. If a step fails, leave its
progress item unchecked, preserve scoped diagnostic evidence, and follow the recovery procedure before retrying.

## Interfaces and Dependencies

Plan 17 supplies the shared Vagrant definition, inventory, guest script, and ownership contract. This plan adds no
public interface or runtime dependency. Normal operation needs Vagrant, the host's libvirt/KVM installation, and the
`vagrant-libvirt` provider plugin. Ansible and OpenSSH are validation tools. Node and pnpm are required only for existing
repository checks if code or documentation changes; the lab itself must remain operable without them.

One operator runs one lifecycle command at a time from `deploy/proxy-fleet/vagrant/`. Vagrant's local state is the
ownership boundary. The retained management network and cached box are not failed guest cleanup; do not remove shared
provider networks, cached boxes, or resources belonging to another Vagrant environment.

## Acceptance Criteria

- On a native AMD64 Linux host with KVM and `qemu:///system` access, normal Vagrant validation and the tracked
  inventory validator pass. Validation without a usable provider, WSL results, and container probes do not satisfy
  this matrix.
- Creation produces exactly the four declared Ubuntu 24.04 guests, with two CPUs and 2,048 megabytes configured per guest,
  correct underlay addresses, and no default synced folder. All four Vagrant SSH probes and Ansible pings succeed.
- First provisioning preserves every guest's unrelated network snapshot exactly. Proxy address sets and verifier
  protocol-98 route sets match the inventory exactly, and the verifier reaches all three test addresses by ICMP.
  The manager receives no lab helper, unit, dummy interface, or owned routes; the verifier receives no dummy interface.
- The helper and unit have the declared root ownership and modes on both proxies and the verifier. The verifier's
  networkd fragment declares exactly its three routes and has the required root ownership and mode; it is absent
  from the other guests. All three units
  are active and enabled. Repeated provisioning leaves network state, file contents, metadata, and modification times
  unchanged, and all functional checks still pass.
- After all four guests actually halt and boot with provisioning disabled, each has a changed boot identifier.
  All SSH and Ansible probes succeed, and all functional checks pass. Installed file contents and metadata are unchanged.
- Vagrant destruction reports all four machines absent. Clean recreation passes the same functional and Ansible
  checks. Final destruction again reports all four absent, without deleting unrelated resources.
- Evidence identifies the tested host, software versions, and pinned box without secrets or machine identifiers.
  Any scoped fixes pass relevant regression and repository checks. Untested or
  failed steps remain explicitly incomplete.

## Validation

Run these commands only on the prepared native Linux host. Use one shell session for the variables below, and stop at
the first failed command or assertion. Follow the chosen Linux distribution's documented installation procedure
for Vagrant and libvirt; do not install or change a provider implicitly during `up`.

    set -eu
    test "$(uname -m)" = x86_64
    if grep -qi microsoft /proc/sys/kernel/osrelease; then
      echo 'This matrix requires native Linux, not WSL.' >&2
      exit 1
    fi
    test -c /dev/kvm
    test -r /dev/kvm
    test -w /dev/kvm
    cat /etc/os-release
    uname -r
    vagrant --version
    vagrant plugin list
    virsh --connect qemu:///system version
    ansible --version

Require Vagrant 2.4.9 or later and an installed `vagrant-libvirt` plugin. If that plugin is missing, install it explicitly
with `vagrant plugin install vagrant-libvirt`, then repeat the prerequisite checks. Record actual versions. From the
repository root, run:

    cd deploy/proxy-fleet/ansible
    ansible-inventory -i inventory/vagrant-lab.yml --list
    ansible-playbook -i inventory/vagrant-lab.yml playbooks/validate-inventory.yml
    cd ../vagrant
    export VAGRANT_DEFAULT_PROVIDER=libvirt
    vagrant validate
    vagrant status --machine-readable

The initial status must contain exactly the four declared names, all not created. Do not destroy existing machines to
manufacture this prerequisite; use an intact, dedicated environment. Create and capture SSH information:

    vagrant up --no-install-provider --no-provision --provider=libvirt
    vagrant status --machine-readable
    install -d -m 0700 .vagrant/proxy-fleet
    (umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
    machines='proxy-manager-1 proxy-node-a proxy-node-b verifier-1'
    evidence_dir="$(mktemp -d /tmp/lef-libvirt-validation.XXXXXX)"
    for machine in $machines; do
      vagrant ssh "$machine" -c 'set -eu; hostname; . /etc/os-release; test "$ID:$VERSION_ID" = ubuntu:24.04 && test "$(uname -m)" = x86_64 && test "$(getconf _NPROCESSORS_ONLN)" -eq 2 && ! mountpoint -q /vagrant && test ! -e /usr/local/libexec/proxy-fleet-lab-network && test ! -e /etc/systemd/system/proxy-fleet-lab-network.service'
    done
    vagrant ssh proxy-manager-1 -c 'set -eu; addresses=$(ip -o -4 address show); printf "%s\n" "$addresses" | grep -F "192.168.250.11/24"'
    vagrant ssh proxy-node-a -c 'set -eu; addresses=$(ip -o -4 address show); printf "%s\n" "$addresses" | grep -F "192.168.250.12/24"'
    vagrant ssh proxy-node-b -c 'set -eu; addresses=$(ip -o -4 address show); printf "%s\n" "$addresses" | grep -F "192.168.250.13/24"'
    vagrant ssh verifier-1 -c 'set -eu; addresses=$(ip -o -4 address show); printf "%s\n" "$addresses" | grep -F "192.168.250.14/24"'
    (
      cd ../ansible
      ANSIBLE_SSH_COMMON_ARGS="-F $(realpath ../vagrant/.vagrant/proxy-fleet/ssh-config)" \
        ansible all -i inventory/vagrant-lab.yml -m ping
    )

Require four running machines and four `pong` results. Verify two virtual CPUs and 2,048 megabytes of configured memory
for each domain using read-only details from libvirt for the domains recorded by this environment. Guest `MemTotal` is lower
than the configured allocation because the kernel reserves memory; do not treat it as the configured memory value.
Use only the local Vagrant machine IDs to select these domains:

    for machine in $machines; do
      domain_id="$(cat ".vagrant/machines/$machine/libvirt/id")"
      LC_ALL=C virsh --connect qemu:///system dominfo "$domain_id"
      domain_xml="$(virsh --connect qemu:///system dumpxml "$domain_id")"
      printf '%s\n' "$domain_xml" | grep -F "<domain type='kvm'"
    done

Inspect `CPU(s): 2`, maximum memory `2097152 KiB`, and domain type `kvm` for all four. Keep raw domain details local
and omit identifiers from the recorded evidence. This is a scoped read for validation, not a new provider discovery
mechanism.

Capture the first network baseline and compare after provisioning. The filter excludes only owned test addresses and
routes, changing address lifetimes, and `iptables-save` timestamp comments. A failed NAT read must fail the snapshot.

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
    for machine in $machines; do
      vagrant ssh "$machine" -c "$network_snapshot" > "$evidence_dir/$machine.before"
    done
    vagrant provision
    for machine in $machines; do
      vagrant ssh "$machine" -c "$network_snapshot" > "$evidence_dir/$machine.after"
      diff -u "$evidence_dir/$machine.before" "$evidence_dir/$machine.after"
    done

Require every comparison to be empty. Run the following functional probe block after first provision, after repeated
provision, after the persistence boot, and after clean recreation. Protocol selection uses `-N` so route names cannot
change the expected numeric protocol. Exact route output is normalized only for whitespace and host-prefix notation.

    vagrant ssh proxy-manager-1 -c 'set -eu; links=$(ip -o link show); routes=$(ip -N -o -4 route show table main proto 98); test -z "$routes"; if printf "%s\n" "$links" | grep -q " lef-egress0:"; then exit 1; fi; test ! -e /usr/local/libexec/proxy-fleet-lab-network; test ! -e /etc/systemd/system/proxy-fleet-lab-network.service'
    vagrant ssh proxy-node-a -c 'set -eu; addresses=$(ip -o -4 address show dev lef-egress0); actual=$(printf "%s\n" "$addresses" | awk "{print \$4}" | sort); test "$actual" = "$(printf "%s\n" 198.18.0.21/32 198.18.0.22/32)"'
    vagrant ssh proxy-node-b -c 'set -eu; addresses=$(ip -o -4 address show dev lef-egress0); actual=$(printf "%s\n" "$addresses" | awk "{print \$4}"); test "$actual" = 198.18.0.23/32'
    vagrant ssh verifier-1 -c 'set -eu; links=$(ip -o link show); if printf "%s\n" "$links" | grep -q " lef-egress0:"; then exit 1; fi; routes=$(ip -N -o -4 route show table main proto 98); addresses=$(ip -o -4 address show); underlay=$(printf "%s\n" "$addresses" | awk "\$4 == \"192.168.250.14/24\" {print \$2}"); test -n "$underlay"; actual=$(printf "%s\n" "$routes" | sed "s@/32 @ @" | awk "{\$1=\$1; print}" | sort); expected=$(printf "%s\n" "198.18.0.21 via 192.168.250.12 dev $underlay proto 98" "198.18.0.22 via 192.168.250.12 dev $underlay proto 98" "198.18.0.23 via 192.168.250.13 dev $underlay proto 98"); test "$actual" = "$expected"'
    vagrant ssh verifier-1 -c 'set -eu; ping -c 1 -W 2 198.18.0.21; ping -c 1 -W 2 198.18.0.22; ping -c 1 -W 2 198.18.0.23'
    for machine in proxy-node-a proxy-node-b verifier-1; do
      vagrant ssh "$machine" -c 'set -eu; systemctl is-active --quiet proxy-fleet-lab-network.service; systemctl is-enabled --quiet proxy-fleet-lab-network.service; test "$(stat -c "%u:%g:%a" /usr/local/libexec/proxy-fleet-lab-network)" = 0:0:755; test "$(stat -c "%u:%g:%a" /etc/systemd/system/proxy-fleet-lab-network.service)" = 0:0:644'
    done

On the verifier, require exactly one owned networkd fragment matching the discovered underlay interface. Its content
must contain exactly the three inventory destinations and gateways as `[Route]` sections with `Protocol=98`; require
root ownership and mode `0644`. Require this fragment to be absent on the manager and both proxies. Include it in the
file comparisons below, and repeat these assertions after provisioning, reboot, and recreation.

For repeated provisioning, compare the captured IPv4 address and main-table route state, unrelated network facts,
and installed file hashes and metadata. Modification times must stay unchanged when the existing files are correct.

    owned_snapshot='set -eu; addresses=$(ip -o -4 address show); printf "%s\n" "$addresses" | sed -E "s/ valid_lft .*//"; ip -N -o -4 route show table main'
    file_snapshot='set -eu; for file in /usr/local/libexec/proxy-fleet-lab-network /etc/systemd/system/proxy-fleet-lab-network.service /etc/systemd/network/10-netplan-*.network.d/50-proxy-fleet-lab-routes.conf; do if test -f "$file"; then sha256sum "$file"; stat -c "%n %u:%g:%a:%y" "$file"; fi; done'
    for machine in $machines; do
      vagrant ssh "$machine" -c "$network_snapshot; $owned_snapshot; $file_snapshot" > "$evidence_dir/$machine.repeat-before"
      vagrant ssh "$machine" -c "$file_snapshot" > "$evidence_dir/$machine.files-before"
      vagrant ssh "$machine" -c 'set -eu; cat /proc/sys/kernel/random/boot_id' > "$evidence_dir/$machine.boot-before"
    done
    vagrant provision
    for machine in $machines; do
      vagrant ssh "$machine" -c "$network_snapshot; $owned_snapshot; $file_snapshot" > "$evidence_dir/$machine.repeat-after"
      diff -u "$evidence_dir/$machine.repeat-before" "$evidence_dir/$machine.repeat-after"
    done

Repeat the functional probe block, then exercise persistence through an actual boot:

    vagrant halt
    vagrant status --machine-readable
    vagrant up --no-install-provider --no-provision
    vagrant status --machine-readable
    (umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
    for machine in $machines; do
      vagrant ssh "$machine" -c 'set -eu; cat /proc/sys/kernel/random/boot_id' > "$evidence_dir/$machine.boot-after"
      test -s "$evidence_dir/$machine.boot-before"
      test -s "$evidence_dir/$machine.boot-after"
      if cmp -s "$evidence_dir/$machine.boot-before" "$evidence_dir/$machine.boot-after"; then
        echo "$machine did not reboot; evidence remains in $evidence_dir" >&2
        exit 1
      fi
      vagrant ssh "$machine" -c "$file_snapshot" > "$evidence_dir/$machine.files-after"
      diff -u "$evidence_dir/$machine.files-before" "$evidence_dir/$machine.files-after"
    done

Require stopped state for all four after `halt`, running state for all four after `up`, and changed boot identifiers.
Repeat the functional probe block, the four underlay address probes, and the Ansible ping command. Do not run
`vagrant provision` between halt and these checks. A failed boot or SSH timeout leaves persistence incomplete.

Finally, run the clean recreation sequence:

    vagrant destroy -f
    vagrant status --machine-readable
    vagrant up --no-install-provider --provider=libvirt
    vagrant status --machine-readable
    install -d -m 0700 .vagrant/proxy-fleet
    (umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)

Require exactly four absent machines after destruction and exactly four running replacements after recreation.
Repeat the functional probe block, the underlay address probes, resource inspection, and Ansible inventory and ping
commands. After recording their results, finish with:

    vagrant destroy -f
    vagrant status --machine-readable

Require all four machines to be absent. Remove only the temporary evidence directory created in this session after
recording sanitized results; retain it when a failure needs diagnosis. Do not publish raw SSH configuration, domain
information, or boot identifiers.

From the repository root, run the documentation checks for this plan and any updated operator documentation:

    PLANS_DRY_RUN=true corepack pnpm plans:sync
    git diff --check

Inspect the synchronization dry run before any separate live synchronization. It must retain the stable
`proxy-fleet/18` identity and dependency on `proxy-fleet/17`; it must not make plan 17 depend on this plan. If a focused
implementation fix is necessary, also run the applicable shell checks and existing route regressions, followed by the
repository checks required for the changed behavior:

    sh -n deploy/proxy-fleet/vagrant/provision/guest-network.sh
    shellcheck deploy/proxy-fleet/vagrant/provision/guest-network.sh
    corepack pnpm test -- proxy-fleet-guest-network.spec.ts --runInBand
    corepack pnpm lint
    corepack pnpm typecheck
    corepack pnpm test:ci
    corepack pnpm build

No Bruno coverage is required for provider validation or guest network fixes below the HTTP boundary. Do not replace
any live libvirt acceptance step with these repository checks.

## Idempotence and Recovery

Read-only validation and SSH probes can be repeated. Recapturing SSH configuration replaces only an ignored file.
Repeated provisioning must converge without modifying already correct network facts or installed files. Halt and boot
must preserve the provisioned state, and destruction must be limited to machines owned by this Vagrant environment.

After a failure, wait for the active Vagrant command to exit and inspect `vagrant status`. Preserve `.vagrant`, captured
comparison files, and relevant logs. Diagnose the failed stage before retrying the same direct command; do not loop on
boot timeouts without new evidence. A failed first provision can be retried against the preserved original baseline,
but a fresh baseline taken after a failed mutation cannot prove that the original state was preserved.

If a clean baseline is needed, destroy this intact environment through Vagrant and repeat creation with provisioning
disabled. Never remove `.vagrant` first or delete raw libvirt resources to bypass ownership errors. If local state is lost
while domains remain, automatic ownership recovery is not promised; stop and document the conflict before cleanup.
Provider installation, host reconfiguration, or resource changes beyond this lab are not implicit recovery steps.

## Artifacts and Notes

As of planning on 2026-09-06, the operator has no separate native Linux host, and the current WSL environment has no
`/dev/kvm` device. This plan has not executed any libvirt lifecycle or guest probe. Obtain the prepared native host
before beginning the matrix; its absence does not leave a product or implementation decision unresolved.

Record the native host distribution and kernel, architecture, Vagrant version, libvirt and QEMU versions, provider
plugin version, pinned box version, and date. Record sanitized four-machine statuses, resource assertions, guest
address and route assertions, baseline comparison results, Ansible recaps, repeated-provision equality, changed boot
identifier assertions, clean recreation, and final absence. Keep failed checks and scoped diagnostic findings visible.
Do not copy provider domain IDs, boot IDs, SSH private-key paths, raw SSH configuration, Vault data, keys, credentials,
or host-specific absolute paths into tracked documentation.

The future implementation pull request owns this complete validation outcome and any narrowly justified fixes.
Link it to this plan's synced issue. Keep broader feature work and VirtualBox lifecycle validation in
their own plans. The current documentation split itself neither executes this matrix nor marks any step complete.

## Plan readiness

Ready after a post-MVP decision to adopt a proxy fleet and use native Linux/libvirt
