# Fleet Validation Decisions

Prepared for [plan 16](../../.agents/plans/proxy-fleet/16-validate-disposable-multi-node-fleet.md)
by [plan 19](../../.agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md).
Repository evidence was inspected at `e3ae79e4e8eb5442930b29da1158b38efbb228e2` on 2026-09-15 and checked again at
`d13134d243e38b192991c204210527c26743b9ed` for the Swarm fixture decision on 2026-09-18.

## Decision and Evidence Status

The project owner selected a temporary subnet tunnel through `verifier-1` on 2026-09-15. The proposed implementation
uses `sshuttle` to carry only the three listener destinations over the existing Vagrant SSH connection. The
application and reconciler continue to dial the registered WireGuard addresses. The exact commands below are
proposals for plan 16; they have not run against the lab.

On 2026-09-18, the owner selected Swarm services on the Vagrant VMs for the proxies and fixtures. Extend the existing
three-node Swarm design by making `verifier-1` a non-proxy worker, then run Mailpit and the existing peer probe there
as separate services in a fixture stack. Run them in separate phases on port `2525`. This replaces the earlier
standalone-binary and transient-systemd proposal. Capacity assertions still require additional instrumentation.
The application and reconciler remain outside the VMs and use the selected tunnel. These choices do not start plan
16 or prove the commands. Provisioning changes, finalized execution procedures, and live evidence remain in plan 16.

This is a documentation handoff. It installs no tool, creates no VM, changes no network or application state, and
provides no public Internet egress or deliverability evidence. The existing VirtualBox lab remains the provider
baseline. Native Linux/libvirt validation remains separate in plan 18.

### Selected VM and Service Topology

Vagrant creates the Ubuntu VMs. Ansible configures Docker, WireGuard, firewall policy, Swarm membership, and labels.
Swarm deploys the proxy and fixture containers. The selected topology is:

| VM | Swarm role | Workload |
| --- | --- | --- |
| `proxy-manager-1` | Manager | Manages the disposable cluster. |
| `proxy-node-a` | Proxy worker | One proxy service with two listeners and two egress identities. |
| `proxy-node-b` | Proxy worker | One proxy service with one listener and one egress identity. |
| `verifier-1` | Non-proxy fixture worker | Mailpit or the peer probe, one active fixture at a time. |

The fourth Swarm membership and fixture stack are future plan-16 changes. The current inventory and playbook still
provision the verifier without Docker. Keep it outside `proxy_nodes`, which triggers proxy manifests, credentials,
and egress labels. The fixture stack has its own name and resources; it does not extend the proxy renderer or move
the rest of the application stack into Swarm.

## Source Map and Network Path

All paths in this document are relative to the repository root unless a guest path is explicitly identified.

| Hop or contract | Repository evidence | Observation |
| --- | --- | --- |
| Lab topology | `deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml` | One manager, two proxy nodes, and `verifier-1`; the verifier owns `172.29.10.4/28`. |
| Docker and Swarm provisioning | `deploy/proxy-fleet/ansible/playbooks/proxy-fleet.yml`; `roles/swarm/tasks/label.yml` | Currently includes managers and proxy nodes only. Plan 16 must add the verifier as an explicit non-proxy member with a fixture label. |
| Management access | `deploy/proxy-fleet/vagrant/README.md`, `Vagrantfile` | Capture `vagrant ssh-config`; the default shared folder is disabled. WSL uses mirrored networking to reach VirtualBox's forwarded SSH ports. |
| Guest source identities and return routes | `deploy/proxy-fleet/vagrant/provision/guest-network.sh` | Proxy identities reside on `lef-egress0`; the verifier has explicit return routes through the isolated underlay. |
| Listener configuration | `deploy/proxy-fleet/ansible/roles/proxy_topology/tasks/main.yml`, `templates/listeners.json.j2` | The inventory supplies listener endpoints, egress addresses, allowed worker sources, and destination ports. |
| Running proxy | `scripts/proxy-fleet-swarm/stack-renderer.ts`, `renderNodeArtifact`; `docker/proxy-fleet/render-config.sh` | Uses host networking and node placement; renders authenticated HTTP listeners with `-i<bindIp>`, `-e<egressIp>`, and `-p<port>`. |
| Listener health | `scripts/proxy-fleet-swarm/listener-health-check.ts`, `verifyListenerEgress` | Authenticates to the inventory's `bindIp` and checks `/last-peer` for the declared egress address. |
| Registry publication | `scripts/proxy-fleet-swarm/reconcile.ts`, `desiredListenersFrom` and `toDesiredRecord` | Publishes the same listener host and port; ownership, health, and draining remain reconciler responsibilities. |
| Application allocation | `src/libs/modules/proxy/src/infrastructure/persistence/typeorm-proxy-candidate.repository.ts`, `mapCandidate`; `src/libs/modules/proxy/src/application/proxy-allocator.service.ts` | Reads registered candidates and returns a proxy with its capacity lease. |
| SMTP connection | `src/libs/modules/email-verification/src/infrastructure/mailbox/smtp/smtp-mailbox-probe.ts`, `tryConnect`; `smtp-client.factory.ts`; `smtp-client.ts` | The real mailbox probe supplies the allocated proxy to the SMTP client. |
| Socket transport | `src/libs/socket/src/connect.ts`, `connect`; `http-proxy-connect.ts`, `connectThroughHttpProxy` | Opens TCP to the proxy host and port, then authenticates an HTTP CONNECT to the SMTP destination. |
| Peer fixture | `scripts/proxy-fleet-swarm/smtp-peer-probe.ts`, `startSmtpPeerProbe`; `smtp-peer-probe-cli.ts` | Reports only the last TCP peer. The CLI needs Node and defaults both listening hosts to `0.0.0.0`. |
| Mailpit version precedent | `docker/compose.smtp-dev.yaml`, `plaintext-mailpit` | Pins Mailpit `v1.30.7` for a plaintext rejection scenario. The lab proposal pins that image by digest and enables STARTTLS. |
| Detailed SMTP evidence fixture | `docker/smtp-dev/evidence-server.mjs`, `createEvidenceFixture`; `bruno/smtp-dev/README.md` | Existing precise SMTP classification tests retain this fixture. Mailpit supplies the fleet's ordinary SMTP phase. |

