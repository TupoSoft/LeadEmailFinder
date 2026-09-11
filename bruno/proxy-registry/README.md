# Proxy Registry Bruno Collection

Run the collection through the repository's pinned launcher after provisioning a disposable stack owned by this
checkout:

```shell
corepack pnpm bruno:proxy-registry
```

For a separately named stack, set `COMPOSE_PROJECT_NAME` to that project's name. See
[the isolated-stack instructions](../../docker/README.md). The launcher verifies container ownership before reading
ignored service-client metadata. It selects the owned gateway's host URL and the public Keycloak issuer explicitly,
loads the platform service credential internally, and uses the developer sandbox. Do not run the credential-bearing
collection directly with an unconfigured Bruno CLI.

The launcher requires all 27 requests and 27 tests to execute successfully. Its report contains only execution
counts and pass/fail states. Request bodies, response bodies, headers, assertion values, and CLI output are suppressed
before reports are written, including failures. Synthetic proxy authentication is generated at runtime and is never
printed. No credential-bearing browser or network artifacts are created.

The collection covers unauthenticated access, disabled creation by default, and redaction of credentials from every
response, including healthy selection. It checks cursor traversal, the empty terminal cursor, invalid cursors,
field updates that omit authentication, and complete and incomplete credential replacement. It also covers lifecycle
changes, blacklist visibility and deduplication, and deletion.
Successful and rejected create/update responses must use `Cache-Control: no-store`.
The HTTP read model cannot prove which credential remains stored after an update that omits authentication. Focused
backend tests cover that persistence contract; the collection verifies omission and the returned visible fields.

Two uniquely labeled proxies are created, and only their captured IDs are deleted. Both start disabled. The lifecycle
fixture is briefly activated before being drained, disabled, blacklisted, and deleted. Draining state makes no claim
about existing leases. The pinned CLI continues to the cleanup requests after assertion failures; the runner tests
verify this behavior. If execution is interrupted before cleanup, inspect the synthetic descriptions prefixed with
`Bruno proxy-registry`, confirm the exact fixture IDs, and remove only those fixtures. Do not reset shared data.

Focused validation runs the real pinned CLI against a disposable HTTP contract fixture, checks credential-safe
failure reporting, and verifies that unrelated proxies remain in the registry:

```shell
node --test scripts/bruno/proxy-registry-runner.test.mjs scripts/bruno/organization-onboarding-runner.test.mjs
```

This fixture validates collection and launcher behavior. It does not replace running the collection against the
checkout-owned API and Keycloak stack.
