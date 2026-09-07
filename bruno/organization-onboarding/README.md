# Organization Onboarding Bruno Collection

This collection executes 12 requests through the HTTP boundary. A platform service creates an organization and
its first owner invitation. The public preview returns pending organization, email, role, and expiry information.
Acceptance creates the owner, consumed preview returns a generic `410`, and duplicate acceptance returns only
`{ "status": "accepted" }`. Further requests cover an existing-owner conflict, organization-scoping rejection,
unknown tokens, and deterministic expiry. Invitation responses require `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`.

Use the repository-pinned launcher against a development stack owned by this checkout:

```sh
corepack pnpm bruno:organization-onboarding
```

For an isolated stack, include its `COMPOSE_PROJECT_NAME` environment variable. Provision the development service
credential first with the documented Keycloak bootstrap workflow. The launcher validates container ownership and
loads the ignored `.dev/keycloak/service-client.json` and `.dev/keycloak/service-credential.json` internally.
Credentials never enter command arguments. It runs `bru run --env local --sandbox developer` using pinned Bruno
4.1.0 and rejects missing, skipped, failed, or zero-execution results.

Passwords and unknown tokens are generated in process memory. The launcher inserts one invitation with a past
expiry into the owned development database, supplies its token through the child environment, and removes that
exact fixture in a `finally` block. Only the token hash reaches PostgreSQL. The normal HTTP scenarios create
uniquely named development organizations and a Keycloak user; use the documented disposable-stack reset workflow
when those fixtures are no longer useful.

The invitation segment suppresses CLI output before execution. Its reporter writes only numeric counts, boolean
failure flags, and test statuses; it excludes URLs, request variables, headers, bodies, and assertion text before
writing any file, including on failure. Temporary count reports are removed after validation. Do not run this
collection with unrestricted CLI reporters or capture network, response, trace, screenshot, or video artifacts.

The launcher tests execute the actual pinned collection against a synthetic server and exercise its success and
failure paths. They also prove that runtime secret markers do not enter reporter files or CLI output. This verifies
tooling behavior separately from live Keycloak and PostgreSQL acceptance.

Role hierarchy, final-owner protection, real browser sessions, and MFA behavior are covered by the focused API
integration tests and the team browser scenarios. The collection verifies the existing-user conflict status;
the original-password and realm-role guarantees remain covered by the live Keycloak adapter tests.
