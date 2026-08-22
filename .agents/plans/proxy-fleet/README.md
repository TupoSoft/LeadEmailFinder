# Proxy fleet roadmap

This roadmap scales SMTP verification by treating every 3proxy listener and egress IP as one independently limited proxy-registry member. Application allocation, capacity enforcement, local SMTP verification, and drain observability are already merged. New implementation starts with the fleet image and proceeds through disposable host provisioning to a Swarm reference deployment.

Implement the remaining plans in order. Each plan follows `.agents/PLANS.md` and represents exactly one pull request with its own acceptance criteria and validation.

Completed pull requests:

1. [Secure proxy registry endpoints](01-secure-proxy-registry-endpoints.md) — completed by PR #301
2. [Secure API key administration](02-secure-api-key-administration.md) — completed by PR #302
3. [Cut SMTP over to the proxy registry](03-cut-smtp-over-to-proxy-registry.md) — completed by PR #303
4. [Add proxy lifecycle and capacity leases](04-add-proxy-capacity-leases.md) — completed by PR #304
5. [Default new proxies to disabled](05-default-new-proxies-to-disabled.md) — completed by PR #305
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

15. [Reset the DNS cache when bringing up the smtp-dev overlay](15-reset-dns-cache-for-smtp-dev-overlay.md)

Shared decisions:

- One authenticated HTTP CONNECT listener maps to exactly one egress IP and one proxy-registry capacity unit.
- The application continues to enforce the merged defaults: one concurrent lease, ten requests per minute per proxy, ten requests per minute per MX, and a 60-second lease TTL unless explicitly configured otherwise.
- New or unhealthy listeners remain `disabled`; a declared `desiredState: active` is health-gated; removed listeners become `draining`; automation never bypasses capacity or deletes an active registry member.
- Worker-to-proxy traffic uses private WireGuard addresses. Listener access is restricted to the configured worker CIDRs and configured SMTP destination ports.
- 3proxy tasks use host networking so `-i` can bind the node's WireGuard address and `-e` can bind the declared host egress IP. Swarm routing mesh is not used for proxy listeners.
- Each proxy node receives its own constrained Swarm service, config, and credential secret. This is behaviorally equivalent to one global task per labelled node while avoiding fleet-wide credentials and node-conditional config inside a global service.
- Images are built before deployment and referenced by immutable digest because `docker stack deploy` does not build images.
- Cloud VM creation and public-IP allocation remain provider-specific and outside this repository. Ansible verifies declared egress IPs rather than creating provider resources.
- These plans provide disposable/lab infrastructure only. They do not add database migrations, production rollout, high availability, backups, or production recovery.
- The current registry stores proxy authentication in PostgreSQL JSONB. That is accepted only for disposable development data in this roadmap; encryption or an external credential resolver is a prerequisite for any later production plan.
- The initial capacity target remains approximately 100 verifications per minute, but inventory limits remain the source of configured capacity.

Application-service migration to Swarm, catch-all proxy behavior, and SMTP-verification persistence refactoring are separate concerns and are not required to scale the proxy fleet.
