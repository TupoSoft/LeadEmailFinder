# Add an ISP-safe local SMTP fixture

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Exercise DNS, proxy allocation, SOCKS5, and SMTP verification locally without outbound port 25. PR #310 delivered an opt-in Docker-only path where `person@lef.test` resolves through CoreDNS and verifies through 3proxy against accept-all Mailpit.

## Progress

- [x] (2026-08-13) Added internal CoreDNS, Mailpit, and authenticated 3proxy Compose services on SMTP port 2525.
- [x] (2026-08-13) Added idempotent proxy bootstrap/cleanup and a two-request OpenCollection smoke flow.
- [x] (2026-08-13) Corrected SOCKS5 transport defects, completed runtime validation, and merged PR #310.

## Surprises & Discoveries

- Observation: SOCKS5 domain targets, auth subnegotiation, caller-owned socket reuse, and response consumption were incomplete.
  Evidence: PR #310 added domain encoding, expected auth version `0x01`, reused the SMTP socket, consumed the full response address, and added focused socket tests.
- Observation: Leaving an active fixture proxy in persistent PostgreSQL after stopping the overlay would make the base stack select an unreachable endpoint.
  Evidence: The final overlay includes a profiled cleanup service that deletes the fixture record before shutdown.
- Observation: The overlay's fixed DNS address requires Compose to recreate the default network when switching from the running base stack.
  Evidence: Startup documentation stops the base stack before starting the overlay.

## Decision Log

- Decision: Keep the fixture opt-in, Docker-network-only, on SMTP port 2525, and accept all recipients.
  Rationale: It avoids ISP port-25 restrictions and validates application wiring without pretending to prove external deliverability.
  Date/Author: 2026-08-13, PR #310.
- Decision: Register the local SOCKS5 proxy through the authenticated admin API.
  Rationale: Development must exercise the same registry and allocator path as real endpoints.
  Date/Author: 2026-08-13, PR #310.
- Decision: Add explicit cleanup before Compose down.
  Rationale: Registry data persists beyond container lifecycle and must not retain an active unreachable development proxy.
  Date/Author: 2026-08-13, PR #310.

## Outcomes & Retrospective

PR [#310](https://github.com/TupoSoft/LeadEmailFinder/pull/310) merged as `20593c3`. The overlay publishes only the existing API port, bootstraps exactly one active local proxy, verifies `person@lef.test`, and removes its registry entry during documented cleanup. Socket fixes made the real SOCKS5 path usable.

## Context and Orientation

`docker/compose.smtp-dev.yaml` extends the base stack. CoreDNS serves the `lef.test` MX/A records, Mailpit listens internally on 2525, and 3proxy exposes an internal SOCKS5 listener. `docker/smtp-dev/bootstrap-proxy.sh` reconciles the registry. `bruno/smtp-dev` grants a credit and verifies the local address.

## Scope and Non-Goals

The completed PR added the local overlay, DNS zone, proxy config, bootstrap/cleanup, Bruno smoke collection, socket fixes, tests, and documentation. It did not expose SMTP/proxy ports, test real deliverability, change catch-all proxy behavior, add production infrastructure, or add a migration.

## Plan of Work

Compose the internal services on a private subnet, override API DNS and `SMTP_PORT`, wait for health, and reconcile one registry endpoint. Correct the SOCKS5 adapter so it can authenticate and connect to a domain target through the caller's socket without leaking proxy bytes into SMTP. Add cleanup and test the complete lifecycle.

## Interfaces and Dependencies

The overlay uses the existing `SMTP_PORT`, `/v1/proxies`, admin secret, credit endpoint, and verification endpoint. No new public API is introduced. This plan depended on PR #309 and supplied the runtime harness later extended by PR #311.

## Acceptance Criteria

- The base Compose configuration remains unchanged unless the overlay is explicitly selected.
- CoreDNS resolves `lef.test` to Mailpit and the API connects on port 2525 through exactly one registered SOCKS5 proxy.
- `person@lef.test` returns `accepted_email`, `catchAll: true`, and `targetExchange: smtp.lef.test`.
- SMTP, DNS, Mailpit, and proxy ports are not published to the host.
- Repeated bootstrap keeps exactly one fixture proxy; cleanup leaves zero fixture proxies.
- SOCKS5 authentication, domain addressing, socket reuse, and response parsing have focused regression tests.

## Validation

PR #310 recorded 41 Jest suites and 181 tests passing with one todo, seven focused socket tests, successful typecheck/build/lint with two unrelated existing warnings, Compose and shell validation, Bruno 2/2, the runtime CoreDNS-to-3proxy-to-Mailpit path, and zero-to-one-to-zero registry lifecycle evidence.

## Idempotence and Recovery

Bootstrap lists and updates the owned endpoint or creates it when absent. Cleanup is safe when no owned endpoint exists. If startup is interrupted, rerun the overlay; before returning to the base stack, run the profiled cleanup and then `down`. Persistent application data is preserved.

## Artifacts and Notes

Merged commit: `20593c3`. Primary paths: `docker/compose.smtp-dev.yaml`, `docker/smtp-dev`, `bruno/smtp-dev`, and `src/libs/socket/src/socks5-connect.ts`.

## Plan readiness

Completed in PR #310 (`20593c3`).