| Proxy node | Registered listener | Expected SMTP source |
| --- | --- | --- |
| `proxy-node-a` | `172.29.10.2:13001` | `198.18.0.21` |
| `proxy-node-a` | `172.29.10.2:13002` | `198.18.0.22` |
| `proxy-node-b` | `172.29.10.3:13001` | `198.18.0.23` |

The intended path is application or reconciler in WSL, then SSH to `verifier-1`, then WireGuard to the selected
listener, then an authenticated CONNECT to the SMTP fixture on `172.29.10.4:2525`. The proxy sees the verifier's
source `172.29.10.4`; the SMTP fixture sees the selected proxy's distinct `198.18.0.*` source. These are two different
observations. A successful tunnel connection alone proves neither the declared egress identity nor email verification.

### Corrections Required Before Live Use

These are current repository gaps for plan 16 to correct and test. Do not run the proposal against an uncorrected
baseline and interpret a failed check as a reason to loosen the contracts.

- `inventory/group_vars/all.yml` currently allows `172.29.10.0/28`, and the lab inventory does not override it.
  Worker-only access from `.4/32` is an intended invariant, not an enforced fact. Plan 16 must align both the host
  firewall and rendered proxy configuration, then prove denial from another source.
- The WireGuard template uses `ansible_host` for peer endpoints, contains only each peer's overlay address in
  `AllowedIPs`, and does not set `Table = off`. Plan 16 must use the optional underlay endpoint, authorize each peer's
  own egress identities, and preserve the verifier's explicit return routes.
- The firewall template restores a whole filter table and has no verifier SMTP rule. Reset restores an open table.
  Plan 16 must preserve unrelated rules, admit SMTP only from the three declared egress sources, and keep status
  ports private. See `roles/firewall/` and `roles/proxy_fleet_reset/` under the Ansible directory.
- The verifier's current play installs only WireGuard and firewall policy. Add explicit non-proxy Swarm membership,
  such as a `fixture_workers` group, and include it in Docker installation and worker joining. Generalize the member
  set used by `roles/firewall/tasks/main.yml` and `templates/iptables.rules.j2` to include exactly those declared
  members. Keep proxy topology validation and `proxy.egress` labels limited to `proxy_nodes`; assign only
  `lef.fixture=verifier-1` to the fixture host. Update the relevant inventory and role tests.
- Swarm joins lack explicit WireGuard advertise and data addresses. Reset currently inspects Docker even on a
  verifier without Docker and does not enforce worker departures before the manager. Plan 16 must gate Docker reset
  by actual declared membership, including the new fixture worker, and remove fixture services, configurations,
  secrets, and the fixture label before workers leave. Leave WireGuard available until remote cleanup finishes.
  See `roles/swarm/tasks/join_or_init.yml` and `roles/proxy_fleet_reset/tasks/main.yml`.

## Reachability Alternatives

| Model | Endpoints and source | Dependencies and recovery | Disposition |
| --- | --- | --- | --- |
| Scoped tunnel through `verifier-1` | Original listener endpoints remain unchanged; the verifier opens the remote sockets. | Local Python, `sshuttle`, SSH, and privileged firewall redirection; guest Python; remove only the tunnel's temporary state. | Selected by the owner. Proposed lifecycle follows below. |
| Guest-side application and validation tools | Can retain the same endpoints and originate directly from the worker. | Requires staging the actual application and tools, plus reachable API, OIDC, database, Redis, and DNS dependencies in a guest with one CPU and two gigabytes of memory. Guest artifacts and processes need removal. | Fallback only if the tunnel is infeasible. No executable guest application bundle is proposed or claimed ready here; plan 16 would need a replacement procedure. |
| Localhost forward with a connection override | A changed registry host or adapter dial target fails the unchanged endpoint requirement. | An ordinary SSH forward is easy to stop, but does not supply the required application-path evidence. | Unsuitable as the listener validation model. Forwarding through localhost remains suitable for private fixture status. |

The proposed tunnel runs alongside the real application processes directly in the same WSL network namespace.
It does not establish reachability for a Windows process, a Docker Desktop VM, or a container on another bridge.
For container-based verification, the plan-16 implementer must document and prove how the application traffic
enters this tunnel. Do not silently open the tunnel to every local network or change application proxy hosts.

## Proposed Tunnel Lifecycle

