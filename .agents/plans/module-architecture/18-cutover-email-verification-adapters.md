# Move Email Administration, Add Network Compatibility Adapters, and Cut Email Verification Over

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Finish separating email verification's core from its adapters by making the pure application core from
`module-architecture/10`, layered onto the persistence stores from `module-architecture/17`, the thing that
actually serves every route. This plan relocates the `/emails` administration API to
`api/http/email-administration/`. It implements thin compatibility adapters for the three remaining network ports
— `MxResolver`, `DomainSynonymDiscovery`, `MailboxProbe` (`AccountDiscovery` already has a real adapter from a
prior privacy-compliance plan and needs no compatibility wrapper). It composes the final
`email-verification.module.ts`, rewires the four delivery folders (sync, deprecated-sync, async, batch) to the
new core token, and deletes the old flat implementation the new core replaces. After this plan, the module has no
framework code below its `api/` and `infrastructure/` layers, and `module-architecture/13` and
`module-architecture/14` can each replace one of this plan's compatibility adapters with a real, independently
architected one.

## Progress

- [ ] Confirm this plan's own size projection stays under 1,000 non-documentation additions plus deletions.
- [ ] Move the `/emails` administration controller and DTOs to `api/http/email-administration/`.
- [ ] Implement compatibility adapters for `MxResolver`, `DomainSynonymDiscovery`, and `MailboxProbe`, wrapping
  the existing DNS/HTTP/SMTP implementations unchanged.
- [ ] Compose the final `email-verification.module.ts` with explicit factory providers for every application
  service and port.
- [ ] Rewire the four delivery folders to the new core token; delete the old flat implementation.
- [ ] Complete focused, architecture, full-suite, build, documentation, diff, real-Postgres, and live Bruno
  validation.

## Plan dependencies

- `module-architecture/10`
- `module-architecture/17`
- `privacy-compliance/03`

## Surprises & Discoveries

- This plan exists because the original, unsplit `module-architecture/10` was found to be `size/xl` even under
  its own prescribed two-way split; see the Surprises section of `module-architecture/10` for the full record.
  This plan is the third and final quarter of that original scope: the part that actually changes running behavior.
  It is deliberately the last of the three split plans to implement, since it is the only one that touches a live
  route.
- `module-architecture/13` and `module-architecture/14`, written before this split existed, each describe
  replacing "the plan-10 compatibility adapter." Their dependency lists must be updated (as part of this same
  authoring pass) to point at this plan instead, since this plan — not the narrowed `module-architecture/10` — is
  what actually creates those compatibility adapters.

## Decision Log

- Decision: Wrap the existing DNS/HTTP/SMTP implementations behind `MxResolver`, `DomainSynonymDiscovery`, and
  `MailboxProbe` compatibility adapters in this plan, unchanged, rather than reimplementing or improving them
  here.
  Rationale: This plan's job is to make the new core the thing that serves traffic without changing verification
  behavior; `module-architecture/13` and `module-architecture/14` are where those adapters get real, independently
  reviewed implementations with their own tests.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split, carried over from the original plan's Decision Log).
- Decision: Perform the delivery-folder cutover and old-code deletion as a single change within this plan, not
  incrementally across multiple plans.
  Rationale: A half-migrated intermediate state, where some delivery folders call the old service and others call
  the new one, is harder to reason about and test than one atomic cutover. The compatibility adapters exist
  precisely so this cutover can happen before `module-architecture/13` and `module-architecture/14` land their
  real adapters.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).
- Decision: Move the `/emails` administration API's route path, request/response DTOs, and status codes
  unchanged; only its file location and internal wiring change.
  Rationale: External API compatibility must be preserved — this is an internal architecture change, not a
  behavior or contract change.
  Date/Author: 2026-08-30, Codex planning (retained from the original plan).
- Decision: Delete the old flat implementation (the pre-split `email/`, pre-split `domain/`, and
  `sync-email-verification/email-verification.service.ts`) in this plan rather than leaving it dead alongside the
  new code.
  Rationale: Leaving both versions in the tree after the cutover invites drift and confuses future readers about
  which implementation is authoritative. This plan is the only one of the three split plans that can safely
  delete it, since it is the one that proves the replacement actually serves traffic.
  Date/Author: 2026-09-04, Claude Sonnet 5 (three-way split).

## Outcomes & Retrospective

Not started.

## Context and Orientation

`module-architecture/10` defines the pure core and all seven new ports (plus reuses the existing
`AccountDiscovery` port). `module-architecture/17` implements the four persistence ports. This plan is what
remains: the three network compatibility adapters, the `/emails` API move, final module composition, and the
cutover itself. The existing `email-verifier/` folder holds the current DNS/SMTP/proxy/catch-all implementations
this plan wraps without modifying; `email-verifier/smtp/smtp-trust.ts` and `application/account-discovery/` +
`infrastructure/account-discovery/` are already-layered and must be reused unchanged. The separate
`GET /verifications/:id` slice (`api/verification-results.controller.ts` +
`application/verification-result-reader.ts` + `infrastructure/typeorm-verification-result-reader.ts`) is
unrelated to the `/emails` admin CRUD this plan moves and must be left alone.

## Scope and Non-Goals

