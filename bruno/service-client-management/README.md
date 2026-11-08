# Service Client Management Collection

A service client is an application using a direct Bearer API key. Bruno runs API requests with assertions:

```shell
corepack pnpm bruno:service-client-rejections
```

The launcher verifies this checkout's disposable stack, loads its private key, and requires all ten requests and
ten tests to pass. Keys stay out of arguments. Count-only reporting excludes headers, bodies, assertion details,
and raw CLI output, including on failure.

The collection checks that missing authentication returns `401`, and machine keys receive `403` for human-only
create, list, rotate, disable, and delete operations—even in their own organization. Active keys validate at
`GET /v1/auth/api-key` with empty `204`; missing, malformed, and legacy JWT (JSON Web Token) credentials return `401`.
Validation and issuance responses use `Cache-Control: no-store` to prevent retention, including rejection responses.
No collection request creates or rotates a key.

For successful lifecycle operations, bootstrap the human owner and run:

```shell
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm --filter ./apps/web test:service-clients-live
```

That suite uses MFA (password plus a second factor), disables sensitive artifacts before login, and checks creation,
listing, explicit copy/download, rotation, disabling, and deletion. Focused API tests cover wrong-organization access,
permission validation, disabled rotation, and secret-free lists. Machine rejection alone does not prove those rules.
