# Fleet Validation Decision Proposal

This is the documentation handoff from [plan 19](../../.agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md)
to [plan 16](../../.agents/plans/proxy-fleet/16-validate-disposable-multi-node-fleet.md), prepared against revision
`2ac6ea303e40e78efca92da8baf82d838a337a6d` on 2026-09-14. It proposes execution models; it does not select them or
claim live validation. Every lifecycle command below is **proposed; none have been run**. Commands labeled **future code**
also require implementation in plan 16. The owner must resolve the decision table before that plan starts.

The recommended candidate is a temporary TCP tunnel through `verifier-1`, with the reconciler and application
processes in the controller's covered network namespace. Stage a temporary Node runtime on the verifier for the
existing peer probe, then reuse that runtime for a separate SMTP conversation fixture. This keeps the advertised
listener endpoints and avoids installing Docker or sharing the repository into the verifier. Guest-side execution
is a conditional alternative when controller firewall privileges or namespace coverage cannot be established.

## Repository Evidence and Required Corrections

All paths below are relative to the repository root. The tracked topology is
`deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml`:

| Host | Underlay endpoint | WireGuard address | Listener endpoint | Observed egress required |
| --- | --- | --- | --- | --- |
| `proxy-manager-1` | `192.168.250.11` | `172.29.10.1/28` | None | None |
| `proxy-node-a` | `192.168.250.12` | `172.29.10.2/28` | `172.29.10.2:13001` | `198.18.0.21` |
| `proxy-node-a` | `192.168.250.12` | `172.29.10.2/28` | `172.29.10.2:13002` | `198.18.0.22` |
| `proxy-node-b` | `192.168.250.13` | `172.29.10.3/28` | `172.29.10.3:13001` | `198.18.0.23` |
| `verifier-1` | `192.168.250.14` | `172.29.10.4/28` | Proposed SMTP `:2525`; status on loopback `:9000` | Receives all three sources |

| Hop or boundary | Current source and behavior | Consequence for validation |
| --- | --- | --- |
| Controller to guest | `deploy/proxy-fleet/vagrant/Vagrantfile` disables `/vagrant`; `deploy/proxy-fleet/vagrant/README.md` captures `vagrant ssh-config`. | Use captured aliases, including provider-specific SSH ports and keys. Do not infer direct controller access to the underlay or overlay. |
| Worker to listener | `deploy/proxy-fleet/ansible/inventory/group_vars/all.yml` supplies `proxy_fleet_worker_cidrs`; `deploy/proxy-fleet/ansible/roles/firewall/templates/iptables.rules.j2` admits those sources on `wg0`. | The current value is **`172.29.10.0/28`**, with no override in `vagrant-lab.yml`. The `.4/32` restriction described in plan 16 is intended behavior, not current evidence. Plan 16 must narrow the effective lab allow list to `172.29.10.4/32` and test denied manager/proxy sources. |
| Listener authentication and source binding | `scripts/proxy-fleet-swarm/stack-renderer.ts`, `renderNodeArtifact`, carries worker CIDRs into the manifest. `docker/proxy-fleet/render-config.sh` emits authenticated ACLs and `proxy -i<bindIp> -e<egressIp> -p<port>`. | Both firewall and 3proxy must enforce the worker restriction. Destination ports currently allowed are `2525` and `587`. Swarm uses host networking and node placement, without publishing listener ports through the routing mesh. |
| Egress and return route | `deploy/proxy-fleet/vagrant/provision/guest-network.sh`, `apply_egress`, `apply_routes`, and `configure_networkd_routes`, owns `lef-egress0` and exact protocol-98 return routes. | `.21` and `.22` return through `.12`; `.23` returns through `.13` on the underlay. These are lab-routed RFC 2544 identities, not public egress addresses. |
| WireGuard source authorization | `deploy/proxy-fleet/ansible/roles/wireguard/templates/wg0.conf.j2` currently uses `ansible_host`, overlay-only peer `AllowedIPs`, and automatic route installation. | Plan 16 must prefer `wireguard_endpoint`, authorize only each peer's own egress `/32` sources, and use `Table = off`. Otherwise, the source can be rejected after decryption or the verifier return routes can be displaced. |
| Listener health and registry | `listener-health-check.ts`, `verifyListenerEgress`, dials `listener.bindIp` and `port` through the HTTP CONNECT adapter. `reconcile.ts`, `toDesiredRecord` and `diffFields`, publish and maintain that host and port. Both files are under `scripts/proxy-fleet-swarm/`. | A local endpoint substituted in inventory, the registry, or the connection adapter does not prove the unchanged path. Reconciliation creates disabled entries, checks health, activates healthy entries, and drains failed or removed owned entries. Manual entries remain outside fleet ownership. |
| Registry to application connection | Under `src/libs/modules/proxy/src/`: `infrastructure/persistence/typeorm-proxy-candidate.repository.ts`, `application/proxy-allocator.service.ts`, and `domain/to-iproxy.mapper.ts` select, lease, and preserve the registry endpoint. | Real verification must allocate a reconciled member through the existing Redis capacity rules. A manually supplied proxy or successful registry API response alone is insufficient. |
| Application to SMTP | Under `src/libs/modules/email-verification/src/`: `infrastructure/mailbox/smtp/smtp-mailbox-probe.ts` invokes the allocated proxy through `smtp-client.ts`. `src/libs/socket/src/http-proxy-connect.ts` dials its host and port. | Preserve the application path, including EHLO, trusted STARTTLS, MAIL, and RCPT. Record the allocated proxy ID and corresponding listener without recording credentials or mailbox contents. |
| Peer observation | `scripts/proxy-fleet-swarm/smtp-peer-probe.ts`, `PeerTracker` and `startSmtpPeerProbe`, expose `{peerAddress, observedAt}` at `/last-peer`, but send a banner and close the SMTP socket. | This proves connection origin only. `verifyListenerEgress` compares `peerAddress`; it does not establish SMTP success or observation freshness. Use one probe client at a time and require a fresh observation for each listener. |

