# Build the MCP Server Before Running the Bruno Collection

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A developer following `bruno/mcp-request-routing/README.md` from a clean checkout should be able to start
the MCP server and run the collection. The setup currently starts `dist/main.js` without first producing
that file. Document the existing package build before startup so the instructions work without an earlier
build or stale output.

This plan delivers one documentation-only implementation PR for the missing build prerequisite found in
the review of PR #681. It unlocks repeatable local validation of the existing MCP routing collection.

## Progress

- [x] (2026-09-17) Added the package `build` command before `start` in the collection README.
- [x] (2026-09-17) Verified the documented sequence in a disposable `git archive` snapshot with no
      `apps/mcp-server/dist`.
- [x] (2026-09-17) Ran focused documentation and plan checks and recorded the results below.

## Plan dependencies

- `mcp-transport-hardening/01`

## Surprises & Discoveries

- The disposable fixture reproduced the defect exactly as the review recorded it: `git archive HEAD | tar -x`
  into a fresh temporary directory, with the package's own `node_modules` and the root `node_modules` reused
  via read-only symlinks, produced a checkout with no `apps/mcp-server/dist` at all. Running the documented
  build immediately before `start` (rather than the old `start`-only instruction) let the server boot cleanly on
  the first try, `GET /health` returned exactly `{"status":"ok"}`, and the full six-request routing collection
  (including the `mcp-transport-hardening/03` malformed-target and final health requests, already merged by the
  time this plan was implemented) passed 6/6 against that same process.

## Decision Log

- Decision: Document the existing `build` command before `start`. Rationale: the package already separates
  compilation from execution, and this finding concerns a missing build step. No package script change
  is needed. Date/Author: 2026-09-17, Codex planning.
- Decision: Validate in a temporary source snapshot. Rationale: deleting build output in a developer's
  checkout could disrupt another task or running server. The snapshot gives a clean starting condition
  without touching that output. Date/Author: 2026-09-17, Codex planning.
- Decision: Keep this plan independent of `mcp-transport-hardening/03`. Rationale: the build prerequisite
  and malformed-target coverage are separately useful corrections. Both edit the same README, so a later
  implementation must preserve whichever correction has already landed. Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: `bruno/mcp-request-routing/README.md` now documents the
package `build` step immediately before `start`, framed as running from the repository root with workspace
dependencies already installed. Verified in a disposable snapshot with no preexisting build output, per the
plan's own validation design, rather than only inspecting the diff. No package script, runtime source, or
collection request changed.

## Context and Orientation

All paths below are relative to the repository root. The MCP server is a separate workspace package under
`apps/mcp-server`. Its `package.json` defines `build` as `tsc -p tsconfig.json` and `start` as
`node dist/main.js`. No startup hook runs the compiler. The root `build` command runs Nest and does not
compile this package.

The collection README currently tells a developer to run
`PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start`, then run Bruno in another
terminal. A clean checkout has no `apps/mcp-server/dist/main.js`, so startup fails with `MODULE_NOT_FOUND`.
The process regression in `apps/mcp-server/src/main.spec.ts` builds into a unique temporary directory;
running that test does not prepare the package output for the documented startup command.

`bruno/mcp-request-routing/environments/local.yml` reads the server address from `MCP_BASE_URL`.
The reviewed server uses port 3002 by default. Its public `/health` route requires no credentials.
The README also preserves fixture instructions if authentication is added later. Those instructions
remain in place.

The source was reviewed at PR #681 head `56ca699d6ec8784bcbc793b286dae66a0576ebf4`.
PR #681 merged on 2026-09-17 as `2921d88c10f1139adad4017dfe5ffbc3d315be56`.
The planning checkout was based on `49c42b0c9ec3ce641d86aab6ce3899472bdbd356`, so implementation must use
a current base containing the merged prerequisite rather than treating missing files in that older
checkout as a reason to recreate the server or collection.

## Scope and Non-Goals

Edit the setup section of `bruno/mcp-request-routing/README.md` and maintain this ExecPlan as work
progresses. State that commands begin at the repository root with workspace dependencies installed,
then show the MCP package build immediately before the existing start command.

Preserve package scripts, runtime source, test behavior, collection requests, environment variable names,
port selection, and credential handling. Plan `mcp-transport-hardening/03` owns the incorrect URL
normalization explanation and malformed-target Bruno coverage. This plan does not add a second
correction for those concerns. No business module, database, schema, UI, or deployment changes are needed.

## Plan of Work

Start from a clean implementation branch containing the prerequisite. Follow the root ExecPlan workflow
for the synced issue when implementation begins. Read the current package scripts and collection README
to confirm that the explicit build is still the required setup step.

In the README, introduce the setup as commands run from the repository root after workspace dependencies
have been installed with the pinned package manager. Show these commands in this order:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

Keep the Bruno command for the second terminal and the instruction to stop the process with `Ctrl+C`. Explain that changing the
port requires using the same value in `PORT` and `MCP_BASE_URL`. Do not add automatic compilation to the
package scripts or imply that the root build or Jest command creates this package's output.

If plan 03 has already changed the surrounding README, retain its explanation and collection instructions.
Resolve any overlapping documentation edits around the final text rather than restoring the older file.

