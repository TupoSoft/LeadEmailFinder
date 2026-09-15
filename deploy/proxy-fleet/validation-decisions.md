# Fleet Validation Decisions

Prepared for [plan 16](../../.agents/plans/proxy-fleet/16-validate-disposable-multi-node-fleet.md)
by [plan 19](../../.agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md).
Repository evidence was inspected at `e3ae79e4e8eb5442930b29da1158b38efbb228e2` on 2026-09-15 and checked again at
`1b869d2607e709ee2570efcfbd213268603c54b3` when the fixture decision was updated that day.

## Decision and Evidence Status

The project owner selected a temporary subnet tunnel through `verifier-1` on 2026-09-15. The proposed implementation
uses `sshuttle` to carry only the three listener destinations over the existing Vagrant SSH connection. The
application and reconciler continue to dial the registered WireGuard addresses. The exact commands below are
proposals for plan 16; they have not run against the lab.

The owner selected Mailpit for SMTP conversations, retaining the existing peer probe for sequential source-IP
checks. Both run temporarily on `verifier-1`: the peer probe uses a staged Node runtime, and Mailpit uses a pinned
standalone binary. Run them in separate phases on port `2525`. Capacity assertions require additional instrumentation.
This choice does not start plan 16 or prove the proposed commands. Plan 16 still requires finalized execution
procedures, the known runtime corrections, and live evidence.

This is a documentation handoff. It installs no tool, creates no VM, changes no network or application state, and
provides no public Internet egress or deliverability evidence. The existing VirtualBox lab remains the provider
baseline. Native Linux/libvirt validation remains separate in plan 18.

## Source Map and Network Path

All paths in this document are relative to the repository root unless a guest path is explicitly identified.

| Hop or contract | Repository evidence | Observation |
| --- | --- | --- |
| Lab topology | `deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml` | One manager, two proxy nodes, and `verifier-1`; the verifier owns `172.29.10.4/28`. |
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
| Mailpit version precedent | `docker/compose.smtp-dev.yaml`, `plaintext-mailpit` | Pins Mailpit `v1.30.7` for a plaintext rejection scenario. The lab proposal uses that version's standalone binary with STARTTLS enabled. |
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
- Swarm joins lack explicit WireGuard advertise and data addresses. Reset inspects Docker on the verifier and does
  not enforce worker departures before the manager. See `roles/swarm/tasks/join_or_init.yml` and
  `roles/proxy_fleet_reset/tasks/main.yml`.

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

## Proposed Peer Probe Lifecycle

The selected fixture model starts with this peer probe, followed by Mailpit for SMTP conversations. These commands
are proposals for plan 16; they have not been executed against the lab. They require the plan-16 firewall and
WireGuard corrections first. Mailpit does not implement the reconciler's `/last-peer` contract.

The peer probe imports only `node:http` and `node:net`. Compile its two TypeScript files on the controller with
repository dependencies, then copy the JavaScript and one verified official Node 24 Linux x64 distribution to
`verifier-1`. No package installation, Docker daemon, shared folder, or source checkout is required in that guest.
A temporary systemd service gives this one process a stable name and bounded termination without PID matching.
The guest must have systemd and passwordless Vagrant `sudo`; the service itself runs as the captured SSH user.

### Fixture Preparation

Run from the repository root in the same Bash scenario shell. `LEF_SSH_CONFIG` is the absolute path of the captured
Vagrant SSH configuration. Set `LEF_RUN_ID` to a unique lowercase scenario identifier, `LEF_NODE_ARCHIVE` to the
absolute path of an official Node 24 Linux x64 archive with a specific patch version, and `LEF_NODE_SHA256` to that
archive's checksum from a verified release manifest. Do not use an archive selected through a `latest` alias. Use Node's documented
signed-manifest verification procedure before these commands; record the exact version and checksum in the later
sanitized evidence. The chosen patch release is an execution input for the plan-16 implementer.

