# Deploy and reconcile a Swarm proxy fleet

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Deploy the declared 3proxy listeners through Docker Swarm and reconcile healthy listeners into the existing proxy registry without manual CRUD. A developer can deploy a disposable multi-node fleet, observe one constrained 3proxy task per declared proxy node, verify each listener's egress identity, and rerun reconciliation without duplicates or unsafe activation.

## Progress

- [x] 2026-08-28 — Render and deploy node-constrained Swarm services from inventory.
- [x] 2026-08-28 — Implement health-gated, idempotent proxy-registry reconciliation.
- [x] 2026-08-28 — Prove what this environment allows: unit tests against fakes/mocks, real `docker
      stack config` validation, and a real loopback SMTP peer probe. Activation, failure isolation,
      draining, and repeat deployment against a live disposable multi-node Swarm are **not verified in
      this environment**. See Outcomes & Retrospective, which follows the same environment constraint
      `proxy-fleet/12` already hit and documented.

## Plan dependencies

- `proxy-fleet/11`
- `proxy-fleet/12`

## Surprises & Discoveries

- A single global Swarm service receives one service-level set of configs and secrets, so it cannot safely provide different credentials and topology to every node without sharing the fleet's secrets.
- The current proxy API has no external inventory ID or unique endpoint constraint. Reconciliation must therefore be a single writer, match the existing `(protocol, host, port)` endpoint, and fail closed on duplicates.
- The registry exposes no active-lease count. Automation can mark removed endpoints `draining`, but it cannot safely decide when to delete them.
- `Proxy.auth` is currently persisted as PostgreSQL JSONB. Swarm secret handling protects deployment inputs but does not provide database encryption at rest.
- The original plan text called the reconciler's registry credential an "admin key file." Between this plan's authoring (2026-08-15) and implementation (2026-08-28), `.agents/plans/auth/09-remove-api-key-authentication.md` merged and removed static API keys entirely: the API now authenticates only via OIDC. The reconcile CLI instead reads a file shaped `{issuer, clientId, clientSecret}` (matching the `ServiceClientCredentials` shape in `scripts/keycloak/provisioning.ts`) and exchanges it for a bearer token itself via the client-credentials grant.
- `ProxyDto` excludes `auth` entirely (`@Exclude() auth?: never`), so the reconciler can never read back a registry record's current credentials to detect drift. Credential sync therefore cannot independently trigger a mutation; see the credential-bundling decision below.
- `docker stack deploy` already versions `configs`/`secrets` declared with a `file:` source by content hash and creates a new immutable object whenever the file changes. This is a built-in Compose-stack behavior, not something the renderer needs to hand-roll. The renderer only needs to emit `file:`-referenced configs/secrets with the ownership label; `docker config prune`/`docker secret prune --filter label=...` remove the orphaned old versions.
- This development machine runs its own Docker daemon that is already an active Swarm manager (`docker info` reports a real, unrelated single-node cluster), the same constraint `proxy-fleet/12` hit. No disposable multi-node Swarm or cloud host was available in this environment. Live deployment, convergence, pruning, and a real cross-host authenticated CONNECT could not be exercised here without mutating real infrastructure that must never be touched by this tooling. Negotiated with the user before implementation began, the same way plan 12 was.
- `docker stack config` (Compose-v3 merge and validation) needs no live Swarm mutation and runs safely even against this machine's real Swarm daemon. Confirmed empirically by rendering a real sample stack (host networking via the predefined `host` network, `file:`-referenced configs/secrets, per-node placement constraints) and validating it, with no `docker stack deploy`/`config create`/`secret create` ever invoked.
- This workstation's root-owned `dist/` (the same friction plans 11 and 12 recorded) blocks both `tsc --noEmit -p tsconfig.json` and `nest build` from writing their output/build-info files. Worked around locally with a scratch `tsconfig.json` extension pointing `outDir`/`tsBuildInfoFile` at `/tmp`, never committed.

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
- Decision: The testable renderer/reconcile-engine/adapters live under `scripts/proxy-fleet-swarm/` (TypeScript, unit-tested), not `deploy/proxy-fleet/swarm/`. The `include` list in `tsconfig.json` and the ignore list in `eslint.config.mjs` both exclude `deploy/**`, so TypeScript placed there would sit outside `pnpm typecheck`/`pnpm lint` silently. This is the same reasoning plan 11 recorded for keeping its shell renderer under `docker/proxy-fleet/` rather than `scripts/`. `deploy/proxy-fleet/swarm/` holds only the generated (gitignored) stack artifacts and this plan's README, matching how `deploy/proxy-fleet/ansible/` splits versioned non-secret topology from its own `README.md`.
  Date/Author: 2026-08-28, implementation.