Validate the documented sequence in a disposable source snapshot as described below. Record the actual
commands and outcomes in this plan, including any unavailable runtime validation. Finish by reviewing
the diff for scope, running the focused checks, and opening exactly one documentation-only PR.

## Interfaces and Dependencies

No HTTP interface, type, configuration contract, library, or runtime dependency changes. The documented
workflow reuses the package scripts and the existing `PORT` and `MCP_BASE_URL` variables.

Dependency `mcp-transport-hardening/01` supplies the collection and server behavior. There is no dependency
on plan 03; the two plans share a documentation file but have independent acceptance criteria. Installed
workspace dependencies and the pinned pnpm version are needed for runtime validation. If authentication
has landed, use its existing disposable fixture credentials without changing the checks or logging secrets.

## Acceptance Criteria

- The README explicitly starts from the repository root with workspace dependencies installed and
  places the MCP package build before its start command.
- Starting from a disposable snapshot without `apps/mcp-server/dist`, the documented build succeeds,
  the server stays running, and `GET /health` returns HTTP 200 with `{"status":"ok"}`.
- The existing Bruno collection passes against that process using the documented local environment.
  Its request count may include changes already delivered by plan 03.
- The instructions retain consistent port configuration, existing credential guidance, and a clear
  shutdown step. Runtime code, package scripts, collection requests, and unrelated README sections do not change.
- Validation preserves build output and running processes outside the disposable fixture. Harper and
  the focused ExecPlan repository check pass.

## Validation

These are planned checks, not recorded results. Use a current implementation checkout whose committed
base contains PR #681. First prepare a disposable snapshot from that base. Copy the edited README into
the snapshot so it contains the instructions being validated:

```sh
source_root="$(git rev-parse --show-toplevel)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/mcp-readme-build-XXXXXX")"
git archive HEAD | tar -x -C "$fixture_root"
cp "$source_root/bruno/mcp-request-routing/README.md" "$fixture_root/bruno/mcp-request-routing/README.md"
test ! -e "$fixture_root/apps/mcp-server/dist"
```

Reuse installed dependencies through read-only use of directory symlinks when the implementation checkout
already has dependencies matching its lockfile. Do not run installation through those symlinks:

```sh
ln -s "$source_root/node_modules" "$fixture_root/node_modules"
ln -s "$source_root/apps/mcp-server/node_modules" "$fixture_root/apps/mcp-server/node_modules"
```

If matching dependencies are unavailable, omit both symlinks and run `corepack pnpm install --frozen-lockfile`
inside the disposable snapshot.

In the fixture terminal, run the exact documented build and startup sequence:

```sh
cd "$fixture_root"
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
test -f apps/mcp-server/dist/main.js
PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

Keep startup in the foreground so `Ctrl+C` stops the task-owned process group. If port 3002 is occupied,
choose a free local port and substitute it consistently. Do not stop the existing listener.
In a second terminal, set `fixture_root` to the temporary path recorded during setup, then run:

```sh
curl --fail --silent --show-error http://127.0.0.1:3002/health
cd "$fixture_root/bruno/mcp-request-routing"
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

Assert that the health response is exactly `{"status":"ok"}` and that every collection request passes.
Use the existing fixture credentials if the current implementation requires them. Stop only the fixture
server with `Ctrl+C`, then confirm it has exited before removing the temporary directory.

From the implementation checkout, run the focused static checks:

```sh
corepack pnpm exec jest --runInBand scripts/plans/execplan-repository-fixture.spec.ts
corepack pnpm docs:lint -- bruno/mcp-request-routing/README.md .agents/plans/mcp-transport-hardening/04-document-bruno-server-build.md
git diff --check
```

Fix actionable Harper findings and rerun the command. No new unit tests are needed for this documentation
change. Bruno coverage changes are not applicable because no HTTP behavior changes; executing the
existing collection verifies the documented setup. Distinguish that runtime result from static checks.

## Idempotence and Recovery

Each validation attempt creates its own temporary source directory. Repeating the instructions rebuilds
only that fixture. The installed dependency directories are reused without modification when symlinks
are chosen. Never remove the implementation checkout's `dist` or dependency directories.

If compilation or startup fails, record the exact error and correct only the documented setup within
this plan's scope. Stop the fixture server before cleanup. Return to the original checkout and remove
only the directory stored in `fixture_root`; verify that it is the task-created temporary path first.
Remove a failed fixture and create a fresh one for a clean retry. No database reset or data recovery is needed.

## Artifacts and Notes

The review reproduced the README failure in a temporary directory using the exact PR head manifests
and symlinks to installed workspace dependencies. The SDK dependency existed, but the documented start
command exited 1 with `Cannot find module '<fixture>/apps/mcp-server/dist/main.js'`. No user build output
was deleted. This is evidence for the defect, not validation of the planned documentation change.

Proposed conventional commit subject and PR title:
`docs(mcp): build the server before running Bruno`.

At implementation time, follow root `AGENTS.md` for issue assignment, project status, assignee, and the
closing issue reference in the PR body. Creating this plan does not start implementation or mutate
GitHub state. The plan has one documentation outcome, a fixed implementation choice, and independent
validation; no product or architecture decision remains open.

## Plan readiness

Ready to implement
