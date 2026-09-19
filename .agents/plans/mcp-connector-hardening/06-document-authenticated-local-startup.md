# Document a Working Local MCP Authentication Setup

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A developer following the MCP package or Bruno README can build and start the authenticated connector.
The instructions identify the required Keycloak realm URL and show how to run the existing HTTP checks.
Public routing checks remain usable without a customer credential, while successful MCP initialization requires one.

This plan delivers one documentation PR with the proposed title `docs(mcp): document authenticated local startup`.
It addresses the missing startup configuration found in PR #705.

## Progress

- [x] (2026-09-19) Rewrote `apps/mcp-server/README.md` as the canonical setup guide: configuration table with
      `OIDC_BACKCHANNEL_URL`, the origin/method/authentication precedence, a foreground launcher snippet deriving
      the realm URL from `loadDevelopmentStack`, and a credential-retrieval section.
- [x] (2026-09-19) Updated both Bruno collection READMEs to the same launcher pattern and linked them to the
      package README instead of duplicating its explanations.
- [x] (2026-09-19) Exercised every documented command live and recorded the results below.

## Plan dependencies

- `mcp-connector/02`
- `mcp-connector-hardening/05`

## Surprises & Discoveries

- Verified the documented `env -u OIDC_BACKCHANNEL_URL node apps/mcp-server/dist/main.js` command genuinely exits
  `1` with `OIDC_BACKCHANNEL_URL is required.` before this document claimed it, rather than assuming the prior
  plan's behavior still held.
- Verified the foreground launcher's signal forwarding directly: sent `SIGTERM` to the launcher process and
  confirmed the owned `dist/main.js` child exited and released port `3002` before the launcher itself exited —
  the documented shutdown story is not just prose.
- Ran the routing collection's six requests against the *same* authenticated-startup connector process used for
  the origin collection's seven (rather than a separately started one), confirming directly that a connector
  which requires `OIDC_BACKCHANNEL_URL` to boot still serves every unauthenticated routing outcome unchanged.

## Decision Log

- Decision: Keep this PR limited to documentation. Author: Codex, 2026-09-18.
  The process already rejects an unset `OIDC_BACKCHANNEL_URL`; the documentation omits this required configuration.
- Decision: Make the package README the canonical local setup guide. Author: Codex, 2026-09-18.
  Collection README files retain their exact build, startup, and run commands and link to that guide for credentials.
- Decision: Derive the realm URL from the stack owned by this checkout. Author: Codex, 2026-09-18.
  Published Keycloak ports can vary, and the Compose hostname is not necessarily reachable from the host.
- Decision: Follow plan 05 before editing the origin collection README. Author: Codex, 2026-09-18.
  Its accepted-origin requests will already use the environment variables documented here.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: `apps/mcp-server/README.md` is now the canonical local setup
guide, documenting `OIDC_BACKCHANNEL_URL` as required with no default, the origin/method/authentication
precedence, a foreground launcher that derives the realm URL from this checkout's own development stack, and a
credential-retrieval section. Both Bruno collection READMEs use the same launcher pattern and link to the
package README rather than reexplaining it; the origin collection's live-run script gained the
`--env-var baseUrl=...` override plan 06 specifies. Live validation confirmed the required-variable rejection,
signal-forwarding shutdown, and both collections (6 and 7 requests respectively) passing against the
authenticated connector — the origin collection twice, cold and warm. No application code changed.

## Context and Orientation

The reviewed PR #705 head is `dffe34cc66085c042343cc5c7aaa75547aeb925f`.
These plans were authored on master commit `e8b7d77688302ea8de9c15bc97f1af8cbb638326` while that PR remained open.
Begin implementation from a base containing the declared prerequisites and recheck their delivered contracts.

