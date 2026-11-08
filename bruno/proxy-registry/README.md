# Proxy Registry Collection

Bruno runs API requests with assertions. Provision this checkout's disposable stack, then run:

```shell
corepack pnpm bruno:proxy-registry
```

Set `COMPOSE_PROJECT_NAME` for a separately named stack; see [the stack guide](../../docker/README.md).
The launcher checks ownership before loading the private platform API key. All 27 requests and 27 tests must pass;
missing, skipped, or empty execution fails. Use this launcher rather than an unconfigured credential-bearing CLI.

A proxy forwards verification traffic. The collection checks authentication, creation disabled by default,
credential-free responses, updates with omitted or replaced credentials, lifecycle changes, blacklist deduplication,
and deletion. Pagination uses a cursor, an opaque continuation value; traversal, terminal and malformed cursors are
checked. Create/update responses use `Cache-Control: no-store`, including rejections.

Two labeled proxies start disabled. One is briefly activated, drained, disabled, and blacklisted. Draining excludes
new allocation but does not prove that existing leases—temporary ownership of a proxy—have finished. Only captured
fixture IDs are deleted. Cleanup requests continue after assertion failures; if interrupted, inspect descriptions
starting `Bruno proxy-registry` and remove only confirmed fixture IDs.

Synthetic credentials are generated at runtime. Reports contain only counts and pass/fail states; bodies, headers,
assertion values, and raw CLI output are suppressed before writing, including on failure. Do not capture network
or browser artifacts. HTTP responses cannot prove that an omitted credential update preserved stored credentials;
focused backend tests cover that persistence rule.

Focused launcher checks use the pinned CLI against a synthetic HTTP server:

```shell
node --test scripts/bruno/proxy-registry-runner.test.mjs scripts/bruno/organization-onboarding-runner.test.mjs
```

Those checks verify tooling and isolation; run the collection separately to validate the live stack.
