# Retire Obsolete Application Deployment Tooling

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The repository should expose the maintained local development workflow without advertising or scheduling its
obsolete application deployment. After this pull request, the application Swarm workflow and stack descriptor are
absent, their unused log-forwarding dependency is removed, and the HTTP client environment contains only the current
local API address. Developers continue using the same Compose gateway at `http://localhost:53000`.

This plan delivers repository retirement. A previously queued GitHub Actions run can retain its original workflow
revision, and deleting repository files does not stop a remote stack, revoke a credential, or remove stored logs.
Record that distinction explicitly in the completion evidence and operator follow-up.

## Progress

- [x] (2026-09-11) Recheck workflow references, queued-run state, dependency consumers, and HTTP client placeholders.
- [x] (2026-09-11) Delete the obsolete application workflow, stack descriptor, and matching Docker ignore entry.
- [x] (2026-09-11) Remove the unused log-forwarding package and obsolete HTTP client environment entries.
- [x] (2026-09-11) Update current development documentation and the privacy inventory with the repository boundary.
- [x] (2026-09-11) Complete static, dependency, build, Compose, gateway, and Harper validation.
- [x] (2026-09-11) Record the repository outcome and a concrete operator follow-up for previously queued deployment work.

## Plan dependencies

None.

## Surprises & Discoveries

- Implementation inspection on 2026-09-11 confirmed the same exclusive package consumer and retained editor
  placeholders at base commit `c6d588620c8e0f8ed0b8bcfc467e494d78fa30ce`, verified against GitHub `master`.
  Plan 01 has already removed the deprecated request example; the current request file needs no edits.
- At 2026-09-11 14:51 UTC, workflow `133913669` was active and run `34557176870` was queued. The earlier
  planning run `34078093218` had completed with conclusion `cancelled`. The reusable workflow still defaulted
  `stack_file` to `swarm.yml`. These read-only observations do not establish remote stack or log-store state.
- Dependency removal pruned ten package records and ten matching snapshots, including `pino-gelf` itself.
  All retained dependency versions, importer entries, and package snapshots were unchanged. Shared `Pino` packages
  and `split2` remain. Frozen installation succeeded with the existing notice about ignored build scripts for `protobufjs`.
- The application workflow `.github/workflows/deploy.yml` is not inert documentation. It schedules a daily run and
  calls `TupoSoft/GitHubActions/.github/workflows/swarm-deploy.yml@master` with stack name `email` and inherited secrets.
- A read-only check on 2026-09-07 found that the reusable workflow defaults its `stack_file` input to `swarm.yml`.
  The application workflow was active with workflow ID `133913669`; run `34078093218` was queued and the two prior
  inspected runs were canceled. These are dated observations and must be refreshed before implementation.
- Root `swarm.yml` is the only executable consumer of `pino-gelf` and `PINO_GELF_HOST`. It also references obsolete
  authentication and MongoDB settings and an image pinned to an old commit. Those references do not establish the
  current state of any remote service or log recipient.
- `http-client.env.json` contains obsolete production profiles and API-key/proxy service entries, but its
  `dev.services.api` object is still consumed by `src/libs/modules/email-verification/src/reqs.rest`. Keep that local
  environment and request file while removing only unused entries. Route retirement belongs to `legacy-retirement/01`.
- The maintained proxy-fleet deployment commands also use Swarm. They are independent of this application descriptor
  and remain supported; the word "Swarm" is not a repository-wide deletion criterion.

## Decision Log

- Decision: Keep the legacy feature inventory unchanged because it explicitly records the 2026-09-07 planning
  audit, and update the current README and privacy contract instead.
  Rationale: The dated inventory and completed ExecPlans remain historical evidence; their explanatory references
  are not active deployment consumers.
  Date/Author: 2026-09-11, Codex implementation.
