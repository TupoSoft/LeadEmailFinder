# Enforce SMTP connection deadlines

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An SMTP attempt through an unresponsive proxy or MX host must terminate within the configured connection deadline,
close its socket, and release its proxy lease so the worker can try another candidate. After this change,
`ConnectOptions.timeout` is an enforced contract rather than ignored data, and successful direct, HTTP, HTTPS,
SOCKS4, and SOCKS5 connections retain their current behavior.

## Progress

- [ ] (2026-08-20) Enforce one deadline across socket connection and proxy negotiation.
- [ ] (2026-08-20) Make SMTP timeout cleanup destroy sockets and release allocations deterministically.
- [ ] (2026-08-20) Add fake-timer and local-socket direct/proxy timeout coverage.
- [ ] (2026-08-20) Run focused, full, and SMTP fixture validation and record the outcome.

## Plan dependencies

- `proxy-fleet/08`

## Surprises & Discoveries

- `SmtpClient.connect()` passes `DEFAULT_SMTP_CLIENT_TIMEOUT` to the socket library and listens for `timeout`, but
  `connect()`/`directConnect()` never read the option or call `setTimeout`.
- Greeting/command `promiseWithTimeout()` rejects without cancelling the underlying I/O; a connection failure before
  `SmtpVerifier` receives the client can leave cleanup dependent on remote socket behavior.

## Decision Log

- Decision: The connection deadline covers the entire direct or proxy negotiation until a usable destination socket
  is returned, not only the first TCP connect event.
  Rationale: A proxy that accepts TCP and then stalls during CONNECT/SOCKS negotiation is the same unavailable
  capacity from the verifier's perspective.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Deadline expiry aborts/destroys the socket with a typed timeout error and clears its timer in every
  success/failure path.
  Rationale: Emitting `timeout` alone does not close Node sockets or settle all pending event waits.
  Date/Author: 2026-08-20, source-audit planning.
- Decision: Keep greeting, MAIL, and RCPT deadlines separate but make every timeout destroy the client socket.
  Rationale: No timed-out SMTP command may continue in the background or reuse an indeterminate protocol session.
  Date/Author: 2026-08-20, source-audit planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/libs/socket/src/connect.ts` selects direct or proxy strategies from `ConnectOptions`. Strategies use
`connectAsync`, `createConnectionAsync`, TLS, `readBytes`, and `readUntil`. `SmtpClient.connect()` supplies an
existing `Socket`, signal, and `DEFAULT_SMTP_CLIENT_TIMEOUT`, then waits for the greeting. `SmtpVerifier` acquires a
Redis-backed proxy lease, calls the client, and releases the lease after success or failure.

## Scope and Non-Goals

Enforce existing connection and SMTP command deadlines, deterministic socket cleanup, and lease-release behavior.
Preserve proxy selection, capacity limits, protocol authentication, SMTP result classification, public endpoints,
and default timeout values. Do not add retries inside the socket library, change proxy health state, add new
configuration, redesign streams, or add infrastructure deployment work.

## Plan of Work

Implement a deadline helper at the socket connection boundary. It creates a timer/abort source for a positive
`ConnectOptions.timeout`, combines it with the caller's abort signal without losing either reason, passes the
effective signal through direct/proxy/TLS negotiation, destroys the active socket on deadline, and clears listeners
and timers in `finally`. Export or locally define a typed connection-timeout error so callers can distinguish it
from authentication and protocol failures. Ensure all event waits settle when the socket closes or aborts.

Update `SmtpClient.connect()` to map the connection deadline to `SmtpClientTimeoutException` as appropriate and to
destroy the socket whenever connection or greeting fails. Refactor `promiseWithTimeout` or its call sites so MAIL,
RCPT, greeting, and other timed commands cancel/close the protocol session instead of only winning a `Promise.race`.
Keep `SmtpVerifier`'s existing `finally` release path and add assertions that each failed attempt releases once and
moves to the next candidate.

Add deterministic socket-library tests for a direct target that never completes and proxy servers that accept TCP
but never finish HTTP CONNECT or SOCKS negotiation. Use short test-local deadlines, fake timers where stable, and
explicit socket/server teardown. Add SMTP client/verifier tests for typed timeout, destruction, allocation release,
and successful regression. Existing listener tests may need execution outside the restricted sandbox.

The HTTP response contract is unchanged and the failure path is adequately demonstrated below HTTP through real
socket and verifier integration tests. Bruno does not need a flaky blackhole request; run the existing
`bruno/smtp-dev` success workflow as regression coverage when its disposable fixture is available.

## Interfaces and Dependencies

Make `ConnectOptions.timeout` effective and optionally add an internal/exported `ConnectionTimeoutError`. No new
environment variable, endpoint, database field, or dependency is required. Preserve caller-provided `AbortSignal`
behavior and the default SMTP connection deadline.

## Acceptance Criteria

- Direct TCP connection, HTTP/HTTPS CONNECT, SOCKS4, and SOCKS5 negotiation reject within the configured deadline
  when the peer stalls.
- Deadline rejection destroys the socket, clears timers/listeners, and leaves no open test handles.
- A timed-out SMTP attempt releases its proxy lease exactly once and allows the verifier to try the next candidate.
- Greeting, MAIL, and RCPT timeouts close the socket so no command continues in the background.
- Caller abort remains distinguishable from deadline expiry.
- Successful direct/proxy connections and the local SMTP verification fixture retain existing behavior.

## Validation

Run socket stream/strategy specs, new connection-deadline specs, SMTP client/factory/verifier specs, and proxy
allocation specs. Run listener-based tests outside sandbox restrictions if `listen EPERM` occurs. Then run
`corepack pnpm typecheck`, `corepack pnpm lint`, the full Jest suite with `/tmp` temporary paths, and
`git diff --check`. Run `bru run --env local` for `bruno/smtp-dev` when the fixture is available.

## Idempotence and Recovery

The change is runtime-only and stateless. Every deadline installs and removes its own timer/listeners. Aborted
connections release their Redis lease through the existing verifier path; lease TTL remains a fallback after process
death. No database reset or reseed is required.

## Artifacts and Notes

Record configured deadline, observed elapsed range with test tolerance, socket closed state, and lease-release count.
Never record proxy credentials.

## Plan readiness

Ready to implement.
