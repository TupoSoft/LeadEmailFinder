# Batch Verification Collection

Bruno runs API requests with assertions. Run from the repository root against this checkout's provisioned,
disposable stack and SMTP (mail-protocol) fixtures:

```shell
corepack pnpm bruno:batch-verification
```

The launcher verifies container ownership, loads private platform/customer API keys, and requires all 20 requests
and 30 tests to pass. Missing, skipped, or empty results fail. It uses an exclusive fixture lock and restores the
customer's original balance, SMTP scenario, and temporary CSV files after success or failure. Run verification
suites sequentially; credentials, headers, and bodies are withheld from reports.

## Required Behavior

- Upload `fixtures/sample.csv` and download its two synthetic rows after completion. CSV means comma-separated values.
  The download uses `text/csv` and a filename derived from the job UUID, a unique identifier.
- Status is `queued`, `running`, `completed`, `failed`, or `unavailable`; progress is finite and between 0 and 100.
  `resultsAvailable` is true only for a completed job with an accepted stored-result location.
- Invalid CSV fails asynchronously with `invalid_csv` and no available result. A non-CSV media type is rejected
  immediately. Missing authentication and foreign-organization reads are rejected or concealed.
- Three case variants of one fresh address reserve at most one credit. The CSV preserves row order and spelling;
  the first row carries the conclusive charge, while the two duplicate rows carry zero charge and share its result ID.
- Two fresh unique addresses with only one available credit leave no partial reservation or charge. The job
  completes with both addresses failed, status reports `{ state: 'settled', reserved: 0, charged: 0 }`, and the balance remains one.

A reservation holds credits until settlement, when they are charged for conclusive evidence or released. The
`evidence.lef.test` fixture rejects a nonexistent control recipient before accepting the target, proving a
chargeable result rather than relying on an accepts-all server. Fresh addresses prevent cached evidence from
satisfying that check.

## Limits

`resultsAvailable` does not probe storage or promise permanent retention: later downloads can return `404` or fail.
Runs create fresh jobs and use the existing cleanup policy. Reports retain no job IDs, filenames, CSV rows, or raw
worker errors.

Mixed cached, shared, and cooldown outcomes are outside this collection. Synthetic runner tests verify assertions
and reporting; they do not prove live SMTP or database behavior. Record live results separately from those tests.
