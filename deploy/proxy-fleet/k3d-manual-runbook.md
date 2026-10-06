# Manually Test the Compose-Aligned Kubernetes Lab

Use this runbook to replay the focused SMTP feasibility experiment, inspect each phase, and save new evidence.
The baseline passed twice on 2026-10-01, including complete cluster deletion and recreation. The API image uses
source revision `206f2e742f5c2fff931faadd55695890fdca5d3a`; this procedure tests that snapshot rather than the current
checkout. Writing this runbook does not rerun the experiment.

The [fleet design](validation-decisions.md) describes the broader target. This runbook is maintained with
[plan 19](../../.agents/plans/proxy-fleet/19-prepare-fleet-validation-decisions.md).

## Scope and Prerequisites

This procedure requires the retained WSL feasibility harness. Its scripts, private generated resources, source
snapshot, tools, and image archive live outside Git. A fresh checkout does not contain them. If those artifacts are
missing, stop: portable Kubernetes packaging is still separate work. Do not substitute the existing
`proxy-fleet:deploy` or `proxy-fleet:reconcile` commands; they target Swarm and HTTP proxies.

Use the original WSL user and rootless Docker engine. The harness verifies the recorded engine ID and pins its
socket, cluster name, and kubeconfig. Work in one dedicated Bash terminal and keep it open through cleanup.
Only one operator may run this fixed-name lab at a time. Bash, Docker, Python 3, ripgrep, `ss`, and systemd must be
available. Cached k3d `v5.9.0` and kubectl `v1.35.5` binaries are supplied by the harness.

The cluster contains one server and three workers, using `rancher/k3s:v1.35.5-k3s1`. The creation script sets
`--servers-memory 2g` and `--agents-memory 4g`. The dedicated Docker subnet is `172.30.90.0/24` and the Kubernetes
API binds to `127.0.0.1:16551`; both must be available.

The retained image archive supplies the original API image, PostgreSQL `18-alpine`, Redis `alpine`, Keycloak
`26.7.0`, 3proxy `0.9.8`, Node `24-alpine`, and Mailpit `v1.30.7`. Runtime comparison also requires the original
`lef-k3d-proof-api:206f2e7` image in host Docker. Importing the archive into cluster nodes does not supply that
host image. Reuse the recorded images; replacing mutable tags changes the tested baseline.

The application-facing contract follows Compose: SOCKS5, the unchanged STARTTLS evidence server, plaintext
Mailpit, and the original CA and certificates. The placement and listener ports adapt to the three-identity lab:

| Worker | Role | Endpoint | Expected SMTP source |
| --- | --- | --- | --- |
| Agent A | Proxy, listener 1 | `172.29.10.2:13001` | `198.18.0.21` |
| Agent A | Proxy, listener 2 | `172.29.10.2:13002` | `198.18.0.22` |
| Agent B | Proxy, listener 3 | `172.29.10.3:13001` | `198.18.0.23` |
| Agent C | Application and TLS fixture | `172.29.10.4:2525` | Application connections originate from `.4` |
| Agent C | Plaintext fixture | `172.29.10.5:2525` | Reachable through the three proxies |

## 1. Select the Harness and Start a New Evidence Directory

The default below names the retained experiment under the current user's home directory. Set
`LEF_COMPOSE_LAB` to the existing child directory; its parent directory and symlinks must also be available.

