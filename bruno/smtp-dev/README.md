# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through the opt-in, Docker-network-only SMTP fixture. The fixture accepts every recipient, so this checks application, DNS, proxy, and SMTP wiring rather than real-world deliverability. It then drains the fixture's proxy, confirms it's excluded from proxy selection, and restores it so the collection can be run again without restarting the fixture.

The draining check calls `GET /v1/proxies/healthy` rather than `POST /verify` again: `SmtpVerifier` caches its internal catch-all probe per domain, so a second `/verify` call for the same domain never re-attempts allocation regardless of proxy state. `/v1/proxies/healthy` runs the same `state = active` eligibility query the allocator uses, without that cache in the way.

Start the fixture from the repository root:

```shell
docker compose -f docker/compose.yaml down
docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
```

Copy the local admin key from `docker/secrets/admin_apikey.txt` into an ignored `bruno/smtp-dev/.env` file:

```dotenv
ADMIN_API_KEY=replace-with-the-local-admin-key
```

Then run:

```shell
cd bruno/smtp-dev
bru run --env local
```
