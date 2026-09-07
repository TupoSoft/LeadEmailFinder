# Asynchronous Email Verification

Run the distinct asynchronous workflow with the repository-pinned Bruno CLI:

```shell
corepack pnpm bruno:async-verification
```

The launcher requires the same-origin development stack and SMTP overlay to be active and owned by this checkout. It verifies
current Docker labels before reading fixture credentials. Provision the platform and customer fixtures with the
existing Keycloak seed commands, then bootstrap the owner and operator for live browser tests. Follow
`apps/web/tests/README.md` for isolated Compose projects and MFA setup. Never reset another checkout's stack.

The launcher retrieves the seeded customer service-client secret privately from Keycloak. It uses the
Compose-internal API and token endpoint while requiring the public issuer to remain unchanged. Secrets travel through
the process environment and container standard input; neither command arguments nor reports contain credentials.
The developer sandbox is required for token requests and bounded status polling.

The fifteen requests cover unauthenticated calls, invalid email and job identifiers, and one real `person@lef.test`
job with safe public status fields and repeated reads. They also check cross-organization concealment, a single credit
debit, insufficient credits, and rejection of customer credit administration. Status polling permits only
`queued`, `running`, `completed`, `failed`, and `unavailable`. The SMTP fixture must complete with a sanitized result;
failed and unavailable responses stop the run. Rare terminal states are covered with deterministic browser and API
fixtures without changing live queue data.

Credit setup applies only to the separately seeded customer organization. The launcher saves its starting balance,
uses an exclusive local fixture lock, and restores and verifies that balance after success or failure. Run this
collection and the live verification browser suite sequentially, while the development customer is idle. If a process
is forcibly terminated, inspect the owned fixture balance before removing `.dev/async-verification.lock` and rerunning.
The launcher never deletes jobs or claims a retention guarantee. Every request and test must execute and pass;
missing, skipped, or empty reports fail the command.

Run the browser workflow through its dedicated configuration so hosted MFA pages are never captured:

```shell
corepack pnpm --filter ./apps/web test:verification-live
```

This uses real hosted MFA, the same-origin API, and the SMTP worker. It verifies a single submission, a hard refresh
of the returned job URL, the completed result, credit rejection, keyboard validation at a narrow viewport, automated
accessibility checks, and recovery after the real session cookie is removed. The fixture restores the original
customer balance even if browser validation fails. The ordinary `test:e2e` command includes deterministic verification
states, uncertain submissions, permission-aware credit guidance, and polling while offline or hidden.
