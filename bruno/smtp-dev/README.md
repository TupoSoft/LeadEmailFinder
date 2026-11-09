# Local SMTP Development Collection

Bruno runs API requests with assertions. SMTP (Simple Mail Transfer Protocol) is the mail protocol used for mailbox
probes. This Docker-only fixture checks DNS lookup, proxy allocation, encrypted transport, verification evidence,
and billing; it does not establish real-world deliverability.

## Start

Prepare a disposable base stack and a private platform API key before starting the overlay. It mounts
`.dev/auth/platform-api-key.json` with owner-only permissions (`0600`); starting Compose does not create the key.

```shell
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

Configure the collection credentials and organization through `environments/local.yml`. Requests use Docker-internal
API and evidence-control addresses, so run them from the fixture network. The developer sandbox supplies the script
APIs needed by the collection. Older stacks may need [network recovery](../../docker/README.md#recover-an-older-smtp-network).

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
use fresh disposable data for complete runs.

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
print API keys. Clean up only owned fixture data; the collection does not guarantee retained job/result lifetimes.
