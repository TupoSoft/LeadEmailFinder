# Proxy Fleet Road Map

This road map scales SMTP verification by treating every 3proxy listener and egress IP as one independently limited proxy-registry member. Application allocation, capacity enforcement, local SMTP verification, and drain observability are already merged. New implementation starts with the fleet image and proceeds through disposable host provisioning to a Swarm reference deployment.

Implement the remaining plans in order. Each plan follows `.agents/PLANS.md` and represents exactly one pull request with its own acceptance criteria and validation.

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

Remaining pull-request sequence:

11. [Build a fleet-capable 3proxy image](11-fleet-capable-3proxy-image.md)
12. [Provision disposable proxy nodes with Ansible](12-ansible-proxy-node-provisioning.md)
13. [Deploy and reconcile a Swarm proxy fleet](13-swarm-fleet-reconciliation.md)

Application hardening follow-up, independently deliverable after plan 08:

14. [Enforce SMTP connection deadlines](14-enforce-smtp-connection-deadlines.md)

Dev-workflow fix discovered during a 2026-08-22 full E2E pass, independently deliverable:

15. [Reset the DNS cache when bringing up the SMTP development overlay](15-reset-dns-cache-for-smtp-dev-overlay.md)

Portable Vagrant lab for live validation:

17. [Provision a portable Vagrant proxy-fleet lab](17-provision-portable-vagrant-lab.md)

Live-validation follow-up, dependent on plan 17:

16. [Validate the disposable proxy fleet end to end](16-validate-disposable-multi-node-fleet.md)

Shared decisions:

- One authenticated HTTP CONNECT listener maps to exactly one egress IP and one proxy-registry capacity unit.
- The application continues to enforce the merged defaults: one concurrent lease, ten requests per minute per proxy, ten requests per minute per MX, and a 60-second lease TTL unless explicitly configured otherwise.
- New or unhealthy listeners remain `disabled`; a declared `desiredState: active` is health-gated; removed listeners become `draining`; automation never bypasses capacity or deletes an active registry member.
- Worker-to-proxy traffic uses private WireGuard addresses. Listener access is restricted to the configured worker CIDRs and configured SMTP destination ports.
- 3proxy tasks use host networking so `-i` can bind the node's WireGuard address and `-e` can bind the declared host egress IP. Swarm routing mesh is not used for proxy listeners.
- Each proxy node receives its own constrained Swarm service, configuration, and credential secret. This is behaviorally equivalent to one global task per labeled node while avoiding fleet-wide credentials and node-conditional configuration inside a global service.
- Images are built before deployment and referenced by immutable digest because `docker stack deploy` does not build images.
- Plan 17 owns only four disposable local Vagrant VMs, their isolated networks, generated lab inventory, and three
  nonpublic RFC 2544 egress identities. The same topology must pass on WSL2 with Windows VirtualBox and on native
  AMD64 Linux with libvirt/KVM; Hyper-V, PowerShell, ARM, and production hosting are outside its scope.
- Plan 16 accepts lab-routed egress as proof of listener source binding, routing, and reconciliation. Cloud VM
  creation, public-IP allocation, Internet routing, SMTP reputation, and provider-address lifecycle remain outside
  this repository and unverified by the disposable lab.
- These plans provide disposable/lab infrastructure only. They do not add database migrations, production rollout, high availability, backups, or production recovery.
- The current registry stores proxy authentication in PostgreSQL JSONB. That is accepted only for disposable development data in this road map; encryption or an external credential resolver is a prerequisite for any later production plan.
- The initial capacity target remains approximately 100 verifications per minute, but inventory limits remain the source of configured capacity.

Application-service migration to Swarm, catch-all proxy behavior, and SMTP-verification persistence refactoring are separate concerns and are not required to scale the proxy fleet.
