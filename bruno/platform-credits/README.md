# Platform Credit Idempotency

Run the collection from the repository root:

```sh
corepack pnpm bruno:platform-credits
```

The launcher uses the exact Bruno CLI version in `package.json`, selects `--env local --sandbox developer`,
and rejects missing, skipped, failed, or empty execution. It checks 16 requests, including authenticated grants,
equivalent replay, conflicting replay, malformed or repeated keys, missing authentication, invalid authentication,
and a customer credential without platform permission. Concurrent requests cover duplicate keys, different keys,
and conflicting amounts, including organizations without a credit account. A replay after other grants checks
that the response returns the current balance.

The repository does not yet contain the shared launcher or stack metadata from frontend Plan 02. This narrow
launcher requires an existing disposable development API, PostgreSQL, and Keycloak stack. It does not start or
reset that stack. Run the existing development provisioning and customer fixture workflow first. The platform
service client and customer fixture must exist in the ignored `.dev/keycloak/service-client.json` and
`.dev/keycloak/customer-fixture.json` files.

Create the ignored `.dev/keycloak/bruno-platform-credits.json` file locally with these fields:

```json
{
  "checkoutRoot": "/absolute/path/to/this/checkout",
  "composeProject": "lef",
  "apiUrl": "http://localhost:53000",
  "postgresUrl": "postgresql://postgres:<local-password>@localhost:55432/lef",
  "keycloakUrl": "http://localhost:58080",
  "keycloakAdminUsername": "admin",
  "keycloakAdminPassword": "<local-admin-password>"
}
```

Use the database and admin credentials for that disposable stack. Keep this file private and untracked. The
launcher accepts only local endpoints, checks the checkout recorded in metadata, and verifies the Compose project,
service labels, working directory, running state, and published ports before accessing those services. These checks
prevent a checkout from silently reusing another checkout's running stack.

The launcher bootstraps the platform credential internally, obtains platform and customer tokens, and creates four
unique synthetic organizations without credit accounts. Each logical grant gets a UUID; equivalent and conflicting
replays reuse the original key. Tokens travel through child-process environment variables. The launcher withholds
raw CLI output, omits headers and bodies from temporary reports, and prints only counts and synthetic fixture
balances. It checks account counts, grant counts, and exact balances directly in PostgreSQL, then deletes only its
synthetic organizations and removes the temporary report directory, including after a failed collection run.

No migration or schema reset is required. Tests use the current synchronized development schema. If a process is
forcibly terminated, inspect organizations named `Bruno platform credit fixture` in this disposable database before
removing any leftover synthetic data. Do not delete shared organizations or ledger rows by a broad pattern.

For focused launcher validation:

```sh
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- platform-credits-runner --runInBand
```