Every shell block in this section is a proposed procedure that has not run for plan 16. The controller shell is Bash in WSL.
Prepare the corrected, running lab with the existing [Vagrant](vagrant/README.md) and [Ansible](ansible/README.md)
procedures first. Installing tools or changing WSL configuration is an explicit prerequisite outside this document's
execution. Use Python 3.9 or later on both ends and record the selected `sshuttle` version; syntax was checked against
the 1.3.2 documentation. The `nat` method requires working Linux `iptables` redirection.

### Preparation

Start a dedicated Bash scenario shell at the repository root. Run one validation scenario at a time. Keep the same `LEF_*` values in each terminal;
the session directory and captured SSH configuration are private, ignored artifacts. Port `12300` is reserved for
this proposal's local tunnel, `19000` for peer status, and `18025` for the later Mailpit UI/API forward.
Stop if any of these ports is already occupied.

```bash
set -euo pipefail
umask 077
export LEF_REPO_ROOT="$PWD"
export LEF_VAGRANT_DIR="$LEF_REPO_ROOT/deploy/proxy-fleet/vagrant"
cd "$LEF_VAGRANT_DIR"
install -d -m 0700 .vagrant/proxy-fleet
export LEF_RUN_DIR="$(mktemp -d "$LEF_VAGRANT_DIR/.vagrant/proxy-fleet/validation.XXXXXX")"
export LEF_SSH_CONFIG="$LEF_RUN_DIR/ssh-config"
vagrant ssh-config > "$LEF_SSH_CONFIG"
cd "$LEF_REPO_ROOT"
sshuttle --version
python3 --version
ssh -F "$LEF_SSH_CONFIG" verifier-1 'python3 --version'
ssh -F "$LEF_SSH_CONFIG" verifier-1 'ip -4 route get 172.29.10.2'
ssh -F "$LEF_SSH_CONFIG" verifier-1 'ip -4 route get 172.29.10.3'
ss -ltn 'sport = :12300 or sport = :19000 or sport = :18025'
sudo iptables-save -t nat > "$LEF_RUN_DIR/nat.before"
ip -j route show > "$LEF_RUN_DIR/routes.before.json"
```

Both guest routes must select `wg0` and source `172.29.10.4`. The socket listing must have no matching listener.
The NAT snapshot must contain no chain or reference named `sshuttle-12300`. These checks must succeed before
starting. Snapshots may contain unrelated host information; keep them local and publish only sanitized conclusions.
Each additional scenario shell must also enable `set -euo pipefail` and `umask 077`. Record the run variables in
private run notes before starting processes so another terminal can resume cleanup. A failed prerequisite stops
the procedure; do not continue by pasting a later block.

### Start and Readiness

In terminal A, run from the repository root with the preparation variables:

```bash
sshuttle -v --method=nat --listen=127.0.0.1:12300 \
  --ssh-cmd "ssh -F '$LEF_SSH_CONFIG' -o ServerAliveInterval=15 -o ServerAliveCountMax=3" \
  --remote verifier-1 \
  172.29.10.2/32:13001-13002 \
  172.29.10.3/32:13001
```

The captured SSH endpoint uses the management connection, outside these intercepted destinations. The command
does not intercept DNS, the whole overlay, or the default route. The firewall helper requests local privileges;
the SSH connection uses the normal user's captured Vagrant identity. Keep the process in the foreground.

Record a successful SSH connection and firewall setup. Then start the proposed peer fixture and status forward
below. Readiness requires a successful authenticated `verifyListenerEgress` for every listener, with a fresh
matching source observation. A TCP-only check can reach the local transparent proxy before the remote target succeeds;
`ping` is not evidence for this TCP tunnel.

### Use Through the Existing Reconciler

In terminal C, start at the repository root with the same preparation variables. Supply these existing inputs:

| Input | Meaning and owner |
| --- | --- |
| `PROXY_FLEET_CREDENTIALS_DIR` | Private directory containing `<proxy_node_id>.json` fetched from the nodes; plan-16 implementer. |
| `PROXY_FLEET_API_BASE_URL` | Disposable API reachable from the controller; project owner supplies the environment. |
| `PROXY_FLEET_M2M_CREDENTIALS_FILE` | Private JSON file with `issuer`, `clientId`, and `clientSecret` for `platform:admin`; project owner supplies access. |
| `LEF_SSH_CONFIG`, `LEF_RUN_DIR` | Captured SSH configuration and this scenario's private local directory. |

The node files come from `/var/lib/lead-email-finder/proxy-fleet/credentials.json` through privileged Ansible fetch.
Their contents must not enter command arguments, committed files, or ordinary output. The later implementer must
use the inventory, Vault inputs, and node-to-filename mapping described in the existing Ansible and Swarm guides.

```bash
: "${PROXY_FLEET_CREDENTIALS_DIR:?Set the private node-credential directory}"
: "${PROXY_FLEET_API_BASE_URL:?Set the disposable API URL}"
: "${PROXY_FLEET_M2M_CREDENTIALS_FILE:?Set the private M2M credential file}"
export PROXY_FLEET_ANSIBLE_INVENTORY=deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml
export PROXY_FLEET_SMTP_PROBE_HOST=172.29.10.4
export PROXY_FLEET_SMTP_PROBE_PORT=2525
export PROXY_FLEET_SMTP_PROBE_STATUS_URL=http://127.0.0.1:19000/last-peer
corepack pnpm proxy-fleet:reconcile
corepack pnpm proxy-fleet:reconcile
```

