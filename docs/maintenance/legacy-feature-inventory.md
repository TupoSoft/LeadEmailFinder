# Legacy Feature Retirement Inventory

This inventory supports the [retirement road map](../../.agents/plans/legacy-retirement/README.md). It records a
planning audit, not completed removals. The inspected checkout was clean at
`3c713bc75da6f6de72c61c2d3a5289d85345d902`, which matched GitHub `master` on 2026-09-07. No open pull requests were
returned at that time. Searches covered runtime source, tests, configuration, deployment files, scripts, Bruno,
documentation, incomplete plans, and lockfile deprecation metadata.

During PR preparation later on 2026-09-07, [PR #553](https://github.com/TupoSoft/LeadEmailFinder/pull/553) was open at
`00a98668499dd01fa5ee8906a4b8aa68dfb67b5d`. It implements `module-architecture/11`, preserving and relocating deprecated
GET while layering synchronous delivery. Retirement plan 01 now depends on that refactor and targets its resulting
paths. That PR subsequently merged at `72a5a259100eb78894b49a6731841257e041e2ce` on 2026-09-07 at 09:44 UTC. This
planning branch was rebased onto the merge and its removal targets were verified against the merged source. Reported
implementation checks belong to PR #553 and were not rerun by this planning audit.

## New Retirement Tasks

| Candidate | Verified evidence | Planned outcome |
| --- | --- | --- |
| Deprecated synchronous verification | `src/libs/modules/email-verification/src/old-sync-email-verification/` registers `GET /verify` with `deprecated: true`; module registration is in `src/libs/modules/email-verification/src/email-verification.module.ts`. | `legacy-retirement/01` deletes the adapter. Authenticated GET returns API `404` without verification or charging. Existing POST retains its contract. |
| Exclusive response-mapping dependency | The old response profile is the only mapper consumer; remaining Automapper references are host setup, shared response decorators, and trace tests. | Plan 01 removes the three Automapper packages, overrides, setup, and orphan metadata with their final consumer. It preserves current serialization. |
| Deprecated checkout URL alias | Host environment normalization and tests accept `PAYMENTS_CHECKOUT_RETURN_URL`; the payments README explicitly deprecates it. All maintained fixtures use `PAYMENTS_CHECKOUT_URL`. | `legacy-retirement/02` rejects any defined retired key at startup and retains only canonical configuration support. |
| Old application Swarm deployment | Root `swarm.yml` describes obsolete MongoDB, API-token, and symmetric JWT settings. `.github/workflows/deploy.yml` still schedules its reusable deployment workflow. | `legacy-retirement/03` removes workflow and descriptor together, the obsolete ignore entry, and the exclusive `pino-gelf` dependency. |
| Obsolete manual request presets | `http-client.env.json` contains remote `prod` and `legacy-prod` environments and removed API-key/separate-proxy service entries. The checked-in request file uses the local API entry. | Plan 03 keeps supported local API settings and an empty caller-supplied token field; obsolete presets disappear. |
| Deleted API-key library mappings | `src/libs/key/` is absent, but `tsconfig.json` and `jest.config.ts` still map its bare and wildcard aliases. | `legacy-retirement/04` removes the mappings and obsolete prefix-order workaround. Current Keycloak resolution remains. |

GET removal also owns its old response DTOs and enums, `deprecated_sync` trace mode, affected shared tests, SMTP
Bruno scenarios, the manual request example, current documentation, full runtime Swagger assertions, and eleven corresponding
architecture baseline entries in the original audit. PR #553 already removes those entries as part of its eighteen
resolved synchronous violations. After that prerequisite, retirement should leave the remaining baseline unchanged.
There is no separate old verification database or queue to delete.

POST is not response-compatible with GET: it returns `201` instead of `200`, exposes current `exists`, boolean or null
`catchAll`, `id`, and `sources`, and has no promised replacement for legacy `verifiedAt`. Callers must adopt the actual
POST contract. The browser OpenAPI allowlist currently contains authentication and health only; full runtime Swagger
must lose GET while generated browser artifacts remain stable.

## Existing Plans That Already Own Removal

| Existing owner | Removal and ordering |
| --- | --- |
| [Account discovery 02](../../.agents/plans/account-discovery/02-internalize-provider-adapters.md) | Removes `src/libs/catch-all/`, its aliases, and the superseded shared provider contract after internalizing providers. Preserve its prerequisite `account-discovery/01`; do not delete active account discovery. |
| [Module architecture 12](../../.agents/plans/module-architecture/12-retire-module-architecture-baseline.md) | Retires the architecture baseline and updater after all remaining violations are eliminated. Plan 01 only shrinks the debt it resolves. |
| [Plan sync 05](../../.agents/plans/plan-sync/05-adopt-reusable-execplan-sync-action.md) | Retires the local synchronizer only after reusable Action adoption prerequisites and compatibility validation. The current local writer is still active. |

The [synchronous layering plan](../../.agents/plans/module-architecture/11-layer-email-verification-delivery-workflows.md)
retains its implemented two-route scope in PR #553. The follow-on `legacy-retirement/01` removes GET from
`api/http/synchronous-verification/deprecated/`, preserves the shared synchronous command, and updates the HTTP matrix.
Async and batch layering plans retain their independent ownership and must not recreate the route after retirement.

Completed `auth/09`, `module-boundaries/01`, and `proxy-fleet/03` already removed API-key authentication, inert migration
scaffolding, and duplicate SMTP proxy persistence. Completed plans remain historical evidence; new removal plans
must not count those features as present or restart their implementation.

## Retained Behavior and Separate Maintenance

| Match found during the audit | Disposition and reason |
| --- | --- |
| Historical `'linkedin'` result source | Keep `EmailVerificationReadSource` and the entity hydration regression test. This reads old development rows; no LinkedIn provider is active. Removing it would require a separate disposable-data reset decision. |
| LinkedIn session-material scanner | Keep the working-tree and history scan. Removing an old provider does not remove the need to detect sensitive material. |
| `ExternalIdentityResolver` described as legacy in a comment | Keep the resolver: BFF session flow actively consumes it. Its stale transition comment is documentation maintenance, not evidence of a removable service. |
| Completed-plan parsing compatibility | Keep support for completed historical plans that lack dependency sections. The current planning contract explicitly permits it. |
| Key alias in architecture restrictions | Keep the prohibition against importing the retired technical alias. A restriction is not a resolution mapping or supported runtime feature. |
| Keycloak empty bind-directory repair | Keep the scoped repair and its test protecting nonempty contents. Provisioning still uses it. |
| BFF live-test origin default labeled legacy | Keep the working test default and validation of unsafe overrides. It is not a deprecated product interface. |
| Maintained proxy-fleet Swarm tooling | Keep `scripts/proxy-fleet-swarm/`, `deploy/proxy-fleet/`, and their fixtures. They are distinct from the old root application stack. |
| Generic redaction and obsolete-route probes | Keep query redaction for rejected requests and security tests using synthetic old URLs. A removed route can still receive requests. |
| Deprecated transitive packages | The lockfile marks `crypto-js`, some `glob` versions, `inflight`, `node-domexception`, `string-similarity`, and `uuid` 10. These are dependency maintenance, not removable product features. Remove exclusive transitive packages when their final parent disappears; evaluate other parent-package upgrades separately. |

Do not turn a text search into an age-based deletion rule. Variable names such as `oldToken`, expired-state fixtures,
provider result history, security rejection tests, and completed plans describe behavior or evidence that can remain
necessary. This audit does not claim that unmarked code is unused or that deprecated third-party packages are replaced.

## Deployment Evidence and Follow-Up

Read-only GitHub inspection confirmed the reusable workflow defaults to `swarm.yml`. The application workflow
`133913669` was active, and [scheduled run 34078093218](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34078093218)
was queued on 2026-09-07. The preceding two observed scheduled runs were canceled. Status can change after this audit.

Repository retirement stops future scheduling after the workflow disappears from the default branch. It does not
cancel already queued or running jobs and does not remove a remote Docker stack. The repository owner must inspect
those runs and decide their disposition separately. Record post-merge execution evidence in the implementation PR
or workflow record, without extending the one-PR ExecPlan into another implementation change.

No workflow was disabled, no run canceled, and no remote environment, credential, volume, or stack inspected or
changed during planning. Remote deployment existence and health remain unverified.

## Validation Boundary

The planning change requires the repository ExecPlan graph test and `git diff --check`. Each implementation plan
specifies its own focused tests, contract checks, and applicable Bruno coverage. A ready plan is decision-complete; it does not claim implementation or runtime validation has succeeded.
