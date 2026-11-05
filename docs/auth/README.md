# Authentication Development Guide

Keycloak remains the active human browser-login provider. The application owns organization API keys for machine
requests; OAuth machine tokens and HTTP Basic client credentials are no longer accepted. The Better Auth human
runtime in [`src/libs/better-auth`](../../src/libs/better-auth/README.md) remains additive until the browser cutover.
This guide covers direct API-key use, development mail, native fixtures, and cleanup.

## Organization API Keys

Human owners and administrators manage keys at `/app/service-clients`. Each create or rotation response discloses
`apiKey` once. Later lists contain only `keyPrefix` and safe metadata. Downloaded `api-key.json` files contain only
`{ apiKey }`; keep them private and never commit or print their contents. Use `Authorization: Bearer <apiKey>`
directly in API and MCP requests. `GET /v1/auth/api-key` returns empty `204` for an active key without requiring
billing permissions; invalid or absent keys return `401`, and a human cookie session returns `403`.

The application persists only the complete key's SHA-256 hash and its first 12 display characters. It reads current
credential state on every authentication attempt; replacing, disabling, or deleting a key revokes its former value after
commit. An already authenticated request may finish. Keys cannot manage other keys even if granted
`credentials:manage`. Management retains human role, organization, Origin, CSRF, and grant-ceiling checks.

Development seeding creates private checkout-owned `.dev/auth/platform-api-key.json` and
`.dev/auth/customer-api-key.json` files with mode 0600. The platform key is development-only and privileged.
Customer keys have `verification:run`, `verification:read`, and `billing:read`; the separate MCP revocation fixture
has only the two verification permissions. Rerunning the seed preserves active fixture keys instead of rotating them.
After an uncertain create or rotation response, refresh safe metadata and explicitly rotate, disable, or delete
before continuing. Do not automatically replay issuance requests.

## Identity Namespace

Native human identities link to local external identities under the fixed issuer `urn:lead-email-finder:auth`.
The identity module exports it as `AUTH_IDENTITY_ISSUER`. The subject is the native `better_auth_users.id`. The
issuer is not derived from an application URL, so changing the public origin never changes identity linkage.

## Authentication Mail

The base Compose stack includes `auth-mail`, a Mailpit service that captures transactional authentication mail and
never relays it. Containers reach its SMTP listener at `auth-mail:1025`. The host can reach these loopback ports:

| Interface | Address                 | Override                        |
| --------- | ----------------------- | ------------------------------- |
| Web UI    | `http://127.0.0.1:8025` | `AUTH_MAIL_HTTP_PORT`           |
| SMTP      | `127.0.0.1:51025`       | `AUTH_MAIL_PUBLISHED_SMTP_PORT` |

This service is independent of the SMTP verification fixture in `docker/compose.smtp-dev.yaml`. Tooling locates it
with `inspectAuthMail` in `scripts/testing/development-stack.mjs`. That function checks the Compose labels, the
checkout path, and a single loopback port binding before any caller reads or deletes messages. Captured mail lives
only in the container and disappears when the container is recreated.

## Native Fixtures

With the default development stack running, seed native users:

```sh
corepack pnpm auth:seed -- --native-only
```

The command compiles the tooling and composes `BetterAuthRuntimeModule` in a Node process. TypeORM synchronizes the
`better_auth_*` tables, and the command creates verified native owner, admin, member, and platform-operator users.
Each user is linked to a local external identity under `AUTH_IDENTITY_ISSUER`. The command creates no membership,
role, credit, password, session, or TOTP enrollment. Reruns keep native and external-identity IDs stable and
preserve existing enrollments.

The command writes `.dev/auth/native-users.json` with mode 0600. It records the checkout, the Compose project,
the issuer, fixture addresses, and IDs, but no password, magic-link token, or TOTP secret. It also creates the ignored
runtime secret `.dev/auth/better-auth-secret.txt` once. The seed refuses metadata from another checkout or stack.
It also refuses symbolic-link directories, files that are not private, ambiguous records, and recorded IDs that no
longer match. The `--native-only` mode remains separate from API-key fixture seeding and does not issue machine credentials.

## Transport Security

Development uses plaintext SMTP to the local capture service and HTTP on `http://localhost:53000`. In production the
runtime requires an HTTPS `APP_BASE_URL`, which also enables secure cookies. It also requires TLS for mail
delivery: implicit TLS when `AUTH_MAIL_SMTP_SECURE=true`, or STARTTLS otherwise.

## Resetting Development Data

`corepack pnpm dev:reset -- --confirm-project=LEF` keeps its Keycloak flow and checkout ownership checks. It also
recreates `auth-mail`, which clears captured mail, and removes `.dev/auth/native-users.json` because those IDs name
rows in the deleted database. It clears the checkout-owned API-key fixture files before reseeding their replacement
credentials and runs the native-only seed. The runtime secret is kept.

For an incompatible native schema change on the default stack, run the guarded reset and let it reseed. The
`test:auth-runtime` harness drops its random schema after each run. Remove its whole Compose project with:

```sh
node scripts/testing/auth-runtime.mjs --down
```

Never use a global Docker prune, and never delete volumes that the reset command has not verified.
