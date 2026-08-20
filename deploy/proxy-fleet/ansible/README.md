# proxy-fleet Ansible provisioning

Provisions disposable Ubuntu 24.04 LTS proxy nodes: Docker Engine, WireGuard, host firewall policy,
Docker Swarm membership and labels, and the node-specific plan-11 listener manifest. See
`.agents/plans/proxy-fleet/12-ansible-proxy-node-provisioning.md` for the full ExecPlan.

This is the first piece of infrastructure-as-code in this repository. It does not start 3proxy or
deploy any Swarm service -- that is plan 13's job, consuming this plan's rendered artifacts (see
"Handoff to plan 13" below).

## Local tooling setup

Ansible is a Python toolchain, installed independently of this repo's Node/pnpm toolchain (same
reasoning as keeping `docker/proxy-fleet/render-config.sh` in shell rather than porting it to
TypeScript -- see plan 11):

```sh
uv tool install ansible-core --with ansible
uv tool install ansible-lint
ansible-galaxy collection install -r requirements.yml
```

This exposes `ansible`, `ansible-playbook`, `ansible-inventory`, `ansible-galaxy`, `ansible-vault`,
and `ansible-lint` on `PATH` (via `~/.local/bin`), and pulls in the pinned `community.general`
collection used by the firewall role.

## Building a real inventory from the example

`inventory/example.yml` is tracked and contains only documentation placeholders and unroutable
RFC 5737 example addresses (`192.0.2.0/24` / `198.51.100.0/24` / `203.0.113.0/24`). To provision a
real fleet:

1. Copy `inventory/example.yml` to a real (untracked, or tracked in a private inventory repo)
   inventory file and replace the placeholder hostnames/addresses.
2. For each host, generate a WireGuard keypair (`wg genkey | tee private.key | wg pubkey >
   public.key`). Add the public key as a plain inventory var (`wireguard_public_key`) in
   `inventory/host_vars/<hostname>/vars.yml`, referencing the private key from Vault:
   ```yaml
   # inventory/host_vars/<hostname>/vars.yml
   wireguard_public_key: "<public key>"
   wireguard_private_key: "{{ vault_wireguard_private_key }}"
   ```
3. Create that host's vault file and encrypt it:
   ```sh
   ansible-vault create inventory/host_vars/<hostname>/vault.yml
   ```
   with content:
   ```yaml
   vault_wireguard_private_key: "<private key>"
   vault_proxy_credentials:
     <egressId>:
       user: "<egressId>"
       pass: "<random password>"
   ```
   `vault_proxy_credentials` must have exactly one entry per `proxy_listeners[].egressId` declared
   for that host -- `roles/proxy_topology` fails closed otherwise.
4. Never set `vault_password_file` in `ansible.cfg` (it isn't, deliberately -- see the comment
   there). Pass `--vault-password-file <path>` or set `ANSIBLE_VAULT_PASSWORD_FILE` per run instead.

## Running

```sh
ansible-playbook -i inventory/<your-inventory>.yml playbooks/proxy-fleet.yml --vault-password-file <path>
```

Preview first with `--check --diff`. A second normal apply against an already-converged fleet should
report `changed=0` for every host.

### Guarded reset (lab only)

`playbooks/reset.yml` removes everything the roles above created -- **only** on hosts that are both
(a) in an explicit `lab_reset` inventory group and (b) have `proxy_fleet_allow_reset: true` set. It
is never runnable against the tracked example inventory. See `roles/proxy_fleet_reset` for exactly
what is and is not removed, including the assumption it makes about lab hosts having no
independently-managed firewall rules.

## Validation

```sh
ansible-lint .
ansible-inventory -i inventory/example.yml --list
ansible-playbook -i inventory/example.yml --syntax-check playbooks/proxy-fleet.yml
ansible-playbook -i inventory/example.yml --syntax-check playbooks/reset.yml
sh scripts/check-no-plaintext-secrets.sh
```

None of the above touch a live host. Applying to a real host (Docker/WireGuard/firewall install,
Swarm init/join, the guarded reset) requires a disposable Ubuntu 24.04 target and is not exercised by
these commands -- see the ExecPlan's Outcomes & Retrospective for exactly what was and wasn't
verified live when this plan was implemented.

## Handoff to plan 13

On each `proxy_nodes` host, after a successful apply:

- The plan-11-shaped listener manifest is at `/etc/lead-email-finder/proxy-fleet/listeners.json`
  (mode 0644) -- matches plan 11's container default path exactly, ready to bind-mount read-only.
- The per-node credentials are staged at `/var/lib/lead-email-finder/proxy-fleet/credentials.json`
  (root-only, mode 0600) -- **not** the same path plan 11's container reads at runtime
  (`/run/secrets/proxy_credentials`). Plan 13 should read this staging path when constructing each
  node's Swarm secret; plan 12 never creates the runtime path and never starts a container.
- Each `proxy_nodes` host carries Swarm labels `proxy.egress=true` and
  `proxy.node-id=<proxy_node_id>`, settable as a placement constraint.
