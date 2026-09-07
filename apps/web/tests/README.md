# Privileged Browser Fixtures

The owner and platform operator use the real public sign-in action, BFF redirect, hosted Keycloak password and
TOTP forms, and current-account endpoint. A successful password submission alone is not a privileged login.
Their existing roles retain `mfa_required`; no test creates an application cookie or impersonates a human with a
service credential.

## Prerequisites and Commands

Use Node 24, install the workspace dependencies with `corepack pnpm install --frozen-lockfile`, and install Chromium
with `corepack pnpm --filter ./apps/web exec playwright install chromium` when it is absent. Start the same-origin
development stack from this checkout. The helpers verify current Docker ownership and published ports on each run.
They reject another checkout's stack, an unexpected realm, or mismatched seed metadata before entering credentials.

For the ordinary `LEF` stack, first confirm that its containers and disposable data belong to this checkout:

```shell
corepack pnpm dev:reset -- --confirm-project=LEF
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
corepack pnpm --filter ./apps/web test:privileged
```

The first bootstrap enrolls exactly the two seeded identities. The second computes current codes and signs in
without changing their credentials or rewriting the local enrollment file. Each command reports fixture labels and
pass or fail only. Bootstrap signs both users out through the application before committing the local file.

An explicitly provisioned isolated stack can use the existing Compose project and port overrides. Set
`COMPOSE_PROJECT_NAME` to that checkout-owned project's name when provisioning and running the browser commands.
The issuer must match that stack's verified Keycloak port and the `lead-email-finder` development realm exactly.
The ordinary `dev:reset` command continues to support only `LEF` on its documented default ports. It refuses foreign
stacks and alternate ports; never use it to recover another project. Once the reset stack is healthy, it refreshes
the saved project selection and verified endpoints before seeding. Later commands use that stack even when the
checkout previously cached an isolated project. Recreate only the isolated disposable project
whose ownership you have confirmed, then provision and seed it again using its original port settings.

## Local Material and Recovery

Seeding writes nonsecret subjects and a reset fingerprint to `.dev/keycloak/browser-seed.json`. The existing owner
and operator summaries also record their issuer and subject. The shared fingerprint changes when either
subject changes. A normal seed rerun preserves enrolled credentials and the browser fixture file.

Bootstrap writes `.dev/keycloak/browser-users.json` atomically, with version 1, the reset fingerprint, and each
fixture's email, subject, and Base32 enrollment key. This ignored file and its temporary replacement have mode
`0600`. It contains no password, session, cookie, authorization code, or OAuth token. Symlinks, unexpected fields,
incorrect permissions, and stale identity or reset metadata cause failure. Do not print, attach, upload, or cache
this file. Never save the hosted enrollment page, its QR image, or its HTML.

Missing material for an already-enrolled user, partial enrollment, an unexpected hosted page, mismatched provenance,
or two rejected codes requires an owned disposable reset. The helper never deletes a credential or weakens MFA to
recover. A missing file after a fresh reset is expected and permits first enrollment. A reset removes only this
checkout's browser enrollment file after its confirmation, container, and volume checks pass.

## Shared Login Fixture

Later privileged suites live in `tests/e2e/privileged-*.spec.ts` and import the shared fixture:

```typescript
import { test, expect } from '../support/privileged-login'

test('owner opens the workspace', async ({ loginAs }) => {
    const page = await loginAs('owner')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
})
```

`loginAs('platformOperator')` selects the other seeded identity. Each test starts with a fresh browser context.
The fixture validates the real current-account email and membership role before returning the page. It returns no
password, enrollment key, code, token, or browser storage snapshot.

Use `playwright.privileged.config.ts`. It disables trace, screenshot, video, and automatic page snapshots for the
whole test and excludes these suites from the ordinary screenshot-enabled configuration. Debug logging is rejected.
Bootstrap runs outside the Playwright Test recorder. A fixture authentication failure closes its context and throws
only a sanitized scalar: the installed runner serializes that without creating an error-context attachment. A
dedicated reporter supplies static reset guidance and withholds raw child output. The artifact regression test guards
this runner behavior during upgrades. Capture diagnostics only after login has returned and the application URL
contains no callback parameters; never enable capture around authentication.

## Focused Validation

```shell
corepack pnpm --filter ./apps/web exec vitest run tests/support
TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- browser-fixture platform-operator customer-fixture --runInBand
corepack pnpm --filter ./apps/web typecheck
corepack pnpm --filter ./apps/web lint
corepack pnpm --filter ./apps/web test:privileged-artifacts
corepack pnpm --filter ./apps/web test:privileged
```

Unit tests cover published TOTP vectors, clock boundaries, metadata confinement and atomic writes, stale state,
redaction, hosted-page rejection, and artifact settings. Mocked pages do not replace the fresh enrollment, repeat
bootstrap, and two real BFF login checks above. No HTTP endpoint or API response contract changes in this fixture work,
so its browser and seed tests own the coverage; Bruno is not applicable.