The entry point in `apps/mcp-server/src/main.ts` requires `OIDC_BACKCHANNEL_URL` before opening the listener.
`TokenCache` appends `/protocol/openid-connect/token`, so this variable must contain the realm URL rather than the full token endpoint.
At the reviewed head, `apps/mcp-server/README.md` omits the variable from both its startup commands and configuration table.
The README files in `bruno/mcp-request-routing/` and `bruno/mcp-request-origins/` omit it too.
Running the compiled entry point without the variable exits with code 1 and `OIDC_BACKCHANNEL_URL is required.`
That outcome was reproduced during review; it is not evidence that the future documentation is correct.

The routing collection covers public health, unknown paths, rejected methods, and malformed request targets.
Those cases need no customer credential and never exchange a token.
The origin collection also covers successful `POST /mcp` initialization, which does need a credential.
Plan 05 supplies its `MCP_AUTH_CLIENT_ID` and `MCP_AUTH_CLIENT_SECRET` inputs.

`scripts/testing/development-stack.mjs` exports `loadDevelopmentStack` and validates ownership of the checkout.
`scripts/keycloak/customer-fixture.ts` defines the seeded customer ID `lef-svc-dev-fixture`.
The summary `.dev/keycloak/customer-fixture.json` includes `issuer` and `keycloakClientId`, but no client secret.
`customerClientSecret` in `scripts/bruno/async-verification-fixture.mjs` reads the existing secret from Keycloak.
These are existing development helpers, not new connector dependencies.

## Scope and Non-Goals

Edit `apps/mcp-server/README.md`, `bruno/mcp-request-routing/README.md`, and `bruno/mcp-request-origins/README.md`.
Update this living plan with the actual validation results.
Keep the package build step explicit so instructions work when `dist` is absent.

Do not change application code, environment parsing, Bruno requests, dependencies, Compose services, or fixture seeding.
Do not add another launcher script, a public deployment guide, or a customer onboarding flow.
The cache correction remains owned by plan 01 and must precede real business tools.
This documentation must not claim that an incorrect secret is rejected by the uncorrected cache.

## Plan of Work

First update the package README configuration table.
Document `OIDC_BACKCHANNEL_URL` as required with no default and describe its realm URL shape.
Retain `PORT` and `MCP_ALLOWED_ORIGINS` and explain that origin validation runs before method and authentication checks.
Document the Basic header format, generic HTTP 401 body, public health, and HTTP 405 for unsupported MCP methods.
Explain that a configured realm URL allows the process to start, but an accepted authenticated request also needs reachable Keycloak and a valid client.

Replace the launch examples in all three README files with an explicit build followed by the compiled Node entry point.
Show a Node snippet passed through standard input that loads `loadDevelopmentStack(process.cwd(), { persistMetadata: false })` from the repository root.
Derive `OIDC_BACKCHANNEL_URL` as `${stack.keycloakUrl}/realms/lead-email-finder`.
Use `spawn` from `node:child_process` to run `apps/mcp-server/dist/main.js` with that variable in its environment.
Set `PORT=3002` and `MCP_ALLOWED_ORIGINS=https://client.example` for the collection examples.
Keep the server in the foreground, forward termination to the owned child, and wait for its exit.
Do not print the stack object because it includes credentials.
If the port is occupied, change both `PORT` and the collection base URL; do not stop an unknown process.

Document that the checkout must own a development stack that is running and already seeded.
Link to the root development setup and seed instructions without running or prescribing a destructive reset as routine validation.
The host process uses the published loopback Keycloak URL.
Explain that `http://keycloak:8080/realms/lead-email-finder` is appropriate only for a process on the Compose network.
Do not change the optional meaning of the same variable for the separate API application.

In the canonical credential example, read the customer summary privately and match its issuer to the derived realm URL.
Require `keycloakClientId` to equal `lef-svc-dev-fixture` before calling `customerClientSecret(stack, clientId)`.
Do not use `.dev/keycloak/service-client.json` as the MCP customer credential; it belongs to a privileged fixture.
Pass the recovered secret to the Bruno child only through `MCP_AUTH_CLIENT_SECRET` in its environment.
Pass the ID through `MCP_AUTH_CLIENT_ID`.
Avoid commands that print, persist, or place the secret or encoded Basic header in shell history or process arguments.
Keep the example inside Markdown; do not add a source helper just to shorten the prose.

