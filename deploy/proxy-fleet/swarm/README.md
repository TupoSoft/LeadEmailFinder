# Proxy-Fleet Swarm Deployment and Reconciliation

Deploys the plan-11 3proxy image as one Docker Swarm service per declared proxy node, then reconciles
healthy listeners into the application's proxy registry. See
`.agents/plans/proxy-fleet/13-swarm-fleet-reconciliation.md` for the full ExecPlan. This is the last
piece of the proxy-fleet roadmap: plan 11 built the image, plan 12 provisions the hosts, and this plan
deploys and registers them.

The actual renderer, deployment wrapper, and reconcile engine live under `scripts/proxy-fleet-swarm/`
(TypeScript, unit-tested, typechecked) rather than here, matching this repository's `scripts/keycloak/`
and `scripts/plans/` pattern. `deploy/**` is excluded from `tsconfig.json` and `eslint.config.mjs` (see
the Decision Log in `.agents/plans/proxy-fleet/11-fleet-capable-3proxy-image.md`), so testable logic
does not belong here. This directory holds only the generated, gitignored deploy artifacts and this
README.

## Inputs

- **Inventory**: the plan-12 Ansible inventory (`deploy/proxy-fleet/ansible/inventory/<file>.yml`).
  Rendering shells out to `ansible-inventory -i <file> --list` itself.
- **Image digest**: an immutable `registry/image@sha256:...` reference to the built plan-11 image.
  Building and pushing that image is outside this plan's scope. Plan 13 only ever *references* a digest
  supplied by the operator, consistent with plan 11 leaving registry publishing out of scope too.
- **Per-node credentials**: after a successful plan-12 apply, each `proxy_nodes` host stages its
  credentials at `/var/lib/lead-email-finder/proxy-fleet/credentials.json` (root-only, mode 0600).
  Collecting these onto the machine running the renderer/reconciler (`scp`, a configuration-management
  pull, or equivalent) is the operator's responsibility, the same way plan 12 leaves VM/IP provisioning
  to the operator. Place each node's file at `<credentials-dir>/<proxy_node_id>.json`.
- **M2M credentials**: a JSON file shaped `{"issuer", "clientId", "clientSecret"}` for a service client
  holding the `platform:admin` permission (see `src/libs/modules/service-client-management`). The
  original ExecPlan text called this an "admin key file"; the API authentication has since moved from
  static API keys to OIDC (`.agents/plans/auth/09-remove-api-key-authentication.md`), so the reconciler
  exchanges these credentials for a bearer token itself instead of reading a static key.
- **SMTP probe**: an endpoint the fleet listeners are allowed to reach (its port must be one of
  `proxy_fleet_allowed_destination_ports`) that reports the peer address of its most recent connection.
  `pnpm proxy-fleet:smtp-peer-probe` starts a disposable one; run it somewhere reachable from every
  proxy node over the declared WireGuard overlay.

## Workflow

```sh
# 1. Render the stack and every node's generated/<proxy_node_id>/{listeners,credentials}.json,
#    validating with `docker stack config` before anything is deployed.
PROXY_FLEET_ANSIBLE_INVENTORY=deploy/proxy-fleet/ansible/inventory/<file>.yml \
PROXY_FLEET_IMAGE_DIGEST=ghcr.io/<org>/lef-3proxy@sha256:<digest> \
PROXY_FLEET_CREDENTIALS_DIR=<path to collected per-node credential files> \
  pnpm proxy-fleet:render

# 2. Deploy: `docker stack deploy` (which creates any new content-hashed configuration/secret itself),
#    wait for every service to converge, then prune unreferenced ownership-labelled objects.
pnpm proxy-fleet:deploy

# 3. Reconcile the proxy registry: create missing listeners disabled, health-gate activation through a
#    real authenticated CONNECT plus observed-egress check, sync weight/capacity, and drain listeners
#    removed from inventory. Never deletes a registry record.
PROXY_FLEET_ANSIBLE_INVENTORY=deploy/proxy-fleet/ansible/inventory/<file>.yml \
PROXY_FLEET_CREDENTIALS_DIR=<path to collected per-node credential files> \
PROXY_FLEET_API_BASE_URL=https://<api host> \
PROXY_FLEET_M2M_CREDENTIALS_FILE=<path to {issuer,clientId,clientSecret} file> \
PROXY_FLEET_SMTP_PROBE_HOST=<probe WireGuard address> \
PROXY_FLEET_SMTP_PROBE_STATUS_URL=http://<probe host>:9000/last-peer \
  pnpm proxy-fleet:reconcile
```

Rerunning steps one through three against unchanged inventory is safe. Rendering is deterministic,
`docker stack deploy` no-ops when nothing changed, and the reconcile engine issues no registry mutation
when a listener's synchronized fields, life-cycle state, and health already match.

## What This Environment Could Verify Live

This plan was implemented with no disposable cloud host available, the same constraint
`.agents/plans/proxy-fleet/12-ansible-proxy-node-provisioning.md` hit. This development machine's own
Docker daemon is already an active Swarm manager for an unrelated real cluster that must never be
joined, deployed to, or mutated by this tooling. See that plan's Outcomes & Retrospective section, and
this plan's own, for exactly what was and was not exercised against a live multi-node fleet.

**Verified for real in this environment:**
- `docker stack config` accepts the rendered stack syntax (host networking via the predefined `host`
  network, per-node placement constraints, file-referenced configurations/secrets), confirmed against a
  real Docker daemon, read-only, with no Swarm mutation.
- The full reconcile engine, stack renderer, and inventory parser, unit-tested against fakes and mocks.
  Coverage includes every acceptance-criteria scenario: pagination, duplicates, create-disabled,
  health-gated activation and reactivation, active-to-draining on health failure, removed-listener
  draining, unchanged-state no-ops, and credential redaction.
- The disposable SMTP peer probe fixture: unit- and loop-back-tested end to end.

**Not verified live in this environment** (implemented per spec, no disposable multi-node Swarm
available):
- Actual `docker stack deploy`, convergence, and pruning against a live fleet.
- Multi-node placement via real `proxy.node-id` labels.
- A real authenticated CONNECT through a deployed listener asserting its declared egress IP.
- Repeat-deployment and reconciliation staying idempotent against live infrastructure.

A future PR, once a cloud provider is selected for the fleet's real rollout, should rerun this plan's
full Validation section against a real disposable multi-node Swarm before this is trusted for anything
beyond development.
