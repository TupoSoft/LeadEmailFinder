# Provision MFA-Aware Browser Test Identities

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make every privileged frontend browser test executable against the real authentication boundary. After this change,
a fresh disposable development reset produces the existing customer owner and platform operator. Each account enrolls
TOTP through the hosted Keycloak page. One shared Playwright login fixture completes password and current-OTP
authentication through the same-origin BFF flow. The fixture never weakens `mfa_required`, invents a
session, or uses a service credential to impersonate a person. Later billing, team, service-client, organization,
credit, and proxy plans can therefore require live privileged browser evidence without a hidden manual enrollment.

## Progress

- [ ] (2026-08-31) Make fresh development seeds request TOTP enrollment for the exact owner/operator fixtures.
- [ ] (2026-08-31) Add a redacted, owner-readable local browser-fixture metadata contract.
- [ ] (2026-08-31) Implement deterministic TOTP enrollment and repeat-login bootstrap through hosted Keycloak UI.
- [ ] (2026-08-31) Publish one shared MFA-aware Playwright login fixture for later frontend plans.
- [ ] (2026-08-31) Cover reset, stale metadata, redaction, MFA integrity, and real BFF login behavior.
- [ ] (2026-08-31) Run focused, fresh-reset, browser, prose, architecture, and repository validation.

## Plan dependencies

- `frontend/08`
- `auth/10`

## Surprises & Discoveries

- `auth/10` seeds stable owner and platform-operator passwords, but both roles include the `mfa_required` composite
  role. Its live BFF test proves that submitting only username and password stops on the Keycloak OTP step instead of
  reaching the callback.
- The reset flow recreates Keycloak and both application fixtures, so an OTP enrollment from a previous realm cannot
  be treated as current merely because the email and password are unchanged.
- Later frontend plans require owner or platform-operator Playwright flows. Mocking capabilities, injecting cookies,
  or using a client-credentials token would not validate the human BFF session those features actually require.

## Decision Log

- Decision: Exercise the real conditional-OTP browser flow and keep the `mfa_required` composites unchanged.
  Rationale: The test fixture must validate the same security boundary as a privileged human, not create a special
  non-MFA route or role.
  Date/Author: 2026-08-31, project planning.
- Decision: On a fresh disposable seed, mark only the existing development owner and platform operator with the
  Keycloak `CONFIGURE_TOTP` required action, then complete that action through Playwright.
  Rationale: A deterministic hosted enrollment page is supportable and preserves Keycloak ownership of credential
  creation; importing private credential records or writing Keycloak tables would couple tests to storage internals.
  Date/Author: 2026-08-31, project planning.
- Decision: Store generated Base32 enrollment keys only in `.dev/keycloak/browser-users.json`, written atomically with
  owner read/write permission and ignored by Git. The file contains fixture email/subject/reset identifiers but no
  password, cookie, OAuth token, authorization code, or BFF session.
  Rationale: Subsequent tests need to compute current TOTP values, while setup keys must not enter source, logs, test
  reports, screenshots, or shared caches.
  Date/Author: 2026-08-31, project planning.
- Decision: Treat a missing local setup key for an already-enrolled user, mismatched subject/reset metadata, or an
  unexpected Keycloak page as a fail-closed fixture error that asks for an owned disposable reset.
  Rationale: Automatically deleting or replacing a credential when provenance is unclear can hide fixture drift and
  trains unsafe recovery behavior.
  Date/Author: 2026-08-31, project planning.
- Decision: Later tests import one login fixture that starts at the application login route and never injects
  storage state, cookies, or network responses.
  Rationale: Shared mechanics prevent feature plans from silently falling back to password-only or synthetic
  authentication.
  Date/Author: 2026-08-31, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

The disposable reset is implemented by `docker/scripts/dev-reset.sh`. It provisions the Keycloak realm, creates the
platform operator through `scripts/keycloak/platform-operator.ts`, and creates the customer owner through
`scripts/keycloak/customer-fixture.ts`. Their fixed development-only passwords already live beside those fixture
definitions. The reset writes ignored metadata beneath `.dev/keycloak/` and recreates both Keycloak and application
state.

`scripts/keycloak/provisioning.ts` makes `owner`, `admin`, and `platform_admin` composite roles include
`mfa_required`, and the browser flow uses the conditional OTP form in Keycloak. Plan `frontend/08` supplies the real BFF
entry/callback/session flow and Playwright project. This plan adds only the privileged identity bootstrap and shared
login fixture needed by later product slices.

All fixture accounts and files are development-only. Before editing BFF or auth module code, implementation must
read `src/libs/modules/AGENTS.md`, `src/libs/modules/README.md`, and the affected module README. This plan should not
need a business-module change; the application continues to authenticate the resulting BFF session normally.

## Scope and Non-Goals

