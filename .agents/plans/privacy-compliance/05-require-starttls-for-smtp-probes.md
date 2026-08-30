# Require STARTTLS Before SMTP Mailbox Probing

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

No mailbox probe may transmit a sender or recipient address over an unencrypted SMTP session. After this change,
the client connects, reads the greeting, negotiates `EHLO` and `STARTTLS`, verifies the MX server's certificate
and hostname against Node's normal trust roots plus any explicitly configured SMTP-only root, issues `EHLO` again
over TLS, and only then sends `MAIL FROM` or `RCPT TO`. A developer can observe a TLS-capable local MX still
verify successfully while a deterministic plaintext MX returns `secure_transport_unavailable` and records that it
received no address-bearing command.

## Progress

- [ ] (2026-08-30) Add strict STARTTLS negotiation, default-preserving trust, SNI, and abort-aware deadlines.
- [ ] (2026-08-30) Fail safely before mailbox commands and expose the secure-transport failure reason.
- [ ] (2026-08-30) Prevent reuse of SMTP cache entries not proven to come from an encrypted session.
- [ ] (2026-08-30) Add TLS and plaintext SMTP fixtures, focused trust/socket/SMTP tests, Bruno coverage, and full
      validation.

## Plan dependencies

- `privacy-compliance/03`
- `proxy-fleet/14`

## Surprises & Discoveries

None yet.

## Decision Log

- Decision: STARTTLS is mandatory for every port-25-style SMTP probe; there is no opportunistic plaintext
  production mode.
  Rationale: An opportunistic fallback would still disclose the address when a server or on-path actor removes the
  capability.
  Date/Author: 2026-08-30, Codex.
- Decision: The protocol order is greeting, `EHLO`, capability check, `STARTTLS`, strict TLS handshake, second
  `EHLO`, `MAIL FROM`, `RCPT TO`, and `QUIT`.
  Rationale: SMTP extensions must be rediscovered after TLS, and no address-bearing command may precede successful
  certificate validation.
  Date/Author: 2026-08-30, Codex.
- Decision: Use the MX exchange hostname for TLS SNI and Node's default hostname verification with
  `rejectUnauthorized: true`. When optional file-backed `SMTP_TLS_CA_FILE` is configured, construct the
  connection-scoped `ca` option as `[...tls.getCACertificates('default'), customCaPem]`; when it is absent, omit
  `ca`.
  Rationale: Node replaces, rather than extends, its default trust when a TLS client receives `ca`. Retaining the
  effective default set prevents a fixture or private root from breaking public-root MX validation, while
  connection-scoped composition avoids broadening trust for unrelated outbound clients.
  Date/Author: 2026-08-30, Codex.
- Decision: Missing STARTTLS, a rejected STARTTLS command, certificate failure, handshake timeout, or post-upgrade
  protocol failure returns `exists: null` with reason `secure_transport_unavailable`.
  Rationale: These failures provide no evidence about mailbox existence and must be distinguishable from an SMTP
  rejection after a secure session.
  Date/Author: 2026-08-30, Codex.
- Decision: Add `secureTransport` to cached SMTP verification state and reuse a cached result only when that value
  is true. Existing or failed plaintext records are ignored.
  Rationale: A prior affirmative or negative result must not bypass the new transport requirement.
  Date/Author: 2026-08-30, Codex.
- Decision: Reuse and export the abort-aware `tlsConnectAsync` delivered by `proxy-fleet/14`, and retain its
  deterministic socket destruction and lease-release behavior.
  Rationale: A second handshake implementation would risk losing the deadline and cleanup guarantees already
  established in the socket library.
  Date/Author: 2026-08-30, Codex.
