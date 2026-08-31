# Prevent Email Addresses from Entering Logs

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Operational logs must remain useful without becoming a second store of submitted email addresses, SMTP transcripts,
HTTP credentials, or provider payloads. After this change, request logging records only an opaque server-generated
request ID, method, sanitized route shape, status, duration, stable operation codes, and opaque internal IDs. A
developer can submit a unique sentinel address through each verification route and failure path, capture the emitted
JSON logs, and prove that the address and its encoded forms never appear.

## Progress

- [ ] (2026-08-30) Replace default `Pino` HTTP serialization with a PII-safe request, response, and error contract.
- [ ] (2026-08-30) Remove addresses, SMTP commands and replies, and provider response details from application logs.
- [ ] (2026-08-30) Add sentinel-based logger, HTTP, SMTP, provider, async, and exception regression tests.
- [ ] (2026-08-30) Complete architecture, full-suite, documentation, and static log-site validation.

## Plan dependencies

- `privacy-compliance/01`
- `privacy-compliance/02`

## Surprises & Discoveries

None yet.

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
- Decision: Error logs record an error class or stable application code and stack frames without the first
  message-bearing line; assertion and HTTP exception messages in the email-verification flow become generic.
  Rationale: Serializing `error.message` or a normal stack first line can reintroduce the same address removed from
  explicit log statements.
  Date/Author: 2026-08-30, Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/lead-email-finder-api/src/lead-email-finder-api.module.ts` currently calls
`LoggerModule.forRoot()` without an explicit `pinoHttp` policy. `src/main.ts` installs that logger for Nest.
Default request serialization can include a URL with its query and sensitive path segment, and no repository-owned
allowlist currently defines which request fields are safe.

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
from SMTP, provider, email-verification, async, domain-synonym, and email-administration paths, and adds captured-log
tests. It preserves HTTP status codes and bodies, SMTP classification, provider selection, queue behavior, database
state, and operational correlation through server-generated IDs and stable event codes.

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
response serializer, and an error serializer that omits message text and the message-bearing first stack line.
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

Document the logging allowlist and the prohibition on addresses, hashes, raw SMTP replies, provider errors, request
headers, query values, and bodies in `src/libs/modules/email-verification/README.md`.

## Interfaces and Dependencies

The new internal functions are:

    sanitizeRequestTarget(rawUrl: string): string
    createPiiSafePinoHttpOptions(): Options

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
- Existing HTTP responses, SMTP/provider classification, exception status codes, and persistence behavior remain
  unchanged.
- Focused captured-log tests, the architecture gate, typecheck, lint, the full Jest suite, build, documentation
  lint, static log-site audit, and diff validation pass.

## Validation

Run the logger, HTTP, SMTP, provider, and exception-focused tests:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/lead-email-finder-api/src/pii-safe-logger-options.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts src/libs/modules/email-verification/src/email-verifier/email-verifier.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-client.spec.ts src/libs/modules/email-verification/src/email-verifier/smtp/smtp-verifier.spec.ts src/libs/modules/email-verification/src/domain/domain-synonym-finder.spec.ts src/libs/modules/email-verification/src/email/email.service.spec.ts src/libs/modules/email-verification/src/async-email-verification/async-email-verification.service.spec.ts src/libs/catch-all/src/microsoft-get-credential-type/microsoft-get-credential-type.service.spec.ts src/libs/catch-all/src/mimecast-login/mimecast-login.spec.service.ts src/libs/catch-all/src/office-apps/office-apps.service.spec.ts --runInBand
    corepack pnpm architecture:check

Run these static audits and inspect every match. The first command must have no production-code match that includes
the address or raw protocol value; fixture assertions may match:

    rg -n "Sending command|Response:|for email|Email:|RCPT TO|MAIL FROM" src/libs/modules/email-verification/src src/libs/catch-all/src src/lead-email-finder-api/src
    rg -n "logger\.(log|debug|warn|error).*\b(email|domain|message|response|command)\b" src/libs/modules/email-verification/src src/libs/catch-all/src src/lead-email-finder-api/src

Finish with:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/privacy-compliance/03-prevent-email-addresses-in-logs.md
    git diff --check

Bruno: not applicable — the HTTP request and response contracts do not change, and captured-log integration tests
exercise the logging boundary directly.

## Idempotence and Recovery

Logger configuration and source-level message changes are stateless and safe to reapply. Each captured-log test
uses a fresh random sentinel and in-memory destination, closes the Nest app and destination in `finally`, and must
leave no open handles. If a test fails, retain only the synthetic sentinel in local output, identify the serializer
or log site, and rerun after fixing it; never copy production logs into test artifacts. No database reset,
migration, backfill, queue cleanup, or Bruno fixture is required.

## Artifacts and Notes

Record the allowlisted JSON shape, sanitized route examples, number of captured lines, stable SMTP/provider event
codes, focused and full test totals, and the static-audit result. Evidence must use generated fixture values only.
Do not paste complete logs, credentials, cookies, tokens, IP addresses, real addresses, SMTP transcripts, or vendor
responses into this plan.

## Plan readiness

Ready to implement
