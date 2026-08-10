# API Key Administration Bruno Collection

This collection verifies that only the configured admin API key can manage API keys. It creates and revokes a temporary READ key during every run.

Run it against the local Compose API:

```shell
cd bruno/api-key-administration
bru run --env local
```

The `local` environment reads `ADMIN_API_KEY` from an ignored collection-root `.env` file:

```dotenv
ADMIN_API_KEY=replace-with-the-admin-secret
```

For local Compose, use the value in `docker/secrets/admin_apikey.txt`. You can override the key for a one-off CLI run with `--env-var "adminApiKey=$ADMIN_API_KEY"`.