- Decision: Delete `.github/workflows/deploy.yml`, root `swarm.yml`, and the exact `.dockerignore` entry for
  `swarm.yml` in one pull request.
  Rationale: The reusable workflow defaults to that descriptor. Deleting only the descriptor would leave a scheduled
  caller with a missing input; deleting only the caller would retain misleading application deployment tooling.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Remove `pino-gelf` from `package.json` and regenerate `pnpm-lock.yaml` after confirming its only executable
  consumer is still the deleted descriptor.
  Rationale: The package has no remaining role in the maintained application. Keep shared logging dependencies when
  they still have other consumers.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Retain only `dev.services.api.host`, `dev.services.api.port`, and the empty `dev.token` placeholder in the
  HTTP client environment.
  Rationale: The retained request file uses the local API service address and bearer-token placeholder. Remove the
  unused top-level host, obsolete service entries, and production profiles without breaking current local requests.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Preserve the maintained Compose topology, gateway, image-build workflows, and all proxy-fleet tooling.
  Rationale: Their current behavior is independent of the obsolete application deployment and is regression scope.
  Date/Author: 2026-09-07, Codex planning.
- Decision: Keep remote workflow cancellation, workflow disablement, stack shutdown, secret removal, and log deletion
  outside this implementation. Record previously queued work as an operator follow-up with read-only post-merge
  evidence.
  Rationale: Repository retirement is independently reviewable and testable. A file deletion neither performs nor
  proves those remote operations, and this planning task does not authorize them.
  Date/Author: 2026-09-07, Codex planning.

## Outcomes & Retrospective

Implemented the repository retirement from base `c6d588620c8e0f8ed0b8bcfc467e494d78fa30ce` in branch
`kk/558-retire-deployment-tooling`. The obsolete application workflow, root descriptor, Docker ignore entry,
`pino-gelf` dependency, and unused HTTP client profiles are removed. The editor retains only the exact local API
environment and empty token. Current development and privacy documentation now describe the retained gateway
and local logging evidence. Existing application code, Compose, gateway, image-build workflows, and proxy-fleet
tooling are unchanged. No HTTP API, schema, data reset, or architecture boundary changes were needed.

Frozen installation, type checking, application compilation, and both Docker image builds passed. All nine gateway
tests and 74 focused logging and ExecPlan tests passed. JSON and lockfile assertions, Harper, and diff checks also
passed. An independent static review found no actionable issues or material architectural trade-offs. Validation
details appear below.

Issue #558 is assigned to the requesting user and was moved to In Progress in Project 9. The implementation is
ready for its single pull request. Remote retirement remains separate: at 2026-09-11 14:54:58 UTC, run
`34557176870` was still queued, with no runs in progress. The operator must inspect that run and default-branch
file removal after merge using the commands below. This change does not cancel a run, stop a remote stack,
revoke credentials, or delete existing log copies.

## Context and Orientation

`.github/workflows/deploy.yml` calls an external reusable application deployment workflow every day and on manual
request. It supplies `stack_name: email` and inherits repository secrets. The reusable workflow's default
`stack_file: swarm.yml` binds that caller to the root descriptor even though the application workflow does not spell
out the path. Root `swarm.yml` runs an old application image, pipes its process output through `pino-gelf`, and names
external secrets and networks. `.dockerignore` lists the descriptor as an excluded build-context input.

The maintained local topology is defined by `docker/compose.yaml` and documented in `README.md` and `docker/README.md`.
The web gateway publishes port `53000` and reaches `api:3000` inside Compose. The current API and web image-build
commands are part of the validation workflow. `scripts/frontend/gateway.test.mjs` checks their routing and privacy
contract using an isolated fixture network.

`http-client.env.json` supplies editor request variables. Its current local API object contains host `localhost` and
port `53000`; the empty token placeholder allows a developer to provide an OIDC bearer token outside tracked source.
The extra `dev.host`, `api-key`, and `proxy` entries and the `prod` and `legacy-prod` profiles do not describe the
maintained local workflow.

`docs/privacy/email-verification-processing-contract.md` names the legacy descriptor in inventory row EV-15, the
log-recipient matrix, and the source map. Those statements must stop describing a deleted file as current source.
The same document correctly leaves actual managed log recipients and retained copies unresolved. Removing a local
log-routing descriptor must not change those unresolved facts into a claim that remote data or services are absent.

## Scope and Non-Goals

