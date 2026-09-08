# Service Client Management Bruno Collection

This rejection-only collection sends six requests: create without authentication, followed by create, list, rotate,
disable, and delete with a provisioned M2M credential. Every management operation requires a genuine human browser
session, so an M2M credential must be rejected even for its own organization. Create and rotate also assert
`Cache-Control: no-store`, including rejection responses. No request creates or rotates a client.

Run the pinned launcher against the development stack owned by this checkout:

```shell
corepack pnpm bruno:service-client-rejections
```

The launcher verifies stack ownership, reads the ignored development credential internally, and runs
`bru run --env local --sandbox developer` with the pinned CLI. It requires all six requests and six tests to execute
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