- Decision: Host networking is expressed as a top-level `networks: hostnet: {external: true, name: host}` referenced by each service, not `network_mode: host` (a plain Compose/`docker-compose` concept that Swarm stack files do not support).
  Rationale: confirmed against a real Docker daemon: `docker network ls` already lists a node-local `host` network (driver `host`, scope `local`), and `docker stack config` accepts the `external: true`/`name: host` reference without error.
  Date/Author: 2026-08-28, implementation.
- Decision: The deployment wrapper relies on the content-hashed config/secret versioning `docker stack deploy` already performs (via `file:`-referenced `configs:`/`secrets:` entries) instead of computing and naming content-digest objects itself, and calls `docker config prune`/`docker secret prune --filter label=proxy-fleet.owner=true` to remove orphaned versions after a successful deploy.
  Rationale: this is Docker's own built-in behavior for stack-managed configs/secrets (see Surprises & Discoveries); reimplementing it would duplicate logic Docker already guarantees is correct and immutable.
  Date/Author: 2026-08-28, implementation.
- Decision: Per-node credential files are supplied as a flat `<credentials-dir>/<proxy_node_id>.json` directory, matching the exact shape plan 12 renders. This is the plan-12 staging output, collected onto the machine running the renderer/reconciler using whatever transport the operator prefers: `scp`, a configuration-management pull, or equivalent.
  Rationale: plan 12 explicitly scopes VM/IP provisioning to the operator as outside the repository. Collecting node-local files onto a control host is the same category of provider-specific transport concern. This plan's Scope section limits it to "per-node external config/secret *preparation*," not a new remote-collection mechanism.
  Date/Author: 2026-08-28, implementation.
- Decision: Credential drift alone never triggers a registry mutation. When any other observable field (protocol/host/port/weight/maxConcurrent/requestsPerMinute/description) differs and an update is issued for that reason, the desired credentials are bundled into the same `PATCH` call so they stay in lockstep with inventory.
  Rationale: `ProxyDto` excludes `auth`, so the reconciler has no way to observe whether a registry record's stored credentials already match the desired ones (see Surprises & Discoveries). Always sending credentials would defeat the "no unnecessary registry mutations" acceptance criterion on every run; bundling them only when another field already justified a write is the closest achievable approximation without an application-side change to expose a credential digest.
  Date/Author: 2026-08-28, implementation.
- Decision: For a `desiredState: active` listener, the health check reruns on every reconciliation regardless of the record's current state. The post-check state transition depends on the state *before* this run: success always moves to `active`; failure moves an `active` record to `draining` and leaves any other state at `disabled`.
  Rationale: this is the literal reading of the Plan of Work ("a new or disabled endpoint that fails remains disabled; an active endpoint that fails becomes draining"), generalized to repeat runs. It is the only rule that lets a `draining` listener recover to `active` once its health check passes again, without a separate manual step.
  Date/Author: 2026-08-28, implementation.
- Decision: The disposable SMTP peer probe (`scripts/proxy-fleet-swarm/smtp-peer-probe.ts`) records only the most recently accepted TCP connection's peer address, exposed over a small HTTP status endpoint. The health check function documents that callers must run checks sequentially, one listener at a time.
  Rationale: matches the reconcile engine's own single-writer design (see the existing "single writer" decision below); a probe that tracked concurrent connections per source listener would need correlation state this plan's scope does not otherwise require.
  Date/Author: 2026-08-28, implementation.

## Outcomes & Retrospective