```bash
set -euo pipefail
umask 077
export LEF_COMPOSE_LAB="$HOME/.cache/codex/lef-k3d-feasibility-20260929-oFbAcA/compose-aligned"
test -d "$LEF_COMPOSE_LAB"
source "$LEF_COMPOSE_LAB/env.sh"
assert_engine
test "$DOCKER_HOST" = "unix:///run/user/$(id -u)/docker.sock"

for lef_tool in docker python3 rg ss systemctl; do
  command -v "$lef_tool" >/dev/null
done
for lef_tool in k3d kubectl; do
  test -x "$LEF_COMPOSE_LAB/bin/$lef_tool"
done
for lef_file in create-cluster.sh import-images.sh cleanup.sh verify-runtime.sh \
  network/bootstrap.sh network/render.py network/run.sh network/switch-fixtures.sh \
  app/run-phase.sh app/audit-plaintext.py app/coredns-custom.yaml \
  app/resources.json app/fixture.json network/listeners.json fixtures/resources.json \
  fixtures/provenance.json images-amd64.tar; do
  test -r "$LEF_COMPOSE_LAB/$lef_file"
done
test -d "$LEF_COMPOSE_LAB/source"
lef_api_image_id=$(docker image inspect lef-k3d-proof-api:206f2e7 --format '{{.Id}}')
test "$lef_api_image_id" = 'sha256:aff0cd97346a3cef1eb89285267feee96f1034af39d3cab08f979958c8bc7a6d'

LEF_MANUAL_RUN=$(mktemp -d "$LEF_COMPOSE_LAB/runs/manual-XXXXXXXX")
export LEF_MANUAL_RUN
date -u +%FT%TZ > "$LEF_MANUAL_RUN/started-at.txt"
printf '%s\n' "$LEF_MANUAL_RUN"

lef_manual_phase() {
  local lef_phase_name="$1"
  shift
  "$@" 2>&1 | tee "$LEF_MANUAL_RUN/$lef_phase_name.log"
}
lef_assert_cluster() {
  assert_engine
  test "$(k get namespace kube-system -o jsonpath='{.metadata.uid}')" = \
    "$(cat "$LEF_COMPOSE_LAB/evidence/cluster-uid.txt")"
  for lef_role in server-0 agent-0 agent-1 agent-2; do
    assert_node "k3d-$LEF_CLUSTER-$lef_role"
  done
}
```

**Pass:** every prerequisite succeeds and a new `manual-...` directory is printed. The `k` function always selects
the child cluster's dedicated context. Sourcing the environment also changes Docker and configuration variables;
use this terminal only for the lab. A failed phase stops the shell through `errexit` and `pipefail`. Its new log
remains available for diagnosis. Reopen a dedicated terminal and restore these definitions if interrupted.

All phase output goes into the new directory. Existing `runs/run1` and `runs/run2` retain the original proof.
Do not use `capture-run.sh` for a replay: it accepts only those two existing names. Old success messages in
`evidence/` do not count as evidence for a new attempt.

## 2. Verify Rootless Docker Controller Delegation

```bash
lef_controllers="/sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/docker.service/cgroup.controllers"
cat "$lef_controllers"
rg -qw cpuset "$lef_controllers"
```

**Pass:** the Docker service's controller list includes `cpuset`. Checking only the parent user service is
insufficient; the controller must reach Docker's cgroup.

If it is missing, apply the proven temporary override in a separate terminal, then repeat this step:

```bash
lef_delegate_dir="/run/systemd/system/user@$(id -u).service.d"
sudo mkdir -p "$lef_delegate_dir"
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' |
  sudo tee "$lef_delegate_dir/90-lef-k3d-delegate.conf" >/dev/null
sudo systemctl daemon-reload
systemctl --user daemon-reexec
systemctl --user daemon-reload
```

This grants controller delegation rather than setting limits. It expires on reboot. The user-manager
re-execution propagated the controllers without restarting Docker. The earlier `systemctl set-property`
command failed for this loaded user unit; use the override above.

## 3. Check Reservations and Record Existing Workloads

```bash
assert_engine
if docker network inspect "k3d-$LEF_CLUSTER" >/dev/null 2>&1; then
  printf 'An existing lab network needs inspection before creation.\n' >&2
  exit 1
fi
lef_existing_containers=$(docker ps -aq --filter "label=k3d.cluster=$LEF_CLUSTER")
test -z "$lef_existing_containers"
lef_api_listeners=$(ss -H -ltn 'sport = :16551')
test -z "$lef_api_listeners"

python3 - <<'PY_NETWORKS'
import ipaddress
import json
import subprocess

reserved = ipaddress.ip_network('172.30.90.0/24')
ids = subprocess.check_output(['docker', 'network', 'ls', '-q'], text=True).split()
networks = json.loads(subprocess.check_output(['docker', 'network', 'inspect', *ids])) if ids else []
for network in networks:
    for config in network.get('IPAM', {}).get('Config', []):
        subnet = config.get('Subnet')
        if subnet:
            existing = ipaddress.ip_network(subnet, strict=False)
            if existing.version == 4 and existing.overlaps(reserved):
                raise SystemExit(f"Reserved subnet overlaps Docker network {network['Name']}: {subnet}")
print('Reserved Docker subnet is available.')
PY_NETWORKS

docker ps --format '{{.ID}} {{.Names}}' | sort > "$LEF_MANUAL_RUN/containers-before.txt"
cp "$LEF_MANUAL_RUN/containers-before.txt" \
  "$LEF_COMPOSE_LAB/evidence/containers-before-20261001.txt"
```

