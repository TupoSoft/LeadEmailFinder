# Batch Verification Collection

This Bruno API-request collection requires a provisioned disposable stack with SMTP (mail-protocol) fixtures.
Configure the credentials, organization, evidence-control address, and generated CSV inputs listed in
`environments/local.yml`. Run sequentially with other verification collections and restore changed fixture data
afterward.

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

Mixed cached, shared, and cooldown outcomes are outside this collection.