```bash
set -euo pipefail
umask 077
: "${LEF_SSH_CONFIG:?Captured Vagrant SSH configuration is required}"
: "${LEF_RUN_ID:?Unique lowercase scenario identifier is required}"
: "${LEF_NODE_ARCHIVE:?Absolute pinned Node 24 Linux x64 archive path is required}"
: "${LEF_NODE_SHA256:?Verified archive SHA256 is required}"
case "$LEF_RUN_ID" in ''|*[!a-z0-9-]*) exit 1 ;; esac
LEF_FIXTURE_LOCAL=$(mktemp -d /tmp/lef-peer-stage.XXXXXXXX)
LEF_FIXTURE_REMOTE="/tmp/lef-peer-$LEF_RUN_ID"
LEF_FIXTURE_UNIT="lef-peer-$LEF_RUN_ID.service"
printf '%s  %s\n' "$LEF_NODE_SHA256" "$LEF_NODE_ARCHIVE" | sha256sum --check -
mkdir "$LEF_FIXTURE_LOCAL/node" "$LEF_FIXTURE_LOCAL/probe"
tar -xJf "$LEF_NODE_ARCHIVE" --strip-components=1 -C "$LEF_FIXTURE_LOCAL/node"
corepack pnpm exec tsc --target ES2023 --module commonjs --moduleResolution node \
  --strict --skipLibCheck --types node --noEmitOnError \
  --rootDir scripts/proxy-fleet-swarm --outDir "$LEF_FIXTURE_LOCAL/probe" \
  scripts/proxy-fleet-swarm/smtp-peer-probe.ts \
  scripts/proxy-fleet-swarm/smtp-peer-probe-cli.ts
ssh -F "$LEF_SSH_CONFIG" verifier-1 'test "$(uname -m)" = x86_64 && command -v systemd-run && sudo -n true'
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "test \"\$(systemctl show '$LEF_FIXTURE_UNIT' -p LoadState --value)\" = not-found"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "mkdir -m 0700 '$LEF_FIXTURE_REMOTE'"
printf '%s\n' "$LEF_FIXTURE_REMOTE" > "$LEF_RUN_DIR/fixture-owned"
tar -C "$LEF_FIXTURE_LOCAL" -cf - node probe |
  ssh -F "$LEF_SSH_CONFIG" verifier-1 "tar -C '$LEF_FIXTURE_REMOTE' -xf -"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "'$LEF_FIXTURE_REMOTE/node/bin/node' --version"
```

Stop if the remote directory or service name already belongs to an unfinished run. Do not stop its service, upload
files into it, or remove it. Recover that run using its recorded identifier before preparing another. The local
`fixture-owned` marker records a successful exclusive directory creation for this run. If that creation failed,
remove only newly created local staging files. Record these scenario variables in the ignored run notes so cleanup
can be resumed after losing the controller terminal. Never commit that note or the captured SSH configuration.
An unsuccessful preparation still requires removing any directory that these commands created.

### Fixture Start

Run from the same controller shell:

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "sudo -n systemd-run --unit='$LEF_FIXTURE_UNIT' --collect \
    --property=Type=exec --property=User=\$(id -un) \
    --property=TimeoutStopSec=5s --property=RuntimeMaxSec=2h \
    --property=KillMode=control-group \
    --setenv=SMTP_PEER_PROBE_HOST=172.29.10.4 \
    --setenv=SMTP_PEER_PROBE_SMTP_PORT=2525 \
    --setenv=SMTP_PEER_PROBE_STATUS_HOST=127.0.0.1 \
    --setenv=SMTP_PEER_PROBE_STATUS_PORT=9000 \
    '$LEF_FIXTURE_REMOTE/node/bin/node' \
    '$LEF_FIXTURE_REMOTE/probe/smtp-peer-probe-cli.js'"
```

The existing CLI handles `SIGINT` and `SIGTERM` by closing both servers, but active sockets can delay `server.close()`.
Stopping this unit sends `SIGTERM`; systemd kills any remaining process after five seconds. The two-hour run limit
bounds an abandoned process after loss of SSH access. The limit is a fixture lifetime, not a test timeout; split
long validation work into fresh fixture sessions. Automatic process expiry still leaves staged files to clean up.
The temporary service and its process group are owned by this scenario; no persistent unit file is installed.

### Fixture Readiness and Private Status

Confirm that the service remains active and its listening addresses are exact. Repeat the read-only checks within
five seconds while Node starts; if the expected sockets do not appear, stop and use the fixture cleanup procedure:

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 "systemctl is-active '$LEF_FIXTURE_UNIT'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 )'"
```

Expect SMTP only on `172.29.10.4:2525`, and status only on `127.0.0.1:9000`. Do not proceed if status appears on a
wildcard, underlay, or WireGuard address. In a dedicated controller terminal, with the same `LEF_SSH_CONFIG`, run:

```bash
ssh -F "$LEF_SSH_CONFIG" -N -T \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:19000:127.0.0.1:9000 verifier-1
```

