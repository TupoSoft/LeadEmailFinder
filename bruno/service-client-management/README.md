# Service Client Management Bruno Collection

Ten requests cover human-only management and direct API-key authentication. Create without authentication returns
401; create, list, rotate, disable, and delete with a machine key return 403 even for its own organization. Active
keys validate at `GET /v1/auth/api-key` with an empty 204 response. Missing, malformed, and legacy JWT credentials
return 401. Validation and issuance responses use `Cache-Control: no-store`, including rejection responses.
No request creates or rotates a key.

Run the pinned launcher against the development stack owned by this checkout:

```shell
corepack pnpm bruno:service-client-rejections
```

The launcher verifies stack ownership, reads the ignored development credential internally, and runs
`bru run --env local --sandbox developer` with the pinned CLI. It requires all ten requests and ten tests to execute
successfully. Credentials stay outside command arguments. The count-only reporter prevents headers, bodies,
assertion details, and raw CLI output from reaching artifacts or logs, including failure paths.

The live browser suite uses the existing MFA-aware human owner fixture and proves create, list, explicit copy and
download, rotate, disable, and delete. It uses the dedicated configuration so traces, screenshots, videos, DOM
attachments, and raw failures are disabled before authentication:

```shell
corepack pnpm --filter ./apps/web test:service-clients-live
```

Wrong-organization access, duplicate and unsupported permissions, disabled rotation, and secret-free list responses
are covered by focused HTTP integration tests under
`src/libs/modules/service-client-management/src/api/`. Bruno cannot mint a genuine human session and does not claim
positive lifecycle coverage or application-level validation through an M2M rejection.