This command mutates the disposable registry and belongs only to plan 16. The first successful run must expose
the three original listener endpoints and validate their declared sources; the unchanged second run must cause
no unnecessary registry mutation. A zero exit code alone is insufficient because an unhealthy listener can be
reported as disabled or draining. Inspect the returned actions and registry state using the existing adapter.
No other client may use the peer fixture while these sequential checks run.

### Stop and Interrupted Cleanup

Stop verification producers and finish any required registry draining while reachability still exists. Press
`Ctrl+C` in the tunnel terminal and wait for `sshuttle` to exit. Stop the separate status forward and fixture as described
below. From the repository root:

```bash
sudo iptables-save -t nat > "$LEF_RUN_DIR/nat.after"
ip -j route show > "$LEF_RUN_DIR/routes.after.json"
diff -u "$LEF_RUN_DIR/nat.before" "$LEF_RUN_DIR/nat.after"
diff -u "$LEF_RUN_DIR/routes.before.json" "$LEF_RUN_DIR/routes.after.json"
ss -ltn 'sport = :12300 or sport = :19000 or sport = :18025'
```

No new tunnel chain, jump, route, or listening socket may remain. Unrelated concurrent Docker activity can change
the NAT snapshot; inspect that difference without restoring the whole table. Retain only sanitized findings in Git.
For a caught interruption, use the same foreground `Ctrl+C` cleanup. After a lost terminal, inspect the exact
`sshuttle` process command and its session before sending `SIGINT`; never use a broad process-name kill.

If the firewall helper cannot clean up, inspect its remaining references privately before removing them:

```bash
sudo iptables-save -t nat > "$LEF_RUN_DIR/nat.interrupted"
```

The recovery below is specific to the proposed `sshuttle` 1.3.2 `nat` command, without user, group, or DNS options.
Before running it, confirm that the baseline had no `sshuttle-12300` chain, this scenario's tunnel and firewall helper
have stopped, no new session has reused the port, and the only references are plain jumps from `OUTPUT` and
`PREROUTING`. Stop on an unexpected reference or uncertain ownership. Remove only this scenario's rules:

```bash
for LEF_PARENT_CHAIN in OUTPUT PREROUTING; do
  while sudo iptables -w -t nat -C "$LEF_PARENT_CHAIN" -j sshuttle-12300 2>/dev/null; do
    sudo iptables -w -t nat -D "$LEF_PARENT_CHAIN" -j sshuttle-12300
  done
done
if sudo iptables -w -t nat -S sshuttle-12300 >/dev/null 2>&1; then
  sudo iptables -w -t nat -F sshuttle-12300
  sudo iptables -w -t nat -X sshuttle-12300
fi
```

Repeat the snapshot and socket checks afterward. Plan 16 must test this proposed recovery against its actual pinned
tool and firewall backend. This is not a whole-table restore or an unconditional recovery claim after a hard kill.
Keep the private session directory until fixture cleanup, evidence inspection, and all local-state checks finish.

## Proposed Swarm Fixture Lifecycle

Run a separate fixture stack in the same disposable Swarm as the proxies. Pin both fixture services to the
non-proxy worker `verifier-1` using the proposed node label `lef.fixture=verifier-1`. Keep the proxy renderer's
two-service contract unchanged. Each fixture uses the external `host` network; publish no ports through the routing
mesh. SMTP binds to `172.29.10.4:2525`, peer status to `127.0.0.1:9000`, and Mailpit UI/API to `127.0.0.1:8025`.

The commands and stack definition below are proposals for plan 16, not files or services already installed by this
PR. They require the provisioning corrections above, a running recognized lab Swarm, and reachable image registries.
No Node or Mailpit binary is installed on a guest. The peer probe runs in a pinned Node container, with its two
compiled JavaScript files supplied as Swarm configurations. Mailpit uses its pinned container image, a certificate
configuration, and a TLS-key secret. Use only the existing disposable test certificate and key.

### Preparation and Ownership

Run from the repository root in the dedicated Bash scenario shell. Keep `set -euo pipefail` and `umask 077` enabled.
Supply these inputs in addition to the captured SSH configuration and private run directory:

| Input | Meaning |
| --- | --- |
| `LEF_RUN_ID` | A fresh lowercase alphanumeric identifier, optionally containing hyphens, at most 24 characters. |
| `LEF_CLUSTER_ID` | The exact ClusterID recorded after this scenario created the disposable Swarm. Never adopt the current cluster merely by reading its ID. |
| `LEF_PEER_IMAGE` | A verified Node 24 Linux image reference pinned with `@sha256:<digest>`. |
| `LEF_MAILPIT_IMAGE` | The verified `axllent/mailpit:v1.30.7` Linux image pinned with `@sha256:<digest>`. |

Record the exact image references and private run variables before deployment. The manager and verifier must belong
to the recorded cluster; `verifier-1` must be Ready/Active, carry the fixture label, and have no proxy-egress label.
No other node may carry that fixture label. Plan 16 must assert those facts after provisioning. Stop if an unfinished
run already owns the proposed stack or directory; recover that run instead of overwriting it.

