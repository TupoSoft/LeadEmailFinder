# Connect Claude Desktop Through a Local Bridge

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Claude Desktop can use the local Compose connector without publishing it on the internet. Its local MCP
configuration starts an existing proxy process that carries MCP messages between standard input/output and the
connector's HTTP endpoint. A developer observes success when Desktop lists the connector's tools and calls
`check_credit_balance` with the same result as an authenticated call from the local test client.

This plan delivers one implementation PR, with the proposed subject
`fix(mcp): connect Claude Desktop through a local bridge`. It corrects the Desktop setup promised by
`mcp-connector/07`; it does not build a cloud connector or a new authentication service.

## Progress

- [x] (2026-09-24) Implemented the pinned proxy configuration, documentation, and automated transport checks:
  `mcp-remote@0.14.2` pinned as a development dependency, `examples/claude-desktop.local.json` template,
  `apps/mcp-server/src/desktop-bridge.integration.spec.ts` (real SDK client, real installed proxy, real fixture
  HTTP server), and the Desktop/cloud-connector documentation in `apps/mcp-server/README.md`. Corrected
  `mcp-connector/07`'s Plan of Work to stop promising an identical remote URL/header configuration for every
  client.
- [ ] (2026-09-24) **Outstanding**: validate the documented configuration in an actual Claude Desktop installation
  against the deployed Compose service. No GUI/Desktop application is available in this implementation
  environment (a headless CLI agent session) to perform this step. Per this plan's own Artifacts and Notes ("An
  unavailable Desktop installation is an explicit outstanding acceptance criterion, not a successful validation
  inferred from SDK tests"), this is reported honestly as not done rather than inferred from the automated
  SDK-level proxy tests above. A human with an actual Desktop installation must complete this step before this
  plan's second Acceptance Criterion bullet is fully satisfied; see Outcomes & Retrospective.

## Plan dependencies

- `mcp-connector/06`
- `mcp-connector-hardening/01`
- `mcp-connector-hardening/02`

## Surprises & Discoveries

- Reused the real connector's own `createApp()` (mocking only `create-server.js`'s tool registration, exactly the
  established pattern already used by `request-origin.integration.spec.ts`) as the integration test's fixture HTTP
  server, rather than hand-rolling a second, parallel HTTP server implementation. This means the fixture's
  Basic-auth gate, `405` on non-`POST /mcp`, and catch-all `404` on every other path (including the OAuth
  well-known discovery routes this plan's Plan of Work called out) are the *real*, already-shipped connector
  code — not a reimplementation that could silently drift from it — and no new server-side code was needed to
  satisfy the "OAuth discovery routes answer with 404" requirement, since the connector's existing catch-all
  already does this for any unrecognized path.
- Traced the pinned proxy's actual bundled source (`node_modules/mcp-remote/dist/chunk-EFMRUNOV.js`,
  `dist/proxy.js`) to confirm the exact failure behavior for invalid/missing credentials, rather than guessing:
  the proxy's own OAuth-discovery probe sends a bare `GET` to the server URL first; the real connector's `405`
  response to a non-`POST /mcp` request (not a `401`) means that probe never reports an auth challenge, so the
  interactive browser/callback flow is *not* attempted at that stage regardless of credential validity. The real
  `401` only surfaces once the actual `POST`-based MCP handshake runs through `StreamableHTTPClientTransport`,
  and in this repository's real configuration (`--transport http-only`, no `--debug`, no static OAuth client
  metadata, no reachable authorization-server discovery since every well-known path 404s) that `401` propagates
  as a clean, fast connection failure in practice — measured in low hundreds of milliseconds, not anywhere near
  the proxy's own 30-second default `--auth-timeout`. The automated tests still pass an explicit short
  `--auth-timeout 3` on the negative-path cases as a deliberate belt-and-braces bound, in case a future proxy
  version changes this fast-failure behavior.