**Pass:** no same-name lab containers or network, no API-port listener, and no overlapping Docker subnet exist.
The baseline is captured before lab creation. The dated destination filename is required by the existing cleanup
script; the new archive keeps this run's copy. Do not change it during a run to hide a cleanup difference.

## 4. Create the Cluster and Import Images

```bash
lef_manual_phase cluster-create bash "$LEF_COMPOSE_LAB/create-cluster.sh"
lef_assert_cluster
cp "$LEF_COMPOSE_LAB/evidence/cluster-uid.txt" "$LEF_MANUAL_RUN/cluster-uid.txt"
cp "$LEF_COMPOSE_LAB/evidence/owned-containers.txt" "$LEF_MANUAL_RUN/owned-containers.txt"
lef_manual_phase image-import bash "$LEF_COMPOSE_LAB/import-images.sh"
k get nodes -o wide
```

**Pass:** four Kubernetes nodes are `Ready`, each worker has its intended `lef.lab.role`, and image import
succeeds on all three workers. The Docker load-balancer container is an additional owned container, not a fifth
Kubernetes node. Record the new cluster UID before applying resources. A partially created cluster needs the
interruption procedure below rather than another creation attempt.

## 5. Configure Addresses, Routes, and Firewall Rules

```bash
lef_assert_cluster
lef_manual_phase network-bootstrap bash "$LEF_COMPOSE_LAB/network/bootstrap.sh"
```

**Pass:** the output shows the expected aliases on each node. Routes from Agent C to the proxy endpoints select
source `172.29.10.4`; return routes reach all three egress identities. The owned firewall chains allow the
application source to the listeners and only the proxy egress sources to SMTP. The script discovers actual bridge
addresses instead of reusing addresses from an earlier cluster. These changes occur inside the disposable nodes.

## 6. Deploy DNS, Proxies, Clients, and Application Dependencies

```bash
lef_assert_cluster
lef_manual_phase dns-apply k apply -f "$LEF_COMPOSE_LAB/app/coredns-custom.yaml"
lef_manual_phase dns-restart k -n kube-system rollout restart deployment/coredns
lef_manual_phase dns-ready k -n kube-system rollout status deployment/coredns --timeout=120s
lef_dns_ip=$(k -n kube-system get service kube-dns -o jsonpath='{.spec.clusterIP}')
lef_manual_phase network-render python3 "$LEF_COMPOSE_LAB/network/render.py" "$lef_dns_ip"
lef_manual_phase network-apply k apply -f "$LEF_COMPOSE_LAB/network/resources.json"
lef_manual_phase application-apply k apply -f "$LEF_COMPOSE_LAB/app/resources.json"
k -n lef-proof get pods -o wide
```

**Pass:** child-cluster DNS is ready, resources apply successfully, and workloads have their declared placement.
The node containers already have their addresses before the proxy pods start. PostgreSQL, Redis, Keycloak, and
API workloads use only disposable lab state. Generated manifests contain credentials; do not copy them into
Git or the evidence archive.

## 7. Prove Proxy Sources and Rejections

```bash
lef_assert_cluster
lef_manual_phase network-checks bash "$LEF_COMPOSE_LAB/network/run.sh"
```

**Pass:** the first and final positive passes report fresh observations of `.21`, `.22`, and `.23`, matching the
table above, with SMTP banners and application source `.4`. Missing, wrong, and cross-listener credentials fail;
forbidden hostnames and port `2526` receive SOCKS policy denial code `2`. Rejected attempts leave peer observations
unchanged. Other-node and ordinary-pod clients fail before establishing proxy TCP connections, and owned firewall
rejection counters increase. Port `9000` is inaccessible through node aliases and bridge addresses.

