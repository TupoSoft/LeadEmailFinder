# Proxy-Fleet Vagrant Development Lab

This directory defines a disposable four-machine Ubuntu 24.04 lab for the proxy-fleet Ansible and Swarm workflows.
Vagrant is the lifecycle interface; there is no repository-specific wrapper.

The lab contains one Swarm manager, two proxy nodes, and one verifier. Its tracked inventory is
`../ansible/inventory/vagrant-lab.yml`. The same inventory supplies Vagrant's stable guest names and underlay addresses
and supplies Ansible's host and proxy-listener data. Vagrant's generated state and captured SSH configuration stay
under the ignored `.vagrant/` directory.

Validation is tracked separately: [plan 17](../../../.agents/plans/proxy-fleet/17-provision-vagrant-native-development-lab.md)
owns Windows WSL2/VirtualBox checks, and [plan 18](../../../.agents/plans/proxy-fleet/18-validate-vagrant-libvirt-lab.md)
owns native Linux/libvirt checks. The shared libvirt configuration is present, but its live validation remains pending.

## Prerequisites

Use Vagrant 2.4.9 or later on an AMD64 host. The `Vagrantfile` pins `bento/ubuntu-24.04` version `202508.03.0`, so the
first creation downloads that provider-specific box unless it is already installed.

For Windows 11 version `22H2` or later with WSL2 and VirtualBox, enable Virtual Machine Platform for WSL2 and
Windows Hypervisor Platform for VirtualBox. Oracle documents the latter requirement for
[Hyper-V coexistence](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/AdvancedTopics.html).
Run this command in Administrator PowerShell:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform,HypervisorPlatform -All -NoRestart
```

Restart Windows after enabling the features, then verify that both report `Enabled`:

```powershell
Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform
Get-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform
```

In `%UserProfile%\.wslconfig`, add or update the following setting in the existing `[wsl2]` section, preserving other
settings. Create the file and section if they do not exist:

```ini
[wsl2]
networkingMode=mirrored
```

[Mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) lets WSL reach
VirtualBox's forwarded SSH ports on Windows at `127.0.0.1`. Save work in running WSL distributions, then run
`wsl --shutdown` from PowerShell and reopen WSL to
[apply the configuration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#the-8-second-rule-for-configuration-changes).

Then configure Vagrant in WSL:

1. Install Vagrant inside the WSL distribution. Do not invoke Windows `vagrant.exe` from WSL.
2. If Vagrant is also installed on Windows, keep its version identical to the WSL version.
3. Install VirtualBox on Windows and make its executable directory visible on the WSL `PATH`.
4. Enable Vagrant's Windows-provider access in the shell that runs the lab.

```sh
wslinfo --networking-mode # Must report mirrored.
export VAGRANT_WSL_ENABLE_WINDOWS_ACCESS=1
export PATH="$PATH:/mnt/c/Program Files/Oracle/VirtualBox"
```

These requirements follow Vagrant's [WSL guidance](https://developer.hashicorp.com/vagrant/docs/other/wsl). The default
shared folder is disabled because the repository may live on WSL's Linux filesystem; Vagrant uploads the guest
provisioner through SSH instead.

For native AMD64 Linux with libvirt:

1. Install Vagrant 2.4.9 or later, `QEMU`, libvirt, and the host packages required by `vagrant-libvirt`.
2. Give the current user access to the system libvirt daemon and `/dev/kvm`.
3. Install the provider plugin before running the lab.

```sh
vagrant plugin install vagrant-libvirt
```

The normal `up` command uses `--no-install-provider`, so a missing provider fails as a prerequisite instead of changing
the host automatically.

On a host without a usable provider, `vagrant validate --ignore-provider` checks the shared configuration. This skips
provider-specific validation; the ordinary `vagrant validate` command and complete lifecycle checks still require the
selected provider.

## Lifecycle

Run every lifecycle command from this directory. Select the provider only when creating a fresh environment; Vagrant
records it for later commands.

```sh
cd deploy/proxy-fleet/vagrant
vagrant validate
vagrant up --no-install-provider --provider=virtualbox
# On native Linux, use: vagrant up --no-install-provider --provider=libvirt

vagrant status
vagrant ssh proxy-manager-1 -c 'hostname'
vagrant provision
vagrant halt
vagrant up
```

Vagrant configures the provider management adapter and an isolated, non-forwarded `192.168.250.0/24` underlay. The
proxy guests own their declared RFC 2544 addresses on `lef-egress0`; the verifier owns three exact return routes. A
systemd `oneshot` restores only that guest state after reboot.

Repeated provisioning preserves already correct verifier routes. Stale route cleanup removes only RFC 2544 host
routes carrying the lab's reserved protocol `98`, preserving subnet routes that this provisioner cannot create.

Capture current provider-specific SSH facts after creation or recreation:

```sh
install -d -m 0700 .vagrant/proxy-fleet
(umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
```

Then consume the tracked inventory from the Ansible directory:

```sh
cd ../ansible
ansible-inventory -i inventory/vagrant-lab.yml --list
ansible-playbook -i inventory/vagrant-lab.yml playbooks/validate-inventory.yml
ANSIBLE_SSH_COMMON_ARGS="-F $(realpath ../vagrant/.vagrant/proxy-fleet/ssh-config)" \
  ansible all -i inventory/vagrant-lab.yml -m ping
```

The tracked inventory contains no WireGuard private keys or proxy credentials. Full proxy-fleet provisioning continues
to use the Vault workflow documented in `../ansible/README.md`; plan `proxy-fleet/16` owns that live validation.

Destroy the current environment with Vagrant itself:

```sh
cd ../vagrant
vagrant destroy -f
vagrant status --machine-readable
```

## Recovery and Scope

After an interrupted command, wait for its Vagrant process to exit, run `vagrant status`, and retry the same direct
command. Preserve `.vagrant/` if Vagrant reports a machine it cannot operate, and diagnose that environment before
changing raw VirtualBox or libvirt resources. If `.vagrant/` is lost while provider resources remain, this lab does not
claim automatic ownership recovery.

This is development tooling. It does not discover unrelated provider resources, allocate public IP addresses, prove
Internet egress, or provide transactional rollback, concurrent lifecycle safety, production deployment, or production
recovery.