- Decision: Extend timeout configuration with `ehlo` and `startTls`, accept partial test overrides, and make the
  STARTTLS deadline cover both the command response and TLS handshake.
  Rationale: Every pre-address phase must terminate, and tests need short isolated deadlines without restating all
  defaults.
  Date/Author: 2026-08-30, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.ts` currently connects a raw
`node:net` socket, reads the greeting, and exposes `helo()`, `mailFrom()`, `rcptTo()`, and `quit()`.
`smtp-verifier.ts` calls `HELO` and then sends the generated sender and submitted recipient in plaintext. The
parser in `smtp.util.ts` reduces an SMTP reply to a code and message and does not expose multiline `EHLO`
capabilities.

`src/libs/socket/src/tls-connect.ts` already provides an abort-aware `tlsConnectAsync()` as a result of
`proxy-fleet/14`, but `src/libs/socket/src/index.ts` does not export it. The same completed proxy plan makes
connect and command timeouts destroy active sockets and makes `SmtpVerifier` release each proxy allocation.

`src/libs/modules/email-verification/src/email-verifier/smtp/smtp-verification.entity.ts` caches SMTP results by
email address with no indication of whether the probe was encrypted. This repository has no production environment
and uses TypeORM synchronization for disposable development schema changes, so this plan adds no migration.

`docker/compose.smtp-dev.yaml` runs Mailpit and routes it through the local CoreDNS and 3proxy fixtures. The fixture
currently has no certificate or STARTTLS requirement.

The validation workflow in `.github/workflows/validate.yml` explicitly runs Node 24, the current repository
environment reports Node 24, and `package.json` uses `@types/node` 22.18 or newer. Node added
`tls.getCACertificates()` in 22.15, so the API is present in the repository's declared validation runtime and
type surface. The application Dockerfiles currently use the moving `lts` tag; implementation must retain a Node
release that supports this API. Node's official
[TLS documentation](https://nodejs.org/docs/latest-v24.x/api/tls.html#tlsgetcacertificatestype) defines
`getCACertificates('default')` as the actual default set, including configured system or `NODE_EXTRA_CA_CERTS`
sources, and documents that an explicit `ca` replaces that set.

## Scope and Non-Goals

This pull request implements strict STARTTLS negotiation, preserves default certificate trust when adding an
SMTP-only root, adds a secure failure reason, marks secure cache entries, adds trusted local TLS and intentionally
plaintext fixtures, and updates Bruno coverage. It preserves MX resolution, proxy allocation, provider discovery,
verification DTO shapes except for the additional reason value, credit behavior, queue orchestration, and the rule
that the client never sends message data.

It does not add SMTP authentication, implicit TLS on port 465, message delivery, `DATA`, certificate pinning,
DANE, MTA-STS policy retrieval, tenant-specific trust stores, live-Internet probing, retry redesign, database
migrations, or production certificate deployment.

## Plan of Work

Export `tlsConnectAsync` from `src/libs/socket/src/index.ts`. Extend
`src/libs/socket/src/tls-connect.spec.ts` only where necessary to prove an existing connected socket can be
upgraded, a caller abort terminates a stalled handshake, and a certificate or hostname error rejects without
leaving an open socket. Do not weaken the deadline behavior from `proxy-fleet/14`.

Update `src/libs/modules/email-verification/src/email-verifier/smtp/smtp-response.interface.ts` and
`smtp.util.ts` so a multiline reply retains normalized lines and capabilities without changing existing numeric
and enhanced-code parsing. Add focused parser tests for multiline `250-` continuations, the final `250 ` line,
case-insensitive `STARTTLS`, malformed replies, and a capability name appearing only in free text.

Refactor `smtp-client.interface.ts` to replace `helo(hostname)` with
`startSession(hostname): Promise<void>` and add `readonly secureTransport: boolean`. In `smtp-client.ts`, make
the active socket replaceable by the returned `TLSSocket`. `connect()` continues to establish the raw
connection and validate the greeting. `startSession()` sends `EHLO`, requires a standalone STARTTLS capability,
sends the STARTTLS command, waits for its positive reply, upgrades the existing socket with
`tlsConnectAsync({ socket, servername: exchange, rejectUnauthorized: true, ca })`, marks the session secure only
after `secureConnect`, and sends `EHLO` again. Preserve Node's default `checkServerIdentity` behavior; do not
replace or disable hostname verification. Any failure destroys whichever raw or TLS socket is active.

Add a narrow SMTP trust-loader beside `smtp-client.factory.ts`. It reads optional `SMTP_TLS_CA_FILE` once at
startup, rejects an unreadable or malformed CA file, and returns `undefined` when no custom root is configured.
When a custom root is configured, it returns `[...tls.getCACertificates('default'), customCaPem]`; it must never
return the custom root alone. Passing `undefined` causes the client to omit the `ca` property and retain Node's
normal defaults. Thread the resulting value through the factory without exposing it in public DTOs.

Extend `SmtpClientTimeoutConfig` with `ehlo` and `startTls`, change constructor overrides to
`Partial<SmtpClientTimeoutConfig>`, and merge them with defaults. Thread the STARTTLS timeout's abort signal into
the command read and TLS handshake. Read the optional path to a file through
`src/lead-email-finder-api/src/environment-variables.dto.ts` and the narrow `SmtpConfiguration` in
`src/libs/modules/email-verification/src/email-verification-configuration.ts`.

Add a typed `SmtpSecureTransportUnavailableException` under the SMTP folder. Update `smtp-verifier.ts` to call
`startSession()` before constructing or sending the envelope. Map secure-transport negotiation failures to
`exists: null` and `secure_transport_unavailable` without `MAIL FROM` or `RCPT TO`; preserve the existing
`SmtpException` classification only after the secure session exists. Add the reason to `smtp.enums.ts`,
`src/libs/common/src/enums/email-verification/email-verification-reason.enum.ts`,
`src/libs/common/src/interfaces/smtp/smtp-verification-response.interface.ts`, and every exhaustive mapping or
test.

Add a non-null `secureTransport` boolean column with a safe false default to
`smtp-verification.entity.ts`. In `smtp-verifier.ts`, return a cached result only when
`secureTransport === true`; persist true only for results reached after a verified TLS handshake. Secure transport
failures remain non-affirmative and must not turn an older plaintext row into a reusable entry. Update repository
tests to cover old false rows, true secure rows, and repeated failures.

Create fixture-only CA, certificate, and private-key files under `docker/smtp-dev/tls/`, clearly marked as
non-secret and non-production. Configure the existing Mailpit service in `docker/compose.smtp-dev.yaml` with the
certificate, key, and required STARTTLS. Mount the CA read-only into the API and worker services and set
`SMTP_TLS_CA_FILE` to that file. Do not use `NODE_EXTRA_CA_CERTS` for the fixture because this plan keeps the
extra trust scoped to SMTP connections. Add a second Mailpit service with no TLS certificate as an intentional
downgrade fixture. Add its MX and A records to `docker/smtp-dev/coredns/lef.test.zone` and permit only the required
target in `docker/smtp-dev/3proxy.cfg`.

Update `bruno/smtp-dev/02-verify-local-email.yml` to retain the successful secure path. Add
`bruno/smtp-dev/03-reject-plaintext-smtp.yml` for an address at the plaintext fixture, expecting
`exists: null` and `reason: secure_transport_unavailable`; increment later request sequence values so proxy
drain/restore and legacy-credit scenarios remain ordered. Update `bruno/smtp-dev/README.md` and
`src/libs/modules/email-verification/README.md` with the TLS fixture, trust-root, failure-reason, reset, and
validation procedure.

## Interfaces and Dependencies

The SMTP client contract becomes:

    interface ISmtpClient {
        readonly exchange: string
        readonly port: number
        readonly hostname: string
        readonly secureTransport: boolean
        connect(): Promise<void>
        startSession(hostname: string): Promise<void>
        mailFrom(senderEmail: string): Promise<void>
        rcptTo(receiverEmail: string): Promise<void>
        quit(): Promise<void>
        end(): void
    }

The optional configuration is a path to a file, not inline certificate contents:

    SMTP_TLS_CA_FILE?: string

The SMTP trust helper returns `undefined` when the setting is absent. When it is present, the effective `ca`
array is equivalent to:

    [...tls.getCACertificates('default'), customCaPem]

Passing only `customCaPem` is forbidden because it removes Node's public and system trust roots from that
connection. `NODE_EXTRA_CA_CERTS` remains a deployment alternative only if an operator deliberately configures it
before process startup and the SMTP code does not pass an explicit `ca`; it is not the local fixture mechanism in
this pull request.

The new result reason is:

    secure_transport_unavailable

`SmtpClientTimeoutConfig` contains `greeting`, `ehlo`, `startTls`, `mail`, and `rcpt`, while constructor
input accepts a partial override. `SmtpVerification.secureTransport` is required in new synchronized development
state and defaults false for compatibility with pre-reset fixture rows.

This plan depends on `privacy-compliance/03` so new negotiation logs use the PII-safe contract, and on
`proxy-fleet/14` for abort-aware TLS/socket deadlines and deterministic lease release. No new package is required;
use `node:tls` and the existing socket library.

## Acceptance Criteria

- A TLS-capable MX completes greeting, first EHLO, STARTTLS, verified handshake, second EHLO, MAIL, RCPT, and QUIT in
  that order and retains current accepted/rejected mailbox classification.
- The TLS handshake uses the MX exchange as `servername`, `rejectUnauthorized: true`, and Node's default hostname
  check.
- With no custom CA, the TLS client omits `ca` and retains Node's public-root behavior.
- With the fixture CA, the effective connection trust contains every entry from
  `tls.getCACertificates('default')` plus the fixture root; focused tests prove both default-root preservation and
  a successful fixture-root handshake.
- A missing capability, rejected STARTTLS command, invalid certificate, wrong-host certificate, stalled handshake, or
  connection closed during upgrade returns `exists: null` and `secure_transport_unavailable`.
- Every secure-transport failure happens before `MAIL FROM` and `RCPT TO`; the plaintext fixture records neither
  command and receives no submitted or generated address.
- Every failure destroys the active socket, clears timers and listeners, and releases its proxy allocation exactly
  once; focused tests leave no open handles.
- Only cache rows with `secureTransport: true` can answer a verification. A false or legacy-equivalent row causes
  a fresh secure attempt.
- The client never sends `DATA`, a message body, or authentication credentials.
- The secure and plaintext Bruno requests, proxy drain/restore, and deprecated-route credit scenarios all pass in
  the local Docker network.
- Architecture, focused trust/socket/SMTP tests, typecheck, lint, full tests, build, documentation lint, and diff
  validation pass without a migration.

## Validation

Run parser, trust, TLS, SMTP client/factory/verifier, and module-focused tests with open-handle detection:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/socket/src/tls-connect.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-trust.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp.util.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.factory.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-verifier.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp.module.spec.ts --runInBand --detectOpenHandles
    corepack pnpm architecture:check

The trust-loader tests must stub a recognizable default/public-root PEM and assert that it remains in the composed
`ca` array beside the custom fixture root. A separate local TLS handshake must succeed with the fixture root and
matching SNI, while a wrong hostname and an untrusted fixture certificate must fail. The no-custom-root test must
assert that the client omits `ca`. These tests are deterministic and must not probe a live Internet MX.

Before using the shared Docker project, inspect the Compose working-directory label for `lef-api-1` and stop if another
checkout owns it. For an owned disposable stack, reset synchronized data, start both SMTP fixtures, and check health:

    pnpm dev:reset -- --confirm-project=LEF
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d --build
    curl --fail --silent http://localhost:53000/health

Run the exact container-network command in `bruno/smtp-dev/README.md`, including `--network lef_default`, the
container-internal Keycloak issuer, `--sandbox developer`, and `baseUrl=http://api:3000`. All requests must pass.
Inspect only the plaintext fixture's synthetic transcript and assert it contains EHLO/STARTTLS negotiation but no
`MAIL FROM`, `RCPT TO`, `DATA`, fixture address, or generated sender address.

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md bruno/smtp-dev/README.md .agents/plans/privacy-compliance/05-require-starttls-for-smtp-probes.md
    git diff --check

