# Better Auth Runtime

A technical library that composes one Better Auth instance for human authentication. It owns the native
database tables, the authentication mail transport, and passwordless native user provisioning. Business decisions,
such as organizations, memberships, roles, credits, and audit records, remain in the business modules.

Consumers import only the bare alias `@tuposoft/lead-email-finder/better-auth`. Application and domain code must not
import this library, its native instance, or Better Auth types; infrastructure adapters in business modules use it.

## Public API

- `BetterAuthRuntimeModule` composes the runtime from `ConfigService`. It also registers the mapped native entities
  with `TypeOrmModule.forFeature`, so the importing process needs `TypeOrmModule.forRoot`. The runtime starts only
  after that data source exists, which places native startup after TypeORM synchronization.
- `BETTER_AUTH_RUNTIME` resolves a singleton `BetterAuthRuntime`. Its `auth` property is the native instance
  (`NativeAuth`), and `close()` releases the owned `pg.Pool` and SMTP transport. The module calls `close()` on
  application shutdown.
- `AUTH_MAIL_DELIVERY` resolves `AuthMailDelivery.send(message)`. It delivers transactional authentication
  mail only and never calls email-verification probes. It rejects with a redacted `AuthMailDeliveryError` whose
  reason is `invalid-message`, `rejected`, or `unavailable`.
- `NATIVE_HUMAN_USER_PROVISIONER` resolves `NativeHumanUserProvisioner.ensureUnverifiedByEmail(email)`. It inserts
  or reuses a passwordless native user and never upgrades an existing verification flag. It also creates no
  account or session and grants no business authority. Concurrent inserts settle on the unique email index;
  case-variant duplicates are refused as ambiguous.
- `openBetterAuthRuntime(configuration, overrides)` is the framework-free composition used by the module and by
  compiled tooling. `createBetterAuthConfiguration(read)` validates settings without echoing their values.
- `BETTER_AUTH_TABLES`, `BETTER_AUTH_COLUMNS`, and `BETTER_AUTH_ENTITIES` describe the mapped schema.

## Native Configuration

The runtime selects the magic-link plugin with registration disabled and hashed token storage. It also selects
passwordless TOTP. Password sign-in, telemetry, secondary session storage, and the cookie cache are disabled.
Sessions are stored only in PostgreSQL. Native IDs are UUIDs. No HTTP handler is mounted; later API adapters call
the native server API directly. Secure cookies follow the `APP_BASE_URL` scheme. Native log messages pass through
a redaction step that removes URLs, email addresses, and token-like values.

| Native model   | Table                       |
| -------------- | --------------------------- |
| `user`         | `better_auth_users`         |
| `session`      | `better_auth_sessions`      |
| `account`      | `better_auth_accounts`      |
| `verification` | `better_auth_verifications` |
| `twoFactor`    | `better_auth_two_factors`   |

Columns use snake case. TypeORM synchronization owns the disposable schema; the Better Auth migration CLI is never
used. The TOTP secret and recovery codes are encrypted by the plugin with `BETTER_AUTH_SECRET`.

## Configuration

A process validates these settings only when it composes the runtime:

| Setting                   | Rule                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`      | At least 32 characters; `BETTER_AUTH_SECRET_FILE` is supported.            |
| `APP_BASE_URL`            | HTTP or HTTPS origin; production requires HTTPS.                           |
| `POSTGRES_URL`            | The application PostgreSQL connection.                                     |
| `AUTH_MAIL_SMTP_HOST`     | A hostname without scheme or port.                                         |
| `AUTH_MAIL_SMTP_PORT`     | 1 to 65535.                                                                |
| `AUTH_MAIL_SMTP_SECURE`   | Optional boolean for implicit TLS. Production otherwise requires STARTTLS. |
| `AUTH_MAIL_SMTP_USER`     | Optional; requires `AUTH_MAIL_SMTP_PASSWORD`.                              |
| `AUTH_MAIL_SMTP_PASSWORD` | Optional; `AUTH_MAIL_SMTP_PASSWORD_FILE` is supported.                     |
| `AUTH_MAIL_FROM`          | A sender address, optionally with a display name.                          |

The SMTP adapter uses bounded connection, greeting, socket, and send timeouts. It disables transport logging, so
addresses, sign-in links, and provider responses are never logged.

## Module Format

Better Auth is ESM-only, and the application compiles to CommonJS. SWC rewrites the runtime's `import()` calls as
`require()`, which Node 22.12 and later resolve through `require(esm)`. A global SWC `ignoreDynamic` setting would
break the generated Swagger metadata loader, so it is not used. Jest cannot load the package; unit tests inject
substitutes, and the compiled-process suite below proves the real package.

## Validation

```sh
corepack pnpm test -- src/libs/better-auth scripts/better-auth --runInBand
corepack pnpm test:auth-runtime
```

`test:auth-runtime` compiles the runtime and tooling into the ignored `.dev/auth-tools` directory and runs them with
`node --test`. It starts a checkout-owned disposable Compose project from `docker/compose.auth-runtime-test.yaml`.
That project contains a `*_test` PostgreSQL database and the base `auth-mail` service definition. Each run uses a
random schema. The runner rejects reports with failed, skipped, missing, or zero tests. Remove the owned project with
`node scripts/testing/auth-runtime.mjs --down`.

The development fixtures and operational steps are described in [the authentication guide](../../../docs/auth/README.md).