This pull request extends disposable seeding metadata and adds explicit first-login TOTP required actions for the two
existing privileged fixtures. It implements the local browser bootstrap and TOTP helper, publishes a shared Playwright
login fixture, and documents usage. It also adds focused and live tests plus the package scripts and ignored paths
needed for those commands.

It preserves production realm policy and MFA. It adds no recovery codes and does not remember a browser session as
the fixture contract. It introduces no test-only application endpoint, injected BFF cookie, production credential,
membership-role change, broader permission, extra owner/operator, or automatic destructive reset. It does not
implement any product page beyond the authentication shell from `frontend/08`.

## Plan of Work

Extend the two existing seed paths to expose stable, nonsecret fixture metadata. After customer invitation acceptance,
resolve the exact owner by email through the development Keycloak admin port and record its subject; use the subject
already returned for the platform operator. For a newly recreated user with no OTP credential, set
`requiredActions: ['CONFIGURE_TOTP']` while preserving all other user fields. Apply this only when the issuer is the
documented disposable development realm and the identity exactly matches the seeded fixture constant. Add unit tests
that reject a different issuer, email, role, or existing non-fixture user. Do not alter the realm's browser flow or
role composites.

Make `dev:reset` remove only `.dev/keycloak/browser-users.json` before it destroys the already confirmed disposable
realm, then write each new fixture subject and one reset identifier to the existing ignored fixture metadata. The
identifier must change when the recreated subjects change and need not reveal a credential. Preserve the reset
script's project confirmation and container-ownership protections. A routine seed rerun that does not recreate the
realm must not erase a valid OTP file.

Add a small TOTP utility under frontend test support. Decode strict uppercase Base32, reject malformed or padded
unexpected input, and compute six digits from a 30-second counter using HMAC-SHA1. Test it with published deterministic
vectors and boundary clocks; production web code must not import it. Keep clock injection explicit so tests avoid
sleeping and the live helper can retry the adjacent time window only once without printing values.

Implement `browser-fixtures:bootstrap` with Playwright. For each identity, enter through the public application's
sign-in action and the real `/v1/auth/login` redirect. On first use, submit the existing fixture password and require
the Keycloak `CONFIGURE_TOTP` page. Choose the manual enrollment-key view by accessible label and capture the Base32
key in process memory. Submit a current OTP, finish the BFF callback, confirm the returned current-account role, and
sign out through the application. Use a dedicated privileged-auth Playwright project/fixture with trace, screenshot, and video
disabled for the entire application-login redirect, Keycloak username/password, enrollment/challenge, and callback
segment on both success and failure. Diagnostic capture may start only after the authenticated application page has
loaded and the URL contains no callback parameters. Bootstrap the owner and operator serially so their secrets cannot
be confused.

Only after both enrollments and role assertions succeed, write one versioned JSON document atomically to
`.dev/keycloak/browser-users.json`. Create the temporary and final files with mode `0600`, reject symlinks, and verify
that the parent is the repository's `.dev/keycloak` directory. Rename in place and clean the temporary file on
failure. The JSON stores each email, subject, enrollment key, and reset identifier. Redact enrollment keys, passwords, OTP values, cookies,
query strings, and page HTML from errors and console output. Do not rely on post-hoc redaction of Playwright artifacts;
the auth segment must produce none. Add file-contract tests for permissions, path confinement, atomic failure, schema
validation, redaction, and artifact-disabled configuration.

On a later bootstrap, require the version, reset identifier, subjects, and emails to match current seed metadata;
then sign in each identity with a newly computed OTP and confirm its account role. If the file is absent while
Keycloak requests enrollment, enroll normally. Stop if the file is absent after enrollment, metadata does not match,
OTP is rejected twice, or the hosted page is not the expected login/enrollment/challenge route. Show a sanitized
message that instructs the developer to confirm stack ownership and run the documented reset. Do not delete an OTP
credential or downgrade MFA as recovery.

Export a shared Playwright fixture such as `loginAs('owner' | 'platformOperator')`. It validates the local file and
navigates through the application/BFF/Keycloak UI. It fills the existing password from fixture constants only inside
the Node test process, computes the current OTP, and waits for the application callback. It asserts the expected
membership role before returning the page. It creates fresh browser context state per test unless a feature suite
deliberately reuses one context to test session behavior. Add a guard test proving no later live suite imports a
cookie file or service-client credential in place of this fixture.

Update development and frontend testing documentation with prerequisites, the exact bootstrap command, failure, and
reset recovery, local-only secret handling, and the rule that a successful password-only submission is not a
privileged login. The command must report identity labels and pass/fail only. Complete live coverage after a fresh
reset, repeat bootstrap without enrollment, and run one owner plus one platform-operator feature-neutral login.

## Interfaces and Dependencies

The package exposes this developer command after the same-origin stack and `frontend/08` shell are running:

    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap

The local file has one versioned internal test shape:

    {
      "version": 1,
      "resetId": "<nonsecret fingerprint>",
      "users": {
        "owner": { "email": "owner@acme.lef.test", "subject": "<uuid>", "totpSecret": "<base32>" },
        "platformOperator": { "email": "platform-operator@lef.test", "subject": "<uuid>", "totpSecret": "<base32>" }
      }
    }

This is not an application or API contract and must remain ignored with mode `0600`. The Playwright fixture exposes
only role selection and a logged-in `Page`; it does not return the setup key, OTP, password, cookie, or token. Runtime
dependencies are the existing disposable Keycloak/PostgreSQL/Redis/API/web stack and the seeded identities from
`auth/10`. No new production dependency or external account is introduced.

## Acceptance Criteria

- A confirmed fresh `dev:reset` produces the same owner and platform operator, keeps their privileged roles and
  `mfa_required`, and presents `CONFIGURE_TOTP` on first browser login for each.
- One bootstrap completes both hosted enrollments through the application/BFF path and confirms the expected account
  roles. It writes the versioned ignored file atomically with mode `0600`. It emits no auth-segment trace, screenshot,
  video, HTML attachment, or secret-bearing output, including on forced failure.
- A second bootstrap computes current OTP values, signs both users in without re-enrollment, and leaves Keycloak,
  application data, and the local file semantically unchanged.
- Missing metadata after a fresh reset triggers enrollment. Stale reset/subject metadata, missing local material for
  an already-enrolled user, repeated OTP rejection, or an unexpected hosted page causes a fail-closed error with
  sanitized reset guidance. A target outside development causes the same error. Recovery never deletes credentials or
  weakens MFA.
- Unit tests cover TOTP vectors/time windows, role/issuer scoping, metadata schema, path confinement, symlink rejection,
  atomic writes, `0600` permissions, stale detection, and redaction. Live tests prove owner and platform-operator BFF
  callbacks and current-account roles.
- Later privileged Playwright suites can import one shared role-based login fixture and need no direct Keycloak API,
  service credential, cookie injection, or password-only workaround.
- Focused tests, fresh-reset bootstrap, repeat bootstrap, live Chromium login, documentation lint, architecture, and
  repository checks pass in exactly one pull request.

## Validation

Run focused utilities, seed, metadata, and Playwright-fixture tests:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- browser-fixture totp platform-operator customer-fixture --runInBand
    corepack pnpm --filter ./apps/web typecheck
    corepack pnpm --filter ./apps/web lint
    corepack pnpm --filter ./apps/web test
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm architecture:check
    git diff --check

After confirming that the named Compose stack belongs to this checkout, recreate only that disposable stack and run
bootstrap twice:

    corepack pnpm dev:reset -- --confirm-project=LEF
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm --filter ./apps/web browser-fixtures:bootstrap
    corepack pnpm --filter ./apps/web exec playwright test tests/e2e/privileged-login-fixtures.spec.ts --project=chromium

Assert the first run enrolled exactly two OTP credentials and the second enrolled none. Force one sanitized auth
failure and assert the configured output directories contain no trace, screenshot, video, HTML snapshot, or auth
attachment at all. Inspect the committed diff and console/Playwright summaries for secret-bearing output, and check
the local file mode without printing its contents. Run Harper on every changed English Markdown file, including this
plan and the development/testing documentation:

    corepack pnpm docs:lint -- .agents/plans/frontend/09-provision-mfa-aware-browser-test-identities.md README.md

Append any other English Markdown file actually changed and record exact commands and results. A mocked Keycloak page
does not satisfy the live acceptance gate.

## Idempotence and Recovery

Bootstrap is read-only after a successful enrollment and matching metadata. First enrollment is safe only against the
fresh, exact development fixtures and writes local metadata after both identities succeed. Partial enrollment leaves
no final file and requires the documented owned-stack reset; it does not guess which credential to delete. A reset
invalidates and removes only this checkout's ignored browser fixture before recreating the realm.

If the local file is lost after enrollment, OTP cannot be recovered safely. Confirm stack ownership and repeat the
normal destructive development reset instead of mutating the credential ad hoc. Do not run reset against a shared or
unknown Compose project. This plan adds no production migration, rollback, or credential recovery mechanism.

## Artifacts and Notes

Record focused test counts, the two nonsecret fixture labels and expected roles, reset identifier suffix if needed,
file mode, first/second bootstrap outcomes, live callback results, and redaction inspection. Never record setup keys,
OTP values, passwords, cookies, authorization codes, access/refresh tokens, BFF session values, admin credentials,
page HTML, QR images, or the contents of `browser-users.json`.

## Plan readiness

The exact fixtures, real MFA boundary, first-enrollment flow, local secret lifecycle, stale-state failure policy,
shared login interface, validation, recovery, and one-pull-request scope are decision-complete.

Ready to implement.