```bash
: "${LEF_SSH_CONFIG:?Captured Vagrant SSH configuration is required}"
: "${LEF_RUN_DIR:?Private scenario directory is required}"
: "${LEF_RUN_ID:?Unique scenario identifier is required}"
: "${LEF_CLUSTER_ID:?Recorded disposable Swarm ClusterID is required}"
: "${LEF_PEER_IMAGE:?Pinned Node 24 image is required}"
: "${LEF_MAILPIT_IMAGE:?Pinned Mailpit 1.30.7 image is required}"
[[ "$LEF_RUN_ID" =~ ^[a-z0-9][a-z0-9-]{0,23}$ ]]
[[ "$LEF_CLUSTER_ID" =~ ^[a-z0-9]+$ ]]
for LEF_IMAGE_REF in "$LEF_PEER_IMAGE" "$LEF_MAILPIT_IMAGE"; do
  [[ "$LEF_IMAGE_REF" =~ ^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$ ]]
done
LEF_FIXTURE_STACK="lef-fixtures-$LEF_RUN_ID"
LEF_FIXTURE_LOCAL=$(mktemp -d /tmp/lef-fixtures-stage.XXXXXXXX)
LEF_FIXTURE_REMOTE="/tmp/$LEF_FIXTURE_STACK"
corepack pnpm exec tsc --target ES2023 --module commonjs --moduleResolution node \
  --strict --skipLibCheck --types node --noEmitOnError \
  --rootDir scripts/proxy-fleet-swarm --outDir "$LEF_FIXTURE_LOCAL" \
  scripts/proxy-fleet-swarm/smtp-peer-probe.ts \
  scripts/proxy-fleet-swarm/smtp-peer-probe-cli.ts
install -m 0600 docker/smtp-dev/tls/smtp.crt docker/smtp-dev/tls/smtp.key "$LEF_FIXTURE_LOCAL/"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   for kind in service config secret; do
     LEF_FOUND=\$(sudo -n docker --host unix:///var/run/docker.sock \$kind ls -q \
       --filter label=com.docker.stack.namespace='$LEF_FIXTURE_STACK') || exit 1
     test -z \"\$LEF_FOUND\" || exit 1
   done"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 or sport = :8025 )'"
```

Require no fixture listener before continuing. Save the following proposed YAML as
`$LEF_FIXTURE_LOCAL/fixtures.yml`. Both services initially have zero replicas, so deployment alone cannot create a
port conflict. The image variables are passed explicitly to the remote Docker CLI in the deployment command.

```yaml
version: '3.8'
services:
  peer:
    image: ${LEF_PEER_IMAGE}
    user: '1000:1000'
    command: ['node', '/smtp-peer-probe-cli.js']
    networks: { hostnet: null }
    environment:
      SMTP_PEER_PROBE_HOST: '172.29.10.4'
      SMTP_PEER_PROBE_SMTP_PORT: '2525'
      SMTP_PEER_PROBE_STATUS_HOST: '127.0.0.1'
      SMTP_PEER_PROBE_STATUS_PORT: '9000'
    configs:
      - source: peer_module
        target: /smtp-peer-probe.js
      - source: peer_cli
        target: /smtp-peer-probe-cli.js
    stop_grace_period: 5s
    deploy:
      replicas: 0
      placement:
        constraints: ['node.labels.lef.fixture == verifier-1']
      restart_policy: { condition: none }
      update_config: { order: stop-first }
  mailpit:
    image: ${LEF_MAILPIT_IMAGE}
    user: '1000:1000'
    networks: { hostnet: null }
    environment:
      MP_SMTP_BIND_ADDR: '172.29.10.4:2525'
      MP_UI_BIND_ADDR: '127.0.0.1:8025'
      MP_SMTP_TLS_CERT: /smtp.crt
      MP_SMTP_TLS_KEY: /run/secrets/smtp_key
      MP_SMTP_REQUIRE_STARTTLS: 'true'
      MP_SMTP_DISABLE_RDNS: 'true'
      MP_DISABLE_VERSION_CHECK: 'true'
      MP_DATABASE: /tmp/mailpit.db
      MP_VERBOSE: 'true'
    healthcheck:
      test: ['CMD', '/mailpit', 'readyz', '--listen', '127.0.0.1:8025']
      interval: 5s
      timeout: 5s
      retries: 3
    configs:
      - source: smtp_cert
        target: /smtp.crt
    secrets:
      - source: smtp_key
        target: smtp_key
        uid: '1000'
        gid: '1000'
        mode: 0400
    volumes:
      - type: tmpfs
        target: /tmp
        tmpfs: { size: 67108864 }
    stop_grace_period: 5s
    deploy:
      replicas: 0
      placement:
        constraints: ['node.labels.lef.fixture == verifier-1']
      restart_policy: { condition: none }
      update_config: { order: stop-first }
networks:
  hostnet: { external: true, name: host }
configs:
  peer_module: { file: ./smtp-peer-probe.js }
  peer_cli: { file: ./smtp-peer-probe-cli.js }
  smtp_cert: { file: ./smtp.crt }
secrets:
  smtp_key: { file: ./smtp.key }
```

Swarm configurations are immutable. Use a new run identifier after changing the fixture artifacts. The fixtures
have no persistent volumes; Mailpit stores its disposable database in memory. SMTP transcript logs remain in the
guest Docker logging system until its retention or VM destruction removes them. Use synthetic addresses and commit
only sanitized observations. SMTP authentication, forwarding, relay, and Chaos remain disabled for the normal phase.

### Stage and Deploy the Idle Fixture Stack

