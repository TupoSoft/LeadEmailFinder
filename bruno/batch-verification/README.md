# Batch Verification Collection

Run the pinned launcher from the repository root:

```bash
corepack pnpm bruno:batch-verification
```

The launcher verifies that the API, web gateway, Keycloak, and SMTP development fixtures belong to this checkout.
It retrieves the seeded customer client's current secret, preserves the public issuer through the Compose back
channel, and runs `bru run --env local --sandbox developer` with the pinned CLI. It requires all nine requests and
fifteen tests to execute successfully; zero execution, skipped requests, and missing reports fail validation.

The shared verification fixture locks the seeded customer's balance against concurrent verification suites, sets
two credits for the two-row synthetic CSV, and restores and verifies the previous balance after the run. Tokens,
credentials, headers, and bodies are withheld from reports. Run this only against the checkout's disposable stack.

The workflow uploads `fixtures/sample.csv`, checks the five-state public status, verifies finite progress between
zero and one hundred, waits for completion, and downloads the exact two synthetic email rows. The result must use
`text/csv` and the attachment filename derived from the job UUID. An invalid CSV then exercises asynchronous
`invalid_csv` rejection. The remaining requests verify authentication, concealed foreign status and result reads,
and immediate rejection of a non-CSV media type. Worker tests cover insufficient credits and infrastructure failure.

The retained result is read through the existing authenticated API. A later missing object or job is not a promise
of permanent retention. The collection records no job identifiers, customer filenames, rows, or raw worker failures
in committed artifacts. Repeated runs create fresh batch jobs and use the existing retention policy for cleanup.
