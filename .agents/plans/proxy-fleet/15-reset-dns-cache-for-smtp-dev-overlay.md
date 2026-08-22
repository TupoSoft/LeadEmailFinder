# Reset the DNS cache when bringing up the smtp-dev overlay

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Bringing up `docker/compose.smtp-dev.yaml` after the base stack has already cached a DNS answer for the same
hostname must not silently serve that stale answer. After this change, every fresh `smtp-dev` overlay bring-up
clears the shared DNS cache namespace before the API can serve a request, so `lef.test`'s fixture MX record is
always resolved fresh through the overlay's coredns fixture rather than through whatever the base stack last
cached. A developer can observe it by running the base stack once (letting a real, empty DNS answer for
`lef.test` get cached), switching to the `smtp-dev` overlay without deleting volumes, and seeing
`bruno/smtp-dev`'s verification requests resolve correctly on the very first run instead of failing with
`no_mx_records`.

## Progress

- [ ] Add a one-shot cache-reset step to the `smtp-dev` overlay's Compose definition.
- [ ] Sequence it ahead of `smtp-dev-proxy-bootstrap` and document the guarantee.
- [ ] Verify against a real cross-config stale-cache reproduction.

## Plan dependencies

None.

## Surprises & Discoveries

- Found live, not assumed: `DnsService` (`src/libs/dns/src/dns.service.ts`) caches every resolved record in
  Redis for `DnsService.DEFAULT_TTL_SECONDS` (1 day) under a key of exactly `DNS_CACHE:<type>:<name>` —
  the key carries no information about which DNS resolver produced the answer.
- The base stack (`docker/compose.yaml`) and the `smtp-dev` overlay (`docker/compose.yaml -f
  docker/compose.smtp-dev.yaml`) are mutually exclusive but **share the same named `lef_redis-data` volume**
  and are conventionally brought up with a plain `docker compose down` (no `-v`) between switches, per every
  existing collection README in this repo. The overlay resolves `lef.test` via a local coredns fixture
  (`docker/smtp-dev/coredns/lef.test.zone`, MX -> `smtp.lef.test`); the base stack resolves it via whatever
  the host's Docker daemon forwards to (real public DNS, where `lef.test` has no records).
  Reproduced directly: ran the base stack, which correctly cached `DNS_CACHE:MX:lef.test = []` (no real-world
  records) with a ~24h TTL; switched to the `smtp-dev` overlay without deleting volumes; `POST /verify` for
  `person@lef.test` returned `reason: "no_mx_records"` even though the overlay's own coredns fixture resolves
  the record correctly (confirmed separately via `nslookup -type=MX lef.test` from inside the `api` container).
  Deleting the single stale Redis key by hand made the very next request resolve and verify correctly.
- This only manifests because two mutually exclusive dev Compose profiles happen to answer differently for the
  same hostname while sharing persistent cache state — production has exactly one DNS resolution path, so this
  is a disposable-dev-workflow gap, not a `DnsService` correctness defect. That rules out changing `DnsService`
  or `DnsModule` (production code) to fix a problem that only exists in the interaction between two dev-only
  Compose files.

## Decision Log

- Decision: Fix this at the `smtp-dev` overlay's Compose/tooling layer (a new one-shot reset step), not by
  changing `DnsService`'s cache-key shape or adding an environment-configurable cache prefix/namespace.
  Rationale: The collision only exists because of how this repo's disposable dev stack is operated (two
  Compose profiles sharing one Redis volume); teaching production code about that is scope creep for a
  dev-only problem, and would add a knob no real deployment needs.
  Date/Author: 2026-08-22, source-audit finding from a full E2E pass.
- Decision: Clear the whole `DNS_CACHE:*` namespace, not just `lef.test`'s keys.
  Rationale: The overlay's coredns fixture is the sole authority for every hostname the API resolves while it
  is up; any DNS answer cached before the overlay came up is untrustworthy for the same reason `lef.test`'s
  was, and a namespace-wide `SCAN`+`DEL` is exactly as safe and much simpler than hostname-specific pruning.
  Date/Author: 2026-08-22, source-audit finding from a full E2E pass.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`docker/compose.smtp-dev.yaml` overrides the `api` service's `dns:` to the fixture coredns container