Create the private manager directory exclusively, then record ownership before copying files. The local markers
also cover a partial deployment; keep them until cleanup is verified. A failed directory creation authorizes no
removal of an existing directory or stack. No configuration needs a guest bind mount or shared source checkout.

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 "mkdir -m 0700 '$LEF_FIXTURE_REMOTE'"
printf '%s\n' "$LEF_FIXTURE_REMOTE" > "$LEF_RUN_DIR/fixture-owned"
printf '%s\n' "$LEF_FIXTURE_STACK" > "$LEF_RUN_DIR/fixture-stack-owned"
tar -C "$LEF_FIXTURE_LOCAL" -cf - fixtures.yml smtp-peer-probe.js smtp-peer-probe-cli.js smtp.crt smtp.key |
  ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 "tar -C '$LEF_FIXTURE_REMOTE' -xf -"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   cd '$LEF_FIXTURE_REMOTE' &&
   sudo -n env LEF_PEER_IMAGE='$LEF_PEER_IMAGE' LEF_MAILPIT_IMAGE='$LEF_MAILPIT_IMAGE' \
     docker --host unix:///var/run/docker.sock stack deploy --detach=true \
     --compose-file fixtures.yml '$LEF_FIXTURE_STACK'"
```

Inspect the exact services with `docker stack services` through the manager SSH transport. Require `peer` and
`mailpit` at `0/0`, the expected immutable image references, the fixture placement constraint, and the external host
network. Do not deploy this zero-replica file again during an active test: doing so stops both fixtures. Resuming a
run starts with inspecting its existing services and recorded phase. Never print or inspect the TLS-key contents.

### Start the Peer Phase and Check Private Status

Start only the peer service, after confirming that Mailpit has zero replicas and no running container:

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   sudo -n docker --host unix:///var/run/docker.sock service scale --detach=true '${LEF_FIXTURE_STACK}_peer=1'"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "sudo -n docker --host unix:///var/run/docker.sock stack services '$LEF_FIXTURE_STACK'"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "sudo -n docker --host unix:///var/run/docker.sock service ps '${LEF_FIXTURE_STACK}_peer'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 or sport = :8025 )'"
```

Repeat the read-only checks for at most 60 seconds while the task starts. Require one Running peer task on
`verifier-1`, SMTP only on `172.29.10.4:2525`, and status only on `127.0.0.1:9000`. Stop and clean up on a rejected,
failed, or persistently pending task. In a dedicated controller terminal, start the foreground status forward:

```bash
ssh -F "$LEF_SSH_CONFIG" -N -T \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:19000:127.0.0.1:9000 verifier-1
```

In the scenario shell:

```bash
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19000/last-peer
```

A fresh task returns `{"peerAddress":null,"observedAt":null}`. This proves the status contract, not proxy health.
Run the existing reconciliation procedure above, sequentially checking all three sources with no competing SMTP
client. Capture a fresh observation for each listener; an old matching address is insufficient. Prove that another
guest cannot reach the status port. Stop and restart the peer phase when a new null baseline is required.

### Switch to Mailpit

Pause reconciliation and verification callers. Scale the peer service to zero first:

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   sudo -n docker --host unix:///var/run/docker.sock service scale --detach=true '${LEF_FIXTURE_STACK}_peer=0'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "sudo -n docker --host unix:///var/run/docker.sock ps -q \
    --filter label=com.docker.swarm.service.name='${LEF_FIXTURE_STACK}_peer'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 )'"
```

Wait at most 30 seconds for `peer` to reach `0/0`, the verifier's container query to return nothing, and both sockets
to close. A task's desired state alone does not prove that its old container has stopped. If the checks fail, stop
the transition and inspect the fixture; do not start Mailpit. Close the peer-status SSH forward with `Ctrl+C` and
confirm controller port `19000` is free. Then start Mailpit:

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   sudo -n docker --host unix:///var/run/docker.sock service scale --detach=true '${LEF_FIXTURE_STACK}_mailpit=1'"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "sudo -n docker --host unix:///var/run/docker.sock service ps '${LEF_FIXTURE_STACK}_mailpit'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :8025 )'"
```

Within 60 seconds, require one Mailpit task in the Running state on `verifier-1`, a healthy container, SMTP only on
`172.29.10.4:2525`, and HTTP only on `127.0.0.1:8025`. In a dedicated terminal, start its foreground HTTP forward:

```bash
ssh -F "$LEF_SSH_CONFIG" -N -T \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:18025:127.0.0.1:8025 verifier-1
```

From the scenario shell:

```bash
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:18025/readyz
```

Readiness covers the HTTP service; the real application phase below must prove SMTP, STARTTLS, and proxy use.
Prove that another guest cannot reach HTTP. For later reconciliation or recovery checks, reverse the procedure:
scale `mailpit` to zero, prove its container and ports are gone, close its forward, then start a fresh peer task.
Scaling both services in one command does not guarantee this order. `stop-first` governs updates within one service.

### Stop, Interruption, and Repetition

Stop verification callers and complete any registry draining while the required fixture and tunnel remain reachable.
Remove only the recorded fixture stack through the recognized manager:

```bash
test "$(cat "$LEF_RUN_DIR/fixture-stack-owned")" = "$LEF_FIXTURE_STACK"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "test \"\$(sudo -n docker --host unix:///var/run/docker.sock info --format '{{.Swarm.Cluster.ID}}')\" = '$LEF_CLUSTER_ID' &&
   sudo -n docker --host unix:///var/run/docker.sock stack rm --detach=true '$LEF_FIXTURE_STACK'"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  "for kind in service config secret; do
     sudo -n docker --host unix:///var/run/docker.sock \$kind ls \
       --filter label=com.docker.stack.namespace='$LEF_FIXTURE_STACK' || exit 1
   done"
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "for phase in peer mailpit; do
     sudo -n docker --host unix:///var/run/docker.sock ps -q \
       --filter label=com.docker.swarm.service.name='${LEF_FIXTURE_STACK}_'\$phase || exit 1
   done"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 or sport = :8025 )'"
```