The verifier currently receives WireGuard and firewall roles, without Node or Docker. Its shared source directory
is disabled. The peer CLI defaults both interfaces to `0.0.0.0`, so status privacy requires an explicit
`SMTP_PEER_PROBE_STATUS_HOST=127.0.0.1` and an SSH status forward.

Plan 16 also owns prerequisites that a reachability model cannot repair: whole-table firewall restoration, missing
verifier SMTP admission from the three egress addresses, reset on hosts without Docker, worker-before-manager reset
ordering, and explicit Swarm advertise/data-path addresses. The firewall currently writes its rules file before
creating the parent directory on a fresh host. Reset currently stops WireGuard before later Swarm operations.
Inspect `roles/firewall/tasks/main.yml`, `roles/proxy_fleet_reset/tasks/main.yml`, and
`roles/swarm/tasks/join_or_init.yml` under `deploy/proxy-fleet/ansible/`. Correct and test these within plan 16 before
using the commands below against a provisioned fleet. This proposal changes no runtime behavior or plan-16 criteria.

## Listener Execution Comparison

| Model | Endpoint and real application coverage | Listener-side source and admission | Dependencies and trade-off | Assessment |
| --- | --- | --- | --- | --- |
| Scenario-scoped `sshuttle` through `verifier-1` | The controller still dials all three inventory endpoints. Covers the real application only when its sockets and the reconciler are in the intercepted namespace. | The verifier opens the onward connections; routing must select `.4` over `wg0`, admitted by the intended `.4/32` ACL. | Controller Python, `sshuttle`, SSH, and privilege for temporary firewall rules; guest Python. Requires proof on the chosen WSL/Linux firewall backend. | Recommended candidate, conditional on namespace and cleanup evidence. |
| Reconciler and application tooling on `verifier-1` | Uses the same registry endpoints directly from the guest. Must run real application services, not only CONNECT clients. | Guest sockets originate from `.4` over `wg0`, using the same ACL. | Temporary Node, source, package dependencies, guest storage, and private API/OIDC/PostgreSQL/Redis/DNS connectivity. Avoids controller packet interception but increases guest setup. | Viable fallback once dependency transport and the application scenario are specified. |
| Narrow connection override or ordinary `ssh -L` to localhost | Changing `host` to localhost or intercepting it inside the adapter changes the path under test. | A forward through the verifier could have the right source, but that alone does not preserve the application endpoint contract. | Simple SSH transport, but requires a contract change or bypass. | Unsuitable for the current acceptance criteria. A transparent OS transport belongs to the first model and still needs its evidence. |

The tunnel must terminate at the verifier, not the manager. Restrict it to the three listener destinations; do not
capture DNS, automatic subnets, or the default route. Other controller users in the same namespace can reach these
listeners while it is active, so use an isolated scenario window. Container workers are not assumed to share this
coverage. Keep capacity measurements separate from tunnel performance claims.

## Shared Proposed Preparation

Use Bash on the controller, starting at the repository root. Use `set -euo pipefail` and `umask 077` in each
scenario terminal so failed prerequisites stop execution and newly created files stay private. The supported candidate is the plan-17 VirtualBox
environment with its documented WSL prerequisites. This does not start plan 18 or approve a provider change.
After plan 16 selects the models, use the [Vagrant guide](vagrant/README.md) and [Ansible guide](ansible/README.md) for
direct creation, Vault preparation, corrected provisioning, and reset. The following captures a ready lab's SSH facts;
it is not a replacement provisioning workflow.

