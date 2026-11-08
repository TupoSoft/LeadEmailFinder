# Asynchronous Email Verification

Bruno runs API request collections with assertions. From the repository root:

```shell
corepack pnpm bruno:async-verification
```

Use this checkout's provisioned, disposable Compose stack with the SMTP overlay. SMTP is the mail protocol used
for mailbox probes. The launcher checks container ownership before loading private platform and customer API keys
from `.dev/auth/`. It requires all 22 requests and 22 tests to pass; missing, skipped, or empty results fail.

## What Must Hold

- Status is `queued`, `running`, `completed`, `failed`, or `unavailable`. The normal fixture must complete;
  `failed` or `unavailable` stops the run.
- A reservation temporarily holds a credit. The `person@lef.test` fixture accepts every recipient, including the
  deliberately nonexistent catch-all control address, so its result is inconclusive and releases the hold.
- A repeat address within 60 seconds receives `429 verification_cooldown` before another reservation.
- An `Idempotency-Key` makes retries refer to the same operation without another charge. Reusing it for another
  address conflicts; a key older than 24 hours is expired.
- Foreign organizations' jobs remain concealed. Insufficient credits and customer credit administration are rejected.

## Fixture Safety

The launcher locks the seeded customer, saves its balance, and restores and verifies that balance after success or
failure. Run it sequentially with other verification suites while that customer is idle. After forced termination,
inspect the customer's balance before removing `.dev/async-verification.lock`.

Credentials, URLs, headers, bodies, and assertion values stay out of reports. Failures expose only a fixed stage
and available request position, HTTP status, and counts. Balance-restoration failures also identify the failed
write or confirmation. Jobs are left to the existing cleanup policy; the launcher promises no retention duration.

For the real browser flow, bootstrap the owner and operator first, then run:

```shell
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm --filter ./apps/web test:verification-live
```

The browser suite uses MFA (a password plus a second authentication factor), suppresses sensitive artifacts, and
checks submission, refresh, completion, credit rejection, accessibility, and session loss. It restores the balance.