Keep this SSH session in the foreground. The controller port 19000 must be free; a bind failure stops the command.
In the scenario shell:

```bash
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19000/last-peer
```

A fresh fixture returns `{"peerAddress":null,"observedAt":null}`. The response proves the HTTP forward and status
contract, not proxy health. Plan 16 must separately prove denial of status access through the guest network interfaces
from another guest. Keep the SSH connection available until every sequential egress assertion is complete.

### Fixture Use

Use the existing reconciliation procedure with these exact additional inputs:

```bash
export PROXY_FLEET_SMTP_PROBE_HOST=172.29.10.4
export PROXY_FLEET_SMTP_PROBE_PORT=2525
export PROXY_FLEET_SMTP_PROBE_STATUS_URL=http://127.0.0.1:19000/last-peer
```

`reconcile-cli.ts` also requires the tracked inventory, credential directory, API URL, and M2M credential file.
Use its unchanged environment contract from `deploy/proxy-fleet/swarm/README.md`. Reconciliation creates or updates
registry state; execute it only during the authorized plan-16 live scenario, after the tunnel and API are ready.

Allow only one health-check sequence and no competing SMTP clients during peer-origin checks. The fixture records
only the most recent TCP connection; `verifyListenerEgress()` compares that address with the requested listener's
egress IP. Capture a fresh observation after each authenticated CONNECT and assert `.21`, `.22`, and `.23` for the
three listeners. A concurrent application run can overwrite these observations. Restart the peer fixture when a
fresh null baseline is required; do not infer freshness from an old matching address alone.

### Fixture Stop, Interruption, and Repetition

Stop application/probe callers first, then stop the one guest service. Its name includes the recorded scenario ID.
An inactive unit can already have disappeared because `--collect` releases the transient unit after termination.
From the same controller shell:

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "if [ \"\$(systemctl show '$LEF_FIXTURE_UNIT' -p LoadState --value)\" != not-found ]; then
     sudo -n systemctl stop '$LEF_FIXTURE_UNIT'
   fi"
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "case \"\$(systemctl show '$LEF_FIXTURE_UNIT' -p ActiveState --value)\" in
     inactive|failed) exit 0 ;;
     *) exit 1 ;;
   esac"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :9000 )'"
```

Require no active service and no fixture listeners. Then press `Ctrl+C` in the foreground status-forward terminal and
confirm port 19000 has closed on the controller. Remove only the remote and local directories created above:

```bash
test "$(cat "$LEF_RUN_DIR/fixture-owned")" = "$LEF_FIXTURE_REMOTE"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "rm -rf -- '$LEF_FIXTURE_REMOTE'"
rm -rf -- "$LEF_FIXTURE_LOCAL"
rm -- "$LEF_RUN_DIR/fixture-owned"
```

The Node archive and verified manifest may be retained as explicitly recorded reusable prerequisites; remove their
copies as well if downloaded only for this run. Retain the scenario directory, captured SSH configuration, and
tunnel for the Mailpit phase. If a later health or recovery scenario requires reconciliation, stop Mailpit first
and prepare a fresh peer-probe session with a new identifier. Never point the reconciler's status URL at Mailpit.

On `Ctrl+C` or SSH loss elsewhere, reconnect using the captured configuration and run the same stop-and-remove steps.
Do not assume closing the original SSH session stops a systemd service. If the guest is unreachable, the cleanup procedure remains
incomplete until access returns or the disposable VM is destroyed through the existing Vagrant procedure. Report
that gap rather than claiming cleanup from the automatic two-hour process expiry.

## Proposed Mailpit Lifecycle

Use the standalone Mailpit `v1.30.7` binary for 64-bit Linux, matching the version already pinned in the development
Compose file. Mailpit needs no Node runtime or Docker daemon. The following proposed commands reuse the captured
SSH configuration and the temporary-service lifecycle; they have not run in the lab.

### Mailpit Preparation

Finish peer checks, pause reconciliation and verification callers, stop the peer service, and close its status
forward using the preceding cleanup procedure. Confirm port `2525` is free before starting Mailpit. Keep the tunnel
running. From the repository root, set `LEF_MAILPIT_ARCHIVE` to the absolute path of the release asset
`mailpit-linux-amd64.tar.gz` from `v1.30.7`. The checksum below is that asset's SHA-256 digest from the GitHub release API;
the release has no separate checksum manifest asset. Record all run variables in the private scenario notes.

```bash
: "${LEF_SSH_CONFIG:?Captured Vagrant SSH configuration is required}"
: "${LEF_RUN_ID:?Unique lowercase scenario identifier is required}"
: "${LEF_MAILPIT_ARCHIVE:?Absolute Mailpit v1.30.7 Linux amd64 archive path is required}"
case "$LEF_RUN_ID" in ''|*[!a-z0-9-]*) exit 1 ;; esac
LEF_MAILPIT_SHA256=a35c053509441b95fb96da6479b3a26b3eb309e223232aced28255c011d29efc
printf '%s  %s\n' "$LEF_MAILPIT_SHA256" "$LEF_MAILPIT_ARCHIVE" | sha256sum --check -
LEF_MAILPIT_LOCAL=$(mktemp -d /tmp/lef-mailpit-stage.XXXXXXXX)
LEF_MAILPIT_REMOTE="/tmp/lef-mailpit-$LEF_RUN_ID"
LEF_MAILPIT_UNIT="lef-mailpit-$LEF_RUN_ID.service"
tar -xzf "$LEF_MAILPIT_ARCHIVE" -C "$LEF_MAILPIT_LOCAL" mailpit
install -m 0600 docker/smtp-dev/tls/smtp.crt docker/smtp-dev/tls/smtp.key \
  docker/smtp-dev/tls/ca.crt "$LEF_MAILPIT_LOCAL/"
