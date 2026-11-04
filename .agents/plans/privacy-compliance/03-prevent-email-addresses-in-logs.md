# Prevent Email Addresses from Entering Logs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Operational logs must remain useful without becoming a second store of submitted email addresses, SMTP transcripts,
HTTP credentials, or provider payloads. After this change, request logging records only an opaque server-generated
request ID, method, sanitized route shape, status, duration, stable operation codes, and opaque internal IDs. A
developer can submit a unique sentinel address through each verification route and failure path, capture the emitted
JSON logs, and prove that the address and its encoded forms never appear.

## Progress

- [x] (2026-09-03 14:01 +0200) Replaced default `Pino` HTTP serialization with a PII-safe request, response, and error contract.
- [x] (2026-09-03 14:01 +0200) Removed addresses, SMTP commands and replies, and provider response details from application logs.
- [x] (2026-09-03 14:01 +0200) Added sentinel-based logger, HTTP, SMTP, provider, async, and exception regression tests.
- [x] (2026-09-03 14:03 +0200) Completed architecture, full-suite, documentation, and static log-site validation.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/02`

## Surprises & Discoveries

- Discovery: `pino-nestjs` logs an unknown Nest exception both as an `err` binding and as a top-level `msg`, so
  an error serializer alone cannot prevent an exception message from reaching JSON output.
  Evidence: the installed `pino-nestjs@0.1.3` logger passes `Error.message` as the second Pino argument.
  Date/Author: 2026-09-03, Codex.
- Discovery: Filtering string stack lines by an `at ...` prefix is not safe because a multiline exception message
  can contain a continuation with that same prefix and make it indistinguishable from a real frame.
  Evidence: `new Error('failure\\n    at sentinel@example.test')` passed the original frame predicate and retained
  the sentinel in the serialized stack.
  Date/Author: 2026-09-03, Codex.
- Discovery: `error.constructor.name` also requires validation before it becomes an application log field; an
  `Error` can have a hostile own constructor value or getter even when Node recognizes it as a native error.
  Date/Author: 2026-09-03, Codex.
- Discovery: DNS cache/lookup logs and proxy lifecycle logs also emitted the submitted domain or derived MX host,
  even though the original file inventory did not include those verification-path adapters.
  Evidence: `dns.service.ts` interpolated `name`, while `StructuredLoggingAllocationObserver` included `mxHost` in
  every structured field set.
  Date/Author: 2026-09-03, Codex.
- Discovery: making email-administration exception messages generic deliberately changes the message text in `404`
  and `409` response bodies, although their status and JSON shape remain stable. The nearest Bruno workflow already
  covers the missing-email rejection and therefore must assert the privacy-safe response.
  Date/Author: 2026-09-03, Codex.
- Discovery: the planned Mimecast test path used the stale name `mimecast-login.spec.service.ts`; the current
  specification is `mimecast-login.service.spec.ts`.
  Date/Author: 2026-09-03, Codex.
- Discovery: an initial full-suite run exposed a preexisting probabilistic assertion in the session-encryption
  tamper test when its generated ciphertext already began with the replacement character.
  Evidence: the isolated session-encryption suite and two subsequent full-suite runs passed without a source change.
  Date/Author: 2026-09-03, Codex.

## Decision Log

- Decision: Generate a UUID request ID inside the service and never copy an inbound request-ID header into logs.
  Rationale: Caller-controlled correlation values can themselves contain personal data or secrets.
  Date/Author: 2026-08-30, Codex.
- Decision: The automatic request record contains only `id`, `method`, and a sanitized path; the response record
  contains only `statusCode`. Headers, cookies, query values, parameters, bodies, IP addresses, ports, and user
  agents are omitted rather than redacted after serialization.
  Rationale: An allowlist is easier to audit and cannot miss a newly added sensitive header or body field.
  Date/Author: 2026-08-30, Codex.
- Decision: Strip the complete query string and replace decoded path segments containing `@` or matching an email
  shape with `:sensitive`; explicitly normalize the `/emails/:email` administration route.
  Rationale: This covers both `GET /verify?email=...` and `GET|PATCH /emails/:email`, including percent-encoded
  addresses, without logging a stable address hash.
  Date/Author: 2026-08-30, Codex.
- Decision: Do not hash email addresses for logging.
  Rationale: Email spaces are enumerable, so a stable hash remains linkable and vulnerable to dictionary recovery.
  Date/Author: 2026-08-30, Codex.
- Decision: SMTP and provider adapters may retain raw replies and addresses in memory only as long as required for
  protocol classification, but logs use stable event names and allowlisted numeric/provider codes.
  Rationale: SMTP replies and vendor errors can echo the submitted address, tokens, or remote diagnostic data.
  Date/Author: 2026-08-30, Codex.
- Decision: Error logs record only a validated error class or stable application code; assertion and HTTP exception
  messages in the email-verification flow become generic.
  Rationale: Serializing `error.message` or any stack content can reintroduce the same address removed from explicit
  log statements.
  Date/Author: 2026-08-30, Codex.
- Decision: A Pino `logMethod` hook replaces the message paired with an `err` binding with
  `application_error`, and the error serializer retains only a validated constructor type without any stack.
  Rationale: Nest and `pino-nestjs` otherwise duplicate the raw exception message outside the serializer, while
  message-controlled fake frames make string stack sanitization unsafe.
  Date/Author: 2026-09-03, Codex.
- Decision: All application `errorClass` fields use one pure `safeErrorType` allowlist rather than reading
  `error.constructor.name` directly.
  Rationale: The shared helper preserves stable class names for operations while falling back safely for hostile or
  non-error values.
  Date/Author: 2026-09-03, Codex.
- Decision: DNS records retain only the record type in logs, while proxy allocation records retain outcome,
  duration, state, and opaque proxy ID but omit the submitted domain and derived MX host.
  Rationale: These adapters run inside the verification path and must satisfy the same no-submitted-domain contract
  without losing operational outcome and timing signals.
  Date/Author: 2026-09-03, Codex.

## Outcomes & Retrospective

Implemented and validated on 2026-09-03. Automatic HTTP logs now use the exact request shape
`{ id, method, path }`, the response shape `{ statusCode }`, and Pino-managed `responseTime`. The integration test
captured two request-completion records: `/verify?email=...` became `/verify`, and an encoded
`/emails/:email` path became `/emails/:sensitive`. A server UUID replaced every inbound request ID, while request
headers, bodies, IP data, exception messages, and stack content were absent from the captured JSON.

SMTP logs now use `smtp_command_sent`, `smtp_response_received`, `smtp_response_rejected`,
`smtp_socket_error`, and `smtp_connection_failed` with command kinds, numeric response codes, enhanced codes, or a
validated error class. Provider failures use `account_discovery_verification` with a stable provider and outcome.
Email-verification, async, batch, domain, DNS, proxy, and email-administration paths now use generic messages or
allowlisted fields; raw values remain in memory only where protocol classification requires them.

The focused regression run passed 20 suites and 110 tests. The repository validation passed typecheck, build,
architecture checking (9 modules and 110 baselined violations), and the full Jest suite (173 passed suites, 10
skipped; 1,399 passed tests, 52 skipped). ESLint completed with no errors and one existing warning in the untouched
`src/libs/config/src/load-secrets.spec.ts`. Documentation lint passed for all three changed Markdown files. Static
inspection found raw SMTP strings only in transport construction and test fixtures, never in logger arguments.
Bruno runtime execution remained unavailable because the documented `smtp-dev` Compose services were not running;
all 16 collection YAML files parsed successfully instead.

The principal observability trade-off is intentional: error stacks are omitted rather than partially sanitized,
because message-controlled multiline content cannot be distinguished reliably from stack frames. Stable event codes,
validated error types, SMTP numeric codes, durations, and opaque IDs retain the operational signals required by this
scope without creating another store of submitted addresses.

## Context and Orientation

Before this implementation, `src/lead-email-finder-api/src/lead-email-finder-api.module.ts` called
`LoggerModule.forRoot()` without an explicit `pinoHttp` policy. `src/main.ts` installed that logger for Nest.
Default request serialization could include a URL with its query and sensitive path segment, and no repository-owned
allowlist defined which request fields were safe. The composition root now uses
`createPiiSafePinoHttpOptions()` as its explicit contract.

The email-verification pipeline has direct PII log sites. In
`src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.ts`, every command and raw reply is
logged, including `MAIL FROM` and `RCPT TO`. The same file and
`smtp-verifier.ts` log remote error messages. `email-verifier.service.ts` embeds a generated or submitted address
in assertion text. The catch-all provider services under `src/libs/catch-all/src/` log addresses and vendor error
messages. `src/libs/modules/email-verification/src/domain/domain-synonym-finder.ts`, async verification
exceptions, and email administration exceptions also construct external-input-bearing messages that can reach
logs.

“PII-safe” in this plan is an explicit logging contract for the current request and verification paths. It does not
mean that arbitrary future application strings are automatically classified.

## Scope and Non-Goals

This pull request configures `Pino` HTTP serialization, sanitizes request targets, removes address-bearing logging
from SMTP, provider, email-verification, async, domain-synonym, DNS, proxy-observability, and email-administration
paths, and adds captured-log tests. It preserves HTTP status codes and response schemas, SMTP classification,
provider selection, queue behavior, database state, and operational correlation through server-generated IDs and
stable event codes. Email-administration rejection messages become generic so the response itself cannot echo the
submitted address.

It does not choose a log vendor, set sink-side retention, delete historical logs, create an audit-log product,
alter legal access logging requirements, encrypt log transport, redact arbitrary future modules, or change
verification outcomes. Historical log deletion and retention are handled by separate lifecycle work.

## Plan of Work

Add `src/lead-email-finder-api/src/pii-safe-logger-options.ts` and
`pii-safe-logger-options.spec.ts`. Export a pure `sanitizeRequestTarget(rawUrl: string): string` and a
`createPiiSafePinoHttpOptions()` factory. The sanitizer must parse against a fixed local base, discard
`search` and `hash`, decode path segments defensively, replace sensitive segments, and return only a path. A
malformed URL must produce a fixed `/invalid-request-target` value, never the original input. Configure
`genReqId` with `randomUUID()`, `wrapSerializers: false`, an allowlisted request serializer, a status-only
response serializer, an error serializer that retains only a validated constructor type and omits stacks, and a
`logMethod` hook that replaces any message paired with an `err` binding with a stable application code.
Wire the factory through `LoggerModule.forRoot({ pinoHttp: ... })` in
`lead-email-finder-api.module.ts`; keep the Nest logger integration in `src/main.ts`.

Add `src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts`. Boot the real logging
configuration with an in-memory destination, issue requests containing a unique sentinel address in query, encoded
path, JSON body, authorization, cookie, user-agent, forwarded-address, and inbound request-ID fields, then parse
every emitted JSON line. Assert the logs contain the generated request ID, method, sanitized path, status, and
duration but contain none of the sentinel, its percent-encoded form, credentials, cookies, body fields, IP address,
or attacker-controlled request ID. Cover both a successful request and a rejected request whose exception message
contains the sentinel.

Refactor `src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.ts` so command logging uses
stable events such as `smtp_command_sent` with an allowlisted command kind, never the command string. Do not log raw
responses or `SmtpException.message`; numeric status and enhanced status codes are safe structured fields.
`smtp-verifier.ts` must log a stable connection-failure code and error class, not `error.message`.
`smtp-client.spec.ts` and `smtp-verifier.spec.ts` must capture a response that echoes the sentinel address and
prove the logger never receives it.

Replace address- and vendor-message-bearing logger calls in
`src/libs/catch-all/src/microsoft-get-credential-type/microsoft-get-credential-type.service.ts`,
`mimecast-login/mimecast-login.service.ts`, and `office-apps/office-apps.service.ts` with stable provider and
outcome codes; update their specs. Audit `microsoft-login` while touching the provider surface and add negative
assertions if it begins logging. The prerequisite has already deleted the LinkedIn adapter; do not recreate or test it
for this audit. Replace external-input-bearing assertion text in
`email-verifier.service.ts`, domain-synonym logging in `domain/domain-synonym-finder.ts`, and address-bearing
messages in `email/email-not-found.exception.ts`, `email/email-already-exists.exception.ts`,
`async-email-verification/greylisted.exception.ts`, and adjacent current email-verification exceptions with
generic messages plus safe internal codes. Update focused specs to assert both unchanged classification/status and
safe logger arguments.

Remove submitted domains from DNS cache/lookup messages and derived MX hosts from proxy allocation, connection, and
lease-release fields. Preserve DNS record type and the proxy outcome, duration, state, and opaque proxy ID. Extend
the focused DNS and proxy observer specifications with sentinel-negative assertions.

Document the logging allowlist and the prohibition on addresses, hashes, raw SMTP replies, provider errors, request
headers, query values, and bodies in `src/libs/modules/email-verification/README.md`.

## Interfaces and Dependencies

The new internal functions are:

    sanitizeRequestTarget(rawUrl: string): string
    createPiiSafePinoHttpOptions(): Options
    safeErrorType(error: unknown): string

`Options` is the existing `pino-http` option type already available through the logging dependency. The exact
automatic request log contract is:

    req: { id: string; method: string; path: string }
    res: { statusCode: number }
    responseTime: number

Application events may add only stable operation codes, provider identifiers, SMTP numeric codes, and opaque
database/job/request IDs. They may not add email, local part, domain from the submitted address, raw URL, headers,
body, SMTP command, SMTP reply, vendor payload, vendor error message, IP address, or stable email hash. No new
runtime package is required.

This plan depends on `privacy-compliance/01` for the shared privacy boundary. It can be implemented independently
of provider activation, STARTTLS, retention, and storage-transport changes as long as those later plans preserve
this logging contract.

## Acceptance Criteria

- Automatic request logs contain only the allowlisted request, response, duration, and generated-correlation fields.
- Raw and percent-encoded sentinel addresses supplied through query, path, body, headers, exceptions, SMTP replies,
  and provider errors do not occur in any captured JSON log line.
- Inbound request IDs, authorization values, cookies, user agents, forwarding headers, client IPs, and ports do not
  occur in captured logs.
- `GET /verify?email=...` logs a query-free route shape, and `GET|PATCH /emails/:email` logs
  `/emails/:sensitive`.
- SMTP logs identify command kinds and numeric response classes without logging `MAIL FROM`, `RCPT TO`, raw
  replies, sender addresses, or receiver addresses.
- Provider and async failure logs identify the operation without an address or remote error text.
- HTTP status codes and response schemas, SMTP/provider classification, and persistence behavior remain unchanged;
  address-bearing email-administration error text is replaced with a fixed generic message.
- Focused captured-log tests, the architecture gate, typecheck, lint, the full Jest suite, build, documentation
  lint, static log-site audit, and diff validation pass.

## Validation

Run the logger, HTTP, SMTP, provider, and exception-focused tests:

    corepack pnpm test -- src/libs/common/src/utils/safe-error-type.spec.ts src/lead-email-finder-api/src/pii-safe-logger-options.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts src/libs/modules/email-verification/src/email-verifier/email-verifier.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-verifier.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp.util.spec.ts src/libs/modules/email-verification/src/domain/domain-synonym-finder.spec.ts src/libs/modules/email-verification/src/domain/domain.service.spec.ts src/libs/modules/email-verification/src/email/email.service.spec.ts src/libs/modules/email-verification/src/async-email-verification/async-email-verification.service.spec.ts src/libs/modules/email-verification/src/async-email-verification/async-email-verification.processor.spec.ts src/libs/modules/email-verification/src/batch-email-verification/batch-email-verification.processor.spec.ts src/libs/modules/email-verification/src/sync-email-verification/email-verification.service.spec.ts src/libs/catch-all/src/microsoft-get-credential-type/microsoft-get-credential-type.service.spec.ts src/libs/catch-all/src/microsoft-login/microsoft-login.service.spec.ts src/libs/catch-all/src/mimecast-login/mimecast-login.service.spec.ts src/libs/catch-all/src/office-apps/office-apps.service.spec.ts src/libs/dns/src/dns.service.spec.ts src/libs/modules/proxy/src/infrastructure/observability/structured-logging-allocation-observer.spec.ts --runInBand
    corepack pnpm architecture:check

Run these static audits and inspect every match. Raw protocol strings may occur only where the SMTP transport
constructs commands and in fixture assertions; no logger argument may contain an address or raw protocol value:

    rg -n "Sending command|Response:|for email|Email:|RCPT TO|MAIL FROM" src/libs/modules/email-verification/src src/libs/catch-all/src src/libs/dns/src src/libs/modules/proxy/src src/lead-email-finder-api/src
    rg -n "logger\.(log|debug|warn|error).*\b(email|domain|message|response|command|mxHost)\b" src/libs/modules/email-verification/src src/libs/catch-all/src src/libs/dns/src src/libs/modules/proxy/src src/lead-email-finder-api/src

Finish with:

    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm test:ci
    corepack pnpm build
    git diff --check

Bruno: update `bruno/smtp-dev/13-reject-missing-email-update.yml` and add
`14-reject-duplicate-email-create.yml` to assert the fixed generic `404` and `409` messages and that neither response
echoes the submitted address. Run the collection with `bru run --env local` when its documented Docker-network
fixture and credentials are available; otherwise validate the collection statically and record runtime execution as
unverified.

## Idempotence and Recovery

Logger configuration and source-level message changes are stateless and safe to reapply. Each captured-log test
uses a fresh random sentinel and in-memory destination, closes the Nest app and destination in `finally`, and must
leave no open handles. If a test fails, retain only the synthetic sentinel in local output, identify the serializer
or log site, and rerun after fixing it; never copy production logs into test artifacts. No database reset,
migration, backfill, queue cleanup, or Bruno fixture is required.

## Artifacts and Notes

The outcomes record the allowlisted JSON shape, two captured request-completion records, sanitized route examples,
stable SMTP/provider event codes, focused and full test totals, and the static-audit result. Evidence uses generated
fixture values only. Complete logs, credentials, cookies, tokens, IP addresses, real addresses, SMTP transcripts,
and vendor responses are deliberately absent from this plan.

## Plan readiness

Ready to implement
