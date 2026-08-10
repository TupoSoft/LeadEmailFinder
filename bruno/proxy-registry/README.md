# Proxy Registry Bruno Collection

This collection exercises the secured proxy-registry API and removes the proxy it creates.

Run it against the local Compose API with an admin API key:

```shell
cd bruno/proxy-registry
bru run --env local
```

The `local` environment obtains `adminApiKey` from `ADMIN_API_KEY` in the ignored collection-root `.env` file. For local Compose, copy the value from `docker/secrets/admin_apikey.txt` into:

```dotenv
ADMIN_API_KEY=replace-with-the-admin-secret
```

You can still override the value for a one-off CLI run with `--env-var "adminApiKey=$ADMIN_API_KEY"`.
