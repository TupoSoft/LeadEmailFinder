# Platform Credit Administration

This Bruno API-request collection requires a provisioned disposable development stack. Configure the credentials
and organization fixtures in `environments/local.yml`, including absent-account and held-credit scenarios.
The collection changes organization balances; prepare and clean up only owned test fixtures.

## Required Behavior

The 34 requests cover safe organization details, balance reads, absolute balance replacement, and additive grants.
Idempotency keys identify logical grants so retries apply a grant once. Equivalent replays return the current balance;
reusing a key for a different amount conflicts. Concurrent duplicate, distinct, and conflicting grants must preserve
exact accounting, including when no credit account existed beforehand.

Authentication and platform permission are required. Invalid organization UUIDs (unique identifiers), malformed or
repeated keys, and negative balances are rejected; zero is accepted. A reservation temporarily holds credits for
pending work. Replacing the balance below its held amount returns `409`, leaves the balance unchanged, and reveals
no reservation or operation details.