```sh
set -euo pipefail
umask 077
cd "$(git rev-parse --show-toplevel)"
export LEF_REPO="$PWD"
cd "$LEF_REPO/deploy/proxy-fleet/vagrant"
vagrant validate
vagrant up --no-install-provider --provider=virtualbox
vagrant status
install -d -m 0700 .vagrant/proxy-fleet
test ! -e .vagrant/proxy-fleet/validation-state
(umask 077; vagrant ssh-config > .vagrant/proxy-fleet/ssh-config)
LEF_STATE="$(mktemp -d /tmp/lef-fleet.XXXXXXXX)"
export LEF_STATE
printf '%s\n' "$LEF_STATE" > .vagrant/proxy-fleet/validation-state
chmod 0600 .vagrant/proxy-fleet/validation-state
cp .vagrant/proxy-fleet/ssh-config "$LEF_STATE/ssh-config"
chmod 0600 "$LEF_STATE/ssh-config"
export LEF_SSH="$LEF_STATE/ssh-config"
cd "$LEF_REPO"
ssh -F "$LEF_SSH" verifier-1 'command -v python3 && command -v systemd-run && id -un'
```

Stop on a failed prerequisite. The fixed guest directory and service names below permit only one validation session
per lab. An existing state marker, guest directory, or unit means resume or clean up that session before starting
another. The short private temporary directory also keeps SSH control socket paths within platform limits.
Refresh captured SSH facts after recreation; never reuse them for a replacement lab without checking Vagrant status.

Inputs supplied by the plan-16 implementer, kept outside Git:

| Input | Meaning and handling |
| --- | --- |
| `LEF_NODE_ARCHIVE`, `LEF_NODE_SHA256` | Absolute path to an approved Linux x64 Node archive and its verified SHA-256. Select an exact supported release and verify its signed release checksums before staging. Do not copy the controller binary across operating systems. |
| `PROXY_FLEET_CREDENTIALS_DIR` | Private directory with `<proxy_node_id>.json` files fetched from each proxy node's root-only `/var/lib/lead-email-finder/proxy-fleet/credentials.json`. Fetch via captured SSH/Ansible; never print the files. |
| `PROXY_FLEET_API_BASE_URL`, `PROXY_FLEET_M2M_CREDENTIALS_FILE` | Disposable API and mode-0600 JSON `{issuer, clientId, clientSecret}` with `platform:admin`. The issuer must be reachable from the chosen execution namespace. |
| `PROXY_FLEET_IMAGE_DIGEST` | Plan-11 image pinned by digest, accessible to the guests. Image publication is a separate prerequisite. |
| Application environment | Existing database, Redis, authentication, DNS, SMTP port, and fixture CA inputs for two verification processes. Use disposable data and the application's existing configuration contract. Transport and scenario assertions remain future plan-16 work. |

Do not enable shell tracing or log credentials, raw generated proxy configurations, environment files, or captured
SSH content. Keep temporary files mode 0600 and directories mode 0700. Retain only sanitized command versions,
endpoint/egress pairs, assertion results, and owned object counts in committed evidence.

### Explicit Remote Docker Transport

Every future Docker mutation must identify the lab manager and match the Swarm identity recorded for the lab. The current
`DockerCliSwarmApi` inherits its environment; it does not enforce the plan-16 identity guard. The direct transport
below consumes captured SSH configuration without consulting the controller's Docker context:

```sh
# Controller, repository root; read-only before any remote mutation.
ssh -F "$LEF_SSH" proxy-manager-1 \
  'sudo docker info --format "{{.Swarm.LocalNodeState}} {{.Swarm.Cluster.ID}}"'
# Future plan-16 use, only after matching the recorded lab ClusterID and stack ownership:
ssh -F "$LEF_SSH" proxy-manager-1 'sudo docker stack rm lef-plan16'
```

`lef-plan16` is the proposed scenario stack name, not an existing deployment. Set
`PROXY_FLEET_STACK_NAME=lef-plan16` when deploying. A future plan-16 adapter must pass the captured SSH transport for every Docker
operation, including validation and pruning. Do not run the current deploy CLI with its default local daemon.
Drain owned registry entries before removal; prune only proven owned, unreferenced objects. The eventual deploy
command and identity guard are future code, not supplied by this documentation task.

## Proposed Peer Fixture Lifecycle