Implemented and validated to the extent this environment allows (no cloud provider or disposable multi-node Swarm — this development machine's own Docker daemon is already an active Swarm manager for an unrelated real cluster; see Surprises & Discoveries).

**Verified for real:**
- `pnpm typecheck`: 0 issues, via a local, uncommitted scratch-tsconfig workaround for this workstation's root-owned `dist/` (same friction plans 11/12 recorded).
- `pnpm lint`: 0 errors; the same 2 preexisting unrelated `explicit-function-return-type` warnings as the established baseline.
- `pnpm test:ci`: 834/862 tests passing, 27 skipped live-gated plus 1 previously pending case, 129/138 suites, all new suites included and passing.
- `pnpm build`: 445 files compiled via the `nest build`/swc pipeline, 0 typecheck issues, same scratch-tsconfig workaround.
- `git diff --check`: clean.
- 82 new focused unit tests across 8 suites in `scripts/proxy-fleet-swarm/`:
  - Inventory parsing and every cross-host duplicate/validation rule.
  - Stack rendering: one service per node, correct placement constraints, host networking, no ingress ports, no `build` key, per-node config/secret isolation, deterministic output, digest-pinning enforcement, credential/listener 1:1 enforcement.
  - The `ProxyRegistryAdmin` HTTP adapter: pagination, owned-prefix filtering, request shapes, error surfacing.
  - The M2M token provider: caching, expiry, failure.
  - The reconcile engine's acceptance-criteria scenarios: create-disabled, health-gated activation, reactivation of a draining listener, and active-to-draining on health failure.
  - The reconcile engine's remaining scenarios: disabled-forces-disabled without a health check, unchanged-state no-ops, field-change plus bundled-credential updates, and removed-listener draining with its own no-op.
  - The reconcile engine's safety scenarios: manually created records left untouched, duplicate desired/owned endpoints rejected before any mutation, and strictly sequential per-listener health checks.
  - The Docker Swarm CLI adapter: stack validation, deploy, convergence polling and its timeout, pruning.
  - The disposable SMTP peer probe: peer-address normalization, tracking, and a real loopback end-to-end TCP-connect-then-HTTP-status-fetch test.
- A real rendered two-field sample stack validated against `docker stack config` on a live Docker daemon, read-only, with no Swarm mutation. It was accepted cleanly, confirming the host-network, placement-constraint, and `file:`-config-secret syntax is genuinely valid Swarm stack syntax, not just internally self-consistent.

**Not verified live in this environment** (implemented per spec, no disposable multi-node Swarm or cloud host available — same negotiated constraint as `proxy-fleet/12`):
- Actual `docker stack deploy`, service convergence, and config/secret pruning against a live fleet.
- Multi-node placement via real `proxy.node-id`/`proxy.egress` Swarm labels.
- A real authenticated CONNECT through a deployed listener asserting its declared egress IP against a real SMTP peer probe reachable over a real WireGuard overlay.
- Repeat deployment/reconciliation against live infrastructure remaining a true no-op.
- Two concurrent verification-worker processes respecting the existing per-proxy/per-MX Redis limits through deployed listeners.

A future PR should rerun this plan's full Validation section against a real disposable multi-node Swarm, once a cloud provider is selected for the fleet's real rollout (the same prerequisite `proxy-fleet/12` named). Do this before trusting the plan for anything beyond development. See `deploy/proxy-fleet/swarm/README.md` for the operator-facing workflow and this same environment-limits summary.

## Context and Orientation

Plans 11 and 12 provide the image, validated inventory, node labels, host network, node-specific topology, and secret inputs. `ProxyController` exposes authenticated create, list, update, and delete operations under `/v1/proxies`. `ProxyDto` redacts credentials. `ProxyService.createProxy` defaults state to `disabled`; `TypeOrmProxyCandidateRepository` selects only `active` members; and `ProxyAllocatorService` enforces Redis leases. PR #311 added structured allocation/release events and the documented drain interval.

The desired endpoint key is `ProxyProtocol.HTTP` plus the node's WireGuard host and listener port. The inventory `egressId` is retained in the registry description using an owned prefix such as `proxy-fleet:<egressId>` so reconciliation modifies only records it owns. It is not treated as a database uniqueness guarantee.

## Scope and Non-Goals

Add `deploy/proxy-fleet/swarm/` with a deterministic stack renderer, deployment wrapper, generated-artifact ignore rules, per-node external config/secret preparation, and a one-shot reconciliation command. Add a disposable SMTP peer fixture or equivalent test target that reports the observed source address for egress assertions. Add focused unit and integration tests for rendering and reconciliation.

Do not add migrations, change proxy allocation, automatically delete registry records, create cloud resources, deploy a production environment, add high availability or recovery, add registry encryption/credential-resolution infrastructure, or migrate all application/stateful services to Swarm. The existing API may run outside the reference Swarm as long as the reconciler and verification workers can reach it over the declared private network. Because registry credentials remain in disposable PostgreSQL data, this reference deployment is not production-ready.

## Plan of Work

Render an ignored `stack.generated.yml` from validated inventory. Reference the plan-11 image by immutable registry digest; never use `build`. For each proxy node, declare one service with `replicas: 1`, a placement constraint on its unique `proxy.node-id`, the predefined host network, a node-specific immutable Swarm config, and a node-specific immutable credential secret. Name configs and secrets with a content digest so updates create new immutable objects. The deployment wrapper creates missing objects, deploys the stack, waits for convergence, and prunes only unreferenced objects carrying the proxy-fleet ownership label.

Do not publish listener ports through Swarm. The process binds directly to the host's WireGuard address and declared ports. This follows Docker's host-network service behavior and avoids routing mesh. See the official [host network driver](https://docs.docker.com/engine/network/drivers/host/) and [Swarm service networking](https://docs.docker.com/engine/swarm/services/) documentation.

Implement reconciliation behind a small `ProxyRegistryAdmin` HTTP interface so desired-state comparison is separate from HTTP details and testable without a live API. Read every registry page using the authenticated admin key from a file. Select only records with the owned description prefix. Reject duplicate desired endpoints and duplicate owned registry endpoints before any mutation.

For each desired endpoint, create it as `disabled` when missing. Update changed protocol, host, port, credentials, weight, `maxConcurrent`, `requestsPerMinute`, and description. A listener with `desiredState: disabled` remains disabled without a health-gated activation. A listener with `desiredState: active`, including one currently draining, can become active only after validation succeeds. Health validation must authenticate through the exact listener, CONNECT only to the configured SMTP probe target, and assert the target observed the listener's declared egress IP. A new or disabled endpoint that fails remains disabled; an active endpoint that fails becomes draining.

For owned registry endpoints no longer in inventory, patch `state` to `draining` and leave the record in place. Operators use the merged 60-second lease TTL and allocation/release logs to disable or delete later. Repeating deployment and reconciliation with unchanged desired state must create no service, config, secret, or proxy duplicates and must issue no unnecessary registry mutations.

Add a deployment dry-run that renders and validates the stack before mutation. `docker stack deploy` uses prebuilt images and its supported Compose-v3-compatible subset; record unsupported-option output as a failure. See the official [stack deployment guide](https://docs.docker.com/engine/swarm/stack-deploy/).

## Interfaces and Dependencies

Add package commands for stack rendering, deployment validation, and registry reconciliation. Inputs are the plan-12 inventory artifact, image digest, API URL, admin-key file, and SMTP probe endpoint. The admin key and proxy credentials are file inputs and never command-line values.

`ProxyRegistryAdmin` needs list-all-pages, create-disabled, update, and transition-state operations implemented by an HTTP adapter against the existing API. No controller or public API change is required. The reconcile engine owns comparison and state transitions; the HTTP adapter owns authentication, pagination, serialization, and response errors.

This plan depends on plans 11 and 12. It completes the repository's current proxy-fleet roadmap and preserves the application's existing lease and observer boundaries.

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

On the disposable Swarm from plan 12, deploy at least two proxy nodes with at least two listeners on one node. Verify placement with `docker service ps` and service inspection, config/secret isolation, host networking, and zero ingress proxy ports. Through every listener, authenticate and CONNECT to the SMTP peer fixture; assert its observed peer equals the declared egress IP. Run reconciliation twice and confirm proxy counts and service/config/secret counts remain stable. Remove one desired listener and confirm its registry state becomes draining while active allocations stop. Run concurrent allocator/verification smoke traffic and inspect Redis-backed limit behavior and structured logs. Finally run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:ci`, `corepack pnpm build`, and `git diff --check`.

## Idempotence and Recovery

Rendering is deterministic. Configs and secrets are content-addressed and immutable; reruns reuse existing objects. Deployment waits for convergence before reconciliation, so a failed service update leaves registry state unchanged. If reconciliation fails partway, rerun it: create/update operations compare current state, activation remains health-gated, and removal only drains.

To recover a disposable lab, redeploy the last known generated stack or remove only the named proxy-fleet stack after first draining its owned registry entries. Prune only unreferenced, ownership-labelled configs/secrets. Recreate the disposable application database and rerun its existing seed path only when intentionally resetting all development data; no migration rollback exists.

## Artifacts and Notes

Record the generated stack without secrets, service placement, immutable image digest, config/secret names, sanitized reconcile summary, endpoint state transitions, observed egress results, second-run no-op evidence, and capacity smoke output. Never record the admin key, proxy credentials, full rendered 3proxy config, Swarm join tokens, or WireGuard private keys.

## Plan readiness

Implemented and merged as PR #419. See Progress and Outcomes & Retrospective for exactly what is and is not live-verified in this environment; `proxy-fleet/16` tracks the remaining live-validation follow-up.
