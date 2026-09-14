# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through an opt-in, Docker-network-only SMTP fixture that requires STARTTLS and uses the non-production root under `docker/smtp-dev/tls`. It then verifies `person@plaintext.lef.test` against an intentionally plaintext fixture and requires `secure_transport_unavailable`. These checks cover application, DNS, proxy, certificate trust, and SMTP wiring rather than real-world deliverability. Both verification assertions also prove that the default empty approval manifest produces no external account-discovery source. The plaintext request must stop after `EHLO`; PII-safe API logs must contain no `mail_from`, `rcpt_to`, or `DATA` command for that request. The collection then drains the fixture proxy, confirms that proxy selection excludes it,
and restores it without restarting the fixture. Requests 08–14 prove that `POST /verify` returns `402` at zero
balance and, for a successful `201` request, exposes the reservation and its outcome in the response's own
`operation.billing` block. Both requests use the dedicated `sync-credit-check@lef.test` address, distinct from
`person@lef.test` and never resubmitted elsewhere in this collection. This fixture domain accepts every recipient,
including the catch-all control probe used to detect it, so every verification of any `@lef.test` address (this
one and `person@lef.test` alike) is classified inconclusive: the reservation is released, not captured, and the
balance after a successful `201` is unchanged rather than debited. Only the scenario-selectable
`@evidence.lef.test` fixture used by requests 31–46 can produce a genuinely conclusive, chargeable result. Between
adding that credit and sending the POST request, an authenticated request to the retired `GET /verify` route
returns the API's normal `404`, and an immediate balance read confirms that the credit remains available. Later
requests update the authenticated organization's
stored email and prove that an address outside that organization's cache is concealed as `404 Not Found` rather
than created implicitly. Another request proves that creating a duplicate cache entry returns `409 Conflict`.
Both rejection bodies use generic
messages and do not echo the submitted address.

Every response must include a server-generated UUID in `X-Request-ID`, including rejected requests. Synchronous,
retired GET, and asynchronous requests submit a caller-controlled header and verify that the server replaces it.
The synchronous results expose persisted verification UUIDs. The retired route returns no verification result.
Requests 18–21 read an owned result through `GET /verifications/:id`, confirm that a random missing UUID returns
`404`, reject a malformed UUID with `400`, and require authentication with `401`. Requests 22–24 add one credit,
enqueue asynchronous verification for the dedicated `async-credit-check@lef.test` address, and poll for a
completed result with its own persisted verification UUID and a `settled`/`fresh` `operation` block.
The next completed-status read must return the same result. Requests 25–30 confirm that enqueue reserves one
credit that the same inconclusive-by-construction result then releases, conceal a missing job with `404`, reject
a malformed job UUID with `400`, and require authentication for status with `401`. The last of these requests
resets the balance to zero explicitly, then rejects enqueue at zero balance with `402` for the
never-before-verified `async-credit-check-zero@lef.test` address — a fresh address so the check exercises the
zero-balance admission path rather than the 60-second address cooldown a just-settled address would still carry.
The final balance stays at zero after that reset and the rejected request. Permission rejection
and foreign-job concealment use isolated principals in the async HTTP integration suite; this collection uses the
provisioned platform credential.
The request UUID identifies an HTTP exchange, the job UUID identifies queued work, and the verification UUID
identifies the saved result. A result lookup requires `verification:read` and uses the authenticated organization.

Requests 31–47 prove the evidence-classification policy from `verification-billing/01` through HTTP against
`docker/smtp-dev/evidence-server.mjs`, a deterministic STARTTLS fixture that replaces the former accepts-all
`mailpit` service at the same trusted `smtp.lef.test` address. Its fixture-only HTTP control endpoint
(`{{evidenceControlUrl}}`, reachable only on the Docker network) selects one closed scenario before each request
and is reset to the original accepts-all baseline afterward. Each scenario uses its own `evidence.lef.test`
target address (that domain shares the same MX host as `lef.test`) so no scenario's persisted evidence can
satisfy a later one. After setting the organization's balance to exactly seven credits, the requests prove a
target `250` after a conclusively missing control produces `accepted_email`, and the target's own exact
`550 5.1.1` produces `rejected_email`. They also prove the identical `550 5.1.1` at `MAIL FROM` instead produces
`unexpected_error`, never a false negative; a bare `550` and a `554 5.7.1` both remain ineligible generic
failures; and an accepted target survives the fixture closing the connection before it answers `QUIT`. A temporary
`450` schedules a durable retry instead of settling immediately — its 60-second first backoff does not fit the
synchronous route's 30-second budget, so it falls back to the same `202` handle the async route would return,
leaving that one reservation pending rather than captured. Only the target's own exact missing-recipient proof and
an accepted target with a conclusively missing control are ever conclusive; a bare rejection, an ambiguous
rejection, and a `MAIL FROM` rejection are all inconclusive by the same policy that keeps `rejected_email` itself
strict, so their reservations are released rather than captured. A final balance read confirms exactly one credit
was captured for each of these three conclusive scenarios, with three more released as inconclusive and the
temporary-rejection scenario still reserved and awaiting the reconciler's own retry cadence. Existing credit
assertions in requests 01–30 remain accurate for this
collection; these evidence checks do not themselves enable the later billing cutover.

