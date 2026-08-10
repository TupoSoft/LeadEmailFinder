# Proxy Registry Bruno Collection

This collection exercises the secured proxy-registry API and removes the proxy it creates.

Run it against the local Compose API with an admin API key:

```shell
cd bruno/proxy-registry
bru run --env local --env-var "adminApiKey=$ADMIN_API_KEY"
```

The `local` environment sets only `baseUrl`; provide `adminApiKey` at runtime or through an untracked `.env` file.
