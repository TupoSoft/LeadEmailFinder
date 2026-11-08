# Asynchronous Email Verification

This Bruno API-request collection requires a provisioned disposable stack with the SMTP overlay and the credentials
and organization configured in `environments/local.yml`. SMTP is the mail protocol used for mailbox probes.
Run sequentially with other verification collections; these requests change the customer's credit balance.

## What Must Hold

- Status is `queued`, `running`, `completed`, `failed`, or `unavailable`. The normal fixture must complete;
  `failed` or `unavailable` stops the run.
- A reservation temporarily holds a credit. The `person@lef.test` fixture accepts every recipient, including the
  deliberately nonexistent catch-all control address, so its result is inconclusive and releases the hold.
- A repeat address within 60 seconds receives `429 verification_cooldown` before another reservation.
- An `Idempotency-Key` makes retries refer to the same operation without another charge. Reusing it for another
  address conflicts; a key older than 24 hours is expired.
- Foreign organizations' jobs remain concealed. Insufficient credits and customer credit administration are rejected.
