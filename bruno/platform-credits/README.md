# Platform Credit Administration

Run the collection from the repository root:

```sh
corepack pnpm bruno:platform-credits
```

The launcher uses the exact Bruno CLI version in `package.json`, selects `--env local --sandbox developer`,
and rejects missing, skipped, failed, or empty execution. It checks 34 requests, including organization detail, balance reads, absolute sets, authenticated grants,
equivalent replay, conflicting replay, malformed or repeated keys, missing authentication, invalid authentication,
and a customer credential without platform permission. Concurrent requests cover duplicate keys, different keys,
and conflicting amounts, including organizations without a credit account. A replay after other grants checks
that the response returns the current balance. Detail reads cover safe fields, absence, invalid UUIDs, and access
denial. GET and PUT cover UUID validation, missing authentication, and customer-role denial; PUT also rejects
negative amounts and accepts zero. Read-after-set proves the observed final balance. Two further requests target a
sixth, held organization: setting its balance below the credits its active reservation has reserved returns `409`
without exposing reservation or operation details, and a follow-up read confirms the balance never changed.

The launcher uses the shared development-stack discovery from `scripts/testing/development-stack.mjs`, just like
browser fixture bootstrap and the other live runners. It discovers running API, web, PostgreSQL, Redis, and Keycloak
containers, confirms ownership by the checkout and Compose project, validates published local endpoints, and reads only this
checkout's disposable credentials. It does not require `bruno-platform-credits.json` or write another metadata file.

Use the standard disposable development setup and browser fixtures first:

```sh
corepack pnpm dev:reset -- --confirm-project=LEF
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm bruno:platform-credits
```

The platform service client and customer fixture must exist in the ignored `.dev/keycloak/service-client.json` and
`.dev/keycloak/customer-fixture.json` files created by development provisioning. The launcher respects
`COMPOSE_PROJECT_NAME` through the shared discovery contract. It never starts or resets a stack and rejects
containers belonging to another checkout before any fixture mutation.

The launcher bootstraps the platform credential internally, obtains platform and customer tokens, and creates six
unique synthetic organizations without credit accounts. Each logical grant gets a UUID; equivalent and conflicting
replays reuse the original key. Tokens travel through child-process environment variables. The launcher withholds
raw CLI output, omits headers and bodies from temporary reports, and prints only counts and synthetic fixture
balances. It checks account counts, grant counts, reserved amounts, and exact balances directly in PostgreSQL, then
deletes only its synthetic organizations and removes the temporary report directory, including after a failed
collection run. The fifth organization isolates absolute-set tests from the additive replay fixtures and finishes
at zero without grants. The sixth organization is funded through the real `POST /credits/:id` endpoint and then
given an active hold through the real `CreditReservationService` — a short-lived Nest application context built
from `IdentityModule`, never raw SQL — so its `reserved` balance reflects an actual application-level reservation
rather than a fixture shortcut.

No migration or schema reset is required. Tests use the current synchronized development schema. If a process is
forcibly terminated, inspect organizations named `Bruno platform credit fixture` in this disposable database before
removing any leftover synthetic data. Do not delete shared organizations or ledger rows by a broad pattern.

For focused launcher validation:

```sh
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- platform-credits-runner --runInBand
```