Keep the probe running for this step and registration. Its HTTP status endpoint is on Agent C's localhost;
a fetch from the WSL host's localhost does not reach it. No-authentication method negotiation alone is not an
access test: the checker continues to SOCKS CONNECT and requires rejection there if negotiation succeeded.

## 8. Wait for the Application and Check Its Runtime

```bash
lef_assert_cluster
for lef_app in proof-postgres proof-redis proof-keycloak proof-api; do
  lef_manual_phase "ready-$lef_app" k -n lef-proof rollout status \
    "deployment/$lef_app" --timeout=180s
done
lef_manual_phase runtime-integrity bash "$LEF_COMPOSE_LAB/verify-runtime.sh"
cp "$LEF_COMPOSE_LAB/evidence/expected-transport-hashes.txt" "$LEF_MANUAL_RUN/"
cp "$LEF_COMPOSE_LAB/evidence/actual-transport-hashes.txt" "$LEF_MANUAL_RUN/"
```

**Pass:** all four Deployments are ready and the running API's HTTP and SOCKS5 transport hashes match the original
host image. This replay uses no HTTP transport correction from the earlier experiment.

## 9. Bootstrap Authentication and Register SOCKS5 Listeners

```bash
lef_assert_cluster
lef_manual_phase app-bootstrap bash "$LEF_COMPOSE_LAB/app/run-phase.sh" bootstrap
lef_manual_phase app-register bash "$LEF_COMPOSE_LAB/app/run-phase.sh" register
```

**Pass:** real Keycloak provisioning succeeds. Registration creates three disabled protocol-`3` entries, checks
actual SOCKS5 connections and fresh source observations, then activates all three. Its built-in second pass has
`secondMutations: []`, preserves the registry, and observes all three sources again. Evidence must identify
`fleetHttpReconcilerExercised: false`.

Use `smtp.lef.test` as the probe destination, matching the named-target policy. Substituting its numeric IP is
rejected. This fixture bootstrap reuses the API and OIDC adapters; it does not exercise the existing HTTP fleet
reconciler. It requires an empty disposable registry at entry. Do not rerun `bootstrap` or `register` against a
completed or partially seeded run. Archive the failure and recreate the owned cluster for a clean attempt.

## 10. Switch to Compose SMTP Fixtures and Check Their Privacy

```bash
lef_assert_cluster
lef_manual_phase fixture-privacy bash "$LEF_COMPOSE_LAB/network/switch-fixtures.sh"
```

**Pass:** the peer pod terminates and its ports `2525` and `9000` close before the SMTP fixtures start. The unchanged
Compose evidence server provides STARTTLS on `.4:2525`; Mailpit provides plaintext SMTP on `.5:2525`. Local controls
return HTTP `200` on ports `8025` and `8026`. All 18 checks through node aliases or bridge addresses fail.

This transition is one-way within a run. Do not apply the peer resources again or repeat earlier source checks
after switching fixtures. The script does not support a second invocation against an already removed peer pod.

## 11. Send Real Verification Requests and Audit Plaintext Behavior

```bash
lef_assert_cluster
lef_manual_phase app-verify bash "$LEF_COMPOSE_LAB/app/run-phase.sh" verify
k -n lef-proof logs deployment/proof-api > "$LEF_MANUAL_RUN/api-private.log"
chmod 0600 "$LEF_MANUAL_RUN/api-private.log"
lef_manual_phase plaintext-audit python3 "$LEF_COMPOSE_LAB/app/audit-plaintext.py" \
  --verify "$LEF_MANUAL_RUN/app-verify.log" --logs "$LEF_MANUAL_RUN/api-private.log"
```

**Pass:** six real API requests complete using real OIDC, PostgreSQL, and Redis. Each endpoint handles one request
to each fixture. The runner selects only the intended proxy, checks its Redis lease, clears the throwaway SMTP
cache, and reads fresh persisted verification evidence.