Bruno: add the deterministic plaintext rejection request, update the secure success request as needed, and require
the complete `bruno/smtp-dev` collection to pass inside `lef_default`.

## Idempotence and Recovery

Protocol and configuration changes are safe to reapply. Tests create and close local servers and sockets in
`finally`; fixture certificates are disposable and used only for `*.lef.test`. Because
`smtp_verifications` changes shape and this repository has no production environment, confirm Compose ownership
and run `pnpm dev:reset -- --confirm-project=LEF` before runtime validation so TypeORM synchronizes clean
development data. Do not add a migration or reuse old plaintext cache rows.

If TLS setup fails, stop the owned fixture, verify certificate SAN `smtp.lef.test`, mounted CA contents, Mailpit
STARTTLS settings, and `SMTP_TLS_CA_FILE`, then rebuild the overlay. Never recover by setting
`rejectUnauthorized: false`, passing only the fixture CA, replacing `checkServerIdentity`, falling back to
HELO/plaintext, or bypassing the secure-cache predicate.

## Artifacts and Notes

Record the exact protocol sequence, default trust composition, fixture trust composition, certificate hostname,
secure/failed cache behavior, socket resource-release counts, lease resource-release counts, plaintext-fixture negative transcript assertion, Bruno totals,
and focused/full validation totals. Do not record real addresses, proxy credentials, tokens, raw third-party SMTP
replies, or any non-fixture certificate material.

## Plan readiness

Ready to implement
