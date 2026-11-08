# Better Auth Runtime

This library prepares Better Auth for native human authentication: PostgreSQL storage, authentication email, and
passwordless-user provisioning. It does not mount an HTTP handler or replace the currently wired Keycloak browser
login. Business modules retain organizations, roles, memberships, credits, and audit ownership.

Import only `@tuposoft/lead-email-finder/better-auth`, from infrastructure adapters. Application/domain code must not
import its runtime, native instance, or vendor types.

## Public API

- `BetterAuthRuntimeModule` composes one runtime from `ConfigService` after TypeORM's data source exists.
  TypeORM maps application objects to database tables; the importing process must configure `TypeOrmModule.forRoot`.
- `BETTER_AUTH_RUNTIME` resolves one shared `BetterAuthRuntime`; `auth` exposes `BetterAuthInstance`.
  `close()` releases its PostgreSQL connection pool and mail transport; shutdown calls it automatically.
- `AUTH_MAIL_DELIVERY` resolves `AuthMailDelivery.send(message)` for authentication mail only, never verification
  probes. Redacted `AuthMailDeliveryError` reasons are `invalid-message`, `rejected`, or `unavailable`.
- `NATIVE_HUMAN_USER_PROVISIONER` exposes `ensureUnverifiedByEmail(email)`: create/reuse a passwordless native user
  without changing verification, creating a session/account, or granting authority. The unique email index resolves
  concurrent inserts; case-variant duplicates are rejected as ambiguous.
- `openBetterAuthRuntime(configuration, overrides)` composes without Nest; `createBetterAuthConfiguration(read)`
  validates settings without echoing values.
- `BETTER_AUTH_TABLES`, `BETTER_AUTH_COLUMNS`, `BETTER_AUTH_ENTITIES` describe the schema.
- `betterAuthSessionCookieName(baseUrl)` chooses `lef_session`, automatically prefixed `__Secure-` for HTTPS.
  `betterAuthSessionCookieEffects.run(operation, emit)` captures `Set-Cookie` values per request and emits them even
  on rejection. Adapters call `capture(headers)` before mapping outcomes and append cookies separately; application
  results never carry transport cookie effects.

## Better Auth Configuration

**Magic links** are one-use emailed sign-in links. Registration is disabled and their tokens are stored as hashes.
**TOTP** (time-based one-time passwords) supplies time-based verification codes as a second login factor. Password sign-in, telemetry,
secondary storage, and session-cookie caching are disabled. Sessions live only in PostgreSQL; native IDs are UUIDs
(universally unique identifiers). Logs remove URLs, addresses, and token-like values.

Cookies are HttpOnly (unreadable by browser JavaScript), SameSite=Lax (limits cross-site sending), and scoped to `/`;
HTTPS adds Secure (encrypted transport only) and the `__Secure-` prefix.

| Native model   | Table                       |
| -------------- | --------------------------- |
| `user`         | `better_auth_users`         |
| `session`      | `better_auth_sessions`      |
| `account`      | `better_auth_accounts`      |
| `verification` | `better_auth_verifications` |
| `twoFactor`    | `better_auth_two_factors`   |

Columns use snake case. TypeORM synchronization owns this disposable schema; do not run Better Auth migrations.
The plugin encrypts TOTP secrets and recovery codes with `BETTER_AUTH_SECRET`.

## Configuration

Only processes composing the runtime validate these settings:

| Setting                                          | Rule                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                             | At least 32 characters; `_FILE` alternative supported             |
| `APP_BASE_URL`                                   | HTTP(S) origin (scheme, host, port); HTTPS required in production |
| `POSTGRES_URL`                                   | Application PostgreSQL connection                                 |
| `AUTH_MAIL_SMTP_HOST`, `AUTH_MAIL_SMTP_PORT`     | Mail host without scheme/port; separate port from 1–65535         |
| `AUTH_MAIL_SMTP_SECURE`                          | Optional implicit TLS; otherwise production requires STARTTLS     |
| `AUTH_MAIL_SMTP_USER`, `AUTH_MAIL_SMTP_PASSWORD` | Optional paired credentials; password supports `_FILE`            |
| `AUTH_MAIL_FROM`                                 | Sender address, optionally with display name                      |

**SMTP** is mail delivery protocol. **TLS** encrypts a connection; implicit TLS starts encrypted, while **STARTTLS**
upgrades the SMTP connection before credentials/messages. `_FILE` reads a secret from a file instead of a literal
setting. Delivery timeouts are bounded and transport logging is disabled.

## Module Format

Better Auth uses ESM (JavaScript's `import` module format), while the application emits CommonJS (`require`).
SWC, the compiler, rewrites dynamic imports; Node 22.12+ supports loading the resulting ESM through `require(esm)`.
Do not globally enable SWC `ignoreDynamic`: it breaks generated Swagger metadata loading. Jest tests inject
substitutes; compiled-process tests exercise the real package.

## Validation

```sh
corepack pnpm test -- src/libs/better-auth scripts/better-auth --runInBand
corepack pnpm test:auth-runtime
```

The runtime runner compiles into ignored `.dev/auth-tools` and starts a checkout-owned disposable Compose project
from `docker/compose.auth-runtime-test.yaml`: a `*_test` PostgreSQL database and `auth-mail` service, with a random
schema per run. Missing, skipped, failed, or zero tests fail validation. Remove only its owned project with
`node scripts/testing/auth-runtime.mjs --down`.
