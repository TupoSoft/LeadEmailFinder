# Exercise Checkout Crashes in a Disposable Fixture

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A developer can run one repeatable command that stops payment preparation processes at controlled boundaries,
restarts them, and proves the committed work and final credit outcome. A stateful local provider reproduces
remote success followed by a lost response without interrupting real Paddle transactions. This PR delivers the
fixture, its automated assertions, and truthful development evidence as one reviewable outcome.

## Progress

- [ ] (2026-09-17) Add a fixture-owned provider and process-boundary controls outside normal application routes.
- [ ] (2026-09-17) Add isolated runner ownership, cleanup, and complete scenario assertions.
- [ ] (2026-09-17) Extend developer documentation and run deterministic crash and browser recovery checks.

## Plan dependencies

- `checkout-recovery/05`
- `payments/07`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: Prove uncertain dispatch using a local stateful provider rather than killing a real Paddle call.
  Rationale: deterministic control is repeatable and cannot create accidental sandbox duplicates.
  Date: 2026-09-17. Author: Codex, payment recovery planning.
- Decision: Keep the fixture separate from the ordinary stateless stub. Rationale: the stub's calculated URL
  cannot reproduce an external transaction that committed before its response was lost.
  Date: 2026-09-17. Author: Codex.
- Decision: Keep account-bound Paddle observation checks optional and report them separately. Rationale: the local
  command must not need external credentials or claim that a fake validates Paddle's live behavior.
  Date: 2026-09-17. Author: Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The unit and PostgreSQL suites from plan 03 cover atomic admission and controlled handler execution orders. They do not by
themselves prove that an actual process dies and another process discovers the same committed job. The current
`docker/paddle-dev` fixture hosts payment pages and provides tunnel routing, authentication provisioning, and manual
signed-event replay for a path-derived Compose project. Its ordinary stub is deterministic and stateless.
The repository uses owned disposable test stacks and refuses to remove resources belonging to another checkout.

Read `docker/paddle-dev/README.md`, `bruno/credit-purchases/README.md`, the payments README, and the local Paddle
sandbox/testing skill. Follow existing ownership and redaction practices. This task does not authorize payment
transactions on a real account or changes to production infrastructure.

## Scope and Non-Goals

Add a deterministic local crash runner, a test-only provider implementation, fixture orchestration, and executable
assertions. Reuse the shipped payments application services and persistence; do not build a second payment system.
No fault-control HTTP endpoint, fake provider selection, or secrets may enter ordinary API configuration. Do not
change runtime checkout policy merely to make the test pass. Any newly discovered product defect needs its own
bounded fix or an update to the appropriate prerequisite plan.

## Plan of Work

Add a fixture under `docker/checkout-recovery-test/` and runner
`scripts/testing/checkout-recovery.mjs`, exposed as `corepack pnpm test:checkout-recovery`. Use a dedicated Compose
file, a project name derived from the checkout path, fixture labels, and an isolated disposable database. Follow
`scripts/testing/credits-postgres.ts` for ownership checks and private connection metadata, without borrowing or
resetting that runner's database. Bind any control listener to a loopback address or an internal fixture network and never
publish it through the development gateway or Paddle tunnel.

The fixture provider must persist a synthetic transaction independently of the application process. It supports
create, read, and paginated observation through the same narrow ports. Its create operation can commit and then
withhold or drop the response. Controls can delay visibility, return an empty first page with continuation,
introduce a second correlated transaction, and fail a later page. Only the fixture runner can set these controls.
Test bootstrap injects this provider; normal `PAYMENTS_PROVIDER` remains limited to stub and Paddle.

Add a child-process test bootstrap under `src/libs/modules/payments/src/__tests__/checkout-recovery/` using the
real payments module, stores, worker, and HTTP controllers. Keep its port wrappers and fake provider adapter inside
that same module, where its own internal imports are allowed. Override providers through Nest `TestingModule`. The
external runner starts this bootstrap by path and exchanges private IPC messages; it never imports module deep
paths. Other business modules are imported only through public barrels. Exclude the bootstrap from ordinary
application entry points and build outputs, and add no public exports for it. Inject barriers at application-port
boundaries in that bootstrap, not production HTTP handlers. The parent waits for a
specific barrier acknowledgment before terminating the child. Spawn another child against the same committed
application database and independent provider state. Avoid wall-clock sleep races; use bounded waits for explicit
states and injectable short fixture policy budgets where supported. Record every fixture create and ledger effect.

Exercise at least these scenarios:

1. Kill before admission commits and verify neither purchase nor job survives; retry the same key successfully.
2. Kill after admission commit but before a worker claims; restart and obtain the same purchase and one checkout.
3. Pause the first worker before its dispatch marker, expire its lease, and let a second worker claim. Resume the first worker and verify it
   cannot pass its generation check, send a create, or commit stale state. Other scenarios prove actual death.
4. Kill after the dispatch marker but before network send; retain an unresolved attempt without a blind create.
   This deliberately proves the conservative gap rather than claiming automatic recovery for an unknowable event.
5. Let the provider commit and lose its response. First return zero matches, then reveal the transaction on a later
   page. Recover its reference and URL with exactly one recorded provider create.
6. Return multiple candidates, a failed page, or conflicting terms. Keep the result unresolved and expose no URL
   or credit grant; do not issue another create.