Compile only the two existing peer-probe files on the controller; they require only the standard Node modules at runtime. Stage them
with the temporary Node archive through SSH. No guest package installation, source share, or Docker is needed for
this fixture. Preparation is proposed; archive selection and guest execution remain unverified.

```sh
# Controller, repository root, after setting the named inputs above.
cd "$LEF_REPO"
: "${LEF_NODE_ARCHIVE:?Set the verified Node archive path}"
: "${LEF_NODE_SHA256:?Set the verified archive digest}"
printf '%s  %s\n' "$LEF_NODE_SHA256" "$LEF_NODE_ARCHIVE" | sha256sum -c -
corepack pnpm exec tsc --target ES2022 --module commonjs --types node \
  --skipLibCheck --noEmitOnError --outDir "$LEF_STATE/probe" \
  scripts/proxy-fleet-swarm/smtp-peer-probe-cli.ts
ssh -F "$LEF_SSH" verifier-1 \
  'umask 077; mkdir /home/vagrant/lef-plan16 && mkdir /home/vagrant/lef-plan16/node'
scp -F "$LEF_SSH" "$LEF_NODE_ARCHIVE" verifier-1:/home/vagrant/lef-plan16/node.tar.xz
scp -F "$LEF_SSH" "$LEF_STATE/probe/"*.js verifier-1:/home/vagrant/lef-plan16/
ssh -F "$LEF_SSH" verifier-1 \
  'cd /home/vagrant/lef-plan16 && tar -xf node.tar.xz --strip-components=1 -C node && node/bin/node --version'
```

Start one transient guest service as `vagrant`. The guest directory must belong to that captured SSH user; if the
box reports another user, resolve that input before use. `systemd-run` provides named process ownership independent
of the SSH connection; its successful return does not by itself prove fixture readiness.

```sh
# Controller; the command sets the guest working directory explicitly.
ssh -F "$LEF_SSH" verifier-1 'sudo systemd-run --unit=lef-plan16-peer --collect \
  --property=Type=exec --property=RuntimeMaxSec=1h --uid=vagrant \
  --working-directory=/home/vagrant/lef-plan16 \
  --setenv=SMTP_PEER_PROBE_HOST=172.29.10.4 \
  --setenv=SMTP_PEER_PROBE_SMTP_PORT=2525 \
  --setenv=SMTP_PEER_PROBE_STATUS_HOST=127.0.0.1 \
  --setenv=SMTP_PEER_PROBE_STATUS_PORT=9000 \
  /home/vagrant/lef-plan16/node/bin/node /home/vagrant/lef-plan16/smtp-peer-probe-cli.js'
ssh -F "$LEF_SSH" -M -S "$LEF_STATE/status.sock" -fNT \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:19000:127.0.0.1:9000 verifier-1
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19000/last-peer
ssh -F "$LEF_SSH" verifier-1 \
  'systemctl is-active lef-plan16-peer.service; ss -ltn'
```

Readiness requires an active unit, SMTP bound only to `172.29.10.4:2525`, status bound only to `127.0.0.1:9000`, and
JSON containing `peerAddress` and `observedAt` (initially null). The controller forward must bind only to the loopback interface.
In plan 16, prove that direct status access from other guests fails and that undeclared SMTP sources are denied.
Use the forwarded URL only for status: forwarding it does not alter the advertised proxy listener endpoints.

## Proposed Controller Tunnel Lifecycle

After corrected fleet provisioning, check routing on the verifier. Both lookups must use `wg0` with source `.4`:

```sh
# Controller, repository root.
cd "$LEF_REPO"
ssh -F "$LEF_SSH" verifier-1 \
  'ip route get 172.29.10.2; ip route get 172.29.10.3'
sshuttle --version
sudo -v
sudo iptables-save > "$LEF_STATE/firewall.before"
ip route show table all > "$LEF_STATE/routes.before"
```

Run the tunnel in a dedicated foreground terminal with `LEF_SSH` set to the captured file. This candidate explicitly
uses the Linux `nat` method; its availability and compatibility with the selected WSL environment must be proved.
The three TCP destinations preserve every advertised listener while avoiding unnecessary subnet interception:

```sh
# Controller, repository root; leave this terminal open for the scenario.
cd "$LEF_REPO"
env -u SSHUTTLE_ARGS sshuttle --method=nat --python=python3 \
  --ssh-cmd="ssh -F $LEF_SSH -o ServerAliveInterval=15 -o ServerAliveCountMax=3" \
  --remote=verifier-1 172.29.10.2:13001-13002 172.29.10.3:13001
```

In a second controller terminal, preserve the same input variables and run the existing reconciliation CLI. The controller needs the repository dependencies and
`ansible-inventory` on its `PATH`:

