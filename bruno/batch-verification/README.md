# Batch Verification Collection

Run the pinned launcher from the repository root:

```bash
corepack pnpm bruno:batch-verification
```

The launcher verifies that the API, web gateway, Keycloak, and SMTP development fixtures belong to this checkout.
It retrieves the seeded customer client's current secret, preserves the public issuer through the Compose back
channel, and runs `bru run --env local --sandbox developer` with the pinned CLI. It requires all sixteen requests and
twenty-five tests to execute successfully; zero execution, skipped requests, and missing reports fail validation.

The shared verification fixture locks the seeded customer's balance against concurrent verification suites, sets
two credits for the two-row synthetic CSV, and restores and verifies the previous balance after the run. The duplicate
regression prepares one credit under the same lock. Tokens, credentials, headers, and bodies are withheld from reports.
Run this only against the checkout's disposable stack.

The workflow uploads `fixtures/sample.csv`, checks the five-state public status, verifies finite progress between
zero and one hundred, and requires `resultsAvailable` to be true only for completed jobs. Queued, running, failed,
and unavailable jobs must report false. The workflow waits for completion and downloads the exact two synthetic
email rows. The result must use `text/csv` and the attachment filename derived from the job UUID. An invalid CSV then
exercises asynchronous `invalid_csv` rejection with `resultsAvailable: false`. The remaining requests verify
authentication, concealed foreign status and result reads, and immediate rejection of a non-CSV media type. Worker
tests cover insufficient credits and infrastructure failure.

The retained result is read through the existing authenticated API. A true `resultsAvailable` flag means the completed
job retains a result location accepted by the download route. Polling does not check storage availability. A later
missing object can still return `404`, and storage errors can still prevent a download. The flag does not guarantee
permanent retention. The collection records no job identifiers, customer filenames, rows, or raw worker failures
in committed artifacts. Repeated runs create fresh batch jobs and use the existing retention policy for cleanup.

`verification-billing/05` moved batch billing from one credit per parsed row to at most one credit per unique
normalized address, atomically reserved for the whole upload. Requests 10–16 exercise the payer identity regression
with a temporary CSV containing three case variations of one fresh address under `evidence.lef.test`. The launcher
generates a new address for every run so cached evidence cannot satisfy the fixture. The existing SMTP control service
selects `target_accepted`, which accepts the target after rejecting the catch-all control address.

The duplicate status must report three input rows, one completed unique address, two duplicate rows, and one settled
charge. The CSV must preserve input order and spelling, share one result UUID, and attribute the charge to the first
row with `billingReason: conclusive`. Later rows report `billingReason: duplicate` and zero charge. A balance read
confirms that exactly the credit reported by status and CSV was deducted. The final request restores the baseline
SMTP scenario; the launcher also restores it after success or failure and removes the temporary CSV.

Mixed `cache`/`shared`/`cooldown` uploads and group insufficient-funds fixtures remain outside this collection's coverage.
The pinned CLI runner test uses a synthetic HTTP server and explicitly rejects a debited batch whose receipt reports
zero charge. It also rejects incorrect result availability for every public status and invalid CSV. It checks the
collection scripts rather than proving live SMTP or database behavior. Record live launcher results separately in
the implementation ExecPlan.
