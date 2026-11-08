# Machine Authentication Collection

This legacy path remains compatible. M2M means machine-to-machine; OIDC (OpenID Connect) is an identity protocol.
Current machine authentication uses API keys sent as `Authorization: Bearer <key>` instead of OIDC tokens.

The Bruno API-request collection checks public health and rejects missing or legacy JWT (JSON Web Token)
credentials. Seeded keys remain private in `.dev/auth/`.

Run the maintained checks against this checkout's disposable stack:

```shell
corepack pnpm bruno:service-client-rejections
```

`corepack pnpm test:mcp-server-live` also verifies committed key rotation, disabling, and deletion.