```sh
# Controller, repository root; API, credential and fleet prerequisites must already be ready.
cd "$LEF_REPO"
export PROXY_FLEET_ANSIBLE_INVENTORY=deploy/proxy-fleet/ansible/inventory/vagrant-lab.yml
export PROXY_FLEET_SMTP_PROBE_HOST=172.29.10.4
export PROXY_FLEET_SMTP_PROBE_PORT=2525
export PROXY_FLEET_SMTP_PROBE_STATUS_URL=http://127.0.0.1:19000/last-peer
corepack pnpm proxy-fleet:reconcile
```

Tunnel readiness requires all three authenticated `verifyListenerEgress` checks to pass, fresh observations of
`.21`, `.22`, and `.23`, and registry hosts/ports equal to the table above. Check registry state and observations:
the CLI can finish after recording unhealthy actions, so exit code zero alone is insufficient. Run only one
reconciler and no competing SMTP clients while reading `/last-peer`; the sequential reconciler loop cannot prevent
an unrelated client from overwriting the latest observation. Plan 16 must add a bounded freshness assertion and
capture the verifier's `.4` source at the listeners. A bare TCP connection is only a preliminary transport check.

For normal completion or interruption, stop scenario clients, perform required draining/remote fleet cleanup while
transports remain available, then press `Ctrl+C` in the tunnel terminal. Inspect its exit and compare state:

```sh
# Controller, after the foreground tunnel exits.
sudo iptables-save > "$LEF_STATE/firewall.after"
ip route show table all > "$LEF_STATE/routes.after"
diff -u "$LEF_STATE/firewall.before" "$LEF_STATE/firewall.after"
diff -u "$LEF_STATE/routes.before" "$LEF_STATE/routes.after"
```

An unexpected difference blocks a cleanup claim. Account for unrelated concurrent changes without overwriting
them. On SSH loss or terminal interruption, reconnect and inspect processes with their exact command lines; send
`SIGTERM` only to the confirmed scenario tunnel if still running, then repeat the state comparison. Do not use
`pkill`, flush firewall tables, restore a whole saved table, or remove arbitrary routes. If an owned firewall rule
survives an abnormal termination, plan 16 must record its exact identity and narrowly remove it before declaring
recovery complete. A reboot or `SIGKILL` does not establish graceful cleanup; test the chosen interruption procedure.

```sh
# Controller interruption recovery; inspect before supplying the confirmed scenario PID.
ps -eo pid,args
: "${LEF_TUNNEL_PID:?Set only after matching the scenario tunnel command and SSH configuration}"
kill -TERM "$LEF_TUNNEL_PID"
# Wait for that process to exit, then repeat both state comparisons above.
```

## SMTP Conversation and Real Application Evidence

The peer probe closes after its greeting. It cannot satisfy `SmtpClient.startSession`, which requires EHLO,
STARTTLS, certificate verification, and a second EHLO before MAIL/RCPT. Reuse the protocol behavior of
`docker/smtp-dev/evidence-server.mjs`, `createEvidenceFixture`, rather than treating the peer banner as a successful
verification. That existing fixture is not a drop-in replacement: its control server binds without an explicit
loopback host and exposes `/counters`, `/reset`, and `/scenario`, not `/last-peer`.

**Future code proposal:** a small fleet fixture entry point around that existing factory should bind SMTP to
`172.29.10.4:2525`, bind all status/control HTTP access to `127.0.0.1:9000`, and preserve the peer contract
`GET /last-peer -> {peerAddress: string|null, observedAt: string|null}` with normalized IPv4 addresses. Add focused
tests for private binding, peer observation, protocol success/rejection, failure to start, and shutdown. Keep the
source observer separate from protocol behavior; this is fixture work, not a new application adapter.

Use the same temporary runtime and named-service lifecycle as the peer probe, sequentially replacing the service
on port 2525. This avoids introducing a destination-port exception. The following names and environment variables
are **proposed future fixture inputs**, not commands or options that exist at the inspected revision:

```sh
# Controller; LEF_SMTP_BUNDLE is a future reviewed bundle with fixture.mjs, its module, and test TLS files.
: "${LEF_SMTP_BUNDLE:?Set the future fleet SMTP fixture bundle directory}"
ssh -F "$LEF_SSH" verifier-1 'sudo systemctl stop lef-plan16-peer.service'
scp -r -F "$LEF_SSH" "$LEF_SMTP_BUNDLE" verifier-1:/home/vagrant/lef-plan16/smtp
ssh -F "$LEF_SSH" verifier-1 'sudo systemd-run --unit=lef-plan16-smtp --collect \
  --property=Type=exec --property=RuntimeMaxSec=1h --uid=vagrant \
  --working-directory=/home/vagrant/lef-plan16/smtp \
  --setenv=FLEET_SMTP_HOST=172.29.10.4 --setenv=FLEET_SMTP_PORT=2525 \
  --setenv=FLEET_STATUS_HOST=127.0.0.1 --setenv=FLEET_STATUS_PORT=9000 \
  /home/vagrant/lef-plan16/node/bin/node /home/vagrant/lef-plan16/smtp/fixture.mjs'
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19000/last-peer
curl --fail --silent --show-error --max-time 5 -X PUT \
  -H 'Content-Type: application/json' -d '{"scenario":"target_accepted"}' \
  http://127.0.0.1:19000/scenario
```