This pull request deletes the obsolete application deployment caller and descriptor, removes their Docker ignore
entry and unused package dependency, narrows the editor HTTP environment to the current development API, and updates
current documentation. It changes no HTTP endpoint, authorization rule, request schema, response, business module,
database schema, provider policy, queue, or gateway route.

Keep `src/libs/modules/email-verification/src/reqs.rest`; `legacy-retirement/01` separately removes its deprecated `GET /verify`
example. Preserve the current request examples and placeholders even if that plan has already landed. Do not edit
completed historical ExecPlans merely because they name the old descriptor.

Keep image publishing and validation workflows, all current `docker/compose*.yaml` files, `docker/web/`,
`scripts/proxy-fleet-swarm/`, `docker/proxy-fleet/`, and `deploy/proxy-fleet/`. Do not modify the external
`TupoSoft/GitHubActions` repository or perform remote workflow, stack, network, secret, or log-store operations.
Do not inspect secret values or add a replacement production deployment, migration, data reset, or compatibility
configuration.

## Plan of Work

First inspect current Git status and the exact application deployment caller. Recheck the reusable workflow's
`stack_file` default and the latest runs through read-only GitHub queries. Record run IDs, states, and observation time
without printing secrets or inherited environment values. Search tracked source and configuration for references to
`swarm.yml`, `pino-gelf`, `PINO_GELF_HOST`, the HTTP environment names, and each affected editor placeholder. Confirm
that the caller/descriptor pair and package ownership still match this plan; report any new executable consumer
before assigning its deletion to this pull request.

Delete `.github/workflows/deploy.yml` and root `swarm.yml` together, and remove only the matching `swarm.yml` line from
`.dockerignore`. Remove `pino-gelf` with `corepack pnpm remove pino-gelf --workspace-root`. Review the lockfile diff to
ensure only its dependency graph is removed; do not perform a broad dependency upgrade or delete packages still used
elsewhere. Retain the application's existing Pino logger and its privacy controls.

Replace `http-client.env.json` with the exact retained structure shown under Interfaces and Dependencies. Confirm the
remaining placeholders in `reqs.rest` resolve through that structure. Delete the obsolete production profiles and
unused service/host entries without copying their addresses into a new executable example. Leave `dev.token` empty.

Add a short development-tooling note to the narrowest relevant section of `README.md`: the editor's `dev` environment
uses the Compose gateway, and application deployment is no longer scheduled from this repository. Link the existing
Docker guide instead of duplicating its instructions. If needed, amend `docker/README.md` only to keep its current
build/gateway guidance consistent.

Update only the descriptor-related statements in privacy row EV-15, the log-recipient matrix, and the source map.
Describe local Pino/standard-output behavior as the current source evidence, and preserve uncertainty about external
log recipients, existing copies, and remote services. Record the repository removal in the document's revision
history without claiming legal approval, provider shutdown, or deletion of retained data. Reconcile concurrent edits
from other retirement plans rather than overwriting their inventory rows.

Run the focused validation below and review the diff for unrelated changes. Before closing implementation, record the
last observed queued-run state and provide a concrete operator follow-up naming any unresolved run. After merge, a
read-only follow-up should verify that the default branch lacks the caller/descriptor and inspect the terminal state
of every run already queued or executing. If a run remains actionable, notify the operator of its exact run ID and
state. Cancellation, disablement, and remote resource changes require their own operator instruction and are not
part of this pull request's acceptance criteria.

## Interfaces and Dependencies

The supported editor environment becomes:

```json
{
  "dev": {
    "services": {
      "api": {
        "host": "localhost",
        "port": 53000
      }
    },
    "token": ""
  }
}
```

No application HTTP contract changes. The removed package is the direct `pino-gelf` dependency plus transitive
lockfile entries no other dependency requires. Existing Compose and proxy-fleet configuration and commands keep their
current interfaces. No new dependency or replacement deployment entry point is introduced.

## Acceptance Criteria

- `.github/workflows/deploy.yml` and root `swarm.yml` are absent from the final branch, and `.dockerignore` no longer
  references the deleted descriptor.
