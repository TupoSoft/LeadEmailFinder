# Deploy and reconcile a Swarm proxy fleet

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Deploy the declared 3proxy listeners through Docker Swarm and reconcile healthy listeners into the existing proxy registry without manual CRUD. A developer can deploy a disposable multi-node fleet, observe one constrained 3proxy task per declared proxy node, verify each listener's egress identity, and rerun reconciliation without duplicates or unsafe activation.

## Progress

- [ ] 2026-08-15 — Render and deploy node-constrained Swarm services from inventory.
- [ ] 2026-08-15 — Implement health-gated, idempotent proxy-registry reconciliation.
- [ ] 2026-08-15 — Prove activation, failure isolation, draining, and repeat deployment in a disposable Swarm.

## Surprises & Discoveries

- A single global Swarm service receives one service-level set of configs and secrets, so it cannot safely provide different credentials and topology to every node without sharing the fleet's secrets.
- The current proxy API has no external inventory ID or unique endpoint constraint. Reconciliation must therefore be a single writer, match the existing `(protocol, host, port)` endpoint, and fail closed on duplicates.
- The registry exposes no active-lease count. Automation can mark removed endpoints `draining`, but it cannot safely decide when to delete them.
- `Proxy.auth` is currently persisted as PostgreSQL JSONB. Swarm secret handling protects deployment inputs but does not provide database encryption at rest.

## Decision Log

- Decision: Render one replicated-one 3proxy service per declared proxy node, constrained by `node.labels.proxy.node-id`.
  Rationale: It preserves exactly one task per node while allowing distinct Swarm configs and secrets. A global service would require shared or node-conditional secrets.
  Date/Author: 2026-08-15, project planning.
- Decision: Attach 3proxy services to the predefined host network and publish no proxy ports through Swarm ingress.
  Rationale: 3proxy must see host WireGuard and egress addresses for `-i` and `-e`; routing mesh could send a leased endpoint to the wrong node. Docker supports host networking for Swarm services.
  Date/Author: 2026-08-15, project planning.
- Decision: Reconcile by endpoint as a single writer and fail on duplicates.
  Rationale: This uses the merged API without expanding the schema. Adding stable external identity and uniqueness can be a later independently reviewed application change if multiple reconcilers become necessary.
  Date/Author: 2026-08-15, project planning.
- Decision: Never delete registry entries automatically.
  Rationale: Existing observability proves that draining blocks new leases, but there is no lease-count API that can prove deletion safety.
  Date/Author: 2026-08-15, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plans 01 and 02 provide the image, validated inventory, node labels, host network, node-specific topology, and secret inputs. `ProxyController` exposes authenticated create, list, update, and delete operations under `/v1/proxies`. `ProxyDto` redacts credentials. `ProxyService.createProxy` defaults state to `disabled`; `TypeOrmProxyCandidateRepository` selects only `active` members; and `ProxyAllocatorService` enforces Redis leases. PR #311 added structured allocation/release events and the documented drain interval.

The desired endpoint key is `ProxyProtocol.HTTP` plus the node's WireGuard host and listener port. The inventory `egressId` is retained in the registry description using an owned prefix such as `proxy-fleet:<egressId>` so reconciliation modifies only records it owns. It is not treated as a database uniqueness guarantee.

## Scope and Non-Goals

Add `deploy/proxy-fleet/swarm/` with a deterministic stack renderer, deployment wrapper, generated-artifact ignore rules, per-node external config/secret preparation, and a one-shot reconciliation command. Add a disposable SMTP peer fixture or equivalent test target that reports the observed source address for egress assertions. Add focused unit and integration tests for rendering and reconciliation.

Do not add migrations, change proxy allocation, automatically delete registry records, create cloud resources, deploy a production environment, add high availability or recovery, add registry encryption/credential-resolution infrastructure, or migrate all application/stateful services to Swarm. The existing API may run outside the reference Swarm as long as the reconciler and verification workers can reach it over the declared private network. Because registry credentials remain in disposable PostgreSQL data, this reference deployment is not production-ready.

## Plan of Work

Render an ignored `stack.generated.yml` from validated inventory. Reference the plan-01 image by immutable registry digest; never use `build`. For each proxy node, declare one service with `replicas: 1`, a placement constraint on its unique `proxy.node-id`, the predefined host network, a node-specific immutable Swarm config, and a node-specific immutable credential secret. Name configs and secrets with a content digest so updates create new immutable objects. The deployment wrapper creates missing objects, deploys the stack, waits for convergence, and prunes only unreferenced objects carrying the proxy-fleet ownership label.