Poll the read-only checks for at most 30 seconds. Require no fixture services, configurations, secrets, running
containers, or listening sockets. Stack removal is asynchronous: if anything remains, keep the ownership markers
and inspect the exact objects before retrying removal of this same stack. Do not use a global prune. Close both
fixture SSH forwards and confirm local ports `19000` and `18025` are free. Then remove the owned staging directories:

```bash
test "$(cat "$LEF_RUN_DIR/fixture-owned")" = "$LEF_FIXTURE_REMOTE"
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 "rm -rf -- '$LEF_FIXTURE_REMOTE'"
rm -rf -- "$LEF_FIXTURE_LOCAL"
rm -- "$LEF_RUN_DIR/fixture-owned" "$LEF_RUN_DIR/fixture-stack-owned"
```

The five-second stop grace bounds normal task shutdown; it does not impose a fixture lifetime. Swarm services do
not expire when SSH disconnects. After interruption, recover the recorded variables, verify the manager's ClusterID,
and run the same scoped removal. If a guest is unreachable, the cleanup procedure remains incomplete until access returns or the
disposable VMs are destroyed. Never claim success from the manager's desired state while a disconnected worker may
still run a container. Finish fixture cleanup before any worker leaves; `verifier-1` and both proxy workers must
leave before the manager, with WireGuard available until all required remote cleanup has finished.


## Real Application and Capacity Evidence

The peer probe proves connection origin through `/last-peer`; Mailpit provides SMTP conversations. The health check
closes its connection after CONNECT and reads the peer probe's JSON. Mailpit has no compatible endpoint, so pause
reconciliation while Mailpit owns port `2525` and restore the peer phase for later health/recovery assertions.

The verifier performs EHLO, STARTTLS, MAIL FROM, RCPT TO, and QUIT without DATA. An empty Mailpit inbox is therefore
expected and cannot prove or disprove verification. Default recipient acceptance is suitable for the basic SMTP
and catch-all scenario. With account discovery disabled, expect `catchAll=true` and
`verificationQuality=inconclusive`; accepting the control recipient does not prove that the target mailbox exists.
Mailpit recipient restrictions and Chaos can simulate other failures, but they do not
replace the existing Node fixture's precise SMTP evidence-classification tests.

Plan 16 must record how to invoke the application and which result to expect before this phase begins. The existing
certificate covers `smtp.lef.test`; use that MX hostname with an A record of `172.29.10.4` in the disposable DNS
environment. Both the application's MX resolver and the proxy nodes resolving the CONNECT destination need those
records. The application also needs reverse-DNS records for listener hosts `172.29.10.2` and `172.29.10.3` returning valid
lab hostnames, such as `proxy-a.lef.test` and `proxy-b.lef.test`: it derives its EHLO name and sender domain from
the allocated proxy host. Use a disposable organization/domain with fresh SMTP evidence and reset the relevant
test caches; changing only the recipient's local part can still reuse the domain's cached catch-all control result.
Required inputs include the test CA trusted by `SMTP_TLS_CA_FILE`, `SMTP_PORT=2525`, seeded authorization
and credits, and two verification processes sharing the same test Redis limits. Keep certificate verification
enabled and use the current mailbox-verification services and registered proxies. A substituted socket probe or a
health-check-only run does not meet the application acceptance criterion.

The evidence must link an actual verification result to a reconciled proxy endpoint, show the corresponding fixture
session, prove that overlapping processes obey the per-proxy and per-MX limits, and demonstrate failure and recovery.
Mailpit does not supply deterministic session hold/release controls for this test. Define a tested synchronization
barrier in the validation harness and capture the existing Redis lease/counter state during overlap in plan 16.
Starting two processes together, Mailpit message totals, and sequential `/last-peer` checks do not establish that
overlap. This instrumentation remains future validation work; no additional full SMTP server is proposed here.
Keep credentials, recipient data, raw SMTP envelopes, and unrelated infrastructure details out of committed output.

## Final Scenario Cleanup

After both fixture phases, registry draining, tunnel cleanup, all SSH forwards, and private evidence checks finish,
remove this scenario's local directory, including its captured SSH configuration and notes:

```bash
case "$LEF_RUN_DIR" in
  "$LEF_VAGRANT_DIR"/.vagrant/proxy-fleet/validation.*) rm -rf -- "$LEF_RUN_DIR" ;;
  *) exit 1 ;;
esac
```

Confirm that all recorded fixture services, configurations, secrets, temporary directories, local forwards, and
tunnel state are absent before reporting cleanup complete. Image-cache cleanup belongs to disposable VM destruction;
never prune images or volumes from the controller's Docker daemon.

## Remote Docker Boundary

The selected tunnel does not transport Docker management. Every later Docker mutation must explicitly use the
captured SSH alias for the disposable manager. The following is proposed preparation and read-only identity checking
for plan 16, run from the repository root:

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  'sudo -n docker --host unix:///var/run/docker.sock info --format "{{json .Swarm}}"' \
  > "$LEF_RUN_DIR/manager-identity.json"