Every credit-counting request in this collection (08–30 and 31–46) assumes its target address has never before
settled a conclusive result against this checkout's development database. The durable admission stack introduced
by `verification-billing/04` reuses any unexpired settled result at zero cost regardless of balance. A same-day
rerun of this collection against a development stack that is not reset between runs would therefore see the
evidence-scenario addresses (31–46) resolve from cache and understate the seven credits requests 31–46 expect to
consume. `pnpm dev:reset` (used to start the fixture, above) recreates the database and avoids this. Running the
collection twice against a long-lived stack without a reset in between does not.

Within the email-verification module, `api/http/asynchronous-verification/` adapts enqueue and status requests to
commands in `application/delivery/async/`. The queue producer, status lookup, and worker live under
`infrastructure/queues/async-verification/` and preserve the existing queue protocol and organization ownership.
`api/http/synchronous-verification/current/` adapts POST requests to the
`RunSynchronousVerification` command in `application/delivery/synchronous/`. The command uses the core composed
by `infrastructure/email-verification-core.module.ts`. DNS and domain-synonym adapters live under
`infrastructure/discovery/dns/` and `infrastructure/discovery/http/`; `SmtpMailboxProbe` lives under
`infrastructure/mailbox/smtp/` and uses the same DNS, proxy, STARTTLS, and persistence contracts. Account discovery
keeps its current default-deny composition and approval checks.

The draining check calls `GET /v1/proxies/healthy` rather than `POST /verify` again. `SmtpMailboxProbe` reuses
persisted SMTP outcomes for an organization and address, including the catch-all probe address. A second
`/verify` call for the same organization's fixture domain can therefore avoid allocating another proxy.
`/v1/proxies/healthy` runs the same `state = active` eligibility query as the allocator without that cache in the
way.

Start the fixture from the repository root:

```shell
pnpm dev:reset -- --confirm-project=LEF
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

`dev:reset` provisions Keycloak and seeds the platform service credential before the overlay bind-mounts the
generated `.dev/keycloak/service-client.json` file. If the file is missing, the overlay fails without creating a
directory in its place. Provisioning also repairs an empty directory left by older Compose configurations, while
refusing to remove a nonempty directory.

The checked-in CA, certificate, and private key are fixture-only material. They are not secrets and must never be reused outside local development. `SMTP_TLS_CA_FILE` points the API at the fixture root for SMTP connections only; the loader appends it to Node's effective default roots instead of replacing public trust.

The overlay runs `smtp-dev-dns-cache-reset` before starting the API or reconciling the fixture proxy. This
one-shot service clears the shared Redis `DNS_CACHE:*` namespace so answers cached by the base stack cannot
override the overlay's CoreDNS fixture. It is safe when the cache is already empty; DNS answers are populated
again on demand.

`keycloak:bootstrap-credential` seeds a `Platform Operations (development)` organization. It grants the
pre-provisioned `lef-development-service` M2M client every permission, including `platform:admin`, under the
public Keycloak issuer. Both `bootstrap-proxy.sh` and this collection authenticate through the internal token
endpoint, whose tokens still carry that public issuer. The collection checks this claim before each API request.

Run the pinned collection launcher from the repository root:

```shell
corepack pnpm bruno:smtp-dev
```

The launcher confirms that this checkout owns the API and SMTP fixture containers, then runs the installed Bruno
CLI inside the API container with `bru run --env local --sandbox developer`. It loads ignored development
credentials without printing them, selects `http://api:3000` and the internal Keycloak protocol endpoint explicitly,
and requires all 47 requests to execute. It fails on missing prerequisites, skipped requests, failed assertions,
or zero executed tests. The developer sandbox supplies the `fetch` function needed by the token-minting script.

For a stack started with `docker compose -p <project>`, set `COMPOSE_PROJECT_NAME` to the same project when running
the launcher. The launcher records ownership of the working directory in ignored `.dev/keycloak/development-stack.json` metadata.
The API continues to validate `http://localhost:58080/realms/lead-email-finder` in every overlay, and its browser
login redirects remain public.