ssh -F "$LEF_SSH_CONFIG" verifier-1 'test "$(uname -m)" = x86_64 && command -v systemd-run && sudo -n true'
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "test \"\$(systemctl show '$LEF_MAILPIT_UNIT' -p LoadState --value)\" = not-found"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :8025 )'"
```

Require no listener on either guest port. Stop if the service or directory belongs to an unfinished run; recover
that run first. Create the directory exclusively before copying files, then record ownership:

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 "mkdir -m 0700 '$LEF_MAILPIT_REMOTE'"
printf '%s\n' "$LEF_MAILPIT_REMOTE" > "$LEF_RUN_DIR/mailpit-owned"
tar -C "$LEF_MAILPIT_LOCAL" -cf - mailpit smtp.crt smtp.key ca.crt |
  ssh -F "$LEF_SSH_CONFIG" verifier-1 "tar -C '$LEF_MAILPIT_REMOTE' -xf -"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "mkdir -m 0700 '$LEF_MAILPIT_REMOTE/tmp'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "'$LEF_MAILPIT_REMOTE/mailpit' version --no-release-check"
```

Require version `1.30.7`. A failed preparation still requires removing the directories created by this run.

### Mailpit Start and Readiness

Start the service as the captured SSH user. Keep its database and verbose SMTP log inside the private directory so
cleanup includes both. The test certificate enables STARTTLS; required STARTTLS preserves the verifier's secure
transport contract. Leave SMTP authentication, forwarding, relay, and Chaos disabled for this acceptance phase.

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "sudo -n systemd-run --unit='$LEF_MAILPIT_UNIT' --collect \
    --property=Type=exec --property=User=\$(id -un) \
    --property=TimeoutStopSec=5s --property=RuntimeMaxSec=2h \
    --property=KillMode=control-group \
    --property=WorkingDirectory='$LEF_MAILPIT_REMOTE' \
    --setenv=TMPDIR='$LEF_MAILPIT_REMOTE/tmp' \
    '$LEF_MAILPIT_REMOTE/mailpit' \
    --smtp=172.29.10.4:2525 --listen=127.0.0.1:8025 \
    --smtp-tls-cert='$LEF_MAILPIT_REMOTE/smtp.crt' \
    --smtp-tls-key='$LEF_MAILPIT_REMOTE/smtp.key' --smtp-require-starttls \
    --smtp-disable-rdns --disable-version-check \
    --database='$LEF_MAILPIT_REMOTE/mailpit.db' \
    --verbose --log-file='$LEF_MAILPIT_REMOTE/smtp.log'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "systemctl is-active '$LEF_MAILPIT_UNIT'"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :8025 )'"
