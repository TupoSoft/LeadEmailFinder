# Preserve Service Discovery When Enabling SMTP Fixtures

This living document follows `.agents/PLANS.md` and describes one infrastructure pull request.

## Purpose / Big Picture

A developer can add the SMTP overlay to a running base stack and repeat startup without losing the Redis,
PostgreSQL, Garage, or Keycloak service names. Existing development data survives the transition.

## Progress

- [x] 2026-09-16: Inspect the failed stack and identify missing service aliases after network replacement.
- [x] 2026-09-16: Choose a separate fixture network that leaves the base network configuration unchanged.
- [x] 2026-09-16: Add four topology contract tests and update startup and recovery instructions.
- [x] 2026-09-16: Recover the current stack with retained infrastructure containers; validate repeated startup, DNS, and SMTP.
- [x] 2026-09-16: Validate the isolated publication worktree with four topology tests, both Compose configuration checks,
  focused ESLint, documentation lint for all five changed Markdown files, and the diff whitespace check.

## Plan dependencies

None.

## Surprises & Discoveries

The failed DNS reset reports `Could not connect to Redis at redis:6379: Name does not resolve`, although Redis
responds to `PING` through its full container name. Reused infrastructure containers have null network aliases;
new overlay containers retain theirs. The original overlay replaces the default network with a fixed subnet.
Garage stores objects and metadata in its container filesystem, so removing that container would lose data.
The current default network already occupies the fixture subnet and needs a separate initial recovery.

## Decision Log

- 2026-09-16, Codex: Keep the default network unchanged. Place fixed fixture addresses on `smtp-dev`; attach
  API, CoreDNS, and proxy bootstrap to both networks. CoreDNS must retain access to Docker service discovery
  through its existing forwarding rule. DNS reset and cleanup need only the default network.
- 2026-09-16, Codex: Preserve existing infrastructure containers during local recovery. Replace only the damaged
  default network and reattach containers with their service aliases. Do not reset databases or remove volumes.
- 2026-09-16, Codex: Preserve fixture IP addresses, authentication, SMTP ports, and unpublished host ports.

## Outcomes & Retrospective

The dedicated network preserves the base configuration. Four automated topology checks pass. A disposable
Compose `5.5.0` project reproduced the original missing-alias failure after changing the default subnet. With the
new topology, base-to-overlay startup, repeated startup, and return to base all retained the Redis container,
default network, and service alias. Both disposable projects were removed afterward.

The existing checkout-owned stack was recovered by replacing only its damaged default network and restoring
service aliases. Infrastructure container IDs and mounts were retained, including Garage. Two overlay startup
commands completed successfully; DNS reset and proxy bootstrap exited zero. Redis, PostgreSQL, Garage, and
Keycloak resolve by service name. CoreDNS resolves the fixture MX and address records and forwards Redis queries.
Authenticated SOCKS5 plus trusted STARTTLS returned `250 OK`; the plaintext fixture correctly refused STARTTLS.
The public application health endpoint returns `status: ok`.

Bruno coverage changes are not applicable: this repair changes Docker service discovery below the HTTP boundary,
which the topology checks and live transport checks cover. The existing 47-request SMTP collection was not run;
it resets fixture balances and assumes fresh verification history. No application API behavior changed.
The retained fixed fixture subnet still permits only one such fixture network per Docker daemon. This existing
constraint remains outside the networking repair.

Publication validation used an isolated worktree based on `e4c1062`. The topology test command passed all four
tests. Both Compose configuration commands and `corepack pnpm exec eslint docker/smtp-dev/compose-network.test.mjs`
exited zero. The then-current documentation lint command passed all five files, and `git diff --check`
passed. The live results above came from the original checkout with identical Compose and test files;
publication validation did not start services or change the running stack.

## Context and Orientation

`docker/compose.yaml` includes `docker/infra.yaml`. Infrastructure uses the implicit default network. The SMTP
fixture in `docker/compose.smtp-dev.yaml` originally changes that network's address allocation, invalidating
existing attachments when Compose replaces it. The DNS reset must reach Redis before the API starts; Garage
and Keycloak also need their service names to resolve. CoreDNS serves fixed `lef.test` records and forwards other
queries to Docker DNS. The proxy's access rule allows the fixture subnet.

## Scope and Non-Goals

Change the overlay topology, add focused configuration tests, and update current startup documentation. Repair
and validate the owned local stack. Application logic, billing behavior, authentication fixtures, persistent
storage design, production deployment, and unrelated frontend changes remain outside this pull request.

## Plan of Work

Move the overlay address allocation definition to `smtp-dev` in `docker/compose.smtp-dev.yaml`. Connect fixture services there
and connect API, CoreDNS, and bootstrap to both networks. Add network contract tests under `docker/smtp-dev/`.
Update `README.md`, `docker/README.md`, and `bruno/smtp-dev/README.md` to enable the overlay without taking down the base stack.
Document the initial recovery for older networks separately. Validate a disposable base-to-overlay transition
and restore the existing checkout-owned stack without recreating infrastructure containers.

## Interfaces and Dependencies

The new project-scoped Docker network uses the existing fixture subnet `172.28.0.0/24`. No HTTP endpoint, response,
provider, application dependency, or authentication contract changes. Existing Bruno SMTP workflows remain
relevant as integration validation; their expected results do not change.

## Acceptance Criteria

- Base and overlay configurations produce the same default network definition and infrastructure attachments.
- Enabling the overlay and repeating startup preserve the default network and infrastructure container IDs.
- Redis, Garage, PostgreSQL, and Keycloak resolve by service name; fixture MX and address records still resolve.
- DNS reset and proxy bootstrap finish successfully, and the public application health endpoint responds.
- SMTP fixture ports remain unpublished, with the existing authenticated proxy and TLS behavior.
- Focused tests pass. Record any unavailable runtime validation explicitly.

## Validation

Run `node --test docker/smtp-dev/compose-network.test.mjs` for the topology contract. Validate both models with
`docker compose -f docker/compose.yaml config --quiet` and
`docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml config --quiet`.
Use a disposable Compose project to compare network and container identities across base, overlay, repeated
startup, and return to base. On the owned stack, run the overlay startup twice, inspect aliases and one-shot exit
codes. Check fixture DNS through the API and SMTP through the proxy. Request `http://localhost:53000/health`.
Run the existing SMTP Bruno collection when its isolated fixture prerequisites are available; do not reset the
user's balances to make it runnable.

## Idempotence and Recovery

Normal overlay startup is repeatable and no longer changes the default network. An older stack whose default
network already owns `172.28.0.0/24` requires initial network replacement before the dedicated network can exist.
Stop the owned containers, preserve their identities and Garage files, disconnect the old network, and recreate
the default network using the base model. Reattach retained containers with their service aliases before starting
the overlay. Never remove volumes or the Garage container during this data-preserving recovery. A disposable
stack may instead be taken down without `-v`, accepting loss of Garage's ephemeral object data.

## Artifacts and Notes

No synced issue exists for `development-compose/01` at implementation start; the exact marker search returned
no issues. No unrelated issue or project item is changed. This task remains separate from the UI work for issue 577.

## Plan readiness

Ready to implement
