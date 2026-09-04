# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through an opt-in, Docker-network-only SMTP fixture that requires STARTTLS and uses the non-production root under `docker/smtp-dev/tls`. It then verifies `person@plaintext.lef.test` against an intentionally plaintext fixture and requires `secure_transport_unavailable`. These checks cover application, DNS, proxy, certificate trust, and SMTP wiring rather than real-world deliverability. Both verification assertions also prove that the default empty approval manifest produces no external account-discovery source. The plaintext request must stop after `EHLO`; PII-safe API logs must contain no `mail_from`, `rcpt_to`, or `DATA` command for that request. The collection then drains the fixture proxy, confirms that proxy selection excludes it,
and restores it without restarting the fixture. Finally, the deprecated `GET /verify` compatibility route proves
that it requires the same credit as `POST /verify`. It returns `402` at zero balance and debits one credit after
a successful request. Later requests update the authenticated organization's stored email and prove that an
address outside that organization's cache is concealed as `404 Not Found` rather than created implicitly. Another
request proves that creating a duplicate cache entry returns `409 Conflict`. Both rejection bodies use generic
messages and do not echo the submitted address.

Every response must include a server-generated UUID in `X-Request-ID`, including rejected requests. Synchronous,
legacy, and asynchronous requests submit a caller-controlled header and verify that the server replaces it.
The synchronous results expose persisted verification UUIDs; the deprecated response body continues to omit `id`.
Requests 16–19 read an owned result through `GET /verifications/:id`, confirm that a random missing UUID returns
`404`, reject a malformed UUID with `400`, and require authentication with `401`. Requests 20–22 add one credit,
enqueue asynchronous verification, and poll for a completed result with its own persisted verification UUID.
The request UUID identifies an HTTP exchange, the job UUID identifies queued work, and the verification UUID
identifies the saved result. A result lookup requires `verification:read` and uses the authenticated organization.

The draining check calls `GET /v1/proxies/healthy` rather than `POST /verify` again. `SmtpVerifier` caches its
internal catch-all probe per domain, so a second `/verify` call for the same domain does not allocate another
proxy. `/v1/proxies/healthy` runs the same `state = active` eligibility query as the allocator without that
cache in the way.

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
and fails on missing prerequisites, skipped requests, failed assertions, or zero executed tests. The developer
sandbox supplies the `fetch` function needed by the token-minting script.

For a stack started with `docker compose -p <project>`, set `COMPOSE_PROJECT_NAME` to the same project when running
the launcher. The launcher records ownership of the working directory in ignored `.dev/keycloak/development-stack.json` metadata.
The API continues to validate `http://localhost:58080/realms/lead-email-finder` in every overlay, and its browser
login redirects remain public.