```

Repeat the read-only checks within five seconds while Mailpit starts. Require SMTP only on `172.29.10.4:2525`
and HTTP only on `127.0.0.1:8025`; stop and clean up if the unit fails or either binding differs. Start a foreground
SSH forward in a dedicated controller terminal with the same `LEF_SSH_CONFIG`:

```bash
ssh -F "$LEF_SSH_CONFIG" -N -T \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:18025:127.0.0.1:8025 verifier-1
```

From the scenario shell, check readiness through the private HTTP forward:

```bash
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:18025/readyz
```

Readiness proves the service reports itself ready. The real application phase below must separately prove SMTP,
STARTTLS, and proxy use. Prove HTTP access from another guest is denied. Raw verbose logs include SMTP envelope
addresses; extract only sanitized session, peer, and command-result evidence for the later validation report.

### Mailpit Stop, Interruption, and Repetition

Stop verification callers before stopping Mailpit. From the same controller shell:

```bash
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "if [ \"\$(systemctl show '$LEF_MAILPIT_UNIT' -p LoadState --value)\" != not-found ]; then
     sudo -n systemctl stop '$LEF_MAILPIT_UNIT'
   fi"
ssh -F "$LEF_SSH_CONFIG" verifier-1 \
  "case \"\$(systemctl show '$LEF_MAILPIT_UNIT' -p ActiveState --value)\" in
     inactive|failed) exit 0 ;;
     *) exit 1 ;;
   esac"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "ss -ltnp '( sport = :2525 or sport = :8025 )'"
```

Require no active unit or fixture listeners. Press `Ctrl+C` in the Mailpit HTTP-forward terminal and confirm that
controller port `18025` has closed. After inspecting evidence, remove only this run's staged files, database, and log:

```bash
test "$(cat "$LEF_RUN_DIR/mailpit-owned")" = "$LEF_MAILPIT_REMOTE"
ssh -F "$LEF_SSH_CONFIG" verifier-1 "rm -rf -- '$LEF_MAILPIT_REMOTE'"
rm -rf -- "$LEF_MAILPIT_LOCAL"
rm -- "$LEF_RUN_DIR/mailpit-owned"
```

The five-second shutdown bound and two-hour service lifetime also apply to Mailpit. After interruption or SSH loss,
resume these steps using the recorded variables. Automatic expiry stops the process but does not remove its files.
If the guest is unreachable, the cleanup procedure remains incomplete until access returns or the disposable VM is destroyed. A new run
uses a fresh identifier and directory; retain the pinned archive only if recorded as a reusable prerequisite.

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

Confirm that all recorded guest services, temporary directories, local forwards, and tunnel state are absent before
reporting cleanup complete. Remove archive copies too if they were downloaded only for this run.

## Remote Docker Boundary

The selected tunnel does not transport Docker management. Every later Docker mutation must explicitly use the
captured SSH alias for the disposable manager. The following is proposed preparation and read-only identity checking
for plan 16, run from the repository root:

```bash
ssh -F "$LEF_SSH_CONFIG" proxy-manager-1 \
  'sudo -n docker --host unix:///var/run/docker.sock info --format "{{json .Swarm}}"' \
  > "$LEF_RUN_DIR/manager-identity.json"
```

Confirm that the manager is inactive before creating the lab Swarm; record its new ClusterID privately afterward.
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
| How should fixtures run on the verifier? | Owner selected standalone Mailpit for SMTP and the existing peer probe for sequential egress checks. | Validate the proposed transient services, staged Node for the probe, pinned Mailpit binary, and phase transitions. | Plan-16 implementer |
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
- [Node binary verification](https://github.com/nodejs/node#verifying-binaries): exact archives and signed manifests.
- [Mailpit installation](https://mailpit.axllent.org/docs/install/) and
  [release metadata for Mailpit 1.30.7](https://api.github.com/repos/axllent/mailpit/releases/tags/v1.30.7): standalone archive and digest.
- [Mailpit SMTP configuration](https://mailpit.axllent.org/docs/configuration/smtp/) and
  [command flags for Mailpit 1.30.7](https://github.com/axllent/mailpit/blob/v1.30.7/cmd/root.go): bindings, STARTTLS, database, and logging.
- [Readiness for Mailpit 1.30.7](https://github.com/axllent/mailpit/blob/v1.30.7/cmd/readyz.go),
  [API](https://mailpit.axllent.org/docs/api-v1/), and
  [Chaos](https://mailpit.axllent.org/docs/integration/chaos/): readiness signals and fixture capability boundaries.
- [systemd 255 transient services](https://github.com/systemd/systemd/blob/v255/man/systemd-run.xml),
  [service time limits](https://github.com/systemd/systemd/blob/v255/man/systemd.service.xml), and
  [termination](https://github.com/systemd/systemd/blob/v255/man/systemd.kill.xml): process ownership and bounded shutdown.
- [Docker remote access](https://docs.docker.com/engine/security/protect-access/): explicitly selected remote daemons.
