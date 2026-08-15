# Build a fleet-capable 3proxy image

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Provide one immutable 3proxy image that can safely expose several authenticated HTTP CONNECT listeners on a proxy node. A developer can supply a listener manifest and credential secret, start the container, and observe that each listener accepts traffic only from configured worker CIDRs, connects only to configured SMTP ports, and originates through its declared egress IP.

## Progress

- [ ] 2026-08-15 — Define and validate the listener-manifest and credential contracts.
- [ ] 2026-08-15 — Build the pinned 3proxy runtime and deterministic configuration renderer.
- [ ] 2026-08-15 — Add container health and authenticated CONNECT smoke coverage.

## Surprises & Discoveries

- The merged local fixture uses one static SOCKS5 listener in `docker/smtp-dev/3proxy.cfg`. It proves the application path but does not model multiple host egress IPs or fleet secret handling.
- The socket library already supports authenticated HTTP CONNECT in `src/libs/socket/src/http-proxy-connect.ts`, and `ProxyProtocol.HTTP` already maps into the allocator. No application transport change is needed.

## Decision Log

- Decision: Use authenticated HTTP CONNECT for fleet listeners.
  Rationale: The application already supports it, 3proxy can bind each `proxy` service independently with `-i` and `-e`, and CONNECT ACLs can restrict destinations to SMTP ports.
  Date/Author: 2026-08-15, project planning.
- Decision: Use 3proxy 0.9.8 as the initial pinned version and resolve an immutable image digest during implementation.
  Rationale: It matches the validated local fixture while preventing mutable-tag drift in the fleet artifact.
  Date/Author: 2026-08-15, project planning.
- Decision: Keep listener topology non-secret and credentials in a separate file contract.
  Rationale: Swarm configs and inventory may safely describe topology, while usernames and passwords must not appear in manifests, generated stack files, logs, or source control.
  Date/Author: 2026-08-15, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`docker/compose.smtp-dev.yaml` runs `ghcr.io/3proxy/3proxy:0.9.8` with `docker/smtp-dev/3proxy.cfg`. That service is intentionally Docker-network-only and uses SOCKS5 credentials embedded in a local development file. Fleet-scale allocation is already represented by `Proxy` records in `src/proxy/src/proxy.entity.ts`; `TypeOrmProxyCandidateRepository` maps `ProxyProtocol.HTTP` to the HTTP adapter; and `ProxyAllocatorService` leases one active member at a time.

A fleet listener is the tuple `egressId`, private listener address, listener port, and external egress IP. The `egressId` is an inventory identity used by deployment tooling and descriptions; the current registry's stable runtime key remains its UUID.

## Scope and Non-Goals

Add `docker/proxy-fleet/Dockerfile`, an entrypoint/config renderer under `docker/proxy-fleet/`, a documented JSON listener-manifest schema, and a disposable container smoke harness. The image must support several listeners on one Linux host and must fail before starting 3proxy when configuration is invalid or a declared bind/egress IP is absent.

Do not modify the allocator, registry API, local SMTP overlay, database schema, Ansible, Swarm deployment, cloud networking, or production operations. Do not add a migration.

## Plan of Work

Build a dedicated image from the pinned upstream 3proxy runtime. Add only the minimal tools needed to validate JSON, inspect host addresses, render `/run/3proxy/3proxy.cfg`, and perform the health check. The entrypoint reads a read-only topology file and a read-only credential file, sets `umask 077`, validates both, writes the runtime configuration under `/run`, then `exec`s 3proxy.

Define the listener manifest at `/etc/lead-email-finder/proxy-fleet/listeners.json`. It contains `workerCidrs`, `allowedDestinationPorts`, and `listeners`. Each listener contains `egressId`, `bindIp`, `port`, `egressIp`, and `maxConnections`. Reject empty collections; duplicate egress IDs, bind-address/port pairs, or egress IPs; ports outside 1–65535; non-positive connection limits; and addresses that are not assigned to the host network namespace. Default destination ports are not inferred by the renderer: the manifest must explicitly include the intended SMTP ports.

Define `/run/secrets/proxy_credentials` as a line-oriented or JSON secret contract mapping each `egressId` to one username and password. Require a one-to-one match with the manifest. Render `auth strong`, users, source/destination ACLs, per-service `maxconn`, and one `proxy -n -a -i<bindIp> -e<egressIp> -p<port>` service per listener. Never print the rendered credential-bearing configuration.

Add a health command that confirms the 3proxy process is running and every declared private listener port accepts a TCP connection. Add a disposable smoke topology with temporary host addresses and a test SMTP endpoint. Prove an authenticated CONNECT reaches the allowed SMTP endpoint, missing or wrong credentials are rejected, a destination port outside the allowlist is rejected, and two listeners render distinct `-e` bindings.

## Interfaces and Dependencies

New files are limited to `docker/proxy-fleet/`, its smoke fixtures, and focused package scripts if needed. The manifest and credential schemas are the public deployment contracts consumed by plans 12 and 13.

This plan depends on the merged proxy allocation foundation through PR #311. It unlocks Ansible host provisioning and the Swarm reference deployment. It introduces no HTTP endpoint or application interface.

Reference behavior: 3proxy's `-i` selects the internal bind address, `-e` selects the external source address, and `maxconn` applies to each subsequently declared service. See the official [3proxy configuration reference](https://3proxy.org/doc/man3/3proxy.cfg.3.html).

## Acceptance Criteria

- Building the fleet image resolves 3proxy 0.9.8 through an immutable base-image digest.
- A valid two-listener manifest produces exactly two HTTP CONNECT services with the declared private bind addresses, ports, external egress IPs, and connection limits.
- Duplicate identities, endpoints, or egress IPs; invalid ports or limits; missing credentials; extra credentials; and host-unassigned addresses cause startup to exit nonzero before 3proxy starts.
- The runtime credential-bearing configuration is mode `0600` or stricter under `/run` and no credential appears in image layers, source-controlled fixtures, generated topology, or logs.
- A permitted worker with valid credentials can CONNECT to an allowlisted SMTP target through each listener.
- Missing or invalid credentials, a non-worker source, and a destination port outside the allowlist are rejected.
- Container health fails when any declared listener is unavailable.
- The existing ISP-safe local Compose fixture and application behavior remain unchanged.

## Validation

Run the renderer's focused unit tests and malformed-manifest table tests. Build the image with `docker build -f docker/proxy-fleet/Dockerfile -t lef-3proxy:test .`, inspect its resolved base digest, and run the disposable two-listener smoke harness. Exercise authorized and unauthorized CONNECT requests and the disallowed-port path. Then run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test:ci`, `corepack pnpm build`, and `git diff --check`.

## Idempotence and Recovery

Rendering the same manifest and credential input produces the same runtime configuration. Restarting the container is safe. Invalid input leaves no running 3proxy process. The smoke harness must remove only its named containers, networks, addresses, and temporary files. Recovery is to correct the manifest or secret and recreate the container; no data migration or backfill exists.

## Artifacts and Notes

Record the selected upstream digest, an example redacted manifest, the rendered non-secret listener summary, and smoke output proving allowed and denied behavior. Never record the credential file or full rendered configuration.

## Plan readiness

Ready to implement.
