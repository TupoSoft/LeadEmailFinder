# Local SMTP Development Collection

Bruno runs API requests with assertions. SMTP (Simple Mail Transfer Protocol) is the mail protocol used for mailbox
probes. This Docker-only fixture checks DNS lookup, proxy allocation, encrypted transport, verification evidence,
and billing; it does not establish real-world deliverability.

## Start and Run

For fresh **disposable** default data, confirm this checkout owns the stack before resetting it:

```shell
corepack pnpm dev:reset -- --confirm-project=LEF
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
corepack pnpm bruno:smtp-dev
```

Reset deletes development data and seeds the private platform API key before the overlay mounts
`.dev/auth/platform-api-key.json` with mode `0600` (owner-only read/write). Stop any active overlay before reset.
To attach the overlay to an already provisioned stack, run only the Compose command. Older stacks may need
[network recovery](../../docker/README.md#recover-an-older-smtp-network).

The launcher verifies checkout/container ownership, loads the key without printing it, and requires all 47 requests
and a nonzero passing test count. Missing, skipped, or failed execution fails validation. Set `COMPOSE_PROJECT_NAME`
for a separately named stack. Public identity-provider URLs remain unchanged while collection traffic uses the
Docker-internal API. The developer sandbox supplies the script APIs needed by the collection.

## Evidence and Billing

- `person@lef.test` requires STARTTLS, which upgrades SMTP to encrypted TLS (Transport Layer Security).
  `person@plaintext.lef.test` must return `secure_transport_unavailable` after the server greeting exchange,
  without sending an email sender, recipient, or message body. Default account discovery produces no external source.
- The `lef.test` fixture accepts every recipient, including a nonexistent catch-all control address. Its results are
  inconclusive: reservations temporarily hold credits, then release them without charging.
- Fresh `evidence.lef.test` addresses exercise conclusive outcomes. A target accepted with `250` after a conclusively
  missing control produces `accepted_email`; the target's exact `550 5.1.1` missing-recipient reply produces
  `rejected_email`. Generic, policy, or sender-stage rejections remain inconclusive. Closing before `QUIT` must not
  discard accepted target evidence.
- A temporary `450` schedules a persisted retry. Its first 60-second delay exceeds the synchronous route's
  30-second budget, so the response returns `202` with an asynchronous handle and keeps the reservation pending.
- The evidence group starts with seven credits and confirms three conclusive charges, three released reservations,
  and one pending retry. Fixture scenarios return to the accepts-all baseline afterward.

Cached evidence can bypass probing and charging. Credit-counting addresses must not already have conclusive results;
reset between complete runs rather than rerunning against a long-lived database.

## Other Required Contracts

The collection checks zero-balance `402`, synchronous and queued verification, stable saved-result IDs, authenticated
result/status reads, generic rejection of duplicate or foreign cache entries, and the retired `GET /verify` route's
`404` without a charge. Every response replaces caller-supplied `X-Request-ID` with a server-generated UUID (unique
identifier). Request IDs identify HTTP exchanges, job IDs identify queued work, and verification IDs identify saved
results.

Draining the fixture proxy excludes it from `GET /v1/proxies/healthy`, then restores it. This read checks allocation
eligibility directly; another verification could use cached evidence and never allocate a proxy.

## Trust and Cleanup

The committed CA (certificate authority), certificate, and private key are public fixture material; never reuse
them outside development. `SMTP_TLS_CA_FILE` adds fixture trust for SMTP without replacing Node's public roots.
The one-shot `smtp-dev-dns-cache-reset` service clears Redis `DNS_CACHE:*` before API/proxy startup so cached DNS
answers cannot override the fixture's CoreDNS resolver.

The overlay adds its own network and leaves the base network unchanged. Never reset another checkout's stack or
print API keys. Repeated credential seeding preserves an active key. Use ownership-checked resets for disposable
fixture data; the collection does not guarantee retained job/result lifetimes.