| Case, once through each listener | Required result |
| --- | --- |
| Compose STARTTLS fixture | `accepted_email`, `catchAll: true`, and persisted `secureTransport: true` |
| Plaintext Mailpit | `secure_transport_unavailable`, `catchAll: null`, and persisted `secureTransport: false` |

The TLS fixture's connection counter increases from `0` to `3`. All six results settle with zero charge as
inconclusive results. The plaintext audit must report `passed: true` and exactly one `EHLO` for each of its three
requests, with no `MAIL FROM`, `RCPT TO`, or `DATA`. The accept-all fixture proves transport and integration;
it does not establish a deliverable non-catch-all mailbox. The runner resets the TLS fixture and checks for at
least three new connections. Use a fresh cluster for each complete proof attempt so earlier changes to credentials,
registry entries, caches, and fixture state cannot be mistaken for independent recreation evidence.

## 12. Save Evidence and Remove the Owned Cluster

```bash
lef_assert_cluster
k get nodes -o wide > "$LEF_MANUAL_RUN/nodes.txt"
k -n lef-proof get pods -o wide > "$LEF_MANUAL_RUN/pods.txt"
cp "$LEF_COMPOSE_LAB/fixtures/provenance.json" "$LEF_MANUAL_RUN/fixture-provenance.json"
printf '%s\n' '206f2e742f5c2fff931faadd55695890fdca5d3a' > "$LEF_MANUAL_RUN/source-commit.txt"
printf 'All new manual test phases passed.\n' > "$LEF_MANUAL_RUN/test-result.txt"
lef_manual_phase cleanup bash "$LEF_COMPOSE_LAB/cleanup.sh"
cp "$LEF_COMPOSE_LAB/evidence/containers-after-cleanup.txt" "$LEF_MANUAL_RUN/containers-after.txt"
printf 'Owned cluster removed; workload baseline matched.\n' > "$LEF_MANUAL_RUN/cleanup-result.txt"
printf 'New evidence: %s\n' "$LEF_MANUAL_RUN"
```

**Pass:** guarded cleanup removes the owned cluster, its containers, network, and image volume. The preexisting
running Docker workload baseline matches. Cached images, harness files, and evidence remain for another run.

The raw `api-private.log` is private diagnostic material. Share only the new phase logs, snapshots, hashes,
fixture provenance, and result files after reviewing them; exclude that raw log. Never include the kubeconfig,
Secret manifests, credentials, or TLS private keys in shared evidence. The original two archives remain untouched.

## 13. Prove Recreation

After successful cleanup, open a new dedicated terminal and repeat steps 1 through 12. This creates another
unique evidence directory. Do not call both the manual sequence and `run.sh` in the same run. The wrapper already
performs creation, deployment, and the tests, and it overwrites the working evidence files.

Set the two completed archive paths below, then compare their identities:

```bash
export LEF_FIRST_RUN=/absolute/path/to/first/manual-archive
export LEF_SECOND_RUN=/absolute/path/to/second/manual-archive
python3 - <<'PY_REPEAT'
import json
import os
from pathlib import Path

first = Path(os.environ['LEF_FIRST_RUN'])
second = Path(os.environ['LEF_SECOND_RUN'])

def phase(run, name):
    records = [json.loads(line) for line in (run / f'app-{name}.log').read_text().splitlines()
               if line.lstrip().startswith('{')]
    matches = [record for record in records if record.get('phase') == name]
    assert len(matches) == 1, f'Expected one {name} result in {run}'
    return matches[0]

for run in (first, second):
    assert (run / 'test-result.txt').is_file()
    assert (run / 'cleanup-result.txt').is_file()
    registered = phase(run, 'register')
    assert len(registered['registry']) == 3
    assert registered['secondMutations'] == []
    assert registered['fleetHttpReconcilerExercised'] is False
    verified = phase(run, 'verify')
    assert sum(len(item['results']) for item in verified['results']) == 6

assert first.joinpath('cluster-uid.txt').read_text() != second.joinpath('cluster-uid.txt').read_text()
proxy_ids = lambda run: {item['id'] for item in phase(run, 'register')['registry']}
request_ids = lambda run: {result['requestId'] for item in phase(run, 'verify')['results']
                           for result in item['results']}
assert len(request_ids(first)) == len(request_ids(second)) == 6
assert proxy_ids(first).isdisjoint(proxy_ids(second))
assert request_ids(first).isdisjoint(request_ids(second))
print('Two complete runs passed with fresh cluster, proxy, and request identities.')
PY_REPEAT
```