```

Confirm that the manager is inactive before creating the lab Swarm; record its new ClusterID privately afterward
as `LEF_CLUSTER_ID`. Check the verifier's membership against that same ID after its worker join.
Compare that identity privately before every deployment or reset sequence. Stop on a mismatch. The current deployment
adapter invokes the caller's Docker CLI. Plan 16 must document its captured-SSH transport and test its identity guard
before invoking it; the plain deploy command in the Swarm guide is insufficient on this controller. The direct SSH
inspection above does not configure that adapter. Never fall back to the controller's daemon.
Guest reset and final `vagrant destroy -f` remain the direct procedures in plan 16 and the Vagrant guide.

## Decisions and Remaining Questions

| Question | Current evidence | Missing fact or required action | Responsible role |
| --- | --- | --- | --- |
| Which listener-reachability model? | Owner selected the tunnel through `verifier-1` on 2026-09-15. | Prove the proposed lifecycle and original endpoints in plan 16. | Plan-16 implementer |
| Can the controller support the exact tunnel? | WSL Vagrant access is documented; the method needs privileged local firewall redirection. | Confirm the selected host, compatible tool versions, port availability, and scoped privileges. The chosen model does not prove those prerequisites. | Project owner |
| Where do real verification processes run? | A host process can use this proposal; the default command does not prove container traffic coverage. | Confirm direct WSL execution and reachable application dependencies, or document a tested container-network procedure. | Plan-16 implementer |
| How should fixtures run on the verifier? | Owner selected Swarm services on the Vagrant VMs on 2026-09-18. | Provision the verifier as a non-proxy member; validate the separate fixture stack, image digests, private bindings, phase transitions, and cleanup. | Plan-16 implementer |
| How is full SMTP and capacity behavior exercised? | Mailpit supplies SMTP/STARTTLS; neither its inbox nor the peer probe proves concurrent leases. | Finalize DNS/CA setup, application invocation, synchronization barrier, Redis assertions, and failure/recovery evidence. | Plan-16 implementer |
| Which disposable application environment is used? | Reconciliation needs an API and administrative M2M access; verification also needs seeded data and Redis. | Supply the isolated API, dependency endpoints, image digest, and credential files. | Project owner |
| Are worker access, return paths, and cleanup correct? | Current templates have the gaps listed above. | Correct and prove them without changing the registry or application contracts. | Plan-16 implementer |

These unresolved execution details do not prevent completion of plan 19. They do prevent interpreting this proposal
as a successful plan-16 run. Plan 16 retains its existing readiness condition and every acceptance requirement.

## Documentation Validation and External References

Validate this document and the updated plan with their prescribed Harper and repository-fixture commands. Also
check every source path, symbol, environment variable, and shell block. Shell parsing establishes syntax only.
No lab command in this document was run as part of preparation. Bruno is not applicable because this PR changes
documentation only.

- [Command syntax for sshuttle](https://sshuttle.readthedocs.io/en/stable/manpage.html): scoped destinations, SSH options,
  foreground operation, and firewall helper privileges.
- [Requirements for sshuttle](https://sshuttle.readthedocs.io/en/stable/requirements.html): Python and Linux firewall support.
- [Firewall restoration in sshuttle 1.3.2](https://github.com/sshuttle/sshuttle/blob/v1.3.2/sshuttle/firewall.py): restoration
  attempts and their limits.
- [NAT rules in sshuttle 1.3.2](https://github.com/sshuttle/sshuttle/blob/v1.3.2/sshuttle/methods/nat.py): exact owned
  chain and jump removal for the proposed recovery.
- [Vagrant SSH configuration](https://developer.hashicorp.com/vagrant/docs/cli/ssh_config): captured connection facts.
- [TypeScript compiler options](https://www.typescriptlang.org/docs/handbook/compiler-options.html): explicit input
  files and compilation options.
- [Docker service placement](https://docs.docker.com/engine/swarm/services/) and
  [host networking](https://docs.docker.com/engine/network/drivers/host/): fixture placement and direct guest bindings.
- [Swarm stack deployment](https://docs.docker.com/reference/cli/docker/stack/deploy/),
  [scaling](https://docs.docker.com/reference/cli/docker/service/scale/), and
  [removal](https://docs.docker.com/reference/cli/docker/stack/rm/): explicit manager operations and asynchronous completion.
- [Swarm configurations](https://docs.docker.com/engine/swarm/configs/) and
  [secrets](https://docs.docker.com/engine/swarm/secrets/): immutable fixture artifacts and scoped TLS-key access.
- [Container definition for Mailpit 1.30.7](https://github.com/axllent/mailpit/blob/v1.30.7/Dockerfile): executable and health check.
- [Mailpit SMTP configuration](https://mailpit.axllent.org/docs/configuration/smtp/) and
  [command flags for Mailpit 1.30.7](https://github.com/axllent/mailpit/blob/v1.30.7/cmd/root.go): bindings, STARTTLS, database, and logging.
- [Readiness for Mailpit 1.30.7](https://github.com/axllent/mailpit/blob/v1.30.7/cmd/readyz.go),
  [API](https://mailpit.axllent.org/docs/api-v1/), and
  [Chaos](https://mailpit.axllent.org/docs/integration/chaos/): readiness signals and fixture capability boundaries.
- [Docker remote access](https://docs.docker.com/engine/security/protect-access/): explicitly selected remote daemons.