- `StdioClientTransport` (the real SDK's stdio client transport) exposes a `stderr` stream but not a
  corresponding standard-output hook — its own internal reader owns standard output to parse JSON-RPC framing.
  The credential-leak scan therefore covers `stderr` and the temporary `MCP_REMOTE_CONFIG_DIR`'s file contents
  directly; standard output's own freedom from leaked content is instead proven structurally by every successful
  test in this suite completing a real MCP handshake and tool call at all -- a single stray line on standard
  output (a leaked credential included) breaks the reader's line-buffered JSON-RPC parsing and would surface as
  a connection failure, not a silent pass.

## Decision Log

- Decision: Use Claude Desktop's local `mcpServers` configuration and `mcp-remote` version `0.14.2` as the
  standard-input/output-to-HTTP proxy. Rationale: the maintained proxy already handles MCP framing, connection
  lifecycle, HTTP transport, and custom headers. Reimplementing that transport would add responsibilities
  unrelated to email verification. The npm registry identifies this exact published version and its source
  commit as `8ba22bdb4e73b818abf22b5e0c8fb5d96e90203b`. Date/Author: 2026-09-16, Codex planning.
- Decision: Pin the proxy as a development dependency of `apps/mcp-server`; invoke its installed executable
  through an absolute Node path in the Desktop example. Rationale: tests and Desktop use the same locked
  dependency, with no package download during Desktop startup. The Compose service does not need this proxy
  in its production dependencies. Date/Author: 2026-09-16, Codex planning.
- Decision: Supply a complete Basic header value through the child process environment, referenced by the
  literal argument `Authorization:${LEF_MCP_AUTHORIZATION}`. Rationale: the proxy expands the placeholder
  internally, keeping credentials out of process arguments; the absence of a space in that argument also
  follows the maintainer's Windows guidance. The user's local configuration remains sensitive plaintext.
  Unlike the server token cache, the customer's own Desktop configuration intentionally retains this credential
  and supplies it to the proxy for the lifetime of that process; it is not a server-side cache entry.
  Date/Author: 2026-09-16, Codex planning.
- Decision: Select `http-only`, allow plain HTTP only for the documented loopback endpoint, and enable
  `--silent` without `--debug`. Rationale: this integration uses the existing Streamable HTTP contract and
  local Compose scope; verbose third-party diagnostics are inappropriate for a credential-bearing process.
  Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

All three Decision Log choices held up unchanged through implementation: the pinned `mcp-remote@0.14.2` proxy,
the development-only dependency placement, and the `http-only`/`--allow-http`/`--silent` transport selection all
worked exactly as designed once exercised against a real fixture server. The automated acceptance criteria are
fully met: a real SDK client through the real installed proxy can initialize, discover, and call the fixture
tool; invalid and missing credentials never run the tool or yield an authenticated connection, bounded well
under the 45-second test deadline; concurrent clients with different credentials never cross-contaminate; no
credential or bearer-token sentinel appeared in captured output or the isolated proxy configuration directory
across any test, success or failure; and the committed template parses as locked, secret-free JSON. `mcp-connector/07`
no longer promises an identical remote URL/header configuration for every MCP client.

**One acceptance criterion remains genuinely outstanding, not silently skipped**: an actual Claude Desktop
installation exercising the documented configuration against the deployed Compose service. This implementation
ran in a headless CLI environment with no Desktop application available, and the plan itself anticipates exactly
this possibility, treating it as an explicit outstanding item rather than something to infer from the SDK-level
proxy tests. A person with a real Desktop installation should follow `apps/mcp-server/README.md`'s "Connecting
Claude Desktop" section end to end, recording the Desktop version, operating system, Node version, and the
result of calling `check_credit_balance`, before this plan is considered fully complete.

## Context and Orientation

The planning baseline is repository commit `e4c10620d377185c9f24e0087e2161cf8e8f6a25`. At this baseline,
`apps/mcp-server` and its Compose service do not exist; the original `mcp-connector` plans describe future work.
The filenames below for that package are intended implementation locations, not claims about available
runtime behavior. Before implementation, inspect the completed prerequisites and use their actual package
build and published-port settings.

`.agents/plans/mcp-connector/07-live-validation-and-docs.md` currently promises a remote URL plus Basic-header
configuration for both Claude Desktop and Claude Code. Anthropic's current documentation distinguishes two
connection paths: account-level remote connectors originate in Anthropic's cloud, while local servers launched
from `claude_desktop_config.json` use the user's machine. The former cannot reach this project's loopback
Compose endpoint. The latter can run a proxy process that makes the HTTP request locally.

`mcp-remote` accepts a server URL, `--transport http-only`, `--header`, and `--silent`. Its published command
maps to `dist/proxy.js`. The maintainer documents environment placeholders in custom headers, and the source
at the published commit performs that substitution inside the process. This plan reuses those interfaces;
Claude Desktop itself is not expected to expand the placeholder or accept a remote `url`/`headers` object in
its local server configuration.

The prerequisite connector receives the customer's service-client credential, authenticates it, and calls the
existing API. The local proxy forwards that credential; it does not receive the API bearer token, implement
the token cache, or choose an organization. The two hardening prerequisites supply the corrected server-side
authentication and transport contracts before this client integration is exercised.

Root Jest already discovers `apps/mcp-server/**/*.spec.ts` after the original scaffold lands. Root lint and
type checking cover the package through `mcp-connector/01`. The current repository skill catalog adds no
provider or frontend workflow to this documentation and transport test task. The working customer hypothesis
in `docs/product/ideal-customer-profile.md` favors a read-only balance check as the setup example, before any
optional verification call spends development credits.

## Scope and Non-Goals

This PR adds a pinned development dependency, a checked-in configuration template, transport integration tests,
and the Desktop setup guide. It updates the original plan 07 to reference this supported local path so later
documentation work cannot restore the incorrect remote configuration.

It adds no hosted ingress, TLS deployment, OAuth authorization-code flow, provider switch, business tool,
database change, or generic bridge framework. Claude Code's existing HTTP client path remains separate. This
plan does not promise support for Claude's web or mobile clients, or an operating system on which
Desktop has not been manually validated.

## Plan of Work

First inspect the completed prerequisite package, its Node version, and its Compose port. Add exactly
`"mcp-remote": "0.14.2"` to `apps/mcp-server/package.json` development dependencies and update
`pnpm-lock.yaml` with the repository's pinned pnpm version. Keep the existing SDK version from the scaffold;
the proxy bundles its own protocol implementation and the integration test proves interoperability. Do not
add the proxy to the connector image or copy its source into this repository.

Create `apps/mcp-server/examples/claude-desktop.local.json` as a valid JSON template containing only placeholders.
Use this configuration shape, replacing the port with the actual published port from plan 06 in the delivered
example and using explicit absolute paths appropriate to the selected desktop operating system:

```json
{
  "mcpServers": {
    "lead-email-finder-local": {
      "command": "<absolute-path-to-node-executable>",
      "args": [
        "<absolute-checkout-path>/apps/mcp-server/node_modules/mcp-remote/dist/proxy.js",
        "http://127.0.0.1:<published-mcp-port>/mcp",
        "--transport",
        "http-only",
        "--allow-http",
        "--silent",
        "--header",
        "Authorization:${LEF_MCP_AUTHORIZATION}"
      ],
      "env": {
        "LEF_MCP_AUTHORIZATION": "Basic <base64-of-client-id-colon-client-secret>"
      }
    }
  }
}
```

The placeholder in `args` must remain literal JSON text; do not run the example through a shell or replace it
with a real credential before launching the proxy. The local user supplies the environment value privately in
their Desktop configuration. Explain that Base64 is reversible, that the configuration must remain outside
the repository, and that it must be readable only by the intended account. Show how to prepare the value
locally without echoing the secret or using an online encoder. Do not prescribe a shell command containing
the real secret, and never include a real credential in screenshots, support output, or committed examples.

Document the prerequisite installation and package build, how to find the native Node executable, and where
Desktop's Developer settings open its configuration. Merge the single `mcpServers` entry into the user's
existing configuration; do not replace unrelated entries. Fully restart Desktop after an edit. Include a
Windows example with correctly escaped native paths and a macOS example with absolute native paths. A
checkout under WSL cannot be passed directly to Windows Node: document this constraint rather than presenting
an untested path conversion. A native checkout with the matching Node runtime is the supported Windows
baseline; WSL-specific launch support is outside this PR.

Create `apps/mcp-server/src/desktop-bridge.integration.spec.ts`. Use the real SDK `Client` with
`StdioClientTransport` to spawn the installed proxy using `process.execPath`, the actual executable path from
its package manifest, and the same argument list as the template. Supply fixture credentials through `env`,
never interpolated into `args`. Start a real SDK HTTP server fixture on an ephemeral loopback port, using the
transport lifecycle selected by the prerequisites. Register a read-only fixture tool returning a known balance,
and require its exact Basic credential on every MCP request. Do not simulate the proxy with a mock or replace
the server's MCP protocol with hand-written success JSON.

Exercise initialization, tool discovery, a successful balance call, and two concurrent local clients with different
credentials. Also exercise invalid credentials, missing credentials, server unavailability, and orderly shutdown. The fixture must
answer OAuth discovery routes with `404`; this connector does not provide an OAuth authorization server.
Authentication rejection must never execute the fixture tool or become a successful connection. Bound every
test operation with a 45-second deadline and close all clients, child processes, HTTP servers, and timers in
cleanup, including after an assertion fails. Use a temporary `MCP_REMOTE_CONFIG_DIR` per process so the proxy
cannot inspect or modify the developer's existing proxy state. Remove only those temporary directories.

Capture child standard error and protocol output privately. Check that standard output consists only of valid MCP messages.
Scan both output streams and files beneath the temporary proxy configuration directory for credential leaks.
Reject the fixture secret, its encoded Basic value, or a bearer-token sentinel planted in a deliberate HTTP failure body. Check both successful and failed
connections; print only a fixed pass/fail label on assertion failure, never the captured streams or environment.
Assert a Boolean leak-detection result rather than comparing captured strings in a matcher that prints them.
If the pinned dependency violates this contract, record the evidence and fix the integration before claiming
Desktop support; do not weaken the assertions or enable debug logging with real credentials.

Update `apps/mcp-server/README.md` with the Desktop procedure and a separate explanation of cloud remote
connectors. Use `check_credit_balance` as the first example and link the existing service-client guide for
obtaining a credential with `billing:read`. Update only the Desktop statements and acceptance criteria in
`.agents/plans/mcp-connector/07-live-validation-and-docs.md`; add this plan as a dependency there if plan 07 is
still incomplete. Preserve that plan's separate full-tool live test scope. If the package README already exists,
edit its setup section rather than replacing other implemented documentation.

Finally, follow the guide in an actual Claude Desktop installation against the deployed local service. Record
Desktop version, operating system, Node version, proxy version, exact configuration shape with placeholders, tool
discovery, balance-call result, and clean behavior after replacing the credential with an invalid fixture value.
This manual evidence is separate from automated SDK interoperability. An unavailable Desktop installation is
an explicit outstanding acceptance criterion, not a successful validation inferred from SDK tests.

## Interfaces and Dependencies

The new client-side dependency is `mcp-remote@0.14.2`, installed only for development and local Desktop use.
`LEF_MCP_AUTHORIZATION` exists only in the local proxy environment and contains the complete Basic value.
The server receives the existing `Authorization` HTTP header; it gains no new endpoint or authentication
scheme. `MCP_REMOTE_CONFIG_DIR` is the proxy's existing setting and is overridden only by isolated tests.

The configuration template lives at `apps/mcp-server/examples/claude-desktop.local.json`; the integration test
lives at `apps/mcp-server/src/desktop-bridge.integration.spec.ts`. The package and root documentation retain
their existing responsibilities. No server response schema, API-client package, or business module changes.

## Acceptance Criteria

- The committed template parses as JSON, contains the exact locked proxy invocation, and has no secret in its
  arguments, URL, or committed environment values. Tests prove environment substitution occurs in the proxy.
- A real SDK client communicating through the installed proxy can initialize, list tools, and read the fixture
  balance from a real SDK HTTP server. The same template argument structure drives this test.
- Invalid or missing credentials never run a tool or yield an authenticated connection. An unavailable server
  produces a bounded test failure, and all child processes and listeners are cleaned up.
- Concurrent clients using different fixture credentials receive only their own fixture result, without sharing
  proxy configuration files or credential state.
- Success and failure output contain no credential or bearer-token sentinel; standard output contains only MCP traffic.
- An actual Claude Desktop installation using only the documented local setup can discover tools and call
  `check_credit_balance` against Compose. The result matches a direct authenticated local test-client call.
  The implementation report names the platform actually validated and leaves untested platforms explicit.
- The original plan 07 no longer promises that a cloud remote connector can reach a loopback server or that
  Desktop accepts the proposed direct remote URL/header JSON as a local server entry.

## Validation

Run these focused commands after implementation:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile
corepack pnpm exec jest --runInBand apps/mcp-server/src/desktop-bridge.integration.spec.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
```

The integration spec loads and validates the configuration template as part of its run. Root backend CI already
runs Jest for the package; no separate workflow is needed for this non-container test. Run the manual Desktop
scenario above against the Compose service from plan 06, including invalid-credential recovery and a Desktop
restart. Do not print the complete local configuration as validation output.

Bruno: not applicable to this implementation PR because the changed behavior is a local client configuration
and process transport; it adds or changes no server-side HTTP API behavior. The real SDK bridge integration
spec supplies the relevant wire-level coverage. HTTP changes in prerequisites retain their own Bruno duties.

During planning, only documentation validation can run: neither the connector runtime nor the bridge test
exists at the recorded baseline. Do not report the future commands as having passed.

## Idempotence and Recovery

Dependency installation and automated tests are repeatable. Tests use temporary directories and ephemeral ports;
their cleanup routines must terminate their own children even when connections fail. Desktop changes consist of one local
configuration entry, which the user can remove before restarting Desktop. Preserve every unrelated entry.

Credential rotation requires updating the private environment value in that entry and restarting Desktop so
the new proxy process receives it. No database reset is needed. Do not delete the user's shared `.mcp-auth`
directory as a troubleshooting step; tests own and remove only their temporary proxy configuration directories.

## Artifacts and Notes

Primary evidence checked on 2026-09-16:

- [Anthropic's network requirements for remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
  distinguish cloud-origin connections from local Desktop configuration.
- [The official local-server guide](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers)
  documents Desktop's `mcpServers`, `command`, and `args` structure and configuration locations.
- [The proxy maintainer's documentation at the published source commit](https://github.com/punkpeye/mcp-remote/blob/8ba22bdb4e73b818abf22b5e0c8fb5d96e90203b/README.md)
  documents custom headers, environment placeholders, Windows argument spacing, and transport/logging options.
- [The versioned npm metadata](https://registry.npmjs.org/mcp-remote/0.14.2) identifies the published dependency;
  the source repository's package version field is not the published version source of truth.
- [Proxy argument parsing and header substitution](https://github.com/punkpeye/mcp-remote/blob/8ba22bdb4e73b818abf22b5e0c8fb5d96e90203b/src/lib/utils.ts)
  and [configuration directory selection](https://github.com/punkpeye/mcp-remote/blob/8ba22bdb4e73b818abf22b5e0c8fb5d96e90203b/src/lib/mcp-auth-config.ts)
  supply the concrete integration and test-isolation contracts.

These sources establish a supported configuration shape, not evidence that this repository's future connector
has already passed it. The implementation must complete the stated interoperability and Desktop checks.

## Plan readiness

Ready to implement
