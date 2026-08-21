# Enforce SMTP connection deadlines

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

An SMTP attempt through an unresponsive proxy or MX host must terminate within the configured connection deadline,
close its socket, and release its proxy lease so the worker can try another candidate. After this change,
`ConnectOptions.timeout` is an enforced contract rather than ignored data, and successful direct, HTTP, HTTPS,
SOCKS4, and SOCKS5 connections retain their current behavior.

## Progress

- [x] (2026-08-21) Enforce one deadline across socket connection and proxy negotiation.
- [x] (2026-08-21) Make SMTP timeout cleanup destroy sockets and release allocations deterministically.
- [x] (2026-08-21) Add local-socket direct/proxy timeout coverage (real short deadlines, not fake timers -- see Surprises & Discoveries).
- [x] (2026-08-21) Run focused, full, and SMTP fixture validation and record the outcome.

## Plan dependencies

- `proxy-fleet/08`

## Surprises & Discoveries

- `SmtpClient.connect()` passes `DEFAULT_SMTP_CLIENT_TIMEOUT` to the socket library and listens for `timeout`, but
  `connect()`/`directConnect()` never read the option or call `setTimeout`.
- Greeting/command `promiseWithTimeout()` rejects without cancelling the underlying I/O; a connection failure before
  `SmtpVerifier` receives the client can leave cleanup dependent on remote socket behavior.
- None of `connectAsync`, `createConnectionAsync`, `tlsConnectAsync`, `readBytes`, `readUntil`, or `write` accepted
  or honored an `AbortSignal` before this change -- only the very first TCP leg was nominally abort-aware, via a
  caller-supplied `signal` threaded into `net.Socket`'s own options-level support. Proxy negotiation reads/writes
  and the TLS handshake could hang forever regardless of any configured timeout.
- `socks4-connect.ts` never forwarded the caller's own `socket` into its internal `directConnect()` call (unlike
  `socks5-connect.ts`, which already did). `SmtpClient`'s own socket was therefore never actually connected to
  anything when going through a SOCKS4 proxy -- a pre-existing, unrelated latent bug, fixed as part of this PR
  since it's directly load-bearing for the deadline-destroy mechanism to be meaningful for SOCKS4 specifically.
- `Socket.prototype.destroy(error)` makes Node emit that error asynchronously as an `'error'` event; without a
  listener, an unconsumed socket `'error'` event crashes the process (or, in Jest, surfaces as an "Unhandled
  error"). The original code never called `.destroy()` with an error (only `.end()`, and only from a dead
  `'timeout'` listener that nothing ever triggered), so this never surfaced before. `connect.ts`'s own deadline
  mechanism is unaffected because the destroy always happens *while* `once`/`on` is actively waiting, and Node's
  promise-based `once`/`on` helpers register their own `'error'` listener as part of racing-to-reject -- but
  `SmtpClient`'s own `destroySocket()` calls happen *after* the in-flight wait has already settled (via
  `promiseWithTimeout`'s own abort), so nothing is listening anymore. Fixed with a permanent, silent `'error'`
  listener on `SmtpClient`'s socket, added in the constructor.
- `jest.requireActual<TModule extends {} = any>(...)` defaults to `any` without an explicit generic type
  argument -- `jest.requireActual('@tuposoft/lead-email-finder/socket')` alone is unsafe under this repo's lint
  rules; `jest.requireActual<typeof import('@tuposoft/lead-email-finder/socket')>(...)` is required.
