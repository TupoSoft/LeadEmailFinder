# Add a configurable SMTP client factory

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make SMTP destination port configurable without adding fixture concerns to verification policy. PR #309 introduced a client-construction boundary so real MX traffic keeps port 25 while the opt-in local fixture can use port 2525.

## Progress

- [x] (2026-08-13) Added validated optional `SMTP_PORT` with default 25.
- [x] (2026-08-13) Added `ISmtpClientFactory` and made the verifier consume it.
- [x] (2026-08-13) Covered configuration, wiring, and delegation and merged PR #309.

## Surprises & Discoveries

- Observation: `SmtpVerifier` directly constructed `SmtpClient`, coupling verification policy to connection configuration.
  Evidence: PR #309 moved construction into `SmtpClientFactory` and added an injection token.

## Decision Log

- Decision: Keep port 25 as the default and validate configured values from 1 through 65535.
  Rationale: Existing deployments remain compatible while development can select a non-privileged SMTP fixture port.
  Date/Author: 2026-08-13, PR #309.
- Decision: Introduce a narrow factory rather than passing configuration through verification methods.
  Rationale: Concrete client creation is infrastructure configuration, while `SmtpVerifier` owns SMTP verification flow.
  Date/Author: 2026-08-13, PR #309.

## Outcomes & Retrospective

PR [#309](https://github.com/TupoSoft/LeadEmailFinder/pull/309) merged as `8fbd9a9`. `SMTP_PORT` is validated, `SmtpClientFactory` owns concrete construction, and `SmtpVerifier` depends only on `ISmtpClientFactory` and `ISmtpClient`.

## Context and Orientation

Environment validation lives in `src/lead-email-finder-api/src/environment-variables.dto.ts`. SMTP factory contracts and implementations live beside `SmtpVerifier`, and `SmtpModule` binds the factory token.

## Scope and Non-Goals

The completed PR changed client construction and configuration only. It did not add the local SMTP fixture, change SMTP result semantics, modify proxy allocation, expose a public API, or add a migration.

## Plan of Work

Add `SMTP_PORT` validation and defaulting. Define `ISmtpClientFactory`, implement a configuration-backed factory, register its token, and replace direct construction in the verifier. Test the default, configured port, invalid ranges, module wiring, and verifier delegation through a test double.

## Interfaces and Dependencies

New internal interface: `ISmtpClientFactory.create(options): ISmtpClient`. New optional configuration: `SMTP_PORT`, integer 1–65535, default 25. This plan depended on the stable SMTP allocation boundary and unlocked PR #310's ISP-safe fixture.

## Acceptance Criteria

- Unset `SMTP_PORT` creates SMTP clients targeting port 25.
- `SMTP_PORT=2525` creates clients targeting port 2525.
- Non-integer, zero, negative, and values above 65535 fail environment validation.
- `SmtpVerifier` does not instantiate `SmtpClient` directly.
- Existing SMTP behavior and public HTTP contracts remain unchanged.

## Validation

PR #309 recorded 40 suites passing with 179 tests and one existing todo, five affected suites with 20 tests passing in the commit hook, and successful typecheck, build, lint with two unrelated existing warnings, and `git diff --check`.

## Idempotence and Recovery

Configuration is evaluated at startup and has no persistent side effects. Removing `SMTP_PORT` restores port 25. Invalid configuration fails startup before processing verification traffic.

## Artifacts and Notes

Merged commit: `8fbd9a9`. Primary paths: `smtp-client-factory.interface.ts`, `smtp-client.factory.ts`, `smtp.module.ts`, `smtp-verifier.ts`, and `environment-variables.dto.ts`.

## Plan readiness

Completed in PR #309 (`8fbd9a9`).