The routing guide must state that its six requests remain unauthenticated even though server startup requires the realm URL.
Preserve its `MCP_BASE_URL` input and its raw-target coverage explanation.
The origin guide must preserve the seven requests established by plan 05, including public and rejection cases without inherited auth.
Use `--env-var baseUrl=http://127.0.0.1:3002` when overriding its endpoint URL, which contains no secret.
Link from both collection guides to the canonical credential setup and remove stale claims that authentication is absent.

## Interfaces and Dependencies

There is no runtime interface change.
The documented server inputs are `PORT`, `MCP_ALLOWED_ORIGINS`, and the required `OIDC_BACKCHANNEL_URL`.
Routing retains `MCP_BASE_URL`; origin checks use their `baseUrl` environment variable and the plan 05 credential inputs.
The full development fixture is required for authenticated smoke checks, not for token-free routing behavior itself.
This work does not depend on deployment or future verification tools.

## Acceptance Criteria

- On a checkout with dependencies and its seeded stack, each README starts with an explicit successful package build.
- The documented startup procedure opens the requested listener and `GET /health` returns HTTP 200.
- A process started without `OIDC_BACKCHANNEL_URL` exits with code 1, matching the documented requirement.
- All six routing requests pass without a Basic header. All seven origin requests pass with the documented setup.
- An accepted-origin request without credentials returns HTTP 401; denied origins still receive HTTP 403 before authentication.
- The examples obtain the customer secret from its real source and contain no literal secret or privileged MCP identity.
- Stopping the example leaves no owned connector child listening on the chosen port.
- Harper passes on every edited Markdown file. Runtime and live Keycloak evidence are reported separately.

## Validation

From the repository root, with the prerequisites installed:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
env -u OIDC_BACKCHANNEL_URL node apps/mcp-server/dist/main.js
```

The second command must exit with code 1. Do not classify that expected rejection as a startup failure in the final report.
Execute each README startup snippet and confirm health with `curl --fail http://127.0.0.1:3002/health`.
Use a separate terminal for the collections. The routing requests need no credentials:

```sh
cd bruno/mcp-request-routing
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

For origins, the README must show one Node snippet that retrieves the credential and launches Bruno before exiting.
Validate that complete snippet from the repository root.
It must call `spawn('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local', '--env-var', 'baseUrl=http://127.0.0.1:3002'], options)`.
Set `options.cwd` to `resolve('bruno/mcp-request-origins')` and use `stdio: 'inherit'`.
Set `options.env` to the parent environment plus `MCP_AUTH_CLIENT_ID: clientId` and `MCP_AUTH_CLIENT_SECRET: secret`.
Await the child exit and propagate a nonzero result.
An earlier child process cannot export credentials to a later shell; do not present those as separate setup and execution steps.

Record six and seven executed requests respectively, not collection discovery alone.
If the owned stack is unavailable, check examples statically and report live validation as unverified.
Do not mark the runtime acceptance criteria complete in that case.
After stopping the documented launcher, verify that its child exited and the listener closed.
From the repository root, run:

```sh
corepack pnpm docs:lint -- apps/mcp-server/README.md bruno/mcp-request-routing/README.md bruno/mcp-request-origins/README.md .agents/plans/mcp-connector-hardening/06-document-authenticated-local-startup.md
```

## Idempotence and Recovery

The examples read existing fixture credentials without creating clients or changing permissions.
Repeated builds and protocol initialization create no product data.
Stop only the connector process started for this validation; keep the owned development stack intact.
A documentation revert needs no database cleanup or migration.

## Artifacts and Notes

Plan 05 owns the origin request changes and its initial credential notes; preserve those when updating the guide.
Plan 01 owns the incorrect-secret regression and credential cache changes.
This plan documents the current startup contract and does not certify either unrelated implementation.
Follow root `AGENTS.md` for synced issue assignment and PR linkage when implementation starts.
For this documentation implementation, report Bruno additions as not applicable and separately record the existing collection results.

## Plan readiness

Ready to implement