Do not repeat the copy if the `smtp` directory already exists: stop the owned service and remove only its staged bundle
before restaging. The future entry point must resolve its test certificate files relative to this bundle. Readiness
also requires a trusted STARTTLS exchange and the expected listener bindings, not just a successful HTTP request.

The existing test files are `docker/smtp-dev/tls/smtp.crt`, `docker/smtp-dev/tls/smtp.key`, and
`docker/smtp-dev/tls/ca.crt`; the certificate covers `smtp.lef.test`. Application MX lookup and 3proxy target resolution
must both reach the verifier. The checked-in `docker/smtp-dev/coredns/lef.test.zone` currently points to `172.28.0.25`. Plan 16 must specify
temporary DNS for these two execution locations, a matching certificate, `SMTP_PORT=2525`, and
`SMTP_TLS_CA_FILE` pointing to the trusted fixture CA. Do not disable TLS validation or redirect unrelated DNS.
The `target_accepted` scenario rejects the fixed catch-all control before accepting the target, so it can prove
target verification. Use fresh disposable organization/domain state or reset only owned caches; changing only the
target address can leave a cached catch-all result.

**Future application scenario:** plan 16 must provide a focused runner using the existing application composition
and public module boundaries. It must check readiness for the database, Redis, OIDC, DNS, and trusted SMTP. It must then
start two verification processes, observe real allocation through reconciled members, and assert per-proxy and
per-MX limits. Normal completion and signals must clean up its owned processes and data. For reviewable lifecycle commands,
this proposal calls its staged executable `application-scenario.mjs`, with `check` and `run` modes:

```sh
# Future code, controller repository root, in the same namespace as the tunnel.
# LEF_APPLICATION_BUNDLE contains that reviewed runner and its packaged dependencies.
# LEF_APPLICATION_ENV is a mode-0600 Node environment file using existing application config keys.
cd "$LEF_REPO"
node --env-file="$LEF_APPLICATION_ENV" "$LEF_APPLICATION_BUNDLE/application-scenario.mjs" check
node --env-file="$LEF_APPLICATION_ENV" "$LEF_APPLICATION_BUNDLE/application-scenario.mjs" run
```

These commands are a proposed interface for the missing assertions, not evidence that such a runner already
exists. The runner must exit nonzero when a requested check is unavailable and stop its children on `SIGINT` or
`SIGTERM`. After an interrupted run, reconcile owned records and inspect outstanding leases before retrying.
Do not run the sequential peer-origin checks concurrently with the two-process capacity scenario.

## Proposed Guest-Side Alternative

If the owner selects guest-side execution, retain the peer/SMTP fixture and private status procedures above but
omit the controller tunnel. Stage a reviewed Linux x64 application bundle and the reconciler's source/dependencies
under `/home/vagrant/lef-plan16/app`. The bundle must include the real application runner just specified, a
`reconcile.mjs` entry point built from the existing reconcile CLI without behavior changes, an effective inventory
input supported by its `ansible-inventory` call, and access to an installed Ansible executable. Packaging and guest
Ansible availability are **future work**, not facilities supplied by Vagrant. Do not replace the allocator or SMTP
adapter with mocks to reduce these dependencies.

The guest environment must set `PROXY_FLEET_CREDENTIALS_DIR=/home/vagrant/lef-plan16/credentials` and
`PROXY_FLEET_M2M_CREDENTIALS_FILE=/home/vagrant/lef-plan16/m2m.json`, plus a guest-local inventory path. Transfer only
the two required node credential files and the scenario M2M file through captured SSH. These files belong to the
scenario and are removed with its guest directory; do not bundle them into a reusable application artifact.

Before selecting this option, the implementer must resolve private guest access to API, issuer, database, Redis,
and DNS, then put the exact endpoints in a guest environment file. Controller `localhost` values will not work in
the guest. Any additional SSH forwarding needs explicit loopback binding, readiness, ownership, and cleanup in
plan 16. This proposal does not approve wildcard service exposure or persistent networking changes.

