# Proxy Fleet Road Map

This road map scales SMTP verification by treating every 3proxy listener and egress IP as one independently limited proxy-registry member. Application allocation, capacity enforcement, local SMTP verification, and drain observability are already merged. New implementation starts with the fleet image and proceeds through disposable host provisioning to a Swarm reference deployment.

MVP scope decision (2026-10-22): verification workers will connect directly to mail servers. The proxy fleet is
outside the MVP scope. Plans 18 and 19 are deferred to the post-MVP backlog until an explicit decision to adopt a
proxy fleet. Plan 18 also requires a decision to use native Linux/libvirt.

Implement the remaining plans according to their declared dependencies and readiness. Plan 19 prepares the execution
decisions for plan 16; plan 18 remains independent of that preparation. Each plan follows `.agents/PLANS.md` and
represents exactly one pull request with its own acceptance criteria and validation.

Completed pull requests:

1. [Secure proxy registry endpoints](01-secure-proxy-registry-endpoints.md) — completed by PR #301
2. [Secure API key administration](02-secure-api-key-administration.md) — completed by PR #302
3. [Cut SMTP over to the proxy registry](03-cut-smtp-over-to-proxy-registry.md) — completed by PR #303
4. [Add proxy lifecycle and capacity leases](04-add-proxy-capacity-leases.md) — completed by PR #304
5. [Default newly created proxies to the disabled state](05-default-new-proxies-to-disabled.md) — completed by PR #305
6. [Allocate leased proxies serially](06-allocate-leased-proxies-serially.md) — completed by PR #307
7. [Decouple proxy allocation adapters](07-decouple-allocation-adapters.md) — completed by PR #308
8. [Add a configurable SMTP client factory](08-add-configurable-smtp-client-factory.md) — completed by PR #309
9. [Add an ISP-safe local SMTP fixture](09-add-isp-safe-local-smtp-fixture.md) — completed by PR #310
10. [Add allocation observability and prove draining](10-add-allocation-observability-and-draining.md) — completed by PR #311
11. [Build a fleet-capable 3proxy image](11-fleet-capable-3proxy-image.md) — completed by PR #373
12. [Provision disposable proxy nodes with Ansible](12-ansible-proxy-node-provisioning.md) — completed by PR #374
13. [Deploy and reconcile a Swarm proxy fleet](13-swarm-fleet-reconciliation.md) — completed by PR #419

Application hardening follow-up, independently deliverable after plan 08:

14. [Enforce SMTP connection deadlines](14-enforce-smtp-connection-deadlines.md)

Dev-workflow fix discovered during a 2026-08-22 full E2E pass, independently deliverable:

15. [Reset the DNS cache when bringing up the SMTP development overlay](15-reset-dns-cache-for-smtp-dev-overlay.md) — completed by PR #417

Vagrant-native development lab with Windows WSL2/VirtualBox validation:

17. [Provision a Vagrant-native proxy-fleet development lab](17-provision-vagrant-native-development-lab.md) — initial
    implementation merged in PR #518; VirtualBox validation completed in follow-up PR #549

Native Linux provider validation, deferred beyond the MVP:

18. [Validate the Vagrant lab on native Linux with libvirt](18-validate-vagrant-libvirt-lab.md) — deferred to the
    post-MVP backlog; depends on plan 17. Reopen issue #551 if we adopt a proxy fleet and need native Linux/libvirt.

Preparation for live validation, independently deliverable after plans 12, 13, and 17:

19. [Fleet validation decision preparation](19-prepare-fleet-validation-decisions.md) — deferred to the post-MVP
    backlog until a decision to adopt a proxy fleet. Documents proposed listener reachability and fixture execution
    models; completion does not require a live lab or approve either model.

Live-validation follow-up, dependent on plans 12, 13, 17, and 19:

16. [Validate the disposable proxy fleet end to end](16-validate-disposable-multi-node-fleet.md) — consumes the plan-19
    preparation and retains its execution-model decision requirement; its VirtualBox path does not wait for plan 18

Shared decisions:

- One authenticated HTTP CONNECT listener maps to exactly one egress IP and one proxy-registry capacity unit.
- The application continues to enforce the merged defaults: one concurrent lease, ten requests per minute per proxy, ten requests per minute per MX, and a 60-second lease TTL unless explicitly configured otherwise.
- New or unhealthy listeners remain `disabled`; a declared `desiredState: active` is health-gated; removed listeners become `draining`; automation never bypasses capacity or deletes an active registry member.
- Worker-to-proxy traffic uses private WireGuard addresses. Listener access is restricted to the configured worker CIDRs and configured SMTP destination ports.
- 3proxy tasks use host networking so `-i` can bind the node's WireGuard address and `-e` can bind the declared host egress IP. Swarm routing mesh is not used for proxy listeners.
- Each proxy node receives its own constrained Swarm service, configuration, and credential secret. This is behaviorally equivalent to one global task per labeled node while avoiding fleet-wide credentials and node-conditional configuration inside a global service.
- Images are built before deployment and referenced by immutable digest because `docker stack deploy` does not build images.
- Plan 17 supplies four disposable local development VMs, their isolated network, a tracked nonsecret Ansible inventory, and
  three nonpublic RFC 2544 egress identities. It is development tooling, not a production infrastructure controller.
- Developers operate the lab with Vagrant's native `up`, `status`, `ssh-config`, `halt`, and `destroy` commands from
  the lab directory and select `virtualbox` or `libvirt` explicitly. The repository does not wrap those commands in a
  custom ownership transaction, provider inspector, process supervisor, completion gate, or lifecycle API.
- Vagrant's local `.vagrant/` data identifies the disposable environment. The `Vagrantfile` targets only its four
  declared machines and lab network; it does not adopt, repair, or clean up unrelated provider resources or promise
  production-grade coordination with concurrent raw VirtualBox or libvirt commands.
- One `Vagrantfile` consumes the tracked lab inventory so guest roles, fixed addresses, and provisioning stay
  provider-neutral while thin provider blocks handle VirtualBox and libvirt differences. Vagrant-generated state and
  captured SSH facts remain ignored and replaceable; secret material follows the existing plan-12 Vault workflow.
- VirtualBox guests use one CPU to avoid the reproduced Windows Hyper-V boot stall; libvirt guests retain two CPUs.
  Both providers allocate 2,048 megabytes per guest. The tracked inventory declares these resources.
- The lab targets Windows 11 WSL2 with Windows VirtualBox and native AMD64 Linux with libvirt/KVM. Plan 17 owns
  VirtualBox validation; plan 18 owns the native Linux/libvirt matrix. Provider parity requires complete evidence
  from both plans. The Vagrant Hyper-V provider, VMware, macOS, ARM, cloud hosting, and production operations remain
  outside the lab contract.
- Plan 16 accepts lab-routed egress as proof of listener source binding, routing, and reconciliation. Cloud VM
  creation, public-IP allocation, Internet routing, SMTP reputation, and provider-address lifecycle remain outside
  this repository and unverified by the disposable lab.
- Plans 16 through 18 provide disposable development and validation infrastructure only. They do not add database
  migrations, production rollout, high availability, backups, or production recovery.
- The current registry stores proxy authentication in PostgreSQL JSONB. That is accepted only for disposable development data in this road map; encryption or an external credential resolver is a prerequisite for any later production plan.
- The initial capacity target remains approximately 100 verifications per minute, but inventory limits remain the source of configured capacity.

Application-service migration to Swarm, catch-all proxy behavior, and SMTP-verification persistence refactoring are separate concerns and are not required to scale the proxy fleet.