Do not publish listener ports through Swarm. The process binds directly to the host's WireGuard address and declared ports. This follows Docker's host-network service behavior and avoids routing mesh. See the official [host network driver](https://docs.docker.com/engine/network/drivers/host/) and [Swarm service networking](https://docs.docker.com/engine/swarm/services/) documentation.

Implement reconciliation behind a small `ProxyRegistryAdmin` HTTP interface so desired-state comparison is separate from HTTP details and testable without a live API. Read every registry page using the authenticated admin key from a file. Select only records with the owned description prefix. Reject duplicate desired endpoints and duplicate owned registry endpoints before any mutation.

For each desired endpoint, create it as `disabled` when missing. Update changed protocol, host, port, credentials, weight, `maxConcurrent`, `requestsPerMinute`, and description. A listener with `desiredState: disabled` remains disabled without a health-gated activation. A listener with `desiredState: active`, including one currently draining, can become active only after validation succeeds. Health validation must authenticate through the exact listener, CONNECT only to the configured SMTP probe target, and assert the target observed the listener's declared egress IP. A new or disabled endpoint that fails remains disabled; an active endpoint that fails becomes draining.

For owned registry endpoints no longer in inventory, patch `state` to `draining` and leave the record in place. Operators use the merged 60-second lease TTL and allocation/release logs to disable or delete later. Repeating deployment and reconciliation with unchanged desired state must create no service, config, secret, or proxy duplicates and must issue no unnecessary registry mutations.

Add a deployment dry-run that renders and validates the stack before mutation. `docker stack deploy` uses prebuilt images and its supported Compose-v3-compatible subset; record unsupported-option output as a failure. See the official [stack deployment guide](https://docs.docker.com/engine/swarm/stack-deploy/).

## Interfaces and Dependencies

Add package commands for stack rendering, deployment validation, and registry reconciliation. Inputs are the plan-02 inventory artifact, image digest, API URL, admin-key file, and SMTP probe endpoint. The admin key and proxy credentials are file inputs and never command-line values.

`ProxyRegistryAdmin` needs list-all-pages, create-disabled, update, and transition-state operations implemented by an HTTP adapter against the existing API. No controller or public API change is required. The reconcile engine owns comparison and state transitions; the HTTP adapter owns authentication, pagination, serialization, and response errors.

This plan depends on plans 01 and 02. It completes the repository's current proxy-fleet roadmap and preserves the application's existing lease and observer boundaries.

## Acceptance Criteria

- Stack rendering produces exactly one 3proxy service for every declared proxy node, each constrained to that node with only its own config and credential secret.
- Every service references an immutable image digest, uses host networking, and defines no Swarm ingress/routing-mesh proxy publication.
- Deployment fails before registry mutation when stack validation fails, a task does not converge, inventory endpoints are duplicated, required configs/secrets are absent, or a listener health/egress check fails.
- A missing listener is created disabled; it is activated only when `desiredState` is active and authenticated CONNECT plus observed-egress validation succeed.
- A failed new listener remains disabled; a failed previously active listener becomes draining.
- Reconciliation synchronizes desired lifecycle state, weight, and capacity without returning or logging credentials.
- An unchanged second deployment/reconciliation creates no duplicate Swarm objects or proxy records and issues no unnecessary registry mutations.
- Removing an owned listener from inventory marks its registry record draining and never deletes it automatically.
- Manual proxy records without the owned description prefix are not modified.
- Two verification-worker processes cannot exceed the existing per-proxy or per-MX Redis limits when using the deployed listeners.
- No schema migration, production deployment, or application-allocation change is introduced.

## Validation

Run focused stack-renderer and reconcile-engine unit tests, including pagination, duplicates, unchanged state, credential redaction, health failure, reactivation, and removed-listener cases. Validate the generated stack with `docker stack config` and confirm it contains no `build` key or plaintext secret.

On the disposable Swarm from plan 02, deploy at least two proxy nodes with at least two listeners on one node. Verify placement with `docker service ps` and service inspection, config/secret isolation, host networking, and zero ingress proxy ports. Through every listener, authenticate and CONNECT to the SMTP peer fixture; assert its observed peer equals the declared egress IP. Run reconciliation twice and confirm proxy counts and service/config/secret counts remain stable. Remove one desired listener and confirm its registry state becomes draining while active allocations stop. Run concurrent allocator/verification smoke traffic and inspect Redis-backed limit behavior and structured logs. Finally run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:ci`, `corepack pnpm build`, and `git diff --check`.

## Idempotence and Recovery

Rendering is deterministic. Configs and secrets are content-addressed and immutable; reruns reuse existing objects. Deployment waits for convergence before reconciliation, so a failed service update leaves registry state unchanged. If reconciliation fails partway, rerun it: create/update operations compare current state, activation remains health-gated, and removal only drains.

To recover a disposable lab, redeploy the last known generated stack or remove only the named proxy-fleet stack after first draining its owned registry entries. Prune only unreferenced, ownership-labelled configs/secrets. Recreate the disposable application database and rerun its existing seed path only when intentionally resetting all development data; no migration rollback exists.

## Artifacts and Notes

Record the generated stack without secrets, service placement, immutable image digest, config/secret names, sanitized reconcile summary, endpoint state transitions, observed egress results, second-run no-op evidence, and capacity smoke output. Never record the admin key, proxy credentials, full rendered 3proxy config, Swarm join tokens, or WireGuard private keys.

## Plan readiness

Ready to implement after plans 01 and 02.