7. Kill after the reference and URL commit but before the HTTP response. Retry with the same key and recover the
   same checkout without another provider create.
8. Deliver a completed observation and signed webhook in both orders, and terminate between paid recording, ledger
   grant, and grant marker. Recover exactly one credit grant and a completed status with no checkout URL, including
   when a ledger outage lasts beyond the fifteen-minute investigation budget.
9. Expire a URL and exhaust the automatic investigation budget. Return unavailable states without silently replacing
   the attempt. Current paid state still wins over a late preparation response.

Use the existing `bruno/credit-purchases` collection with a fixture-specific environment. Extend the runner support
in `scripts/bruno/run-collection.mjs` with an explicit owned checkout-recovery fixture manifest; validate its project,
labels, local API origin, and private credential-file provenance before executing the collection. Preserve the
ordinary launcher's current stub-stack selection. The manifest is generated by this fixture runner, never accepted
as arbitrary remote connection input. Reuse existing customer identity provisioning in an isolated fixture-owned
authentication service and assert `401`, `403`, and foreign-organization `404` on the real status resource. Update
collection counts and reporting tests when requests change.

Add `apps/web/playwright.checkout-recovery.config.ts` and
`apps/web/tests/e2e/checkout-recovery-live.spec.ts`. The main runner builds and serves the ordinary frontend against
this fixture's API/auth gateway. It passes the validated local base URL and private identity metadata to Playwright.
Use one Chromium worker with no retries, traces, videos, or screenshots containing checkout data. Do not use
the static-preview configuration or intercept purchase/status requests with canned responses. A test can proxy
and drop only the first POST response after the actual API commits it. Reload, explicitly resume with the stored
key, and assert one purchase and one independent provider transaction through fixture evidence. Also delay a real
ready response until after route departure and verify no navigation. The runner invokes this configuration and the
existing Bruno collection, and fails when either produces missing or skipped required evidence.

Add `scripts/testing/checkout-recovery.test.mjs` to test runner ownership, timeouts, required-scenario reporting,
cleanup on failure, and refusal to use external application databases. A run with any missing or skipped required
scenario must fail. Report scoped resource names and redacted result counts, never keys, URLs, or raw payloads.

## Interfaces and Dependencies

The new command and test-only Compose, bootstrap, and browser configuration files are the only new developer interfaces. The product HTTP
contract remains unchanged from plan 05. Use shared application ports and module public barrels; no cross-module
internal imports are permitted in tests. Update `package.json`, the payments validation README, the fixture README,
and `docker/paddle-dev/README.md` links. Proposed PR title:
`test(payments): exercise checkout crash recovery in an isolated fixture`.

## Acceptance Criteria

- The command runs without Paddle credentials, starts only its own resources, and executes every listed scenario.
- Actual process termination after commit does not lose the durable job; equivalent requests retain one purchase.
- Ambiguous dispatch, incomplete observations, and missing matches produce zero additional create calls.
- A later valid match recovers the original checkout; provider observation of a completed payment and webhook recovery create one grant.
- Paused old workers cannot change current local state, and test results never imply that a lease can undo an
  external Paddle request.
- The browser recovers a lost response after reload and never redirects on a late response after route departure.
- No normal application endpoint or provider configuration exposes the fixture controls.
- Resource removal and reruns cannot stop another checkout's containers or delete another database or provider fixture.
- Optional real Paddle checks, if run, are reported separately from deterministic local evidence.

## Validation

The PR adds the fixture command and runner tests, then runs:

```sh
node --test scripts/testing/checkout-recovery.test.mjs
corepack pnpm test:checkout-recovery
corepack pnpm test:credits-postgres
corepack pnpm bruno:credit-purchases
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost corepack pnpm --filter ./apps/web exec playwright test tests/e2e/billing-ui.spec.ts
corepack pnpm architecture:check
corepack pnpm typecheck
git diff --check
```

The main runner performs the actual process-kill scenarios and invokes
`corepack pnpm --filter ./apps/web exec playwright test --config playwright.checkout-recovery.config.ts --project=chromium`
with the owned fixture metadata. Mocked `billing-ui.spec.ts` tests establish UI handling only; the new fixture
configuration and real HTTP collection execution establish the integrated recovery path. If Docker or browser dependencies are unavailable,
run static/runner tests and state exactly which runtime evidence remains unverified. Do not claim a successful
live Paddle read from the fake provider. Optional sandbox validation may retrieve a specifically identified fixture
transaction and replay an existing notification only under explicit authorization for that external action.

## Idempotence and Recovery

Use TypeORM synchronization in the fixture-owned disposable database; no migrations or production recovery work.
On success or failure, the runner uses its recorded project and labels to clean up only owned resources. Provide
an explicit `--keep-on-failure` option that retains the project identity and cleanup command, with private metadata
under `.dev/checkout-recovery-test/`. A rerun verifies ownership before reusing or resetting those resources.
Do not invoke the fixed base `dev:reset` command or the separate Paddle fixture's cleanup for this test stack.

## Artifacts and Notes

Save a compact report listing each required scenario, pass/fail state, provider create count, purchase/job count,
and ledger-grant count. Record runtime versions and the tested commit. Do not commit account-specific identifiers,
URLs containing transaction IDs, secrets, or raw provider payloads. Update this plan with the actual command results
when implemented; all validation in this newly authored plan is prospective.

## Plan readiness

Ready to implement.