- `package.json` and the resolved lockfile contain no `pino-gelf` package; no active application command references
  `pino-gelf` or `PINO_GELF_HOST`. Existing Pino logging remains intact.
- `http-client.env.json` has exactly the retained `dev` structure above, and the token is empty. The current request
  file remains and resolves its API address through `dev.services.api`.
- Current documentation directs local API requests through port `53000`; the privacy inventory no longer cites the
  deleted descriptor as current evidence and makes no remote shutdown or data-deletion claim.
- The maintained base Compose configuration validates, both current images build, and the existing gateway tests pass
  without changes to the gateway or proxy-fleet behavior.
- Frozen dependency installation, type checking, application build, JSON validation, and diff checks pass.
- The implementation outcome identifies any unresolved preexisting deployment run and records the required read-only
  post-merge follow-up. Repository deletion is not reported as evidence of remote stack shutdown.

## Validation

Validate dependency resolution and application compilation:

```bash
corepack pnpm install --frozen-lockfile
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build
```

Validate the environment shape without exposing a token:

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const actual = JSON.parse(readFileSync('http-client.env.json', 'utf8'))
assert.deepEqual(actual, { dev: { services: { api: { host: 'localhost', port: 53000 } }, token: '' } })
console.log('HTTP client development environment passed')
JS
```

Use the maintained development image tags because the existing gateway test expects the web tag. These builds and
isolated gateway fixtures do not require a deployment or a development-data reset:

```bash
docker compose -f docker/compose.yaml config --quiet
docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .
docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .
corepack pnpm test:gateway
```

If Docker is unavailable, record Compose/image/gateway checks as unverified and run the available static checks. Do
not replace that missing runtime evidence with a claim that a remote deployment was stopped. Review
`git diff --name-status` and search executable source/configuration for the removed identifiers; completed history and
the new retirement documents may retain explanatory mentions. Inspect the lockfile to ensure shared logging packages
remain when needed. Validate any other Compose overlay only if this change reveals a reference that requires editing
it; avoid unrelated fixture expansion.

Finish with:

```bash
git diff --check
```

Bruno: not applicable — this plan removes obsolete deployment/editor tooling and an unused command-line dependency
without changing an HTTP API or a stateful API workflow.

## Idempotence and Recovery

Removing already-absent files and rerunning the package manager should produce no additional change. If interrupted,
finish the caller/descriptor deletion together and regenerate the lockfile from the reviewed package manifest. Keep
all unrelated work and current request examples. Reverting repository files can restore the old scheduling entry
point after merge; that is a separate operational decision and must not be used as an automatic response to an
unrelated build failure.

No database reset or reseed is required. Gateway tests create and clean their own fixture resources; recover failed
fixture cleanup through the identifiers reported by that test without stopping another checkout's stack. No remote
stack, secret, network, or data-store mutation belongs to recovery for this repository change.

## Artifacts and Notes

Planning evidence was read on 2026-09-07: application workflow ID `133913669` was active; run `34078093218` was queued;
the prior two inspected runs were canceled; and the reusable workflow defaulted `stack_file` to `swarm.yml`. Review
[the reusable workflow](https://github.com/TupoSoft/GitHubActions/blob/master/.github/workflows/swarm-deploy.yml) and
[the observed queued run](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34078093218) again before relying on
those states.

Record exact deleted paths, direct/transitive dependency changes, the JSON validation result, image/gateway checks,
and GitHub observation times. After merge, attach read-only default-branch and prior-run evidence to
the operator follow-up. Keep remote shutdown and credential/log retirement explicitly unresolved unless a separately
authorized operation supplies evidence. Never record secret values, private key material, or bearer tokens.

### Implementation Evidence: 2026-09-11

- Deleted `.github/workflows/deploy.yml` and root `swarm.yml`; removed only the descriptor's `.dockerignore` line.
- `corepack pnpm remove pino-gelf --workspace-root` removed `pino-gelf@2.2.0` and nine exclusive transitive packages:
  `abort-controller@3.0.0`, `commander@11.1.0`, `event-target-shim@5.0.1`, `fast-json-parse@1.0.3`,
  `fast-json-stringify@1.21.0`, `pump@3.0.3`, `readable-stream@4.7.0`, `string-similarity@4.0.4`, and `through2@4.0.2`.
  A parsed comparison against the base lockfile confirmed every retained package and snapshot was unchanged;
  all importer entries except the removed direct dependency were identical. No dependency was upgraded.
- `corepack pnpm install --frozen-lockfile` passed. Initial sandbox restrictions on shared cache writes were
  resolved by running the package operation with the required filesystem access; no repository settings changed.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck` and
  `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build` passed; the latter compiled 672 files with zero type issues.
