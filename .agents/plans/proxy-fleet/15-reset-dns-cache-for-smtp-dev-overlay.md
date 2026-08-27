# Reset the DNS Cache Before Starting the SMTP Development Overlay

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Starting `docker/compose.smtp-dev.yaml` after the base stack cached a DNS answer for the same hostname must not
serve that stale answer. Each fresh `smtp-dev` overlay startup now clears the shared DNS cache namespace before
the API can serve requests. The fixture MX record for `lef.test` is then resolved through CoreDNS instead of
coming from the base stack cache.

A developer can observe the fix by first letting the base stack cache an empty DNS answer for `lef.test`. After
switching to the `smtp-dev` overlay without deleting volumes, the first `bruno/smtp-dev` verification succeeds
instead of failing with `no_mx_records`.

## Progress

- [x] (2026-08-27 16:38 +02:00) Add a one-shot cache-reset step to the `smtp-dev` overlay's Compose definition.
- [x] (2026-08-27 16:38 +02:00) Sequence it ahead of the API and `smtp-dev-proxy-bootstrap`, and document the
  guarantee.
- [x] (2026-08-27 16:47 +02:00) Seed the stale `DNS_CACHE:MX:lef.test` value, run the final reset service through
  Compose, and pass the complete `bruno/smtp-dev` collection on the first attempt.

## Plan Dependencies

None.

## Surprises & Discoveries

- Found live, not assumed: `DnsService` (`src/libs/dns/src/dns.service.ts`) caches every record it resolves in
  Redis for `DnsService.DEFAULT_TTL_SECONDS` (1 day) under a key of exactly `DNS_CACHE:<type>:<name>` —
  the key carries no information about which DNS resolver produced the answer.
- The base stack (`docker/compose.yaml`) and the `smtp-dev` overlay (`docker/compose.yaml -f
  docker/compose.smtp-dev.yaml`) are mutually exclusive but **share the same named `lef_redis-data` volume**
  and are conventionally brought up with a plain `docker compose down` (no `-v`) between switches, per every
  existing collection README in this repo. The overlay resolves `lef.test` via a local CoreDNS fixture
  (`docker/smtp-dev/coredns/lef.test.zone`, MX -> `smtp.lef.test`); the base stack resolves it via whatever
  the host's Docker daemon forwards to (real public DNS, where `lef.test` has no records).
  The direct reproduction started with the base stack, which cached `DNS_CACHE:MX:lef.test = []` with a ~24h
  TTL. After switching to the `smtp-dev` overlay without deleting volumes, `POST /verify` for
  `person@lef.test` returned `reason: "no_mx_records"`. CoreDNS still resolved the record correctly when tested
  with `nslookup -type=MX lef.test` inside the `api` container. Deleting the stale Redis key made the next
  request resolve and verify correctly.
- This defect appears only when two mutually exclusive development Compose profiles answer differently for the
  same hostname while sharing persistent cache state. Production has one DNS resolution path, so this is a gap
  in the disposable development workflow rather than a `DnsService` defect. Production changes to `DnsService`
  or `DnsModule` are therefore out of scope.
- A direct `redis-cli --scan | xargs redis-cli del` pipeline can hide a failed scan under `sh -e` because the
  shell reports the status of `xargs`. Capturing the scan output first preserves the scan exit status, so a
  transient Redis failure prevents dependent services from starting.
- Compose interpolates a single-dollar shell variable before the container starts. The entry point must use
  `$$keys` so the rendered command contains `$keys` for the container shell.

## Decision Log

- Decision: Fix this in the Compose and tooling layer of `smtp-dev` with a one-shot reset step. Do not change
  the cache-key shape in `DnsService` or add a configurable cache namespace.
  Rationale: Two Compose profiles share one Redis volume in the disposable development stack. Teaching
  production code about that collision would add configuration that no real deployment needs.
  Date/Author: 2026-08-22, source-audit finding from a full end-to-end pass.
- Decision: Clear the whole `DNS_CACHE:*` namespace, not only entries for `lef.test`.
  Rationale: The CoreDNS fixture in the overlay is authoritative for every hostname resolved while the overlay
  runs. Every answer cached before startup is therefore untrustworthy. A namespace-wide `SCAN` plus `DEL` is
  equally safe and simpler than hostname-specific pruning.
  Date/Author: 2026-08-22, source-audit finding from a full end-to-end pass.
- Decision: Make both `api` and `smtp-dev-proxy-bootstrap` depend directly on successful cache reset.
  Rationale: Gating only the bootstrap would satisfy its local ordering but would still allow the API to serve
  requests while a stale cache entry exists. Direct dependencies make the plan's startup guarantee explicit
  in the rendered Compose model.
  Date/Author: 2026-08-27, Codex implementation.