```sh
# Future bundles, controller repository root; stage once into a fresh scenario directory.
: "${LEF_GUEST_BUNDLE:?Set the complete reviewed guest application bundle}"
: "${LEF_GUEST_ENV:?Set the private guest environment file}"
scp -r -F "$LEF_SSH" "$LEF_GUEST_BUNDLE" verifier-1:/home/vagrant/lef-plan16/app
ssh -F "$LEF_SSH" verifier-1 'mkdir -m 0700 /home/vagrant/lef-plan16/credentials'
scp -F "$LEF_SSH" "$PROXY_FLEET_CREDENTIALS_DIR/proxy-node-a.json" \
  "$PROXY_FLEET_CREDENTIALS_DIR/proxy-node-b.json" verifier-1:/home/vagrant/lef-plan16/credentials/
scp -F "$LEF_SSH" "$PROXY_FLEET_M2M_CREDENTIALS_FILE" verifier-1:/home/vagrant/lef-plan16/m2m.json
scp -F "$LEF_SSH" "$LEF_GUEST_ENV" verifier-1:/home/vagrant/lef-plan16/app.env
ssh -F "$LEF_SSH" verifier-1 'chmod 0600 /home/vagrant/lef-plan16/app.env /home/vagrant/lef-plan16/m2m.json /home/vagrant/lef-plan16/credentials/*.json'
# The guest environment uses http://127.0.0.1:9000/last-peer for reconciliation status.
ssh -F "$LEF_SSH" verifier-1 'cd /home/vagrant/lef-plan16/app && \
  ../node/bin/node --env-file=../app.env application-scenario.mjs check && \
  ../node/bin/node --env-file=../app.env reconcile.mjs'
# Future runner; bounded, named service owns both verification child processes.
ssh -F "$LEF_SSH" verifier-1 'sudo systemd-run --unit=lef-plan16-app --collect --wait \
  --property=Type=exec --property=RuntimeMaxSec=1h --uid=vagrant \
  --working-directory=/home/vagrant/lef-plan16/app \
  /home/vagrant/lef-plan16/node/bin/node --env-file=/home/vagrant/lef-plan16/app.env \
  /home/vagrant/lef-plan16/app/application-scenario.mjs run'
```

Readiness includes the same `.4` route checks, three healthy unchanged registry endpoints, fresh source observations,
and successful dependency checks. Complete sequential reconciliation before application clients start. A normal exit
must report the assertion results and leave no children. If the controller SSH connection is interrupted, the guest service can
continue; reconnect and run `sudo systemctl stop lef-plan16-app.service` through the captured verifier alias, verify
that the service and its children stopped, then inspect leases and owned records. The service time limit bounds an
abandoned process but does not replace explicit resource removal. Remove the staged bundle and environment during final cleanup.

## Proposed Final Cleanup and Recovery

For either model, stop application clients, drain the owned registry entries, and remove the remote stack as required
by plan 16 before dismantling access. Stop whichever of these exact units exists; a missing unit is a no-op only after
inspection establishes that no scenario process remains:

```sh
# Controller; inspect first, then stop the units present in this scenario.
ssh -F "$LEF_SSH" verifier-1 \
  'systemctl list-units --all "lef-plan16-*.service"'
ssh -F "$LEF_SSH" verifier-1 'sudo systemctl stop lef-plan16-app.service'
ssh -F "$LEF_SSH" verifier-1 'sudo systemctl stop lef-plan16-smtp.service'
ssh -F "$LEF_SSH" verifier-1 'sudo systemctl stop lef-plan16-peer.service'
ssh -F "$LEF_SSH" verifier-1 \
  'ss -ltn; if pgrep -af "[n]ode.* /home/vagrant/lef-plan16/"; then exit 1; fi'
ssh -F "$LEF_SSH" -S "$LEF_STATE/status.sock" -O exit verifier-1
```

Require no fixture listener, active unit, or owned child process. A missing control socket after an interrupted
forward is not proof that port 19000 is free: inspect the local listening process before terminating only the
scenario SSH master. Stop the foreground tunnel and compare its state as described above. Remove the guest files
only after processes have stopped:

```sh
ssh -F "$LEF_SSH" verifier-1 'rm -rf -- /home/vagrant/lef-plan16'
# Run plan 16's corrected guarded host reset using the captured SSH config before Vagrant destruction.
cd "$LEF_REPO/deploy/proxy-fleet/ansible"
ANSIBLE_SSH_COMMON_ARGS="-F $LEF_SSH" \
  ansible-playbook -i inventory/vagrant-lab.yml playbooks/reset.yml
cd "$LEF_REPO/deploy/proxy-fleet/vagrant"
vagrant destroy -f
vagrant status --machine-readable
# Only after inspecting the saved directory and completing the state comparisons:
case "$LEF_STATE" in /tmp/lef-fleet.*) test -d "$LEF_STATE" && rm -rf -- "$LEF_STATE" ;; *) exit 1 ;; esac
rm -- .vagrant/proxy-fleet/validation-state
```

