# Local SMTP Development Bruno Collection

This collection verifies `person@lef.test` through the opt-in, Docker-network-only SMTP fixture. The fixture accepts every recipient, so this checks application, DNS, proxy, and SMTP wiring rather than real-world deliverability.

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