**Pass:** both runs passed independently, cleaned up successfully, and have different cluster identifiers, proxy IDs,
and verification request IDs. The original baseline's redacted results are under `runs/run1` and `runs/run2`;
its `REPORT.md` records the completed 2026-10-01 outcomes. New results belong only to the new archive directories.

## Troubleshooting and Interrupted Runs

Stop at the first failed phase and retain its new log. For an existing complete cluster, restore only the environment
and helper definitions from step 1, then set `LEF_MANUAL_RUN` to the failed run's original directory.
Do not create a new archive or overwrite the baseline while diagnosing that attempt. Use these inspection commands:

```bash
assert_engine
k get nodes -o wide
k -n lef-proof get pods -o wide
k -n lef-proof get events --sort-by=.metadata.creationTimestamp
```

| Symptom | Action |
| --- | --- |
| Engine assertion fails | Check the selected Docker socket and recorded engine. Do not replace the recorded ID or switch to another daemon to bypass the guard. |
| Missing `cpuset` or node creation times out | Verify the Docker cgroup, restore the runtime delegation, and inspect partial creation before retrying. |
| Existing cluster, network, reserved port, or overlapping subnet | Inspect the resource and the prior attempt; do not create another run on top of it. |
| `ErrImageNeverPull` | Check node imports and pinned archive contents. Runtime comparison additionally needs the host API image. |
| Proxy address validation fails or clients cannot connect | Check node aliases, preferred-source routes, return routes, and owned firewall chains. Scheduling alone supplies none of them. |
| Registration rejects a numeric destination | Preserve `smtp.lef.test`; the named destination ACL is intentional. |
| Registration finds existing records or fixture switching finds no peer pod | The phase has already changed state. Save evidence and start again on a fresh cluster. |
| Local fixture controls work but host localhost fails | Run the checks in Agent C's client pod; the endpoints belong to that node's network namespace. |
| Plaintext audit fails | Keep the private API log, inspect the request-correlated commands, and treat the test as failed. |
| Lab removal succeeds but its final baseline comparison fails | Inspect `containers-after-cleanup.txt` and the initial baseline. Unrelated workloads may have changed during the run; do not prune them to make the comparison pass. |

The normal cleanup script requires all four correctly labeled node containers and a reachable control plane with
the saved cluster UID. If those checks pass after a failed test, use the same guarded cleanup command from step 12
and archive its result before recreating the lab. Do not write a passing test marker for that failed run.

If creation failed before recording the UID, or the control plane is unavailable, the normal cleanup script is
not applicable. Query the selected engine for the reserved cluster's containers, names, labels, and network:

```bash
assert_engine
docker ps -a --filter "label=k3d.cluster=$LEF_CLUSTER" \
  --format '{{.ID}} {{.Names}} {{.Labels}}'
docker network inspect "k3d-$LEF_CLUSTER" --format '{{.Id}} {{json .Containers}}'
```

Compare those resources with this run's creation log, start time, and any recorded ownership snapshot. Establish
that they belong to this attempt before performing a targeted recovery or deletion. A matching name alone is
insufficient. Keep the failed attempt and original archives; never use a broad Docker prune or reset unrelated
Kubernetes contexts to recover this lab.

## Coverage Boundary

A successful run proves three authenticated SOCKS5 endpoints with distinct observed sources, access rejection,
private fixture controls, real application registration, zero-mutation second-pass registration, verified TLS,
plaintext rejection, and fresh-cluster repeatability. The API's transport matches the recorded original image.

The existing HTTP fleet reconciler is not exercised. Capacity, removed-listener draining, node-failure recovery,
asynchronous workers, browser flows, object storage, and the complete Compose stack remain separate validation.
The ephemeral Keycloak development database also differs from the full Compose storage layout. These results do
not satisfy the existing Swarm, WireGuard, or Vagrant acceptance criteria in plan 16 or issue #424.
