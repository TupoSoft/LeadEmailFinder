# Platform Credit Administration

Bruno runs API requests with assertions. After provisioning this checkout's disposable development stack:

```shell
corepack pnpm bruno:platform-credits
```

For fresh default data, first run `corepack pnpm dev:reset -- --confirm-project=LEF`; this deletes development data.
The collection launcher never starts or resets a stack. It verifies container ownership and endpoints before
loading platform/customer API keys from `.dev/auth/` files with mode `0600` (owner-only read/write).
Set `COMPOSE_PROJECT_NAME` for a separately named stack. Missing, skipped, failed, or empty execution fails validation.

## Required Behavior

The 34 requests cover safe organization details, balance reads, absolute balance replacement, and additive grants.
Idempotency keys identify logical grants so retries apply a grant once. Equivalent replays return the current balance;
reusing a key for a different amount conflicts. Concurrent duplicate, distinct, and conflicting grants must preserve
exact accounting, including when no credit account existed beforehand.

Authentication and platform permission are required. Invalid organization UUIDs (unique identifiers), malformed or
repeated keys, and negative balances are rejected; zero is accepted. A reservation temporarily holds credits for
pending work. Replacing the balance below its held amount returns `409`, leaves the balance unchanged, and reveals
no reservation or operation details.

## Cleanup and Validation

The launcher creates six uniquely named synthetic organizations, checks account/grant counts and exact balances in
PostgreSQL, then deletes only those fixtures and temporary reports, including on failure. One fixture exercises
absolute replacement; another uses a real application reservation. Keys stay in child-process environments;
reports expose only counts and synthetic balances.

After forced termination, inspect organizations named `Bruno platform credit fixture` and remove only confirmed
fixture IDs. Never delete shared organizations or ledger entries by a broad pattern. A ledger is the persisted
record of credit changes. The collection uses the current development schema; no migration or schema reset is needed.

Focused launcher checks:

```shell
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- platform-credits-runner --runInBand
```