(`172.28.0.53`) and already has a `smtp-dev-proxy-bootstrap` one-shot service (image `curlimages/curl`, no
`redis-cli`) that reconciles the fixture proxy registration once Keycloak and the API are healthy. Redis itself
runs the stock `redis:alpine` image (`docker/infra.yaml`), which bundles `redis-cli` (already used by that
service's own healthcheck). `bruno/smtp-dev/README.md` documents the exact bring-up sequence developers follow;
it does not currently mention Redis state at all.

## Scope and Non-Goals

Add a one-shot Compose step, in the `smtp-dev` overlay only, that clears the `DNS_CACHE:*` Redis namespace
before the fixture proxy is reconciled. Update `bruno/smtp-dev/README.md` to state this guarantee explicitly.
Do not change `DnsService`, `DnsModule`, its cache TTL, or its key format. Do not touch the base stack's own
Compose file or behavior. Do not add a general-purpose cache-admin endpoint or CLI command.

## Plan of Work

Add a new service to `docker/compose.smtp-dev.yaml` (e.g. `smtp-dev-dns-cache-reset`), using the `redis:alpine`
image already pulled for the `redis` service, with `depends_on: redis: condition: service_healthy`, running
`redis-cli -h redis --scan --pattern 'DNS_CACHE:*' | xargs -r redis-cli -h redis del` (or equivalent) and then
exiting. Give `smtp-dev-proxy-bootstrap` a `depends_on` entry on this new service with
`condition: service_completed_successfully`, so the fixture proxy is never reconciled before the cache is
known-clean. Update `bruno/smtp-dev/README.md`'s bring-up instructions to name this step and explain why it
exists, referencing this plan's Surprises & Discoveries reproduction.

## Interfaces and Dependencies

Adds one new Compose service, scoped to `docker/compose.smtp-dev.yaml` only. No application code, endpoint,
environment variable, or database change. No new library.

## Acceptance Criteria

- Starting from a base-stack run that has cached an empty `DNS_CACHE:MX:lef.test` entry, bringing up the
  `smtp-dev` overlay (`docker compose down` with no `-v`, then the overlay `up`) and immediately running
  `bruno/smtp-dev`'s `02-verify-local-email` succeeds on the first attempt, without any manual Redis
  intervention.
- The reset step runs to completion before `smtp-dev-proxy-bootstrap` starts.
- A normal `smtp-dev` bring-up with no pre-existing stale cache still succeeds identically (the reset step is a
  safe no-op against an empty or already-consistent cache).
- The base stack's own behavior, Compose file, and Redis usage are unchanged.

## Validation

Manual container-runtime reproduction: bring up the base stack, run one `POST /verify` for a domain with no
real DNS presence to seed a stale negative cache entry, tear down (no `-v`), bring up the `smtp-dev` overlay,
and run `bru run --env local` for `bruno/smtp-dev` from inside the Docker network per its README — expect all
requests to pass on the first attempt. Repeat a second overlay bring-up immediately afterward to confirm the
reset step is a harmless no-op when the cache is already clean.

## Idempotence and Recovery

The reset step only deletes cache entries, which `DnsService` always repopulates lazily on the next lookup;
running it any number of times is safe. If the new service fails, the overlay's existing manual remedy (`docker
exec` into the `redis` container and delete `DNS_CACHE:*` by hand) still works as a fallback, unchanged from
today's workaround.

## Artifacts and Notes

Reproduction evidence: `DNS_CACHE:MX:lef.test` observed as `[]` with `TTL ~86399726` (ms) inside the overlay's
`redis` container immediately before the fix; `02-verify-local-email` failed with `reason: "no_mx_records"`
until the key was deleted, then passed identically to every other run this session once the cache was clear.

## Plan readiness

Ready to implement.