- The environment assertion under Validation passed. Additional assertions verified the retained API-address and
  bearer-token placeholders, absence of retired executable references, and unchanged maintained source/configuration.
- `docker compose -f docker/compose.yaml config --quiet` passed.
- `docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .` and
  `docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .` passed.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:gateway` passed all nine tests, including the built Nginx
  image's routing, private logging, security headers, caching, and backend-failure behavior. No gateway fixture
  containers or networks remained after cleanup.
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test --runInBand --runTestsByPath src/lead-email-finder-api/src/pii-safe-logger-options.spec.ts src/lead-email-finder-api/src/pii-safe-request-logging.integration.spec.ts scripts/plans/execplan-repository-fixture.spec.ts`
  passed three suites and 74 tests. No new tests were needed for removed unused tooling; these existing tests verify
  the retained logging and gateway behavior.
- `corepack pnpm docs:lint -- README.md docs/privacy/email-verification-processing-contract.md .agents/plans/legacy-retirement/03-retire-obsolete-deployment-tooling.md`
  passed all three files. `git diff --check` passed. No dictionary changes were needed.
- Bruno: not applicable — the changes remove unused deployment/editor tooling without changing HTTP behavior.

### Operator Follow-up After Merge

The final read-only check at 2026-09-11 14:54:58 UTC found one queued deployment run, `34557176870`, and zero
in-progress runs. The earlier planning run `34078093218` was completed with conclusion `cancelled`. Inspect
[the unresolved run](https://github.com/TupoSoft/LeadEmailFinder/actions/runs/34557176870) after merge, together
with any newer queued or executing runs. Each of the first two queries below must return HTTP 404 once the removal
is on `master`; a terminal run status supplies workflow evidence only, not remote resource or log-deletion evidence.

```bash
gh api 'repos/TupoSoft/LeadEmailFinder/contents/.github/workflows/deploy.yml?ref=master'
gh api 'repos/TupoSoft/LeadEmailFinder/contents/swarm.yml?ref=master'
gh api repos/TupoSoft/LeadEmailFinder/actions/runs/34557176870 --jq '{id,status,conclusion}'
gh api 'repos/TupoSoft/LeadEmailFinder/actions/workflows/133913669/runs?per_page=100' --paginate --jq '.workflow_runs[] | select(.status != "completed") | {id,status,conclusion}'
```

If any run remains actionable, report its exact ID and state to the operator. Cancellation, workflow disablement,
remote stack shutdown, secret removal, and log deletion still require a separate operator instruction. This
implementation has performed none of those operations and has not yet supplied post-merge evidence.

### PR Conflict Resolution: 2026-09-13

PR #592 was updated with `master` at `fdb855aa4a283ebd938e07a24f824e32b5054711`. Both branches had added revision 4
of the privacy contract. The resolution preserves the billing clarification as revision 4 and the deployment
retirement as revision 5, dated 2026-09-13. All other upstream changes remain intact, and the retirement scope is
unchanged. The original PR head `64f53c8` passed all eight GitHub validation jobs on 2026-09-12; that evidence
predates this merge update.

Focused merge validation passed: Harper on the two edited Markdown files, the repository ExecPlan fixture,
the module architecture gate (9 modules, 0 violations), and the staged diff check. An independent static review
confirmed that both privacy-history entries and all upstream changes remain intact. The runtime build and gateway
evidence above belongs to the original implementation; this merge resolved only a documentation conflict.

## Plan readiness

Ready to implement
