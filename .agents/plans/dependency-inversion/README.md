# Application Dependency Contracts Road Map

Each numbered ExecPlan delivers exactly one implementation pull request. The plans replace concrete application
dependencies at existing consumer boundaries with small contracts, preserving the current business behavior.

## Order and Dependencies

| Key | Plan | Prerequisites |
| --- | --- | --- |
| `dependency-inversion/01` | [Payment consumers and catalog](01-decouple-payment-consumers.md) | None |
| `dependency-inversion/02` | [Public credit and reservation capabilities](02-publish-credit-capabilities.md) | `dependency-inversion/01` |
| `dependency-inversion/03` | [Authentication consumers](03-decouple-authentication-consumers.md) | None |
| `dependency-inversion/04` | [Browser sessions and existing identity lookup](04-decouple-browser-session-consumers.md) | `dependency-inversion/03` |
| `dependency-inversion/05` | [Organization onboarding controllers](05-decouple-onboarding-controllers.md) | None |
| `dependency-inversion/06` | [Service-client controllers](06-decouple-service-client-controllers.md) | None |
| `dependency-inversion/07` | [Proxy administration and lease substitution](07-decouple-proxy-administration.md) | None |
| `dependency-inversion/08` | [Verification execution collaborators](08-decouple-verification-execution.md) | `dependency-inversion/02` |
| `dependency-inversion/09` | [Verification delivery and controller contracts](09-decouple-verification-delivery.md) | `dependency-inversion/08` |

Start with the payment catalog issue in plan 01. The billing/verification sequence is `01 → 02 → 08 → 09`;
authentication/session work follows `03 → 04`. Plans 05, 06, and 07 can proceed independently. The payment-to-credit
dependency orders edits to shared factories; it does not represent a new runtime dependency. Coordinate edits
to shared module factories even when their plans are otherwise independent.

## Shared Constraints

- The audit covers all nine backend business modules and their host/technical dependencies at commit
  `49c42b0c9ec3ce641d86aab6ce3899472bdbd356` on 2026-09-17. This is a backend dependency-refactoring road map;
  it does not redesign frontend state or add product features. Current instructions and source govern later work.
- The canonical layer matrix already permits `api → application`. A concrete application class is not itself a
  forbidden infrastructure import. These plans address consumer coupling, typed test substitution, and actual
  runtime token substitution; passing `architecture:check` alone does not prove those properties.
- Declare contracts independently of implementation classes. Do not use class-derived `Pick`, `Parameters`, or
  `ReturnType` as the long-term boundary. Move shared input/output types and error declarations when needed so
  consumers do not retain implementation imports merely for vocabulary. Preserve runtime error identity.
- Reuse existing ports and tokens first. Keep composition roots responsible for constructing implementations.
  Alias a shared instance with `useExisting` instead of registering duplicate implementations. Test actual Nest
  resolution and token overrides as well as plain typed fakes; decorator metadata assertions alone are insufficient.
- Keep pure policy helpers, parsing functions, and infrastructure SDK/framework clients in their proper layers.
  They do not need interfaces merely because they are concrete. The technical-library exclusions and proxy token
  finding are recorded in [plan 07](07-decouple-proxy-administration.md).
- Every implementation PR preserves routes, permissions, schemas, configuration, queue behavior, error mapping,
  financial outcomes, and organization boundaries. Add no migrations or production rollout. Do not hide existing
  billing/recovery defects by weakening regression expectations. Existing hardening plans retain those fixes.
- Cross-module contracts belong to the module that owns the capability and are imported through its bare public
  barrel. Keep internal contracts private. Preserve existing public class exports where compatibility is explicit;
  compatibility exports do not justify new concrete consumer dependencies.
- Completed layering plans are historical context, not work to repeat. Coordinate incomplete hardening work using
  the overlap notes in each plan and preserve whichever implementation lands first. Recheck signatures on the
  implementation base and update the living plan if a consumer has disappeared.
- Use root `AGENTS.md` for implementation issue assignment, project status, PR linkage, and conventional titles.
  These local planning documents do not start implementation or create external issues or pull requests.
- Run each plan's exact focused checks and module architecture gate. Changed integration wiring requires Bruno
  coverage updates to existing success/rejection workflows. Use the
  repository's safe collection launchers and distinguish static tests from live runtime evidence.
- Keep every progress item unchecked until implementation starts. `Ready to implement` describes a complete
  design; prerequisite plans still determine scheduling. Validate this road map with the repository ExecPlan
  fixture.