- A `bruno/smtp-dev` regression run surfaced a real, but entirely unrelated, ~135-second delay on `POST /verify`
  for a fresh (uncached) address once catch-all determination kicks in -- traced to `docker/.env`'s committed
  `CATCH_ALL_HTTP_PROXY_URL`/`PROXIES` defaults pointing at a real external proxy (`23.254.226.185:3128`,
  unreachable from this sandbox), consumed entirely by the separate `src/libs/catch-all` module, never by
  `SmtpClient`/`SmtpVerifier`/the socket library this plan touches. Confirmed via `docker logs`: zero `SmtpClient`
  log lines appear during the delay, and the actual SMTP transcript (HELO/MAIL/RCPT/QUIT through the SOCKS5
  fixture proxy) completes in under 1ms once it does run. Not a regression from this change; not otherwise
  investigated further, since it's outside this plan's scope.

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
- Decision: Socket destruction is the primary, load-bearing cancellation mechanism (an explicit `.destroy(reason)`
  from the deadline helper's own tracked-socket bookkeeping); the new optional `signal` parameters threaded
  through `write`/`readBytes`/`readUntil` (via `node:events`' own `{ signal }` support on `once`/`on`) are
  defensive, secondary reinforcement, not the primary mechanism.
  Rationale: destroying the socket is what actually frees the OS resource and reliably unblocks any pending
  `once`/`on` wait (verified empirically: Node's `once`/`on` reject with the exact `destroy(reason)` error when
  the emitter they're waiting on is destroyed with one, via their own built-in error-event handling); a signal
  alone does not close the underlying socket.
  Date/Author: 2026-08-21, implementation.
- Decision: A single, un-combined `AbortController` owned by the deadline helper is the sole source of truth for
  "was this our own deadline" (checked via `deadlineController.signal.aborted`), never derived from inspecting
  the combined `AbortSignal.any([callerSignal, deadlineSignal])`'s own `.reason`.
  Rationale: verified empirically that `once`/`on` with `{ signal }` do not forward a custom abort `reason` (they
  always reject with a generic `AbortError`), so identity can only be established by holding a reference to the
  specific controller that fired, not by inspecting the error an aborted wait rejected with.
  Date/Author: 2026-08-21, implementation.
- Decision: extend `ConnectOptions` with an internal-only `onSocket` callback so the deadline helper always knows
  the currently-live socket to destroy (updated by strategies at each socket transition: raw TCP connect, then
  again after a TLS upgrade), rather than trying to infer "the active socket" from the outside.
  Rationale: a connection can hand off between sockets mid-flight (plain TCP socket upgraded to a `TLSSocket`);
  the deadline needs a socket reference that's always current, and the strategies are the only code that knows
  when that handoff happens.
  Date/Author: 2026-08-21, implementation.
- Decision: `ConnectionTimeoutError` carries `{host, port, timeoutMs}` only, no phase field (TCP connect vs. proxy
  negotiation vs. TLS handshake).
  Rationale: no acceptance criterion requires distinguishing timeout phase, only that it's typed and
  distinguishable from a caller abort; adding a phase would require threading a phase label through every
  strategy call site for a benefit that's currently only nicer logs.
  Date/Author: 2026-08-21, implementation.
- Decision: fix `socks4-connect.ts`'s missing `socket: existingSocket` forwarding to its internal `directConnect()`
  call as part of this PR, even though it's a pre-existing bug outside this plan's literal scope.
  Rationale: without this fix, `SmtpClient`'s own socket is never actually connected to anything when going
  through a SOCKS4 proxy, making the deadline-destroy mechanism meaningless for that specific proxy type; the fix
  is a one-line change matching the pattern `socks5-connect.ts` already uses correctly.
  Date/Author: 2026-08-21, implementation.

## Outcomes & Retrospective

Implemented and fully validated, including a live regression run.

**Socket library** (`src/libs/socket/src/`): new `connection-deadline.ts` (the deadline/abort-combination/socket-tracking helper) and `connection-timeout.error.ts` (the new typed `ConnectionTimeoutError`, exported via `index.ts`). `connect.ts` now owns creating and clearing one `ConnectionDeadline` per call, wrapping `connectThroughProxy`/`directConnect`. `directConnect` tracks the live socket at both transition points (raw TCP connect, post-TLS-upgrade). `http-proxy-connect.ts`, `socks4-connect.ts`, `socks5-connect.ts` all thread the effective signal into every `write`/`readBytes`/`readUntil` call and forward `onSocket` into their internal `directConnect` call (also fixing `socks4-connect.ts`'s pre-existing missing socket-forwarding bug -- see Decision Log). `tls-connect.ts`, `connect-async.ts`, `create-connection-async.ts` gained signal-awareness on their `once`/`on` waits. `stream/write.ts`, `read-bytes.ts`, `read-until.ts` each gained an optional trailing `signal` parameter, all backward compatible (every existing call site kept compiling unchanged).

**SMTP layer**: `smtp.util.ts`'s `promiseWithTimeout` now takes a `(signal) => Promise<T>` factory instead of a bare promise, owns its own `AbortController`, and normalizes whatever error surfaces into the exact timeout error if its own timer fired. `smtp-client.ts`'s `connect()` maps a caught `ConnectionTimeoutError` to `SmtpClientTimeoutException` and destroys the socket on any connect/greeting failure; `sendCommandWithTimeout` does the same for MAIL/RCPT. The dead `this.socket.once('timeout', ...)` listener (nothing ever called `setTimeout` to trigger it) is deleted outright, superseded by the new deadline mechanism. A permanent, silent socket `'error'` listener was added in the constructor -- a real, previously-latent bug surfaced by the new tests themselves (see Surprises & Discoveries): destroying a socket with an error crashes the process unless something is listening. `smtp-verifier.ts`'s `tryConnect()` now calls `client?.end()` in its catch block before rethrowing, so a connect-phase failure (including a new deadline timeout) always tears down the discarded client; the two existing, already-correct lease-release call sites were untouched.

**Tests**: 16 new tests across 5 files -- `connection-deadline.spec.ts` (5, pure unit tests of the helper in isolation), `tls-connect.spec.ts` (1, real local server that never completes a TLS handshake), `connect.spec.ts` (5, real local servers proving typed timeout + bounded rejection time for HTTP CONNECT/SOCKS4/SOCKS5 stalls, a direct-connect regression, and caller-abort-vs-deadline distinguishability), `smtp-client.spec.ts` (4, new file -- none existed before; connect-phase timeout via a mocked `connect` since that deadline is hardcoded to 1 minute and not test-injectable, greeting/RCPT-phase timeouts via real local servers with short constructor-injected timeouts, and a full successful-transcript regression), and one new case in `smtp-verifier.spec.ts`. `--detectOpenHandles` run once across all new/existing socket and smtp tests: no leaked handles. Repo-wide: `corepack pnpm lint`/`typecheck` clean, `corepack pnpm test:ci` 706/706 non-skipped (up from 690), `corepack pnpm build` 436 files/0 issues, `git diff --check` clean.

**Live SMTP fixture regression**: brought up `docker/compose.yaml` + `docker/compose.smtp-dev.yaml`, ran `bruno/smtp-dev` from inside the Docker network per its own README (`docker run --rm --network lef_default ...`) -- all 6/6 requests passed, including the real SOCKS5-proxied verification through the local Mailpit fixture. Confirmed via container logs that the full HELO/MAIL/RCPT/QUIT transcript completes in under 1ms, unaffected by the refactor. Investigated and ruled out an unrelated ~135-second `POST /verify` delay (see Surprises & Discoveries) as a regression -- traced to a pre-existing, committed `docker/.env` default (`CATCH_ALL_HTTP_PROXY_URL` pointing at an unreachable real external proxy) consumed by the entirely separate `src/libs/catch-all` module, confirmed via zero `SmtpClient` log lines during the delay.

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

**Recorded this implementation** (no proxy credentials involved):

| Scenario | Configured deadline | Observed rejection time | Socket destroyed |
|---|---|---|---|
| HTTP CONNECT proxy stall | 50ms | <500ms | yes |
| SOCKS5 proxy stall mid-negotiation | 50ms | <500ms | yes |
| SOCKS4 proxy accepts TCP, never responds | 50ms | <500ms | yes |
| TLS handshake never completes | 30ms (caller abort) | <500ms | yes |
| SmtpClient greeting never arrives | 30ms | <bounded, server-observed close | yes |
| SmtpClient RCPT TO stalls | 30ms | <bounded, server-observed close | yes |
| `tryConnect` catch (any connect failure) | n/a | n/a | `client.end()` called exactly once |

Live fixture (`bruno/smtp-dev`, 2-listener-equivalent single SOCKS5 fixture): 6/6 requests passed; real SMTP transcript (HELO/MAIL/RCPT/QUIT) completed in <1ms.

## Plan readiness

Implemented and live-verified. See Progress and Outcomes & Retrospective.