Move the `/emails` administration API; implement the three compatibility network adapters; compose the final
module; rewire the four delivery folders; delete the superseded old implementation. Do not reimplement DNS/SMTP
protocol behavior, proxy allocation, or catch-all detection — wrap them as-is. Do not touch
`application/account-discovery/`, `infrastructure/account-discovery/`, `infrastructure/smtp/smtp-trust.ts`,
`application/verification-trace/`, `infrastructure/verification-trace/`, or the `GET /verifications/:id` slice.
Do not change any HTTP route path, request/response shape, or status code for any endpoint. Do not implement the
final real `MxResolver`/`DomainSynonymDiscovery` adapters (`module-architecture/13`) or the final real
`MailboxProbe` adapter (`module-architecture/14`) — this plan's adapters are deliberately thin wrappers, replaced
later.

## Plan of Work

Complete this plan's own size projection using the same conservative move-as-delete-plus-add convention as
`module-architecture/10` and `module-architecture/17`, before writing any code. If it reaches `size/xl` on its
own, narrow further before proceeding — do not proceed past this gate on an assumption. Do not treat the two
prior plans' passing projections as evidence this one will too, since this is the plan that touches the most call
sites.

Move the `/emails` controller and DTOs to `api/http/email-administration/`, wired to the email/domain-policy
application services from `module-architecture/10`. Implement `CompatibilityMxResolver`,
`CompatibilityDomainSynonymDiscovery`, and `CompatibilityMailboxProbe` under `infrastructure/`, each wrapping the
corresponding existing implementation without behavior changes. Compose `email-verification.module.ts` with
explicit factory providers for every application service and port, following this session's established pattern
(see the `payments.module.ts` from `module-architecture/09`) — no bare `@Injectable()` once a class is
framework-free. Rewire `sync-email-verification/`, the deprecated sync path, `async-email-verification/`, and
`batch-email-verification/` to call the new core's verification service through its token instead of the old
class. Delete the old flat `email/`, old flat `domain/`, and
`sync-email-verification/email-verification.service.ts` once nothing references them. Update
`src/libs/modules/email-verification/README.md` to describe the finished layered architecture.

As part of this same authoring pass (not part of this plan's implementation, but as immediate follow-up document
edits), update the "Plan dependencies" sections of `module-architecture/13` and `module-architecture/14` to
depend on this plan instead of `module-architecture/10` for their compatibility-adapter replacement. Also update
the Order and Dependencies list and Shared Constraints section of the road map README file to include this plan
and `module-architecture/17` in the migration sequence.

## Interfaces and Dependencies

Implements the three network compatibility ports from `module-architecture/10`; consumes the four persistence
stores from `module-architecture/17`. Moves the `/emails` HTTP surface without changing its contract. Depends on
`module-architecture/10` and `module-architecture/17` for the core and stores this plan wires together. Depends on
`privacy-compliance/03` for the PII-safe logging contract the new infrastructure adapters must uphold — the
adapters this plan writes are the first place in this family of plans that actually logs. `module-architecture/13`
and `module-architecture/14` each replace one of this plan's compatibility adapters afterward.

## Acceptance Criteria

- This plan's own recorded projection is below 1,000 non-documentation additions plus deletions.
- Every `/emails`, verification, sync, async, and batch route behaves identically to before this plan, verified
  by the existing Bruno collections and any updated focused tests.
- The old flat `email/`, old flat `domain/`, and `sync-email-verification/email-verification.service.ts` no
  longer exist; nothing in the module imports them.
- `email-verification.module.ts` wires every application service and port through explicit factory providers; no
  bare `@Injectable()` on a framework-free class.
- Infrastructure adapters that log satisfy the allowlisted log contract from privacy-compliance/03.
- Focused, architecture, full-suite, build, documentation, diff, real-Postgres, and live Bruno checks all pass.

## Validation

Before writing code, record the projection using the same command as the two prior plans:

    git fetch origin master
    git diff --numstat -M origin/master...HEAD -- . ':!*.md' ':!pnpm-lock.yaml' | awk '{a+=$1; d+=$2} END {print a+d}'

Run focused and architecture coverage:

    corepack pnpm architecture:check
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- src/libs/modules/email-verification --runInBand
    corepack pnpm architecture:baseline
    corepack pnpm architecture:check

Then run the full suite and real integration validation:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/email-verification/README.md .agents/plans/module-architecture/18-cutover-email-verification-adapters.md .agents/plans/module-architecture/13-layer-email-discovery-adapters.md .agents/plans/module-architecture/14-layer-smtp-mailbox-adapter.md .agents/plans/module-architecture/README.md
    git diff --check

Rebuild and restart the live dev stack, then run every Bruno collection touching email verification against it:

    docker compose up -d --build
    bru run --env local

Bruno: added/updated — the `/emails` administration routes, verification routes, and the existing collection for
every delivery mode must be rerun against the rebuilt dev stack. Add coverage only for any newly observable
behavior (there should be none, since this plan preserves contracts), and report the actual run result in the
final response.

## Idempotence and Recovery

Rerunning the move/adapter/composition steps is safe up to the deletion step; once the old flat implementation is
deleted, recovery is via `git status`/`git diff` against the last commit, not by re-deriving deleted files by
hand. If interrupted after deletion but before validation completes, treat the working tree as mid-cutover and
finish validation before considering any further edits.

No production database exists; the dev stack can be torn down and rebuilt with `docker compose down` and
`docker compose up -d --build` if the running containers reach an inconsistent state.

## Artifacts and Notes

Record the per-path size projection and actual count, the final module composition provider list, and the Bruno
run results (collections and pass/fail counts) once implementation completes.

## Plan readiness

Ready to implement once `module-architecture/10` and `module-architecture/17` both merge; confirm the actual
per-path projection before writing code regardless of the estimate above.