- Decision: Capture the result of `redis-cli --scan` before piping keys into `xargs`.
  Rationale: The reset service must exit nonzero when Redis cannot be scanned. A successful no-op is valid only
  after a successful scan returns no matching keys. Dollar signs for the container shell must be doubled in
  the Compose source so they survive interpolation.
  Date/Author: 2026-08-27, Codex implementation.

## Outcomes & Retrospective

The `smtp-dev` overlay now clears every `DNS_CACHE:*` entry through a one-shot Redis service before either the
API or proxy bootstrap can start. Runtime checks proved deletion, the empty-cache no-op, and a nonzero exit
when Redis cannot be scanned. After seeding the original stale value for `lef.test`, all 11 Bruno requests
passed on the first attempt.

The full switch from the base stack to the overlay was not repeated because the active development Docker
project belongs to another worktree. The rendered dependency graph and the actual one-shot service were tested
against that shared development Redis without restarting the API or data services.

## Context and Orientation

`docker/compose.smtp-dev.yaml` overrides `dns:` for the `api` service to use the fixture CoreDNS container
(`172.28.0.53`) and already has a `smtp-dev-proxy-bootstrap` one-shot service (image `curlimages/curl`, no
`redis-cli`) that reconciles the fixture proxy registration once Keycloak and the API are healthy. Redis itself
runs the stock `redis:alpine` image (`docker/infra.yaml`), which bundles `redis-cli` (already used by that
service for its health check). `bruno/smtp-dev/README.md` documents the exact bring-up sequence developers follow;
it does not currently mention Redis state at all.

## Scope and Non-Goals

Add a one-shot Compose step, in the `smtp-dev` overlay only, that clears the `DNS_CACHE:*` Redis namespace
before the fixture proxy is reconciled. Update `bruno/smtp-dev/README.md` to state this guarantee explicitly.
Do not change `DnsService`, `DnsModule`, its cache TTL, or its key format. Do not change the base stack
Compose file or behavior. Do not add a general-purpose cache-admin endpoint or CLI command.

## Plan of Work

Add a new service to `docker/compose.smtp-dev.yaml` named `smtp-dev-dns-cache-reset`, using the `redis:alpine`
image already pulled for the `redis` service, with `depends_on: redis: condition: service_healthy`, running
`redis-cli --scan` and deleting every returned key with `redis-cli del`. The command must preserve a failed
scan as a nonzero service exit. Give both `api` and `smtp-dev-proxy-bootstrap` a `depends_on` entry with
`condition: service_completed_successfully`, so neither the API nor the fixture proxy reconciliation can start
before the cache is known-clean. Update the bring-up instructions in `bruno/smtp-dev/README.md` to name this
step and explain why it exists, referencing the reproduction in Surprises & Discoveries.

## Interfaces and Dependencies

Adds one new Compose service, scoped to `docker/compose.smtp-dev.yaml` only. No application code, endpoint,
environment variable, or database change. No new library.

## Acceptance Criteria

- Starting from a base-stack run that has cached an empty `DNS_CACHE:MX:lef.test` entry, bringing up the
  `smtp-dev` overlay (`docker compose down` with no `-v`, then the overlay `up`) and immediately running
  the `02-verify-local-email` test in `bruno/smtp-dev` succeeds on the first attempt, without any manual Redis
  intervention.
- The reset step runs to completion before `smtp-dev-proxy-bootstrap` starts.
- A normal `smtp-dev` bring-up with no preexisting stale cache still succeeds identically (the reset step is a
  safe no-op against an empty or already-consistent cache).
- The behavior, Compose file, and Redis usage of the base stack remain unchanged.

## Validation

- `docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml config --no-env-resolution --quiet`
  passed and rendered both startup gates with `condition: service_completed_successfully`.
- The final `smtp-dev-dns-cache-reset` service ran through Compose against a seeded DNS cache key, deleted the
  key, and exited with code 0. A second run against the clean namespace also exited with code 0.
- The same entry point against a network with no Redis service exited nonzero, proving that scan failure blocks
  dependents.
- The containerized `bruno/smtp-dev` collection passed all 11 requests after seeding and resetting
  `DNS_CACHE:MX:lef.test`.
- `corepack pnpm docs:lint -- .agents/plans/proxy-fleet/15-reset-dns-cache-for-smtp-dev-overlay.md
  bruno/smtp-dev/README.md` passed both files.

## Idempotence and Recovery

The reset step only deletes cache entries, which `DnsService` always repopulates lazily on the next lookup;
running it any number of times is safe. If the new service fails, the existing manual remedy still works: use
`docker exec` to delete `DNS_CACHE:*` from the `redis` container by hand.

## Artifacts and Notes

Before the fix, `DNS_CACHE:MX:lef.test` was `[]` with `TTL ~86399726` (ms) inside the Redis container.
`02-verify-local-email` failed with `reason: "no_mx_records"`. With the final service, the seeded key returned
`EXISTS = 0` before Bruno ran, and `02-verify-local-email` returned `201 Created` on the first attempt.

## Plan Readiness

Implementation complete and ready for a pull request.