Use the reset guide's guards and Vault inputs where required; never run the known-broken reset as proof of these
proposed outcomes. Also remove any separately staged credential, application, DNS, or certificate
artifacts owned by the scenario. Preserve unrelated inputs and `.vagrant/` until destruction is confirmed. If the
controller session is lost, recover the saved state directory from the ignored `validation-state` marker and inspect
Vagrant/SSH identity before resuming. If a guest is unreachable, preserve state and recover guest access or use
Vagrant's documented recovery before declaring cleanup complete. Do not erase the marker to hide incomplete work.

## Owner Decisions and Handoff Evidence

| Question | Repository evidence | Missing fact or choice | Responsible role and effect on plan 16 |
| --- | --- | --- | --- |
| Can the controller grant temporary firewall privileges for the tunnel? | No controller route lifecycle exists; Vagrant supplies SSH access only. | Available Python/`sshuttle`, Linux firewall backend, WSL behavior, conflicting routes, and permission to intercept the listed TCP destinations. | Project owner: accept this candidate or choose guest execution. Without this, the tunnel remains unselected. |
| Where will both real verification processes run? | The unchanged adapter dials registry hosts; Docker namespace coverage is not supplied. | Confirm same-namespace controller execution, or guest resources and private dependency transports. | Project owner: approve the execution environment. Plan-16 implementer: document and prove the exact process/dependency configuration. |
| Is the temporary verifier runtime acceptable? | No Node, Docker, or shared repository exists there. | Approved Node release/digest, guest user and systemd privileges, staging access, and cleanup window. | Project owner: select temporary Node staging or request a separately reviewed alternative. The probe cannot run until resolved. |
| How will full SMTP and application evidence run? | The peer probe closes after its greeting; the existing SMTP evidence fixture lacks private bindings and `/last-peer`. | Fixture entry point, trusted certificate, temporary DNS for application and proxies, packaged runner, rejection/capacity assertions, and signal cleanup. | Plan-16 implementer: replace future interfaces above with implemented, tested commands before live application mutation. |
| How will the worker boundary and routing be corrected? | Effective ACL is `.0/28`; WireGuard lacks egress sources and explicit routing; fixture admission is absent. | Confirm exact `.4/32` effective inventory, permitted SMTP sources, sentinel preservation, reset ordering and remote-manager guard. | Plan-16 implementer: correct and prove these requirements without widening access or changing registry endpoints. |

For the selected models, plan 16 must retain its complete acceptance list. This includes provisioning twice, denied
sources, unchanged unrelated firewall state, all three source observations, and real application allocation and
capacity. It also includes deployment and registry idempotency, draining, interruption recovery, guarded reset,
destruction, and an unchanged controller Swarm. Record sanitized evidence for preparation, readiness, success, rejection, normal cleanup, and
interruption. A proposal, successful port forward, or passed static test is not live fleet evidence.

## Primary Command References

Syntax was checked on 2026-09-14 against the following primary documentation; compatibility with the selected
controller and guest versions remains a plan-16 runtime check:

- The [sshuttle manual](https://sshuttle.readthedocs.io/en/stable/manpage.html) and
  [requirements](https://sshuttle.readthedocs.io/en/stable/requirements.html): destination/port selection, remote SSH
  command, Python prerequisites, local firewall privilege, and TCP session forwarding.
- [OpenSSH ssh](https://man.openbsd.org/ssh.1) and [SSH configuration](https://man.openbsd.org/ssh_config.5): captured configuration,
  forwarding through the loopback interface, explicit control sockets, connection liveness checks, and forwarding
  failure behavior.
- [Ubuntu 24.04 systemd-run](https://manpages.ubuntu.com/manpages/noble/man1/systemd-run.1.html): transient service
  naming, execution user, working directory, environment, lifetime properties, and collection.
- [Node binary verification](https://github.com/nodejs/node#verifying-binaries): signed checksums for a selected
  binary release. Archive verification is an input requirement, not a download performed for this proposal.
- [Docker SSH transport](https://docs.docker.com/engine/security/protect-access/): remote daemon access. This proposal
  uses explicit SSH commands with captured configuration and leaves automatic identity enforcement to plan 16.

Static validation commands and their actual results are recorded in plan 19. Bruno: not applicable — this handoff
changes documentation only and introduces no HTTP behavior.
